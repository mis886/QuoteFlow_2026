-- Remove accidental duplicate quotes created via the old "Create New Anyway"
-- override on the Enquiry->Quote warning dialog (now removed from the UI).
-- Both are orphans: no order was ever created from either of them.

-- ENQ-2026-789's q_ref pointed at the duplicate being removed; repoint it to
-- the surviving quote (HTP-2026-748, which carries the order).
UPDATE enquiries SET q_ref = 'HTP-2026-748'
  WHERE id = 'ENQ-2026-789' AND q_ref = 'HTP-2026-747';

-- Drop the duplicates' follow-ups (FK is ON DELETE SET NULL, which would
-- otherwise leave them orphaned — HTP-2026-747's was still open).
-- activity_log history is kept as audit trail.
DELETE FROM followups WHERE id IN ('HTP-2026-598', 'HTP-2026-747');

DELETE FROM quotes WHERE id IN ('HTP-2026-598', 'HTP-2026-747');

-- Enforce strict 1:1 at the database level: one quote per enquiry.
-- Partial index so it only applies to rows that actually have an enq_ref.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_enq_ref_unique
  ON quotes (enq_ref)
  WHERE enq_ref IS NOT NULL;
