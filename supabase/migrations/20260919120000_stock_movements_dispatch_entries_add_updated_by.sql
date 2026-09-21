-- 2026-09-19: at the user's request, track who last edited a Stock
-- Movements (Outward) entry and a Dispatch entry, matching the
-- created_by/updated_by pattern stock_lots already has. stock_movements had
-- created_by only (no updated_at/updated_by at all); dispatch_entries had
-- created_by + updated_at but no updated_by. Both are plain additive text/
-- timestamptz columns, nullable, no backfill (historical rows simply show
-- no "Updated By" until they're next edited under the new app code).
--
-- Applied directly against the live database via the Supabase MCP tool
-- before this file was written; this file exists so the migration history
-- in the repo matches what's actually live, per this project's convention
-- (see supabase/migrations/README.md).
alter table stock_movements add column if not exists updated_by text;
alter table stock_movements add column if not exists updated_at timestamptz;
alter table dispatch_entries add column if not exists updated_by text;

notify pgrst, 'reload schema';
