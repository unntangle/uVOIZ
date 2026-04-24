"use client";
import { LayoutDashboard, Phone, Megaphone, Bot, BarChart3, Settings, CreditCard, Users, Key, HelpCircle, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const NAV_MAIN = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Phone, label: 'Live Calls', href: '/calls', badge: '47' },
  { icon: Megaphone, label: 'Campaigns', href: '/campaigns' },
  { icon: Bot, label: 'AI Agents', href: '/agents' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics' },
  { icon: CreditCard, label: 'Billing', href: '/billing' },
];

const NAV_MORE = [
  { icon: Users, label: 'Workspace Members', href: '/settings?tab=members' },
  { icon: Key, label: 'API Key', href: '/settings?tab=api' },
  { icon: Settings, label: 'Settings', href: '/settings' },
  { icon: HelpCircle, label: 'Contact Us', href: '/contact' },
];

interface SidebarProps {
  active: string;
  orgName?: string;
  userName?: string;
  userEmail?: string;
}

export default function Sidebar({
  active,
  orgName = 'My BPO Company',
  userName = 'Admin',
  userEmail = 'admin@uvoiz.com',
}: SidebarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: 'var(--bg-sidebar)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo + Workspace (stacked) */}
      <div style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Logo row */}
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
        {/* Workspace row */}
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

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', padding: '6px 10px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          App
        </div>
        {NAV_MAIN.map(({ icon: Icon, label, href, badge }) => (
          <a key={href} href={href} className={`nav-item ${active === href ? 'active' : ''}`}>
            <Icon size={16} />
            <span style={{ flex: 1 }}>{label}</span>
            {badge && (
              <span style={{
                background: 'var(--green-soft)', color: 'var(--green)',
                border: '1px solid #bbf7d0',
                borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600,
              }}>{badge}</span>
            )}
          </a>
        ))}

        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', padding: '18px 10px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          More
        </div>
        {NAV_MORE.map(({ icon: Icon, label, href }) => (
          <a key={href} href={href} className={`nav-item ${active === href ? 'active' : ''}`}>
            <Icon size={16} />
            <span style={{ flex: 1 }}>{label}</span>
          </a>
        ))}
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
