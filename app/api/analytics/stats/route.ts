import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getDashboardStats } from '@/lib/db';

/**
 * GET /api/analytics/stats
 *
 * Returns the headline stats the dashboard renders in its top cards.
 * Shape matches `DashboardStats` in types/index.ts:
 *   - totalCallsToday    — calls created since 00:00 local
 *   - activeCallsNow     — currently in-progress count
 *   - conversionRate     — % of today's calls marked converted
 *   - avgCallDuration    — mean duration of today's completed calls
 *   - callsChange        — delta vs yesterday (placeholder until we
 *                          start storing day-snapshots)
 *   - conversionChange   — same, for conversion rate
 *
 * Why the change fields are 0 today:
 *   getDashboardStats in lib/db.ts only reads "today" — to compute
 *   day-over-day deltas we'd need either a window query for yesterday
 *   or a daily snapshot table. Returning 0 now means the dashboard
 *   stops 404'ing AND the StatCard component's change indicators just
 *   stay neutral instead of showing fake spikes. We add the delta
 *   computation when we build the analytics rollup table — separate work.
 *
 * Why this is org-scoped via session.orgId:
 *   Every other API route in this app uses `org_id` filters as the
 *   tenant boundary. getDashboardStats does the same internally.
 *   Without the session check a stranger could fetch stats for any
 *   org they could guess the UUID of.
 *
 * Performance:
 *   getDashboardStats does one read of today's calls table (filtered
 *   by org_id and created_at >= midnight). At 1k calls/day per org
 *   this stays well under 100ms. If we ever scale past that point,
 *   precomputed daily aggregates land in a separate table.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await getDashboardStats(session.orgId);
    return NextResponse.json(stats);
  } catch (err) {
    console.error('GET analytics/stats error:', err);
    // Fall back to zeroed stats rather than 500 — the dashboard's
    // StatCard components handle 0 gracefully (they show "0 calls",
    // not "—"). A 500 would render an error toast which is louder
    // than the situation warrants for a stats endpoint.
    return NextResponse.json(
      {
        totalCallsToday: 0,
        activeCallsNow: 0,
        conversionRate: 0,
        avgCallDuration: 0,
        callsChange: 0,
        conversionChange: 0,
      },
      { status: 200 }
    );
  }
}
