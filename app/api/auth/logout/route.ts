import { NextResponse } from 'next/server';
import { clearSessionCookieOptions } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ success: true });
  // Clear the session cookie. Domain/path/secure flags must match the
  // original cookie or the browser won't delete it.
  response.cookies.set(clearSessionCookieOptions());
  return response;
}
