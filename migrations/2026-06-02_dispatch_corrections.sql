-- Migration: 2026-06-02 — Dispatch corrections & reversal
--
-- Until now a dispatch could only have its status changed; there was no way to
-- fix a wrong qty / courier / invoice or to reverse a mistaken dispatch.
-- These audit columns mirror the correction pattern used on molding/finishing/
-- inspection logs (corrected_at / corrected_by / correction_note), plus a
-- reversal stamp. A reversed dispatch's items stop counting as dispatched, so
-- the quantity flows back into the ready / finished-goods pool.

ALTER TABLE public.prod_dispatches
  ADD COLUMN IF NOT EXISTS corrected_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_by     TEXT,
  ADD COLUMN IF NOT EXISTS correction_note  TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by      TEXT,
  ADD COLUMN IF NOT EXISTS reversal_note    TEXT;

ALTER TABLE public.prod_dispatch_items
  ADD COLUMN IF NOT EXISTS corrected_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correction_note  TEXT;

-- 'Reversed' is a new allowed status value (status is a free TEXT column, so no
-- enum change is required).
