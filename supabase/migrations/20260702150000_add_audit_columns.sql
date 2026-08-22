-- Add audit tracking columns
-- customers already has created_by, created_date, modified_date — add missing modified_by
ALTER TABLE customers ADD COLUMN IF NOT EXISTS modified_by text;

-- product_catalog has no audit user columns yet
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS updated_by text;
