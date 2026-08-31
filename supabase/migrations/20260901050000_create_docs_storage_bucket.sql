-- Root cause of "ticket attachment never shows up": src/lib/s3.ts's
-- uploadToS3() (shared by AttachmentModal.tsx's generic Enquiry/Quote/Order
-- doc uploads and the new Tickets module's attachment field) targets a
-- storage bucket named "Docs" by default (VITE_S3_BUCKET || "Docs"), and
-- storage.objects already has "Allow authenticated *" RLS policies scoped to
-- bucket_id = 'Docs' — but the bucket itself was never actually created.
-- uploadToS3() swallows the resulting "bucket not found" error and returns
-- null, so the upload silently no-ops and the ticket (or enquiry/quote/order
-- attachment) gets saved with no attachment_path at all.
--
-- Config mirrors the other document buckets in this project (order-documents,
-- sample-attachments, coa-gc-documents): public, 10MB limit, PDF/JPEG/PNG/WEBP.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('Docs', 'Docs', true, 10485760, array['application/pdf','image/jpeg','image/jpg','image/png','image/webp'])
on conflict (id) do nothing;
