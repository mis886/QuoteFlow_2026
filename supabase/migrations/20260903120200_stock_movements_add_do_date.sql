-- The Outward (Delivery Order Sale) form has a "DO Date" field distinct
-- from Lot Date, which isn't covered by any existing column. Added here
-- alongside the other outward-only columns (do_number, party_name, etc.
-- from 20260903120000_stock_movements_add_outward_columns.sql).

alter table public.stock_movements add column if not exists do_date date;

notify pgrst, 'reload schema';
