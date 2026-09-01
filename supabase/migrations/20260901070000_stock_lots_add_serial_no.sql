-- Stockbook: add a running S.No. column, mirroring column A ("1, 2, 3...")
-- in the original "Stock Lot Godown Wise" sheet. Added as SERIAL so Postgres
-- backfills the 98 existing rows in physical/insertion order — which, since
-- this table has only ever been bulk-inserted once in the sheet's exact row
-- order and never updated/deleted from since, reproduces the sheet's
-- original 1-98 numbering exactly (verified against the source sheet after
-- running). New lots added from src/pages/Stockbook.tsx going forward pick
-- up the next value automatically via the column's sequence default.

ALTER TABLE public.stock_lots ADD COLUMN serial_no SERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_lots_serial_no ON public.stock_lots(serial_no);

COMMENT ON COLUMN public.stock_lots.serial_no IS 'Running S.No. — for the 98 rows migrated from the sheet, matches that sheet''s original row order (1-98). Auto-increments for lots added afterwards in EnqBoss.';

NOTIFY pgrst, 'reload schema';
