-- Migration: 2026-06-10 — Doer password on team roster
--
-- Shared logins (e.g. accounts@ used by several people) can't be told apart by
-- the Google identity alone. After login the app now asks the person which doer
-- they are and (optionally) a password. The password is hashed client-side
-- (SHA-256) and stored here; the admin sets/clears it from Settings → Team Roster
-- (PIN-gated). NULL/empty = no password required for that doer.
--
-- Practical identity gate for a trusted internal team — not server-verified.

ALTER TABLE team_roster ADD COLUMN IF NOT EXISTS password_hash TEXT;
