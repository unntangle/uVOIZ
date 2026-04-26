import { redirect } from 'next/navigation';

/**
 * Root index page handler.
 *
 * In production, all users land on uvoiz.unntangle.com — the BPO product
 * lives at /app/* and the super admin console at /console/*. The middleware
 * handles role-based routing once authenticated.
 *
 * Hitting "/" with no path means the visitor is unauthenticated or just
 * arrived — send them to login.
 */
export default function Root() {
  redirect('/login');
}
