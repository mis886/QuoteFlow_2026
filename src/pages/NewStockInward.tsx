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
// See src/pages/StockMovements.tsx for the list view and
// supabase/migrations/20260903060000_create_stock_movements_table.sql for
// the base schema.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui';
import { SearchableCombobox } from '../components/SearchableCombobox';
import { StockMovementWarehouse } from '../lib/types';
import { PRODUCT_NAMES, PACKAGING_TYPES } from '../lib/stockMovementOptions';

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow";
const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";
const sectionHeaderCls = "font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200";
const cardCls = "bg-white border border-g200 p-[18px_20px]";

const WAREHOUSES: StockMovementWarehouse[] = ['Hariom', 'Reliable', 'Swastik', 'Balaji'];

// Party/godown → the stock_lots quantity column it feeds.
const PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom',
  Reliable: 'qty_reliable',
  Swastik: 'qty_swastik',
  Balaji: 'qty_balaji',
};

const emptyForm = {
  warehouse: '', whLotNo: '', factLotNo: '', productCode: '', productName: '',
  lotDate: '', lotQty: '', noOfBarrels: '', weightType: '', packagingType: '', packingDetail: '', totalQty: '',
  make: '', remark: '',
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

  const isValid = !!(
    form.warehouse && form.whLotNo.trim() && form.productName.trim() &&
    form.lotDate && form.lotQty.trim() && form.noOfBarrels.trim() && form.totalQty.trim()
  );

  const save = async () => {
    if (!isValid) { setError('Please fill in all required fields.'); return; }
    setSaving(true);
    setError('');

    const whLotNo = form.whLotNo.trim();
    const lotQty = num(form.lotQty);
    const totalQty = num(form.totalQty);

    const movementPayload = {
      type: 'inward',
      warehouse: form.warehouse,
      wh_lot_no: whLotNo,
      fact_lot_no: form.factLotNo.trim() || null,
      product_name: form.productName.trim(),
      lot_date: form.lotDate,
      lot_qty: lotQty,
      no_of_barrels: form.noOfBarrels.trim() || null,
      mou: form.weightType || null,
      packing_type: form.packagingType || null,
      packing_detail: form.packingDetail.trim() || null,
      total_qty: totalQty,
      make: form.make.trim() || null,
      remark: form.remark.trim() || null,
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
            [partyCol]: (existing[partyCol] ?? 0) + (lotQty ?? 0),
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
          inward_date: form.lotDate,
          [partyCol]: lotQty,
          no_of_barrels: form.noOfBarrels.trim() || null,
          mou: form.weightType || null,
          packing_type: form.packagingType || null,
          packing_detail: form.packingDetail.trim() || null,
          quantity: totalQty,
          make: form.make.trim() || null,
          remark: form.remark.trim() || null,
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
            <div className="grid grid-cols-5 gap-[12px]">
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
                <label className={labelCls}>Lot Date <span className="text-red-mrt">*</span></label>
                <input type="date" className={inputCls} value={form.lotDate} onChange={set('lotDate')} />
              </div>
              <div>
                <label className={labelCls}>Factory Lot Number</label>
                <input className={inputCls} value={form.factLotNo} onChange={set('factLotNo')} />
              </div>
              <div>
                <label className={labelCls}>Lot Quantity <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.lotQty} onChange={set('lotQty')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-[12px] mt-3">
              <div>
                <label className={labelCls}>Product Name <span className="text-red-mrt">*</span></label>
                <SearchableCombobox className={inputCls} options={PRODUCT_NAMES} value={form.productName} onChange={v => setForm(f => ({ ...f, productName: v }))} />
              </div>
              <div>
                <label className={labelCls}>Product Code</label>
                <input className={inputCls} value={form.productCode} onChange={set('productCode')} />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Quantity</div>
            <div className="grid grid-cols-5 gap-[12px]">
              <div>
                <label className={labelCls}>No of Barrels <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.noOfBarrels} onChange={set('noOfBarrels')} />
              </div>
              <div>
                <label className={labelCls}>Packing</label>
                <input className={inputCls} value={form.packingDetail} onChange={set('packingDetail')} />
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
