import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, getAgents, createAgent } from '@/lib/db';
import { createVapiAssistant } from '@/lib/vapi';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ agents: [] });

    const agents = await getAgents(org.id);
    return NextResponse.json({ agents });
  } catch (error) {
    console.error('GET agents error:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const body = await req.json();

    // Create VAPI assistant
    let vapiAssistantId: string | undefined;
    if (process.env.VAPI_API_KEY) {
      try {
        const vapiAssistant = await createVapiAssistant({
          name: body.name,
          voice: body.voice,
          language: body.language,
          personality: body.personality,
          script: body.script,
        });
        vapiAssistantId = vapiAssistant.id;
      } catch (e) {
        console.error('VAPI assistant creation failed:', e);
      }
    }

    const agent = await createAgent(org.id, {
      name: body.name,
      voice: body.voice,
      language: body.language,
      personality: body.personality,
      script: body.script,
      vapiAssistantId,
    });

    if (!agent) {
      // Surface this prominently in logs — something is misconfigured if we
      // got here without an agent (Supabase insert returned null).
      console.error('Agent creation returned null — Supabase insert likely failed.');
    }

    return NextResponse.json({ agent });
  } catch (error: any) {
    console.error('POST agent error:', error?.message, error?.stack);
    return NextResponse.json({ error: 'Failed to create agent', details: error.message }, { status: 500 });
  }
}
