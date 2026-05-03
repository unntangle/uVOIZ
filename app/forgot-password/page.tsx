"use client";
import { useState } from 'react';
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The API now explicitly tells us when the email isn't registered (404).
        // Show that error inline so the user knows to use a different email.
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSubmitted(true);
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
              src="/images/uVOiZ-logo.webp"
              alt="uVOiZ"
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

        {!submitted ? (
          <>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em', textAlign: 'center' }}>
              Forgot password?
            </h1>
            <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 28, textAlign: 'center' }}>
              No worries. Enter your email and we'll send you a link to reset it.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input
                    className="input"
                    type="email"
                    placeholder="you@yourbpo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    style={{ paddingLeft: 38, height: 44 }}
                    autoComplete="email"
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
                disabled={loading || !email}
                style={{
                  width: '100%', height: 46,
                  background: loading || !email ? 'var(--text3)' : 'var(--text)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: loading ? 'wait' : email ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'opacity 0.15s, background 0.15s',
                  marginTop: 4,
                }}
                onMouseEnter={e => { if (!loading && email) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                onMouseLeave={e => { if (!loading && email) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                {loading ? (
                  <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Sending...</>
                ) : 'Send reset link'}
              </button>
            </form>
          </>
        ) : (
          // Success state — shown after submitting a valid (or invalid) email
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--accent-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <CheckCircle2 size={28} color="var(--accent)" strokeWidth={2} />
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.02em' }}>
              Check your inbox
            </h1>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 6, lineHeight: 1.6 }}>
              We've sent a link to reset your password to <strong style={{ color: 'var(--text)' }}>{email}</strong>.
            </p>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>
              The link expires in 30 minutes. Check your spam folder if you don't see it.
            </p>

            <button
              type="button"
              onClick={() => { setSubmitted(false); setEmail(''); }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text2)',
                fontSize: 13,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              Use a different email
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text3)' }}>
          <Link
            href="/login"
            style={{
              color: 'var(--text2)',
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </p>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
