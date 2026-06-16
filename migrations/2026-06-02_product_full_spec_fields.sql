-- Migration: 2026-06-02 — Full product master spec fields
--
-- Adds the remaining columns from the item master sheet onto prod_products.
-- Existing columns reused (NOT re-added):
--   Die No        -> mould_code
--   Cure Time     -> cure_time_min
--   Cure Temp     -> cure_temp_c
--   Press No      -> press_ids (TEXT[])
--   Per hr Finish -> finish_rate
--   Per hr Insp   -> insp_rate
-- family_code (Type_Model_MOC) already added in 2026-06-02_product_family_code.sql.

ALTER TABLE public.prod_products
  ADD COLUMN IF NOT EXISTS item_category         TEXT,          -- e.g. 'Gasket'
  ADD COLUMN IF NOT EXISTS type_code             TEXT,          -- TYPE, e.g. 'GCH'
  ADD COLUMN IF NOT EXISTS model_no              TEXT,          -- Model No., e.g. 'S121'
  ADD COLUMN IF NOT EXISTS moc                   TEXT,          -- MOC, e.g. 'NBR'
  ADD COLUMN IF NOT EXISTS make                  TEXT,          -- e.g. 'Sondex'
  ADD COLUMN IF NOT EXISTS shrinkage             TEXT,          -- free text / %
  ADD COLUMN IF NOT EXISTS compound_no           TEXT,          -- Compound No., e.g. '1154'
  ADD COLUMN IF NOT EXISTS dori_size_required    TEXT,          -- e.g. '8.0 & 8.5mm'
  ADD COLUMN IF NOT EXISTS dori_size_used        TEXT,          -- dori size used in past
  ADD COLUMN IF NOT EXISTS tikli_size            TEXT,          -- e.g. '6.6 & 7.0'
  ADD COLUMN IF NOT EXISTS cycle_time_min        NUMERIC(6,2),  -- cycle time (min)
  ADD COLUMN IF NOT EXISTS oven_time_hrs         NUMERIC(6,2),  -- oven time (hrs)
  ADD COLUMN IF NOT EXISTS oven_temp_c           INTEGER,       -- oven temp (°C)
  ADD COLUMN IF NOT EXISTS blank_weight_g        NUMERIC(10,3), -- blank weight (g)
  ADD COLUMN IF NOT EXISTS finished_weight_g     NUMERIC(10,3), -- finished pc weight (g)
  ADD COLUMN IF NOT EXISTS pcs_hr_1side          NUMERIC(8,2),  -- pcs/hour 1-side operation
  ADD COLUMN IF NOT EXISTS pcs_hr_2side          NUMERIC(8,2),  -- pcs/hour 2-side operation
  ADD COLUMN IF NOT EXISTS mold_rate             NUMERIC(8,2),  -- per-hour molding (explicit)
  ADD COLUMN IF NOT EXISTS colour_code           TEXT,          -- colour code
  ADD COLUMN IF NOT EXISTS maintenance_after_qty INTEGER;       -- maintenance after N pcs
