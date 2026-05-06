import { NextRequest, NextResponse } from 'next/server';
import { updateCall, updateOrgMinutes, getOrg } from '@/lib/db';
import { getVoiceProvider } from '@/lib/voice-provider';
import { analyseSentiment, isConverted } from '@/lib/transcript-analysis';
import { classifyCallOutcome, isOpenAiConfigured, type CallOutcome } from '@/lib/openai';
import { supabaseAdmin } from '@/lib/supabase';
import { ingestRecordingFireAndForget } from '@/lib/recording-fetch';

/**
 * Run the OpenAI outcome classifier on a finished call's transcript
 * and return the structured result, or null if the classifier can't
 * run (no API key configured, OpenAI returned an error, etc.).
 *
 * Errors are swallowed deliberately. The classifier is an *additive*
 * post-processing step — the call has already happened, the
 * transcript and sentiment have already been saved. If we let a
 * classifier failure bubble up to the webhook handler, we'd return
 * 5xx and the voice provider would replay the webhook, double-
 * incrementing campaign stats and re-uploading the recording. That's
 * a much worse failure mode than "this one call has a NULL outcome".
 *
 * The webhook caller is responsible for checking the return value
 * and only writing to calls.outcome / contacts.outcome when non-null.
 * NULL outcomes render as em-dash in the UI — a graceful degradation.
 */
async function runOutcomeClassifier(
  transcript: string | null | undefined,
  endedReason: string | null | undefined,
): Promise<{ outcome: CallOutcome; confidence: number; summary: string } | null> {
  // Empty transcript = no LLM call needed. classifyCallOutcome's
  // empty-transcript branch derives the outcome deterministically
  // from endedReason ('no_answer' / 'voicemail' / 'wrong_number')
  // without spending a token. Run it even when OPENAI_API_KEY is
  // missing — dev environments should still see failed calls
  // segmented correctly in the breakdown.
  const hasTranscript = !!transcript?.trim();
  if (hasTranscript && !isOpenAiConfigured()) {
    // Real transcript, no API key — we can't classify. Outcome
    // stays NULL, UI shows em-dash. Logged once per call so the
    // absence is visible during local dev.
    console.warn('Outcome classifier skipped: OPENAI_API_KEY not set.');
    return null;
  }
  try {
    const result = await classifyCallOutcome(transcript, endedReason);
    return {
      outcome: result.outcome,
      confidence: result.confidence,
      summary: result.summary,
    };
  } catch (err) {
    console.error('Outcome classifier failed:', err);
    return null;
  }
}

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

        // ────────────────────────────────────────────────────────
        // Outcome classification (7-bucket BPO taxonomy).
        //
        // Runs *after* the primary updateCall() so a slow or failing
        // classifier never delays writing the canonical call data.
        // The result is then patched onto the same calls row and
        // mirrored to the contact row. See lib/openai.ts for the
        // bucket definitions and lib/migrations/006_call_outcomes.sql
        // for the schema. This block is a no-op until the migration
        // is applied (the columns won't exist) — Supabase's update
        // surfaces an error on missing columns, which we log and
        // continue past.
        // ────────────────────────────────────────────────────────
        const classification = await runOutcomeClassifier(
          event.transcript,
          event.endedReason,
        );
        if (classification) {
          // Patch the call row with the outcome fields. We can't
          // pass these through updateCall() above without changing
          // its type signature in lib/db.ts, and we want the
          // outcome write to be independent of the canonical write
          // (so a transient classifier-DB error doesn't lose the
          // primary update). The cost is one extra UPDATE per call,
          // which at our volume is fine.
          const { error: callOutcomeErr } = await supabaseAdmin
            .from('calls')
            .update({
              outcome: classification.outcome,
              outcome_confidence: classification.confidence,
              outcome_summary: classification.summary,
            })
            .eq('vapi_call_id', event.callId);
          if (callOutcomeErr) {
            console.error('Outcome write to calls failed:', callOutcomeErr);
          }

          // Mirror the outcome to the contact row so the campaign
          // detail page's contact list can render the badge without
          // a JOIN. See migration 006 for why this denormalization
          // exists.
          if (event.metadata?.contactId) {
            const { error: contactOutcomeErr } = await supabaseAdmin
              .from('contacts')
              .update({ outcome: classification.outcome })
              .eq('id', event.metadata.contactId);
            if (contactOutcomeErr) {
              console.error('Outcome write to contacts failed:', contactOutcomeErr);
            }
          }
        }

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

        // Failed calls still get an outcome so they show up in the
        // campaign breakdown (almost always 'no_answer', sometimes
        // 'voicemail' or 'wrong_number' depending on endedReason).
        // The classifier's empty-transcript path makes this call
        // basically free — no LLM hit, just a string match on
        // endedReason. Skipping the OpenAI-configured check is
        // safe because runOutcomeClassifier short-circuits internally.
        {
          const classification = await runOutcomeClassifier(
            event.transcript,
            event.endedReason,
          );
          if (classification) {
            const { error: failedOutcomeErr } = await supabaseAdmin
              .from('calls')
              .update({
                outcome: classification.outcome,
                outcome_confidence: classification.confidence,
                outcome_summary: classification.summary,
              })
              .eq('vapi_call_id', event.callId);
            if (failedOutcomeErr) {
              console.error('Outcome write to calls (failed) failed:', failedOutcomeErr);
            }
            if (event.metadata?.contactId) {
              const { error: failedContactOutcomeErr } = await supabaseAdmin
                .from('contacts')
                .update({ outcome: classification.outcome })
                .eq('id', event.metadata.contactId);
              if (failedContactOutcomeErr) {
                console.error('Outcome write to contacts (failed) failed:', failedContactOutcomeErr);
              }
            }
          }
        }

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
