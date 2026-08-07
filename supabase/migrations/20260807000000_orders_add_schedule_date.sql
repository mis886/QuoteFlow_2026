-- Add schedule_date to orders — a genuinely separate field from dlv_date
-- ("Required Delivery By"). Nullable, no default, no backfill: starts blank
-- on every existing order and is only filled in as each order is edited
-- going forward.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS schedule_date date;
