"use client";
import { useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Download, Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

/**
 * RecordingPlayerModal — centered modal that streams a call recording.
 *
 * Lifecycle:
 *   1. open=true → fetch /api/calls/{id}/recording (loading state)
 *   2. 200 with url → audio loads, controls enable
 *   3. 202 pending → show "Processing recording…" with retry button
 *   4. 404 → show "No recording available"
 *   5. close → audio element pauses, src cleared (to actually stop the
 *      bytes from continuing to download in the background)
 *
 * Why we don't use <audio controls>:
 *   The native control bar is not themable across browsers. Chrome's
 *   looks fine, Firefox's doesn't, Safari's is its own thing. Custom
 *   controls let us match the rest of the app and add useful bits the
 *   native player skips — playback speed, jump-back-10s for QA review.
 *
 * Why fetch the URL on open instead of caching:
 *   Signed URLs expire after 5 min. If we cached one in component state
 *   and the user kept the modal open longer than that, a seek operation
 *   would 403. Re-fetching on open guarantees a fresh 5-min window.
 *   For sessions longer than 5 min we'd add a refresh-on-403 handler,
 *   but typical QA review is <2 min per call so this is fine for now.
 *
 * Why stopPropagation on the modal body:
 *   Clicking the audio scrubber (or any control inside) would otherwise
 *   bubble up to the backdrop and dismiss the modal mid-playback. The
 *   stopPropagation handler on the dialog body absorbs all these.
 */

interface RecordingPlayerModalProps {
  open: boolean;
  onClose: () => void;
  callId: string | null;
  /** Optional — shown in the modal header. Falls back to "Call recording". */
  contactName?: string;
  contactPhone?: string;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; bytes: number | null }
  | { status: 'pending' }       // recording exists upstream but not in R2 yet
  | { status: 'unavailable' }   // 404 — no recording at all
  | { status: 'error'; message: string };

export default function RecordingPlayerModal({
  open,
  onClose,
  callId,
  contactName,
  contactPhone,
}: RecordingPlayerModalProps) {
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'idle' });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.25 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Fetch the signed URL when the modal opens ────────────────
  useEffect(() => {
    if (!open || !callId) {
      // Reset state on close so a stale URL/error doesn't flash next time
      setFetchState({ status: 'idle' });
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    let cancelled = false;
    setFetchState({ status: 'loading' });

    fetch(`/api/calls/${callId}/recording`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 202) {
          setFetchState({ status: 'pending' });
          return;
        }
        if (res.status === 404) {
          setFetchState({ status: 'unavailable' });
          return;
        }
        if (!res.ok) {
          setFetchState({ status: 'error', message: `Failed to load (${res.status})` });
          return;
        }
        const data = await res.json();
        if (!data.url) {
          setFetchState({ status: 'error', message: 'Server returned no URL' });
          return;
        }
        setFetchState({ status: 'ready', url: data.url, bytes: data.bytes ?? null });
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchState({ status: 'error', message: err.message || 'Network error' });
      });

    return () => {
      cancelled = true;
    };
  }, [open, callId]);

  // ─── Keyboard: Esc closes, Space toggles play ────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === ' ' && fetchState.status === 'ready') {
        // Don't hijack space if the user is typing in an input. The
        // calls page doesn't have inputs in the modal, but defensive.
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        togglePlay();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchState.status]);

  // ─── Audio element callbacks ──────────────────────────────────
  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };
  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };
  const onEnded = () => {
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seek = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(
      0,
      Math.min(audioRef.current.duration || 0, seconds)
    );
    setCurrentTime(audioRef.current.currentTime);
  };

  const jumpBack = () => seek(currentTime - 10);

  const setSpeed = (rate: 1 | 1.25 | 1.5 | 2) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  const handleDownload = () => {
    if (!callId) return;
    // Fetch a download-flavoured URL (Content-Disposition: attachment)
    // and trigger a download. The browser handles the rest.
    fetch(`/api/calls/${callId}/recording?download=1`)
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          // Anchor click is more reliable than window.location.href for
          // download — the latter sometimes opens audio inline depending
          // on browser-sniffing of Content-Disposition.
          const a = document.createElement('a');
          a.href = data.url;
          a.click();
        }
      })
      .catch((err) => console.error('Download failed:', err));
  };

  // Retry fetching the signed URL — used by the "Processing recording"
  // pending state and by the error state.
  const retry = () => {
    if (!callId) return;
    setFetchState({ status: 'loading' });
    fetch(`/api/calls/${callId}/recording`)
      .then(async (res) => {
        if (res.status === 202) {
          setFetchState({ status: 'pending' });
          return;
        }
        if (res.status === 404) {
          setFetchState({ status: 'unavailable' });
          return;
        }
        if (!res.ok) {
          setFetchState({ status: 'error', message: `Failed to load (${res.status})` });
          return;
        }
        const data = await res.json();
        setFetchState({ status: 'ready', url: data.url, bytes: data.bytes ?? null });
      })
      .catch((err) => {
        setFetchState({ status: 'error', message: err.message || 'Network error' });
      });
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 17, 23, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'rpFadeIn 0.15s ease-out',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rp-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, calc(100% - 32px))',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 60px -10px rgba(15, 17, 23, 0.25)',
          animation: 'rpScaleIn 0.18s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 id="rp-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0, marginBottom: 4 }}>
              {contactName || 'Call recording'}
            </h3>
            {contactPhone && (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{contactPhone}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'transparent', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text3)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — branches per state */}
        {fetchState.status === 'loading' && (
          <CenteredMessage>
            <Loader2 size={20} className="rp-spin" style={{ color: 'var(--text3)' }} />
            <span>Loading recording…</span>
          </CenteredMessage>
        )}

        {fetchState.status === 'pending' && (
          <CenteredMessage>
            <Loader2 size={20} className="rp-spin" style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Processing recording…</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                The call ended recently and the audio is still being ingested.
                This usually takes a few seconds.
              </div>
            </div>
            <button onClick={retry} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
              <RotateCcw size={12} /> Check again
            </button>
          </CenteredMessage>
        )}

        {fetchState.status === 'unavailable' && (
          <CenteredMessage>
            <AlertCircle size={20} style={{ color: 'var(--text3)' }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No recording available</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                This call doesn&apos;t have an audio recording.
                It may have failed before audio was captured, or recording was disabled.
              </div>
            </div>
          </CenteredMessage>
        )}

        {fetchState.status === 'error' && (
          <CenteredMessage>
            <AlertCircle size={20} style={{ color: 'var(--red)' }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Couldn&apos;t load recording</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{fetchState.message}</div>
            </div>
            <button onClick={retry} className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}>
              <RotateCcw size={12} /> Retry
            </button>
          </CenteredMessage>
        )}

        {fetchState.status === 'ready' && (
          <>
            <audio
              ref={audioRef}
              src={fetchState.url}
              preload="metadata"
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              style={{ display: 'none' }}
            />

            {/* Progress bar — click-to-seek */}
            <div
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={duration || 0}
              aria-valuenow={currentTime}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const ratio = (e.clientX - rect.left) / rect.width;
                seek(ratio * (duration || 0));
              }}
              style={{
                height: 6,
                background: 'var(--bg3)',
                borderRadius: 3,
                cursor: 'pointer',
                position: 'relative',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: duration ? `${(currentTime / duration) * 100}%` : '0%',
                  background: 'var(--accent)',
                  borderRadius: 3,
                  transition: 'width 0.1s linear',
                }}
              />
            </div>

            {/* Time + controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'ui-monospace, monospace' }}>
                {formatDuration(currentTime)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'ui-monospace, monospace' }}>
                {formatDuration(duration)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
              <button
                onClick={jumpBack}
                aria-label="Jump back 10 seconds"
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'var(--bg3)', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text2)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
              >
                <RotateCcw size={14} />
              </button>

              <button
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--accent)', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'white',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
              </button>

              {/* Playback speed selector */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg3)', borderRadius: 8, padding: 2 }}>
                {([1, 1.25, 1.5, 2] as const).map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setSpeed(rate)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: 'none',
                      background: playbackRate === rate ? 'var(--bg2)' : 'transparent',
                      color: playbackRate === rate ? 'var(--text)' : 'var(--text3)',
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Footer: download + size */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {fetchState.bytes ? `${(fetchState.bytes / 1024 / 1024).toFixed(1)} MB` : ''}
              </span>
              <button onClick={handleDownload} className="btn btn-ghost btn-sm">
                <Download size={12} /> Download
              </button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes rpFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rpScaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        :global(.rp-spin) { animation: rpSpin 0.9s linear infinite; }
        @keyframes rpSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// Small helper for the stateless message states (loading, pending, error).
// Keeps the visual rhythm consistent across all four non-ready states.
function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      padding: '32px 16px',
      textAlign: 'center',
      fontSize: 13,
      color: 'var(--text2)',
    }}>
      {children}
    </div>
  );
}
