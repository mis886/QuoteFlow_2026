-- "Documents Attachment" card in the Dispatch -> Sent view of src/pages/Dispatch.tsx.
-- Five document types, each stored as a public Storage URL + original file name,
-- mirroring the order-documents bucket pattern used for the Order form's PO Document
-- field (see 20260701160000_create_order_documents_bucket.sql).
--
-- NOTE: this migration has already been applied directly to the live Supabase project
-- (QuoteFlow_EnqBoss / nheujyknkqeimgpdfyiw) via the Supabase MCP tool. It's committed
-- here too so the migrations folder stays in sync with the live schema and a fresh
-- `supabase db push` / local dev DB picks it up without drift.

-- New public bucket, separate from order-documents, for dispatch-stage documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dispatch-documents',
  'dispatch-documents',
  true,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "dispatch_documents_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dispatch-documents');

CREATE POLICY "dispatch_documents_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dispatch-documents');

CREATE POLICY "dispatch_documents_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dispatch-documents');

-- Ten new nullable columns on dispatch_entries: url + original file name per document.
alter table public.dispatch_entries
  add column if not exists invoice_eway_bill_url text,
  add column if not exists invoice_eway_bill_name text,
  add column if not exists coa_url text,
  add column if not exists coa_name text,
  add column if not exists lr_url text,
  add column if not exists lr_name text,
  add column if not exists supplier_portal_url text,
  add column if not exists supplier_portal_name text,
  add column if not exists term_card_attachment_url text,
  add column if not exists term_card_attachment_name text;

comment on column public.dispatch_entries.invoice_eway_bill_url is 'Public Storage URL for the Invoice / Eway Bill uploaded in the Dispatch -> Sent "Documents Attachment" card.';
comment on column public.dispatch_entries.coa_url is 'Public Storage URL for the COA uploaded in the Dispatch -> Sent "Documents Attachment" card.';
comment on column public.dispatch_entries.lr_url is 'Public Storage URL for the LR uploaded in the Dispatch -> Sent "Documents Attachment" card.';
comment on column public.dispatch_entries.supplier_portal_url is 'Public Storage URL for the Supplier Portal document uploaded in the Dispatch -> Sent "Documents Attachment" card.';
comment on column public.dispatch_entries.term_card_attachment_url is 'Public Storage URL for the Term Card Attachment uploaded in the Dispatch -> Sent "Documents Attachment" card.';

notify pgrst, 'reload schema';
