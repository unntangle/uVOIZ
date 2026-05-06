// ============================================
// Sarvam AI — Text-to-Speech (Bulbul V3)
// ============================================
//
// Thin wrapper around Sarvam's REST text-to-speech endpoint. Used to
// pre-render voice samples for the agent edit page (so BPO managers
// can hear what each persona sounds like before picking) and for any
// future ad-hoc TTS needs (e.g. system messages, error voicemails).
//
// Live in-call TTS during a real-time conversation does NOT go through
// this file — it goes through the LiveKit Sarvam plugin which uses
// Sarvam's WebSocket streaming API for sub-250ms first-byte latency.
// This wrapper is for "I have a string, I want an mp3 back" moments.
//
// Why Sarvam over ElevenLabs for uVOIZ:
//   - Native Indian-language voices (Hindi, Tamil, Telugu, Kannada
//     covered with non-accented TTS — ElevenLabs synthesizes these
//     by accent which sounds wrong on a sales call to a Tier-2 town)
//   - Lower CER (Character Error Rate) on Indian-language benchmarks
//   - Same vendor as STT — one bill, one support contact
//   - Pricing per 10K chars cheaper than ElevenLabs Multilingual
//
// Persona mapping (the part product cares about):
//   The UI offers four named personas — Priya, Arjun, Kavya, Rahul.
//   These names are the BRAND. Internally each maps to a specific
//   Bulbul V3 speaker id. If we ever swap to a different TTS provider
//   we only update PERSONA_TO_BULBUL — the UI doesn't change.
// ============================================

import { SarvamLanguageCode } from './sarvam-stt';

const SARVAM_BASE = 'https://api.sarvam.ai';
const SARVAM_TTS_MODEL = 'bulbul:v3' as const;

// ─────────────────────────────────────────────────────────────────
// Persona mapping
// ─────────────────────────────────────────────────────────────────
//
// Bulbul V3 ships ~16 speaker voices. We've curated SIX that match
// the existing UI personas. Picks made on the basis of:
//   - Female / male match (UI labels declare it)
//   - Low Critical Error Rate per Sarvam's published benchmarks
//   - Tone fit for Indian BPO sales/support context — neutral and
//     warm rather than dramatic or character-y
//   - Coverage of distinct use-case archetypes (warm support voice,
//     confident outbound voice, mature business voice, etc.) so the
//     six options actually sound different and serve different
//     campaigns rather than offering six near-identical voices
//
// Notably AVOIDED: 'varun' — has the lowest CER (0.06%) on paper but
// Sarvam explicitly notes it carries a "deep, dramatic villain/
// suspense character" and is unsuitable as a neutral voice. A villain
// reading EMI reminders would not go well.
//
// Persona-to-archetype map (so future-you knows why each persona
// exists):
//   Priya    — warm female,        for support / retention calls
//   Kavya    — bright female,      for reminders / announcements
//   Deepika  — mature female,      for formal / banking / healthcare
//   Arjun    — confident male,     for outbound sales
//   Rahul    — calm male,          for collections / sensitive talks
//   Vikram   — authoritative male, for premium B2B outbound
//
// History: the UI used to expose six labels but only four had real
// Bulbul mappings. Customers picking 'Deepika' or 'Vikram' silently
// got the default speaker (Priya — wrong gender for Vikram). Fixed
// by mapping Deepika → 'maya' and Vikram → 'arvind'. Both are real
// Bulbul V3 speakers chosen for tone differentiation from the
// existing four.
//
// If you want to retune these, the full speaker list and tone notes
// are at https://docs.sarvam.ai/api-reference-docs/api-guides-tutorials/text-to-speech/how-to/change-the-speaker-voice
//
// IMPORTANT: speaker names are case-sensitive lowercase. 'Priya' (the
// persona) maps to 'priya' (the speaker id). Don't capitalize the
// values below.
//
// CROSS-REPO SYNC: this map is duplicated in worker/agent.py as
// PERSONA_TO_BULBUL. Both must agree. Worker wins for live calls;
// this TS map is used for sample-clip generation. When you change
// one, change the other in the SAME commit.

export type AgentPersona =
  | 'Priya (Female)'
  | 'Arjun (Male)'
  | 'Kavya (Female)'
  | 'Rahul (Male)'
  | 'Deepika (Female)'
  | 'Vikram (Male)';

export interface PersonaConfig {
  /** Bulbul V3 speaker id, lowercase. */
  speaker: string;
  /** Short tag shown next to the persona in the UI dropdown. */
  description: string;
}

export const PERSONA_TO_BULBUL: Record<AgentPersona, PersonaConfig> = {
  'Priya (Female)': {
    speaker: 'priya',
    description: 'Warm & Empathetic',
  },
  'Arjun (Male)': {
    // 'rahul' is the closest male voice to a generic 'Arjun' archetype
    // among the curated speakers. Bulbul V3 doesn't ship an 'arjun'
    // speaker — the persona name is a uVOIZ brand thing, not a Sarvam
    // thing. We deliberately use a different Bulbul speaker per
    // persona so two personas don't sound identical.
    speaker: 'rahul',
    description: 'Confident & Clear',
  },
  'Kavya (Female)': {
    speaker: 'kavya',
    description: 'Friendly & Bright',
  },
  'Rahul (Male)': {
    speaker: 'aditya',
    description: 'Calm & Professional',
  },
  'Deepika (Female)': {
    // 'maya' — mature, even-toned female. Sits between Priya's warmth
    // and Kavya's brightness; reads as more formal/business than
    // either. Good for banking, healthcare, insurance verticals where
    // the caller wants to feel they're talking to a professional, not
    // a friend.
    speaker: 'maya',
    description: 'Mature & Professional',
  },
  'Vikram (Male)': {
    // 'arvind' — older, deeper male voice with natural authority.
    // Distinct from rahul (Arjun, confident) and aditya (Rahul, calm)
    // by virtue of being noticeably more senior-sounding. Pairs well
    // with B2B outbound where the call recipient is a decision-maker
    // who'd dismiss a younger-sounding caller.
    speaker: 'arvind',
    description: 'Authoritative & Senior',
  },
};

/** All persona names in display order — for rendering the UI dropdown. */
export const ALL_PERSONAS = Object.keys(PERSONA_TO_BULBUL) as AgentPersona[];

// ─────────────────────────────────────────────────────────────────
// Synthesis
// ─────────────────────────────────────────────────────────────────

export interface SynthesizeParams {
  /** The text to read aloud. Bulbul V3 caps at 2500 chars per request. */
  text: string;
  /** Persona name as shown in the UI; mapped internally to a speaker. */
  persona: AgentPersona;
  /** BCP-47 language code — drives the pre-TTS text normalizer. */
  language: SarvamLanguageCode;
  /**
   * Output container. We default to 'mp3' because that's what the
   * agent-edit voice-sample player expects in the browser. Use 'wav'
   * if you'll feed the bytes into another pipeline that doesn't want
   * to decode mp3.
   */
  format?: 'mp3' | 'wav';
  /**
   * Speech speed. 1.0 = natural. Range 0.5–2.0 in Bulbul V3.
   * Slower (0.85–0.9) is often easier for elderly listeners or
   * Tier-3 markets where the customer may not be a fluent speaker
   * of the agent's chosen language.
   */
  pace?: number;
  /**
   * Expressiveness. 0.6 default. Lower = more deterministic and
   * stable; higher = more variation but occasional artifacts. For
   * BPO calls we keep close to default — predictability beats drama.
   */
  temperature?: number;
}

export interface SynthesizeResult {
  /** Raw decoded audio bytes. */
  audio: Uint8Array;
  /** MIME type matching the requested format. */
  mimeType: string;
  /** The Bulbul speaker actually used (after persona resolution). */
  speaker: string;
}

function sarvamHeaders(): Record<string, string> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) {
    throw new Error(
      'SARVAM_API_KEY is not set. Add it to .env.local before synthesizing speech.',
    );
  }
  return {
    'api-subscription-key': key,
    'Content-Type': 'application/json',
  };
}

/**
 * Convert text to speech via Sarvam's REST TTS endpoint.
 *
 * Returns decoded audio bytes ready to write to disk or stream to
 * the browser. The response from Sarvam is base64-encoded; we decode
 * it here so callers don't have to.
 *
 * Errors thrown:
 *   - Missing SARVAM_API_KEY (config error)
 *   - HTTP non-2xx (Sarvam returns useful messages — we surface them)
 *   - Persona not in PERSONA_TO_BULBUL (programmer error)
 */
export async function synthesizeWithSarvam(
  params: SynthesizeParams,
): Promise<SynthesizeResult> {
  const personaConfig = PERSONA_TO_BULBUL[params.persona];
  if (!personaConfig) {
    throw new Error(
      `Unknown persona "${params.persona}". Add it to PERSONA_TO_BULBUL or pick from: ${ALL_PERSONAS.join(', ')}`,
    );
  }

  const format = params.format ?? 'mp3';

  // Sarvam returns the same audio regardless of language code — the
  // language_code parameter only feeds their text normalization
  // (e.g. 9840950950 → "ninety-eight-forty…" pronounced naturally).
  // Pick the language that matches the script content, not the
  // persona name.
  const body = {
    text: params.text,
    target_language_code: params.language,
    speaker: personaConfig.speaker,
    model: SARVAM_TTS_MODEL,
    pace: params.pace ?? 1.0,
    temperature: params.temperature ?? 0.6,
    speech_sample_rate: 24000,
    output_audio_codec: format,
    enable_preprocessing: true,
  };

  const response = await fetch(`${SARVAM_BASE}/text-to-speech`, {
    method: 'POST',
    headers: sarvamHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Sarvam TTS failed: ${response.status} ${response.statusText} — ${errText}`,
    );
  }

  const json = (await response.json()) as { audios?: string[] };
  const b64 = json.audios?.[0];
  if (!b64) {
    throw new Error('Sarvam TTS response missing audio payload');
  }

  // Decode base64. Buffer is Node.js — fine here because this code
  // path runs server-side (Next.js API routes / dialer cron).
  // If we ever need a browser-side decoder, switch to atob + Uint8Array.
  const audio = Buffer.from(b64, 'base64');

  return {
    audio: new Uint8Array(audio),
    mimeType: format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
    speaker: personaConfig.speaker,
  };
}

/**
 * Convenience: render a short greeting in each persona's voice.
 * Intended for pre-generating sample clips that the agent-edit
 * page plays when the user previews voices. Run this once at
 * deploy time, save the bytes to /public/voice-samples/, and the
 * UI plays them as static files — no per-preview API call.
 */
export async function renderPersonaSamples(opts: {
  greeting: string;
  language?: SarvamLanguageCode;
}): Promise<Record<AgentPersona, SynthesizeResult>> {
  const language = opts.language ?? 'en-IN';
  const out = {} as Record<AgentPersona, SynthesizeResult>;
  // Sequential rather than Promise.all — Sarvam's free tier rate-limits
  // concurrent requests. Four sequential calls is fine for an offline
  // build step. Switch to parallel if/when this becomes a hot path.
  for (const persona of ALL_PERSONAS) {
    out[persona] = await synthesizeWithSarvam({
      text: opts.greeting,
      persona,
      language,
    });
  }
  return out;
}

/** True iff SARVAM_API_KEY is set in env. */
export function isSarvamTtsConfigured(): boolean {
  return !!process.env.SARVAM_API_KEY;
}
