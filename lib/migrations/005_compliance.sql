-- ============================================
-- 005_compliance.sql — TRAI / DLT compliance scaffolding
-- ============================================
--
-- Adds the data model the BPO product needs to be operated under Indian
-- telecom regulation (TRAI TCCCPR 2018 + DLT). This migration is purely
-- additive — no existing rows or columns are modified, so it is safe to
-- run on a populated database.
--
-- What this migration enables, in plain terms:
--
--   1. Calling windows (TRAI 9am–9pm IST). The dialer cron checks the
--      campaign's window before placing a call. Defaults applied here
--      keep every campaign legal until/unless an admin narrows them.
--
--   2. DLT registration. Every script played to a customer must be
--      registered on a DLT operator (Vi/Jio/Airtel) and carry a template
--      id. Agents now hold that id; the dialer can hard-block calls
--      where it's missing once the org flips into strict mode.
--
--   3. DND status per contact. We don't do the scrubbing in this
--      migration — that needs a licensed provider — but the columns
--      to record the result and gate calls are here.
--
--   4. Consent source. TRAI audits ask "where did you get this number".
--      We record that at campaign level, with optional per-contact
--      override (e.g. one campaign mixing two lead sources).
--
--   5. Compliance event log. Append-only record of every block, warning,
--      DND hit, or window violation. Auditable evidence.
--
-- The org-level `compliance_strict` flag controls enforcement mode:
--   FALSE (default) → warnings logged, calls still proceed (dev/staging)
--   TRUE            → hard block, call refused, event logged (production)
--
-- A real production rollout would also require:
--   - DLT Entity ID and Header registered with a DLT operator (off-platform)
--   - DND scrub provider account (off-platform)
--   - Recording retention policy aligned with TRAI minimums
--   - Privacy policy + grievance officer published (off-platform)
-- ============================================

-- ─────────────────────────────────────────────────────────────────
-- 1. organizations: DLT registration + enforcement toggle
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dlt_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS dlt_header TEXT,
  ADD COLUMN IF NOT EXISTS dlt_operator TEXT
    CHECK (dlt_operator IS NULL OR dlt_operator IN ('vi', 'jio', 'airtel', 'bsnl', 'tata', 'other')),
  ADD COLUMN IF NOT EXISTS compliance_strict BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN organizations.dlt_entity_id IS
  'Entity ID issued by the DLT operator after the BPO registers as a Principal Entity.';
COMMENT ON COLUMN organizations.dlt_header IS
  'Registered Sender ID / Header string that identifies the BPO on outbound calls.';
COMMENT ON COLUMN organizations.compliance_strict IS
  'When TRUE the dialer hard-blocks calls that fail compliance checks. When FALSE (default) it logs a warning and proceeds. Flip to TRUE for production tenants.';

-- ─────────────────────────────────────────────────────────────────
-- 2. agents: DLT template id + script lock
-- ─────────────────────────────────────────────────────────────────
--
-- Once a script is registered with the DLT operator, the operator
-- issues a template_id derived from the script content. Editing the
-- script invalidates the template — the agent must re-register. We
-- track that explicitly with script_locked_at: a non-null timestamp
-- means the script is the registered version and cannot be edited
-- without re-registration.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS dlt_template_id TEXT,
  ADD COLUMN IF NOT EXISTS dlt_template_registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS script_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN agents.dlt_template_id IS
  'Template ID issued by the DLT operator for this agent''s script. NULL means unregistered.';
COMMENT ON COLUMN agents.script_locked_at IS
  'When the script was locked to the registered DLT template. Editing the script must clear this column AND clear dlt_template_id.';

-- ─────────────────────────────────────────────────────────────────
-- 3. campaigns: calling window + consent source
-- ─────────────────────────────────────────────────────────────────
--
-- Times are stored as TIME WITHOUT TIME ZONE. They are interpreted as
-- IST in application code (lib/compliance.ts). Storing as plain TIME
-- avoids DST/timezone confusion since IST has no DST.
--
-- Defaults are the TRAI legal limits: 09:00–21:00 IST. A campaign may
-- narrow this (e.g. 10:00–18:00) but the application layer rejects any
-- value outside the legal range.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS calling_window_start TIME DEFAULT '09:00:00',
  ADD COLUMN IF NOT EXISTS calling_window_end   TIME DEFAULT '21:00:00',
  ADD COLUMN IF NOT EXISTS consent_source TEXT,
  ADD COLUMN IF NOT EXISTS consent_captured_at TIMESTAMPTZ;

COMMENT ON COLUMN campaigns.calling_window_start IS
  'Earliest time of day calls may be placed for this campaign, IST. TRAI floor is 09:00.';
COMMENT ON COLUMN campaigns.calling_window_end IS
  'Latest time of day calls may be placed for this campaign, IST. TRAI ceiling is 21:00.';
COMMENT ON COLUMN campaigns.consent_source IS
  'Free-text description of where leads were captured. Required field for TRAI audit (e.g. "website_form_2026Q1", "exhibition_blr_jan").';

-- Backfill existing campaigns with the safe TRAI defaults so they're
-- legal the moment compliance_strict is flipped on.
UPDATE campaigns
SET calling_window_start = '09:00:00'
WHERE calling_window_start IS NULL;

UPDATE campaigns
SET calling_window_end = '21:00:00'
WHERE calling_window_end IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 4. contacts: DND status + per-contact consent override
-- ─────────────────────────────────────────────────────────────────
--
-- dnd_status uses a small enum:
--   'unchecked' (default) — never been scrubbed
--   'clean'               — confirmed not on DND, safe to call
--   'dnd'                 — registered DND, must not be called
--   'unreachable'         — provider couldn't determine (treat as DND)
--
-- We do NOT add the dnd value to the existing contacts.status CHECK —
-- status is the call lifecycle ('pending' → 'called' → ...). DND is
-- orthogonal: a contact can be 'pending' AND 'dnd', meaning "queued for
-- this campaign but the dialer must skip them".

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS dnd_status TEXT DEFAULT 'unchecked'
    CHECK (dnd_status IN ('unchecked', 'clean', 'dnd', 'unreachable')),
  ADD COLUMN IF NOT EXISTS dnd_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dnd_provider TEXT,
  ADD COLUMN IF NOT EXISTS consent_source TEXT;

COMMENT ON COLUMN contacts.dnd_status IS
  '''unchecked'' = never scrubbed; ''clean'' = safe; ''dnd'' = on DND registry, must not call; ''unreachable'' = provider failed, treat as DND for safety.';
COMMENT ON COLUMN contacts.consent_source IS
  'Per-contact consent source. NULL means inherit from the campaign''s consent_source. Use this when one campaign mixes lead sources.';

-- Index for the dialer''s "find callable contacts" query — partial so it
-- only covers rows the dialer actually wants.
CREATE INDEX IF NOT EXISTS contacts_callable
  ON contacts (campaign_id, created_at)
  WHERE status = 'pending'
    AND dnd_status IN ('unchecked', 'clean');

-- ─────────────────────────────────────────────────────────────────
-- 5. compliance_events: append-only audit log
-- ─────────────────────────────────────────────────────────────────
--
-- Every compliance decision the system makes — block, warn, allow with
-- caveat — writes a row here. This is what you produce when TRAI asks
-- "show me your compliance trail for last quarter".
--
-- No DELETE / UPDATE policy is enforced at the DB level (Supabase RLS
-- can do that later); the convention is append-only and the application
-- layer never updates rows. Created_at is indexed for retention scans.

CREATE TABLE IF NOT EXISTS compliance_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- The kind of event. Open enum (TEXT) rather than CHECK constraint so
  -- new event types don't require a migration. Application keeps the
  -- canonical list in lib/compliance.ts.
  --
  -- Common values:
  --   'window_block'      — outside calling window
  --   'dnd_block'         — contact is on DND
  --   'dlt_block'         — agent has no DLT template
  --   'consent_block'     — campaign has no consent source recorded
  --   'window_warn'       — strict mode off, would have blocked
  --   'dnd_warn'          — strict mode off, would have blocked
  --   'dlt_warn'          — strict mode off, would have blocked
  --   'dnd_scrub_run'     — bulk DND scrub completed for a campaign
  event_type TEXT NOT NULL,

  -- Did the system block, warn, or allow? Mirrors the outcome of the
  -- gating decision so reports can group by it.
  outcome TEXT NOT NULL CHECK (outcome IN ('blocked', 'warned', 'allowed')),

  -- Human-readable reason and a JSON blob of relevant context. The
  -- blob is intentionally schema-less — different event types carry
  -- different fields, and we don't want to migrate every time we add one.
  reason TEXT,
  details JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS compliance_events_org_time
  ON compliance_events (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS compliance_events_campaign
  ON compliance_events (campaign_id, created_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS compliance_events_type
  ON compliance_events (event_type, created_at DESC);
