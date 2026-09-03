-- Stock Movements module: append-only ledger of inward/outward stock entries,
-- replacing the "Stock Inward" Google Form (502 responses there, at time of
-- migration, would otherwise be lost with no audit trail). Only 'inward' rows
-- are written for now — outward comes in a later pass once that form's field
-- list is shared. Managed from src/pages/StockMovements.tsx /
-- src/components/StockInwardModal.tsx.
--
-- Saving an inward entry here ALSO upserts the matching stock_lots row
-- (by wh_lot_no) client-side, so Stockbook's running balances stay correct —
-- see StockInwardModal.tsx's save handler. This table is the immutable
-- transaction log; stock_lots stays the current-balance view.

create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('inward', 'outward')),
  warehouse       text not null,      -- party/godown: 'Hariom' | 'Reliable' | 'Swastik' | 'Balaji'
  wh_lot_no       text not null,
  stock_category  text,
  product_name    text not null,
  lot_date        date,
  lot_qty         numeric,
  packing         numeric,
  weight_type     text,               -- 'KG' | 'LTR'
  packaging_type  text,
  total_qty       numeric,
  make            text,
  remark          text,
  created_by      text,
  created_at      timestamptz not null default now()
);

comment on table public.stock_movements is 'Append-only inward/outward stock movement ledger, replacing the "Stock Inward" Google Form. See src/pages/StockMovements.tsx.';

create index if not exists idx_stock_movements_wh_lot_no on public.stock_movements(wh_lot_no);
create index if not exists idx_stock_movements_type       on public.stock_movements(type);
create index if not exists idx_stock_movements_created_at on public.stock_movements(created_at desc);

alter table public.stock_movements enable row level security;

create policy "Allow company access" on public.stock_movements
  for all to authenticated
  using ((auth.jwt() ->> 'email') like '%@himalayaterpene.com')
  with check ((auth.jwt() ->> 'email') like '%@himalayaterpene.com');

create policy "allow_authenticated_all" on public.stock_movements
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
