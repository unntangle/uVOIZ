import { NextRequest, NextResponse } from 'next/server';
import { verifyCashfreeWebhookSignature, fetchCashfreeOrder } from '@/lib/cashfree';
import { PLANS, isValidPlanId } from '@/lib/plans';
import { resolveTierAfterPack } from '@/lib/billing-rules';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/webhooks/cashfree
 *
 * Async confirmation channel for Cashfree payments. Fires for every
 * subscribed event configured in the Cashfree dashboard — at minimum
 * PAYMENT_SUCCESS_WEBHOOK and PAYMENT_FAILED_WEBHOOK should be on.
 *
 * Why we need this on top of the verify route:
 *   The verify route runs only if the user's browser is still on the
 *   billing page when the modal closes. If they close the tab, lose
 *   network, or pay via a redirect-based UPI flow, we'd never credit
 *   them. The webhook fires server-to-server regardless and acts as the
 *   safety net.
 *
 * Idempotency:
 *   billing_events.razorpay_payment_id (legacy column name) stores the
 *   Cashfree order id. We dedupe on it — if a completed event already
 *   exists for this order, we skip crediting. So whichever of (verify
 *   route, this webhook) wins the race, the user gets credited once.
 *
 * Security:
 *   We verify the HMAC-SHA256 signature on `timestamp + raw_body`. If it
 *   doesn't match, we return 200 anyway (so Cashfree stops retrying) but
 *   take no action. Returning 4xx triggers Cashfree's retry queue and
 *   pollutes our logs.
 */
export async function POST(req: NextRequest) {
  // We need the RAW body for signature verification. Re-serializing
  // changes byte order, which would break HMAC.
  const rawBody = await req.text();
  const signature = req.headers.get('x-webhook-signature') || '';
  const timestamp = req.headers.get('x-webhook-timestamp') || '';

  if (!verifyCashfreeWebhookSignature(rawBody, signature, timestamp)) {
    console.warn('Cashfree webhook: signature verification FAILED. Ignoring.');
    return NextResponse.json({ received: true });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  const eventType: string = payload?.type || '';
  // Cashfree nests order/payment data inside `data` for v2025-* events.
  const orderId: string | undefined = payload?.data?.order?.order_id;
  const orderStatus: string | undefined =
    payload?.data?.order?.order_status || payload?.data?.payment?.payment_status;

  if (!supabaseAdmin) {
    console.warn('Cashfree webhook received but Supabase is not configured. Skipping.');
    return NextResponse.json({ received: true });
  }

  // We only act on successful payments. Failures and other events are
  // logged so they show up in audit, but we don't change org state.
  if (
    eventType !== 'PAYMENT_SUCCESS_WEBHOOK' ||
    !orderId ||
    (orderStatus && orderStatus !== 'PAID' && orderStatus !== 'SUCCESS')
  ) {
    console.log('Cashfree webhook: non-success event', { eventType, orderId, orderStatus });
    return NextResponse.json({ received: true });
  }

  // Idempotency guard — has the verify route already credited this order?
  const { data: existing } = await supabaseAdmin
    .from('billing_events')
    .select('id')
    .eq('razorpay_payment_id', orderId)
    .eq('status', 'completed')
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ received: true, alreadyCredited: true });
  }

  // Pull the order from Cashfree to get authoritative tags (org_id, plan,
  // kind, custom_minutes). Don't trust the webhook payload's metadata
  // alone — fetch ensures we're acting on the merchant-of-record state.
  let order: any;
  try {
    order = await fetchCashfreeOrder(orderId);
  } catch (err) {
    console.error('Cashfree webhook: fetchOrder failed', err);
    return NextResponse.json({ received: true });
  }

  if (order.order_status !== 'PAID') {
    return NextResponse.json({ received: true });
  }

  // order_tags carries the metadata we set during create order.
  const tags = (order.order_tags || {}) as Record<string, string>;
  const orgId = tags.org_id;
  const plan = tags.plan;
  const kind = tags.kind as 'pack' | 'topup' | undefined;
  const customMinutesRaw = tags.custom_minutes;

  if (!orgId || !isValidPlanId(plan) || !kind) {
    console.warn('Cashfree webhook: order missing tags', { orderId, tags });
    return NextResponse.json({ received: true });
  }

  // Re-fetch org for current state (tier + minutes_limit).
  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('id, plan, minutes_used, minutes_limit')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) {
    console.warn('Cashfree webhook: org not found', { orgId, orderId });
    return NextResponse.json({ received: true });
  }

  const planConfig = PLANS[plan];
  let minutesAdded: number;
  let amountRupees: number;
  let newPlanId: string;

  if (kind === 'topup') {
    const customMinutes = Number(customMinutesRaw);
    if (!Number.isInteger(customMinutes) || customMinutes <= 0) {
      console.warn('Cashfree webhook: bad custom_minutes', { customMinutesRaw, orderId });
      return NextResponse.json({ received: true });
    }
    minutesAdded = customMinutes;
    amountRupees = (customMinutes * planConfig.perMinPaise) / 100;
    newPlanId = (org as any).plan ?? plan; // tier unchanged on top-up
  } else {
    minutesAdded = planConfig.minutes;
    amountRupees = planConfig.price / 100;
    newPlanId = resolveTierAfterPack((org as any).plan ?? 'free', plan);
  }

  const currentLimit = (org as any).minutes_limit ?? 0;
  const newLimit = currentLimit + minutesAdded;

  await supabaseAdmin
    .from('organizations')
    .update({
      plan: newPlanId,
      minutes_limit: newLimit,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  await supabaseAdmin.from('billing_events').insert({
    org_id: orgId,
    type: kind,
    amount: amountRupees,
    currency: 'INR',
    razorpay_payment_id: orderId, // legacy column name
    status: 'completed',
  });

  return NextResponse.json({ received: true, credited: true });
}
