"use client";
import { useState, useEffect } from 'react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import RecordingPlayerModal from '@/components/RecordingPlayerModal';
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

  // Recording player modal state. We track the full call so the modal
  // can show contact name/phone in its header without a second fetch.
  // null means the modal is closed.
  const [playingCall, setPlayingCall] = useState<Call | null>(null);

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

  // Direct download — fetches a download-flavoured signed URL and
  // triggers it via an anchor click. Same pattern as the modal's
  // download button, exposed inline for users who don't want to open
  // the player just to grab the file.
  const handleDirectDownload = async (callId: string) => {
    try {
      const res = await fetch(`/api/calls/${callId}/recording?download=1`);
      if (!res.ok) {
        console.warn('Download URL fetch failed:', res.status);
        return;
      }
      const data = await res.json();
      if (data.url) {
        const a = document.createElement('a');
        a.href = data.url;
        a.click();
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <>
      <Topbar crumbs={[{ label: 'Dashboard', href: '/app/dashboard' }, { label: 'Live Calls' }]} />

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
                {filtered.length > 0 ? filtered.map(call => {
                  // A call has a recording available if EITHER the legacy
                  // recording_url is set (still being ingested) OR R2 has it.
                  // The modal handles the pending case gracefully, so we
                  // show the Play button as long as there's any signal of
                  // audio existing. Calls in 'queued' or 'in-progress'
                  // status can't have recordings yet.
                  const hasRecording =
                    !!call.recordingUrl &&
                    call.status !== 'queued' &&
                    call.status !== 'in-progress' &&
                    call.status !== 'ringing';
                  return (
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
                          {hasRecording && (
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => setPlayingCall(call)}
                              title="Play recording"
                              aria-label="Play recording"
                            >
                              <Play size={12} />
                            </button>
                          )}
                          {hasRecording && (
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => handleDirectDownload(call.id)}
                              title="Download recording"
                              aria-label="Download recording"
                            >
                              <Download size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
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

        {/* Recording player modal — driven by playingCall state.
            Closing the modal nulls playingCall, which the modal's own
            useEffect notices and pauses/clears the audio element. */}
        <RecordingPlayerModal
          open={!!playingCall}
          onClose={() => setPlayingCall(null)}
          callId={playingCall?.id ?? null}
          contactName={playingCall?.contactName}
          contactPhone={playingCall?.contactPhone}
        />
    </>
  );
}
