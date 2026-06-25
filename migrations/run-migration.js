#!/usr/bin/env node
// Run all pending migrations against the Supabase project.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=<pat> node migrations/run-migration.js
//
// Get a Personal Access Token from:
//   https://app.supabase.com/account/tokens
//
// OR paste the SQL from 2026-06-25_enquiry_created_by.sql directly into the
// Supabase SQL Editor at:
//   https://app.supabase.com/project/nheujyknkqeimgpdfyiw/sql/new

const PROJECT_REF = 'nheujyknkqeimgpdfyiw';
const token = process.env.SUPABASE_ACCESS_TOKEN;

const sql = `
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS insurance NUMERIC DEFAULT 0;
`;

async function run() {
  if (!token) {
    console.error('ERROR: SUPABASE_ACCESS_TOKEN environment variable is not set.\n');
    console.log('Option 1 — Run with token:');
    console.log('  SUPABASE_ACCESS_TOKEN=your_pat node migrations/run-migration.js\n');
    console.log('Option 2 — Paste into Supabase SQL Editor:');
    console.log(sql);
    process.exit(1);
  }

  console.log('Applying migration...');
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
    console.error('Migration failed:', res.status, body);
    process.exit(1);
  }

  console.log('Migration applied successfully.');
}

run().catch(err => { console.error(err); process.exit(1); });
