-- Migration: 2026-08-18 — Add missing Authorized Signatory row for Anil Agarwal
--
-- The Authorized Signatory panel on New Enquiry/Quote/Order (see
-- src/store/index.tsx's EMAIL_TO_SIGNATORY) resolves anil@himalayaterpene.com
-- to "Anil Agarwal", but no matching authorized_signatories row existed yet
-- (confirmed live against Supabase, not assumed) — without one, the locked
-- panel would resolve name-only with blank designation/phone. Placeholder
-- designation/phone here per instruction; correct via Settings → Signatories.

INSERT INTO authorized_signatories (id, name, designation, phone, is_default)
SELECT 'sig-' || (extract(epoch from now()) * 1000)::bigint, 'Anil Agarwal', 'TBD — update in Settings → Signatories', '', false
WHERE NOT EXISTS (SELECT 1 FROM authorized_signatories WHERE lower(name) = lower('Anil Agarwal'));
