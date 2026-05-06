// ============================================
// OpenAI client — non-realtime use cases
// ============================================
//
// Thin wrapper around OpenAI's Chat Completions API for the two
// places uVOIZ talks to OpenAI outside of a live phone call:
//
//   1. Script generation. The agent edit page has a "Generate"
//      button next to the script field. The BPO manager types a
//      one-line description ("collect overdue EMIs, polite Tamil")
//      and we return a full call script.
//
//   2. Post-call analysis. The keyword-counting sentiment scorer
//      in lib/transcript-analysis.ts is fine for rough metrics, but
//      a real classification (intent, conversion likelihood,
//      objection categorisation) needs an LLM. This module is what
//      the post-call cron will call.
//
// What this module does NOT cover:
//   - The live in-call LLM. During a call the LiveKit agent worker
//     streams tokens directly from OpenAI through LiveKit Inference,
//     not through this wrapper. The two paths exist because realtime
//     and non-realtime have very different latency/error budgets.
//   - Embeddings, moderation, image, or assistant APIs. Add a
//     separate module per surface area when one of those is needed.
//
// Cost optimisation:
//   - Default model is gpt-4.1-mini (cheap, ~6x lower than gpt-4o
//     for similar quality on script-style tasks). Override via the
//     OPENAI_MODEL env var.
//   - System prompts are kept stable across calls so OpenAI's
//     prompt-cache discount kicks in (up to 90% off cached input
//     tokens). Keep dynamic content in the user message, not the
//     system message, to preserve the cache prefix.
// ============================================

const OPENAI_BASE = 'https://api.openai.com/v1';

/**
 * Read the model id once at module init, with a sensible default.
 * Lazy because process.env is populated before any module imports
 * this file in Next.js, but we still avoid hard-coding to make
 * config-driven A/B testing straightforward.
 */
function getDefaultModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
}

function openaiHeaders(): Record<string, string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Throw at call time, not module load. Lets the rest of the app
    // build/import even when the key is missing in some environments
    // (e.g. CI without secrets).
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env.local before calling OpenAI.',
    );
  }
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

// ─────────────────────────────────────────────────────────────────
// Low-level chat completion
// ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionParams {
  messages: ChatMessage[];
  /** Override the env-default model. */
  model?: string;
  /**
   * 0.0–2.0. Lower = more deterministic. We default to 0.7 for
   * script generation (some creativity helps), 0.2 for analysis
   * (we want the same answer every time on the same input).
   */
  temperature?: number;
  /** Cap on output length. Useful for keeping costs bounded. */
  maxTokens?: number;
  /**
   * Force the model to return JSON. Set true for analysis tasks
   * where you'll JSON.parse the response — eliminates the "model
   * wraps response in markdown fences" problem.
   */
  responseJson?: boolean;
}

export interface ChatCompletionResult {
  /** The assistant message content as a string. */
  text: string;
  /**
   * Token counts for billing observability. We log these so a
   * future "show me last month's OpenAI cost" dashboard has data
   * to work with.
   */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
  /** Provider raw response, kept for debugging unfamiliar errors. */
  raw?: unknown;
}

/**
 * One-shot chat completion. No streaming, no tool calls, no
 * function calling — those live in the live-call agent path on
 * LiveKit Inference. Use this for short, synchronous "generate me
 * something" requests.
 */
export async function chatComplete(
  params: ChatCompletionParams,
): Promise<ChatCompletionResult> {
  const model = params.model ?? getDefaultModel();

  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.7,
  };
  if (params.maxTokens) body.max_tokens = params.maxTokens;
  if (params.responseJson) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: openaiHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `OpenAI chat failed: ${response.status} ${response.statusText} — ${errText}`,
    );
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    model?: string;
  };

  const text = raw.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) {
    throw new Error('OpenAI returned an empty completion');
  }

  return {
    text,
    usage: {
      inputTokens: raw.usage?.prompt_tokens ?? 0,
      outputTokens: raw.usage?.completion_tokens ?? 0,
      totalTokens: raw.usage?.total_tokens ?? 0,
    },
    model: raw.model ?? model,
    raw,
  };
}

// ─────────────────────────────────────────────────────────────────
// Script generation — the agent edit page's "Generate" button
// ─────────────────────────────────────────────────────────────────

/**
 * Languages the script generator knows how to draft in. The model
 * actually understands every language, but we constrain the UI
 * dropdown to what we've tested for telecalling tone.
 */
export type ScriptLanguage =
  | 'Hindi'
  | 'Tamil'
  | 'Telugu'
  | 'Kannada'
  | 'English'
  | 'Hindi + English'
  | 'Tamil + English'
  | 'Telugu + English';

export interface GenerateScriptParams {
  /** One-line description from the BPO manager. */
  brief: string;
  /** Language(s) the agent should speak. Drives tone and code-mixing. */
  language: ScriptLanguage;
  /** Persona name — affects salutation and pronoun style. */
  agentName?: string;
  /** Personality tag — affects warmth and pacing. */
  personality?: string;
}

/**
 * Generate a full call script from a one-line brief.
 *
 * Output format is plain text — the agent prompt builder elsewhere
 * in the codebase prepends the script with system rules (TRAI
 * compliance phrases, end-call triggers, etc.), so this function
 * just returns the conversational core.
 */
export async function generateCallScript(
  params: GenerateScriptParams,
): Promise<{ script: string; usage: ChatCompletionResult['usage'] }> {
  // Stable system prompt for prompt-cache savings. Don't put dynamic
  // content here.
  const systemPrompt = `You are an expert at writing short, polite, effective \
outbound call scripts for Indian BPO telecallers.

Your scripts:
- Open with a warm greeting and self-introduction
- State the reason for the call within the first two sentences
- Ask one question at a time and wait for the customer's response
- Use simple, conversational language a customer would actually understand
- Avoid jargon, legal disclaimers, or pressure tactics
- Handle "not interested" gracefully and end the call politely
- Stay under 60 seconds of speaking time

Output only the script text. No headings, no markdown, no commentary.`;

  const personaLine = params.agentName
    ? `Agent name: ${params.agentName}`
    : '';
  const personalityLine = params.personality
    ? `Personality: ${params.personality}`
    : '';

  const userPrompt = [
    `Write a call script in ${params.language}.`,
    personaLine,
    personalityLine,
    `Purpose of the call: ${params.brief}`,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await chatComplete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    maxTokens: 600,
  });

  return { script: result.text, usage: result.usage };
}

// ─────────────────────────────────────────────────────────────────
// Post-call analysis
// ─────────────────────────────────────────────────────────────────

export interface CallAnalysis {
  sentiment: 'positive' | 'neutral' | 'negative';
  /** Did the customer agree to the call's primary ask? */
  converted: boolean;
  /** 0.0 – 1.0, how strongly the model believes in the outcome. */
  confidence: number;
  /**
   * Free-form short summary (~1 sentence) for the calls list view.
   * Pre-trimmed to ~120 chars by the prompt; we don't enforce it.
   */
  summary: string;
  /**
   * Customer's primary objection if any, e.g. 'price too high',
   * 'wrong number', 'not interested', 'asked for callback'. Empty
   * string when no clear objection.
   */
  primaryObjection: string;
}

/**
 * Run a transcript through OpenAI for a structured outcome. Replaces
 * the keyword-counting heuristic in lib/transcript-analysis.ts for
 * cases that need real semantic understanding (e.g. customer says
 * "yeah okay fine whatever" — keyword counting reads positive, an
 * LLM reads it as resigned, possibly negative).
 *
 * Cost note: ~3000 input tokens + ~150 output tokens per call. With
 * gpt-4.1-mini and prompt caching that's roughly $0.0006/call, or
 * ₹0.05. Worth running on every call.
 */
export async function analyseCall(
  transcript: string,
  context?: { agentName?: string; campaignPurpose?: string },
): Promise<CallAnalysis & { usage: ChatCompletionResult['usage'] }> {
  if (!transcript?.trim()) {
    // No transcript = nothing to analyse. Return a safe default
    // rather than spend a token on an empty call.
    return {
      sentiment: 'neutral',
      converted: false,
      confidence: 0,
      summary: 'No transcript available.',
      primaryObjection: '',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  // Stable system message — analyses thousands of calls share this
  // prefix for cache savings.
  const systemPrompt = `You are an expert call-quality analyst for an Indian BPO. \
Given a transcript of an AI agent calling a customer, return a JSON object with these fields:

- sentiment: one of "positive", "neutral", "negative"
- converted: boolean — did the customer agree to the call's primary ask?
- confidence: number from 0.0 to 1.0 — how strongly you believe in the outcome
- summary: one sentence under 120 characters
- primaryObjection: short phrase, or empty string if no clear objection

Rules:
- Sentiment is the customer's overall tone, not the agent's.
- "converted" requires explicit agreement; vague or hedged answers are not conversions.
- If the customer hung up or was unreachable, return negative + converted=false.

Return ONLY the JSON object. No markdown, no commentary.`;

  const contextLine = [
    context?.agentName ? `Agent: ${context.agentName}` : '',
    context?.campaignPurpose ? `Call purpose: ${context.campaignPurpose}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [contextLine, 'Transcript:', transcript]
    .filter(Boolean)
    .join('\n\n');

  const result = await chatComplete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 250,
    responseJson: true,
  });

  let parsed: Partial<CallAnalysis>;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    // Model returned non-JSON despite response_format. Fall back to
    // neutral rather than crash — one bad parse shouldn't fail the
    // post-call cron for the whole batch.
    console.error('analyseCall: non-JSON response from OpenAI', result.text);
    return {
      sentiment: 'neutral',
      converted: false,
      confidence: 0,
      summary: 'Analysis failed.',
      primaryObjection: '',
      usage: result.usage,
    };
  }

  return {
    sentiment:
      parsed.sentiment === 'positive' ||
      parsed.sentiment === 'negative' ||
      parsed.sentiment === 'neutral'
        ? parsed.sentiment
        : 'neutral',
    converted: !!parsed.converted,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    summary: parsed.summary ?? '',
    primaryObjection: parsed.primaryObjection ?? '',
    usage: result.usage,
  };
}

/** True iff OPENAI_API_KEY is set. */
export function isOpenAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ──────────────────────────────────────────────────────────────
// Outcome classification — 7-bucket BPO taxonomy
// ──────────────────────────────────────────────────────────────
//
// Why a separate function from analyseCall():
//   analyseCall() returns a sentiment + boolean conversion judgement,
//   which is what the existing campaign stats and webhook code reads.
//   The product needs more than that: BPO managers segregate contacts
//   into actionable buckets (call back tomorrow, do not call again,
//   sales team handoff, etc.) which a sentiment + boolean can't
//   express. Rather than overload the existing function and break
//   downstream readers, we add a new one alongside it and migrate
//   callers gradually.
//
//   Both functions can be called on the same transcript — they don't
//   contend. In practice the webhook will eventually call only this
//   one, but during the migration window we'll call both.
//
// Why these 7 buckets:
//   Standard outbound-telecalling segmentation used by every Indian
//   BPO we surveyed. Each bucket maps to a different next-step:
//     - interested      → sales team follow-up
//     - callback        → schedule retry at customer's stated time
//     - not_interested  → do not retry on this campaign
//     - dnc             → do not call ever (regulatory, TRAI)
//     - voicemail       → retry once during a different time window
//     - no_answer       → retry per the campaign's retry policy
//     - wrong_number    → mark contact stale, don't retry

/**
 * The 7-bucket call outcome taxonomy. Order is from most-positive
 * to most-negative for the customer's relationship with the brand,
 * with the "couldn't reach them" buckets at the end. The string
 * values are the canonical form stored in the database — do not
 * rename without a migration.
 */
export type CallOutcome =
  | 'interested'
  | 'callback'
  | 'not_interested'
  | 'dnc'
  | 'voicemail'
  | 'no_answer'
  | 'wrong_number';

/** Set form for membership checks at API boundaries. */
export const CALL_OUTCOMES: readonly CallOutcome[] = [
  'interested',
  'callback',
  'not_interested',
  'dnc',
  'voicemail',
  'no_answer',
  'wrong_number',
] as const;

export function isCallOutcome(v: unknown): v is CallOutcome {
  return typeof v === 'string' && (CALL_OUTCOMES as readonly string[]).includes(v);
}

export interface OutcomeClassification {
  outcome: CallOutcome;
  /** 0.0 – 1.0 — how strongly the model believes in the bucket. */
  confidence: number;
  /**
   * One-sentence human-readable summary (~120 chars) explaining
   * why this bucket was chosen. Surfaced in the contact-detail
   * drawer so the operator doesn't have to read the whole transcript.
   */
  summary: string;
}

/**
 * Classify a single call's transcript into one of seven outcome
 * buckets.
 *
 * Inputs:
 *   transcript  — raw text of the call. Speaker tags optional but
 *                 helpful ("Agent: … / Customer: …"). Empty/missing
 *                 input short-circuits to no_answer with confidence 1.
 *   endedReason — provider's reason string if available
 *                 (e.g. 'customer-hangup', 'no-answer', 'voicemail-detected').
 *                 Used as a hint, not a hard rule — the LLM may
 *                 override based on the transcript content.
 *
 * Cost: ~2500 input + ~80 output tokens per call on gpt-4.1-mini
 * with prompt caching = roughly ₹0.04 per analysis. Cheap enough
 * to run unconditionally on every completed call.
 *
 * Failure modes:
 *   - No transcript: returns 'no_answer' immediately, no LLM call.
 *   - LLM returns invalid JSON: caught, returns 'no_answer' with
 *     confidence 0 and a summary noting the failure. Logged so a
 *     spike is visible in monitoring.
 *   - LLM returns an unknown bucket string: same fallback. The
 *     CHECK constraint in the calls table would reject it anyway,
 *     so we don't risk DB writes that violate schema.
 *   - OpenAI API error: bubbles up. Caller (the webhook) decides
 *     whether to retry or write a NULL outcome and move on.
 */
export async function classifyCallOutcome(
  transcript: string | null | undefined,
  endedReason?: string | null,
  context?: { agentName?: string; campaignPurpose?: string },
): Promise<OutcomeClassification & { usage: ChatCompletionResult['usage'] }> {
  // Empty transcript means the call never produced spoken content —
  // either it didn't connect, or the customer hung up before saying
  // anything. We map this to 'no_answer' rather than spend a token
  // on an empty analysis. The endedReason can refine this if the
  // provider gave us one (voicemail vs unanswered ring), but in
  // either case the bucket is one of the "couldn't reach" ones,
  // never 'interested' / 'not_interested'.
  if (!transcript?.trim()) {
    const reason = (endedReason || '').toLowerCase();
    let outcome: CallOutcome = 'no_answer';
    if (reason.includes('voicemail') || reason.includes('machine')) {
      outcome = 'voicemail';
    } else if (reason.includes('busy') || reason.includes('wrong')) {
      outcome = 'wrong_number';
    }
    return {
      outcome,
      confidence: 0.9, // High confidence — nothing said means nothing said
      summary: 'Customer was not reached on this attempt.',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  // Stable system prompt for prompt-cache savings. The model sees the
  // same prefix on every call, OpenAI caches it, and we pay full price
  // only on the user-message portion that actually differs.
  //
  // The bucket descriptions are deliberately concrete ("customer said
  // they want to be removed") rather than abstract ("regulatory opt-out").
  // Concrete descriptions classify more reliably in our tests — the
  // model latches onto observable behaviour rather than guessing intent.
  const systemPrompt = `You are an expert call-outcome analyst for an Indian BPO outbound campaign. \
Given a transcript of an AI agent calling a customer, classify the call into EXACTLY ONE of these seven buckets:

- interested: Customer expressed clear interest in the offer, asked for more details, agreed to next steps, or gave their consent to proceed.
- callback: Customer is busy or unavailable now and asked to be called back at a later time. Includes "call me tomorrow", "call after 5pm", etc.
- not_interested: Customer politely declined, said no, said they are not interested, or expressed disinterest without asking to be removed from the list.
- dnc: Customer explicitly asked to be removed from the calling list, said "do not call again", threatened to report, or invoked DND/TRAI rules. Stronger than not_interested.
- voicemail: Call was answered by an automated voicemail or answering machine, not a live person.
- no_answer: Call rang out, was disconnected before anyone spoke, or the line was busy. No conversation happened.
- wrong_number: The person who picked up said they are not the intended recipient, or the number belongs to someone else.

Return ONLY a JSON object with these fields:
- outcome: one of the seven bucket names above (exact lowercase string)
- confidence: number from 0.0 to 1.0
- summary: one sentence under 120 characters explaining the choice in plain English

Rules:
- Pick the SINGLE best bucket. Never return multiple.
- If the customer is rude but didn't ask to be removed, that's not_interested, not dnc.
- If the customer says "send me details on WhatsApp" or similar agreement, that's interested.
- If the customer asks a clarifying question and then agrees, that's interested.
- If the customer asks a clarifying question and then declines, that's not_interested.
- Do not output markdown. Do not wrap the JSON in code fences.`;

  // Context lines kept short — this is the part that doesn't cache,
  // so every byte costs full price. Empty lines filtered out so the
  // prompt stays clean when context fields aren't supplied.
  const contextLine = [
    context?.agentName ? `Agent: ${context.agentName}` : '',
    context?.campaignPurpose ? `Campaign purpose: ${context.campaignPurpose}` : '',
    endedReason ? `Provider ended-reason: ${endedReason}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = [contextLine, 'Transcript:', transcript]
    .filter(Boolean)
    .join('\n\n');

  const result = await chatComplete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    // Low temperature for classification — we want the same answer
    // every time on the same input. 0.2 is the same value analyseCall
    // uses for the same reason; keeping the two consistent makes
    // future tuning easier.
    temperature: 0.2,
    maxTokens: 200,
    responseJson: true,
  });

  let parsed: Partial<OutcomeClassification>;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    // Model returned non-JSON despite response_format. Log loudly
    // (this should never happen with response_format=json_object
    // but the guard is cheap and the failure mode is silent
    // misclassification otherwise).
    console.error('classifyCallOutcome: non-JSON response from OpenAI', result.text);
    return {
      outcome: 'no_answer',
      confidence: 0,
      summary: 'Outcome classification failed.',
      usage: result.usage,
    };
  }

  // Validate the bucket name. The CHECK constraint on calls.outcome
  // would reject an unknown value at write time — catching it here
  // means the webhook gets a clean fallback instead of a 500 from
  // Postgres on a row that's otherwise fine.
  const outcome = isCallOutcome(parsed.outcome) ? parsed.outcome : 'no_answer';
  if (outcome !== parsed.outcome) {
    console.warn(
      'classifyCallOutcome: model returned unknown bucket',
      parsed.outcome,
      '— falling back to no_answer',
    );
  }

  return {
    outcome,
    confidence:
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
    summary: (parsed.summary ?? '').slice(0, 240),
    usage: result.usage,
  };
}
