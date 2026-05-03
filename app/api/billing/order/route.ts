import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import {
  createCashfreeOrder,
  buildOrderId,
  pickCustomerPhone,
} from '@/lib/cashfree';
import { PLANS, isValidPlanId } from '@/lib/plans';
import { canBuyPack, canBuyCustom, validateCustomBuy } from '@/lib/billing-rules';
import { getOrg } from '@/lib/db';

/**
 * POST /api/billing/order
 *
 * Two purchase shapes:
 *
 *   1. Pack purchase:        { plan: 'starter' | 'growth' | 'scale' }
 *      Charges plan.price (paise → rupees), credits plan.minutes.
 *      May raise the user's tier — see verify route.
 *      Subject to canBuyPack() — lower-tier packs are blocked while the
 *      user still has minutes remaining.
 *
 *   2. Custom-minute top-up: { plan: '<current plan>', customMinutes: <int ≥ 100> }
 *      Charges customMinutes × plan.perMinPaise (paise → rupees). Tier unchanged.
 *      Subject to canBuyCustom() — only allowed on the user's CURRENT
 *      paid plan. Free-tier users can't custom-buy at all.
 *
 * Returns to the client:
 *   - orderId: our merchant id
 *   - paymentSessionId: hand this to Cashfree's JS SDK to open checkout
 *   - environment: 'sandbox' | 'production' so the JS SDK loads the right mode
 *   - kind, customMinutes (echoed for the verify call)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const body = await req.json();
    const { plan, customMinutes } = body as { plan?: string; customMinutes?: unknown };

    if (!isValidPlanId(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    const planConfig = PLANS[plan];
    const isCustom = customMinutes !== undefined && customMinutes !== null;

    if (planConfig.isFree) {
      return NextResponse.json({ error: 'Free plan cannot be purchased' }, { status: 400 });
    }

    // ---- Compute amount (in rupees — Cashfree wants decimal INR) ----
    let amountRupees: number;
    let receiptKind: 'pack' | 'topup';

    if (isCustom) {
      const eligibility = canBuyCustom(org as any, plan);
      if (!eligibility.allowed) {
        const message = eligibility.reason === 'free_tier'
          ? 'Buy a pack to unlock custom top-ups.'
          : `Custom top-ups are only available on your current plan (${eligibility.currentTier}).`;
        return NextResponse.json(
          { error: message, reason: eligibility.reason, currentTier: eligibility.currentTier },
          { status: 409 },
        );
      }
      const validation = validateCustomBuy(planConfig, customMinutes);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      amountRupees = validation.amountPaise / 100;
      receiptKind = 'topup';
    } else {
      const gate = canBuyPack(org as any, plan);
      if (!gate.allowed) {
        return NextResponse.json(
          {
            error: 'Cannot downgrade while minutes remain',
            reason: gate.reason,
            minutesRemaining: gate.minutesRemaining,
            currentTier: gate.currentTier,
          },
          { status: 409 },
        );
      }
      amountRupees = planConfig.price / 100;
      receiptKind = 'pack';
    }

    // ---- Demo mode (no Cashfree credentials) ----
    // Lets dev work continue without keys. UI receives a synthetic response
    // with `demo: true` and skips the SDK launch.
    if (!process.env.CASHFREE_APP_ID) {
      return NextResponse.json({
        orderId: `demo_order_${Date.now()}`,
        paymentSessionId: 'demo_session',
        amount: amountRupees,
        currency: 'INR',
        environment: 'sandbox',
        demo: true,
        kind: receiptKind,
        ...(isCustom ? { customMinutes: Number(customMinutes) } : {}),
      });
    }

    // ---- Real Cashfree order ----
    const appBase =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    const order = await createCashfreeOrder({
      orderId: buildOrderId(String(org.id), receiptKind),
      amountRupees,
      customer: {
        customerId: String(org.id),
        phone: pickCustomerPhone((org as any).phone),
        email: session.email,
        name: session.name,
      },
      // {order_id} placeholder is replaced by Cashfree before redirect.
      returnUrl: `${appBase}/app/billing?cf_order_id={order_id}`,
      notifyUrl: `${appBase}/api/webhooks/cashfree`,
      notes: {
        org_id: String(org.id),
        plan,
        kind: receiptKind,
        ...(isCustom ? { custom_minutes: String(customMinutes) } : {}),
      },
    });

    return NextResponse.json({
      orderId: order.order_id,
      paymentSessionId: order.payment_session_id,
      amount: order.order_amount,
      currency: order.order_currency,
      environment: (process.env.CASHFREE_ENV || 'sandbox').toLowerCase(),
      kind: receiptKind,
      ...(isCustom ? { customMinutes: Number(customMinutes) } : {}),
    });
  } catch (error) {
    console.error('Billing order error:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
