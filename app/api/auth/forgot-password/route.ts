import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPasswordResetEmail, isEmailConfigured } from '@/lib/email';

const TOKEN_TTL_MINUTES = 30;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured.' }, { status: 500 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Look up the user
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single();

    // ⚠️ Per product decision: explicitly tell the user when the email isn't registered.
    // This trades email-enumeration protection for clearer UX.
    if (!user) {
      return NextResponse.json(
        { error: "We couldn't find an account with that email." },
        { status: 404 }
      );
    }

    // Generate a cryptographically secure 32-byte token, hex encoded
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    // Invalidate any prior unused tokens for this user (one-active-token policy)
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('used_at', null);

    // Insert new token
    const { error: insertErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertErr) {
      console.error('Failed to insert reset token:', insertErr);
      return NextResponse.json(
        { error: 'Could not generate reset link. Try again.' },
        { status: 500 }
      );
    }

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    // Send the reset email. If Resend isn't configured, sendPasswordResetEmail
    // logs the link to the server console as a dev fallback. In production we
    // surface a clear error so the user isn't left wondering why nothing arrived.
    const result = await sendPasswordResetEmail(
      normalizedEmail,
      resetUrl,
      TOKEN_TTL_MINUTES
    );

    if (!result.ok) {
      // Don't leak provider details to the user, but log them for ops.
      console.error('Password reset email send failed:', result.error);
      return NextResponse.json(
        { error: 'We generated a reset link but couldn\'t send the email. Please try again or contact support.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      // Surface this in dev so the developer knows to check the server console
      // for the link instead of waiting for an email that won't arrive.
      ...(isEmailConfigured() ? {} : { devNote: 'Email not configured — reset link logged to server console.' }),
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
