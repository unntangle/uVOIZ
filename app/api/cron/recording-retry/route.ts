import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ingestRecordingForCall } from '@/lib/recording-fetch';

/**
 * POST/GET /api/cron/recording-retry
 *
 * Scans for calls whose webhook-time ingest didn't land — recording_url
 * is set (so we know there's audio upstream) but recording_key is NULL
 * (so R2 doesn't have it yet). Re-tries each one through the same
 * ingestRecordingForCall path the webhook uses.
 *
 * Why a separate cron instead of the dialer cron:
 *   - Different cadence. Dialer fires every 1 min and is latency-
 *     sensitive (a customer is waiting on the call). Recording retry
 *     can run every 10 min — there's no human waiting on the upload.
 *   - Different failure budget. Dialer failures pause the campaign;
 *     recording failures are loggable warnings.
 *   - Cleaner blast radius if either job has a bug.
 *
 * Auth: same Bearer-token pattern as the dialer cron. Vercel Cron and
 * GitHub Actions both attach the header automatically.
 *
 * Throughput: caps at MAX_BATCH per run to keep the function under
 * Vercel's 60-second timeout. With ~3 sec per fetch, 20 records is the
 * safe ceiling. If pending grows faster than 20/10min, raise the cron
 * to every 5 min before raising the batch — concurrent uploads from
 * one function are easier to debug than batch sizes that span timeouts.
 */

const MAX_BATCH = 20;

/**
 * Wall-clock budget for the whole run. The route MUST respond before
 * Vercel's function timeout (maxDuration below) or the platform kills
 * it with a 504 — which makes the GitHub Actions curl fail and sends a
 * "Run failed" email every 10 minutes. We stop picking up new rows once
 * the budget is spent; whatever's left is picked up by the next run.
 * Budget (40s) + one worst-case in-flight fetch (15s) stays under 60s.
 */
const TIME_BUDGET_MS = 40_000;

/**
 * Tell Vercel this function may run up to 60s (the batch loop is
 * time-budgeted above so we always return before this is hit). Without
 * this export the route gets the plan-default timeout, which is shorter
 * than a batch of recording fetches and was the direct cause of the
 * cron's 504s.
 */
export const maxDuration = 60;

/**
 * Skip rows older than this — VAPI recordings expire after a few hours
 * and 7 days is a generous ceiling. Older calls are permanently lost
 * audio, no point retrying. Kept as a constant so it's easy to tune.
 */
const RETRY_WINDOW_DAYS = 7;

function unauthorized(reason: string) {
  return NextResponse.json({ error: 'Unauthorized', reason }, { status: 401 });
}

function checkAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'Server misconfigured: CRON_SECRET not set' },
      { status: 500 }
    );
  }
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${expected}`) return null;

  // Query-param fallback for tools that can't easily set headers.
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret && querySecret === expected) return null;

  return unauthorized('Bad or missing cron token');
}

async function runRetry() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }

  // ─────────────────────────────────────────────────────────────
  // Pull pending rows. The partial index calls_pending_recording_ingest
  // (created by the migration) makes this a tiny scan even at scale.
  //
  // Order by created_at so the oldest pending recordings are tried
  // first — the upstream URL has a finite shelf life.
  // ─────────────────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: pending, error: queryErr } = await supabaseAdmin
    .from('calls')
    .select('id')
    .not('recording_url', 'is', null)
    .is('recording_key', null)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_BATCH);

  if (queryErr) {
    console.error('Recording retry: query failed', queryErr);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ message: 'No pending recordings', processed: 0 });
  }

  // ─────────────────────────────────────────────────────────────
  // Process serially. We could parallelize with Promise.all but
  // sequential keeps memory predictable (each fetch buffers the MP3),
  // and 20 × 3 sec = 60 sec is right at the function timeout — going
  // parallel would just trade latency for memory pressure without
  // letting us process more per run.
  // ─────────────────────────────────────────────────────────────
  let succeeded = 0;
  let failedRetriable = 0;
  let failedPermanent = 0;
  let deferred = 0;
  const details: Array<{ callId: string; result: string }> = [];
  const startedAt = Date.now();

  for (const row of pending) {
    // Time-budget guard: never start a new fetch if we're close to the
    // function timeout. Better to return a partial-success 200 than to
    // get 504'd mid-row (which fails the whole workflow run AND leaves
    // no JSON body to debug from).
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      deferred = pending.length - details.length;
      break;
    }
    const result = await ingestRecordingForCall(row.id);
    if (result.ok) {
      if (!result.skipped) succeeded += 1;
      details.push({ callId: row.id, result: result.skipped ? 'already_done' : 'ingested' });
    } else if (result.retriable) {
      failedRetriable += 1;
      details.push({ callId: row.id, result: `retry_later:${result.reason}` });
    } else {
      failedPermanent += 1;
      details.push({ callId: row.id, result: `permanent_fail:${result.reason}` });
      // For permanent failures we still leave recording_key NULL —
      // the partial index keeps the row visible until we either:
      //   a) decide to clear recording_url so it stops appearing here, or
      //   b) build a UI to surface "lost recordings" to the BPO.
      // Until (b), the cutoff date above bounds how long this loops.
    }
  }

  return NextResponse.json({
    success: true,
    scanned: pending.length,
    succeeded,
    failedRetriable,
    failedPermanent,
    deferred, // rows skipped this run due to time budget; next run gets them
    details,
  });
}

export async function GET(req: NextRequest) {
  const authError = checkAuth(req);
  if (authError) return authError;
  return runRetry();
}

export async function POST(req: NextRequest) {
  const authError = checkAuth(req);
  if (authError) return authError;
  return runRetry();
}
