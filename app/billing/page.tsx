"use client";
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Check, Zap, Building2, Rocket, Loader2 } from 'lucide-react';

const PLANS = [
  { id: 'starter', name: 'Starter', price: 15000, priceDisplay: 'Rs.15,000', minutes: '1,000 min', agents: '1 agent', features: ['1 AI Agent', '1,000 minutes/month', 'Hindi + English', 'Basic analytics', 'Email support'], color: 'var(--text2)', icon: Rocket, current: false },
  { id: 'pro', name: 'Pro', price: 40000, priceDisplay: 'Rs.40,000', minutes: '5,000 min', agents: '5 agents', features: ['5 AI Agents', '5,000 minutes/month', 'All Indian languages', 'Advanced analytics', 'CRM integration', 'Priority support', 'Call recordings'], color: 'var(--accent)', icon: Zap, current: true },
  { id: 'agency', name: 'Agency', price: 100000, priceDisplay: 'Rs.1,00,000', minutes: 'Unlimited', agents: 'Unlimited', features: ['Unlimited Agents', 'Unlimited minutes', 'White-label', 'Custom domain', 'Dedicated support', 'SLA guarantee', 'API access'], color: 'var(--amber)', icon: Building2, current: false },
];

const INVOICES = [
  { id: 'INV-001', date: 'Mar 2024', amount: 40000, status: 'paid' },
  { id: 'INV-002', date: 'Feb 2024', amount: 40000, status: 'paid' },
  { id: 'INV-003', date: 'Jan 2024', amount: 15000, status: 'paid' },
];

declare global {
  interface Window { Razorpay: any; }
}

export default function Billing() {
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [org, setOrg] = useState<any>(null);

  useEffect(() => {
    fetch('/api/onboarding')
      .then(res => res.json())
      .then(data => {
        if (data.org) setOrg(data.org);
      })
      .catch(err => console.error('Failed to fetch org:', err));
  }, []);

  const handleUpgrade = async (planId: string, planPrice: number) => {
    setLoading(planId);
    try {
      // Create Razorpay order
      const orderRes = await fetch('/api/billing/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const order = await orderRes.json();

      if (order.demo) {
        setSuccess(planId);
        setTimeout(() => setSuccess(null), 3000);
        setLoading(null);
        return;
      }

      // Load Razorpay script dynamically
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        document.body.appendChild(script);
        await new Promise(resolve => script.onload = resolve);
      }

      // Open Razorpay checkout
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'uVOIZ',
        description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
        order_id: order.orderId,
        theme: { color: '#0AB4F5' },
        handler: async (response: any) => {
          // Verify payment
          const verifyRes = await fetch('/api/billing/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: order.orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              plan: planId,
            }),
          });
          const verified = await verifyRes.json();
          if (verified.success) {
            setSuccess(planId);
            setTimeout(() => setSuccess(null), 4000);
          }
        },
      });
      rzp.open();
    } catch (err) {
      console.error('Payment error:', err);
    } finally {
      setLoading(null);
    }
  };

  const minutesUsed = org?.minutes_used || 0;
  const minutesLimit = org?.minutes_limit || 1000;
  const minutePct = Math.min(100, (minutesUsed / minutesLimit) * 100);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/billing" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Billing' }]} />

        <PageHeader
          title="Billing & Plans"
          subtitle="Manage your subscription and payment history"
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--bg)' }}>

          {success && (
            <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '14px 20px', color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={18} /> Payment successful! Your plan has been upgraded to {success}.
            </div>
          )}

          {/* Usage */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Minutes Used', value: minutesUsed.toLocaleString(), total: minutesLimit === 999999 ? '∞' : minutesLimit.toLocaleString(), pct: minutePct, color: 'var(--amber)' },
              { label: 'Active Plan', value: (org?.plan || 'Starter').toUpperCase(), total: 'Billing: Monthly', pct: null, color: 'var(--accent)' },
              { label: 'Active Agents', value: '3', total: 'Limit: 5', pct: 60, color: 'var(--cyan)' },
              { label: 'Next Billing', value: 'Apr 1, 2024', total: 'Auto-renewal', pct: null, color: 'var(--green)' },
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

          {/* Plans */}
          <div>
            <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Plans</h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>Powered by Razorpay · UPI, Cards, Net Banking accepted · uVOIZ</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {PLANS.map(plan => {
                const Icon = plan.icon;
                const isLoading = loading === plan.id;
                const isSuccess = success === plan.id;
                return (
                  <div key={plan.id} style={{ background: 'var(--bg2)', border: `2px solid ${plan.current ? plan.color : 'var(--border)'}`, borderRadius: 16, padding: 24, position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {plan.current && (
                      <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: 'white', borderRadius: 20, padding: '3px 14px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        Current Plan
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={20} color={plan.color} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>{plan.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{plan.minutes} · {plan.agents}</div>
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: 32, fontWeight: 800 }}>{plan.priceDisplay}</span>
                      <span style={{ color: 'var(--text3)', fontSize: 13 }}> / month</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <Check size={14} color={plan.color} />
                          <span style={{ color: 'var(--text2)' }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => !plan.current && handleUpgrade(plan.id, plan.price)}
                      disabled={plan.current || isLoading}
                      style={{
                        width: '100%', justifyContent: 'center', padding: '12px',
                        background: plan.current ? 'var(--bg3)' : isSuccess ? 'var(--green)' : plan.color,
                        color: plan.current ? 'var(--text2)' : 'white',
                        border: 'none', borderRadius: 10, fontFamily: 'Inter, sans-serif',
                        fontWeight: 600, fontSize: 14, cursor: plan.current ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                      }}
                    >
                      {isLoading ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing...</>
                        : isSuccess ? <><Check size={16} /> Upgraded!</>
                        : plan.current ? 'Current Plan'
                        : `Upgrade to ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invoices */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>Invoice History</div>
            <table className="table">
              <thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {INVOICES.map(inv => (
                  <tr key={inv.id}>
                    <td className="mono">{inv.id}</td>
                    <td>{inv.date}</td>
                    <td style={{ fontWeight: 600 }}>Rs.{inv.amount.toLocaleString()}</td>
                    <td><span className="badge badge-green">{inv.status}</span></td>
                    <td><button className="btn btn-ghost btn-sm">Download PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </main>
      </div>
    </div>
  );
}
