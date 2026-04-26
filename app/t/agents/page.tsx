"use client";
import { useState, useEffect } from 'react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Bot, Phone, TrendingUp, Clock, Plus, Search, MoreVertical, Play, Loader2 } from 'lucide-react';
import { formatDuration, formatPercent } from '@/lib/utils';
import { Agent } from '@/types';

const VOICES = ['Priya (Female)', 'Arjun (Male)', 'Kavya (Female)', 'Rahul (Male)', 'Deepa (Female)', 'Vikram (Male)'];
const LANGUAGES = ['English', 'Hindi + English', 'Tamil + English', 'Telugu + English', 'Kannada + English', 'Marathi + English'];
const PERSONALITIES = ['Friendly & Empathetic', 'Confident & Persuasive', 'Professional & Concise', 'Warm & Patient', 'Energetic & Enthusiastic'];

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'training'>('all');
  const [form, setForm] = useState({ name: '', voice: VOICES[0], language: LANGUAGES[0], personality: PERSONALITIES[0], script: '' });

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch('/api/agents');
        if (res.ok) {
          const data = await res.json();
          setAgents(data.agents || []);
        }
      } catch (err) {
        console.error('Failed to fetch agents:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
  }, []);

  const handleCreateAgent = async () => {
    if (!form.name) return;
    try {
      setLoading(true);
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agent) {
          setAgents(prev => [data.agent, ...prev]);
        }
      } else {
        const text = await res.text();
        alert('Failed to create agent: ' + res.status + ' ' + text);
      }
    } catch (err) {
      console.error(err);
      alert('Error: ' + err);
    } finally {
      setLoading(false);
      setShowNew(false);
      setForm({ name: '', voice: VOICES[0], language: LANGUAGES[0], personality: PERSONALITIES[0], script: '' });
    }
  };

  const filtered = agents
    .filter(a => filter === 'all' ? true : a.status === filter)
    .filter(a => a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <Topbar crumbs={[
          { label: 'Dashboard', href: '/app/dashboard' }, 
          { label: 'AI Agents', href: showNew ? '/app/agents' : undefined, onClick: showNew ? () => setShowNew(false) : undefined },
          ...(showNew ? [{ label: 'New Agent' }] : [])
        ]} />

        <PageHeader
          title="AI Agents"
          subtitle="Create and manage your virtual telecallers"
          actions={
            <>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input
                  className="input"
                  placeholder="Search agents..."
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
                <option value="training">Training</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
                <Plus size={14} /> New Agent
              </button>
            </>
          }
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, background: 'var(--bg)' }}>

          {showNew ? (
            <div className="fade-in" style={{ maxWidth: 600, margin: '0', width: '100%' }}>
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
                ← Back to AI Agents
              </button>
              
              <div className="card" style={{ padding: 32 }}>
                <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Create AI Agent</h2>
                <p style={{ color: 'var(--text3)', marginBottom: 28, fontSize: 14 }}>Customize your virtual telecaller's voice and personality</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Agent Name</label>
                    <input className="input" placeholder="e.g. Priya AI" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Voice</label>
                      <select className="select" style={{ width: '100%' }} onChange={e => setForm(p => ({ ...p, voice: e.target.value }))}>{VOICES.map(v => <option key={v}>{v}</option>)}</select>
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Language</label>
                      <select className="select" style={{ width: '100%' }} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}>{LANGUAGES.map(l => <option key={l}>{l}</option>)}</select>
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Personality</label>
                    <select className="select" style={{ width: '100%' }} onChange={e => setForm(p => ({ ...p, personality: e.target.value }))}>{PERSONALITIES.map(p => <option key={p}>{p}</option>)}</select>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Default Call Script</label>
                    <textarea className="input" rows={6} placeholder="Hello, I am calling from..." style={{ resize: 'none' }} onChange={e => setForm(p => ({ ...p, script: e.target.value }))} />
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>This script will be used as a fallback for new campaigns.</div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', height: 44 }} onClick={handleCreateAgent} disabled={loading}>{loading ? 'Creating...' : 'Create Agent'}</button>
                    <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', height: 44 }} onClick={() => setShowNew(false)}>Cancel</button>
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
              <section>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Your Agents ({filtered.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {filtered.map(a => <AgentCard key={a.id} a={a} />)}
                </div>
                {filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
                    <Bot size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>No agents found</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Try a different filter or create a new agent</div>
                  </div>
                )}
              </section>
            )
          )}

        </main>
    </>
  );
}

function AgentCard({ a }: { a: Agent }) {
  const statusBadge = a.status === 'active' ? 'badge-green' : a.status === 'training' ? 'badge-amber' : 'badge-gray';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer', transition: 'transform 0.15s, border-color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'var(--bg3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={22} color="var(--accent)" />
        </div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
          <MoreVertical size={16} />
        </button>
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          {a.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {a.voice} · {a.language}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { icon: Phone, val: a.callsHandled.toLocaleString(), label: 'Calls' },
          { icon: TrendingUp, val: formatPercent(a.successRate), label: 'Success' },
          { icon: Clock, val: formatDuration(a.avgDuration), label: 'Avg' },
        ].map(({ val, label }) => (
          <div key={label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge ${statusBadge}`}>{a.status}</span>
        <span className="badge badge-purple">{a.personality.split(' ')[0]}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
          <Play size={13} /> Test Call
        </button>
      </div>
    </div>
  );
}
