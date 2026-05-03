import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { fetchCashfreeOrder } from '@/lib/cashfree';
import { PLANS, isValidPlanId } from '@/lib/plans';
import {
  canBuyPack,
  canBuyCustom,
  validateCustomBuy,
  resolveTierAfterPack,
} from '@/lib/billing-rules';
import { getOrg } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/billing/verify
 *
 * Confirms a Cashfree payment after the JS SDK closes the checkout modal,
 * then credits the org. Cashfree differs from Razorpay in that there is no
 * client-side HMAC signature to verify — instead we re-fetch the order
 * from Cashfree's API and trust it iff `order_status === 'PAID'`.
 *
 * Two paths:
 *
 *   - Pack purchase (kind='pack'):
 *       Adds plan.minutes to minutes_limit.
 *       Tier becomes max(current, purchased) — never silently downgrades.
 *
 *   - Custom top-up (kind='topup'):
 *       Adds customMinutes to minutes_limit.
 *       Tier is UNCHANGED — custom buys never alter the user's tier.
 *
 * minutes_used is never reset — usage carries over (prepaid wallet model).
 *
 * Idempotency: this endpoint may be called more than once for the same
 * orderId (user retries, modal closes oddly, webhook beats client). We
 * dedupe by checking billing_events.razorpay_payment_id (legacy column
 * name; we store the Cashfree order id in it). If a completed event for
 * this orderId already exists, we return success without crediting again.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(session.orgId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const body = await req.json();
    const { orderId, plan, customMinutes } = body as {
      orderId: string;
      plan: string;
      customMinutes?: unknown;
    };

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }
    if (!isValidPlanId(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }
    const planConfig = PLANS[plan];
    if (planConfig.isFree) {
      return NextResponse.json({ error: 'Free plan cannot be purchased' }, { status: 400 });
    }

    // ---- Idempotency check: have we already credited this order? ----
    if (supabaseAdmin) {
      const { data: existing } = await supabaseAdmin
        .from('billing_events')
        .select('id, status')
        .eq('razorpay_payment_id', orderId)
        .eq('status', 'completed')
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ success: true, alreadyCredited: true });
      }
    }

    // ---- Demo mode short-circuit (no Cashfree creds) ----
    // The order route returns demo: true for these; verify just trusts it.
    if (!process.env.CASHFREE_APP_ID) {
      return creditOrg({
        org,
        plan,
        customMinutes,
        orderId,
        cashfreePaymentRef: 'demo',
      });
    }

    // ---- Confirm with Cashfree that the order was actually paid ----
    const order = await fetchCashfreeOrder(orderId);
    if (order.order_status !== 'PAID') {
      return NextResponse.json(
        { error: `Payment not completed (status: ${order.order_status})` },
        { status: 402 }, // Payment Required
      );
    }

    return creditOrg({
      org,
      plan,
      customMinutes,
      orderId,
      cashfreePaymentRef: String(order.cf_order_id),
    });
  } catch (error) {
    console.error('Billing verify error:', error);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 });
  }
}

/**
 * Apply minutes + tier changes and record the billing event. Shared by
 * the live and demo paths.
 *
 * Note: the column is called `razorpay_payment_id` for legacy reasons.
 * It now stores the Cashfree order id (live) or 'demo' (sandbox flow).
 * Renaming the column is a separate migration we can do later.
 */
async function creditOrg(args: {
  org: any;
  plan: string;
  customMinutes?: unknown;
  orderId: string;
  cashfreePaymentRef: string;
}) {
  const { org, plan, customMinutes, orderId, cashfreePaymentRef } = args;

  if (!isValidPlanId(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }
  const planConfig = PLANS[plan];

  const isCustom = customMinutes !== undefined && customMinutes !== null;
  const currentLimit: number = org.minutes_limit ?? 0;
  const currentPlanId: string = org.plan ?? 'free';

  let minutesAdded: number;
  let amountRupees: number;
  let newPlanId: string;
  let eventType: 'pack' | 'topup';

  if (isCustom) {
    const eligibility = canBuyCustom(org, plan);
    if (!eligibility.allowed) {
      return NextResponse.json(
        { error: 'Custom top-up not allowed on this plan', reason: eligibility.reason },
        { status: 409 },
      );
    }
    const validation = validateCustomBuy(planConfig, customMinutes);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    minutesAdded = validation.minutes;
    amountRupees = validation.amountPaise / 100;
    newPlanId = currentPlanId;
    eventType = 'topup';
  } else {
    const gate = canBuyPack(org, plan);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: 'Cannot downgrade while minutes remain', minutesRemaining: gate.minutesRemaining },
        { status: 409 },
      );
    }
    minutesAdded = planConfig.minutes;
    amountRupees = planConfig.price / 100;
    newPlanId = resolveTierAfterPack(currentPlanId, plan);
    eventType = 'pack';
  }

  const newLimit = currentLimit + minutesAdded;

  await supabaseAdmin
    .from('organizations')
    .update({
      plan: newPlanId,
      minutes_limit: newLimit,
      // minutes_used intentionally NOT reset — usage carries over.
      updated_at: new Date().toISOString(),
    })
    .eq('id', org.id);

  await supabaseAdmin.from('billing_events').insert({
    org_id: org.id,
    type: eventType,
    amount: amountRupees,
    currency: 'INR',
    razorpay_payment_id: orderId, // legacy column name; now stores Cashfree order id
    status: 'completed',
  });

  return NextResponse.json({
    success: true,
    plan: newPlanId,
    minutesLimit: newLimit,
    minutesAdded,
    kind: eventType,
    paymentRef: cashfreePaymentRef,
  });
}
