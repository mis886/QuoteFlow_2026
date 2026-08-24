import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtIST } from '../lib/utils';

const PAGE_SIZE = 50;

type ActivityAction = 'insert' | 'update' | 'delete';

interface ActivityLogRow {
  id: string;
  actor_email: string | null;
  actor_name: string | null;
  module: string;
  record_id: string;
  record_label: string | null;
  action: ActivityAction;
  changes: Record<string, any> | null;
  created_at: string;
}

// Friendly casing for the raw table names stored in `module` — every value
// this app itself ever writes (see src/lib/activityLog.ts call sites in
// src/store/index.tsx / Sampling.tsx / SamplingNew.tsx). Anything unmapped
// falls back to the raw value rather than disappearing from the filter.
const MODULE_LABELS: Record<string, string> = {
  enquiries: 'Enquiries',
  quotes: 'Quotations',
  orders: 'Orders',
  customers: 'Customers',
  followups: 'Follow-Ups',
  samples: 'Sampling',
  authorized_signatories: 'Signatories',
  team_roster: 'Team Roster',
  company_units: 'Company Units',
  bank_accounts: 'Bank Accounts',
};
const moduleLabel = (m: string) => MODULE_LABELS[m] ?? m;

// Hard allowlist, not just a display label: this page is CRM-only by design
// (Enquiries/Quotations/Orders/Customers/Follow-Ups/Sampling/Settings). The
// separate /production workspace (prod_* tables) is a different concern with
// its own workflows and must never surface here, even if a future change adds
// logActivity() calls somewhere under src/production. Every query below is
// scoped to this list so that guarantee holds regardless of what gets logged.
const CRM_MODULES = Object.keys(MODULE_LABELS);

function ActionPill({ action }: { action: ActivityAction }) {
  const styles: Record<ActivityAction, string> = {
    insert: 'bg-sW/10 text-sW border-sW/30',
    update: 'bg-sN/10 text-sN border-sN/30',
    delete: 'bg-red-mrt/10 text-red-mrt border-red-mrt/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9.5px] font-bold uppercase tracking-wide ${styles[action]}`}>
      {action}
    </span>
  );
}

function formatValue(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// changes for an update = { field: { old, new } }; for insert/delete = the
// full row snapshot. Rendered differently since one is a diff and the other
// is a flat record.
function ChangesDetail({ action, changes }: { action: ActivityAction; changes: Record<string, any> | null }) {
  if (!changes || Object.keys(changes).length === 0) {
    return <div className="text-[11.5px] text-g400 italic px-1 py-1.5">No detail recorded.</div>;
  }

  if (action === 'update') {
    const fields = Object.keys(changes).sort();
    return (
      <div className="grid grid-cols-[minmax(120px,180px)_1fr_auto_1fr] gap-x-2 gap-y-1.5 text-[11.5px]">
        {fields.map(field => {
          const { old: oldVal, new: newVal } = changes[field] ?? {};
          return (
            <React.Fragment key={field}>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.5px] text-g500 self-center">{field}</div>
              <div className="text-g600 break-all self-center px-2 py-1 bg-red-mrt/[0.04] rounded-[3px] border border-red-mrt/10 line-through decoration-red-mrt/40">{formatValue(oldVal)}</div>
              <div className="text-g300 self-center">→</div>
              <div className="text-blk font-medium break-all self-center px-2 py-1 bg-sW/[0.06] rounded-[3px] border border-sW/15">{formatValue(newVal)}</div>
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // insert / delete — flat row snapshot
  const fields = Object.keys(changes).sort();
  return (
    <div className="grid grid-cols-[minmax(120px,180px)_1fr] gap-x-2 gap-y-1.5 text-[11.5px]">
      {fields.map(field => (
        <React.Fragment key={field}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.5px] text-g500 self-start">{field}</div>
          <div className="text-g600 break-all self-start">{formatValue(changes[field])}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function HistoryLog() {
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [moduleFilter, setModuleFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [staffOptions, setStaffOptions] = useState<string[]>([]);

  // Staff list can't be hardcoded like modules — it's real people, fetched
  // once up front from a lightweight column-only query (not the paginated
  // main query, which is filtered/limited).
  useEffect(() => {
    supabase.from('activity_log').select('actor_name').not('actor_name', 'is', null).in('module', CRM_MODULES).limit(2000)
      .then(({ data }) => {
        const names = Array.from(new Set((data ?? []).map((r: any) => r.actor_name).filter(Boolean))).sort();
        setStaffOptions(names as string[]);
      });
  }, []);

  useEffect(() => {
    setPage(0);
  }, [moduleFilter, staffFilter, fromDate, toDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      let query = supabase.from('activity_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }).in('module', CRM_MODULES);
      if (moduleFilter) query = query.eq('module', moduleFilter);
      if (staffFilter) query = query.eq('actor_name', staffFilter);
      if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00`);
      if (toDate) query = query.lte('created_at', `${toDate}T23:59:59`);
      query = query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (cancelled) return;
      if (error) { console.error('Error loading history log:', error); setRows([]); setTotalCount(0); setLoading(false); return; }
      setRows((data ?? []) as ActivityLogRow[]);
      setTotalCount(count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [moduleFilter, staffFilter, fromDate, toDate, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasFilters = moduleFilter || staffFilter || fromDate || toDate;

  const clearFilters = () => { setModuleFilter(''); setStaffFilter(''); setFromDate(''); setToDate(''); };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">

      {/* Page header */}
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">System</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              History <em className="italic text-red-mrt">Log</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">Every insert, edit, and delete across the entire system.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-2">
        <select title="Filter by module" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
          className="select-filter font-sans text-xs text-blk bg-white border border-g200 rounded py-1 pl-2 pr-6 cursor-pointer outline-none appearance-none">
          <option value="">All Modules</option>
          {Object.keys(MODULE_LABELS).map(m => <option key={m} value={m}>{moduleLabel(m)}</option>)}
        </select>

        <select title="Filter by staff" value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
          className="select-filter font-sans text-xs text-blk bg-white border border-g200 rounded py-1 pl-2 pr-6 cursor-pointer outline-none appearance-none">
          <option value="">All Staff</option>
          {staffOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <div className="flex items-center gap-1.5">
          <label className="font-mono text-[9px] font-bold uppercase tracking-[0.5px] text-g500">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="font-sans text-xs text-blk bg-white border border-g200 rounded py-1 px-2 outline-none focus:border-red-mrt" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="font-mono text-[9px] font-bold uppercase tracking-[0.5px] text-g500">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="font-sans text-xs text-blk bg-white border border-g200 rounded py-1 px-2 outline-none focus:border-red-mrt" />
        </div>

        {hasFilters && (
          <button type="button" onClick={clearFilters}
            className="flex items-center gap-1 font-mono text-[10px] text-g500 hover:text-red-mrt border border-g200 hover:border-red-lt rounded px-2 h-7 transition-colors whitespace-nowrap">
            <X size={10} /> Clear filters
          </button>
        )}

        <div className="ml-auto font-mono text-[10px] text-g500">{totalCount} records</div>
      </div>

      {/* Table */}
      <div className="px-6 pb-7 pt-[14px] flex-1 min-h-0 flex flex-col">
        <div className="bg-white border border-g200 overflow-auto flex-1 min-h-0">
          <table className="min-w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {['', 'When', 'Who', 'Email', 'Module', 'Record', 'Action'].map(label => (
                  <th key={label}
                    className="sticky top-0 z-10 bg-g100 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200 shadow-[0_1px_0_0_theme(colors.g200)] text-g500">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-8 text-g400 text-[13px]">No history matches</td></tr>
              ) : rows.map(row => {
                const isExpanded = expandedId === row.id;
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-red-mrt/5 ${isExpanded ? 'bg-red-mrt/5' : ''}`}
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    >
                      <td className="px-[13px] py-[11px] align-middle w-6">
                        {isExpanded ? <ChevronDown size={13} className="text-g400" /> : <ChevronRight size={13} className="text-g400" />}
                      </td>
                      <td className="px-[13px] py-[11px] align-middle whitespace-nowrap font-mono text-[11px] text-g600">
                        {fmtIST(new Date(row.created_at), 'MMM d, yyyy, hh:mm aa')}
                      </td>
                      <td className="px-[13px] py-[11px] align-middle font-medium text-blk">{row.actor_name || '—'}</td>
                      <td className="px-[13px] py-[11px] align-middle font-mono text-[10.5px] text-g500">{row.actor_email || '—'}</td>
                      <td className="px-[13px] py-[11px] align-middle text-g600">{moduleLabel(row.module)}</td>
                      <td className="px-[13px] py-[11px] align-middle text-blk font-medium">{row.record_label || row.record_id}</td>
                      <td className="px-[13px] py-[11px] align-middle"><ActionPill action={row.action} /></td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-red-mrt/[0.02] border-b-2 border-red-mrt">
                        <td colSpan={7} className="p-0">
                          <div className="p-[12px_16px]">
                            <ChangesDetail action={row.action} changes={row.changes} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3">
          <div className="font-mono text-[10px] text-g500">
            Page {page + 1} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
              className="font-mono text-[10.5px] px-3 h-7 border border-g200 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:border-red-mrt hover:text-red-mrt transition-colors">
              Previous
            </button>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}
              className="font-mono text-[10.5px] px-3 h-7 border border-g200 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:border-red-mrt hover:text-red-mrt transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
