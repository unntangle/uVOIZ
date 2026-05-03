import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, getAgentById, createAgent } from '@/lib/db';
import { createVapiAssistant } from '@/lib/vapi';

/**
 * Duplicate an existing assistant. Path-as-action keeps the verb
 * obvious and avoids overloading PATCH on the parent route.
 *
 * Behavior:
 *   1. Fetch source agent (org-scoped — security boundary).
 *   2. Build new name "{name} (copy)" so the user can find it in the list.
 *   3. Create a fresh VAPI assistant with the same config (so VAPI ids
 *      stay 1:1 with our rows — never share a vapi_assistant_id between
 *      two of our rows).
 *   4. Insert the new agent row, return it.
 *
 * If VAPI provisioning fails we still create the local row; the agent
 * just won't be callable until reconfigured. Same fallback as the
 * original POST /api/agents handler.
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const { id } = await ctx.params;
    const source = await getAgentById(org.id, id);
    if (!source) return NextResponse.json({ error: 'Assistant not found' }, { status: 404 });

    const newName = `${source.name || 'Assistant'} (copy)`;

    // Provision a new VAPI assistant rather than reusing the source's
    // vapi_assistant_id. Sharing the VAPI id would mean both rows control
    // the same upstream assistant — renames or deletes on one would
    // silently affect the other. One row, one VAPI id.
    let vapiAssistantId: string | undefined;
    if (process.env.VAPI_API_KEY) {
      try {
        const vapiAssistant = await createVapiAssistant({
          name: newName,
          voice: source.voice,
          language: source.language,
          personality: source.personality,
          script: source.script || '',
        });
        vapiAssistantId = vapiAssistant.id;
      } catch (e) {
        console.error('VAPI assistant duplicate failed:', e);
      }
    }

    const agent = await createAgent(org.id, {
      name: newName,
      voice: source.voice,
      language: source.language,
      personality: source.personality,
      script: source.script || '',
      vapiAssistantId,
    });

    if (!agent) {
      return NextResponse.json({ error: 'Failed to duplicate assistant' }, { status: 500 });
    }

    return NextResponse.json({ agent });
  } catch (error: any) {
    console.error('POST agent duplicate error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to duplicate assistant' }, { status: 500 });
  }
}
