import { NextRequest, NextResponse } from 'next/server';
import { createToken, sessionCookieOptions } from '@/lib/auth';

// Demo credentials — change these after Supabase is set up
const DEMO_USERS = [
  {
    email: 'admin@uvoiz.com',
    password: 'admin123',
    user: {
      id: 'demo-user-1',
      email: 'admin@uvoiz.com',
      name: 'uVOIZ Admin',
      orgId: 'demo-org-1',
      orgName: 'uVOIZ',
      plan: 'pro',
      role: 'admin',
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
