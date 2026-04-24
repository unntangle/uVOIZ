import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrg, getCalls, createCall, updateOrgMinutes } from '@/lib/db';
import { makeCall } from '@/lib/vapi';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(orgId || userId);
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
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(orgId || userId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    // Check minute limits
    if (org.minutes_used >= org.minutes_limit) {
      return NextResponse.json({
        error: 'Minute limit reached. Please upgrade your plan.',
        upgradeRequired: true,
      }, { status: 402 });
    }

    const body = await req.json();
    const { phone, contactId, campaignId, agentId, vapiAssistantId, customerName } = body;

    // Demo mode — no VAPI key
    if (!process.env.VAPI_API_KEY) {
      return NextResponse.json({
        success: true,
        callId: `demo_${Date.now()}`,
        status: 'queued',
        message: 'Demo mode — add VAPI_API_KEY to .env.local for real calls',
      });
    }

    // Make real call via VAPI
    const vapiCall = await makeCall({
      phone,
      vapiAssistantId,
      customerName: customerName || 'Customer',
      campaignId,
      metadata: { orgId: org.id, agentId, contactId },
    });

    // Save call to DB
    const call = await createCall(org.id, {
      campaignId,
      agentId,
      contactId,
      vapiCallId: vapiCall.id,
    });

    return NextResponse.json({ success: true, callId: vapiCall.id, dbCallId: call?.id });
  } catch (error: any) {
    console.error('POST call error:', error);
    return NextResponse.json({ error: error.message || 'Failed to make call' }, { status: 500 });
  }
}
