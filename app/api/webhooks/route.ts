import { NextRequest, NextResponse } from 'next/server';
import { updateCall, updateOrgMinutes, getOrg } from '@/lib/db';
import { getVoiceProvider } from '@/lib/voice-provider';
import { analyseSentiment, isConverted } from '@/lib/transcript-analysis';
import { supabaseAdmin } from '@/lib/supabase';
import { ingestRecordingFireAndForget } from '@/lib/recording-fetch';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!supabaseAdmin) {
      console.warn('Voice provider webhook received but Supabase is not configured. Skipping processing.');
      return NextResponse.json({ received: true });
    }

    const provider = getVoiceProvider();
    const event = provider.parseWebhookEvent(body);

    if (!event) return NextResponse.json({ received: true });

    console.log(`${provider.name} webhook: ${event.type} — call ${event.callId}`);

    switch (event.type) {

      case 'call-started':
        await updateCall(event.callId, {
          status: 'in-progress',
          started_at: new Date().toISOString(),
        });
        break;

      case 'call-ended': {
        const sentiment = analyseSentiment(event.transcript || '');
        const converted = isConverted(event.transcript || '', event.endedReason || '');
        const durationMinutes = Math.ceil((event.duration || 0) / 60);

        await updateCall(event.callId, {
          status: 'completed',
          duration: event.duration || 0,
          recording_url: event.recordingUrl,
          transcript: event.transcript,
          sentiment,
          converted,
          ended_at: new Date().toISOString(),
        });

        // ─────────────────────────────────────────────────────────
        // Kick off recording ingest into R2.
        //
        // We need our calls.id (the UUID) to fire this, but updateCall
        // above keyed on vapi_call_id. Re-fetch it. This is a single
        // indexed read, so the webhook latency budget is fine.
        //
        // Fire-and-forget: we don't await. A slow R2 upload must not
        // delay our 200 response — VAPI replays slow webhooks, which
        // would risk double-ingestion. The cron at /api/cron/recording-retry
        // will pick up anything that fails or times out here.
        // ─────────────────────────────────────────────────────────
        if (event.recordingUrl) {
          const { data: callRow } = await supabaseAdmin
            .from('calls')
            .select('id')
            .eq('vapi_call_id', event.callId)
            .maybeSingle();
          if (callRow?.id) {
            ingestRecordingFireAndForget(callRow.id);
          } else {
            console.warn('Voice webhook: no calls row for provider call id', event.callId);
          }
        }

        // Update minute usage for the org
        if (event.metadata?.orgId) {
          const org = await getOrg(event.metadata.orgId);
          if (org) {
            await updateOrgMinutes(org.id, org.minutes_used + durationMinutes);
          }
        }

        // Update campaign stats
        if (event.metadata?.campaignId) {
          const { data: campaign } = await supabaseAdmin
            .from('campaigns')
            .select('called, converted, failed')
            .eq('id', event.metadata.campaignId)
            .single();

          if (campaign) {
            await supabaseAdmin
              .from('campaigns')
              .update({
                called: campaign.called + 1,
                converted: converted ? campaign.converted + 1 : campaign.converted,
                updated_at: new Date().toISOString(),
              })
              .eq('id', event.metadata.campaignId);
          }
        }

        // Update agent stats
        if (event.metadata?.agentId) {
          const { data: agent } = await supabaseAdmin
            .from('agents')
            .select('calls_handled, success_rate, avg_duration')
            .eq('id', event.metadata.agentId)
            .single();

          if (agent) {
            const newTotal = agent.calls_handled + 1;
            const newAvgDuration = Math.round(
              (agent.avg_duration * agent.calls_handled + (event.duration || 0)) / newTotal
            );
            await supabaseAdmin
              .from('agents')
              .update({ calls_handled: newTotal, avg_duration: newAvgDuration })
              .eq('id', event.metadata.agentId);
          }
        }

        // Update contact status
        if (event.metadata?.contactId) {
          await supabaseAdmin
            .from('contacts')
            .update({ status: converted ? 'converted' : 'called' })
            .eq('id', event.metadata.contactId);
        }
        break;
      }

      case 'call-failed':
        await updateCall(event.callId, {
          status: 'failed',
          ended_at: new Date().toISOString(),
        });
        if (event.metadata?.contactId) {
          await supabaseAdmin
            .from('contacts')
            .update({ status: 'failed' })
            .eq('id', event.metadata.contactId);
        }
        break;

      default:
        console.log('Unhandled voice provider event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
