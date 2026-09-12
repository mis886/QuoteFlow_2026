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
// the trend chart's window now follows whichever date is selected, not
// always "today".
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

interface SampleRow { status: string; sent_date: string | null; updated_at: string | null; }

export function DailySnapshot({ enquiries, quotes, orders }: { enquiries: Enquiry[]; quotes: Quote[]; orders: Order[] }) {
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadSamples = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('samples').select('status, sent_date, updated_at');
    if (!error && data) setSamples(data as SampleRow[]);
    setLoading(false);
  };

  useEffect(() => { loadSamples(); }, []);

  const days = last7KeysEndingAt(selectedDate);

  const countBy = (list: { created_at?: string }[], key: string) =>
    list.filter(r => r.created_at && dateKey(r.created_at) === key).length;

  const enqCount = countBy(enquiries, selectedDate);
  const enqTrend = days.map(k => countBy(enquiries, k));

  const quoteCount = countBy(quotes, selectedDate);
  const quoteTrend = days.map(k => countBy(quotes, k));

  const orderCount = countBy(orders, selectedDate);
  const orderTrend = days.map(k => countBy(orders, k));

  const dispatchedCount = samples.filter(s => s.status === 'dispatched' && s.sent_date === selectedDate).length;
  const deliveredCount = samples.filter(s => s.status === 'delivered' && s.updated_at && dateKey(s.updated_at) === selectedDate).length;
  // Pending is a live backlog, not a per-date figure — there's no historical
  // status log, so "how many were pending on 5 Sep" isn't answerable from
  // this table. Always shows the CURRENT pending count regardless of the
  // date picked, and is labelled as such below.
  const pendingBacklog = samples.filter(s => s.status === 'pending').length;
  const dispatchedTrend = days.map(k => samples.filter(s => s.status === 'dispatched' && s.sent_date === k).length);

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
      `Samples: ${dispatchedCount} dispatched, ${deliveredCount} delivered · ${pendingBacklog} pending (current backlog)\n` +
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
          <button type="button" onClick={loadSamples} title="Refresh" className="inline-flex items-center justify-center h-8 w-8 rounded-[5px] text-g500 hover:bg-g100 hover:text-blk transition-colors">
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
          </div>
          <div className="text-[9px] text-g400 leading-snug">Dispatched/Delivered = on selected date · Pending = current backlog (not date-specific)</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-5 pb-5">
        <Trend label="Enquiries" values={enqTrend} color="#3B82F6" />
        <Trend label="Quotations" values={quoteTrend} color="#F97316" />
        <Trend label="Orders" values={orderTrend} color="#10B981" />
        <Trend label="Samples Dispatched" values={dispatchedTrend} color="#8B5CF6" />
      </div>
    </div>
  );
}
