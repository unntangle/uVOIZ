import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/sign-up', '/api/auth'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and static files
  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));
  if (isPublic) return NextResponse.next();
  if (pathname.startsWith('/_next') || pathname.startsWith('/api/webhooks') || pathname.includes('.')) return NextResponse.next();

  // Check session cookie
  const token = request.cookies.get('va_session')?.value;
  if (!token) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
