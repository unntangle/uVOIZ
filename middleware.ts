import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { canAccess, PUBLIC_ROUTES, getDefaultLandingPath, type Role } from './lib/permissions';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'voiceai_jwt_secret_change_in_production_2024'
);

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
 * Identify which subdomain the request came in on.
 *
 * Production:  uvoiz.unntangle.com, console.unntangle.com, unntangle.com
 * Local dev:   uvoiz.localhost:3000, console.localhost:3000, localhost:3000
 *
 * Returns 'uvoiz' | 'console' | null (root domain or unknown).
 */
function detectSubdomain(host: string): 'uvoiz' | 'console' | null {
  const cleanHost = host.split(':')[0].toLowerCase();
  if (cleanHost.startsWith('uvoiz.')) return 'uvoiz';
  if (cleanHost.startsWith('console.')) return 'console';
  return null;
}

/**
 * Strip a leading subdomain ("uvoiz.", "console.") to get the root domain.
 * "uvoiz.unntangle.com" → "unntangle.com"
 * "unntangle.com" → "unntangle.com"
 */
function getRootDomain(host: string): string {
  const noPort = host.split(':')[0];
  if (noPort.startsWith('uvoiz.')) return noPort.slice(6);
  if (noPort.startsWith('console.')) return noPort.slice(8);
  return noPort;
}

/**
 * Build the absolute URL for the BPO app home page based on the current host.
 * Local dev:  http://uvoiz.localhost:3000/app/dashboard
 * Production: https://uvoiz.unntangle.com/app/dashboard
 */
function getAppHomeUrl(host: string): string {
  const cleanHost = host.toLowerCase();
  const isLocal = cleanHost.includes('localhost');
  const protocol = isLocal ? 'http' : 'https';

  if (isLocal) {
    const port = cleanHost.includes(':') ? ':' + cleanHost.split(':')[1] : '';
    return `${protocol}://uvoiz.localhost${port}/app/dashboard`;
  }

  const rootDomain = getRootDomain(cleanHost);
  return `${protocol}://uvoiz.${rootDomain}/app/dashboard`;
}

/**
 * Build the absolute URL for the super admin console home page.
 */
function getConsoleHomeUrl(host: string): string {
  const cleanHost = host.toLowerCase();
  const isLocal = cleanHost.includes('localhost');
  const protocol = isLocal ? 'http' : 'https';

  if (isLocal) {
    const port = cleanHost.includes(':') ? ':' + cleanHost.split(':')[1] : '';
    return `${protocol}://console.localhost${port}/dashboard`;
  }

  const rootDomain = getRootDomain(cleanHost);
  return `${protocol}://console.${rootDomain}/dashboard`;
}

/**
 * Build the login URL for the current subdomain.
 * Both uvoiz.* and console.* have their own /login page (same React component).
 */
function getLoginUrl(host: string, subdomain: 'uvoiz' | 'console' | null, redirectPath?: string): URL {
  const cleanHost = host.toLowerCase();
  const isLocal = cleanHost.includes('localhost');
  const protocol = isLocal ? 'http' : 'https';
  const port = cleanHost.includes(':') ? ':' + cleanHost.split(':')[1] : '';

  let targetHost: string;
  if (subdomain === 'console') {
    targetHost = isLocal ? `console.localhost${port}` : `console.${getRootDomain(cleanHost)}`;
  } else {
    // Default to uvoiz.* for any unauthed visit (including root domain)
    targetHost = isLocal ? `uvoiz.localhost${port}` : `uvoiz.${getRootDomain(cleanHost)}`;
  }

  const url = new URL(`${protocol}://${targetHost}/login`);
  if (redirectPath) url.searchParams.set('redirect', redirectPath);
  return url;
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname } = url;
  const host = request.headers.get('host') || '';
  const subdomain = detectSubdomain(host);

  // ─────────────────────────────────────────────────────────────────
  // 1. Subdomain → internal path rewriting
  //
  // User-facing URLs are clean (uvoiz.unntangle.com/app/dashboard).
  // Internally Next.js needs the actual file path (/t/dashboard).
  // We rewrite BEFORE auth checks so all downstream logic uses the
  // real internal path.
  // ─────────────────────────────────────────────────────────────────

  let internalPath = pathname;

  if (subdomain === 'uvoiz') {
    // /app/X → /t/X (the BPO app)
    if (pathname === '/app' || pathname.startsWith('/app/')) {
      internalPath = pathname.replace(/^\/app/, '/t') || '/t';
    }
    // /login, /sign-up, /onboarding, /forgot-password, /reset-password
    // and / stay as-is. They map directly to app/login, app/sign-up, etc.
  } else if (subdomain === 'console') {
    // Anything that isn't already /console/*, /api/*, /_next/*, or an auth page
    // → prefix with /console
    const isAuthPath = pathname === '/login'
      || pathname.startsWith('/login/')
      || pathname === '/sign-up'
      || pathname.startsWith('/sign-up/')
      || pathname === '/forgot-password'
      || pathname.startsWith('/forgot-password/')
      || pathname === '/reset-password'
      || pathname.startsWith('/reset-password/');

    if (pathname === '/' || pathname === '/dashboard') {
      internalPath = '/console';
    } else if (
      !pathname.startsWith('/console') &&
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/_next/') &&
      !isAuthPath &&
      !pathname.includes('.') // skip static files
    ) {
      internalPath = '/console' + pathname;
    }
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
  // 3. Require session
  // ─────────────────────────────────────────────────────────────────

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(getLoginUrl(host, subdomain, pathname));
  }

  const session = await verify(token);
  if (!session) {
    return NextResponse.redirect(getLoginUrl(host, subdomain, pathname));
  }

  // ─────────────────────────────────────────────────────────────────
  // 4. Subdomain-vs-role enforcement
  // Super admins on uvoiz.* → bounce to console.
  // BPO users on console.*  → bounce to app.
  // ─────────────────────────────────────────────────────────────────

  if (subdomain === 'uvoiz' && session.role === 'super_admin') {
    return NextResponse.redirect(getConsoleHomeUrl(host));
  }
  if (subdomain === 'console' && session.role !== 'super_admin') {
    return NextResponse.redirect(getAppHomeUrl(host));
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. Legacy redirects on the root domain (back-compat)
  // ─────────────────────────────────────────────────────────────────

  if (!subdomain) {
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      return NextResponse.redirect(new URL(pathname.replace(/^\/admin/, '/console'), request.url));
    }
    if (pathname === '/dashboard') {
      return NextResponse.redirect(new URL('/t/dashboard', request.url));
    }
    const legacyTopLevel = ['/agents', '/campaigns', '/calls', '/analytics', '/billing', '/settings'];
    for (const legacy of legacyTopLevel) {
      if (pathname === legacy || pathname.startsWith(legacy + '/')) {
        return NextResponse.redirect(new URL('/t' + pathname, request.url));
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. Authorize against permission map (operates on internalPath)
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
