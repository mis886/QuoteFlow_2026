-- Stockbook module: lot-wise raw-material stock ledger, migrated from the
-- "Stock Lot Godown Wise" tab of the HIMALAYA STOCK SUMMARY[Confidential]
-- Google Sheet (one row per inward lot, quantity split across the parties/
-- godowns that physically hold stock: Hariom, Wada-HE, HE, Reliable,
-- Swastik, BALAJI, Wada). Managed from src/pages/Stockbook.tsx, added to
-- the sidebar just below Orders. Mirrors the shape of tickets/dispatch_entries
-- (own table, app-level CRUD, company-wide RLS) except the id is a plain
-- uuid — there's no human-facing lot "ticket number", WH Lot No / Fact Lot
-- No are free-text fields the team already uses for that.
--
-- The 98 rows live in the sheet at the time of migration were imported via
-- a one-off INSERT run through the Supabase MCP tool (not captured here per
-- the "no data migrations in this folder" rule below) — this file is schema
-- only.

create table if not exists public.stock_lots (
  id              uuid primary key default gen_random_uuid(),
  wh_lot_no       text,
  fact_lot_no     text,
  lot_type        text,             -- 'W' (own warehouse) or 'TR' (trading) — free text, not constrained
  product_code    text,
  product_name    text not null,
  inward_date     date,
  sample_off      boolean not null default false,
  op_qty          numeric,          -- opening quantity (count of units/drums/bags at inward)
  tanker_unload   text,
  coa_file        text,             -- COA filename, as recorded in the sheet
  qty_hariom      numeric,          -- current unit count held at each party/godown
  qty_wada_he     numeric,
  qty_he          numeric,
  qty_reliable    numeric,
  qty_swastik     numeric,
  qty_balaji      numeric,
  qty_wada        numeric,
  packing         numeric,          -- pack size per unit
  unit            text,             -- Kg / Ltr / NOS / etc.
  packaging_type  text,             -- Plastic / New Plastic / MS / Barrel / HDPE / Carboys / Box / CAN / BAGS / ...
  quantity        numeric,          -- total quantity = sum(party columns) * packing, editable
  make            text,             -- vendor/party code (WADA, PRIVI, GPI, DRT, MOL, IMPORT, ...)
  remark          text,
  created_by      text,
  updated_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.stock_lots is 'Lot-wise raw-material stock ledger by godown/party (Hariom, Wada-HE, HE, Reliable, Swastik, BALAJI, Wada), migrated from the "Stock Lot Godown Wise" tab of the HIMALAYA STOCK SUMMARY Google Sheet. Managed from src/pages/Stockbook.tsx.';

create index if not exists idx_stock_lots_product_name on public.stock_lots(product_name);
create index if not exists idx_stock_lots_wh_lot_no    on public.stock_lots(wh_lot_no);
create index if not exists idx_stock_lots_inward_date  on public.stock_lots(inward_date desc);

alter table public.stock_lots enable row level security;

create policy "Allow company access" on public.stock_lots
  for all to authenticated
  using ((auth.jwt() ->> 'email') like '%@himalayaterpene.com')
  with check ((auth.jwt() ->> 'email') like '%@himalayaterpene.com');

create policy "allow_authenticated_all" on public.stock_lots
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
