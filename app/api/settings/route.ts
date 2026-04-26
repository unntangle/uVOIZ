import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Workspace settings API.
 *
 * GET /api/settings  — load all settings for the current user's organization
 * PATCH /api/settings — update settings (partial update)
 *
 * Wired tabs (read + write):
 *   - Workspace:     name, industry, phone, support_email, address, gstin, timezone
 *   - Telephony:     caller_id_number, caller_id_display_name, business_hours_start,
 *                    business_hours_end, working_days, max_concurrent_calls,
 *                    calls_per_minute, daily_call_cap, retry_attempts
 *   - Compliance:    dnd_check, opt_out_detection, recording_disclosure, gdpr_mode
 *                    (TRAI hours always on — not user-toggleable)
 *   - Notifications: alert_prefs (JSONB), notification_email, whatsapp_number
 *   - Languages:     array of language codes
 *
 * Demo users (with no DB row) get default values on GET and a no-op success on PATCH.
 */

const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type WeekDay = typeof VALID_DAYS[number];

type AlertPrefs = {
  campaign_completed: boolean;
  low_minutes_warning: boolean;
  high_conversion_alert: boolean;
  call_failure_spike: boolean;
  daily_summary_email: boolean;
};

const DEFAULT_ALERT_PREFS: AlertPrefs = {
  campaign_completed: true,
  low_minutes_warning: true,
  high_conversion_alert: true,
  call_failure_spike: true,
  daily_summary_email: true,
};

// Defaults returned when there's no DB row (demo users) or fields are null
const SETTINGS_DEFAULTS = {
  // Workspace
  name: '',
  industry: '',
  phone: '',
  support_email: '',
  address: '',
  gstin: '',
  timezone: 'Asia/Kolkata',
  // Telephony
  caller_id_number: '',
  caller_id_display_name: '',
  business_hours_start: '09:00',
  business_hours_end: '20:00',
  working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as WeekDay[],
  max_concurrent_calls: 50,
  calls_per_minute: 10,
  daily_call_cap: 5000,
  retry_attempts: 3,
  // Compliance
  dnd_check: true,
  opt_out_detection: true,
  recording_disclosure: true,
  gdpr_mode: false,
  // Notifications
  alert_prefs: DEFAULT_ALERT_PREFS,
  notification_email: '',
  whatsapp_number: '',
  // Languages
  languages: ['en'],
};

/** Whitelist of fields the client is allowed to write. */
const ALLOWED_FIELDS = [
  // Workspace
  'name', 'industry', 'phone', 'support_email', 'address', 'gstin', 'timezone',
  // Telephony
  'caller_id_number', 'caller_id_display_name',
  'business_hours_start', 'business_hours_end', 'working_days',
  'max_concurrent_calls', 'calls_per_minute', 'daily_call_cap', 'retry_attempts',
  // Compliance
  'dnd_check', 'opt_out_detection', 'recording_disclosure', 'gdpr_mode',
  // Notifications
  'alert_prefs', 'notification_email', 'whatsapp_number',
  // Languages
  'languages',
] as const;

function isDemoOrgId(orgId: string): boolean {
  return !orgId || orgId.startsWith('demo-') || orgId === 'unntangle-internal';
}

/**
 * Postgres TIME values come back as "HH:MM:SS". The HTML <input type="time">
 * uses "HH:MM". Strip seconds for the client.
 */
function trimTimeSeconds(value: any): string {
  if (typeof value !== 'string') return '';
  // Match HH:MM at the start; seconds & milliseconds are dropped
  const m = value.match(/^(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

/** Validate "HH:MM" 24-hour format. */
function isValidTime(s: any): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** Coerce + validate a positive integer within bounds. */
function toBoundedInt(v: any, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  if (n < min || n > max) return null;
  return Math.floor(n);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Demo user — return defaults blended with whatever's in the JWT
    if (isDemoOrgId(session.orgId) || !supabaseAdmin) {
      return NextResponse.json({
        settings: {
          ...SETTINGS_DEFAULTS,
          name: session.orgName || SETTINGS_DEFAULTS.name,
        },
        isDemo: true,
      });
    }

    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', session.orgId)
      .single();

    if (error || !org) {
      return NextResponse.json({
        settings: {
          ...SETTINGS_DEFAULTS,
          name: session.orgName || SETTINGS_DEFAULTS.name,
        },
        isDemo: true,
      });
    }

    // Merge DB row into defaults so missing columns don't return undefined.
    // alert_prefs is also merged with defaults so a partial JSONB still has all keys.
    const dbAlertPrefs = (org.alert_prefs && typeof org.alert_prefs === 'object')
      ? org.alert_prefs as Partial<AlertPrefs>
      : {};

    const settings = {
      ...SETTINGS_DEFAULTS,
      // Workspace
      name:                 org.name ?? SETTINGS_DEFAULTS.name,
      industry:             org.industry ?? SETTINGS_DEFAULTS.industry,
      phone:                org.phone ?? SETTINGS_DEFAULTS.phone,
      support_email:        org.support_email ?? SETTINGS_DEFAULTS.support_email,
      address:              org.address ?? SETTINGS_DEFAULTS.address,
      gstin:                org.gstin ?? SETTINGS_DEFAULTS.gstin,
      timezone:             org.timezone ?? SETTINGS_DEFAULTS.timezone,
      // Telephony
      caller_id_number:       org.caller_id_number ?? SETTINGS_DEFAULTS.caller_id_number,
      caller_id_display_name: org.caller_id_display_name ?? SETTINGS_DEFAULTS.caller_id_display_name,
      business_hours_start:   trimTimeSeconds(org.business_hours_start) || SETTINGS_DEFAULTS.business_hours_start,
      business_hours_end:     trimTimeSeconds(org.business_hours_end) || SETTINGS_DEFAULTS.business_hours_end,
      working_days:           (Array.isArray(org.working_days) && org.working_days.length > 0)
                                ? org.working_days
                                : SETTINGS_DEFAULTS.working_days,
      max_concurrent_calls:   org.max_concurrent_calls ?? SETTINGS_DEFAULTS.max_concurrent_calls,
      calls_per_minute:       org.calls_per_minute ?? SETTINGS_DEFAULTS.calls_per_minute,
      daily_call_cap:         org.daily_call_cap ?? SETTINGS_DEFAULTS.daily_call_cap,
      retry_attempts:         org.retry_attempts ?? SETTINGS_DEFAULTS.retry_attempts,
      // Compliance
      dnd_check:            org.dnd_check ?? SETTINGS_DEFAULTS.dnd_check,
      opt_out_detection:    org.opt_out_detection ?? SETTINGS_DEFAULTS.opt_out_detection,
      recording_disclosure: org.recording_disclosure ?? SETTINGS_DEFAULTS.recording_disclosure,
      gdpr_mode:            org.gdpr_mode ?? SETTINGS_DEFAULTS.gdpr_mode,
      // Notifications
      alert_prefs:          { ...DEFAULT_ALERT_PREFS, ...dbAlertPrefs },
      notification_email:   org.notification_email ?? SETTINGS_DEFAULTS.notification_email,
      whatsapp_number:      org.whatsapp_number ?? SETTINGS_DEFAULTS.whatsapp_number,
      // Languages
      languages:            (Array.isArray(org.languages) && org.languages.length > 0)
                              ? org.languages
                              : SETTINGS_DEFAULTS.languages,
    };

    return NextResponse.json({ settings, isDemo: false });
  } catch (err) {
    console.error('GET /api/settings error:', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'admin' && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only workspace admins can change settings' }, { status: 403 });
    }

    const body = await req.json();

    // Build a sanitized update object — drop any fields not in the whitelist
    const updates: Record<string, any> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // ───── Validation ─────

    if ('languages' in updates) {
      if (!Array.isArray(updates.languages) || updates.languages.length === 0) {
        return NextResponse.json({ error: 'At least one language must be selected' }, { status: 400 });
      }
    }

    if ('support_email' in updates && updates.support_email) {
      if (typeof updates.support_email !== 'string'
          || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.support_email)) {
        return NextResponse.json({ error: 'Invalid support email format' }, { status: 400 });
      }
    }

    if ('notification_email' in updates && updates.notification_email) {
      if (typeof updates.notification_email !== 'string'
          || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.notification_email)) {
        return NextResponse.json({ error: 'Invalid notification email format' }, { status: 400 });
      }
    }

    if ('business_hours_start' in updates && !isValidTime(updates.business_hours_start)) {
      return NextResponse.json({ error: 'Invalid start time (use HH:MM)' }, { status: 400 });
    }
    if ('business_hours_end' in updates && !isValidTime(updates.business_hours_end)) {
      return NextResponse.json({ error: 'Invalid end time (use HH:MM)' }, { status: 400 });
    }
    if ('business_hours_start' in updates && 'business_hours_end' in updates) {
      if (updates.business_hours_start >= updates.business_hours_end) {
        return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
      }
    }

    if ('working_days' in updates) {
      if (!Array.isArray(updates.working_days) || updates.working_days.length === 0) {
        return NextResponse.json({ error: 'Select at least one working day' }, { status: 400 });
      }
      const allValid = updates.working_days.every((d: any) =>
        typeof d === 'string' && (VALID_DAYS as readonly string[]).includes(d)
      );
      if (!allValid) {
        return NextResponse.json({ error: 'Invalid working day in list' }, { status: 400 });
      }
    }

    // Bounded ints for calling limits
    const intBounds: Record<string, [number, number]> = {
      max_concurrent_calls: [1, 10000],
      calls_per_minute:     [1, 1000],
      daily_call_cap:       [1, 1_000_000],
      retry_attempts:       [0, 10],
    };
    for (const [key, [min, max]] of Object.entries(intBounds)) {
      if (key in updates) {
        const n = toBoundedInt(updates[key], min, max);
        if (n === null) {
          return NextResponse.json({
            error: `${key.replace(/_/g, ' ')} must be a number between ${min} and ${max}`,
          }, { status: 400 });
        }
        updates[key] = n;
      }
    }

    if ('alert_prefs' in updates) {
      if (typeof updates.alert_prefs !== 'object' || updates.alert_prefs === null
          || Array.isArray(updates.alert_prefs)) {
        return NextResponse.json({ error: 'alert_prefs must be an object' }, { status: 400 });
      }
      // Filter to known alert keys, coerce values to boolean
      const cleaned: Record<string, boolean> = {};
      for (const key of Object.keys(DEFAULT_ALERT_PREFS) as (keyof AlertPrefs)[]) {
        if (key in updates.alert_prefs) {
          cleaned[key] = !!updates.alert_prefs[key];
        }
      }
      // Merge with DEFAULT so we always store a complete object
      updates.alert_prefs = { ...DEFAULT_ALERT_PREFS, ...cleaned };
    }

    // ───── Persist ─────

    if (isDemoOrgId(session.orgId) || !supabaseAdmin) {
      return NextResponse.json({
        success: true,
        isDemo: true,
        message: 'Demo mode — changes are not persisted',
      });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('organizations')
      .update(updates)
      .eq('id', session.orgId)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      const missingColumn = error.message.match(/column "(\w+)"/)?.[1];
      if (missingColumn) {
        return NextResponse.json({
          error: `Schema column missing: ${missingColumn}. Run the latest migration in supabase/migrations.`,
        }, { status: 500 });
      }
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    return NextResponse.json({ success: true, settings: updated });
  } catch (err) {
    console.error('PATCH /api/settings error:', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
