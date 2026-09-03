-- Adds the columns needed for Outward entries to the existing stock_movements
-- ledger (created for Inward — see 20260903060000_create_stock_movements_table.sql).
-- Purely additive: no existing column is renamed or removed. Several fields
-- the Outward form needs (lot_date, weight_type, packaging_type, packing,
-- total_qty) already exist from the Inward side and are reused as-is —
-- see src/pages/NewStockOutward.tsx.

alter table public.stock_movements
  add column if not exists do_number        text,
  add column if not exists num_articles     text,
  add column if not exists party_name       text,
  add column if not exists other_party      text,
  add column if not exists transporter      text,
  add column if not exists other_transporter text,
  add column if not exists note             text;

notify pgrst, 'reload schema';
