-- Migration: 2026-08-18 — sales@ team_roster rows for the signatory PIN gate
--
-- Feature: SalesIdentityGate (src/components/SalesIdentityGate.tsx) asks
-- sales@himalayaterpene.com to pick "Nimisha Pawar" or "Ruby" after Google
-- login, then PIN-gates (enroll-on-first-use, verify thereafter) so the
-- Authorized Signatory panel can resolve to the actual person, not a shared
-- generic identity.
--
-- team_roster's primary key is (email, role) — two rows can't share a role
-- under the same email, and critically, updateTeamMember(email, role, ...)
-- addresses rows by that same pair, so sharing a role would make saving one
-- person's PIN silently overwrite the other's. Nimisha Pawar keeps 'Rate
-- Entry' (the role the generic row it replaces already had); Ruby gets
-- 'Other' as a clearly provisional placeholder — correct via Settings ->
-- Team Roster if a different role is actually correct for her KPI
-- attribution, this migration only needs the roles to be distinct.
--
-- Replaces the existing generic (sales@, 'Rate Entry') -> "Sales
-- Coordinator" row per confirmed decision, rather than adding alongside it.

DELETE FROM team_roster
WHERE email = 'sales@himalayaterpene.com' AND role = 'Rate Entry' AND display_name = 'Sales Coordinator';

INSERT INTO team_roster (email, role, display_name, active, password_hash)
VALUES
  ('sales@himalayaterpene.com', 'Rate Entry', 'Nimisha Pawar', true, NULL),
  ('sales@himalayaterpene.com', 'Other',      'Ruby',          true, NULL)
ON CONFLICT (email, role) DO NOTHING;
