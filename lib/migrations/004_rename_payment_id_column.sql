-- ============================================
-- Migration 004: Rename billing_events.razorpay_payment_id → cf_payment_id
-- ============================================
--
-- Why: payments moved from Razorpay to Cashfree on 2026-05-03. The legacy
-- column name was misleading — it was storing Cashfree order ids while
-- still being called razorpay_payment_id. Renaming so the schema reflects
-- reality.
--
-- Idempotent: the IF EXISTS / IF NOT EXISTS guards make this safe to
-- re-run. The unique index from migration 003 is dropped and recreated
-- against the new column name.
--
-- Deploy ordering: this migration MUST run during the same window as
-- the matching code deploy. Until both are applied, billing routes will
-- error on insert. The window is small (a few seconds) and acceptable
-- for a beta with zero active paying customers.
-- ============================================

BEGIN;

-- 1. Drop the old unique index that references the old column name.
--    PG can't rename a column that has dependent indexes without dropping
--    them first; safer to drop, rename, recreate.
DROP INDEX IF EXISTS billing_events_payment_id_unique;

-- 2. Rename the column. Idempotent guard: only rename if the old column
--    actually exists (so re-running this migration is safe).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_events' AND column_name = 'razorpay_payment_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'billing_events' AND column_name = 'cf_payment_id'
  ) THEN
    ALTER TABLE billing_events RENAME COLUMN razorpay_payment_id TO cf_payment_id;
  END IF;
END $$;

-- 3. Recreate the unique index against the new column name.
--    Same shape as migration 003, just pointed at cf_payment_id.
CREATE UNIQUE INDEX IF NOT EXISTS billing_events_cf_payment_id_unique
  ON billing_events (cf_payment_id)
  WHERE cf_payment_id IS NOT NULL;

COMMIT;
