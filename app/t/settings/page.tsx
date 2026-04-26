"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Key, Phone, Bell, Shield, Globe, Save } from 'lucide-react';

function SettingsContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('api');
  const [saved, setSaved] = useState(false);
  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const TABS = [
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'telephony', label: 'Telephony', icon: Phone },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'compliance', label: 'Compliance', icon: Shield },
    { id: 'languages', label: 'Languages', icon: Globe },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/t/settings" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={[{ label: 'Dashboard', href: '/t/dashboard' }, { label: 'Settings' }]} />

        <PageHeader
          title="Settings"
          subtitle="Configure API keys, telephony, compliance and more"
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {TABS.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)} className={`nav-item ${activeTab === id ? 'active' : ''}`}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {activeTab === 'api' && (
                <>
                  <div className="card">
                    <h3 style={{ fontWeight: 600, marginBottom: 4 }}>AI & Voice APIs</h3>
                    <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Connect your AI and voice service providers</p>
                    {[
                      { label: 'VAPI API Key', placeholder: 'vapi_xxxxxxxxxx', hint: 'Voice AI orchestration — STT + LLM + TTS pipeline' },
                      { label: 'OpenAI API Key', placeholder: 'sk-xxxxxxxxxx', hint: 'GPT-4o for conversation intelligence' },
                      { label: 'ElevenLabs API Key', placeholder: 'el_xxxxxxxxxx', hint: 'Human-like voice synthesis' },
                      { label: 'Deepgram API Key', placeholder: 'dg_xxxxxxxxxx', hint: 'Real-time speech-to-text' },
                    ].map(f => (
                      <div key={f.label} style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>{f.label}</label>
                        <input className="input" type="password" placeholder={f.placeholder} />
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{f.hint}</div>
                      </div>
                    ))}
                  </div>
                  <div className="card">
                    <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Storage & Database</h3>
                    <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Configure data storage services</p>
                    {[
                      { label: 'Supabase URL', placeholder: 'https://xxx.supabase.co' },
                      { label: 'Supabase Anon Key', placeholder: 'eyJhbGci...' },
                      { label: 'Cloudflare R2 Access Key', placeholder: 'r2_xxxxxxxxxx' },
                      { label: 'Redis URL (Upstash)', placeholder: 'redis://default:xxx@xxx.upstash.io' },
                    ].map(f => (
                      <div key={f.label} style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>{f.label}</label>
                        <input className="input" type={f.label.includes('Key') ? 'password' : 'text'} placeholder={f.placeholder} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {activeTab === 'telephony' && (
                <div className="card">
                  <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Telephony — Exotel</h3>
                  <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Indian telephony — TRAI compliant, lowest rates</p>
                  {[
                    { label: 'Exotel API Key', placeholder: 'xxxxxxxxxxxx', type: 'password' },
                    { label: 'Exotel API Token', placeholder: 'xxxxxxxxxxxx', type: 'password' },
                    { label: 'Exotel Subdomain', placeholder: 'your-company', type: 'text' },
                    { label: 'Caller ID (Virtual Number)', placeholder: '+91 9090909090', type: 'text' },
                    { label: 'Max Concurrent Calls', placeholder: '50', type: 'number' },
                    { label: 'Calls Per Minute Limit', placeholder: '10', type: 'number' },
                  ].map(f => (
                    <div key={f.label} style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>{f.label}</label>
                      <input className="input" type={f.type} placeholder={f.placeholder} />
                    </div>
                  ))}
                  <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: 14, fontSize: 13, color: 'var(--amber)' }}>
                    Ensure your Exotel account is activated with TRAI and DND compliance enabled before running campaigns.
                  </div>
                </div>
              )}

              {activeTab === 'compliance' && (
                <div className="card">
                  <h3 style={{ fontWeight: 600, marginBottom: 4 }}>TRAI & DND Compliance</h3>
                  <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>India-specific regulatory compliance settings</p>
                  {[
                    { label: 'Enable DND Check', desc: 'Automatically skip numbers on the DND registry before dialling', on: true },
                    { label: 'TRAI Calling Hours', desc: 'Only allow calls between 9 AM and 9 PM as per TRAI regulations', on: true },
                    { label: 'Opt-out Detection', desc: 'AI detects do not call intent and removes contact from list', on: true },
                    { label: 'Call Recording Disclosure', desc: 'AI announces call recording at start of each call', on: true },
                    { label: 'GDPR Mode', desc: 'Enable for EU clients — auto-delete recordings after 30 days', on: false },
                  ].map(f => (
                    <div key={f.label} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3 }}>{f.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{f.desc}</div>
                      </div>
                      <label className="toggle" style={{ marginLeft: 20, flexShrink: 0 }}>
                        <input type="checkbox" defaultChecked={f.on} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="card">
                  <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Notifications</h3>
                  <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Configure when and how you receive alerts</p>
                  {[
                    { label: 'Campaign Completed', desc: 'Alert when a campaign finishes all contacts' },
                    { label: 'Low Minutes Warning', desc: 'Alert when minutes drop below 20%' },
                    { label: 'High Conversion Alert', desc: 'Alert when conversion rate exceeds target' },
                    { label: 'Call Failure Spike', desc: 'Alert when failure rate exceeds 30%' },
                    { label: 'Daily Summary Email', desc: 'Daily performance digest at 9 PM' },
                  ].map(f => (
                    <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{f.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{f.desc}</div>
                      </div>
                      <label className="toggle">
                        <input type="checkbox" defaultChecked />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  ))}
                  <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Notification Email</label>
                    <input className="input" type="email" placeholder="ops@yourbpo.com" />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>WhatsApp Alerts Number</label>
                    <input className="input" type="tel" placeholder="+91 98765 43210" />
                  </div>
                </div>
              )}

              {activeTab === 'languages' && (
                <div className="card">
                  <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Language Configuration</h3>
                  <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>Enable languages for AI agents</p>
                  {[
                    { lang: 'English', code: 'en', voice: 'en-IN', enabled: true },
                    { lang: 'Hindi', code: 'hi', voice: 'hi-IN', enabled: true },
                    { lang: 'Tamil', code: 'ta', voice: 'ta-IN', enabled: true },
                    { lang: 'Telugu', code: 'te', voice: 'te-IN', enabled: false },
                    { lang: 'Kannada', code: 'kn', voice: 'kn-IN', enabled: false },
                    { lang: 'Marathi', code: 'mr', voice: 'mr-IN', enabled: false },
                    { lang: 'Bengali', code: 'bn', voice: 'bn-IN', enabled: false },
                    { lang: 'Gujarati', code: 'gu', voice: 'gu-IN', enabled: false },
                  ].map(l => (
                    <div key={l.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{l.lang}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Voice code: {l.voice}</div>
                      </div>
                      <label className="toggle">
                        <input type="checkbox" defaultChecked={l.enabled} />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={save} style={{ minWidth: 140, justifyContent: 'center' }}>
                  <Save size={14} /> {saved ? 'Saved!' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <Suspense fallback={<div>Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
