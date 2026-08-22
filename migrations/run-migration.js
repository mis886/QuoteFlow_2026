#!/usr/bin/env node
// Apply all pending migrations to the Supabase project.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=<pat> node migrations/run-migration.js
//
// Get a Personal Access Token from:
//   https://app.supabase.com/account/tokens
//
// OR paste each SQL block below directly into the Supabase SQL Editor at:
//   https://app.supabase.com/project/nheujyknkqeimgpdfyiw/sql/new

const PROJECT_REF = 'nheujyknkqeimgpdfyiw';
const token = process.env.SUPABASE_ACCESS_TOKEN;

const migrations = [
  {
    name: '2026-06-25_enquiry_created_by',
    sql: `
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS insurance NUMERIC DEFAULT 0;
`,
  },
  {
    name: '2026-06-26_packing_types',
    sql: `
CREATE TABLE IF NOT EXISTS public.packing_types (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        UNIQUE NOT NULL,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO public.packing_types (name) VALUES
  ('Empty Barrels'),
  ('NEW PVC (PRINTED)'),
  ('NEW PVC (PLANE) 8.2KG sample'),
  ('NEW PVC (PLANE) 8.2 KG'),
  ('NEW PVC (PLANE) 9.5 KG'),
  ('Used NEW PVC (PLANE) TERPI'),
  ('NEW GI(Silver) (Plane) 22 kg'),
  ('NEW GI(Silver) (Lining) 22 kg'),
  ('NEW GI(Silver) (Lining) OLD UN'),
  ('New MS Black epoxy'),
  ('New MS Black epoxy USED'),
  ('New MS Black epoxy REJECTED'),
  ('New MS Black epoxy OLD UN'),
  ('New Cans Terpineol'),
  ('Used barrels of thermic MS'),
  ('MS BARRELS FOR PITCH'),
  ('Hdpe washed'),
  ('Hdpe unwashed'),
  ('IBC Box USED')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.packing_types ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated_read" ON public.packing_types
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_insert" ON public.packing_types
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`,
  },
];

async function applyMigration(name, sql) {
  console.log(`\nApplying: ${name}`);
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`  FAILED (${res.status}):`, body);
    return false;
  }
  console.log(`  OK`);
  return true;
}

async function run() {
  if (!token) {
    console.error('\nERROR: SUPABASE_ACCESS_TOKEN not set.\n');
    console.log('Option 1 — Run with a Personal Access Token:');
    console.log('  SUPABASE_ACCESS_TOKEN=your_pat node migrations/run-migration.js\n');
    console.log('Option 2 — Paste each SQL block into the Supabase SQL Editor:');
    console.log('  https://app.supabase.com/project/nheujyknkqeimgpdfyiw/sql/new\n');
    for (const m of migrations) {
      console.log(`--- ${m.name} ---`);
      console.log(m.sql);
    }
    process.exit(1);
  }

  for (const m of migrations) {
    const ok = await applyMigration(m.name, m.sql);
    if (!ok) process.exit(1);
  }
  console.log('\nAll migrations applied successfully.');
}

run().catch(err => { console.error(err); process.exit(1); });
