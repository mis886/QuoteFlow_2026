-- Extend samples status check constraint to allow 'delivered'
ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS samples_status_check;
ALTER TABLE public.samples ADD CONSTRAINT samples_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'dispatched'::text,
    'delivered'::text,
    'feedback_received'::text,
    'approved'::text,
    'rejected'::text
  ]));
