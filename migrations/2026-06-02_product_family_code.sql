-- Migration: 2026-06-02 — Product family code (Type_Model_MOC)
--
-- A product's real-world identity is Type_Model_MOC (e.g. 'GCH_S121_NBR'),
-- composed of Type (GCH) + Model No. (S121) + MOC (NBR). One family usually
-- has MANY variants that differ by die, compound, dori/tikli size, press,
-- cure, etc. So `family_code` is intentionally NOT unique — it groups variants.
-- The existing `code` column stays the UNIQUE per-variant product code.

ALTER TABLE public.prod_products
  ADD COLUMN IF NOT EXISTS family_code TEXT;   -- Type_Model_MOC, e.g. 'GCH_S121_NBR' (not unique)

CREATE INDEX IF NOT EXISTS prod_products_family_idx ON public.prod_products(family_code);

-- Denormalise the family code onto jobs so every production screen (job cards,
-- sequencer, press board, stage logs, dispatch, dashboards, the Job Card PDF)
-- can show Type_Model_MOC as the product identity by reading the job row alone,
-- without joining back to prod_products. Set at job creation from the chosen
-- "Our Product"; falls back to product_desc when null (legacy / unlinked jobs).
ALTER TABLE public.prod_jobs
  ADD COLUMN IF NOT EXISTS family_code TEXT;   -- snapshot of prod_products.family_code

CREATE INDEX IF NOT EXISTS prod_jobs_family_idx ON public.prod_jobs(family_code);
