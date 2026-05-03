"use client";
import { useState, useEffect } from 'react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Check, Zap, Building2, Rocket, Loader2, Sparkles, Lock } from 'lucide-react';
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
 * Payment provider: Cashfree (replaced Razorpay 2026-05-03).
 *   - The order route returns a `paymentSessionId` from Cashfree.
 *   - The Cashfree JS SDK is loaded lazily from sdk.cashfree.com and
 *     opens a Drop-in modal on `cashfree.checkout(...)`.
 *   - Unlike Razorpay there's no client signature; verify re-fetches the
 *     order from Cashfree and trusts `order_status === 'PAID'`.
 *
 * Tier rules — enforced by lib/billing-rules.ts and mirrored here:
 *   - Pack at same/higher tier: always buyable.
 *   - Pack at lower tier: locked while minutes_used < minutes_limit. Once
 *     all minutes are consumed, the lock lifts.
 *   - Custom-minute top-up: only on the user's CURRENT paid plan card.
 *     Free users see no custom-buy field — must buy a pack first.
 */

// Map icon names from plan config to lucide-react components.
const ICON_MAP = { Sparkles, Rocket, Zap, Building2 } as const;

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding');
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

  // Refetch org state after a successful purchase so the UI reflects the
  // new plan/limit without a hard reload.
  const refreshOrg = async () => {
    try {
      const res = await fetch('/api/onboarding');
      if (!res.ok) return;
      const data = await res.json();
      if (data.org) setOrg(data.org);
    } catch (err) {
      console.error('Failed to refresh org:', err);
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
      if (customMins) setCustomMinStr('');
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
      // 1. Server-side: create order with Cashfree, get payment_session_id.
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
        // Surface server-side rule errors (e.g. downgrade lock, free tier).
        setErrorMsg(order.error || 'Could not start payment.');
        setLoading(null);
        return;
      }

      // 2. Demo mode (no Cashfree credentials) — simulate success.
      if (order.demo) {
        await verifyPayment(order.orderId, planId, customMins, loadingKey);
        setLoading(null);
        return;
      }

      // 3. Load the Cashfree JS SDK and open the checkout modal.
      const env: 'sandbox' | 'production' =
        order.environment === 'production' ? 'production' : 'sandbox';
      const cashfree = await loadCashfreeSdk(env);

      // 4. Open Drop-in. `redirectTarget: '_modal'` keeps the user on this
      //    page; `_self` would redirect away. Drop-in resolves the promise
      //    once the modal closes — successful or not.
      const result = await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: '_modal',
      });

      if (result?.error) {
        // User cancelled or payment failed in the modal. The order id is
        // still valid; we don't credit anything here.
        setErrorMsg(result.error.message || 'Payment was not completed.');
        setLoading(null);
        return;
      }

      // 5. Modal closed without error — confirm with our server, which
      //    re-fetches the order from Cashfree's API.
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
  const currentPlan = (org?.plan || 'free').toLowerCase();
  const minutesRemaining = Math.max(0, minutesLimit - minutesUsed);

  // Org snapshot used by the rule helpers. Mirrors the API view.
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

          {/* Usage — only render once we have real org data to avoid showing default values briefly */}
          {loaded ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Minutes Used', value: minutesUsed.toLocaleString(), total: `of ${minutesLimit === 999999 ? '∞' : minutesLimit.toLocaleString()}`, pct: minutePct, color: 'var(--amber)' },
                { label: 'Current Pack', value: currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1), total: 'No expiry', pct: null, color: 'var(--accent)' },
                { label: 'Minutes Remaining', value: minutesRemaining.toLocaleString(), total: 'Top up anytime', pct: null, color: 'var(--green)' },
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
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PLANS_LIST.length}, 1fr)`, gap: 14 }}>
              {PLANS_LIST.map((plan: Plan) => {
                const Icon = ICON_MAP[plan.icon];
                const packLoadingKey = plan.id;
                const customLoadingKey = `custom-${plan.id}`;
                const isPackLoading = loading === packLoadingKey;
                const isCustomLoading = loading === customLoadingKey;
                const isPackSuccess = success === packLoadingKey;
                const isCustomSuccess = success === customLoadingKey;
                const isCurrent = currentPlan === plan.id;
                const borderColor = isCurrent ? plan.color : plan.popular ? plan.color : 'var(--border)';

                // Downgrade lock check (only relevant once we have org data).
                const gate = loaded ? canBuyPack(orgState, plan.id) : { allowed: true } as const;
                const isLocked = !gate.allowed;

                // Custom field shows only on the user's CURRENT card, and only
                // if that current plan is paid. Free trial gets no custom field.
                const showCustomField = loaded && isCurrent && !plan.isFree;

                // Custom input — single shared state, only one card uses it.
                const customNum = customMinStr === '' ? NaN : Number(customMinStr);
                const customValid = Number.isInteger(customNum) && customNum >= MIN_CUSTOM_MINUTES;
                const customCost = customValid ? (customNum * plan.perMinPaise) / 100 : 0;

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
                  }}>
                    {(isCurrent || plan.popular) && (
                      <div style={{
                        position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                        background: plan.color, color: 'white', borderRadius: 20,
                        padding: '3px 14px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                      }}>
                        {isCurrent ? 'Current Plan' : 'Most Popular'}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={20} color={plan.color} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{plan.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{plan.perMin}</div>
                      </div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <Check size={14} color={plan.color} />
                          <span style={{ color: 'var(--text2)' }}>{f}</span>
                        </div>
                      ))}
                    </div>

                    {/* --- Pack purchase button --- */}
                    <button
                      onClick={() => !isCurrent && !plan.isFree && !isLocked && handleBuy(plan.id)}
                      disabled={isCurrent || isPackLoading || plan.isFree || isLocked}
                      style={{
                        width: '100%', justifyContent: 'center', padding: '12px',
                        background: isCurrent || isLocked ? 'var(--bg3)' : isPackSuccess ? 'var(--green)' : plan.isFree ? 'var(--bg3)' : plan.color,
                        color: isCurrent || plan.isFree || isLocked ? 'var(--text2)' : 'white',
                        border: plan.isFree || isLocked ? '1px solid var(--border)' : 'none',
                        borderRadius: 10, fontFamily: 'Inter, sans-serif',
                        fontWeight: 600, fontSize: 14,
                        cursor: (isCurrent || plan.isFree || isLocked) ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                      }}
                    >
                      {isPackLoading ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing...</>
                        : isPackSuccess ? <><Check size={16} /> Purchased!</>
                        : isCurrent ? 'Current Pack'
                        : plan.isFree ? 'Active by default'
                        : isLocked ? <><Lock size={14} /> Use remaining minutes first</>
                        : `Buy ${plan.name}`}
                    </button>

                    {/* --- Custom-minute top-up — current paid plan only --- */}
                    {showCustomField && (
                      <div style={{
                        borderTop: '1px dashed var(--border)',
                        paddingTop: 14,
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>
                          Top up extra minutes at {plan.perMin}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="number"
                            min={MIN_CUSTOM_MINUTES}
                            step={1}
                            placeholder={`Min ${MIN_CUSTOM_MINUTES}`}
                            value={customMinStr}
                            onChange={e => setCustomMinStr(e.target.value)}
                            style={{
                              flex: 1, minWidth: 0, padding: '8px 10px',
                              background: 'var(--bg3)', color: 'var(--text)',
                              border: '1px solid var(--border)', borderRadius: 8,
                              fontSize: 13, fontFamily: 'Inter, sans-serif',
                            }}
                          />
                          <button
                            onClick={() => customValid && handleBuy(plan.id, customNum)}
                            disabled={!customValid || isCustomLoading}
                            style={{
                              padding: '8px 12px',
                              background: isCustomSuccess ? 'var(--green)' : customValid ? plan.color : 'var(--bg3)',
                              color: customValid || isCustomSuccess ? 'white' : 'var(--text3)',
                              border: 'none', borderRadius: 8,
                              fontSize: 13, fontWeight: 600,
                              cursor: customValid && !isCustomLoading ? 'pointer' : 'default',
                              whiteSpace: 'nowrap',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            {isCustomLoading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                              : isCustomSuccess ? <><Check size={14} /> Done</>
                              : customValid ? `Buy · ₹${customCost.toLocaleString('en-IN')}`
                              : 'Buy'}
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          Minutes added to your balance. Tier stays unchanged.
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
                  padding: '10px 16px',
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
