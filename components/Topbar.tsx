"use client";
import { Bell, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Crumb {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface TopbarProps {
  crumbs?: Crumb[];
  minutesUsed?: number;
  minutesLimit?: number;
  plan?: string;
}

export default function Topbar({
  crumbs = [{ label: 'Dashboard' }],
  minutesUsed = 0,
  minutesLimit = 1000,
  plan = 'Starter',
}: TopbarProps) {
  const remaining = minutesLimit === 999999 ? '∞' : (minutesLimit - minutesUsed).toLocaleString();

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

      {/* Credits / minutes pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--amber-soft)', border: '1px solid #fde68a',
        borderRadius: 999, padding: '5px 12px',
        fontSize: 12, fontWeight: 600, color: 'var(--amber)',
      }}
        title={`${minutesUsed.toLocaleString()} / ${minutesLimit === 999999 ? '∞' : minutesLimit.toLocaleString()} minutes used · ${plan} plan`}
      >
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.85 }}>{plan}</span>
        <span style={{ width: 1, height: 10, background: '#fcd34d' }} />
        <span>{remaining} min left</span>
      </div>

      {/* Notifications */}
      <button style={{
        position: 'relative',
        width: 34, height: 34, borderRadius: 8,
        background: 'var(--bg3)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
      >
        <Bell size={15} color="var(--text2)" />
        <span style={{
          position: 'absolute', top: 6, right: 6, width: 7, height: 7,
          background: 'var(--red)', borderRadius: '50%',
          border: '1.5px solid var(--bg3)',
        }} />
      </button>
    </header>
  );
}
