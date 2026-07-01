-- =============================================================================
-- Finalize packing_types: replace all rows with 26 canonical names
-- and add the missing RLS allow policy so authenticated users can read the table.
--
-- WHY: The table had 38 rows with duplicates from inconsistent casing
-- (e.g. "Hdpe Unwashed" and "Hdpe UNWASHED" as separate rows). The creatable
-- dropdown in the frontend was inserting new rows whenever a user typed a
-- value not already in the list, blocked only by a 403 (missing RLS policy).
-- This migration establishes the authoritative list and fixes both problems.
-- =============================================================================

-- Step 1: Clear all existing rows (no FK references — packing type is stored
-- as a plain text field inside items jsonb, not a foreign key).
TRUNCATE public.packing_types RESTART IDENTITY;

-- Step 2: Insert the 26 canonical packing type names.
INSERT INTO public.packing_types (name) VALUES
  ('Bag'),
  ('Bags'),
  ('Can'),
  ('Carboy'),
  ('Empty Barrels'),
  ('GI Patra'),
  ('HDPE Barrel'),
  ('Hdpe Unwashed'),
  ('Hdpe Washed'),
  ('Ibc Box Used'),
  ('Ms Barrels For Pitch'),
  ('MS Patra'),
  ('New Cans Terpineol'),
  ('New Gi(Silver) (Lining) 22 Kg'),
  ('New Gi(Silver) (Lining) Old Un'),
  ('New Gi(Silver) (Plane) 22 Kg'),
  ('New Ms Black Epoxy'),
  ('New Ms Black Epoxy Old Un'),
  ('New Ms Black Epoxy Rejected'),
  ('New Ms Black Epoxy Used'),
  ('New Pvc (Plane) 8.2 Kg'),
  ('New Pvc (Plane) 8.2kg Sample'),
  ('New Pvc (Plane) 9.5 Kg'),
  ('New Pvc (Printed)'),
  ('Used Barrels Of Thermic Ms'),
  ('Used New Pvc (Plane) Terpi');

-- Step 3: Add the missing RLS policy (RLS was enabled but no policy existed,
-- so all authenticated reads were blocked and the frontend fell back to
-- the hardcoded list in products.ts instead of the DB).
CREATE POLICY "allow_authenticated_all" ON public.packing_types
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
