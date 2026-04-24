"use client";
import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { mockCampaigns } from '@/lib/mock-data';
import { PlayCircle, PauseCircle, MoreVertical, Plus, Search, Megaphone } from 'lucide-react';
import { Campaign } from '@/types';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green', paused: 'badge-amber', draft: 'badge-gray', completed: 'badge-cyan',
};
const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', mr: 'Marathi' };

const CATEGORY_EMOJI: Record<string, string> = {
  Insurance: '🛡️', Banking: '🏦', Survey: '📋', Loans: '💰', Sales: '📞',
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(mockCampaigns);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', language: 'en', agentId: 'a1', script: '', roomType: 'Sales' });

  const toggle = (id: string) => setCampaigns(cs => cs.map(c => c.id === id ? { ...c, status: c.status === 'active' ? 'paused' : 'active' } as Campaign : c));

  const filtered = campaigns
    .filter(c => filter === 'all' ? true : c.status === filter)
    .filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

  // Group by recency (simple: created this week vs earlier)
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = filtered.filter(c => new Date(c.createdAt) > weekAgo);
  const earlier = filtered.filter(c => new Date(c.createdAt) <= weekAgo);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/campaigns" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Campaigns' }]} />

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
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="draft">Draft</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
                <Plus size={14} /> New Campaign
              </button>
            </>
          }
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, background: 'var(--bg)' }}>

          {thisWeek.length > 0 && (
            <section>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                This week
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {thisWeek.map(c => <CampaignCard key={c.id} c={c} onToggle={toggle} />)}
              </div>
            </section>
          )}

          {earlier.length > 0 && (
            <section>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Earlier
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {earlier.map(c => <CampaignCard key={c.id} c={c} onToggle={toggle} />)}
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

        </main>
      </div>

      {showNew && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontWeight: 700, fontSize: 18 }}>New Campaign</h2>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>
            {[
              { label: 'Campaign Name', key: 'name', type: 'text', placeholder: 'e.g. Insurance Renewal March' },
              { label: 'Category', key: 'roomType', type: 'text', placeholder: 'e.g. Insurance, Banking, Survey' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>{f.label}</label>
                <input className="input" type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Language</label>
                <select className="select" style={{ width: '100%' }} value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}>
                  {Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>AI Agent</label>
                <select className="select" style={{ width: '100%' }}>
                  <option>Priya AI (Hindi)</option>
                  <option>Arjun AI (English)</option>
                  <option>Kavya AI (Tamil)</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Call Script</label>
              <textarea className="input" rows={4} placeholder="Hello, I am calling from..." style={{ resize: 'none' }} value={form.script} onChange={e => setForm(p => ({ ...p, script: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setShowNew(false)}>Create Campaign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignCard({ c, onToggle }: { c: Campaign; onToggle: (id: string) => void }) {
  const progress = Math.round((c.called / c.totalContacts) * 100);
  const convRate = c.called > 0 ? ((c.converted / c.called) * 100).toFixed(1) : '0';
  const emoji = CATEGORY_EMOJI[c.roomType] || '📞';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer', transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'var(--accent-soft)',
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
          {LANG[c.language]} · {c.totalContacts.toLocaleString()} contacts
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
        <span className="badge badge-gray">Conv: {convRate}%</span>
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
