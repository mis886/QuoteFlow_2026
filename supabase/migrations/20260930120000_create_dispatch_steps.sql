-- Dispatch Board (Kanban) — one row per button click on steps 1–7 of an
-- order's dispatch workflow (src/lib/dispatchFlow.ts, src/pages/Dispatch.tsx
-- Board view). Steps 8–10 are NOT stored here: they're worked out from
-- dispatch_entries (invoice_number, lr_files, email_sent_at, fulfillment_type).
--
--   round   1 = first shipment; 2, 3, … = each later shipment of the qty
--           still remaining after a partial dispatch (restarts at step 5).
--   status  'done' | 'skipped' | 'hold'
--           For 'hold' rows, done_at is set when the hold is resumed
--           (null while the order is still on hold).
--
-- Deleting an order deletes its step history (ON DELETE CASCADE).

create table if not exists public.dispatch_steps (
  id          uuid primary key default gen_random_uuid(),
  order_id    text not null references public.orders(id) on delete cascade,
  round       int  not null default 1,
  step_no     int  not null check (step_no between 1 and 7),
  status      text not null check (status in ('done', 'skipped', 'hold')),
  planned_at  timestamptz,
  done_at     timestamptz,
  done_by     text,
  remark      text,
  created_at  timestamptz not null default now()
);

comment on table public.dispatch_steps is 'Dispatch Board step history (steps 1–7 per order per round). See src/lib/dispatchFlow.ts.';

create index if not exists idx_dispatch_steps_order_id on public.dispatch_steps(order_id);

alter table public.dispatch_steps enable row level security;

create policy "Allow company access" on public.dispatch_steps
  for all to authenticated
  using ((auth.jwt() ->> 'email') like '%@himalayaterpene.com')
  with check ((auth.jwt() ->> 'email') like '%@himalayaterpene.com');

create policy "allow_authenticated_all" on public.dispatch_steps
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
