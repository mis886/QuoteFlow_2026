-- Migration: 2026-06-02 — Finished-Goods (surplus) stock ledger
--
-- Over-production used to be stranded: passed-but-unordered units sat forever as
-- "ready" on the original job card, and a new order for the same product started
-- a fresh job from zero with no way to consume the surplus.
--
-- This append-only ledger records FG stock movements keyed by FAMILY CODE
-- (Type_Model_MOC), so any future order for the same family can draw it down
-- before moulding the balance. Per-family on-hand = SUM(qty).
--   +qty  movement='surplus_in'    surplus posted to stock from a finished job
--   -qty  movement='order_consume' allocated to a new production job
--   ±qty  movement='adjust'        manual correction

CREATE TABLE IF NOT EXISTS public.prod_fg_stock (
  id           TEXT PRIMARY KEY,            -- FG-<epoch>-<rand>
  family_code  TEXT NOT NULL,              -- Type_Model_MOC — the match key
  product_id   TEXT,                       -- best-known product at time of movement
  job_card_id  TEXT,                       -- job that produced the surplus (surplus_in)
  ref_job_id   TEXT,                       -- job that consumed the stock (order_consume)
  qty          NUMERIC NOT NULL,           -- signed: + in, - out
  movement     TEXT NOT NULL,              -- 'surplus_in' | 'order_consume' | 'adjust'
  note         TEXT,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_fg_stock_family_idx ON public.prod_fg_stock (family_code);

ALTER TABLE public.prod_fg_stock ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow company access" ON public.prod_fg_stock;
  EXECUTE $f$
    CREATE POLICY "Allow company access"
    ON public.prod_fg_stock FOR ALL TO authenticated
    USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
    WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
  $f$;
END $$;

DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.prod_fg_stock';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication not found';
END $$;
