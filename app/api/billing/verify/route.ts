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
 * Idempotency (the important part):
 *   This endpoint can run concurrently with the Cashfree webhook for the
 *   SAME order — verify route fires when the modal closes, webhook fires
 *   server-to-server. A naive "SELECT existing event, then INSERT if not
 *   found" pattern races: both callers SELECT empty, both INSERT, org gets
 *   credited twice.
 *
 *   The fix: a UNIQUE INDEX on billing_events.cf_payment_id (added via
 *   lib/migrations/003_billing_events_unique.sql, then renamed in
 *   lib/migrations/004_rename_payment_id_column.sql). Insert the event
 *   FIRST. If the insert wins, we credit the org. If the insert loses
 *   (Postgres returns 23505 unique_violation), we know the other caller
 *   already credited and we exit cleanly.
 *
 *   This makes the billing_events row the source of truth for "was this
 *   order credited?" instead of the org's minutes_limit, which has no
 *   uniqueness invariant of its own.
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
 * Insert the billing event first, then credit the org. The order matters —
 * see idempotency note in the route docstring.
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

  // ---- Step 1: Try to claim this order by inserting the event row ----
  // The UNIQUE INDEX on cf_payment_id means whichever concurrent caller
  // (verify route or webhook) inserts first, wins. The loser gets a
  // Postgres error code 23505 (unique_violation) and we treat that as
  // "someone already credited this order" — which is exactly what we want.
  const { error: insertError } = await supabaseAdmin
    .from('billing_events')
    .insert({
      org_id: org.id,
      type: eventType,
      amount: amountRupees,
      currency: 'INR',
      cf_payment_id: orderId,
      status: 'completed',
    });

  if (insertError) {
    // 23505 = unique_violation — the canonical "already credited" signal.
    // PostgREST surfaces it via `code: '23505'`.
    if ((insertError as any).code === '23505') {
      return NextResponse.json({
        success: true,
        alreadyCredited: true,
      });
    }
    console.error('Billing verify: failed to insert billing_event', insertError);
    return NextResponse.json({ error: 'Could not record payment' }, { status: 500 });
  }

  // ---- Step 2: We claimed the order — now apply the minutes/tier change ----
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

  return NextResponse.json({
    success: true,
    plan: newPlanId,
    minutesLimit: newLimit,
    minutesAdded,
    kind: eventType,
    paymentRef: cashfreePaymentRef,
  });
}
