-- Add payment_terms column to orders, matching the existing quotes.pay column.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay text;
