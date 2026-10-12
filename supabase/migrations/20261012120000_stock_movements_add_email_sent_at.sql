-- Outward's "Email to Client" timestamp — set by NewStockOutward.tsx when
-- SendEmailModal sends successfully (same idea as dispatch_entries.email_sent_at).
-- Null = not emailed yet ("Saved" sub-tab in Stock Movements → Outward),
-- set = "Email Sent" sub-tab. Additive and nullable: no existing row changes.
-- See src/pages/StockMovements.tsx.

alter table public.stock_movements add column if not exists email_sent_at timestamptz;

notify pgrst, 'reload schema';
