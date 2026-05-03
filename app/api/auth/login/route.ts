import { NextRequest, NextResponse } from 'next/server';
import { createToken, sessionCookieOptions, loginUser } from '@/lib/auth';

/**
 * BPO + super-admin login.
 *
 * Authenticates against Supabase only. There are no hardcoded demo
 * credentials — every user must exist in the `users` table.
 *
 * Bootstrap: to create the first admin, sign up via /sign-up, then run in
 * Supabase SQL Editor:
 *   UPDATE users SET role = 'admin' WHERE email = '<your-email>';
 * (Use role = 'super_admin' for an Unntangle staff console account.)
 */

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    // Refuse to attempt login at all if Supabase isn't configured. Better to
    // fail loudly than fall through to a generic "invalid credentials" that
    // hides a misconfigured deployment.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Login attempted but Supabase env vars are not set.');
      return NextResponse.json(
        { error: 'Authentication is not available. Please contact support.' },
        { status: 503 }
      );
    }

    const { user, error } = await loginUser(email, password);
    if (error || !user) {
      return NextResponse.json(
        { error: error || 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const token = await createToken(user);
    const response = NextResponse.json({ success: true, user });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
