-- Stockbook column cleanup (2026-09-11): removes qty_wada_he, qty_he, and
-- qty_wada — only 4 real warehouses are in active use (Hariom, Reliable,
-- Swastik, Balaji, matching StockMovementWarehouse in src/lib/types.ts and
-- the Inward/Outward forms' own 4-option dropdown), so these 3 columns
-- (Wada-HE, HE, Wada) are removed entirely.
--
-- Safety check run against the live table before this migration: qty_he was
-- null/zero on every row (safe, no data). qty_wada_he had a real value on 1
-- row; qty_wada had a real value on 34 rows — this was NOT dead data, it was
-- current barrel counts for lots physically sitting at a location called
-- "Wada" that just isn't one of the 4 dropdown warehouses. Rather than
-- silently drop it, a one-off UPDATE was run directly against the live DB
-- immediately before this migration, appending a note to each affected
-- row's remark recording what was removed (existing remarks preserved,
-- appended on a new line) — same convention as the backfill note in
-- 20260904130000_stockbook_drop_type_tanker_merge_columns.sql:
--
--   with parts as (
--     select id,
--       array_remove(array[
--         case when qty_wada_he is not null and qty_wada_he != 0 then 'Wada-HE: ' || qty_wada_he::text end,
--         case when qty_he is not null and qty_he != 0 then 'HE: ' || qty_he::text end,
--         case when qty_wada is not null and qty_wada != 0 then 'Wada: ' || qty_wada::text end
--       ], null) as parts
--     from stock_lots
--     where (qty_wada_he is not null and qty_wada_he != 0)
--        or (qty_he is not null and qty_he != 0)
--        or (qty_wada is not null and qty_wada != 0)
--   )
--   update stock_lots sl
--   set remark = case
--     when sl.remark is not null and sl.remark != '' then sl.remark || E'\n' || '[legacy stock, moved off system 2026-09-11] ' || array_to_string(p.parts, ', ')
--     else '[legacy stock, moved off system 2026-09-11] ' || array_to_string(p.parts, ', ')
--   end
--   from parts p
--   where sl.id = p.id;

alter table public.stock_lots
  drop column if exists qty_wada_he,
  drop column if exists qty_he,
  drop column if exists qty_wada;

notify pgrst, 'reload schema';
