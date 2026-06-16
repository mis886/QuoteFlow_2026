// Module 05 — Job Card Board
// Table view: all JCs with derived status, aggregates, and action links.
// Status is DERIVED from child tables — never stored.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Hammer, Scissors, Microscope, Truck, ShieldCheck } from 'lucide-react';
import { useProductionData } from '../lib/useProductionData';
import {
  listMoldingSessions, listFinishingSessions,
  listInspectionSessions, listDispatchItems, listDispatches,
} from '../lib/db';
import {
  jcStats, deriveJCStatus, reversedDispatchIdSet, JC_STATUS_COLOR,
} from '../lib/jcStats';
import { productIdentity } from '../lib/productLabel';
import { PageHeader, FilterBar, Table, THead, TH, TR, TD, EmptyRow } from '../components/table';
import { fmtDate } from '../../lib/utils';
import type {
  MoldingSession, FinishingSession, InspectionSession, DispatchItem, Dispatch,
  JCDerivedStatus,
} from '../lib/types';

const ALL_STATUSES: JCDerivedStatus[] = [
  'Pending Molding', 'Molding', 'Finishing', 'Inspection',
  'Ready to Dispatch', 'Partially Dispatched', 'Dispatched',
];

export function JobCardBoard() {
  const navigate  = useNavigate();
  const { jobs, loading } = useProductionData();

  const [molding,    setMolding]    = useState<MoldingSession[]>([]);
  const [finishing,  setFinishing]  = useState<FinishingSession[]>([]);
  const [inspection, setInspection] = useState<InspectionSession[]>([]);
  const [dispItems,  setDispItems]  = useState<DispatchItem[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [childLoading, setChildLoading] = useState(true);
  const [q,     setQ]     = useState('');
  const [stageF, setStageF] = useState<JCDerivedStatus | ''>('');

  const load = async () => {
    setChildLoading(true);
    const [m, f, i, d, ds] = await Promise.all([
      listMoldingSessions(), listFinishingSessions(),
      listInspectionSessions(), listDispatchItems(), listDispatches(),
    ]);
    setMolding(m); setFinishing(f); setInspection(i); setDispItems(d); setDispatches(ds);
    setChildLoading(false);
  };

  useEffect(() => { load(); }, []);

  const enriched = useMemo(() => {
    if (childLoading) return [];
    const reversedIds = reversedDispatchIdSet(dispatches);
    return jobs.map(j => {
      const stats  = jcStats(j.id, molding, finishing, inspection, dispItems, reversedIds);
      const status = deriveJCStatus(j, stats, molding, finishing, inspection);
      return { job: j, stats, status };
    });
  }, [jobs, molding, finishing, inspection, dispItems, dispatches, childLoading]);

  const filtered = useMemo(() => {
    return enriched.filter(e => {
      if (stageF && e.status !== stageF) return false;
      if (q) {
        const t = q.toLowerCase();
        return (
          e.job.id.toLowerCase().includes(t) ||
          (e.job.family_code || '').toLowerCase().includes(t) ||
          (e.job.product_desc || '').toLowerCase().includes(t) ||
          (e.job.customer_name || '').toLowerCase().includes(t)
        );
      }
      return true;
    });
  }, [enriched, q, stageF]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of enriched) c[e.status] = (c[e.status] || 0) + 1;
    return c;
  }, [enriched]);

  const isLoading = loading || childLoading;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · Module 05"
        title="Job Card Board"
        subtitle="Derived status — computed live from molding, finishing, inspection, and dispatch records."
        actions={
          <button type="button" onClick={load} title="Refresh"
            className="inline-flex items-center gap-1.5 bg-white text-[#0A6ED1] border border-[#0A6ED1] text-[11px] font-medium px-[9px] py-[5px] rounded-[3px] hover:bg-[#E8F0FD] transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
        }
      />

      <FilterBar>
        {/* Segmented status filter tabs with counts (All + each status) */}
        <div className="flex flex-wrap">
          <FilterTab
            label="All"
            count={enriched.length}
            active={stageF === ''}
            onClick={() => setStageF('')}
          />
          {ALL_STATUSES.map(s => (
            <FilterTab
              key={s}
              label={s}
              count={counts[s] || 0}
              active={stageF === s}
              activeCls={JC_STATUS_COLOR[s].activeChipCls}
              onClick={() => setStageF(stageF === s ? '' : s)}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 bg-[#F7F7F7] border border-[#E4E5E6] rounded-[3px] px-2 py-1">
          <Search size={12} className="text-[#555]" />
          <input className="bg-transparent text-[12px] outline-none text-[#111] w-[180px]"
            placeholder="Search job, product, customer…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="ml-auto text-[10px] text-[#555]">{filtered.length} job{filtered.length !== 1 ? 's' : ''}</div>
      </FilterBar>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              {['Job ID', 'Product', 'Customer', 'Status', 'Qty', '▲ Molded', '✓ Passed', '↑ Dispatched', 'Yield', 'Ready', 'Promised', 'Actions'].map(h => (
                <TH key={h}>{h}</TH>
              ))}
            </tr>
          </THead>
          <tbody>
            {isLoading ? (
              <EmptyRow colSpan={12} text="Loading job cards…" />
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={12} text="No job cards match the filter." />
            ) : filtered.map(({ job, stats, status }) => {
              const c = JC_STATUS_COLOR[status];
              const overdue = job.promised_date
                && job.promised_date < new Date().toISOString().slice(0, 10)
                && status !== 'Dispatched';
              return (
                <TR key={job.id} onClick={() => navigate(`/production/jobs/${job.id}`)}>
                  <TD>
                    <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">
                      {job.priority === 'emergency' && <span className="text-[#BB0000] mr-0.5">🔴</span>}
                      {job.id}
                    </span>
                    {job.mould_code && (
                      <div className="text-[9.5px] text-[#888] font-mono">{job.mould_code}</div>
                    )}
                  </TD>
                  <TD className="font-semibold max-w-[180px] truncate">{productIdentity(job)}</TD>
                  <TD className="text-[#555]">{job.customer_name || '—'}</TD>
                  <TD>
                    <span className={`text-[10px] font-medium px-[7px] py-[2px] rounded-[2px] border ${c.chipCls}`}>
                      {status}
                    </span>
                  </TD>
                  <TD className="font-mono text-[11px]">{job.qty.toLocaleString()}</TD>
                  <TD className="font-mono text-[11px] text-[#E9730C]">{stats.molded.toLocaleString()}</TD>
                  <TD className="font-mono text-[11px] text-[#107E3E] font-semibold">{stats.passed.toLocaleString()}</TD>
                  <TD className="font-mono text-[11px] text-[#555]">{stats.dispatched.toLocaleString()}</TD>
                  <TD>
                    {stats.molded > 0 ? (
                      <span className={`text-[10px] font-medium ${stats.yieldRate >= 90 ? 'text-[#107E3E]' : stats.yieldRate >= 70 ? 'text-[#E9730C]' : 'text-[#BB0000]'}`}>
                        {stats.yieldRate}%
                      </span>
                    ) : <span className="text-[#9E9E9E]">—</span>}
                  </TD>
                  <TD className="font-mono text-[11px] font-bold text-[#107E3E]">
                    {stats.readyQty > 0 ? stats.readyQty.toLocaleString() : <span className="text-[#9E9E9E] font-normal">—</span>}
                  </TD>
                  <TD className="font-mono text-[11px]">
                    {job.promised_date ? (
                      <span className={overdue ? 'text-[#BB0000] font-semibold' : 'text-[#555]'}>
                        {fmtDate(job.promised_date)}{overdue ? ' ⚠' : ''}
                      </span>
                    ) : <span className="text-[#9E9E9E]">—</span>}
                  </TD>
                  <TD onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <ActionBtn icon={<Hammer size={10} />}     label="Mold"    to={`/production/log-molding?jc=${job.id}`}    navigate={navigate} />
                      <ActionBtn icon={<Scissors size={10} />}   label="Finish"  to={`/production/log-finishing?jc=${job.id}`}  navigate={navigate} />
                      <ActionBtn icon={<Microscope size={10} />} label="Inspect" to={`/production/log-inspection?jc=${job.id}`} navigate={navigate} />
                      <ActionBtn icon={<ShieldCheck size={10} />} label="PDI"    to={`/production/log-pdi?jc=${job.id}`}        navigate={navigate} color="teal" />
                      {stats.readyQty > 0 && (
                        <ActionBtn icon={<Truck size={10} />} label="Dispatch" to={`/production/dispatch/new?jc=${job.id}`} navigate={navigate} color="green" />
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

// Segmented filter tab with count, styled like the Orders board tabs.
// Borders are joined (no right-border except the last) for a pill-group look.
function FilterTab({ label, count, active, activeCls, onClick }: {
  label: string; count: number; active: boolean; activeCls?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11.5px] px-[13px] py-[6px] border border-r-0 last:border-r whitespace-nowrap transition-colors first:rounded-l-[3px] last:rounded-r-[3px] ${
        active
          ? (activeCls || 'bg-[#0A6ED1] text-white border-[#0A6ED1]')
          : 'bg-white text-[#6A6D70] border-[#E4E5E6] hover:bg-[#F7F7F7] hover:text-[#32363A]'
      }`}
    >
      {label} <span className="text-[10px] opacity-80">({count})</span>
    </button>
  );
}

function ActionBtn({ icon, label, to, navigate, color = 'blue' }: {
  icon: React.ReactNode; label: string; to: string;
  navigate: ReturnType<typeof useNavigate>; color?: 'blue' | 'green' | 'teal';
}) {
  const cls =
    color === 'green' ? 'bg-[#E8F5E9] text-[#107E3E] border-[#C5E1A5] hover:bg-[#107E3E] hover:text-white' :
    color === 'teal'  ? 'bg-[#E0F2F1] text-[#00796B] border-[#B2DFDB] hover:bg-[#00796B] hover:text-white' :
                        'bg-[#E8F0FD] text-[#0A6ED1] border-[#C2D8F8] hover:bg-[#0A6ED1] hover:text-white';
  return (
    <button type="button" onClick={() => navigate(to)}
      className={`inline-flex items-center gap-0.5 text-[9.5px] font-medium border px-1.5 py-0.5 rounded-[2px] transition-colors ${cls}`}>
      {icon}{label}
    </button>
  );
}
