-- Partial dispatch: ONE order keeps ONE Order No. + ONE SO No. and can have
-- MANY dispatch entries (told apart by Invoice No.). The old one-entry-per-order
-- UNIQUE(order_id) constraint is dropped; idx_dispatch_entries_order_id stays
-- for lookups.
--
-- NOTE: this migration has already been applied directly to the live Supabase
-- project (QuoteFlow_EnqBoss / nheujyknkqeimgpdfyiw) via the Supabase MCP
-- tool. It's committed here too so the migrations folder stays in sync with
-- the live schema.

alter table public.dispatch_entries
  drop constraint if exists dispatch_entries_order_id_key;
