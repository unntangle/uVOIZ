"use client";

interface PlaceholderProps {
  title: string;
  subtitle: string;
  description: string;
}

/**
 * Generic "coming soon" placeholder for /console pages
 * that haven't been built out yet. Keeps nav links from 404'ing.
 */
export default function ConsolePlaceholder({ title, subtitle, description }: PlaceholderProps) {
  return (
    <main style={{ padding: '32px 40px', overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{title}</h1>
        <p style={{ color: '#64748b', fontSize: 14 }}>{subtitle}</p>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: 48, textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12, margin: '0 auto 16px',
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 24, fontWeight: 700,
        }}>U</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
          Coming soon
        </div>
        <p style={{ color: '#64748b', fontSize: 14, maxWidth: 480, margin: '0 auto', lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
    </main>
  );
}
