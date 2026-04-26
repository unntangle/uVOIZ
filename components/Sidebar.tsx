"use client";
import {
  LayoutDashboard, Phone, Megaphone, Bot, BarChart3, Settings, CreditCard,
  Users, HelpCircle, LogOut
} from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { BPO_NAV, BPO_NAV_GENERAL, filterNavByRole, type Role, type NavItem } from '@/lib/permissions';

const ICON_MAP: Record<string, any> = {
  LayoutDashboard, Phone, Megaphone, Bot, BarChart3, Settings, CreditCard,
  Users, HelpCircle,
};

interface SidebarProps {
  active: string;
  orgName: string;
  userName: string;
  userEmail: string;
  role: Role;
}

export default function Sidebar({
  active,
  orgName,
  userName,
  userEmail,
  role,
}: SidebarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const mainItems = filterNavByRole(BPO_NAV, role);
  const generalItems = filterNavByRole(BPO_NAV_GENERAL, role);

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo + Workspace */}
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
        <button
          title={orgName}
          style={{
            width: '100%', background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 10px',
            display: 'flex', alignItems: 'center',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            transition: 'background 0.15s', minWidth: 0,
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {orgName}
            </div>
          </div>
        </button>
      </div>

      {/* Nav (role-filtered) */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', padding: '6px 10px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Main Menu
        </div>
        {mainItems.map((item: NavItem) => {
          const Icon = ICON_MAP[item.iconName];
          const isActive = active === item.href;
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`} prefetch={true}>
              {Icon && <Icon size={16} />}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  background: 'var(--green-soft)', color: 'var(--green)',
                  border: '1px solid #bbf7d0',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600,
                }}>{item.badge}</span>
              )}
            </Link>
          );
        })}

        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', padding: '18px 10px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          General
        </div>
        {generalItems.map((item: NavItem) => {
          const Icon = ICON_MAP[item.iconName];
          const isActive = active === item.href;
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`} prefetch={true}>
              {Icon && <Icon size={16} />}
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User block */}
      <div style={{ padding: 10 }}>
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
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
