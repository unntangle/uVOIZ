-- ============================================
-- 20260504_calls_recording_key.sql
--
-- Adds R2 storage key tracking to the calls table.
--
-- Why a new column instead of reusing recording_url:
--   recording_url currently holds the upstream URL from VAPI/TeleCMI.
--   Those URLs are short-lived (VAPI signs them) and provider-locked.
--   recording_key is the durable R2 object key — once a recording is
--   ingested into R2, this is the source of truth. The route that
--   serves audio to the player generates a fresh 5-min signed URL from
--   this key per request.
--
--   We keep both columns during the transition so:
--     - In-flight calls that have a recording_url but haven't been
--       ingested yet still display in the UI (with a "Fetching..."
--       status driven by recording_key IS NULL).
--     - The recording-fetch path is idempotent: if recording_key is
--       already set, it skips the fetch.
--
-- Rollback:
--   ALTER TABLE calls DROP COLUMN recording_key;
--   ALTER TABLE calls DROP COLUMN recording_bytes;
--   ALTER TABLE calls DROP COLUMN recording_fetched_at;
--   DROP INDEX IF EXISTS calls_pending_recording_ingest;
--   DROP INDEX IF EXISTS calls_recording_retention;
-- ============================================

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS recording_key TEXT;

-- Useful for showing "X MB" in the UI without re-HEADing R2 every time.
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS recording_bytes BIGINT;

-- Marks when ingestion completed. Used by:
--   - dashboard widget showing "N recordings pending ingest"
--   - retention cron (calculate age from this, not from created_at)
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS recording_fetched_at TIMESTAMPTZ;

-- Lookup index for the recording-fetch retry path: it pulls calls where
-- the upstream gave us a URL but R2 hasn't been populated yet. Partial
-- index keeps it tiny — only the open work items are indexed.
CREATE INDEX IF NOT EXISTS calls_pending_recording_ingest
  ON calls (created_at)
  WHERE recording_url IS NOT NULL
    AND recording_key IS NULL;

-- Lookup index for the retention cron: prune recordings older than the
-- org's retention window. Org-scoped + ordered by fetch time so a single
-- index serves both per-tenant and global retention sweeps.
CREATE INDEX IF NOT EXISTS calls_recording_retention
  ON calls (org_id, recording_fetched_at)
  WHERE recording_key IS NOT NULL;
