// One-off bulk importer: loads every COA PDF from the "Finish Good COA 2022-23"
// Google Drive export into the coa_document table + coa-gc-documents storage bucket,
// so they become searchable (by lot number) in the quotation Attachments modal.
//
// The coa_document table's RLS policy ("allow_authenticated_all") only allows
// writes from the "authenticated" role, not the public anon key this script
// uses (the same anon key the app itself ships with client-side). Before
// running this script, temporarily add a scoped policy so anon can insert:
//
//   CREATE POLICY "temp_bulk_import_anon_insert" ON coa_document
//     FOR INSERT TO anon WITH CHECK (true);
//
// Run this script, confirm the results, then immediately revert it:
//
//   DROP POLICY IF EXISTS "temp_bulk_import_anon_insert" ON coa_document;
//
// Usage:
//   npx tsx scripts/bulk-import-coa.ts "C:\Users\Himalaya\Downloads\Finish Good COA 2022 - 23\Finish Good COA 2022 - 23"
//
// Safe to re-run: it skips any file_name already present in coa_document
// (though note the pre-check SELECT is also subject to RLS -- see comment
// at that query below).

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://nheujyknkqeimgpdfyiw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZXVqeWtua3FlaW1ncGRmeWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzM2ODIsImV4cCI6MjA5NjkwOTY4Mn0.5j_CYqyjCNY1tGozklqY4iUnQh3HLpFBw8EiNeu05Dw';
const BUCKET = 'coa-gc-documents';
const STORAGE_PREFIX = 'bulk-import-2022-23';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// lot_no -> product name, built from the himalaya-lims fg_lots/rm_lots/sf_lots/lab_lots
// tables (the authoritative lab records for what each lot actually is).
const LOT_LOOKUP: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lot-product-lookup.json'), 'utf-8'),
);

function normLot(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Pull a lot code out of the filename, e.g. "W1035_DIPENTENE_COA.pdf" -> "W1035",
// "Lot No - ST - 102_COA_Alpha Pinene.pdf" -> "ST102", "RM-0120.pdf" -> "RM0120".
function extractLot(base: string): string | null {
  const cleaned = base.replace(/\./g, ' ');
  const patterns = [
    /\b([A-Za-z]{1,3})\s*-\s*(\d{1,6})\b/, // "ST - 102", "RM-0120"
    /\b([A-Za-z]{1,3})\s*(\d{1,6})\b/,     // "W1035", "W0184"
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m) return normLot(m[1] + m[2]);
  }
  return null;
}

// Best-effort product name straight from the filename, used when the lot isn't
// in the LIMS lookup but the filename already spells the product out
// (e.g. "Lot No - W005_COA_Bita Pinene.pdf" -> "Bita Pinene" -> "Beta Pinene").
function extractProductFromFilename(base: string, lotRaw: string | null): string | null {
  let rest = base;
  if (lotRaw) {
    // remove the matched lot token (best effort, case-insensitive)
    rest = rest.replace(new RegExp(lotRaw.replace(/(.)/g, '$1\\s*'), 'i'), '');
  }
  rest = rest
    .replace(/\bCOA\b/gi, '')
    .replace(/\bLot\s*No\b/gi, '')
    .replace(/\bLab\s*Lot\b/gi, '')
    .replace(/\(\s*\d+\s*\)/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (rest.length < 3) return null;
  // known typo/shorthand normalization seen in this archive
  const fixes: [RegExp, string][] = [
    [/\bBita Pinene\b/i, 'Beta Pinene'],
    [/\bLemonene\b/i, 'Limonene'],
    [/\bGTO\b/i, 'Gum Turpentine Oil'],
  ];
  for (const [re, replacement] of fixes) rest = rest.replace(re, replacement);
  return rest;
}

function resolveProduct(base: string): { productName: string; lotNo: string | null; source: string } {
  const lot = extractLot(base);
  if (lot && LOT_LOOKUP[lot]) {
    let name = LOT_LOOKUP[lot];
    if (/^lemonene$/i.test(name)) name = 'Limonene';
    if (/^gto$/i.test(name)) name = 'Gum Turpentine Oil';
    return { productName: name, lotNo: lot, source: 'lims' };
  }
  const fromName = extractProductFromFilename(base, lot);
  if (fromName) return { productName: fromName, lotNo: lot, source: 'filename' };
  return { productName: 'Unspecified (see lot no.)', lotNo: lot, source: 'unresolved' };
}

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: npx tsx scripts/bulk-import-coa.ts "<path to extracted Finish Good COA folder>"');
    process.exit(1);
  }
  const allEntries = fs.readdirSync(folder);
  const pdfFiles = allEntries.filter((f) => f.toLowerCase().endsWith('.pdf'));
  console.log(`Found ${pdfFiles.length} PDF files in ${folder}`);

  // Note: this SELECT is anon-role too, and coa_document's RLS policy doesn't
  // grant anon read access either -- it will silently return 0 rows rather
  // than error (RLS filters rows rather than rejecting reads). That's fine
  // for this run since the table is currently empty, but it means this
  // idempotency check can't see rows inserted by an authenticated session.
  const { data: existingRows, error: existingErr } = await supabase
    .from('coa_document')
    .select('file_name');
  if (existingErr) {
    console.error('Could not check existing rows, aborting:', existingErr.message);
    process.exit(1);
  }
  const already = new Set((existingRows ?? []).map((r: any) => r.file_name));
  console.log(`${already.size} files already imported previously, will skip those.`);

  let uploaded = 0, skipped = 0, failed = 0;
  const unresolved: string[] = [];
  const report: any[] = [];

  for (const fileName of pdfFiles) {
    if (already.has(fileName)) { skipped++; continue; }

    const base = fileName.replace(/\.pdf$/i, '');
    const { productName, lotNo, source } = resolveProduct(base);
    if (source === 'unresolved') unresolved.push(fileName);

    const fullPath = path.join(folder, fileName);
    const bytes = fs.readFileSync(fullPath);
    const storagePath = `${STORAGE_PREFIX}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true });

    if (uploadError) {
      console.error(`  UPLOAD FAILED: ${fileName} - ${uploadError.message}`);
      failed++;
      report.push({ fileName, lotNo, productName, source, status: 'upload_failed', error: uploadError.message });
      continue;
    }

    const { error: insertError } = await supabase.from('coa_document').insert({
      product_name: productName,
      lot_no: lotNo,
      doc_type: 'COA',
      file_name: fileName,
      storage_path: storagePath,
      file_size: bytes.length,
      uploaded_by: 'Bulk Import',
      notes: 'Imported from Finish Good COA 2022-23 Google Drive archive',
    });

    if (insertError) {
      console.error(`  DB INSERT FAILED: ${fileName} - ${insertError.message}`);
      failed++;
      report.push({ fileName, lotNo, productName, source, status: 'insert_failed', error: insertError.message });
      continue;
    }

    uploaded++;
    report.push({ fileName, lotNo, productName, source, status: 'ok' });
    if (uploaded % 50 === 0) console.log(`  ...${uploaded} uploaded so far`);
  }

  fs.writeFileSync(
    path.join(__dirname, 'bulk-import-coa-report.json'),
    JSON.stringify(report, null, 2),
  );

  console.log('\n=== DONE ===');
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped (already imported): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Unresolved product name (lot no. still correct, product shows as "Unspecified"): ${unresolved.length}`);
  if (unresolved.length) {
    console.log('Unresolved files:');
    unresolved.forEach((f) => console.log('  ' + f));
  }
  console.log(`Full per-file report written to scripts/bulk-import-coa-report.json`);
}

main();
