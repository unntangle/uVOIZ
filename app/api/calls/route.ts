import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, getCalls, createCall } from '@/lib/db';
import { getVoiceProvider } from '@/lib/voice-provider';

/**
 * GET  /api/calls — list this org's calls (most recent first via DB).
 * POST /api/calls — manually trigger a call. Used by the "test call"
 *                   button in the legacy dashboard; the dialer cron
 *                   uses its own internal path, not this endpoint.
 *
 * Browser-based "Talk to Agent" tests do NOT go through this route —
 * they use /api/livekit/token + the worker. This endpoint is only for
 * real outbound PSTN calls via the configured voice provider.
 *
 * Historical note: this route used to import `makeCall` from
 * lib/vapi.ts directly. After the provider-abstraction refactor that
 * shim returned a loosely-typed value (`unknown` once the build
 * tightened up), so `vapiCall.id` failed strict type-checking on
 * Vercel even though it compiled cleanly in dev. Migrated to
 * getVoiceProvider() to match the rest of the routes that use the
 * abstraction (POST /api/agents, the dialer cron, webhooks).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = session.orgId;
    const org = await getOrg(orgId);
    if (!org) return NextResponse.json({ calls: [] });

    const calls = await getCalls(org.id);
    return NextResponse.json({ calls });
  } catch (error) {
    console.error('GET calls error:', error);
    return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = session.orgId;
    const org = await getOrg(orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    // Quota gate. The dialer cron checks the same limit before
    // dialing each contact in a campaign; this manual route checks
    // it for one-off calls. Both paths read the same row.
    if (org.minutes_used >= org.minutes_limit) {
      return NextResponse.json({
        error: 'Minute limit reached. Please upgrade your plan.',
        upgradeRequired: true,
      }, { status: 402 });
    }

    const body = await req.json();
    // `vapiAssistantId` is kept as the field name in the request body
    // for backward compatibility with any clients still sending it,
    // even though we now route via the provider abstraction. Internal
    // naming is `providerAssistantId`.
    const { phone, contactId, campaignId, agentId, vapiAssistantId, customerName } = body;

    // Demo mode — no provider key. The Next.js side returns a
    // synthetic queued call id so the UI flow works for screenshots
    // and demos without burning real provider minutes.
    if (!process.env.VAPI_API_KEY) {
      return NextResponse.json({
        success: true,
        callId: `demo_${Date.now()}`,
        status: 'queued',
        message: 'Demo mode — add VAPI_API_KEY (or migrate to TELECMI_*) to .env.local for real calls',
      });
    }

    // Place the call via whichever voice provider VOICE_PROVIDER
    // points at. Today that's VAPI; once TeleCMI is wired the same
    // call site dispatches through the new adapter.
    const provider = getVoiceProvider();
    const placed = await provider.placeCall({
      phone,
      providerAssistantId: vapiAssistantId,
      customerName: customerName || 'Customer',
      campaignId,
      metadata: { orgId: org.id, agentId, contactId },
    });

    // Save call to DB. We keep the column name vapiCallId until
    // the cosmetic rename to providerCallId ships (TODO).
    const call = await createCall(org.id, {
      campaignId,
      agentId,
      contactId,
      vapiCallId: placed.id,
    });

    return NextResponse.json({
      success: true,
      callId: placed.id,
      dbCallId: call?.id,
    });
  } catch (error: any) {
    console.error('POST call error:', error);
    return NextResponse.json({ error: error.message || 'Failed to make call' }, { status: 500 });
  }
}
