-- 2026-10-26: deleting a dispatch entry also deletes its DO(s) and puts the
-- stock back, all in ONE transaction (nothing half-done).
--
-- delete_outward_movement(id): the ONE place an Outward (DO) delete puts its
-- stock back — used by delete_dispatch_entry_reset below and by Stock
-- Movements → Outward → Delete. Same rules as the Outward save it reverses
-- (NewStockOutward.tsx findOutwardLot): lot matched by wh_lot_no (ilike),
-- first row by serial_no, created_at, id (stock_lots has duplicate
-- wh_lot_no rows — keep this order in sync with findOutwardLot); the
-- warehouse's column (matched case-insensitively) gets Number of Articles
-- back, quantity gets Total Quantity back. A finished lot that is above
-- zero again is un-finished. A warehouse matching no stock column raises an
-- error. No lot found → the save never subtracted, so nothing to add back.
--
-- delete_dispatch_entry_reset(entry_id): for the entry's order + round —
-- deletes that round's DOs (via the function above), every dispatch_steps
-- row of the round, and the entry; a 'Delivered' order goes back to 'Order
-- Confirmed'. Only the order's latest real entry, and only while the next
-- round has no steps (rounds are numbered by entry order). Imported entries
-- (created_by = 'system-import') are not rounds: only the entry is deleted.
-- Both are MIS / Shishir only (same list as ALLOWED_DELETE_EMAILS in utils.ts).

create or replace function public.delete_outward_movement(p_id uuid, p_actor text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  m stock_movements%rowtype;
  l stock_lots%rowtype;
  v_col text;
  v_qty numeric;
  v_articles numeric;
  v_new_qty numeric;
  v_unfinish boolean := false;
  v_lot_id uuid;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in ('shishir@himalayaterpene.com', 'mis@himalayaterpene.com') then
    raise exception 'Only MIS / Shishir can delete DOs';
  end if;
  select * into m from stock_movements where id = p_id for update;
  if not found then raise exception 'DO not found (%)', p_id; end if;
  if m.type is distinct from 'outward' then raise exception 'Not an Outward (DO) entry'; end if;

  v_col := case lower(trim(coalesce(m.warehouse, '')))
    when 'hariom' then 'qty_hariom' when 'reliable' then 'qty_reliable'
    when 'swastik' then 'qty_swastik' when 'balaji' then 'qty_balaji' end;
  if v_col is null then
    raise exception 'DO % has warehouse "%", which matches no stock column — stock cannot be put back. Nothing was deleted.', coalesce(m.do_number, m.id::text), coalesce(m.warehouse, '');
  end if;
  v_qty := coalesce(m.total_qty, 0);
  v_articles := case when trim(coalesce(m.num_articles, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
    then trim(m.num_articles)::numeric else 0 end;

  if trim(coalesce(m.wh_lot_no, '')) <> '' and (v_qty <> 0 or v_articles <> 0) then
    select * into l from stock_lots where wh_lot_no ilike trim(m.wh_lot_no)
      order by serial_no asc nulls last, created_at asc, id asc limit 1 for update;
    if found then
      v_new_qty := coalesce(l.quantity, 0) + v_qty;
      v_unfinish := coalesce(l.is_finished, false) and v_new_qty > 0;
      execute format(
        'update stock_lots set %I = coalesce(%I, 0) + $1, quantity = $2, updated_at = now(), updated_by = $3,
           is_finished = case when $4 then false else is_finished end,
           finished_at = case when $4 then null else finished_at end
         where id = $5', v_col, v_col)
        using v_articles, v_new_qty, p_actor, v_unfinish, l.id;
      v_lot_id := l.id;
    end if;
  end if;

  delete from stock_movements where id = p_id;

  return jsonb_build_object(
    'id', m.id, 'do_number', m.do_number, 'product_name', m.product_name,
    'warehouse', m.warehouse, 'wh_lot_no', m.wh_lot_no, 'lot_id', v_lot_id,
    'articles_added', case when v_lot_id is null then 0 else v_articles end,
    'qty_added', case when v_lot_id is null then 0 else v_qty end,
    'unfinished', v_unfinish, 'email_sent_at', m.email_sent_at,
    'movement', to_jsonb(m));
end;
$$;

create or replace function public.delete_dispatch_entry_reset(p_entry_id text, p_actor text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  e dispatch_entries%rowtype;
  v_round int;
  v_count int;
  v_newer text;
  v_dos jsonb := '[]'::jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_was_delivered boolean := false;
  r record;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in ('shishir@himalayaterpene.com', 'mis@himalayaterpene.com') then
    raise exception 'Only MIS / Shishir can delete dispatch entries';
  end if;
  select * into e from dispatch_entries where id = p_entry_id for update;
  if not found then raise exception 'Dispatch entry % not found', p_entry_id; end if;
  perform 1 from orders where id = e.order_id for update;

  if e.created_by is distinct from 'system-import' then
    select x.rn, x.cnt into v_round, v_count from (
      select id, row_number() over (order by created_at, id) as rn, count(*) over () as cnt
      from dispatch_entries where order_id = e.order_id and created_by is distinct from 'system-import'
    ) x where x.id = e.id;
    if v_round < v_count then
      select string_agg(id, ', ' order by created_at, id) into v_newer from dispatch_entries
        where order_id = e.order_id and created_by is distinct from 'system-import' and (created_at, id) > (e.created_at, e.id);
      raise exception 'This order has a newer dispatch (%). Delete that one first.', v_newer;
    end if;
    if exists (select 1 from dispatch_steps where order_id = e.order_id and round > v_round) then
      raise exception 'The next dispatch of this order (round %) already has steps recorded. Undo those steps first.', v_round + 1;
    end if;

    for r in select id from stock_movements
      where order_id = e.order_id and dispatch_round = v_round and type = 'outward' order by created_at loop
      v_dos := v_dos || jsonb_build_array(delete_outward_movement(r.id, p_actor));
    end loop;

    with d as (delete from dispatch_steps where order_id = e.order_id and round = v_round returning *)
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_steps from d;
  end if;

  delete from dispatch_entries where id = e.id;

  if v_round is not null and exists (select 1 from orders where id = e.order_id and status = 'Delivered') then
    update orders set status = 'Order Confirmed' where id = e.order_id;
    v_was_delivered := true;
  end if;

  return jsonb_build_object(
    'order_id', e.order_id, 'round', v_round,
    'restart_step', case when v_round is null then null when v_round = 1 then 1 else 5 end,
    'deleted_steps', v_steps, 'dos', v_dos, 'was_delivered', v_was_delivered);
end;
$$;

grant execute on function public.delete_outward_movement(uuid, text) to authenticated;
grant execute on function public.delete_dispatch_entry_reset(text, text) to authenticated;
