import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import TenantShell from '@/components/TenantShell';
import type { Role } from '@/lib/permissions';

/**
 * Shared layout for all /t/* (BPO tenant) routes.
 * - Requires authentication
 * - Forbids super_admin (they belong in /console)
 * - Renders the Sidebar ONCE so it persists across navigations (no flicker)
 *
 * Per-route role gating (admin-only pages like /t/billing, /t/team, /t/settings)
 * is handled by middleware.ts via lib/permissions.ts.
 */
export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  // Super admins should be in the console, not the BPO app
  if (session.role === 'super_admin') redirect('/console');

  return (
    <TenantShell
      orgName={session.orgName}
      userName={session.name}
      userEmail={session.email}
      role={session.role as Role}
    >
      {children}
    </TenantShell>
  );
}
