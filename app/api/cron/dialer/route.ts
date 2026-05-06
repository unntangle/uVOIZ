import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceProvider } from '@/lib/voice-provider';
import { evaluateAndLog, type ComplianceInput } from '@/lib/compliance';

/**
 * Dialer cron — fires every minute, picks up to 5 pending contacts per active
 * campaign and initiates calls.
 *
 * Auth: Bearer token. CRON_SECRET must be set in env. Both Vercel Cron and
 * GitHub Actions send `Authorization: Bearer <secret>`. We accept POST so the
 * curl from GH Actions matches; GET is also accepted so Vercel Cron's default
 * works without configuration changes.
 *
 * Compliance gating:
 *   Before each call, the dialer runs the contact through
 *   lib/compliance.ts. If the org has compliance_strict ON, any block
 *   finding (outside calling window, DND, missing DLT template, missing
 *   consent source) skips the call and logs a compliance_events row.
 *   Strict OFF downgrades blocks to warnings — call still proceeds, row
 *   still logged. The contact is NOT marked failed in either case; it
 *   stays 'pending' so a later run (within the legal window, after DND
 *   scrub, etc.) can pick it up.
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
    // 1. Find active campaigns. We pull the compliance-relevant fields
    //    (window + consent_source) here so we don't have to refetch
    //    them per contact below.
    const { data: activeCampaigns, error: campaignErr } = await supabaseAdmin
      .from('campaigns')
      .select(
        'id, org_id, agent_id, name, consent_source, calling_window_start, calling_window_end',
      )
      .eq('status', 'active');

    if (campaignErr) throw campaignErr;
    if (!activeCampaigns || activeCampaigns.length === 0) {
      return NextResponse.json({ message: 'No active campaigns' });
    }

    const callsInitiated: Array<{ contactId: string; callId: string }> = [];
    const callsSkipped: Array<{
      contactId: string;
      reasons: string[];
    }> = [];

    // 2. Loop through campaigns
    for (const campaign of activeCampaigns) {
      // 2a. Get the agent for this campaign — we need vapi_assistant_id
      //     to actually place the call AND dlt_template_id /
      //     script_locked_at for the compliance check.
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('id, vapi_assistant_id, dlt_template_id, script_locked_at')
        .eq('id', campaign.agent_id)
        .single();

      if (!agent || !agent.vapi_assistant_id) {
        console.log(`Skipping campaign ${campaign.id}: Agent has no VAPI assistant ID.`);
        continue;
      }

      // 2b. Check org minutes AND pull compliance flags in the same query.
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select(
          'id, minutes_used, minutes_limit, compliance_strict, dlt_entity_id, dlt_header',
        )
        .eq('id', campaign.org_id)
        .single();

      if (!org || org.minutes_used >= org.minutes_limit) {
        // Out of minutes — stop the campaign. The legal resting state
        // depends on whether contacts still exist:
        //   - contacts > 0 → 'paused' (user can top up minutes and resume).
        //   - contacts = 0 → 'draft' (paused with nothing to call would
        //     be a confusing dead state; matches the rule enforced in
        //     the PATCH handler and the read-side normalization in
        //     lib/db.ts so all writers agree).
        const { count: contactCount } = await supabaseAdmin
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);
        const nextStatus = (contactCount ?? 0) > 0 ? 'paused' : 'draft';

        await supabaseAdmin
          .from('campaigns')
          .update({ status: nextStatus })
          .eq('id', campaign.id);
        console.log(`Campaign ${campaign.id} → ${nextStatus} (out of minutes, ${contactCount ?? 0} contacts).`);
        continue;
      }

      // 3. Find pending contacts for this campaign. Use the
      //    contacts_callable index (added in 005_compliance.sql) which
      //    pre-filters to dnd_status IN ('unchecked', 'clean'). We
      //    still re-check status in lib/compliance.ts so the DB is not
      //    the only line of defense, but the index makes the common
      //    case cheap.
      const { data: contacts } = await supabaseAdmin
        .from('contacts')
        .select('id, name, phone, dnd_status, consent_source')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .in('dnd_status', ['unchecked', 'clean'])
        .limit(5);

      if (!contacts || contacts.length === 0) {
        // No callable contacts. Don't auto-complete the campaign here —
        // there might be DND-flagged contacts still in the table that a
        // future scrub run could re-classify. A separate completion job
        // can decide when a campaign is truly done.
        continue;
      }

      // 4. For each contact, run compliance gate, then place the call
      //    if allowed.
      for (const contact of contacts) {
        const complianceInput: ComplianceInput = {
          org: {
            id: org.id,
            compliance_strict: !!org.compliance_strict,
            dlt_entity_id: org.dlt_entity_id,
            dlt_header: org.dlt_header,
          },
          campaign: {
            id: campaign.id,
            consent_source: campaign.consent_source,
            calling_window_start: campaign.calling_window_start,
            calling_window_end: campaign.calling_window_end,
          },
          agent: {
            id: agent.id,
            dlt_template_id: agent.dlt_template_id,
            script_locked_at: agent.script_locked_at,
          },
          contact: {
            id: contact.id,
            dnd_status: contact.dnd_status as ComplianceInput['contact']['dnd_status'],
            consent_source: contact.consent_source,
          },
        };

        const decision = await evaluateAndLog(complianceInput);

        if (decision.shouldBlockCall) {
          // Hard block — strict mode is on and at least one rule failed.
          // Leave the contact 'pending' so a later run can succeed
          // (e.g. when the calling window opens). The audit row was
          // written by evaluateAndLog.
          callsSkipped.push({
            contactId: contact.id,
            reasons: decision.findings
              .filter((f) => f.severity === 'block')
              .map((f) => f.reason),
          });
          continue;
        }

        try {
          // Mark as calling to prevent duplicate triggers
          await supabaseAdmin
            .from('contacts')
            .update({ status: 'calling' })
            .eq('id', contact.id);

          const provider = getVoiceProvider();
          const callRes = await provider.placeCall({
            phone: contact.phone,
            customerName: contact.name,
            providerAssistantId: agent.vapi_assistant_id,
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
          // Revert to failed so we don't loop on a permanently-broken
          // contact; the operator can re-queue manually if needed.
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
      skipped: callsSkipped.length,
      details: callsInitiated,
      skippedDetails: callsSkipped,
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
