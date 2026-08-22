-- =============================================================================
-- Baseline schema snapshot — EnqBoss / QuoteFlow 2026
-- Supabase project : nheujyknkqeimgpdfyiw  (ap-south-1)
-- Captured         : 2026-07-01
--
-- This file is a HISTORICAL RECORD only.  It is NOT executed automatically.
-- See supabase/migrations/README.md for the convention.
--
-- Tables are ordered by dependency so the file can be replayed on a fresh
-- schema if ever needed (referenced tables before referencing tables).
-- =============================================================================


-- ─── authorized_signatories ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.authorized_signatories (
  id          text        PRIMARY KEY,
  name        text        NOT NULL,
  designation text        NOT NULL,
  phone       text,
  is_default  boolean     DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.authorized_signatories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.authorized_signatories
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.authorized_signatories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── company_units ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_units (
  id           text        PRIMARY KEY,
  name         text        NOT NULL,
  gstin        text,
  address      text,
  signatory_id text        REFERENCES public.authorized_signatories(id) ON DELETE SET NULL,
  header_url   text,
  sig_url      text,
  is_default   boolean     DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.company_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.company_units
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.company_units
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── bank_accounts ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id             text        PRIMARY KEY,
  unit_id        text        NOT NULL REFERENCES public.company_units(id) ON DELETE CASCADE,
  beneficiary    text        NOT NULL,
  bank_name      text        NOT NULL,
  branch_address text,
  account_no     text        NOT NULL,
  ifsc           text        NOT NULL,
  branch_code    text,
  micr           text,
  swift          text,
  is_default     boolean     DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.bank_accounts
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.bank_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── app_settings ─────────────────────────────────────────────────────────────
-- Single-row config table; id always = 'config'

CREATE TABLE IF NOT EXISTS public.app_settings (
  id              text        PRIMARY KEY DEFAULT 'config',
  header_url      text,
  sig_name        text        DEFAULT 'Akash Gupta',
  sig_des         text        DEFAULT 'Rubber Technologist',
  sig_phone       text        DEFAULT '+91-817171 6630',
  sig_url         text,
  bank_name       text        DEFAULT 'ICICI BANK LTD.',
  bank_acc        text        DEFAULT '0000000000',
  bank_ifsc       text        DEFAULT 'ICIC0000000',
  bank_swift      text,
  updated_at      timestamptz DEFAULT now(),
  pipeline_tat    jsonb,
  pipeline_tat_h  jsonb,
  signatory_name  text,
  signatory_title text,
  signatory_phone text
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.app_settings
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── team_roster ──────────────────────────────────────────────────────────────
-- Composite PK (email, role) — one row per person×role combination.
-- password_hash stores a bcrypt hash used by the custom auth flow.

CREATE TABLE IF NOT EXISTS public.team_roster (
  email               text        NOT NULL,
  role                text        NOT NULL,
  display_name        text        NOT NULL,
  active              boolean     DEFAULT true,
  aliases             jsonb       DEFAULT '[]',
  password_hash       text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  gmail_refresh_token text,
  PRIMARY KEY (email, role)
);

ALTER TABLE public.team_roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.team_roster
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.team_roster
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── customers ────────────────────────────────────────────────────────────────
-- Note: no formal PRIMARY KEY constraint exists in the live schema.
-- customer_id is the logical key used by the application (e.g. "CUST-001").
-- Ordinal positions 44-50 are gaps from previously dropped columns.

CREATE TABLE IF NOT EXISTS public.customers (
  customer_id                  text,
  company_name                 text,
  payment_rating               double precision,
  orders_rating                text,
  trend_rating                 text,
  overall_rating               text,
  next_order_product1          text,
  next_order_qty1              text,
  next_order_date1             text,
  next_order_product2          text,
  next_order_qty2              text,
  next_order_date2             text,
  cross_sell_opportunities     text,
  notes                        text,
  created_date                 text,
  modified_date                text,
  created_by                   text,
  industry_segment             text,
  gstin                        text,
  city                         text,
  billing_address              text,
  pincode                      text,
  state                        text,
  tier                         text,
  last_fy_turnover             double precision,
  incoterms                    text,
  payment_terms                text,
  credit_limit                 text,
  currency                     text,
  primary_contact_name         text,
  primary_contact_designation  text,
  primary_contact_email        text,
  primary_contact_phone        text,
  contact2_name                text,
  contact2_designation         text,
  contact2_email               text,
  contact2_phone               text,
  contact3_name                text,
  contact3_designation         text,
  contact3_email               text,
  contact3_phone               text,
  revenue_ytd                  double precision,
  total_quotes                 text,
  -- positions 44-50 were dropped columns; not included
  pan                          text,
  site_name                    text,
  site_gstin                   text,
  dispatch_address             text,
  preferred_transporter        text,
  lead_time_note               text,
  customer_type                text    -- 'Trader' | 'End User'; added 2026-06
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_authenticated_all" ON public.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── enquiries ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.enquiries (
  id            text        PRIMARY KEY,
  recv          timestamptz NOT NULL,
  src           text        NOT NULL,
  cust          text        NOT NULL,
  site_id       text,
  contact_id    text,
  contact       text,
  email         text,
  urg           text        DEFAULT 'Normal',
  status        text        DEFAULT 'New',
  assigned      text,
  notes         text,
  items         jsonb       DEFAULT '[]',
  attachments   jsonb       DEFAULT '[]',
  age_h         integer     DEFAULT 0,
  q_ref         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  contact_phone text,
  doer          text,
  created_by    text
);

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.enquiries
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.enquiries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── quotes ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quotes (
  id                  text        PRIMARY KEY,
  enq_ref             text        REFERENCES public.enquiries(id),
  cust                text        NOT NULL,
  date                date        NOT NULL,
  validity            date,
  status              text        DEFAULT 'Sent',
  inco                text,
  curr                text,
  pay                 text,
  items               jsonb       DEFAULT '[]',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  site_id             text,
  authorized_person   jsonb,
  terms               text,
  contact_id          text,
  contact             text,
  email               text,
  contact_phone       text,
  unit_id             text,
  cust_enquiry_doc_no text,
  notes               jsonb       DEFAULT '[]',
  doer                text,
  sent_at             timestamptz,
  attachments         jsonb       DEFAULT '[]',
  insurance           numeric     NOT NULL DEFAULT 0
);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.quotes
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── orders ───────────────────────────────────────────────────────────────────
-- contact/company_unit/bank_account/authorized_person/terms added 2026-06
-- to fix fields going blank after save+edit (previously not persisted to DB).

CREATE TABLE IF NOT EXISTS public.orders (
  id                  text        PRIMARY KEY,
  quote_ref           text        REFERENCES public.quotes(id),
  enq_ref             text        REFERENCES public.enquiries(id),
  cust                text        NOT NULL,
  po_no               text        NOT NULL,
  po_date             date        NOT NULL,
  dlv_date            date,
  status              text        DEFAULT 'Processing',
  value               numeric     DEFAULT 0,
  items               jsonb       DEFAULT '[]',
  po_filename         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  site_id             text,
  inco                text,
  curr                text        DEFAULT 'INR',
  insurance           numeric     DEFAULT 0,
  contact_id          text,
  contact             text,
  contact_phone       text,
  email               text,
  shipping_address    text,
  cust_enquiry_doc_no text,
  company_unit_id     text,
  bank_account_id     text,
  authorized_person   jsonb,
  terms               text
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.orders
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── followups ────────────────────────────────────────────────────────────────
-- One follow-up record per quote (UNIQUE on quote_id).
-- logs is a jsonb array of timestamped entries: [{date, note, outcome}]

CREATE TABLE IF NOT EXISTS public.followups (
  id               text        PRIMARY KEY,
  quote_id         text        UNIQUE REFERENCES public.quotes(id),
  owner            text,
  next_date        date,
  next_time        text,
  status           text        DEFAULT 'open',
  stage            text        DEFAULT 'Sent Quotation',
  stage_entered_at timestamptz,
  outcome          text,
  logs             jsonb       DEFAULT '[]',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.followups
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "allow_authenticated_all" ON public.followups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── po_submissions ───────────────────────────────────────────────────────────
-- PO file uploads linked to quotes.
-- Allows anon INSERT so the customer-facing PO upload link works without login.

CREATE TABLE IF NOT EXISTS public.po_submissions (
  id           bigserial   PRIMARY KEY,
  quote_id     text        NOT NULL,
  storage_path text        NOT NULL,
  linked       boolean     DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.po_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow company access" ON public.po_submissions
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

CREATE POLICY "Allow public insert" ON public.po_submissions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "allow_authenticated_all" ON public.po_submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ─── packing_types ────────────────────────────────────────────────────────────
-- name is UNIQUE (case-sensitive at DB level; app normalises to Title Case
-- before insert to achieve case-insensitive deduplication).
-- NOTE: as of 2026-07-01 RLS is enabled but no named policies exist,
-- so the frontend falls back to hardcoded defaults + localStorage when
-- the authenticated user's query is blocked. Add an allow policy when
-- tightening auth coverage.

CREATE TABLE IF NOT EXISTS public.packing_types (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.packing_types ENABLE ROW LEVEL SECURITY;
-- TODO: add an allow_authenticated_all policy (currently missing in live schema)


-- ─── samples ──────────────────────────────────────────────────────────────────
-- Created 2026-07-01 to fix "table public.samples not in schema cache" error.
-- status='pending' is the initial state set by SamplingNew.tsx on insert.
-- outcome is set later via the Record Feedback modal.

CREATE TABLE IF NOT EXISTS public.samples (
  id                text        PRIMARY KEY,
  cust              text        NOT NULL,
  quote_ref         text,
  enq_ref           text,
  product_name      text        NOT NULL,
  product_grade     text,
  quantity          numeric     NOT NULL DEFAULT 0,
  unit              text        NOT NULL DEFAULT 'g',
  sent_date         date,
  followup_due      date,
  courier_details   text,
  cost              numeric     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','dispatched','feedback_received','approved','rejected')),
  feedback_received boolean     NOT NULL DEFAULT false,
  outcome           text        CHECK (outcome IN ('approved','rejected','reformulation_needed')),
  sent_by           text,
  notes             text,
  created_at        timestamptz,
  updated_at        timestamptz
);

ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_samples" ON public.samples
  FOR ALL USING (true) WITH CHECK (true);
