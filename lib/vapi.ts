// ============================================
// lib/vapi.ts — DEPRECATED, kept as a re-export shim
// ============================================
//
// The VAPI integration has been split into:
//
//   - lib/voice-provider.ts            interface + getVoiceProvider()
//   - lib/providers/vapi-provider.ts   the actual VAPI implementation
//   - lib/transcript-analysis.ts       analyseSentiment / isConverted
//
// New code should import from those modules. This file exists only
// so the existing call sites (app/api/agents/route.ts, the dialer
// cron, the webhook handler, lib/recording-fetch.ts) keep building
// during the migration. Each call site will be updated in turn,
// after which this shim can be deleted.
//
// The functions below have the same signatures and behaviour they
// had before the refactor — they delegate to the provider returned
// by getVoiceProvider() so a future VOICE_PROVIDER=telecmi switch
// flows through these names automatically.
// ============================================

import { getVoiceProvider } from './voice-provider';

export { analyseSentiment, isConverted } from './transcript-analysis';

// ─────────────────────────────────────────────────────────────────
// Legacy function names → provider abstraction
// ─────────────────────────────────────────────────────────────────

export async function createVapiAssistant(agent: {
  name: string;
  voice: string;
  language: string;
  personality: string;
  script: string;
}) {
  const provider = getVoiceProvider();
  const result = await provider.createAssistant(agent);
  // Old code expects the raw VAPI response shape (with .id at the top
  // level). The adapter preserves that under .raw, but legacy
  // callers also accept { id } at the top so this is fine.
  return result.raw ?? { id: result.id };
}

export async function makeCall(params: {
  phone: string;
  vapiAssistantId: string;
  customerName: string;
  campaignId: string;
  metadata?: Record<string, string>;
}) {
  const provider = getVoiceProvider();
  const result = await provider.placeCall({
    phone: params.phone,
    customerName: params.customerName,
    providerAssistantId: params.vapiAssistantId,
    campaignId: params.campaignId,
    metadata: params.metadata,
  });
  return result.raw ?? { id: result.id };
}

export async function endCall(callId: string) {
  const provider = getVoiceProvider();
  await provider.endCall(callId);
}

export function parseWebhookEvent(body: any) {
  const provider = getVoiceProvider();
  return provider.parseWebhookEvent(body);
}

// `getVapiCall` was used nowhere in the live code paths I could see,
// but legacy branches may still import it. Surface a clear error so
// any straggler shows up in CI rather than silently doing nothing.
export async function getVapiCall(_callId: string): Promise<never> {
  throw new Error(
    'getVapiCall is no longer supported. The provider abstraction does ' +
    'not expose a per-call fetch — use webhook events to track call ' +
    'state, or read the calls row from the DB.',
  );
}
