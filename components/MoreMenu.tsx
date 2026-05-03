"use client";
import { useState, useEffect, useRef } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * MoreMenu — themed kebab-menu popover for card-level actions.
 *
 * Why exist:
 *   AgentCard and CampaignCard each have a 3-dot button that needs to
 *   open a menu of actions (Rename, Duplicate, Delete). We could lean
 *   on a native <select> or a third-party menu library, but neither
 *   matches the rest of our chrome — same problem we hit with the
 *   Dropdown component. Same solution: build a tiny themed popover
 *   that uses our --bg2 / --border / --accent / --red tokens and
 *   looks identical across every OS.
 *
 * API:
 *   <MoreMenu items={[
 *     { label: 'Rename',    onClick: () => ... },
 *     { label: 'Duplicate', onClick: () => ... },
 *     { label: 'Delete',    onClick: () => ..., danger: true },
 *   ]} />
 *
 *   Each item runs its onClick when clicked, then the menu closes. The
 *   `danger` flag flips the row to red so destructive actions read
 *   distinctly without being shouty.
 *
 * Behavior:
 *   - Click the trigger → menu opens to the right edge of the trigger.
 *   - Click outside → close.
 *   - Escape → close.
 *   - Click an item → run its handler, then close.
 *   - Disabled items don't close the menu and their handler doesn't run.
 *
 * Stopping propagation:
 *   The 3-dot trigger lives inside a card that's clickable (opens the
 *   detail view). Without stopPropagation the click would bubble up
 *   and navigate. Same for menu item clicks — clicking "Rename" in
 *   the card shouldn't ALSO open the card.
 */

export type MoreMenuItem = {
  label: string;
  onClick: () => void;
  /** Tints the row red. Use for destructive actions (Delete). */
  danger?: boolean;
  /** Disables the row and dims it. Used for in-flight async operations. */
  disabled?: boolean;
};

interface MoreMenuProps {
  items: MoreMenuItem[];
  /** Aria label for the trigger. Defaults to "More actions". */
  ariaLabel?: string;
}

export default function MoreMenu({ items, ariaLabel = 'More actions' }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click. Listening on `mousedown` (not `click`) catches
  // the case where the user clicks a different button — mousedown fires
  // first so the menu closes before that button's click handler runs.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Escape closes the menu. Keeps keyboard parity with the Dropdown.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          // Card-level click handlers (e.g. "open detail view") would
          // fire too without this. The 3-dot button is its own action,
          // not part of the card body.
          e.stopPropagation();
          setOpen(o => !o);
        }}
        style={{
          background: open ? 'var(--bg3)' : 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text3)',
          padding: 4,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg3)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = open ? 'var(--bg3)' : 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'var(--text3)';
        }}
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          // Stop card-level click bubbling here too — the popover sits
          // inside the card, so clicks on its margin would otherwise
          // fall through to the card's onClick.
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 160,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 24px -8px rgba(15, 17, 23, 0.12), 0 4px 12px -4px rgba(15, 17, 23, 0.08)',
            padding: 4,
            zIndex: 50,
            fontFamily: 'Inter, sans-serif',
            animation: 'menuIn 0.12s ease-out',
          }}
        >
          {items.map((item, i) => (
            <button
              key={`${item.label}-${i}`}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                item.onClick();
                setOpen(false);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: 'inherit',
                color: item.danger ? 'var(--red)' : 'var(--text)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                opacity: item.disabled ? 0.5 : 1,
                transition: 'background 0.1s',
                display: 'block',
              }}
              onMouseEnter={(e) => {
                if (item.disabled) return;
                (e.currentTarget as HTMLElement).style.background = item.danger
                  ? 'var(--red-soft)'
                  : 'var(--bg3)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes menuIn {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
