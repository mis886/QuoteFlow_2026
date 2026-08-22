-- Migration: 2026-06-22 — Add incoterms and currency to orders table
--
-- The Order form now has:
--   • Incoterms dropdown (same options as Quotation) replacing the old
--     "Delivery Terms" free-text select. Maps to the `inco` column.
--   • Currency field (INR default, USD for exports). When USD, GST and
--     insurance are hidden from the form and totals. Maps to `curr`.
--
-- `inco` was already written by mapOrderToDB but the column didn't exist
-- (PostgREST silently dropped it). Adding it now makes it persist.
-- `curr` is new.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS inco TEXT,
  ADD COLUMN IF NOT EXISTS curr TEXT DEFAULT 'INR';
