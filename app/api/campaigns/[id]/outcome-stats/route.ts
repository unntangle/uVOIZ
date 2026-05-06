import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { CALL_OUTCOMES, type CallOutcome } from '@/lib/openai';

/**
 * GET /api/campaigns/{id}/outcome-stats
 *
 * Returns the per-bucket call-outcome counts for a single campaign.
 * Powers the right-side "Campaign Progress" card on the detail page
 * — the seven-bucket breakdown that replaces the old
 * Total/Calls Made/Conversions stub.
 *
 * Response shape:
 *   200 {
 *     stats: {
 *       interested: 12,
 *       callback: 4,
 *       not_interested: 30,
 *       dnc: 2,
 *       voicemail: 5,
 *       no_answer: 18,
 *       wrong_number: 1,
 *     },
 *     totalClassified: 72,    // sum of stats values
 *     totalContacts: 200,     // contacts.* count for this campaign
 *   }
 *
 * Why every bucket is always present:
 *   The UI renders every bucket as a row — "Interested  12",
 *   "Callback  0", etc. Initialising all seven to zero on the
 *   server side means the client doesn't need conditional checks
 *   (`stats.interested ?? 0`) and the breakdown layout stays stable
 *   regardless of what's been classified. Cheap on the wire (8
 *   integers) so worth the simplicity.
 *
 * Performance:
 *   The `calls_campaign_outcome` index from migration 006 makes the
 *   GROUP BY an index-only scan. A campaign with 100k calls returns
 *   in single-digit milliseconds.
 *
 * Security:
 *   Auth required, campaign must belong to the caller's org. Same
 *   404-not-403 rule as the rest of the API — we don't confirm
 *   existence to non-owners.
 */

// Pre-built zero-row template. Spread into the response so callers
// always get the full shape without `?? 0` checks. Keeping this at
// module scope means we don't reallocate it per request.
const EMPTY_STATS: Record<CallOutcome, number> = {
  interested: 0,
  callback: 0,
  not_interested: 0,
  dnc: 0,
  voicemail: 0,
  no_answer: 0,
  wrong_number: 0,
};

function isOutcomeKey(v: unknown): v is CallOutcome {
  return typeof v === 'string' && (CALL_OUTCOMES as readonly string[]).includes(v);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 503 }
    );
  }

  const { id: campaignId } = await context.params;

  // Verify campaign exists and belongs to the caller's org. Same
  // pattern as the contacts route — do the org check explicitly so
  // we can return 404 cleanly for tenant-mismatch.
  const { data: campaign, error: campaignErr } = await supabaseAdmin
    .from('campaigns')
    .select('id, total_contacts')
    .eq('id', campaignId)
    .eq('org_id', session.orgId)
    .maybeSingle();

  if (campaignErr) {
    console.error('Campaign lookup failed:', { campaignId, orgId: session.orgId, campaignErr });
    return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 });
  }

  if (!campaign) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Aggregate. Supabase's PostgREST doesn't expose a clean GROUP BY
  // syntax, so we pull the outcome column for all classified calls
  // and tally client-side. At realistic page sizes (a campaign with
  // tens of thousands of calls) this still returns in <100ms because
  // the partial index on (campaign_id, outcome) WHERE outcome IS NOT
  // NULL serves the query directly. If volume grows we can switch
  // to a Postgres function or a materialized view.
  //
  // We filter `outcome IS NOT NULL` server-side via .not() so legacy
  // unclassified calls don't get pulled across the wire just to be
  // dropped here. That's the same predicate the index covers.
  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('calls')
    .select('outcome')
    .eq('campaign_id', campaignId)
    .eq('org_id', session.orgId)
    .not('outcome', 'is', null);

  if (rowsErr) {
    console.error('Outcome aggregate failed:', { campaignId, orgId: session.orgId, rowsErr });
    return NextResponse.json({ error: 'Failed to load stats' }, { status: 500 });
  }

  // Tally. Start from a fresh copy of EMPTY_STATS so each request
  // has its own object — mutating the module-level constant would
  // bleed counts between concurrent requests under load.
  const stats: Record<CallOutcome, number> = { ...EMPTY_STATS };
  let totalClassified = 0;
  for (const row of rows || []) {
    const key = (row as { outcome: string | null }).outcome;
    if (isOutcomeKey(key)) {
      stats[key] += 1;
      totalClassified += 1;
    }
    // Unknown bucket strings are silently skipped. They shouldn't
    // exist (the CHECK constraint blocks them at write time), but
    // if a future migration relaxes that and forgets to update this
    // route, we'd rather under-count than crash.
  }

  return NextResponse.json({
    stats,
    totalClassified,
    totalContacts: campaign.total_contacts ?? 0,
  });
}
