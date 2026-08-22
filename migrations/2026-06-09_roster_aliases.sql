-- Migration: 2026-06-09 — Team roster aliases
--
-- Attribution matches a record's doer/owner/who (free text) against the roster.
-- Historically those fields sometimes stored the Google profile NAME of the
-- login (e.g. "Himalaya TerpenesRubber Technologies A" for sc1@himalayaterpene.com) rather
-- than the email or the roster display_name — so the row failed to match and
-- fell back to 'Other'.
--
-- Going forward the app stamps the email. This column lets the office register
-- any additional names/emails a login may appear under (the stray profile name,
-- a nickname, an old email) so existing records still attribute correctly.
-- Stored as a JSONB array of lowercased strings.

ALTER TABLE team_roster ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]'::jsonb;

-- Map the SC_1 login's stray profile name to the roster so existing follow-ups
-- (owner / logs[].who = 'Himalaya Terpenes/ Disha Khurana') attribute to Disha, not 'Other'.
-- Lowercased to match identitiesFor()/roleForDoer() (case-insensitive compare).
-- Idempotent: jsonb_agg(DISTINCT …) won't duplicate or clobber Settings-added aliases.
UPDATE public.team_roster
SET aliases = (
  SELECT jsonb_agg(DISTINCT a)
  FROM jsonb_array_elements_text(
    COALESCE(aliases, '[]'::jsonb) || '["Himalaya Terpenes/ disha khurana"]'::jsonb
  ) AS a
)
WHERE email = 'sc1@himalayaterpene.com' AND role = 'SC_1';
