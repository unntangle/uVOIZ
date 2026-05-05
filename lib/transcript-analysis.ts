// ============================================
// Transcript analysis — sentiment + conversion detection
// ============================================
//
// Lightweight rule-based heuristics over a call's transcript text.
// Not provider-specific: any voice provider returns a transcript
// string when the call ends, and these functions don't care where it
// came from.
//
// These are deliberately simple keyword scoring. They are good enough
// for "rough and dirty" pipeline metrics — not for any decision a
// human or money depends on. When that day comes, swap in a real
// classifier (e.g. an LLM call, or a fine-tuned model).
//
// Lifted from the original lib/vapi.ts during the provider-abstraction
// refactor; behaviour is unchanged.
// ============================================

const POSITIVE_WORDS = [
  'yes', 'interested', 'great', 'okay', 'sure', 'good',
  'thank', 'please', 'happy', 'definitely',
];

const NEGATIVE_WORDS = [
  'no', 'not interested', 'remove', 'dnd', 'stop', 'angry',
  'frustrated', 'waste', 'spam', 'busy',
];

const CONVERSION_PHRASES = [
  'yes i am interested',
  'please proceed',
  'i will do it',
  'send me the details',
  'confirmed',
  'i agree',
  'let s do it',
];

export type Sentiment = 'positive' | 'neutral' | 'negative';

/**
 * Tally positive vs. negative keyword hits in the transcript and
 * return the larger side. Ties → 'neutral'. Empty transcript →
 * 'neutral' (nothing to score against).
 */
export function analyseSentiment(transcript: string | null | undefined): Sentiment {
  if (!transcript) return 'neutral';
  const lower = transcript.toLowerCase();

  const posScore = POSITIVE_WORDS.filter((w) => lower.includes(w)).length;
  const negScore = NEGATIVE_WORDS.filter((w) => lower.includes(w)).length;

  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}

/**
 * True if the transcript contains a clear "yes I'll do it" phrase.
 *
 * `endedReason` is currently unused but kept in the signature because
 * future providers may surface a structured "outcome" we should fold
 * into the decision (e.g. TeleCMI marking a call as transferred or
 * completed-with-conversion). Keeping the param means callers don't
 * have to change when we wire that in.
 */
export function isConverted(
  transcript: string | null | undefined,
  endedReason?: string | null,
): boolean {
  if (!transcript) return false;
  const lower = transcript.toLowerCase();
  return CONVERSION_PHRASES.some((p) => lower.includes(p));
}
