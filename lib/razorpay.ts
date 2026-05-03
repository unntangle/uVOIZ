// ============================================
// DEPRECATED — Razorpay was replaced by Cashfree on 2026-05-03.
// All imports should now use `@/lib/cashfree` instead.
// This file is kept as an empty stub so a stale import surfaces a
// clear, named error rather than the ambiguous "module not found".
// Safe to delete once the codebase is confirmed clean.
// ============================================

const REMOVED = (name: string) =>
  `lib/razorpay.ts has been removed. \`${name}\` is no longer available. ` +
  `Update your import to use @/lib/cashfree instead.`;

export const PLANS = new Proxy({} as any, {
  get(_t, prop) { throw new Error(REMOVED(`PLANS.${String(prop)}`)); },
});

export function createOrder(): never { throw new Error(REMOVED('createOrder')); }
export function verifySignature(): never { throw new Error(REMOVED('verifySignature')); }
export function createCustomer(): never { throw new Error(REMOVED('createCustomer')); }
export function createSubscription(): never { throw new Error(REMOVED('createSubscription')); }
export function getSubscription(): never { throw new Error(REMOVED('getSubscription')); }
