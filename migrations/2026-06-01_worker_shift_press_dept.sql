-- Migration: 2026-06-01 — Press operators as a 3rd department + shift tracking
-- Adds `shift` (day|night) and `press_id` columns to prod_workers.
-- Also allows department = 'press' in addition to finishing/inspection.

ALTER TABLE public.prod_workers
  ADD COLUMN IF NOT EXISTS shift    TEXT DEFAULT 'day',   -- 'day' | 'night'
  ADD COLUMN IF NOT EXISTS press_id TEXT;                 -- which press they operate (nullable)

-- Seed sample press operators (idempotent)
INSERT INTO public.prod_workers (id, name, role, department, present, shift, press_id) VALUES
  ('P01', 'Kiran J.',   'Press Operator',     'press', TRUE,  'day',   'P1'),
  ('P02', 'Nilesh B.',  'Press Operator',     'press', TRUE,  'day',   'P2'),
  ('P03', 'Bharat S.',  'Sr. Press Operator', 'press', TRUE,  'day',   'P3'),
  ('P04', 'Prakash N.', 'Press Operator',     'press', FALSE, 'day',   'P4'),
  ('P05', 'Santosh K.', 'Press Operator',     'press', FALSE, 'night', 'P1'),
  ('P06', 'Deepak R.',  'Press Operator',     'press', FALSE, 'night', 'P2')
ON CONFLICT (id) DO NOTHING;
