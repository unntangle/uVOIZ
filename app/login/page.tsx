"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Loader2, Phone, Check, Megaphone, Bot, Headphones, MessageCircle, Mic, Globe, Zap, Signal, PhoneCall } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// Testimonials — cycles through these
const TESTIMONIALS = [
  {
    quote: "uVOIZ helped us scale from 20 human agents to handling 10,000+ daily calls with just 3 AI voices. Conversion up 32%.",
    name: "Rohit Sharma",
    role: "Ops Head, Mumbai BPO",
    initial: "R",
  },
  {
    quote: "Our Tamil calling campaigns now run 24/7 without any human fatigue. Customer feedback has been surprisingly positive.",
    name: "Kavya Raman",
    role: "Director, Chennai Contact Center",
    initial: "K",
  },
  {
    quote: "Monthly costs dropped from ₹8L to ₹1.2L while call volume doubled. uVOIZ is a no-brainer for any growing BPO.",
    name: "Arjun Patel",
    role: "Founder, Ahmedabad BPO",
    initial: "A",
  },
];

// Animated counter hook
function useCounter(target: number, duration: number = 2000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let frame: number;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@uvoiz.com');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Hero animations
  const [mounted, setMounted] = useState(false);
  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');

  const bpoCount = useCounter(mounted ? 50 : 0, 1600);
  const callsCount = useCounter(mounted ? 1347 : 0, 2400);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Rotate testimonials every 7s
  useEffect(() => {
    const interval = setInterval(() => {
      setFadeState('out');
      setTimeout(() => {
        setTestimonialIndex(i => (i + 1) % TESTIMONIALS.length);
        setFadeState('in');
      }, 400);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const testimonial = TESTIMONIALS[testimonialIndex];
  const displayCalls = (callsCount / 1000).toFixed(1);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f6f8',
      display: 'flex',
      padding: 20,
      gap: 20,
    }}>
      {/* LEFT — Sign-in form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Logo */}
          <div style={{ marginBottom: 40, display: 'inline-block' }}>
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

          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
            Sign in
          </h1>
          <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 28 }}>
            Welcome back. Enter your credentials to continue.
          </p>

          {/* Demo credentials */}
          <div style={{
            background: 'rgba(10,180,245,0.08)',
            border: '1px solid rgba(10,180,245,0.2)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 24,
            fontSize: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: 'var(--text3)', fontWeight: 500 }}>Demo email</span>
              <span className="mono" style={{ color: 'var(--text2)' }}>admin@uvoiz.com</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)', fontWeight: 500 }}>Demo password</span>
              <span className="mono" style={{ color: 'var(--text2)' }}>admin123</span>
            </div>
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
                  placeholder="admin@yourbpo.com"
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
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ paddingLeft: 38, paddingRight: 42, height: 44 }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text2)', userSelect: 'none' }}>
                <div
                  onClick={() => setRemember(!remember)}
                  style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: `1.5px solid ${remember ? 'var(--accent)' : 'var(--border2)'}`,
                    background: remember ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  {remember && <Check size={11} color="white" strokeWidth={3} />}
                </div>
                <span>Remember me</span>
              </label>
              <Link href="/forgot-password" style={{ fontSize: 13, color: 'var(--text2)', textDecoration: 'none', fontWeight: 500 }}>
                Forgot password?
              </Link>
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
                <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Signing in...</>
              ) : 'Sign in'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text3)' }}>
            Don't have an account?{' '}
            <Link href="/sign-up" style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>
              Start free trial
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT — Animated brand hero panel */}
      <div className="hero-panel" style={{
        flex: 1,
        borderRadius: 24,
        padding: 48,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 600,
      }}>
        {/* Animated gradient background */}
        <div className="hero-bg" style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #0b1220 0%, #0f1a2e 30%, #0a1a24 60%, #0b1628 100%)',
          backgroundSize: '200% 200%',
        }} />

        {/* Floating orb 1 — cyan, bottom-left */}
        <div className="orb orb-1" style={{
          position: 'absolute',
          bottom: '-15%',
          left: '-10%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(10,180,245,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(20px)',
        }} />

        {/* Floating orb 2 — purple, top-right */}
        <div className="orb orb-2" style={{
          position: 'absolute',
          top: '-10%',
          right: '20%',
          width: 380,
          height: 380,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(25px)',
        }} />

        {/* Watermark brand mark — drifting slowly */}
        <div className="watermark" style={{
          position: 'absolute',
          top: '5%',
          right: '-15%',
          width: '70%',
          opacity: 0.06,
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          <Image
            src="/images/uVOIZ-logo.webp"
            alt=""
            width={600}
            height={200}
            style={{ width: '100%', height: 'auto', filter: 'invert(1) brightness(2)' }}
            aria-hidden="true"
          />
        </div>

        {/* Diagonal accent stripe */}
        <div style={{
          position: 'absolute',
          top: '-20%',
          right: '-20%',
          width: '80%',
          height: '140%',
          background: 'linear-gradient(135deg, transparent 40%, rgba(10,180,245,0.08) 50%, transparent 60%)',
          transform: 'rotate(25deg)',
          pointerEvents: 'none',
        }} />

        {/* Floating product icons */}
        <div className="floating-icons" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div className="float-icon fi-1"><PhoneCall size={28} strokeWidth={1.5} /></div>
          <div className="float-icon fi-2"><Megaphone size={32} strokeWidth={1.5} /></div>
          <div className="float-icon fi-3"><Bot size={36} strokeWidth={1.5} /></div>
          <div className="float-icon fi-4"><Headphones size={26} strokeWidth={1.5} /></div>
          <div className="float-icon fi-5"><MessageCircle size={24} strokeWidth={1.5} /></div>
          <div className="float-icon fi-6"><Mic size={22} strokeWidth={1.5} /></div>
          <div className="float-icon fi-7"><Globe size={30} strokeWidth={1.5} /></div>
          <div className="float-icon fi-8"><Zap size={20} strokeWidth={1.5} /></div>
          <div className="float-icon fi-9"><Signal size={26} strokeWidth={1.5} /></div>
          <div className="float-icon fi-10"><Phone size={22} strokeWidth={1.5} /></div>
        </div>

        {/* Top pill removed */}

        {/* Middle — hero copy */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="stagger stagger-2" style={{
            fontSize: 40,
            fontWeight: 800,
            color: 'white',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginBottom: 16,
          }}>
            Welcome back to<br />
            <span className="gradient-text">uVOIZ</span>
          </h2>
          <p className="stagger stagger-3" style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.6,
            maxWidth: 420,
            marginBottom: 24,
          }}>
            Replace telecallers with AI that speaks Hindi, Tamil, Telugu, Kannada, English, and more. TRAI-compliant. Built for Indian BPOs.
          </p>

          {/* Social proof */}
          <div className="stagger stagger-4" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
            <div style={{ display: 'flex' }}>
              {['#0AB4F5', '#22c55e', '#f59e0b', '#a855f7'].map((bg, i) => (
                <div
                  key={i}
                  className="avatar-bounce"
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: bg,
                    border: '2px solid #0f1a2e',
                    marginLeft: i === 0 ? 0 : -8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: 'white',
                    animationDelay: `${i * 0.15 + 0.8}s`,
                  }}
                >
                  {['T', 'A', 'K', 'P'][i]}
                </div>
              ))}
            </div>
            <span>
              <strong style={{ color: 'white' }}>{bpoCount}+ BPOs</strong> already saving 80% on calling costs
            </span>
          </div>
        </div>

        {/* Bottom — rotating testimonial card */}
        <div className="stagger stagger-5" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: 24,
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(10,180,245,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                <Phone size={18} color="var(--accent)" />
                <span className="live-blip" style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#22c55e',
                }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
                  <span className="mono">{displayCalls}K+</span> calls today
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>across active campaigns</div>
              </div>
            </div>

            {/* Rotating testimonial content */}
            <div className={`testimonial-fade testimonial-${fadeState}`} key={testimonialIndex}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 14, minHeight: 62 }}>
                "{testimonial.quote}"
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {testimonial.initial}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{testimonial.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{testimonial.role}</div>
                </div>
              </div>
            </div>

            {/* Testimonial pagination dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
              {TESTIMONIALS.map((_, i) => (
                <div
                  key={i}
                  onClick={() => { setFadeState('out'); setTimeout(() => { setTestimonialIndex(i); setFadeState('in'); }, 400); }}
                  style={{
                    width: i === testimonialIndex ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: i === testimonialIndex ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
                    transition: 'all 0.3s',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes orbFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(40px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 40px) scale(0.95); }
        }
        @keyframes orbFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, 60px) scale(1.15); }
        }
        @keyframes watermarkDrift {
          0%, 100% { transform: rotate(-8deg) translate(0, 0); }
          50% { transform: rotate(-6deg) translate(-20px, 15px); }
        }
        @keyframes pulseDot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(10,180,245,0.6); transform: scale(1); }
          50% { box-shadow: 0 0 0 8px rgba(10,180,245,0); transform: scale(1.1); }
        }
        @keyframes liveBlip {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
          50% { box-shadow: 0 0 0 5px rgba(34,197,94,0); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes avatarBounce {
          0% { opacity: 0; transform: scale(0.3) translateY(-8px); }
          60% { transform: scale(1.08) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes gradientTextShimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes fadeOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-8px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .hero-bg {
          animation: gradientShift 18s ease-in-out infinite;
        }
        .orb-1 {
          animation: orbFloat1 14s ease-in-out infinite;
        }
        .orb-2 {
          animation: orbFloat2 18s ease-in-out infinite;
        }
        .watermark {
          animation: watermarkDrift 20s ease-in-out infinite;
        }
        .pulse-dot {
          display: inline-block;
          animation: pulseDot 2s ease-in-out infinite;
        }
        .live-blip {
          animation: liveBlip 1.6s ease-in-out infinite;
        }
        .stagger {
          opacity: 0;
          animation: fadeSlideIn 0.7s ease-out forwards;
        }
        .stagger-1 { animation-delay: 0.1s; }
        .stagger-2 { animation-delay: 0.25s; }
        .stagger-3 { animation-delay: 0.4s; }
        .stagger-4 { animation-delay: 0.55s; }
        .stagger-5 { animation-delay: 0.7s; }
        .avatar-bounce {
          opacity: 0;
          animation: avatarBounce 0.6s ease-out forwards;
        }
        .gradient-text {
          background: linear-gradient(90deg, #0AB4F5 0%, #22d3ee 50%, #0AB4F5 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradientTextShimmer 4s ease-in-out infinite;
        }
        .testimonial-fade {
          transition: all 0.4s ease;
        }
        .testimonial-in {
          animation: fadeIn 0.4s ease forwards;
        }
        .testimonial-out {
          animation: fadeOut 0.4s ease forwards;
        }

        @media (max-width: 900px) {
          .hero-panel {
            display: none !important;
          }
        }

        /* Floating icons */
        .float-icon {
          position: absolute;
          color: rgba(10, 180, 245, 0.12);
          filter: drop-shadow(0 0 8px rgba(10, 180, 245, 0.15));
          will-change: transform;
        }
        .fi-1  { top:  8%; left: 12%; animation: floatA 16s ease-in-out infinite; }
        .fi-2  { top: 22%; left: 78%; animation: floatB 20s ease-in-out infinite; animation-delay: -3s; }
        .fi-3  { top: 55%; left:  6%; animation: floatC 22s ease-in-out infinite; animation-delay: -5s; color: rgba(168, 85, 247, 0.11); filter: drop-shadow(0 0 10px rgba(168, 85, 247, 0.15)); }
        .fi-4  { top: 70%; left: 82%; animation: floatA 18s ease-in-out infinite; animation-delay: -7s; }
        .fi-5  { top: 38%; left: 45%; animation: floatB 24s ease-in-out infinite; animation-delay: -9s; color: rgba(34, 211, 238, 0.1); }
        .fi-6  { top: 85%; left: 28%; animation: floatC 17s ease-in-out infinite; animation-delay: -2s; }
        .fi-7  { top: 18%; left: 38%; animation: floatA 25s ease-in-out infinite; animation-delay: -11s; color: rgba(168, 85, 247, 0.1); }
        .fi-8  { top: 62%; left: 52%; animation: floatB 14s ease-in-out infinite; animation-delay: -4s; color: rgba(255, 210, 10, 0.11); }
        .fi-9  { top: 30%; left: 18%; animation: floatC 19s ease-in-out infinite; animation-delay: -6s; }
        .fi-10 { top: 48%; left: 88%; animation: floatA 21s ease-in-out infinite; animation-delay: -8s; color: rgba(34, 197, 94, 0.12); }

        @keyframes floatA {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(25px, -30px) rotate(6deg); }
          50% { transform: translate(-15px, -50px) rotate(-4deg); }
          75% { transform: translate(30px, -20px) rotate(8deg); }
        }
        @keyframes floatB {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(-35px, 25px) rotate(-8deg); }
          66% { transform: translate(20px, 40px) rotate(10deg); }
        }
        @keyframes floatC {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(1); }
          50% { transform: translate(-25px, -35px) rotate(-10deg) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
