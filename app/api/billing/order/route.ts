import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { createOrder, PLANS } from '@/lib/razorpay';
import { getOrg } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const body = await req.json();
    const { plan } = body;

    const planConfig = PLANS[plan as keyof typeof PLANS];
    if (!planConfig) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

    // Demo mode without Razorpay keys
    if (!process.env.RAZORPAY_KEY_ID) {
      return NextResponse.json({
        orderId: `demo_order_${Date.now()}`,
        amount: planConfig.price,
        currency: 'INR',
        keyId: 'rzp_test_demo',
        demo: true,
      });
    }

    const order = await createOrder(planConfig.price, `voiceai_${org.id}_${Date.now()}`, {
      orgId: org.id,
      plan,
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Billing order error:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
