/**
 * URL helpers for the single-subdomain layout.
 *
 * Production: uvoiz.unntangle.com
 *   - /app/*       → BPO product
 *   - /console/*   → Super admin console
 *
 * Local dev:  uvoiz.localhost:3000  (or plain localhost:3000)
 *   - same path structure
 *
 * These helpers run in the browser. They read window.location to figure out
 * the current host pattern and build absolute URLs for the right zone. In
 * the new model both zones live on the same host, so these mostly just
 * normalize host + path.
 */

/** Strip a known subdomain prefix to get the root domain (without port). */
function getRootDomain(host: string): string {
  const noPort = host.split(':')[0];
  if (noPort.startsWith('uvoiz.')) return noPort.slice('uvoiz.'.length);
  return noPort;
}

/** Get the port suffix from current host, e.g. ":3000" or "". */
function getPort(host: string): string {
  const idx = host.indexOf(':');
  return idx >= 0 ? host.slice(idx) : '';
}

/**
 * Absolute URL on the uvoiz subdomain. Pass any path:
 *   uvoizUrl('/app/dashboard')      → https://uvoiz.unntangle.com/app/dashboard
 *   uvoizUrl('/console/dashboard')  → https://uvoiz.unntangle.com/console/dashboard
 *   uvoizUrl('/login')              → https://uvoiz.unntangle.com/login
 *
 * Always lands on the uvoiz subdomain even if called from the bare root
 * (e.g. unntangle.com → uvoiz.unntangle.com).
 */
export function uvoizUrl(path: string = '/'): string {
  if (typeof window === 'undefined') return path;
  const { protocol, host } = window.location;
  const rootDomain = getRootDomain(host);
  const port = getPort(host);
  return `${protocol}//uvoiz.${rootDomain}${port}${path}`;
}

/**
 * BPO app URL. Defaults to the dashboard.
 * Kept as a separate helper so callers don't have to remember the /app prefix.
 */
export function appUrl(path: string = '/app/dashboard'): string {
  return uvoizUrl(path);
}

/**
 * Super admin console URL. Defaults to the console dashboard.
 * Kept as a separate helper so callers don't have to remember the /console prefix.
 */
export function consoleUrl(path: string = '/console/dashboard'): string {
  // Tolerate callers passing a path WITHOUT the /console prefix
  // (legacy code from the subdomain era used hrefs like '/dashboard').
  const fullPath = path.startsWith('/console') ? path : `/console${path}`;
  return uvoizUrl(fullPath);
}

/**
 * Pick the right post-login destination URL for a given role.
 */
export function loginRedirectUrlForRole(role: string): string {
  if (role === 'super_admin') return consoleUrl('/console/dashboard');
  return appUrl('/app/dashboard');
}
