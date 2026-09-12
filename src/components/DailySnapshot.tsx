import React, { useEffect, useState } from 'react';
import { MessageSquare, FileSignature, ShoppingBag, FlaskConical, RefreshCw, Copy, Check, CalendarDays } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtIST } from '../lib/utils';
import { Enquiry, Quote, Order } from '../lib/types';

function dateKey(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 7 day-keys ending AT the given reference date (inclusive), oldest first —
// the trend chart's window follows whichever date is selected, not always "today".
function last7KeysEndingAt(refKey: string): string[] {
  const ref = new Date(refKey + 'T00:00:00');
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const t = new Date(ref);
    t.setDate(ref.getDate() - i);
    out.push(dateKey(t));
  }
  return out;
}

interface HistoryRow { sample_id: string; status: string; changed_at: string; }

export function DailySnapshot({ enquiries, quotes, orders }: { enquiries: Enquiry[]; quotes: Quote[]; orders: Order[] }) {
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sample_status_history')
      .select('sample_id, status, changed_at')
      .order('changed_at', { ascending: true });
    if (!error && data) setHistory(data as HistoryRow[]);
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, []);

  const days = last7KeysEndingAt(selectedDate);

  const countBy = (list: { created_at?: string }[], key: string) =>
    list.filter(r => r.created_at && dateKey(r.created_at) === key).length;

  const enqCount = countBy(enquiries, selectedDate);
  const enqTrend = days.map(k => countBy(enquiries, k));

  const quoteCount = countBy(quotes, selectedDate);
  const quoteTrend = days.map(k => countBy(quotes, k));

  const orderCount = countBy(orders, selectedDate);
  const orderTrend = days.map(k => countBy(orders, k));

  // Reconstruct each sample's status AS OF the selected date: take the most
  // recent history entry at or before that date, per sample. This gives a
  // true point-in-time snapshot ("how many were pending as of yesterday"),
  // not just "what changed on that exact day" — and a sample created after
  // the selected date naturally has no entry yet, so it's correctly excluded.
  const statusCountsAsOf = (asOfKey: string) => {
    const latest = new Map<string, { status: string; changed_at: string }>();
    for (const h of history) {
      if (dateKey(h.changed_at) > asOfKey) continue;
      const existing = latest.get(h.sample_id);
      if (!existing || h.changed_at > existing.changed_at) {
        latest.set(h.sample_id, { status: h.status, changed_at: h.changed_at });
      }
    }
    const counts: Record<string, number> = { pending: 0, dispatched: 0, delivered: 0, approved: 0, rejected: 0 };
    latest.forEach(v => { counts[v.status] = (counts[v.status] ?? 0) + 1; });
    return counts;
  };

  const sampleCounts = statusCountsAsOf(selectedDate);
  const dispatchedCount = sampleCounts.dispatched;
  const pendingBacklog = sampleCounts.pending;
  const deliveredCount = sampleCounts.delivered;
  const approvedCount = sampleCounts.approved;
  const rejectedCount = sampleCounts.rejected;
  const totalTracked = dispatchedCount + pendingBacklog + deliveredCount + approvedCount + rejectedCount;

  const bar = (v: number, list: number[]) => {
    const max = Math.max(1, ...list);
    return Math.max(4, Math.round((v / max) * 32));
  };

  const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const selectedDow = new Date(selectedDate + 'T00:00:00').getDay();
  const labels = days.map((_, i) => dayLetters[(selectedDow - (6 - i) + 70) % 7]);

  const isToday = selectedDate === todayKey;
  const prettyDate = fmtIST(new Date(selectedDate + 'T00:00:00'), 'EEE, dd-MMM-yyyy');

  const handleCopy = async () => {
    const text = `📊 Update — ${prettyDate}\n` +
      `Enquiries: ${enqCount}\n` +
      `Quotations: ${quoteCount}\n` +
      `Orders: ${orderCount}\n` +
      `Samples as of ${prettyDate}: ${dispatchedCount} dispatched, ${deliveredCount} delivered, ${pendingBacklog} pending, ${approvedCount} approved, ${rejectedCount} rejected\n` +
      `— via EnqBoss`;
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* clipboard blocked — button still flips to Copied so paste can be retried manually */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const Tile = ({ label, value, icon, accent, accentBg }: {
    label: string; value: number; icon: React.ReactNode; accent: string; accentBg: string;
  }) => (
    <div className="bg-white rounded-[10px] border border-g200 p-4 flex flex-col gap-2" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[9.5px] font-bold tracking-[1.5px] uppercase text-g500">{label}</div>
        <div className="w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0" style={{ background: accentBg, color: accent }}>
          {icon}
        </div>
      </div>
      <div className="font-sans text-[26px] leading-none font-bold text-blk tracking-tight">{value}</div>
    </div>
  );

  const Trend = ({ label, values, color }: { label: string; values: number[]; color: string }) => (
    <div>
      <div className="text-[9.5px] text-g500 font-semibold mb-1">{label}</div>
      <div className="flex items-end gap-1 h-9">
        {values.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-t-[2px]"
              style={{ height: bar(v, values), background: i === values.length - 1 ? color : `${color}33` }}
            />
            <div className={`font-mono text-[7px] ${i === values.length - 1 ? 'font-bold' : 'text-g400'}`} style={i === values.length - 1 ? { color } : undefined}>
              {labels[i]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-white border border-g200 rounded-[10px] shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-dashed border-g200 flex-wrap">
        <div>
          <div className="font-mono text-[9.5px] font-bold tracking-[2.5px] uppercase text-red-mrt">Daily Snapshot</div>
          <h2 className="font-serif text-[18px] text-blk tracking-tight leading-tight mt-0.5">
            {isToday ? "Today's" : 'Activity on'} <em className="italic text-red-mrt">{isToday ? 'Activity' : prettyDate}</em>
          </h2>
          <div className="font-mono text-[10.5px] text-g500 mt-0.5">{prettyDate}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-1 bg-g50 border border-g200 rounded-[5px] px-2 h-8">
            <CalendarDays size={12} className="text-g400" />
            <input
              type="date"
              value={selectedDate}
              max={todayKey}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
              className="bg-transparent border-none outline-none font-mono text-[11px] text-blk"
            />
          </div>
          {!isToday && (
            <button type="button" onClick={() => setSelectedDate(todayKey)} className="h-8 px-2.5 rounded-[5px] font-mono text-[10px] font-bold uppercase text-g500 hover:bg-g100 hover:text-blk transition-colors">
              Today
            </button>
          )}
          <button type="button" onClick={loadHistory} title="Refresh" className="inline-flex items-center justify-center h-8 w-8 rounded-[5px] text-g500 hover:bg-g100 hover:text-blk transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button" onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[5px] font-mono text-[10px] font-bold tracking-[1px] uppercase transition-colors ${copied ? 'bg-emerald-600 text-white' : 'bg-blk text-white hover:bg-g800'}`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy Update for Sir'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-5">
        <Tile label="Enquiries" value={enqCount} icon={<MessageSquare size={14} />} accent="#3B82F6" accentBg="#EFF5FF" />
        <Tile label="Quotations" value={quoteCount} icon={<FileSignature size={14} />} accent="#F97316" accentBg="#FFF4EC" />
        <Tile label="Orders" value={orderCount} icon={<ShoppingBag size={14} />} accent="#10B981" accentBg="#ECFBF5" />

        <div className="bg-white rounded-[10px] border border-g200 p-4 flex flex-col gap-2" style={{ borderTop: '3px solid #8B5CF6' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="font-mono text-[9.5px] font-bold tracking-[1.5px] uppercase text-g500">Sampling</div>
            <div className="w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0 bg-purple-50 text-purple-500 shrink-0">
              <FlaskConical size={14} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 mt-0.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-g600"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" />Dispatched</span>
              <span className="font-extrabold text-purple-600">{dispatchedCount}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-g600"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />Pending</span>
              <span className="font-extrabold text-yellow-600">{pendingBacklog}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-g600"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />Delivered</span>
              <span className="font-extrabold text-blue-600">{deliveredCount}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-g600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Approved</span>
              <span className="font-extrabold text-emerald-600">{approvedCount}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-g600"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Rejected</span>
              <span className="font-extrabold text-red-600">{rejectedCount}</span>
            </div>
          </div>
          <div className="text-[9px] text-g400 leading-snug">As of {prettyDate} · {totalTracked} samples tracked</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-5 pb-5">
        <Trend label="Enquiries" values={enqTrend} color="#3B82F6" />
        <Trend label="Quotations" values={quoteTrend} color="#F97316" />
        <Trend label="Orders" values={orderTrend} color="#10B981" />
      </div>
    </div>
  );
}
