-- ============================================
-- 006_call_outcomes.sql — 7-bucket BPO outcome classification
-- ============================================
--
-- Adds the columns the post-call outcome classifier writes into,
-- plus a denormalized mirror on contacts so the campaign detail
-- page can render the outcome column without a join.
--
-- Why this migration is needed:
--   The existing calls table has a `converted` boolean and a
--   three-value `sentiment` column (positive / neutral / negative).
--   That's enough for top-line conversion stats but not enough to
--   segment a contact list into actionable buckets — "call back
--   tomorrow" and "do not call again" both look the same to the
--   old schema (converted=false, sentiment=negative). BPO managers
--   need the segmentation to drive next-step workflows (sales
--   handoff, retry scheduling, DNC suppression).
--
-- What this migration enables, in plain terms:
--
--   1. Per-call outcome bucket. After every completed call the
--      lib/openai.ts classifyCallOutcome() function writes one of
--      seven canonical strings into calls.outcome. The CHECK
--      constraint guarantees only those strings can be stored.
--
--   2. Confidence and summary. The model returns a 0–1 confidence
--      score and a one-sentence rationale. We persist both so the
--      operator UI can show the rationale next to the bucket badge
--      and so future analytics can filter by classifier certainty.
--
--   3. Latest-outcome mirror on contacts. The campaign detail page
--      shows a contacts table where each row needs the row's most
--      recent call outcome. Computing that with a JOIN+GROUP BY on
--      calls is fine for small lists but becomes a hot query as
--      campaigns grow. We denormalize: the webhook handler writes
--      the outcome to BOTH calls (history) and contacts (latest).
--
--   4. Index on (campaign_id, outcome). The campaign progress card
--      needs counts per bucket per campaign. A composite index keeps
--      that under 5ms even at hundreds of thousands of calls.
--
-- Compatibility:
--   This migration is purely additive. Existing rows on calls and
--   contacts get NULL values for the new columns; the UI renders
--   NULL as an em-dash. The old `converted` boolean and `sentiment`
--   column are NOT removed — their existing readers keep working
--   unchanged. Eventually those should be derived from `outcome` so
--   we have one source of truth, but that's a separate cleanup.
-- ============================================

-- ---------------------------------------------------------------
-- 1. calls: outcome + confidence + summary
-- ---------------------------------------------------------------

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS outcome_confidence NUMERIC(3, 2),
  ADD COLUMN IF NOT EXISTS outcome_summary TEXT;

-- Bucket whitelist. Adding a new bucket later requires:
--   a. New CHECK constraint via DROP + ADD
--   b. Update CallOutcome union and CALL_OUTCOMES array in lib/openai.ts
--   c. Update the system prompt in classifyCallOutcome()
--   d. Update the UI badge map in the campaign detail page
-- All four steps are required — forgetting any one will silently
-- break either writes or reads.
DO $BODY$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calls_outcome_check'
  ) THEN
    ALTER TABLE calls
      ADD CONSTRAINT calls_outcome_check
      CHECK (
        outcome IS NULL
        OR outcome IN (
          'interested',
          'callback',
          'not_interested',
          'dnc',
          'voicemail',
          'no_answer',
          'wrong_number'
        )
      );
  END IF;
END $BODY$;

-- Confidence is 0.00–1.00. NUMERIC(3,2) so values like 0.85 round-trip
-- exactly; FLOAT would introduce binary-precision drift.
DO $BODY$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calls_outcome_confidence_check'
  ) THEN
    ALTER TABLE calls
      ADD CONSTRAINT calls_outcome_confidence_check
      CHECK (
        outcome_confidence IS NULL
        OR (outcome_confidence >= 0 AND outcome_confidence <= 1)
      );
  END IF;
END $BODY$;

-- ---------------------------------------------------------------
-- 2. contacts: latest-outcome mirror
-- ---------------------------------------------------------------
--
-- We mirror only the outcome string — not the summary or confidence.
-- The campaign detail page's contacts table needs the bucket badge;
-- the drawer that opens on row-click pulls full details from calls.
-- Keeping the mirror minimal makes the denormalization cheap to
-- maintain (one extra UPDATE per webhook) and minimises the surface
-- where the mirror could go stale.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS outcome TEXT;

DO $BODY$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_outcome_check'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_outcome_check
      CHECK (
        outcome IS NULL
        OR outcome IN (
          'interested',
          'callback',
          'not_interested',
          'dnc',
          'voicemail',
          'no_answer',
          'wrong_number'
        )
      );
  END IF;
END $BODY$;

-- ---------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------
--
-- Campaign progress card aggregates: SELECT outcome, COUNT(*)
-- FROM calls WHERE campaign_id = ? GROUP BY outcome.
-- The composite (campaign_id, outcome) index serves this with an
-- index-only scan. Partial on outcome IS NOT NULL so we don't
-- index the long tail of un-classified legacy rows.
CREATE INDEX IF NOT EXISTS calls_campaign_outcome
  ON calls (campaign_id, outcome)
  WHERE outcome IS NOT NULL;

-- Contacts table on the campaign detail page filters by campaign_id
-- and may filter by outcome ("show me only Interested leads"). The
-- composite handles both at once for the future filter UI.
CREATE INDEX IF NOT EXISTS contacts_campaign_outcome
  ON contacts (campaign_id, outcome)
  WHERE outcome IS NOT NULL;
