import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifySignature, PLANS } from '@/lib/razorpay';
import { getOrg } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(orgId || userId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const body = await req.json();
    const { orderId, paymentId, signature, plan } = body;

    // Verify payment signature
    const isValid = verifySignature(orderId, paymentId, signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    const planConfig = PLANS[plan as keyof typeof PLANS];

    // Update org plan + minutes limit
    await supabaseAdmin
      .from('organizations')
      .update({
        plan,
        minutes_limit: planConfig.minutesLimit,
        minutes_used: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', org.id);

    // Record billing event
    await supabaseAdmin.from('billing_events').insert({
      org_id: org.id,
      type: 'subscription',
      amount: planConfig.price / 100,
      currency: 'INR',
      razorpay_payment_id: paymentId,
      status: 'completed',
    });

    return NextResponse.json({ success: true, plan, minutesLimit: planConfig.minutesLimit });
  } catch (error) {
    console.error('Billing verify error:', error);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 });
  }
}
