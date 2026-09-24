-- Prevent an accidental second ROOT order for the same quote, while still
-- allowing unlimited legitimate split orders (created by NewDispatchEntry.tsx
-- during a partial dispatch, which always set split_from_order_id).
-- A "root" order is one with no split_from_order_id.
CREATE UNIQUE INDEX IF NOT EXISTS orders_quote_ref_root_unique
  ON orders (quote_ref)
  WHERE quote_ref IS NOT NULL AND split_from_order_id IS NULL;
