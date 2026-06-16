-- Migration: 2026-06-02 — Product workshop unit
--
-- Which workshop unit (Unit 1 / Unit 2) manufactures the product. Auto-derived
-- from the Item Category → unit mapping in prod_options.meta on the Product form,
-- but stored here so it can be overridden per product and grouped in reports.

ALTER TABLE public.prod_products
  ADD COLUMN IF NOT EXISTS workshop_unit TEXT;   -- 'Unit 1' | 'Unit 2'
