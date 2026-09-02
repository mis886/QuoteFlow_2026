// Add / edit modal for a single Stockbook lot. Self-contained — talks to
// Supabase directly (no global store plumbing), same pattern as
// ProductCatalogManager.tsx. See src/pages/Stockbook.tsx for the list view.

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { StockLot } from '../lib/types';

const inp = 'w-full font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[3px] px-2.5 py-[7px] outline-none focus:border-red-mrt focus:ring-2 focus:ring-red-lt transition-shadow';
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
  lot: StockLot | null; // null = add mode
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const emptyForm = {
  whLotNo: '', factLotNo: '', lotType: '', productCode: '', productName: '',
  inwardDate: '', sampleOff: false, opQty: '', tankerUnload: '', coaFile: '',
  qtyHariom: '', qtyWadaHe: '', qtyHe: '', qtyReliable: '', qtySwastik: '', qtyBalaji: '', qtyWada: '',
  packing: '', unit: '', packagingType: '', quantity: '', make: '', remark: '',
};

export function StockLotModal({ open, lot, onClose, onSaved }: Props) {
  const { user } = useAppStore();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (lot) {
      setForm({
        whLotNo: lot.whLotNo || '',
        factLotNo: lot.factLotNo || '',
        lotType: lot.lotType || '',
        productCode: lot.productCode || '',
        productName: lot.productName || '',
        inwardDate: lot.inwardDate || '',
        sampleOff: !!lot.sampleOff,
        opQty: lot.opQty?.toString() ?? '',
        tankerUnload: lot.tankerUnload || '',
        coaFile: lot.coaFile || '',
        qtyHariom: lot.qtyHariom?.toString() ?? '',
        qtyWadaHe: lot.qtyWadaHe?.toString() ?? '',
        qtyHe: lot.qtyHe?.toString() ?? '',
        qtyReliable: lot.qtyReliable?.toString() ?? '',
        qtySwastik: lot.qtySwastik?.toString() ?? '',
        qtyBalaji: lot.qtyBalaji?.toString() ?? '',
        qtyWada: lot.qtyWada?.toString() ?? '',
        packing: lot.packing?.toString() ?? '',
        unit: lot.unit || '',
        packagingType: lot.packagingType || '',
        quantity: lot.quantity?.toString() ?? '',
        make: lot.make || '',
        remark: lot.remark || '',
      });
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [open, lot]);

  if (!open) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const save = async () => {
    if (!form.productName.trim()) { setError('Product name is required.'); return; }
    setSaving(true);
    setError('');

    const payload = {
      wh_lot_no: form.whLotNo.trim() || null,
      fact_lot_no: form.factLotNo.trim() || null,
      lot_type: form.lotType.trim() || null,
      product_code: form.productCode.trim() || null,
      product_name: form.productName.trim(),
      inward_date: form.inwardDate || null,
      sample_off: form.sampleOff,
      op_qty: num(form.opQty),
      tanker_unload: form.tankerUnload.trim() || null,
      coa_file: form.coaFile.trim() || null,
      qty_hariom: num(form.qtyHariom),
      qty_wada_he: num(form.qtyWadaHe),
      qty_he: num(form.qtyHe),
      qty_reliable: num(form.qtyReliable),
      qty_swastik: num(form.qtySwastik),
      qty_balaji: num(form.qtyBalaji),
      qty_wada: num(form.qtyWada),
      packing: num(form.packing),
      unit: form.unit.trim() || null,
      packaging_type: form.packagingType.trim() || null,
      quantity: num(form.quantity),
      make: form.make.trim() || null,
      remark: form.remark.trim() || null,
    };

    const { error: err } = lot
      ? await supabase.from('stock_lots')
          .update({ ...payload, updated_at: new Date().toISOString(), updated_by: user?.email ?? null })
          .eq('id', lot.id)
      : await supabase.from('stock_lots')
          .insert({ ...payload, created_by: user?.email ?? null });

    if (err) {
      setError(err.message);
    } else {
      await onSaved();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-g200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="text-[13.5px] font-semibold text-blk">{lot ? 'Edit Stock Lot' : 'Add Stock Lot'}</div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-g500 hover:text-blk">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Lot Details</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="WH Lot No"><input className={inp} value={form.whLotNo} onChange={set('whLotNo')} /></Field>
              <Field label="Fact Lot No"><input className={inp} value={form.factLotNo} onChange={set('factLotNo')} /></Field>
              <Field label="Lot Type"><input className={inp} value={form.lotType} onChange={set('lotType')} placeholder="W / TR" /></Field>
              <Field label="Product Code"><input className={inp} value={form.productCode} onChange={set('productCode')} /></Field>
              <Field label="Product Name *" className="col-span-2">
                <input className={inp} value={form.productName} onChange={set('productName')} placeholder="e.g. Alpha Pinene 95% -ve" />
              </Field>
              <Field label="Inward Date"><input type="date" className={inp} value={form.inwardDate} onChange={set('inwardDate')} /></Field>
              <div className="flex items-end pb-1.5">
                <label className="inline-flex items-center gap-2 text-[12px] text-g600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.sampleOff}
                    onChange={e => setForm(f => ({ ...f, sampleOff: e.target.checked }))}
                    className="w-3.5 h-3.5 accent-red-mrt"
                  />
                  Sample Off
                </label>
              </div>
              <Field label="Op Qty"><input type="number" className={inp} value={form.opQty} onChange={set('opQty')} /></Field>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Quantity by Party / Godown</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Hariom"><input type="number" className={inp} value={form.qtyHariom} onChange={set('qtyHariom')} /></Field>
              <Field label="Wada-HE"><input type="number" className={inp} value={form.qtyWadaHe} onChange={set('qtyWadaHe')} /></Field>
              <Field label="HE"><input type="number" className={inp} value={form.qtyHe} onChange={set('qtyHe')} /></Field>
              <Field label="Reliable"><input type="number" className={inp} value={form.qtyReliable} onChange={set('qtyReliable')} /></Field>
              <Field label="Swastik"><input type="number" className={inp} value={form.qtySwastik} onChange={set('qtySwastik')} /></Field>
              <Field label="BALAJI"><input type="number" className={inp} value={form.qtyBalaji} onChange={set('qtyBalaji')} /></Field>
              <Field label="Wada"><input type="number" className={inp} value={form.qtyWada} onChange={set('qtyWada')} /></Field>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Packing &amp; Total</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Packing"><input type="number" className={inp} value={form.packing} onChange={set('packing')} /></Field>
              <Field label="Unit"><input className={inp} value={form.unit} onChange={set('unit')} placeholder="Kg / Ltr" /></Field>
              <Field label="Packaging Type"><input className={inp} value={form.packagingType} onChange={set('packagingType')} placeholder="Plastic / Barrel / MS" /></Field>
              <Field label="Quantity"><input type="number" className={inp} value={form.quantity} onChange={set('quantity')} /></Field>
              <Field label="Make"><input className={inp} value={form.make} onChange={set('make')} placeholder="WADA / PRIVI / ..." /></Field>
              <Field label="Tanker Unload"><input className={inp} value={form.tankerUnload} onChange={set('tankerUnload')} /></Field>
              <Field label="COA File"><input className={inp} value={form.coaFile} onChange={set('coaFile')} /></Field>
            </div>
          </div>

          <Field label="Remark">
            <textarea className={`${inp} min-h-[60px]`} value={form.remark} onChange={set('remark')} />
          </Field>

          {error && <p className="text-[11.5px] text-red-mrt font-medium">{error}</p>}
        </div>

        <div className="px-5 py-3.5 border-t border-g200 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!form.productName.trim() || saving}>
            {saving ? 'Saving…' : lot ? 'Save Changes' : 'Add Stock Lot'}
          </Button>
        </div>
      </div>
    </div>
  );
}
