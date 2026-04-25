import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, createOrg } from '@/lib/db';
import { createVapiAssistant } from '@/lib/vapi';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { companyName, phone, industry, language, plan } = body;

    // Create or get org in Supabase
    const orgId = session.orgId;
    let org = await getOrg(orgId);

    if (!org) {
      org = await createOrg(orgId, companyName || session.name + ' BPO');
    }

    // Create a default AI agent for the org
    if (org && process.env.VAPI_API_KEY) {
      try {
        const defaultScript = language === 'hi'
          ? 'Namaste! Main aapko hamare special offer ke baare mein batana chahta tha...'
          : language === 'ta'
          ? 'Vanakkam! Engal special offer pattri ungaludan pesugiren...'
          : 'Hello! I am calling to share an exciting offer with you today...';

        const vapiAssistant = await createVapiAssistant({
          name: 'Default Agent',
          voice: 'Priya (Female)',
          language: language === 'hi' ? 'Hindi + English' : language === 'ta' ? 'Tamil + English' : 'English',
          personality: 'Friendly & Empathetic',
          script: defaultScript,
        });

        // Save agent to DB
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: org.id,
            name: 'Default Agent',
            voice: 'Priya (Female)',
            language: language === 'hi' ? 'Hindi + English' : 'English',
            personality: 'Friendly & Empathetic',
            script: defaultScript,
            vapiAssistantId: vapiAssistant.id,
          }),
        });
      } catch (vapiError) {
        console.error('VAPI agent creation failed (non-fatal):', vapiError);
      }
    }

    return NextResponse.json({ success: true, orgId: org?.id });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: 'Onboarding failed' }, { status: 500 });
  }
}
