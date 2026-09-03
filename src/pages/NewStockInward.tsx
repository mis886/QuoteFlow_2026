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
// See src/pages/StockMovements.tsx for the list view and
// supabase/migrations/20260903060000_create_stock_movements_table.sql for
// the schema.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui';
import { StockMovementWarehouse } from '../lib/types';

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

const STOCK_CATEGORIES = [
  'Alpha Pinene', 'Anthamber Residue', 'Anthamber Tops', 'Beta Pinene', 'Base Oil SK 70N', 'Bhakti 100',
  'Camphene', 'Camphor Oil', 'Camphor Powder', 'D-Limonene', 'Turpentine', 'Delta Carene', 'DHM Residue',
  'DHM Tops', 'Dipentene', 'ESTER T AND B', 'Fenchone', 'Gamma Terpinene', 'Geraniol HB', 'Geraniol Tops',
  'Isoborneol', 'Isoborneol Acetate', 'Isolongifolene Keton Comm', 'Isoborneol Flakes', 'LOOSE TERPINEOL EP',
  'Longifolene', 'OT PT', 'Pine Oil', 'Pine Tar', 'Rosin', 'SODIUM ACETATE TRIHYDRATE', 'Terpineol',
  'Terpinolene', 'TMCM T&B Residue', 'TMCM T&B Tops', 'Turpentine -Pharma', 'Loose Anthamber TOPS',
  'Loose DHM Tops', 'Nerol Iso Tops', 'Citronella Oil', 'Loose DL-Limonene Bhilai', 'DHM Terpene 100',
  'PINE OIL 211', 'PINE OIL 311', 'Turpentine Mixture', 'Methyl Pentanone HB', 'Terpinyl Acetate',
  'Ester Gum', 'EUCALYPTUS OIL',
];

const PRODUCT_NAMES = [
  'Alpha Pinene 95% -ve 24', 'Alpha Pinene 95 +ve', 'Alpha Pinene 96+ve32', 'Alpha Pinene 96+ve32 ROB',
  'Alpha Pinene 98 - ve', 'Alpha Pinene 98 +ve', 'Anthamber Residue', 'Anthamber Tops Yellow',
  'Anthamber Tops White', 'Anthamber Tops', 'Beta Pinene', 'Beta Pinene 95%', 'Beta Pinene 98%',
  'Base Oil SK 70N', 'Beta Pinene 98% ROB', 'Bhakti 100', 'Camphene', 'Camphor oil', 'Camphor Oil PFG',
  'Camphor Oil Comm.', 'Camphor Powder', 'Camphor powder (blue)', 'Camphor NATURAL', 'Citronella Oil',
  'D-Limonene', 'Dipentene LC (Not to be issued)', 'Delta Carene 92%', 'Delta Carene 95%', 'DHM Residue',
  'DHM Tops White', 'DHM Yellow', 'Dipentene', 'DHM Terpene 100', 'Dipentene Ind Paint', 'DHM tops',
  'DHM Tops Yellow', 'ESTER T AND B', 'Fenchone', 'Gamma Terpinene 90%', 'Gamma Terpinene 95%',
  'Gamma Terpinene 96%', 'Geraniol HB', 'Geraniol Tops', 'Gum Rosin Indian', 'Gum Rosin Indo NON PHT',
  'Gum Rosin WG', 'Gum Rosin N', 'Gum Rosin K', 'Gum Rosin D', 'GAMMA TERPENTINE',
  'Isolongifolene Keton Comm', 'Isoborneol Acetate', 'Isoborneol Flakes', 'Isoborneol', 'Isolongifolene PFG',
  'Gum Rosin X', 'Gum Rosin Indo PHT', 'Gum Rosin', 'Gamma Terpenene 65', 'Longifolene',
  'LOOSE TERPINEOL EP', 'Nerol Iso Tops', 'OT PT', 'Pine Oil', 'Pine Oil 211', 'Pine Oil 311 (22%)',
  'Pine Oil 411 (32%)', 'Pine Oil 50', 'Pine Oil 511 (40% To 42%)', 'Pine Oil 65', 'PINE OIL 85',
  'Pine Oil (Indigo)', 'Pine Oil 40', 'Pine Tar', 'Turpentine ITC (Dipentene HC DT)', 'Pine Tar 300',
  'SODIUM ACETATE TRIHYDRATE', 'Turpentine (Dipentene LC)', 'Turpentine', 'Turpentine Pharma',
  'Terpinolene', 'Terpineol Comm', 'Terpineol CP', 'Terpineol DG', 'Terpineol EP', 'Terpineol MG',
  'Terpineol MU', 'Terpineol PG', 'Terpinolene 20', 'Terpinolene 30', 'Terpineol', 'Terpinolene 90',
  'TMCM T&B Residue', 'TMCM T&B Tops', 'Turpentine Mixture', 'Loose Anthamber TOPS',
  'Loose Anthamber Tops-yellow', 'Loose DHM Tops', 'Loose Dipentene [Pine Indigo]',
  'loose Dipentene Ind Paint', 'Loose Terpineol EP', 'LOOSE Terpineol PG', 'Loose-Beta Pinene',
  'Loose Turpentine', 'Loose DHM Tops white', 'Loose DHM Tops Yellow', 'Loose-Gamma Terpinene 98',
  'Loose DL-Limonene Bhilai', 'Methyl Pentanone HB', 'DL Limonene', 'Terpinyl Acetate', 'DELTA 3 CARENE',
  'Ester Gum', 'EUCALYPTUS OIL', 'Delta 3 carene', 'ROSIN Aegentina',
];

const PACKAGING_TYPES = [
  'HDPE barrel', 'MS', 'Bag', 'Carboy', 'MS Barrel', 'Drum', 'New HTPL HDPE', 'Carbouys', 'MS Patra',
  'HDPE', 'GI patra', 'BOX', 'Used GI Drum', 'MS EPOXY', 'Tanker', 'New GI DRUM',
];

// Searchable combobox for Product Name — the list is long, so a plain
// <select> is unwieldy. Positions its dropdown via a portal (like
// ProductSearch.tsx) so it can't be clipped by any scroll container.
function ProductNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? PRODUCT_NAMES.filter(n => n.toLowerCase().includes(q)) : PRODUCT_NAMES;
  }, [query]);

  const calcPos = () => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (e: MouseEvent) => { if (!containerRef.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const pick = (name: string) => { onChange(name); setQuery(name); setOpen(false); };

  return (
    <div ref={containerRef} className="relative">
      <input
        className={inputCls}
        value={query}
        placeholder="Type to search…"
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); if (!open) calcPos(); setOpen(true); }}
        onFocus={() => { calcPos(); setOpen(true); }}
      />
      {open && filtered.length > 0 && pos && ReactDOM.createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-g200 rounded-[3px] shadow-lg max-h-[220px] overflow-y-auto"
        >
          {filtered.map(name => (
            <div
              key={name}
              onMouseDown={e => { e.preventDefault(); pick(name); }}
              className={`px-2.5 py-1.5 cursor-pointer text-[12px] ${name === value ? 'bg-red-lt/40 text-red-mrt font-medium' : 'text-blk hover:bg-g100'}`}
            >
              {name}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

const emptyForm = {
  warehouse: '', whLotNo: '', stockCategory: '', productName: '',
  lotDate: '', lotQty: '', packing: '', weightType: '', packagingType: '', totalQty: '',
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
    form.warehouse && form.whLotNo.trim() && form.stockCategory && form.productName.trim() &&
    form.lotDate && form.lotQty.trim() && form.packing.trim() && form.totalQty.trim()
  );

  const save = async () => {
    if (!isValid) { setError('Please fill in all required fields.'); return; }
    setSaving(true);
    setError('');

    const whLotNo = form.whLotNo.trim();
    const lotQty = num(form.lotQty);
    const packing = num(form.packing);
    const totalQty = num(form.totalQty);

    const movementPayload = {
      type: 'inward',
      warehouse: form.warehouse,
      wh_lot_no: whLotNo,
      stock_category: form.stockCategory,
      product_name: form.productName.trim(),
      lot_date: form.lotDate,
      lot_qty: lotQty,
      packing,
      weight_type: form.weightType || null,
      packaging_type: form.packagingType || null,
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
          inward_date: form.lotDate,
          [partyCol]: lotQty,
          packing,
          unit: form.weightType || null,
          packaging_type: form.packagingType || null,
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
        <div className="flex flex-col gap-[14px] max-w-3xl">
          <div className={cardCls}>
            <div className={sectionHeaderCls}>Lot Details</div>
            <div className="grid grid-cols-2 gap-[12px]">
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
                <label className={labelCls}>Stock Category <span className="text-red-mrt">*</span></label>
                <select className={selectCls} value={form.stockCategory} onChange={set('stockCategory')}>
                  <option value="">Select...</option>
                  {STOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Product Name <span className="text-red-mrt">*</span></label>
                <ProductNameField value={form.productName} onChange={v => setForm(f => ({ ...f, productName: v }))} />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Quantity</div>
            <div className="grid grid-cols-3 gap-[12px]">
              <div>
                <label className={labelCls}>Lot Date <span className="text-red-mrt">*</span></label>
                <input type="date" className={inputCls} value={form.lotDate} onChange={set('lotDate')} />
              </div>
              <div>
                <label className={labelCls}>Lot Quantity <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.lotQty} onChange={set('lotQty')} />
              </div>
              <div>
                <label className={labelCls}>Packing <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.packing} onChange={set('packing')} />
              </div>
              <div>
                <label className={labelCls}>Weight Type</label>
                <select className={selectCls} value={form.weightType} onChange={set('weightType')}>
                  <option value="">Select...</option>
                  <option value="KG">KG</option>
                  <option value="LTR">LTR</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <select className={selectCls} value={form.packagingType} onChange={set('packagingType')}>
                  <option value="">Select...</option>
                  {PACKAGING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Total Quantity <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.totalQty} onChange={set('totalQty')} />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Other</div>
            <div className="grid grid-cols-2 gap-[12px]">
              <div>
                <label className={labelCls}>Make</label>
                <input className={inputCls} value={form.make} onChange={set('make')} />
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
          {saving ? 'Saving…' : 'Save Inward Entry'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/stock-movements')} disabled={saving}>Cancel</Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {error && <div className="ml-4 text-red-mrt text-[11px] font-bold">{error}</div>}
      </div>
    </div>
  );
}
