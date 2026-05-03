"use client";
import { useState, useEffect } from 'react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { PlayCircle, PauseCircle, MoreVertical, Plus, Search, Megaphone, Loader2, Upload, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import { Campaign, Agent } from '@/types';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green', paused: 'badge-amber', draft: 'badge-gray', completed: 'badge-cyan',
};
const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', mr: 'Marathi' };

const CATEGORY_EMOJI: Record<string, string> = {
  Insurance: '🛡️', Banking: '🏦', Survey: '📋', Loans: '💰', Sales: '📞',
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', language: 'en', agentId: '', script: '', roomType: 'Sales' });

  // Wizard state for the create-campaign flow
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [pendingContacts, setPendingContacts] = useState<{ name: string; phone: string }[]>([]);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [cRes, aRes] = await Promise.all([
          fetch('/api/campaigns'),
          fetch('/api/agents')
        ]);
        if (cRes.ok) {
          const data = await cRes.json();
          setCampaigns(data.campaigns || []);
        }
        if (aRes.ok) {
          const data = await aRes.json();
          const fetchedAgents = data.agents || [];
          setAgents(fetchedAgents);
          if (fetchedAgents.length > 0) {
            setForm(f => ({ ...f, agentId: fetchedAgents[0].id }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      async function loadContacts() {
        try {
          const res = await fetch(`/api/campaigns/${selectedCampaign?.id}/contacts`);
          if (res.ok) {
            const data = await res.json();
            setContacts(data.contacts || []);
          }
        } catch (err) {
          console.error(err);
        }
      }
      loadContacts();
    }
  }, [selectedCampaign]);

  const toggle = (id: string) => setCampaigns(cs => cs.map(c => c.id === id ? { ...c, status: c.status === 'active' ? 'paused' : 'active' } as Campaign : c));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCampaign) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      
      // Basic CSV parse assuming: Name,Phone
      // Skip header if it exists
      const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
      
      const parsedContacts = [];
      for (let i = startIndex; i < lines.length; i++) {
        const [name, phone] = lines[i].split(',').map(s => s.trim());
        if (name && phone) parsedContacts.push({ name, phone });
      }

      if (parsedContacts.length > 0) {
        try {
          const res = await fetch(`/api/campaigns/${selectedCampaign.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: parsedContacts })
          });
          if (res.ok) {
            // Refresh contacts
            const newRes = await fetch(`/api/campaigns/${selectedCampaign.id}/contacts`);
            if (newRes.ok) {
              const data = await newRes.json();
              setContacts(data.contacts || []);
            }
            // Update local campaign stat
            setCampaigns(cs => cs.map(c => c.id === selectedCampaign.id ? { ...c, totalContacts: c.totalContacts + parsedContacts.length } as Campaign : c));
            setSelectedCampaign(prev => prev ? { ...prev, totalContacts: prev.totalContacts + parsedContacts.length } as Campaign : null);
          }
        } catch (err) {
          console.error("Upload failed", err);
        }
      }
      setUploading(false);
      if (e.target) e.target.value = ''; // reset input
    };
    reader.readAsText(file);
  };

  const filtered = campaigns
    .filter(c => filter === 'all' ? true : c.status === filter)
    .filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

  // Group by recency
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = filtered.filter(c => new Date(c.createdAt) > weekAgo);
  const earlier = filtered.filter(c => new Date(c.createdAt) <= weekAgo);

  const handleCreateCampaign = async () => {
    if (!form.name) return;
    try {
      setLoading(true);
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        console.error('Create campaign failed');
        return;
      }
      const data = await res.json();
      if (!data.campaign) return;

      // If the user uploaded contacts in step 2, push them to the new campaign now
      if (pendingContacts.length > 0) {
        try {
          await fetch(`/api/campaigns/${data.campaign.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: pendingContacts })
          });
          // Reflect the count locally so the card shows the right number immediately
          data.campaign.totalContacts = (data.campaign.totalContacts || 0) + pendingContacts.length;
        } catch (err) {
          console.error('Contact upload after campaign create failed:', err);
        }
      }

      setCampaigns(prev => [data.campaign, ...prev]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setShowNew(false);
      setWizardStep(1);
      setPendingContacts([]);
      setPendingFileName(null);
      setParseError(null);
      setForm({ name: '', language: 'en', agentId: agents[0]?.id || '', script: '', roomType: 'Sales' });
    }
  };

  // Wizard CSV parse — same logic as the detail-view upload, but stages
  // contacts in memory until the campaign actually exists.
  const handleWizardCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setPendingFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) {
          setParseError('The file is empty.');
          setPendingContacts([]);
          return;
        }
        const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
        const parsed: { name: string; phone: string }[] = [];
        const skipped: number[] = [];
        for (let i = startIndex; i < lines.length; i++) {
          const [name, phone] = lines[i].split(',').map(s => s?.trim());
          if (name && phone) parsed.push({ name, phone });
          else skipped.push(i + 1);
        }
        if (parsed.length === 0) {
          setParseError('No valid rows found. Expected format: Name,Phone (one per line).');
          setPendingContacts([]);
          return;
        }
        setPendingContacts(parsed);
        if (skipped.length > 0) {
          setParseError(`Imported ${parsed.length} contacts. Skipped ${skipped.length} malformed row${skipped.length === 1 ? '' : 's'}.`);
        }
      } catch (err: any) {
        setParseError('Could not parse the file. Make sure it is a CSV with Name,Phone columns.');
        setPendingContacts([]);
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  return (
    <>
      <Topbar crumbs={[
          { label: 'Dashboard', href: '/app/dashboard' }, 
          { label: 'Campaigns', href: (showNew || selectedCampaign) ? '/app/campaigns' : undefined, onClick: (showNew || selectedCampaign) ? () => { setShowNew(false); setSelectedCampaign(null); } : undefined },
          ...(showNew ? [{ label: 'New Campaign' }] : []),
          ...(selectedCampaign ? [{ label: selectedCampaign.name }] : [])
        ]} />

        {(!showNew && !selectedCampaign) && (
          <PageHeader
            title="Campaigns"
            subtitle="Manage all your outbound calling campaigns"
            actions={
              <>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input
                    className="input"
                    placeholder="Search campaigns..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    style={{ width: 240, paddingLeft: 32, height: 36, fontSize: 13 }}
                  />
                </div>
                <select
                  className="select"
                  value={filter}
                  onChange={e => setFilter(e.target.value as any)}
                  style={{ width: 140, height: 36, fontSize: 13 }}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                </select>
                <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
                  <Plus size={14} /> New Campaign
                </button>
              </>
            }
          />
        )}

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, background: 'var(--bg)' }}>

          {selectedCampaign ? (
            <div className="fade-in" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
              <button 
                onClick={() => setSelectedCampaign(null)}
                style={{ 
                  background: 'none', border: 'none', padding: 0, 
                  color: 'var(--text3)', cursor: 'pointer', fontSize: 13, 
                  fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: 20, transition: 'color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
              >
                ← Back
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{selectedCampaign.name}</h1>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13, color: 'var(--text3)' }}>
                    <span>Agent: <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{selectedCampaign.agentName || 'Default Agent'}</span></span>
                    <span>Language: <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{LANG[selectedCampaign.language] || selectedCampaign.language}</span></span>
                    <span className={`badge ${STATUS_BADGE[selectedCampaign.status]}`} style={{ padding: '2px 8px' }}>{selectedCampaign.status}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-ghost" onClick={() => toggle(selectedCampaign.id)}>
                    {selectedCampaign.status === 'active' ? <><PauseCircle size={16} /> Pause Campaign</> : <><PlayCircle size={16} /> Start Campaign</>}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
                <div className="card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600 }}>Contacts List</h2>
                    <div>
                      <input 
                        type="file" 
                        accept=".csv" 
                        id="csvUpload" 
                        style={{ display: 'none' }} 
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                      <label htmlFor="csvUpload" className="btn btn-primary btn-sm" style={{ cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
                        {uploading ? <><Loader2 size={14} className="spin" /> Uploading...</> : <><Plus size={14} /> Upload CSV</>}
                      </label>
                    </div>
                  </div>
                  
                  {contacts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)', marginBottom: 4 }}>No contacts uploaded yet</div>
                      <div style={{ fontSize: 13 }}>Upload a CSV with "Name, Phone" to get started</div>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>
                            <th style={{ padding: '12px 16px', fontWeight: 500 }}>Name</th>
                            <th style={{ padding: '12px 16px', fontWeight: 500 }}>Phone Number</th>
                            <th style={{ padding: '12px 16px', fontWeight: 500 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contacts.map((c, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px 16px', color: 'var(--text)' }}>{c.name}</td>
                              <td style={{ padding: '12px 16px', color: 'var(--text2)', fontFamily: 'monospace' }}>{c.phone}</td>
                              <td style={{ padding: '12px 16px' }}>
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--bg3)', color: 'var(--text2)' }}>Pending</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="card" style={{ padding: 24, height: 'fit-content' }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.06em' }}>Campaign Progress</h2>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Total Contacts</div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>{selectedCampaign.totalContacts?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Calls Made</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{selectedCampaign.called?.toLocaleString() || 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Conversions</div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>{selectedCampaign.converted?.toLocaleString() || 0}</div>
                    </div>
                    
                    <div style={{ marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                        <span color="var(--text3)">Completion</span>
                        <span style={{ fontWeight: 600 }}>{selectedCampaign.totalContacts > 0 ? Math.round(((selectedCampaign.called || 0) / selectedCampaign.totalContacts) * 100) : 0}%</span>
                      </div>
                      <div className="progress" style={{ height: 6 }}>
                        <div className="progress-fill" style={{ width: `${selectedCampaign.totalContacts > 0 ? Math.round(((selectedCampaign.called || 0) / selectedCampaign.totalContacts) * 100) : 0}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          ) : showNew ? (
            <div className="fade-in" style={{ maxWidth: 720, margin: '0', width: '100%' }}>
              <button
                onClick={() => { setShowNew(false); setWizardStep(1); setPendingContacts([]); setPendingFileName(null); setParseError(null); }}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--text3)', cursor: 'pointer', fontSize: 13,
                  fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: 20, transition: 'color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
              >
                ← Back
              </button>

              {/* Step indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
                {[
                  { n: 1, label: 'Details' },
                  { n: 2, label: 'Contacts' },
                  { n: 3, label: 'Review' },
                ].map((s, i, arr) => {
                  const isActive = wizardStep === s.n;
                  const isDone = wizardStep > s.n;
                  return (
                    <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i === arr.length - 1 ? '0 0 auto' : '1 1 auto' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                          background: isActive ? 'var(--accent)' : isDone ? 'var(--green)' : 'var(--bg3)',
                          color: (isActive || isDone) ? 'white' : 'var(--text3)',
                          transition: 'all 0.2s',
                        }}>
                          {isDone ? <CheckCircle2 size={16} /> : s.n}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'var(--text)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {s.label}
                        </div>
                      </div>
                      {i < arr.length - 1 && (
                        <div style={{ flex: 1, height: 2, background: isDone ? 'var(--green)' : 'var(--border)', margin: '0 12px', marginBottom: 22, transition: 'background 0.2s' }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Details */}
              {wizardStep === 1 && (
                <div className="card" style={{ padding: 32 }}>
                  <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Campaign details</h2>
                  <p style={{ color: 'var(--text3)', marginBottom: 28, fontSize: 14 }}>Name your campaign and pick the AI agent that will run it.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {[
                      { label: 'Campaign Name', key: 'name', type: 'text', placeholder: 'e.g. Insurance Renewal March' },
                      { label: 'Category', key: 'roomType', type: 'text', placeholder: 'e.g. Insurance, Banking, Survey' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>{f.label}</label>
                        <input className="input" type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                      </div>
                    ))}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Language</label>
                        <select className="select" style={{ width: '100%' }} value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}>
                          {Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>AI Agent</label>
                        <select
                          className="select"
                          style={{ width: '100%' }}
                          value={form.agentId}
                          onChange={e => setForm(p => ({ ...p, agentId: e.target.value }))}
                          disabled={agents.length === 0}
                        >
                          {agents.length === 0 ? (
                            <option value="">No agents available</option>
                          ) : (
                            agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)
                          )}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Call Script</label>
                      <textarea className="input" rows={6} placeholder="Hello, I am calling from..." style={{ resize: 'none' }} value={form.script} onChange={e => setForm(p => ({ ...p, script: e.target.value }))} />
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>This is what the AI agent will say when the contact answers.</div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                      <button
                        className="btn btn-primary"
                        style={{ flex: 1, justifyContent: 'center', height: 44 }}
                        onClick={() => setWizardStep(2)}
                        disabled={!form.name || !form.agentId}
                      >
                        {agents.length === 0 ? 'Create an Agent first' : <>Continue <ArrowRight size={14} /></>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Contacts */}
              {wizardStep === 2 && (
                <div className="card" style={{ padding: 32 }}>
                  <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Upload contacts</h2>
                  <p style={{ color: 'var(--text3)', marginBottom: 24, fontSize: 14 }}>
                    Upload a CSV with columns <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>Name, Phone</code>. You can skip this and add contacts later.
                  </p>

                  {pendingContacts.length === 0 ? (
                    <label htmlFor="wizardCsv" style={{
                      display: 'block',
                      border: '2px dashed var(--border)',
                      borderRadius: 12,
                      padding: '40px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <input id="wizardCsv" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleWizardCsv} />
                      <Upload size={28} style={{ color: 'var(--text3)', marginBottom: 8 }} />
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        Click to upload a CSV
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                        Or drop a file here. Format: <code>Name,Phone</code> per row.
                      </div>
                    </label>
                  ) : (
                    <div style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 20,
                      background: 'var(--bg2)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FileText size={18} />
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pendingFileName || 'contacts.csv'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                            {pendingContacts.length.toLocaleString()} contact{pendingContacts.length === 1 ? '' : 's'} ready to import
                          </div>
                        </div>
                        <button
                          onClick={() => { setPendingContacts([]); setPendingFileName(null); setParseError(null); }}
                          className="btn btn-ghost btn-sm"
                        >
                          Replace
                        </button>
                      </div>

                      {/* Preview first 5 rows */}
                      <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Name</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Phone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingContacts.slice(0, 5).map((c, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{c.name}</td>
                                <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'monospace' }}>{c.phone}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {pendingContacts.length > 5 && (
                          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text3)', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                            … and {(pendingContacts.length - 5).toLocaleString()} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {parseError && (
                    <div style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      background: 'var(--amber-soft)',
                      border: '1px solid #fde68a',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--amber)',
                    }}>
                      {parseError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button className="btn btn-ghost" style={{ height: 44 }} onClick={() => setWizardStep(1)}>
                      ← Back
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, justifyContent: 'center', height: 44 }}
                      onClick={() => setWizardStep(3)}
                    >
                      {pendingContacts.length === 0 ? 'Skip for now' : <>Continue <ArrowRight size={14} /></>}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {wizardStep === 3 && (
                <div className="card" style={{ padding: 32 }}>
                  <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Review & launch</h2>
                  <p style={{ color: 'var(--text3)', marginBottom: 24, fontSize: 14 }}>
                    Confirm the details below. Your campaign will be created in <strong>draft</strong> status — you can start it from the campaign page.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    {[
                      { label: 'Campaign name', value: form.name || '—' },
                      { label: 'Category', value: form.roomType || '—' },
                      { label: 'Language', value: LANG[form.language] || form.language },
                      { label: 'AI Agent', value: agents.find(a => a.id === form.agentId)?.name || '—' },
                      { label: 'Contacts to import', value: pendingContacts.length > 0 ? `${pendingContacts.length.toLocaleString()} from ${pendingFileName || 'CSV'}` : 'None (add later)' },
                      { label: 'Script preview', value: form.script ? (form.script.length > 80 ? form.script.slice(0, 80) + '…' : form.script) : '—' },
                    ].map((row, i, arr) => (
                      <div key={row.label} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        padding: '14px 18px',
                        borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                        background: i % 2 === 0 ? 'transparent' : 'var(--bg2)',
                      }}>
                        <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{row.label}</div>
                        <div style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{row.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button className="btn btn-ghost" style={{ height: 44 }} onClick={() => setWizardStep(2)} disabled={loading}>
                      ← Back
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, justifyContent: 'center', height: 44 }}
                      onClick={handleCreateCampaign}
                      disabled={loading || !form.name || !form.agentId}
                    >
                      {loading ? <><Loader2 size={14} className="spin" /> Creating…</> : 'Create campaign'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={32} className="spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : (
              <>
                {thisWeek.length > 0 && (
                  <section>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      This week
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                      {thisWeek.map(c => <CampaignCard key={c.id} c={c} onToggle={toggle} onClick={() => setSelectedCampaign(c)} />)}
                    </div>
                  </section>
                )}

                {earlier.length > 0 && (
                  <section>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Earlier
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                      {earlier.map(c => <CampaignCard key={c.id} c={c} onToggle={toggle} onClick={() => setSelectedCampaign(c)} />)}
                    </div>
                  </section>
                )}

                {filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
                    <Megaphone size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>No campaigns found</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Try a different filter or create a new campaign</div>
                  </div>
                )}
              </>
            )
          )}

        </main>
    </>
  );
}

function CampaignCard({ c, onToggle, onClick }: { c: Campaign; onToggle: (id: string) => void; onClick?: () => void; }) {
  const progress = c.totalContacts > 0 ? Math.round((c.called / c.totalContacts) * 100) : 0;
  const convRate = c.called > 0 ? ((c.converted / c.called) * 100).toFixed(1) : '0';
  const emoji = CATEGORY_EMOJI[c.roomType] || '📞';

  return (
    <div className="card" onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer', transition: 'transform 0.15s, border-color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'var(--bg3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {emoji}
        </div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
          <MoreVertical size={16} />
        </button>
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {LANG[c.language] || c.language} · {c.totalContacts.toLocaleString()} contacts
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
          <span>Progress</span>
          <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{progress}%</span>
        </div>
        <div className="progress"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span>
        <span className="badge badge-purple">{c.agentName}</span>
        <span className="badge badge-green">Conv: {convRate}%</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={(e) => { e.stopPropagation(); onToggle(c.id); }}
        >
          {c.status === 'active' ? <><PauseCircle size={13} /> Pause</> : <><PlayCircle size={13} /> Resume</>}
        </button>
      </div>
    </div>
  );
}
