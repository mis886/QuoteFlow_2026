-- 2026-11-03 (user decision): the SAME order line may be on several rows of
-- one DO, as long as each row has a DIFFERENT lot — in the warehouse one
-- product is often filled from 2+ lots (real case: ORD-2026-848 "Anthamber
-- Tops" × 4 = lot 260902 × 3 + another lot × 1 on DO B-0813).
-- Removes ONLY save_outward_do's 'The same order line is on two lines of this
-- DO.' check. 'The same lot is on two lines of this DO.' stays. The per-line
-- barrels check (sum of the line's rows ≤ the line's remaining) is in the form
-- (NewStockOutward.tsx), as the order checks always were.
-- Everything else is the live definition (pg_get_functiondef, 2026-11-03,
-- after outward_do_wada_no_stock) unchanged. See docs/dispatch_do_order_line.md.

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
