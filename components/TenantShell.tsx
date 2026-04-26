"use client";
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import type { Role } from '@/lib/permissions';

type TenantShellProps = {
  children: React.ReactNode;
  orgName: string;
  userName: string;
  userEmail: string;
  role: Role;
};

/**
 * Client wrapper for the BPO tenant area.
 *
 * Lives at the layout level so the Sidebar is rendered ONCE and persists
 * across page navigations — no remount, no flicker, no API call needed.
 *
 * Reads the active route via `usePathname` so each page doesn't have to
 * pass an `active` prop. Note: `usePathname` returns the USER-FACING URL
 * (e.g. `/app/dashboard` on `uvoiz.unntangle.com`), not the internal Next.js
 * rewrite target. So we match against `/app/*` paths here.
 */
export default function TenantShell({
  children,
  orgName,
  userName,
  userEmail,
  role,
}: TenantShellProps) {
  const pathname = usePathname();

  // Match the most specific known nav item. For nested paths like
  // /app/agents/123, we want /app/agents to stay active.
  const active = pathname.startsWith('/app/dashboard') ? '/app/dashboard'
    : pathname.startsWith('/app/agents')     ? '/app/agents'
    : pathname.startsWith('/app/campaigns')  ? '/app/campaigns'
    : pathname.startsWith('/app/calls')      ? '/app/calls'
    : pathname.startsWith('/app/analytics')  ? '/app/analytics'
    : pathname.startsWith('/app/billing')    ? '/app/billing'
    : pathname.startsWith('/app/team')       ? '/app/team'
    : pathname.startsWith('/app/settings')   ? '/app/settings'
    : pathname.startsWith('/app/support')    ? '/app/support'
    : '/app/dashboard';

  return (
    <div className="tenant-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        active={active}
        orgName={orgName}
        userName={userName}
        userEmail={userEmail}
        role={role}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
