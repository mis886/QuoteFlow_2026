// Full-page "New Inward" entry form for the Stock Movements module —
// replaces the "Stock Inward" Google Form. Page chrome (header/back button,
// sectioned white cards, sticky bottom action bar) mirrors NewEnquiry.tsx /
// NewDispatchEntry.tsx rather than a modal, per the same convention used
// throughout the app for "add a new record" flows.
//
// Save logic (moved here from the old StockInwardModal.tsx) does two things
// client-side, no DB trigger:
//   1. Inserts one row into stock_movements (the immutable audit trail).
//   2. Upserts the matching stock_lots row by wh_lot_no, so Stockbook's
//      running party/godown balances stay correct without Stockbook.tsx
//      itself changing at all.
//
// Column ownership: no_of_barrels / packing_type / mou / packing_detail are
// exclusive to this form (see supabase/migrations/20260903120400_stock_inward_exclusive_columns.sql)
// — NewStockOutward.tsx and StockLotModal.tsx keep using the older packing /
// packaging_type / weight_type / unit columns unaffected. The only columns
// still shared with Outward are the party quantity columns (qty_hariom,
// qty_reliable, qty_swastik, qty_balaji, qty_wada) and quantity/total_qty,
// matched via wh_lot_no — that's the deliberate reconciliation mechanism.
// product_code is the one exception: it reuses stock_lots' existing column
// (also edited via StockLotModal.tsx), the same way product_name/wh_lot_no/
// fact_lot_no already work — populated at lot creation, editable after.
//
// Product Name / Product Code source: src/lib/stockInwardProducts.ts's
// PRODUCTS array (code+name pairs) — exclusive to this form, deliberately
// separate from PRODUCT_NAMES in stockMovementOptions.ts (still used
// unchanged by NewStockOutward.tsx). Product Code is derived, read-only —
// it's looked up from PRODUCTS whenever Product Name changes, never
// typed directly.
//
// See src/pages/StockMovements.tsx for the list view and
// supabase/migrations/20260903060000_create_stock_movements_table.sql for
// the base schema.

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { supabase, uploadPublicFile, resolveCoaStorageUrl } from '../lib/supabase';
import { Button } from '../components/ui';
import { SearchableCombobox } from '../components/SearchableCombobox';
import { StockMovementWarehouse } from '../lib/types';
import { PACKAGING_TYPES } from '../lib/stockMovementOptions';
import { PRODUCTS } from '../lib/stockInwardProducts';
import { Loader2, Search, X } from 'lucide-react';

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow";
const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";
const sectionHeaderCls = "font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200";
const cardCls = "bg-white border border-g200 p-[18px_20px]";

const WAREHOUSES: StockMovementWarehouse[] = ['Hariom', 'Reliable', 'Swastik', 'Balaji'];

// Combobox options — derived from PRODUCTS, the single source of truth
// also used for the Product Code auto-fill lookup below.
const PRODUCT_NAME_OPTIONS = PRODUCTS.map(p => p.name);

// Party/godown → the stock_lots quantity column it feeds.
const PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom',
  Reliable: 'qty_reliable',
  Swastik: 'qty_swastik',
  Balaji: 'qty_balaji',
};

const emptyForm = {
  warehouse: '', whLotNo: '', factLotNo: '', productCode: '', productName: '',
  inwardDate: '', noOfBarrels: '', weightType: '', packagingType: '', packingDetail: '', totalQty: '',
  make: '', remark: '', sampleOff: false, coaFile: '', coaUrl: '',
};

export function NewStockInward() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  // Returns a finite number, or null if v is empty/not a valid number —
  // used to gate the Total Quantity auto-calc below (never NaN, never
  // treats "" as 0).
  const parseNum = (v: string): number | null => {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  // Auto-fills Total Quantity = No of Barrels × Packing whenever both are
  // valid numbers. Total Quantity stays a normal editable field — this
  // only overwrites it when its two source fields change; the user can
  // still retype it manually afterward. If either source is empty/invalid,
  // Total Quantity is left exactly as it is (no clearing, no NaN).
  const onNoOfBarrelsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => {
      const barrels = parseNum(v);
      const packing = parseNum(f.packingDetail);
      const totalQty = barrels !== null && packing !== null ? String(barrels * packing) : f.totalQty;
      return { ...f, noOfBarrels: v, totalQty };
    });
  };

  const onPackingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => {
      const barrels = parseNum(f.noOfBarrels);
      const packing = parseNum(v);
      const totalQty = barrels !== null && packing !== null ? String(barrels * packing) : f.totalQty;
      return { ...f, packingDetail: v, totalQty };
    });
  };

  // COA picker — search existing coa_document rows (by product name or lot
  // no.) and attach one, or upload a brand-new certificate. Adapted from the
  // quote-only COA panel in AttachmentModal.tsx, but single-select: a Stock
  // Lot has exactly one coa_file/coa_url (not an attachments array like
  // enquiries/quotes/orders), so picking a result just sets those two form
  // fields locally — nothing is written to the DB until the main Save
  // button below runs, same as every other field on this form.
  const [coaSearch, setCoaSearch] = useState('');
  const [coaSearchDebounced, setCoaSearchDebounced] = useState('');
  const [coaResults, setCoaResults] = useState<any[]>([]);
  const [coaSearchLoading, setCoaSearchLoading] = useState(false);
  const [newCoaFile, setNewCoaFile] = useState<File | null>(null);
  const [coaUploading, setCoaUploading] = useState(false);
  const [coaUploadError, setCoaUploadError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setCoaSearchDebounced(coaSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [coaSearch]);

  useEffect(() => {
    const controller = new AbortController();
    setCoaSearchLoading(true);
    let query = supabase.from('coa_document').select('*').order('created_at', { ascending: false }).limit(20).abortSignal(controller.signal);
    if (coaSearchDebounced) query = query.or(`product_name.ilike.%${coaSearchDebounced}%,lot_no.ilike.%${coaSearchDebounced}%`);
    query.then(({ data: rows, error }) => {
      if (controller.signal.aborted) return;
      if (error) { console.error(error); setCoaResults([]); setCoaSearchLoading(false); return; }
      setCoaResults(rows ?? []);
      setCoaSearchLoading(false);
    });
    return () => controller.abort();
  }, [coaSearchDebounced]);

  const selectCoaDoc = (doc: any) => {
    setForm(f => ({ ...f, coaFile: doc.file_name, coaUrl: resolveCoaStorageUrl(doc.storage_path) }));
  };

  const clearCoa = () => setForm(f => ({ ...f, coaFile: '', coaUrl: '' }));

  const handleUploadNewCoa = async () => {
    setCoaUploadError('');
    if (!form.productName.trim()) { setCoaUploadError('Enter Product Name above first.'); return; }
    if (!newCoaFile) { setCoaUploadError('Choose a file to upload.'); return; }

    setCoaUploading(true);
    try {
      const ext = newCoaFile.name.split('.').pop() || 'bin';
      const safeProductName = form.productName.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const path = `COA/${safeProductName}_${form.whLotNo.trim() || 'nolot'}_${Date.now()}.${ext}`;
      const { data: url, error: uploadError } = await uploadPublicFile('coa-gc-documents', path, newCoaFile);
      if (uploadError || !url) throw uploadError || new Error('Upload failed');

      const { data: row, error: insertError } = await supabase.from('coa_document').insert({
        product_name: form.productName.trim(),
        lot_no: form.whLotNo.trim() || null,
        doc_type: 'COA',
        file_name: newCoaFile.name,
        storage_path: url,
        file_size: newCoaFile.size,
        uploaded_by: user?.email ?? null,
      }).select().single();
      if (insertError || !row) throw insertError || new Error('Could not save document reference');

      selectCoaDoc(row);
      setCoaResults(prev => [row, ...prev]);
      setNewCoaFile(null);
    } catch (e: any) {
      console.error(e);
      setCoaUploadError(e?.message || 'Failed to upload document.');
    }
    setCoaUploading(false);
  };

  const isValid = !!(
    form.warehouse && form.whLotNo.trim() && form.productName.trim() &&
    form.inwardDate && form.noOfBarrels.trim() && form.totalQty.trim()
  );

  const save = async () => {
    if (!isValid) { setError('Please fill in all required fields.'); return; }
    setSaving(true);
    setError('');

    const whLotNo = form.whLotNo.trim();
    const totalQty = num(form.totalQty);

    const movementPayload = {
      type: 'inward',
      warehouse: form.warehouse,
      wh_lot_no: whLotNo,
      fact_lot_no: form.factLotNo.trim() || null,
      product_name: form.productName.trim(),
      inward_date: form.inwardDate,
      // Lot Quantity field was removed; Total Quantity is now the single
      // source of truth for how much stock this entry adds, so lot_qty
      // (still read by StockMovements.tsx's Inward "Qty" column) mirrors
      // it instead of going blank on every new row.
      lot_qty: totalQty,
      no_of_barrels: form.noOfBarrels.trim() || null,
      mou: form.weightType || null,
      packing_type: form.packagingType || null,
      packing_detail: form.packingDetail.trim() || null,
      total_qty: totalQty,
      make: form.make.trim() || null,
      remark: form.remark.trim() || null,
      sample_off: form.sampleOff,
      coa_file: form.coaFile.trim() || null,
      coa_url: form.coaUrl.trim() || null,
      created_by: user?.email ?? null,
    };

    const { error: moveErr } = await supabase.from('stock_movements').insert(movementPayload);
    if (moveErr) { setError(moveErr.message); setSaving(false); return; }

    const partyCol = PARTY_COLUMN[form.warehouse];
    const { data: existingLots, error: findErr } = await supabase
      .from('stock_lots')
      .select('*')
      .ilike('wh_lot_no', whLotNo)
      .limit(1);

    if (findErr) { setError(findErr.message); setSaving(false); return; }
    const existing = existingLots?.[0];

    const lotErr = existing
      ? (await supabase.from('stock_lots')
          .update({
            [partyCol]: (existing[partyCol] ?? 0) + (totalQty ?? 0),
            quantity: (existing.quantity ?? 0) + (totalQty ?? 0),
            updated_at: new Date().toISOString(),
            updated_by: user?.email ?? null,
          })
          .eq('id', existing.id)).error
      : (await supabase.from('stock_lots').insert({
          product_name: form.productName.trim(),
          wh_lot_no: whLotNo,
          fact_lot_no: form.factLotNo.trim() || null,
          product_code: form.productCode.trim() || null,
          inward_date: form.inwardDate,
          [partyCol]: totalQty,
          no_of_barrels: form.noOfBarrels.trim() || null,
          mou: form.weightType || null,
          packing_type: form.packagingType || null,
          packing_detail: form.packingDetail.trim() || null,
          quantity: totalQty,
          make: form.make.trim() || null,
          remark: form.remark.trim() || null,
          sample_off: form.sampleOff,
          coa_file: form.coaFile.trim() || null,
          coa_url: form.coaUrl.trim() || null,
          created_by: user?.email ?? null,
        })).error;

    if (lotErr) {
      setError(lotErr.message);
    } else {
      navigate('/stock-movements');
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Stock Movements Module</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">Log <em className="italic text-red-mrt">New Inward</em></h1>
            <p className="text-xs text-g500 mt-1 font-light">Record a raw-material inward receipt — replaces the Stock Inward Google Form.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/stock-movements')}>Back</Button>
        </div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[14px]">
          <div className={cardCls}>
            <div className={sectionHeaderCls}>Lot Details</div>
            <div className="grid grid-cols-4 gap-[12px]">
              <div>
                <label className={labelCls}>Warehouse <span className="text-red-mrt">*</span></label>
                <select className={selectCls} value={form.warehouse} onChange={set('warehouse')}>
                  <option value="">Select...</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Lot No <span className="text-red-mrt">*</span></label>
                <input className={inputCls} value={form.whLotNo} onChange={set('whLotNo')} />
              </div>
              <div>
                <label className={labelCls}>Inward Date <span className="text-red-mrt">*</span></label>
                <input type="date" className={inputCls} value={form.inwardDate} onChange={set('inwardDate')} />
              </div>
              <div>
                <label className={labelCls}>Factory Lot Number</label>
                <input className={inputCls} value={form.factLotNo} onChange={set('factLotNo')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-[12px] mt-3">
              <div>
                <label className={labelCls}>Product Name <span className="text-red-mrt">*</span></label>
                <SearchableCombobox
                  className={inputCls}
                  options={PRODUCT_NAME_OPTIONS}
                  value={form.productName}
                  onChange={v => {
                    const match = PRODUCTS.find(p => p.name === v);
                    setForm(f => ({ ...f, productName: v, productCode: match ? match.code : '' }));
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>Product Code</label>
                <input className={`${inputCls} bg-g100 text-g600 cursor-not-allowed`} value={form.productCode} readOnly />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Quantity</div>
            <div className="grid grid-cols-5 gap-[12px]">
              <div>
                <label className={labelCls}>No of Barrels <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.noOfBarrels} onChange={onNoOfBarrelsChange} />
              </div>
              <div>
                <label className={labelCls}>Packing</label>
                <input className={inputCls} value={form.packingDetail} onChange={onPackingChange} />
              </div>
              <div>
                <label className={labelCls}>Total Quantity <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.totalQty} onChange={set('totalQty')} />
              </div>
              <div>
                <label className={labelCls}>Packing Type</label>
                <select className={selectCls} value={form.packagingType} onChange={set('packagingType')}>
                  <option value="">Select...</option>
                  {PACKAGING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>MOU (Measure of Unit)</label>
                <select className={selectCls} value={form.weightType} onChange={set('weightType')}>
                  <option value="">Select...</option>
                  <option value="KG">KG</option>
                  <option value="LTR">LTR</option>
                </select>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Sample Off</div>
            <div className="grid grid-cols-4 gap-[12px]">
              <div>
                <label className={labelCls}>Sample Off</label>
                <select
                  className={selectCls}
                  value={form.sampleOff ? 'Yes' : 'No'}
                  onChange={e => setForm(f => ({ ...f, sampleOff: e.target.value === 'Yes' }))}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>COA</div>
            {form.coaFile ? (
              <div className="flex items-center justify-between gap-2 bg-g100 border border-g200 rounded-[3px] px-2.5 py-2 mb-3">
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-blk truncate">{form.coaFile}</div>
                  {form.coaUrl && (
                    <a href={form.coaUrl} target="_blank" rel="noopener noreferrer" className="text-[10.5px] text-red-mrt hover:underline">View PDF</a>
                  )}
                </div>
                <button type="button" onClick={clearCoa} className="p-1 text-g400 hover:text-red-mrt shrink-0" title="Remove"><X size={14} /></button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-g400 pointer-events-none" />
                  <input
                    type="text" value={coaSearch} onChange={e => setCoaSearch(e.target.value)}
                    placeholder="Search existing COA by product or lot no."
                    className={`${inputCls} pl-8 pr-8`}
                  />
                  {coaSearchLoading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-g400 animate-spin" />}
                </div>
                <div className="max-h-[160px] overflow-y-auto border border-g200 rounded-[3px] divide-y divide-g100 mb-3">
                  {coaResults.length === 0 ? (
                    <div className="text-center py-4 text-g400 text-xs italic">
                      {coaSearchLoading ? 'Searching…' : 'No matching COA documents found.'}
                    </div>
                  ) : (
                    coaResults.map(doc => (
                      <button
                        type="button" key={doc.id} onClick={() => selectCoaDoc(doc)}
                        className="w-full text-left flex items-center gap-3 p-2 hover:bg-g50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-semibold text-blk truncate">{doc.product_name}{doc.lot_no ? ` — Lot ${doc.lot_no}` : ''}</div>
                          <div className="text-[10px] text-g500 truncate">{doc.file_name}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-g200">
                  <div className="text-[10px] font-medium text-g500 mb-2 uppercase tracking-wider font-mono">Or Upload New COA</div>
                  <input
                    type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={e => setNewCoaFile(e.target.files?.[0] ?? null)}
                    className="w-full font-sans text-xs text-blk bg-white border border-g300 rounded-[3px] p-[6px_10px] outline-none file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-g100 file:text-g700 hover:file:bg-g200"
                  />
                  {coaUploadError && <p className="mt-2 text-[10.5px] text-red-mrt font-medium">{coaUploadError}</p>}
                  <div className="flex justify-end mt-2">
                    <button
                      type="button" onClick={handleUploadNewCoa} disabled={coaUploading}
                      className="bg-blk hover:bg-g700 text-white text-xs font-semibold px-4 py-2 rounded shadow-sm disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                    >
                      {coaUploading ? <><Loader2 size={14} className="animate-spin"/> Uploading...</> : 'Upload & Attach'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Other</div>
            <div className="grid grid-cols-2 gap-[12px] items-start">
              <div>
                <label className={labelCls}>Make</label>
                <input className={`${inputCls} h-20`} value={form.make} onChange={set('make')} />
              </div>
              <div>
                <label className={labelCls}>Remark</label>
                <textarea className={`${inputCls} h-20 resize-none`} value={form.remark} onChange={set('remark')} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-[14px_20px] bg-g100 border-t border-g200 sticky bottom-0">
        <Button variant="primary" onClick={save} disabled={!isValid || saving}>
          {saving ? 'Saving…' : 'Save Inward Entry'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/stock-movements')} disabled={saving}>Cancel</Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {error && <div className="ml-4 text-red-mrt text-[11px] font-bold">{error}</div>}
      </div>
    </div>
  );
}
