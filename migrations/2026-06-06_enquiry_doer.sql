-- Track who submitted each entry (email of logged-in user at time of creation)
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS doer TEXT;
ALTER TABLE quotes    ADD COLUMN IF NOT EXISTS doer TEXT;
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS doer TEXT;

-- Carry contact details through the enquiry → quote → order chain
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contact_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contact   TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS email     TEXT;
