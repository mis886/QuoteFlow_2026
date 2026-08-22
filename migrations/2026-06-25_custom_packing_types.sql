-- Migration: 2026-06-25 — Custom packing types persistence
--
-- Allows users to type packing type values that don't exist in the hardcoded
-- PACKING_TYPES list. Those custom values are upserted here at save time and
-- fetched back into the combobox options on the next form open.

CREATE TABLE IF NOT EXISTS public.custom_packing_types (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT custom_packing_types_name_key UNIQUE (name)
);

ALTER TABLE public.custom_packing_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "authenticated_read"
  ON public.custom_packing_types FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "authenticated_insert"
  ON public.custom_packing_types FOR INSERT TO authenticated WITH CHECK (true);
