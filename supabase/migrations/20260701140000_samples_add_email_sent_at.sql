-- =============================================================================
-- Add email_sent_at column to public.samples
--
-- WHY: The "Email to Client" button in the Sampling module needed a way to
-- record that an email was actually successfully sent, independently of the
-- sample's status (which tracks physical dispatch / feedback / approval).
-- A sample can be Approved AND have been emailed — these are orthogonal facts.
-- The column is nullable with no default; it is set to now() by the app only
-- on confirmed Gmail API success, never on send failure.
-- =============================================================================

ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

NOTIFY pgrst, 'reload schema';
