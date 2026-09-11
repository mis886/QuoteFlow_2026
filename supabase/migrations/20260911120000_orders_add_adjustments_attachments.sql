-- Add adjustments and attachments columns to orders, matching quotes' own
-- attachments column (quotes already has attachments/negotiations; orders
-- had neither). Without these, mapOrderToDB() had no column to write to, so
-- every order save silently dropped its freight/P&F/TDS adjustment lines
-- and any attachments — invisible in the current session (local state still
-- showed them) but gone the next time the order was reloaded.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS adjustments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
