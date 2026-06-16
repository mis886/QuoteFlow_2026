-- Migration: 2026-06-08 — Team Roster (people → process role)
--
-- The Enq2Po pipeline is run by several "doers", each owning one step:
--   DEO         — enters enquiries + line items; converts quote→order on PO
--   Rate Entry  — enters rates, turns enquiry into a quote, marks it sent
--   SC_1        — runs follow-ups after the quote is sent, per the TAT pipeline
--   Negotiation — handles cards in the Negotiation lane
--   PI Sender   — Accounts; issues the Proforma Invoice once the order is in
--
-- Attribution data already exists as free-text on each record (enquiries.doer,
-- quotes.doer, orders.doer, followups.owner, followups.logs[].who). This table
-- maps those free-text identities to a role so the Doer KPI page can aggregate
-- per-person / per-role scores. The identity (email OR display_name) is matched
-- case-insensitively against doer/owner/who.
--
-- The unit is the (email, role) PAIR, not the email alone:
--   • One shared login (e.g. accounts@) can own several roles — its work is then
--     split by what was touched (enquiry entered = DEO, rates entered = Rate
--     Entry, PI sent = PI Sender). One row per role it covers.
--   • One role can be covered by several people (e.g. Negotiation by akash@ AND
--     sagar@) — one row each.
--   • One person can hold several roles — one row each.

CREATE TABLE IF NOT EXISTS public.team_roster (
  email        TEXT NOT NULL,              -- matches doer/owner/who (stored lowercased)
  role         TEXT NOT NULL,              -- 'DEO' | 'Rate Entry' | 'SC_1' | 'Negotiation' | 'PI Sender' | 'Other'
  display_name TEXT NOT NULL,
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email, role)
);

ALTER TABLE public.team_roster ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow company access" ON public.team_roster;
  EXECUTE $f$
    CREATE POLICY "Allow company access"
    ON public.team_roster FOR ALL TO authenticated
    USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
    WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
  $f$;
END $$;

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.team_roster';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication not found';
END $$;

-- Seed the known doers. Emails are placeholders — edit them in Settings → Team
-- Roster to match the actual login identities (must equal what lands in the
-- doer/owner/who fields, or be the person's display name).
INSERT INTO public.team_roster (email, display_name, role) VALUES
  ('accounts@himalayaterpene.com',     'Data Entry Operator', 'DEO'),
  ('accounts@himalayaterpene.com',  'Pankaj',              'Rate Entry'),
  ('sc1@himalayaterpene.com',   'Disha Khurana',       'SC_1'),
  ('akash@himalayaterpene.com',    'Akash Gupta',  'Negotiation'),
  ('sagar@himalayaterpene.com',    'Sagar Gupta',        'Negotiation'),
  ('accounts@himalayaterpene.com','PI Sender (Accounts)','PI Sender')
ON CONFLICT (email, role) DO NOTHING;
