-- 2026-11-03 (user decision): one DO, many products.
--
-- One DO = ONE warehouse + ONE DO number + ONE OR MORE product lines. It is
-- still stored as ONE stock_movements row PER PRODUCT LINE, so Stock Summary,
-- the Stock Book (StockRegister.tsx) and adjust_lot_stock keep working per
-- lot. The header fields (warehouse, do_number, do_date, party, transporter,
-- fulfilment, note, order_id, dispatch_round, email_sent_at, created_by) are
-- written the same on every line of a DO.
--
-- 1. Backup: backup.stock_movements_20261103 (every row, before any change).
-- 2. do_line_no int not null default 1 — line 1, 2, … of the DO. Every existing
--    row stays line 1, so old DOs keep working unchanged.
--    order_line_seq int (nullable) — which order line (orders.items[].seq)
--    the line is for. Backfilled for the DOs already linked to an order, by
--    billing_name = the order line's product name.
-- 3. unique (do_number) → unique (do_number, do_line_no). The DO-number retry
--    on 23505 (NewStockOutward.tsx) still works: two new DOs with the same
--    number collide on line 1.
-- 4. save_outward_do(): ONE transaction that writes every line of a DO and
--    changes the stock for each line through adjust_lot_stock. On edit it
--    first puts back every OLD line's stock, then takes every NEW line's
--    stock. Any refusal (not enough stock, unknown lot, …) raises, so NOTHING
--    is saved and no stock changes; the error names the line and lot.
-- 5. delete_outward_do(): deletes EVERY line of a DO (same do_number) and puts
--    every line's stock back (delete_outward_movement per line), in one
--    transaction. Stock Movements → Outward → Delete uses it.
--    delete_dispatch_entry_reset now uses it too, so a DO's lines are always
--    deleted together.

begin;

create schema if not exists backup;
create table backup.stock_movements_20261103 as select * from public.stock_movements;

alter table public.stock_movements add column if not exists do_line_no integer not null default 1;
alter table public.stock_movements add column if not exists order_line_seq integer;

alter table public.stock_movements drop constraint if exists stock_movements_do_number_unique;
alter table public.stock_movements add constraint stock_movements_do_number_line_unique unique (do_number, do_line_no);

-- Existing linked DOs: the order line whose product name = the DO's billing name.
update public.stock_movements m set order_line_seq = (
  select (i ->> 'seq')::int
  from public.orders o,
    jsonb_array_elements(case when jsonb_typeof(o.dispatch_snapshot -> 'items') = 'array' then o.dispatch_snapshot -> 'items' else o.items end) i
  where o.id = m.order_id and lower(trim(i ->> 'desc')) = lower(trim(m.billing_name))
  order by (i ->> 'seq')::int limit 1)
where m.type = 'outward' and m.order_id is not null and m.order_line_seq is null;

-- ── save_outward_do ──────────────────────────────────────────────────────
-- p_movement_id: null = new DO; else the id of any saved line of the DO being
--   edited (the DO = every outward row with that row's do_number).
-- p_header: warehouse, do_number, do_date, party_name, other_party,
--   transporter, other_transporter, fulfilment_type, note, order_id,
--   dispatch_round (order_id / dispatch_round are used for a new DO only — an
--   edit keeps the saved link, email_sent_at and created_by).
-- p_lines: array of { wh_lot_no, product_name, billing_name, inward_date,
--   num_articles, packing, weight_type, packaging_type, order_line_seq }.
--   total_qty is always num_articles × packing (worked out here).
-- Returns { do_number, ids (line order), before (old rows), after (new rows) }.
create or replace function public.save_outward_do(
  p_movement_id uuid,
  p_header jsonb,
  p_lines jsonb,
  p_actor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_first stock_movements%rowtype;
  v_is_edit boolean := p_movement_id is not null;
  v_do_number text;
  v_warehouse text := trim(coalesce(p_header ->> 'warehouse', ''));
  v_col text;
  v_old jsonb := '[]'::jsonb;
  v_new jsonb := '[]'::jsonb;
  v_ids uuid[] := '{}';
  v_n int;
  v_i int;
  v_line jsonb;
  v_lot text;
  v_barrels numeric;
  v_packing numeric;
  v_qty numeric;
  v_id uuid;
  v_old_col text;
  v_old_barrels numeric;
  r stock_movements%rowtype;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A DO needs at least one product line.';
  end if;
  v_n := jsonb_array_length(p_lines);

  v_col := case lower(v_warehouse)
    when 'hariom' then 'qty_hariom' when 'reliable' then 'qty_reliable'
    when 'swastik' then 'qty_swastik' when 'balaji' then 'qty_balaji' end;
  if v_col is null then
    raise exception 'UNKNOWN_WAREHOUSE: % is not a stock warehouse', coalesce(nullif(v_warehouse, ''), '(none)');
  end if;

  -- Same lot / same order line twice in one DO is refused.
  if (select count(distinct lower(trim(l ->> 'wh_lot_no'))) from jsonb_array_elements(p_lines) l) < v_n then
    raise exception 'The same lot is on two lines of this DO.';
  end if;
  if (select count(*) - count(distinct (l ->> 'order_line_seq')) from jsonb_array_elements(p_lines) l
      where nullif(l ->> 'order_line_seq', '') is not null) > 0 then
    raise exception 'The same order line is on two lines of this DO.';
  end if;

  if v_is_edit then
    select * into v_first from stock_movements where id = p_movement_id for update;
    if not found then raise exception 'DO not found (%)', p_movement_id; end if;
    if v_first.type is distinct from 'outward' then raise exception 'Not an Outward (DO) entry'; end if;
    v_do_number := v_first.do_number;   -- an existing DO keeps its number

    -- 1. Put back every OLD line's stock (rows locked). A line whose
    --    warehouse matches no stock column, or with no lot, never took stock;
    --    one whose lot no longer exists has nothing to put back.
    for r in select * from stock_movements
      where type = 'outward' and (id = p_movement_id or (v_do_number is not null and do_number = v_do_number))
      order by do_line_no, created_at, id for update loop
      v_old := v_old || jsonb_build_array(to_jsonb(r));
      v_old_col := case lower(trim(coalesce(r.warehouse, '')))
        when 'hariom' then 'qty_hariom' when 'reliable' then 'qty_reliable'
        when 'swastik' then 'qty_swastik' when 'balaji' then 'qty_balaji' end;
      v_old_barrels := case when trim(coalesce(r.num_articles, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then trim(r.num_articles)::numeric else 0 end;
      if v_old_col is not null and trim(coalesce(r.wh_lot_no, '')) <> ''
         and (v_old_barrels <> 0 or coalesce(r.total_qty, 0) <> 0) then
        begin
          perform adjust_lot_stock(r.wh_lot_no, v_old_col, v_old_barrels, coalesce(r.total_qty, 0), p_actor);
        exception when others then
          if sqlerrm not like 'LOT_NOT_FOUND%' then
            raise exception 'Line % (Lot %) — %', r.do_line_no, r.wh_lot_no, sqlerrm;
          end if;
        end;
      end if;
    end loop;
  else
    v_do_number := nullif(trim(coalesce(p_header ->> 'do_number', '')), '');
    if v_do_number is null then raise exception 'DO Number missing.'; end if;
  end if;

  -- 2. Write every NEW line and take its stock.
  for v_i in 1 .. v_n loop
    v_line := p_lines -> (v_i - 1);
    v_lot := trim(coalesce(v_line ->> 'wh_lot_no', ''));
    if v_lot = '' then raise exception 'Line %: Lot No missing.', v_i; end if;
    v_barrels := case when trim(coalesce(v_line ->> 'num_articles', '')) ~ '^[0-9]+(\.[0-9]+)?$'
      then trim(v_line ->> 'num_articles')::numeric end;
    if v_barrels is null or v_barrels <= 0 then raise exception 'Line % (Lot %): No of Barrels missing.', v_i, v_lot; end if;
    v_packing := case when trim(coalesce(v_line ->> 'packing', '')) ~ '^[0-9]+(\.[0-9]+)?$'
      then trim(v_line ->> 'packing')::numeric end;
    if v_packing is null then raise exception 'Line % (Lot %): Packing missing.', v_i, v_lot; end if;
    v_qty := v_barrels * v_packing;

    begin
      perform adjust_lot_stock(v_lot, v_col, -v_barrels, -v_qty, p_actor);
    exception when others then
      raise exception 'Line % (Lot %) — %', v_i, v_lot, sqlerrm;
    end;

    v_id := null;
    if v_is_edit then
      select id into v_id from stock_movements
        where type = 'outward' and (id = p_movement_id or (v_do_number is not null and do_number = v_do_number))
          and do_line_no = v_i
        order by created_at, id limit 1;
    end if;

    if v_id is not null then
      update stock_movements set
        warehouse = v_warehouse,
        wh_lot_no = v_lot,
        product_name = coalesce(v_line ->> 'product_name', ''),
        billing_name = nullif(trim(coalesce(v_line ->> 'billing_name', '')), ''),
        inward_date = nullif(v_line ->> 'inward_date', '')::date,
        num_articles = trim(v_line ->> 'num_articles'),
        packing = v_packing,
        weight_type = nullif(v_line ->> 'weight_type', ''),
        packaging_type = nullif(v_line ->> 'packaging_type', ''),
        total_qty = v_qty,
        order_line_seq = nullif(v_line ->> 'order_line_seq', '')::int,
        do_date = nullif(p_header ->> 'do_date', '')::date,
        party_name = nullif(p_header ->> 'party_name', ''),
        other_party = nullif(p_header ->> 'other_party', ''),
        transporter = nullif(p_header ->> 'transporter', ''),
        other_transporter = nullif(p_header ->> 'other_transporter', ''),
        fulfilment_type = nullif(p_header ->> 'fulfilment_type', ''),
        note = nullif(p_header ->> 'note', ''),
        updated_at = now(),
        updated_by = p_actor
      where id = v_id;
    else
      insert into stock_movements (
        type, warehouse, do_number, do_line_no, wh_lot_no, product_name, billing_name, inward_date,
        num_articles, packing, weight_type, packaging_type, total_qty, order_line_seq,
        do_date, party_name, other_party, transporter, other_transporter, fulfilment_type, note,
        order_id, dispatch_round, email_sent_at, created_by, updated_at, updated_by
      ) values (
        'outward', v_warehouse, v_do_number, v_i, v_lot, coalesce(v_line ->> 'product_name', ''),
        nullif(trim(coalesce(v_line ->> 'billing_name', '')), ''), nullif(v_line ->> 'inward_date', '')::date,
        trim(v_line ->> 'num_articles'), v_packing, nullif(v_line ->> 'weight_type', ''), nullif(v_line ->> 'packaging_type', ''),
        v_qty, nullif(v_line ->> 'order_line_seq', '')::int,
        nullif(p_header ->> 'do_date', '')::date, nullif(p_header ->> 'party_name', ''), nullif(p_header ->> 'other_party', ''),
        nullif(p_header ->> 'transporter', ''), nullif(p_header ->> 'other_transporter', ''),
        nullif(p_header ->> 'fulfilment_type', ''), nullif(p_header ->> 'note', ''),
        case when v_is_edit then v_first.order_id else nullif(p_header ->> 'order_id', '') end,
        case when v_is_edit then v_first.dispatch_round else nullif(p_header ->> 'dispatch_round', '')::int end,
        case when v_is_edit then v_first.email_sent_at end,
        case when v_is_edit then v_first.created_by else p_actor end,
        case when v_is_edit then now() end,
        case when v_is_edit then p_actor end
      ) returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  -- 3. Edit: lines that were removed from the DO (their stock is already back).
  if v_is_edit then
    delete from stock_movements
      where type = 'outward' and (id = p_movement_id or (v_do_number is not null and do_number = v_do_number))
        and not (id = any (v_ids));
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.do_line_no), '[]'::jsonb) into v_new
    from stock_movements m where m.id = any (v_ids);

  return jsonb_build_object('do_number', v_do_number, 'ids', to_jsonb(v_ids), 'before', v_old, 'after', v_new);
end;
$$;

-- ── delete_outward_do ────────────────────────────────────────────────────
-- p_id: any line of the DO. Deletes every outward row with that row's
-- do_number (just that row when it has none), putting each line's stock back
-- through delete_outward_movement (MIS / Shishir only, checked there).
-- Returns the array of delete_outward_movement results, one per line.
create or replace function public.delete_outward_do(p_id uuid, p_actor text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  m stock_movements%rowtype;
  v_out jsonb := '[]'::jsonb;
  r record;
begin
  select * into m from stock_movements where id = p_id;
  if not found then raise exception 'DO not found (%)', p_id; end if;
  for r in select id from stock_movements
    where type = 'outward' and (id = p_id or (m.do_number is not null and do_number = m.do_number))
    order by do_line_no, created_at, id loop
    v_out := v_out || jsonb_build_array(delete_outward_movement(r.id, p_actor));
  end loop;
  return v_out;
end;
$$;

-- ── delete_dispatch_entry_reset ──────────────────────────────────────────
-- Same as 20261026120000 except the round's DOs are deleted with
-- delete_outward_do, so every line of each DO goes (and its stock comes back)
-- even if a line's order link were ever missing.
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
      where order_id = e.order_id and dispatch_round = v_round and type = 'outward' order by created_at, do_line_no loop
      -- An earlier line of the same DO already deleted this one.
      if exists (select 1 from stock_movements where id = r.id) then
        v_dos := v_dos || delete_outward_do(r.id, p_actor);
      end if;
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

grant execute on function public.save_outward_do(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.delete_outward_do(uuid, text) to authenticated;
grant execute on function public.delete_dispatch_entry_reset(text, text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- After running — checks (read-only):
--   select count(*) from backup.stock_movements_20261103;            -- = rows before
--   select do_number, do_line_no, order_line_seq from public.stock_movements where type = 'outward';
--   select conname from pg_constraint where conrelid = 'public.stock_movements'::regclass;
