// ============================================
// Sarvam AI — Speech-to-Text (Saaras V3)
// ============================================
//
// Thin wrapper around Sarvam's REST speech-to-text endpoint. Used for
// non-streaming transcription — e.g. transcribing a full call recording
// after the fact for analytics / search. Real-time streaming during a
// live call uses the WebSocket variant (lib/providers/sarvam-stt-stream.ts,
// to be built when the LiveKit agent worker is wired up).
//
// Why we picked Sarvam over Deepgram/Whisper for uVOIZ:
//   - 19% WER on IndicVoices vs 30%+ for Deepgram on the same set
//   - Native Hinglish / Tanglish code-switching (Deepgram phonetically
//     matches Hindi words to English, e.g. "Bhai" → "Bye")
//   - Data residency in India (DPDP Act compliance for BFSI customers)
//   - INR pricing, ₹30/hour (~$0.36/hr) — cheaper than Deepgram in INR
//
// What this file does NOT do:
//   - Streaming. The REST endpoint requires the full audio first.
//   - Diarization configuration, custom prompts, mode switching. Those
//     live in the streaming wrapper where they actually matter for
//     live conversations. The REST path uses transcribe mode only.
//
// ============================================

const SARVAM_BASE = 'https://api.sarvam.ai';

// Saaras v3 is Sarvam's flagship STT model, recommended for all new
// integrations per their docs. Saarika v2.5 transcribes in the spoken
// language only; Saaras v3 supports translation and code-mix output too.
// We pin the version explicitly rather than tracking 'latest' so a Sarvam
// model update can't silently change call transcripts under us.
const SARVAM_STT_MODEL = 'saaras:v3' as const;

/**
 * BCP-47 language codes Sarvam accepts. The set the BPO product cares
 * about today is Hindi, Tamil, Telugu, Kannada, English; we list the
 * full Sarvam-supported set so adding more is just a UI change.
 *
 * 'unknown' is a Saaras v3 feature — leave detection to the model.
 * Recommended when the agent supports multiple languages and the
 * customer's preferred one isn't known up front.
 */
export type SarvamLanguageCode =
  | 'hi-IN' | 'ta-IN' | 'te-IN' | 'kn-IN' | 'ml-IN'
  | 'mr-IN' | 'gu-IN' | 'bn-IN' | 'pa-IN' | 'od-IN'
  | 'as-IN' | 'en-IN' | 'unknown';

/**
 * Saaras v3 mode parameter. Each mode changes the output shape.
 *
 * - 'transcribe' (default): output in the spoken language with proper
 *    formatting and number normalization. What you want for storing
 *    a faithful transcript.
 * - 'translate': output in English regardless of spoken language.
 *    Useful for analytics dashboards where reviewers don't speak the
 *    customer's language.
 * - 'verbatim': word-for-word, including filler words and unnormalized
 *    numbers. Use for QA / training data, not customer-facing UI.
 * - 'translit': Romanized output (Hindi spoken → "mera phone number…").
 *    Niche — handy for systems that can't render Devanagari.
 * - 'codemix': English words in English, Indic words in native script.
 *    The most realistic representation of how Indians actually speak;
 *    pick this if you'll show transcripts back to BPO managers.
 */
export type SarvamSttMode =
  | 'transcribe'
  | 'translate'
  | 'verbatim'
  | 'translit'
  | 'codemix';

export interface SarvamTranscribeParams {
  /** Audio bytes. Sarvam accepts WAV, MP3, AAC, OGG, Opus, FLAC, M4A, etc. */
  audio: Blob | ArrayBuffer | Uint8Array;
  /** Original filename — Sarvam uses the extension to infer codec. */
  filename: string;
  language?: SarvamLanguageCode;
  mode?: SarvamSttMode;
  /**
   * Speaker diarization. When true, Sarvam tags each segment with a
   * speaker label (S1, S2). Useful for two-party calls where you want
   * to separate AI agent speech from customer speech in analytics.
   */
  withDiarization?: boolean;
}

export interface SarvamTranscribeResult {
  /** Full transcript text, joined across all segments. */
  transcript: string;
  /** Detected language code (Sarvam returns this even when input is 'unknown'). */
  detectedLanguage?: string;
  /**
   * Per-segment turns when diarization is on. Empty array otherwise.
   * Each turn has the speaker label, text, and (when available)
   * start/end timestamps in seconds.
   */
  turns: Array<{
    speaker: string;
    text: string;
    startSec?: number;
    endSec?: number;
  }>;
  /** Provider raw response, kept for debugging. */
  raw?: unknown;
}

function sarvamHeaders(): Record<string, string> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) {
    // Throw at call time, not module load — lets the rest of the app
    // build/import even if the key isn't set yet. The dialer cron's
    // existing pattern is to skip work when keys are missing rather
    // than crash the process.
    throw new Error(
      'SARVAM_API_KEY is not set. Add it to .env.local before transcribing.',
    );
  }
  // Sarvam uses 'api-subscription-key' rather than the Bearer pattern.
  // Don't change this — copy-pasting from OpenAI examples will silently
  // 401 here.
  return { 'api-subscription-key': key };
}

/**
 * Transcribe an audio file via Sarvam's REST endpoint.
 *
 * Use this for post-call processing on completed recordings. For live
 * call transcription during a call, use the streaming WebSocket variant
 * (separate file).
 *
 * Limits to be aware of:
 *   - REST endpoint: audio must be under 30 seconds. Anything longer
 *     should go through the Batch API (separate file, future work).
 *   - PCM input requires explicit input_audio_codec — we don't expose
 *     that in this wrapper because callers should pass MP3/WAV. If you
 *     find yourself needing PCM here, you're probably in the streaming
 *     path and should use the WebSocket wrapper instead.
 */
export async function transcribeWithSarvam(
  params: SarvamTranscribeParams,
): Promise<SarvamTranscribeResult> {
  const form = new FormData();

  // Wrap raw bytes into a Blob so FormData can stream them. The
  // filename matters — Sarvam uses the extension for codec detection.
  //
  // Why the explicit Uint8Array copy below: TypeScript's `BlobPart`
  // type doesn't accept `Uint8Array<ArrayBufferLike>` because that
  // union includes SharedArrayBuffer, which Blob constructors reject
  // at runtime. The lib.dom and Node typings disagree about this in
  // a way that broke the strict Vercel build but not local dev.
  // Copying into a fresh Uint8Array narrows the underlying buffer to
  // a regular ArrayBuffer, which BlobPart accepts. The copy cost is
  // negligible — this code path runs once per completed call for
  // post-hoc transcription, not in the live voice loop.
  let blob: Blob;
  if (params.audio instanceof Blob) {
    blob = params.audio;
  } else if (params.audio instanceof ArrayBuffer) {
    blob = new Blob([new Uint8Array(params.audio)]);
  } else {
    // Uint8Array path. Slice() returns a fresh Uint8Array backed by
    // a regular ArrayBuffer (not SharedArrayBuffer), which is what
    // BlobPart wants.
    blob = new Blob([params.audio.slice()]);
  }
  form.append('file', blob, params.filename);

  form.append('model', SARVAM_STT_MODEL);
  if (params.language) form.append('language_code', params.language);
  if (params.mode) form.append('mode', params.mode);
  if (params.withDiarization) form.append('with_diarization', 'true');

  const response = await fetch(`${SARVAM_BASE}/speech-to-text`, {
    method: 'POST',
    headers: sarvamHeaders(),
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Sarvam STT failed: ${response.status} ${response.statusText} — ${errText}`,
    );
  }

  const raw = (await response.json()) as {
    transcript?: string;
    language_code?: string;
    diarized_transcript?: {
      entries?: Array<{
        speaker_id?: string;
        transcript?: string;
        start_time_seconds?: number;
        end_time_seconds?: number;
      }>;
    };
  };

  const turns =
    raw.diarized_transcript?.entries?.map((e) => ({
      speaker: e.speaker_id ?? 'unknown',
      text: e.transcript ?? '',
      startSec: e.start_time_seconds,
      endSec: e.end_time_seconds,
    })) ?? [];

  return {
    transcript: raw.transcript ?? '',
    detectedLanguage: raw.language_code,
    turns,
    raw,
  };
}

/**
 * True if SARVAM_API_KEY is present in env. Lets callers gate behaviour
 * (e.g. dialer cron skipping post-call transcription) without throwing.
 */
export function isSarvamConfigured(): boolean {
  return !!process.env.SARVAM_API_KEY;
}
