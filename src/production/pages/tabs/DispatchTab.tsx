// Dispatch tab — courier + consignment entry, confirm with OTD verdict.
// Styled to match MRT ERP v2 design system.

import { useState } from 'react';
import { Truck, Undo2, Loader2 } from 'lucide-react';
import {
  Table, THead, TH, TR, TD, EmptyRow, StatusPill,
} from '../../components/table';
import { fmtIST, fmtDate } from '../../../lib/utils';
import type { ProductionJob } from '../../lib/types';
import { productIdentity } from '../../lib/productLabel';
import {
  canUndoDispatch, undoDispatch, UNDO_DISPATCH_WINDOW_MIN,
} from '../../lib/actions';

interface Props {
  jobs: ProductionJob[];
  onConfirmDispatch: (job: ProductionJob) => void;
  onChanged?: () => void | Promise<void>;
}

export function DispatchTab({ jobs, onConfirmDispatch, onChanged }: Props) {
  const ready     = jobs.filter(j => j.status !== 'dispatched');
  const lateCount = jobs.filter(j => j.otd_result === 'late').length;
  const [undoing, setUndoing] = useState<string | null>(null);

  const handleUndo = async (job: ProductionJob) => {
    const reason = window.prompt(
      `Undo dispatch for ${job.id}?\n\nThis returns the job to "Ready" and clears the OTD verdict.\n` +
      `Only possible within ${UNDO_DISPATCH_WINDOW_MIN} minutes of confirming.\n\nReason (will be logged):`,
      ''
    );
    if (reason === null) return;
    setUndoing(job.id);
    try { await undoDispatch(job.id, reason.trim()); await onChanged?.(); }
    catch (e: any) { alert(e?.message || 'Undo failed.'); }
    finally { setUndoing(null); }
  };

  return (
    <div className="space-y-3">
      {/* Info row */}
      <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2 flex flex-wrap items-center gap-3 text-[12px] text-[#111]">
        <span className="text-[#333]">{jobs.length} job{jobs.length === 1 ? '' : 's'} in dispatch queue</span>
        {ready.length > 0   && <StatusPill status={`${ready.length} Pending`} tone="info" />}
        {lateCount > 0      && <StatusPill status={`${lateCount} Late`}       tone="bad" />}
        <span className="ml-auto text-[11px] text-[#333]">
          Confirming logs OTD · Undo within {UNDO_DISPATCH_WINDOW_MIN} min
        </span>
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Job ID</TH>
            <TH>Product</TH>
            <TH>Customer</TH>
            <TH>Qty</TH>
            <TH>Promised</TH>
            <TH>Courier</TH>
            <TH>Consignment</TH>
            <TH>OTD</TH>
            <TH>Action</TH>
          </tr>
        </THead>
        <tbody>
          {jobs.length === 0 ? (
            <EmptyRow colSpan={9} text="No jobs ready to dispatch." />
          ) : jobs.map(j => {
            const isUndoing = undoing === j.id;
            const undoable  = canUndoDispatch(j);
            return (
              <TR key={j.id}>
                <TD>
                  <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">
                    {j.priority === 'emergency' && <span className="mr-1">🔴</span>}{j.id}
                  </span>
                </TD>
                <TD className="font-semibold text-[#111]">{productIdentity(j)}</TD>
                <TD className="text-[12px]">{j.customer_name || '—'}</TD>
                <TD className="font-mono text-[11px]">{j.qty.toLocaleString()}</TD>
                <TD className="font-mono text-[11px] text-[#333]">{fmtDate(j.promised_date)}</TD>
                <TD className="text-[12px]">{j.courier || <span className="text-[#555]">—</span>}</TD>
                <TD className="font-mono text-[11px] text-[#333]">{j.consignment_no || <span className="text-[#555]">—</span>}</TD>
                <TD>
                  {j.otd_result === 'on-time' && <span className="text-[#107E3E] font-semibold text-[11px]">✓ On Time</span>}
                  {j.otd_result === 'late'    && <span className="text-[#BB0000] font-semibold text-[11px]">✗ Late</span>}
                  {!j.otd_result             && <span className="text-[#555] text-[11px]">—</span>}
                </TD>
                <TD>
                  {j.status !== 'dispatched' ? (
                    <button
                      type="button"
                      onClick={() => onConfirmDispatch(j)}
                      className="inline-flex items-center gap-1 bg-[#107E3E] text-white text-[10.5px] font-medium px-[8px] py-[3px] rounded-[3px] hover:bg-[#0B5C2A] transition-colors"
                    >
                      <Truck size={11} /> Confirm
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] font-mono text-[#333]">
                        {j.dispatched_at ? fmtIST(new Date(j.dispatched_at), 'dd MMM HH:mm') : '✓'}
                      </span>
                      {undoable && (
                        <button
                          type="button"
                          onClick={() => handleUndo(j)}
                          disabled={isUndoing}
                          title={`Reversible for ${UNDO_DISPATCH_WINDOW_MIN} min after dispatch`}
                          className="inline-flex items-center gap-1 bg-white text-[#333] border border-[#E4E5E6] text-[10.5px] font-medium px-[8px] py-[3px] rounded-[3px] hover:bg-[#F5F6F7] disabled:opacity-50 transition-colors"
                        >
                          {isUndoing ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
                          Undo
                        </button>
                      )}
                    </div>
                  )}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
