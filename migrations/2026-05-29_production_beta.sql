-- ============================================================
-- MRT ERP — Production Workspace (BETA)
-- Phase 1 migration. Run once in Supabase SQL editor. Idempotent.
--
-- ISOLATION CONTRACT (per PRD):
--   * Every table here is prefixed `prod_*` and lives alongside, not
--     entangled with, the existing CRM tables (public.orders, customers,
--     quotes, enquiries, etc.).
--   * Production code only READS from public.orders during Beta. It does
--     not modify any CRM table or column. Dropping every `prod_*` table
--     below must leave the CRM byte-identical.
--   * One feature flag (`app_settings.production_beta_enabled`) gates the
--     entire workspace at the UI layer.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Feature flag on the existing settings singleton
-- Default TRUE: Production is on. Set FALSE explicitly to disable
-- the /production workspace in environments where the shop floor
-- isn't ready yet. Existing rows are NOT migrated — only new rows
-- get the default.
-- ------------------------------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS production_beta_enabled BOOLEAN DEFAULT TRUE;

-- ------------------------------------------------------------
-- 1. Presses (machine master)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_presses (
  id              TEXT PRIMARY KEY,                  -- e.g. 'P1'
  name            TEXT NOT NULL,                     -- e.g. 'Press 1'
  tonnage         TEXT NOT NULL,                     -- e.g. '100T'
  status          TEXT NOT NULL DEFAULT 'idle',      -- idle|setup|running|maintenance
  active_job_id   TEXT,
  pct_done        INTEGER DEFAULT 0,
  eta_text        TEXT DEFAULT 'Idle',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. Workers (attendance for shift briefing)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_workers (
  id              TEXT PRIMARY KEY,                  -- e.g. 'F01', 'I01'
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  department      TEXT NOT NULL,                     -- 'finishing' | 'inspection'
  present         BOOLEAN DEFAULT TRUE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3. Production jobs (one per Order line)
--    Schema mirrors Job Card.pdf fields + v2 dynamic-TAT fields.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_jobs (
  id                       TEXT PRIMARY KEY,         -- e.g. 'MRT-2026-001'
  job_card_no              TEXT,                     -- e.g. 'JC1540'
  order_id                 TEXT,                     -- FK to public.orders.id (NOT enforced; Beta is read-only on orders)
  order_line_seq           INTEGER,
  customer_id              TEXT,                     -- FK to public.customers.id (not enforced)
  customer_name            TEXT,                     -- denormalised snapshot at job creation
  product_desc             TEXT NOT NULL,
  qty                      INTEGER NOT NULL,
  qty_to_mould             INTEGER,
  qty_done                 INTEGER DEFAULT 0,
  promised_date            DATE,
  lsd                      DATE,                     -- latest start date
  order_start_date         DATE,
  target_completion_date   DATE,
  priority                 TEXT DEFAULT 'normal',    -- 'normal' | 'emergency'
  emergency_reason         TEXT,
  notes                    TEXT,

  stage                    TEXT NOT NULL DEFAULT 'queued',
  -- queued|moulding|finishing|inspection|pdi|dispatch|dispatched
  status                   TEXT NOT NULL DEFAULT 'queued',
  -- queued|setup|running|in-progress|passed|pending|ncr|awaiting|in-review|ready|dispatched|late

  -- Moulding
  batch_code               TEXT,
  batch_name               TEXT,
  mould_code               TEXT,
  cavities                 INTEGER,
  cure_time_min            INTEGER,
  cure_temp_c              INTEGER,
  compound_code            TEXT,                     -- e.g. 'GCH_M6M_NBR'
  tikli_size               TEXT,
  press_id                 TEXT REFERENCES public.prod_presses(id) ON DELETE SET NULL,

  -- Inspection
  inspector                TEXT,
  inspection_result        TEXT,                     -- pending|passed|ncr

  -- PDI
  pdi_officer              TEXT,
  inspection_passed_at     TIMESTAMPTZ,

  -- Dispatch
  courier                  TEXT,
  consignment_no           TEXT,
  dispatched_at            TIMESTAMPTZ,
  otd_result               TEXT,                     -- on-time|late|null

  -- Job Card print snapshots
  fg_stock_at_print        INTEGER,
  wip_stock_at_print       INTEGER,
  press_operator_name      TEXT,
  finishing_checked_by     TEXT,
  inspection_checked_by    TEXT,
  approved_by              TEXT,

  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_jobs_stage_idx       ON public.prod_jobs (stage);
CREATE INDEX IF NOT EXISTS prod_jobs_press_idx       ON public.prod_jobs (press_id);
CREATE INDEX IF NOT EXISTS prod_jobs_order_idx       ON public.prod_jobs (order_id);
CREATE INDEX IF NOT EXISTS prod_jobs_promised_idx    ON public.prod_jobs (promised_date);

-- ------------------------------------------------------------
-- 4. Stage events audit (powers the Production Timeline)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_job_stage_events (
  id          BIGSERIAL PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  ts          TIMESTAMPTZ DEFAULT NOW(),
  actor       TEXT,
  notes       TEXT
);
CREATE INDEX IF NOT EXISTS prod_job_stage_events_job_idx ON public.prod_job_stage_events (job_id, ts);

-- ------------------------------------------------------------
-- 5. NCR register
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_ncrs (
  id                 TEXT PRIMARY KEY,
  job_id             TEXT NOT NULL REFERENCES public.prod_jobs(id) ON DELETE CASCADE,
  defect_desc        TEXT,
  defect_code        TEXT,
  responsible_stage  TEXT,
  action             TEXT,                           -- 'rework' | 'reject'
  raised_by          TEXT,
  raised_at          TIMESTAMPTZ DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS prod_ncrs_job_idx ON public.prod_ncrs (job_id);

-- ------------------------------------------------------------
-- 6. Shop-floor settings (singleton)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_shop_floor_settings (
  id                   TEXT PRIMARY KEY DEFAULT 'config',
  shift_started        BOOLEAN DEFAULT FALSE,
  shift_hours          INTEGER DEFAULT 8,
  shift_hours_left     NUMERIC DEFAULT 8,
  overtime_max         INTEGER DEFAULT 2,
  planned_finishers    INTEGER DEFAULT 6,
  planned_inspectors   INTEGER DEFAULT 3,
  emergency_active     BOOLEAN DEFAULT FALSE,
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT prod_shop_floor_settings_single CHECK (id = 'config')
);

INSERT INTO public.prod_shop_floor_settings (id) VALUES ('config')
  ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 7. RLS policies — same @himalayaterpene.com gate as CRM tables
-- ------------------------------------------------------------
ALTER TABLE public.prod_presses                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_workers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_jobs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_job_stage_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_ncrs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_shop_floor_settings     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'prod_presses', 'prod_workers', 'prod_jobs',
    'prod_job_stage_events', 'prod_ncrs', 'prod_shop_floor_settings'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow company access" ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY "Allow company access"
      ON public.%I
      FOR ALL TO authenticated
      USING  (auth.jwt() ->> 'email' LIKE '%%@himalayaterpene.com')
      WITH CHECK (auth.jwt() ->> 'email' LIKE '%%@himalayaterpene.com')
    $f$, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 7b. Realtime — enrol prod_* tables in the supabase_realtime publication
-- Without this, `useRealtimeTables` subscribes successfully but never
-- receives change events. Idempotent: tries to add, swallows "already
-- exists" so re-running the migration is safe.
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'prod_presses', 'prod_workers', 'prod_jobs',
    'prod_job_stage_events', 'prod_ncrs', 'prod_shop_floor_settings'
  ]) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN
        -- already in publication, fine
        NULL;
      WHEN undefined_object THEN
        -- publication doesn't exist (self-hosted without realtime extension); skip
        RAISE NOTICE 'supabase_realtime publication not found — skipping realtime enrolment';
        EXIT;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 8. Seed: presses + workers (from the MRT v2 mock)
--    Idempotent: ON CONFLICT DO NOTHING.
-- ------------------------------------------------------------
INSERT INTO public.prod_presses (id, name, tonnage, status, eta_text) VALUES
  ('P1', 'Press 1', '100T', 'idle', 'Idle'),
  ('P2', 'Press 2', '100T', 'idle', 'Idle'),
  ('P3', 'Press 3', '150T', 'idle', 'Idle'),
  ('P4', 'Press 4', '200T', 'idle', 'Idle')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.prod_workers (id, name, role, department, present) VALUES
  ('F01', 'Ramesh K.',  'Senior Finisher',  'finishing', TRUE),
  ('F02', 'Suresh P.',  'Finisher',         'finishing', TRUE),
  ('F03', 'Dinesh M.',  'Finisher',         'finishing', FALSE),
  ('F04', 'Mahesh T.',  'Finisher',         'finishing', TRUE),
  ('F05', 'Ganesh R.',  'Finisher',         'finishing', TRUE),
  ('F06', 'Rajesh B.',  'Trainee Finisher', 'finishing', TRUE),
  ('F07', 'Harish V.',  'Finisher',         'finishing', FALSE),
  ('F08', 'Umesh S.',   'Finisher',         'finishing', TRUE),
  ('I01', 'Ravi K.',    'Sr. Inspector',    'inspection', TRUE),
  ('I02', 'Mohan D.',   'Inspector',        'inspection', TRUE),
  ('I03', 'Vijay S.',   'Inspector',        'inspection', FALSE),
  ('I04', 'Anil C.',    'Inspector',        'inspection', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- ROLLBACK (paste into SQL editor to undo, if Production is abandoned)
-- ------------------------------------------------------------
-- ALTER PUBLICATION supabase_realtime DROP TABLE
--   public.prod_ncrs, public.prod_job_stage_events, public.prod_jobs,
--   public.prod_workers, public.prod_presses, public.prod_shop_floor_settings;
-- DROP TABLE IF EXISTS public.prod_ncrs CASCADE;
-- DROP TABLE IF EXISTS public.prod_job_stage_events CASCADE;
-- DROP TABLE IF EXISTS public.prod_jobs CASCADE;
-- DROP TABLE IF EXISTS public.prod_workers CASCADE;
-- DROP TABLE IF EXISTS public.prod_presses CASCADE;
-- DROP TABLE IF EXISTS public.prod_shop_floor_settings CASCADE;
-- ALTER TABLE public.app_settings DROP COLUMN IF EXISTS production_beta_enabled;
