-- 2026-10-16: Outward (DO) form's Billing Name is now saved with the entry,
-- so a DO reopened with Edit prints / emails the same Billing Name it was
-- created with. Already applied in Supabase — this file is for the record.
alter table public.stock_movements add column if not exists billing_name text;
