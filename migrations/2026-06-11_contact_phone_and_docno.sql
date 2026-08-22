-- Migration: 2026-06-11 — Contact phone + carry-forward of Cust. Enquiry Doc No
--
-- The contact block (Contact Person · Phone · Email) is now a single row on the
-- Enquiry, Quote and Order forms, and the phone + customer's enquiry doc number
-- carry forward enquiry → quote → order. Previously phone was never stored on
-- these records and orders had no doc-no column.

ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE quotes    ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Orders never stored contact details (only site_id). Add them so the contact
-- person/phone/email and the customer's enquiry doc number carry through and
-- print on the order / Proforma Invoice.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_id          TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact             TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS email               TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_phone       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cust_enquiry_doc_no TEXT;
