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
 *   The verify route and this webhook can race for the SAME order. We
 *   rely on a UNIQUE INDEX on billing_events.cf_payment_id to make the
 *   DB itself reject the second insert. Whichever caller wins the insert
 *   credits the org; the loser gets a 23505 unique_violation and exits.
 *
 *   Order of operations matters: insert event FIRST, then update org.
 *   Reversing this opens the same race we just closed.
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

  // ---- Step 1: Try to claim this order via insert ----
  // UNIQUE INDEX on cf_payment_id means concurrent verify+webhook callers
  // race here, and only one wins. See verify route docstring for the full
  // reasoning.
  const { error: insertError } = await supabaseAdmin
    .from('billing_events')
    .insert({
      org_id: orgId,
      type: kind,
      amount: amountRupees,
      currency: 'INR',
      cf_payment_id: orderId,
      status: 'completed',
    });

  if (insertError) {
    if ((insertError as any).code === '23505') {
      // Verify route already credited this order. Nothing to do.
      return NextResponse.json({ received: true, alreadyCredited: true });
    }
    console.error('Cashfree webhook: insert failed', insertError);
    return NextResponse.json({ received: true });
  }

  // ---- Step 2: We claimed it — apply minutes + tier change ----
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

  return NextResponse.json({ received: true, credited: true });
}
