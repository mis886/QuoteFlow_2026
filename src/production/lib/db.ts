// ─────────────────────────────────────────────────────────────────
// Production (BETA) — Supabase data access
// All queries hit `prod_*` tables only. Beta is read-only on CRM.
// ─────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase';
import type {
  Press, ProductionJob, Worker, NCR, ShopFloorSettings,
  JobStage, Compound, Product, BOMRow,
  MoldingSession, FinishingSession, InspectionSession,
  Dispatch, DispatchItem, ProdAttachment, PdiLog,
  ProdOption, ProdOptionField,
  FgStockRow,
} from './types';

// ── Presses ────────────────────────────────────────────────────────
export async function listPresses(): Promise<Press[]> {
  const { data, error } = await supabase
    .from('prod_presses')
    .select('*')
    .order('id');
  if (error) { console.error('listPresses', error); return []; }
  return data || [];
}

export async function insertPress(p: Partial<Press>): Promise<Press> {
  const { data, error } = await supabase
    .from('prod_presses')
    .insert(p)
    .select()
    .single();
  if (error) throw error;
  return data as Press;
}

export async function updatePress(id: string, patch: Partial<Press>) {
  const { error } = await supabase
    .from('prod_presses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePress(id: string) {
  const { error } = await supabase
    .from('prod_presses')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Jobs ───────────────────────────────────────────────────────────
export async function listJobs(): Promise<ProductionJob[]> {
  const { data, error } = await supabase
    .from('prod_jobs')
    .select('*')
    .order('promised_date', { ascending: true, nullsFirst: false });
  if (error) { console.error('listJobs', error); return []; }
  return data || [];
}

export async function insertJob(job: ProductionJob): Promise<ProductionJob> {
  const { data, error } = await supabase
    .from('prod_jobs')
    .insert(job)
    .select()
    .single();
  if (error) throw error;
  return data as ProductionJob;
}

export async function updateJob(id: string, patch: Partial<ProductionJob>) {
  const { error } = await supabase
    .from('prod_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function logStageEvent(
  job_id: string,
  to_stage: JobStage,
  from_stage: JobStage | null,
  actor: string | null = null,
  notes: string | null = null
) {
  await supabase.from('prod_job_stage_events').insert({
    job_id, from_stage, to_stage, actor, notes,
  });
}

// ── Workers ────────────────────────────────────────────────────────
export async function listWorkers(): Promise<Worker[]> {
  const { data, error } = await supabase
    .from('prod_workers')
    .select('*')
    .order('id');
  if (error) { console.error('listWorkers', error); return []; }
  return data || [];
}

export async function setWorkerPresent(id: string, present: boolean) {
  const { error } = await supabase
    .from('prod_workers')
    .update({ present, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function insertWorker(w: Worker): Promise<Worker> {
  const { data, error } = await supabase
    .from('prod_workers')
    .insert(w)
    .select()
    .single();
  if (error) throw error;
  return data as Worker;
}

export async function updateWorker(id: string, patch: Partial<Worker>) {
  const { error } = await supabase
    .from('prod_workers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteWorker(id: string) {
  const { error } = await supabase
    .from('prod_workers')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── NCRs ───────────────────────────────────────────────────────────
export async function listNCRs(): Promise<NCR[]> {
  const { data, error } = await supabase
    .from('prod_ncrs')
    .select('*')
    .order('raised_at', { ascending: false });
  if (error) { console.error('listNCRs', error); return []; }
  return data || [];
}

export async function insertNCR(ncr: NCR) {
  const { error } = await supabase.from('prod_ncrs').insert(ncr);
  if (error) throw error;
}

// ── Shop-floor settings ────────────────────────────────────────────
export async function getShopFloorSettings(): Promise<ShopFloorSettings | null> {
  const { data, error } = await supabase
    .from('prod_shop_floor_settings')
    .select('*')
    .eq('id', 'config')
    .single();
  if (error && error.code !== 'PGRST116') {
    console.error('getShopFloorSettings', error);
    return null;
  }
  return data || null;
}

export async function updateShopFloorSettings(patch: Partial<ShopFloorSettings>) {
  const { error } = await supabase
    .from('prod_shop_floor_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 'config');
  if (error) throw error;
}

// ── Options (editable dropdown master) ─────────────────────────────
export async function listOptions(): Promise<ProdOption[]> {
  const { data, error } = await supabase
    .from('prod_options')
    .select('*')
    .order('field')
    .order('sort')
    .order('value');
  if (error) { console.error('listOptions', error); return []; }
  return (data as ProdOption[]) || [];
}

export async function insertOption(o: Partial<ProdOption> & { field: ProdOptionField; value: string }): Promise<ProdOption> {
  const row = { id: o.id || `opt-${Date.now().toString(36)}`, ...o };
  const { data, error } = await supabase
    .from('prod_options')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as ProdOption;
}

export async function updateOption(id: string, patch: Partial<ProdOption>) {
  const { error } = await supabase.from('prod_options').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteOption(id: string) {
  const { error } = await supabase.from('prod_options').delete().eq('id', id);
  if (error) throw error;
}

// Inline "add new" from a dropdown: insert unless a value already exists for the
// field (case-insensitive). Returns the row, or null if it already existed.
export async function upsertOptionValue(
  field: ProdOptionField, value: string, meta?: { unit?: string } | null,
): Promise<ProdOption | null> {
  const v = value.trim();
  if (!v) return null;
  try {
    return await insertOption({ field, value: v, meta: meta ?? null });
  } catch (e: any) {
    // 23505 = unique_violation (field + lower(value) already present) → fine.
    if (e?.code === '23505') return null;
    throw e;
  }
}

// ── Compounds ──────────────────────────────────────────────────────
export async function listCompounds(): Promise<Compound[]> {
  const { data, error } = await supabase
    .from('prod_compounds')
    .select('*')
    .order('code');
  if (error) { console.error('listCompounds', error); return []; }
  return data || [];
}

export async function upsertCompound(c: Partial<Compound> & { id: string }): Promise<Compound> {
  const { data, error } = await supabase
    .from('prod_compounds')
    .upsert({ ...c, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as Compound;
}

export async function deleteCompound(id: string) {
  const { error } = await supabase.from('prod_compounds').delete().eq('id', id);
  if (error) throw error;
}

// ── Products ───────────────────────────────────────────────────────
export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('prod_products')
    .select('*')
    .order('code');
  if (error) { console.error('listProducts', error); return []; }
  return data || [];
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('prod_products')
    .select('*')
    .eq('id', id)
    .single();
  if (error) { console.error('getProduct', error); return null; }
  return data as Product;
}

export async function upsertProduct(p: Partial<Product> & { id: string; code: string; name: string }): Promise<Product> {
  const { data, error } = await supabase
    .from('prod_products')
    .upsert({ ...p, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from('prod_products').delete().eq('id', id);
  if (error) throw error;
}

// Next free unique product code for a family base, e.g. given 'GCH_S121_NBR'
// returns 'GCH_S121_NBR-1', then '-2', … skipping codes already taken.
export function nextFamilyCode(familyBase: string, existingCodes: Iterable<string>): string {
  const base = (familyBase || 'PRD').trim().toUpperCase().replace(/-\d+$/, '');
  const taken = new Set(existingCodes);
  for (let n = 1; n < 100000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`;
}

// Clone a product as a new variant within the same family (same family_code),
// generating a unique `code` (next free FAMILY-N suffix) and copying its BOM.
// Returns the new product.
export async function duplicateProduct(id: string): Promise<Product> {
  const src = await getProduct(id);
  if (!src) throw new Error('Source product not found');

  const all = await listProducts();
  const existingCodes = all.map(p => p.code);
  const base = (src.family_code || src.code).replace(/-\d+$/, '');
  const newCode = nextFamilyCode(base, existingCodes);

  const newId = `P${Date.now().toString(36).toUpperCase()}`;
  const { id: _id, created_at, updated_at, ...rest } = src;
  const clone: Product = {
    ...rest,
    id:   newId,
    code: newCode,
    name: `${src.name} (copy)`,
  };
  const saved = await upsertProduct(clone as Partial<Product> & { id: string; code: string; name: string });

  // Copy BOM rows
  const bom = await listBOMForProduct(id);
  for (const row of bom) {
    const { id: _rowId, created_at: _c, product_id: _p, ...bomRest } = row;
    await addBOMRow({ ...bomRest, product_id: newId } as Omit<BOMRow, 'id' | 'created_at'>);
  }

  return saved;
}

// ── BOM ────────────────────────────────────────────────────────────
export async function listBOMForProduct(productId: string): Promise<BOMRow[]> {
  const { data, error } = await supabase
    .from('prod_boms')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order');
  if (error) { console.error('listBOM', error); return []; }
  return data || [];
}

export async function addBOMRow(row: Omit<BOMRow, 'id' | 'created_at'>): Promise<BOMRow> {
  const { data, error } = await supabase
    .from('prod_boms')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as BOMRow;
}

export async function updateBOMRow(id: number, patch: Partial<BOMRow>) {
  const { error } = await supabase.from('prod_boms').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteBOMRow(id: number) {
  const { error } = await supabase.from('prod_boms').delete().eq('id', id);
  if (error) throw error;
}

// ── ID generator (MRT-YYYY-NNN like existing convention) ───────────
export function nextJobId(existingIds: string[]): string {
  const yr = new Date().getFullYear();
  let max = 0;
  for (const id of existingIds) {
    const m = id.match(/^MRT-\d+-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `MRT-${yr}-${String(max + 1).padStart(3, '0')}`;
}

// ── Molding sessions ────────────────────────────────────────────────
export async function listMoldingSessions(jobCardId?: string): Promise<MoldingSession[]> {
  let q = supabase.from('prod_molding').select('*').order('created_at', { ascending: false });
  if (jobCardId) q = q.eq('job_card_id', jobCardId);
  const { data, error } = await q;
  if (error) { console.error('listMolding', error); return []; }
  return data || [];
}

export async function insertMoldingSession(row: MoldingSession): Promise<MoldingSession> {
  const { data, error } = await supabase.from('prod_molding').insert(row).select().single();
  if (error) throw error;
  return data as MoldingSession;
}

export async function updateMoldingSession(
  id: string,
  patch: Partial<MoldingSession>,
  correctedBy?: string | null,
  correctionNote?: string | null,
) {
  const { error } = await supabase.from('prod_molding').update({
    ...patch,
    corrected_at:   new Date().toISOString(),
    corrected_by:   correctedBy ?? null,
    correction_note: correctionNote ?? null,
  }).eq('id', id);
  if (error) throw error;
}

// ── Finishing sessions ──────────────────────────────────────────────
export async function listFinishingSessions(jobCardId?: string): Promise<FinishingSession[]> {
  let q = supabase.from('prod_finishing').select('*').order('created_at', { ascending: false });
  if (jobCardId) q = q.eq('job_card_id', jobCardId);
  const { data, error } = await q;
  if (error) { console.error('listFinishing', error); return []; }
  return data || [];
}

export async function insertFinishingSession(row: FinishingSession): Promise<FinishingSession> {
  const { data, error } = await supabase.from('prod_finishing').insert(row).select().single();
  if (error) throw error;
  return data as FinishingSession;
}

export async function updateFinishingSession(
  id: string,
  patch: Partial<FinishingSession>,
  correctedBy?: string | null,
  correctionNote?: string | null,
) {
  const { error } = await supabase.from('prod_finishing').update({
    ...patch,
    corrected_at: new Date().toISOString(),
    corrected_by: correctedBy ?? null,
    correction_note: correctionNote ?? null,
  }).eq('id', id);
  if (error) throw error;
}

// ── Inspection sessions ─────────────────────────────────────────────
export async function listInspectionSessions(jobCardId?: string): Promise<InspectionSession[]> {
  let q = supabase.from('prod_inspection').select('*').order('created_at', { ascending: false });
  if (jobCardId) q = q.eq('job_card_id', jobCardId);
  const { data, error } = await q;
  if (error) { console.error('listInspection', error); return []; }
  return data || [];
}

export async function insertInspectionSession(row: InspectionSession): Promise<InspectionSession> {
  const { data, error } = await supabase.from('prod_inspection').insert(row).select().single();
  if (error) throw error;
  return data as InspectionSession;
}

// ── Dispatches ──────────────────────────────────────────────────────
export async function listDispatches(): Promise<Dispatch[]> {
  const { data, error } = await supabase
    .from('prod_dispatches').select('*').order('dispatch_date', { ascending: false });
  if (error) { console.error('listDispatches', error); return []; }
  return data || [];
}

export async function insertDispatch(row: Dispatch): Promise<Dispatch> {
  const { data, error } = await supabase.from('prod_dispatches').insert(row).select().single();
  if (error) throw error;
  return data as Dispatch;
}

export async function updateDispatchStatus(id: string, status: string) {
  const { error } = await supabase
    .from('prod_dispatches')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ── Dispatch items ──────────────────────────────────────────────────
export async function listDispatchItems(dispatchId?: string): Promise<DispatchItem[]> {
  let q = supabase.from('prod_dispatch_items').select('*').order('created_at');
  if (dispatchId) q = q.eq('dispatch_id', dispatchId);
  const { data, error } = await q;
  if (error) { console.error('listDispatchItems', error); return []; }
  return data || [];
}

export async function listDispatchItemsForJob(jobCardId: string): Promise<DispatchItem[]> {
  const { data, error } = await supabase
    .from('prod_dispatch_items').select('*').eq('job_card_id', jobCardId);
  if (error) { console.error('listDispatchItemsForJob', error); return []; }
  return data || [];
}

export async function insertDispatchItem(row: DispatchItem): Promise<DispatchItem> {
  const { data, error } = await supabase.from('prod_dispatch_items').insert(row).select().single();
  if (error) throw error;
  return data as DispatchItem;
}

// Correct a dispatch header (qty/courier/invoice/etc.) — audited.
export async function updateDispatch(
  id: string,
  patch: Partial<Dispatch>,
  correctedBy?: string | null,
  correctionNote?: string | null,
) {
  const { error } = await supabase.from('prod_dispatches').update({
    ...patch,
    corrected_at: new Date().toISOString(),
    corrected_by: correctedBy ?? null,
    correction_note: correctionNote ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// Correct a single dispatch line item (qty) — audited.
export async function updateDispatchItem(
  id: string,
  patch: Partial<DispatchItem>,
  correctionNote?: string | null,
) {
  const { error } = await supabase.from('prod_dispatch_items').update({
    ...patch,
    corrected_at: new Date().toISOString(),
    correction_note: correctionNote ?? null,
  }).eq('id', id);
  if (error) throw error;
}

// Reverse a dispatch: its items stop counting as dispatched (qty returns to the
// ready pool). The record is kept for audit, status → 'Reversed'.
export async function reverseDispatch(id: string, reversedBy?: string | null, note?: string | null) {
  const { error } = await supabase.from('prod_dispatches').update({
    status: 'Reversed',
    reversed_at: new Date().toISOString(),
    reversed_by: reversedBy ?? null,
    reversal_note: note ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ── Finished-goods stock ledger ─────────────────────────────────────
export async function listFgStock(): Promise<FgStockRow[]> {
  const { data, error } = await supabase
    .from('prod_fg_stock').select('*').order('created_at', { ascending: false });
  if (error) { console.error('listFgStock', error); return []; }
  return data || [];
}

export async function insertFgMovement(row: FgStockRow): Promise<FgStockRow> {
  const { data, error } = await supabase.from('prod_fg_stock').insert(row).select().single();
  if (error) throw error;
  return data as FgStockRow;
}

export async function updateInspectionSession(
  id: string,
  patch: Partial<InspectionSession>,
  correctedBy?: string | null,
  correctionNote?: string | null,
) {
  const { error } = await supabase.from('prod_inspection').update({
    ...patch,
    corrected_at: new Date().toISOString(),
    corrected_by: correctedBy ?? null,
    correction_note: correctionNote ?? null,
  }).eq('id', id);
  if (error) throw error;
}

// ── PDI Logs ────────────────────────────────────────────────────────────────
export async function listPdiLogs(jobCardId?: string): Promise<PdiLog[]> {
  let q = supabase.from('prod_pdi_logs').select('*').order('created_at', { ascending: false });
  if (jobCardId) q = q.eq('job_card_id', jobCardId);
  const { data, error } = await q;
  if (error) { console.error('listPdiLogs', error); return []; }
  return data || [];
}

export async function updatePdiLog(
  id: string,
  patch: Partial<PdiLog>,
  correctedBy?: string | null,
  correctionNote?: string | null,
) {
  const { error } = await supabase.from('prod_pdi_logs').update({
    ...patch,
    corrected_at: new Date().toISOString(),
    corrected_by: correctedBy ?? null,
    correction_note: correctionNote ?? null,
  }).eq('id', id);
  if (error) throw error;
}

export async function insertPdiLog(row: PdiLog): Promise<PdiLog> {
  const { data, error } = await supabase.from('prod_pdi_logs').insert(row).select().single();
  if (error) throw error;
  return data as PdiLog;
}

// ── Attachments (DPR / PDI docs) ────────────────────────────────────────────
const ATTACHMENT_BUCKET = 'prod-docs';

export async function listAttachments(filters?: {
  type?: string;
  shift_date?: string;
  job_card_id?: string;
}): Promise<ProdAttachment[]> {
  let q = supabase.from('prod_attachments').select('*').order('created_at', { ascending: false });
  if (filters?.type)        q = q.eq('type', filters.type);
  if (filters?.shift_date)  q = q.eq('shift_date', filters.shift_date);
  if (filters?.job_card_id) q = q.eq('job_card_id', filters.job_card_id);
  const { data, error } = await q;
  if (error) { console.error('listAttachments', error); return []; }
  return data || [];
}

export async function uploadAttachment(
  file: File,
  meta: Omit<ProdAttachment, 'id' | 'file_path' | 'file_name' | 'file_size' | 'mime_type' | 'created_at'>
): Promise<ProdAttachment> {
  const ts   = Date.now();
  const ext  = file.name.split('.').pop() || 'bin';
  const path = `${meta.type}/${meta.shift_date}/${ts}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: upErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const row: Omit<ProdAttachment, 'id'> = {
    ...meta,
    file_name:  file.name,
    file_path:  path,
    file_size:  file.size,
    mime_type:  file.type || `application/${ext}`,
  };
  const { data, error: dbErr } = await supabase
    .from('prod_attachments').insert(row).select().single();
  if (dbErr) throw dbErr;
  return data as ProdAttachment;
}

export async function getAttachmentUrl(filePath: string): Promise<string | null> {
  const { data } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(filePath);
  return data?.publicUrl ?? null;
}

export async function getAttachmentSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(filePath, 3600); // 1 hour
  if (error) { console.error('getSignedUrl', error); return null; }
  return data?.signedUrl ?? null;
}

export async function deleteAttachment(id: number, filePath: string) {
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([filePath]);
  await supabase.from('prod_attachments').delete().eq('id', id);
}
