import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';
import { fmtIST } from '../lib/utils';
import { type GlobalDateRangeLike, type DoerRole } from '../lib/types';
import {
  computeDoerMetrics, doerRowKey, buildDoerTimeline, doerStageWorkload, ROLE_WEIGHTS,
  type DoerMetrics, type TimelineRow, type StageWorkload, type RosterMemberLike,
} from '../lib/kpi';
import { ArrowLeft, Clock, Layers, CheckCircle2, XCircle, CircleDashed, AlertTriangle, CheckSquare } from 'lucide-react';
import { BulkLogSidePanel } from '../components/BulkLogSidePanel';

const MS_DAY = 86400000;

function defaultRange(): GlobalDateRangeLike {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * MS_DAY);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
function priorWindow(range: GlobalDateRangeLike): GlobalDateRangeLike {
  const s = range.startDate ? new Date(range.startDate).getTime() : Date.now() - 30 * MS_DAY;
  const e = range.endDate ? new Date(range.endDate).getTime() : Date.now();
  const len = Math.max(MS_DAY, e - s);
  return {
    startDate: new Date(s - len).toISOString().slice(0, 10),
    endDate: new Date(s - MS_DAY).toISOString().slice(0, 10),
  };
}
function fmtShortfall(v: number | null): string {
  return v == null ? '—' : `${v - 100}%`;
}
function fmtPctShort(v: number | null): string {
  return v == null ? '—' : `${v - 100}%`;
}
function fmtHours(v: number | null): string {
  if (v == null) return '—';
  if (v < 24) return `${v}h`;
  const d = Math.floor(v / 24); const h = v % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

export function DoerDetail() {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { data, globalDateRange } = useAppStore();
  const decodedKey = decodeURIComponent(key);

  const range: GlobalDateRangeLike = globalDateRange
    ? { startDate: globalDateRange.startDate, endDate: globalDateRange.endDate }
    : defaultRange();

  const roster = useMemo(() => data.roster.filter(m => m.active), [data.roster]);
  const metrics = useMemo(() => computeDoerMetrics(data, roster, range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, range.startDate, range.endDate]);
  const prev = useMemo(() => computeDoerMetrics(data, roster, priorWindow(range)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, range.startDate, range.endDate]);

  const m: DoerMetrics | undefined = metrics.get(decodedKey);
  // The roster member behind this key (key = email|role).
  const member: RosterMemberLike | undefined = useMemo(() => {
    const [email, role] = decodedKey.split('|');
    return roster.find(r => r.email.toLowerCase() === email && r.role === (role as DoerRole));
  }, [roster, decodedKey]);

  const timeline = useMemo(() => member ? buildDoerTimeline(data, member, range) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, member, range.startDate, range.endDate]);
  const workload = useMemo(() => member ? doerStageWorkload(data, member, range) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, member, range.startDate, range.endDate]);

  if (!member || !m) {
    return (
      <div className="p-8">
        <button onClick={() => navigate('/doer-kpi')} className="inline-flex items-center gap-1.5 text-[12px] text-g500 hover:text-blk mb-4">
          <ArrowLeft size={14} /> Back to Doer KPI
        </button>
        <div className="bg-white rounded-[10px] border border-g200 p-8 text-center text-[13px] text-g500">
          This doer is no longer on the roster.
        </div>
      </div>
    );
  }

  const deferred = ROLE_WEIGHTS[m.role] == null;
  const prevM = prev.get(decodedKey);
  const delta = (m.composite != null && prevM?.composite != null) ? m.composite - prevM.composite : null;

  return (
    <div className="p-6 lg:p-8 bg-cream min-h-full">
      <button onClick={() => navigate('/doer-kpi')} className="inline-flex items-center gap-1.5 text-[12px] text-g500 hover:text-blk mb-4">
        <ArrowLeft size={14} /> Back to Doer KPI
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-[24px] font-bold text-blk">{member.display_name}</h1>
          <div className="text-[12px] text-g500 mt-0.5">{member.role} · {member.email}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400">Shortfall</div>
          <div className={cn('font-sans text-[30px] leading-none font-bold tracking-tight',
            deferred || m.composite == null ? 'text-g300' : m.composite >= 100 ? 'text-emerald-600' : 'text-red-mrt')}>
            {deferred ? '—' : fmtShortfall(m.composite)}
          </div>
          {delta != null && (
            <div className={cn('text-[11px] font-semibold mt-0.5', delta >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              {delta >= 0 ? '↑' : '↓'}{Math.abs(delta)} vs last period
            </div>
          )}
        </div>
      </div>

      {/* Metric strip (as shortfalls) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        <MetricCard label="On-time gap" value={deferred ? '—' : fmtPctShort(m.onTimePct)} hint="below 100% on-time" />
        {m.role === 'DEO' ? (
          <MetricCardDeo enqCount={m.enqCount} orderCount={m.orderCount} />
        ) : (
          <MetricCard label="Volume" value={deferred ? '—' : String(m.volume)} hint="items handled" plain />
        )}
        <MetricCard label="Speed" value={deferred ? '—' : fmtHours(m.avgCycleH)} hint="avg cycle time" plain />
        {m.role === 'DEO' ? (
          <MetricCard label="Enquiry Lap" value={fmtHours(m.enqLapH)} hint="received → punched" plain />
        ) : m.role === 'Rate Entry' ? (
          <MetricCard label="Quote Lap" value={fmtHours(m.quoteLapH)} hint="punched → quote sent" plain />
        ) : (
          <MetricCard label="Win gap" value={deferred ? '—' : fmtPctShort(m.winRate)} hint="below 100% win" />
        )}
      </div>

      {/* Stage workload */}
      {workload.length > 0 && (
        <div className="bg-white rounded-[10px] border border-g200 mt-6 overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-g100">
            <Layers size={15} className="text-g500" />
            <h2 className="font-mono text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Stage Workload</h2>
            <span className="text-[10px] text-g400 ml-1">cards in the stages this role owns</span>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-g500 font-mono text-[9.5px] tracking-[1px] uppercase border-b border-g100">
                <th className="px-4 py-2.5 text-left font-bold">Stage</th>
                <th className="px-4 py-2.5 text-center font-bold text-red-mrt">Overdue</th>
                <th className="px-4 py-2.5 text-center font-bold text-emerald-600">On track</th>
                <th className="px-4 py-2.5 text-center font-bold">Total</th>
                <th className="px-4 py-2.5 text-right font-bold">TAT</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((w: StageWorkload) => (
                <tr key={w.lane} className="border-b border-g50">
                  <td className="px-4 py-2.5 font-medium text-blk">{w.lane}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums font-semibold text-red-mrt">{w.pending || '—'}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-emerald-600">{w.done || '—'}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-g600">{w.total}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-g400">{fmtHours(w.tatHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Work History — tabular */}
      <WorkHistoryTable timeline={timeline} doerName={member.display_name} />
    </div>
  );
}

function MetricCard({ label, value, hint, plain }: { label: string; value: string; hint: string; plain?: boolean }) {
  const negative = !plain && value !== '—' && value !== '0%';
  return (
    <div className="bg-white rounded-[10px] border border-g200 p-4 shadow-sm">
      <div className="font-mono text-[9px] font-bold tracking-[1.2px] uppercase text-g500">{label}</div>
      <div className={cn('font-sans text-[22px] leading-none font-bold tracking-tight mt-1.5',
        negative ? 'text-red-mrt' : 'text-blk')}>{value}</div>
      <div className="text-[9.5px] text-g400 mt-1">{hint}</div>
    </div>
  );
}

function MetricCardDeo({ enqCount, orderCount }: { enqCount: number; orderCount: number }) {
  return (
    <div className="bg-white rounded-[10px] border border-g200 p-4 shadow-sm">
      <div className="font-mono text-[9px] font-bold tracking-[1.2px] uppercase text-g500">Volume</div>
      <div className="flex items-end gap-3 mt-1.5">
        <div>
          <div className="font-sans text-[22px] leading-none font-bold tracking-tight text-blk">{enqCount}</div>
          <div className="text-[9.5px] text-g400 mt-0.5">enquiries</div>
        </div>
        <div className="mb-0.5 text-g300 text-[14px] font-light leading-none">+</div>
        <div>
          <div className="font-sans text-[22px] leading-none font-bold tracking-tight text-blk">{orderCount}</div>
          <div className="text-[9.5px] text-g400 mt-0.5">orders</div>
        </div>
      </div>
    </div>
  );
}

const STATUS_META = {
  overdue:  { label: 'Overdue',  cls: 'bg-red-50 text-red-700 border-red-200',       icon: <AlertTriangle size={10} /> },
  late:     { label: 'Late',     cls: 'bg-red-50 text-red-600 border-red-200',        icon: <XCircle size={10} /> },
  'on-time':{ label: 'On-time',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10} /> },
  due:      { label: 'Pending',  cls: 'bg-amber-50 text-amber-700 border-amber-200',  icon: <Clock size={10} /> },
  logged:   { label: 'Logged',   cls: 'bg-g100 text-g500 border-g200',                icon: <CircleDashed size={10} /> },
};

function rowStatusKey(row: TimelineRow): keyof typeof STATUS_META {
  if (row.kind === 'pending') return row.onTime === false ? 'overdue' : 'due';
  if (row.onTime === true)  return 'on-time';
  if (row.onTime === false) return 'late';
  return 'logged';
}

type SortCol = 'ts' | 'status' | 'channel' | 'refId' | 'cust' | 'lapH';
type SortDir = 'asc' | 'desc';

function WorkHistoryTable({ timeline, doerName }: { timeline: TimelineRow[]; doerName: string }) {
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortCol, setSortCol] = useState<SortCol>('ts');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // Selection for bulk-logging an activity onto several quotes at once.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPanel, setShowPanel] = useState(false);

  // DEO and Rate Entry timelines carry lap times rather than follow-up logs;
  // they show a "Time Lap" column and have no bulk-log (no open follow-ups).
  const isDeoTimeline = timeline.some(r => r.kindLabel === 'Enquiry entry' || r.kindLabel === 'Order');
  const isRateEntryTimeline = timeline.some(r => r.kindLabel === 'Quote sent' || r.kindLabel === 'Draft');
  const isLapTimeline = isDeoTimeline || isRateEntryTimeline;

  // Summary counts for the banner
  const counts = useMemo(() => {
    const c = { ontime: 0, late: 0, overdue: 0, logged: 0 };
    for (const r of timeline) {
      const s = rowStatusKey(r);
      if (s === 'on-time') c.ontime++;
      else if (s === 'late') c.late++;
      else if (s === 'overdue') c.overdue++;
      else c.logged++;
    }
    return c;
  }, [timeline]);

  const filtered = useMemo(() => {
    let rows = timeline;
    if (statusFilter !== 'All') {
      rows = rows.filter(r => {
        const s = rowStatusKey(r);
        if (statusFilter === 'Overdue') return s === 'overdue';
        if (statusFilter === 'Late') return s === 'late';
        if (statusFilter === 'On-time') return s === 'on-time';
        if (statusFilter === 'Pending') return s === 'due';
        return true;
      });
    }
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      if (sortCol === 'ts')      { av = a.ts;  bv = b.ts; }
      else if (sortCol === 'status')  { av = rowStatusKey(a); bv = rowStatusKey(b); }
      else if (sortCol === 'channel') { av = a.channel ?? ''; bv = b.channel ?? ''; }
      else if (sortCol === 'refId')   { av = a.refId; bv = b.refId; }
      else if (sortCol === 'cust')    { av = a.cust;  bv = b.cust; }
      else if (sortCol === 'lapH')    { av = a.lapH ?? Infinity; bv = b.lapH ?? Infinity; return mul * ((av as number) - (bv as number)); }
      return mul * (av < bv ? -1 : av > bv ? 1 : 0);
    });
  }, [timeline, statusFilter, sortCol, sortDir]);

  const totalLate = counts.late + counts.overdue;
  const lateRate = timeline.length ? Math.round(totalLate / timeline.length * 100) : 0;

  // Selection keyed by row index (each visible row is selectable); the resulting
  // bulk log dedupes to unique quote ids so a quote is logged at most once.
  const toggleRow = (idx: number) =>
    setSelected(s => {
      const next = new Set(s);
      next.has(String(idx)) ? next.delete(String(idx)) : next.add(String(idx));
      return next;
    });
  const allSelected = filtered.length > 0 && filtered.every((_, i) => selected.has(String(i)));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map((_, i) => String(i))));

  const selectedRows = filtered.filter((_, i) => selected.has(String(i)));
  // Unique quotes (by refId) the chosen rows point at.
  const selectedQuotes = Array.from(
    new Map(selectedRows.map(r => [r.refId, { refId: r.refId, cust: r.cust, site: r.site, siteId: r.siteId }])).values()
  );
  // One call = one customer + site/branch. Block batches that span more than one
  // customer-site so a single logged note never lands on an unrelated site.
  const selectedSites = Array.from(new Set(selectedQuotes.map(q => `${q.cust}__${q.siteId ?? q.site}`)));
  const mixedSites = selectedSites.length > 1;

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'lapH' ? 'asc' : 'desc'); }
  };
  const sortArrow = (col: SortCol) => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className="bg-white rounded-[10px] border border-g200 mt-6 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-g100">
        <Clock size={15} className="text-g500 shrink-0" />
        <h2 className="font-mono text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Work History</h2>
        <span className="text-[10px] text-g400">done &amp; overdue · newest first</span>

        {/* Filter pills */}
        <div className="flex gap-1 ml-auto flex-wrap">
          {['All', 'Overdue', 'Late', 'On-time', 'Pending'].map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={cn(
                'px-2.5 py-0.5 rounded-full border text-[10px] font-semibold transition-colors',
                statusFilter === f ? 'bg-g800 text-white border-g800' : 'bg-white text-g500 border-g200 hover:border-g400'
              )}
            >{f}</button>
          ))}
        </div>
      </div>

      {/* Summary banner */}
      {timeline.length > 0 && (
        <div className="grid grid-cols-4 divide-x divide-g100 border-b border-g100 text-center">
          <div className="px-3 py-2">
            <div className="text-[18px] font-bold text-emerald-600 leading-tight">{counts.ontime}</div>
            <div className="text-[9px] font-mono uppercase tracking-wide text-g400 mt-0.5">On-time</div>
          </div>
          <div className="px-3 py-2">
            <div className={cn('text-[18px] font-bold leading-tight', totalLate > 0 ? 'text-red-mrt' : 'text-g300')}>{totalLate}</div>
            <div className="text-[9px] font-mono uppercase tracking-wide text-g400 mt-0.5">Late / Overdue</div>
          </div>
          <div className="px-3 py-2">
            <div className={cn('text-[18px] font-bold leading-tight', lateRate > 30 ? 'text-red-mrt' : lateRate > 10 ? 'text-amber-600' : 'text-g500')}>
              {lateRate}%
            </div>
            <div className="text-[9px] font-mono uppercase tracking-wide text-g400 mt-0.5">Late Rate</div>
          </div>
          <div className="px-3 py-2">
            <div className="text-[18px] font-bold text-amber-600 leading-tight">{counts.overdue}</div>
            <div className="text-[9px] font-mono uppercase tracking-wide text-g400 mt-0.5">Pending Overdue</div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-[12px] text-g400 py-10 text-center">No activity in this period.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="bg-g50 text-g500 font-mono text-[9px] tracking-[1px] uppercase border-b border-g200 select-none">
                {!isLapTimeline && (
                  <th className="px-3 py-2.5 text-center font-bold w-[34px]">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      title="Select all"
                      className="accent-indigo-600 cursor-pointer align-middle"
                    />
                  </th>
                )}
                <th className="px-3 py-2.5 text-left font-bold w-[120px] cursor-pointer hover:text-g700 whitespace-nowrap" onClick={() => handleSort('ts')}>
                  Date & Time{sortArrow('ts')}
                </th>
                <th className="px-3 py-2.5 text-left font-bold w-[90px] cursor-pointer hover:text-g700" onClick={() => handleSort('status')}>
                  Status{sortArrow('status')}
                </th>
                <th className="px-3 py-2.5 text-left font-bold w-[80px] cursor-pointer hover:text-g700" onClick={() => handleSort('channel')}>
                  {isLapTimeline ? 'Type' : 'Channel'}{sortArrow('channel')}
                </th>
                <th className="px-3 py-2.5 text-left font-bold w-[100px] cursor-pointer hover:text-g700" onClick={() => handleSort('refId')}>
                  {isLapTimeline ? 'Ref' : 'Quote'}{sortArrow('refId')}
                </th>
                <th className="px-3 py-2.5 text-left font-bold cursor-pointer hover:text-g700" onClick={() => handleSort('cust')}>
                  Customer · Site{sortArrow('cust')}
                </th>
                <th className="px-3 py-2.5 text-left font-bold">Note</th>
                {isLapTimeline
                  ? <th className="px-3 py-2.5 text-left font-bold w-[100px] cursor-pointer hover:text-g700" onClick={() => handleSort('lapH')}>
                      Time Lap{sortArrow('lapH')}
                    </th>
                  : <th className="px-3 py-2.5 text-left font-bold">Next Planned</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-g100">
              {filtered.map((row, i) => {
                const sKey = rowStatusKey(row);
                const sm = STATUS_META[sKey];
                // Stripe overdue/late rows faintly for quick visual scan
                const rowBg = sKey === 'overdue' ? 'bg-red-50/40' : sKey === 'late' ? 'bg-orange-50/30' : '';
                return (
                  <tr key={i} className={cn('hover:bg-g50/60 transition-colors', rowBg, selected.has(String(i)) && 'bg-indigo-50/50')}>
                    {!isLapTimeline && (
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(String(i))}
                          onChange={() => toggleRow(i)}
                          title={`Select ${row.refId}`}
                          className="accent-indigo-600 cursor-pointer align-middle"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-mono text-[10px] font-semibold text-g600">
                        {fmtIST(new Date(row.ts), 'dd-MMM-yyyy')}
                      </div>
                      <div className="font-mono text-[9.5px] text-g400 mt-0.5">
                        {fmtIST(new Date(row.ts), 'hh:mm a')}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9.5px] font-semibold whitespace-nowrap', sm.cls)}>
                        {sm.icon} {sm.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-g600 font-medium whitespace-nowrap">
                      {row.channel ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[10px] font-semibold text-red-mrt">{row.refId}</span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[180px]">
                      <div className="text-g700 truncate">{row.cust}</div>
                      {row.site && <div className="text-[10px] text-g400 truncate">{row.site}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-g500 max-w-[220px]">
                      {row.note
                        ? <span className="line-clamp-2 leading-snug">{row.note}</span>
                        : <span className="text-g300 italic">—</span>}
                    </td>
                    {isLapTimeline ? (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {row.lapH != null
                          ? <span className={cn('font-mono text-[11px] font-bold',
                              row.onTime === true ? 'text-emerald-600' : row.onTime === false ? 'text-red-mrt' : 'text-g600')}>
                              {fmtHours(row.lapH)}
                            </span>
                          : <span className="text-g300 italic text-[11px]">—</span>}
                      </td>
                    ) : (
                      <td className="px-3 py-2.5 max-w-[180px]">
                        {row.nextSummary
                          ? <span className="text-[11px] text-blue-600 leading-snug">{row.nextSummary}</span>
                          : <span className="text-g300 italic text-[11px]">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer count + bulk-log action */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-g100">
          <span className="text-[10px] text-g400">
            Showing {filtered.length} of {timeline.length} entries
            {!isLapTimeline && selectedQuotes.length > 0 && (
              <span className={cn('ml-2 font-medium', mixedSites ? 'text-red-mrt' : 'text-indigo-600')}>
                · {selectedQuotes.length} quote{selectedQuotes.length === 1 ? '' : 's'} selected
                {mixedSites && ' — one call covers one customer-site only'}
              </span>
            )}
          </span>
          {!isLapTimeline && selectedQuotes.length > 0 && (
            <button
              type="button"
              disabled={mixedSites}
              title={mixedSites ? 'Select quotes from a single customer-site to log in one call' : undefined}
              onClick={() => setShowPanel(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold tracking-wider uppercase rounded-[4px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckSquare size={11} />
              Log on {selectedQuotes.length}
            </button>
          )}
        </div>
      )}

      {!isLapTimeline && showPanel && selectedQuotes.length > 0 && !mixedSites && (
        <BulkLogSidePanel
          quoteIds={selectedQuotes.map(q => q.refId)}
          context={`${selectedQuotes[0].cust} · ${selectedQuotes[0].site}`}
          items={selectedQuotes}
          onClose={() => { setShowPanel(false); setSelected(new Set()); }}
        />
      )}
    </div>
  );
}
