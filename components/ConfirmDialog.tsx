"use client";
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * ConfirmDialog — small centered modal for destructive confirmations.
 *
 * Rendered from a parent that owns the open/close state. The parent
 * also owns the action — when the user confirms, ConfirmDialog calls
 * onConfirm, the parent runs the work, then sets open=false.
 *
 * Visual tone:
 *   - Solid red icon block + red confirm button when `danger`. We're
 *     not subtle here — destructive confirmations should look distinct
 *     so people don't muscle-memory their way through them.
 *   - The dialog catches clicks on the backdrop to close, but never
 *     auto-closes on confirm. The parent decides when to close, after
 *     the async work resolves.
 *
 * Inline error state:
 *   When `error` is set, the dialog shows the message inline above the
 *   buttons and replaces "Confirm" with "Close" (the original action
 *   isn't going to succeed without the user fixing something else first).
 *   This keeps the error attached to the action it failed during, rather
 *   than leaking out as a separate banner that ends up rendering BEHIND
 *   the modal — which is what happened before this prop existed.
 *
 * Keyboard:
 *   - Escape closes (calls onCancel).
 *   - Enter triggers onConfirm if not loading and not in error state.
 *
 * Why a custom modal instead of window.confirm():
 *   window.confirm shows OS chrome that doesn't match anything else in
 *   the app and is uncustomisable. This stays inside our visual language
 *   and lets us add a loading state on the confirm button while the
 *   delete request is in flight, plus the inline error state above.
 */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tints the icon and confirm button red. Default true. */
  danger?: boolean;
  /** Show a loading spinner on the confirm button + disable both buttons. */
  loading?: boolean;
  /**
   * If set, the dialog shows this error inline and converts itself to
   * an acknowledgement (single "Close" button). Use this when the
   * confirm action failed in a way the user has to address before
   * retrying — typically a 409 from the server (e.g. "in use by N
   * campaigns, remove from those first").
   */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  loading = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Keyboard handling. Listening at document level rather than on the
  // dialog itself so it works even if focus is somewhere odd.
  //
  // When an error is set, Enter should also close (there's nothing to
  // confirm anymore — the buttons collapse to a single Close).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && !loading) {
        e.preventDefault();
        if (error) onCancel();
        else onConfirm();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, loading, onCancel, onConfirm, error]);

  if (!open) return null;

  return (
    <div
      // Backdrop. Click outside the dialog to cancel — unless we're in
      // the middle of an async action, in which case ignore.
      onClick={() => { if (!loading) onCancel(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 17, 23, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'cdFadeIn 0.15s ease-out',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cd-title"
        // Stop the click from bubbling to the backdrop (which would close
        // the dialog). The dialog body shouldn't dismiss on its own clicks.
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, calc(100% - 32px))',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 20px 60px -10px rgba(15, 17, 23, 0.25)',
          animation: 'cdScaleIn 0.18s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: danger ? 'var(--red-soft)' : 'var(--accent-soft)',
            color: danger ? 'var(--red)' : 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={18} />
          </div>
          <div style={{ flex: 1, paddingTop: 2 }}>
            <h3 id="cd-title" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0, marginBottom: 6 }}>
              {title}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>
              {message}
            </p>
          </div>
        </div>

        {/* Inline error region — only renders when the parent passes an
            `error`. Sits above the buttons so the user reads the cause
            before deciding what to do. Red-soft background mirrors the
            page-level ErrorBanner so the visual language stays consistent. */}
        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              background: 'var(--red-soft)',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: 'var(--red)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {/* In the error state we collapse to a single "Close" button —
              there's nothing to confirm anymore, the action can't succeed
              until the user resolves whatever the error described. */}
          {error ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                height: 36,
                padding: '0 14px',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg4)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
              autoFocus
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                style={{
                  height: 36,
                  padding: '0 14px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                style={{
                  height: 36,
                  padding: '0 14px',
                  background: danger ? 'var(--red)' : 'var(--accent)',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = loading ? '0.7' : '1'; }}
              >
                {loading ? '…' : confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes cdFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cdScaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
