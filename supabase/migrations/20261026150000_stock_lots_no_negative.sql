-- 2026-10-26: a DO can never take more stock than a warehouse has.
--
-- 1. stock_lots' warehouse columns (Hariom / Reliable / Swastik / BALAJI) and
--    quantity can never go below 0. Checked before adding: no row was negative.
--
-- 2. adjust_lot_stock(): THE way an Outward (DO) save / edit changes stock.
--    Picks the same row as findOutwardLot() in NewStockOutward.tsx and
--    delete_outward_movement (wh_lot_no ilike, ORDER BY serial_no, created_at,
--    id — stock_lots has duplicate wh_lot_no rows), locks it (FOR UPDATE) so
--    two saves at once can't both pass, and refuses to go below 0 with
--    'NOT_ENOUGH_STOCK: …'. A positive delta puts stock back. Only the 4
--    warehouse columns are accepted (fixed list, no dynamic SQL).
--    'LOT_NOT_FOUND: …' when no lot matches. SECURITY INVOKER — RLS applies.
--
-- delete_outward_movement (20261026120000) only ever adds stock back, so it
-- keeps working with these constraints, and picks the row the same way.

alter table public.stock_lots
  add constraint stock_lots_qty_hariom_nonneg   check (qty_hariom   is null or qty_hariom   >= 0),
  add constraint stock_lots_qty_reliable_nonneg check (qty_reliable is null or qty_reliable >= 0),
  add constraint stock_lots_qty_swastik_nonneg  check (qty_swastik  is null or qty_swastik  >= 0),
  add constraint stock_lots_qty_balaji_nonneg   check (qty_balaji   is null or qty_balaji   >= 0),
  add constraint stock_lots_quantity_nonneg     check (quantity     is null or quantity     >= 0);

create or replace function public.adjust_lot_stock(
  p_lot_no text,
  p_party_col text,
  p_barrels_delta numeric,
  p_qty_delta numeric,
  p_user text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  l stock_lots%rowtype;
  v_warehouse text;
  v_cur numeric;
  v_new numeric;
  v_new_qty numeric;
begin
  v_warehouse := case p_party_col
    when 'qty_hariom' then 'Hariom' when 'qty_reliable' then 'Reliable'
    when 'qty_swastik' then 'Swastik' when 'qty_balaji' then 'BALAJI' end;
  if v_warehouse is null then
    raise exception 'UNKNOWN_WAREHOUSE: % is not a stock column', coalesce(p_party_col, '(none)');
  end if;
  if trim(coalesce(p_lot_no, '')) = '' then
    raise exception 'LOT_NOT_FOUND: no Lot No given';
  end if;

  select * into l from stock_lots where wh_lot_no ilike trim(p_lot_no)
    order by serial_no asc nulls last, created_at asc, id asc limit 1 for update;
  if not found then
    raise exception 'LOT_NOT_FOUND: lot % is not in Stock Summary', trim(p_lot_no);
  end if;

  v_cur := coalesce(case p_party_col
    when 'qty_hariom' then l.qty_hariom when 'qty_reliable' then l.qty_reliable
    when 'qty_swastik' then l.qty_swastik when 'qty_balaji' then l.qty_balaji end, 0);
  v_new := v_cur + coalesce(p_barrels_delta, 0);
  v_new_qty := coalesce(l.quantity, 0) + coalesce(p_qty_delta, 0);

  if v_new < 0 then
    raise exception 'NOT_ENOUGH_STOCK: only % barrels available at % (Lot %)', v_cur, v_warehouse, l.wh_lot_no;
  end if;
  if v_new_qty < 0 then
    raise exception 'NOT_ENOUGH_STOCK: lot % has only % Total Quantity left, this needs %', l.wh_lot_no, coalesce(l.quantity, 0), -p_qty_delta;
  end if;

  update stock_lots set
    qty_hariom   = case when p_party_col = 'qty_hariom'   then v_new else qty_hariom   end,
    qty_reliable = case when p_party_col = 'qty_reliable' then v_new else qty_reliable end,
    qty_swastik  = case when p_party_col = 'qty_swastik'  then v_new else qty_swastik  end,
    qty_balaji   = case when p_party_col = 'qty_balaji'   then v_new else qty_balaji   end,
    quantity = v_new_qty,
    updated_at = now(),
    updated_by = p_user
  where id = l.id;

  return jsonb_build_object('lot_id', l.id, 'wh_lot_no', l.wh_lot_no, 'warehouse', v_warehouse,
    'barrels_before', v_cur, 'barrels_after', v_new, 'quantity_before', coalesce(l.quantity, 0), 'quantity_after', v_new_qty);
end;
$$;

grant execute on function public.adjust_lot_stock(text, text, numeric, numeric, text) to authenticated;
