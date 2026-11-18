-- 2026-11-18: READ-ONLY. Orders whose whole dispatch is finished but whose
-- status in Orders is not Delivered yet — the ones the new auto "Delivered"
-- (store's autoMarkOrderDeliveredFromDispatch) would have marked, had it
-- existed. Same rule as orderDispatchComplete in src/lib/dispatchFlow.ts:
--   * status is Order Confirmed (or legacy Order Pending for Dispatch)
--   * at least one non-imported dispatch entry
--   * nothing left to dispatch: per order line (seq), order qty (from
--     dispatch_snapshot.items when there is one, else orders.items) minus that
--     line's qty summed over ALL the order's entries, floored at 0, totals 0
--   * every non-imported entry has email_sent_at AND a Step 11 row done/skipped
-- Nothing here writes. Updating these needs the user's OK first.
with o as (
  select id, status, so_number, cust,
         case when jsonb_typeof(dispatch_snapshot->'items') = 'array'
              then dispatch_snapshot->'items' else coalesce(items, '[]'::jsonb) end as items
  from orders
  where status in ('Order Confirmed', 'Order Pending for Dispatch')
),
ent as (
  select e.* from dispatch_entries e join o on o.id = e.order_id
),
tracked as (
  select order_id,
         count(*) as rounds,
         bool_and(email_sent_at is not null and exists (
           select 1 from dispatch_steps s
           where s.entry_id = ent.id and s.step_no = 11 and s.status in ('done', 'skipped')
         )) as all_done
  from ent
  where coalesce(created_by, '') <> 'system-import'
  group by order_id
),
dispatched as (
  select e.order_id, (l->>'seq')::int as seq,
         sum(coalesce(nullif(l->>'qty', '')::numeric, 0)) as qty
  from ent e, jsonb_array_elements(coalesce(e.items, '[]'::jsonb)) l
  group by 1, 2
),
remaining as (
  select o.id as order_id,
         sum(greatest(0, coalesce(nullif(l->>'qty', '')::numeric, 0) - coalesce(d.qty, 0))) as left_qty
  from o cross join jsonb_array_elements(o.items) l
  left join dispatched d on d.order_id = o.id and d.seq = (l->>'seq')::int
  group by o.id
)
select o.id, o.so_number, o.cust, o.status, t.rounds
from o
join tracked t on t.order_id = o.id and t.all_done
join remaining r on r.order_id = o.id and r.left_qty = 0
order by o.so_number nulls last, o.id;
