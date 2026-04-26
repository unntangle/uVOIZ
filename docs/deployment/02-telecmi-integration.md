# TeleCMI Integration Plan

**Replacing:** VAPI (US-based, all-in-one voice AI platform)
**With:** TeleCMI (India-based telephony) + Deepgram (transcription) + OpenAI Realtime or ElevenLabs Conversational AI (voice agent brain)

This document explains *why* the architecture changes, then lays out the concrete migration: webhook handlers, recording pipeline, transcript queue, and the code-level swap of the VAPI shim.

> **Important:** Some specifics below are best-effort based on TeleCMI's public docs as of writing. **Confirm during your sales call** (see `04-telecmi-questions.md`) before implementing. Sections marked ⚠️ depend on answers from TeleCMI.

---

## Why the architecture has to change

VAPI was a one-call-API service: you tell VAPI "call this number, use this assistant" and VAPI orchestrates the LLM, voice synthesis, transcription, and telephony in their cloud. You just receive webhooks.

TeleCMI is a **telephony provider**. They give you the SIP/voice carrier and the call event webhooks, but they do NOT bundle the AI brain. You have to assemble the pieces yourself. This is more work but gives you:

- Indian carrier compliance (TRAI registration, DND respected at network level)
- India-based call quality (calls don't bounce through US datacenters)
- Lower per-minute cost (~₹0.30-0.80/min vs VAPI's ~$0.08/min ≈ ₹6.70)
- IP whitelisting + telecom-grade SLAs
- Choice of voice/LLM stack (you can switch Deepgram → AssemblyAI without changing telephony)

The tradeoff: you own the integration code that VAPI hid from you.

---

## New architecture (high level)

```
┌──────────────┐    enqueue dial    ┌──────────────┐
│ Dialer Cron  │ ─────────────────> │   Inngest    │
│ (every 1m)   │                    │  job queue   │
└──────────────┘                    └──────┬───────┘
                                           │ dialer.tick
                                           v
                                    ┌──────────────┐
                                    │  TeleCMI     │
                                    │  Make Call   │  ←── call_initiated webhook
                                    │  API         │
                                    └──────┬───────┘
                                           │
                                           v
                                    ┌──────────────┐  audio stream (WebSocket/SIP)
                                    │  Live call   │ <───────────────────────────────┐
                                    │  in progress │                                  │
                                    └──────┬───────┘                                  │
                                           │                                          │
                                           │ realtime audio                           │
                                           v                                          │
                              ┌─────────────────────────┐                             │
                              │  Voice agent brain      │                             │
                              │  • OpenAI Realtime API  │ ←─ converses with caller ───┘
                              │    OR                   │
                              │  • ElevenLabs ConvAI    │
                              └─────────────────────────┘
                                           │
                                           │ call ends, recording ready
                                           v
┌──────────────┐  webhook   ┌──────────────────────────┐
│   TeleCMI    │ ─────────> │ /api/webhooks/telecmi    │
│  recording_  │            │  (returns 200 in <500ms) │
│  ready       │            └──────────────┬───────────┘
└──────────────┘                           │ enqueue
                                           v
                                    ┌──────────────┐
                                    │   Inngest    │
                                    │              │
                                    │ recording.   │ ──> download from TeleCMI
                                    │ fetch        │     upload to R2
                                    │              │     update calls table
                                    └──────┬───────┘
                                           │
                                           v
                                    ┌──────────────┐
                                    │ transcript.  │ ──> Deepgram API
                                    │ create       │     store transcript JSON
                                    │              │     analyze sentiment, conversion
                                    └──────────────┘
```

**Key shifts from VAPI:**
- ✏️ **Webhook handler returns 200 in <500ms** by enqueuing work, not processing inline. TeleCMI retries on slow responses; processing time eats your cron budget.
- ✏️ **Recordings stored in R2**, not on TeleCMI's servers indefinitely. TeleCMI typically retains recordings 7-30 days. ⚠️ Confirm with sales.
- ✏️ **Transcription is yours to run.** TeleCMI doesn't transcribe. Deepgram nova-2 model handles Hindi+English code-switching (Hinglish) better than alternatives.
- ✏️ **The "AI brain" is yours to host.** Two production-ready options below.

---

## The voice agent brain — pick one

VAPI shipped this for you. Now you choose:

### Option A: OpenAI Realtime API (recommended for Stage 1)

OpenAI's Realtime API speaks audio in, audio out, latency ~300-500ms. You bridge the TeleCMI media stream to OpenAI's WebSocket. One vendor, simple billing, supports tool calls (book appointments, transfer to human).

- **Pros:** One API, fast, supports interruption handling natively, cheaper than ElevenLabs ConvAI
- **Cons:** Voice options limited (6 preset voices, no custom). Hindi voice quality decent but not native-grade.
- **Cost:** ~$0.06/min input + $0.24/min output ≈ ₹25/min (will drop)

### Option B: ElevenLabs Conversational AI

ElevenLabs handles the whole conversation: STT, LLM, TTS, turn-taking. Best Hindi voice quality. You point them at the caller, they handle the conversation, you receive the transcript.

- **Pros:** Native-quality Hindi voices (you've already mapped them in your VAPI code), turn-taking is excellent
- **Cons:** Newer, more expensive, less flexibility on the LLM
- **Cost:** ~$0.08-0.15/min depending on plan

### Option C: Self-assemble (Deepgram STT → GPT-4o → ElevenLabs TTS)

Maximum control, more glue code, harder to ship fast. Skip for Stage 1.

**Recommendation: Start with Option A (OpenAI Realtime).** Switch to B if customers complain about Hindi quality.

This document assumes Option A. Code patterns adapt easily if you pick B.

---

## File-by-file migration

### 2.1 Replace `lib/vapi.ts` with `lib/telecmi.ts` and `lib/voice-agent.ts`

```typescript
// lib/telecmi.ts — pure telephony (initiate calls, handle webhooks)

const TELECMI_BASE = 'https://rest.telecmi.com/v2';

function telecmiAuth() {
  return {
    appid: process.env.TELECMI_APP_ID!,
    secret: process.env.TELECMI_APP_SECRET!,
  };
}

/**
 * Initiate an outbound call.
 * TeleCMI's "Click-to-Call" or "PCMO" API depending on what your account has.
 * ⚠️ Confirm exact endpoint and payload shape during sales call.
 */
export async function makeCall(params: {
  toPhone: string;
  callerName: string;
  campaignId: string;
  agentId: string;
  contactId: string;
  orgId: string;
}) {
  const response = await fetch(`${TELECMI_BASE}/ccall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...telecmiAuth(),
      from: process.env.TELECMI_FROM_NUMBER, // your provisioned virtual number
      to: params.toPhone,
      // PCMO URL points TeleCMI to a webhook that returns the call flow XML.
      // The flow tells TeleCMI to bridge the call audio to our voice-agent endpoint.
      pcmo_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/telecmi/flow?` +
        new URLSearchParams({
          campaignId: params.campaignId,
          agentId: params.agentId,
          contactId: params.contactId,
          orgId: params.orgId,
        }).toString(),
      // Custom params returned in webhooks for correlation
      custom_data: JSON.stringify({
        campaignId: params.campaignId,
        agentId: params.agentId,
        contactId: params.contactId,
        orgId: params.orgId,
      }),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`TeleCMI call failed: ${err}`);
  }

  return response.json() as Promise<{ cmiid: string; status: string }>;
}

/**
 * End a live call.
 */
export async function endCall(cmiid: string) {
  await fetch(`${TELECMI_BASE}/ccall/hangup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...telecmiAuth(), cmiid }),
  });
}

/**
 * Verify webhook signature.
 * ⚠️ TeleCMI signature scheme TBD — confirm during sales call.
 * Common patterns: HMAC-SHA256 of body with shared secret in X-TeleCMI-Signature header.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.TELECMI_WEBHOOK_SECRET) return false;
  // const expected = crypto.createHmac('sha256', process.env.TELECMI_WEBHOOK_SECRET)
  //   .update(rawBody).digest('hex');
  // return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  return true; // placeholder — replace once spec confirmed
}

/**
 * Parse a TeleCMI webhook event into our internal shape.
 */
export type TelecmiEvent =
  | { type: 'call.initiated'; cmiid: string; data: any }
  | { type: 'call.answered'; cmiid: string; data: any }
  | { type: 'call.ended'; cmiid: string; duration: number; data: any }
  | { type: 'recording.ready'; cmiid: string; recordingUrl: string; data: any };

export function parseWebhookEvent(body: any): TelecmiEvent | null {
  // ⚠️ Adapt to TeleCMI's actual webhook payload shape
  switch (body.event) {
    case 'call_initiated':
      return { type: 'call.initiated', cmiid: body.cmiid, data: body };
    case 'call_answered':
      return { type: 'call.answered', cmiid: body.cmiid, data: body };
    case 'call_completed':
    case 'call_ended':
      return {
        type: 'call.ended',
        cmiid: body.cmiid,
        duration: body.duration_seconds || 0,
        data: body,
      };
    case 'recording_available':
    case 'recording_ready':
      return {
        type: 'recording.ready',
        cmiid: body.cmiid,
        recordingUrl: body.recording_url || body.recordingUrl,
        data: body,
      };
    default:
      return null;
  }
}
```

```typescript
// lib/voice-agent.ts — bridges TeleCMI media stream to OpenAI Realtime

/**
 * Build the conversation system prompt for an agent.
 * Same shape as the VAPI version — promotes prompt portability if you ever switch.
 */
export function buildSystemPrompt(agent: {
  name: string;
  voice: string;
  language: string;
  personality: string;
  script: string;
}): string {
  return `You are ${agent.name}, an AI voice agent for a BPO company.
Personality: ${agent.personality}
Language: ${agent.language}
Always be professional and helpful.

CALL SCRIPT:
${agent.script}

IMPORTANT RULES:
- If customer says "do not call", "DND", "not interested" — politely end call.
- If customer asks for a human agent — say you will arrange a callback.
- Keep calls under 5 minutes.
- Speak in ${agent.language} naturally.
- Never make false promises.`;
}

/**
 * Map our human-readable voice names to OpenAI Realtime voice IDs.
 * OpenAI's voices are: alloy, ash, ballad, coral, echo, sage, shimmer, verse.
 * Best Indian-accent fit: 'shimmer' (warm female), 'echo' (calm male).
 */
export function mapVoiceToOpenAI(voiceName: string): string {
  const map: Record<string, string> = {
    'Priya (Female)':  'shimmer',
    'Kavya (Female)':  'coral',
    'Arjun (Male)':    'echo',
    'Rahul (Male)':    'ash',
  };
  return map[voiceName] || 'shimmer';
}
```

The actual WebSocket bridging between TeleCMI's media stream and OpenAI Realtime is a separate runbook — too long for here. Pattern: a Node service holds two WebSockets (one to TeleCMI, one to OpenAI), pipes audio between them, applies turn-taking. ⚠️ TeleCMI confirms whether they support real-time media streaming or only IVR-style flows during the sales call. If not real-time, you fall back to: TeleCMI plays a TTS prompt → records caller response → POSTs audio to your endpoint → you transcribe + LLM + TTS the next prompt → TeleCMI plays it. Higher latency, simpler integration.

### 2.2 Webhook entry point

Create `app/api/webhooks/telecmi/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest';
import { verifyWebhookSignature, parseWebhookEvent } from '@/lib/telecmi';

export async function POST(req: NextRequest) {
  // 1. Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get('x-telecmi-signature'); // ⚠️ confirm header name

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Parse + enqueue. NEVER process synchronously here — must return <500ms.
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = parseWebhookEvent(body);
  if (!event) {
    // Unknown event — log and 200 so TeleCMI doesn't retry forever
    console.warn('Unknown TeleCMI event', body);
    return NextResponse.json({ received: true });
  }

  // 3. Send to Inngest. Inngest retries on failure with exponential backoff.
  await inngest.send({
    name: 'telecmi/webhook.received',
    data: event,
  });

  // 4. Return immediately
  return NextResponse.json({ received: true });
}
```

### 2.3 The PCMO call flow endpoint

TeleCMI's PCMO (Programmable Call Management Object) is XML-like JSON returned to TeleCMI when a call is placed. It tells TeleCMI what to do during the call.

For a real-time AI conversation flow you'd return a `<Stream>` directive pointing at a WebSocket URL. ⚠️ Confirm during sales whether TeleCMI supports this and what the exact PCMO syntax is.

Create `app/api/telecmi/flow/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get('campaignId');
  const agentId = url.searchParams.get('agentId');
  // ... etc

  // ⚠️ Replace with actual TeleCMI PCMO syntax once confirmed
  const flow = {
    pcmo: [
      {
        action: 'stream',
        url: `wss://uvoiz.unntangle.com/api/voice-bridge?agentId=${agentId}&campaignId=${campaignId}`,
        track: 'both',  // bidirectional audio
      },
    ],
  };

  return NextResponse.json(flow);
}
```

The WebSocket bridge endpoint (`/api/voice-bridge`) is the bridging service mentioned in 2.1. ⚠️ Vercel doesn't natively support WebSocket upgrades on serverless functions — this part will likely need to live elsewhere (Fly.io app, Railway service, or a small DigitalOcean droplet with a static IP). Vercel for HTTP, Fly.io for the persistent WebSocket bridge. Cost: ~$5/mo.

### 2.4 Update agents/route.ts

Remove the `createVapiAssistant` call. With the new architecture, agents don't need to be pre-created on the telephony side — they're just rows in your DB. The system prompt is built per-call from `lib/voice-agent.ts:buildSystemPrompt()`.

Edit `app/api/agents/route.ts`:

```typescript
// REMOVE:
//   import { createVapiAssistant } from '@/lib/vapi';
//   const vapiAssistant = await createVapiAssistant({ ... });

// The agent row in DB is enough. vapi_assistant_id can be removed from the schema
// in a future migration, or repurposed as voice_provider_id for OpenAI Realtime
// session IDs if you want to track them.

const agent = await createAgent(org.id, {
  name: body.name,
  voice: body.voice,
  language: body.language,
  personality: body.personality,
  script: body.script,
});
```

Drop the `vapiAssistantId` field from `createAgent`.

### 2.5 Update the dialer cron

Edit `app/api/cron/dialer/route.ts`. Replace VAPI usage with the Inngest event:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }

  // Fetch active campaigns and fan out one event per campaign.
  // Inngest will run the dialer.tick function per-campaign with concurrency limits.
  const { data: campaigns } = await supabaseAdmin
    .from('campaigns')
    .select('id, org_id')
    .eq('status', 'active');

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ message: 'No active campaigns' });
  }

  const events = campaigns.map(c => ({
    name: 'dialer/tick' as const,
    data: { campaignId: c.id, orgId: c.org_id },
  }));

  await inngest.send(events);

  return NextResponse.json({ enqueued: events.length });
}
```

The actual dialing logic moves into the Inngest job (see `03-inngest-jobs.md`).

### 2.6 Schema changes

```sql
-- supabase/migrations/20260427_telecmi_migration.sql

-- Rename vapi-specific columns to provider-agnostic
ALTER TABLE calls
  RENAME COLUMN vapi_call_id TO provider_call_id;

-- Recordings now live in R2; store the R2 key, not the URL
-- (URLs are signed and time-limited, generated on-demand)
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS recording_r2_key TEXT,
  ADD COLUMN IF NOT EXISTS recording_status TEXT DEFAULT 'pending';
  -- recording_status: pending → fetching → stored → failed

-- Transcript stored as JSONB so we can query into it (search words, timestamps)
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS transcript_json JSONB,
  ADD COLUMN IF NOT EXISTS transcript_status TEXT DEFAULT 'pending';
  -- transcript_status: pending → transcribing → done → failed

-- Provider-agnostic provider name (telecmi, vapi, twilio if needed)
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'telecmi';

-- Drop vapi_assistant_id from agents (the row itself is the agent)
ALTER TABLE agents
  DROP COLUMN IF EXISTS vapi_assistant_id;

-- Add voice provider tracking
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS voice_provider TEXT DEFAULT 'openai-realtime';
  -- 'openai-realtime' | 'elevenlabs-convai'
```

### 2.7 Environment variables to add

```
TELECMI_APP_ID=
TELECMI_APP_SECRET=
TELECMI_FROM_NUMBER=
TELECMI_WEBHOOK_SECRET=

OPENAI_API_KEY=
DEEPGRAM_API_KEY=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=uvoiz-recordings

INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Remove these (no longer needed):
```
VAPI_API_KEY        # GONE
VAPI_PHONE_NUMBER_ID  # GONE
```

---

## Migration sequence (don't skip the order)

This is non-trivial. Roll out in this order:

1. **Build and deploy alongside VAPI.** Don't delete VAPI code yet. Add TeleCMI code with a feature flag: `TELEPHONY_PROVIDER=vapi|telecmi` env var. Default `vapi`.
2. **Test TeleCMI integration on a single test campaign in staging.** Use TeleCMI's sandbox env (⚠️ confirm exists during sales call).
3. **Verify recording → R2 → transcription pipeline end-to-end.** Listen to a real recording in your UI from R2 signed URL. Read the transcript.
4. **Switch ONE BPO tenant to TeleCMI.** Monitor for 1 week. Check error rates in Sentry, recording delivery rate, transcript accuracy.
5. **Switch remaining tenants over.** Use the env flag at the org level if you want to migrate gradually.
6. **Delete `lib/vapi.ts`, remove env vars, drop legacy columns.** Last step. Don't do until 30+ days of stable TeleCMI operation.

---

## What this looks like at the code level when complete

- `lib/vapi.ts` → DELETED
- `lib/telecmi.ts` → NEW (telephony only)
- `lib/voice-agent.ts` → NEW (LLM brain config)
- `lib/r2.ts` → NEW (recording storage)
- `lib/transcription.ts` → NEW (Deepgram wrapper)
- `lib/jobs.ts` → NEW (Inngest job definitions, see doc 03)
- `app/api/webhooks/route.ts` → DEPRECATED (VAPI-specific path)
- `app/api/webhooks/telecmi/route.ts` → NEW
- `app/api/telecmi/flow/route.ts` → NEW (PCMO endpoint)
- `app/api/inngest/route.ts` → NEW (Inngest discovery endpoint)
- `app/api/cron/dialer/route.ts` → REWRITTEN (now just enqueues to Inngest)
- `app/api/agents/route.ts` → REWRITTEN (no VAPI assistant creation)

The structural change is the right one regardless of TeleCMI: separating telephony from the AI brain from storage from job orchestration is how you build a maintainable voice product. VAPI's all-in-one was a fast start; this is the production architecture.
