"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Validate token presence on mount
  const tokenMissing = !token;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not reset password. The link may have expired.');
        return;
      }

      setSuccess(true);
      // Auto-redirect to login after 2.5s so user sees confirmation
      setTimeout(() => router.push('/login'), 2500);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f6f8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ marginBottom: 40, display: 'flex', justifyContent: 'center' }}>
          <div>
            <Image
              src="/images/uVOIZ-logo.webp"
              alt="uVOIZ"
              width={100}
              height={34}
              style={{ objectFit: 'contain', height: 'auto', display: 'block' }}
              priority
            />
            <div style={{
              textAlign: 'right',
              fontSize: 8,
              color: 'var(--text3)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontFamily: 'Inter, sans-serif',
              marginTop: 3,
            }}>
              by <span style={{ fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em' }}>unntangle</span>
            </div>
          </div>
        </div>

        {tokenMissing ? (
          // No token in URL — show invalid link state
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--red-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <AlertCircle size={28} color="var(--red)" strokeWidth={2} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.02em' }}>
              Invalid reset link
            </h1>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              This link is missing or malformed. Please request a new one.
            </p>
            <Link
              href="/forgot-password"
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                background: 'var(--text)',
                color: '#ffffff',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Request new link
            </Link>
          </div>
        ) : success ? (
          // Success state
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--green-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle2 size={28} color="var(--green)" strokeWidth={2} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.02em' }}>
              Password reset
            </h1>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              Your password has been updated. Redirecting you to sign in...
            </p>
            <Link
              href="/login"
              style={{
                display: 'inline-block',
                padding: '12px 24px',
                background: 'var(--text)',
                color: '#ffffff',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Sign in now
            </Link>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em', textAlign: 'center' }}>
              Set new password
            </h1>
            <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 28, textAlign: 'center' }}>
              Choose a strong password you haven't used before.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoFocus
                    style={{ paddingLeft: 38, paddingRight: 42, height: 44 }}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}
                    tabIndex={-1}
                  >
                    {showPassword ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    style={{ paddingLeft: 38, height: 44 }}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--red)',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password || !confirm}
                style={{
                  width: '100%', height: 46,
                  background: loading || !password || !confirm ? 'var(--text3)' : 'var(--text)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: loading ? 'wait' : password && confirm ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'opacity 0.15s, background 0.15s',
                  marginTop: 4,
                }}
                onMouseEnter={e => { if (!loading && password && confirm) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                onMouseLeave={e => { if (!loading && password && confirm) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                {loading ? (
                  <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Resetting...</>
                ) : 'Reset password'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text3)' }}>
              <Link href="/login" style={{ color: 'var(--text2)', fontWeight: 500, textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// Wrap in Suspense because useSearchParams requires it on Next.js App Router
export default function ResetPassword() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh', background: '#f5f6f8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text3)' }} />
        <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <ResetPasswordInner />
    </Suspense>
  );
}
