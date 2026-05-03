import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createVapiAssistant } from '@/lib/vapi';
import { isValidPlanId, PLANS } from '@/lib/plans';

/**
 * GET /api/onboarding
 * Returns the current user's organization data — used by the billing page
 * (and others) to display org name, plan, minutes_used / minutes_limit, etc.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Default fallback org for users without a real DB row (demo mode or
    // missing org). Mirrors the Free Trial plan from lib/plans.ts so the
    // synthesized values match what a real new signup would have.
    const fallbackOrg = {
      id: session.orgId,
      name: session.orgName,
      plan: session.plan || 'free',
      minutes_used: 0,
      minutes_limit: PLANS.free.minutes,
      phone: null,
      industry: null,
      languages: ['en'],
      plan_deferred: false,
    };

    if (!supabaseAdmin) {
      // No DB configured (demo mode) — return what we have from the session
      return NextResponse.json({ org: fallbackOrg });
    }

    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', session.orgId)
      .single();

    if (error || !org) {
      // Org not found in DB (likely a demo user with no real org row).
      // Return a synthesized record from the JWT session so the UI doesn't crash.
      return NextResponse.json({ org: fallbackOrg });
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

    // Plan handling at onboarding:
    //   - 'later'        → user wants to choose later, keep them on Free Trial
    //   - valid plan id  → set it as their effective plan
    //   - anything else  → fall back to Free Trial
    // Free Trial is the only plan onboarding actually grants for free.
    // Paid plans must be purchased via /app/billing — onboarding never
    // grants paid minutes without payment.
    const planDeferred = plan === 'later';
    const effectivePlan = isValidPlanId(plan) && !PLANS[plan].isFree ? plan : 'free';

    // Update the org with the real company name + onboarding metadata.
    // We only set `plan` (and matching minutes_limit) when the chosen plan
    // is the free tier — paid plans go through the Razorpay billing flow.
    if (companyName && session.orgId) {
      const update: Record<string, unknown> = {
        name: companyName,
        phone: phone || null,
        industry: industry || null,
        languages: languageList,
        plan_deferred: planDeferred,
      };
      if (effectivePlan === 'free') {
        update.plan = 'free';
        update.minutes_limit = PLANS.free.minutes;
      }

      await supabaseAdmin
        .from('organizations')
        .update(update)
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
