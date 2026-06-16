-- Migration: 2026-06-02 — Editable dropdown option master (prod_options)
--
-- Backs the "editable dropdown" identity/spec fields on the Product form:
--   Type · MOC · Item Category · Make · Colour Code
-- Users pick from this managed list or type a new value (inline add inserts a row).
-- Item Category rows carry a workshop-unit mapping in `meta` ({"unit":"Unit 2"})
-- so selecting a category auto-sets the product's workshop_unit (overridable).

CREATE TABLE IF NOT EXISTS public.prod_options (
  id         TEXT PRIMARY KEY,            -- 'opt-<ts>'
  field      TEXT NOT NULL,               -- 'type'|'moc'|'item_category'|'make'|'colour_code'
  value      TEXT NOT NULL,               -- stored/displayed value, e.g. 'Gasket'
  meta       JSONB,                       -- item_category only: {"unit":"Unit 2"}
  sort       INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Case-insensitive uniqueness per field so inline "add new" can't duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS prod_options_field_value_uniq
  ON public.prod_options (field, lower(value));

-- ------------------------------------------------------------
-- RLS — same @himalayaterpene.com gate as the other prod_* tables
-- ------------------------------------------------------------
ALTER TABLE public.prod_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow company access" ON public.prod_options;
CREATE POLICY "Allow company access"
  ON public.prod_options
  FOR ALL TO authenticated
  USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
  WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');

-- Realtime enrolment (idempotent; safe if publication absent).
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.prod_options';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN
      RAISE NOTICE 'supabase_realtime publication not found — skipping realtime enrolment';
  END;
END $$;

-- ------------------------------------------------------------
-- Seed: Item Category → Workshop Unit (from the item master sheet).
-- Unit 2 items: Gasket, Liner, Butter Fly 2, Die Making Charges U2, SS Plate.
-- Everything else → Unit 1.
-- Idempotent: ON CONFLICT (field, lower(value)) DO NOTHING.
-- ------------------------------------------------------------
INSERT INTO public.prod_options (id, field, value, meta) VALUES
  ('opt-cat-gasket',         'item_category', 'Gasket',                          '{"unit":"Unit 2"}'),
  ('opt-cat-liner',          'item_category', 'Liner',                           '{"unit":"Unit 2"}'),
  ('opt-cat-bfly2',          'item_category', 'Butter Fly 2',                    '{"unit":"Unit 2"}'),
  ('opt-cat-bfly1',          'item_category', 'Butter Fly 1',                    '{"unit":"Unit 1"}'),
  ('opt-cat-orings',         'item_category', 'O-Rings',                         '{"unit":"Unit 1"}'),
  ('opt-cat-valves',         'item_category', 'Valves',                          '{"unit":"Unit 1"}'),
  ('opt-cat-flatewasher',    'item_category', 'Flate Washer',                    '{"unit":"Unit 1"}'),
  ('opt-cat-rubberseat',     'item_category', 'Rubber Seat',                     '{"unit":"Unit 1"}'),
  ('opt-cat-seal',           'item_category', 'Seal',                            '{"unit":"Unit 1"}'),
  ('opt-cat-diskplate',      'item_category', 'Disk Plate',                      '{"unit":"Unit 1"}'),
  ('opt-cat-localdisk',      'item_category', 'Local Disk',                      '{"unit":"Unit 1"}'),
  ('opt-cat-pan',            'item_category', 'Pan',                             '{"unit":"Unit 1"}'),
  ('opt-cat-cord',           'item_category', 'Cord',                            '{"unit":"Unit 1"}'),
  ('opt-cat-dmc-u2',         'item_category', 'Die Making Charges U2',           '{"unit":"Unit 2"}'),
  ('opt-cat-dmc-u1',         'item_category', 'Die Making Charges U1',           '{"unit":"Unit 1"}'),
  ('opt-cat-coupling',       'item_category', 'Coupling',                        '{"unit":"Unit 1"}'),
  ('opt-cat-bellow',         'item_category', 'Bellow',                          '{"unit":"Unit 1"}'),
  ('opt-cat-hydbucket',      'item_category', 'Hydraulic Bucket',                '{"unit":"Unit 1"}'),
  ('opt-cat-taperplug',      'item_category', 'Taper Plug',                      '{"unit":"Unit 1"}'),
  ('opt-cat-grommet',        'item_category', 'Grommet',                         '{"unit":"Unit 1"}'),
  ('opt-cat-diaphragm',      'item_category', 'Diaphragm',                       '{"unit":"Unit 1"}'),
  ('opt-cat-hose',           'item_category', 'Hose',                            '{"unit":"Unit 1"}'),
  ('opt-cat-patti',          'item_category', 'Patti',                           '{"unit":"Unit 1"}'),
  ('opt-cat-rubbersheet',    'item_category', 'Rubber Sheet',                    '{"unit":"Unit 1"}'),
  ('opt-cat-sealkit',        'item_category', 'Seal Kit',                        '{"unit":"Unit 1"}'),
  ('opt-cat-rubberstrip',    'item_category', 'Rubber Strip',                    '{"unit":"Unit 1"}'),
  ('opt-cat-rubbersqueezer', 'item_category', 'Rubber Squeezer',                 '{"unit":"Unit 1"}'),
  ('opt-cat-ssplate',        'item_category', 'SS Plate',                        '{"unit":"Unit 2"}'),
  ('opt-cat-bottomroller',   'item_category', 'Bottom Roller / Juice seal',      '{"unit":"Unit 1"}'),
  ('opt-cat-flatring',       'item_category', 'Flat Ring',                       '{"unit":"Unit 1"}'),
  ('opt-cat-bushplain',      'item_category', 'Bush - Plain',                    '{"unit":"Unit 1"}'),
  ('opt-cat-bushbrass',      'item_category', 'Bush - Brass',                    '{"unit":"Unit 1"}'),
  ('opt-cat-ucoupling',      'item_category', 'U Coupling',                      '{"unit":"Unit 1"}'),
  ('opt-cat-starcoupling',   'item_category', 'Star Coupling',                   '{"unit":"Unit 1"}'),
  ('opt-cat-bushfeedpump',   'item_category', 'Bush - feed pump',                '{"unit":"Unit 1"}'),
  ('opt-cat-tensioner',      'item_category', 'Tensioner',                       '{"unit":"Unit 1"}'),
  ('opt-cat-dampingpad',     'item_category', 'Damping pad',                     '{"unit":"Unit 1"}'),
  ('opt-cat-hopper',         'item_category', 'Hopper',                          '{"unit":"Unit 1"}'),
  ('opt-cat-stator',         'item_category', 'Stator',                          '{"unit":"Unit 1"}'),
  ('opt-cat-bootseal',       'item_category', 'Boot seal',                       '{"unit":"Unit 1"}'),
  ('opt-cat-buffer',         'item_category', 'Buffer',                          '{"unit":"Unit 1"}'),
  ('opt-cat-soup',           'item_category', 'Soup',                            '{"unit":"Unit 1"}'),
  ('opt-cat-molassessleeve', 'item_category', 'Molasses sleeve',                 '{"unit":"Unit 1"}'),
  ('opt-cat-exhvapseat',     'item_category', 'Exhaust & vapour value seat',     '{"unit":"Unit 1"}'),
  ('opt-cat-mudscraper',     'item_category', 'Mud scraper',                     '{"unit":"Unit 1"}'),
  ('opt-cat-hydseals',       'item_category', 'HYDRAULIC SEALS',                 '{"unit":"Unit 1"}'),
  ('opt-cat-sightglass',     'item_category', 'Sight Glass',                     '{"unit":"Unit 1"}'),
  ('opt-cat-uchannel',       'item_category', 'U Channel',                       '{"unit":"Unit 1"}')
ON CONFLICT (field, lower(value)) DO NOTHING;

-- Starter sets for the other dropdowns (extend freely in the app).
INSERT INTO public.prod_options (id, field, value) VALUES
  ('opt-moc-nbr',      'moc',         'NBR'),
  ('opt-moc-epdm',     'moc',         'EPDM'),
  ('opt-moc-silicone', 'moc',         'Silicone'),
  ('opt-moc-viton',    'moc',         'Viton'),
  ('opt-moc-natural',  'moc',         'Natural'),
  ('opt-col-black',    'colour_code', 'Black'),
  ('opt-col-red',      'colour_code', 'Red'),
  ('opt-col-green',    'colour_code', 'Green'),
  ('opt-col-blue',     'colour_code', 'Blue'),
  ('opt-col-white',    'colour_code', 'White')
ON CONFLICT (field, lower(value)) DO NOTHING;
