-- Adds a resolved, clickable Supabase Storage URL for each stock lot's COA
-- PDF. stock_lots.coa_file held only the filename text carried over from the
-- "Stock Lot Godown Wise" sheet (e.g. "W0821.pdf") with no way to actually
-- open the document. Most of those PDFs already exist in Storage (bucket
-- coa-gc-documents, public) via the pre-existing coa_document table, from an
-- earlier bulk import — they just weren't linked from stock_lots.
--
-- coa_url is populated by a one-off data fix (matched by exact filename,
-- then by wh_lot_no/fact_lot_no against coa_document.lot_no), not by this
-- migration, per this repo's convention that data migrations don't live in
-- the migrations folder. Rows where no matching document could be found
-- keep coa_url = null; the UI falls back to showing the plain coa_file text
-- for those.

ALTER TABLE stock_lots ADD COLUMN IF NOT EXISTS coa_url text;

COMMENT ON COLUMN stock_lots.coa_url IS 'Public Supabase Storage URL (bucket coa-gc-documents) for the actual COA PDF, resolved from coa_document. Populated where a matching document exists; null means no PDF has been uploaded for this lot yet — coa_file still holds the filename text from the sheet.';
