"use client";
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Loader2, Volume2, AlertCircle, RotateCw } from 'lucide-react';
import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteAudioTrack,
  RemoteTrackPublication,
  Track,
  ConnectionState,
  Participant,
  TranscriptionSegment,
  createAudioAnalyser,
} from 'livekit-client';
import type { Agent } from '@/types';

/**
 * TalkToAgentDialog — modal that lets the BPO manager have a live
 * voice conversation with one of their AI agents, in the browser.
 *
 * What this is for:
 *   The BPO manager just edited an agent's voice/personality/script
 *   and wants to hear what it sounds like before pushing real calls
 *   to it. Instead of placing an outbound phone call (which costs
 *   money and needs TeleCMI configured), they click "Test Call" on
 *   the agent card and have the conversation right here.
 *
 * Pipeline (zoomed out):
 *   browser  →  /api/livekit/token  (mints token + sets room metadata)
 *   browser  →  LiveKit Cloud       (joins room with token)
 *   worker   →  LiveKit Cloud       (auto-dispatched, joins same room)
 *   worker reads room metadata → configures Sarvam STT + OpenAI + Sarvam TTS
 *   audio flows both ways via WebRTC
 *
 * UX features:
 *   - Live call duration timer (header, top right of agent identity)
 *   - "Thinking..." indicator while the agent composes its first reply
 *   - Real-time audio level visualizer near the mic button
 *   - Auto-reconnect with countdown when the connection blips
 *   - Pulsing avatar / waveform when the agent speaks
 *   - SMS-style transcript bubbles, interim → final styling
 *
 * What's deliberately simple:
 *   - We don't subscribe to all data tracks, just audio. No video.
 *   - Mute/unmute toggles the mic locally; no server round-trip.
 *   - Live transcription comes from LiveKit's transcription events
 *     (which the worker emits as the Sarvam STT/TTS produce text).
 *
 * Lifecycle quirks:
 *   - On unmount we MUST disconnect the room. Otherwise the worker
 *     will sit in the room until LiveKit's idle timeout and cost us
 *     agent-session minutes for nothing.
 *   - We tear down the AudioContext from createAudioAnalyser too —
 *     leaking AudioContexts is a slow but real memory leak in SPAs
 *     where the user opens the dialog many times.
 */

interface TalkToAgentDialogProps {
  /** Whether the dialog is visible. Owned by the parent. */
  open: boolean;
  /** The agent the user wants to test. */
  agent: Agent | null;
  /** Called when the user clicks End or backdrop. */
  onClose: () => void;
}

type CallState =
  | 'idle'           // nothing started yet
  | 'connecting'     // fetching token, opening WebRTC for the first time
  | 'connected'      // mic is live, agent should be in the room
  | 'reconnecting'   // we lost the connection, LiveKit is retrying
  | 'ending'         // disconnect in progress
  | 'error';         // something went wrong; show message + retry

interface TranscriptLine {
  /** Stable id from LiveKit's transcription event, used as React key. */
  id: string;
  /** Who said it. 'You' for the user, the agent name otherwise. */
  speaker: string;
  /** Whether this is the user (true) or the agent (false). Drives styling. */
  isUser: boolean;
  /** Current best transcript text. May update as STT firms up the segment. */
  text: string;
  /** True once LiveKit marks the segment final. Italic-ish styling while interim. */
  final: boolean;
}

export default function TalkToAgentDialog({ open, agent, onClose }: TalkToAgentDialogProps) {
  // ─── State ─────────────────────────────────────────────────────
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  // Elapsed seconds since the call started. Resets when the dialog
  // opens. We tick this every second; not 60fps because the timer is
  // displayed as mm:ss and finer resolution would just spin React for
  // no visible reason.
  const [elapsedSec, setElapsedSec] = useState(0);
  // The tip of the live audio bars near the mic button. 0..1 scale.
  // Drives a small visualizer that animates at ~60fps via rAF, NOT
  // React state — we render directly into a ref'd DOM node. Storing
  // it in state would re-render the whole dialog 60 times a second.
  const visualizerBarsRef = useRef<HTMLDivElement | null>(null);

  // The Room object. Stored in a ref because nothing else needs to
  // re-render when it changes — the events update React state directly.
  const roomRef = useRef<Room | null>(null);
  // Hidden <audio> element where remote (agent) audio gets attached.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Auto-scroll the transcript pane to the bottom when new lines arrive.
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  // Cleanup hook for the audio analyser (Web Audio API). Set when we
  // attach analyser to the agent's audio track; called when we
  // disconnect or when a new agent track replaces the old one.
  const analyserCleanupRef = useRef<(() => void) | null>(null);

  // ─── Effect: connect when opened, disconnect when closed ───────
  //
  // We start the call inside this effect rather than on a button
  // click because the dialog opening IS the user's intent — they
  // already clicked "Test Call". One less click is better UX.
  useEffect(() => {
    if (!open || !agent) return;

    let cancelled = false;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    // ─── Wire up event handlers BEFORE connecting ────────────
    // so we don't miss the initial bursts of state.

    room.on(RoomEvent.ConnectionStateChanged, (newState) => {
      if (cancelled) return;
      // LiveKit's enum values: Disconnected, Connecting, Connected,
      // Reconnecting, SignalReconnecting. We map to our smaller set:
      //   Connecting → 'connecting' (only on first attempt; we set
      //                 this manually before calling connect())
      //   Connected → 'connected'
      //   Reconnecting/SignalReconnecting → 'reconnecting'
      //   Disconnected → either 'idle' (we asked) or revert (mid-call drop)
      if (newState === ConnectionState.Connected) {
        setState('connected');
      } else if (
        newState === ConnectionState.Reconnecting ||
        newState === ConnectionState.SignalReconnecting
      ) {
        setState('reconnecting');
      } else if (newState === ConnectionState.Disconnected) {
        setState((prev) => (prev === 'ending' ? 'idle' : prev));
      }
    });

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: Participant) => {
      if (cancelled) return;
      if (track.kind !== Track.Kind.Audio) return;
      if (!participant.identity.startsWith('agent-')) return;

      // Attach to the hidden <audio> element so the user hears it.
      const el = audioElRef.current;
      if (!el) return;
      track.attach(el);
      el.play().catch((e) => console.warn('Audio autoplay blocked:', e));

      // Wire up an audio analyser for the visualizer. createAudioAnalyser
      // returns the analyser plus a cleanup function that closes the
      // underlying AudioContext. We rebuild it for each new agent track.
      //
      // The track guard above (kind === Audio) means we know this is
      // a RemoteAudioTrack at runtime; the cast tells TypeScript that
      // too without forcing a structural check.
      analyserCleanupRef.current?.();
      try {
        const { analyser, cleanup } = createAudioAnalyser(track as RemoteAudioTrack, {
          smoothingTimeConstant: 0.7,
          fftSize: 64,
        });

        // rAF loop that reads the analyser and writes bar heights into
        // the DOM directly. Stopped via the cleanup function.
        const data = new Uint8Array(analyser.frequencyBinCount);
        let raf = 0;
        const tick = () => {
          analyser.getByteFrequencyData(data);
          // Average 8 frequency buckets into 8 bars. We only render 8
          // bars in the visualizer; averaging avoids flicker.
          const bars = visualizerBarsRef.current?.children;
          if (bars) {
            const bucket = Math.floor(data.length / bars.length);
            for (let i = 0; i < bars.length; i++) {
              let sum = 0;
              for (let j = 0; j < bucket; j++) sum += data[i * bucket + j];
              const avg = sum / bucket / 255; // 0..1
              // Bar heights between 4 and 28 pixels — small enough not
              // to dominate the footer, big enough to read at a glance.
              const height = Math.max(4, Math.round(avg * 28));
              (bars[i] as HTMLElement).style.height = `${height}px`;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        // Wrap cleanup so it stops the rAF loop too. The original
        // cleanup returns a Promise<void> that closes the AudioContext.
        // We swallow that promise inside our wrapped fn since callers
        // only need synchronous teardown.
        const inner = cleanup;
        analyserCleanupRef.current = () => {
          cancelAnimationFrame(raf);
          inner().catch((e) => console.warn('analyser cleanup failed:', e));
        };
      } catch (e) {
        // Visualizer is not critical — if Web Audio is unhappy, we
        // log and continue. The conversation still works.
        console.warn('Audio analyser unavailable:', e);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        track.detach();
        analyserCleanupRef.current?.();
        analyserCleanupRef.current = null;
      }
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      if (cancelled) return;
      const isAgentSpeaking = speakers.some((s) => s.identity.startsWith('agent-'));
      setAgentSpeaking(isAgentSpeaking);
    });

    room.on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant) => {
      if (cancelled) return;
      const isUser = !participant?.identity?.startsWith('agent-');
      const speaker = isUser ? 'You' : (agent.name || 'Assistant');

      setTranscript((prev) => {
        const next = [...prev];
        for (const seg of segments) {
          const idx = next.findIndex((l) => l.id === seg.id);
          if (idx >= 0) {
            next[idx] = { ...next[idx], text: seg.text, final: seg.final };
          } else {
            next.push({
              id: seg.id,
              speaker,
              isUser,
              text: seg.text,
              final: seg.final,
            });
          }
        }
        return next;
      });
    });

    // ─── Actually connect ──────────────────────────────────
    (async () => {
      setState('connecting');
      setError(null);
      setTranscript([]);
      setMuted(false);
      setElapsedSec(0);

      try {
        const tokenRes = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: agent.id }),
        });
        if (!tokenRes.ok) {
          const data = await tokenRes.json().catch(() => ({}));
          throw new Error(data.error || 'Could not start a voice session');
        }
        const { token, url } = await tokenRes.json();
        if (cancelled) return;

        await room.connect(url, token);
        if (cancelled) return;

        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err: any) {
        if (cancelled) return;
        console.error('TalkToAgent connect failed:', err);
        let msg = err?.message || 'Failed to start the voice session';
        if (err?.name === 'NotAllowedError') {
          msg = 'Microphone access was denied. Allow it in your browser settings and try again.';
        } else if (err?.name === 'NotFoundError') {
          msg = 'No microphone found. Plug one in and try again.';
        }
        setError(msg);
        setState('error');
      }
    })();

    // Cleanup: when the dialog closes (or component unmounts), tear
    // down the room AND any audio analyser AudioContext.
    return () => {
      cancelled = true;
      analyserCleanupRef.current?.();
      analyserCleanupRef.current = null;
      const r = roomRef.current;
      roomRef.current = null;
      if (r) {
        r.disconnect().catch((e) => console.warn('Room disconnect failed:', e));
      }
      const el = audioElRef.current;
      if (el) {
        el.pause();
        el.srcObject = null;
      }
    };
  }, [open, agent]);

  // ─── Effect: tick the call duration timer ──────────────────────
  // Only ticks while we're 'connected' so reconnects don't add to the
  // visible duration (a small white lie that feels right — users
  // don't want to see their call timer paused while they're confused
  // about why audio dropped).
  useEffect(() => {
    if (state !== 'connected') return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // ─── Effect: keep transcript pane scrolled to bottom ──────────
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  // ─── Effect: Esc to end the call ───────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleEndCall();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Actions ──────────────────────────────────────────────────

  const handleToggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    setMuted(next);
    try {
      await room.localParticipant.setMicrophoneEnabled(!next);
    } catch (e) {
      console.warn('Mic toggle failed:', e);
      setMuted(!next);
    }
  };

  const handleEndCall = () => {
    setState('ending');
    onClose();
  };

  if (!open || !agent) return null;

  // ─── Derived display values ───────────────────────────────────
  // "Priya (Female)" → "Priya" — the parenthetical gender tag is
  // useful in the dropdown but redundant in the dialog header.
  const personaLabel = (agent.voice || '').replace(/\s*\([^)]*\)/, '');
  const subtitle = `${personaLabel || 'Assistant'} · ${agent.language || 'Hindi + English'}`;

  // Show "thinking..." only while we're connected, the agent isn't
  // currently speaking, and there are no transcript lines yet. After
  // the first exchange this never shows again.
  const showThinking =
    state === 'connected' && transcript.length === 0 && !agentSpeaking;

  return (
    <div
      onClick={handleEndCall}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 17, 23, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'ttaFadeIn 0.15s ease-out',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tta-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, calc(100% - 32px))',
          maxHeight: 'min(640px, calc(100% - 32px))',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 20px 60px -10px rgba(15, 17, 23, 0.3)',
          animation: 'ttaScaleIn 0.18s ease-out',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Avatar block. Pulses with concentric rings while the
                agent is speaking — much more alive than the static
                volume icon. The rings are pseudo-elements driven by
                CSS so they animate independently of React. */}
            <div
              className={agentSpeaking ? 'tta-avatar-speaking' : ''}
              style={{
                position: 'relative',
                width: 40,
                height: 40,
                borderRadius: 10,
                background: agentSpeaking ? 'var(--accent)' : 'var(--bg3)',
                color: agentSpeaking ? 'white' : 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              <Volume2 size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                id="tta-title"
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--text)',
                  margin: 0,
                  marginBottom: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {agent.name || 'Assistant'}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{subtitle}</div>
            </div>
            {/* Right cluster: timer + status pill, stacked vertically
                so even on narrow widths they don't bump into the title. */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <StatusPill state={state} />
              {/* Show timer only when we have one running. While
                  connecting/error/idle there's nothing to count. */}
              {(state === 'connected' || state === 'reconnecting') && (
                <div
                  aria-label="Call duration"
                  style={{
                    fontSize: 12,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--text3)',
                    fontWeight: 500,
                  }}
                >
                  {formatElapsed(elapsedSec)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body — transcript or status message */}
        <div
          ref={transcriptRef}
          style={{
            flex: 1,
            minHeight: 220,
            maxHeight: 360,
            overflowY: 'auto',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {state === 'connecting' && transcript.length === 0 && (
            <CenterMessage>
              <Loader2 size={20} className="spin" style={{ color: 'var(--accent)' }} />
              <div>Connecting to your assistant…</div>
            </CenterMessage>
          )}

          {state === 'reconnecting' && (
            <CenterMessage>
              <RotateCw size={20} className="spin" style={{ color: 'var(--accent)' }} />
              <div>Reconnecting…</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Hold on — restoring your conversation.
              </div>
            </CenterMessage>
          )}

          {state === 'error' && (
            <CenterMessage error>
              <AlertCircle size={20} style={{ color: 'var(--red)' }} />
              <div style={{ color: 'var(--red)' }}>{error || 'Something went wrong.'}</div>
            </CenterMessage>
          )}

          {showThinking && <ThinkingIndicator agentName={agent.name || 'Assistant'} />}

          {transcript.map((line) => (
            <TranscriptBubble key={line.id} line={line} />
          ))}
        </div>

        {/* Footer — visualizer + mic toggle + end call */}
        <div
          style={{
            padding: '16px 24px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            background: 'var(--bg)',
          }}
        >
          {/* Audio visualizer — 8 vertical bars that respond to the
              agent's voice. Sits to the LEFT of the mic so the user's
              eye reads:  [agent audio] → [my mic] → [end].
              When idle (state !== connected, or agent silent) the
              bars rest at 4px height. */}
          <div
            ref={visualizerBarsRef}
            aria-hidden
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              height: 32,
              width: 60,
              opacity: state === 'connected' ? 1 : 0.3,
              transition: 'opacity 0.2s',
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: 4,
                  borderRadius: 2,
                  background: agentSpeaking ? 'var(--accent)' : 'var(--text3)',
                  transition: 'height 80ms linear, background 0.2s',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleToggleMute}
            disabled={state !== 'connected'}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: muted ? 'var(--red-soft)' : 'var(--bg2)',
              border: muted ? '1px solid var(--red)' : '1px solid var(--border)',
              color: muted ? 'var(--red)' : 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: state !== 'connected' ? 'not-allowed' : 'pointer',
              opacity: state !== 'connected' ? 0.5 : 1,
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            type="button"
            onClick={handleEndCall}
            aria-label="End call"
            style={{
              height: 48,
              padding: '0 22px',
              borderRadius: 24,
              background: 'var(--red)',
              border: 'none',
              color: 'white',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
          >
            <PhoneOff size={16} />
            End call
          </button>
        </div>

        {/* Hidden audio sink for the agent's voice. */}
        <audio ref={audioElRef} autoPlay playsInline style={{ display: 'none' }} />
      </div>

      <style jsx>{`
        @keyframes ttaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes ttaScaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        /* Concentric ring pulse around the avatar while the agent
           speaks. Two rings, offset, fading outward. Looks more
           "active" than the simple shadow we had before. */
        :global(.tta-avatar-speaking)::before,
        :global(.tta-avatar-speaking)::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 2px solid var(--accent);
          opacity: 0;
          animation: ttaRipple 1.4s ease-out infinite;
          pointer-events: none;
        }
        :global(.tta-avatar-speaking)::after {
          animation-delay: 0.7s;
        }
        @keyframes ttaRipple {
          0%   { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.55); }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function StatusPill({ state }: { state: CallState }) {
  // Shows the connection state as a small coloured pill. We've added
  // 'reconnecting' since v1 so it now has its own distinct amber
  // colour — different from 'connecting' (accent) and 'error' (red).
  const config: Record<CallState, { label: string; color: string; bg: string }> = {
    idle:         { label: 'Idle',         color: 'var(--text3)', bg: 'var(--bg3)' },
    connecting:   { label: 'Connecting',   color: 'var(--accent)', bg: 'var(--accent-soft)' },
    connected:    { label: 'Live',         color: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)' },
    reconnecting: { label: 'Reconnecting', color: '#b45309', bg: 'rgba(245, 158, 11, 0.12)' },
    ending:       { label: 'Ending',       color: 'var(--text3)', bg: 'var(--bg3)' },
    error:        { label: 'Error',        color: 'var(--red)', bg: 'var(--red-soft)' },
  };
  const c = config[state];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '4px 10px',
        borderRadius: 999,
        color: c.color,
        background: c.bg,
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  );
}

function CenterMessage({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div
      style={{
        margin: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
        padding: 16,
        color: error ? 'var(--red)' : 'var(--text2)',
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Three-dots typing indicator labelled with the agent's name.
 * Shown only between "connected" and "first transcript line", which
 * is exactly the dead-air window where the user used to wonder if
 * anything was happening.
 */
function ThinkingIndicator({ agentName }: { agentName: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 14px',
          borderRadius: 12,
          background: 'var(--bg3)',
          color: 'var(--text2)',
          fontSize: 13,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
          opacity: 0.7,
        }}>
          {agentName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 16 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--text3)',
                animation: `ttaTypingDot 1.2s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
      <style jsx>{`
        @keyframes ttaTypingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30%           { opacity: 1;   transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

function TranscriptBubble({ line }: { line: TranscriptLine }) {
  const isUser = line.isUser;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        animation: 'ttaBubbleIn 0.18s ease-out',
      }}
    >
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 13px',
          borderRadius: 14,
          background: isUser ? 'var(--accent)' : 'var(--bg3)',
          color: isUser ? 'white' : 'var(--text)',
          fontSize: 14,
          lineHeight: 1.5,
          // Interim transcripts get a softer look to signal "this might
          // change". Once final, snap to the regular weight.
          opacity: line.final ? 1 : 0.7,
          fontStyle: line.final ? 'normal' : 'italic',
          wordBreak: 'break-word',
          // Subtle elevation so bubbles separate from the background
          // even on busy backgrounds. Only on agent bubbles — user
          // bubbles already have the accent fill to anchor them.
          boxShadow: isUser ? undefined : '0 1px 0 rgba(15, 17, 23, 0.04)',
        }}
      >
        <div style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
          opacity: 0.7,
          marginBottom: 3,
        }}>
          {line.speaker}
        </div>
        {line.text || '…'}
      </div>
      <style jsx>{`
        @keyframes ttaBubbleIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

/** mm:ss formatter for the call duration timer. */
function formatElapsed(totalSec: number): string {
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
