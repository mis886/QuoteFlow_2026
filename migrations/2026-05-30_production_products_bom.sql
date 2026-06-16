-- ============================================================
-- MRT ERP — Phase 2: Product Master + Compounds + BOM
-- Run once in Supabase SQL editor. Idempotent.
-- Isolation: prod_* tables only. CRM tables untouched.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Compounds (rubber grades)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_compounds (
  id          TEXT PRIMARY KEY,               -- e.g. 'CM001'
  code        TEXT NOT NULL UNIQUE,           -- e.g. 'EPDM-70'
  name        TEXT NOT NULL,
  grade       TEXT NOT NULL,                  -- 'EPDM' | 'NBR' | 'HNBR' | 'FKM' | 'FFKM'
  shore_a     INTEGER,
  shelf_days  INTEGER,
  colour      TEXT DEFAULT 'Black',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. Product master
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_products (
  id              TEXT PRIMARY KEY,           -- e.g. 'P001'
  code            TEXT NOT NULL UNIQUE,       -- e.g. 'PHE-M10-E70'
  name            TEXT NOT NULL,
  customer_id     TEXT,                       -- FK to public.customers.id (soft ref)
  customer_name   TEXT,                       -- denormalised for display
  compound_id     TEXT REFERENCES public.prod_compounds(id) ON DELETE SET NULL,

  -- Mould / press
  mould_code      TEXT,                       -- e.g. 'M-018'
  cavities        INTEGER,
  tonnage         INTEGER,                    -- press tonnage in T

  -- Cure
  cure_temp_c     INTEGER,
  cure_time_min   INTEGER,
  shot_weight_g   INTEGER,

  -- Production rates (from PMS / time-study)
  setup_time_hrs  NUMERIC(4,2) DEFAULT 0.5,  -- mould change hours
  finish_rate     NUMERIC(6,2),              -- pcs / finisher / hr
  insp_rate       NUMERIC(6,2),              -- pcs / inspector / hr
  pdi_time_hrs    NUMERIC(4,2) DEFAULT 0.25, -- hrs per job

  -- Drawing & revision
  draw_ref        TEXT,
  revision        TEXT DEFAULT 'R1',
  unit_cost       NUMERIC(10,2),

  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_products_compound_idx ON public.prod_products(compound_id);
CREATE INDEX IF NOT EXISTS prod_products_customer_idx ON public.prod_products(customer_id);

-- ------------------------------------------------------------
-- 3. BOM (Bill of Materials) — one row per component
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prod_boms (
  id              BIGSERIAL PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES public.prod_products(id) ON DELETE CASCADE,
  -- compound summary row (is_compound = true) or raw-material row
  is_compound     BOOLEAN DEFAULT FALSE,
  raw_code        TEXT NOT NULL,              -- e.g. 'RM-EPDM-KL380' or compound code
  raw_name        TEXT NOT NULL,
  qty_per_batch   NUMERIC(10,3),
  unit            TEXT DEFAULT 'kg',
  supplier        TEXT,
  kg_per_batch    NUMERIC(10,3),             -- for compound row
  batches_per_run INTEGER,                   -- for compound row
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_boms_product_idx ON public.prod_boms(product_id);

-- ------------------------------------------------------------
-- 4. RLS — same @himalayaterpene.com gate
-- ------------------------------------------------------------
ALTER TABLE public.prod_compounds   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prod_boms        ENABLE ROW LEVEL SECURITY;

-- RLS policies written out individually to avoid nested dollar-quoting issues.
DROP POLICY IF EXISTS "Allow company access" ON public.prod_compounds;
CREATE POLICY "Allow company access" ON public.prod_compounds
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Allow company access" ON public.prod_products;
CREATE POLICY "Allow company access" ON public.prod_products
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Allow company access" ON public.prod_boms;
CREATE POLICY "Allow company access" ON public.prod_boms
  FOR ALL TO authenticated
  USING  ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
  WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');

-- ------------------------------------------------------------
-- 5. Realtime
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['prod_compounds','prod_products','prod_boms']) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN EXIT;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 6. Seed compounds (from v2 mock)
-- ------------------------------------------------------------
INSERT INTO public.prod_compounds (id, code, name, grade, shore_a, shelf_days, colour) VALUES
  ('CM001','EPDM-70',  'EPDM 70 Shore A — General',   'EPDM', 70, 180, 'Black'),
  ('CM002','EPDM-70W', 'EPDM 70 Shore A — WRAS',      'EPDM', 70, 180, 'Black'),
  ('CM003','NBR-65',   'NBR 65 Shore A — General',    'NBR',  65, 120, 'Black'),
  ('CM004','HNBR-70',  'HNBR 70 Shore A — HT Grade',  'HNBR', 70, 150, 'Black'),
  ('CM005','FKM-75',   'FKM 75 Shore A — Chemical',   'FKM',  75, 365, 'Brown'),
  ('CM006','FFKM-80',  'FFKM 80 Shore A — Ultra',     'FFKM', 80, 365, 'White')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 7. Seed products (from v2 mock — 10 products)
-- ------------------------------------------------------------
INSERT INTO public.prod_products
  (id,code,name,customer_name,compound_id,mould_code,cavities,tonnage,cure_temp_c,cure_time_min,shot_weight_g,setup_time_hrs,finish_rate,insp_rate,pdi_time_hrs,draw_ref,revision,unit_cost)
VALUES
  ('P001','PHE-M10-E70',    'PHE Gasket M10 EPDM',       'Alfa Laval India Ltd', 'CM001','M-018',2, 100,165,18, 85, 0.5, 9,  39, 0.25,'DRW-PHE-M10-E70-R3',  'R3',  28.50),
  ('P002','PHE-M15B-E70',   'PHE Gasket M15B EPDM',      'Thermax Ltd',          'CM001','M-024',2, 100,165,18,112, 0.5, 9,   5, 0.25,'DRW-PHE-M15B-E70-R2', 'R2',  34.00),
  ('P003','WRAS-DN150-E70W','WRAS Gasket DN150 EPDM',    'NPCIL',                'CM002','M-042',4, 200,160,20,340, 1.0, 5,   3, 0.50,'DRW-WRAS-DN150-R1',   'R1', 185.00),
  ('P004','BFL-DN100-E70',  'Butterfly Liner DN100',     'ABC Valves Pvt Ltd',   'CM001','M-067',1, 150,168,22,420, 1.0, 4,   4, 0.50,'DRW-BFL-DN100-R2',    'R2', 220.00),
  ('P005','BFL-DN200-E70',  'Butterfly Liner DN200',     'ABC Valves Pvt Ltd',   'CM001','M-068',1, 200,168,25,680, 1.0, 3,   3, 0.50,'DRW-BFL-DN200-R1',    'R1', 380.00),
  ('P006','ORG-3X20-N65',   'O-Ring NBR 3x20',           'Thermax Ltd',          'CM003','M-112',16,100,155,12, 22, 0.3,40, 100, 0.25,'DRW-ORG-3X20-N65-R4', 'R4',   3.20),
  ('P007','ORG-4X30-H70',   'O-Ring HNBR 4x30',         'NPCIL',                'CM004','M-098',12,100,175,15, 28, 0.3,30,  60, 0.25,'DRW-ORG-4X30-H70-R2', 'R2',   8.50),
  ('P008','DS-DN80-E70',    'Dome Seal DN80 EPDM',       'Advance Valves Pvt Ltd','CM001','M-033',2, 150,165,20,195, 0.5, 6,   8, 0.25,'DRW-DS-DN80-E70-R2',  'R2', 145.00),
  ('P009','ORG-5X35-FF80',  'FFKM O-Ring 5x35',          'James Walker & Co Ltd','CM006','M-145',8, 100,180,20, 18, 0.3,20,  40, 0.50,'DRW-ORG-5X35-FF80-R1','R1',  42.00),
  ('P010','PL-M10-E70',     'Port Liner M10 EPDM',       'Alfa Laval India Ltd', 'CM001','M-055',4, 150,163,19, 75, 0.5, 8,  15, 0.25,'DRW-PL-M10-E70-R2',   'R2',  22.00)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 8. Seed BOM for P001 (PHE Gasket M10 EPDM)
-- ------------------------------------------------------------
INSERT INTO public.prod_boms (product_id,is_compound,raw_code,raw_name,qty_per_batch,unit,supplier,kg_per_batch,batches_per_run,sort_order) VALUES
  ('P001',TRUE, 'EPDM-70',     'EPDM 70 Shore A — General',   NULL, 'kg', NULL, 25, 2, 0),
  ('P001',FALSE,'RM-EPDM-KL380','EPDM Polymer KL-380',         15.0, 'kg','Lanxess',          NULL,NULL,1),
  ('P001',FALSE,'RM-CB-N550',  'Carbon Black N-550',            4.5, 'kg','Cabot India',       NULL,NULL,2),
  ('P001',FALSE,'RM-ZNO-01',   'Zinc Oxide',                    1.5, 'kg','Rubamin Ltd',       NULL,NULL,3),
  ('P001',FALSE,'RM-SA-01',    'Stearic Acid',                  0.5, 'kg','Local',             NULL,NULL,4),
  ('P001',FALSE,'RM-TMTD-01',  'TMTD Accelerator',              0.8, 'kg','NOCIL',             NULL,NULL,5),
  ('P001',FALSE,'RM-S-01',     'Sulphur',                       0.7, 'kg','Local',             NULL,NULL,6),
  ('P001',FALSE,'RM-PROC-01',  'Process Oil (EPDM)',            2.0, 'kg','Hindustan Petroleum',NULL,NULL,7)
ON CONFLICT DO NOTHING;

-- Seed BOM for P003 (WRAS Gasket DN150)
INSERT INTO public.prod_boms (product_id,is_compound,raw_code,raw_name,qty_per_batch,unit,supplier,kg_per_batch,batches_per_run,sort_order) VALUES
  ('P003',TRUE, 'EPDM-70W',    'EPDM 70 Shore A — WRAS',       NULL, 'kg', NULL, 30, 3, 0),
  ('P003',FALSE,'RM-EPDM-EP65','EPDM Polymer EP-65 (WRAS)',    18.0, 'kg','DSM Elastomers',    NULL,NULL,1),
  ('P003',FALSE,'RM-WHITESILICA','Precipitated Silica',          6.0, 'kg','Madhu Silica',      NULL,NULL,2),
  ('P003',FALSE,'RM-ZNO-01',   'Zinc Oxide',                    1.5, 'kg','Rubamin Ltd',       NULL,NULL,3),
  ('P003',FALSE,'RM-MBTS-01',  'MBTS Accelerator',              1.0, 'kg','NOCIL',             NULL,NULL,4),
  ('P003',FALSE,'RM-S-01',     'Sulphur',                       0.8, 'kg','Local',             NULL,NULL,5),
  ('P003',FALSE,'RM-PROC-W',   'White Process Oil (WRAS)',      2.7, 'kg','Fuchs India',       NULL,NULL,6)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- ROLLBACK
-- ------------------------------------------------------------
-- DROP TABLE IF EXISTS public.prod_boms CASCADE;
-- DROP TABLE IF EXISTS public.prod_products CASCADE;
-- DROP TABLE IF EXISTS public.prod_compounds CASCADE;
