// Today's Dispatch Targets — dashboard widget.
// Lists jobs in Dispatch stage with promised date == today, plus already-
// dispatched today (with OTD verdict). Mirrors MRT v2 dispatch table on
// the dashboard (lines 3590-3607).

import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import {
  Table, THead, TH, TR, TD, EmptyRow, StatusPill,
} from './table';
import { productIdentity } from '../lib/productLabel';
import type { ProductionJob } from '../lib/types';
import { fmtDate } from '../../lib/utils';

export function TodaysDispatchTargets({ jobs }: { jobs: ProductionJob[] }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    return jobs
      .filter(j =>
        (j.stage === 'dispatch' || j.stage === 'dispatched') &&
        j.promised_date === today
      )
      .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  }, [jobs, today]);

  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
      <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
        <Truck size={13} className="text-[#333]" />
        <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] flex-1">
          Today's Dispatch Targets
          <span className="ml-2 text-[#666] font-normal tracking-normal normal-case">
            {rows.length} job{rows.length === 1 ? '' : 's'} due today
          </span>
        </div>
        <Link
          to="/production/sequencer/dispatch"
          className="text-[11px] text-[#0A6ED1] hover:underline"
        >
          Dispatch Screen →
        </Link>
      </div>

      <Table className="border-0">
        <THead>
          <tr>
            <TH>Job ID</TH>
            <TH>Product</TH>
            <TH>Customer</TH>
            <TH>Qty</TH>
            <TH>Promised</TH>
            <TH>Courier</TH>
            <TH>Consignment</TH>
            <TH>Status</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={8} text="Nothing due today." />
          ) : rows.map(j => (
            <TR key={j.id} onClick={() => navigate(`/production/jobs/${j.id}`)}>
              <TD>
                <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">
                  {j.priority === 'emergency' && <span className="mr-1">🔴</span>}{j.id}
                </span>
              </TD>
              <TD className="font-semibold text-[#111] text-[12.5px]">{productIdentity(j)}</TD>
              <TD className="text-[12.5px]">{j.customer_name || '—'}</TD>
              <TD className="font-mono text-[11.5px]">{j.qty.toLocaleString()}</TD>
              <TD className="font-mono text-[11px] text-[#666]">{fmtDate(j.promised_date)}</TD>
              <TD className="text-[12px]">{j.courier || <span className="text-[#555]">—</span>}</TD>
              <TD className="font-mono text-[11px] text-[#666]">
                {j.consignment_no || <span className="text-[#555]">—</span>}
              </TD>
              <TD>
                {j.stage === 'dispatched' ? (
                  j.otd_result === 'late'
                    ? <StatusPill status="Dispatched Late" tone="bad" />
                    : <StatusPill status="Dispatched On Time" tone="good" />
                ) : (
                  <StatusPill status="Ready to Ship" tone="info" />
                )}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
