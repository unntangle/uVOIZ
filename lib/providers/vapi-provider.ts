// ============================================
// VAPI provider adapter
// ============================================
//
// Implements the VoiceProvider interface against vapi.ai. This is the
// only adapter shipping today. The TeleCMI adapter will live in a
// sibling file under lib/providers/ and follow the same shape.
//
// All HTTP and provider-specific quirks live here. Nothing outside
// this file should reference VAPI URLs, payload shapes, or its
// transcript/metadata field names.
// ============================================

import type {
  VoiceProvider,
  VoiceAgentSpec,
  ProviderAssistant,
  PlaceCallParams,
  PlacedCall,
  NormalizedWebhookEvent,
} from '../voice-provider';

const VAPI_BASE = 'https://api.vapi.ai';

function vapiHeaders() {
  return {
    Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ─────────────────────────────────────────────────────────────────
// Voice mapping
// ─────────────────────────────────────────────────────────────────
//
// The UI offers Indian-named voice personas. VAPI needs an
// (provider, voiceId) pair. ElevenLabs voice ids below are the same
// ones the original vapi.ts shipped with — kept verbatim so existing
// agents continue to sound the same after this refactor.

const VOICE_MAP: Record<string, { provider: string; voiceId: string }> = {
  'Priya (Female)': { provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
  'Arjun (Male)':   { provider: 'elevenlabs', voiceId: 'VR6AewLTigWG4xSOukaG' },
  'Kavya (Female)': { provider: 'elevenlabs', voiceId: 'pFZP5JQG7iQjIQuC4Bku' },
  'Rahul (Male)':   { provider: 'elevenlabs', voiceId: 'ErXwobaYiN019PkySvjV' },
};

function buildSystemPrompt(agent: VoiceAgentSpec): string {
  return `You are ${agent.name}, an AI voice agent for a BPO company.
Personality: ${agent.personality}
Language: ${agent.language}
Always be professional and helpful.

CALL SCRIPT:
${agent.script}

IMPORTANT RULES:
- If customer says "do not call", "DND", "not interested" — politely end call
- If customer asks for human agent — say you will arrange callback
- Keep calls under 5 minutes
- Speak in ${agent.language} naturally
- Never make false promises`;
}

// ─────────────────────────────────────────────────────────────────
// Provider implementation
// ─────────────────────────────────────────────────────────────────

export const vapiProvider: VoiceProvider = {
  name: 'vapi',

  async createAssistant(spec: VoiceAgentSpec): Promise<ProviderAssistant> {
    const voiceConfig = VOICE_MAP[spec.voice] || VOICE_MAP['Priya (Female)'];

    const response = await fetch(`${VAPI_BASE}/assistant`, {
      method: 'POST',
      headers: vapiHeaders(),
      body: JSON.stringify({
        name: spec.name,
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: buildSystemPrompt(spec),
          temperature: 0.7,
        },
        voice: {
          provider: voiceConfig.provider,
          voiceId: voiceConfig.voiceId,
        },
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: spec.language.includes('Hindi') ? 'hi' : 'en',
        },
        firstMessage: 'Hello! Am I speaking with the right person?',
        endCallMessage: 'Thank you for your time. Have a great day!',
        endCallPhrases: ['goodbye', 'bye', 'not interested', 'do not call', 'remove my number'],
        serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks`,
      }),
    });

    if (!response.ok) {
      throw new Error(`VAPI assistant creation failed: ${response.statusText}`);
    }

    const raw = await response.json();
    return { id: raw.id, raw };
  },

  async placeCall(params: PlaceCallParams): Promise<PlacedCall> {
    const response = await fetch(`${VAPI_BASE}/call/phone`, {
      method: 'POST',
      headers: vapiHeaders(),
      body: JSON.stringify({
        assistantId: params.providerAssistantId,
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: params.phone,
          name: params.customerName,
        },
        metadata: {
          campaignId: params.campaignId,
          ...params.metadata,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`VAPI call failed: ${err}`);
    }

    const raw = await response.json();
    return { id: raw.id, raw };
  },

  async endCall(callId: string): Promise<void> {
    // VAPI returns 404 for already-ended calls. We swallow non-2xx
    // here rather than throw, because callers (manual stop buttons,
    // emergency shutdown crons) treat "ended already" as success.
    try {
      await fetch(`${VAPI_BASE}/call/${callId}`, {
        method: 'DELETE',
        headers: vapiHeaders(),
      });
    } catch (err) {
      console.warn('VAPI endCall network error (call may already be ended):', err);
    }
  },

  parseWebhookEvent(body: unknown): NormalizedWebhookEvent | null {
    const payload = body as { message?: any } | null;
    const message = payload?.message;
    if (!message) return null;

    // VAPI's message.type values we care about. Anything else (status
    // pings, transfer events, function-call events) returns null and
    // the webhook route just acks 200.
    const t = message.type as string;
    if (t !== 'call-started' && t !== 'call-ended' && t !== 'call-failed') {
      return null;
    }

    return {
      type: t,
      callId: message.call?.id as string,
      status: message.call?.status as string,
      duration: message.call?.duration as number,
      recordingUrl: message.call?.recordingUrl as string,
      transcript: message.artifact?.transcript as string,
      endedReason: message.call?.endedReason as string,
      metadata: message.call?.metadata as Record<string, string>,
    };
  },
};
