# supabase/migrations — Schema Change Tracking

**Project:** EnqBoss / QuoteFlow 2026  
**Supabase project ID:** `nheujyknkqeimgpdfyiw` (region: ap-south-1)  
**Live app:** https://quoteflow--2026.mis-c9a.workers.dev

---

## What this folder is

A **paper trail of every database schema change** applied to the live Supabase project, kept alongside the frontend code that depends on it.

This folder is **not** a migration runner. There is no CLI command or CI step that reads these files. No Supabase CLI is installed or configured for this project. Files here are never executed automatically.

---

## Why it exists

Every table in this project was created by running SQL directly against the live Supabase project (via the Supabase MCP tool or the dashboard SQL editor), with no file left behind. This made it hard to:

- See what the schema looks like without querying `information_schema`
- Understand *why* a column exists or when it was added
- Diagnose bugs caused by missing columns or mismatched field names

The rule going forward: **if you touch the database schema, you write a file here**.

---

## File naming convention

```
YYYYMMDDHHMMSS_short_description.sql
```

Examples:
```
20260701000000_baseline_schema.sql
20260701120000_add_customer_type_to_customers.sql
20260715000000_add_indexes_to_enquiries.sql
```

Use UTC for the timestamp. The description should be a concise slug of what changed, not who changed it or what ticket it relates to.

---

## How to add a new migration file

1. Apply the SQL to the live Supabase project (via MCP tool, dashboard, etc.).
2. Write the **exact SQL that was run** into a new timestamped file in this folder.
3. Commit the file **in the same commit** as any frontend code that depends on the change.
4. Write the commit message to explain **why** the change was made, not just what — e.g.:
   - ✓ `fix: add missing columns to orders so contact/unit/bank fields persist (previously silently dropped)`
   - ✗ `chore: alter orders table`

---

## What to include in a migration file

- The exact DDL that was run (`CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `CREATE INDEX`, etc.)
- Any matching RLS policy changes (`CREATE POLICY`, `DROP POLICY`)
- A `NOTIFY pgrst, 'reload schema';` line at the end if the change needs PostgREST to pick it up immediately
- A short comment at the top explaining what the change is for and why

---

## What NOT to include

- Data migrations (INSERT / UPDATE / DELETE on live data) — those belong in scripts, not here
- Changes to the `prod_*` production-floor tables unless they affect the quoting/ordering/sampling flow
- Changes that were never actually applied (drafts, abandoned ideas)

---

## Reading the schema

To see the current live schema without relying on these files, query `information_schema` directly:

```sql
-- Columns for a table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;

-- RLS policies
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'orders';
```

These files are snapshots; the live database is always authoritative.

---

## For AI agents working on this repo

When you apply a schema change via `mcp__claude_ai_Supabase__apply_migration` or `mcp__claude_ai_Supabase__execute_sql` (DDL only — not data queries):

1. Write the SQL into a new file here using the naming convention above.
2. Include the file in the same commit as any code changes that depend on it.
3. If a migration is part of a bug fix, the commit message should describe the bug that was fixed, not just the DDL.

The baseline file `20260701000000_baseline_schema.sql` captures the schema state as of 2026-07-01. All files after that date document incremental changes only.
