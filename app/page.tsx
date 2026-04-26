import { redirect } from 'next/navigation';

/**
 * Root index page handler.
 *
 * In production, users typically land on a specific subdomain
 * (uvoiz.unntangle.com or console.unntangle.com), and the middleware
 * routes them appropriately.
 *
 * If someone hits the root domain with no subdomain — or localhost:3000
 * with no subdomain — we send them to login.
 */
export default function Root() {
  redirect('/login');
}
