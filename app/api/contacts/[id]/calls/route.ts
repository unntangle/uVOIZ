import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/contacts/{id}/calls
 *
 * Returns the call history for a single contact, most-recent first.
 * Powers the side drawer on the campaign detail page — click a row
 * in the contacts table, the drawer opens and fetches this endpoint.
 *
 * What's returned:
 *   - The minimum the drawer needs: id, transcript, outcome trio,
 *     duration, started_at, ended_at, status, recording_key.
 *   - We do NOT return recording_url (the upstream provider URL).
 *     Recording playback goes through /api/calls/{id}/recording
 *     which generates a signed R2 URL with a 5-min TTL.
 *
 * Security:
 *   - Auth required (session cookie).
 *   - Contact must belong to the caller's org. We verify by joining
 *     on contacts.org_id rather than trusting the path param. A user
 *     guessing another tenant's contact UUID gets 404, not 403,
 *     because confirming "this UUID exists in another org" leaks
 *     information.
 *
 * Response shape:
 *   200 { calls: [...] }      — may be empty array; the contact
 *                              exists but hasn't been called yet.
 *   401                       — unauthenticated
 *   404                       — contact not found OR not in user's org
 *                              (we don't distinguish)
 *   503                       — database not configured (dev/CI only)
 *
 * Why a separate endpoint instead of joining into the contacts
 * GET response:
 *   The contacts list view renders fine with just the denormalized
 *   `contacts.outcome` mirror — it doesn't need transcripts. Loading
 *   transcripts for every contact (potentially hundreds) up front
 *   would balloon the page payload and slow the initial render.
 *   We pay the per-call fetch only when the user opens a drawer,
 *   which is a small fraction of contacts.
 */
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

  const { id: contactId } = await context.params;

  // First confirm the contact belongs to this org. We could combine
  // this with the calls fetch via a single join, but keeping them
  // separate makes the 404-vs-empty-array distinction crisp:
  //   - Contact missing or wrong org → 404
  //   - Contact exists, no calls    → 200 with calls: []
  // A single-query approach would conflate these, and the drawer UI
  // wants to render "No calls yet" for the second case, not "Contact
  // not found".
  const { data: contact, error: contactErr } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('org_id', session.orgId)
    .maybeSingle();

  if (contactErr) {
    console.error('Contact lookup failed:', { contactId, orgId: session.orgId, contactErr });
    return NextResponse.json({ error: 'Failed to load contact' }, { status: 500 });
  }

  if (!contact) {
    // Don't leak whether the contact exists in another tenant.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fetch calls for this contact, most-recent first. The fields
  // listed are exactly what the drawer needs — changing this set
  // means changing the drawer UI on the other end, so keep them
  // intentional rather than `select('*')`.
  const { data: calls, error: callsErr } = await supabaseAdmin
    .from('calls')
    .select(`
      id,
      status,
      duration,
      transcript,
      outcome,
      outcome_confidence,
      outcome_summary,
      sentiment,
      converted,
      started_at,
      ended_at,
      created_at,
      recording_key
    `)
    .eq('contact_id', contactId)
    .eq('org_id', session.orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (callsErr) {
    console.error('Calls fetch failed:', { contactId, orgId: session.orgId, callsErr });
    return NextResponse.json({ error: 'Failed to load calls' }, { status: 500 });
  }

  return NextResponse.json({ calls: calls || [] });
}
