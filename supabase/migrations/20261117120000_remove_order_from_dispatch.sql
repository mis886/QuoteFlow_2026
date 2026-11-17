-- 2026-11-17: Dispatch board "Delete" on an ORDER card now also deletes the
-- order's DO(s) and puts their stock back (before, only the steps were
-- deleted and the DO stayed, so its barrels stayed taken out of stock).
-- One transaction: if anything fails, nothing changes.
--   * MIS / Shishir only.
--   * Refused while the order has any dispatch entry (delete those first —
--     delete_dispatch_entry_reset restores their DOs).
--   * Deletes every Outward DO linked to the order (delete_outward_do →
--     barrels + Total Quantity back on the lot, finished lot un-finished).
--   * Deletes all dispatch_steps of the order.
--   * Clears sent_to_dispatch_at + dispatch_snapshot so the Orders
--     "Order Pending for Dispatch" button is clickable again. SO No. is kept.
create or replace function public.remove_order_from_dispatch(p_order_id text, p_actor text default null)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_n int;
  v_dos jsonb := '[]'::jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_before timestamptz;
  r record;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in ('shishir@himalayaterpene.com', 'mis@himalayaterpene.com') then
    raise exception 'Only MIS / Shishir can remove orders from the Dispatch board';
  end if;
  select sent_to_dispatch_at into v_before from orders where id = p_order_id for update;
  if not found then raise exception 'Order % not found', p_order_id; end if;

  select count(*) into v_n from dispatch_entries where order_id = p_order_id;
  if v_n > 0 then
    raise exception 'This order has % dispatch entr%. Delete those entries first.', v_n, case when v_n = 1 then 'y' else 'ies' end;
  end if;

  for r in select id from stock_movements
    where order_id = p_order_id and type = 'outward' order by created_at, do_line_no loop
    if exists (select 1 from stock_movements where id = r.id) then
      v_dos := v_dos || delete_outward_do(r.id, p_actor);
    end if;
  end loop;

  with d as (delete from dispatch_steps where order_id = p_order_id returning *)
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_steps from d;

  update orders set sent_to_dispatch_at = null, dispatch_snapshot = null where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'sent_to_dispatch_at', v_before,
    'deleted_steps', v_steps, 'dos', v_dos);
end;
$function$;
