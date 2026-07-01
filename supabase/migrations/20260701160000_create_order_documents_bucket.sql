-- =============================================================================
-- Create order-documents storage bucket for staff-uploaded PO attachments.
--
-- WHY: The "Upload PO" field on the Order form was silently failing because
-- it referenced a "Docs" bucket that never existed. This creates a real
-- public bucket for order-level PO documents uploaded directly by staff.
-- This is separate from the po-uploads bucket (customer-facing SubmitPO
-- workflow) and the po_submissions table auto-link mechanism.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-documents',
  'order-documents',
  true,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "order_documents_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'order-documents');

CREATE POLICY "order_documents_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'order-documents');

CREATE POLICY "order_documents_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'order-documents');

NOTIFY pgrst, 'reload schema';
