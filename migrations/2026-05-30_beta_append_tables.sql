-- ============================================================
-- MRT ERP — Beta: Append-only production + dispatch tables
-- Run once in Supabase SQL editor. Idempotent.
-- Isolation: prod_* tables only. CRM tables untouched.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Molding sessions (append-only, one row per press run)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_molding (
  id                  TEXT PRIMARY KEY,           -- MLD-YYYY-NNNNN
  job_card_id         TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
  molding_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  shift               TEXT DEFAULT 'A',           -- A | B | C
  operation_type      TEXT DEFAULT 'Production',  -- Production | Trial | Rework
  press_no            TEXT NOT NULL,
  die_no              TEXT,
  tikli_size          TEXT,
  cure_time_min       INTEGER,
  cure_temp_c         INTEGER,
  scorch_time_min     INTEGER,
  die_change_min      INTEGER,
  dori_khatam_min     INTEGER,
  spray               TEXT,
  weight_before_g     NUMERIC(8,2),
  weight_after_g      NUMERIC(8,2),
  qty_molded          INTEGER NOT NULL,
  planned_qty         INTEGER,
  start_time          TIME,
  end_time            TIME,
  working_time_min    INTEGER,                    -- auto-computed end-start
  operator_name       TEXT NOT NULL,
  remarks             TEXT,
  entered_by          TEXT,
  -- denormalised snapshots
  order_id            TEXT,
  item_code           TEXT,
  our_desc            TEXT,
  type_item_moc       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_molding_jc_idx ON public.prod_molding(job_card_id);
CREATE INDEX IF NOT EXISTS prod_molding_date_idx ON public.prod_molding(molding_date DESC);

-- ------------------------------------------------------------
-- 2. Finishing sessions (append-only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_finishing (
  id                  TEXT PRIMARY KEY,           -- FIN-YYYY-NNNNN
  job_card_id         TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
  finishing_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  actual_qty          INTEGER NOT NULL,
  planned_qty         INTEGER,
  working_hours       NUMERIC(5,2),
  finisher_name       TEXT NOT NULL,
  is_rework           BOOLEAN DEFAULT FALSE,
  remarks             TEXT,
  entered_by          TEXT,
  -- denormalised
  order_id            TEXT,
  die_no              TEXT,
  type_item_moc       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_finishing_jc_idx ON public.prod_finishing(job_card_id);

-- ------------------------------------------------------------
-- 3. Inspection sessions (append-only, split must balance)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_inspection (
  id                  TEXT PRIMARY KEY,           -- INS-YYYY-NNNNN
  job_card_id         TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
  inspection_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  qty_to_inspect      INTEGER NOT NULL,
  qty_inspected       INTEGER NOT NULL,           -- = qty_to_inspect on save
  passed              INTEGER NOT NULL DEFAULT 0,
  rejected            INTEGER NOT NULL DEFAULT 0,
  rework              INTEGER NOT NULL DEFAULT 0,
  scrapped            INTEGER NOT NULL DEFAULT 0,
  -- CONSTRAINT: passed+rejected+rework+scrapped = qty_to_inspect
  CONSTRAINT insp_split_check CHECK (passed + rejected + rework + scrapped = qty_to_inspect),
  inspector_name      TEXT NOT NULL,
  start_time          TIME,
  end_time            TIME,
  working_hours       NUMERIC(5,2),
  rejection_reasons   TEXT,                       -- Flash, Unfill, Blow, Dimension…
  remarks             TEXT,
  entered_by          TEXT,
  -- denormalised
  order_id            TEXT,
  die_no              TEXT,
  type_item_moc       TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_inspection_jc_idx ON public.prod_inspection(job_card_id);

-- ------------------------------------------------------------
-- 4. Dispatch master (one per invoice)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_dispatches (
  id                  TEXT PRIMARY KEY,           -- DSP-YYYY-NNNNN
  invoice_no          TEXT NOT NULL UNIQUE,
  dispatch_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name       TEXT NOT NULL,
  po_no               TEXT,
  po_date             DATE,
  total_qty_dispatched INTEGER DEFAULT 0,
  mode                TEXT DEFAULT 'Road',        -- Road|Courier|Rail|Air|Hand Delivery
  courier_name        TEXT,
  tracking_number     TEXT,
  bilty_no            TEXT,
  bilty_date          DATE,
  no_of_cartons       INTEGER,
  invoice_value       NUMERIC(12,2),
  status              TEXT DEFAULT 'Dispatched',  -- Dispatched|In Transit|Delivered|Returned
  remarks             TEXT,
  entered_by          TEXT,
  received_by_crm     BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_dispatches_date_idx ON public.prod_dispatches(dispatch_date DESC);
CREATE INDEX IF NOT EXISTS prod_dispatches_cust_idx ON public.prod_dispatches(customer_name);

-- ------------------------------------------------------------
-- 5. Dispatch line items (one per JC per invoice)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_dispatch_items (
  id                  TEXT PRIMARY KEY,           -- DI-{epoch_ms}-{seq}
  dispatch_id         TEXT NOT NULL REFERENCES public.prod_dispatches(id) ON DELETE CASCADE,
  job_card_id         TEXT NOT NULL REFERENCES public.prod_jobs(id),
  qty_dispatched      INTEGER NOT NULL,
  unit                TEXT DEFAULT 'pcs',
  ordered_qty         INTEGER,                    -- snapshot of JC qty
  remaining_qty       INTEGER,                    -- orderedQty - prevDisp - thisQty
  -- denormalised snapshots
  order_id            TEXT,
  po_no               TEXT,
  ordered_item        TEXT,
  die_no              TEXT,
  moc                 TEXT,
  dispatch_date       DATE,
  invoice_no          TEXT,
  entered_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_dispatch_items_dispatch_idx ON public.prod_dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS prod_dispatch_items_jc_idx      ON public.prod_dispatch_items(job_card_id);

-- ------------------------------------------------------------
-- 6. RLS — same @himalayaterpene.com gate on all 5 tables
-- ------------------------------------------------------------
ALTER TABLE public.prod_molding          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_finishing        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_inspection       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_dispatches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_dispatch_items   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company access" ON public.prod_molding;
CREATE POLICY "Company access" ON public.prod_molding FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Company access" ON public.prod_finishing;
CREATE POLICY "Company access" ON public.prod_finishing FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Company access" ON public.prod_inspection;
CREATE POLICY "Company access" ON public.prod_inspection FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Company access" ON public.prod_dispatches;
CREATE POLICY "Company access" ON public.prod_dispatches FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Company access" ON public.prod_dispatch_items;
CREATE POLICY "Company access" ON public.prod_dispatch_items FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

-- ------------------------------------------------------------
-- 7. Realtime publication
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'prod_molding','prod_finishing','prod_inspection',
    'prod_dispatches','prod_dispatch_items'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN EXIT;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- ROLLBACK
-- ------------------------------------------------------------
-- DROP TABLE IF EXISTS public.prod_dispatch_items CASCADE;
-- DROP TABLE IF EXISTS public.prod_dispatches       CASCADE;
-- DROP TABLE IF EXISTS public.prod_inspection       CASCADE;
-- DROP TABLE IF EXISTS public.prod_finishing        CASCADE;
-- DROP TABLE IF EXISTS public.prod_molding          CASCADE;
