-- Change four FK constraints to ON DELETE CASCADE so that deleting an enquiry
-- automatically removes its linked quotations, orders, and followups, and
-- deleting a quotation automatically removes its linked orders and followups.
--
-- This is idempotent: each constraint is dropped IF EXISTS before re-adding.

-- 1. quotes.enq_ref → enquiries.id
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_enq_ref_fkey;
ALTER TABLE quotes ADD CONSTRAINT quotes_enq_ref_fkey
  FOREIGN KEY (enq_ref) REFERENCES enquiries(id) ON DELETE CASCADE;

-- 2. orders.enq_ref → enquiries.id
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_enq_ref_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_enq_ref_fkey
  FOREIGN KEY (enq_ref) REFERENCES enquiries(id) ON DELETE CASCADE;

-- 3. orders.quote_ref → quotes.id
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_quote_ref_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_quote_ref_fkey
  FOREIGN KEY (quote_ref) REFERENCES quotes(id) ON DELETE CASCADE;

-- 4. followups.quote_id → quotes.id
ALTER TABLE followups DROP CONSTRAINT IF EXISTS followups_quote_id_fkey;
ALTER TABLE followups ADD CONSTRAINT followups_quote_id_fkey
  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE;

-- Verify: confdeltype = 'c' means ON DELETE CASCADE
SELECT conname, confdeltype
FROM pg_constraint
WHERE conname IN (
  'quotes_enq_ref_fkey',
  'orders_enq_ref_fkey',
  'orders_quote_ref_fkey',
  'followups_quote_id_fkey'
)
ORDER BY conname;
