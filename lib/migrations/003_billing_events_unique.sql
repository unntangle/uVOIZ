-- ============================================
-- Migration 003: Unique constraint on billing_events.razorpay_payment_id
-- ============================================
--
-- Why: the verify route and the Cashfree webhook can race for the same
-- order. The original "SELECT then INSERT" idempotency check has a window
-- between the two queries where both callers see no existing row, both
-- proceed to credit the org, and minutes get added twice.
--
-- The fix is to make the database itself reject the second insert. With
-- this UNIQUE INDEX in place, both routes use insert-first-then-credit:
--
--   INSERT INTO billing_events (...) VALUES (..., :order_id, ...)
--   IF success → continue and update minutes_limit
--   IF Postgres returns 23505 (unique_violation) → another caller already
--     credited; exit cleanly without changing minutes
--
-- Run this in Supabase SQL Editor. It is idempotent — the IF NOT EXISTS
-- means re-running won't error.
-- ============================================

-- Note: column is named razorpay_payment_id for legacy reasons but stores
-- the Cashfree order id in the current implementation.
CREATE UNIQUE INDEX IF NOT EXISTS billing_events_payment_id_unique
  ON billing_events (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
