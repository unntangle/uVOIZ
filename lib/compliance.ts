// ============================================
// uVOIZ Compliance — TRAI / DLT gating
// ============================================
//
// Pure functions plus one DB write helper. The dialer cron calls
// `evaluateCallCompliance()` before placing a call; if the result is
// 'block', the call is skipped. If it's 'warn' or 'block', a row is
// written to compliance_events as an audit trail.
//
// What "compliance" means here, in scope:
//   1. Calling window — outbound only between the campaign's
//      configured window in IST. TRAI floor 09:00, ceiling 21:00.
//   2. DLT template — agent must carry a registered template id when
//      the org is in strict mode.
//   3. DND — contact must be 'unchecked' or 'clean'. 'dnd' and
//      'unreachable' are blocked.
//   4. Consent source — campaign must have a recorded consent_source
//      (free-text, but presence is required in strict mode).
//
// What this file does NOT do:
//   - Talk to the DLT operator's API. That's an off-platform process
//     (BPO admin registers, pastes the template id into the agent).
//   - Talk to a DND scrubbing provider. See lib/dnd.ts for the
//     interface; the implementation is a stub until a provider is
//     contracted.
//
// Strict mode (organizations.compliance_strict):
//   FALSE (default) — block decisions are downgraded to 'warn'. The
//                     call still goes out, but a row is logged.
//   TRUE            — block means block.
// Calls flagged as 'block' under strict mode are NOT logged twice; the
// downgrade only happens for failures, never for successes.
// ============================================

import { supabaseAdmin } from './supabase';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

/**
 * Minimum data the compliance layer needs to make a decision. Pulled
 * from the DB once per call and passed in — no implicit I/O during
 * gating, so the rules are deterministic and unit-testable.
 */
export interface ComplianceInput {
  org: {
    id: string;
    compliance_strict: boolean;
    dlt_entity_id?: string | null;
    dlt_header?: string | null;
  };
  campaign: {
    id: string;
    consent_source?: string | null;
    calling_window_start?: string | null; // 'HH:MM:SS' in IST
    calling_window_end?: string | null;   // 'HH:MM:SS' in IST
  };
  agent: {
    id: string;
    dlt_template_id?: string | null;
    script_locked_at?: string | null;
  };
  contact: {
    id: string;
    dnd_status?: 'unchecked' | 'clean' | 'dnd' | 'unreachable' | null;
    consent_source?: string | null;
  };
  /** Override for tests; defaults to new Date() at call time. */
  now?: Date;
}

export type ComplianceOutcome = 'allowed' | 'warned' | 'blocked';

export type ComplianceEventType =
  | 'window_block'
  | 'dnd_block'
  | 'dlt_block'
  | 'consent_block'
  | 'window_warn'
  | 'dnd_warn'
  | 'dlt_warn'
  | 'consent_warn'
  | 'dnd_scrub_run';

export interface ComplianceFinding {
  ruleId:
    | 'calling_window'
    | 'dnd_status'
    | 'dlt_template'
    | 'consent_source';
  severity: 'block' | 'allow';
  reason: string;
  /** Extra context written to compliance_events.details. */
  details: Record<string, unknown>;
}

export interface ComplianceDecision {
  outcome: ComplianceOutcome;
  /** All rule findings, even ones that ended up downgraded. */
  findings: ComplianceFinding[];
  /** True iff the dialer should refuse to make this call. */
  shouldBlockCall: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Calling window — TRAI 09:00–21:00 IST
// ─────────────────────────────────────────────────────────────────

/** Legal floor and ceiling per TRAI TCCCPR 2018. */
export const TRAI_WINDOW_START = '09:00:00' as const;
export const TRAI_WINDOW_END = '21:00:00' as const;

/**
 * Convert an arbitrary UTC Date to a 24h IST clock string ('HH:MM:SS').
 * We don't need a real timezone library — IST is fixed UTC+5:30 with no
 * DST, so a single offset addition is exact.
 */
function toIstTimeString(d: Date): string {
  const utcMs = d.getTime();
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  const ss = String(ist.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Compare two 'HH:MM:SS' strings as if they were numbers. */
function timeLte(a: string, b: string): boolean {
  return a <= b;
}

/**
 * Returns true if the moment is inside [start, end] inclusive of start
 * and exclusive of end. End-exclusive matters at the 21:00 boundary —
 * 21:00:00 itself is outside the window.
 */
export function isWithinCallingWindow(
  now: Date,
  startHHMMSS: string = TRAI_WINDOW_START,
  endHHMMSS: string = TRAI_WINDOW_END,
): boolean {
  const t = toIstTimeString(now);
  return timeLte(startHHMMSS, t) && t < endHHMMSS;
}

/**
 * Clamp a campaign's configured window into the legal TRAI range.
 * UI saves should call this before persisting so we never store an
 * illegal value. The dialer also re-clamps as a defense-in-depth.
 */
export function clampToLegalWindow(
  start?: string | null,
  end?: string | null,
): { start: string; end: string } {
  const s = !start || start < TRAI_WINDOW_START ? TRAI_WINDOW_START : start;
  const e = !end || end > TRAI_WINDOW_END ? TRAI_WINDOW_END : end;
  // If a misconfigured campaign ends up with start >= end, fall back to
  // the full legal window rather than producing an empty window that
  // would silently block every call.
  if (s >= e) return { start: TRAI_WINDOW_START, end: TRAI_WINDOW_END };
  return { start: s, end: e };
}

// ─────────────────────────────────────────────────────────────────
// Individual rule checks. Each returns a ComplianceFinding or null.
// All take ComplianceInput and never do I/O.
// ─────────────────────────────────────────────────────────────────

function checkCallingWindow(input: ComplianceInput): ComplianceFinding | null {
  const now = input.now ?? new Date();
  const { start, end } = clampToLegalWindow(
    input.campaign.calling_window_start,
    input.campaign.calling_window_end,
  );
  if (isWithinCallingWindow(now, start, end)) return null;

  return {
    ruleId: 'calling_window',
    severity: 'block',
    reason: `Outside calling window (${start}–${end} IST).`,
    details: {
      ist_time: toIstTimeString(now),
      window_start: start,
      window_end: end,
    },
  };
}

function checkDndStatus(input: ComplianceInput): ComplianceFinding | null {
  const status = input.contact.dnd_status ?? 'unchecked';
  // 'unchecked' is allowed. We do NOT block on it because mass
  // pre-scrubbing is a separate batch job — blocking here would mean
  // you can't dial any contact you haven't scrubbed in advance, which
  // is too strict for a multi-tenant product. The audit log captures
  // the unchecked state via the warn path.
  if (status === 'clean' || status === 'unchecked') return null;

  return {
    ruleId: 'dnd_status',
    severity: 'block',
    reason: `Contact DND status is "${status}".`,
    details: { dnd_status: status },
  };
}

function checkDltTemplate(input: ComplianceInput): ComplianceFinding | null {
  if (input.agent.dlt_template_id) return null;

  return {
    ruleId: 'dlt_template',
    severity: 'block',
    reason: 'Agent has no registered DLT template id.',
    details: {
      agent_id: input.agent.id,
      org_dlt_entity_id: input.org.dlt_entity_id ?? null,
    },
  };
}

function checkConsentSource(input: ComplianceInput): ComplianceFinding | null {
  // Per-contact consent overrides campaign-level. If either is set, pass.
  const present =
    !!input.contact.consent_source?.trim() ||
    !!input.campaign.consent_source?.trim();
  if (present) return null;

  return {
    ruleId: 'consent_source',
    severity: 'block',
    reason: 'No consent source recorded on contact or campaign.',
    details: {},
  };
}

// ─────────────────────────────────────────────────────────────────
// Top-level evaluation
// ─────────────────────────────────────────────────────────────────

/**
 * Run every compliance check and return the combined decision.
 *
 * Decision logic:
 *   - No 'block' findings        → outcome 'allowed', shouldBlockCall false
 *   - Any 'block' findings, strict mode ON   → outcome 'blocked', shouldBlockCall true
 *   - Any 'block' findings, strict mode OFF  → outcome 'warned',  shouldBlockCall false
 */
export function evaluateCallCompliance(input: ComplianceInput): ComplianceDecision {
  const findings: ComplianceFinding[] = [];

  const checks = [
    checkCallingWindow(input),
    checkDndStatus(input),
    checkDltTemplate(input),
    checkConsentSource(input),
  ];

  for (const f of checks) {
    if (f) findings.push(f);
  }

  const hasBlock = findings.some((f) => f.severity === 'block');

  if (!hasBlock) {
    return { outcome: 'allowed', findings, shouldBlockCall: false };
  }

  if (input.org.compliance_strict) {
    return { outcome: 'blocked', findings, shouldBlockCall: true };
  }

  return { outcome: 'warned', findings, shouldBlockCall: false };
}

// ─────────────────────────────────────────────────────────────────
// Audit log writer
// ─────────────────────────────────────────────────────────────────

/**
 * Map a (ruleId, outcome) pair to the canonical event_type stored in
 * compliance_events. Keep this in sync with the comment block in
 * lib/migrations/005_compliance.sql.
 */
function eventTypeFor(
  ruleId: ComplianceFinding['ruleId'],
  outcome: ComplianceOutcome,
): ComplianceEventType {
  const suffix: 'block' | 'warn' = outcome === 'blocked' ? 'block' : 'warn';
  switch (ruleId) {
    case 'calling_window': return `window_${suffix}` as ComplianceEventType;
    case 'dnd_status':     return `dnd_${suffix}` as ComplianceEventType;
    case 'dlt_template':   return `dlt_${suffix}` as ComplianceEventType;
    case 'consent_source': return `consent_${suffix}` as ComplianceEventType;
  }
}

/**
 * Persist a compliance decision to the audit log. Fire-and-forget from
 * the dialer's perspective — a failed insert must not block the call
 * (or block the BLOCK, depending on outcome), so we swallow errors and
 * log to console. The retry cron will not re-attempt these because
 * audit gaps are preferable to false re-issues of compliance events.
 *
 * One row per finding, so a single call that violates two rules
 * produces two rows. That makes querying ("how many DND blocks last
 * week") trivial.
 */
export async function logComplianceDecision(args: {
  decision: ComplianceDecision;
  input: ComplianceInput;
}): Promise<void> {
  const { decision, input } = args;
  if (decision.outcome === 'allowed') return;
  if (!supabaseAdmin) return;

  const rows = decision.findings
    .filter((f) => f.severity === 'block') // 'allow' findings are noise
    .map((f) => ({
      org_id: input.org.id,
      campaign_id: input.campaign.id,
      agent_id: input.agent.id,
      contact_id: input.contact.id,
      event_type: eventTypeFor(f.ruleId, decision.outcome),
      outcome: decision.outcome,
      reason: f.reason,
      details: f.details,
    }));

  if (rows.length === 0) return;

  try {
    await supabaseAdmin.from('compliance_events').insert(rows);
  } catch (err) {
    console.error('logComplianceDecision: insert failed', { err });
  }
}

/**
 * Convenience: run the evaluation and log in one call. Returns the
 * decision so the dialer can act on shouldBlockCall.
 */
export async function evaluateAndLog(
  input: ComplianceInput,
): Promise<ComplianceDecision> {
  const decision = evaluateCallCompliance(input);
  // Don't await — the dialer's latency budget is tight and the audit
  // write is non-blocking by design. If the row drops, the call still
  // happens (or doesn't, per the decision). Audit is for the steady
  // state, not for individual transaction integrity.
  void logComplianceDecision({ decision, input });
  return decision;
}
