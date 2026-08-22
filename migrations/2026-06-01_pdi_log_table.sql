-- Migration: 2026-06-01 — PDI log table (Module 09-B)
-- Append-only PDI entries with pass/fail counts and document attachment support.

CREATE TABLE IF NOT EXISTS public.prod_pdi_logs (
  id              TEXT PRIMARY KEY,               -- PDI-YYYY-NNNNN
  job_card_id     TEXT NOT NULL REFERENCES public.prod_jobs(id),
  pdi_date        DATE NOT NULL,
  pdi_officer     TEXT NOT NULL,
  qty_checked     INTEGER NOT NULL DEFAULT 0,
  passed          INTEGER NOT NULL DEFAULT 0,
  failed          INTEGER NOT NULL DEFAULT 0,
  hold            INTEGER NOT NULL DEFAULT 0,     -- on-hold pending re-check
  remarks         TEXT,
  entered_by      TEXT,
  order_id        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pdi_split_check CHECK (passed + failed + hold = qty_checked)
);

CREATE INDEX IF NOT EXISTS prod_pdi_logs_jc_idx ON public.prod_pdi_logs (job_card_id);

ALTER TABLE public.prod_pdi_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow company access" ON public.prod_pdi_logs;
  EXECUTE $f$
    CREATE POLICY "Allow company access"
    ON public.prod_pdi_logs FOR ALL TO authenticated
    USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
    WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
  $f$;
END $$;

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.prod_pdi_logs';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication not found';
END $$;
