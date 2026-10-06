-- Stock Summary rename (2026-10-06): renames the old module name to
-- "Stock Summary" in leftover TEXT only — the comment on the stock_lots
-- table (now pointing at src/pages/StockSummary.tsx), and the provenance
-- note on the 7 COA rows from the 2026-09-02 sheet import. No table, column
-- or other object is renamed. Safe to run twice: the second run changes 0 rows.

comment on table public.stock_lots is 'Lot-wise raw-material stock ledger by godown/party (Hariom, Wada-HE, HE, Reliable, Swastik, BALAJI, Wada), migrated from the "Stock Lot Godown Wise" tab of the HIMALAYA STOCK SUMMARY Google Sheet. Managed from src/pages/StockSummary.tsx.';

update public.coa_document
   set notes = regexp_replace(notes, 'stock\s?book', 'Stock Summary', 'gi')
 where notes ~* 'stock\s?book';
