// NCR Log — non-conformance register across all jobs.

import { useState, useMemo } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProductionData } from '../lib/useProductionData';
import { productIdentity } from '../lib/productLabel';
import { fmtIST } from '../../lib/utils';
import {
  Table, THead, TH, TR, TD, EmptyRow, PageHeader, FilterBar, StatusPill,
} from '../components/table';

export function NCRLog() {
  const navigate = useNavigate();
  const { ncrs, jobs, loading } = useProductionData();
  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const enriched = useMemo(() =>
    ncrs.map(n => ({ ...n, job: jobs.find(j => j.id === n.job_id) || null })),
    [ncrs, jobs]
  );

  const filtered = enriched.filter(n => {
    if (actionFilter && n.action !== actionFilter) return false;
    if (q) {
      const t = q.toLowerCase();
      if (!(
        (n.job_id || '').toLowerCase().includes(t) ||
        (n.defect_code || '').toLowerCase().includes(t) ||
        (n.defect_desc || '').toLowerCase().includes(t) ||
        (n.job?.family_code || '').toLowerCase().includes(t) ||
        (n.job?.product_desc || '').toLowerCase().includes(t) ||
        (n.job?.customer_name || '').toLowerCase().includes(t)
      )) return false;
    }
    return true;
  });

  const openCount     = filtered.filter(n => !n.resolved_at).length;
  const resolvedCount = filtered.filter(n => !!n.resolved_at).length;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module="Production · Quality"
        title="NCR"
        accent="Register"
        subtitle="Non-conformance reports raised at inspection."
      />

      <FilterBar>
        <div className="flex items-center gap-1.5 bg-white border border-[#E4E5E6] rounded px-2 h-7 min-w-[220px] focus-within:border-[#0A6ED1] focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-[#555] shrink-0" />
          <input
            type="text"
            placeholder="Job, defect code, customer…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-[#111] w-full placeholder:text-[#555]"
          />
        </div>

        <select
          title="Filter by action"
          className="font-sans text-xs text-[#111] bg-white border border-[#E4E5E6] rounded py-1 pl-2 pr-6 cursor-pointer outline-none"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
        >
          <option value="">All Actions</option>
          <option value="rework">Rework</option>
          <option value="reject">Reject</option>
        </select>

        <div className="ml-auto flex gap-3 font-mono text-[10px] text-[#333]">
          <span>{filtered.length} NCRs</span>
          <span className="text-[#0A6ED1]">{openCount} open</span>
          <span className="text-[#107E3E]">{resolvedCount} resolved</span>
        </div>
      </FilterBar>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              <TH>NCR ID</TH>
              <TH>Raised</TH>
              <TH>Job</TH>
              <TH>Product</TH>
              <TH>Customer</TH>
              <TH>Defect Code</TH>
              <TH>Description</TH>
              <TH>Responsible</TH>
              <TH>Action</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <EmptyRow colSpan={10} text="Loading…" />
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={10} text="No NCRs in the register." />
            ) : filtered.map(n => (
              <TR key={n.id} onClick={() => n.job && navigate(`/production/jobs/${n.job_id}`)}>
                <TD>
                  <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1] flex items-center gap-1">
                    <AlertTriangle size={10} className="shrink-0" />{n.id}
                  </span>
                </TD>
                <TD className="font-mono text-[11px] text-[#666]">
                  {n.raised_at ? fmtIST(new Date(n.raised_at), 'dd MMM HH:mm') : '—'}
                </TD>
                <TD className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">{n.job_id}</TD>
                <TD className="text-[12.5px]">{productIdentity(n.job)}</TD>
                <TD className="text-[12.5px]">{n.job?.customer_name || '—'}</TD>
                <TD className="font-mono text-[11px]">{n.defect_code || '—'}</TD>
                <TD className="text-[12px] text-[#444] max-w-[260px] truncate" title={n.defect_desc || ''}>
                  {n.defect_desc || '—'}
                </TD>
                <TD className="text-[12px]">{n.responsible_stage || '—'}</TD>
                <TD>
                  {n.action === 'reject'
                    ? <StatusPill status="Reject" tone="bad" />
                    : n.action === 'rework'
                    ? <StatusPill status="Rework" tone="warn" />
                    : <span className="text-[#555]">—</span>}
                </TD>
                <TD>
                  {n.resolved_at
                    ? <StatusPill status="Resolved" tone="good" />
                    : <StatusPill status="Open" tone="warn" />}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
