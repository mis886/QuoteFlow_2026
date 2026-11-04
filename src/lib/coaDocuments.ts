// The shared COA / GC library: `coa_document` rows, files in the
// `coa-gc-documents` storage bucket. 2026-11-04: moved here from
// NewDispatchEntry.tsx (its COA picker) so the quotation "Email to Client"
// window (SendEmailModal) lists, searches and uploads them the same way.
import { supabase, uploadPublicFile, resolveCoaStorageUrl } from './supabase';
import { fetchAllRows } from './fetchAll';

export const COA_BUCKET = 'coa-gc-documents';

export interface CoaDocRow {
  id: string;
  product_name: string | null;
  lot_no: string | null;
  doc_type: string;
  file_name: string;
  storage_path: string;
  created_at: string;
}

const baseQuery = (signal?: AbortSignal) => {
  const q = supabase.from('coa_document').select('*').order('created_at', { ascending: false }).order('id');
  return signal ? q.abortSignal(signal) : q;
};

// PostgREST's or=() filter treats , ( ) as syntax — drop them from typed text.
const orSafe = (term: string) => term.replace(/[,()]/g, ' ').trim();

/**
 * Newest first. No term → the latest `limit` rows. A term → every row whose
 * product name or lot no. (and, with `fileName`, file name) contains it.
 */
export function searchCoaDocuments(term: string, opts: { signal?: AbortSignal; fileName?: boolean; limit?: number } = {}): PromiseLike<{ data: any[] | null; error: any }> {
  const t = orSafe(term);
  if (!t) return baseQuery(opts.signal).limit(opts.limit ?? 20);
  const cols = ['product_name', 'lot_no', ...(opts.fileName ? ['file_name'] : [])];
  return fetchAllRows(() => baseQuery(opts.signal).or(cols.map(c => `${c}.ilike.%${t}%`).join(',')));
}

const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();

/** Rows whose product name IS `productName` (case-insensitive, trimmed), newest first. */
export async function coaDocumentsForProduct(productName: string): Promise<CoaDocRow[]> {
  const name = productName.trim();
  if (!name) return [];
  // ilike with % on both sides finds names with stray spaces too; the exact
  // (trimmed, lower-case) match is checked here.
  const pattern = `%${name.replace(/[\\%_]/g, m => `\\${m}`)}%`;
  const { data, error } = await fetchAllRows(() => baseQuery().ilike('product_name', pattern));
  if (error) throw error;
  return ((data ?? []) as CoaDocRow[]).filter(r => norm(r.product_name) === norm(name));
}

/**
 * Uploads a COA / GC file to the bucket and records it in coa_document
 * (same as NewDispatchEntry's "Upload New"). Returns the new row.
 */
export async function uploadCoaDocument({ file, productName, lotNo, docType = 'COA', uploadedBy, notes }: {
  file: File;
  productName: string;
  lotNo?: string | null;
  docType?: 'COA' | 'GC';
  uploadedBy?: string | null;
  notes?: string;
}): Promise<CoaDocRow> {
  const ext = file.name.split('.').pop() || 'bin';
  const safeProductName = productName.replace(/[^a-zA-Z0-9]/g, '_');
  const path = `${docType}/${safeProductName}_${Date.now()}.${ext}`;
  const { data: url, error: uploadError } = await uploadPublicFile(COA_BUCKET, path, file);
  if (uploadError || !url) throw uploadError || new Error('Upload failed');

  const { data: row, error: insertError } = await supabase.from('coa_document').insert({
    product_name: productName,
    lot_no: lotNo?.trim() || null,
    doc_type: docType,
    file_name: file.name,
    storage_path: url,
    file_size: file.size,
    uploaded_by: uploadedBy ?? null,
    notes: notes ?? null,
  }).select().single();
  if (insertError || !row) throw insertError || new Error('Could not save document reference');
  return row as CoaDocRow;
}

/** The file's fetchable public URL (storage_path is a full URL or a bare bucket path). */
export const coaFileUrl = (storagePath: string) => resolveCoaStorageUrl(storagePath);
