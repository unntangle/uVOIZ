import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, getCampaignById, updateCampaign, deleteCampaign } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Single-campaign CRUD for the CampaignCard's three-dot menu
 * (Rename, Delete) and the Start/Pause buttons on the card and detail
 * view. Duplicate is at /api/campaigns/[id]/duplicate.
 *
 * Auth pattern matches /api/agents/[id]/route.ts — session check + org
 * scoping in every WHERE clause.
 */

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Status values the UI is allowed to set via PATCH. We deliberately
 * exclude 'completed' here — that transition is owned by the system
 * (the dialer cron flips a campaign to 'completed' when its contact
 * queue drains). Letting the UI set it would mean a user could mark a
 * still-running campaign as "done" and confuse the worker.
 */
const ALLOWED_STATUS_TRANSITIONS = new Set(['active', 'paused', 'draft']);

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const { id } = await ctx.params;
    const body = await req.json();

    // Both fields are optional — the same endpoint serves rename
    // (name only) and Start/Pause (status only). At least one must be
    // present so we don't issue a no-op UPDATE.
    const updates: { name?: string; status?: string } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      updates.name = name;
    }

    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !ALLOWED_STATUS_TRANSITIONS.has(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Allowed: ${[...ALLOWED_STATUS_TRANSITIONS].join(', ')}` },
          { status: 400 }
        );
      }
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // Guard: a campaign cannot be activated until it has at least one
    // contact. The dialer cron has nothing to do for a 0-contact
    // campaign, so flipping status → 'active' would create a row that
    // looks running but never makes a call — a confusing dead state
    // for the user. The UI disables the Start button in this case but
    // we re-check on the server because UI guards are easily bypassed
    // (curl, scripted clients, stale tabs after a contact was deleted).
    //
    // Symmetric rule for 'paused': a paused campaign with 0 contacts is
    // also a dead state — nothing to resume to. Rather than 400'ing,
    // we silently coerce paused→0 → 'draft', because the user's
    // intent ("stop running") is preserved and 'draft' is the correct
    // resting state for an unconfigured campaign.
    //
    // We count from the contacts table directly rather than reading
    // campaigns.total_contacts, because that column is a denormalized
    // counter maintained by application code and could drift. A HEAD
    // count is one indexed query and stays correct under any path.
    if ((updates.status === 'active' || updates.status === 'paused') && supabaseAdmin) {
      const { count, error: countError } = await supabaseAdmin
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('campaign_id', id);

      if (countError) {
        console.error('PATCH campaign: contact count failed', countError);
        return NextResponse.json({ error: 'Failed to verify campaign contacts' }, { status: 500 });
      }
      if (!count || count === 0) {
        if (updates.status === 'active') {
          return NextResponse.json(
            { error: 'Upload at least one contact before starting this campaign.' },
            { status: 400 }
          );
        }
        // paused + 0 contacts → coerce to draft. This is the only legal
        // resting state for a campaign with no work to do.
        updates.status = 'draft';
      }
    }

    const updated = await updateCampaign(org.id, id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ campaign: updated });
  } catch (error: any) {
    console.error('PATCH campaign error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const { id } = await ctx.params;
    const result = await deleteCampaign(org.id, id);

    if (!result.ok) {
      // 23503 = foreign_key_violation. Calls or other rows still reference
      // this campaign and the schema doesn't cascade. Surface a 409 so
      // the UI can explain why deletion is blocked.
      if (result.error === '23503') {
        return NextResponse.json(
          { error: 'This campaign has call history and cannot be deleted. Archive it instead.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('DELETE campaign error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const { id } = await ctx.params;
    const campaign = await getCampaignById(org.id, id);
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('GET campaign by id error:', error?.message);
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}
