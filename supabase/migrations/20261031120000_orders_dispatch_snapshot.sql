-- Dispatch: freeze the order at the moment it is sent to Dispatch (2026-10-31).
-- orders.dispatch_snapshot holds a full copy of the order, in the shape the app
-- uses (mapOrderFromDB in src/store/index.tsx: camelCase fields + the items
-- array). Dispatch reads the order through dispatchOrderView (src/lib/utils.ts),
-- so later edits in the Orders module no longer change what Dispatch shows.
-- NULL = no snapshot: Dispatch falls back to the live order.
-- Backfill: every order already in Dispatch gets its CURRENT data, so anything
-- edited before this migration stays as edited.
-- Run ONCE, in the Supabase SQL Editor.

begin;

-- a) Backup of every order before anything changes.
create schema if not exists backup;
create table backup.orders_snapshot_20261031 as select * from public.orders;

-- b) The frozen copy.
alter table public.orders
  add column if not exists dispatch_snapshot jsonb null;

comment on column public.orders.dispatch_snapshot is
  'Full copy of the order (app shape) saved when it was sent to Dispatch. Written once by sendOrderToDispatch; cleared only when the order leaves Dispatch with no dispatch entries.';

-- c) Backfill. Same result as mapOrderFromDB: the renamed columns move to their
-- camelCase keys, and keys the app only sets when filled are left out if empty.
update public.orders o
set dispatch_snapshot =
  (to_jsonb(o)
    - 'dispatch_snapshot'
    - 'quote_ref' - 'enq_ref' - 'site_id' - 'customer_id' - 'contact_id'
    - 'contact_phone' - 'cust_enquiry_doc_no' - 'po_no' - 'po_date' - 'dlv_date'
    - 'schedule_date' - 'po_filename' - 'company_unit_id' - 'bank_account_id'
    - 'shipping_address' - 'fulfillment_type' - 'promised_delivery_date'
    - 'estimated_delivery_date' - 'split_from_order_id' - 'dispatch_finalized'
    - 'authorized_person' - 'customer_tier' - 'received_amount' - 'management_notes')
  || jsonb_build_object(
       'quoteRef', o.quote_ref,
       'enqRef', o.enq_ref,
       'poNo', o.po_no,
       'poDate', o.po_date,
       'dlvDate', o.dlv_date,
       'authorizedPerson', o.authorized_person,
       'customerTier', o.customer_tier,
       'receivedAmount', o.received_amount,
       'managementNotes', o.management_notes)
  || jsonb_strip_nulls(jsonb_build_object(
       'siteId', nullif(o.site_id, ''),
       'customerId', nullif(o.customer_id, ''),
       'contactId', nullif(o.contact_id, ''),
       'phone', nullif(o.contact_phone, ''),
       'custEnquiryDocNo', nullif(o.cust_enquiry_doc_no, ''),
       'scheduleDate', o.schedule_date,
       'poFileName', nullif(o.po_filename, ''),
       'unitId', nullif(o.company_unit_id, ''),
       'bankAccountId', nullif(o.bank_account_id, ''),
       'shipToAddress', nullif(o.shipping_address, ''),
       'fulfillmentType', nullif(o.fulfillment_type, ''),
       'promisedDeliveryDate', o.promised_delivery_date,
       'estimatedDeliveryDate', o.estimated_delivery_date,
       'splitFromOrderId', nullif(o.split_from_order_id, ''),
       'soNumber', nullif(o.so_number, ''),
       'sentToDispatchAt', o.sent_to_dispatch_at))
  || case when o.dispatch_finalized then '{"dispatchFinalized": true}'::jsonb else '{}'::jsonb end
where o.dispatch_snapshot is null
  and (o.sent_to_dispatch_at is not null
       or exists (select 1 from public.dispatch_entries d where d.order_id = o.id));

commit;

-- Check afterwards (the first two should match):
--   select count(*) from public.orders where dispatch_snapshot is not null;
--   select count(*) from public.orders o where o.sent_to_dispatch_at is not null
--     or exists (select 1 from public.dispatch_entries d where d.order_id = o.id);
--   select count(*) from backup.orders_snapshot_20261031;
