-- ============================================
-- uVOIZ Migration 001: Multi-tenant role refactor
-- Run this in Supabase SQL Editor AFTER deploying the new code.
-- Safe to re-run (uses IF EXISTS / IF NOT EXISTS).
-- ============================================

-- 1. Migrate any legacy 'agent' role users → 'manager'
--    (uVOIZ is AI telecalling — there are no human agents anymore)
UPDATE users
SET role = 'manager'
WHERE role = 'agent';

-- 2. Drop the old CHECK constraint and add the new one
--    (postgres CHECK constraints can't be altered in place)
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager'));

-- 3. (OPTIONAL) Promote yourself to super_admin so you can access /console
--    Replace 'YOUR_EMAIL@DOMAIN.COM' with your actual email before running.
--
--    UPDATE users
--    SET role = 'super_admin'
--    WHERE email = 'YOUR_EMAIL@DOMAIN.COM';

-- 4. Verify the migration worked
SELECT role, COUNT(*) AS user_count
FROM users
GROUP BY role
ORDER BY role;
