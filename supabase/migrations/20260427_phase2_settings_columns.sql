-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Phase 2 settings columns (Telephony + Notifications)
-- Date: 2026-04-27
-- Purpose: Add columns for the Telephony and Notifications tabs in Settings.
--
-- Run this in Supabase SQL Editor before testing the Phase 2 settings.
-- ─────────────────────────────────────────────────────────────────────────

-- ───── Telephony tab ─────

-- Caller identity
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS caller_id_number       TEXT,
  ADD COLUMN IF NOT EXISTS caller_id_display_name TEXT;

-- Business hours
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS business_hours_start TIME DEFAULT '09:00:00',
  ADD COLUMN IF NOT EXISTS business_hours_end   TIME DEFAULT '20:00:00',
  ADD COLUMN IF NOT EXISTS working_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri','sat'];

-- Calling limits (soft caps; platform also enforces plan-based hard caps)
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS max_concurrent_calls INT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS calls_per_minute     INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS daily_call_cap       INT DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS retry_attempts       INT DEFAULT 3;

-- ───── Notifications tab ─────

-- Alert preferences stored as JSONB so we can add new alert types without migrations.
-- Default keys mirror what the UI ships with today.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS alert_prefs JSONB DEFAULT '{
    "campaign_completed": true,
    "low_minutes_warning": true,
    "high_conversion_alert": true,
    "call_failure_spike": true,
    "daily_summary_email": true
  }'::jsonb;

-- Where alerts get sent
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS notification_email TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number    TEXT;

-- ───── Comments for future devs ─────

COMMENT ON COLUMN organizations.caller_id_number       IS 'Exotel virtual number used as outbound caller ID. Provisioned by platform.';
COMMENT ON COLUMN organizations.caller_id_display_name IS 'CNAM string shown on the called party''s screen where supported';
COMMENT ON COLUMN organizations.business_hours_start   IS 'Start of daily calling window (local time, see organizations.timezone)';
COMMENT ON COLUMN organizations.business_hours_end     IS 'End of daily calling window (local time, see organizations.timezone)';
COMMENT ON COLUMN organizations.working_days           IS 'Days of the week when calls are allowed: mon,tue,wed,thu,fri,sat,sun';
COMMENT ON COLUMN organizations.max_concurrent_calls   IS 'Soft cap on simultaneous outbound calls. Platform enforces min(this, plan_limit).';
COMMENT ON COLUMN organizations.calls_per_minute       IS 'Soft cap on dial rate to avoid telecom carrier blocks';
COMMENT ON COLUMN organizations.daily_call_cap         IS 'Total outbound calls allowed per day across all campaigns';
COMMENT ON COLUMN organizations.retry_attempts         IS 'Times to retry a failed/no-answer call before marking complete';
COMMENT ON COLUMN organizations.alert_prefs            IS 'JSONB map of alert_name -> boolean. Add new alerts without migrations.';
COMMENT ON COLUMN organizations.notification_email     IS 'Email address that receives operational alerts and digests';
COMMENT ON COLUMN organizations.whatsapp_number        IS 'WhatsApp number for critical alerts (call failures, low minutes)';
