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
  const [confirmOpen, setConfirmOpen] = useState(false);

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

      {/* User block + inline sign-out confirmation */}
      <div style={{ padding: 10, position: 'relative' }}>
        {/* Sign-out confirmation popover — replaces the user row when open */}
        {confirmOpen ? (
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby="signout-title"
            style={{
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 12,
              background: 'var(--bg)',
              boxShadow: '0 6px 20px -6px rgba(0,0,0,0.15)',
              fontFamily: 'Inter, sans-serif',
              animation: 'sbPopIn 0.16s ease-out',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: 'var(--red-soft)',
                color: 'var(--red)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <LogOut size={13} />
              </div>
              <h3
                id="signout-title"
                style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}
              >
                Sign out?
              </h3>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45, margin: '0 0 10px' }}>
              You'll be returned to the login page.
            </p>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={loggingOut}
                style={{
                  flex: 1, height: 30, padding: '0 8px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text)',
                  fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                  cursor: loggingOut ? 'not-allowed' : 'pointer',
                  opacity: loggingOut ? 0.5 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => !loggingOut && ((e.currentTarget as HTMLElement).style.background = 'var(--bg3)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  flex: 1, height: 30, padding: '0 8px',
                  background: 'var(--red)',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                  cursor: loggingOut ? 'wait' : 'pointer',
                  opacity: loggingOut ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => !loggingOut && ((e.currentTarget as HTMLElement).style.opacity = '0.9')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = loggingOut ? '0.7' : '1')}
              >
                {loggingOut ? '…' : 'Sign out'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: 8, borderRadius: 10,
            transition: 'background 0.15s',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '4px 4px',
            }}>
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
            </div>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={loggingOut}
              title="Sign out"
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 10px', borderRadius: 8,
                background: 'transparent',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text2)',
                fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'var(--red-soft)';
                (e.currentTarget as HTMLElement).style.color = 'var(--red)';
                (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--text2)';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
              }}
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        )}

        <style jsx>{`
          @keyframes sbPopIn {
            from { opacity: 0; transform: translateY(4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </aside>
  );
}
