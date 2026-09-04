-- Stockbook column cleanup (2026-09-04):
-- 1. lot_type ("Type") and tanker_unload ("Tanker Unload") are removed
--    entirely per user request — no longer shown anywhere, data no longer
--    needed.
-- 2. op_qty/unit/packaging_type are retired in favor of the no_of_barrels/
--    mou/packing_type columns already added for the Stock Inward form (see
--    20260903120400_stock_inward_exclusive_columns.sql) — Stockbook and the
--    Stock Inward form now read/write the SAME columns, so data entered via
--    Inward actually shows up in Stockbook. Existing values were backfilled
--    into the new columns (where the new column was still null) via a
--    one-off UPDATE run directly against the live DB immediately before
--    this migration was applied, so no data was lost:
--
--   update public.stock_lots set no_of_barrels = op_qty::text where no_of_barrels is null and op_qty is not null;
--   update public.stock_lots set mou = unit where mou is null and unit is not null;
--   update public.stock_lots set packing_type = packaging_type where packing_type is null and packaging_type is not null;

alter table public.stock_lots
  drop column if exists lot_type,
  drop column if exists tanker_unload,
  drop column if exists op_qty,
  drop column if exists unit,
  drop column if exists packaging_type;

notify pgrst, 'reload schema';
