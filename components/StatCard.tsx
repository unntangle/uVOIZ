"use client";
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  change?: number;
  icon: ReactNode;
  iconBg: string;
  sub?: string;
}

export default function StatCard({ label, value, change, icon, iconBg, sub }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  return (
    <div className="stat-card fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(0,0,0,0.06)',
        }}>{icon}</div>
        {change !== undefined && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 12, fontWeight: 600,
            color: isPositive ? 'var(--green)' : 'var(--red)',
            background: isPositive ? 'var(--green-soft)' : 'var(--red-soft)',
            border: `1px solid ${isPositive ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: 20, padding: '3px 8px',
          }}>
            {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 4, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
