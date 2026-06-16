-- SQL script to establish / maintain Follow-Up Command Centre data integrity

CREATE TABLE IF NOT EXISTS followups (
    id TEXT PRIMARY KEY,
    quote_id TEXT UNIQUE NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    owner TEXT,
    next_date DATE,
    logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to auto-update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_followups_modtime ON followups;
CREATE TRIGGER update_followups_modtime
BEFORE UPDATE ON followups
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add indexes for better querying
CREATE INDEX IF NOT EXISTS idx_followups_quote_id ON followups(quote_id);
CREATE INDEX IF NOT EXISTS idx_followups_next_date ON followups(next_date);

-- Enable RLS if missing
ALTER TABLE followups ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view & edit their company's follow-ups
-- (Modify the policy according to your auth architecture, typically matching quotes)
CREATE POLICY "Enable all for authenticated users" 
ON followups FOR ALL 
USING (auth.role() = 'authenticated') 
WITH CHECK (auth.role() = 'authenticated');
