import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * GET /api/auth/me
 * Returns the currently logged-in user (from JWT cookie),
 * or 401 if no valid session. Used by the sidebar to hydrate
 * role and identity for client components.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}
