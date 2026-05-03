"use client";
import { useState, useEffect } from 'react';
import Topbar, { ORG_UPDATED_EVENT } from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Check, Loader2, Lock, Plus, X } from 'lucide-react';
import { PLANS_LIST, MIN_CUSTOM_MINUTES, type Plan, type PlanId } from '@/lib/plans';
import { canBuyPack } from '@/lib/billing-rules';

/**
 * Plan definitions live in `lib/plans.ts` — single source of truth shared
 * between the UI, the order API, and the verify API.
 *
 * Pricing model: PURE PREPAID. Customers buy a pack of minutes once OR
 * top up by typing a custom minute count on THEIR CURRENT plan card.
 * Minutes never expire. Verify route ADDS minutes (never resets).
 *
 * Visual language for plan cards:
 *   - "Current Plan" is the only badge. Always GREEN (badge + border).
 *   - The CURRENT plan card has NO disabled "Active" button. The badge
 *     and border say "this is yours". The bottom slot is taken by the
 *     PRIMARY action a current user actually wants: "Buy more minutes".
 *   - NO decorative icons on plan cards. Generic lucide icons (rocket,
 *     lightning, building) read as "AI-generated stock pricing page".
 *     The plan name + price + features carry the meaning on their own;
 *     icons added noise without information. The data layer keeps the
 *     `icon` field on Plan in case we ever want to re-introduce it
 *     somewhere else (marketing site, comparison tables) but the
 *     billing UI ignores it.
 *   - Free plan keeps a disabled "Active by default" pill since it
 *     doesn't have the green badge.
 *   - All four cards stretch to the same height (alignItems: 'stretch'
 *     on the grid) and the action row sits at the same vertical
 *     position via marginTop: 'auto' on the bottom slot.
 *   - Top usage cards (Minutes Used / Current Pack / Minutes Remaining)
 *     all use the same green accent. Previously each card had its own
 *     color (amber / blue / green) which made the page feel busy and
 *     unfocused — three same-color stats reads as one clean dashboard.
 *
 * Payment provider: Cashfree (replaced Razorpay 2026-05-03).
 *
 * Tier rules — enforced by lib/billing-rules.ts and mirrored here:
 *   - Pack at same/higher tier: always buyable.
 *   - Pack at lower tier: locked while minutes_used < minutes_limit.
 *   - Custom-minute top-up: only on the user's CURRENT paid plan card.
 *
 * Cross-component sync:
 *   After every successful purchase we dispatch ORG_UPDATED_EVENT on
 *   `window` so the Topbar refetches and stays in sync without reload.
 */

// Brand-agnostic green used for "current plan" / "owned" treatment AND
// for the top usage stat cards. Falls back to a hard-coded hex if --green
// CSS var isn't defined in this theme.
const CURRENT_PLAN_COLOR = 'var(--green, #22c55e)';

// Quick-pick chips for common topup amounts. Always shown above the
// custom input so users can buy without typing for the common cases.
const QUICK_TOPUP_AMOUNTS = [100, 500, 1000] as const;

// Shared height for primary action buttons in the plan card grid.
const PACK_BUTTON_HEIGHT = 36;

// URLs for Cashfree's web SDK by environment. Loaded lazily on first buy.
const CASHFREE_SDK_URL: Record<string, string> = {
  sandbox: 'https://sdk.cashfree.com/js/v3/cashfree.js',
  production: 'https://sdk.cashfree.com/js/v3/cashfree.js',
};

declare global {
  interface Window { Cashfree: any; }
}

/** Lazily inject and resolve once the SDK is ready. Cached on window so we
 *  don't insert the script twice across multiple buys. */
async function loadCashfreeSdk(env: 'sandbox' | 'production'): Promise<any> {
  if (typeof window === 'undefined') throw new Error('SSR');
  if (window.Cashfree) return window.Cashfree({ mode: env });

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CASHFREE_SDK_URL[env] || CASHFREE_SDK_URL.sandbox;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
    document.body.appendChild(script);
  });
  if (!window.Cashfree) throw new Error('Cashfree SDK loaded but not on window');
  return window.Cashfree({ mode: env });
}

export default function Billing() {
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [org, setOrg] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  // Custom-minute input for the current plan's card. Single value (not a
  // map) because only one card ever shows the field at a time.
  const [customMinStr, setCustomMinStr] = useState<string>('');

  // Whether the topup panel is expanded.
  const [topupOpen, setTopupOpen] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const text = await res.text();
        if (!text) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const data = JSON.parse(text);
        if (!cancelled) {
          if (data.org) setOrg(data.org);
          setLoaded(true);
        }
      } catch (err) {
        console.error('Failed to fetch org:', err);
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /**
   * Refetch org state after a successful purchase so the UI reflects the
   * new plan/limit without a hard reload. Also fires a window event so the
   * Topbar (which has its own private fetch) refreshes its badge in sync.
   */
  const refreshOrg = async () => {
    try {
      const res = await fetch('/api/onboarding', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.org) setOrg(data.org);
    } catch (err) {
      console.error('Failed to refresh org:', err);
    } finally {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(ORG_UPDATED_EVENT));
      }
    }
  };

  /** Server-side post-payment verification. Called either after the
   *  Cashfree modal closes (live) or immediately (demo mode). */
  const verifyPayment = async (
    orderId: string,
    planId: PlanId,
    customMins: number | undefined,
    loadingKey: string,
  ) => {
    const verifyRes = await fetch('/api/billing/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        plan: planId,
        ...(customMins ? { customMinutes: customMins } : {}),
      }),
    });
    const verified = await verifyRes.json();
    if (verified.success) {
      setSuccess(loadingKey);
      setTimeout(() => setSuccess(null), 4000);
      if (customMins) {
        setCustomMinStr('');
        setTopupOpen(false);
      }
      await refreshOrg();
    } else {
      setErrorMsg(verified.error || 'Payment verification failed.');
    }
  };

  /**
   * Kick off a Cashfree checkout for either a pack purchase or a custom
   * top-up. The mode is determined by `customMins` — falsy → pack, integer
   * ≥ MIN_CUSTOM_MINUTES → custom top-up.
   */
  const handleBuy = async (planId: PlanId, customMins?: number) => {
    const loadingKey = customMins ? `custom-${planId}` : planId;
    setLoading(loadingKey);
    setErrorMsg(null);

    try {
      const orderRes = await fetch('/api/billing/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: planId,
          ...(customMins ? { customMinutes: customMins } : {}),
        }),
      });
      const order = await orderRes.json();

      if (!orderRes.ok) {
        setErrorMsg(order.error || 'Could not start payment.');
        setLoading(null);
        return;
      }

      if (order.demo) {
        await verifyPayment(order.orderId, planId, customMins, loadingKey);
        setLoading(null);
        return;
      }

      const env: 'sandbox' | 'production' =
        order.environment === 'production' ? 'production' : 'sandbox';
      const cashfree = await loadCashfreeSdk(env);

      const result = await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: '_modal',
      });

      if (result?.error) {
        setErrorMsg(result.error.message || 'Payment was not completed.');
        setLoading(null);
        return;
      }

      await verifyPayment(order.orderId, planId, customMins, loadingKey);
    } catch (err) {
      console.error('Payment error:', err);
      setErrorMsg('Payment failed. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const minutesUsed = org?.minutes_used || 0;
  const minutesLimit = org?.minutes_limit || 100;
  const minutePct = Math.min(100, (minutesUsed / Math.max(1, minutesLimit)) * 100);
  // Sentinel empty string while loading — prevents Free Trial from
  // briefly lighting up as "Current Plan" before real data arrives.
  const currentPlan = loaded ? (org?.plan || 'free').toLowerCase() : '';
  const minutesRemaining = Math.max(0, minutesLimit - minutesUsed);

  const orgState = { plan: currentPlan, minutes_used: minutesUsed, minutes_limit: minutesLimit };

  return (
    <>
      <Topbar crumbs={[{ label: 'Dashboard', href: '/app/dashboard' }, { label: 'Billing' }]} />

        <PageHeader
          title="Billing & Plans"
          subtitle="Manage your subscription and payment history"
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--bg)' }}>

          {success && (
            <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '14px 20px', color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={18} /> Payment successful! Minutes have been added to your account.
            </div>
          )}

          {errorMsg && (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '14px 20px', color: '#ef4444', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          )}

          {/* Usage — only render once we have real org data to avoid showing default values briefly.
              All three stat cards use the same green accent color so the
              top of the page reads as a calm, unified status bar instead
              of three competing dashboards. */}
          {loaded ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Minutes Used', value: minutesUsed.toLocaleString(), total: `of ${minutesLimit === 999999 ? '∞' : minutesLimit.toLocaleString()}`, pct: minutePct, color: CURRENT_PLAN_COLOR },
                { label: 'Current Pack', value: currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1), total: 'No expiry', pct: null, color: CURRENT_PLAN_COLOR },
                { label: 'Minutes Remaining', value: minutesRemaining.toLocaleString(), total: 'Top up anytime', pct: null, color: CURRENT_PLAN_COLOR },
              ].map(u => (
                <div key={u.label} className="stat-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{u.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)' }}>{u.total}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: u.color, marginBottom: 8 }}>{u.value}</div>
                  {u.pct !== null && (
                    <div className="progress"><div className="progress-fill" style={{ width: `${u.pct}%`, background: u.color }} /></div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="stat-card" style={{ minHeight: 92, opacity: 0.5 }}>
                  <div style={{ height: 14, width: '40%', background: 'var(--bg3)', borderRadius: 4, marginBottom: 12 }} />
                  <div style={{ height: 24, width: '30%', background: 'var(--bg3)', borderRadius: 4 }} />
                </div>
              ))}
            </div>
          )}

          {/* Plans */}
          <div>
            <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Plans</h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
              One-time purchase. Minutes never expire. Once you&apos;re on a paid plan, top up extra minutes anytime at your plan&apos;s rate. Powered by Cashfree.
            </p>
            {/* alignItems: 'stretch' makes all cards in the row reach the
                same height. Combined with `marginTop: 'auto'` on the
                bottom action wrapper, action elements line up across
                cards regardless of content above. */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PLANS_LIST.length}, 1fr)`, gap: 14, alignItems: 'stretch' }}>
              {PLANS_LIST.map((plan: Plan) => {
                const packLoadingKey = plan.id;
                const customLoadingKey = `custom-${plan.id}`;
                const isPackLoading = loading === packLoadingKey;
                const isCustomLoading = loading === customLoadingKey;
                const isPackSuccess = success === packLoadingKey;
                const isCustomSuccess = success === customLoadingKey;
                const isCurrent = currentPlan === plan.id;
                const borderColor = isCurrent ? CURRENT_PLAN_COLOR : 'var(--border)';

                const gate = loaded ? canBuyPack(orgState, plan.id) : { allowed: true } as const;
                const isLocked = !gate.allowed;

                const showCustomField = loaded && isCurrent && !plan.isFree;

                const customNum = customMinStr === '' ? NaN : Number(customMinStr);
                const customValid = Number.isInteger(customNum) && customNum >= MIN_CUSTOM_MINUTES;
                const customCost = customValid ? (customNum * plan.perMinPaise) / 100 : 0;

                // Pack purchase button shows on every card EXCEPT the
                // current paid card — there the bottom slot is taken by
                // the green "Buy more minutes" button instead.
                const showPackButton = !isCurrent || plan.isFree;

                return (
                  <div key={plan.id} style={{
                    background: 'var(--bg2)',
                    border: `2px solid ${borderColor}`,
                    borderRadius: 16,
                    padding: 24,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    opacity: isLocked ? 0.85 : 1,
                    boxShadow: isCurrent ? '0 0 0 4px rgba(34, 197, 94, 0.08)' : 'none',
                    minHeight: '100%',
                  }}>
                    {isCurrent && (
                      <div style={{
                        position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                        background: CURRENT_PLAN_COLOR,
                        color: 'white', borderRadius: 20,
                        padding: '3px 14px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <Check size={12} strokeWidth={3} />
                        Current Plan
                      </div>
                    )}
                    {/* Header: plan name + per-minute rate. No icon — see
                        visual language note at top of file. */}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{plan.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{plan.perMin}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 32, fontWeight: 800 }}>{plan.priceDisplay}</span>
                      <span style={{ color: 'var(--text3)', fontSize: 13 }}> {plan.isFree ? '' : 'one-time'}</span>
                    </div>
                    <div style={{
                      fontSize: 13,
                      color: 'var(--text2)',
                      padding: '8px 12px',
                      background: 'var(--bg3)',
                      borderRadius: 8,
                      fontWeight: 600,
                    }}>
                      {plan.minutesDisplay} included
                    </div>
                    {/* Features list — checkmarks use the universal --text3
                        color instead of the per-plan accent. With the
                        plan-tinted icon block gone, sticking with one
                        consistent grey checkmark across all cards keeps
                        the page calmer. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <Check size={14} color="var(--text3)" />
                          <span style={{ color: 'var(--text2)' }}>{f}</span>
                        </div>
                      ))}
                    </div>

                    {/* --- Pack purchase button (non-current cards) --- */}
                    {showPackButton && (
                      <button
                        onClick={() => loaded && !plan.isFree && !isLocked && handleBuy(plan.id)}
                        disabled={!loaded || isPackLoading || plan.isFree || isLocked}
                        style={{
                          width: '100%',
                          height: PACK_BUTTON_HEIGHT,
                          marginTop: 'auto',
                          padding: '0 12px',
                          background: !loaded ? 'var(--bg3)'
                            : isLocked ? 'var(--bg3)'
                            : isPackSuccess ? CURRENT_PLAN_COLOR
                            : plan.isFree ? 'var(--bg3)'
                            : plan.color,
                          color: !loaded ? 'var(--text2)'
                            : plan.isFree || isLocked ? 'var(--text2)'
                            : 'white',
                          border: !loaded ? '1px solid var(--border)'
                            : plan.isFree || isLocked ? '1px solid var(--border)'
                            : 'none',
                          borderRadius: 8, fontFamily: 'Inter, sans-serif',
                          fontWeight: 600, fontSize: 13,
                          lineHeight: 1,
                          cursor: (!loaded || plan.isFree || isLocked) ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          transition: 'all 0.2s',
                        }}
                      >
                        {!loaded ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /></>
                          : isPackLoading ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing...</>
                          : isPackSuccess ? <><Check size={14} /> Purchased!</>
                          : plan.isFree ? 'Active by default'
                          : isLocked ? <><Lock size={13} /> Use remaining minutes first</>
                          : `Buy ${plan.name}`}
                      </button>
                    )}

                    {/* --- "Buy more minutes" button (current paid card) --- */}
                    {showCustomField && !topupOpen && (
                      <button
                        onClick={() => setTopupOpen(true)}
                        style={{
                          width: '100%',
                          height: PACK_BUTTON_HEIGHT,
                          marginTop: 'auto',
                          padding: '0 12px',
                          background: CURRENT_PLAN_COLOR,
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 600, fontSize: 13,
                          lineHeight: 1,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          transition: 'all 0.2s',
                        }}
                      >
                        <Plus size={14} strokeWidth={2.5} />
                        Buy more minutes
                      </button>
                    )}

                    {showCustomField && topupOpen && (
                      <div style={{
                        marginTop: 'auto',
                        background: 'rgba(34, 197, 94, 0.06)',
                        border: '1px solid rgba(34, 197, 94, 0.2)',
                        borderRadius: 10,
                        padding: 12,
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        {/* Heading + close button */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Plus size={13} color={CURRENT_PLAN_COLOR} strokeWidth={2.5} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                              Buy more minutes
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>
                              · {plan.perMin}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setTopupOpen(false);
                              setCustomMinStr('');
                            }}
                            disabled={isCustomLoading}
                            aria-label="Cancel"
                            style={{
                              background: 'transparent', border: 'none',
                              color: 'var(--text3)', cursor: isCustomLoading ? 'default' : 'pointer',
                              padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: 4,
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>

                        {/* Quick-pick chips */}
                        <div style={{ display: 'flex', gap: 6 }}>
                          {QUICK_TOPUP_AMOUNTS.map(amt => {
                            const selected = customMinStr === String(amt);
                            return (
                              <button
                                key={amt}
                                onClick={() => setCustomMinStr(String(amt))}
                                disabled={isCustomLoading}
                                style={{
                                  flex: 1,
                                  height: 30,
                                  padding: '0 4px',
                                  background: selected ? CURRENT_PLAN_COLOR : 'var(--bg2)',
                                  color: selected ? 'white' : 'var(--text)',
                                  border: `1px solid ${selected ? CURRENT_PLAN_COLOR : 'var(--border)'}`,
                                  borderRadius: 6,
                                  fontSize: 12, fontWeight: 600,
                                  lineHeight: 1,
                                  cursor: isCustomLoading ? 'default' : 'pointer',
                                  fontFamily: 'inherit',
                                  transition: 'all 0.15s',
                                }}
                              >
                                {amt.toLocaleString()}
                              </button>
                            );
                          })}
                        </div>

                        {/* Custom amount input */}
                        <input
                          type="number"
                          min={MIN_CUSTOM_MINUTES}
                          step={1}
                          placeholder={`Custom (min ${MIN_CUSTOM_MINUTES})`}
                          value={customMinStr}
                          onChange={e => setCustomMinStr(e.target.value)}
                          disabled={isCustomLoading}
                          autoFocus
                          style={{
                            width: '100%', height: 32, padding: '0 10px',
                            background: 'var(--bg2)', color: 'var(--text)',
                            border: '1px solid var(--border)', borderRadius: 6,
                            fontSize: 12, fontFamily: 'Inter, sans-serif',
                            outline: 'none',
                          }}
                        />

                        {/* Live cost preview + action button */}
                        <button
                          onClick={() => customValid && handleBuy(plan.id, customNum)}
                          disabled={!customValid || isCustomLoading}
                          style={{
                            width: '100%',
                            height: PACK_BUTTON_HEIGHT,
                            padding: '0 12px',
                            background: isCustomSuccess ? CURRENT_PLAN_COLOR
                              : customValid ? CURRENT_PLAN_COLOR
                              : 'var(--bg3)',
                            color: customValid || isCustomSuccess ? 'white' : 'var(--text3)',
                            border: 'none', borderRadius: 8,
                            fontSize: 13, fontWeight: 600,
                            lineHeight: 1,
                            cursor: customValid && !isCustomLoading ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            fontFamily: 'inherit',
                            transition: 'all 0.15s',
                          }}
                        >
                          {isCustomLoading ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing...</>
                            : isCustomSuccess ? <><Check size={13} /> Minutes added</>
                            : customValid ? <>Add {customNum.toLocaleString()} min · ₹{customCost.toLocaleString('en-IN')}</>
                            : <>Pick or enter an amount</>}
                        </button>

                        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', lineHeight: 1.4 }}>
                          Minutes added instantly. Tier stays unchanged.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Enterprise CTA */}
            <div style={{
              marginTop: 16,
              padding: '16px 20px',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Need more than 2,500 minutes?</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Custom volume pricing, white-label option, dedicated infrastructure, and SLA.</div>
              </div>
              <a
                href="mailto:sales@unntangle.com?subject=uVOIZ%20Enterprise%20Inquiry"
                style={{
                  padding: '8px 14px',
                  background: 'var(--bg3)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Talk to Sales →
              </a>
            </div>
          </div>

          {/* Invoices */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>Invoice History</div>
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No invoices yet. Once you upgrade to a paid plan, your invoices will appear here.
            </div>
          </div>

        </main>
    </>
  );
}
