-- Outward DO Numbers are now auto-generated (warehouse-prefixed, sequential
-- per warehouse — e.g. HARI-0001, HARI-0002 — see
-- src/pages/NewStockOutward.tsx's generateNextDoNumber()) instead of
-- hand-typed. This constraint guarantees no two Outward entries ever share a
-- DO Number, even under two people saving for the same warehouse at nearly
-- the same time — save() catches a 23505 unique-violation and retries with a
-- freshly-generated number (see save()'s insertOutwardWithRetry()).
--
-- Existing legacy plain-numeric DO Numbers (e.g. "90", pre-dating this
-- scheme) are untouched and unaffected — this only adds a constraint, it
-- doesn't rename/renumber anything. NULL do_number (every Inward row, which
-- has no DO Number concept) stays unconstrained: Postgres UNIQUE allows any
-- number of NULLs.
--
-- Applied live to project nheujyknkqeimgpdfyiw on 2026-09-09 via
-- mcp__Supabase__apply_migration (migration name: stock_movements_do_number_unique).
alter table public.stock_movements
  add constraint stock_movements_do_number_unique unique (do_number);

notify pgrst, 'reload schema';
