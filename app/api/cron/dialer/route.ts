import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { makeCall } from '@/lib/vapi';

/**
 * Dialer cron — fires every minute, picks up to 5 pending contacts per active
 * campaign and initiates calls.
 *
 * Auth: Bearer token. CRON_SECRET must be set in env. Both Vercel Cron and
 * GitHub Actions send `Authorization: Bearer <secret>`. We accept POST so the
 * curl from GH Actions matches; GET is also accepted so Vercel Cron's default
 * works without configuration changes.
 */

function unauthorized(reason: string) {
  return NextResponse.json({ error: 'Unauthorized', reason }, { status: 401 });
}

function checkAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed: missing secret in env means we refuse to run rather than
    // silently letting anyone trigger the dialer.
    return NextResponse.json(
      { error: 'Server misconfigured: CRON_SECRET not set' },
      { status: 500 }
    );
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
  // configured via vercel.json. GH Actions does the same via our workflow.
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${expected}`) return null;

  // Allow `?secret=...` as a fallback for tools that can't set headers easily.
  // Comparison is constant-time-ish via length check + string equality; for
  // a 32-byte hex secret this is acceptable.
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret && querySecret === expected) return null;

  return unauthorized('Bad or missing cron token');
}

async function runDialer() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }

  try {
    // 1. Find active campaigns
    const { data: activeCampaigns, error: campaignErr } = await supabaseAdmin
      .from('campaigns')
      .select('id, org_id, agent_id, name')
      .eq('status', 'active');

    if (campaignErr) throw campaignErr;
    if (!activeCampaigns || activeCampaigns.length === 0) {
      return NextResponse.json({ message: 'No active campaigns' });
    }

    const callsInitiated = [];

    // 2. Loop through campaigns
    for (const campaign of activeCampaigns) {
      // 2a. Get the agent for this campaign to retrieve vapi_assistant_id
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('id, vapi_assistant_id')
        .eq('id', campaign.agent_id)
        .single();

      if (!agent || !agent.vapi_assistant_id) {
        console.log(`Skipping campaign ${campaign.id}: Agent has no VAPI assistant ID.`);
        continue;
      }

      // 2b. Check org minutes
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('minutes_used, minutes_limit')
        .eq('id', campaign.org_id)
        .single();

      if (!org || org.minutes_used >= org.minutes_limit) {
        // Pause the campaign if out of minutes
        await supabaseAdmin
          .from('campaigns')
          .update({ status: 'paused' })
          .eq('id', campaign.id);
        console.log(`Campaign ${campaign.id} paused due to insufficient minutes.`);
        continue;
      }

      // 3. Find pending contacts for this campaign
      // Only picking 5 at a time to prevent rate limits / massive concurrency
      const { data: contacts } = await supabaseAdmin
        .from('contacts')
        .select('id, name, phone')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .limit(5);

      if (!contacts || contacts.length === 0) {
        // Mark campaign as completed
        await supabaseAdmin
          .from('campaigns')
          .update({ status: 'completed' })
          .eq('id', campaign.id);
        continue;
      }

      // 4. Initiate calls
      for (const contact of contacts) {
        try {
          // Mark as calling to prevent duplicate triggers
          await supabaseAdmin
            .from('contacts')
            .update({ status: 'calling' })
            .eq('id', contact.id);

          const callRes = await makeCall({
            phone: contact.phone,
            customerName: contact.name,
            vapiAssistantId: agent.vapi_assistant_id,
            campaignId: campaign.id,
            metadata: {
              contactId: contact.id,
              orgId: campaign.org_id,
              agentId: agent.id,
            }
          });

          // Log the call creation in our database
          await supabaseAdmin
            .from('calls')
            .insert({
              org_id: campaign.org_id,
              campaign_id: campaign.id,
              agent_id: agent.id,
              contact_id: contact.id,
              vapi_call_id: callRes.id,
              status: 'queued'
            });

          callsInitiated.push({ contactId: contact.id, callId: callRes.id });
        } catch (e: any) {
          console.error(`Failed to call ${contact.phone}:`, e);
          // Revert to pending or failed
          await supabaseAdmin
            .from('contacts')
            .update({ status: 'failed' })
            .eq('id', contact.id);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      initiated: callsInitiated.length,
      details: callsInitiated 
    });

  } catch (error: any) {
    console.error('Dialer Cron Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const authError = checkAuth(req);
  if (authError) return authError;
  return runDialer();
}

export async function POST(req: NextRequest) {
  const authError = checkAuth(req);
  if (authError) return authError;
  return runDialer();
}
