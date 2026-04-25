"use client";
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Mail, MessageSquare, Phone, MapPin, Send, CheckCircle2 } from 'lucide-react';

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/contact" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Contact Us' }]} />

        <PageHeader
          title="Contact Us"
          subtitle="Get in touch with our support and sales teams"
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
          
          <div className="card" style={{ padding: 32 }}>
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={32} color="var(--green)" />
                  </div>
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Message Sent!</h2>
                <p style={{ color: 'var(--text3)', marginBottom: 24 }}>We've received your inquiry and will get back to you within 24 hours.</p>
                <button className="btn btn-ghost" onClick={() => setSubmitted(false)}>Send another message</button>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Send us a message</h3>
                <p style={{ color: 'var(--text3)', marginBottom: 28 }}>Have a question about our platform or need a custom solution? Fill out the form below.</p>
                
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Full Name</label>
                      <input className="input" placeholder="John Doe" required />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Work Email</label>
                      <input className="input" type="email" placeholder="john@company.com" required />
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Subject</label>
                    <select className="select" style={{ width: '100%' }}>
                      <option>General Inquiry</option>
                      <option>Technical Support</option>
                      <option>Sales & Pricing</option>
                      <option>Partnership</option>
                    </select>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Message</label>
                    <textarea className="input" rows={6} placeholder="Tell us how we can help..." style={{ resize: 'none' }} required />
                  </div>
                  
                  <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: 'flex-start', padding: '12px 32px', height: 'auto' }}>
                    {loading ? 'Sending...' : <><Send size={15} /> Send Message</>}
                  </button>
                </form>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 24 }}>
              <h4 style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Contact Information</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Mail size={16} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Email Support</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>support@uvoiz.com</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MessageSquare size={16} color="var(--green)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Live Chat</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Available Mon-Fri, 9am-6pm IST</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--amber-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Phone size={16} color="var(--amber)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Sales Hotline</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>+91 98765 43210</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <h4 style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Our Office</h4>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={16} color="var(--text2)" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Mumbai, India</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
                    10th Floor, Tech Hub,<br />
                    BKC, Mumbai 400051
                  </div>
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
