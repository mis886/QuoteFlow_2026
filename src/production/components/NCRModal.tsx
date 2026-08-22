// NCR modal — raise non-conformance against a job at Inspection.
// Ports MRT v2 failInspection() / submitNCR() (line 933-).

import { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { ProductionJob } from '../lib/types';

const DEFECT_CODES = [
  'DC-01 — Flash / Burr',
  'DC-02 — Short Shot',
  'DC-03 — Dimension Out of Tolerance',
  'DC-04 — Surface Defect',
  'DC-05 — Hardness Out of Range',
  'DC-06 — Compound Contamination',
  'DC-07 — Other',
];
const STAGES = ['Moulding', 'Finishing', 'Material / Compound'];

interface Props {
  open: boolean;
  job: ProductionJob | null;
  onClose: () => void;
  onSubmit: (payload: {
    defect_desc: string; defect_code: string; responsible_stage: string;
    action: 'rework' | 'reject';
  }) => Promise<void> | void;
}

export function NCRModal({ open, job, onClose, onSubmit }: Props) {
  const [desc, setDesc] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState(STAGES[0]);
  const [action, setAction] = useState<'rework' | 'reject'>('rework');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setDesc(''); setCode(''); setStage(STAGES[0]); setAction('rework'); }
  }, [open]);

  if (!open || !job) return null;

  const submit = async () => {
    if (!code || !desc.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ defect_desc: desc.trim(), defect_code: code, responsible_stage: stage, action });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[480px] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[#111] flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-[#0A6ED1]" />
            Raise NCR — {job.id}
          </div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-[#333] hover:text-[#111]"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          <Field label="Defect Description" required>
            <input className={inp} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the defect observed…" title="Defect description" />
          </Field>
          <Field label="Defect Code" required>
            <select className={inp} value={code} onChange={e => setCode(e.target.value)} title="Defect code">
              <option value="">Select defect code…</option>
              {DEFECT_CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Responsible Stage">
            <select className={inp} value={stage} onChange={e => setStage(e.target.value)} title="Responsible stage">
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Action">
            <select className={inp} value={action} onChange={e => setAction(e.target.value as any)} title="Action">
              <option value="rework">Send to Rework (re-enter Finishing queue)</option>
              <option value="reject">Reject Batch</option>
            </select>
          </Field>
        </div>

        <div className="px-4 py-3 border-t border-[#E4E5E6] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] border border-[#CCC] rounded-[3px] hover:bg-[#FAFAFA]">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={!code || !desc.trim() || busy}
            className="px-3 py-1.5 text-[12px] bg-red-mrt text-white rounded-[3px] hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
          >
            <AlertTriangle size={11} /> {busy ? 'Raising…' : 'Raise NCR'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = 'w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">
        {label} {required && <span className="text-[#0A6ED1]">*</span>}
      </label>
      {children}
    </div>
  );
}
