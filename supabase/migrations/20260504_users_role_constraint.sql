-- ============================================
-- 20260504_users_role_constraint.sql
--
-- Aligns the users.role CHECK constraint with what the application
-- code actually uses today.
--
-- Drift detected on 2026-05-04: live DB had
--   CHECK (role IN ('admin', 'manager', 'agent'))
-- while the schema in lib/schema.sql had been updated to
--   CHECK (role IN ('super_admin', 'admin', 'manager'))
-- without a migration to bring existing DBs along. This blocked the
-- scripts/create-super-admin.ts bootstrap because the UPDATE that
-- promotes a user to super_admin failed the constraint check.
--
-- This migration:
--   1. Migrates any leftover role='agent' rows to role='manager'.
--      uVOIZ is AI telecalling — there are no human agents, only AI
--      bots. The 'agent' value was a holdover from an earlier model
--      and was already being phased out (see comment in lib/schema.sql).
--      'manager' is the closest semantic match for someone who used
--      to be tagged 'agent'.
--   2. Drops the old constraint.
--   3. Adds the new constraint matching lib/schema.sql.
--
-- Why this is safe to run on a live DB:
--   - Step 1 runs first. After it, no row has role='agent'. The DROP
--     in step 2 then has no in-flight rows that would be invalidated
--     by step 3's narrower constraint.
--   - All three statements run in one implicit transaction by Supabase
--     SQL editor, so a failure rolls back cleanly.
--
-- Rollback (only if you really need to):
--   ALTER TABLE users DROP CONSTRAINT users_role_check;
--   ALTER TABLE users ADD CONSTRAINT users_role_check
--     CHECK (role IN ('admin', 'manager', 'agent'));
--   -- Note: this won't restore the 'agent' rows that step 1 migrated
--   -- to 'manager'. Those are gone unless you have a backup.
-- ============================================

-- Step 1: migrate any role='agent' rows to role='manager'
-- (UPDATE returns 0 if there are none, which is fine)
UPDATE users SET role = 'manager' WHERE role = 'agent';

-- Step 2: drop the old constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Step 3: add the new constraint matching the application code
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager'));
