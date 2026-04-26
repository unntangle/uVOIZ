"use client";
import { useState } from 'react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Mail, MessageSquare, Phone, MapPin, Send, CheckCircle2, Book, Lightbulb, Bug } from 'lucide-react';

/**
 * In-app Help & Support page. Lives at uvoiz.unntangle.com/app/support.
 * Layout (sidebar + topbar) provided by app/t/layout.tsx, so this file
 * only renders the page content.
 */
export default function Support() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1200);
  };

  return (
    <>
      <Topbar crumbs={[{ label: 'Dashboard', href: '/app/dashboard' }, { label: 'Help & Support' }]} />

      <PageHeader
        title="Help & Support"
        subtitle="Get help from our team or browse the resources below"
      />

      <main style={{ flex: 1, padding: 24, overflowY: 'auto', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Quick links — three resource cards across the top */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <ResourceCard
            icon={<Book size={18} color="var(--accent)" />}
            iconBg="var(--accent-soft)"
            title="Documentation"
            description="Setup guides, integration docs, and API reference"
            actionLabel="Browse docs →"
          />
          <ResourceCard
            icon={<Lightbulb size={18} color="var(--green)" />}
            iconBg="var(--green-soft)"
            title="Best Practices"
            description="Templates and proven scripts for higher conversion rates"
            actionLabel="View guides →"
          />
          <ResourceCard
            icon={<Bug size={18} color="var(--amber)" />}
            iconBg="var(--amber-soft)"
            title="Report a Bug"
            description="Something not working as expected? Let us know"
            actionLabel="Report issue →"
          />
        </div>

        {/* Form + contact info side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>

          {/* Form */}
          <div className="card" style={{ padding: 28 }}>
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'rgba(34,197,94,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <CheckCircle2 size={28} color="var(--green)" />
                  </div>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Message sent</h2>
                <p style={{ color: 'var(--text3)', marginBottom: 20, fontSize: 14 }}>
                  We've received your inquiry and will reply within 24 hours.
                </p>
                <button className="btn btn-ghost btn-sm" onClick={() => setSubmitted(false)}>
                  Send another message
                </button>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Send us a message</h3>
                <p style={{ color: 'var(--text3)', marginBottom: 24, fontSize: 13 }}>
                  Have a question or need help? Our team usually responds within a few hours.
                </p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text2)' }}>
                      Subject
                    </label>
                    <select className="select" style={{ width: '100%' }}>
                      <option>General Inquiry</option>
                      <option>Technical Support</option>
                      <option>Billing Question</option>
                      <option>Feature Request</option>
                      <option>Bug Report</option>
                      <option>Account & Access</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--text2)' }}>
                      Message
                    </label>
                    <textarea
                      className="input"
                      rows={6}
                      placeholder="Describe your issue or question in detail..."
                      style={{ resize: 'none' }}
                      required
                    />
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                      Tip: include screenshots or error messages if relevant.
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ alignSelf: 'flex-start', padding: '10px 24px', height: 'auto' }}
                  >
                    {loading ? 'Sending...' : <><Send size={14} /> Send Message</>}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Contact info sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ padding: 20 }}>
              <h4 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>Other ways to reach us</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <ContactRow
                  icon={<Mail size={14} color="var(--accent)" />}
                  iconBg="var(--accent-soft)"
                  label="Email"
                  value="support@unntangle.com"
                />
                <ContactRow
                  icon={<MessageSquare size={14} color="var(--green)" />}
                  iconBg="var(--green-soft)"
                  label="Live Chat"
                  value="Mon-Fri, 9 AM-6 PM IST"
                />
                <ContactRow
                  icon={<Phone size={14} color="var(--amber)" />}
                  iconBg="var(--amber-soft)"
                  label="Sales"
                  value="+91 98765 43210"
                />
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h4 style={{ fontWeight: 600, marginBottom: 14, fontSize: 14 }}>Office</h4>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: 'var(--bg3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <MapPin size={14} color="var(--text2)" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Mumbai, India</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
                    10th Floor, Tech Hub,<br />
                    BKC, Mumbai 400051
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              padding: '12px 14px',
              background: 'var(--accent-soft)',
              borderRadius: 10,
              fontSize: 12,
              color: 'var(--text2)',
              lineHeight: 1.5,
            }}>
              <strong style={{ color: 'var(--text)' }}>Pro plan SLA:</strong> Priority support with response time under 4 hours during business days.
            </div>
          </div>
        </div>

      </main>
    </>
  );
}

function ResourceCard({
  icon, iconBg, title, description, actionLabel,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  actionLabel: string;
}) {
  return (
    <button
      type="button"
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 20,
        textAlign: 'left',
        cursor: 'pointer',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        transition: 'transform 0.15s, border-color 0.15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{description}</div>
      <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginTop: 4 }}>
        {actionLabel}
      </div>
    </button>
  );
}

function ContactRow({
  icon, iconBg, label, value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}
