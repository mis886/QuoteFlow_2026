-- 2026-11-03 (user decision — replaces the 33961c5 rule "Undo of Step 6 never
-- touches the DO"): Undo of Dispatch Step 6 (Transporter & DO) undoes the DO
-- completely, in ONE transaction:
--   1. every DO linked to the order + round (stock_movements.order_id +
--      dispatch_round) is deleted with delete_outward_do — all its lines go,
--      every lot gets its barrels / Total Quantity back (a finished lot that is
--      above zero again is un-finished — delete_outward_movement's rule), so
--      the Outward entries and their Stock Book rows disappear;
--   2. the round's Step 6 done / skipped row(s) are deleted, so the card is
--      back at Step 6 and a new DO can be made.
-- Allowed only when Step 6 is the round's last step (no Step 7+ row, and no
-- step row of the round newer than Step 6) and the round has no dispatch
-- entry yet. MIS / Shishir only (deleting DOs is theirs — e586e17; checked
-- here and again in delete_outward_movement). Anything refused or failing
-- raises, so nothing changes.
-- Called from Dispatch.tsx (board card / drawer "Undo last step") when the
-- undone click is Step 6 Done and the round has DOs. Undo of other steps, or
-- of Step 6 with no DO, is unchanged (plain dispatch_steps delete).
-- Returns { order_id, round, dos: [delete_outward_movement result per DO
-- line: do_number, wh_lot_no, articles_added, qty_added, unfinished,
-- email_sent_at, movement …], deleted_steps: [dispatch_steps rows] }.

create or replace function public.undo_step6_with_dos(p_order_id text, p_round integer, p_actor text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entries int;
  v_step6_at timestamptz;
  v_dos jsonb := '[]'::jsonb;
  v_steps jsonb := '[]'::jsonb;
  r record;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in ('shishir@himalayaterpene.com', 'mis@himalayaterpene.com') then
    raise exception 'Only MIS / Shishir can undo Step 6, because it deletes the DO and restores stock.';
  end if;
  if p_round is null or p_round < 1 then raise exception 'Round missing.'; end if;

  perform 1 from orders where id = p_order_id for update;
  if not found then raise exception 'Order % not found', p_order_id; end if;

  -- Round N has a dispatch entry once the order has N real (non-imported) entries.
  select count(*) into v_entries from dispatch_entries
    where order_id = p_order_id and created_by is distinct from 'system-import';
  if v_entries >= p_round then
    raise exception 'This dispatch (round %) already has a dispatch entry — Step 6 can no longer be undone.', p_round;
  end if;

  select max(created_at) into v_step6_at from dispatch_steps
    where order_id = p_order_id and round = p_round and step_no = 6 and status in ('done', 'skipped');
  if v_step6_at is null then
    raise exception 'Step 6 is not done for this dispatch (round %) — nothing to undo.', p_round;
  end if;
  if exists (select 1 from dispatch_steps where order_id = p_order_id and round = p_round
             and (step_no > 6 or created_at > v_step6_at)) then
    raise exception 'Step 6 is not the last step of this dispatch (round %) — undo the later step first.', p_round;
  end if;

  -- Each DO once (delete_outward_do removes all its lines); a row with no DO
  -- number is its own DO. An earlier call may already have removed a line.
  for r in select id from stock_movements
    where type = 'outward' and order_id = p_order_id and dispatch_round = p_round
    order by do_number nulls last, do_line_no, created_at, id loop
    if exists (select 1 from stock_movements where id = r.id) then
      v_dos := v_dos || delete_outward_do(r.id, p_actor);
    end if;
  end loop;

  with d as (
    delete from dispatch_steps
      where order_id = p_order_id and round = p_round and step_no = 6 and status in ('done', 'skipped')
      returning *)
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_steps from d;

  return jsonb_build_object('order_id', p_order_id, 'round', p_round, 'dos', v_dos, 'deleted_steps', v_steps);
end;
$$;

grant execute on function public.undo_step6_with_dos(text, integer, text) to authenticated;

notify pgrst, 'reload schema';

-- After running — checks (read-only):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = 'undo_step6_with_dos';
--   select has_function_privilege('authenticated', 'public.undo_step6_with_dos(text, integer, text)', 'execute');
