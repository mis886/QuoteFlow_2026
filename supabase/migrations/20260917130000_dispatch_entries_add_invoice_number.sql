-- Manually-typed Invoice Number field in the Dispatch -> Sent "Documents
-- Attachment" card (src/pages/NewDispatchEntry.tsx). Distinct from
-- invoice_eway_bill_url/_name, which is the uploaded Invoice/Eway Bill
-- document itself -- this is just the invoice number as free text, typed in
-- by the user alongside it.
--
-- NOTE: this migration has already been applied directly to the live Supabase
-- project (QuoteFlow_EnqBoss / nheujyknkqeimgpdfyiw) via the Supabase MCP
-- tool. It's committed here too so the migrations folder stays in sync with
-- the live schema.

alter table public.dispatch_entries
  add column if not exists invoice_number text;

comment on column public.dispatch_entries.invoice_number is 'Manually-entered Invoice Number, typed in the Dispatch -> Sent "Documents Attachment" card alongside the Invoice / Eway Bill upload.';

notify pgrst, 'reload schema';
