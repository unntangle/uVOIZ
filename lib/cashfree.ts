// ============================================
// Cashfree Payments Integration
// ============================================
//
// Plan definitions live in lib/plans.ts (single source of truth). This file
// re-exports them in the shape the API routes expect (with `minutesLimit`
// alias) and provides Cashfree HTTP helpers built on raw fetch.
//
// Why no SDK?
//   The cashfree-pg npm package has shifted its call style across major
//   versions (instance vs static methods) and pulls in axios. The PG API
//   surface we actually use is just two endpoints — Create Order and
//   Fetch Order — so a couple of typed fetch wrappers are clearer to
//   maintain than tracking SDK upgrades.
//
// Cashfree payment flow (different from Razorpay):
//   1. Server creates an order via POST /pg/orders. Response includes
//      `order_id` AND `payment_session_id`.
//   2. Client opens Cashfree Drop-in / JS SDK using `payment_session_id`.
//   3. After the user pays, Cashfree returns control to the page. Unlike
//      Razorpay, there is NO client-side HMAC signature to verify.
//   4. Server confirms the result by either:
//        a) GET /pg/orders/{order_id} → returns `order_status` ('PAID'|'ACTIVE'|...)
//        b) Receiving a webhook at /api/webhooks/cashfree (preferred for
//           reliability — fires even if the user closes the page).
//   The verify route in this app uses (a) immediately after the modal
//   closes, with the webhook as a backup safety net.
// ============================================

import { PLANS as PLAN_DEFS, type Plan, type PlanId } from './plans';

// API version is pinned. Cashfree breaks payload shape between versions
// rather than within them, so pinning gives us stable behavior.
const CASHFREE_API_VERSION = '2025-01-01';

/** Returns the right base URL for the configured environment. */
function cashfreeBaseUrl(): string {
  const env = (process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
  return env === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';
}

/** Headers required on every Cashfree API call. */
function cashfreeHeaders() {
  const clientId = process.env.CASHFREE_APP_ID;
  const clientSecret = process.env.CASHFREE_SECRET_KEY;
  if (!clientId || !clientSecret) {
    throw new Error('Cashfree credentials missing — set CASHFREE_APP_ID and CASHFREE_SECRET_KEY');
  }
  return {
    'Content-Type': 'application/json',
    'x-api-version': CASHFREE_API_VERSION,
    'x-client-id': clientId,
    'x-client-secret': clientSecret,
  };
}

// ---- Plan lookup ----
// Re-shape lib/plans.ts entries to keep `minutesLimit` available for any
// older callers. New code should prefer the `minutes` field on lib/plans.ts.
export type BillingPlan = Plan & { minutesLimit: number };

export const PLANS: Record<PlanId, BillingPlan> = Object.fromEntries(
  Object.entries(PLAN_DEFS).map(([id, p]) => [id, { ...p, minutesLimit: p.minutes }])
) as Record<PlanId, BillingPlan>;

export type { PlanId } from './plans';

// ---- Types ----

export interface CashfreeCustomer {
  /** Stable id for this customer in our system. We use the org UUID. */
  customerId: string;
  /** Required by Cashfree. Falls back to a placeholder if absent. */
  phone: string;
  email?: string;
  name?: string;
}

export interface CreateOrderInput {
  /** Our merchant-side order id. Must be unique per call. */
  orderId: string;
  /** Charge in INR rupees (NOT paise). Cashfree expects a decimal number. */
  amountRupees: number;
  customer: CashfreeCustomer;
  /** Free-form metadata stored on the order. Strings only. */
  notes?: Record<string, string>;
  /** Where Cashfree should redirect after payment. Must include {order_id}. */
  returnUrl: string;
  /** Webhook URL for async confirmation. Optional but recommended. */
  notifyUrl?: string;
}

export interface CashfreeOrder {
  order_id: string;
  cf_order_id: number;
  payment_session_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
}

// ---- Create order ----
/**
 * Create a Cashfree order. Returns the full order entity — the caller passes
 * `payment_session_id` to the JS SDK on the client to open checkout.
 */
export async function createCashfreeOrder(input: CreateOrderInput): Promise<CashfreeOrder> {
  const body = {
    order_id: input.orderId,
    order_amount: input.amountRupees,
    order_currency: 'INR',
    customer_details: {
      customer_id: input.customer.customerId,
      customer_phone: input.customer.phone,
      ...(input.customer.email ? { customer_email: input.customer.email } : {}),
      ...(input.customer.name ? { customer_name: input.customer.name } : {}),
    },
    order_meta: {
      return_url: input.returnUrl,
      ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
    },
    // order_tags are key/value strings shown in the dashboard. Useful for
    // matching a payment back to an org/plan during reconciliation.
    ...(input.notes ? { order_tags: input.notes } : {}),
  };

  const response = await fetch(`${cashfreeBaseUrl()}/orders`, {
    method: 'POST',
    headers: cashfreeHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cashfree createOrder failed: ${response.status} ${errText}`);
  }
  return response.json();
}

// ---- Fetch order (used by verify route to confirm payment) ----
/**
 * Look up an order by its merchant order id. The `order_status` field
 * tells us whether the customer actually paid:
 *   - PAID: payment captured, safe to credit the org
 *   - ACTIVE: order created but not yet paid (or in progress)
 *   - EXPIRED / TERMINATED: don't credit
 */
export async function fetchCashfreeOrder(orderId: string): Promise<CashfreeOrder & {
  order_status: 'PAID' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | string;
}> {
  const response = await fetch(`${cashfreeBaseUrl()}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: cashfreeHeaders(),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cashfree fetchOrder failed: ${response.status} ${errText}`);
  }
  return response.json();
}

// ---- Webhook signature verification ----
/**
 * Cashfree signs each webhook with HMAC-SHA256 over `timestamp + raw_body`,
 * using your client secret as the key, and Base64-encodes the result.
 *
 * We compare it against the `x-webhook-signature` header. If they match,
 * the webhook genuinely came from Cashfree and the body wasn't tampered with.
 *
 * IMPORTANT: pass the RAW request body (not JSON.parse'd), because any
 * re-serialization will change byte order and break the signature.
 */
export function verifyCashfreeWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string,
): boolean {
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!secret) return false;
  if (!signatureHeader || !timestampHeader) return false;

  const crypto = require('crypto');
  const data = timestampHeader + rawBody;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64');

  // Constant-time compare to avoid timing oracles.
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- Helpers ----

/** Cashfree requires customer_phone on order create. We prefer the org's
 *  real phone, but fall back to a sandbox-safe placeholder so the order
 *  can still be created during testing before phone is filled in. */
export function pickCustomerPhone(orgPhone: string | null | undefined): string {
  if (orgPhone && orgPhone.trim().length > 0) return orgPhone.trim();
  return '+919999999999'; // Cashfree-accepted dummy for test/sandbox
}

/** Build a merchant order id from org id + purpose + timestamp. Cashfree
 *  enforces uniqueness, so the timestamp suffix prevents collisions on
 *  rapid retries. */
export function buildOrderId(orgId: string, kind: 'pack' | 'topup'): string {
  return `uvoiz_${orgId}_${kind}_${Date.now()}`;
}
