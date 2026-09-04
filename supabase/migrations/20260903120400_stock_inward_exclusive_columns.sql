-- Inward-exclusive fields for src/pages/NewStockInward.tsx, split off from
-- the columns Outward (NewStockOutward.tsx) and the Stockbook edit modal
-- (StockLotModal.tsx) already write to (packing, packaging_type,
-- weight_type/unit) — those two keep using the old columns unchanged.
-- After this, the only columns still shared between Inward and Outward on
-- stock_lots are the party quantity columns (qty_hariom, qty_reliable,
-- qty_swastik, qty_balaji, qty_wada) and quantity/total_qty, matched via
-- wh_lot_no — the intentional reconciliation mechanism, untouched here.
--
-- product_code already exists on stock_lots (original schema; edited via
-- StockLotModal.tsx, displayed/searched in Stockbook.tsx) and is reused
-- as-is for Inward's new "Product Code" field rather than adding a
-- duplicate column — same semantic field, populated at lot creation and
-- editable afterwards, exactly like product_name/wh_lot_no/fact_lot_no
-- already work. No migration needed for it.

alter table public.stock_lots
  add column if not exists no_of_barrels  text,
  add column if not exists packing_type   text,
  add column if not exists mou            text,
  add column if not exists packing_detail text;

alter table public.stock_movements
  add column if not exists no_of_barrels  text,
  add column if not exists packing_type   text,
  add column if not exists mou            text,
  add column if not exists packing_detail text;

notify pgrst, 'reload schema';
