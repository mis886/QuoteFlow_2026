-- Outward's "Fulfilment Type" field (Delivery / Self Pickup / Both — same
-- 3 options as the Customers table's own fulfilment_type field), matching
-- the field already shown on the Dispatch module (NewDispatchEntry.tsx).
-- See src/pages/NewStockOutward.tsx.

alter table public.stock_movements add column fulfilment_type text;

notify pgrst, 'reload schema';
