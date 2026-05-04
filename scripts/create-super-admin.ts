#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * scripts/create-super-admin.ts
 * ===============================================================
 *
 * One-shot bootstrap for Unntangle internal staff accounts.
 *
 * Run: `npm run create-super-admin`
 *
 * Prompts for email + name + password (twice) on stdin, hashes the
 * password with bcrypt (matching lib/auth.ts cost=12), inserts a row
 * into users with role='super_admin' and org_id=NULL.
 *
 * ─── Why a script and not a sign-up endpoint ────────────────────
 *
 * Super admins are Unntangle staff — there are 3 of you today and
 * maybe 5–10 of you in two years. A self-service signup endpoint
 * for that scale is wasted complexity and a security surface. A CLI
 * has zero attack surface (you need shell access to your own machine
 * + the Supabase service-role key) and takes 30 seconds to use.
 *
 * When you actually need self-service onboarding for internal staff
 * (probably year 2 when you hire your 5th person), build the invite
 * flow at /console/invites — see the comment at the bottom of this
 * file for the migration plan.
 *
 * ─── Why org_id = NULL ──────────────────────────────────────────
 *
 * Super admins manage all BPOs; they don't belong to one. The users
 * table column is already nullable (REFERENCES organizations ON DELETE
 * CASCADE with no NOT NULL). loginUser() in lib/auth.ts already
 * handles missing orgs gracefully — orgId becomes '', orgName becomes
 * '', and middleware.ts routes role='super_admin' to /console
 * regardless of org.
 *
 * ─── Idempotency ────────────────────────────────────────────────
 *
 * If the email already exists in users:
 *   - Same role='super_admin' → script reports "already a super admin"
 *     and exits success. Safe to re-run.
 *   - Different role → script offers to PROMOTE that existing user to
 *     super_admin (UPDATE role + clear org_id). Useful for upgrading
 *     yourself if you signed up via /sign-up first by mistake.
 *
 * ─── Security notes ─────────────────────────────────────────────
 *
 * Password is read with readline's stdoutMuted=true equivalent —
 * actually, Node's readline doesn't natively support muted input, so
 * we manually intercept _writeToOutput. Not perfect (length leaks via
 * cursor) but better than echoed plaintext.
 *
 * The script imports SUPABASE_SERVICE_ROLE_KEY from .env.local. Don't
 * commit .env.local. Don't run this on someone else's machine.
 * ===============================================================
 */

import 'dotenv/config';
import { createInterface } from 'readline';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

// ─── Env loading ──────────────────────────────────────────────
//
// We need .env.local read explicitly. dotenv's default is .env, but
// Next.js convention (and the rest of this app) uses .env.local for
// secrets. Dynamic import after dotenv config so vars are present.

import { config as loadDotenv } from 'dotenv';
import path from 'path';

// Load .env.local from repo root (this script lives in scripts/)
loadDotenv({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('\n✗ Missing env vars.\n');
  console.error('  This script needs NEXT_PUBLIC_SUPABASE_URL and');
  console.error('  SUPABASE_SERVICE_ROLE_KEY in your .env.local file.\n');
  console.error('  Make sure you ran this from the uVOIZ project root and');
  console.error('  that .env.local exists with both values set.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Prompt helpers ───────────────────────────────────────────

interface MutableReadline {
  output: NodeJS.WritableStream;
  _writeToOutput?: (s: string) => void;
  stdoutMuted?: boolean;
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Password prompt that doesn't echo characters to the terminal.
 *
 * Node's readline has no built-in muted mode. We monkey-patch
 * _writeToOutput so that anything readline tries to print after the
 * prompt is suppressed. The prompt itself prints once before we flip
 * the muted flag.
 *
 * Caveat: cursor still advances per character so password length
 * leaks to over-the-shoulder observers. Acceptable tradeoff for a
 * developer-machine-only script.
 */
function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    }) as unknown as MutableReadline & ReturnType<typeof createInterface>;

    let muted = false;
    const original = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (
      stringToWrite: string,
    ) => {
      if (!muted) {
        original(stringToWrite);
      }
      // After the question prints, mute everything (including the
      // newline echoed when user hits enter). Newline gets re-printed
      // manually below so the next prompt starts on a fresh line.
    };

    rl.question(question, (answer) => {
      muted = true;
      // Restore output for the newline after enter
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });

    muted = true; // mute as soon as the question has been written
  });
}

// ─── Validation ───────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  // Deliberately loose — RFC 5321 is not worth shipping. We just want
  // to catch obvious typos like missing @ or trailing spaces.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function passwordIssue(pw: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  return null;
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  uVOIZ — Create super admin');
  console.log('═══════════════════════════════════════════════════\n');
  console.log('  This creates an Unntangle staff account with full');
  console.log('  console access. Use only for internal team members.\n');

  // 1. Email
  let email = (await prompt('Email: ')).toLowerCase();
  if (!isValidEmail(email)) {
    console.error('\n✗ That doesn\'t look like a valid email. Aborting.\n');
    process.exit(1);
  }

  // 2. Check if user already exists
  const { data: existing, error: lookupErr } = await supabase
    .from('users')
    .select('id, email, role, org_id, name')
    .eq('email', email)
    .maybeSingle();

  if (lookupErr) {
    console.error('\n✗ Database lookup failed:', lookupErr.message, '\n');
    process.exit(1);
  }

  if (existing) {
    if (existing.role === 'super_admin' && existing.org_id === null) {
      console.log(`\n✓ ${email} is already a super admin (id ${existing.id}).`);
      console.log('  Nothing to do.\n');
      process.exit(0);
    }

    console.log(`\n⚠ ${email} already exists with role='${existing.role}'.`);
    if (existing.org_id) {
      console.log(`  They belong to org_id=${existing.org_id}.`);
    }
    const yes = await prompt('Promote them to super_admin (clears org link)? [y/N]: ');
    if (yes.toLowerCase() !== 'y') {
      console.log('\n  Aborted. No changes made.\n');
      process.exit(0);
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ role: 'super_admin', org_id: null })
      .eq('id', existing.id);

    if (updateErr) {
      console.error('\n✗ Promotion failed:', updateErr.message, '\n');
      process.exit(1);
    }

    console.log(`\n✓ Promoted ${email} to super_admin.`);
    console.log('  Sign out and back in for the new role to take effect.\n');
    process.exit(0);
  }

  // 3. New user — collect name + password
  const name = await prompt('Display name: ');
  if (!name) {
    console.error('\n✗ Name is required. Aborting.\n');
    process.exit(1);
  }

  console.log('');
  console.log('  Password requirements: 12+ chars, mixed case, at least one number.');
  console.log('  (Characters won\'t be shown as you type.)\n');

  const password = await promptPassword('Password: ');
  const issue = passwordIssue(password);
  if (issue) {
    console.error(`\n✗ ${issue} Aborting.\n`);
    process.exit(1);
  }

  const confirm = await promptPassword('Confirm password: ');
  if (password !== confirm) {
    console.error('\n✗ Passwords don\'t match. Aborting.\n');
    process.exit(1);
  }

  // 4. Confirmation step — show what we're about to do
  console.log('\nAbout to create:');
  console.log(`  Email: ${email}`);
  console.log(`  Name:  ${name}`);
  console.log(`  Role:  super_admin`);
  console.log(`  Org:   none (Unntangle internal staff)\n`);
  const proceed = await prompt('Proceed? [y/N]: ');
  if (proceed.toLowerCase() !== 'y') {
    console.log('\n  Aborted. No changes made.\n');
    process.exit(0);
  }

  // 5. Hash password (cost=12 to match lib/auth.ts)
  const passwordHash = await bcrypt.hash(password, 12);

  // 6. Insert user
  const { data: created, error: insertErr } = await supabase
    .from('users')
    .insert({
      email,
      name,
      password_hash: passwordHash,
      role: 'super_admin',
      org_id: null,
    })
    .select('id, email, role')
    .single();

  if (insertErr || !created) {
    console.error('\n✗ Insert failed:', insertErr?.message, '\n');
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✓ Super admin created');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`  Email: ${created.email}`);
  console.log(`  ID:    ${created.id}`);
  console.log(`  Role:  ${created.role}\n`);
  console.log('  Sign in at /login. You\'ll be routed to /console/dashboard.\n');
}

main().catch((err) => {
  console.error('\n✗ Unexpected error:', err);
  process.exit(1);
});

// ───────────────────────────────────────────────────────────────
// Future: web invite flow
// ───────────────────────────────────────────────────────────────
//
// When the team grows past ~5 people and CLI access stops being a
// reasonable bottleneck, replace this with:
//
//   1. Migration: pending_invites table (token, email, role, expires_at,
//      invited_by, used_at)
//   2. POST /api/console/invites — existing super_admin generates token,
//      inserts row, sends email via Resend with link to
//      /console/accept-invite?token=...
//   3. GET /console/accept-invite?token=... — validates token, shows
//      password setup form
//   4. POST /api/console/accept-invite — completes signup, marks
//      pending_invites.used_at, returns session
//
// Keep this script around even after that — it remains the bootstrap
// for the very first super_admin (chicken-and-egg: you need an
// existing super_admin to invite anyone).
// ───────────────────────────────────────────────────────────────
