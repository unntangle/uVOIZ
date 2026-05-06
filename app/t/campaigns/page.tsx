"use client";
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import Dropdown from '@/components/Dropdown';
import MoreMenu from '@/components/MoreMenu';
import ConfirmDialog from '@/components/ConfirmDialog';
import { PlayCircle, PauseCircle, Plus, Search, Megaphone, Loader2, Upload, FileText, CheckCircle2, ArrowRight, Phone, Trash2, Check, CheckSquare, Shield, Landmark, ClipboardList, IndianRupee, X as XIcon, Volume2, Download } from 'lucide-react';
import { Campaign, Agent } from '@/types';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green', paused: 'badge-amber', draft: 'badge-gray', completed: 'badge-cyan',
};
const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', mr: 'Marathi' };

// Call-outcome bucket presentation. The 7 buckets map to a label, a
// short description (drawer hover hint), and a color treatment that
// matches the rest of the page's badge language:
//   - green for positive outcomes (interested)
//   - cyan/accent for neutral-actionable (callback)
//   - red for negative outcomes (not_interested, dnc)
//   - grey for "couldn't reach" buckets (voicemail, no_answer, wrong_number)
//
// Order in OUTCOME_LIST is the order shown in the progress card's
// breakdown — most-positive first so the user sees the actionable
// numbers (interested, callback) before the long tail.
//
// Keys MUST match the canonical strings in lib/openai.ts CallOutcome.
// If you add a bucket: update this map AND the SQL CHECK constraint
// in migration 006 AND the system prompt in classifyCallOutcome.
type OutcomeKey = 'interested' | 'callback' | 'not_interested' | 'dnc' | 'voicemail' | 'no_answer' | 'wrong_number';

const OUTCOME_META: Record<OutcomeKey, { label: string; bg: string; fg: string; description: string }> = {
  interested:     { label: 'Interested',     bg: 'var(--green-soft)',  fg: 'var(--green)',  description: 'Customer expressed interest or agreed to next steps.' },
  callback:       { label: 'Callback',       bg: 'var(--accent-soft)', fg: 'var(--accent)', description: 'Customer asked to be called back later.' },
  not_interested: { label: 'Not Interested', bg: 'var(--red-soft)',    fg: 'var(--red)',    description: 'Customer declined the offer.' },
  dnc:            { label: 'Do Not Call',    bg: 'var(--red-soft)',    fg: 'var(--red)',    description: 'Customer asked to be removed from the list.' },
  voicemail:      { label: 'Voicemail',      bg: 'var(--bg3)',         fg: 'var(--text2)',  description: 'Call went to voicemail — no live conversation.' },
  no_answer:      { label: 'No Answer',      bg: 'var(--bg3)',         fg: 'var(--text2)',  description: 'Call rang out or disconnected before anyone spoke.' },
  wrong_number:   { label: 'Wrong Number',   bg: 'var(--bg3)',         fg: 'var(--text2)',  description: 'The number does not belong to the intended contact.' },
};

const OUTCOME_LIST: OutcomeKey[] = [
  'interested',
  'callback',
  'not_interested',
  'dnc',
  'voicemail',
  'no_answer',
  'wrong_number',
];

function outcomeIsKnown(v: unknown): v is OutcomeKey {
  return typeof v === 'string' && v in OUTCOME_META;
}

// Category icon map. Each campaign card displays the icon for its
// category (Insurance / Banking / Survey / Loans / Sales) in the
// 44x44 block at the top-left. Switched from emoji to lucide-react
// icons so the color matches the page's cyan accent theme — emoji
// rendering is OS-controlled (Apple's pink phone, Windows' multicolor
// shield, etc.) and clashed with the rest of the UI.
//
// Keys must match the `roomType` strings produced by the wizard's
// Category field. Unknown categories fall back to the Phone icon —
// a sensible "outbound call" default that doesn't pretend to know
// the category.
const CATEGORY_ICON: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  Insurance: Shield,
  Banking: Landmark,
  Survey: ClipboardList,
  Loans: IndianRupee,
  Sales: Megaphone,
};

// Filter options for the campaign list status filter at the top of the page.
// Defined outside the component so the array reference is stable across
// renders — the Dropdown's `options` prop is then referentially stable.
const STATUS_FILTER_OPTIONS = [
  { value: 'all',       label: 'All Status' },
  { value: 'active',    label: 'Active' },
  { value: 'paused',    label: 'Paused' },
  { value: 'draft',     label: 'Draft' },
  { value: 'completed', label: 'Completed' },
];

// Language dropdown options for the wizard. Built from LANG so the source
// of truth stays in one place.
const LANG_OPTIONS = Object.entries(LANG).map(([value, label]) => ({ value, label }));

// Wizard primary-button hover behavior: cyan-filled at rest, flips to an
// outlined treatment (transparent fill, cyan border, cyan text) on hover.
// Applied to every primary CTA inside the create-campaign wizard so the
// flow feels uniform. We override the global .btn-primary:hover rule
// (which darkens the fill) by setting inline styles, and we reserve a
// 1px border at rest in the same cyan color so the button doesn't shift
// by 1px when the visible border appears on hover.
//
// The handler type is widened to HTMLElement so the same handlers work
// for <button> AND for <label> (used as buttons for hidden file inputs,
// e.g. the Upload CSV label-as-button on the campaign detail view).
// Phone normalization for Indian numbers.
//
// All campaign contacts must end up in E.164 format (+919876543210) for the
// voice provider — VAPI/TeleCMI both reject anything else. To keep the
// product simple and aligned with our launch market, we accept ONLY Indian
// 10-digit mobile numbers (defaulting to country code +91). When we expand
// to other countries this becomes a country dropdown; for now "+91 by
// default" is the rule.
//
// Inputs we accept:
//   - 10 digits exactly:           '9876543210'
//   - With country prefix variants: '+919876543210', '919876543210',
//                                   '09876543210', '+91 98765 43210'
//   - Anything with non-digit clutter (spaces, dashes, parens) is
//     stripped first.
//
// We refuse: anything that doesn't reduce to a valid 10-digit Indian
// mobile starting with 6–9 (TRAI assigns mobile prefixes from this range
// only; landlines start with other digits and we don't dial those).
//
// Returns:
//   { ok: true, phone: '+9198XXXXXXXX' }   — normalized E.164 form
//   { ok: false, reason: '...' }            — user-readable reason
function normalizeIndianPhone(raw: string): { ok: true; phone: string } | { ok: false; reason: string } {
  if (!raw) return { ok: false, reason: 'Phone number is required.' };

  // Strip everything that isn't a digit. This handles spaces, dashes,
  // parens, and the leading '+' — we'll add the +91 back in canonical
  // form at the end.
  const digits = raw.replace(/\D/g, '');

  // Pull out the 10-digit subscriber number from whatever variant
  // the user typed. Order matters: check the longest valid prefix
  // first so '919876543210' isn't mistaken for a 12-digit garbage
  // string.
  let subscriber: string | null = null;
  if (digits.length === 10) {
    subscriber = digits;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    // STD-prefixed (legacy landline-style typing). Drop the 0.
    subscriber = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    subscriber = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith('091')) {
    subscriber = digits.slice(3);
  }

  if (!subscriber || subscriber.length !== 10) {
    return {
      ok: false,
      reason: 'Enter a 10-digit Indian mobile number.',
    };
  }

  // TRAI mobile prefix rule: Indian mobile numbers start with 6, 7, 8, or 9.
  // Landlines start with other digits, but we don't dial landlines through
  // this product (no STD code handling, no PBX support). Reject early so
  // the dialer doesn't get a guaranteed-to-fail call.
  if (!/^[6-9]/.test(subscriber)) {
    return {
      ok: false,
      reason: 'Indian mobile numbers must start with 6, 7, 8, or 9.',
    };
  }

  return { ok: true, phone: '+91' + subscriber };
}

const PRIMARY_HOVER_BORDER: React.CSSProperties = {
  border: '1px solid var(--accent)',
  transition: 'background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s',
};
const onPrimaryHoverEnter = (e: React.MouseEvent<HTMLElement>) => {
  // Skip the swap when the element is disabled — the global :disabled rule
  // already lowers opacity, and we don't want a hover hint on something
  // the user can't actually click. <label> doesn't have a `disabled`
  // property, so the cast safely returns undefined for those and the
  // check falls through to apply hover (which is the right behavior —
  // labels-as-buttons aren't disabled at the DOM level, the hidden
  // <input> they wrap is).
  if ((e.currentTarget as HTMLButtonElement).disabled) return;
  e.currentTarget.style.background = 'transparent';
  e.currentTarget.style.color = 'var(--accent)';
  e.currentTarget.style.borderColor = 'var(--accent)';
};
const onPrimaryHoverLeave = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = '';
  e.currentTarget.style.color = '';
  e.currentTarget.style.borderColor = 'var(--accent)';
};

export default function Campaigns() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', language: 'en', agentId: '', script: '', roomType: 'Sales' });

  // Wizard state for the create-campaign flow
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [pendingContacts, setPendingContacts] = useState<{ name: string; phone: string }[]>([]);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Inline single-contact entry on Step 2 — staged into the same
  // pendingContacts array as the CSV path. Keeping these as separate
  // draft fields rather than a single object so each input can have
  // its own onChange without re-creating handler closures every keystroke.
  // Cleared after a successful add (and on wizard reset / step-back-to-1).
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // Manual single-dial state. Only one outbound call can be in flight
  // at a time per page — the UI scopes "in flight" to the contact id
  // so multiple rows can render their idle state correctly while one
  // is dialing. The server enforces a stronger version of this (won't
  // accept a second call on a contact already in 'calling' status), but
  // the local guard prevents fast double-clicks from even reaching the
  // server.
  const [callingContactId, setCallingContactId] = useState<string | null>(null);

  // ─── Outcome breakdown for the right-side stats card ───
  // Fetched from /api/campaigns/[id]/outcome-stats whenever a campaign
  // is selected. Initialised to null so the card can show a small
  // loading state during the round trip; the server always returns a
  // full 7-bucket shape on success so the UI doesn't need conditional
  // checks per bucket.
  const [outcomeStats, setOutcomeStats] = useState<{
    stats: Record<OutcomeKey, number>;
    totalClassified: number;
    totalContacts: number;
  } | null>(null);
  const [outcomeStatsLoading, setOutcomeStatsLoading] = useState(false);

  // ─── Outcome filter for the contacts table ───
  // Chip-style filter above the table. The filter is purely client-
  // side — it narrows the visible rows from the already-loaded
  // `contacts` array. Server-side filtering would scale better but
  // the contacts GET already caps at 100 rows so there's no benefit
  // until we add pagination.
  //
  // Special values:
  //   'all'          → every contact (default)
  //   'unclassified' → contacts with no outcome (em-dash rows)
  //   one of the 7 OutcomeKey strings → contacts whose latest call
  //                                      classified into that bucket
  //
  // The filter applies to BOTH the rendered table AND the CSV
  // download — "what you see is what you export".
  type OutcomeFilter = 'all' | 'unclassified' | OutcomeKey;
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');

  // ─── Side drawer state ───
  // The drawer renders the call history + transcript for one contact.
  // Opens when the user clicks a row in the contacts table, closes
  // via the X button, the backdrop, or Escape.
  //
  // We keep the open contact and the calls list as separate pieces
  // of state because the drawer should appear instantly with a
  // loading state, then the calls fetch resolves a moment later.
  // Closing the drawer clears both so the next open starts fresh.
  const [drawerContact, setDrawerContact] = useState<any | null>(null);
  const [drawerCalls, setDrawerCalls] = useState<any[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Bulk-delete selection mode. The pattern: user clicks "Select" in
  // the page header → cards switch from navigate-on-click to
  // toggle-selection-on-click and a checkbox appears in each card's
  // top-left corner. The header swaps in a "X selected | Cancel |
  // Delete N" toolbar. We keep the selected ids in a Set so add/remove
  // are O(1) and order doesn't matter; rebuilt as new Set on every
  // change so React picks up the reference change.
  //
  // selectionMode is independent of selectedIds.size so the user can
  // be in selection mode with nothing selected (Delete button disabled).
  // Exiting selection mode always clears selectedIds, so re-entering
  // starts fresh — the alternative (preserving selection across mode
  // toggles) was confusing in early testing because users couldn't tell
  // whether their old selection was still active.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  // Action state for the kebab menu (Rename / Duplicate / Delete) and
  // the Start/Pause toggle. Page-level state means a single source of
  // truth, easier optimistic UI, and only one operation can be in flight
  // at a time.
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]     = useState<string | null>(null); // delete failed — shown INSIDE the dialog
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [togglingId, setTogglingId]       = useState<string | null>(null); // status toggle in flight (UI feedback)
  const [actionError, setActionError] = useState<string | null>(null); // rename/duplicate/toggle — NOT delete

  // Allow other pages (e.g. the Dashboard "New Campaign" button) to deep
  // link straight into the create wizard via /app/campaigns?new=1.
  // After auto-opening we strip the param so the URL doesn't carry stale
  // intent and a refresh on this page doesn't re-open the wizard.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowNew(true);
      router.replace('/app/campaigns');
    }
  }, [searchParams, router]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [cRes, aRes] = await Promise.all([
          fetch('/api/campaigns'),
          fetch('/api/agents')
        ]);
        if (cRes.ok) {
          const data = await cRes.json();
          setCampaigns(data.campaigns || []);
        }
        if (aRes.ok) {
          const data = await aRes.json();
          const fetchedAgents = data.agents || [];
          setAgents(fetchedAgents);
          if (fetchedAgents.length > 0) {
            setForm(f => ({ ...f, agentId: fetchedAgents[0].id }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedCampaign) {
      async function loadContacts() {
        try {
          const res = await fetch(`/api/campaigns/${selectedCampaign?.id}/contacts`);
          if (res.ok) {
            const data = await res.json();
            setContacts(data.contacts || []);
          }
        } catch (err) {
          console.error(err);
        }
      }
      loadContacts();
    }
  }, [selectedCampaign]);

  // Load the 7-bucket outcome breakdown whenever the user opens a
  // campaign. Independent of the contacts effect because the two
  // queries hit different routes and we don't want one slow query
  // blocking the other. Reset to null on close so reopening a
  // different campaign briefly shows the loading state rather than
  // the previous campaign's numbers.
  useEffect(() => {
    if (!selectedCampaign) {
      setOutcomeStats(null);
      return;
    }
    let cancelled = false;
    setOutcomeStatsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${selectedCampaign.id}/outcome-stats`);
        if (!res.ok) {
          if (!cancelled) setOutcomeStats(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setOutcomeStats(data);
      } catch (err) {
        console.error('Outcome stats fetch failed:', err);
        if (!cancelled) setOutcomeStats(null);
      } finally {
        if (!cancelled) setOutcomeStatsLoading(false);
      }
    })();
    // The cancelled flag prevents a stale response from a previous
    // campaign from overwriting the current one's data if the user
    // navigates between campaigns quickly.
    return () => { cancelled = true; };
  }, [selectedCampaign]);

  /**
   * Open the side drawer for a contact and fetch their call history.
   *
   * Optimistic open: we set drawerContact immediately so the panel
   * slides in straight away. The calls fetch then resolves with the
   * actual data; while it's pending the drawer renders a loading
   * state. This is the same pattern the campaign progress card uses
   * — visible state changes shouldn't wait for network round trips.
   *
   * If the contact has never been called the API returns an empty
   * array, which the drawer renders as a friendly "No calls yet"
   * message rather than crashing or showing nothing.
   */
  const openContactDrawer = async (contact: any) => {
    setDrawerContact(contact);
    setDrawerCalls([]);
    setDrawerError(null);
    setDrawerLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/calls`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDrawerError(data.error || 'Failed to load call history.');
        return;
      }
      const data = await res.json();
      setDrawerCalls(data.calls || []);
    } catch (err: any) {
      setDrawerError(err?.message || 'Failed to load call history.');
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeContactDrawer = () => {
    setDrawerContact(null);
    setDrawerCalls([]);
    setDrawerError(null);
    setDrawerLoading(false);
  };

  // ─── CSV download for the contacts table ───
  // Builds a CSV from the currently-filtered contacts and triggers
  // a download in the browser — no round trip. The exported set
  // mirrors exactly what's visible in the table, so a user who's
  // filtered to "Interested" gets a CSV of only their interested
  // leads (the typical sales-handoff workflow).
  //
  // Why client-side:
  //   The contacts array is already loaded. Round-tripping to a
  //   server endpoint to re-fetch the same data and stream it back
  //   as text/csv would be slower and add a route to maintain. If
  //   we ever want richer columns (transcripts, recordings) the
  //   server endpoint becomes worth it; for now Name/Phone/Status/
  //   Outcome is enough.
  //
  // CSV escaping:
  //   Names sometimes contain commas ("Sharma, Priya"), quotes
  //   (rare but possible), or newlines (very rare). RFC 4180 says
  //   wrap any field containing those in double quotes and escape
  //   internal quotes by doubling. We do that for every cell so
  //   the output round-trips through Excel and Google Sheets.
  const handleDownloadCsv = () => {
    if (!selectedCampaign) return;

    // Build the rows from filtered contacts — same predicate the
    // table renders against, applied via filterContactsByOutcome
    // computed in the render section. We reproduce the predicate
    // here rather than passing the filtered array down because the
    // download handler may run from anywhere; one source of truth
    // for the predicate stays in the helper below.
    const rows = contacts.filter((c) => contactMatchesOutcomeFilter(c, outcomeFilter));

    // CSV header. Order matches the table's visible columns so the
    // file feels like a 1:1 export of what the user sees.
    const header = ['Name', 'Phone', 'Status', 'Outcome'];

    const escapeCell = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      // RFC 4180: quote if contains comma, quote, CR, or LF.
      // Internal quotes are doubled.
      if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines = [
      header.map(escapeCell).join(','),
      ...rows.map((c) => {
        const status = (c.status || 'pending').toString();
        const outcomeKey = outcomeIsKnown(c.outcome) ? c.outcome : null;
        const outcomeLabel = outcomeKey ? OUTCOME_META[outcomeKey].label : '';
        return [
          escapeCell(c.name || ''),
          escapeCell(c.phone || ''),
          escapeCell(status.charAt(0).toUpperCase() + status.slice(1)),
          escapeCell(outcomeLabel),
        ].join(',');
      }),
    ];

    // Prefix with a UTF-8 BOM so Excel detects the encoding
    // correctly when the user double-clicks the file. Without it,
    // Indian names with accented or non-Latin characters render as
    // mojibake in Excel-on-Windows. Google Sheets and modern Excel
    // versions handle UTF-8 without the BOM, but the BOM is
    // harmless there — trade-off lands clearly on the side of
    // including it.
    const csv = '\uFEFF' + lines.join('\r\n');

    // Filename: "campaign-name_filter_YYYY-MM-DD.csv". Slugify
    // the campaign name so the file is shell-safe across OSes.
    const nameSlug = (selectedCampaign.name || 'campaign')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const filterSlug = outcomeFilter === 'all' ? 'all' : outcomeFilter.replace(/_/g, '-');
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `${nameSlug}_${filterSlug}_${dateSlug}.csv`;

    // Trigger download via a Blob + temporary anchor element. This
    // is the standard pattern for client-side downloads that don't
    // require a server endpoint. The URL.revokeObjectURL call frees
    // the in-memory blob after the click — not strictly required
    // (browsers GC eventually) but tidy.
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Predicate used by both the table render and the CSV download
  // so the two stay in lockstep. "What you see is what you export".
  const contactMatchesOutcomeFilter = (c: any, f: OutcomeFilter): boolean => {
    if (f === 'all') return true;
    if (f === 'unclassified') return !outcomeIsKnown(c.outcome);
    return c.outcome === f;
  };

  // Escape closes the drawer when it's open. Listening at document
  // level rather than on the panel itself so the keystroke works even
  // if focus is in a child input or button.
  useEffect(() => {
    if (!drawerContact) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeContactDrawer();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [drawerContact]);

  /**
   * Toggle a campaign's status between active and paused, and persist
   * to the DB. Previously this was a purely-local setState, which meant:
   *
   *   1. The change didn't survive a refetch (back→forward made the
   *      page look "broken" — the click had no lasting effect).
   *   2. The detail view's status badge was reading from
   *      `selectedCampaign`, which the local toggle never updated, so
   *      the click did nothing visible until the user navigated away
   *      and came back.
   *
   * Now the click PATCHes /api/campaigns/[id], gets the canonical row
   * back, and writes it into BOTH `campaigns` (so the list view shows
   * the new badge) AND `selectedCampaign` (so the detail view re-renders
   * with the new status immediately). The DB is the single source of
   * truth — local state mirrors what the server returned.
   *
   * `togglingId` lets the button render a disabled in-flight state so a
   * user can't double-click and queue two PATCHes against the same row.
   *
   * Note: the dialer cron is responsible for marking a campaign as
   * `completed` once its contact queue drains. We don't try to set that
   * from the UI — see ALLOWED_STATUS_TRANSITIONS in the route handler.
   */
  const toggleStatus = async (id: string) => {
    const current = campaigns.find(c => c.id === id) || (selectedCampaign?.id === id ? selectedCampaign : null);
    if (!current) return;

    // 'active' flips to 'paused'; everything else (draft, paused) flips
    // to 'active'. Same rule as the old local-only toggle, just now
    // also persisted.
    const next = current.status === 'active' ? 'paused' : 'active';

    setActionError(null);
    setTogglingId(id);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || 'Failed to update campaign status');
        return;
      }
      const data = await res.json();
      if (data.campaign) {
        // Splice the canonical row into the list — preserves any local
        // counts (totalContacts, called, etc.) that the API row might
        // not include but our existing card defaults handle anyway.
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...data.campaign } : c));
        // Also keep the detail view in sync if we're looking at this
        // campaign. Without this the user would click "Start Campaign",
        // see no change, and assume the button was broken.
        setSelectedCampaign(prev => prev && prev.id === id ? { ...prev, ...data.campaign } : prev);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update campaign status');
    } finally {
      setTogglingId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCampaign) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      
      // Basic CSV parse assuming: Name,Phone
      // Skip header if it exists
      const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
      
      const parsedContacts = [];
      for (let i = startIndex; i < lines.length; i++) {
        const [name, phone] = lines[i].split(',').map(s => s.trim());
        if (name && phone) parsedContacts.push({ name, phone });
      }

      if (parsedContacts.length > 0) {
        try {
          const res = await fetch(`/api/campaigns/${selectedCampaign.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: parsedContacts })
          });
          if (res.ok) {
            // Refresh contacts
            const newRes = await fetch(`/api/campaigns/${selectedCampaign.id}/contacts`);
            if (newRes.ok) {
              const data = await newRes.json();
              setContacts(data.contacts || []);
            }
            // Update local campaign stat
            setCampaigns(cs => cs.map(c => c.id === selectedCampaign.id ? { ...c, totalContacts: (c.totalContacts || 0) + parsedContacts.length } as Campaign : c));
            setSelectedCampaign(prev => prev ? { ...prev, totalContacts: (prev.totalContacts || 0) + parsedContacts.length } as Campaign : null);
          }
        } catch (err) {
          console.error("Upload failed", err);
        }
      }
      setUploading(false);
      if (e.target) e.target.value = ''; // reset input
    };
    reader.readAsText(file);
  };

  /**
   * Place a manual call to one specific contact, bypassing the dialer
   * cron schedule. Useful for testing the agent script on a real
   * number, or making one off-cycle call on a paused campaign.
   *
   * Server-side responsibilities (enforced by /api/contacts/[id]/call):
   *   - Auth + org scoping
   *   - Compliance gate (window, DND, DLT, consent) — same rules as
   *     the cron, no bypass
   *   - Org minutes check (402 Payment Required if exhausted)
   *   - Provider call placement and `calls` row insert
   *
   * Client-side responsibilities (this handler):
   *   - Optimistic UI: flip the row's status to 'calling' so the user
   *     sees immediate feedback. The server has already done the same
   *     update, but waiting for the response would feel sluggish.
   *   - Surface server errors via the existing actionError banner so
   *     blocked/out-of-minutes/etc. messages are visible.
   *   - Reset on failure: if the call was rejected, revert the row's
   *     status to whatever it was before the click. The server already
   *     reverts to 'failed' on its side, so on next refetch the row
   *     will land in the right place — but UI snap-back during the
   *     error window keeps things consistent.
   */
  const placeManualCall = async (contactId: string) => {
    if (callingContactId) return; // local guard against parallel clicks
    const before = contacts.find(c => c.id === contactId);
    const previousStatus = before?.status ?? 'pending';

    setActionError(null);
    setCallingContactId(contactId);

    // Optimistic flip — see contract above. Snapshotting `previousStatus`
    // first so we can revert exactly to that value on error rather than
    // hard-coding 'pending' (which would be wrong for, e.g., a 'failed'
    // row the user is retrying).
    setContacts(prev => prev.map(c =>
      c.id === contactId ? { ...c, status: 'calling' } : c
    ));

    try {
      const res = await fetch(`/api/contacts/${contactId}/call`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Compliance blocks come back with a `reasons` array; surface
        // the first one inline (full list is in the response body for
        // anyone debugging via DevTools). For everything else, the
        // server's `error` string is already user-friendly.
        const message = data.reasons?.[0]
          ? `${data.error} ${data.reasons[0]}`
          : data.error || 'Failed to place call.';
        setActionError(message);
        // Revert the optimistic update.
        setContacts(prev => prev.map(c =>
          c.id === contactId ? { ...c, status: previousStatus } : c
        ));
      }
      // Success path: leave the row on 'calling'. The webhook handler
      // will move it to 'completed'/'failed' when the call resolves;
      // a future refetch (manual or via the contacts loader effect)
      // will reflect the final state.
    } catch (err: any) {
      setActionError(err?.message || 'Failed to place call.');
      setContacts(prev => prev.map(c =>
        c.id === contactId ? { ...c, status: previousStatus } : c
      ));
    } finally {
      setCallingContactId(null);
    }
  };

  // Filter list — guard against missing `name` so a partial/fresh campaign
  // row from the API doesn't crash the whole list view with
  // "Cannot read properties of undefined (reading 'toLowerCase')".
  const filtered = campaigns
    .filter(c => filter === 'all' ? true : c.status === filter)
    .filter(c => (c.name || '').toLowerCase().includes(query.toLowerCase()));

  // Group by recency. If a campaign has no `createdAt` (very fresh insert,
  // some API paths return rows before the timestamp is serialized) we
  // treat it as "now" so it shows up under "This week" rather than
  // silently disappearing into the gap between buckets.
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const createdAtOrNow = (c: Campaign) => {
    if (!c.createdAt) return now;
    const d = new Date(c.createdAt);
    return isNaN(d.getTime()) ? now : d;
  };
  const thisWeek = filtered.filter(c => createdAtOrNow(c) > weekAgo);
  const earlier  = filtered.filter(c => createdAtOrNow(c) <= weekAgo);

  const handleCreateCampaign = async () => {
    if (!form.name) return;
    try {
      setLoading(true);
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        console.error('Create campaign failed');
        return;
      }
      const data = await res.json();
      if (!data.campaign) return;

      // Track whether contacts actually landed in the DB. We need this
      // to decide whether to auto-activate the campaign after creation.
      // Local pendingContacts.length isn't enough — the upload could
      // have failed for any reason, in which case the campaign should
      // stay draft regardless of what the user staged.
      let contactsInserted = false;

      // If the user uploaded contacts in step 2, push them to the new campaign now
      if (pendingContacts.length > 0) {
        try {
          const contactsRes = await fetch(`/api/campaigns/${data.campaign.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: pendingContacts })
          });
          if (contactsRes.ok) {
            contactsInserted = true;
            // Reflect the count locally so the card shows the right number immediately
            data.campaign.totalContacts = (data.campaign.totalContacts || 0) + pendingContacts.length;
          }
        } catch (err) {
          console.error('Contact upload after campaign create failed:', err);
        }
      }

      // Auto-activate if contacts actually landed. This implements the
      // product rule "if the user gave us enough info to dial, start
      // dialing immediately"; clicking Create-with-contacts should
      // feel like one decisive action, not a two-step "create then
      // hunt for the Start button". If the user skipped contacts, we
      // leave the campaign in draft — the existing detail-view guard
      // will refuse to start a 0-contact campaign anyway, so there's
      // no path to a bad state.
      //
      // The PATCH route is the source of truth for the activate rule
      // (it re-checks contact count server-side and 400s if zero), so
      // even a buggy local check can't create an inconsistent state.
      // If the activation request fails for any reason — compliance,
      // network, race condition — we swallow the error and leave the
      // campaign in draft. The user can manually start it from the
      // detail view, and the wizard close-flow continues normally.
      if (contactsInserted) {
        try {
          const patchRes = await fetch(`/api/campaigns/${data.campaign.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'active' }),
          });
          if (patchRes.ok) {
            const patchData = await patchRes.json();
            if (patchData.campaign) {
              // Splice the activated row back into the local data so
              // the card status badge reads 'active' immediately
              // without a refetch.
              Object.assign(data.campaign, patchData.campaign);
            }
          } else {
            // Non-fatal — campaign was created and contacts uploaded;
            // we just couldn't auto-start. Logged for diagnosis but
            // not surfaced to the user since the next step (clicking
            // into the campaign and pressing Start) still works.
            console.warn('Auto-activate after create failed:', patchRes.status);
          }
        } catch (err) {
          console.error('Auto-activate after create failed:', err);
        }
      }

      setCampaigns(prev => [data.campaign, ...prev]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setShowNew(false);
      setWizardStep(1);
      setPendingContacts([]);
      setPendingFileName(null);
      setParseError(null);
      setManualName('');
      setManualPhone('');
      setManualError(null);
      setForm({ name: '', language: 'en', agentId: agents[0]?.id || '', script: '', roomType: 'Sales' });
    }
  };

  // Wizard CSV parse — same logic as the detail-view upload, but stages
  // contacts in memory until the campaign actually exists. Each row's
  // phone is normalized to E.164 +91 form via normalizeIndianPhone();
  // rows with bad phones are skipped (counted separately from rows
  // with structurally bad columns) so the user can see what went
  // wrong without us silently dropping data.
  const handleWizardCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setPendingFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) {
          setParseError('The file is empty.');
          setPendingContacts([]);
          return;
        }
        const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;
        const parsed: { name: string; phone: string }[] = [];
        const malformedRows: number[] = []; // wrong column count / empty fields
        const invalidPhoneRows: number[] = []; // structurally OK but phone failed validation
        for (let i = startIndex; i < lines.length; i++) {
          const [name, phone] = lines[i].split(',').map(s => s?.trim());
          if (!name || !phone) {
            malformedRows.push(i + 1);
            continue;
          }
          const result = normalizeIndianPhone(phone);
          if (!result.ok) {
            invalidPhoneRows.push(i + 1);
            continue;
          }
          parsed.push({ name, phone: result.phone });
        }
        if (parsed.length === 0) {
          // Distinguish the two failure modes so the user knows what
          // to fix: a wrong header / wrong column count is a structural
          // CSV issue; bad phones are a data issue.
          if (invalidPhoneRows.length > 0 && malformedRows.length === 0) {
            setParseError('No valid Indian mobile numbers found. Numbers must be 10 digits and start with 6–9.');
          } else {
            setParseError('No valid rows found. Expected format: Name,Phone (one per line).');
          }
          setPendingContacts([]);
          return;
        }
        setPendingContacts(parsed);
        // Build a single skipped-rows summary so the user sees one
        // amber message rather than two stacked banners.
        const skippedBits: string[] = [];
        if (malformedRows.length > 0) {
          skippedBits.push(`${malformedRows.length} malformed row${malformedRows.length === 1 ? '' : 's'}`);
        }
        if (invalidPhoneRows.length > 0) {
          skippedBits.push(`${invalidPhoneRows.length} with invalid phone${invalidPhoneRows.length === 1 ? '' : 's'}`);
        }
        if (skippedBits.length > 0) {
          setParseError(`Imported ${parsed.length} contact${parsed.length === 1 ? '' : 's'}. Skipped ${skippedBits.join(' and ')}.`);
        }
      } catch (err: any) {
        setParseError('Could not parse the file. Make sure it is a CSV with Name,Phone columns.');
        setPendingContacts([]);
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  /**
   * Inline single-contact add on Step 2. Pushes one row into the
   * pendingContacts staging array (same shape as CSV-parsed rows)
   * and clears the drafts so the user can keep adding more.
   *
   * Validation:
   *   - Name: trim + non-empty.
   *   - Phone: must normalize to a valid Indian mobile via
   *     normalizeIndianPhone() — stored in canonical E.164 form
   *     (+919876543210). The same helper runs on CSV-parsed rows so
   *     manual and bulk imports follow identical rules.
   *
   * Errors are surfaced inline below the form (manualError state) so
   * the user sees exactly why the add was rejected. The error clears
   * as soon as they edit either field.
   *
   * If the user has the same number twice (once via CSV, once via
   * manual add) we accept it — same behavior the CSV-only path has
   * for in-file duplicates. Dedup is a separate concern.
   */
  const handleAddManualContact = () => {
    const name = manualName.trim();
    if (!name) {
      setManualError('Name is required.');
      return;
    }
    const result = normalizeIndianPhone(manualPhone);
    if (!result.ok) {
      setManualError(result.reason);
      return;
    }
    setManualError(null);
    // Store the canonical +91-prefixed form, not the raw input. Down
    // the wire (server insert → dialer → voice provider) the number
    // never gets re-normalized, so what we save here is what gets
    // dialed.
    setPendingContacts(prev => [...prev, { name, phone: result.phone }]);
    setManualName('');
    setManualPhone('');
  };

  // ─── Kebab menu handlers (Rename / Duplicate / Delete) ───
  // Each follows the same shape as the agents page so the two screens
  // behave identically. See app/t/agents/page.tsx for inline notes on
  // why the page owns this state instead of the card.

  const startRename = (c: Campaign) => {
    setActionError(null);
    setRenamingId(c.id);
    setRenameDraft(c.name || '');
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };
  const commitRename = async () => {
    if (!renamingId) return;
    const next = renameDraft.trim();
    if (!next) { cancelRename(); return; }

    const current = campaigns.find(c => c.id === renamingId);
    if (current && current.name === next) { cancelRename(); return; }

    try {
      const res = await fetch(`/api/campaigns/${renamingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || 'Failed to rename campaign');
        return;
      }
      const data = await res.json();
      if (data.campaign) {
        // The PATCH endpoint returns the row joined with `agents(name)`,
        // matching the shape of the campaigns list query. We splice it
        // in by id so the card picks up the new name immediately.
        setCampaigns(prev => prev.map(c => c.id === renamingId ? { ...c, ...data.campaign } : c));
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to rename campaign');
    } finally {
      cancelRename();
    }
  };

  const handleDuplicate = async (c: Campaign) => {
    setActionError(null);
    setDuplicatingId(c.id);
    try {
      const res = await fetch(`/api/campaigns/${c.id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || 'Failed to duplicate campaign');
        return;
      }
      const data = await res.json();
      if (data.campaign) {
        setCampaigns(prev => [data.campaign, ...prev]);
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to duplicate campaign');
    } finally {
      setDuplicatingId(null);
    }
  };

  /**
   * Delete flow — see app/t/agents/page.tsx for full notes on why
   * delete failures stay INSIDE the ConfirmDialog rather than leaking
   * out as a page-level banner. tl;dr: the banner used to render BEHIND
   * the open modal which made the error feel detached from the action,
   * and on a busy page (like this one with the cards underneath) it
   * also looked broken. Inline-in-dialog keeps focus on the action.
   */
  const askDelete = (c: Campaign) => {
    setActionError(null);
    setDeleteError(null);
    setPendingDelete(c);
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
      const res = await fetch(`/api/campaigns/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Stay open with the error inline. Most common cause is a 409 —
        // the campaign has call history and can't be removed yet.
        setDeleteError(data.error || 'Failed to delete campaign');
        return;
      }
      setCampaigns(prev => prev.filter(c => c.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete campaign');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Bulk delete handlers ───
  // Mode toggles plus the actual deletion. Selection state lives at
  // page level (not on each card) because the action bar in the header
  // also needs to know how many are selected, and pulling that up to a
  // shared owner is cleaner than having cards push counts up via
  // callbacks. The card just gets `isSelected` + `onToggleSelect` props.

  const enterSelectionMode = () => {
    setSelectionMode(true);
    setSelectedIds(new Set());
    // Clear any other in-flight UI errors so the action bar's red
    // "Delete N" button doesn't sit next to a stale unrelated banner.
    setActionError(null);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkDeleteError(null);
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      // New Set on every change so React's reference equality picks up
      // the change — mutating in place would skip re-renders.
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const askBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setBulkDeleteError(null);
    setBulkDeleteOpen(true);
  };

  const closeBulkDeleteDialog = () => {
    if (bulkDeleting) return;
    setBulkDeleteOpen(false);
    setBulkDeleteError(null);
  };

  /**
   * Bulk delete: fire one DELETE per selected id in parallel and
   * collect partial results. The single-delete endpoint already
   * handles 409 (campaign has call history) by returning a clear
   * error string — we surface a per-id summary so the user knows
   * which deletions succeeded and which were blocked.
   *
   * Why parallel rather than a new bulk endpoint:
   *   - Reuses an already-tested route
   *   - Per-row error semantics fall out for free (one fetch per row)
   *   - At realistic page sizes (10–20 cards) parallel fetches are fast
   *   - A bulk endpoint can be added later if N grows large or we need
   *     transactional all-or-nothing semantics
   *
   * Failure handling:
   *   - All succeed → close dialog, exit selection mode, splice rows out.
   *   - Some fail → splice the successes out, keep the failures selected
   *     so the user can see which ones blocked, and show a summary in
   *     the dialog's inline-error slot. Dialog converts to "Close".
   *   - All fail → same shape; no rows are spliced.
   */
  const confirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setBulkDeleteError(null);

    const ids = Array.from(selectedIds);
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
          if (res.ok) return { id, ok: true as const };
          const data = await res.json().catch(() => ({}));
          return { id, ok: false as const, error: data.error || 'Failed to delete' };
        } catch (err: any) {
          return { id, ok: false as const, error: err?.message || 'Network error' };
        }
      })
    );

    const succeeded = results.filter(r => r.ok).map(r => r.id);
    const failed = results.filter(r => !r.ok);

    // Splice successes out of the local list immediately, regardless
    // of whether the rest succeeded. Partial progress is still
    // progress — don't make the user retry deletions that worked.
    if (succeeded.length > 0) {
      const succeededSet = new Set(succeeded);
      setCampaigns(prev => prev.filter(c => !succeededSet.has(c.id)));
      // Drop the succeeded ids from selection so the failures stay
      // visible-as-selected for the user to act on.
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const id of succeeded) next.delete(id);
        return next;
      });
    }

    setBulkDeleting(false);

    if (failed.length === 0) {
      // All succeeded — close dialog, leave selection mode, done.
      setBulkDeleteOpen(false);
      setSelectionMode(false);
      return;
    }

    // Partial or total failure — stay in the dialog with a summary.
    // Common case is 409s from campaigns with call history; surface
    // the count and the most common reason so the user knows what's
    // up without us reproducing N error strings.
    const reasonCounts = new Map<string, number>();
    for (const f of failed) {
      const reason = (f as { error: string }).error;
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
    const summaryParts: string[] = [];
    if (succeeded.length > 0) {
      summaryParts.push(`Deleted ${succeeded.length} of ${ids.length}.`);
    } else {
      summaryParts.push(`Couldn’t delete any of the ${ids.length} selected.`);
    }
    // Pick the most common failure reason as the headline. If they're
    // all the same it's the only one; if they differ, show the most
    // frequent and a count of others.
    const sortedReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (sortedReasons.length > 0) {
      const [topReason, topCount] = sortedReasons[0];
      summaryParts.push(`${topCount} blocked: ${topReason}`);
      if (sortedReasons.length > 1) {
        const otherCount = failed.length - topCount;
        summaryParts.push(`(${otherCount} other failure${otherCount === 1 ? '' : 's'})`);
      }
    }
    setBulkDeleteError(summaryParts.join(' '));
  };

  // Build assistant options inside the render path (rather than at module
  // scope) because `agents` is fetched async and changes over the
  // component's lifetime. Rebuilding the array on every render is
  // cheap — a handful of strings — and keeps the data flow simple.
  const assistantOptions = agents.length === 0
    ? [{ value: '', label: 'No assistants available' }]
    : agents.map(a => ({ value: a.id, label: a.name }));

  // Detail-view toggle button is a chunk of UI we want to express once
  // rather than inline in the JSX, since it has loading state and a
  // disabled-while-in-flight rule. Computed from the live status so it
  // re-renders instantly the moment toggleStatus updates state.
  const detailToggling = !!selectedCampaign && togglingId === selectedCampaign.id;
  const detailIsActive = selectedCampaign?.status === 'active';

  // Block starting a campaign that has zero contacts. Without this guard
  // a user could click "Start Campaign" on an empty list, the API would
  // happily flip status → 'active', and the dialer cron would have
  // nothing to call. The campaign would sit "running" forever with 0
  // contacts, looking broken. Pause is always allowed (it's a recovery
  // action), only the activate direction needs the guard. We also
  // mirror this on the server in /api/campaigns/[id] so it's enforced
  // regardless of which UI path triggers the toggle (detail view here,
  // or the card's Resume button).
  const detailContactCount = contacts.length || selectedCampaign?.totalContacts || 0;
  const detailNoContacts = !!selectedCampaign && !detailIsActive && detailContactCount === 0;

  return (
    <>
      <Topbar crumbs={[
          { label: 'Dashboard', href: '/app/dashboard' }, 
          { label: 'Campaigns', href: (showNew || selectedCampaign) ? '/app/campaigns' : undefined, onClick: (showNew || selectedCampaign) ? () => { setShowNew(false); setSelectedCampaign(null); } : undefined },
          ...(showNew ? [{ label: 'New Campaign' }] : []),
          ...(selectedCampaign ? [{ label: selectedCampaign.name }] : [])
        ]} />

        {(!showNew && !selectedCampaign) && (
          <PageHeader
            title="Campaigns"
            subtitle="Manage all your outbound calling campaigns"
            actions={
              selectionMode ? (
                // Selection-mode toolbar. Replaces the search + filter +
                // "+ New Campaign" trio so the page can't initiate any
                // other action while a bulk operation is being staged.
                // Cancel exits without doing anything; Delete N is
                // disabled until at least one card is selected.
                <>
                  <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>
                    {selectedIds.size === 0
                      ? 'Select campaigns to delete'
                      : `${selectedIds.size} selected`}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ height: 36 }}
                    onClick={exitSelectionMode}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    style={{
                      height: 36,
                      opacity: selectedIds.size === 0 ? 0.5 : 1,
                      cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                    }}
                    disabled={selectedIds.size === 0}
                    onClick={askBulkDelete}
                  >
                    <Trash2 size={14} /> Delete {selectedIds.size > 0 ? selectedIds.size : ''}
                  </button>
                </>
              ) : (
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
                  {/* Status filter — themed Dropdown replaces native <select>
                      so the open list shows our --bg2/--accent tokens
                      instead of the OS-default white menu. */}
                  <Dropdown
                    value={filter}
                    onChange={(v) => setFilter(v as any)}
                    options={STATUS_FILTER_OPTIONS}
                    width={140}
                    compact
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ ...PRIMARY_HOVER_BORDER }}
                    onMouseEnter={onPrimaryHoverEnter}
                    onMouseLeave={onPrimaryHoverLeave}
                    onClick={() => setShowNew(true)}
                  >
                    <Plus size={14} /> New Campaign
                  </button>
                </>
              )
            }
          />
        )}

        <main style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, background: 'var(--bg)' }}>

          {/* Page-level banner is for rename/duplicate/toggle failures.
              Delete failures show INSIDE the ConfirmDialog so the message
              stays attached to the action. Hidden when the dialog is
              open so a stale error doesn't render behind the modal. */}
          {actionError && !pendingDelete && (
            <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
          )}

          {selectedCampaign ? (
            // Campaign detail view — left-aligned to match the rest of the
            // app (list view, agents page, dashboard). Previously this was
            // `margin: '0 auto'` which centered the column and left a wide
            // empty gutter on the right that looked out of step with every
            // other tenant page. Cap at 1100px so the two-column grid
            // (contacts + sidebar) stays readable on ultra-wide screens
            // without being locked into a narrow centered column.
            <div className="fade-in" style={{ maxWidth: 1100, margin: '0', width: '100%' }}>
              <button 
                onClick={() => setSelectedCampaign(null)}
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

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{selectedCampaign.name}</h1>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13, color: 'var(--text3)' }}>
                    <span>Assistant: <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{selectedCampaign.agentName || 'Default Assistant'}</span></span>
                    <span>Language: <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{LANG[selectedCampaign.language] || selectedCampaign.language}</span></span>
                    <span className={`badge ${STATUS_BADGE[selectedCampaign.status]}`} style={{ padding: '2px 8px' }}>{selectedCampaign.status}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {/* Disable while the PATCH is in flight so a user can't
                      double-click and queue two state flips. The label
                      reads from selectedCampaign.status which is updated
                      synchronously when the toggle resolves, so the
                      moment the request returns the button visibly
                      switches to the new label. */}
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={detailToggling || detailNoContacts}
                    title={detailNoContacts ? 'Upload at least one contact before starting this campaign.' : undefined}
                    style={{
                      height: 36,
                      opacity: (detailToggling || detailNoContacts) ? 0.6 : 1,
                      cursor: detailToggling ? 'wait' : detailNoContacts ? 'not-allowed' : 'pointer',
                      ...PRIMARY_HOVER_BORDER,
                    }}
                    onMouseEnter={(detailToggling || detailNoContacts) ? undefined : onPrimaryHoverEnter}
                    onMouseLeave={(detailToggling || detailNoContacts) ? undefined : onPrimaryHoverLeave}
                    onClick={() => {
                      // Belt-and-braces: the disabled flag should already
                      // prevent this, but keyboard activation paths or a
                      // future style change that omits `disabled` would
                      // otherwise let the click through. Surface the same
                      // message the server would return.
                      if (detailNoContacts) {
                        setActionError('Upload at least one contact before starting this campaign.');
                        return;
                      }
                      toggleStatus(selectedCampaign.id);
                    }}
                  >
                    {detailToggling
                      ? <><Loader2 size={14} className="spin" /> {detailIsActive ? 'Pausing…' : 'Starting…'}</>
                      : detailIsActive
                        ? <><PauseCircle size={14} /> Pause Campaign</>
                        : <><PlayCircle size={14} /> Start Campaign</>}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
                <div className="card" style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600 }}>Contacts List</h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {/* Download CSV — ghost-style so it doesn't
                          compete with the cyan "Upload CSV" primary.
                          Disabled when there's nothing to export
                          (zero contacts overall, or zero matching the
                          current filter). The label adapts to show how
                          many rows will be exported, which is the most
                          useful piece of feedback for someone clicking
                          this. */}
                      {(() => {
                        const exportable = contacts.filter((c) => contactMatchesOutcomeFilter(c, outcomeFilter));
                        const disabled = exportable.length === 0;
                        return (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={handleDownloadCsv}
                            disabled={disabled}
                            title={disabled
                              ? 'No contacts match the current filter.'
                              : `Download ${exportable.length} contact${exportable.length === 1 ? '' : 's'} as CSV`}
                            style={{
                              gap: 6,
                              opacity: disabled ? 0.5 : 1,
                              cursor: disabled ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                              if ((e.currentTarget as HTMLButtonElement).disabled) return;
                              e.currentTarget.style.color = 'var(--accent)';
                            }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
                          >
                            <Download size={14} /> Download CSV
                            {/* Show the count only when a filter is
                                active — less noise when the default
                                "all" view is selected. */}
                            {outcomeFilter !== 'all' && !disabled && (
                              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', marginLeft: 2 }}>
                                ({exportable.length})
                              </span>
                            )}
                          </button>
                        );
                      })()}
                      <input
                        type="file"
                        accept=".csv"
                        id="csvUpload"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                      <label
                        htmlFor="csvUpload"
                        className="btn btn-primary btn-sm"
                        style={{
                          cursor: uploading ? 'not-allowed' : 'pointer',
                          opacity: uploading ? 0.7 : 1,
                          ...PRIMARY_HOVER_BORDER,
                        }}
                        onMouseEnter={uploading ? undefined : onPrimaryHoverEnter}
                        onMouseLeave={uploading ? undefined : onPrimaryHoverLeave}
                      >
                        {uploading ? <><Loader2 size={14} className="spin" /> Uploading...</> : <><Plus size={14} /> Upload CSV</>}
                      </label>
                    </div>
                  </div>

                  {/* Outcome filter — themed Dropdown above the
                      table. Each option's `hint` carries the count of
                      contacts in that bucket so the operator can scan
                      the menu and see distribution at a glance. The
                      currently selected bucket reads on the trigger
                      ("Interested"); count for the active filter is
                      shown on the Download CSV button up top, so we
                      don't need to repeat it here.

                      Hidden when there are zero contacts — a filter
                      above an empty table is just noise. */}
                  {contacts.length > 0 && (() => {
                    // Pre-compute counts per bucket once per render.
                    const counts: Record<string, number> = { all: contacts.length, unclassified: 0 };
                    for (const k of OUTCOME_LIST) counts[k] = 0;
                    for (const c of contacts) {
                      if (outcomeIsKnown(c.outcome)) counts[c.outcome]++;
                      else counts.unclassified++;
                    }

                    // Build the option list. "All" first (most common
                    // default), then the 7 buckets in OUTCOME_LIST
                    // order (most-positive first), then "Unclassified"
                    // last because it's the catch-all bucket. Each
                    // option carries its count in `hint`.
                    const options = [
                      { value: 'all', label: 'All outcomes', hint: String(counts.all) },
                      ...OUTCOME_LIST.map((k) => ({
                        value: k,
                        label: OUTCOME_META[k].label,
                        hint: String(counts[k] ?? 0),
                      })),
                      { value: 'unclassified', label: 'Unclassified', hint: String(counts.unclassified) },
                    ];

                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Filter
                        </span>
                        <Dropdown
                          value={outcomeFilter}
                          onChange={(v) => setOutcomeFilter(v as OutcomeFilter)}
                          options={options}
                          width={200}
                          compact
                        />
                      </div>
                    );
                  })()}
                  
                  {(() => {
                    // Compute the filtered set ONCE here — used by both
                    // the empty-state check and the table render so we
                    // don't walk the contacts array twice. Also used to
                    // distinguish the two empty-state messages:
                    //   1. No contacts uploaded yet → invite to upload
                    //   2. Contacts exist but none match the active
                    //      filter → invite to widen the filter
                    // The two messages are different because the
                    // remedy is different.
                    const filteredContacts = contacts.filter((c) => contactMatchesOutcomeFilter(c, outcomeFilter));

                    if (contacts.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)', marginBottom: 4 }}>No contacts uploaded yet</div>
                          <div style={{ fontSize: 13 }}>Upload a CSV with "Name, Phone" to get started</div>
                        </div>
                      );
                    }

                    if (filteredContacts.length === 0) {
                      // Filter excluded every row. The chip row above
                      // already shows zero on the active chip, so the
                      // user has visual context — we just need a
                      // gentle nudge with a fast escape hatch back to
                      // "All".
                      const activeLabel = outcomeFilter === 'all'
                        ? 'All'
                        : outcomeFilter === 'unclassified'
                          ? 'Unclassified'
                          : OUTCOME_META[outcomeFilter as OutcomeKey]?.label || outcomeFilter;
                      return (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', border: '1px dashed var(--border)', borderRadius: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)', marginBottom: 4 }}>
                            No contacts in “{activeLabel}”
                          </div>
                          <div style={{ fontSize: 13, marginBottom: 12 }}>
                            None of the contacts in this campaign match the current filter.
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setOutcomeFilter('all')}
                            style={{ height: 32 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
                          >
                            Show all contacts
                          </button>
                        </div>
                      );
                    }

                    return (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>
                            <th style={{ padding: '12px 16px', fontWeight: 500 }}>Name</th>
                            <th style={{ padding: '12px 16px', fontWeight: 500 }}>Phone Number</th>
                            <th style={{ padding: '12px 16px', fontWeight: 500 }}>Status</th>
                            {/* Outcome column: the AI-classified result
                                of the contact's most recent call.
                                Empty for never-called contacts (renders
                                as em-dash). Click the row to open the
                                drawer with full transcript + summary. */}
                            <th style={{ padding: '12px 16px', fontWeight: 500 }}>Outcome</th>
                            {/* Action column has no header label — the
                                button itself is self-describing and a
                                stray header above an icon button looks
                                noisy. Right-aligned to match where the
                                buttons render. */}
                            <th style={{ padding: '12px 16px', fontWeight: 500, textAlign: 'right', width: 1 }} aria-label="Actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredContacts.map((c, i) => {
                            // Read status from the row when present; fall
                            // back to 'pending' for rows from older code
                            // paths that don't carry one. The case-insensitive
                            // map lookup handles both 'pending' and 'Pending'.
                            const status = (c.status || 'pending').toLowerCase();
                            const isThisRowCalling = callingContactId === c.id || status === 'calling';
                            // Disable the action button if THIS row is
                            // dialing OR if SOME OTHER row is dialing
                            // (we serialize manual calls one-at-a-time
                            // per page, matching the server's per-contact
                            // 'calling' lock).
                            const buttonDisabled = !!callingContactId || status === 'calling';

                            // Status pill colors. Mirrors the campaign
                            // STATUS_BADGE map but for contact-level
                            // states. 'calling' gets the cyan accent
                            // because it's an in-progress action, not a
                            // resting state.
                            const pillStyle: React.CSSProperties =
                              status === 'calling' ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                              : status === 'completed' ? { background: 'var(--green-soft)', color: 'var(--green)' }
                              : status === 'failed' ? { background: 'var(--red-soft)', color: 'var(--red)' }
                              : { background: 'var(--bg3)', color: 'var(--text2)' };
                            const pillLabel = status.charAt(0).toUpperCase() + status.slice(1);

                            // Outcome badge for this row. Read the
                            // denormalized contacts.outcome (mirror of
                            // the latest call's outcome). NULL = never
                            // classified; render an em-dash. Unknown
                            // strings (shouldn't happen — the CHECK
                            // constraint blocks them) also render as
                            // em-dash so the UI never crashes on a
                            // bucket it doesn't know about.
                            const outcomeKey = outcomeIsKnown(c.outcome) ? c.outcome : null;
                            const outcomeMeta = outcomeKey ? OUTCOME_META[outcomeKey] : null;

                            return (
                              <tr
                                key={c.id || i}
                                style={{
                                  borderBottom: '1px solid var(--border)',
                                  cursor: 'pointer',
                                  transition: 'background 0.12s',
                                }}
                                // Click anywhere on the row (except the
                                // Call button, which stops propagation)
                                // opens the drawer. Hover gives a subtle
                                // tint so the click affordance is
                                // discoverable.
                                onClick={() => openContactDrawer(c)}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
                              >
                                <td style={{ padding: '12px 16px', color: 'var(--text)' }}>{c.name}</td>
                                <td style={{ padding: '12px 16px', color: 'var(--text2)', fontFamily: 'monospace' }}>{c.phone}</td>
                                <td style={{ padding: '12px 16px' }}>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, ...pillStyle }}>
                                    {isThisRowCalling && status !== 'completed' && status !== 'failed'
                                      ? <><Loader2 size={10} className="spin" style={{ verticalAlign: 'middle', marginRight: 4 }} />Calling</>
                                      : pillLabel}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                  {outcomeMeta ? (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 500,
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        background: outcomeMeta.bg,
                                        color: outcomeMeta.fg,
                                        whiteSpace: 'nowrap',
                                      }}
                                      title={outcomeMeta.description}
                                    >
                                      {outcomeMeta.label}
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text3)' }}>—</span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                  {/* Per-row "Call now" — ghost-style at
                                      this size so a long contact list
                                      doesn't turn into a wall of cyan.
                                      Hovers to accent so it still reads
                                      as actionable. The icon-only label
                                      keeps the column narrow; full text
                                      lives in the title attr for
                                      tooltip + screen reader access. */}
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{
                                      padding: '6px 10px',
                                      gap: 6,
                                      cursor: buttonDisabled ? (isThisRowCalling ? 'wait' : 'not-allowed') : 'pointer',
                                      opacity: buttonDisabled ? 0.6 : 1,
                                    }}
                                    title={
                                      status === 'calling' ? 'A call is already in progress for this contact.'
                                      : callingContactId ? 'Another call is in progress. Wait for it to finish.'
                                      : 'Call this contact now'
                                    }
                                    disabled={buttonDisabled}
                                    onMouseEnter={(e) => {
                                      if (buttonDisabled) return;
                                      e.currentTarget.style.color = 'var(--accent)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = '';
                                    }}
                                    onClick={(e) => {
                                      // Stop the click from bubbling up to
                                      // the row, which would open the drawer
                                      // when the user actually meant to dial.
                                      e.stopPropagation();
                                      placeManualCall(c.id);
                                    }}
                                  >
                                    {isThisRowCalling
                                      ? <Loader2 size={13} className="spin" />
                                      : <Phone size={13} />}
                                    <span>Call</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    );
                  })()}
                </div>

                <div className="card" style={{ padding: 24, height: 'fit-content' }}>
                  <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.06em' }}>Campaign Progress</h2>

                  {/* Top stats row — total contacts + total dialed.
                      The dialed number comes from outcomeStats when
                      available (sum of all classified calls), falling
                      back to the campaign row's `called` counter when
                      the stats endpoint hasn't loaded yet. Both numbers
                      are denormalized in different places, but for the
                      first paint we use whichever's available. */}
                  <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contacts</div>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>
                        {(outcomeStats?.totalContacts ?? selectedCampaign.totalContacts ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dialed</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
                        {(outcomeStats?.totalClassified ?? selectedCampaign.called ?? 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Outcome breakdown. One row per bucket showing the
                      label + count, color-coded to match the table
                      badge. Renders all 7 even when most are zero so
                      the layout stays stable as numbers come in. The
                      loading state shows a small spinner; on error
                      (stats fetch failed) we fall back to a single
                      "Outcomes will appear here once calls complete."
                      message rather than rendering ghost rows. */}
                  <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                      Outcomes
                    </div>
                    {outcomeStatsLoading && !outcomeStats ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>
                        <Loader2 size={13} className="spin" /> Loading…
                      </div>
                    ) : outcomeStats ? (
                      outcomeStats.totalClassified === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0', lineHeight: 1.5 }}>
                          Outcomes will appear here once calls complete and the AI classifier has analysed them.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {OUTCOME_LIST.map((key) => {
                            const meta = OUTCOME_META[key];
                            const count = outcomeStats.stats[key] ?? 0;
                            const pct = outcomeStats.totalClassified > 0
                              ? Math.round((count / outcomeStats.totalClassified) * 100)
                              : 0;
                            return (
                              <div
                                key={key}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                                title={meta.description}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                  {/* Tiny color dot to associate the row
                                      with the badge in the contacts table
                                      — same color, same bucket, no extra
                                      learning needed. */}
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.fg, flexShrink: 0 }} />
                                  <span style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {meta.label}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{count.toLocaleString()}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{pct}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>
                        Couldn’t load outcome stats. Refresh to try again.
                      </div>
                    )}
                  </div>

                  {/* Completion bar at the bottom — retained from the
                      previous version because it answers a different
                      question than the breakdown above ("how far through
                      the contact list are we?" vs "what happened on the
                      calls so far?"). */}
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    {(() => {
                      const total = outcomeStats?.totalContacts ?? selectedCampaign.totalContacts ?? 0;
                      const dialed = outcomeStats?.totalClassified ?? selectedCampaign.called ?? 0;
                      const pct = total > 0 ? Math.round((dialed / total) * 100) : 0;
                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                            <span style={{ color: 'var(--text3)' }}>Completion</span>
                            <span style={{ fontWeight: 600 }}>{pct}%</span>
                          </div>
                          <div className="progress" style={{ height: 6 }}>
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

            </div>
          ) : showNew ? (
            <div className="fade-in" style={{ maxWidth: 720, margin: '0', width: '100%' }}>
              <button
                onClick={() => { setShowNew(false); setWizardStep(1); setPendingContacts([]); setPendingFileName(null); setParseError(null); setManualName(''); setManualPhone(''); setManualError(null); }}
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

              {/* Step indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
                {[
                  { n: 1, label: 'Details' },
                  { n: 2, label: 'Contacts' },
                  { n: 3, label: 'Review' },
                ].map((s, i, arr) => {
                  const isActive = wizardStep === s.n;
                  const isDone = wizardStep > s.n;
                  return (
                    <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i === arr.length - 1 ? '0 0 auto' : '1 1 auto' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                          background: isActive ? 'var(--accent)' : isDone ? 'var(--green)' : 'var(--bg3)',
                          color: (isActive || isDone) ? 'white' : 'var(--text3)',
                          transition: 'all 0.2s',
                        }}>
                          {isDone ? <CheckCircle2 size={16} /> : s.n}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'var(--text)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {s.label}
                        </div>
                      </div>
                      {i < arr.length - 1 && (
                        <div style={{ flex: 1, height: 2, background: isDone ? 'var(--green)' : 'var(--border)', margin: '0 12px', marginBottom: 22, transition: 'background 0.2s' }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Details */}
              {wizardStep === 1 && (
                <div className="card" style={{ padding: 32 }}>
                  <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Campaign details</h2>
                  <p style={{ color: 'var(--text3)', marginBottom: 28, fontSize: 14 }}>Name your campaign and pick the assistant that will run it.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {[
                      { label: 'Campaign Name', key: 'name', type: 'text', placeholder: 'e.g. Insurance Renewal March' },
                      { label: 'Category', key: 'roomType', type: 'text', placeholder: 'e.g. Insurance, Banking, Survey' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                          {f.label}
                        </label>
                        <input className="input" type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} required />
                      </div>
                    ))}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                          Language
                        </label>
                        <Dropdown
                          value={form.language}
                          onChange={(v) => setForm(p => ({ ...p, language: v }))}
                          options={LANG_OPTIONS}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                          Assistant
                        </label>
                        <Dropdown
                          value={form.agentId}
                          onChange={(v) => setForm(p => ({ ...p, agentId: v }))}
                          options={assistantOptions}
                          disabled={agents.length === 0}
                          placeholder={agents.length === 0 ? 'No assistants available' : 'Select an assistant…'}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                        Call Script
                      </label>
                      <textarea className="input" rows={6} placeholder="Hello, I am calling from..." style={{ resize: 'none' }} value={form.script} onChange={e => setForm(p => ({ ...p, script: e.target.value }))} required />
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>This is what the assistant will say when the contact answers.</div>
                    </div>

                    {(() => {
                      // All four fields are required. The button stays
                      // disabled until they're all filled — no asterisks
                      // and no inline banner needed; the disabled state
                      // is the affordance. Trim before checking so a
                      // stray space doesn't count as "filled" (matches
                      // server-side trimming so the UI never thinks a
                      // field is valid that the API will reject).
                      const allFilled =
                        form.name.trim() !== '' &&
                        form.roomType.trim() !== '' &&
                        !!form.agentId &&
                        form.script.trim() !== '';

                      const noAgents = agents.length === 0;
                      const isDisabled = noAgents || !allFilled;

                      return (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ height: 36, minWidth: 160, justifyContent: 'center', ...PRIMARY_HOVER_BORDER }}
                            onMouseEnter={onPrimaryHoverEnter}
                            onMouseLeave={onPrimaryHoverLeave}
                            onClick={() => setWizardStep(2)}
                            disabled={isDisabled}
                          >
                            {noAgents ? 'Create an Assistant first' : <>Continue <ArrowRight size={13} /></>}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Step 2: Contacts */}
              {wizardStep === 2 && (
                <div className="card" style={{ padding: 32 }}>
                  <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Upload contacts</h2>
                  <p style={{ color: 'var(--text3)', marginBottom: 24, fontSize: 14 }}>
                    Upload a CSV with columns <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>Name, Phone</code>. You can skip this and add contacts later.
                  </p>

                  {pendingContacts.length === 0 ? (
                    <label htmlFor="wizardCsv" style={{
                      display: 'block',
                      border: '2px dashed var(--border)',
                      borderRadius: 12,
                      padding: '40px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <input id="wizardCsv" type="file" accept=".csv" style={{ display: 'none' }} onChange={handleWizardCsv} />
                      <Upload size={28} style={{ color: 'var(--text3)', marginBottom: 8 }} />
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        Click to upload a CSV
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                        Or drop a file here. Format: <code>Name,Phone</code> per row.
                      </div>
                    </label>
                  ) : (
                    <div style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 20,
                      background: 'var(--bg2)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FileText size={18} />
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pendingFileName || 'contacts.csv'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                            {pendingContacts.length.toLocaleString()} contact{pendingContacts.length === 1 ? '' : 's'} ready to import
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {/* Replace = swap to a different CSV (re-opens the
                              file picker via the hidden <input>). Keeping the
                              <label> wrapping the button so the existing
                              wizardCsv input still triggers — we don't want
                              two separate file inputs floating around. */}
                          <label htmlFor="wizardCsv" className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                            Replace
                          </label>
                          {/* Remove = abandon the upload entirely and return
                              to the empty drop-zone state. Different intent
                              from Replace: "I changed my mind, no contacts
                              for now" rather than "I picked the wrong file".
                              Both clear pendingContacts and pendingFileName;
                              Remove additionally leaves the picker closed so
                              the user falls back to the dashed drop zone. */}
                          <button
                            type="button"
                            onClick={() => {
                              setPendingContacts([]);
                              setPendingFileName(null);
                              setParseError(null);
                            }}
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--red)' }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {/* Preview first 5 rows */}
                      <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--bg3)', color: 'var(--text3)' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Name</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Phone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingContacts.slice(0, 5).map((c, i) => (
                              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{c.name}</td>
                                <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'monospace' }}>{c.phone}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {pendingContacts.length > 5 && (
                          <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text3)', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                            … and {(pendingContacts.length - 5).toLocaleString()} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {parseError && (
                    <div style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      background: 'var(--amber-soft)',
                      border: '1px solid #fde68a',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--amber)',
                    }}>
                      {parseError}
                    </div>
                  )}

                  {/* Inline single-contact entry. Sits below the CSV zone
                      so the file path remains the visual primary (it's
                      what most users want), with this as a lighter "or
                      add one manually" affordance. The divider with the
                      "OR" label is a tiny visual marker that this is an
                      alternative input — not a separate step. The form
                      stays available even after a CSV is loaded so the
                      user can append a single VIP they forgot to include. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px', color: 'var(--text3)' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>or add one manually</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: 8, alignItems: 'flex-start' }}>
                    <input
                      className="input"
                      type="text"
                      placeholder="Contact name"
                      value={manualName}
                      onChange={(e) => { setManualName(e.target.value); if (manualError) setManualError(null); }}
                      onKeyDown={(e) => {
                        // Enter from either field commits the row — keeps
                        // the workflow keyboard-only for power users
                        // pasting a list one entry at a time.
                        if (e.key === 'Enter') { e.preventDefault(); handleAddManualContact(); }
                      }}
                      style={{ height: 36, fontSize: 13 }}
                    />
                    {/* Phone input is split: a fixed '+91' chip on the
                        left makes the country code unambiguous and
                        non-editable, and the input on the right accepts
                        only 10 digits. We don't use a country picker
                        because India is the only supported market right
                        now (see normalizeIndianPhone for why). The chip
                        is wrapped with the input in a single bordered
                        shell so it reads as one control rather than
                        two adjacent ones. inputMode="numeric" plus a
                        digit-only onChange keeps mobile keyboards on
                        the number pad and silently strips paste
                        attempts that include spaces or dashes. */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        height: 36,
                        border: '1.5px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg2)',
                        overflow: 'hidden',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 10px',
                          background: 'var(--bg3)',
                          color: 'var(--text2)',
                          fontSize: 13,
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          borderRight: '1px solid var(--border)',
                          userSelect: 'none',
                        }}
                        aria-label="Country code +91"
                      >
                        +91
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="98765 43210"
                        maxLength={10}
                        value={manualPhone}
                        onChange={(e) => {
                          // Strip non-digits on input so the user can paste
                          // '+91 98765 43210' or '98765-43210' without
                          // having to clean it up themselves. Cap at 10
                          // because that's the subscriber-number length;
                          // anything longer is either a mistake or an
                          // already-prefixed number, both of which
                          // normalizeIndianPhone() handles on submit.
                          const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setManualPhone(cleaned);
                          if (manualError) setManualError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleAddManualContact(); }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: '100%',
                          padding: '0 12px',
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          fontSize: 13,
                          fontFamily: 'monospace',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                    {/* Add button is ghost-style, not primary — the page's
                        primary CTA is "Continue / Skip for now" at the
                        bottom. A second cyan-filled button up here would
                        compete and confuse users about which is the
                        forward action. */}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{
                        height: 36,
                        padding: '0 14px',
                        cursor: (!manualName.trim() || manualPhone.length !== 10) ? 'not-allowed' : 'pointer',
                        opacity: (!manualName.trim() || manualPhone.length !== 10) ? 0.6 : 1,
                      }}
                      disabled={!manualName.trim() || manualPhone.length !== 10}
                      onClick={handleAddManualContact}
                      onMouseEnter={(e) => {
                        if ((e.currentTarget as HTMLButtonElement).disabled) return;
                        e.currentTarget.style.color = 'var(--accent)';
                      }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
                    >
                      <Plus size={13} /> Add
                    </button>
                  </div>

                  {manualError && (
                    <div style={{
                      marginTop: 8,
                      padding: '8px 12px',
                      background: 'var(--red-soft)',
                      border: '1px solid #fecaca',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--red)',
                    }}>
                      {manualError}
                    </div>
                  )}

                  {/* Footer buttons: right-aligned cluster (matches form
                      conventions where primary action sits at the right).
                      Continue is sized to its content rather than stretched
                      — a 100%-wide "Continue" button on a half-empty page
                      reads as accidental rather than purposeful. Back stays
                      ghost-style on the left so the visual hierarchy is
                      preserved (back = secondary, continue = primary).
                      The Skip-vs-Continue label switch is preserved: when
                      no contacts are loaded the right button reads "Skip
                      for now" (lighter implication) and stays the same
                      width as Continue for a stable layout. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                    <button className="btn btn-ghost btn-sm" style={{ height: 36 }} onClick={() => setWizardStep(1)}>
                      ← Back
                    </button>
                    {pendingContacts.length === 0 ? (
                      // No contacts loaded — "Skip for now" stays cyan-filled
                      // by default but flips to an outlined treatment on
                      // hover (see PRIMARY_HOVER_BORDER + handlers above).
                      // Same visual contract as every other primary CTA in
                      // the wizard so the flow feels uniform.
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ height: 36, minWidth: 130, justifyContent: 'center', ...PRIMARY_HOVER_BORDER }}
                        onMouseEnter={onPrimaryHoverEnter}
                        onMouseLeave={onPrimaryHoverLeave}
                        onClick={() => setWizardStep(3)}
                      >
                        Skip for now
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ height: 36, minWidth: 130, justifyContent: 'center', ...PRIMARY_HOVER_BORDER }}
                        onMouseEnter={onPrimaryHoverEnter}
                        onMouseLeave={onPrimaryHoverLeave}
                        onClick={() => setWizardStep(3)}
                      >
                        Continue <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Review */}
              {wizardStep === 3 && (
                <div className="card" style={{ padding: 32 }}>
                  <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Review & launch</h2>
                  <p style={{ color: 'var(--text3)', marginBottom: 24, fontSize: 14 }}>
                    {pendingContacts.length > 0 ? (
                      <>Confirm the details below. Your campaign will start dialing the <strong>{pendingContacts.length.toLocaleString()}</strong> uploaded contact{pendingContacts.length === 1 ? '' : 's'} as soon as it's created.</>
                    ) : (
                      <>Confirm the details below. Your campaign will be created in <strong>draft</strong> status — add contacts later to start it.</>
                    )}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    {[
                      { label: 'Campaign name', value: form.name || '—' },
                      { label: 'Category', value: form.roomType || '—' },
                      { label: 'Language', value: LANG[form.language] || form.language },
                      { label: 'Assistant', value: agents.find(a => a.id === form.agentId)?.name || '—' },
                      { label: 'Contacts to import', value: pendingContacts.length > 0 ? `${pendingContacts.length.toLocaleString()} from ${pendingFileName || 'CSV'}` : 'None (add later)' },
                      { label: 'Script preview', value: form.script ? (form.script.length > 80 ? form.script.slice(0, 80) + '…' : form.script) : '—' },
                    ].map((row, i, arr) => (
                      <div key={row.label} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        padding: '14px 18px',
                        borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                        background: i % 2 === 0 ? 'transparent' : 'var(--bg2)',
                      }}>
                        <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>{row.label}</div>
                        <div style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{row.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Right-aligned button cluster mirrors Step 2's footer
                      so the wizard's two-button rows feel uniform. The
                      "Create campaign" button is sized to its content
                      rather than stretched — by Step 3 the user has
                      already committed (they walked through Details and
                      Contacts to get here), so the action is a confirm,
                      not a commit. Stretching the primary button on a
                      review screen would over-state what's actually a
                      lightweight "yes, looks right" moment, and would
                      visually compete with the review table above. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                    <button className="btn btn-ghost btn-sm" style={{ height: 36 }} onClick={() => setWizardStep(2)} disabled={loading}>
                      ← Back
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ height: 36, minWidth: 160, justifyContent: 'center', ...PRIMARY_HOVER_BORDER }}
                      onMouseEnter={onPrimaryHoverEnter}
                      onMouseLeave={onPrimaryHoverLeave}
                      onClick={handleCreateCampaign}
                      disabled={loading || !form.name || !form.agentId}
                    >
                      {loading ? <><Loader2 size={13} className="spin" /> Creating…</> : 'Create campaign'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
                <Loader2 size={32} className="spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : (
              <>
                {thisWeek.length > 0 && (
                  <section>
                    {/* Section label + select-mode trigger on the same
                        row. The icon button only appears on whichever
                        section renders FIRST (this week comes before
                        earlier), because selection mode is page-wide —
                        showing the icon on both rows would imply two
                        independent selection scopes, which it isn't.
                        Hidden during selection mode itself; the active
                        toolbar lives in the page header. */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 14,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        This week
                      </div>
                      {!selectionMode && campaigns.length > 0 && (
                        <button
                          type="button"
                          aria-label="Select multiple campaigns to delete"
                          title="Select multiple campaigns"
                          onClick={enterSelectionMode}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text3)',
                            cursor: 'pointer',
                            transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                            padding: 0,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--accent)';
                            e.currentTarget.style.borderColor = 'var(--accent)';
                            e.currentTarget.style.background = 'var(--accent-soft)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text3)';
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <CheckSquare size={15} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                      {thisWeek.map(c => (
                        <CampaignCard
                          key={c.id}
                          c={c}
                          onToggle={toggleStatus}
                          isToggling={togglingId === c.id}
                          onClick={() => setSelectedCampaign(c)}
                          isRenaming={renamingId === c.id}
                          renameDraft={renameDraft}
                          onRenameDraftChange={setRenameDraft}
                          onRenameCommit={commitRename}
                          onRenameCancel={cancelRename}
                          isDuplicating={duplicatingId === c.id}
                          onStartRename={() => startRename(c)}
                          onDuplicate={() => handleDuplicate(c)}
                          onAskDelete={() => askDelete(c)}
                          selectionMode={selectionMode}
                          isSelected={selectedIds.has(c.id)}
                          onToggleSelect={() => toggleSelectId(c.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {earlier.length > 0 && (
                  <section>
                    {/* Earlier section: only carries the select-mode
                        trigger if This Week didn't render (i.e. all
                        campaigns are older). Keeps the icon visible
                        exactly once on the page regardless of which
                        time-bucket the campaigns happen to land in. */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 14,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Earlier
                      </div>
                      {!selectionMode && thisWeek.length === 0 && campaigns.length > 0 && (
                        <button
                          type="button"
                          aria-label="Select multiple campaigns to delete"
                          title="Select multiple campaigns"
                          onClick={enterSelectionMode}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            width: 32,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text3)',
                            cursor: 'pointer',
                            transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                            padding: 0,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--accent)';
                            e.currentTarget.style.borderColor = 'var(--accent)';
                            e.currentTarget.style.background = 'var(--accent-soft)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text3)';
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <CheckSquare size={15} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                      {earlier.map(c => (
                        <CampaignCard
                          key={c.id}
                          c={c}
                          onToggle={toggleStatus}
                          isToggling={togglingId === c.id}
                          onClick={() => setSelectedCampaign(c)}
                          isRenaming={renamingId === c.id}
                          renameDraft={renameDraft}
                          onRenameDraftChange={setRenameDraft}
                          onRenameCommit={commitRename}
                          onRenameCancel={cancelRename}
                          isDuplicating={duplicatingId === c.id}
                          onStartRename={() => startRename(c)}
                          onDuplicate={() => handleDuplicate(c)}
                          onAskDelete={() => askDelete(c)}
                          selectionMode={selectionMode}
                          isSelected={selectedIds.has(c.id)}
                          onToggleSelect={() => toggleSelectId(c.id)}
                        />
                      ))}
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
              </>
            )
          )}

        </main>

        <ConfirmDialog
          open={!!pendingDelete}
          title="Delete this campaign?"
          message={pendingDelete
            ? `"${pendingDelete.name || 'Untitled'}" will be permanently removed. This can't be undone.`
            : ''}
          confirmLabel="Delete"
          loading={deleteLoading}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={closeDeleteDialog}
        />

        {/* Bulk-delete confirmation. Shares the same dialog component
            as single delete, just with a multi-row message. The
            confirmBulkDelete handler does the partial-success accounting
            and writes a summary into bulkDeleteError when some rows
            can't be deleted (typically 409s from campaigns with call
            history) — the dialog then converts itself to a single
            "Close" button via the existing `error` prop, so the user
            acknowledges the partial outcome and the dialog goes away. */}
        <ConfirmDialog
          open={bulkDeleteOpen}
          title={selectedIds.size === 1 ? 'Delete this campaign?' : `Delete ${selectedIds.size} campaigns?`}
          message={selectedIds.size === 1
            ? `1 campaign will be permanently removed. This can't be undone.`
            : `${selectedIds.size} campaigns will be permanently removed. This can't be undone.`}
          confirmLabel={selectedIds.size === 1 ? 'Delete' : `Delete ${selectedIds.size}`}
          loading={bulkDeleting}
          error={bulkDeleteError}
          onConfirm={confirmBulkDelete}
          onCancel={closeBulkDeleteDialog}
        />

        {/* Contact-detail drawer. Slides in from the right when a row
            in the contacts table is clicked. Renders the contact's
            call history with transcripts, AI-classified outcomes, and
            recording playback. Co-located here rather than in a
            separate component file because it's tightly coupled to
            the page's state (drawerContact, drawerCalls, drawerLoading)
            and not reused anywhere else. If the drawer ever shows up
            on another page (say, the live calls page) it graduates to
            components/. */}
        <ContactDrawer
          contact={drawerContact}
          calls={drawerCalls}
          loading={drawerLoading}
          error={drawerError}
          onClose={closeContactDrawer}
        />
    </>
  );
}

/**
 * Inline error banner — same component shape as the agents page version.
 * Co-located here rather than extracted because each page wants slightly
 * different placement, and the body is six lines. If this ever grows it
 * graduates to components/.
 *
 * Note: delete failures do NOT come through here — they render inside
 * the ConfirmDialog so they stay attached to the in-progress action
 * (and don't render BEHIND the modal, which is what used to happen).
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

// ──────────────────────────────────────────────────────────────
// ContactDrawer
// ──────────────────────────────────────────────────────────────
//
// Side panel that opens from the right edge when the user clicks a
// contacts-table row. Renders one section per call (most recent
// first) with the AI-classified outcome, summary, transcript, and
// recording playback. The page owns drawerContact / drawerCalls /
// drawerLoading; this component is purely presentational.
//
// Layout choices:
//   - 480px wide on desktop, full width on narrow viewports. Wide
//     enough for transcripts to read comfortably without dwarfing
//     the contacts table behind it.
//   - Backdrop: 40% black with click-to-close. Matches the
//     ConfirmDialog backdrop so the visual language is consistent.
//   - Header sticks to the top, body scrolls. Long transcripts
//     scroll within the drawer rather than the page underneath.
//
// Transcript rendering:
//   The provider's transcript is a single string with newline-
//   separated turns, each prefixed with a speaker label like
//   "Agent: hello" / "Customer: hi". We split on speaker prefixes
//   and render alternating bubbles (Agent on the left, Customer on
//   the right) so the conversation reads like a chat. If the
//   transcript doesn't have speaker labels we render it as a single
//   block of pre-formatted text — better than guessing wrong.
//
// Recording playback:
//   When a call has a recording_key we render an audio element
//   that fetches the signed URL from /api/calls/[id]/recording.
//   The fetch is lazy (only when the user clicks Play) to avoid
//   spending signed-URL credits on calls the user never listens to.
//   Fallback: 202 from the recording route means R2 ingest is
//   pending; we show "Recording is processing."

interface ContactDrawerProps {
  contact: any | null;
  calls: any[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function ContactDrawer({ contact, calls, loading, error, onClose }: ContactDrawerProps) {
  if (!contact) return null;

  return (
    <div
      // Backdrop — click-outside closes. Matches the ConfirmDialog
      // backdrop tint so the two overlays feel like the same family.
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 17, 23, 0.4)',
        zIndex: 90,
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'cdFadeIn 0.18s ease-out',
      }}
    >
      <div
        // Stop the click from bubbling to the backdrop. The drawer
        // body shouldn't dismiss on its own clicks.
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Calls for ${contact.name || 'contact'}`}
        style={{
          width: 'min(480px, 100%)',
          height: '100vh',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 32px -8px rgba(15,17,23,0.18)',
          display: 'flex',
          flexDirection: 'column',
          // Slide-in from the right. The 0.22s feels responsive but
          // not jumpy on a 480px panel.
          animation: 'drawerSlideIn 0.22s ease-out',
        }}
      >
        {/* Header — contact name, phone, close button. Sticky so the
            user can always close even after scrolling through a long
            transcript. Border-bottom separates it from the scrolling
            body so the visual seam stays clean. */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '18px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contact.name || 'Unnamed contact'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'monospace', marginTop: 2 }}>
              {contact.phone}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text3)',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--bg2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text3)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Body — scrollable. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: 'var(--text3)', fontSize: 13, gap: 8 }}>
              <Loader2 size={16} className="spin" /> Loading call history…
            </div>
          ) : error ? (
            <div style={{
              padding: '12px 14px',
              background: 'var(--red-soft)',
              border: '1px solid #fecaca',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--red)',
            }}>
              {error}
            </div>
          ) : calls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)' }}>
              <Phone size={28} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)', marginBottom: 4 }}>No calls yet</div>
              <div style={{ fontSize: 12 }}>
                When this contact has been called, the transcript and AI-classified outcome will appear here.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {calls.map((call) => (
                <CallEntry key={call.id} call={call} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// CallEntry — one call's worth of UI inside the drawer
// ──────────────────────────────────────────────────────────────
//
// Renders: outcome badge + AI summary on top, then the transcript,
// then a recording-play button (lazy-loaded signed URL). One of
// these per call in the drawer body.

function CallEntry({ call }: { call: any }) {
  // Outcome badge resolution. Same fallback as the contacts table:
  // unknown/missing outcome renders as em-dash, never crashes.
  const outcomeKey = outcomeIsKnown(call.outcome) ? call.outcome : null;
  const outcomeMeta = outcomeKey ? OUTCOME_META[outcomeKey] : null;

  // Format duration as m:ss when present, em-dash when not. We don't
  // round up here — the webhook stores raw seconds and the UI shows
  // them faithfully so the operator's mental model matches the DB.
  const durationLabel = (() => {
    const d = Number(call.duration);
    if (!Number.isFinite(d) || d <= 0) return '—';
    const mins = Math.floor(d / 60);
    const secs = Math.floor(d % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  })();

  // Confidence as a percentage if present. We round and clamp to be
  // safe — the DB stores 0.00–1.00, but a buggy classifier could
  // hand back values outside that range.
  const confidenceLabel = (() => {
    const c = Number(call.outcome_confidence);
    if (!Number.isFinite(c)) return null;
    const pct = Math.round(Math.max(0, Math.min(1, c)) * 100);
    return `${pct}% confident`;
  })();

  // Started-at as a short locale date. Fallback to created_at, then
  // em-dash. Indian users see DD/MM/YYYY by default.
  const startedLabel = (() => {
    const ts = call.started_at || call.created_at;
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '—';
    }
  })();

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 16,
      background: 'var(--bg2)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Top row: outcome badge + metadata */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          {outcomeMeta ? (
            <span
              style={{
                display: 'inline-block',
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 999,
                background: outcomeMeta.bg,
                color: outcomeMeta.fg,
              }}
            >
              {outcomeMeta.label}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Outcome pending</span>
          )}
          {confidenceLabel && (
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>
              {confidenceLabel}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', flexShrink: 0 }}>
          <div>{startedLabel}</div>
          <div style={{ marginTop: 2 }}>Duration: {durationLabel}</div>
        </div>
      </div>

      {/* AI summary — one-sentence rationale from the classifier */}
      {call.outcome_summary && (
        <div style={{
          fontSize: 13,
          color: 'var(--text2)',
          lineHeight: 1.5,
          padding: '10px 12px',
          background: 'var(--bg)',
          borderRadius: 8,
          borderLeft: `3px solid ${outcomeMeta?.fg || 'var(--accent)'}`,
        }}>
          {call.outcome_summary}
        </div>
      )}

      {/* Transcript */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Transcript
        </div>
        <TranscriptBlock transcript={call.transcript} />
      </div>

      {/* Recording playback — lazy-loaded signed URL */}
      {call.recording_key && (
        <RecordingPlayer callId={call.id} />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// TranscriptBlock — chat-bubble rendering when speaker labels are
// detected, plain pre-formatted text otherwise.
// ──────────────────────────────────────────────────────────────

function TranscriptBlock({ transcript }: { transcript: string | null | undefined }) {
  if (!transcript || !transcript.trim()) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '12px 0' }}>
        No transcript was captured for this call.
      </div>
    );
  }

  // Detect speaker-labelled lines like "Agent: hello" / "Customer: hi".
  // The orchestration sometimes emits these, sometimes a flat string.
  // We test on the first non-empty line; if it looks labelled we
  // assume the whole transcript is and parse accordingly.
  const lines = transcript.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const labelPattern = /^(agent|assistant|bot|customer|user|caller|callee)\s*:\s*(.*)$/i;
  const looksLabelled = lines.length > 0 && labelPattern.test(lines[0]);

  if (!looksLabelled) {
    // Plain transcript — render as monospace pre-formatted text.
    // Fixed max-height with overflow keeps very long transcripts
    // from making the drawer scroll feel like one giant text wall.
    return (
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text2)',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 12,
          maxHeight: 320,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {transcript}
      </div>
    );
  }

  // Labelled — render as alternating chat bubbles. Agent-side labels
  // (agent / assistant / bot) align left with a neutral bubble;
  // customer-side labels align right with the cyan accent bubble.
  // Anything else falls through to a centered system-style bubble
  // (rare, but happens when the transcript has stage-direction lines
  // like "[end of call]").
  const isAgent = (label: string) =>
    /^(agent|assistant|bot)$/i.test(label.trim());
  const isCustomer = (label: string) =>
    /^(customer|user|caller|callee)$/i.test(label.trim());

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 12,
        maxHeight: 320,
        overflowY: 'auto',
      }}
    >
      {lines.map((line, idx) => {
        const m = labelPattern.exec(line);
        if (!m) {
          // Doesn't match the speaker pattern — render as a
          // small italic line so it visually steps out of the
          // back-and-forth.
          return (
            <div
              key={idx}
              style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', textAlign: 'center', margin: '4px 0' }}
            >
              {line}
            </div>
          );
        }
        const [, speaker, body] = m;
        const agentSide = isAgent(speaker);
        const customerSide = isCustomer(speaker);
        const align: React.CSSProperties = agentSide
          ? { alignSelf: 'flex-start', background: 'var(--bg2)', color: 'var(--text)' }
          : customerSide
            ? { alignSelf: 'flex-end', background: 'var(--accent-soft)', color: 'var(--accent)' }
            : { alignSelf: 'center', background: 'var(--bg3)', color: 'var(--text2)' };
        return (
          <div
            key={idx}
            style={{
              ...align,
              maxWidth: '85%',
              padding: '8px 12px',
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {speaker}
            </div>
            {body}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// RecordingPlayer — lazy-loaded signed-URL audio.
// ──────────────────────────────────────────────────────────────
//
// We don't fetch the signed URL until the user clicks Load — most
// drawer opens are quick scans of the outcome and transcript, and
// the recording route burns API budget every time it generates a
// new URL. Lazy-load means we only pay for what's actually played.
//
// Three states:
//   1. Idle: "Load recording" button.
//   2. Loading: spinner.
//   3. Loaded: native <audio> element with the signed URL.
//
// 202 from the recording route means R2 ingest hasn't completed for
// this call (recording_url is set, recording_key isn't yet). We
// surface that with a friendly "processing" message rather than
// failing silently.

function RecordingPlayer({ callId }: { callId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'pending' | 'error'>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadRecording = async () => {
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/calls/${callId}/recording`);
      if (res.status === 202) {
        setState('pending');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || `Recording fetch failed (${res.status}).`);
        setState('error');
        return;
      }
      const data = await res.json();
      if (!data.url) {
        setErrorMsg('Recording URL was not returned.');
        setState('error');
        return;
      }
      setUrl(data.url);
      setState('ready');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error fetching recording.');
      setState('error');
    }
  };

  if (state === 'idle') {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={loadRecording}
        style={{ alignSelf: 'flex-start', gap: 6 }}
      >
        <Volume2 size={14} /> Load recording
      </button>
    );
  }

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)' }}>
        <Loader2 size={14} className="spin" /> Loading recording…
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
        Recording is processing. Check back in a minute.
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={{ fontSize: 12, color: 'var(--red)' }}>
        {errorMsg || 'Failed to load recording.'}
      </div>
    );
  }

  // Ready — render a native audio player. The browser handles
  // play/pause/scrub UI for us; we don't need a custom one. The
  // signed URL has a 5-min TTL, which is plenty for the duration
  // of any single playback session.
  return (
    <audio
      controls
      src={url || undefined}
      style={{ width: '100%', marginTop: 4 }}
    />
  );
}

/**
 * CampaignCard — render-safe defaults for every numeric/string field.
 *
 * Same defensive pattern as AgentCard. The /api/campaigns POST endpoint
 * may return a freshly-inserted row before its DB defaults serialize
 * back, so `totalContacts`, `called`, `converted`, `agentName`,
 * `roomType`, `language`, `name`, `status` can all be undefined.
 *
 * Without these guards, calling `.toLocaleString()` or `.toFixed()` on
 * undefined would crash the entire campaigns list view the moment a
 * fresh campaign appears — which is exactly the worst time to fail
 * (right after the user clicks "Create campaign"). That's the "blank
 * page" the user saw: a render error inside a child unmounted everything
 * inside <main> while the page chrome stayed.
 *
 * Fixing in the UI rather than enforcing API defaults keeps the API
 * contract stable and makes the card resilient to any partial-row
 * data path (mocks, optimistic updates, etc.).
 *
 * Inline rename:
 *   When `isRenaming` is true the name display swaps for an <input>
 *   bound to `renameDraft`. Enter commits, Esc/blur cancels — same
 *   contract as the agents page. Click on the input is stopped from
 *   bubbling so it doesn't open the campaign detail view.
 *
 * Pause/Resume button:
 *   Now async (used to be local-only). When `isToggling` is true the
 *   button disables itself and shows a spinner so a fast double-click
 *   can't queue two PATCHes against the same row.
 */
interface CampaignCardProps {
  c: Campaign;
  onToggle: (id: string) => void;
  isToggling: boolean;
  onClick?: () => void;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  isDuplicating: boolean;
  onStartRename: () => void;
  onDuplicate: () => void;
  onAskDelete: () => void;
  // Bulk-delete selection. When `selectionMode` is true the card
  // hides its kebab, intercepts clicks to toggle selection rather
  // than navigate, and shows a checkbox in the top-left corner.
  // The checkbox itself is purely visual — the entire card surface
  // is the click target so users don't have to aim at a tiny box.
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}

function CampaignCard({
  c,
  onToggle,
  isToggling,
  onClick,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  isDuplicating,
  onStartRename,
  onDuplicate,
  onAskDelete,
  selectionMode,
  isSelected,
  onToggleSelect,
}: CampaignCardProps) {
  const totalContacts = c.totalContacts ?? 0;
  const called        = c.called        ?? 0;
  const converted     = c.converted     ?? 0;
  const name          = c.name          || 'Untitled campaign';
  const status        = c.status        || 'draft';
  const language      = c.language      || 'en';
  const roomType      = c.roomType      || 'Sales';
  const agentName     = c.agentName     || '—';

  const progress = totalContacts > 0 ? Math.round((called / totalContacts) * 100) : 0;
  const convRate = called > 0 ? ((converted / called) * 100).toFixed(1) : '0';
  // Resolve the category icon component. Falls back to Phone when the
  // campaign's roomType isn't in our known set — keeps unknown values
  // (legacy data, custom categories) from rendering an empty block.
  const CategoryIcon = CATEGORY_ICON[roomType] || Phone;
  const statusClass = STATUS_BADGE[status] || 'badge-gray';

  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  return (
    <div
      className="card"
      // Click semantics shift based on mode:
      //   - Selection mode: toggle the card's selection. Skip if the
      //     user is mid-rename (the input handles its own clicks).
      //   - Normal mode: navigate to the detail view as before.
      onClick={(e) => {
        if (isRenaming) return;
        if (selectionMode) { onToggleSelect(); return; }
        onClick?.();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        cursor: 'pointer',
        transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
        // Visually mark selected cards so it's obvious which ones are
        // about to be deleted. Cyan-tinted border + subtle accent
        // background — same accent token used for the active filter
        // and primary buttons, so the selection state feels consistent
        // with the rest of the page's interactive language.
        borderColor: isSelected ? 'var(--accent)' : undefined,
        boxShadow: isSelected ? '0 0 0 1px var(--accent)' : undefined,
        background: isSelected ? 'var(--accent-soft)' : undefined,
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Left side: emoji icon, OR the selection checkbox in its place
            during selection mode. Swapping out the icon (rather than
            adding a checkbox alongside it) keeps the card's visual
            density unchanged — critical for a grid where dozens of
            cards may render at once. The checkbox styling is custom
            (cyan-filled when checked, outlined when not) so it matches
            the rest of the page's accent treatment. */}
        {selectionMode ? (
          <div
            role="checkbox"
            aria-checked={isSelected}
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isSelected ? 'var(--accent)' : 'var(--bg2)',
              border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border2)'}`,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {isSelected && <Check size={18} style={{ color: 'white' }} strokeWidth={3} />}
          </div>
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            // Match the assistants page icon block: neutral grey
            // background with the icon in cyan accent. Keeps the
            // visual weight low so the card title leads, and the two
            // pages (campaigns + assistants) feel like the same
            // product family.
            background: 'var(--bg3)',
            color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CategoryIcon size={20} strokeWidth={2} />
          </div>
        )}
        {/* Kebab menu hides during selection mode — its actions (rename,
            duplicate, delete-one) don't apply to a multi-select context
            and would just be confusing if visible. */}
        {!selectionMode && (
          <MoreMenu
            ariaLabel={`Actions for ${name}`}
            items={[
              { label: 'Rename',    onClick: onStartRename, disabled: isRenaming },
              { label: isDuplicating ? 'Duplicating…' : 'Duplicate', onClick: onDuplicate, disabled: isDuplicating },
              { label: 'Delete',    onClick: onAskDelete, danger: true },
            ]}
          />
        )}
      </div>

      <div>
        {isRenaming ? (
          <input
            ref={inputRef}
            className="input"
            value={renameDraft}
            // The card's onClick suppresses navigation while renaming,
            // but stopping propagation here too means the click never
            // reaches the card at all — slightly cheaper, slightly safer.
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRenameDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onRenameCommit(); }
              else if (e.key === 'Escape') { e.preventDefault(); onRenameCancel(); }
            }}
            onBlur={onRenameCommit}
            style={{ height: 32, padding: '4px 8px', fontSize: 14, fontWeight: 600 }}
          />
        ) : (
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: isRenaming ? 6 : 0 }}>
          {LANG[language] || language} · {totalContacts.toLocaleString()} contacts
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
        <span className={`badge ${statusClass}`}>{status}</span>
        <span className="badge badge-purple">{agentName}</span>
        <span className="badge badge-green">Conv: {convRate}%</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        {(() => {
          // Resume requires at least one contact — mirrors the detail-view
          // guard so a user can't bypass the rule by clicking from the
          // card. Pause is always allowed regardless of count. The
          // whole button is also disabled in selection mode so a click
          // toggles selection (via the card's onClick) rather than
          // starting/pausing the campaign — a Pause action wouldn't
          // make sense as a side effect of trying to select a row.
          const cardNoContacts = status !== 'active' && totalContacts === 0;
          const disabled = isToggling || cardNoContacts || selectionMode;
          return (
            <button
              className="btn btn-ghost btn-sm"
              style={{
                flex: 1,
                justifyContent: 'center',
                opacity: disabled ? 0.6 : 1,
                cursor: isToggling ? 'wait' : (cardNoContacts || selectionMode) ? 'not-allowed' : 'pointer',
              }}
              disabled={disabled}
              title={
                selectionMode ? 'Exit selection mode to pause or resume.'
                : cardNoContacts ? 'Upload contacts on the campaign page before starting.'
                : undefined
              }
              onClick={(e) => { e.stopPropagation(); if (!selectionMode && !cardNoContacts) onToggle(c.id); }}
            >
              {isToggling
                ? <><Loader2 size={13} className="spin" /> {status === 'active' ? 'Pausing…' : 'Starting…'}</>
                : status === 'active'
                  ? <><PauseCircle size={13} /> Pause</>
                  : <><PlayCircle size={13} /> Resume</>}
            </button>
          );
        })()}
      </div>
    </div>
  );
}
