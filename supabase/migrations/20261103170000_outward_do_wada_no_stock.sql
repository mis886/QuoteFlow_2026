-- 2026-11-03: "Wada" warehouse in the DO / Outward form — NO stock link.
-- Wada's lots live in another system (separate Supabase project); EnqBoss has
-- no Wada stock and must not get any. A Wada DO is still saved, emailed and
-- listed in Stock Movements → Outward, but:
--   * save_outward_do: warehouse 'wada' (case-insensitive) saves / updates the
--     stock_movements rows only — never calls adjust_lot_stock, never reads
--     stock_lots. An edit may not switch a DO between Wada and a stock
--     warehouse (WAREHOUSE_SWITCH: make a new DO instead), so stock can never
--     go out of step. Wada lines also need Product Name and Billing Name (typed
--     by hand — there is no lot to take them from).
--   * delete_outward_movement: a Wada line is deleted with NO stock put back
--     (no unknown-warehouse error).
--   * stock_movements.product_code (new, nullable): the Product Code typed on a
--     Wada line. Only Wada lines write it; stock lines keep taking their code
--     from the catalogue as before (written null).
-- delete_outward_do, undo_step6_with_dos and delete_dispatch_entry_reset are
-- NOT changed: they delete through delete_outward_movement, so they pick up
-- the Wada rule from it.
-- Everything else in both functions is the live definition (pg_get_functiondef,
-- 2026-11-03) unchanged. See docs/dispatch_do_order_line.md → "Wada warehouse".

alter table public.stock_movements add column if not exists product_code text;

CREATE OR REPLACE FUNCTION public.save_outward_do(p_movement_id uuid, p_header jsonb, p_lines jsonb, p_actor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_first stock_movements%rowtype;
  v_is_edit boolean := p_movement_id is not null;
  v_do_number text;
  v_warehouse text := trim(coalesce(p_header ->> 'warehouse', ''));
  v_is_wada boolean := lower(trim(coalesce(p_header ->> 'warehouse', ''))) = 'wada';
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
  -- Wada: no stock column, and none needed (no stock is ever changed).
  if v_col is null and not v_is_wada then
    raise exception 'UNKNOWN_WAREHOUSE: % is not a stock warehouse', coalesce(nullif(v_warehouse, ''), '(none)');
  end if;

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
    -- A Wada DO stays Wada; a stock DO never becomes Wada.
    if (lower(trim(coalesce(v_first.warehouse, ''))) = 'wada') is distinct from v_is_wada then
      raise exception 'WAREHOUSE_SWITCH: DO % cannot be moved between Wada and a stock warehouse. Make a new DO instead.', coalesce(v_first.do_number, v_first.id::text);
    end if;
    v_do_number := v_first.do_number;

    for r in select * from stock_movements
      where type = 'outward' and (id = p_movement_id or (v_do_number is not null and do_number = v_do_number))
      order by do_line_no, created_at, id for update loop
      v_old := v_old || jsonb_build_array(to_jsonb(r));
      v_old_col := case lower(trim(coalesce(r.warehouse, '')))
        when 'hariom' then 'qty_hariom' when 'reliable' then 'qty_reliable'
        when 'swastik' then 'qty_swastik' when 'balaji' then 'qty_balaji' end;
      v_old_barrels := case when trim(coalesce(r.num_articles, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then trim(r.num_articles)::numeric else 0 end;
      -- (A Wada line has no stock column, so nothing is put back for it.)
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

  for v_i in 1 .. v_n loop
    v_line := p_lines -> (v_i - 1);
    v_lot := trim(coalesce(v_line ->> 'wh_lot_no', ''));
    if v_lot = '' then raise exception 'Line %: Lot No missing.', v_i; end if;
    if v_is_wada and trim(coalesce(v_line ->> 'product_name', '')) = '' then
      raise exception 'Line % (Lot %): Product Name missing.', v_i, v_lot;
    end if;
    if v_is_wada and trim(coalesce(v_line ->> 'billing_name', '')) = '' then
      raise exception 'Line % (Lot %): Billing Name missing.', v_i, v_lot;
    end if;
    v_barrels := case when trim(coalesce(v_line ->> 'num_articles', '')) ~ '^[0-9]+(\.[0-9]+)?$'
      then trim(v_line ->> 'num_articles')::numeric end;
    if v_barrels is null or v_barrels <= 0 then raise exception 'Line % (Lot %): No of Barrels missing.', v_i, v_lot; end if;
    v_packing := case when trim(coalesce(v_line ->> 'packing', '')) ~ '^[0-9]+(\.[0-9]+)?$'
      then trim(v_line ->> 'packing')::numeric end;
    if v_packing is null then raise exception 'Line % (Lot %): Packing missing.', v_i, v_lot; end if;
    v_qty := v_barrels * v_packing;

    -- Wada: no stock is taken (its lots are not in stock_lots).
    if not v_is_wada then
      begin
        perform adjust_lot_stock(v_lot, v_col, -v_barrels, -v_qty, p_actor);
      exception when others then
        raise exception 'Line % (Lot %) — %', v_i, v_lot, sqlerrm;
      end;
    end if;

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
        product_code = case when v_is_wada then nullif(trim(coalesce(v_line ->> 'product_code', '')), '') end,
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
        type, warehouse, do_number, do_line_no, wh_lot_no, product_name, product_code, billing_name, inward_date,
        num_articles, packing, weight_type, packaging_type, total_qty, order_line_seq,
        do_date, party_name, other_party, transporter, other_transporter, fulfilment_type, note,
        order_id, dispatch_round, email_sent_at, created_by, updated_at, updated_by
      ) values (
        'outward', v_warehouse, v_do_number, v_i, v_lot, coalesce(v_line ->> 'product_name', ''),
        case when v_is_wada then nullif(trim(coalesce(v_line ->> 'product_code', '')), '') end,
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

  if v_is_edit then
    delete from stock_movements
      where type = 'outward' and (id = p_movement_id or (v_do_number is not null and do_number = v_do_number))
        and not (id = any (v_ids));
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.do_line_no), '[]'::jsonb) into v_new
    from stock_movements m where m.id = any (v_ids);

  return jsonb_build_object('do_number', v_do_number, 'ids', to_jsonb(v_ids), 'before', v_old, 'after', v_new);
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_outward_movement(p_id uuid, p_actor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  m stock_movements%rowtype;
  l stock_lots%rowtype;
  v_col text;
  v_qty numeric;
  v_articles numeric;
  v_new_qty numeric;
  v_unfinish boolean := false;
  v_lot_id uuid;
  v_is_wada boolean;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in ('shishir@himalayaterpene.com', 'mis@himalayaterpene.com') then
    raise exception 'Only MIS / Shishir can delete DOs';
  end if;
  select * into m from stock_movements where id = p_id for update;
  if not found then raise exception 'DO not found (%)', p_id; end if;
  if m.type is distinct from 'outward' then raise exception 'Not an Outward (DO) entry'; end if;

  v_is_wada := lower(trim(coalesce(m.warehouse, ''))) = 'wada';
  v_col := case lower(trim(coalesce(m.warehouse, '')))
    when 'hariom' then 'qty_hariom' when 'reliable' then 'qty_reliable'
    when 'swastik' then 'qty_swastik' when 'balaji' then 'qty_balaji' end;
  if v_col is null and not v_is_wada then
    raise exception 'DO % has warehouse "%", which matches no stock column — stock cannot be put back. Nothing was deleted.', coalesce(m.do_number, m.id::text), coalesce(m.warehouse, '');
  end if;
  v_qty := coalesce(m.total_qty, 0);
  v_articles := case when trim(coalesce(m.num_articles, '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
    then trim(m.num_articles)::numeric else 0 end;

  -- Wada: the row only — no stock is put back, stock_lots is never read.
  if not v_is_wada and trim(coalesce(m.wh_lot_no, '')) <> '' and (v_qty <> 0 or v_articles <> 0) then
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
$function$;
