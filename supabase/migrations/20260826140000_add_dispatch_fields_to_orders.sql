-- Adds the 5 dispatch-related fields (already captured on dispatch_entries)
-- directly onto orders too, so they can be filled in at order-creation time
-- (Order module, Customer & Contact section) and carried forward from there
-- when a dispatch entry is later created for that order.
alter table public.orders
  add column if not exists fulfillment_type text check (fulfillment_type in ('self_pickup','delivery')),
  add column if not exists transporter text,
  add column if not exists promised_delivery_date date,
  add column if not exists estimated_delivery_date date,
  add column if not exists remark text;

notify pgrst, 'reload schema';
