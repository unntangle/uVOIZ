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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- Allow public routes and static files ----
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next();
  if (
    pathname.startsWith('/_next') ||
    pathname === '/' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // ---- Require session ----
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  const session = await verify(token);
  if (!session) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // ---- Old route redirects (back-compat for bookmarks) ----
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const newPath = pathname.replace(/^\/admin/, '/console');
    return NextResponse.redirect(new URL(newPath, request.url));
  }
  if (pathname === '/dashboard') {
    return NextResponse.redirect(new URL('/t/dashboard', request.url));
  }
  // Old /agents, /campaigns, /calls, /analytics, /billing, /settings → /t/...
  const legacyTopLevel = ['/agents', '/campaigns', '/calls', '/analytics', '/billing', '/settings'];
  for (const legacy of legacyTopLevel) {
    if (pathname === legacy || pathname.startsWith(legacy + '/')) {
      return NextResponse.redirect(new URL('/t' + pathname, request.url));
    }
  }

  // ---- Authorize against permission map ----
  // /api/* requests are handled inside route handlers, not here
  if (pathname.startsWith('/api/')) return NextResponse.next();

  if (!canAccess(pathname, session.role)) {
    // Wrong role for this route — bounce to their default landing page
    const landing = getDefaultLandingPath(session.role);
    if (pathname !== landing) {
      return NextResponse.redirect(new URL(landing, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
