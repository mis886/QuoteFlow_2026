-- Migration: 2026-06-02 — Job queue position per press
--
-- Until now the moulding queue had no persisted order: when the active job on a
-- press finished, "the next job" was picked arbitrarily (DB row order), and
-- there was no way to push an emergency to the front or move jobs up/down.
--
-- queue_seq gives each queued job an explicit position within its press's
-- queue (lower = sooner). Emergencies are placed at the front (negative / 0),
-- normal jobs append to the end. Reordering just rewrites these values.

ALTER TABLE public.prod_jobs
  ADD COLUMN IF NOT EXISTS queue_seq NUMERIC;   -- queue position within press_id (lower = next)

-- Seed existing queued jobs so they have a stable order: emergency first, then
-- earliest LSD/promised, falling back to id. NULLs sort last in the UI anyway.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY press_id
           ORDER BY (priority = 'emergency') DESC,
                    COALESCE(lsd, promised_date) ASC NULLS LAST,
                    id ASC
         ) AS rn
  FROM public.prod_jobs
  WHERE press_id IS NOT NULL AND stage = 'moulding' AND status = 'queued'
)
UPDATE public.prod_jobs j
SET queue_seq = r.rn
FROM ranked r
WHERE j.id = r.id AND j.queue_seq IS NULL;
