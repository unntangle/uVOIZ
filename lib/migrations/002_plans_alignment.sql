-- ============================================
-- Migration 002: Align plan CHECK constraint with lib/plans.ts
-- ============================================
--
-- Reason: The original schema only allowed plan IN ('starter','pro','agency').
-- The product now sells 'free', 'starter', 'growth', 'scale' — defined in
-- lib/plans.ts. Any verify-route write for 'growth' or 'scale' would have
-- failed against the old CHECK constraint.
--
-- This migration:
--   1. Migrates legacy values: 'pro' → 'growth', 'agency' → 'scale'.
--      ('starter' stays as-is. No prior 'free' rows expected.)
--   2. Drops any existing plan-related CHECK constraints by name and by
--      pattern match — covers both the default name (organizations_plan_check)
--      and any custom-named ones.
--   3. Installs the new CHECK with the four current plan ids.
--   4. Updates column defaults so new orgs land on the Free Trial.
--
-- Run this in the Supabase SQL editor. It is idempotent — safe to re-run.
-- ============================================

BEGIN;

-- 1. Migrate any existing rows on legacy plan ids.
UPDATE organizations SET plan = 'growth' WHERE plan = 'pro';
UPDATE organizations SET plan = 'scale'  WHERE plan = 'agency';

-- 2a. Drop the constraint by its conventional name (no-op if absent).
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;

-- 2b. Defensive sweep: drop any other CHECK constraints on the table that
-- mention the `plan` column, in case it was renamed at some point.
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'organizations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%plan%'
  LOOP
    EXECUTE format('ALTER TABLE organizations DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- 3. Install the new CHECK constraint.
ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('free', 'starter', 'growth', 'scale'));

-- 4. Update the column defaults to the new free-trial baseline.
-- New signups get the Free Trial pack: plan='free', minutes_limit=100.
ALTER TABLE organizations ALTER COLUMN plan SET DEFAULT 'free';
ALTER TABLE organizations ALTER COLUMN minutes_limit SET DEFAULT 100;

COMMIT;
