-- =============================================================================
-- Create public.product_catalog table and seed from BILLING_HSN
--
-- WHY: Product names and HSN codes were previously hardcoded in src/lib/products.ts
-- (BILLING_HSN, 59 entries). This migration makes them DB-managed so admins
-- can add, edit, and remove products from Settings without a code deploy.
-- The seed data comes from BILLING_HSN — the active source used by all quote,
-- order, and enquiry line-item dropdowns.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_catalog (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text        NOT NULL UNIQUE,
  hsn_code     text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_catalog_authenticated_all"
  ON public.product_catalog
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed with BILLING_HSN entries (59 products)
INSERT INTO public.product_catalog (product_name, hsn_code) VALUES
  ('Alpha Pinene',               '29021900'),
  ('Anthamber Residue',          '38259000'),
  ('Anthamber Tops',             '38259000'),
  ('Beta Pinene',                '29021900'),
  ('Camphene',                   '29142390'),
  ('Camphor Oil',                '33012941'),
  ('Camphor Powder',             '29142922'),
  ('Camphor Tops',               '29142990'),
  ('Carvacrol',                  '29071190'),
  ('CITRONELLA TOPS',            '33011910'),
  ('D-Limonene',                 '29029010'),
  ('Delta Carene',               '29029090'),
  ('Delta-3-Carene',             '29029090'),
  ('DHM Residue',                '38256100'),
  ('DHM Tops',                   '29052290'),
  ('Dipentene',                  '29029010'),
  ('DL-Limonene',                '29021990'),
  ('Ester Gum',                  '38063000'),
  ('Fenchone',                   '29061990'),
  ('Gamma Terpinene',            '29061990'),
  ('Geraniol HB',                '38259000'),
  ('Geraniol Tops',              '38259000'),
  ('Gum Rosin',                  '38061090'),
  ('Isoborneol',                 '29061990'),
  ('Isoborneol Flakes',          '29061990'),
  ('Isobornyl Acetate',          '29153920'),
  ('Isolongifolene Keton Comm',  '29142990'),
  ('L-Limonene',                 '29021900'),
  ('LEMON TERPENES',             '33012990'),
  ('Lemongrass Oil',             '29052230'),
  ('LINALOOL NAT',               '38259000'),
  ('Longifolene',                '29021900'),
  ('Methyl Pentanone',           '38259000'),
  ('Orange Oil',                 '29021990'),
  ('OT PT',                      '29142990'),
  ('PINE OIL 85',                '38059090'),
  ('PINE OIL 90',                '38059090'),
  ('Pine Oil',                   '38059090'),
  ('Pine Oil 211',               '38059090'),
  ('Pine Oil 311',               '38059090'),
  ('Pine Oil 40',                '38059090'),
  ('Pine Oil 411',               '38059090'),
  ('Pine Oil 50',                '38059090'),
  ('Pine Oil 511',               '38059090'),
  ('Pine Oil 65',                '38059090'),
  ('Pine Oil 70',                '38059090'),
  ('Pine Tar',                   '38059010'),
  ('Rosin',                      '38061010'),
  ('SODIUM ACETATE TRIHYDRATE',  '29152990'),
  ('Terpene',                    '29021990'),
  ('Terpinen-4-OL',              '29061990'),
  ('Terpineol',                  '29061990'),
  ('Terpinolene',                '29021900'),
  ('Terpinyl Acetate',           '29153960'),
  ('Terpin Hydrate Powder',      '29061990'),
  ('Timber Touch Tops',          '81082000'),
  ('Titanium Recycle',           '29061990'),
  ('TMCM T & B Residue',         '29061990'),
  ('Turpentine',                 '38059090')
ON CONFLICT (product_name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
