-- 2026-11-14: "Direct Transporter" fulfilment type on Order + Dispatch entry.
-- Behaves exactly like 'delivery' in the app (isDeliveryLike in
-- src/lib/utils.ts). The DO/Outward form's stock_movements.fulfilment_type is
-- plain text and already accepts 'Direct Transporter' (1b8ff9a).

alter table public.orders drop constraint if exists orders_fulfillment_type_check;
alter table public.orders add constraint orders_fulfillment_type_check
  check (fulfillment_type = any (array['self_pickup'::text, 'delivery'::text, 'direct_transporter'::text]));

alter table public.dispatch_entries drop constraint if exists dispatch_entries_fulfillment_type_check;
alter table public.dispatch_entries add constraint dispatch_entries_fulfillment_type_check
  check (fulfillment_type = any (array['self_pickup'::text, 'delivery'::text, 'direct_transporter'::text]));

notify pgrst, 'reload schema';
