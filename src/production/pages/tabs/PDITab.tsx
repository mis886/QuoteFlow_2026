// PDI tab — list awaiting Pre-Despatch Inspection approval.
// Styled to match MRT ERP v2 design system.

import { CheckCircle2 } from 'lucide-react';
import {
  Table, THead, TH, TR, TD, EmptyRow,
} from '../../components/table';
import { fmtIST, fmtDate } from '../../../lib/utils';
import type { ProductionJob } from '../../lib/types';
import { productIdentity } from '../../lib/productLabel';

interface Props {
  jobs: ProductionJob[];
  onApprove: (job: ProductionJob) => void;
}

export function PDITab({ jobs, onApprove }: Props) {
  return (
    <div className="space-y-3">
      {/* Info row */}
      <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2 flex items-center gap-3 text-[12px]">
        <span className="text-[#333]">{jobs.length} job{jobs.length === 1 ? '' : 's'} awaiting Pre-Despatch Inspection</span>
        <span className="ml-auto text-[11px] text-[#E9730C]">⚠ Approving moves directly to Ready to Dispatch</span>
      </div>

      <Table>
        <THead>
          <tr>
            <TH>Job ID</TH>
            <TH>Product</TH>
            <TH>Customer</TH>
            <TH>Qty</TH>
            <TH>Promised</TH>
            <TH>Inspection Passed</TH>
            <TH>PDI Officer</TH>
            <TH>Action</TH>
          </tr>
        </THead>
        <tbody>
          {jobs.length === 0 ? (
            <EmptyRow colSpan={8} text="No jobs awaiting PDI." />
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
              <TD className="font-mono text-[11px] text-[#333]">{fmtDate(j.promised_date)}</TD>
              <TD className="font-mono text-[11px] text-[#333]">
                {j.inspection_passed_at ? fmtIST(new Date(j.inspection_passed_at), 'dd MMM HH:mm') : '—'}
              </TD>
              <TD className="text-[12px] text-[#111]">{j.pdi_officer || <span className="text-[#555]">—</span>}</TD>
              <TD>
                <button
                  type="button"
                  onClick={() => onApprove(j)}
                  className="inline-flex items-center gap-1 bg-[#107E3E] text-white text-[10.5px] font-medium px-[8px] py-[3px] rounded-[3px] hover:bg-[#0B5C2A] transition-colors"
                >
                  <CheckCircle2 size={11} /> Approve PDI
                </button>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
