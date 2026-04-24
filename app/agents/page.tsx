"use client";
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { mockAgents } from '@/lib/mock-data';
import { Bot, Phone, TrendingUp, Clock, Plus, Search, MoreVertical, Play } from 'lucide-react';
import { formatDuration, formatPercent } from '@/lib/utils';
import { Agent } from '@/types';

const VOICES = ['Priya (Female)', 'Arjun (Male)', 'Kavya (Female)', 'Rahul (Male)', 'Deepa (Female)', 'Vikram (Male)'];
const LANGUAGES = ['English', 'Hindi + English', 'Tamil + English', 'Telugu + English', 'Kannada + English', 'Marathi + English'];
const PERSONALITIES = ['Friendly & Empathetic', 'Confident & Persuasive', 'Professional & Concise', 'Warm & Patient', 'Energetic & Enthusiastic'];

export default function Agents() {
  const [agents] = useState(mockAgents);
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'training'>('all');
  const [form, setForm] = useState({ name: '', voice: VOICES[0], language: LANGUAGES[0], personality: PERSONALITIES[0], script: '' });

  const filtered = agents
    .filter(a => filter === 'all' ? true : a.status === filter)
    .filter(a => a.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/agents" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'AI Agents' }]} />

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
                <option value="all">All</option>
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

          <section>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Your Agents
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {filtered.map(a => <AgentCard key={a.id} a={a} />)}
            </div>
          </section>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
              <Bot size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>No agents found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try a different filter or create a new agent</div>
            </div>
          )}

        </main>
      </div>

      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 500, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ fontWeight: 700, fontSize: 18 }}>Create AI Agent</h2>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Agent Name</label>
              <input className="input" placeholder="e.g. Priya AI" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Voice</label>
                <select className="select" style={{ width: '100%' }} onChange={e => setForm(p => ({ ...p, voice: e.target.value }))}>{VOICES.map(v => <option key={v}>{v}</option>)}</select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Language</label>
                <select className="select" style={{ width: '100%' }} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}>{LANGUAGES.map(l => <option key={l}>{l}</option>)}</select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Personality</label>
              <select className="select" style={{ width: '100%' }} onChange={e => setForm(p => ({ ...p, personality: e.target.value }))}>{PERSONALITIES.map(p => <option key={p}>{p}</option>)}</select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Call Script</label>
              <textarea className="input" rows={4} placeholder="Hello, I am calling from..." style={{ resize: 'none' }} onChange={e => setForm(p => ({ ...p, script: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setShowNew(false)}>Create Agent</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentCard({ a }: { a: Agent }) {
  const statusBadge = a.status === 'active' ? 'badge-green' : a.status === 'training' ? 'badge-amber' : 'badge-gray';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'var(--accent-soft)',
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
        <span className="badge badge-gray">{a.personality.split(',')[0]}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
          <Play size={13} /> Test Call
        </button>
      </div>
    </div>
  );
}
