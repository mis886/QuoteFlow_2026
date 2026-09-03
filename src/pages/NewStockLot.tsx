// Full-page "New Stock Lot" entry form for Stockbook — the create half of
// what StockLotModal.tsx used to handle both add and edit for. Page chrome,
// section-card pattern, and single-column full-width layout are copied
// exactly from NewStockInward.tsx / NewStockOutward.tsx.
//
// Editing an existing lot is unchanged — that still opens StockLotModal.tsx
// from Stockbook.tsx's row-level Edit button. This page only ever inserts a
// new stock_lots row.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui';

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";
const sectionHeaderCls = "font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200";
const cardCls = "bg-white border border-g200 p-[18px_20px]";

const emptyForm = {
  whLotNo: '', factLotNo: '', lotType: '', productCode: '', productName: '',
  inwardDate: '', sampleOff: false, opQty: '', tankerUnload: '', coaFile: '',
  qtyHariom: '', qtyWadaHe: '', qtyHe: '', qtyReliable: '', qtySwastik: '', qtyBalaji: '', qtyWada: '',
  packing: '', unit: '', packagingType: '', quantity: '', make: '', remark: '',
};

export function NewStockLot() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const isValid = !!form.productName.trim();

  const save = async () => {
    if (!isValid) { setError('Product name is required.'); return; }
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

    const { error: err } = await supabase.from('stock_lots').insert({ ...payload, created_by: user?.email ?? null });

    if (err) {
      setError(err.message);
    } else {
      navigate('/stockbook');
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Stockbook Module</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">Log <em className="italic text-red-mrt">New Stock Lot</em></h1>
            <p className="text-xs text-g500 mt-1 font-light">Add a lot-wise raw-material stock record, split by party / godown.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/stockbook')}>Back</Button>
        </div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[14px]">
          <div className={cardCls}>
            <div className={sectionHeaderCls}>Lot Details</div>
            <div className="grid grid-cols-4 gap-[12px]">
              <div>
                <label className={labelCls}>WH Lot No</label>
                <input className={inputCls} value={form.whLotNo} onChange={set('whLotNo')} />
              </div>
              <div>
                <label className={labelCls}>Fact Lot No</label>
                <input className={inputCls} value={form.factLotNo} onChange={set('factLotNo')} />
              </div>
              <div>
                <label className={labelCls}>Lot Type</label>
                <input className={inputCls} value={form.lotType} onChange={set('lotType')} placeholder="W / TR" />
              </div>
              <div>
                <label className={labelCls}>Product Code</label>
                <input className={inputCls} value={form.productCode} onChange={set('productCode')} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Product Name <span className="text-red-mrt">*</span></label>
                <input className={inputCls} value={form.productName} onChange={set('productName')} placeholder="e.g. Alpha Pinene 95% -ve" />
              </div>
              <div>
                <label className={labelCls}>Inward Date</label>
                <input type="date" className={inputCls} value={form.inwardDate} onChange={set('inwardDate')} />
              </div>
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
              <div>
                <label className={labelCls}>Op Qty</label>
                <input type="number" className={inputCls} value={form.opQty} onChange={set('opQty')} />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Quantity by Party / Godown</div>
            <div className="grid grid-cols-7 gap-[12px]">
              <div>
                <label className={labelCls}>Hariom</label>
                <input type="number" className={inputCls} value={form.qtyHariom} onChange={set('qtyHariom')} />
              </div>
              <div>
                <label className={labelCls}>Wada-HE</label>
                <input type="number" className={inputCls} value={form.qtyWadaHe} onChange={set('qtyWadaHe')} />
              </div>
              <div>
                <label className={labelCls}>HE</label>
                <input type="number" className={inputCls} value={form.qtyHe} onChange={set('qtyHe')} />
              </div>
              <div>
                <label className={labelCls}>Reliable</label>
                <input type="number" className={inputCls} value={form.qtyReliable} onChange={set('qtyReliable')} />
              </div>
              <div>
                <label className={labelCls}>Swastik</label>
                <input type="number" className={inputCls} value={form.qtySwastik} onChange={set('qtySwastik')} />
              </div>
              <div>
                <label className={labelCls}>BALAJI</label>
                <input type="number" className={inputCls} value={form.qtyBalaji} onChange={set('qtyBalaji')} />
              </div>
              <div>
                <label className={labelCls}>Wada</label>
                <input type="number" className={inputCls} value={form.qtyWada} onChange={set('qtyWada')} />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Packing &amp; Total</div>
            <div className="grid grid-cols-7 gap-[12px]">
              <div>
                <label className={labelCls}>Packing</label>
                <input type="number" className={inputCls} value={form.packing} onChange={set('packing')} />
              </div>
              <div>
                <label className={labelCls}>Unit</label>
                <input className={inputCls} value={form.unit} onChange={set('unit')} placeholder="Kg / Ltr" />
              </div>
              <div>
                <label className={labelCls}>Packaging Type</label>
                <input className={inputCls} value={form.packagingType} onChange={set('packagingType')} placeholder="Plastic / Barrel / MS" />
              </div>
              <div>
                <label className={labelCls}>Quantity</label>
                <input type="number" className={inputCls} value={form.quantity} onChange={set('quantity')} />
              </div>
              <div>
                <label className={labelCls}>Make</label>
                <input className={inputCls} value={form.make} onChange={set('make')} placeholder="WADA / PRIVI / ..." />
              </div>
              <div>
                <label className={labelCls}>Tanker Unload</label>
                <input className={inputCls} value={form.tankerUnload} onChange={set('tankerUnload')} />
              </div>
              <div>
                <label className={labelCls}>COA File</label>
                <input className={inputCls} value={form.coaFile} onChange={set('coaFile')} />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>Remark</label>
              <textarea className={`${inputCls} min-h-[68px]`} value={form.remark} onChange={set('remark')} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-[14px_20px] bg-g100 border-t border-g200 sticky bottom-0">
        <Button variant="primary" onClick={save} disabled={!isValid || saving}>
          {saving ? 'Saving…' : 'Save Stock Lot'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/stockbook')} disabled={saving}>Cancel</Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {error && <div className="ml-4 text-red-mrt text-[11px] font-bold">{error}</div>}
      </div>
    </div>
  );
}
