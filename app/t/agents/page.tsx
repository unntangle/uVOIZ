"use client";
import { useState, useEffect, useRef } from 'react';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import Dropdown from '@/components/Dropdown';
import MoreMenu from '@/components/MoreMenu';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Bot, Phone, TrendingUp, Clock, Plus, Search, Play, Loader2 } from 'lucide-react';
import { formatDuration, formatPercent } from '@/lib/utils';
import { Agent } from '@/types';

/**
 * NAMING NOTE — display label is "Assistants" (or "Assistant" singular).
 * Internal types/identifiers (Agent, AgentCard, agentId, /api/agents,
 * /app/agents) all still say "agent". Renaming the type/route/DB layer
 * is a much bigger change with no user-facing benefit; the UI label is
 * the only thing the customer reads. If at some point we do rename
 * internals too, this is the file that will need the most edits.
 */

const VOICES = ['Priya (Female)', 'Arjun (Male)', 'Kavya (Female)', 'Rahul (Male)', 'Deepa (Female)', 'Vikram (Male)'];
const LANGUAGES = ['English', 'Hindi + English', 'Tamil + English', 'Telugu + English', 'Kannada + English', 'Marathi + English'];
const PERSONALITIES = ['Friendly & Empathetic', 'Confident & Persuasive', 'Professional & Concise', 'Warm & Patient', 'Energetic & Enthusiastic'];

// Pre-built option arrays for the Dropdown component. Defined at module
// scope so the references stay stable across renders — passing freshly
// constructed arrays each render would make the Dropdown's internal
// `useEffect` deps churn unnecessarily.
const VOICE_OPTIONS = VOICES.map(v => ({ value: v, label: v }));
const LANGUAGE_OPTIONS = LANGUAGES.map(l => ({ value: l, label: l }));
const PERSONALITY_OPTIONS = PERSONALITIES.map(p => ({ value: p, label: p }));
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'training', label: 'Training' },
];

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'training'>('all');
  const [form, setForm] = useState({ name: '', voice: VOICES[0], language: LANGUAGES[0], personality: PERSONALITIES[0] });

  // Action state — these are owned by the page rather than the card so
  // that only one rename/delete can be in flight at a time, the network
  // calls live near the data they mutate, and the UI can show optimistic
  // updates centrally.
  const [renamingId, setRenamingId]   = useState<string | null>(null); // id currently being renamed inline
  const [renameDraft, setRenameDraft] = useState('');                   // text in the inline rename input
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null); // agent waiting on Delete confirmation
  const [deleteLoading, setDeleteLoading] = useState(false);            // delete request in flight
  const [deleteError, setDeleteError]     = useState<string | null>(null); // delete failed — shown INSIDE the dialog
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null); // duplicate request in flight (UI feedback)
  const [actionError, setActionError] = useState<string | null>(null);  // last error from rename/duplicate (NOT delete)

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
      // Script is intentionally not part of assistant creation — lives on
      // the campaign instead. We pass an empty string so the API contract
      // (which still accepts `script`) doesn't break.
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, script: '' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agent) {
          setAgents(prev => [data.agent, ...prev]);
        }
      } else {
        const text = await res.text();
        alert('Failed to create assistant: ' + res.status + ' ' + text);
      }
    } catch (err) {
      console.error(err);
      alert('Error: ' + err);
    } finally {
      setLoading(false);
      setShowNew(false);
      setForm({ name: '', voice: VOICES[0], language: LANGUAGES[0], personality: PERSONALITIES[0] });
    }
  };

  /**
   * Begin inline rename — enters edit mode for the chosen agent's card.
   * The input mounts inside AgentCard and reads `renameDraft`. We seed
   * the draft with the current name so the user can either tweak it or
   * select-all-and-replace.
   */
  const startRename = (a: Agent) => {
    setActionError(null);
    setRenamingId(a.id);
    setRenameDraft(a.name || '');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  /**
   * Commit the rename. Trims the draft, no-ops if unchanged or empty,
   * otherwise PATCHes the row and swaps it into local state on success.
   * Errors are surfaced via `actionError` rather than alert() so they
   * don't blow up over the page.
   */
  const commitRename = async () => {
    if (!renamingId) return;
    const next = renameDraft.trim();
    if (!next) { cancelRename(); return; }

    const current = agents.find(a => a.id === renamingId);
    if (current && current.name === next) { cancelRename(); return; }

    try {
      const res = await fetch(`/api/agents/${renamingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || 'Failed to rename assistant');
        return;
      }
      const data = await res.json();
      if (data.agent) {
        setAgents(prev => prev.map(a => a.id === renamingId ? { ...a, ...data.agent } : a));
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to rename assistant');
    } finally {
      cancelRename();
    }
  };

  /**
   * Duplicate. Single click → POST → prepend the returned new row.
   * `duplicatingId` lets the menu show a disabled "Duplicating…" item
   * while the request is in flight, so a user can't fire the request
   * twice with rapid double-clicks.
   */
  const handleDuplicate = async (a: Agent) => {
    setActionError(null);
    setDuplicatingId(a.id);
    try {
      const res = await fetch(`/api/agents/${a.id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || 'Failed to duplicate assistant');
        return;
      }
      const data = await res.json();
      if (data.agent) {
        setAgents(prev => [data.agent, ...prev]);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to duplicate assistant');
    } finally {
      setDuplicatingId(null);
    }
  };

  /**
   * Delete flow has two stages:
   *   1. Menu click stages the agent in `pendingDelete` and opens the
   *      ConfirmDialog. Nothing has been deleted yet.
   *   2. ConfirmDialog's onConfirm calls confirmDelete, which fires the
   *      DELETE request, removes the row from local state on success,
   *      and surfaces any failure INSIDE the dialog via `deleteError`.
   *
   * Why delete errors live INSIDE the dialog (not in the page banner):
   *   The most common failure is a 409 — the assistant is in use by
   *   campaigns and can't be removed yet. The user needs to read that
   *   in context with the action they were trying to take. Routing it
   *   through the page-level banner caused the message to render BEHIND
   *   the open dialog (z-index could solve that, but the deeper issue
   *   is the banner is competing with the modal for the user's
   *   attention). Inline error keeps the user's focus on one thing.
   */
  const askDelete = (a: Agent) => {
    setActionError(null);
    setDeleteError(null);
    setPendingDelete(a);
  };

  const closeDeleteDialog = () => {
    if (deleteLoading) return;
    setPendingDelete(null);
    setDeleteError(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/agents/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Stay open with the error inline. The user reads why deletion
        // failed (e.g. "in use by N campaigns…") and decides next move.
        setDeleteError(data.error || 'Failed to delete assistant');
        return;
      }
      setAgents(prev => prev.filter(a => a.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete assistant');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filtered = agents
    .filter(a => filter === 'all' ? true : a.status === filter)
    .filter(a => (a.name || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <Topbar crumbs={[
          { label: 'Dashboard', href: '/app/dashboard' }, 
          { label: 'Assistants', href: showNew ? '/app/agents' : undefined, onClick: showNew ? () => setShowNew(false) : undefined },
          ...(showNew ? [{ label: 'New Assistant' }] : [])
        ]} />

        <PageHeader
          title="Assistants"
          subtitle="Create and manage your virtual telecallers"
          actions={
            <>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input
                  className="input"
                  placeholder="Search assistants..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ width: 240, paddingLeft: 32, height: 36, fontSize: 13 }}
                />
              </div>
              <Dropdown
                value={filter}
                onChange={(v) => setFilter(v as any)}
                options={STATUS_FILTER_OPTIONS}
                width={140}
                compact
              />
              <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
                <Plus size={14} /> New Assistant
              </button>
            </>
          }
        />

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, background: 'var(--bg)' }}>

          {/* Page-level banner is for rename/duplicate failures only. Delete
              failures show INSIDE the ConfirmDialog so the message stays
              attached to the action the user was trying to take. */}
          {actionError && !pendingDelete && (
            <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
          )}

          {showNew ? (
            <div className="fade-in" style={{ maxWidth: 600, margin: '0', width: '100%' }}>
              {/* Back button — short "← Back" matches the campaigns detail
                  view pattern. The full "← Back to Assistants" was
                  redundant given the breadcrumb already says where the
                  user is going. */}
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
                ← Back
              </button>
              
              <div className="card" style={{ padding: 32 }}>
                <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Create Assistant</h2>
                <p style={{ color: 'var(--text3)', marginBottom: 28, fontSize: 14 }}>Customize your virtual telecaller's voice and personality</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Assistant Name</label>
                    <input className="input" placeholder="e.g. Priya AI" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Voice</label>
                      <Dropdown
                        value={form.voice}
                        onChange={(v) => setForm(p => ({ ...p, voice: v }))}
                        options={VOICE_OPTIONS}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Language</label>
                      <Dropdown
                        value={form.language}
                        onChange={(v) => setForm(p => ({ ...p, language: v }))}
                        options={LANGUAGE_OPTIONS}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Personality</label>
                    <Dropdown
                      value={form.personality}
                      onChange={(v) => setForm(p => ({ ...p, personality: v }))}
                      options={PERSONALITY_OPTIONS}
                    />
                  </div>

                  <div style={{
                    padding: '12px 14px',
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--text2)',
                    lineHeight: 1.55,
                  }}>
                    💡 Call scripts are set per campaign, not per assistant. The same assistant can run multiple campaigns with different scripts.
                  </div>

                  <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', height: 44 }} onClick={handleCreateAgent} disabled={loading}>{loading ? 'Creating...' : 'Create Assistant'}</button>
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
                  Your Assistants ({filtered.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {filtered.map(a => (
                    <AgentCard
                      key={a.id}
                      a={a}
                      isRenaming={renamingId === a.id}
                      renameDraft={renameDraft}
                      onRenameDraftChange={setRenameDraft}
                      onRenameCommit={commitRename}
                      onRenameCancel={cancelRename}
                      isDuplicating={duplicatingId === a.id}
                      onStartRename={() => startRename(a)}
                      onDuplicate={() => handleDuplicate(a)}
                      onAskDelete={() => askDelete(a)}
                    />
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
                    <Bot size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>No assistants found</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Try a different filter or create a new assistant</div>
                  </div>
                )}
              </section>
            )
          )}

        </main>

        <ConfirmDialog
          open={!!pendingDelete}
          title="Delete this assistant?"
          message={pendingDelete
            ? `"${pendingDelete.name || 'Untitled'}" will be permanently removed. This can't be undone.`
            : ''}
          confirmLabel="Delete"
          loading={deleteLoading}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDeleteDialog}
        />
    </>
  );
}

/**
 * Inline error banner shown above the cards grid when an action
 * (rename / duplicate) fails. Auto-dismisses after 6 seconds because
 * most failures are transient and the user shouldn't have to click an
 * X to clear them.
 *
 * Note: delete failures do NOT come through here — they render inside
 * the ConfirmDialog so they stay attached to the in-progress action.
 */
function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div
      role="alert"
      style={{
        padding: '10px 14px',
        background: 'var(--red-soft)',
        border: '1px solid #fecaca',
        color: 'var(--red)',
        borderRadius: 8,
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * AgentCard — render-safe defaults for every numeric/string field.
 *
 * The /api/agents POST endpoint returns the row exactly as it was just
 * inserted, so for a freshly-created assistant `callsHandled`,
 * `successRate`, and `avgDuration` are typically undefined / null
 * (the DB defaults haven't propagated back, or the columns aren't
 * populated until the first call lands). Calling `.toLocaleString()`
 * on undefined would crash the page right after the user finished the
 * "Create Assistant" flow — exactly when the page should be at its
 * most reassuring. Same risk for `personality` (the .split() call) and
 * `name` / `voice` / `language` if any of them ever come back null.
 *
 * So we coerce defensively here. The fix lives in the UI rather than
 * forcing the API to backfill defaults because (a) it's safer (zero
 * risk to the API contract), and (b) it makes the card resilient to
 * any future data path that produces a partial agent row.
 *
 * The card is also where the inline rename input lives. When `isRenaming`
 * is true the name display swaps out for an <input> bound to
 * `renameDraft` — Enter commits, Esc/blur cancels. The page above owns
 * the state so a single source of truth handles the network round-trip.
 */
interface AgentCardProps {
  a: Agent;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  isDuplicating: boolean;
  onStartRename: () => void;
  onDuplicate: () => void;
  onAskDelete: () => void;
}

function AgentCard({
  a,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  isDuplicating,
  onStartRename,
  onDuplicate,
  onAskDelete,
}: AgentCardProps) {
  // Numeric stats — default to 0 for a brand-new assistant with no calls yet.
  const callsHandled = a.callsHandled ?? 0;
  const successRate = a.successRate ?? 0;
  const avgDuration = a.avgDuration ?? 0;

  // String fields — fall back to safe placeholders so .split() / display
  // never crash on missing data.
  const name = a.name || 'Unnamed';
  const voice = a.voice || '—';
  const language = a.language || '—';
  const personality = a.personality || '';
  const status = a.status || 'training';

  const statusBadge = status === 'active' ? 'badge-green' : status === 'training' ? 'badge-amber' : 'badge-gray';

  // Auto-focus and select-all when entering rename mode so the user can
  // either tweak the existing name or just start typing to replace it.
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

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
        <MoreMenu
          ariaLabel={`Actions for ${name}`}
          items={[
            { label: 'Rename',    onClick: onStartRename, disabled: isRenaming },
            { label: isDuplicating ? 'Duplicating…' : 'Duplicate', onClick: onDuplicate, disabled: isDuplicating },
            { label: 'Delete',    onClick: onAskDelete, danger: true },
          ]}
        />
      </div>

      <div>
        {isRenaming ? (
          <input
            ref={inputRef}
            className="input"
            value={renameDraft}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onRenameCommit(); }
              else if (e.key === 'Escape') { e.preventDefault(); onRenameCancel(); }
            }}
            // Blur commits — same convention as Notion/Linear inline edits.
            // If the user clicks elsewhere they almost always meant "save what
            // I typed", so committing is the kindest default.
            onBlur={onRenameCommit}
            style={{ height: 32, padding: '4px 8px', fontSize: 14, fontWeight: 600 }}
          />
        ) : (
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {name}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: isRenaming ? 6 : 0 }}>
          {voice} · {language}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { icon: Phone, val: callsHandled.toLocaleString(), label: 'Calls' },
          { icon: TrendingUp, val: formatPercent(successRate), label: 'Success' },
          { icon: Clock, val: formatDuration(avgDuration), label: 'Avg' },
        ].map(({ val, label }) => (
          <div key={label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge ${statusBadge}`}>{status}</span>
        {personality && (
          <span className="badge badge-purple">{personality.split(' ')[0]}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
          <Play size={13} /> Test Call
        </button>
      </div>
    </div>
  );
}
