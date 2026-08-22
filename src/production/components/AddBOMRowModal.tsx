// Add BOM component modal — add compound row or raw material row.

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../components/ui';
import { addBOMRow } from '../lib/db';

interface Props {
  open: boolean;
  productId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export function AddBOMRowModal({ open, productId, onClose, onSaved }: Props) {
  const [isCompound, setIsCompound] = useState(false);
  const [rawCode, setRawCode] = useState('');
  const [rawName, setRawName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('kg');
  const [supplier, setSupplier] = useState('');
  const [kgPerBatch, setKgPerBatch] = useState('');
  const [batchesPerRun, setBatchesPerRun] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setIsCompound(false); setRawCode(''); setRawName('');
    setQty(''); setUnit('kg'); setSupplier('');
    setKgPerBatch(''); setBatchesPerRun('');
  };

  const save = async () => {
    if (!rawCode.trim() || !rawName.trim()) return;
    setSaving(true);
    try {
      await addBOMRow({
        product_id: productId,
        is_compound: isCompound,
        raw_code: rawCode.trim(),
        raw_name: rawName.trim(),
        qty_per_batch: qty ? parseFloat(qty) : null,
        unit: unit || 'kg',
        supplier: supplier.trim() || null,
        kg_per_batch: kgPerBatch ? parseFloat(kgPerBatch) : null,
        batches_per_run: batchesPerRun ? parseInt(batchesPerRun) : null,
        sort_order: 99,
      });
      await onSaved();
      reset();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[480px] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[#111]">Add BOM Component</div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-[#333] hover:text-[#111]">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsCompound(false)}
              className={`flex-1 py-1.5 text-[12px] rounded-[3px] border transition-colors ${
                !isCompound ? 'bg-red-mrt text-white border-[#0A6ED1]' : 'bg-white text-[#666] border-[#CCC] hover:bg-[#FAFAFA]'
              }`}
            >
              Raw Material
            </button>
            <button
              type="button"
              onClick={() => setIsCompound(true)}
              className={`flex-1 py-1.5 text-[12px] rounded-[3px] border transition-colors ${
                isCompound ? 'bg-red-mrt text-white border-[#0A6ED1]' : 'bg-white text-[#666] border-[#CCC] hover:bg-[#FAFAFA]'
              }`}
            >
              Compound (rubber)
            </button>
          </div>

          <Field label="Code *">
            <input className={inp} value={rawCode} onChange={e => setRawCode(e.target.value)}
              placeholder={isCompound ? 'e.g. EPDM-70' : 'e.g. RM-ZNO-01'} title="Code" />
          </Field>
          <Field label="Name *">
            <input className={inp} value={rawName} onChange={e => setRawName(e.target.value)}
              placeholder={isCompound ? 'e.g. EPDM 70 Shore A' : 'e.g. Zinc Oxide'} title="Name" />
          </Field>

          {isCompound ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="kg per Batch">
                <input type="number" className={inp} value={kgPerBatch}
                  onChange={e => setKgPerBatch(e.target.value)} title="kg per batch" />
              </Field>
              <Field label="Batches per Run">
                <input type="number" className={inp} value={batchesPerRun}
                  onChange={e => setBatchesPerRun(e.target.value)} title="Batches per run" />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Qty per Batch">
                <input type="number" className={inp} value={qty}
                  onChange={e => setQty(e.target.value)} title="Quantity per batch" />
              </Field>
              <Field label="Unit">
                <select className={inp} value={unit} onChange={e => setUnit(e.target.value)} title="Unit">
                  {['kg','g','L','mL','pcs','m'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Supplier">
                <input className={inp} value={supplier}
                  onChange={e => setSupplier(e.target.value)} placeholder="Supplier" title="Supplier" />
              </Field>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#E4E5E6] flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}
            disabled={!rawCode.trim() || !rawName.trim() || saving}>
            {saving ? 'Adding…' : 'Add Component'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const inp = 'w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">{label}</label>
      {children}
    </div>
  );
}
