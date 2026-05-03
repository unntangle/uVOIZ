import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { canAccess, PUBLIC_ROUTES, type Role } from './lib/permissions';

if (!process.env.JWT_SECRET) {
  // Fail loud at import time so a misconfigured environment crashes the
  // function on first request instead of silently signing/verifying tokens
  // with a hardcoded fallback. Production deployments must set this.
  throw new Error(
    'JWT_SECRET is not set. Refusing to start — set it in your environment ' +
    '(Vercel project settings or .env.local) before running the app.'
  );
}

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const COOKIE_NAME = 'va_session';

type SessionPayload = {
  id: string;
  email: string;
  role: Role;
  orgId: string;
};

async function verify(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Single-subdomain layout (uvoiz.unntangle.com hosts both the BPO product
 * and the super admin console as path zones):
 *
 *   /app/*        → BPO product   (rewritten internally to /t/*)
 *   /console/*    → Super admin   (no rewrite — files live at app/console/*)
 *   /login        → public, shared by both
 *   /sign-up      → public
 *   /forgot-password, /reset-password, /onboarding → public or any-authed
 *
 * The legacy `console.unntangle.com` host is permanently redirected to the
 * equivalent path on uvoiz.unntangle.com so old bookmarks don't 404 during
 * the cutover. Remove the redirect block after a few months.
 */

/** True if the host is the deprecated console subdomain. */
function isLegacyConsoleHost(host: string): boolean {
  return host.toLowerCase().split(':')[0].startsWith('console.');
}

/** Strip a leading subdomain to get the root domain. */
function getRootDomain(host: string): string {
  const noPort = host.split(':')[0];
  if (noPort.startsWith('uvoiz.')) return noPort.slice('uvoiz.'.length);
  if (noPort.startsWith('console.')) return noPort.slice('console.'.length);
  return noPort;
}

/** Build the canonical uvoiz host string (with port for local dev). */
function getCanonicalHost(host: string): string {
  const cleanHost = host.toLowerCase();
  const isLocal = cleanHost.includes('localhost');
  const port = cleanHost.includes(':') ? ':' + cleanHost.split(':')[1] : '';
  if (isLocal) return `uvoiz.localhost${port}`;
  return `uvoiz.${getRootDomain(cleanHost)}`;
}

/** Build absolute URL for the BPO app home. */
function getAppHomeUrl(host: string): string {
  const cleanHost = host.toLowerCase();
  const protocol = cleanHost.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${getCanonicalHost(host)}/app/dashboard`;
}

/** Build absolute URL for the super admin console home. */
function getConsoleHomeUrl(host: string): string {
  const cleanHost = host.toLowerCase();
  const protocol = cleanHost.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${getCanonicalHost(host)}/console/dashboard`;
}

/** Build the login URL on the uvoiz host. Optionally append a redirect path. */
function getLoginUrl(host: string, redirectPath?: string): URL {
  const cleanHost = host.toLowerCase();
  const protocol = cleanHost.includes('localhost') ? 'http' : 'https';
  const url = new URL(`${protocol}://${getCanonicalHost(host)}/login`);
  if (redirectPath) url.searchParams.set('redirect', redirectPath);
  return url;
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname } = url;
  const host = request.headers.get('host') || '';

  // ─────────────────────────────────────────────────────────────────
  // 0. Legacy console.* host → permanently redirect to uvoiz.*/console/*
  //
  // Old URL: console.unntangle.com/clients
  // New URL: uvoiz.unntangle.com/console/clients
  //
  // Done up here so the redirect never gets entangled with auth or rewrite
  // logic. Remove this block once analytics show no more traffic to console.*
  // ─────────────────────────────────────────────────────────────────

  if (isLegacyConsoleHost(host)) {
    const cleanHost = host.toLowerCase();
    const protocol = cleanHost.includes('localhost') ? 'http' : 'https';
    const targetHost = getCanonicalHost(host);

    // Map legacy console paths onto the new /console/* prefix. The old
    // console used clean paths like /dashboard, /clients, /billing — wrap
    // them all under /console/. Auth pages (login, sign-up, etc.) just move
    // to the same path on the new host.
    const isAuthPath = pathname === '/login'
      || pathname.startsWith('/login/')
      || pathname === '/sign-up'
      || pathname.startsWith('/sign-up/')
      || pathname === '/forgot-password'
      || pathname.startsWith('/forgot-password/')
      || pathname === '/reset-password'
      || pathname.startsWith('/reset-password/');

    let newPath: string;
    if (isAuthPath) {
      newPath = pathname;
    } else if (pathname === '/' || pathname === '') {
      newPath = '/console/dashboard';
    } else if (pathname.startsWith('/console')) {
      newPath = pathname;
    } else {
      newPath = '/console' + pathname;
    }

    const target = `${protocol}://${targetHost}${newPath}${url.search}`;
    return NextResponse.redirect(target, 308);  // 308 preserves method
  }

  // ─────────────────────────────────────────────────────────────────
  // 1. BPO path rewriting: /app/* → /t/*
  //
  // The BPO app's user-facing URLs use /app/* but the file structure lives
  // at app/t/*. Rewrite here so downstream auth checks and Next.js routing
  // both see the internal path.
  //
  // /console/* needs no rewrite — files already live at app/console/*.
  // ─────────────────────────────────────────────────────────────────

  let internalPath = pathname;

  if (pathname === '/app' || pathname.startsWith('/app/')) {
    internalPath = pathname.replace(/^\/app/, '/t') || '/t';
  }

  const rewriteUrl = url.clone();
  rewriteUrl.pathname = internalPath;
  const needsRewrite = internalPath !== pathname;

  // ─────────────────────────────────────────────────────────────────
  // 2. Public routes & static files — no auth needed
  // ─────────────────────────────────────────────────────────────────

  if (PUBLIC_ROUTES.some(r => internalPath.startsWith(r))) {
    return needsRewrite ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();
  }
  if (
    internalPath.startsWith('/_next') ||
    internalPath === '/' ||
    internalPath.includes('.')
  ) {
    return needsRewrite ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();
  }

  // ─────────────────────────────────────────────────────────────────
  // 2b. Machine-to-machine API routes — bypass session check
  //
  // These routes authenticate themselves (cron via CRON_SECRET bearer
  // token, webhooks via HMAC signatures). They are called by external
  // services (Vercel Cron, GitHub Actions, TeleCMI, VAPI, Razorpay) that
  // have no browser cookie, so the session-redirect logic below would
  // bounce them to /login and break the integration.
  // ─────────────────────────────────────────────────────────────────

  if (
    internalPath.startsWith('/api/cron/') ||
    internalPath.startsWith('/api/webhooks/') ||
    internalPath === '/api/webhooks'
  ) {
    return NextResponse.next();
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. Require session
  // ─────────────────────────────────────────────────────────────────

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(getLoginUrl(host, pathname));
  }

  const session = await verify(token);
  if (!session) {
    return NextResponse.redirect(getLoginUrl(host, pathname));
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. Zone-vs-role enforcement
  //
  // - Super admins on /app/* (or its rewrite /t/*) → bounce to console
  // - BPO users on /console/* → bounce to app
  //
  // This used to be host-based; now it's path-based since both zones
  // share the same host.
  // ─────────────────────────────────────────────────────────────────

  const isAppZone = internalPath === '/t' || internalPath.startsWith('/t/');
  const isConsoleZone = internalPath === '/console' || internalPath.startsWith('/console/');

  if (isAppZone && session.role === 'super_admin') {
    return NextResponse.redirect(getConsoleHomeUrl(host));
  }
  if (isConsoleZone && session.role !== 'super_admin') {
    return NextResponse.redirect(getAppHomeUrl(host));
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. Legacy redirects — short top-level paths from before the /app prefix
  // ─────────────────────────────────────────────────────────────────

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return NextResponse.redirect(new URL(pathname.replace(/^\/admin/, '/console'), request.url));
  }
  if (pathname === '/dashboard') {
    // Ambiguous — could mean BPO or console. Send to BPO; super_admin will
    // be bounced to /console by step 4 on the next request.
    return NextResponse.redirect(new URL('/app/dashboard', request.url));
  }
  const legacyTopLevel = ['/agents', '/campaigns', '/calls', '/analytics', '/billing', '/settings'];
  for (const legacy of legacyTopLevel) {
    if (pathname === legacy || pathname.startsWith(legacy + '/')) {
      return NextResponse.redirect(new URL('/app' + pathname, request.url));
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. Authorize against permission map (uses internalPath, e.g. /t/*, /console/*)
  // ─────────────────────────────────────────────────────────────────

  if (internalPath.startsWith('/api/')) {
    return needsRewrite ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();
  }

  if (!canAccess(internalPath, session.role)) {
    return NextResponse.redirect(
      session.role === 'super_admin' ? getConsoleHomeUrl(host) : getAppHomeUrl(host)
    );
  }

  return needsRewrite ? NextResponse.rewrite(rewriteUrl) : NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
