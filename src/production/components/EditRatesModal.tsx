// Edit Production Rates modal — mirrors v2 openEditTATModal().
// Updates setup_time_hrs, finish_rate, insp_rate, pdi_time_hrs.
// Moulding rate stays auto-calculated (not editable).

import { useEffect, useState } from 'react';
import { X, Info } from 'lucide-react';
import { Button } from '../../components/ui';
import { upsertProduct } from '../lib/db';
import type { Product } from '../lib/types';

interface Props {
  open: boolean;
  product: Product;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export function EditRatesModal({ open, product, onClose, onSaved }: Props) {
  const [setupTime, setSetupTime] = useState('');
  const [finishRate, setFinishRate] = useState('');
  const [inspRate, setInspRate] = useState('');
  const [pdiTime, setPdiTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSetupTime(String(product.setup_time_hrs ?? 0.5));
      setFinishRate(String(product.finish_rate ?? ''));
      setInspRate(String(product.insp_rate ?? ''));
      setPdiTime(String(product.pdi_time_hrs ?? 0.25));
    }
  }, [open, product]);

  if (!open) return null;

  const mouldRate = product.cure_time_min && product.cavities
    ? ((60 / product.cure_time_min) * product.cavities).toFixed(1)
    : null;

  const PLANNED_F = 6; const PLANNED_I = 3; const refQty = 100;
  const mH = mouldRate ? (refQty / parseFloat(mouldRate)) + parseFloat(setupTime || '0.5') : null;
  const fH = finishRate ? refQty / (parseFloat(finishRate) * PLANNED_F) : null;
  const iH = inspRate   ? refQty / (parseFloat(inspRate)   * PLANNED_I) : null;
  const pdi = parseFloat(pdiTime || '0.25');
  const totalH = mH != null && fH != null && iH != null ? mH + fH + iH + pdi : null;

  const save = async () => {
    setSaving(true);
    try {
      await upsertProduct({
        id: product.id,
        code: product.code,
        name: product.name,
        setup_time_hrs: parseFloat(setupTime) || 0.5,
        finish_rate: finishRate ? parseFloat(finishRate) : null,
        insp_rate: inspRate ? parseFloat(inspRate) : null,
        pdi_time_hrs: parseFloat(pdiTime) || 0.25,
      });
      await onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Save failed. See console.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[520px] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[#111]">
            Edit Production Rates — <span className="font-mono text-[#0A6ED1]">{product.code}</span>
          </div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-[#333] hover:text-[#111]">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-[3px] px-3 py-2 text-[11.5px] text-blue-800 flex items-start gap-2">
            <Info size={12} className="shrink-0 mt-0.5" />
            <span>Rate changes recalculate LSD for all future jobs. Moulding rate is auto-calculated.</span>
          </div>

          {/* Moulding rate (read-only) */}
          <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2 text-[12px]">
            <strong>Moulding rate (auto):</strong> (60 ÷ {product.cure_time_min} min) × {product.cavities} cav
            = <strong className="text-[#0A6ED1]">{mouldRate || '—'} pcs/hr</strong>
            &nbsp;· Setup time:
            <input
              type="number" step="0.25" min="0"
              value={setupTime}
              onChange={e => setSetupTime(e.target.value)}
              title="Setup time in hours"
              className="ml-1.5 w-[60px] font-sans text-[11.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-1.5 py-0.5 outline-none focus:border-[#0A6ED1]"
            />
            <span className="ml-1">hrs/job</span>
          </div>

          {/* Rate inputs */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Finishing rate (pcs/person/hr)" hint="From PMS sheet column U">
              <input type="number" min="1" step="0.5" value={finishRate}
                onChange={e => setFinishRate(e.target.value)}
                className={inp} title="Finishing rate" />
            </Field>
            <Field label="Inspection rate (pcs/inspector/hr)" hint="From PMS sheet column W">
              <input type="number" min="1" step="1" value={inspRate}
                onChange={e => setInspRate(e.target.value)}
                className={inp} title="Inspection rate" />
            </Field>
            <Field label="PDI time (hrs/job, fixed)" hint="">
              <input type="number" min="0.1" step="0.25" value={pdiTime}
                onChange={e => setPdiTime(e.target.value)}
                className={inp} title="PDI time" />
            </Field>
          </div>

          {/* Live TAT preview */}
          {totalH != null && (
            <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2.5 text-[12px]">
              <div className="font-semibold text-[#111] mb-1.5">
                TAT preview @ {refQty} pcs with planned headcount ({PLANNED_F}F / {PLANNED_I}I):
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { l: 'Mould',   v: mH!.toFixed(1) + 'h' },
                  { l: 'Finish',  v: fH!.toFixed(1) + 'h' },
                  { l: 'Insp',    v: iH!.toFixed(1) + 'h' },
                  { l: 'PDI',     v: pdi.toFixed(2) + 'h' },
                  { l: 'Total',   v: totalH.toFixed(1) + 'h' },
                  { l: 'Days',    v: Math.ceil(totalH / 8) + 'd' },
                ].map(x => (
                  <span key={x.l} className="bg-white border border-[#E4E5E6] rounded-[3px] px-2 py-1 text-[11.5px]">
                    <span className="text-[#333]">{x.l}:</span> <strong>{x.v}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#E4E5E6] flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="success" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Rates'}
          </Button>
        </div>
      </div>
    </div>
  );
}

const inp = 'w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt';

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">
        {label}
      </label>
      {children}
      {hint && <div className="text-[10px] text-[#333] mt-1">{hint}</div>}
    </div>
  );
}
