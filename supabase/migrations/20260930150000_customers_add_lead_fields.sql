-- Customer Lead section (src/pages/CustomerLeads.tsx): small / not-qualified
-- buyers (mostly IndiaMART, orders below ₹1 lakh) live in the SAME customers
-- table, marked customer_status = 'lead'. Promoting a lead flips it to
-- 'customer' on the same row (same customer_id), so every enquiry, quote and
-- order stays linked. Existing rows become 'customer' through the default —
-- their data is not touched. A lead's total order value is NOT stored; it's
-- calculated live from orders.value.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_status TEXT NOT NULL DEFAULT 'customer'
  CHECK (customer_status IN ('customer', 'lead'));

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS lead_source        TEXT,
  ADD COLUMN IF NOT EXISTS first_enquiry_date DATE,
  ADD COLUMN IF NOT EXISTS linked_enquiry_id  TEXT,
  ADD COLUMN IF NOT EXISTS product_interest   TEXT,
  ADD COLUMN IF NOT EXISTS promoted_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers (customer_status);

NOTIFY pgrst, 'reload schema';
