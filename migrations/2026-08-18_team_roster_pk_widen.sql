-- Migration: 2026-08-18 — Widen team_roster's primary key to (email, role, display_name)
--
-- SalesIdentityGate (src/components/SalesIdentityGate.tsx) lets two people
-- (Nimisha Pawar, Ruby) share the sales@himalayaterpene.com login. The prior
-- migration (2026-08-18_sales_signatory_roster.sql) had to give them DIFFERENT
-- roles ('Rate Entry' / 'Other') purely to satisfy the old (email, role)
-- primary key — Ruby's actual job is Rate Entry too, same as Nimisha's, so
-- 'Other' was only ever a placeholder to keep the row distinct.
--
-- Widening the PK to (email, role, display_name) lets two people share both
-- the login and the role. updateTeamMember/deleteTeamMember
-- (src/store/index.tsx), TeamRosterManager's keyOf()/dupe-check
-- (src/components/TeamRosterManager.tsx), and the Doer KPI attribution
-- (src/lib/kpi.ts's doerRowKey + memberByIdentityRole) were updated in the
-- same change to key off all three fields, matching this constraint.

ALTER TABLE public.team_roster DROP CONSTRAINT IF EXISTS team_roster_pkey;
ALTER TABLE public.team_roster ADD PRIMARY KEY (email, role, display_name);

-- Ruby now covers Rate Entry (matching Nimisha) instead of the provisional
-- 'Other' placeholder the previous migration used only to satisfy the old PK.
UPDATE public.team_roster
SET role = 'Rate Entry', updated_at = now()
WHERE email = 'sales@himalayaterpene.com' AND role = 'Other' AND display_name = 'Ruby';
