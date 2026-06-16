-- Migration: 2026-06-01 — Correction tracking on log tables + dispatch invoice improvements

-- ── 1. Correction columns on each append-only log ─────────────────────────
ALTER TABLE public.prod_molding
  ADD COLUMN IF NOT EXISTS corrected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_by   TEXT,
  ADD COLUMN IF NOT EXISTS correction_note TEXT;

ALTER TABLE public.prod_finishing
  ADD COLUMN IF NOT EXISTS corrected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_by   TEXT,
  ADD COLUMN IF NOT EXISTS correction_note TEXT;

ALTER TABLE public.prod_inspection
  ADD COLUMN IF NOT EXISTS corrected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_by   TEXT,
  ADD COLUMN IF NOT EXISTS correction_note TEXT;

ALTER TABLE public.prod_pdi_logs
  ADD COLUMN IF NOT EXISTS corrected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_by   TEXT,
  ADD COLUMN IF NOT EXISTS correction_note TEXT;

-- ── 2. Dispatch invoice — unit, tax type, invoice sequence ────────────────
ALTER TABLE public.prod_dispatches
  ADD COLUMN IF NOT EXISTS unit_id        TEXT DEFAULT 'Unit 1',  -- 'Unit 1' | 'Unit 2'
  ADD COLUMN IF NOT EXISTS tax_type       TEXT DEFAULT 'SGST',    -- 'SGST' | 'IGST'
  ADD COLUMN IF NOT EXISTS invoice_seq    TEXT,                   -- 4-digit, e.g. '0650'
  ADD COLUMN IF NOT EXISTS financial_year TEXT;                   -- e.g. '26-27'

-- Unique constraint: same invoice seq allowed in different units, not same unit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prod_dispatches_unit_invoice_uniq'
  ) THEN
    ALTER TABLE public.prod_dispatches
      ADD CONSTRAINT prod_dispatches_unit_invoice_uniq
      UNIQUE (unit_id, invoice_seq, financial_year);
  END IF;
END $$;
