-- Add negotiations jsonb column to quotes: tracks price/terms negotiation rounds.
-- Each array element: {round, date, requested_by, revised_price?, discount_pct?, notes?, doer, created_at}
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS negotiations jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
