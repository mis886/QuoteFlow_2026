-- Links a leftover order (created by a partial dispatch) back to the order
-- it was split off from, for traceability. Nullable — most orders are not
-- splits. ON DELETE SET NULL so deleting the original order never blocks or
-- cascades into deleting the leftover order it produced.
alter table public.orders
  add column if not exists split_from_order_id text references public.orders(id) on delete set null;

notify pgrst, 'reload schema';
