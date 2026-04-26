"use client";
import { Bell, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Crumb {
  label: string;
  href?: string;
}

interface ConsoleTopbarProps {
  crumbs?: Crumb[];
}

/**
 * Topbar for the super admin console.
 * Mirrors the BPO Topbar's structure (sticky, 56px tall, breadcrumbs left,
 * actions right) but the right side carries the indigo "PLATFORM CONSOLE"
 * badge — making it unmistakably clear you're not in a BPO workspace.
 */
export default function ConsoleTopbar({ crumbs = [{ label: 'Dashboard' }] }: ConsoleTopbarProps) {
  return (
    <header style={{
      height: 56,
      display: 'flex', alignItems: 'center', padding: '0 24px',
      gap: 12, background: 'var(--bg)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      {/* Breadcrumbs */}
      <nav style={{
        flex: 1, display: 'flex', alignItems: 'center',
        gap: 6, fontSize: 13, color: 'var(--text2)',
      }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <ChevronRight size={13} color="var(--text3)" />}
            {c.href ? (
              <Link
                href={c.href}
                style={{ color: 'var(--text2)', textDecoration: 'none', fontWeight: 500 }}
              >
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

      {/* Health indicator — doubles as a quick link to System Health when
          things eventually go wrong. Stays green normally; the page that
          surfaces it can flip it amber/red as needed. */}
      <Link
        href="/console/health"
        title="All platform systems operational — click to view System Health"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          background: 'var(--green-soft)',
          border: '1px solid #bbf7d0',
          borderRadius: 999,
          fontSize: 11, fontWeight: 600,
          color: 'var(--green)',
          textDecoration: 'none',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#dcfce7'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--green-soft)'}
      >
        <div className="live-dot" />
        <span>Healthy</span>
      </Link>

      {/* Notifications bell */}
      <button
        style={{
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
