-- wh_lot_no was NOT NULL from the original Inward-only stock_movements
-- table, where Lot No is a required field. The Outward form (Delivery
-- Order Sale) treats Lot No as optional — a DO can be logged without a
-- known warehouse lot — so the constraint is loosened here rather than
-- forcing a placeholder value into outward rows with no real lot number.

alter table public.stock_movements alter column wh_lot_no drop not null;

notify pgrst, 'reload schema';
