-- Add products jsonb column (array of {name, grade} objects, matching enquiries.items pattern)
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS products jsonb;

-- Backfill: copy existing single product_name/product_grade into products array
-- Only for rows that don't already have products (idempotent)
UPDATE public.samples
SET products = jsonb_build_array(
  jsonb_build_object('name', product_name, 'grade', COALESCE(product_grade, ''))
)
WHERE products IS NULL AND product_name IS NOT NULL;

-- Add created_by column (email of user who logged the sample)
ALTER TABLE public.samples ADD COLUMN IF NOT EXISTS created_by text;
