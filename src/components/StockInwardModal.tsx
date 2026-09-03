// "New Inward" entry modal for the Stock Movements module — replaces the
// "Stock Inward" Google Form. Self-contained (own Supabase queries, no
// global store plumbing), same pattern as StockLotModal.tsx. Append-only:
// there's no edit mode, only new entries.
//
// On save this does two things client-side (no DB trigger):
//   1. Inserts one row into stock_movements (the immutable audit trail).
//   2. Upserts the matching stock_lots row by wh_lot_no, so Stockbook's
//      running party/godown balances stay correct without Stockbook.tsx
//      itself changing at all.
// See src/pages/StockMovements.tsx for the list view and
// supabase/migrations/20260903060000_create_stock_movements_table.sql.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './ui';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { StockMovementWarehouse } from '../lib/types';

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
// ProductSearch.tsx) so it isn't clipped by this modal's own scroll area.
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
        className={inp}
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

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const emptyForm = {
  warehouse: '', whLotNo: '', stockCategory: '', productName: '',
  lotDate: '', lotQty: '', packing: '', weightType: '', packagingType: '', totalQty: '',
  make: '', remark: '',
};

export function StockInwardModal({ open, onClose, onSaved }: Props) {
  const { user } = useAppStore();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setForm(emptyForm); setError(''); }
  }, [open]);

  if (!open) return null;

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
      await onSaved();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-g200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="text-[13.5px] font-semibold text-blk">New Inward Entry</div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-g500 hover:text-blk">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Lot Details</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Warehouse *">
                <select className={inp} value={form.warehouse} onChange={set('warehouse')}>
                  <option value="">Select…</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </Field>
              <Field label="Lot No *">
                <input className={inp} value={form.whLotNo} onChange={set('whLotNo')} />
              </Field>
              <Field label="Stock Category *">
                <select className={inp} value={form.stockCategory} onChange={set('stockCategory')}>
                  <option value="">Select…</option>
                  {STOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Product Name *">
                <ProductNameField value={form.productName} onChange={v => setForm(f => ({ ...f, productName: v }))} />
              </Field>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Quantity</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Lot Date *"><input type="date" className={inp} value={form.lotDate} onChange={set('lotDate')} /></Field>
              <Field label="Lot Quantity *"><input type="number" className={inp} value={form.lotQty} onChange={set('lotQty')} /></Field>
              <Field label="Packing *"><input type="number" className={inp} value={form.packing} onChange={set('packing')} /></Field>
              <Field label="Weight Type">
                <select className={inp} value={form.weightType} onChange={set('weightType')}>
                  <option value="">Select…</option>
                  <option value="KG">KG</option>
                  <option value="LTR">LTR</option>
                </select>
              </Field>
              <Field label="Type">
                <select className={inp} value={form.packagingType} onChange={set('packagingType')}>
                  <option value="">Select…</option>
                  {PACKAGING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Total Quantity *"><input type="number" className={inp} value={form.totalQty} onChange={set('totalQty')} /></Field>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-mono font-bold tracking-[1.5px] uppercase text-red-mrt mb-2">Other</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Make"><input className={inp} value={form.make} onChange={set('make')} /></Field>
            </div>
            <Field label="Remark" className="mt-3">
              <textarea className={`${inp} min-h-[60px]`} value={form.remark} onChange={set('remark')} />
            </Field>
          </div>

          {error && <p className="text-[11.5px] text-red-mrt font-medium">{error}</p>}
        </div>

        <div className="px-5 py-3.5 border-t border-g200 flex items-center justify-end gap-2 sticky bottom-0 bg-white">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!isValid || saving}>
            {saving ? 'Saving…' : 'Save Inward Entry'}
          </Button>
        </div>
      </div>
    </div>
  );
}
