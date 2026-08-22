-- Run this in your Supabase SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS throughout

-- 1. Ensure 'quotes' table has the 'attachments' JSONB column
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 2. Ensure 'orders' table has the 'attachments' JSONB column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 3. Ensure 'enquiries' table has the 'attachments' JSONB column (if not already present)
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 4. Supabase Storage: Set up proper RLS for the 'Docs' bucket
-- (Make sure you have created the bucket 'Docs' in Storage > Buckets, with Public=False)

DROP POLICY IF EXISTS "Allow authenticated uploads"   ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates"   ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated downloads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes"   ON storage.objects;

CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'Docs' );

CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'Docs' );

CREATE POLICY "Allow authenticated downloads"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'Docs' );

CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'Docs' );

-- 5. APP SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.app_settings (
    id TEXT PRIMARY KEY DEFAULT 'config',
    header_url TEXT,
    sig_name TEXT DEFAULT 'Akash Gupta',
    sig_des TEXT DEFAULT 'Rubber Technologist',
    sig_phone TEXT DEFAULT '+91-817171 6630',
    sig_url TEXT,
    bank_name TEXT DEFAULT 'ICICI BANK LTD.',
    bank_acc TEXT DEFAULT '0000000000',
    bank_ifsc TEXT DEFAULT 'ICIC0000000',
    bank_swift TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow company access" ON public.app_settings;
CREATE POLICY "Allow company access"
ON public.app_settings FOR ALL TO authenticated
USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');

-- Seed initial config
INSERT INTO public.app_settings (id) VALUES ('config') ON CONFLICT (id) DO NOTHING;

-- 6. PUBLIC ASSETS BUCKET POLICIES (optional — only needed if you created the bucket)
-- (Make sure you have created the bucket 'public-assets' in Storage > Buckets, with Public=True)

DROP POLICY IF EXISTS "Allow authenticated uploads to public assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow public select from public assets"        ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to public assets"  ON storage.objects;

CREATE POLICY "Allow authenticated uploads to public assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'public-assets' );

CREATE POLICY "Allow public select from public assets"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'public-assets' );

CREATE POLICY "Allow authenticated updates to public assets"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'public-assets' );

-- 7. AUTHORIZED SIGNATORIES TABLE
CREATE TABLE IF NOT EXISTS public.authorized_signatories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    designation TEXT NOT NULL,
    phone TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.authorized_signatories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow company access" ON public.authorized_signatories;
CREATE POLICY "Allow company access"
ON public.authorized_signatories FOR ALL TO authenticated
USING  (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com')
WITH CHECK (auth.jwt() ->> 'email' LIKE '%@himalayaterpene.com');