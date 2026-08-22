-- Migration: 2026-06-02 — Order line taxes & charges
--
-- Adds per-order adjustments (extra taxes like VAT/TDS/TCS and charges like
-- Freight / Carriage / Packing & Forwarding, plus free-form "Other"). Each is
-- a % of the items sub-total or a fixed value, and either adds to or deducts
-- from the grand total. Stored as JSONB; the app maps it to Order.adjustments.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS adjustments JSONB DEFAULT '[]'::jsonb;
