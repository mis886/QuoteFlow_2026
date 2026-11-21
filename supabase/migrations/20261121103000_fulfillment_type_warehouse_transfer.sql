-- 2026-11-21: "Warehouse Transfer" fulfilment type on Order + Dispatch entry.
-- Behaves like 'delivery' in the app for now (isDeliveryLike in
-- src/lib/utils.ts). The DO/Outward form's stock_movements.fulfilment_type is
-- plain text and already accepts 'Warehouse Transfer'.

alter table public.orders drop constraint if exists orders_fulfillment_type_check;
alter table public.orders add constraint orders_fulfillment_type_check
  check (fulfillment_type = any (array['self_pickup'::text, 'delivery'::text, 'direct_transporter'::text, 'warehouse_transfer'::text]));

alter table public.dispatch_entries drop constraint if exists dispatch_entries_fulfillment_type_check;
alter table public.dispatch_entries add constraint dispatch_entries_fulfillment_type_check
  check (fulfillment_type = any (array['self_pickup'::text, 'delivery'::text, 'direct_transporter'::text, 'warehouse_transfer'::text]));

notify pgrst, 'reload schema';
