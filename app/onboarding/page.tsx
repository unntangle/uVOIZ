"use client";
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Phone, ArrowRight, Check, Loader2 } from 'lucide-react';
import Image from 'next/image';

const STEPS = ['Company', 'Language', 'Plan'];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    phone: '',
    industry: 'Insurance',
    languages: ['hi'] as string[],
    plan: 'starter',
  });

  const industries = ['Insurance', 'Banking', 'Telecom', 'Healthcare', 'E-commerce', 'Real Estate', 'Other'];
  const languages = [
    { code: 'en', label: 'English', native: 'English' },
    { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
    { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
    { code: 'te', label: 'Telugu', native: 'తెలుగు' },
    { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  ];
  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: '₹15,000',
      period: '/month',
      minutes: '1,000 minutes',
      agents: '1 AI agent',
      tagline: 'Try uVOIZ on a small campaign',
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '₹40,000',
      period: '/month',
      minutes: '5,000 minutes',
      agents: '5 AI agents',
      tagline: 'For growing BPOs running multiple campaigns',
      popular: true,
    },
    {
      id: 'agency',
      name: 'Agency',
      price: '₹1,00,000',
      period: '/month',
      minutes: 'Unlimited minutes',
      agents: 'Unlimited agents',
      tagline: 'White-label for agencies & high-volume teams',
    },
  ];

  const handleFinish = async () => {
    setLoading(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      router.push('/t/dashboard');
    } catch {
      router.push('/t/dashboard');
    }
  };

  const stepHeadlines = [
    { title: 'Welcome to uVOIZ', subtitle: "Let's set up your BPO account in under 2 minutes." },
    { title: 'Languages', subtitle: 'Pick the languages your AI agents will speak. You can change this later.' },
    { title: 'Choose your plan', subtitle: 'Free for 14 days. No credit card required to start.' },
  ];
  const headline = stepHeadlines[step];

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f6f8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo (centered, with "BY UNNTANGLE" tag — matches login) */}
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
          <div>
            <Image
              src="/images/uVOIZ-logo.webp"
              alt="uVOIZ"
              width={100}
              height={34}
              style={{ objectFit: 'contain', height: 'auto', display: 'block' }}
              priority
            />
            <div style={{
              textAlign: 'right',
              fontSize: 8,
              color: 'var(--text3)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontFamily: 'Inter, sans-serif',
              marginTop: 3,
            }}>
              by <span style={{ fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em' }}>unntangle</span>
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 32,
        }}>
          {STEPS.map((label, i) => {
            const isDone = i < step;
            const isCurrent = i === step;
            const isActive = isDone || isCurrent;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? 'var(--accent)' : 'var(--bg4)',
                  color: isActive ? '#ffffff' : 'var(--text3)',
                  fontSize: 12, fontWeight: 700,
                  transition: 'all 0.2s',
                }}>
                  {isDone ? <Check size={13} /> : i + 1}
                </div>
                <span style={{
                  fontSize: 12,
                  color: isCurrent ? 'var(--text)' : 'var(--text3)',
                  fontWeight: isCurrent ? 600 : 500,
                }}>
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div style={{
                    width: 24, height: 1,
                    background: isDone ? 'var(--accent)' : 'var(--border)',
                    transition: 'background 0.2s',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Headline (matches login: 32px / 800) */}
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em', textAlign: 'center' }}>
          {headline.title}
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 28, textAlign: 'center' }}>
          {headline.subtitle}
        </p>

        {/* Step 0 — Company */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                Company Name
              </label>
              <div style={{ position: 'relative' }}>
                <Building2 size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input
                  className="input"
                  type="text"
                  placeholder="e.g. ABC BPO Solutions"
                  value={form.companyName}
                  onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))}
                  required
                  style={{ paddingLeft: 38, height: 44 }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                Business Phone
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <span style={{
                  position: 'absolute',
                  left: 38,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 14,
                  color: 'var(--text2)',
                  fontWeight: 500,
                  pointerEvents: 'none',
                }}>
                  +91
                </span>
                <input
                  className="input"
                  type="tel"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  value={form.phone}
                  onChange={e => {
                    // Strip non-digits and cap at 10 digits
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setForm(p => ({ ...p, phone: digits }));
                  }}
                  maxLength={10}
                  style={{ paddingLeft: 70, height: 44 }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                Industry
              </label>
              <Select
                value={form.industry}
                onChange={v => setForm(p => ({ ...p, industry: v }))}
                options={industries.map(i => ({ value: i, label: i }))}
              />
            </div>

            <PrimaryButton disabled={!form.companyName} onClick={() => setStep(1)} style={{ marginTop: 4 }}>
              Continue <ArrowRight size={15} />
            </PrimaryButton>
          </div>
        )}

        {/* Step 1 — Language (multi-select) */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {languages.map(lang => {
              const selected = form.languages.includes(lang.code);
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setForm(p => ({
                    ...p,
                    languages: selected
                      ? p.languages.filter(l => l !== lang.code)
                      : [...p.languages, lang.code],
                  }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'var(--accent-soft)' : '#ffffff',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Checkbox — square, with checkmark when selected */}
                  <div style={{
                    width: 18, height: 18, borderRadius: 4,
                    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border2)'}`,
                    background: selected ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.15s',
                  }}>
                    {selected && <Check size={12} color="#ffffff" strokeWidth={3} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{lang.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>{lang.native}</div>
                  </div>
                </button>
              );
            })}

            {form.languages.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>
                Select at least one language to continue.
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <SecondaryButton onClick={() => setStep(0)} style={{ flex: 1 }}>Back</SecondaryButton>
              <PrimaryButton
                disabled={form.languages.length === 0}
                onClick={() => setStep(2)}
                style={{ flex: 2 }}
              >
                Continue <ArrowRight size={15} />
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* Step 2 — Plan */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plans.map(plan => {
              const selected = form.plan === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, plan: plan.id }))}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected ? 'var(--accent-soft)' : '#ffffff',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 2,
                  }}>
                    {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{plan.name}</span>
                      {plan.popular && (
                        <span style={{
                          background: 'var(--accent)', color: '#ffffff',
                          borderRadius: 4, padding: '1px 6px',
                          fontSize: 9, fontWeight: 700,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                          Popular
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                      {plan.tagline}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {plan.minutes} · {plan.agents}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{plan.price}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{plan.period}</div>
                  </div>
                </button>
              );
            })}

            {/* Decide later — lets user skip plan selection. They get a 14-day trial by default. */}
            {(() => {
              const selected = form.plan === 'later';
              return (
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, plan: 'later' }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `1.5px dashed ${selected ? 'var(--accent)' : 'var(--border2)'}`,
                    background: selected ? 'var(--accent-soft)' : 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>
                      I'll decide later
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                      Start with a 14-day free trial. Pick a plan when you're ready.
                    </div>
                  </div>
                </button>
              );
            })()}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <SecondaryButton onClick={() => setStep(1)} disabled={loading} style={{ flex: 1 }}>Back</SecondaryButton>
              <PrimaryButton onClick={handleFinish} disabled={loading} style={{ flex: 2 }}>
                {loading ? (
                  <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Setting up...</>
                ) : (
                  <>{form.plan === 'later' ? 'Start free trial' : 'Launch uVOIZ'} <ArrowRight size={15} /></>
                )}
              </PrimaryButton>
            </div>
          </div>
        )}

        <p style={{
          fontSize: 11,
          color: 'var(--text3)',
          textAlign: 'center',
          lineHeight: 1.5,
          marginTop: 20,
          whiteSpace: 'nowrap',
        }}>
          By continuing, you agree to our{' '}
          <a href="#" style={{ color: 'var(--text2)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            Terms
          </a>
          {' '}and{' '}
          <a href="#" style={{ color: 'var(--text2)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Helpers — primary/secondary buttons + custom dropdown
// ─────────────────────────────────────────────────────────

function PrimaryButton({
  children, onClick, disabled, style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 46,
        background: disabled ? 'var(--text3)' : 'var(--text)',
        color: '#ffffff',
        border: 'none',
        borderRadius: 10,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 600,
        fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'opacity 0.15s, background 0.15s',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children, onClick, disabled, style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 46,
        background: '#ffffff',
        color: 'var(--text)',
        border: '1.5px solid var(--border)',
        borderRadius: 10,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        transition: 'background 0.15s, border-color 0.15s',
        ...style,
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg3)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)';
        }
      }}
      onMouseLeave={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.background = '#ffffff';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
        }
      }}
    >
      {children}
    </button>
  );
}

// Themed dropdown — matches the .input style + auto-flips when no room below
function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length * 38 + 12, 240);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenUpward(spaceBelow < estimatedHeight + 16 && spaceAbove > spaceBelow);
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input"
        style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingRight: 14,
          cursor: 'pointer',
          textAlign: 'left',
          borderColor: open ? 'var(--accent)' : 'var(--border)',
          color: selected ? 'var(--text)' : 'var(--text3)',
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            color: 'var(--text3)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            ...(openUpward ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
            left: 0,
            right: 0,
            background: '#ffffff',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: openUpward
              ? '0 -8px 24px rgba(15,17,23,0.10), 0 -2px 6px rgba(15,17,23,0.04)'
              : '0 8px 24px rgba(15,17,23,0.10), 0 2px 6px rgba(15,17,23,0.04)',
            padding: 5,
            zIndex: 50,
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '9px 11px',
                  background: isSelected ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--text)',
                  border: 'none',
                  borderRadius: 7,
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  fontWeight: isSelected ? 600 : 400,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)';
                }}
                onMouseLeave={e => {
                  if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span>{opt.label}</span>
                {isSelected && <Check size={14} color="var(--accent)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
