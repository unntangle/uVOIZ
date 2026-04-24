"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Phone, Globe, ArrowRight, Check } from 'lucide-react';

const STEPS = ['Company', 'Language', 'Plan'];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    phone: '',
    industry: 'Insurance',
    language: 'hi',
    plan: 'starter',
  });

  const industries = ['Insurance', 'Banking', 'Telecom', 'Healthcare', 'E-commerce', 'Real Estate', 'Other'];
  const languages = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'Hindi' },
    { code: 'ta', label: 'Tamil' },
    { code: 'te', label: 'Telugu' },
    { code: 'kn', label: 'Kannada' },
  ];
  const plans = [
    { id: 'starter', name: 'Starter', price: 'Rs.15,000/mo', minutes: '1,000 min', agents: '1 agent', color: 'var(--text2)' },
    { id: 'pro', name: 'Pro', price: 'Rs.40,000/mo', minutes: '5,000 min', agents: '5 agents', color: 'var(--accent)', popular: true },
    { id: 'agency', name: 'Agency', price: 'Rs.1,00,000/mo', minutes: 'Unlimited', agents: 'Unlimited', color: 'var(--amber)' },
  ];

  const handleFinish = async () => {
    setLoading(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560 }}>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 40, justifyContent: 'center' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i <= step ? 'var(--accent)' : 'var(--bg4)',
                fontSize: 13, fontWeight: 700, color: i <= step ? 'white' : 'var(--text3)',
                transition: 'all 0.3s',
              }}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: 13, color: i === step ? 'var(--text)' : 'var(--text3)', fontWeight: i === step ? 600 : 400 }}>{s}</span>
              {i < STEPS.length - 1 && <div style={{ width: 32, height: 1, background: i < step ? 'var(--accent)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: 36 }}>

          {/* Step 0: Company */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 6 }}>Welcome to uVOIZ</h1>
                <p style={{ color: 'var(--text2)', fontSize: 14 }}>Let's set up your BPO account in 2 minutes</p>
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Company Name</label>
                <div style={{ position: 'relative' }}>
                  <Building2 size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input className="input" style={{ paddingLeft: 38 }} placeholder="e.g. ABC BPO Solutions" value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Business Phone</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input className="input" style={{ paddingLeft: 38 }} placeholder="+91 98765 43210" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Industry</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {industries.map(ind => (
                    <button key={ind} onClick={() => setForm(p => ({ ...p, industry: ind }))} style={{
                      padding: '7px 14px', borderRadius: 20, border: `1px solid ${form.industry === ind ? 'var(--accent)' : 'var(--border)'}`,
                      background: form.industry === ind ? 'rgba(108,99,255,0.15)' : 'var(--bg3)',
                      color: form.industry === ind ? 'var(--accent2)' : 'var(--text2)',
                      fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    }}>{ind}</button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => setStep(1)} disabled={!form.companyName} style={{ justifyContent: 'center', padding: '13px' }}>
                Continue <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 1: Language */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 6 }}>Primary Language</h1>
                <p style={{ color: 'var(--text2)', fontSize: 14 }}>Your AI agents will primarily speak in this language</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {languages.map(lang => (
                  <button key={lang.code} onClick={() => setForm(p => ({ ...p, language: lang.code }))} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 12,
                    border: `2px solid ${form.language === lang.code ? 'var(--accent)' : 'var(--border)'}`,
                    background: form.language === lang.code ? 'rgba(108,99,255,0.1)' : 'var(--bg3)',
                    cursor: 'pointer', fontFamily: 'Inter, sans-serif', textAlign: 'left',
                  }}>
                    <Globe size={18} color={form.language === lang.code ? 'var(--accent2)' : 'var(--text3)'} />
                    <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{lang.label}</span>
                    {form.language === lang.code && <Check size={16} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>You can add more languages later in Settings</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setStep(0)} style={{ flex: 1, justifyContent: 'center' }}>Back</button>
                <button className="btn btn-primary" onClick={() => setStep(2)} style={{ flex: 2, justifyContent: 'center' }}>Continue <ArrowRight size={16} /></button>
              </div>
            </div>
          )}

          {/* Step 2: Plan */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h1 style={{ fontWeight: 700, fontSize: 24, marginBottom: 6 }}>Choose Your Plan</h1>
                <p style={{ color: 'var(--text2)', fontSize: 14 }}>Start free for 14 days, no credit card needed</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plans.map(plan => (
                  <button key={plan.id} onClick={() => setForm(p => ({ ...p, plan: plan.id }))} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '16px 18px', borderRadius: 12, cursor: 'pointer',
                    border: `2px solid ${form.plan === plan.id ? plan.color : 'var(--border)'}`,
                    background: form.plan === plan.id ? `${plan.color}15` : 'var(--bg3)',
                    fontFamily: 'Inter, sans-serif', textAlign: 'left', width: '100%',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{plan.name}</span>
                        {plan.popular && <span style={{ background: plan.color, color: 'white', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600 }}>POPULAR</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{plan.minutes} · {plan.agents}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: plan.color }}>{plan.price}</div>
                    {form.plan === plan.id && <Check size={18} color={plan.color} />}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)} style={{ flex: 1, justifyContent: 'center' }}>Back</button>
                <button className="btn btn-primary" onClick={handleFinish} disabled={loading} style={{ flex: 2, justifyContent: 'center' }}>
                  {loading ? 'Setting up...' : 'Launch uVOIZ'} {!loading && <ArrowRight size={16} />}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
