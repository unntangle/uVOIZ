/**
 * URL helpers for subdomain-based routing.
 *
 * Production: uvoiz.unntangle.com, console.unntangle.com
 * Local dev:  uvoiz.localhost:3000, console.localhost:3000
 *
 * These helpers run in the browser. They look at window.location to figure
 * out the current host pattern and build absolute URLs for the target subdomain.
 */

/** Strip a known subdomain prefix to get the root domain (without port). */
function getRootDomain(host: string): string {
  const noPort = host.split(':')[0];
  if (noPort.startsWith('uvoiz.')) return noPort.slice('uvoiz.'.length);
  if (noPort.startsWith('console.')) return noPort.slice('console.'.length);
  return noPort;
}

/** Get the port suffix from current host, e.g. ":3000" or "". */
function getPort(host: string): string {
  const idx = host.indexOf(':');
  return idx >= 0 ? host.slice(idx) : '';
}

/**
 * Absolute URL for the BPO app (uvoiz subdomain).
 * Pass a path like "/app/dashboard" to land directly there.
 */
export function appUrl(path: string = '/app/dashboard'): string {
  if (typeof window === 'undefined') return path;
  const { protocol, host } = window.location;
  const rootDomain = getRootDomain(host);
  const port = getPort(host);
  return `${protocol}//uvoiz.${rootDomain}${port}${path}`;
}

/**
 * Absolute URL for the super admin console (console subdomain).
 * Pass a path like "/dashboard" to land directly there.
 */
export function consoleUrl(path: string = '/dashboard'): string {
  if (typeof window === 'undefined') return path;
  const { protocol, host } = window.location;
  const rootDomain = getRootDomain(host);
  const port = getPort(host);
  return `${protocol}//console.${rootDomain}${port}${path}`;
}

/**
 * Pick the right post-login destination URL for a given role.
 */
export function loginRedirectUrlForRole(role: string): string {
  if (role === 'super_admin') return consoleUrl('/dashboard');
  return appUrl('/app/dashboard');
}
