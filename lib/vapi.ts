// VAPI Voice AI Integration
// Handles creating assistants, making calls, and processing webhooks

const VAPI_BASE = 'https://api.vapi.ai';

function vapiHeaders() {
  return {
    Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ---- Create a VAPI Assistant from an Agent ----
export async function createVapiAssistant(agent: {
  name: string;
  voice: string;
  language: string;
  personality: string;
  script: string;
}) {
  const voiceMap: Record<string, { provider: string; voiceId: string }> = {
    'Priya (Female)': { provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
    'Arjun (Male)': { provider: 'elevenlabs', voiceId: 'VR6AewLTigWG4xSOukaG' },
    'Kavya (Female)': { provider: 'elevenlabs', voiceId: 'pFZP5JQG7iQjIQuC4Bku' },
    'Rahul (Male)': { provider: 'elevenlabs', voiceId: 'ErXwobaYiN019PkySvjV' },
  };

  const voiceConfig = voiceMap[agent.voice] || voiceMap['Priya (Female)'];

  const systemPrompt = `You are ${agent.name}, an AI voice agent for a BPO company.
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

  const response = await fetch(`${VAPI_BASE}/assistant`, {
    method: 'POST',
    headers: vapiHeaders(),
    body: JSON.stringify({
      name: agent.name,
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt,
        temperature: 0.7,
      },
      voice: {
        provider: voiceConfig.provider,
        voiceId: voiceConfig.voiceId,
      },
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: agent.language.includes('Hindi') ? 'hi' : 'en',
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

  return response.json();
}

// ---- Make an outbound call ----
export async function makeCall(params: {
  phone: string;
  vapiAssistantId: string;
  customerName: string;
  campaignId: string;
  metadata?: Record<string, string>;
}) {
  const response = await fetch(`${VAPI_BASE}/call/phone`, {
    method: 'POST',
    headers: vapiHeaders(),
    body: JSON.stringify({
      assistantId: params.vapiAssistantId,
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

  return response.json();
}

// ---- Get call details ----
export async function getVapiCall(callId: string) {
  const response = await fetch(`${VAPI_BASE}/call/${callId}`, {
    headers: vapiHeaders(),
  });
  return response.json();
}

// ---- End a live call ----
export async function endCall(callId: string) {
  await fetch(`${VAPI_BASE}/call/${callId}`, {
    method: 'DELETE',
    headers: vapiHeaders(),
  });
}

// ---- Parse VAPI webhook event ----
export function parseWebhookEvent(body: any) {
  const { message } = body;
  if (!message) return null;

  return {
    type: message.type as string,
    callId: message.call?.id as string,
    status: message.call?.status as string,
    duration: message.call?.duration as number,
    recordingUrl: message.call?.recordingUrl as string,
    transcript: message.artifact?.transcript as string,
    endedReason: message.call?.endedReason as string,
    metadata: message.call?.metadata as Record<string, string>,
  };
}

// ---- Analyse sentiment from transcript ----
export function analyseSentiment(transcript: string): 'positive' | 'neutral' | 'negative' {
  if (!transcript) return 'neutral';
  const lower = transcript.toLowerCase();

  const positiveWords = ['yes', 'interested', 'great', 'okay', 'sure', 'good', 'thank', 'please', 'happy', 'definitely'];
  const negativeWords = ['no', 'not interested', 'remove', 'dnd', 'stop', 'angry', 'frustrated', 'waste', 'spam', 'busy'];

  const posScore = positiveWords.filter(w => lower.includes(w)).length;
  const negScore = negativeWords.filter(w => lower.includes(w)).length;

  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}

// ---- Check if call resulted in conversion ----
export function isConverted(transcript: string, endedReason: string): boolean {
  if (!transcript) return false;
  const lower = transcript.toLowerCase();
  const conversionPhrases = ['yes i am interested', 'please proceed', 'i will do it', 'send me the details', 'confirmed', 'i agree', 'let s do it'];
  return conversionPhrases.some(p => lower.includes(p));
}
