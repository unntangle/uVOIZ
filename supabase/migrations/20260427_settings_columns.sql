-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Workspace settings columns
-- Date: 2026-04-27
-- Purpose: Add columns for the in-app Settings page (Workspace + Compliance tabs).
--          Languages column already exists from the onboarding migration.
--
-- Run this in Supabase SQL Editor before testing the Settings page.
-- ─────────────────────────────────────────────────────────────────────────

-- Workspace tab fields
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS support_email TEXT,
  ADD COLUMN IF NOT EXISTS address       TEXT,
  ADD COLUMN IF NOT EXISTS gstin         TEXT,
  ADD COLUMN IF NOT EXISTS timezone      TEXT DEFAULT 'Asia/Kolkata';

-- Compliance tab fields
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS dnd_check            BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS opt_out_detection    BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS recording_disclosure BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS gdpr_mode            BOOLEAN DEFAULT FALSE;

-- Optional: comment explaining each column for future devs reading the schema
COMMENT ON COLUMN organizations.support_email          IS 'Customer-facing support email for invoices and communications';
COMMENT ON COLUMN organizations.address                IS 'Business address (used on invoices)';
COMMENT ON COLUMN organizations.gstin                  IS 'Indian GST identification number for tax-compliant invoicing';
COMMENT ON COLUMN organizations.timezone               IS 'IANA timezone string (e.g., Asia/Kolkata)';
COMMENT ON COLUMN organizations.dnd_check              IS 'Whether to skip numbers on the National DND registry. Locked on at app level.';
COMMENT ON COLUMN organizations.opt_out_detection      IS 'AI detects do-not-call intent during a call';
COMMENT ON COLUMN organizations.recording_disclosure   IS 'AI announces "this call may be recorded" at the start of every call';
COMMENT ON COLUMN organizations.gdpr_mode              IS 'Auto-delete recordings and PII after 30 days (for EU customer data)';
