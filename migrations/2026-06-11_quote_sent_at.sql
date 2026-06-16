-- Migration: 2026-06-11 — Quote sent_at (Punched At) for time-lap KPIs
--
-- "Mark Sent" now stamps when a quote was actually sent to the customer. This
-- powers the "Punched At" column in the Quotations Register and the per-doer
-- time-lap KPIs:
--   • DEO        : enquiry received (recv) → punched in (created_at)   = Enquiry Lap
--   • Rate Entry : enquiry punched (created_at) → quote sent (sent_at) = Quote Lap
--
-- enquiries.created_at already exists (default now()); only quotes needs the new
-- sent_at timestamp. Back-fill: existing Sent/Won/Lost quotes get their earliest
-- "Quote sent —" follow-up log time, else their created_at, so historical laps
-- aren't all blank.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Best-effort back-fill from the "Quote sent —" follow-up log timestamp.
UPDATE quotes q
SET sent_at = sub.first_sent
FROM (
  SELECT f.quote_id,
         MIN((l->>'ts')::timestamptz) AS first_sent
  FROM followups f,
       LATERAL jsonb_array_elements(COALESCE(f.logs, '[]'::jsonb)) AS l
  WHERE l->>'note' LIKE 'Quote sent —%'
  GROUP BY f.quote_id
) sub
WHERE q.id = sub.quote_id
  AND q.sent_at IS NULL;

-- Remaining sent-class quotes with no log: fall back to created_at.
UPDATE quotes
SET sent_at = created_at
WHERE sent_at IS NULL
  AND status IN ('Sent', 'Won', 'Lost')
  AND created_at IS NOT NULL;
