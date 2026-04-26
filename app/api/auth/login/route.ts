import { NextRequest, NextResponse } from 'next/server';
import { createToken, sessionCookieOptions } from '@/lib/auth';

/**
 * Demo / bootstrap credentials.
 *
 * SECURITY NOTE: Set these in `.env.local`. Hardcoded fallbacks below are
 * for local dev convenience only. Once Supabase users exist with
 * role='super_admin', this list becomes unnecessary — delete it.
 */
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'gokul@unntangle.com').toLowerCase();
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'Masteradmin@!23';

const DEMO_USERS = [
  // Unntangle Super Admin (you)
  {
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASSWORD,
    user: {
      id: 'demo-superadmin-1',
      email: SUPER_ADMIN_EMAIL,
      name: 'Gokul Sridharan',
      orgId: 'unntangle-internal',
      orgName: 'Unntangle',
      plan: 'internal',
      role: 'super_admin' as const,
    },
  },
  // V4U BPO demo admin
  {
    email: 'admin@v4u.com',
    password: 'admin123',
    user: {
      id: 'demo-user-v4u',
      email: 'admin@v4u.com',
      name: 'V4U Admin',
      orgId: 'demo-org-v4u',
      orgName: 'V4U Financial Services',
      plan: 'pro',
      role: 'admin' as const,
    },
  },
];

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    // Check demo credentials first
    const demoUser = DEMO_USERS.find(
      u => u.email === email.toLowerCase() && u.password === password
    );

    if (demoUser) {
      const token = await createToken(demoUser.user);
      const response = NextResponse.json({ success: true, user: demoUser.user });
      response.cookies.set(sessionCookieOptions(token));
      return response;
    }

    // Try real database login if Supabase is configured
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { loginUser } = await import('@/lib/auth');
        const { user, error } = await loginUser(email, password);
        if (error || !user) {
          return NextResponse.json({ error: error || 'Invalid email or password.' }, { status: 401 });
        }
        const token = await createToken(user);
        const response = NextResponse.json({ success: true, user });
        response.cookies.set(sessionCookieOptions(token));
        return response;
      } catch {
        return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
      }
    }

    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
