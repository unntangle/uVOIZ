// ============================================
// uVOIZ Billing Rules
// ============================================
//
// Pure functions that decide whether a given purchase is allowed and what
// happens to the org afterwards. No I/O. No DB. The same rules run on the
// server (order/verify routes) and the client (billing page button states),
// so we get one source of truth for rule changes.
//
// Rules in plain English:
//   1. Tier never silently regresses on a pack purchase.
//      - You can buy your current tier or any tier above it.
//      - You can ONLY buy a lower tier if every minute you currently own
//        has been consumed (minutes_used >= minutes_limit). The intent is
//        "spend down what you paid Growth-rate for before you fall back
//        to Starter-rate."
//   2. Custom-minute top-ups (input field on the user's current plan card):
//      - Only available on the user's CURRENT paid plan. You can't top up
//        at a different tier's rate.
//      - Free trial users have no custom-buy option — they must buy a pack
//        first to establish a tier.
//      - Minimum MIN_CUSTOM_MINUTES (lib/plans.ts). No upper bound.
//      - Charged at the current plan's perMinPaise rate.
//      - Tier is NOT changed by a top-up (it's already the current tier).
// ============================================

import { PLANS, MIN_CUSTOM_MINUTES, type PlanId, type Plan } from './plans';

/** Minimum org shape these rules need. Both the API session shape and the
 *  raw DB row satisfy this. */
export interface OrgBillingState {
  plan: PlanId | string;
  minutes_used: number;
  minutes_limit: number;
}

export type DowngradeBlockReason =
  | { allowed: true }
  | { allowed: false; reason: 'minutes_remaining'; minutesRemaining: number; currentTier: PlanId };

/**
 * Can this org buy a PACK at the given target tier?
 *
 * Allowed if:
 *   - target tier ≥ current tier, OR
 *   - the org has zero remaining minutes (consumed everything).
 *
 * Blocked otherwise — they must finish their existing minutes first.
 */
export function canBuyPack(org: OrgBillingState, targetPlan: PlanId): DowngradeBlockReason {
  const target = PLANS[targetPlan];
  const currentId = (org.plan in PLANS ? org.plan : 'free') as PlanId;
  const current = PLANS[currentId];

  // Same or higher tier — always allowed.
  if (target.tierRank >= current.tierRank) return { allowed: true };

  // Lower tier — only if the wallet is empty.
  const remaining = Math.max(0, (org.minutes_limit ?? 0) - (org.minutes_used ?? 0));
  if (remaining <= 0) return { allowed: true };

  return {
    allowed: false,
    reason: 'minutes_remaining',
    minutesRemaining: remaining,
    currentTier: currentId,
  };
}

export type CustomBuyEligibility =
  | { allowed: true }
  | { allowed: false; reason: 'free_tier' | 'wrong_plan'; currentTier: PlanId };

/**
 * Can this org perform a custom-minute top-up against the given plan card?
 *
 * Custom buys are only allowed on the user's own current plan. A Growth
 * user cannot use Starter's ₹10/min rate; a Free user cannot custom-buy
 * at all (they must buy a pack first).
 */
export function canBuyCustom(org: OrgBillingState, targetPlan: PlanId): CustomBuyEligibility {
  const currentId = (org.plan in PLANS ? org.plan : 'free') as PlanId;

  if (PLANS[currentId].isFree) {
    return { allowed: false, reason: 'free_tier', currentTier: currentId };
  }
  if (targetPlan !== currentId) {
    return { allowed: false, reason: 'wrong_plan', currentTier: currentId };
  }
  return { allowed: true };
}

export type CustomBuyValidation =
  | { ok: true; amountPaise: number; minutes: number }
  | { ok: false; error: string };

/**
 * Validate the AMOUNT/INTEGER side of a custom-minute top-up. Eligibility
 * (which plan card, free-tier block) is checked separately by canBuyCustom
 * because that needs the org state.
 *
 *   - Plan must be a real, non-free plan (free tier has no per-min rate).
 *   - Minutes must be a finite integer ≥ MIN_CUSTOM_MINUTES.
 *   - Amount is computed at that plan's per-minute rate, in paise.
 */
export function validateCustomBuy(plan: Plan, minutesRaw: unknown): CustomBuyValidation {
  if (plan.isFree || plan.perMinPaise <= 0) {
    return { ok: false, error: 'Custom top-ups are not available on the free plan.' };
  }
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes)) {
    return { ok: false, error: 'Minutes must be a whole number.' };
  }
  if (minutes < MIN_CUSTOM_MINUTES) {
    return { ok: false, error: `Minimum top-up is ${MIN_CUSTOM_MINUTES} minutes.` };
  }
  return {
    ok: true,
    minutes,
    amountPaise: minutes * plan.perMinPaise,
  };
}

/**
 * Resolve the post-purchase tier for a PACK purchase.
 * "Highest wins" — never silently downgrades. (canBuyPack already blocks
 * the downgrade case before we get here, but defense-in-depth.)
 */
export function resolveTierAfterPack(currentPlanId: string, purchasedPlan: PlanId): PlanId {
  const current = (currentPlanId in PLANS ? currentPlanId : 'free') as PlanId;
  return PLANS[current].tierRank >= PLANS[purchasedPlan].tierRank ? current : purchasedPlan;
}
