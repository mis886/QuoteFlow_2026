-- Add source tracking and email-sent flag to samples table.
-- email_sent_at already exists from 20260628_samples_add_email_sent_at.sql.
--
-- Apply via Supabase SQL Editor at:
-- https://app.supabase.com/project/nheujyknkqeimgpdfyiw/sql/new

ALTER TABLE samples ADD COLUMN IF NOT EXISTS source_module text
  CHECK (source_module IN ('enquiry','quotation'));

ALTER TABLE samples ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false;

ALTER TABLE samples ADD COLUMN IF NOT EXISTS client_email text;

-- Backfill source_module from existing refs
UPDATE samples SET source_module = CASE
  WHEN quote_ref IS NOT NULL THEN 'quotation'
  WHEN enq_ref IS NOT NULL THEN 'enquiry'
  ELSE NULL
END WHERE source_module IS NULL;

-- Backfill email_sent from existing email_sent_at timestamps
UPDATE samples SET email_sent = true WHERE email_sent_at IS NOT NULL;
