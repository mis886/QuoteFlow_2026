-- Child table: one row per product per sample
CREATE TABLE IF NOT EXISTS public.sample_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id text NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  product_name text,
  grade text,
  lot_no text,
  coa_url text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'g',
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sample_products TO anon, authenticated;

-- RLS with open policy (internal tool)
ALTER TABLE public.sample_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sample_products_open_access" ON public.sample_products;
CREATE POLICY "sample_products_open_access" ON public.sample_products
  FOR ALL USING (true) WITH CHECK (true);

-- Index
CREATE INDEX IF NOT EXISTS sample_products_sample_id_idx
  ON public.sample_products(sample_id, sort_order);

-- Backfill: existing samples → product row #1 (idempotent via NOT EXISTS guard)
INSERT INTO public.sample_products
  (sample_id, product_name, grade, lot_no, coa_url, quantity, unit, sort_order)
SELECT
  s.id,
  s.product_name,
  s.product_grade,
  s.lot_no,
  s.coa_file,
  COALESCE(s.quantity, 0),
  COALESCE(s.unit, 'g'),
  1
FROM public.samples s
WHERE s.product_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sample_products sp WHERE sp.sample_id = s.id
  );
