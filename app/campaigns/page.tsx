"use client";
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { PlayCircle, PauseCircle, MoreVertical, Plus, Search, Megaphone, Loader2 } from 'lucide-react';
import { Campaign } from '@/types';

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
      if (res.ok) {
        const data = await res.json();
        if (data.campaign) {
          setCampaigns(prev => [data.campaign, ...prev]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setShowNew(false);
      setForm({ name: '', language: 'en', agentId: 'a1', script: '', roomType: 'Sales' });
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/campaigns" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={[
          { label: 'Dashboard', href: '/dashboard' }, 
          { label: 'Campaigns', href: (showNew || selectedCampaign) ? '/campaigns' : undefined, onClick: (showNew || selectedCampaign) ? () => { setShowNew(false); setSelectedCampaign(null); } : undefined },
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
                ← Back to Campaigns
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
            <div className="fade-in" style={{ maxWidth: 640, margin: '0', width: '100%' }}>
              <button 
                onClick={() => setShowNew(false)}
                style={{ 
                  background: 'none', border: 'none', padding: 0, 
                  color: 'var(--text3)', cursor: 'pointer', fontSize: 13, 
                  fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: 20, transition: 'color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
              >
                ← Back to Campaigns
              </button>
              
              <div className="card" style={{ padding: 32 }}>
                <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Create New Campaign</h2>
                <p style={{ color: 'var(--text3)', marginBottom: 28, fontSize: 14 }}>Configure your outbound calling campaign and script</p>
                
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
                      onClick={handleCreateCampaign}
                      disabled={!form.agentId || loading}
                    >
                      {loading ? 'Creating...' : agents.length === 0 ? 'Create an Agent first' : 'Create Campaign'}
                    </button>
                    <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', height: 44 }} onClick={() => setShowNew(false)}>Save Draft</button>
                  </div>
                </div>
              </div>
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
      </div>
    </div>
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
