-- 2026-11-23: ONE-ORDER DATA FIX — ORD-2026-743 / SO-2026-877 (MALHAR ENTERPRISES).
-- Delivered on 2026-10-12 (marked by mum@ at 11:12:15 UTC), before the Dispatch
-- module. Today it was sent to Dispatch by mistake (SO-2026-877) and Steps 1–5
-- were clicked. It is turned into an imported order, like the 491 others:
--   * one dispatch_entries row, created_by 'system-import', same shape as
--     DSP-2026-549 (sent_at = email_sent_at = created_at, docs_sent_via 'email',
--     no files) — items / value / insurance from the order, transporter
--     MAHANAGAR TRANSPORT, all times = 2026-10-12 11:12:15+00;
--   * today's 5 dispatch_steps rows deleted (imported orders have none);
--   * status → Delivered, sent_to_dispatch_at → 2026-10-12 05:15:00+00,
--     SO-2026-877 and dispatch_snapshot kept;
--   * one History Log row.
-- No DO / stock_movements row, no email. No app code change.
-- Backups: backup.so2026_877_orders_20261123, backup.so2026_877_dispatch_steps_20261123.
-- Safety: stops (nothing changed) unless the order is exactly as checked on
-- 2026-11-23 — Order Confirmed, SO-2026-877, no entry, no DO, the 5 steps by mis@.

do $$
declare
  v_o public.orders%rowtype;
  v_n int;
  v_entry_id text;
  v_at constant timestamptz := '2026-10-12 11:12:15+00';
  v_steps jsonb;
begin
  select * into v_o from public.orders where id = 'ORD-2026-743' for update;
  if not found then raise exception 'ORD-2026-743 not found'; end if;
  if v_o.status <> 'Order Confirmed' or v_o.so_number is distinct from 'SO-2026-877' then
    raise exception 'ORD-2026-743 is % / % — not as checked, nothing changed', v_o.status, v_o.so_number;
  end if;
  select count(*) into v_n from public.dispatch_entries where order_id = 'ORD-2026-743';
  if v_n > 0 then raise exception 'ORD-2026-743 already has % dispatch entr(y/ies) — nothing changed', v_n; end if;
  select count(*) into v_n from public.stock_movements where order_id = 'ORD-2026-743';
  if v_n > 0 then raise exception 'ORD-2026-743 has % DO / stock row(s) — nothing changed', v_n; end if;
  select count(*) into v_n from public.dispatch_steps
   where order_id = 'ORD-2026-743' and step_no between 1 and 5 and entry_id is null and done_by = 'mis@himalayaterpene.com';
  if v_n <> 5 or (select count(*) from public.dispatch_steps where order_id = 'ORD-2026-743') <> 5 then
    raise exception 'ORD-2026-743 steps are not the expected 5 (Steps 1–5 by mis@) — nothing changed';
  end if;

  -- 1. Backups.
  create table if not exists backup.so2026_877_orders_20261123 as select * from public.orders where false;
  insert into backup.so2026_877_orders_20261123 select * from public.orders where id = 'ORD-2026-743';
  create table if not exists backup.so2026_877_dispatch_steps_20261123 as select * from public.dispatch_steps where false;
  insert into backup.so2026_877_dispatch_steps_20261123 select * from public.dispatch_steps where order_id = 'ORD-2026-743';

  -- 2. Imported dispatch entry (next free DSP-2026-NNN).
  select 'DSP-2026-' || lpad((coalesce(max((substring(id from '^DSP-2026-(\d+)$'))::int), 0) + 1)::text, 3, '0')
    into v_entry_id from public.dispatch_entries;
  insert into public.dispatch_entries (
    id, order_id, fulfillment_type, stages, current_stage_index, doc_link_status, transporter, remark,
    created_by, created_at, updated_at, items, insurance, value, sent_at, email_sent_at, docs_sent_via,
    invoice_eway_bill_files, lr_files, coa_files)
  values (
    v_entry_id, 'ORD-2026-743', 'delivery', '[]'::jsonb, 0, 'not_uploaded', 'MAHANAGAR TRANSPORT',
    'Imported from Orders → Delivered (before Dispatch module) — delivered 12 Oct 2026',
    'system-import', v_at, v_at, v_o.items, coalesce(v_o.insurance, 0), v_o.value, v_at, v_at, 'email',
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);

  -- 3. Today's Steps 1–5 removed.
  with d as (delete from public.dispatch_steps where order_id = 'ORD-2026-743' returning *)
  select jsonb_agg(jsonb_build_object('step_no', step_no, 'status', status, 'done_by', done_by, 'done_at', done_at) order by step_no)
    into v_steps from d;

  -- 4. Order back to Delivered, sent date = delivery day. SO No. + snapshot kept.
  update public.orders set status = 'Delivered', sent_to_dispatch_at = '2026-10-12 05:15:00+00'
   where id = 'ORD-2026-743';

  -- 5. History Log.
  insert into public.activity_log (actor_email, actor_name, module, record_id, record_label, action, changes)
  values (null, 'Data fix (migration)', 'orders', 'ORD-2026-743',
    'MALHAR ENTERPRISES · Data fix: delivered 12 Oct 2026 before Dispatch — imported into Dispatch as ' || v_entry_id
      || ' (system-import), Steps 1–5 clicked by mistake on 23 Nov removed, status back to Delivered',
    'update',
    jsonb_build_object(
      'status', jsonb_build_object('old', v_o.status, 'new', 'Delivered'),
      'sentToDispatchAt', jsonb_build_object('old', v_o.sent_to_dispatch_at, 'new', '2026-10-12T05:15:00+00:00'),
      'importedEntry', v_entry_id,
      'deletedSteps', v_steps));
end $$;
