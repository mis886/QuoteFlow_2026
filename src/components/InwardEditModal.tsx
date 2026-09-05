// Edit modal for a single Stock Movements "Inward" entry. Mirrors the field
// set of src/pages/NewStockInward.tsx exactly, but as a compact edit popup
// (same modal convention as StockLotModal.tsx) rather than a full page —
// full pages are for creating NEW records in this app, editing an existing
// one uses a modal.
//
// Reconciliation: an inward entry's Warehouse/Lot No/Total Quantity drive a
// live increment on the matching stock_lots row (see NewStockInward.tsx's
// save()). Editing one of those three fields means the ORIGINAL increment
// is no longer correct, so save() here first REVERSES the old entry's
// effect on stock_lots (using the values the entry had before this edit),
// then RE-APPLIES the new effect (using the edited values) — exactly the
// same insert/update branching NewStockInward.tsx uses when creating a
// fresh entry. If the old and new lot are the same lot, the two steps net
// out to the correct delta. Descriptive-only fields (Make, Remark, Factory
// Lot Number, MOU, Packing Type, Packing) are NOT re-applied onto an
// already-existing stock_lots row — only onto a brand-new one this edit ends
// up creating — matching NewStockInward.tsx's own behavior (its "existing
// lot" branch only ever touches the party qty column + quantity, never the
// descriptive fields). No of Barrels is the one exception: it drives the
// party qty column's own delta (see NewStockInward.tsx's 2026-09-05 comment)
// so it IS reversed/re-applied here even on an existing lot, same as
// Total Quantity is for the plain `quantity` column.

import React, { useEffect, useState } from 'react';
import { X, Loader2, Search } from 'lucide-react';
import { Button } from './ui';
import { supabase, uploadPublicFile, resolveCoaStorageUrl } from '../lib/supabase';
import { useAppStore } from '../store';
import { StockMovement, StockMovementWarehouse } from '../lib/types';
import { SearchableCombobox } from './SearchableCombobox';
import { PACKAGING_TYPES } from '../lib/stockMovementOptions';
import { PRODUCTS } from '../lib/stockInwardProducts';

const inp = 'w-full font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[3px] px-2.5 py-[7px] outline-none focus:border-red-mrt focus:ring-2 focus:ring-red-lt transition-shadow';
const sel = `${inp} appearance-none cursor-pointer`;
const lbl = 'block text-[10px] font-mono font-bold tracking-[1px] uppercase text-g500 mb-1';

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={lbl}>{label}</label>
      {children}
    </div>
  );
}

interface Props {
  open: boolean;
  movement: StockMovement;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const WAREHOUSES: StockMovementWarehouse[] = ['Hariom', 'Reliable', 'Swastik', 'Balaji'];

// Party/godown → the stock_lots quantity column it feeds — same mapping
// NewStockInward.tsx uses (Inward's warehouse values, e.g. "Balaji", are
// cased differently from Outward's "BALAJI" — keep this map Inward-only).
const PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom',
  Reliable: 'qty_reliable',
  Swastik: 'qty_swastik',
  Balaji: 'qty_balaji',
};

const PRODUCT_NAME_OPTIONS = PRODUCTS.map(p => p.name);

const emptyForm = {
  warehouse: '', whLotNo: '', factLotNo: '', productCode: '', productName: '',
  inwardDate: '', noOfBarrels: '', mou: '', packingType: '', packingDetail: '', totalQty: '',
  make: '', remark: '', sampleOff: false, coaFile: '', coaUrl: '',
};

export function InwardEditModal({ open, movement, onClose, onSaved }: Props) {
  const { user } = useAppStore();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const match = PRODUCTS.find(p => p.name === movement.productName);
    setForm({
      warehouse: movement.warehouse || '',
      whLotNo: movement.whLotNo || '',
      factLotNo: movement.factLotNo || '',
      productCode: match ? match.code : '',
      productName: movement.productName || '',
      inwardDate: movement.inwardDate || '',
      noOfBarrels: movement.noOfBarrels || '',
      mou: movement.mou || '',
      packingType: movement.packingType || '',
      packingDetail: movement.packingDetail || '',
      totalQty: movement.totalQty?.toString() ?? '',
      make: movement.make || '',
      remark: movement.remark || '',
      sampleOff: !!movement.sampleOff,
      coaFile: movement.coaFile || '',
      coaUrl: movement.coaUrl || '',
    });
    setError('');
  }, [open, movement]);

  // COA picker — same search/upload logic as NewStockInward.tsx's. Kept
  // above the early return below (rules of hooks); the search effect itself
  // no-ops while the modal is closed.
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
    if (!open) return;
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
  }, [open, coaSearchDebounced]);

  if (!open) return null;

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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const parseNum = (v: string): number | null => {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

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

  const save = async () => {
    if (!form.warehouse || !form.whLotNo.trim() || !form.productName.trim() || !form.inwardDate || !form.noOfBarrels.trim() || !form.totalQty.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');

    const newWhLotNo = form.whLotNo.trim();
    const newTotalQty = num(form.totalQty) ?? 0;
    const newBarrels = num(form.noOfBarrels) ?? 0;
    const oldWhLotNo = (movement.whLotNo || '').trim();
    const oldTotalQty = movement.totalQty ?? 0;
    const oldBarrels = num(movement.noOfBarrels || '') ?? 0;
    const oldPartyCol = PARTY_COLUMN[movement.warehouse];
    const newPartyCol = PARTY_COLUMN[form.warehouse];

    // 1. Reverse the OLD entry's effect on stock_lots.
    if (oldPartyCol && oldWhLotNo) {
      const { data: oldLots, error: findOldErr } = await supabase
        .from('stock_lots').select('*').ilike('wh_lot_no', oldWhLotNo).limit(1);
      if (findOldErr) { setError(findOldErr.message); setSaving(false); return; }
      const oldLot = oldLots?.[0];
      if (oldLot) {
        const { error: revErr } = await supabase.from('stock_lots').update({
          [oldPartyCol]: (oldLot[oldPartyCol] ?? 0) - oldBarrels,
          quantity: (oldLot.quantity ?? 0) - oldTotalQty,
          updated_at: new Date().toISOString(),
          updated_by: user?.email ?? null,
        }).eq('id', oldLot.id);
        if (revErr) { setError(revErr.message); setSaving(false); return; }
      }
    }

    // 2. Apply the NEW (edited) effect on stock_lots — same insert/update
    // branching as NewStockInward.tsx's save().
    if (newPartyCol && newWhLotNo) {
      const { data: newLots, error: findNewErr } = await supabase
        .from('stock_lots').select('*').ilike('wh_lot_no', newWhLotNo).limit(1);
      if (findNewErr) { setError(findNewErr.message); setSaving(false); return; }
      const newLot = newLots?.[0];

      const lotErr = newLot
        ? (await supabase.from('stock_lots')
            .update({
              [newPartyCol]: (newLot[newPartyCol] ?? 0) + newBarrels,
              quantity: (newLot.quantity ?? 0) + newTotalQty,
              updated_at: new Date().toISOString(),
              updated_by: user?.email ?? null,
            })
            .eq('id', newLot.id)).error
        : (await supabase.from('stock_lots').insert({
            product_name: form.productName.trim(),
            wh_lot_no: newWhLotNo,
            fact_lot_no: form.factLotNo.trim() || null,
            product_code: form.productCode.trim() || null,
            inward_date: form.inwardDate,
            [newPartyCol]: newBarrels,
            no_of_barrels: form.noOfBarrels.trim() || null,
            mou: form.mou || null,
            packing_type: form.packingType || null,
            packing_detail: form.packingDetail.trim() || null,
            quantity: newTotalQty,
            make: form.make.trim() || null,
            remark: form.remark.trim() || null,
            sample_off: form.sampleOff,
            coa_file: form.coaFile.trim() || null,
            coa_url: form.coaUrl.trim() || null,
            created_by: user?.email ?? null,
          })).error;

      if (lotErr) { setError(lotErr.message); setSaving(false); return; }
    }

    // 3. Update the stock_movements row itself.
    const movementPayload = {
      warehouse: form.warehouse,
      wh_lot_no: newWhLotNo,
      fact_lot_no: form.factLotNo.trim() || null,
      product_name: form.productName.trim(),
      inward_date: form.inwardDate,
      lot_qty: newTotalQty,
      no_of_barrels: form.noOfBarrels.trim() || null,
      mou: form.mou || null,
      packing_type: form.packingType || null,
      packing_detail: form.packingDetail.trim() || null,
      total_qty: newTotalQty,
      make: form.make.trim() || null,
      remark: form.remark.trim() || null,
      sample_off: form.sampleOff,
      coa_file: form.coaFile.trim() || null,
      coa_url: form.coaUrl.trim() || null,
    };

    const { error: moveErr } = await supabase.from('stock_movements')
      .update(movementPayload)
      .eq('id', movement.id);

    if (moveErr) {
      setError(moveErr.message);
    } else {
      await onSaved();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[760px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-g200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="text-[13.5px] font-semibold text-blk">Edit Inward Entry</div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-g500 hover:text-blk">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Lot Details</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Warehouse *">
                <select className={sel} value={form.warehouse} onChange={set('warehouse')}>
                  <option value="">Select...</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </Field>
              <Field label="Lot No *"><input className={inp} value={form.whLotNo} onChange={set('whLotNo')} /></Field>
              <Field label="Inward Date *"><input type="date" className={inp} value={form.inwardDate} onChange={set('inwardDate')} /></Field>
              <Field label="Factory Lot Number"><input className={inp} value={form.factLotNo} onChange={set('factLotNo')} /></Field>
              <Field label="Product Name *" className="col-span-2">
                <SearchableCombobox
                  className={inp}
                  options={PRODUCT_NAME_OPTIONS}
                  value={form.productName}
                  onChange={v => {
                    const match = PRODUCTS.find(p => p.name === v);
                    setForm(f => ({ ...f, productName: v, productCode: match ? match.code : '' }));
                  }}
                />
              </Field>
              <Field label="Product Code"><input className={`${inp} bg-g100 text-g600 cursor-not-allowed`} value={form.productCode} readOnly /></Field>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Quantity</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="No of Barrels *"><input type="number" className={inp} value={form.noOfBarrels} onChange={onNoOfBarrelsChange} /></Field>
              <Field label="Packing"><input className={inp} value={form.packingDetail} onChange={onPackingChange} /></Field>
              <Field label="Total Quantity *"><input type="number" className={inp} value={form.totalQty} onChange={set('totalQty')} /></Field>
              <Field label="Packing Type">
                <select className={sel} value={form.packingType} onChange={set('packingType')}>
                  <option value="">Select...</option>
                  {PACKAGING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="MOU (Measure of Unit)">
                <select className={sel} value={form.mou} onChange={set('mou')}>
                  <option value="">Select...</option>
                  <option value="KG">KG</option>
                  <option value="LTR">LTR</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Make"><input className={inp} value={form.make} onChange={set('make')} /></Field>
            <Field label="Remark"><textarea className={`${inp} min-h-[42px]`} value={form.remark} onChange={set('remark')} /></Field>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Sample Off</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Sample Off">
                <select
                  className={sel}
                  value={form.sampleOff ? 'Yes' : 'No'}
                  onChange={e => setForm(f => ({ ...f, sampleOff: e.target.value === 'Yes' }))}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </Field>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">COA</div>
            {form.coaFile ? (
              <div className="flex items-center justify-between gap-2 bg-g100 border border-g200 rounded-[3px] px-2.5 py-2">
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
                    className={`${inp} pl-8 pr-8`}
                  />
                  {coaSearchLoading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-g400 animate-spin" />}
                </div>
                <div className="max-h-[140px] overflow-y-auto border border-g200 rounded-[3px] divide-y divide-g100 mb-3">
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

          {error && <p className="text-[11.5px] text-red-mrt font-medium">{error}</p>}
        </div>

        <div className="px-5 py-3.5 border-t border-g200 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
