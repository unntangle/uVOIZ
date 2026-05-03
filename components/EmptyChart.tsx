"use client";
import { ReactNode } from 'react';

/**
 * EmptyChart — renders inside a chart's box when there's no data yet.
 *
 * Designed to live where a Recharts component would, so the surrounding
 * card layout doesn't shift. Use this instead of placeholder/mock data.
 */
export default function EmptyChart({
  icon,
  title = 'No data yet',
  message = 'Run your first campaign to see analytics here.',
  height = 240,
}: {
  icon?: ReactNode;
  title?: string;
  message?: string;
  height?: number;
}) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        color: 'var(--text3)',
        background:
          'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(0,0,0,0.015) 8px, rgba(0,0,0,0.015) 9px)',
        borderRadius: 12,
        padding: 24,
      }}
    >
      {icon && <div style={{ marginBottom: 10, opacity: 0.5 }}>{icon}</div>}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 280 }}>{message}</div>
    </div>
  );
}
