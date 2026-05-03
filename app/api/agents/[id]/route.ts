import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, getAgentById, updateAgent, deleteAgent } from '@/lib/db';

/**
 * Single-agent CRUD for the AgentCard's three-dot menu (Rename, Delete).
 * Duplicate lives at /api/agents/[id]/duplicate so the path itself
 * documents the action.
 *
 * Auth: every handler checks the session AND scopes the operation to the
 * caller's org_id. A user who guesses another tenant's UUID still can't
 * touch the row because the WHERE clause filters them out.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const { id } = await ctx.params;
    const body = await req.json();

    // Only `name` is editable from the UI right now. Voice/language/
    // personality changes would require re-creating the underlying VAPI
    // assistant, which is a bigger flow we'll do separately.
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const updated = await updateAgent(org.id, id, { name });
    if (!updated) {
      return NextResponse.json({ error: 'Assistant not found' }, { status: 404 });
    }

    return NextResponse.json({ agent: updated });
  } catch (error: any) {
    console.error('PATCH agent error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to update assistant' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const { id } = await ctx.params;
    const result = await deleteAgent(org.id, id);

    if (!result.ok) {
      // 23503 = foreign_key_violation. The agent is referenced by one or
      // more campaigns and the schema doesn't cascade. Surface a friendly
      // 409 so the UI can tell the user they need to remove the agent
      // from those campaigns first.
      if (result.error === '23503') {
        return NextResponse.json(
          { error: 'This assistant is in use by one or more campaigns. Remove it from those campaigns first.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to delete assistant' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('DELETE agent error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to delete assistant' }, { status: 500 });
  }
}

/**
 * GET on a single agent — handy for refresh-on-rename scenarios. Not
 * used by the menu directly, but cheap to provide.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const { id } = await ctx.params;
    const agent = await getAgentById(org.id, id);
    if (!agent) return NextResponse.json({ error: 'Assistant not found' }, { status: 404 });

    return NextResponse.json({ agent });
  } catch (error: any) {
    console.error('GET agent by id error:', error?.message);
    return NextResponse.json({ error: 'Failed to fetch assistant' }, { status: 500 });
  }
}
