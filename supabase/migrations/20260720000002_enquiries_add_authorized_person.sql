-- Add authorized_person jsonb column to enquiries, matching the same shape
-- already used on quotes.authorized_person and orders.authorized_person.
-- The existing assigned (text) column is left intact.
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS authorized_person jsonb;
