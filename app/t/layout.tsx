import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

/**
 * Shared layout for all /t/* (BPO tenant) routes.
 * - Requires authentication
 * - Forbids super_admin (they belong in /console)
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

  return <>{children}</>;
}
