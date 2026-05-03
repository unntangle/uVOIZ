import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';

if (!process.env.JWT_SECRET) {
  // Same boot-time guard as middleware.ts. We refuse to issue or verify
  // tokens with a hardcoded fallback secret — that's a backdoor.
  throw new Error(
    'JWT_SECRET is not set. Refusing to start — set it in your environment ' +
    '(Vercel project settings or .env.local) before running the app.'
  );
}

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = 'va_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  plan: string;
  role: string;
};

// ---- Create JWT token ----
export async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET);
}

// ---- Verify JWT token ----
export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

// ---- Get current session from cookies ----
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// ---- Get session from request (for API routes) ----
export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// ---- Cookie options ----
export function sessionCookieOptions(token: string) {
  // Cookie domain controls which hosts can read the session.
  //
  // In production we use the .unntangle.com scope so the cookie is shared
  // between uvoiz.unntangle.com (the live app) and console.unntangle.com
  // (the legacy host that 308-redirects to uvoiz.* /console/*). This means
  // anyone hitting an old console.* bookmark while signed in stays signed
  // in through the redirect, no re-login required.
  //
  // In local dev, we omit the domain attribute so the cookie stays host-only.
  // Modern browsers share cookies between localhost and *.localhost when no
  // domain is set, so this also works for cross-subdomain testing locally.
  const cookieDomain = process.env.NODE_ENV === 'production'
    ? (process.env.COOKIE_DOMAIN || '.unntangle.com')
    : undefined;

  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

// ---- Cookie clear options (for logout) ----
// Must mirror the original options (domain, path) for the browser to actually
// remove the cookie. If domain mismatches, the browser keeps the original.
export function clearSessionCookieOptions() {
  const cookieDomain = process.env.NODE_ENV === 'production'
    ? (process.env.COOKIE_DOMAIN || '.unntangle.com')
    : undefined;

  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

// ---- Register new user ----
export async function registerUser(
  email: string,
  password: string,
  companyName: string
): Promise<{ user?: SessionUser; error?: string }> {
  if (!supabaseAdmin) {
    return { error: 'Database not configured. Please set up Supabase environment variables.' };
  }
  const bcrypt = await import('bcryptjs');

  // Check existing
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (existing) return { error: 'Email already registered. Please sign in.' };

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create org
  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .insert({ name: companyName, plan: 'starter', minutes_limit: 1000 })
    .select()
    .single();

  if (orgErr || !org) return { error: 'Failed to create account. Try again.' };

  // Create user
  const { data: dbUser, error: userErr } = await supabaseAdmin
    .from('users')
    .insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      name: companyName,
      org_id: org.id,
      role: 'admin',
    })
    .select()
    .single();

  if (userErr || !dbUser) return { error: 'Failed to create user. Try again.' };

  const sessionUser: SessionUser = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    orgId: org.id,
    orgName: org.name,
    plan: org.plan,
    role: dbUser.role,
  };

  return { user: sessionUser };
}

// ---- Login user ----
export async function loginUser(
  email: string,
  password: string
): Promise<{ user?: SessionUser; error?: string }> {
  if (!supabaseAdmin) {
    return { error: 'Database not configured. Please set up Supabase environment variables.' };
  }
  const bcrypt = await import('bcryptjs');

  const { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('*, organizations(id, name, plan)')
    .eq('email', email.toLowerCase())
    .single();

  if (!dbUser) return { error: 'Invalid email or password.' };

  const valid = await bcrypt.compare(password, dbUser.password_hash);
  if (!valid) return { error: 'Invalid email or password.' };

  const org = Array.isArray(dbUser.organizations)
    ? dbUser.organizations[0]
    : dbUser.organizations;

  const sessionUser: SessionUser = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    orgId: org?.id || '',
    orgName: org?.name || '',
    plan: org?.plan || 'starter',
    role: dbUser.role,
  };

  return { user: sessionUser };
}
