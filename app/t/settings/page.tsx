"use client";
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Topbar from '@/components/Topbar';
import PageHeader from '@/components/PageHeader';
import { Building2, Phone, Bell, Shield, Globe, Lock, Save, Trash2, Download, Loader2, AlertCircle } from 'lucide-react';

const TABS = [
  { id: 'workspace',     label: 'Workspace',     icon: Building2 },
  { id: 'telephony',     label: 'Telephony',     icon: Phone },
  { id: 'compliance',    label: 'Compliance',    icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'languages',     label: 'Languages',     icon: Globe },
  { id: 'security',      label: 'Security',      icon: Lock },
];

// ─────────────────────────────────────────────────────────
// Settings type — mirrors what /api/settings returns
// ─────────────────────────────────────────────────────────

type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type AlertPrefs = {
  campaign_completed: boolean;
  low_minutes_warning: boolean;
  high_conversion_alert: boolean;
  call_failure_spike: boolean;
  daily_summary_email: boolean;
};

type Settings = {
  // Workspace
  name: string;
  industry: string;
  phone: string;
  support_email: string;
  address: string;
  gstin: string;
  timezone: string;
  // Telephony
  caller_id_number: string;
  caller_id_display_name: string;
  business_hours_start: string;
  business_hours_end: string;
  working_days: WeekDay[];
  max_concurrent_calls: number;
  calls_per_minute: number;
  daily_call_cap: number;
  retry_attempts: number;
  // Compliance
  dnd_check: boolean;
  opt_out_detection: boolean;
  recording_disclosure: boolean;
  gdpr_mode: boolean;
  // Notifications
  alert_prefs: AlertPrefs;
  notification_email: string;
  whatsapp_number: string;
  // Languages
  languages: string[];
};

const DEFAULT_SETTINGS: Settings = {
  name: '',
  industry: '',
  phone: '',
  support_email: '',
  address: '',
  gstin: '',
  timezone: 'Asia/Kolkata',
  caller_id_number: '',
  caller_id_display_name: '',
  business_hours_start: '09:00',
  business_hours_end: '20:00',
  working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  max_concurrent_calls: 50,
  calls_per_minute: 10,
  daily_call_cap: 5000,
  retry_attempts: 3,
  dnd_check: true,
  opt_out_detection: true,
  recording_disclosure: true,
  gdpr_mode: false,
  alert_prefs: {
    campaign_completed: true,
    low_minutes_warning: true,
    high_conversion_alert: true,
    call_failure_spike: true,
    daily_summary_email: true,
  },
  notification_email: '',
  whatsapp_number: '',
  languages: ['en'],
};

const ALERT_LABELS: { key: keyof AlertPrefs; label: string; desc: string }[] = [
  { key: 'campaign_completed',    label: 'Campaign completed',  desc: 'When a campaign finishes all contacts' },
  { key: 'low_minutes_warning',   label: 'Low minutes warning', desc: 'When remaining minutes drop below 20%' },
  { key: 'high_conversion_alert', label: 'High conversion alert', desc: 'When conversion rate exceeds your target' },
  { key: 'call_failure_spike',    label: 'Call failure spike',  desc: 'When failure rate exceeds 30% in any 30 min window' },
  { key: 'daily_summary_email',   label: 'Daily summary email', desc: 'Performance digest delivered every evening at 9 PM' },
];

// ─────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────

function SettingsContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('workspace');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some(t => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) {
          setError('Could not load settings');
          return;
        }
        const data = await res.json();
        if (!cancelled && data.settings) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
          setIsDemo(!!data.isDemo);
        }
      } catch (err) {
        console.error('Load settings failed:', err);
        if (!cancelled) setError('Network error loading settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateField = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    if (saved) setSaved(false);
    if (error) setError(null);
  };

  const updateAlert = (key: keyof AlertPrefs, value: boolean) => {
    setSettings(prev => ({ ...prev, alert_prefs: { ...prev.alert_prefs, [key]: value } }));
    if (saved) setSaved(false);
    if (error) setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    let payload: Partial<Settings> = {};

    if (activeTab === 'workspace') {
      payload = {
        name: settings.name,
        industry: settings.industry,
        phone: settings.phone,
        support_email: settings.support_email,
        address: settings.address,
        gstin: settings.gstin,
        timezone: settings.timezone,
      };
    } else if (activeTab === 'telephony') {
      // Client-side guard before sending
      if (settings.business_hours_start >= settings.business_hours_end) {
        setError('End time must be after start time');
        setSaving(false);
        return;
      }
      if (settings.working_days.length === 0) {
        setError('Select at least one working day');
        setSaving(false);
        return;
      }
      payload = {
        caller_id_number: settings.caller_id_number,
        caller_id_display_name: settings.caller_id_display_name,
        business_hours_start: settings.business_hours_start,
        business_hours_end: settings.business_hours_end,
        working_days: settings.working_days,
        max_concurrent_calls: settings.max_concurrent_calls,
        calls_per_minute: settings.calls_per_minute,
        daily_call_cap: settings.daily_call_cap,
        retry_attempts: settings.retry_attempts,
      };
    } else if (activeTab === 'compliance') {
      payload = {
        dnd_check: settings.dnd_check,
        opt_out_detection: settings.opt_out_detection,
        recording_disclosure: settings.recording_disclosure,
        gdpr_mode: settings.gdpr_mode,
      };
    } else if (activeTab === 'notifications') {
      payload = {
        alert_prefs: settings.alert_prefs,
        notification_email: settings.notification_email,
        whatsapp_number: settings.whatsapp_number,
      };
    } else if (activeTab === 'languages') {
      if (settings.languages.length === 0) {
        setError('Select at least one language');
        setSaving(false);
        return;
      }
      payload = { languages: settings.languages };
    } else {
      // Security tab — Phase 3, not wired yet
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <Topbar crumbs={[{ label: 'Dashboard', href: '/app/dashboard' }, { label: 'Settings' }]} />
        <main style={{ flex: 1, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
          <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite', marginRight: 10 }} />
          Loading settings...
        </main>
      </>
    );
  }

  // Phase 1+2 wired tabs: workspace, telephony, compliance, notifications, languages.
  // Security still Phase 3.
  const isWired = activeTab !== 'security';

  return (
    <>
      <Topbar crumbs={[{ label: 'Dashboard', href: '/app/dashboard' }, { label: 'Settings' }]} />

      <PageHeader
        title="Settings"
        subtitle="Manage your workspace, telephony, compliance and notifications"
      />

      <main style={{ flex: 1, padding: 24, overflowY: 'auto', background: 'var(--bg)' }}>

        {isDemo && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            background: 'var(--amber-soft)',
            border: '1px solid #fde68a',
            borderRadius: 10,
            fontSize: 13,
            color: 'var(--amber)',
            marginBottom: 16,
          }}>
            <AlertCircle size={15} />
            <div>
              <strong>Demo mode:</strong> You're signed in as a demo user. Saving will appear successful but changes won't persist. Sign up a real account to test full functionality.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`nav-item ${activeTab === id ? 'active' : ''}`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {activeTab === 'workspace' && <WorkspaceTab settings={settings} update={updateField} />}
            {activeTab === 'telephony' && <TelephonyTab settings={settings} update={updateField} />}
            {activeTab === 'compliance' && <ComplianceTab settings={settings} update={updateField} />}
            {activeTab === 'notifications' && (
              <NotificationsTab
                settings={settings}
                update={updateField}
                updateAlert={updateAlert}
              />
            )}
            {activeTab === 'languages' && <LanguagesTab settings={settings} update={updateField} />}
            {activeTab === 'security' && <SecurityTab />}

            {error && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 10,
                fontSize: 13,
                color: 'var(--red)',
              }}>
                {error}
              </div>
            )}

            {activeTab !== 'security' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                {!isWired && (
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                    This tab is not yet connected to the backend
                  </span>
                )}
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                  style={{ minWidth: 140, justifyContent: 'center' }}
                >
                  {saving ? (
                    <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving...</>
                  ) : saved ? (
                    'Saved!'
                  ) : (
                    <><Save size={14} /> Save changes</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export default function Settings() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text3)' }}>Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}

// ─────────────────────────────────────────────────────────
// Tab props
// ─────────────────────────────────────────────────────────

type TabProps = {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

type NotificationsTabProps = TabProps & {
  updateAlert: (key: keyof AlertPrefs, value: boolean) => void;
};

// ─────────────────────────────────────────────────────────
// WORKSPACE TAB
// ─────────────────────────────────────────────────────────

function WorkspaceTab({ settings, update }: TabProps) {
  return (
    <>
      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Company profile</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Used on invoices and customer-facing communications
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Company name" placeholder="Acme BPO"
            value={settings.name} onChange={v => update('name', v)} />
          <Field label="Industry" placeholder="Financial Services"
            value={settings.industry} onChange={v => update('industry', v)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <Field label="Business phone" placeholder="+91 98765 43210" type="tel"
            value={settings.phone} onChange={v => update('phone', v)} />
          <Field label="Support email" placeholder="ops@yourbpo.com" type="email"
            value={settings.support_email} onChange={v => update('support_email', v)} />
        </div>

        <div style={{ marginTop: 16 }}>
          <Field label="Business address" placeholder="123 Business Park, BKC, Mumbai 400051"
            value={settings.address} onChange={v => update('address', v)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <Field label="GSTIN" placeholder="27AAAPL1234C1Z5"
            hint="Required for tax-compliant invoices"
            value={settings.gstin} onChange={v => update('gstin', v.toUpperCase())} />
          <div>
            <Label>Timezone</Label>
            <select className="select" style={{ width: '100%' }}
              value={settings.timezone} onChange={e => update('timezone', e.target.value)}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST, UTC+5:30)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT, UTC+8)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Workspace logo</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
          Shown on invoices and email reports. Recommended 200×200px. <em style={{ color: 'var(--text3)' }}>(Upload coming soon)</em>
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 24,
          }}>
            {(settings.name || 'W').charAt(0).toUpperCase()}
          </div>
          <div>
            <button className="btn btn-ghost btn-sm" disabled>Upload new logo</button>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              PNG or JPG, max 2 MB
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
        <h3 style={{ fontWeight: 600, marginBottom: 4, color: 'var(--red)' }}>Danger zone</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Irreversible actions affecting your entire workspace
        </p>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 0', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Export workspace data</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Download all calls, contacts, agents, and analytics as CSV
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" disabled><Download size={13} /> Export</button>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 0',
        }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Delete workspace</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Permanently delete this workspace and all its data
            </div>
          </div>
          <button
            disabled
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              color: 'var(--red)', fontSize: 13, fontWeight: 600,
              cursor: 'not-allowed', fontFamily: 'inherit', opacity: 0.6,
            }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// TELEPHONY TAB (now wired)
// ─────────────────────────────────────────────────────────

function TelephonyTab({ settings, update }: TabProps) {
  const allDays: { key: WeekDay; label: string }[] = [
    { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
    { key: 'sun', label: 'Sun' },
  ];

  const toggleDay = (day: WeekDay) => {
    const isOn = settings.working_days.includes(day);
    const next = isOn
      ? settings.working_days.filter(d => d !== day)
      : [...settings.working_days, day];
    // Maintain mon→sun order so storage is consistent
    const order: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const sorted = order.filter(d => next.includes(d));
    update('working_days', sorted);
  };

  return (
    <>
      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Caller identity</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          The number your AI agents call from. Provisioned by Unntangle on Exotel.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label>Active caller ID</Label>
            <div style={{
              padding: '11px 13px', borderRadius: 10,
              background: 'var(--bg3)', border: '1px solid var(--border)',
              fontFamily: 'monospace', fontSize: 14, fontWeight: 600,
              color: settings.caller_id_number ? 'var(--text)' : 'var(--text3)',
            }}>
              {settings.caller_id_number || 'Not yet provisioned'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
              Need a different number? Contact support.
            </div>
          </div>
          <Field
            label="Display name (CNAM)"
            placeholder="Acme BPO"
            value={settings.caller_id_display_name}
            onChange={v => update('caller_id_display_name', v)}
            hint="Shown on caller's screen where supported"
          />
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Business hours</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Calls outside these hours are queued automatically. Times are in your workspace timezone.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label>Start time</Label>
            <input
              className="input"
              type="time"
              value={settings.business_hours_start}
              onChange={e => update('business_hours_start', e.target.value)}
            />
          </div>
          <div>
            <Label>End time</Label>
            <input
              className="input"
              type="time"
              value={settings.business_hours_end}
              onChange={e => update('business_hours_end', e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Label>Working days</Label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allDays.map(d => (
              <DayChip
                key={d.key}
                label={d.label}
                active={settings.working_days.includes(d.key)}
                onClick={() => toggleDay(d.key)}
              />
            ))}
          </div>
          {settings.working_days.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>
              Select at least one working day
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Calling limits</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Tune throughput based on your plan and infrastructure. The platform also enforces hard caps based on your plan.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <NumberField
            label="Max concurrent calls"
            value={settings.max_concurrent_calls}
            onChange={v => update('max_concurrent_calls', v)}
            min={1} max={10000}
            hint="Pro plan limit: 100. Higher available on Agency."
          />
          <NumberField
            label="Calls per minute"
            value={settings.calls_per_minute}
            onChange={v => update('calls_per_minute', v)}
            min={1} max={1000}
            hint="Spread out dialing to avoid telecom blocks"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          <NumberField
            label="Daily call cap"
            value={settings.daily_call_cap}
            onChange={v => update('daily_call_cap', v)}
            min={1} max={1_000_000}
            hint="Total outbound calls per day across all campaigns"
          />
          <NumberField
            label="Retry attempts"
            value={settings.retry_attempts}
            onChange={v => update('retry_attempts', v)}
            min={0} max={10}
            hint="Failed/no-answer calls retried before marking complete"
          />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// COMPLIANCE TAB
// ─────────────────────────────────────────────────────────

function ComplianceTab({ settings, update }: TabProps) {
  return (
    <>
      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>TRAI & DND compliance</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          India-specific regulatory settings. Disabling can put your account at risk.
        </p>

        <ToggleRow
          label="DND registry check"
          desc="Auto-skip numbers on the National DND registry before dialling"
          checked={settings.dnd_check}
          locked
        />
        <ToggleRow
          label="TRAI calling hours (9 AM – 9 PM)"
          desc="Block calls outside the window mandated by TRAI"
          checked={true}
          locked
        />
        <ToggleRow
          label="Opt-out detection"
          desc="AI detects do-not-call intent during a call and removes the contact"
          checked={settings.opt_out_detection}
          onChange={v => update('opt_out_detection', v)}
        />
        <ToggleRow
          label="Call recording disclosure"
          desc='AI announces "this call may be recorded" at the start of every call'
          checked={settings.recording_disclosure}
          onChange={v => update('recording_disclosure', v)}
        />
        <ToggleRow
          label="GDPR mode"
          desc="Auto-delete recordings and PII after 30 days. For EU customer data only."
          checked={settings.gdpr_mode}
          onChange={v => update('gdpr_mode', v)}
        />
      </div>

      <div style={{
        padding: '12px 14px',
        background: 'var(--accent-soft)',
        borderRadius: 10,
        fontSize: 12,
        color: 'var(--text2)',
        lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text)' }}>Why are some toggles locked?</strong> DND check and TRAI calling hours are mandatory under Indian telecom regulations. Disabling them would put your business and Unntangle at risk of regulatory action.
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// NOTIFICATIONS TAB (now wired)
// ─────────────────────────────────────────────────────────

function NotificationsTab({ settings, update, updateAlert }: NotificationsTabProps) {
  return (
    <>
      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Alerts</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Choose which events you want to be notified about
        </p>

        {ALERT_LABELS.map(({ key, label, desc }) => (
          <ToggleRow
            key={key}
            label={label}
            desc={desc}
            checked={settings.alert_prefs[key]}
            onChange={v => updateAlert(key, v)}
          />
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Where to send alerts</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          We'll send alerts to these contacts
        </p>

        <Field
          label="Notification email"
          type="email"
          placeholder="ops@yourbpo.com"
          value={settings.notification_email}
          onChange={v => update('notification_email', v)}
        />
        <div style={{ marginTop: 16 }}>
          <Field
            label="WhatsApp number"
            type="tel"
            placeholder="+91 98765 43210"
            value={settings.whatsapp_number}
            onChange={v => update('whatsapp_number', v)}
            hint="Critical alerts (call failures, low minutes) will also be sent here"
          />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// LANGUAGES TAB
// ─────────────────────────────────────────────────────────

function LanguagesTab({ settings, update }: TabProps) {
  const allLanguages = [
    { lang: 'English',    code: 'en' }, { lang: 'Hindi',      code: 'hi' },
    { lang: 'Tamil',      code: 'ta' }, { lang: 'Telugu',     code: 'te' },
    { lang: 'Kannada',    code: 'kn' }, { lang: 'Marathi',    code: 'mr' },
    { lang: 'Bengali',    code: 'bn' }, { lang: 'Gujarati',   code: 'gu' },
    { lang: 'Punjabi',    code: 'pa' }, { lang: 'Malayalam',  code: 'ml' },
  ];

  const toggleLanguage = (code: string) => {
    const isOn = settings.languages.includes(code);
    const next = isOn
      ? settings.languages.filter(c => c !== code)
      : [...settings.languages, code];
    update('languages', next);
  };

  return (
    <div className="card">
      <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Supported languages</h3>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
        Enable the languages you want available when creating AI agents and campaigns.
        At least one language must remain enabled.
      </p>

      {allLanguages.map(l => {
        const isEnabled = settings.languages.includes(l.code);
        const isLastEnabled = isEnabled && settings.languages.length === 1;
        return (
          <ToggleRow
            key={l.code}
            label={l.lang}
            desc={`Voice and conversation models for ${l.lang}`}
            checked={isEnabled}
            locked={isLastEnabled}
            onChange={() => toggleLanguage(l.code)}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SECURITY TAB (Phase 3 — visual scaffolding only)
// ─────────────────────────────────────────────────────────

function SecurityTab() {
  return (
    <>
      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Change password</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Use a strong, unique password for your Unntangle account
        </p>
        <Field label="Current password" type="password" placeholder="••••••••" defaultValue="" />
        <div style={{ marginTop: 16 }}>
          <Field label="New password" type="password" placeholder="At least 8 characters" defaultValue="" />
        </div>
        <div style={{ marginTop: 16 }}>
          <Field label="Confirm new password" type="password" placeholder="Re-enter new password" defaultValue="" />
        </div>
        <div style={{ marginTop: 20 }}>
          <button className="btn btn-primary" disabled>Update password</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Two-factor authentication</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Add an extra layer of security to your account
        </p>
        <ToggleRow
          label="Enable 2FA via authenticator app"
          desc="Use Google Authenticator, Authy, or 1Password to generate codes"
          checked={false}
        />
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Active sessions</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>
          Devices currently signed in to your account
        </p>
        <SessionRow device="Chrome on Windows" location="Mumbai, IN" lastActive="Active now" current />
        <SessionRow device="Safari on iPhone" location="Mumbai, IN" lastActive="2 hours ago" />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Reusable bits
// ─────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6, color: 'var(--text2)' }}>
      {children}
    </label>
  );
}

function Field({
  label, placeholder, type = 'text', value, defaultValue, onChange, hint,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  hint?: string;
}) {
  const isControlled = value !== undefined && onChange !== undefined;
  return (
    <div>
      <Label>{label}</Label>
      {isControlled ? (
        <input
          className="input"
          type={type}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={e => onChange!(e.target.value)}
        />
      ) : (
        <input
          className="input"
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
        />
      )}
      {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

/**
 * Bounded number input. Coerces empty/garbage to 0 internally so React's
 * controlled-input contract is satisfied, but doesn't show 0 in the field
 * (placeholder takes over when value is the empty string).
 */
function NumberField({
  label, value, onChange, min, max, hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        className="input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(min); // empty → snap to min so we don't store NaN
            return;
          }
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n)) onChange(n);
        }}
        onBlur={e => {
          // Clamp to bounds when user leaves the field
          const n = parseInt(e.target.value, 10);
          if (Number.isNaN(n)) onChange(min);
          else if (n < min) onChange(min);
          else if (n > max) onChange(max);
        }}
      />
      {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function ToggleRow({
  label, desc, checked, onChange, locked,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
          {label}
          {locked && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px',
              background: 'var(--bg3)', color: 'var(--text3)',
              borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              Required
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{desc}</div>
      </div>
      <label className="toggle" style={{ marginLeft: 20, flexShrink: 0, opacity: locked ? 0.6 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={e => onChange?.(e.target.checked)}
        />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}

function DayChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 999,
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent-soft)' : '#ffffff',
        color: active ? 'var(--accent)' : 'var(--text2)',
        fontSize: 12, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function SessionRow({
  device, location, lastActive, current,
}: {
  device: string;
  location: string;
  lastActive: string;
  current?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          {device}
          {current && (
            <span className="badge badge-green" style={{ fontSize: 10 }}>This device</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
          {location} · {lastActive}
        </div>
      </div>
      {!current && (
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>
          Sign out
        </button>
      )}
    </div>
  );
}
