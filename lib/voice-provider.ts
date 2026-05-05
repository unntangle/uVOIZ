// ============================================
// Voice provider abstraction
// ============================================
//
// A small, deliberate seam between the application and whichever voice
// AI provider is actually placing calls. Today the only implementation
// is VAPI. Tomorrow it will be TeleCMI + custom orchestration. The
// rest of the app — agents API, dialer cron, webhook handler,
// recording-fetch — talks to this interface and never to a vendor
// directly.
//
// What lives here:
//   - The shapes the app cares about: VoiceAgentSpec, NormalizedCall,
//     NormalizedWebhookEvent.
//   - The VoiceProvider interface every implementation must satisfy.
//   - getVoiceProvider() — env-driven selection, single source of
//     truth for which provider is in production.
//
// What does NOT live here:
//   - HTTP calls. Each implementation file (lib/providers/*.ts) owns
//     its own fetches.
//   - Sentiment / conversion analysis. Those work on transcript
//     strings independent of provider, so they stay in
//     lib/transcript-analysis.ts (extracted from the old vapi.ts).
//
// Why the seam is shaped this way:
//   The app's mental model is "an agent has a script and a voice; we
//   tell the provider to call a number; later we get a webhook with
//   transcript and recording". Different providers express the same
//   model with different field names. We pick our own names here and
//   each adapter translates.
//
// On orchestration (Path 2 — TeleCMI + own STT/LLM/TTS):
//   The interface pretends each provider returns "an assistant id" and
//   "a call id". TeleCMI itself doesn't have the assistant concept —
//   we'd materialize it in our own table and the TeleCMI adapter
//   would generate a UUID at agent creation time, store the
//   STT/LLM/TTS config, and use that UUID as the "assistantId" the
//   rest of the app sees. The dialer doesn't need to know.
// ============================================

// ─────────────────────────────────────────────────────────────────
// Domain types — what the app talks about
// ─────────────────────────────────────────────────────────────────

/**
 * Spec the app hands to the provider when materialising an agent.
 * Identical to the existing createVapiAssistant input — keeps the
 * agents API route unchanged across provider swaps.
 */
export interface VoiceAgentSpec {
  name: string;
  /** Friendly voice name from the UI dropdown, e.g. 'Priya (Female)'. */
  voice: string;
  /** Agent language label, e.g. 'Hindi + English'. */
  language: string;
  personality: string;
  script: string;
}

/** Result of materialising an agent in the upstream provider. */
export interface ProviderAssistant {
  /** The id we store in agents.vapi_assistant_id (or its successor). */
  id: string;
  /** Free-form provider-side metadata, kept for debugging. */
  raw?: unknown;
}

/** Parameters for placing an outbound call. */
export interface PlaceCallParams {
  phone: string;
  customerName: string;
  /** The provider's assistant id — what createAssistant returned. */
  providerAssistantId: string;
  campaignId: string;
  /** Extra context the provider should echo back in webhooks. */
  metadata?: Record<string, string>;
}

/** Result of placing a call. */
export interface PlacedCall {
  /** Provider-side call id — stored in calls.vapi_call_id. */
  id: string;
  raw?: unknown;
}

/**
 * Normalised webhook event. Each provider's adapter parses its native
 * payload into this shape so the webhook route handler is provider-
 * agnostic.
 *
 * Type values are deliberately small and stable. New provider events
 * that don't map cleanly should return null from parseWebhookEvent —
 * never invent a type the app doesn't handle.
 */
export interface NormalizedWebhookEvent {
  type: 'call-started' | 'call-ended' | 'call-failed';
  callId: string;
  status?: string;
  /** Total call duration in seconds. */
  duration?: number;
  recordingUrl?: string;
  transcript?: string;
  endedReason?: string;
  metadata?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────────
// Provider interface
// ─────────────────────────────────────────────────────────────────

export interface VoiceProvider {
  /** Lowercase machine name, written into env and logs. */
  name: 'vapi' | 'telecmi' | 'stub';

  /**
   * Materialise an agent in the upstream provider. Called from the
   * agents API route on POST. Should be idempotent on the agent's
   * intrinsic identity if possible (most providers don't support
   * upsert by client-supplied id, in which case create-only is fine
   * and the caller stores the returned id).
   */
  createAssistant(spec: VoiceAgentSpec): Promise<ProviderAssistant>;

  /**
   * Place an outbound call. Returns the provider's call id; the
   * dialer stores it on the calls row so the webhook can correlate.
   */
  placeCall(params: PlaceCallParams): Promise<PlacedCall>;

  /**
   * End an in-flight call. Used by manual stop buttons and emergency
   * shutdown jobs. Implementations should swallow "call already
   * ended" errors silently.
   */
  endCall(callId: string): Promise<void>;

  /**
   * Parse a webhook payload into the app's normalized shape.
   * Returns null for events the app doesn't care about (status
   * pings, transfer events, etc.) so the webhook route can ack 200
   * without further work.
   */
  parseWebhookEvent(body: unknown): NormalizedWebhookEvent | null;
}

// ─────────────────────────────────────────────────────────────────
// Provider selection
// ─────────────────────────────────────────────────────────────────
//
// One env var, one switch. Defaults to 'vapi' so existing deployments
// behave exactly as before this abstraction landed. When the TeleCMI
// adapter is ready, set VOICE_PROVIDER=telecmi in env and nothing
// else needs to change.

import { vapiProvider } from './providers/vapi-provider';

export function getVoiceProvider(): VoiceProvider {
  const name = (process.env.VOICE_PROVIDER || 'vapi').toLowerCase();
  switch (name) {
    case 'vapi':
      return vapiProvider;
    // case 'telecmi':
    //   return telecmiProvider;
    default:
      console.warn(
        `Unknown VOICE_PROVIDER "${name}" — falling back to VAPI.`,
      );
      return vapiProvider;
  }
}
