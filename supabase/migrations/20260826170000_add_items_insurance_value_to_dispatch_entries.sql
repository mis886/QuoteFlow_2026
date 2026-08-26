-- The dispatch entry now carries its own snapshot of what's actually being
-- dispatched (items/insurance/value), separate from the order's own totals.
-- This stops a partial dispatch from overwriting the order's confirmed
-- quantities — "Order Confirmed" keeps showing the full original order,
-- "Order Pending for Dispatch" shows the split-off remainder, and the
-- dispatch entry itself shows what was actually shipped in that action.
alter table public.dispatch_entries
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists insurance numeric,
  add column if not exists value numeric;

notify pgrst, 'reload schema';
