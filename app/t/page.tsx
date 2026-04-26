import { redirect } from 'next/navigation';

/**
 * Internal /t → bounce to /app/dashboard (the user-facing URL).
 * Reachable only if someone hits the internal path directly during dev.
 * Middleware normally rewrites /app/* to /t/* so this redirect goes back
 * the other way (using a client-visible path).
 */
export default function TenantIndexPage() {
  redirect('/app/dashboard');
}
