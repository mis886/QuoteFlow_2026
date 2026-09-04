-- Adds the "Factory Lot Number" field to the Inward form
-- (src/pages/NewStockInward.tsx). Mirrors stock_lots.fact_lot_no — purely
-- additive, no existing column/row is touched.

alter table public.stock_movements add column if not exists fact_lot_no text;

notify pgrst, 'reload schema';
