-- Migration: 2026-06-01 — Day/Night shift hours + DPR/PDI attachment table
-- Run this in Supabase SQL Editor.

-- ── 1. Per-shift hour config ───────────────────────────────────────────────
ALTER TABLE public.prod_shop_floor_settings
  ADD COLUMN IF NOT EXISTS active_shift       TEXT    DEFAULT 'day',   -- 'day' | 'night'
  ADD COLUMN IF NOT EXISTS day_shift_hours    INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS night_shift_hours  INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS day_ot_max         NUMERIC DEFAULT 2,
  ADD COLUMN IF NOT EXISTS night_ot_max       NUMERIC DEFAULT 2,
  ADD COLUMN IF NOT EXISTS day_shift_start    TEXT    DEFAULT '08:00', -- HH:MM
  ADD COLUMN IF NOT EXISTS night_shift_start  TEXT    DEFAULT '20:00';

-- ── 2. DPR & PDI attachment table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prod_attachments (
  id            BIGSERIAL PRIMARY KEY,
  type          TEXT    NOT NULL,      -- 'dpr' | 'pdi_doc' | 'other'
  shift_date    DATE    NOT NULL,
  shift         TEXT,                  -- 'day' | 'night'
  job_card_id   TEXT,                  -- NULL for DPR (not job-specific)
  log_entry_id  TEXT,                  -- e.g. MLD-2026-00001 (optional backlink)
  file_name     TEXT    NOT NULL,
  file_path     TEXT    NOT NULL,      -- Supabase Storage path (bucket: prod-docs)
  file_size     INTEGER,               -- bytes
  mime_type     TEXT,
  uploaded_by   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.prod_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow company access" ON public.prod_attachments;
  EXECUTE $f$
    CREATE POLICY "Allow company access"
    ON public.prod_attachments FOR ALL TO authenticated
    USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
    WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
  $f$;
END $$;

-- ── 3. Supabase Storage bucket (run separately in Supabase dashboard) ──────
-- Create a private bucket named: prod-docs
-- Storage → New Bucket → Name: prod-docs → NOT public
-- Add policy: authenticated users with @himalayaterpene.com can read/write.
-- SQL for bucket policy (run in SQL editor after creating the bucket):
/*
INSERT INTO storage.buckets (id, name, public) VALUES ('prod-docs', 'prod-docs', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "Company access to prod-docs"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'prod-docs' AND (auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com')
WITH CHECK (bucket_id = 'prod-docs' AND (auth.jwt() ->> 'email') LIKE '%@himalayaterpene.com');
*/
