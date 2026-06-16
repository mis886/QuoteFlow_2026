// Confirm dispatch modal — courier + consignment + live OTD verdict preview.

import { useEffect, useMemo, useState } from 'react';
import { X, Truck, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ProductionJob } from '../lib/types';
import { productIdentity } from '../lib/productLabel';
import { fmtDate } from '../../lib/utils';

const COURIERS = ['Blue Dart', 'DTDC', 'Delhivery', 'FedEx', 'Own vehicle'];

interface Props {
  open: boolean;
  job: ProductionJob | null;
  onClose: () => void;
  onConfirm: (payload: { courier: string; consignment_no: string }) => Promise<void> | void;
}

export function ConfirmDispatchModal({ open, job, onClose, onConfirm }: Props) {
  const [courier, setCourier] = useState('');
  const [consignment, setConsignment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && job) {
      setCourier(job.courier || '');
      setConsignment(job.consignment_no || '');
    }
  }, [open, job]);

  const onTime = useMemo(() => {
    if (!job?.promised_date) return true;
    const promised = new Date(job.promised_date + 'T17:00:00');
    return Date.now() <= promised.getTime();
  }, [job]);

  if (!open || !job) return null;

  const submit = async () => {
    if (!courier) return;
    setBusy(true);
    try { await onConfirm({ courier, consignment_no: consignment.trim() }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[480px] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[#111] flex items-center gap-1.5">
            <Truck size={14} /> Confirm Dispatch — {job.id}
          </div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-[#333] hover:text-[#111]"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-[12.5px] text-[#111]">
            {productIdentity(job)} · {job.qty.toLocaleString()} pcs · {job.customer_name || '—'}
          </div>

          <div>
            <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">
              Courier <span className="text-[#0A6ED1]">*</span>
            </label>
            <select
              className="w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt"
              value={courier}
              onChange={e => setCourier(e.target.value)}
              title="Courier"
            >
              <option value="">Select courier…</option>
              {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">
              Consignment Number
            </label>
            <input
              className="w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt"
              value={consignment}
              onChange={e => setConsignment(e.target.value)}
              placeholder="AWB / tracking ID"
              title="Consignment number"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5">
              <div className="text-[10px] text-[#333]">Promised Date</div>
              <div className="text-[#111] font-medium">{fmtDate(job.promised_date)}</div>
            </div>
            <div className={`border rounded-[3px] px-2.5 py-1.5 ${onTime ? 'bg-green-50 border-green-200' : 'bg-[#E8F0FD] border-[#0A6ED1]/30'}`}>
              <div className={`text-[10px] ${onTime ? 'text-green-700' : 'text-[#0A6ED1]'}`}>OTD Verdict</div>
              <div className={`font-semibold ${onTime ? 'text-green-700' : 'text-[#0A6ED1]'}`}>
                {onTime ? '✓ On Time' : '✗ Late'}
              </div>
            </div>
          </div>

          <div className={`text-[11.5px] flex items-start gap-2 px-3 py-2 border rounded-[3px] ${
            onTime ? 'bg-green-50 border-green-200 text-green-800' : 'bg-[#E8F0FD] border-[#0A6ED1]/30 text-[#0A6ED1]'
          }`}>
            {onTime ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
            <span>
              This dispatch will be recorded as <strong>{onTime ? 'On Time' : 'Late'}</strong>.
              {!onTime && ' OTD % will be impacted.'}
            </span>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[#E4E5E6] flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-[12px] border border-[#CCC] rounded-[3px] hover:bg-[#FAFAFA]">Cancel</button>
          <button
            type="button"
            onClick={submit}
            disabled={!courier || busy}
            className="px-3 py-1.5 text-[12px] bg-green-600 text-white rounded-[3px] hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Truck size={11} /> {busy ? 'Dispatching…' : 'Confirm Dispatch'}
          </button>
        </div>
      </div>
    </div>
  );
}
