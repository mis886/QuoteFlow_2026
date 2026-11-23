-- 2026-11-23: ONE-ORDER DATA FIX — ORD-2026-926 / SO-2026-843 (Grasse International).
-- The order was sent to Dispatch on 2026-11-17 (1 line: Gamma Terpinene 3 x 175,
-- value 387188). On 2026-11-21 it was edited in Orders (2 x 175 HDPE + 4 x 25
-- CARBOY, value 331875). Dispatch reads orders.dispatch_snapshot (frozen at send),
-- so it still showed the old order. The DO (Step 6) is not done yet.
--
-- No code / rule change. Only this order's dispatch_snapshot is refreshed.
-- The snapshot is what the ORDER PENDING FOR DISPATCH button saves
-- (mapOrderFromDB of the orders row). Compared with the live row, only
-- `items` and `value` differ, so only those two keys are replaced. Every
-- other snapshot key and every other orders column (status, so_number,
-- sent_to_dispatch_at, dispatch steps, updated_at) stays as it is.
--
-- Safety: stops (and changes nothing) if the order has a dispatch entry or a
-- DO in stock_movements, or if the snapshot is no longer the old one
-- (value 387188), so running it twice is harmless.

do $$
declare
  v_snap jsonb;
  v_items jsonb;
  v_value numeric;
  v_n int;
begin
  select dispatch_snapshot::jsonb, items::jsonb, value
    into v_snap, v_items, v_value
    from public.orders where id = 'ORD-2026-926' for update;
  if not found then raise exception 'ORD-2026-926 not found'; end if;

  select count(*) into v_n from public.dispatch_entries where order_id = 'ORD-2026-926';
  if v_n > 0 then raise exception 'ORD-2026-926 has % dispatch entr(y/ies) — stopping, nothing changed', v_n; end if;
  select count(*) into v_n from public.stock_movements where order_id = 'ORD-2026-926';
  if v_n > 0 then raise exception 'ORD-2026-926 has % DO / stock row(s) — stopping, nothing changed', v_n; end if;

  if v_snap is null or (v_snap ->> 'value')::numeric <> 387188 then
    raise notice 'ORD-2026-926 snapshot already refreshed (or missing) — nothing to do';
    return;
  end if;

  -- 1. Backup of the whole orders row (before the change).
  create table if not exists backup.so2026_843_orders_20261123 as
    select * from public.orders where false;
  insert into backup.so2026_843_orders_20261123 select * from public.orders where id = 'ORD-2026-926';

  -- 2. Refresh the snapshot: live items + value, everything else unchanged.
  update public.orders
     set dispatch_snapshot = v_snap || jsonb_build_object('items', v_items, 'value', v_value)
   where id = 'ORD-2026-926';

  -- 3. History Log row.
  insert into public.activity_log (actor_email, actor_name, module, record_id, record_label, action, changes)
  values (null, 'Data fix (migration)', 'orders', 'ORD-2026-926',
          'Dispatch snapshot refreshed from edited order (ORD-2026-926)', 'update',
          jsonb_build_object(
            'dispatchSnapshot.items', jsonb_build_object('old', v_snap -> 'items', 'new', v_items),
            'dispatchSnapshot.value', jsonb_build_object('old', v_snap -> 'value', 'new', to_jsonb(v_value))));
end $$;
