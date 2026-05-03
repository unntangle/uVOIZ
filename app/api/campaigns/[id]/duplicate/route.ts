import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, getCampaignById, createCampaign } from '@/lib/db';

/**
 * Duplicate an existing campaign.
 *
 * Behavior:
 *   - Source row is fetched org-scoped (security boundary).
 *   - New row gets "{name} (copy)" appended so the user can find it.
 *   - The duplicate is a fresh draft — no contacts copied, no call
 *     history. The user re-uploads contacts (or skips that step) once
 *     they're inside the new campaign. We could copy contacts too,
 *     but that risks duplicate dialing of real numbers, which is the
 *     kind of mistake a user can't undo. Better to make the duplicate
 *     start clean.
 *
 * Notes:
 *   - The source row's `agents(name)` join produces a nested object that
 *     createCampaign doesn't accept. We pass the raw agent_id from the
 *     source row instead.
 *   - room_type comes back snake_case from the join, but createCampaign
 *     takes camelCase roomType. We map between them here.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const { id } = await ctx.params;
    const source = await getCampaignById(org.id, id);
    if (!source) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const newName = `${source.name || 'Campaign'} (copy)`;

    const campaign = await createCampaign(org.id, {
      name: newName,
      agentId: source.agent_id,
      language: source.language,
      script: source.script || '',
      roomType: source.room_type || 'Sales',
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Failed to duplicate campaign' }, { status: 500 });
    }

    return NextResponse.json({ campaign });
  } catch (error: any) {
    console.error('POST campaign duplicate error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to duplicate campaign' }, { status: 500 });
  }
}
