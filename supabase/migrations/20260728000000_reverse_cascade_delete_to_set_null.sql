-- Reverses 20260720000003 (cascade-delete FKs): deletes must now be fully
-- independent per module — deleting an Enquiry/Quotation must not delete
-- linked Quotations/Orders/Follow-ups, only null their reference to it.
-- ON DELETE SET NULL (not NO ACTION/RESTRICT, which was the original bug
-- this project moved away from before switching to CASCADE) so deletes
-- always succeed even when linked records exist.
--
-- Columns must be nullable for SET NULL to fire; DROP NOT NULL is a safe
-- no-op if a column is already nullable, so this is correct regardless of
-- current state.

ALTER TABLE quotes ALTER COLUMN enq_ref DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN enq_ref DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN quote_ref DROP NOT NULL;
ALTER TABLE followups ALTER COLUMN quote_id DROP NOT NULL;

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_enq_ref_fkey;
ALTER TABLE quotes ADD CONSTRAINT quotes_enq_ref_fkey
  FOREIGN KEY (enq_ref) REFERENCES enquiries(id) ON DELETE SET NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_enq_ref_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_enq_ref_fkey
  FOREIGN KEY (enq_ref) REFERENCES enquiries(id) ON DELETE SET NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_quote_ref_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_quote_ref_fkey
  FOREIGN KEY (quote_ref) REFERENCES quotes(id) ON DELETE SET NULL;

ALTER TABLE followups DROP CONSTRAINT IF EXISTS followups_quote_id_fkey;
ALTER TABLE followups ADD CONSTRAINT followups_quote_id_fkey
  FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL;

-- Verify: confdeltype = 'n' means ON DELETE SET NULL
SELECT conname, confdeltype
FROM pg_constraint
WHERE conname IN (
  'quotes_enq_ref_fkey',
  'orders_enq_ref_fkey',
  'orders_quote_ref_fkey',
  'followups_quote_id_fkey'
)
ORDER BY conname;

NOTIFY pgrst, 'reload schema';
