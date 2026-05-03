"use client";
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Crumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface TopbarProps {
  crumbs?: Crumb[];
  /**
   * Optional overrides. If not passed, Topbar fetches from /api/onboarding.
   * This means every authenticated page gets the right plan/minutes badge
   * without needing to pass props.
   */
  minutesUsed?: number;
  minutesLimit?: number;
  plan?: string;
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free Trial',
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  enterprise: 'Enterprise',
  // Legacy values from older DB rows
  pro: 'Growth',
  agency: 'Scale',
};

export default function Topbar({
  crumbs = [{ label: 'Dashboard' }],
  minutesUsed: minutesUsedProp,
  minutesLimit: minutesLimitProp,
  plan: planProp,
}: TopbarProps) {
  // Self-fetch org data so the badge stays accurate everywhere
  const [org, setOrg] = useState<{ plan?: string; minutes_used?: number; minutes_limit?: number } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // If parent provided all values, skip the fetch
    if (planProp && minutesUsedProp != null && minutesLimitProp != null) {
      setLoaded(true);
      return;
    }

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
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [planProp, minutesUsedProp, minutesLimitProp]);

  const minutesUsed = minutesUsedProp ?? org?.minutes_used ?? 0;
  const minutesLimit = minutesLimitProp ?? org?.minutes_limit ?? 0;
  const planRaw = (planProp ?? org?.plan ?? 'free').toLowerCase();
  const planLabel = PLAN_LABELS[planRaw] || planRaw.charAt(0).toUpperCase() + planRaw.slice(1);

  const remaining = minutesLimit === 999999
    ? '∞'
    : Math.max(0, minutesLimit - minutesUsed).toLocaleString();

  return (
    <header style={{
      height: 56,
      display: 'flex', alignItems: 'center', padding: '0 24px',
      gap: 16, background: 'var(--bg)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      {/* Breadcrumbs */}
      <nav style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)' }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <ChevronRight size={13} color="var(--text3)" />}
            {c.onClick ? (
              <button
                onClick={c.onClick}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text2)', textDecoration: 'none', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
              >
                {c.label}
              </button>
            ) : c.href ? (
              <Link href={c.href} style={{ color: 'var(--text2)', textDecoration: 'none', fontWeight: 500 }}>
                {c.label}
              </Link>
            ) : (
              <span style={{
                color: i === crumbs.length - 1 ? 'var(--text)' : 'var(--text2)',
                fontWeight: i === crumbs.length - 1 ? 600 : 500,
              }}>
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Plan / minutes pill — hidden until we have real data to avoid 0-flash */}
      {loaded && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--amber-soft)', border: '1px solid #fde68a',
          borderRadius: 999, padding: '5px 12px',
          fontSize: 12, fontWeight: 600, color: 'var(--amber)',
        }}
          title={`${minutesUsed.toLocaleString()} / ${minutesLimit === 999999 ? '∞' : minutesLimit.toLocaleString()} minutes used · ${planLabel} pack`}
        >
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>{planLabel}</span>
          <span style={{ width: 1, height: 10, background: '#fcd34d' }} />
          <span>{remaining} min left</span>
        </div>
      )}

      {/* Notifications — hidden for v1. Re-add when there are real events to notify
          users about (campaign completed, low credits, agent paused, etc.). */}
    </header>
  );
}
