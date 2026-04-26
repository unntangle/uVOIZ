"use client";
import {
  LayoutDashboard, Users, Server, Shield, CreditCard, Coins, Settings, LogOut
} from 'lucide-react';
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const ICON_MAP: Record<string, any> = {
  LayoutDashboard, Users, Server, Shield, CreditCard, Coins, Settings,
};

const NAV_MAIN = [
  { iconName: 'LayoutDashboard', label: 'Global Overview',  href: '/console' },
  { iconName: 'Users',           label: 'BPO Clients',      href: '/console/clients' },
  { iconName: 'CreditCard',      label: 'Platform Billing', href: '/console/billing' },
  { iconName: 'Coins',           label: 'Credit Ledger',    href: '/console/credits' },
  { iconName: 'Server',          label: 'System Health',    href: '/console/health' },
  { iconName: 'Shield',          label: 'Security & Audit', href: '/console/audit' },
  { iconName: 'Settings',        label: 'Platform Settings',href: '/console/settings' },
];

export default function ConsoleSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: '#0B0F19',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
      color: '#fff',
    }}>
      <div style={{ padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 18, color: '#fff'
          }}>U</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
              Unntangle Console
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Super Admin
            </div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', padding: '10px 12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Platform Management
        </div>
        {NAV_MAIN.map(({ iconName, label, href }) => {
          const Icon = ICON_MAP[iconName];
          const isActive = pathname === href || (href !== '/console' && pathname.startsWith(href + '/'));
          return (
            <a key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 12px', borderRadius: 8,
              background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: isActive ? '#60a5fa' : '#94a3b8',
              textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 600 : 500,
              transition: 'all 0.2s',
            }}>
              {Icon && <Icon size={18} />}
              <span style={{ flex: 1 }}>{label}</span>
            </a>
          );
        })}
      </nav>

      <div style={{ padding: '16px' }}>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '12px', borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            cursor: 'pointer', color: '#ef4444', fontSize: 14, fontWeight: 600,
            transition: 'all 0.2s', justifyContent: 'center'
          }}
        >
          <LogOut size={16} />
          {loggingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </aside>
  );
}
