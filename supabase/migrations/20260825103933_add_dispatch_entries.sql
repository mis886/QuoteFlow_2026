-- Dispatch Control module: Order → Dispatch tracking for both fulfillment
-- paths (Self Pickup / Delivery), modeled on the real HTPL Self Pickup FMS
-- and HTPL Delivery FMS Google Sheets. One row per confirmed order, created
-- manually via the "+ New Dispatch Entry" flow (mirrors the real-world
-- manual Google Form fill), following the same one-row-per-parent +
-- jsonb-log shape as public.followups (one row per quote, jsonb `logs`).
--
-- `stages` holds a snapshot of that entry's stage checklist, seeded from
-- src/lib/dispatchStages.ts at creation time:
--   [{ code, label, owner, how, sla_hours, planned, actual, status, delay_hours }, ...]
-- Self Pickup seeds 7 stages (SP1-SP7); Delivery seeds 8 (DO1-DO8).
-- Dispatch → Sent (SP8-SP11 / DO9-DO12 + Payment Status) is intentionally
-- out of scope for this table and may extend it later.

create table if not exists public.dispatch_entries (
  id                      text primary key,
  order_id                text not null unique references public.orders(id) on delete cascade,
  fulfillment_type        text not null check (fulfillment_type in ('self_pickup','delivery')),
  stages                  jsonb not null default '[]'::jsonb,
  current_stage_index     integer not null default 0,
  doc_link_status         text not null default 'not_uploaded' check (doc_link_status in ('attached','not_uploaded')),
  doc_link_url            text,
  vehicle_number          text,
  transporter             text,
  remark                  text,
  num_units               text,
  unit                    text,
  promised_delivery_date  date,
  estimated_delivery_date date,
  form_filled_by          text,
  created_by              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.dispatch_entries is 'One row per order tracking the Order→Dispatch stage checklist (Self Pickup or Delivery), sourced from src/pages/Dispatch.tsx. Dispatch→Sent is out of scope for now.';

create index if not exists idx_dispatch_entries_order_id on public.dispatch_entries(order_id);
create index if not exists idx_dispatch_entries_fulfillment_type on public.dispatch_entries(fulfillment_type);

alter table public.dispatch_entries enable row level security;

create policy "Allow company access" on public.dispatch_entries
  for all to authenticated
  using ((auth.jwt() ->> 'email') like '%@himalayaterpene.com')
  with check ((auth.jwt() ->> 'email') like '%@himalayaterpene.com');

create policy "allow_authenticated_all" on public.dispatch_entries
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
