-- Recompute status for any existing feedback_received samples:
-- email_sent = true → dispatched, else → pending
UPDATE public.samples
SET status = CASE WHEN email_sent = true THEN 'dispatched' ELSE 'pending' END
WHERE status = 'feedback_received';

-- Remove feedback_received from the status check constraint
ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS samples_status_check;
ALTER TABLE public.samples ADD CONSTRAINT samples_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'dispatched'::text,
    'delivered'::text,
    'approved'::text,
    'rejected'::text
  ]));
