// ============================================
// Recording fetch — VAPI/TeleCMI URL → R2 → DB
// ============================================
//
// Single entry point: ingestRecordingForCall(callId).
//
// Called from two places:
//   1. The VAPI webhook handler (synchronous, fire-and-forget), so a
//      recording typically lands in R2 within seconds of the call ending.
//   2. The retry cron (every 10 min), which sweeps any calls where the
//      webhook attempt failed or the worker died mid-fetch.
//
// Why one entry point for both:
//   - Same idempotency story (recording_key already set → skip).
//   - Same DB writes — one place to fix bugs, one place to add fields.
//   - The cron is just "ingestRecordingForCall in a loop" and inherits
//     all the safety from this file.
//
// Why fire-and-forget from the webhook:
//   The webhook MUST return 200 in <500ms or VAPI marks it failed and
//   replays it (which would cause double-ingestion). Awaiting the R2
//   upload inline would blow past that budget on slow links. We kick
//   off the work without awaiting; if it fails, the retry cron picks
//   it up. This is the boring-but-reliable pattern that buys us 90%
//   of what Inngest would, without adding a vendor.
//
// What we DON'T do here:
//   - Transcription. VAPI already returns a transcript in the webhook.
//     When we migrate to TeleCMI, transcription becomes its own pipeline
//     step (Deepgram), and that's the moment to add Inngest.
//   - Sentiment / conversion analysis. That stays in the webhook
//     handler — it operates on the transcript text VAPI hands us, no
//     audio fetch needed.
// ============================================

import { supabaseAdmin } from './supabase';
import {
  buildRecordingKey,
  fetchAndStoreRecording,
  isR2Configured,
} from './r2';

export type IngestResult =
  | { ok: true; key: string; bytes: number; skipped: boolean }
  | { ok: false; reason: string; retriable: boolean };

/**
 * Ingest the recording for a single call.
 *
 * Idempotent: if recording_key is already set, returns early. If the
 * fetch fails, leaves recording_key NULL so the retry cron will try
 * again. Never throws — always returns a result the caller can log.
 *
 * The `retriable` flag tells the cron whether to keep trying. Some
 * failures (404 on the upstream URL, malformed call row) are permanent;
 * others (network blip, rate limit) deserve another shot.
 */
export async function ingestRecordingForCall(
  callId: string
): Promise<IngestResult> {
  if (!supabaseAdmin) {
    return { ok: false, reason: 'no_db', retriable: false };
  }
  if (!isR2Configured()) {
    return { ok: false, reason: 'r2_not_configured', retriable: false };
  }

  // 1. Load the call row. We need org_id (for the R2 key prefix) and
  //    the upstream URL. We also re-check recording_key here — if a
  //    concurrent webhook fired this for the same call, the second
  //    caller short-circuits.
  const { data: call, error: loadErr } = await supabaseAdmin
    .from('calls')
    .select('id, org_id, recording_url, recording_key')
    .eq('id', callId)
    .maybeSingle();

  if (loadErr) {
    console.error('ingestRecording: load failed', { callId, loadErr });
    return { ok: false, reason: 'db_load_failed', retriable: true };
  }
  if (!call) {
    return { ok: false, reason: 'call_not_found', retriable: false };
  }
  if (call.recording_key) {
    // Already ingested. The /api/calls/{id}/recording route will
    // generate signed URLs from this key directly.
    return { ok: true, key: call.recording_key, bytes: 0, skipped: true };
  }
  if (!call.recording_url) {
    // No upstream URL means VAPI didn't capture audio (failed call,
    // recording disabled on the assistant, etc.). Nothing to do.
    return { ok: false, reason: 'no_upstream_url', retriable: false };
  }

  // 2. Build the R2 key. Date-partitioned + tenant-scoped — see lib/r2.ts.
  const key = buildRecordingKey({
    orgId: call.org_id,
    callId: call.id,
    ext: 'mp3',
  });

  // 3. Fetch + upload. fetchAndStoreRecording does its own existence
  //    check, so a partial earlier write at the same key won't double-bill.
  let result: { key: string; bytes: number; skipped: boolean };
  try {
    result = await fetchAndStoreRecording({
      sourceUrl: call.recording_url,
      key,
      sourceProvider: 'vapi', // TeleCMI migration will branch this
      callId: call.id,
    });
  } catch (err: any) {
    // Classify the error. 404 from VAPI is permanent (recording
    // expired or never existed); anything else is worth retrying.
    const msg = String(err?.message || err);
    const isPermanent =
      msg.includes('404') || msg.includes('not found');
    console.error('ingestRecording: fetch/upload failed', {
      callId,
      key,
      msg,
      retriable: !isPermanent,
    });
    return {
      ok: false,
      reason: isPermanent ? 'upstream_404' : 'fetch_or_upload_failed',
      retriable: !isPermanent,
    };
  }

  // 4. Write the result back to the calls row. We update three fields
  //    atomically so the calls_pending_recording_ingest partial index
  //    sees this row drop out in a single statement.
  const { error: updateErr } = await supabaseAdmin
    .from('calls')
    .update({
      recording_key: result.key,
      recording_bytes: result.bytes,
      recording_fetched_at: new Date().toISOString(),
    })
    .eq('id', callId);

  if (updateErr) {
    // The bytes are in R2 but the DB doesn't know — the retry cron
    // will see recording_key still NULL and try again. The R2
    // existence check in fetchAndStoreRecording means the second pass
    // skips the actual upload, so we're not double-billing on egress.
    console.error('ingestRecording: DB update failed', { callId, updateErr });
    return { ok: false, reason: 'db_update_failed', retriable: true };
  }

  return { ok: true, key: result.key, bytes: result.bytes, skipped: result.skipped };
}

/**
 * Fire-and-forget wrapper for use inside the VAPI webhook handler.
 *
 * Wraps ingestRecordingForCall in a promise that doesn't reject —
 * the caller doesn't await it, so a thrown error here would become
 * an unhandled rejection on the edge runtime. Failures are logged
 * and recovered by the retry cron.
 *
 * Don't use this from cron handlers — they DO want to await the
 * result so they can log success counts.
 */
export function ingestRecordingFireAndForget(callId: string): void {
  ingestRecordingForCall(callId)
    .then((res) => {
      if (!res.ok) {
        console.warn('Recording ingest failed (will retry from cron):', {
          callId,
          reason: res.reason,
          retriable: res.retriable,
        });
      } else if (!res.skipped) {
        console.log('Recording ingested:', { callId, key: res.key, bytes: res.bytes });
      }
    })
    .catch((err) => {
      // Should never reach here — ingestRecordingForCall catches
      // everything internally — but belt-and-suspenders.
      console.error('Recording ingest threw unexpectedly:', { callId, err });
    });
}
