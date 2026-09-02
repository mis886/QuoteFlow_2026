// One-off uploader: pushes the 7 COA PDFs that were found in Google Drive to
// fill the last gaps in Stockbook's COA column, into Supabase Storage at the
// exact paths already recorded in coa_document.storage_path / stock_lots.coa_url.
//
// Background: on 2026-09-02 the coa_document rows and stock_lots.coa_url
// values for these 7 files were inserted directly via SQL (from a session
// that couldn't reach supabase.co over the network to upload the actual
// bytes). So the DB already points at these storage paths -- this script's
// only job is to make sure a real file exists at each path. It intentionally
// does NOT touch the database.
//
// The coa-gc-documents bucket's storage.objects INSERT policy allows the
// public/anon role (bucket_id = 'coa-gc-documents' is the only check), same
// as scripts/bulk-import-coa.ts already relies on -- no auth workaround
// needed here.
//
// Usage (from the repo root, with real npm/node):
//   npx tsx scripts/upload-sheet-import-coa.ts

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://nheujyknkqeimgpdfyiw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZXVqeWtua3FlaW1ncGRmeWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzM2ODIsImV4cCI6MjA5NjkwOTY4Mn0.5j_CYqyjCNY1tGozklqY4iUnQh3HLpFBw8EiNeu05Dw';
const BUCKET = 'coa-gc-documents';
const STORAGE_PREFIX = 'sheet-import-2026-09';
const SOURCE_DIR = path.join(__dirname, 'coa-pdfs-to-upload');

// Must exactly match the storage_path values already inserted into
// coa_document / stock_lots.coa_url for these 7 files.
const FILES = [
  'H0046.pdf',
  '240503.pdf',
  'H0456.pdf',
  'W1034_PINE OIL 511_COA.pdf',
  'W1036_PINE OIL 85_COA.pdf',
  'Terpinyl Acetate-260346.pdf',
  '240437.pdf',
];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log(`Uploading ${FILES.length} COA PDFs from ${SOURCE_DIR} to ${BUCKET}/${STORAGE_PREFIX}/ ...`);

  let uploaded = 0, failed = 0;

  for (const fileName of FILES) {
    const fullPath = path.join(SOURCE_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      console.error(`  MISSING LOCAL FILE: ${fullPath} (skipping)`);
      failed++;
      continue;
    }
    const bytes = fs.readFileSync(fullPath);
    const storagePath = `${STORAGE_PREFIX}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      console.error(`  UPLOAD FAILED: ${fileName} - ${uploadError.message}`);
      failed++;
      continue;
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    console.log(`  OK: ${fileName} (${bytes.length} bytes) -> ${pub.publicUrl}`);
    uploaded++;
  }

  console.log('\n=== DONE ===');
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);
  if (uploaded > 0) {
    console.log(`\nThese should now open from the Stockbook COA column for: H0046, 240503, 260322 (H0456.pdf), W1034, W1036 (x2 lots), 260346, 240437.`);
  }
}

main();
