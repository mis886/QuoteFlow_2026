-- =============================================================================
-- Add POD/COA file columns and Lot No to samples; create sample-attachments
-- storage bucket for actual file persistence.
--
-- WHY: Sampling module needed to record Proof of Delivery (POD) and
-- Certificate of Analysis (COA) file uploads alongside a batch Lot No.
-- No Supabase Storage buckets existed on this project — existing "upload"
-- fields in Enquiries/Orders silently dropped files (local/ fallback path).
-- This migration creates the first real storage bucket so uploads work.
-- =============================================================================

-- Part 1: New columns on samples
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS pod_file text,
  ADD COLUMN IF NOT EXISTS coa_file text,
  ADD COLUMN IF NOT EXISTS lot_no   text;

-- Part 2: Create the sample-attachments storage bucket (public — getPublicUrl works without signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sample-attachments',
  'sample-attachments',
  true,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Part 3: Storage RLS — authenticated users may upload and manage their files
CREATE POLICY "sample_attachments_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sample-attachments');

CREATE POLICY "sample_attachments_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sample-attachments');

CREATE POLICY "sample_attachments_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sample-attachments');

NOTIFY pgrst, 'reload schema';
