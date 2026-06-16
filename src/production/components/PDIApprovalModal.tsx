// PDI approval modal — capture officer name, confirm move to Dispatch.

import { useEffect, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import type { ProductionJob } from '../lib/types';
import { productIdentity } from '../lib/productLabel';

interface Props {
  open: boolean;
  job: ProductionJob | null;
  onClose: () => void;
  onConfirm: (officer: string) => Promise<void> | void;
}

export function PDIApprovalModal({ open, job, onClose, onConfirm }: Props) {
  const [officer, setOfficer] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setOfficer(''); }, [open]);

  if (!open || !job) return null;

  const submit = async () => {
    if (!officer.trim()) return;
    setBusy(true);
    try { await onConfirm(officer.trim()); }
    finally { setBusy(false); }
  };

  const ts = new Date().toLocaleString();

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[480px] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[#111]">Approve PDI — {job.id}</div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-[#333] hover:text-[#111]"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-[12.5px] text-[#111]">
            Approving PDI will move <strong>{job.id}</strong> ({productIdentity(job)}) to <strong>Ready to Dispatch</strong>.
          </div>
          <div>
            <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">
              PDI Officer Name <span className="text-[#0A6ED1]">*</span>
            </label>
            <input
              className="w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt"
              value={officer}
              onChange={e => setOfficer(e.target.value)}
              placeholder="Enter your name"
              title="PDI officer name"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">
              PDI Timestamp
            </label>
            <input
              className="w-full font-sans text-[12.5px] text-[#333] bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5"
              value={ts}
              readOnly
              title="PDI timestamp"
            />
          </div>
          <div className="bg-green-50 border border-green-200 rounded-[3px] px-3 py-2 text-[11.5px] text-green-800 flex items-start gap-2">
            <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
            <span>All inspection criteria met. Approving will enable dispatch confirmation.</span>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[#E4E5E6] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] border border-[#CCC] rounded-[3px] hover:bg-[#FAFAFA]">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={!officer.trim() || busy}
            className="px-3 py-1.5 text-[12px] bg-green-600 text-white rounded-[3px] hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
          >
            <CheckCircle2 size={11} /> {busy ? 'Approving…' : 'Approve & Move to Dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
}
