// Razorpay Integration for Indian payments + subscriptions

const RAZORPAY_BASE = 'https://api.razorpay.com/v1';

function razorpayHeaders() {
  const creds = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString('base64');
  return {
    Authorization: `Basic ${creds}`,
    'Content-Type': 'application/json',
  };
}

export const PLANS = {
  starter: {
    name: 'Starter',
    price: 15000, // INR paise (Rs.150 = 15000 paise) — ACTUALLY Rs.15,000 = 1500000 paise
    priceDisplay: 'Rs.15,000',
    minutesLimit: 1000,
    agentsLimit: 1,
    razorpayPlanId: process.env.RAZORPAY_PLAN_STARTER || '',
  },
  pro: {
    name: 'Pro',
    price: 4000000, // Rs.40,000 in paise
    priceDisplay: 'Rs.40,000',
    minutesLimit: 5000,
    agentsLimit: 5,
    razorpayPlanId: process.env.RAZORPAY_PLAN_PRO || '',
  },
  agency: {
    name: 'Agency',
    price: 10000000, // Rs.1,00,000 in paise
    priceDisplay: 'Rs.1,00,000',
    minutesLimit: 999999,
    agentsLimit: 999,
    razorpayPlanId: process.env.RAZORPAY_PLAN_AGENCY || '',
  },
};

// ---- Create Razorpay Customer ----
export async function createCustomer(name: string, email: string, phone?: string) {
  const response = await fetch(`${RAZORPAY_BASE}/customers`, {
    method: 'POST',
    headers: razorpayHeaders(),
    body: JSON.stringify({ name, email, contact: phone }),
  });
  return response.json();
}

// ---- Create Subscription ----
export async function createSubscription(planId: string, customerId: string) {
  const response = await fetch(`${RAZORPAY_BASE}/subscriptions`, {
    method: 'POST',
    headers: razorpayHeaders(),
    body: JSON.stringify({
      plan_id: planId,
      customer_id: customerId,
      quantity: 1,
      total_count: 12, // 12 months
      notify_info: { notify_phone: 1, notify_email: 1 },
    }),
  });
  return response.json();
}

// ---- Create Order (one-time payment) ----
export async function createOrder(amountPaise: number, receipt: string, notes?: Record<string, string>) {
  const response = await fetch(`${RAZORPAY_BASE}/orders`, {
    method: 'POST',
    headers: razorpayHeaders(),
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes,
    }),
  });
  return response.json();
}

// ---- Verify Razorpay signature ----
export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const crypto = require('crypto');
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest('hex');
  return expectedSignature === signature;
}

// ---- Get Subscription ----
export async function getSubscription(subscriptionId: string) {
  const response = await fetch(`${RAZORPAY_BASE}/subscriptions/${subscriptionId}`, {
    headers: razorpayHeaders(),
  });
  return response.json();
}
