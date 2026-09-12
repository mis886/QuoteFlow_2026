-- Finished Lots (2026-09-12): Stockbook's "Finished Lot" button marks a
-- fully depleted stock_lots row (quantity = 0) as finished so it drops out
-- of the active Stockbook ledger and appears instead in Stock Movements'
-- "Finished Lots" tab (src/components/FinishedLotsTable.tsx). See
-- src/pages/Stockbook.tsx's handleFinish() and that component's load().

alter table public.stock_lots
  add column if not exists is_finished boolean not null default false,
  add column if not exists finished_at timestamptz;

notify pgrst, 'reload schema';
