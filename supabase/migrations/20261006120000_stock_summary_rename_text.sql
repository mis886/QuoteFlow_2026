-- Stock Summary rename (2026-10-06): the "Stockbook" module is now called
-- "Stock Summary" (src/pages/Stockbook.tsx → src/pages/StockSummary.tsx).
-- This only updates leftover TEXT that still said "Stockbook": the comment
-- on the stock_lots table, and the provenance note on the 7 COA rows from
-- the 2026-09-02 sheet import. No table, column or other object is renamed.

comment on table public.stock_lots is 'Lot-wise raw-material stock ledger by godown/party (Hariom, Wada-HE, HE, Reliable, Swastik, BALAJI, Wada), migrated from the "Stock Lot Godown Wise" tab of the HIMALAYA STOCK SUMMARY Google Sheet. Managed from src/pages/StockSummary.tsx.';

update public.coa_document
   set notes = replace(notes, 'Stockbook', 'Stock Summary')
 where notes ilike '%stockbook%';
