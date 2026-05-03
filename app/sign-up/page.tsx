"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed.');
        return;
      }

      router.push('/onboarding');
      router.refresh();
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
        {/* Logo (centered, with "BY UNNTANGLE" tag) */}
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

        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em', textAlign: 'center' }}>
          Create an account
        </h1>
        <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 28, textAlign: 'center' }}>
          Start your free trial. No credit card required.
        </p>

        {/* Google sign-up (visual only — OAuth not wired yet) */}
        <button
          type="button"
          onClick={() => {
            alert('Google sign-in is coming soon. Please use email & password for now.');
          }}
          style={{
            width: '100%',
            height: 44,
            background: '#ffffff',
            border: '1.5px solid var(--border)',
            borderRadius: 8,
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: 14,
            color: 'var(--text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)';
            (e.currentTarget as HTMLElement).style.background = '#fafafa';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLElement).style.background = '#ffffff';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign up with Google
        </button>

        {/* OR divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '20px 0',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            or
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

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
                style={{ paddingLeft: 38, height: 44 }}
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, color: 'var(--text)' }}>
              Password
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
            disabled={loading}
            style={{
              width: '100%', height: 46,
              background: 'var(--text)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              fontSize: 14,
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 0.15s',
              opacity: loading ? 0.7 : 1,
              marginTop: 4,
            }}
            onMouseEnter={e => !loading && ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
            onMouseLeave={e => !loading && ((e.currentTarget as HTMLElement).style.opacity = '1')}
          >
            {loading ? (
              <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Creating account...</>
            ) : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text3)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>

        <p style={{
          fontSize: 11,
          color: 'var(--text3)',
          textAlign: 'center',
          lineHeight: 1.5,
          marginTop: 16,
        }}>
          By continuing, you agree to our{' '}
          <a href="#" style={{ color: 'var(--text2)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            Terms
          </a>
          {' '}and{' '}
          <a href="#" style={{ color: 'var(--text2)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
            Privacy Policy
          </a>
          .
        </p>
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
