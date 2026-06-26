-- Single source-of-truth packing types table.
-- Replaces the earlier custom_packing_types table; includes all 19 defaults
-- so forms load from DB rather than a hardcoded array.

CREATE TABLE IF NOT EXISTS public.packing_types (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO public.packing_types (name) VALUES
  ('Empty Barrels'),
  ('NEW PVC (PRINTED)'),
  ('NEW PVC (PLANE) 8.2KG sample'),
  ('NEW PVC (PLANE) 8.2 KG'),
  ('NEW PVC (PLANE) 9.5 KG'),
  ('Used NEW PVC (PLANE) TERPI'),
  ('NEW GI(Silver) (Plane) 22 kg'),
  ('NEW GI(Silver) (Lining) 22 kg'),
  ('NEW GI(Silver) (Lining) OLD UN'),
  ('New MS Black epoxy'),
  ('New MS Black epoxy USED'),
  ('New MS Black epoxy REJECTED'),
  ('New MS Black epoxy OLD UN'),
  ('New Cans Terpineol'),
  ('Used barrels of thermic MS'),
  ('MS BARRELS FOR PITCH'),
  ('Hdpe washed'),
  ('Hdpe unwashed'),
  ('IBC Box USED')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.packing_types ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated_read" ON public.packing_types
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_insert" ON public.packing_types
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
