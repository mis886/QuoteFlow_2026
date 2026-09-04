// Edit modal for a single Stock Movements "Outward" entry. Mirrors the
// field set of src/pages/NewStockOutward.tsx, but as a compact edit popup
// (same convention as StockLotModal.tsx / InwardEditModal.tsx) rather than
// a full page.
//
// Reconciliation: an outward entry's Warehouse/Lot No/Total Quantity drive
// a best-effort DECREMENT on the matching stock_lots row when the save
// happens (see NewStockOutward.tsx's save()) — it never blocks the save if
// no lot matches. Editing one of those fields means the original decrement
// is stale, so save() here first reverses it (adds the old quantity back to
// whatever lot the OLD values matched), then re-applies the new decrement
// (subtracts the new quantity from whatever lot the NEW values match) —
// both steps best-effort, exactly like the create flow.

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { StockMovement } from '../lib/types';
import { SearchableCombobox } from './SearchableCombobox';
import { PRODUCT_NAMES, PACKAGING_TYPES } from '../lib/stockMovementOptions';

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

const WAREHOUSES = ['Hariom', 'Reliable', 'Swastik', 'BALAJI', 'WADA', 'Other'];

// Outward's own party map (casing matches Outward's warehouse values, e.g.
// "BALAJI" — distinct from Inward's "Balaji"; keep this map Outward-only).
const PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom',
  Reliable: 'qty_reliable',
  Swastik: 'qty_swastik',
  BALAJI: 'qty_balaji',
  WADA: 'qty_wada',
};

// TODO: same placeholder lists as NewStockOutward.tsx — replace with the
// full 533-entry / 193-entry lists once available.
const PARTY_NAMES = [
  'A P INK', 'AARAV FRAGRANCES & FLAVOURS PVT. LTD.', 'ASIAN PAINTS LTD', 'BERGER PAINTS INDIA LTD',
  'GRASIM INDUSTRIES LIMITED', 'ITC LIMITED', 'ROBERTET INDIA PRIVATE LIMITED', 'SHALIMAR PAINTS LTD', 'Other',
];
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

// Applies a best-effort +/- delta to whichever stock_lots row `whLotNo`
// matches (via the given party column). Never throws — mirrors
// NewStockOutward.tsx's try/catch-and-log, non-blocking behavior.
async function adjustLot(partyCol: string | undefined, whLotNo: string, delta: number, userEmail?: string | null) {
  if (!partyCol || !whLotNo || !delta) return;
  try {
    const { data: lots } = await supabase.from('stock_lots').select('*').ilike('wh_lot_no', whLotNo).limit(1);
    const lot = lots?.[0];
    if (lot) {
      await supabase.from('stock_lots').update({
        [partyCol]: (lot[partyCol] ?? 0) + delta,
        quantity: (lot.quantity ?? 0) + delta,
        updated_at: new Date().toISOString(),
        updated_by: userEmail ?? null,
      }).eq('id', lot.id);
    }
  } catch (e) {
    console.error('Outward edit stock_lots adjustment failed (movement update still proceeds):', e);
  }
}

export function OutwardEditModal({ open, movement, onClose, onSaved }: Props) {
  const { user } = useAppStore();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const isKnownWarehouse = WAREHOUSES.slice(0, -1).includes(movement.warehouse);
    setForm({
      warehouse: isKnownWarehouse ? movement.warehouse : (movement.warehouse ? 'Other' : ''),
      otherWarehouse: isKnownWarehouse ? '' : (movement.warehouse || ''),
      doNumber: movement.doNumber || '',
      doDate: movement.doDate || '',
      lotNo: movement.whLotNo || '',
      lotDate: movement.lotDate || '',
      productName: movement.productName || '',
      numArticles: movement.numArticles || '',
      packing: movement.packing?.toString() ?? '',
      totalQty: movement.totalQty?.toString() ?? '',
      weightType: movement.weightType || '',
      packagingType: movement.packagingType || '',
      partyName: movement.partyName || '',
      otherParty: movement.otherParty || '',
      transporter: movement.transporter || '',
      otherTransporter: movement.otherTransporter || '',
      note: movement.note || '',
    });
    setError('');
  }, [open, movement]);

  if (!open) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const isOtherWarehouse = form.warehouse === 'Other';
  const isOtherParty = form.partyName === 'Other';
  const isOtherTransporter = form.transporter === 'Other';

  const save = async () => {
    if (!form.warehouse || (isOtherWarehouse && !form.otherWarehouse.trim()) || !form.doNumber.trim() || !form.productName.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');

    const warehouseToSave = isOtherWarehouse ? form.otherWarehouse.trim() : form.warehouse;
    const newLotNo = form.lotNo.trim();
    const newTotalQty = num(form.totalQty) ?? 0;
    const oldLotNo = (movement.whLotNo || '').trim();
    const oldTotalQty = movement.totalQty ?? 0;
    const oldPartyCol = PARTY_COLUMN[movement.warehouse];
    const newPartyCol = PARTY_COLUMN[warehouseToSave];

    // 1. Reverse the OLD entry's decrement (add its quantity back).
    await adjustLot(oldPartyCol, oldLotNo, oldTotalQty, user?.email);
    // 2. Re-apply the NEW (edited) decrement.
    await adjustLot(newPartyCol, newLotNo, -newTotalQty, user?.email);

    // 3. Update the stock_movements row itself.
    const movementPayload = {
      warehouse: warehouseToSave,
      wh_lot_no: newLotNo || null,
      product_name: form.productName.trim(),
      do_number: form.doNumber.trim(),
      do_date: form.doDate || null,
      lot_date: form.lotDate || null,
      num_articles: form.numArticles.trim() || null,
      packing: num(form.packing),
      weight_type: form.weightType || null,
      packaging_type: form.packagingType || null,
      total_qty: newTotalQty,
      party_name: form.partyName || null,
      other_party: isOtherParty ? (form.otherParty.trim() || null) : null,
      transporter: form.transporter || null,
      other_transporter: isOtherTransporter ? (form.otherTransporter.trim() || null) : null,
      note: form.note.trim() || null,
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
          <div className="text-[13.5px] font-semibold text-blk">Edit Outward Entry</div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-g500 hover:text-blk">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">DO &amp; Lot Details</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Warehouse *">
                <select className={sel} value={form.warehouse} onChange={set('warehouse')}>
                  <option value="">Select...</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </Field>
              {isOtherWarehouse && (
                <Field label="Other Warehouse *"><input className={inp} value={form.otherWarehouse} onChange={set('otherWarehouse')} /></Field>
              )}
              <Field label="DO Number *"><input className={inp} value={form.doNumber} onChange={set('doNumber')} /></Field>
              <Field label="DO Date"><input type="date" className={inp} value={form.doDate} onChange={set('doDate')} /></Field>
              <Field label="Lot No"><input className={inp} value={form.lotNo} onChange={set('lotNo')} /></Field>
              <Field label="Lot Date"><input type="date" className={inp} value={form.lotDate} onChange={set('lotDate')} /></Field>
              <Field label="Product Name *" className="col-span-2">
                <SearchableCombobox className={inp} options={PRODUCT_NAMES} value={form.productName} onChange={v => setForm(f => ({ ...f, productName: v }))} />
              </Field>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Quantity &amp; Packing</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Number of Articles"><input type="number" className={inp} value={form.numArticles} onChange={set('numArticles')} /></Field>
              <Field label="Packing"><input type="number" className={inp} value={form.packing} onChange={set('packing')} /></Field>
              <Field label="Total Quantity"><input type="number" className={inp} value={form.totalQty} onChange={set('totalQty')} /></Field>
              <Field label="Weight Type">
                <div className="flex items-center gap-4 h-[33px]">
                  {['KG', 'LTR'].map(wt => (
                    <label key={wt} className="inline-flex items-center gap-1.5 text-[12px] text-blk cursor-pointer select-none">
                      <input
                        type="radio"
                        name="weightTypeEdit"
                        value={wt}
                        checked={form.weightType === wt}
                        onChange={() => setForm(f => ({ ...f, weightType: wt }))}
                        className="w-3.5 h-3.5 accent-red-mrt"
                      />
                      {wt}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Type">
                <select className={sel} value={form.packagingType} onChange={set('packagingType')}>
                  <option value="">Select...</option>
                  {PACKAGING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Party, Transporter &amp; Note</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Party Name">
                <SearchableCombobox className={inp} options={PARTY_NAMES} value={form.partyName} onChange={v => setForm(f => ({ ...f, partyName: v }))} />
              </Field>
              {isOtherParty && (
                <Field label="Other Party"><input className={inp} value={form.otherParty} onChange={set('otherParty')} /></Field>
              )}
              <Field label="Transporter">
                <SearchableCombobox className={inp} options={TRANSPORTERS} value={form.transporter} onChange={v => setForm(f => ({ ...f, transporter: v }))} />
              </Field>
              {isOtherTransporter && (
                <Field label="Other Transporter"><input className={inp} value={form.otherTransporter} onChange={set('otherTransporter')} /></Field>
              )}
            </div>
            <div className="mt-3">
              <Field label="Note"><textarea className={`${inp} min-h-[60px]`} value={form.note} onChange={set('note')} /></Field>
            </div>
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
