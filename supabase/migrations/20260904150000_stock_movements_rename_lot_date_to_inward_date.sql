-- Renames stock_movements.lot_date -> stock_movements.inward_date.
--
-- Aligns the New Inward form's "Lot Date" field/label with "Inward Date"
-- (both frontend and backend), and matches the existing stock_lots.inward_date
-- column used by the same Inward save flow (NewStockInward.tsx / InwardEditModal.tsx).
--
-- Outward (NewStockOutward.tsx / OutwardEditModal.tsx) keeps its own distinct
-- "Lot Date" label and local form field name — only the underlying DB column
-- key it writes to changes, since the column is shared between both movement
-- types on the same stock_movements table.
alter table public.stock_movements rename column lot_date to inward_date;

notify pgrst, 'reload schema';
