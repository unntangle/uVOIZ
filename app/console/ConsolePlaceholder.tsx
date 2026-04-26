"use client";
import { Sparkles } from 'lucide-react';
import ConsoleTopbar from './ConsoleTopbar';
import PageHeader from '@/components/PageHeader';

interface PlaceholderProps {
  title: string;
  subtitle: string;
  description: string;
}

/**
 * Generic "coming soon" placeholder for /console pages
 * that haven't been built out yet. Keeps nav links from 404'ing
 * and gives the page a consistent look with the rest of the console.
 */
export default function ConsolePlaceholder({ title, subtitle, description }: PlaceholderProps) {
  return (
    <>
      <ConsoleTopbar
        crumbs={[
          { label: 'Global Overview', href: '/dashboard' },
          { label: title },
        ]}
      />

      <PageHeader title={title} subtitle={subtitle} />

      <main style={{
        flex: 1, padding: 24, overflowY: 'auto',
        background: 'var(--bg)',
      }}>
        <div className="card" style={{
          padding: 48,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'var(--accent-soft)',
            border: '1px solid #bae6fd',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={26} color="var(--accent)" />
          </div>

          <div>
            <div style={{
              fontSize: 17, fontWeight: 700,
              color: 'var(--text)',
              marginBottom: 6,
            }}>
              Coming soon
            </div>
            <p style={{
              color: 'var(--text3)', fontSize: 13,
              maxWidth: 520, lineHeight: 1.6,
            }}>
              {description}
            </p>
          </div>

          <span className="badge badge-purple" style={{ marginTop: 4 }}>
            On the roadmap
          </span>
        </div>
      </main>
    </>
  );
}
