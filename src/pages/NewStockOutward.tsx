// Full-page "New Outward" entry form for the Stock Movements module —
// mirrors the "Delivery Order Sale" Google Form the team currently uses.
// Page chrome, section-card pattern, and single-column full-width layout
// are copied exactly from the finalized src/pages/NewStockInward.tsx (see
// that file's own header comment for the page-shell rationale).
//
// Save logic does two things client-side, no DB trigger:
//   1. Inserts one row into stock_movements (type: 'outward') — the
//      immutable audit trail.
//   2. IF a Lot No was given and it matches an existing stock_lots row
//      AND the Warehouse is one of the 5 known parties (not "Other"),
//      decrements that party's qty_* column and stock_lots.quantity by
//      Total Quantity. Otherwise (no Lot No, no match, or Warehouse
//      "Other") the movement is still logged — the stock_lots side is
//      best-effort and never blocks the save.
// See src/pages/StockMovements.tsx for the list view and
// supabase/migrations/20260903120000_stock_movements_add_outward_columns.sql /
// 20260903120100_stock_movements_lot_no_nullable.sql /
// 20260903120200_stock_movements_add_do_date.sql for the schema.
//
// Party Name and Transporter option lists are placeholders (small seed
// lists, marked TODO below) pending the full 533-entry / 193-entry lists
// from the real Delivery Order Sale form.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui';
import { SearchableCombobox } from '../components/SearchableCombobox';
import { PRODUCT_NAMES, PACKAGING_TYPES } from '../lib/stockMovementOptions';

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow";
const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";
const sectionHeaderCls = "font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200";
const cardCls = "bg-white border border-g200 p-[18px_20px]";

// Outward's own Warehouse list (distinct from Inward's — includes WADA and
// a free-text "Other"). "Other" has no dedicated DB column, so its typed
// text is saved directly as the warehouse value instead — see save().
const WAREHOUSES = ['Hariom', 'Reliable', 'Swastik', 'BALAJI', 'WADA', 'Other'];

// Party/godown → the stock_lots quantity column it feeds. Only the 5 known
// parties have an entry — "Other" (and any custom typed name) intentionally
// has none, so the decrement step below skips it.
const PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom',
  Reliable: 'qty_reliable',
  Swastik: 'qty_swastik',
  BALAJI: 'qty_balaji',
  WADA: 'qty_wada',
};

// TODO: replace with full 533-entry list from Delivery Order Sale form
const PARTY_NAMES = [
  'A P INK', 'AARAV FRAGRANCES & FLAVOURS PVT. LTD.', 'ASIAN PAINTS LTD', 'BERGER PAINTS INDIA LTD',
  'GRASIM INDUSTRIES LIMITED', 'ITC LIMITED', 'ROBERTET INDIA PRIVATE LIMITED', 'SHALIMAR PAINTS LTD', 'Other',
];

// TODO: replace with full 193-entry list
const TRANSPORTERS = [
  'A H TRANSPORT', 'AASHIRWAD GOODS CARRIES', 'ABHINAV TRANSPORT (INDIA) PVT. LTD.', 'VRL LOGISTICS',
  'YASHWANT TRANSPORT', 'Other',
];

const emptyForm = {
  warehouse: '', otherWarehouse: '',
  doNumber: '', doDate: '', lotNo: '', lotDate: '', productName: '',
  numArticles: '', packing: '', totalQty: '', weightType: '', packagingType: '',
  partyName: '', otherParty: '', transporter: '', otherTransporter: '', note: '',
};

export function NewStockOutward() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const isOtherWarehouse = form.warehouse === 'Other';
  const isOtherParty = form.partyName === 'Other';
  const isOtherTransporter = form.transporter === 'Other';

  const isValid = !!(
    form.warehouse && (!isOtherWarehouse || form.otherWarehouse.trim()) &&
    form.doNumber.trim() && form.productName.trim()
  );

  const save = async () => {
    if (!isValid) { setError('Please fill in all required fields.'); return; }
    setSaving(true);
    setError('');

    const warehouseToSave = isOtherWarehouse ? form.otherWarehouse.trim() : form.warehouse;
    const lotNo = form.lotNo.trim();
    const totalQty = num(form.totalQty);

    const movementPayload = {
      type: 'outward',
      warehouse: warehouseToSave,
      wh_lot_no: lotNo || null,
      product_name: form.productName.trim(),
      do_number: form.doNumber.trim(),
      do_date: form.doDate || null,
      inward_date: form.lotDate || null,
      num_articles: form.numArticles.trim() || null,
      packing: num(form.packing),
      weight_type: form.weightType || null,
      packaging_type: form.packagingType || null,
      total_qty: totalQty,
      party_name: form.partyName || null,
      other_party: isOtherParty ? (form.otherParty.trim() || null) : null,
      transporter: form.transporter || null,
      other_transporter: isOtherTransporter ? (form.otherTransporter.trim() || null) : null,
      note: form.note.trim() || null,
      created_by: user?.email ?? null,
    };

    const { error: moveErr } = await supabase.from('stock_movements').insert(movementPayload);
    if (moveErr) { setError(moveErr.message); setSaving(false); return; }

    // Best-effort stock_lots decrement — only when there's a lot to match
    // against and the warehouse is one of the known parties. Never blocks
    // the save: a missing lot, an "Other" warehouse, or an update error
    // here just means the movement stands without touching stock_lots.
    const partyCol = PARTY_COLUMN[form.warehouse];
    if (lotNo && partyCol) {
      try {
        const { data: existingLots } = await supabase
          .from('stock_lots')
          .select('*')
          .ilike('wh_lot_no', lotNo)
          .limit(1);
        const existing = existingLots?.[0];
        if (existing) {
          await supabase.from('stock_lots')
            .update({
              [partyCol]: (existing[partyCol] ?? 0) - (totalQty ?? 0),
              quantity: (existing.quantity ?? 0) - (totalQty ?? 0),
              updated_at: new Date().toISOString(),
              updated_by: user?.email ?? null,
            })
            .eq('id', existing.id);
        }
      } catch (e) {
        console.error('Outward stock_lots decrement failed (movement was still logged):', e);
      }
    }

    navigate('/stock-movements');
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Stock Movements Module</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">Log <em className="italic text-red-mrt">New Outward</em></h1>
            <p className="text-xs text-g500 mt-1 font-light">Record a Delivery Order stock outward — replaces the Delivery Order Sale Google Form.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/stock-movements')}>Back</Button>
        </div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[14px]">
          <div className={cardCls}>
            <div className={sectionHeaderCls}>DO &amp; Lot Details</div>
            <div className="grid grid-cols-4 gap-[12px]">
              <div>
                <label className={labelCls}>Warehouse <span className="text-red-mrt">*</span></label>
                <select className={selectCls} value={form.warehouse} onChange={set('warehouse')}>
                  <option value="">Select...</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              {isOtherWarehouse && (
                <div>
                  <label className={labelCls}>Other Warehouse <span className="text-red-mrt">*</span></label>
                  <input className={inputCls} value={form.otherWarehouse} onChange={set('otherWarehouse')} />
                </div>
              )}
              <div>
                <label className={labelCls}>DO Number <span className="text-red-mrt">*</span></label>
                <input className={inputCls} value={form.doNumber} onChange={set('doNumber')} />
              </div>
              <div>
                <label className={labelCls}>DO Date</label>
                <input type="date" className={inputCls} value={form.doDate} onChange={set('doDate')} />
              </div>
              <div>
                <label className={labelCls}>Lot No</label>
                <input className={inputCls} value={form.lotNo} onChange={set('lotNo')} />
              </div>
              <div>
                <label className={labelCls}>Lot Date</label>
                <input type="date" className={inputCls} value={form.lotDate} onChange={set('lotDate')} />
              </div>
              <div>
                <label className={labelCls}>Product Name <span className="text-red-mrt">*</span></label>
                <SearchableCombobox className={inputCls} options={PRODUCT_NAMES} value={form.productName} onChange={v => setForm(f => ({ ...f, productName: v }))} />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Quantity &amp; Packing</div>
            <div className="grid grid-cols-5 gap-[12px]">
              <div>
                <label className={labelCls}>Number of Articles</label>
                <input type="number" className={inputCls} value={form.numArticles} onChange={set('numArticles')} />
              </div>
              <div>
                <label className={labelCls}>Packing</label>
                <input type="number" className={inputCls} value={form.packing} onChange={set('packing')} />
              </div>
              <div>
                <label className={labelCls}>Total Quantity</label>
                <input type="number" className={inputCls} value={form.totalQty} onChange={set('totalQty')} />
              </div>
              <div>
                <label className={labelCls}>Weight Type</label>
                <div className="flex items-center gap-4 h-[35px]">
                  {['KG', 'LTR'].map(wt => (
                    <label key={wt} className="inline-flex items-center gap-1.5 text-[12.5px] text-blk cursor-pointer select-none">
                      <input
                        type="radio"
                        name="weightType"
                        value={wt}
                        checked={form.weightType === wt}
                        onChange={() => setForm(f => ({ ...f, weightType: wt }))}
                        className="w-3.5 h-3.5 accent-red-mrt"
                      />
                      {wt}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <select className={selectCls} value={form.packagingType} onChange={set('packagingType')}>
                  <option value="">Select...</option>
                  {PACKAGING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Party, Transporter &amp; Note</div>
            <div className="grid grid-cols-4 gap-[12px]">
              <div>
                <label className={labelCls}>Party Name</label>
                <SearchableCombobox className={inputCls} options={PARTY_NAMES} value={form.partyName} onChange={v => setForm(f => ({ ...f, partyName: v }))} />
              </div>
              {isOtherParty && (
                <div>
                  <label className={labelCls}>Other Party</label>
                  <input className={inputCls} value={form.otherParty} onChange={set('otherParty')} />
                </div>
              )}
              <div>
                <label className={labelCls}>Transporter</label>
                <SearchableCombobox className={inputCls} options={TRANSPORTERS} value={form.transporter} onChange={v => setForm(f => ({ ...f, transporter: v }))} />
              </div>
              {isOtherTransporter && (
                <div>
                  <label className={labelCls}>Other Transporter</label>
                  <input className={inputCls} value={form.otherTransporter} onChange={set('otherTransporter')} />
                </div>
              )}
            </div>
            <div className="mt-3">
              <label className={labelCls}>Note</label>
              <textarea className={`${inputCls} min-h-[68px]`} value={form.note} onChange={set('note')} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-[14px_20px] bg-g100 border-t border-g200 sticky bottom-0">
        <Button variant="primary" onClick={save} disabled={!isValid || saving}>
          {saving ? 'Saving…' : 'Save Outward Entry'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/stock-movements')} disabled={saving}>Cancel</Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {error && <div className="ml-4 text-red-mrt text-[11px] font-bold">{error}</div>}
      </div>
    </div>
  );
}
