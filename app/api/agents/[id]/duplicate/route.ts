import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, getAgentById, createAgent } from '@/lib/db';
import { getVoiceProvider } from '@/lib/voice-provider';

/**
 * Duplicate an existing assistant. Path-as-action keeps the verb
 * obvious and avoids overloading PATCH on the parent route.
 *
 * Behavior:
 *   1. Fetch source agent (org-scoped — security boundary).
 *   2. Build new name "{name} (copy)" so the user can find it in the list.
 *   3. Materialise a fresh upstream assistant via the configured voice
 *      provider, so the upstream id stays 1:1 with our rows. Sharing
 *      an upstream id between two of our rows would mean a rename or
 *      delete on one row silently affects the other.
 *   4. Insert the new agent row, return it.
 *
 * If upstream provisioning fails we still create the local row; the
 * agent just won't be callable until reconfigured. Same fallback as
 * the original POST /api/agents handler.
 *
 * Historical note: this route used to import createVapiAssistant from
 * lib/vapi.ts directly. After the provider-abstraction refactor that
 * shim returned `unknown` so `vapiAssistant.id` failed type checking
 * on a strict Vercel build. Migrated to getVoiceProvider() to match
 * the parent /api/agents route and get a properly typed `.id`.
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

    // Provision a new upstream assistant rather than reusing the
    // source's id. Sharing the upstream id would mean both rows
    // control the same upstream assistant — renames or deletes on
    // one would silently affect the other. One row, one upstream id.
    let vapiAssistantId: string | undefined;
    if (process.env.VAPI_API_KEY) {
      try {
        const provider = getVoiceProvider();
        const assistant = await provider.createAssistant({
          name: newName,
          voice: source.voice,
          language: source.language,
          personality: source.personality,
          script: source.script || '',
        });
        vapiAssistantId = assistant.id;
      } catch (e) {
        console.error('Voice provider assistant duplicate failed:', e);
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
