"use client";
import {
  LayoutDashboard, Users, Server, Shield, CreditCard, Coins, Settings, LogOut
} from 'lucide-react';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const ICON_MAP: Record<string, any> = {
  LayoutDashboard, Users, Server, Shield, CreditCard, Coins, Settings,
};

// User-facing URLs on uvoiz.unntangle.com under the /console/* zone.
// Files live at app/console/* — no middleware rewrite happens for these.
const NAV_MAIN = [
  { iconName: 'LayoutDashboard', label: 'Global Overview',  href: '/console/dashboard' },
  { iconName: 'Users',           label: 'BPO Clients',      href: '/console/clients' },
  { iconName: 'CreditCard',      label: 'Platform Billing', href: '/console/billing' },
  { iconName: 'Coins',           label: 'Credit Ledger',    href: '/console/credits' },
];

const NAV_GENERAL = [
  { iconName: 'Server',          label: 'System Health',    href: '/console/health' },
  { iconName: 'Shield',          label: 'Security & Audit', href: '/console/audit' },
  { iconName: 'Settings',        label: 'Platform Settings',href: '/console/settings' },
];

interface ConsoleSidebarProps {
  userName: string;
  userEmail: string;
}

export default function ConsoleSidebar({ userName, userEmail }: ConsoleSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  // Compute active nav item from pathname. Match exact path or nested paths.
  // The console root "/console" (no trailing path) and "/console/dashboard"
  // both light up Global Overview.
  const isActiveHref = (href: string) => {
    if (href === '/console/dashboard') {
      return pathname === '/console/dashboard'
          || pathname === '/console'
          || pathname === '/console/';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  const renderNavItem = (item: typeof NAV_MAIN[number]) => {
    const Icon = ICON_MAP[item.iconName];
    const active = isActiveHref(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={true}
        className={`nav-item ${active ? 'active' : ''}`}
      >
        {Icon && <Icon size={16} />}
        <span style={{ flex: 1 }}>{item.label}</span>
      </Link>
    );
  };

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo + workspace pill */}
      <div style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div>
            <Image
              src="/images/uVOIZ-logo.webp"
              alt="uVOIZ"
              width={80}
              height={28}
              style={{ objectFit: 'contain', height: 'auto', display: 'block' }}
              priority
            />
            <div style={{
              textAlign: 'right',
              fontSize: 7,
              color: 'var(--text3)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontFamily: 'Inter, sans-serif',
              marginTop: 2,
            }}>
              by <span style={{ fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em' }}>unntangle</span>
            </div>
          </div>
        </div>
        <div
          title="Super Admin Console"
          style={{
            width: '100%',
            background: '#ffffff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: 5,
            background: '#0f1117',
            color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, flexShrink: 0,
          }}>U</div>
          <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden', minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              uVOIZ Console
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{
        flex: 1, padding: '12px 10px',
        display: 'flex', flexDirection: 'column', gap: 1,
        overflowY: 'auto',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text3)',
          padding: '6px 10px 8px', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Platform Management
        </div>
        {NAV_MAIN.map(renderNavItem)}

        <div style={{
          fontSize: 10, fontWeight: 600, color: 'var(--text3)',
          padding: '18px 10px 8px', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          General
        </div>
        {NAV_GENERAL.map(renderNavItem)}
      </nav>

      {/* User block + version footer */}
      <div style={{ padding: 10 }}>
        {/* Version footer — small engraved label that telegraphs
            "operator infrastructure" without taking real visual weight */}
        <div style={{
          padding: '0 10px 8px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: '0.08em',
          color: 'var(--text3)',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>v1.0</span>
          <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--text3)' }} />
          <span>console</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 10,
          cursor: 'pointer', transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: '#0f1117',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {(userName || 'A').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {userName || 'Admin'}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text3)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {userEmail}
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text3)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--red-soft)';
              (e.currentTarget as HTMLElement).style.color = 'var(--red)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--text3)';
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
