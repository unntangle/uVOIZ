import { NextRequest, NextResponse } from 'next/server';
import { registerUser, createToken, sessionCookieOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    // Use email prefix as a temporary org placeholder.
    // The real company name is collected during onboarding.
    const placeholderOrgName = email.split('@')[0] || 'My BPO';

    const { user, error } = await registerUser(email, password, placeholderOrgName);
    if (error || !user) {
      return NextResponse.json({ error: error || 'Registration failed.' }, { status: 400 });
    }

    const token = await createToken(user);
    const response = NextResponse.json({ success: true, user });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
