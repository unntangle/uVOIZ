"use client";
import { Phone, PhoneOff, Volume2, User } from 'lucide-react';
import { Call } from '@/types';
import { formatDuration } from '@/lib/utils';
import { useEffect, useState } from 'react';

// Fixed wave heights — no Math.random() to avoid hydration mismatch
const WAVE_HEIGHTS = [40, 70, 55, 90, 45, 80, 60, 95, 50, 75, 65, 85, 45, 70];

export default function LiveCallCard({ call }: { call: Call }) {
  const [elapsed, setElapsed] = useState(call.duration);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (call.status !== 'in-progress') return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [call.status]);

  const isLive = call.status === 'in-progress';
  const isRinging = call.status === 'ringing';

  return (
    <div style={{
      background: isLive ? '#f0fdf4' : 'var(--bg3)',
      border: `1px solid ${isLive ? '#bbf7d0' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isLive && <div className="live-dot" />}
          {isRinging && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: isLive ? 'var(--green)' : isRinging ? 'var(--amber)' : 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {isLive ? 'Live' : isRinging ? 'Ringing' : call.status}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
          {formatDuration(elapsed)}
        </span>
      </div>

      {/* Contact */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'var(--accent-soft)', border: '1px solid #bae6fd',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <User size={15} color="var(--accent)" />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{call.contactName}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{call.contactPhone}</div>
        </div>
      </div>

      {/* Waveform — only render client-side to avoid hydration mismatch */}
      {isLive && mounted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 20 }}>
          {WAVE_HEIGHTS.map((h, i) => (
            <div key={i} className="wave-bar" style={{
              height: `${h}%`,
              animationDelay: `${i * 0.07}s`,
            }} />
          ))}
          <Volume2 size={11} color="var(--green)" style={{ marginLeft: 4 }} />
        </div>
      )}

      {/* Agent */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ color: 'var(--text3)' }}>
          Agent: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{call.agentName}</span>
        </span>
        <span style={{ color: 'var(--text3)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {call.campaignName}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
          <Phone size={11} /> Monitor
        </button>
        <button className="btn btn-danger btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
          <PhoneOff size={11} /> End
        </button>
      </div>
    </div>
  );
}
