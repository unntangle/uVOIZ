"use client";
import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Download, Play, Filter } from 'lucide-react';
import { formatDuration, timeAgo } from '@/lib/utils';
import { Call, CallStatus } from '@/types';

const STATUS_BADGE: Record<CallStatus, string> = {
  'in-progress': 'badge-green', ringing: 'badge-amber', completed: 'badge-cyan',
  failed: 'badge-red', 'no-answer': 'badge-gray', queued: 'badge-gray', busy: 'badge-amber',
};
const SENTIMENT_BADGE: Record<string, string> = { positive: 'badge-green', neutral: 'badge-amber', negative: 'badge-red' };

export default function Calls() {
  const [filter, setFilter] = useState<'all' | CallStatus>('all');
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCalls() {
      try {
        const res = await fetch('/api/calls');
        if (res.ok) {
          const data = await res.json();
          setCalls(data.calls || []);
        }
      } catch (err) {
        console.error('Failed to fetch calls:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCalls();
  }, []);

  const filtered = filter === 'all' ? calls : calls.filter(c => c.status === filter);
  const liveCount = calls.filter(c => c.status === 'in-progress').length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/t/calls" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={[{ label: 'Dashboard', href: '/t/dashboard' }, { label: 'Live Calls' }]} />

        <PageHeader
          title="Live Calls"
          subtitle="Real-time monitoring of all active calls"
          actions={
            <button className="btn btn-ghost btn-sm"><Download size={13} /> Export</button>
          }
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)' }}>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Filter size={14} color="var(--text3)" />
            {(['all', 'in-progress', 'completed', 'failed', 'no-answer'] as const).map(s => (
              <button key={s} onClick={() => setFilter(s)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', background: filter === s ? 'var(--accent)' : 'var(--bg3)', color: filter === s ? 'white' : 'var(--text2)', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
                {s === 'all' ? 'All' : s.replace('-', ' ')}
                <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>{s === 'all' ? calls.length : calls.filter(c => c.status === s).length}</span>
              </button>
            ))}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr><th>Contact</th><th>Campaign</th><th>Agent</th><th>Status</th><th>Duration</th><th>Sentiment</th><th>Converted</th><th>Time</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map(call => (
                  <tr key={call.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {call.status === 'in-progress' && <div className="live-dot" />}
                        <div>
                          <div style={{ fontWeight: 600 }}>{call.contactName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{call.contactPhone}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{call.campaignName}</td>
                    <td><span className="badge badge-purple">{call.agentName}</span></td>
                    <td><span className={`badge ${STATUS_BADGE[call.status]}`}>{call.status.replace('-', ' ')}</span></td>
                    <td><span className="mono" style={{ fontSize: 13 }}>{formatDuration(call.duration)}</span></td>
                    <td>{call.sentiment ? <span className={`badge ${SENTIMENT_BADGE[call.sentiment]}`}>{call.sentiment}</span> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>-</span>}</td>
                    <td>{call.converted ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>Yes</span> : <span style={{ color: 'var(--text3)', fontSize: 12 }}>No</span>}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{call.startedAt ? timeAgo(new Date(call.startedAt)) : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {call.recordingUrl && <button className="btn btn-ghost btn-sm btn-icon"><Play size={12} /></button>}
                        {call.recordingUrl && <button className="btn btn-ghost btn-sm btn-icon"><Download size={12} /></button>}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)', fontSize: 14 }}>{loading ? 'Loading calls...' : 'No calls found'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div className="live-dot" />
              <span style={{ fontWeight: 600 }}>Live Calls Monitor</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{liveCount} active</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {calls.filter(c => c.status === 'in-progress' || c.status === 'ringing').map(call => (
                <div key={call.id} style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="live-dot" />
                      <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>LIVE</span>
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text2)' }}>{formatDuration(call.duration)}</span>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{call.contactName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{call.contactPhone}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    {[14,20,16,24,18,22,12,26,16,20,18,24].map((h, i) => (
                      <div key={i} className="wave-bar" style={{ height: `${h}px`, animationDelay: `${i * 0.08}s` }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>Agent: <span style={{ color: 'var(--accent2)' }}>{call.agentName}</span></div>
                </div>
              ))}
              {liveCount === 0 && !loading && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: 12 }}>No live calls active</div>
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
