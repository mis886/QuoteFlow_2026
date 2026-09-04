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
// Lot Number, No of Barrels, MOU, Packing Type, Packing) are NOT re-applied
// onto an already-existing stock_lots row — only onto a brand-new one this
// edit ends up creating — matching NewStockInward.tsx's own behavior
// (its "existing lot" branch only ever touches the party qty column +
// quantity, never the descriptive fields).

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui';
import { supabase } from '../lib/supabase';
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
  lotDate: '', noOfBarrels: '', mou: '', packingType: '', packingDetail: '', totalQty: '',
  make: '', remark: '',
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
      lotDate: movement.lotDate || '',
      noOfBarrels: movement.noOfBarrels || '',
      mou: movement.mou || '',
      packingType: movement.packingType || '',
      packingDetail: movement.packingDetail || '',
      totalQty: movement.totalQty?.toString() ?? '',
      make: movement.make || '',
      remark: movement.remark || '',
    });
    setError('');
  }, [open, movement]);

  if (!open) return null;

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
    if (!form.warehouse || !form.whLotNo.trim() || !form.productName.trim() || !form.lotDate || !form.noOfBarrels.trim() || !form.totalQty.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');

    const newWhLotNo = form.whLotNo.trim();
    const newTotalQty = num(form.totalQty) ?? 0;
    const oldWhLotNo = (movement.whLotNo || '').trim();
    const oldTotalQty = movement.totalQty ?? 0;
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
          [oldPartyCol]: (oldLot[oldPartyCol] ?? 0) - oldTotalQty,
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
              [newPartyCol]: (newLot[newPartyCol] ?? 0) + newTotalQty,
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
            inward_date: form.lotDate,
            [newPartyCol]: newTotalQty,
            no_of_barrels: form.noOfBarrels.trim() || null,
            mou: form.mou || null,
            packing_type: form.packingType || null,
            packing_detail: form.packingDetail.trim() || null,
            quantity: newTotalQty,
            make: form.make.trim() || null,
            remark: form.remark.trim() || null,
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
      lot_date: form.lotDate,
      lot_qty: newTotalQty,
      no_of_barrels: form.noOfBarrels.trim() || null,
      mou: form.mou || null,
      packing_type: form.packingType || null,
      packing_detail: form.packingDetail.trim() || null,
      total_qty: newTotalQty,
      make: form.make.trim() || null,
      remark: form.remark.trim() || null,
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
              <Field label="Lot Date *"><input type="date" className={inp} value={form.lotDate} onChange={set('lotDate')} /></Field>
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
