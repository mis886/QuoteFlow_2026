-- ============================================================
-- MRT ERP – Migration: May 2025
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

-- 1. FIX RLS on authorized_signatories
-- The original policy used only USING (no WITH CHECK), which blocks INSERT.
-- Drop and recreate with both clauses.
DROP POLICY IF EXISTS "Allow company access" ON public.authorized_signatories;
CREATE POLICY "Allow company access"
ON public.authorized_signatories
FOR ALL TO authenticated
USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');

-- 2. Add missing columns to quotes table
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS authorized_person JSONB,
  ADD COLUMN IF NOT EXISTS terms             TEXT;

-- 3. Add missing columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS authorized_person JSONB,
  ADD COLUMN IF NOT EXISTS terms             TEXT,
  ADD COLUMN IF NOT EXISTS inco              TEXT,
  ADD COLUMN IF NOT EXISTS attachments       JSONB DEFAULT '[]'::jsonb;

-- 4. Ensure customers table has trading-terms columns
--    (Safe to run even if columns already exist)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS inco TEXT,
  ADD COLUMN IF NOT EXISTS curr TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS pay  TEXT DEFAULT '30 days';

-- 5. Also add custEnqDocNo to enquiries (referenced in types.ts)
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS cust_enq_doc_no TEXT;

-- 6. Fix RLS WITH CHECK for all other core tables
--    (Prevents the same INSERT-blocking bug if policies are ever re-created)
DROP POLICY IF EXISTS "Allow company access" ON public.quotes;
CREATE POLICY "Allow company access"
ON public.quotes
FOR ALL TO authenticated
USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Allow company access" ON public.orders;
CREATE POLICY "Allow company access"
ON public.orders
FOR ALL TO authenticated
USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Allow company access" ON public.customers;
CREATE POLICY "Allow company access"
ON public.customers
FOR ALL TO authenticated
USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Allow company access" ON public.enquiries;
CREATE POLICY "Allow company access"
ON public.enquiries
FOR ALL TO authenticated
USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.followups;
DROP POLICY IF EXISTS "Allow company access" ON public.followups;
CREATE POLICY "Allow company access"
ON public.followups
FOR ALL TO authenticated
USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');