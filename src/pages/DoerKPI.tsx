import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';
import { DOER_ROLES, type DoerRole, type GlobalDateRangeLike } from '../lib/types';
import { computeDoerMetrics, doerRowKey, ROLE_WEIGHTS, type DoerMetrics, type DueItem } from '../lib/kpi';
import {
  Clock, TrendingUp, Users, ChevronDown, ChevronRight,
  CheckCircle2, AlertTriangle, Target, Zap, Trophy,
  Phone, FileText, Receipt, Activity, ArrowUp, ArrowDown, Minus,
  Cloud, X,
} from 'lucide-react';
import { BulkLogSidePanel } from '../components/BulkLogSidePanel';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

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

function fmtPct(v: number | null): string { return v == null ? '—' : `${v}%`; }
function fmtHours(v: number | null): string {
  if (v == null) return '—';
  if (v < 1) return '<1h';
  if (v < 24) return `${v}h`;
  const d = Math.floor(v / 24); const h = v % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

// Health colour thresholds
function healthColor(pct: number | null, thresholds = { good: 70, warn: 40 }) {
  if (pct == null) return 'text-g400';
  if (pct >= thresholds.good) return 'text-emerald-600';
  if (pct >= thresholds.warn) return 'text-amber-600';
  return 'text-red-600';
}
function healthBg(pct: number | null, thresholds = { good: 70, warn: 40 }) {
  if (pct == null) return 'bg-g200';
  if (pct >= thresholds.good) return 'bg-emerald-500';
  if (pct >= thresholds.warn) return 'bg-amber-500';
  return 'bg-red-500';
}

// Role-specific display config
const ROLE_CONFIG: Record<DoerRole, {
  label: string;
  color: string;        // tailwind border-l color
  accent: string;       // text accent
  accentBg: string;
  primaryMetric: string;
  primaryDesc: string;
  secondaryMetric: string;
  secondaryDesc: string;
}> = {
  'DEO': {
    label: 'Data Entry', color: 'border-l-blue-500', accent: 'text-blue-600', accentBg: 'bg-blue-50',
    primaryMetric: 'Enquiries entered', primaryDesc: 'in period',
    secondaryMetric: 'Avg entry lag', secondaryDesc: 'recv → punched',
  },
  'Rate Entry': {
    label: 'Rate Entry', color: 'border-l-purple-500', accent: 'text-purple-600', accentBg: 'bg-purple-50',
    primaryMetric: 'Quotes sent', primaryDesc: 'in period',
    secondaryMetric: 'Avg E→Q time', secondaryDesc: 'enquiry → sent',
  },
  'SC_1': {
    label: 'Sales Coord', color: 'border-l-emerald-500', accent: 'text-emerald-600', accentBg: 'bg-emerald-50',
    primaryMetric: 'Follow-ups done', primaryDesc: 'in period',
    secondaryMetric: 'On-time rate', secondaryDesc: 'within TAT',
  },
  'Negotiation': {
    label: 'Negotiation', color: 'border-l-orange-500', accent: 'text-orange-600', accentBg: 'bg-orange-50',
    primaryMetric: 'Deals handled', primaryDesc: 'at negotiation stage',
    secondaryMetric: 'Win rate', secondaryDesc: 'of closed deals',
  },
  'PI Sender': {
    label: 'PI Sender', color: 'border-l-red-500', accent: 'text-red-600', accentBg: 'bg-red-50',
    primaryMetric: 'PIs sent', primaryDesc: 'in period',
    secondaryMetric: 'Avg dispatch time', secondaryDesc: 'order → PI sent',
  },
  'Other': {
    label: 'Other', color: 'border-l-g400', accent: 'text-g600', accentBg: 'bg-g100',
    primaryMetric: 'Activities', primaryDesc: 'in period',
    secondaryMetric: 'On-time rate', secondaryDesc: 'within TAT',
  },
};

export function DoerKPI() {
  const { data, globalDateRange } = useAppStore();
  const navigate = useNavigate();
  const roster = data.roster.filter(m => m.active);

  const range: GlobalDateRangeLike = globalDateRange
    ? { startDate: globalDateRange.startDate, endDate: globalDateRange.endDate }
    : defaultRange();

  const current = useMemo(() => computeDoerMetrics(data, roster, range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, range.startDate, range.endDate]);
  const previous = useMemo(() => computeDoerMetrics(data, roster, priorWindow(range)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, range.startDate, range.endDate]);

  const rows = useMemo(() => {
    const arr = [...current.values()];
    return arr.sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1));
  }, [current]);

  const [sortKey, setSortKey] = useState<'composite' | 'onTimePct' | 'volume' | 'avgCycleH' | 'winRate'>('composite');
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? (sortKey === 'avgCycleH' ? Infinity : -1);
      const bv = b[sortKey] ?? (sortKey === 'avgCycleH' ? Infinity : -1);
      return sortKey === 'avgCycleH' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, sortKey]);

  const firstKey = rows[0] ? doerRowKey(rows[0].email, rows[0].role) : undefined;
  const [trendKey, setTrendKey] = useState<string | undefined>(undefined);
  const activeTrendKey = trendKey ?? firstKey;
  const trendData = useMemo(() => buildTrend(data, roster, activeTrendKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, activeTrendKey]);

  const [bulkLog, setBulkLog] = useState<{ context: string; items: DueItem[] } | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);

  // Team-level summary stats
  const teamStats = useMemo(() => {
    const scored = rows.filter(m => m.composite != null);
    const avgOnTime = scored.length
      ? Math.round(scored.reduce((s, m) => s + (m.onTimePct ?? 0), 0) / scored.length)
      : null;
    const totalVolume = rows.reduce((s, m) => s + m.volume, 0);
    const urgentDue = rows.reduce((s, m) => s + m.dueNextWeek.length, 0);
    const winnable = rows.filter(m => m.winRate != null);
    const avgWin = winnable.length
      ? Math.round(winnable.reduce((s, m) => s + (m.winRate ?? 0), 0) / winnable.length)
      : null;
    return { avgOnTime, totalVolume, urgentDue, avgWin };
  }, [rows]);

  if (roster.length === 0) {
    return (
      <div className="p-8 max-w-2xl">
        <PageHeader range={range} />
        <div className="mt-6 bg-white rounded-[10px] border border-g200 p-8 text-center">
          <Users size={32} className="mx-auto text-g300 mb-3" />
          <div className="font-sans text-[15px] font-semibold text-blk">No team roster yet</div>
          <p className="text-[12px] text-g500 mt-1.5">
            Add your doers in <span className="font-semibold">Settings → Team Roster</span> to start scoring.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 bg-cream min-h-full space-y-5">
      <PageHeader range={range} onCloud={() => setCloudOpen(true)} />

      {/* ── Team pulse strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PulseTile
          icon={<Activity size={15} />}
          label="Team volume"
          value={String(teamStats.totalVolume)}
          sub="total actions this period"
          color="blue"
        />
        <PulseTile
          icon={<CheckCircle2 size={15} />}
          label="Avg on-time"
          value={fmtPct(teamStats.avgOnTime)}
          sub="across all follow-ups"
          color={teamStats.avgOnTime == null ? 'gray' : teamStats.avgOnTime >= 70 ? 'green' : teamStats.avgOnTime >= 40 ? 'amber' : 'red'}
          progress={teamStats.avgOnTime}
        />
        <PulseTile
          icon={<Clock size={15} />}
          label="Due next 7 days"
          value={String(teamStats.urgentDue)}
          sub="follow-ups pending"
          color={teamStats.urgentDue === 0 ? 'green' : teamStats.urgentDue > 10 ? 'red' : 'amber'}
        />
        <PulseTile
          icon={<Trophy size={15} />}
          label="Avg win rate"
          value={fmtPct(teamStats.avgWin)}
          sub="of closed negotiations"
          color={teamStats.avgWin == null ? 'gray' : teamStats.avgWin >= 60 ? 'green' : teamStats.avgWin >= 35 ? 'amber' : 'red'}
          progress={teamStats.avgWin}
        />
      </div>

      {/* ── Per-doer cards ── */}
      <div className="space-y-2">
        <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-g500">Individual Performance</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {sortedRows.map(m => {
            const key = doerRowKey(m.email, m.role);
            const prev = previous.get(key);
            const cfg = ROLE_CONFIG[m.role];
            const deferred = ROLE_WEIGHTS[m.role] == null;
            const delta = (m.composite != null && prev?.composite != null) ? m.composite - prev.composite : null;

            // Role-specific primary/secondary values
            const primaryVal = m.role === 'DEO' ? String(m.enqCount || m.volume)
              : m.role === 'Rate Entry' ? String(m.volume)
              : m.role === 'Negotiation' ? String(m.volume)
              : m.role === 'SC_1' ? String(m.volume)
              : '—';

            const secondaryVal = m.role === 'SC_1' ? fmtPct(m.onTimePct)
              : m.role === 'Negotiation' ? fmtPct(m.winRate)
              : m.role === 'DEO' ? fmtHours(m.enqLapH)
              : m.role === 'Rate Entry' ? fmtHours(m.quoteLapH)
              : '—';

            const secondaryColor = m.role === 'SC_1' ? healthColor(m.onTimePct)
              : m.role === 'Negotiation' ? healthColor(m.winRate, { good: 60, warn: 35 })
              : m.role === 'DEO' ? (m.enqLapH != null && m.enqLapH <= 4 ? 'text-emerald-600' : m.enqLapH != null && m.enqLapH <= 24 ? 'text-amber-600' : 'text-red-600')
              : m.role === 'Rate Entry' ? (m.quoteLapH != null && m.quoteLapH <= 24 ? 'text-emerald-600' : m.quoteLapH != null && m.quoteLapH <= 72 ? 'text-amber-600' : 'text-red-600')
              : 'text-g500';

            // Flags: what needs attention
            const flags: string[] = [];
            if (!deferred) {
              if (m.onTimePct != null && m.onTimePct < 60) flags.push(`${m.onTimePct}% on-time — ${100 - m.onTimePct}% late`);
              if (m.dueNextWeek.length > 3) flags.push(`${m.dueNextWeek.length} follow-ups due next week`);
              if (m.role === 'SC_1' && m.volume === 0) flags.push('No follow-up activity this period');
              if (m.role === 'Negotiation' && m.winRate != null && m.winRate < 30) flags.push(`Win rate only ${m.winRate}%`);
              if ((m.role === 'DEO' || m.role === 'Rate Entry') && m.avgCycleH != null && m.avgCycleH > 48) flags.push(`Slow cycle: avg ${fmtHours(m.avgCycleH)}`);
            }

            return (
              <div
                key={key}
                onClick={() => navigate(`/doer-kpi/${encodeURIComponent(key)}`)}
                className={cn(
                  'bg-white rounded-[10px] border border-g200 border-l-[3px] p-4 cursor-pointer',
                  'hover:shadow-md hover:border-g300 transition-all duration-150',
                  cfg.color,
                )}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-semibold text-[14px] text-blk leading-tight">{m.displayName}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[3px]', cfg.accentBg, cfg.accent)}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] text-g400">{m.email}</span>
                    </div>
                  </div>
                  {/* Shortfall badge — gap to reach 100% */}
                  {!deferred && m.composite != null ? (() => {
                    const gap = m.composite - 100; // always ≤ 0
                    const perfect = gap === 0;
                    return (
                      <div className={cn(
                        'shrink-0 flex flex-col items-center justify-center rounded-[8px] px-3 py-2 min-w-[64px] border',
                        perfect ? 'bg-emerald-50 border-emerald-300' :
                        m.composite >= 70 ? 'bg-amber-50 border-amber-300' :
                        'bg-red-50 border-red-300'
                      )}>
                        <span className={cn(
                          'font-mono text-[18px] font-extrabold leading-none tracking-tight',
                          perfect ? 'text-emerald-700' :
                          m.composite >= 70 ? 'text-amber-700' : 'text-red-700'
                        )}>
                          {perfect ? '0%' : `${gap}%`}
                        </span>
                        <span className={cn(
                          'text-[8px] font-bold uppercase tracking-wide mt-0.5',
                          perfect ? 'text-emerald-500' : 'text-g400'
                        )}>
                          {perfect ? 'perfect' : 'shortfall'}
                        </span>
                        {!perfect && (
                          <span className="text-[8px] text-g400 mt-0.5">to reach 100</span>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="shrink-0 flex flex-col items-center justify-center rounded-[8px] px-3 py-2 min-w-[64px] border border-g200 bg-g50">
                      <span className="text-[18px] font-mono font-extrabold text-g300 leading-none">—</span>
                      <span className="text-[8px] text-g300 font-bold uppercase tracking-wide mt-0.5">shortfall</span>
                    </div>
                  )}
                </div>

                {/* Primary + Secondary metrics */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className={cn('rounded-[6px] px-2.5 py-2', cfg.accentBg)}>
                    <div className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g500 mb-0.5">{cfg.primaryMetric}</div>
                    <div className={cn('font-mono text-[20px] font-extrabold leading-none', cfg.accent)}>{primaryVal}</div>
                    <div className="text-[9px] text-g400 mt-0.5">{cfg.primaryDesc}</div>
                  </div>
                  <div className="rounded-[6px] px-2.5 py-2 bg-g50">
                    <div className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g500 mb-0.5">{cfg.secondaryMetric}</div>
                    <div className={cn('font-mono text-[20px] font-extrabold leading-none', secondaryColor)}>{secondaryVal}</div>
                    <div className="text-[9px] text-g400 mt-0.5">{cfg.secondaryDesc}</div>
                  </div>
                </div>

                {/* On-time + lateness bar (SC_1 / Negotiation / Other) */}
                {(m.role === 'SC_1' || m.role === 'Negotiation' || m.role === 'Other') && m.onTimePct != null && (
                  <div className="mb-3 space-y-1.5">
                    {/* Split bar */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g400">Speed vs plan</span>
                      <span className={cn('text-[10px] font-bold', healthColor(m.onTimePct))}>{m.onTimePct}% on-time</span>
                    </div>
                    <div className="h-2 bg-g100 rounded-full overflow-hidden flex">
                      <div className={cn('h-full rounded-l-full', healthBg(m.onTimePct))} style={{ width: `${m.onTimePct}%` }} />
                      <div className="h-full bg-red-200 flex-1" />
                    </div>
                    {/* Two stat chips: on-time count vs late + avg overdue */}
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-[4px] px-2 py-1.5">
                        <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                        <div>
                          <div className="font-mono text-[11px] font-bold text-emerald-700 leading-none">{m.onTimePct}%</div>
                          <div className="text-[8.5px] text-g400 mt-0.5">done on time</div>
                        </div>
                      </div>
                      <div className={cn(
                        'flex-1 flex items-center gap-1.5 rounded-[4px] px-2 py-1.5 border',
                        m.lateCount === 0 ? 'bg-g50 border-g200' : 'bg-red-50 border-red-200'
                      )}>
                        <Clock size={11} className={m.lateCount === 0 ? 'text-g400 shrink-0' : 'text-red-500 shrink-0'} />
                        <div>
                          <div className={cn('font-mono text-[11px] font-bold leading-none', m.lateCount === 0 ? 'text-g500' : 'text-red-700')}>
                            {m.lateCount === 0 ? '0 late' : m.avgLateH != null ? `+${fmtHours(m.avgLateH)}` : `${m.lateCount} late`}
                          </div>
                          <div className="text-[8.5px] text-g400 mt-0.5">
                            {m.lateCount === 0 ? 'no late steps' : `avg overdue · ${m.lateCount} step${m.lateCount > 1 ? 's' : ''}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional counters — DEO */}
                {m.role === 'DEO' && (
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1 flex items-center gap-1.5 bg-blue-50 rounded-[4px] px-2 py-1.5">
                      <FileText size={11} className="text-blue-500 shrink-0" />
                      <div>
                        <div className="font-mono text-[11px] font-bold text-blue-700">{m.enqCount}</div>
                        <div className="text-[8.5px] text-g400">enquiries</div>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5 bg-emerald-50 rounded-[4px] px-2 py-1.5">
                      <Receipt size={11} className="text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-mono text-[11px] font-bold text-emerald-700">{m.orderCount}</div>
                        <div className="text-[8.5px] text-g400">orders</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Due next week pill + delta */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {m.dueNextWeek.length > 0 ? (
                      <span className={cn(
                        'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
                        m.dueNextWeek.length > 5 ? 'bg-red-100 text-red-700' :
                        m.dueNextWeek.length > 2 ? 'bg-amber-100 text-amber-700' :
                        'bg-g100 text-g600'
                      )}>
                        <Clock size={9} />
                        {m.dueNextWeek.length} due next week
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-g400">
                        <CheckCircle2 size={9} className="text-emerald-500" />
                        Clear next week
                      </span>
                    )}
                  </div>
                  {/* Period delta */}
                  {delta != null ? (
                    <span className={cn(
                      'flex items-center gap-0.5 text-[10px] font-bold',
                      delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-g400'
                    )}>
                      {delta > 0 ? <ArrowUp size={11} /> : delta < 0 ? <ArrowDown size={11} /> : <Minus size={11} />}
                      {Math.abs(delta)} vs prior
                    </span>
                  ) : null}
                </div>

                {/* Attention flags */}
                {flags.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-g100 space-y-1">
                    {flags.map((f, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-amber-700">
                        <AlertTriangle size={10} className="shrink-0 mt-0.5 text-amber-500" />
                        {f}
                      </div>
                    ))}
                  </div>
                )}

                {/* View detail cue */}
                <div className="flex items-center justify-end mt-2 text-[9.5px] text-g400 hover:text-red-mrt transition-colors">
                  View full history <ChevronRight size={11} className="ml-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scoreboard table ── */}
      <div className="bg-white rounded-[10px] border border-g200 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-g100">
          <Target size={15} className="text-g500" />
          <h2 className="font-mono text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Comparison Table</h2>
          <span className="text-[10px] text-g400 ml-1">{range.startDate} → {range.endDate}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-g500 font-mono text-[9px] tracking-[1px] uppercase border-b border-g100 bg-g50">
                <Th>Doer</Th>
                <Th>Role</Th>
                <ThSort label="Score" k="composite" sortKey={sortKey} onSort={setSortKey} />
                <ThSort label="On-time" k="onTimePct" sortKey={sortKey} onSort={setSortKey} />
                <ThSort label="Volume" k="volume" sortKey={sortKey} onSort={setSortKey} />
                <ThSort label="Cycle time" k="avgCycleH" sortKey={sortKey} onSort={setSortKey} />
                <ThSort label="Win %" k="winRate" sortKey={sortKey} onSort={setSortKey} />
                <Th>vs prior</Th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(m => {
                const key = doerRowKey(m.email, m.role);
                const deferred = ROLE_WEIGHTS[m.role] == null;
                const prev = previous.get(key);
                const delta = (m.composite != null && prev?.composite != null) ? m.composite - prev.composite : null;
                const cfg = ROLE_CONFIG[m.role];
                return (
                  <tr key={key}
                    className="border-b border-g50 hover:bg-g50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/doer-kpi/${encodeURIComponent(key)}`)}>
                    <td className="px-4 py-2.5 font-semibold text-blk whitespace-nowrap">{m.displayName}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-[3px]', cfg.accentBg, cfg.accent)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {deferred ? <span className="text-g300">—</span> : m.composite == null ? <span className="text-g300">—</span> : (() => {
                        const gap = m.composite - 100;
                        const perfect = gap === 0;
                        return (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-red-100 overflow-hidden">
                              <div className={cn('h-full rounded-full', healthBg(m.composite))}
                                style={{ width: `${m.composite}%` }} />
                            </div>
                            <span className={cn('font-mono font-bold tabular-nums text-[11px]',
                              perfect ? 'text-emerald-600' : m.composite >= 70 ? 'text-amber-600' : 'text-red-600'
                            )}>
                              {perfect ? '0%' : `${gap}%`}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('tabular-nums font-semibold', healthColor(m.onTimePct))}>
                        {deferred ? '—' : fmtPct(m.onTimePct)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-g700 font-semibold">{deferred ? '—' : m.volume}</td>
                    <td className="px-4 py-2.5 tabular-nums text-g600">
                      {deferred ? '—' : (
                        m.role === 'DEO' ? (
                          <span title="Avg recv → punched lag">{fmtHours(m.enqLapH)}<span className="text-g400 text-[9px] ml-1">enq</span></span>
                        ) : m.role === 'Rate Entry' ? (
                          <span title="Avg enquiry punched → quote sent">{fmtHours(m.quoteLapH)}<span className="text-g400 text-[9px] ml-1">E→Q</span></span>
                        ) : (
                          fmtHours(m.avgCycleH)
                        )
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('tabular-nums font-semibold', healthColor(m.winRate, { good: 60, warn: 35 }))}>
                        {deferred ? '—' : fmtPct(m.winRate)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {delta == null ? <span className="text-g300">—</span> : (
                        <span className={cn('font-bold flex items-center gap-0.5', delta >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {delta >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                          {Math.abs(delta)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Trend ── */}
        <div className="bg-white rounded-[10px] border border-g200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <TrendingUp size={15} className="text-g500 shrink-0" />
            <h2 className="font-mono text-[11px] font-bold tracking-[1.5px] uppercase text-g600 shrink-0">
              Score Trend — 6 weeks
            </h2>
            <select
              title="Select doer for trend"
              value={activeTrendKey ?? ''}
              onChange={e => setTrendKey(e.target.value || undefined)}
              className="ml-auto text-[11px] bg-white border border-g200 rounded-[4px] px-2 py-1 outline-none focus:border-g400 text-g600 cursor-pointer"
            >
              {rows.map(r => {
                const k = doerRowKey(r.email, r.role);
                return <option key={k} value={k}>{r.displayName} · {r.role}</option>;
              })}
            </select>
          </div>
          {trendData.points.every(p => p.score == null) ? (
            <div className="h-[200px] flex items-center justify-center text-g400 text-[12px]">No data in this window</div>
          ) : (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData.points} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#999' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#999' }} />
                  <ReferenceLine y={70} stroke="#10b981" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Good', fontSize: 9, fill: '#10b981', position: 'right' }} />
                  <ReferenceLine y={40} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1} label={{ value: 'Warn', fontSize: 9, fill: '#f59e0b', position: 'right' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                    formatter={(v: any) => [`${v ?? '—'}`, 'Score']}
                  />
                  <Line type="monotone" dataKey="score" stroke="#D42027" strokeWidth={2.5}
                    dot={{ r: 4, fill: '#D42027', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex items-center gap-4 text-[10px] text-g400">
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-emerald-500 inline-block" />≥70 good</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500 inline-block" />40–69 watch</span>
            <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-red-500 inline-block" />&lt;40 needs attention</span>
          </div>
        </div>

        {/* ── Due next week ── */}
        <div className="bg-white rounded-[10px] border border-g200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Phone size={15} className="text-g500" />
            <h2 className="font-mono text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Due Next 7 Days</h2>
            {teamStats.urgentDue > 0 && (
              <span className="ml-auto text-[10px] font-bold text-white bg-red-mrt rounded-full px-2 py-0.5">
                {teamStats.urgentDue} pending
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            {rows.filter(m => m.dueNextWeek.length > 0).length === 0 && (
              <div className="text-[12px] text-g400 py-8 text-center flex flex-col items-center gap-2">
                <CheckCircle2 size={24} className="text-emerald-400" />
                Nothing due in the next 7 days — queue is clear.
              </div>
            )}
            {rows.filter(m => m.dueNextWeek.length > 0).map(m => (
              <DueGroup
                key={doerRowKey(m.email, m.role)}
                member={m}
                onBulkLog={(items) => setBulkLog({
                  context: items[0] ? `${items[0].cust} · ${items[0].site}` : `Due Next Week · ${m.displayName}`,
                  items,
                })}
              />
            ))}
          </div>
        </div>
      </div>

      {bulkLog && (
        <BulkLogSidePanel
          quoteIds={bulkLog.items.map(it => it.refId)}
          context={bulkLog.context}
          items={bulkLog.items.map(it => ({ refId: it.refId, cust: it.cust, label: it.label }))}
          onClose={() => setBulkLog(null)}
        />
      )}

      {cloudOpen && (
        <WordCloudModal notes={data.followups.flatMap(fu => (fu.logs ?? []).map((l: any) => l.note as string))} onClose={() => setCloudOpen(false)} />
      )}
    </div>
  );
}

// ── Team pulse tile ───────────────────────────────────────────────────
type TileColor = 'blue' | 'green' | 'amber' | 'red' | 'gray';
const TILE_COLORS: Record<TileColor, { icon: string; value: string; bar: string; bg: string }> = {
  blue:  { icon: 'text-blue-500',    value: 'text-blue-700',    bar: 'bg-blue-500',    bg: 'bg-blue-50' },
  green: { icon: 'text-emerald-500', value: 'text-emerald-700', bar: 'bg-emerald-500', bg: 'bg-emerald-50' },
  amber: { icon: 'text-amber-500',   value: 'text-amber-700',   bar: 'bg-amber-500',   bg: 'bg-amber-50' },
  red:   { icon: 'text-red-500',     value: 'text-red-700',     bar: 'bg-red-500',     bg: 'bg-red-50' },
  gray:  { icon: 'text-g400',        value: 'text-g600',        bar: 'bg-g300',        bg: 'bg-g50' },
};
function PulseTile({ icon, label, value, sub, color, progress }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  color: TileColor; progress?: number | null;
}) {
  const c = TILE_COLORS[color];
  return (
    <div className="bg-white rounded-[10px] border border-g200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className={c.icon}>{icon}</span>
        <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500">{label}</span>
      </div>
      <div className={cn('font-mono text-[26px] font-extrabold leading-none mb-1', c.value)}>{value}</div>
      {progress != null && (
        <div className="h-1.5 bg-g100 rounded-full overflow-hidden mb-1.5">
          <div className={cn('h-full rounded-full transition-all', c.bar)} style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      )}
      <div className="text-[10px] text-g400">{sub}</div>
    </div>
  );
}

function PageHeader({ range, onCloud }: { range: GlobalDateRangeLike; onCloud: () => void }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-2">
      <div>
        <h1 className="font-serif text-[24px] font-bold text-blk">Doer KPI</h1>
        <p className="text-[12px] text-g500 mt-0.5">
          Per-person performance — volume, on-time rate, speed, and win rate over the selected period.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCloud}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] border border-g200 bg-white text-[11px] font-bold text-g600 hover:bg-g50 hover:border-g300 transition-colors shadow-sm"
        >
          <Cloud size={13} className="text-indigo-500" />
          Note Cloud
        </button>
        <div className="font-mono text-[10px] text-g400 bg-white border border-g200 rounded-[6px] px-3 py-1.5">
          {range.startDate} → {range.endDate}
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-bold">{children}</th>;
}
function ThSort({ label, k, sortKey, onSort }: {
  label: string; k: any; sortKey: string; onSort: (k: any) => void;
}) {
  return (
    <th className="px-4 py-2.5 text-left font-bold cursor-pointer select-none hover:text-g700"
        onClick={() => onSort(k)}>
      <span className={cn(sortKey === k && 'text-red-mrt underline')}>{label}</span>
    </th>
  );
}

function DueGroup({ member, onBulkLog }: { member: DoerMetrics; onBulkLog: (items: DueItem[]) => void }) {
  const [open, setOpen] = useState(true);
  const siteGroups = useMemo(() => {
    const map = new Map<string, { cust: string; site: string; items: DueItem[] }>();
    for (const d of member.dueNextWeek) {
      const key = `${d.cust}__${d.siteId ?? d.site}`;
      if (!map.has(key)) map.set(key, { cust: d.cust, site: d.site, items: [] });
      map.get(key)!.items.push(d);
    }
    return [...map.values()];
  }, [member.dueNextWeek]);

  return (
    <div className="border border-g100 rounded-[8px] overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-g50 hover:bg-g100/60 transition-colors">
        <span className="text-[11.5px] font-semibold text-blk">
          {member.displayName}
          <span className="ml-1.5 text-g400 font-normal text-[10px]">({member.role})</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn(
            'text-[10px] font-mono font-bold text-white rounded-full px-1.5 py-0.5',
            member.dueNextWeek.length > 5 ? 'bg-red-500' : member.dueNextWeek.length > 2 ? 'bg-amber-500' : 'bg-g500'
          )}>{member.dueNextWeek.length}</span>
          <ChevronDown size={14} className={cn('text-g400 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="divide-y divide-g100">
          {siteGroups.map((g, gi) => (
            <SiteDueGroup key={gi} cust={g.cust} site={g.site} items={g.items} onBulkLog={onBulkLog} />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteDueGroup({ cust, site, items, onBulkLog }: {
  cust: string; site: string; items: DueItem[]; onBulkLog: (items: DueItem[]) => void;
}) {
  const loggable = items.filter(d => d.kind === 'followup');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (refId: string) =>
    setSelected(s => { const n = new Set(s); n.has(refId) ? n.delete(refId) : n.add(refId); return n; });
  const selectedItems = loggable.filter(d => selected.has(d.refId));
  const logHere = () => { const b = selectedItems.length > 0 ? selectedItems : loggable; if (b.length > 0) onBulkLog(b); };
  const showSite = site && site !== 'Head Office / General';

  return (
    <div>
      <div className="px-3 py-1.5 bg-g50/70">
        <div className="text-[11px] font-semibold text-blk truncate">
          {cust}{showSite && <span className="font-normal text-g400"> — {site}</span>}
        </div>
      </div>
      <ul className="divide-y divide-g50">
        {items.map((d, i) => {
          const canLog = d.kind === 'followup';
          const checked = selected.has(d.refId);
          const isOverdue = d.dueDate ? new Date(d.dueDate) < new Date() : false;
          return (
            <li key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
              {canLog ? (
                <input type="checkbox" checked={checked} onChange={() => toggle(d.refId)}
                  title={`Select ${d.refId}`} className="shrink-0 accent-indigo-600 cursor-pointer" />
              ) : <span className="w-3 shrink-0" />}
              <span className="text-g700 truncate flex-1">{d.label}</span>
              {d.dueDate && (
                <span className={cn('text-[9px] font-bold shrink-0 ml-1', isOverdue ? 'text-red-600' : 'text-g500')}>
                  {isOverdue && '⚠ '}
                  {new Date(d.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {loggable.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-indigo-50/40">
          <span className="text-[10px] text-indigo-600 font-medium">
            {selectedItems.length > 0 ? `${selectedItems.length} selected` : `One call · ${loggable.length} open`}
          </span>
          <button type="button" onClick={logHere}
            className="h-5 inline-flex items-center gap-1 px-2 rounded-full border text-[9px] font-semibold transition-colors bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50">
            + Log {selectedItems.length > 0 ? selectedItems.length : 'All'}
          </button>
        </div>
      )}
    </div>
  );
}

function buildTrend(data: ReturnType<typeof useAppStore>['data'], roster: any[], key?: string) {
  const points: { label: string; score: number | null }[] = [];
  if (!key) return { name: '—', points };
  const sample = computeDoerMetrics(data, roster, null).get(key);
  const name = sample ? `${sample.displayName} · ${sample.role}` : '—';
  const now = Date.now();
  for (let w = 5; w >= 0; w--) {
    const end = new Date(now - w * 7 * MS_DAY);
    const start = new Date(end.getTime() - 7 * MS_DAY);
    const range = { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
    const m = computeDoerMetrics(data, roster, range).get(key);
    points.push({
      label: end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      score: m?.composite ?? null,
    });
  }
  return { name, points };
}

// ─── Word Cloud ───────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','as','is','was','are','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','can','it',
  'its','this','that','these','those','i','me','my','we','our','you','your',
  'he','him','his','she','her','they','them','their','not','no','so','if',
  'then','than','when','while','where','which','who','how','what','get','got',
  'also','just','very','more','most','said','say','one','two','all','any',
  'some','there','here','new','old','out','up','down','about','after','before',
  'good','well','still','call','called','told','told','need','want','will',
]);

function isSystemNote(note: string): boolean {
  const t = note.trimStart();
  return (
    t.startsWith('Quote sent —') ||
    t.startsWith('Sent MRT-') ||
    t.startsWith('Sent ') ||
    /^MRT-\d{4}-\d+/.test(t)
  );
}

// Seed phrases that should always be detected as a unit when present.
// Normalised to lowercase; variations (spelling, spacing) are handled by the
// fuzzy-match step in tokenize before ngram scoring.
const SEED_PHRASES = [
  'not answering','not answered','not reachable','not available','not picking',
  'not responding','no answer','no response','switched off','phone off',
  'out of station','not interested','will confirm','will check','will share',
  'sent reminder','price high','rate high','already ordered','already placed',
  'budget issue','payment pending','delivery issue','sample requested',
  'waiting for approval','under consideration','meeting scheduled',
];

function normaliseText(raw: string): string {
  return raw
    .replace(/MRT-\d{4}-\d+/gi, ' ')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi, ' ')
    .replace(/₹[\d,]+/g, ' ')
    .replace(/[^a-z\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(notes: string[]): Map<string, number> {
  const freq = new Map<string, number>();

  for (const note of notes) {
    if (!note || isSystemNote(note)) continue;
    const text = normaliseText(note);
    const tokens = text.split(' ').filter(w => w.length >= 2);

    // ── phrase pass: check seed phrases and high-frequency bigrams/trigrams ──
    const phraseMatched = new Set<number>(); // token indices consumed by a phrase

    // seed phrase detection (fuzzy: collapse spaces, allow 1-char typos via inclusion)
    for (const phrase of SEED_PHRASES) {
      const pTokens = phrase.split(' ');
      const pLen = pTokens.length;
      outer: for (let i = 0; i <= tokens.length - pLen; i++) {
        for (let j = 0; j < pLen; j++) {
          const a = tokens[i + j]; const b = pTokens[j];
          // allow prefix match for typos (e.g. "answred" starts with "answ")
          if (a !== b && !a.startsWith(b.slice(0, 4))) continue outer;
        }
        freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
        for (let j = 0; j < pLen; j++) phraseMatched.add(i + j);
        break; // count phrase once per note occurrence
      }
    }

    // ── bigram pass: count all 2-word combos not in stop words ──
    for (let i = 0; i < tokens.length - 1; i++) {
      if (phraseMatched.has(i) || phraseMatched.has(i + 1)) continue;
      const a = tokens[i]; const b = tokens[i + 1];
      if (a.length < 3 || b.length < 3 || STOP_WORDS.has(a) || STOP_WORDS.has(b)) continue;
      const bigram = `${a} ${b}`;
      freq.set(bigram, (freq.get(bigram) ?? 0) + 1);
    }

    // ── unigram pass: individual words not consumed by a phrase ──
    for (let i = 0; i < tokens.length; i++) {
      if (phraseMatched.has(i)) continue;
      const w = tokens[i];
      if (w.length < 3 || STOP_WORDS.has(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  // ── prune bigrams that appear only once (noise) ──
  for (const [k, v] of freq) {
    if (k.includes(' ') && v < 2) freq.delete(k);
  }

  return freq;
}

const CLOUD_COLORS = [
  '#4f46e5','#0ea5e9','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#06b6d4','#84cc16','#f97316','#ec4899',
];

interface PlacedWord { word: string; count: number; x: number; y: number; size: number; color: string; }

function placeWords(words: [string, number][], W: number, H: number): PlacedWord[] {
  const placed: PlacedWord[] = [];
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const cx = W / 2; const cy = H / 2;
  const maxCount = words[0]?.[1] ?? 1;

  function overlaps(x: number, y: number, w: number, h: number) {
    for (const r of rects) {
      if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return true;
    }
    return false;
  }

  for (let i = 0; i < words.length; i++) {
    const [word, count] = words[i];
    const size = Math.round(12 + (count / maxCount) * 36);
    const charW = size * 0.58; const padY = size * 0.3;
    // phrases have spaces (narrower) — estimate per-char width more accurately
    const ww = word.split('').reduce((acc, ch) => acc + (ch === ' ' ? size * 0.28 : charW), 0);
    const wh = size + padY;
    const color = CLOUD_COLORS[i % CLOUD_COLORS.length];

    let placed_ = false;
    for (let step = 0; step < 800; step++) {
      const angle = step * 0.25;
      const radius = step * 0.8;
      const tx = cx + radius * Math.cos(angle) - ww / 2;
      const ty = cy + radius * Math.sin(angle) - wh / 2;
      if (tx < 0 || ty < 0 || tx + ww > W || ty + wh > H) continue;
      if (!overlaps(tx, ty, ww, wh)) {
        rects.push({ x: tx, y: ty, w: ww, h: wh });
        placed.push({ word, count, x: tx, y: ty, size, color });
        placed_ = true;
        break;
      }
    }
    if (!placed_) break; // canvas full
  }
  return placed;
}

function NoteWordCloud({ notes }: { notes: string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 700, h: 420 });
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const placed = useMemo(() => {
    const filtered = filter
      ? notes.filter(n => n?.toLowerCase().includes(filter.toLowerCase()))
      : notes;
    const freq = tokenize(filtered);
    const sorted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80);
    return placeWords(sorted, dims.w, dims.h);
  }, [notes, filter, dims]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-3 pb-2 border-b border-g100 flex items-center gap-2">
        <input
          className="flex-1 text-[12px] border border-g200 rounded-[6px] px-2.5 py-1 outline-none focus:border-indigo-400"
          placeholder="Filter notes containing…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {filter && (
          <button type="button" onClick={() => setFilter('')}
            className="text-[10px] text-g400 hover:text-g600 px-1">
            clear
          </button>
        )}
        <span className="text-[10px] text-g400 ml-1 whitespace-nowrap">
          {placed.length} words · {notes.filter(Boolean).length} notes
        </span>
      </div>
      <div ref={containerRef} className="flex-1 relative overflow-hidden select-none">
        {placed.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-g400">
            No words to show
          </div>
        )}
        {placed.map(p => (
          <span
            key={p.word}
            title={`"${p.word}" — ${p.count} time${p.count !== 1 ? 's' : ''}`}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              fontSize: p.size,
              color: p.color,
              fontWeight: p.count > 5 ? 700 : p.count > 2 ? 600 : 400,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              cursor: 'default',
              opacity: 0.85 + Math.min(0.15, p.count * 0.01),
            }}
          >
            {p.word}
          </span>
        ))}
      </div>
    </div>
  );
}

function WordCloudModal({ notes, onClose }: { notes: string[]; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      style={{ background: 'rgba(15,15,30,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex flex-col bg-white rounded-[14px] shadow-2xl overflow-hidden m-6 w-full max-w-4xl">
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-g100 shrink-0">
          <Cloud size={16} className="text-indigo-500" />
          <div className="flex-1">
            <div className="font-bold text-[14px] text-blk leading-none">Follow-up Note Cloud</div>
            <div className="text-[11px] text-g400 mt-0.5">Most frequent words in "What Happened?" logs</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close word cloud"
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-g100 text-g400 hover:text-g600 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        {/* cloud body */}
        <div className="flex-1 overflow-hidden min-h-0">
          <NoteWordCloud notes={notes} />
        </div>
      </div>
    </div>
  );
}
