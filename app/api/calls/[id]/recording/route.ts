import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getRecordingUrl, isR2Configured } from '@/lib/r2';

/**
 * GET /api/calls/{id}/recording
 *
 * Returns a short-lived signed URL the audio player can stream from.
 * Never returns the upstream provider URL (VAPI / TeleCMI) — those are
 * either short-lived already or globally accessible without auth, and
 * we don't want either property leaked to the browser.
 *
 * Query params:
 *   ?download=1  — generates a URL whose Content-Disposition header
 *                  forces a "Save as" dialog instead of inline play.
 *                  Used by the Download button on the calls page.
 *
 * Response shape:
 *   200 { url, expiresIn, bytes }     — ready to play
 *   202 { status: 'pending' }         — recording exists upstream but
 *                                       hasn't been ingested into R2 yet
 *   404                               — call not found OR not in user's org
 *                                       (we don't distinguish — that would
 *                                       leak existence of other tenants)
 *   503                               — R2 not configured
 *
 * Why 5-minute TTL on the signed URL:
 *   Long enough for the HTML5 audio element to fetch the file and start
 *   playback (typical recordings are 1-10 MB, well under a minute on any
 *   broadband). Short enough that a leaked URL — Slack share, email
 *   forward, browser history copy — goes stale before it can be abused.
 *
 *   Do NOT cache the response on the client. The route fingerprints a
 *   call_id but the URL it returns rotates every 5 min. Caching would
 *   serve stale URLs that 403 from R2.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Authn
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

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: 'Recording storage not configured' },
      { status: 503 }
    );
  }

  // Next 16 awaits dynamic route params.
  const { id: callId } = await params;
  const wantDownload = req.nextUrl.searchParams.get('download') === '1';

  // 2. Authz — fetch the call with its org filter as the security
  // boundary. A user with one org's session must NEVER see the audio
  // from another org's call, even by guessing the UUID.
  const { data: call, error } = await supabaseAdmin
    .from('calls')
    .select('id, recording_key, recording_bytes, recording_url, contacts(name, phone)')
    .eq('id', callId)
    .eq('org_id', session.orgId)
    .maybeSingle();

  if (error) {
    console.error('Recording route DB error:', { callId, orgId: session.orgId, error });
    return NextResponse.json({ error: 'Failed to load call' }, { status: 500 });
  }

  if (!call) {
    // Don't leak whether the row exists in another tenant. Generic 404.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 3. Three states:
  //    a. recording_key set → generate signed URL and return
  //    b. recording_url set but recording_key missing → ingest pending
  //    c. neither set → no recording for this call (e.g. failed before
  //       audio captured, or call still in progress)
  if (!call.recording_key) {
    if (call.recording_url) {
      // The fetch job hasn't run yet. The client should poll or render
      // a "Processing recording..." state. We DO NOT fall back to the
      // upstream URL here — that would bypass our auth and tenant
      // isolation, and may not even be playable (some providers gate
      // the recording behind their own API key).
      return NextResponse.json(
        { status: 'pending' },
        { status: 202 }
      );
    }
    return NextResponse.json(
      { error: 'No recording available' },
      { status: 404 }
    );
  }

  // 4. Generate a fresh signed URL. 300 seconds = 5 min.
  // For downloads, attach a Content-Disposition that forces a save
  // dialog with a sensible filename. The browser otherwise uses the
  // R2 key as filename which looks like "1aef-...mp3" — ugly.
  try {
    let downloadFilename: string | undefined;
    if (wantDownload) {
      // Build "uvoiz-{contactName-or-callId}-{date}.mp3"
      // Strip non-alphanumerics from contact name so the filename is
      // shell-safe across OSes. Fall back to short call id if no name.
      const contactArr = (call as unknown as { contacts: { name?: string }[] | { name?: string } | null }).contacts;
      const contact = Array.isArray(contactArr) ? contactArr[0] : contactArr;
      const nameSlug =
        (contact?.name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40) || call.id.slice(0, 8);
      const dateSlug = new Date().toISOString().slice(0, 10);
      downloadFilename = `uvoiz-${nameSlug}-${dateSlug}.mp3`;
    }

    const url = await getRecordingUrl(
      call.recording_key,
      300,
      downloadFilename ? { downloadFilename } : undefined
    );
    return NextResponse.json({
      url,
      expiresIn: 300,
      bytes: call.recording_bytes ?? null,
    });
  } catch (err: any) {
    console.error('Signed URL generation failed:', { callId, err });
    return NextResponse.json(
      { error: 'Failed to generate recording URL' },
      { status: 500 }
    );
  }
}
