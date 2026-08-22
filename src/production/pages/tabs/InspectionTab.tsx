// Inspection tab — Pass / Fail-NCR / Rework.
// Styled to match MRT ERP v2 design system.

import { Check, X, RotateCcw } from 'lucide-react';
import {
  Table, THead, TH, TR, TD, EmptyRow, StatusPill,
} from '../../components/table';
import type { ProductionJob, Worker } from '../../lib/types';
import { productIdentity } from '../../lib/productLabel';
import { fmtDate } from '../../../lib/utils';

interface Props {
  jobs: ProductionJob[];
  workers: Worker[];
  onPass:   (jobId: string) => void;
  onFail:   (job: ProductionJob) => void;
  onRework: (jobId: string) => void;
}

export function InspectionTab({ jobs, workers, onPass, onFail, onRework }: Props) {
  const inspectors = workers.filter(w => w.department === 'inspection' && w.present).length;
  const pending    = jobs.filter(j =>
    j.inspection_result === 'pending' || j.status === 'pending' || j.status === 'in-progress'
  );

  return (
    <div className="space-y-3">
      {/* Capacity row */}
      <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2 flex flex-wrap items-center gap-3 text-[12px] text-[#111]">
        <span><strong>{inspectors}</strong> <span className="text-[#333]">active inspectors</span></span>
        <span className="text-[#C0C0C0]">·</span>
        <span className="text-[#333]">{pending.length} lot{pending.length === 1 ? '' : 's'} awaiting</span>
        <span className="ml-auto text-[10px] text-[#333]">~{inspectors * 2} lots/shift capacity</span>
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Lot / Job</TH>
            <TH>Product</TH>
            <TH>Customer</TH>
            <TH>Qty</TH>
            <TH>LSD</TH>
            <TH>Promised</TH>
            <TH>Batch</TH>
            <TH>Result</TH>
            <TH>Action</TH>
          </tr>
        </THead>
        <tbody>
          {jobs.length === 0 ? (
            <EmptyRow colSpan={9} text="No jobs in Inspection." />
          ) : jobs.map(j => (
            <TR key={j.id}>
              <TD>
                <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">
                  {j.priority === 'emergency' && <span className="mr-1">🔴</span>}{j.id}
                </span>
              </TD>
              <TD className="font-semibold text-[#111]">{productIdentity(j)}</TD>
              <TD className="text-[12px]">{j.customer_name || '—'}</TD>
              <TD className="font-mono text-[11px]">{j.qty.toLocaleString()}</TD>
              <TD className="font-mono text-[11px] text-[#333]">{j.lsd || '—'}</TD>
              <TD className="font-mono text-[11px] text-[#333]">{fmtDate(j.promised_date)}</TD>
              <TD className="font-mono text-[11px]">{j.batch_code || '—'}</TD>
              <TD><ResultPill result={j.inspection_result} status={j.status} /></TD>
              <TD>
                {j.inspection_result === 'ncr' || j.status === 'ncr' ? (
                  <button
                    type="button"
                    onClick={() => onRework(j.id)}
                    className="inline-flex items-center gap-1 bg-white text-[#E9730C] border border-[#E9730C] text-[10.5px] font-medium px-[8px] py-[3px] rounded-[3px] hover:bg-[#FFF3E0] transition-colors"
                  >
                    <RotateCcw size={11} /> Rework
                  </button>
                ) : j.inspection_result === 'passed' || j.status === 'passed' ? (
                  <span className="text-[11px] text-[#107E3E]">✓ Passed — advancing</span>
                ) : (
                  <div className="inline-flex gap-1">
                    <button
                      type="button"
                      onClick={() => onPass(j.id)}
                      className="inline-flex items-center gap-1 bg-[#107E3E] text-white text-[10.5px] font-medium px-[8px] py-[3px] rounded-[3px] hover:bg-[#0B5C2A] transition-colors"
                    >
                      <Check size={11} /> Pass
                    </button>
                    <button
                      type="button"
                      onClick={() => onFail(j)}
                      className="inline-flex items-center gap-1 bg-[#BB0000] text-white text-[10.5px] font-medium px-[8px] py-[3px] rounded-[3px] hover:bg-[#8E0000] transition-colors"
                    >
                      <X size={11} /> Fail / NCR
                    </button>
                  </div>
                )}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function ResultPill({ result, status }: { result?: string | null; status: string }) {
  const v = result || status;
  if (v === 'passed')      return <StatusPill status="Passed"      tone="good" />;
  if (v === 'ncr')         return <StatusPill status="NCR"         tone="bad" />;
  if (v === 'in-progress') return <StatusPill status="In Progress" tone="info" />;
  return                          <StatusPill status="Pending"     tone="neutral" />;
}
