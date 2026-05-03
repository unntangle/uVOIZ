"use client";
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Dropdown — themed replacement for native <select>.
 *
 * Why exist:
 *   Native <select> elements show OS-styled option lists when opened
 *   (white background, blue Windows-default highlight). They cannot be
 *   reliably themed with CSS because most of the markup lives outside
 *   the page (it's drawn by the OS). For a dark-friendly, brand-aware
 *   product surface like ours, that's a jarring break in visual language.
 *
 *   This component renders the entire control in DOM we control, so the
 *   trigger AND the popover use our --bg2 / --border / --accent tokens
 *   and look identical across Windows / macOS / Linux.
 *
 * API:
 *   Mirrors a controlled <select> as closely as possible:
 *     <Dropdown
 *       value={value}
 *       onChange={(v) => setValue(v)}
 *       options={[{ value: 'en', label: 'English' }, ...]}
 *       placeholder="Pick one"
 *     />
 *   Disabled, full-width, and same focus-ring affordance as .input.
 *
 * Behavior:
 *   - Click trigger → popover opens directly below.
 *   - Click outside → close.
 *   - Escape → close.
 *   - Arrow up/down → move highlight, Enter → select.
 *   - Selecting an option closes the popover and calls onChange.
 *
 * Positioning:
 *   The popover is `position: absolute` inside a wrapper that's
 *   `position: relative`. It does NOT use a portal — that's intentional
 *   so it renders inside any modal/wizard surface without needing
 *   to coordinate z-index with portal roots. The trade-off is that if
 *   the dropdown is near the viewport bottom, the popover may clip;
 *   we add `maxHeight: 240` + scroll on the popover to mitigate.
 */

export type DropdownOption = {
  value: string;
  label: string;
  /** Optional secondary text shown smaller next to the label. */
  hint?: string;
};

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Inline width override. Defaults to 100% (fills its container). */
  width?: number | string;
  /** When true, the trigger has the same compact 36px height as `.input`
   *  in the search bar. Defaults to the normal input height. */
  compact?: boolean;
}

export default function Dropdown({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  width = '100%',
  compact = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find(o => o.value === value);

  // Close on outside click. Listening on `mousedown` rather than `click`
  // catches the case where the user clicks a different button — the
  // mousedown fires first, so the dropdown closes before the other
  // button's click handler runs.
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

  // Keyboard nav. Arrow keys move highlight, Enter commits, Escape closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        setHighlightIdx(i => Math.min(options.length - 1, i + 1));
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setHighlightIdx(i => Math.max(0, i - 1));
        e.preventDefault();
      } else if (e.key === 'Enter') {
        if (highlightIdx >= 0 && highlightIdx < options.length) {
          onChange(options[highlightIdx].value);
          setOpen(false);
        }
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, highlightIdx, options, onChange]);

  // When opening, default the highlight to the currently selected option
  // so a user who just wants to confirm their existing choice can press
  // Enter without arrowing through the list.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex(o => o.value === value);
      setHighlightIdx(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  // Auto-scroll the highlighted item into view as the user arrows.
  useEffect(() => {
    if (!open || highlightIdx < 0 || !listRef.current) return;
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  const triggerHeight = compact ? 36 : 42;

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width, fontFamily: 'Inter, sans-serif' }}
    >
      {/* Trigger — visually matches the .input class so a Dropdown sits
          flush next to text inputs without breaking the form rhythm. */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          height: triggerHeight,
          padding: '0 14px',
          background: 'var(--bg2)',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          fontSize: 14,
          color: selected ? 'var(--text)' : 'var(--text3)',
          fontFamily: 'inherit',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--text3)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        />
      </button>

      {/* Popover list. Sits 4px below the trigger to give a tiny visual
          separation. zIndex 50 keeps it above modal cards (which use 10
          or below) but well under any global toast/snackbar layer. */}
      {open && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: triggerHeight + 4,
            left: 0,
            right: 0,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 24px -8px rgba(15, 17, 23, 0.12), 0 4px 12px -4px rgba(15, 17, 23, 0.08)',
            padding: 4,
            maxHeight: 240,
            overflowY: 'auto',
            zIndex: 50,
            animation: 'dropdownIn 0.12s ease-out',
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text3)' }}>
              No options
            </div>
          ) : (
            options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isHighlighted = i === highlightIdx;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    color: 'var(--text)',
                    cursor: 'pointer',
                    background: isHighlighted ? 'var(--bg3)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt.label}
                    </span>
                    {opt.hint && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                        {opt.hint}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
