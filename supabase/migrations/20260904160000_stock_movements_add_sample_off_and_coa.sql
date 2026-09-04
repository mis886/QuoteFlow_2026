-- Adds sample_off / coa_file / coa_url to stock_movements, mirroring the
-- columns that already exist on stock_lots (used by Stockbook.tsx /
-- StockLotModal.tsx) — same pattern as no_of_barrels/mou/packing_type: an
-- audit-trail copy on the movement row of what was entered on the Inward
-- form, alongside the live copy on the matching stock_lots row.
--
-- New Inward form now has a "Sample Off" checkbox and a COA picker (search
-- existing coa_document rows by product/lot no., or upload a new
-- certificate — same coa-gc-documents storage bucket and coa_document
-- table already used by the Quotations "Doc" COA panel in
-- AttachmentModal.tsx). Only written to stock_lots when the entry ends up
-- INSERTing a brand-new lot — matching the existing convention that
-- descriptive fields (Make, Remark, Factory Lot Number, No of Barrels,
-- MOU, Packing Type, Packing) are never retroactively overwritten on an
-- already-existing lot.
alter table public.stock_movements
  add column if not exists sample_off boolean,
  add column if not exists coa_file text,
  add column if not exists coa_url text;

notify pgrst, 'reload schema';
