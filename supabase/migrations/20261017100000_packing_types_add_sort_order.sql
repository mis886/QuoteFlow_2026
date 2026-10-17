-- 2026-10-17: Packing Type dropdowns (usePackingTypes) show options in a
-- curated order instead of alphabetically. Rows without an explicit order
-- default to 1000 so newly added types land at the end.
-- Already applied in Supabase — this file is for the record.
alter table public.packing_types add column if not exists sort_order integer not null default 1000;
