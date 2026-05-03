-- ============================================
-- VoiceAI Database Schema — Custom Auth (No Clerk)
-- Paste this into Supabase SQL Editor and click Run
-- ============================================

-- Organizations (one per BPO company)
-- Plan ids must match lib/plans.ts. If you change them, also update
-- lib/migrations/002_plans_alignment.sql for existing databases.
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'growth', 'scale')),
  minutes_used INTEGER DEFAULT 0,
  minutes_limit INTEGER DEFAULT 100,
  razorpay_subscription_id TEXT,
  razorpay_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (staff of the BPO company OR Unntangle super admins)
-- Roles:
--   super_admin → Unntangle staff (you). org_id may be NULL or a special internal org.
--   admin       → BPO owner. Full access within their org including billing & team mgmt.
--   manager     → BPO operations lead. Can run campaigns but no billing/team mgmt.
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'manager')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration helper: if you already have rows with role='agent', convert them to 'manager'
-- (uVOIZ is AI telecalling — there are no human agents, only AI bots)
-- UPDATE users SET role = 'manager' WHERE role = 'agent';

-- AI Agents
CREATE TABLE IF NOT EXISTS agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  voice TEXT NOT NULL DEFAULT 'Priya (Female)',
  language TEXT NOT NULL DEFAULT 'Hindi + English',
  personality TEXT DEFAULT 'Friendly & Empathetic',
  script TEXT DEFAULT '',
  vapi_assistant_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'training')),
  calls_handled INTEGER DEFAULT 0,
  success_rate DECIMAL DEFAULT 0,
  avg_duration INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  language TEXT DEFAULT 'en',
  room_type TEXT DEFAULT 'Sales',
  script TEXT DEFAULT '',
  total_contacts INTEGER DEFAULT 0,
  called INTEGER DEFAULT 0,
  converted INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'called', 'converted', 'failed', 'dnc')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calls
CREATE TABLE IF NOT EXISTS calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  agent_id UUID REFERENCES agents(id),
  contact_id UUID REFERENCES contacts(id),
  vapi_call_id TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','ringing','in-progress','completed','failed','no-answer','busy')),
  duration INTEGER DEFAULT 0,
  recording_url TEXT,
  transcript TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  converted BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing events
-- cf_payment_id stores the Cashfree order id (was named razorpay_payment_id
-- before the 2026-05 migration to Cashfree). The unique index lets the
-- verify route and the webhook race for the same order safely — only one
-- caller's INSERT succeeds, the other gets a 23505 unique_violation and
-- exits cleanly. See app/api/billing/verify/route.ts for the pattern.
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER,
  currency TEXT DEFAULT 'INR',
  cf_payment_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_events_cf_payment_id_unique
  ON billing_events (cf_payment_id)
  WHERE cf_payment_id IS NOT NULL;
