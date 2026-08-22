-- Migration: 2026-06-02 — Multi-press per product + job→product link
--
-- 1. prod_products.press_ids — a product can run on several compatible presses.
--    Stored as a TEXT[] of prod_presses.id values (e.g. {'P1','P2'}).
--    The legacy `tonnage` column stays for backward compatibility / display.
-- 2. prod_jobs.product_id — links a job line back to the "Our Product" master
--    record it was created from, so the product code/name can be shown
--    everywhere instead of only the free-text description.

ALTER TABLE public.prod_products
  ADD COLUMN IF NOT EXISTS press_ids TEXT[] DEFAULT '{}';

ALTER TABLE public.prod_jobs
  ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES public.prod_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS prod_jobs_product_idx ON public.prod_jobs (product_id);