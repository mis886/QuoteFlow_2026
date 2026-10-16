-- 2026-10-16: a DO (Outward entry) issued from the Dispatch Board's Step 6 is
-- linked to its order + dispatch round, so the Board can show "DO saved,
-- email pending" and Step 6 completes when the DO is emailed (not on save).
-- Already applied in Supabase — this file is for the record.
alter table public.stock_movements add column if not exists order_id text;
alter table public.stock_movements add column if not exists dispatch_round integer;
create index if not exists stock_movements_order_id_idx on public.stock_movements(order_id);
