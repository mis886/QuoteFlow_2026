// Assign-Press modal — multi-line capable.
// Doer picks a press (or it's pre-selected) and then ticks one or more
// queued jobs to load onto it. First job becomes the press's active_job
// (shown on the press card); the rest queue behind it on the same press.

import { useState, useEffect, useMemo } from 'react';
import { X, Check } from 'lucide-react';
import type { Press, Product, ProductionJob } from '../lib/types';
import { productIdentity } from '../lib/productLabel';
import { fmtDate } from '../../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  jobs: ProductionJob[];          // candidate jobs (moulding stage, no press)
  presses: Press[];               // all presses (idle = available)
  products?: Product[];           // product master — restricts presses to product.press_ids
  preselectPressId?: string | null;
  preselectJobId?: string | null;
  onConfirm: (jobIds: string[], pressId: string) => Promise<void> | void;
}

export function AssignPressModal({
  open, onClose, jobs, presses, products = [], preselectPressId, preselectJobId, onConfirm,
}: Props) {
  const [pressId, setPressId] = useState<string>(preselectPressId ?? '');
  const [pickedJobIds, setPickedJobIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Re-sync state when the modal opens with new preselects.
  useEffect(() => {
    if (!open) return;
    setPressId(preselectPressId ?? '');
    setPickedJobIds(preselectJobId ? new Set([preselectJobId]) : new Set());
  }, [open, preselectPressId, preselectJobId]);

  // Presses configured on a job's product (via Product Creation). When a job's
  // product restricts presses, only those may be selected for it.
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  // Across the currently-picked jobs, the selectable presses are the
  // intersection of each restricted product's allowed presses. Jobs whose
  // product imposes no restriction don't narrow the set.
  const allowedPressIds = useMemo<Set<string> | null>(() => {
    const allowedFor = (job: ProductionJob): string[] | null => {
      const prod = job.product_id ? productById.get(job.product_id) : undefined;
      const ids = prod?.press_ids;
      return ids && ids.length ? ids : null;   // null = no restriction
    };
    let acc: Set<string> | null = null;
    for (const j of jobs) {
      if (!pickedJobIds.has(j.id)) continue;
      const allowed = allowedFor(j);
      if (!allowed) continue;
      const set = new Set(allowed);
      acc = acc ? new Set([...acc].filter(id => set.has(id))) : set;
    }
    return acc;
  }, [jobs, pickedJobIds, productById]);

  // If the currently-selected press is no longer allowed, clear it.
  useEffect(() => {
    if (pressId && allowedPressIds && !allowedPressIds.has(pressId)) setPressId('');
  }, [allowedPressIds, pressId]);

  // All hooks are declared above this guard so the hook order stays stable
  // across open/closed renders (Rules of Hooks).
  if (!open) return null;

  const sortedJobs = jobs
    .slice()
    .sort((a, b) => {
      if (a.priority === 'emergency' && b.priority !== 'emergency') return -1;
      if (b.priority === 'emergency' && a.priority !== 'emergency') return 1;
      return (a.lsd || a.promised_date || '').localeCompare(b.lsd || b.promised_date || '');
    });

  const toggleJob = (id: string) => {
    setPickedJobIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!pressId || pickedJobIds.size === 0) return;
    setBusy(true);
    try {
      await onConfirm(Array.from(pickedJobIds), pressId);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = pickedJobIds.size;
  const selectedQty   = sortedJobs
    .filter(j => pickedJobIds.has(j.id))
    .reduce((s, j) => s + j.qty, 0);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[4px] w-full max-w-[640px] max-h-[85vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between shrink-0">
          <div className="text-[13px] font-semibold text-[#111]">
            Assign Jobs to Press
            <span className="ml-2 text-[11px] font-normal text-[#333]">
              Select one or more queued jobs and a press
            </span>
          </div>
          <button onClick={onClose} title="Close" aria-label="Close" className="text-[#333] hover:text-[#111]" type="button"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Press picker */}
          <div>
            <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1.5">
              Select Press <span className="text-[#0A6ED1]">*</span>
            </label>
            {allowedPressIds && (
              <div className="mb-1.5 text-[10px] text-[#555]">
                Restricted to presses configured on the selected product(s).
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {presses.map(p => {
                const notAllowed = !!allowedPressIds && !allowedPressIds.has(p.id);
                const busyPress = p.status !== 'idle';
                const disabled = busyPress || notAllowed;
                const selected = pressId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPressId(p.id)}
                    className={`text-left border rounded-[3px] px-2.5 py-2 transition-colors ${
                      selected
                        ? 'border-[#0A6ED1] bg-[#E8F0FD]/30'
                        : 'border-[#CCC] hover:border-[#0A6ED1]/50'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className="text-[12px] font-semibold text-[#111]">{p.name} · {p.tonnage}</div>
                    <div className={`text-[10px] ${notAllowed ? 'text-[#555]' : busyPress ? 'text-[#0A6ED1]' : 'text-green-700'}`}>
                      {notAllowed ? '— Not for this product' : busyPress ? `✗ ${p.status}` : '✓ Available'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Job multi-picker */}
          <div>
            <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1.5">
              Select Jobs <span className="text-[#0A6ED1]">*</span>
              <span className="ml-2 font-normal text-[#555] normal-case tracking-normal">
                sorted by LSD · emergency first
              </span>
            </label>
            <div className="border border-[#E4E5E6] rounded-[3px] max-h-[260px] overflow-y-auto divide-y divide-[#F3F3F3]">
              {sortedJobs.length === 0 ? (
                <div className="p-4 text-center text-[12px] text-[#555]">
                  No queued jobs to assign.
                </div>
              ) : sortedJobs.map(j => {
                const checked = pickedJobIds.has(j.id);
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => toggleJob(j.id)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                      checked ? 'bg-[#E8F0FD]/20' : 'hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <span
                      className={`shrink-0 mt-0.5 w-[14px] h-[14px] rounded-[2px] border flex items-center justify-center ${
                        checked ? 'bg-red-mrt border-[#0A6ED1]' : 'border-[#CCC] bg-white'
                      }`}
                    >
                      {checked && <Check size={10} className="text-white" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-[#111] truncate">
                        {j.priority === 'emergency' && <span className="text-[#0A6ED1]">🔴 </span>}
                        {j.id}
                        <span className="ml-1.5 font-normal text-[#333]">— {productIdentity(j)}</span>
                      </div>
                      <div className="text-[10.5px] text-[#333] mt-0.5">
                        {j.customer_name || '—'} · {j.qty.toLocaleString()} pcs ·
                        {' '}LSD {j.lsd || '—'} · Promised {fmtDate(j.promised_date)}
                        {j.mould_code && <> · Mould {j.mould_code}</>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[#E4E5E6] flex items-center gap-2 shrink-0">
          <div className="text-[11px] text-[#333] flex-1">
            {selectedCount > 0
              ? <><strong>{selectedCount}</strong> job{selectedCount === 1 ? '' : 's'} selected · {selectedQty.toLocaleString()} pcs total</>
              : 'No jobs selected'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] border border-[#CCC] rounded-[3px] hover:bg-[#FAFAFA]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!pressId || selectedCount === 0 || busy}
            className="px-3 py-1.5 text-[12px] bg-red-mrt text-white rounded-[3px] hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? 'Assigning…' : `Assign ${selectedCount || ''} → Press`}
          </button>
        </div>
      </div>
    </div>
  );
}
