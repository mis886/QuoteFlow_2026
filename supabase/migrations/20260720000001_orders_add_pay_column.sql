-- Add payment_terms column to orders, matching the existing quotes.pay column.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay text;

-- Backfill pay for existing orders from their source quotation.
-- Only touches rows where pay is currently null/empty AND the source quote has a pay value.
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE orders o
  SET pay = q.pay
  FROM quotes q
  WHERE o.quote_ref = q.id
    AND (o.pay IS NULL OR o.pay = '')
    AND q.pay IS NOT NULL
    AND q.pay != '';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'orders.pay backfill complete: % row(s) updated from source quotation.', updated_count;
END $$;
