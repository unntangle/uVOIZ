import ConsoleSidebar from './ConsoleSidebar';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

/**
 * Super admin console layout. Mounted on console.unntangle.com via the
 * middleware rewrite from /dashboard, /clients, /billing, etc. → /console/*.
 *
 * Only super_admin role can pass through. Anyone else gets bounced back
 * to the BPO app via /app/dashboard (which middleware will redirect to
 * uvoiz.unntangle.com if they're somehow on the console subdomain).
 *
 * The `console-shell` wrapper class flips the cyan accent to indigo and
 * draws a thin indigo bar across the top of the screen — making it
 * unmistakeably clear you're in operator mode, not the customer app.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'super_admin') redirect('/app/dashboard');

  return (
    <div
      className="console-shell"
      style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}
    >
      <ConsoleSidebar
        userName={session.name}
        userEmail={session.email}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
