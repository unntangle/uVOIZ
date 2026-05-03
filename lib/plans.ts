// ============================================
// uVOIZ Plans — SINGLE SOURCE OF TRUTH
// ============================================
//
// This file defines every plan exposed in the product. It is the ONLY
// place plan prices, minute allotments, and feature lists live.
//
// Consumed by:
//   - app/t/billing/page.tsx          (UI — render cards)
//   - app/api/billing/order/route.ts  (validate plan, create Razorpay order)
//   - app/api/billing/verify/route.ts (credit minutes on payment success)
//   - lib/billing-rules.ts            (downgrade lock + custom-min validation)
//   - lib/razorpay.ts                 (re-exports PLANS for backward compat)
//
// Pricing model: PURE PREPAID one-time purchase. Minutes never expire.
// Top up anytime — verify route ADDS minutes to balance, never resets.
//
// Tier rules (see lib/billing-rules.ts for enforcement):
//   - Tier never silently regresses: buying a pack tier ≥ current keeps or
//     raises the tier. Buying lower-tier packs is BLOCKED at the API + UI
//     until the user has consumed every minute they own.
//   - Custom-minute top-ups (any size ≥ MIN_CUSTOM_MINUTES) charge at the
//     selected card's per-minute rate but DO NOT change the user's tier.
//
// If you change prices/minutes here, that's the entire change. No other
// file needs to be touched. The DB `plan` CHECK constraint must include
// every id below — see lib/migrations/002_plans_alignment.sql.
// ============================================

export type PlanId = 'free' | 'starter' | 'growth' | 'scale';

export interface Plan {
  id: PlanId;
  name: string;
  /** Pack price in INR paise (Razorpay's required unit). 0 for free plan. */
  price: number;
  /** Display string for the pack price on the billing card. */
  priceDisplay: string;
  /** Minutes credited when this pack is purchased. */
  minutes: number;
  /** Display string for the minutes pill on the card. */
  minutesDisplay: string;
  /** Per-minute rate label shown under the plan name. */
  perMin: string;
  /** Per-minute rate in paise — used to price custom-minute top-ups.
   *  0 means custom buys are not allowed at this rate (free tier). */
  perMinPaise: number;
  /** Bullet list rendered on the card. */
  features: string[];
  /** CSS variable token for the card's accent color. */
  color: string;
  /** lucide-react icon name. Resolved to the component in the UI layer. */
  icon: 'Sparkles' | 'Rocket' | 'Zap' | 'Building2';
  /** Highlighted as "Most Popular" on the cards. */
  popular: boolean;
  /** Free trial — no checkout flow, no Razorpay order, no custom buys. */
  isFree: boolean;
  /** Ordering rank for tier comparisons (free=0, scale=3). Higher = richer. */
  tierRank: number;
}

/** Minimum minutes a user can purchase via the custom top-up input. */
export const MIN_CUSTOM_MINUTES = 100;

export const PLANS_LIST: Plan[] = [
  {
    id: 'free',
    name: 'Free Trial',
    price: 0,
    priceDisplay: '₹0',
    minutes: 100,
    minutesDisplay: '100 minutes',
    perMin: 'No charge',
    perMinPaise: 0,
    features: [
      '100 minutes',
      '1 AI Agent',
      'Tamil (more coming soon)',
      'Basic analytics',
      'Never expires',
    ],
    color: 'var(--green)',
    icon: 'Sparkles',
    popular: false,
    isFree: true,
    tierRank: 0,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 249900, // ₹2,499 in paise
    priceDisplay: '₹2,499',
    minutes: 250,
    minutesDisplay: '250 minutes',
    perMin: '₹10/min',
    perMinPaise: 1000, // ₹10 = 1000 paise per minute
    features: [
      '250 minutes',
      '1 AI Agent',
      'Tamil (more coming soon)',
      'Basic analytics',
      'Email support',
      'Never expires',
    ],
    color: 'var(--text2)',
    icon: 'Rocket',
    popular: false,
    isFree: false,
    tierRank: 1,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 799900, // ₹7,999 in paise
    priceDisplay: '₹7,999',
    minutes: 1000,
    minutesDisplay: '1,000 minutes',
    perMin: '₹8/min',
    perMinPaise: 800, // ₹8 = 800 paise per minute
    features: [
      '1,000 minutes',
      '3 AI Agents',
      'Tamil (more coming soon)',
      'Advanced analytics + CSV export',
      'Priority support (2-hour response)',
      'Call recordings (90-day retention)',
      'Never expires',
    ],
    color: 'var(--accent)',
    icon: 'Zap',
    popular: true,
    isFree: false,
    tierRank: 2,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 1749900, // ₹17,499 in paise
    priceDisplay: '₹17,499',
    minutes: 2500,
    minutesDisplay: '2,500 minutes',
    perMin: '₹7/min',
    perMinPaise: 700, // ₹7 = 700 paise per minute
    features: [
      '2,500 minutes',
      'Unlimited AI Agents',
      'Tamil (more coming soon)',
      'Dedicated success manager',
      '1-hour SLA support',
      'API access + webhooks',
      'Custom integrations',
      'Never expires',
    ],
    color: 'var(--amber)',
    icon: 'Building2',
    popular: false,
    isFree: false,
    tierRank: 3,
  },
];

/** Map form for O(1) lookup by plan id (used in API routes). */
export const PLANS: Record<PlanId, Plan> = PLANS_LIST.reduce(
  (acc, plan) => {
    acc[plan.id] = plan;
    return acc;
  },
  {} as Record<PlanId, Plan>
);

/** Type guard for runtime plan id validation in API routes. */
export function isValidPlanId(id: unknown): id is PlanId {
  return typeof id === 'string' && id in PLANS;
}

/** Convenience: get a plan or throw. */
export function getPlan(id: PlanId): Plan {
  return PLANS[id];
}
