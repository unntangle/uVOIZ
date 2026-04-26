import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createVapiAssistant } from '@/lib/vapi';

/**
 * GET /api/onboarding
 * Returns the current user's organization data — used by the billing page
 * (and others) to display org name, plan, minutes_used / minutes_limit, etc.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!supabaseAdmin) {
      // No DB configured (demo mode) — return what we have from the session
      return NextResponse.json({
        org: {
          id: session.orgId,
          name: session.orgName,
          plan: session.plan,
          minutes_used: 0,
          minutes_limit: 1000,
          phone: null,
          industry: null,
          languages: ['en'],
          plan_deferred: false,
        },
      });
    }

    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', session.orgId)
      .single();

    if (error || !org) {
      // Org not found in DB (likely a demo user with no real org row).
      // Return a synthesized record from the JWT session so the UI doesn't crash.
      return NextResponse.json({
        org: {
          id: session.orgId,
          name: session.orgName,
          plan: session.plan,
          minutes_used: 0,
          minutes_limit: 1000,
          phone: null,
          industry: null,
          languages: ['en'],
          plan_deferred: false,
        },
      });
    }

    return NextResponse.json({ org });
  } catch (err) {
    console.error('GET /api/onboarding error:', err);
    return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured.' }, { status: 500 });
    }

    const body = await req.json();
    const { companyName, phone, industry, languages, plan } = body;

    // Normalize languages — array (multi-select) or single string (legacy)
    const languageList: string[] = Array.isArray(languages)
      ? languages
      : typeof languages === 'string' && languages
      ? [languages]
      : ['en'];
    // The first selected language is the "primary" — used for the default agent.
    const primaryLanguage = languageList[0] || 'en';

    // "Decide later" — keep the user on the default trial plan but flag that they haven't chosen.
    const planDeferred = plan === 'later';
    const effectivePlan = planDeferred ? 'starter' : (plan || 'starter');

    // Update the org with the real company name + onboarding metadata
    if (companyName && session.orgId) {
      await supabaseAdmin
        .from('organizations')
        .update({
          name: companyName,
          phone: phone || null,
          industry: industry || null,
          languages: languageList,
          plan: effectivePlan,
          plan_deferred: planDeferred,
        })
        .eq('id', session.orgId);

      // Update the user's display name to the company name (was email-prefix placeholder)
      await supabaseAdmin
        .from('users')
        .update({ name: companyName })
        .eq('id', session.id);
    }

    // Create a default AI agent for the org (best effort — non-fatal if VAPI is not configured)
    if (process.env.VAPI_API_KEY && session.orgId) {
      try {
        const defaultScript =
          primaryLanguage === 'hi'
            ? 'Namaste! Main aapko hamare special offer ke baare mein batana chahta tha...'
            : primaryLanguage === 'ta'
            ? 'Vanakkam! Engal special offer pattri ungaludan pesugiren...'
            : 'Hello! I am calling to share an exciting offer with you today...';

        const vapiAssistant = await createVapiAssistant({
          name: 'Default Agent',
          voice: 'Priya (Female)',
          language:
            primaryLanguage === 'hi'
              ? 'Hindi + English'
              : primaryLanguage === 'ta'
              ? 'Tamil + English'
              : 'English',
          personality: 'Friendly & Empathetic',
          script: defaultScript,
        });

        await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: session.orgId,
            name: 'Default Agent',
            voice: 'Priya (Female)',
            language: primaryLanguage === 'hi' ? 'Hindi + English' : 'English',
            personality: 'Friendly & Empathetic',
            script: defaultScript,
            vapiAssistantId: vapiAssistant.id,
          }),
        });
      } catch (vapiError) {
        console.error('VAPI agent creation failed (non-fatal):', vapiError);
      }
    }

    return NextResponse.json({ success: true, orgId: session.orgId });
  } catch (error) {
    console.error('Onboarding error:', error);
    return NextResponse.json({ error: 'Onboarding failed' }, { status: 500 });
  }
}
