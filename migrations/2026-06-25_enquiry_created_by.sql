-- Migration: 2026-06-25 — Add created_by to enquiries table
--
-- Stores the email address of the logged-in user who created each enquiry.
-- Nullable so that existing records (which don't have a value) remain valid.
--
-- Also backfills the orders.insurance column added in the previous session
-- (2026-06-25) in case that migration has not yet been applied.

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS insurance NUMERIC DEFAULT 0;
