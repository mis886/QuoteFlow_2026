import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Phone, Mail, MessageCircle, MapPin, Star, ChevronRight, ExternalLink, FileText, Paperclip } from 'lucide-react';
import { useAppStore } from '../store';
import { Customer, Contact, CustomerTier, Quote, Order, Enquiry, FollowUpLog } from '../lib/types';
import { formatINR, fmtIST } from '../lib/utils';
import { cn } from '../lib/utils';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { generateQuotePDF } from '../lib/pdfGenerator';
import { PinGate } from '../components/PinGate';
import { BulkFollowUpForm } from '../components/BulkFollowUpForm';

// ── shared helpers (mirrors Customers.tsx) ────────────────────────────────────

function getPrimaryContact(c: Customer): Contact | undefined {
  for (const s of c.sites ?? []) {
    const found = (s.contacts ?? []).find(ct => ct.isPrimary) ?? (s.contacts ?? [])[0];
    if (found) return found;
  }
  return undefined;
}

function getTierStyle(tier: CustomerTier | undefined) {
  switch (tier) {
    case 'Gold':   return 'bg-amber-50 text-amber-700 border-amber-300';
    case 'Silver': return 'bg-slate-100 text-slate-600 border-slate-300';
    case 'Bronze': return 'bg-orange-50 text-orange-700 border-orange-300';
    default:       return 'bg-g100 text-g500 border-g300';
  }
}

function TierBadge({ tier }: { tier: CustomerTier | undefined }) {
  const t = tier ?? 'New';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9.5px] font-bold uppercase tracking-wide ${getTierStyle(t)}`}>
      {t === 'Gold' && <Star size={8} className="fill-amber-500 stroke-amber-500" />}
      {t}
    </span>
  );
}

function InitialAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const colors = ['bg-blue-600', 'bg-indigo-600', 'bg-violet-600', 'bg-emerald-600', 'bg-teal-600', 'bg-rose-600'];
  const col = colors[name.charCodeAt(0) % colors.length];
  const sz = size === 'lg' ? 'w-10 h-10 text-[13px]' : size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[11px]';
  return (
    <div className={`${sz} rounded-full ${col} flex items-center justify-center text-white font-bold shrink-0`}>
      {initials || '?'}
    </div>
  );
}

function fVal(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`;
  return formatINR(v);
}

const STATUS_DOT: Record<string, string> = {
  Won: 'bg-emerald-500', Sent: 'bg-blue-500', Draft: 'bg-g300', Lost: 'bg-red-400', Parked: 'bg-orange-400',
};
const STATUS_BADGE: Record<string, string> = {
  Won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Sent: 'bg-blue-50 text-blue-700 border-blue-200',
  Draft: 'bg-g100 text-g500 border-g200',
  Lost: 'bg-red-50 text-red-700 border-red-200',
  Parked: 'bg-orange-50 text-orange-700 border-orange-200',
};
const CHANNEL_ICON: Record<string, React.ReactNode> = {
  WhatsApp: <MessageCircle size={11} className="text-green-500" />,
  Called:   <Phone size={11} className="text-blue-500" />,
  Email:    <Mail size={11} className="text-red-400" />,
  Meeting:  <Star size={11} className="text-purple-400" />,
  Visit:    <MapPin size={11} className="text-orange-400" />,
};

// ── per-customer computed stats ───────────────────────────────────────────────

interface CustomerStats {
  customer: Customer;
  enqs: Enquiry[];
  quotes: Quote[];
  orders: Order[];
  winRate: number;         // % won / total enqs
  pipeline: number;        // sum of Sent quotes value
  wonRev: number;          // sum of order.value
  lastActivity: string | null;
  vsAvg: number;           // winRate - companyAvgWinRate
}

function useCustomerStats(customers: Customer[], allEnqs: Enquiry[], allQuotes: Quote[], allOrders: Order[]) {
  return useMemo(() => {
    const companyWon = allEnqs.filter(e => e.status === 'Won').length;
    const companyAvg = allEnqs.length ? Math.round(companyWon / allEnqs.length * 100) : 0;

    return customers.map(c => {
      const enqs   = allEnqs.filter(e => e.cust === c.name);
      const quotes = allQuotes.filter(q => q.cust === c.name);
      const orders = allOrders.filter(o => o.cust === c.name);

      const wonQ    = quotes.filter(q => q.status === 'Won');
      const winRate = enqs.length ? Math.round(wonQ.length / enqs.length * 100) : 0;

      const pipeline = quotes
        .filter(q => q.status === 'Sent')
        .reduce((s, q) => s + (q.items ?? []).reduce((a, i) => a + (i.total ?? 0), 0), 0);

      const wonRev = orders.reduce((s, o) => s + (o.value ?? 0), 0);

      // Last activity: most recent date across quotes, orders, enqs
      const dates = [
        ...quotes.map(q => q.date),
        ...orders.map(o => o.poDate),
        ...enqs.map(e => e.recv),
      ].filter(Boolean).sort().reverse();
      const lastActivity = dates[0] ?? null;

      return { customer: c, enqs, quotes, orders, winRate, pipeline, wonRev, lastActivity, vsAvg: winRate - companyAvg };
    });
  }, [customers, allEnqs, allQuotes, allOrders]);
}

// ── revenue trend: 6 rolling months ──────────────────────────────────────────

function useRevTrend(orders: Order[]): { label: string; value: number }[] {
  return useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(now, 5 - i);
      const start = startOfMonth(m);
      const end   = endOfMonth(m);
      const value = orders
        .filter(o => {
          const d = new Date(o.poDate);
          return d >= start && d <= end;
        })
        .reduce((s, o) => s + (o.value ?? 0), 0);
      return { label: fmtIST(m, 'MMM'), value };
    });
  }, [orders]);
}

// ── Win-rate badge ────────────────────────────────────────────────────────────

function WrBadge({ pct }: { pct: number }) {
  const cls = pct >= 65 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : pct >= 45 ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-600 border-red-200';
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${cls}`}>{pct}% win</span>;
}

// ── PIN Gate ──────────────────────────────────────────────────────────────────

// ── Customer Detail panel ─────────────────────────────────────────────────────

function CustomerDetail({ stats, allFollowups }: {
  stats: CustomerStats;
  allFollowups: ReturnType<typeof useAppStore>['data']['followups'];
}) {
  const navigate = useNavigate();
  const { data, openAttachmentModal } = useAppStore();
  const { customer: c, enqs, quotes, orders, winRate, pipeline, wonRev, vsAvg } = stats;
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [expandedSites, setExpandedSites] = useState<Set<string>>(() => new Set());
  const contact = getPrimaryContact(c);
  const revTrend = useRevTrend(orders);
  const maxRev = Math.max(...revTrend.map(r => r.value), 1);

  // Group quotes by site — quotes with no siteId go into a synthetic "Head Office / General" group
  const siteGroups = useMemo(() => {
    const map = new Map<string, { siteKey: string; siteName: string; siteCity: string; quotes: Quote[] }>();
    const sorted = [...quotes].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    for (const q of sorted) {
      const site = q.siteId ? c.sites?.find(s => s.id === q.siteId) : null;
      const key = site?.id ?? '__general__';
      const name = site?.name ?? (c.sites?.find(s => s.isPrimary)?.name ?? 'Head Office / General');
      const city = site?.city ?? (c.sites?.find(s => s.isPrimary)?.city ?? '');
      if (!map.has(key)) map.set(key, { siteKey: key, siteName: name, siteCity: city, quotes: [] });
      map.get(key)!.quotes.push(q);
    }
    return [...map.values()];
  }, [quotes, c.sites]);

  const toggleSite = (key: string) =>
    setExpandedSites(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const [bulkFormSite, setBulkFormSite] = useState<string | null>(null);

  // Activity timeline: all follow-up logs for this customer's quotes
  const quoteIds = new Set(quotes.map(q => q.id));
  const timeline: (FollowUpLog & { quoteId: string })[] = allFollowups
    .filter(f => quoteIds.has(f.quote_id))
    .flatMap(f => (f.logs ?? []).map(l => ({ ...l, quoteId: f.quote_id })))
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 12);

  const city = (c.sites ?? [])[0]?.city ?? '';

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-g200 px-5 pt-4 pb-0 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <InitialAvatar name={c.name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[15px] text-blk leading-tight truncate">{c.name}</span>
              <TierBadge tier={c.tier} />
            </div>
            <div className="text-[11px] text-g400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{c.seg}{city ? ` · ${city}` : ''}</span>
              {contact && <><span className="text-g200">·</span><span>{contact.name}</span></>}
              {contact?.phone && <><span className="text-g200">·</span><span className="font-mono">{contact.phone}</span></>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/enquiries/new`)}
            className="shrink-0 h-8 inline-flex items-center gap-1.5 px-3 border border-g300 rounded-[3px] text-[11px] font-medium text-g600 hover:bg-g50 transition-colors"
          >
            <ChevronRight size={11} />New Enquiry
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-5 border-t border-g200 -mx-5">
          {[
            { label: 'Enquiries',    value: enqs.length.toString(),  sub: `${quotes.length} quoted` },
            { label: 'Win Rate',     value: `${winRate}%`,
              sub: vsAvg !== 0 ? `${vsAvg > 0 ? '+' : ''}${vsAvg}% vs avg` : 'at avg',
              subColor: vsAvg > 0 ? 'text-emerald-600' : vsAvg < 0 ? 'text-red-500' : 'text-g400' },
            { label: 'Open Pipeline',value: fVal(pipeline),          sub: `${quotes.filter(q => q.status === 'Sent').length} active` },
            { label: 'Won Revenue',  value: fVal(wonRev),            sub: 'lifetime' },
            { label: 'GSTIN',        value: c.gstin || '—',          sub: c.pay ? `Pay: ${c.pay}` : '' },
          ].map((k, i) => (
            <div key={k.label} className={`px-4 py-3 ${i < 4 ? 'border-r border-g200' : ''}`}>
              <div className="text-[9px] text-g400 tracking-wide uppercase mb-1">{k.label}</div>
              <div className="text-[15px] font-semibold text-blk leading-none truncate">{k.value}</div>
              {k.sub && <div className={`text-[9px] mt-1 ${(k as any).subColor ?? 'text-g400'}`}>{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-cream">

        {/* Funnel + Revenue trend */}
        <div className="grid grid-cols-2 gap-4">

          {/* Conversion funnel */}
          <div className="bg-white border border-g200 rounded-[4px] p-4">
            <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-g400 mb-4">Conversion Funnel</div>
            <div className="space-y-2.5">
              {[
                { label: 'Enquiries', n: enqs.length,   pct: enqs.length > 0 ? 100 : 0, color: 'bg-blue-500' },
                { label: 'Quoted',    n: quotes.length,  pct: enqs.length ? Math.round(quotes.length / enqs.length * 100) : 0, color: 'bg-violet-500' },
                { label: 'Won',       n: quotes.filter(q => q.status === 'Won').length,
                  pct: enqs.length ? Math.round(quotes.filter(q => q.status === 'Won').length / enqs.length * 100) : 0, color: 'bg-emerald-500' },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-2.5">
                  <span className="text-[11px] text-g500 w-16 shrink-0">{row.label}</span>
                  <div className="flex-1 h-[7px] bg-g100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${row.n > 0 ? row.color : ''}`} style={{ width: `${row.n > 0 ? Math.max(row.pct, 4) : 0}%` }} />
                  </div>
                  <span className="text-[11px] font-semibold text-blk w-5 text-right">{row.n}</span>
                  <span className="text-[9px] text-g400 w-7 text-right">{row.pct}%</span>
                </div>
              ))}
            </div>
            {enqs.length > 0 && vsAvg !== 0 && (
              <div className={`mt-3 px-3 py-2 rounded-[3px] text-[10px] ${vsAvg > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {vsAvg > 0
                  ? <span>Win rate <strong>+{vsAvg}%</strong> above company average</span>
                  : <span>Win rate <strong>{vsAvg}%</strong> below company average</span>}
              </div>
            )}
          </div>

          {/* Revenue trend */}
          <div className="bg-white border border-g200 rounded-[4px] p-4">
            <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-g400 mb-4">Revenue — 6 Months</div>
            <div className="flex items-end gap-1.5 h-[72px]">
              {revTrend.map((m, i) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                  {m.value > 0 && (
                    <span className="text-[8px] text-g400 leading-none">{fVal(m.value)}</span>
                  )}
                  <div
                    className={`w-full rounded-t-[2px] ${i === revTrend.length - 1 ? 'bg-blue-500' : 'bg-blue-200'}`}
                    style={{ height: `${Math.max(4, Math.round(m.value / maxRev * 52))}px` }}
                  />
                  <span className="text-[9px] text-g400">{m.label}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-g200 mt-2 pt-2">
              <span className="text-[9px] text-g400">Won revenue per month (order date)</span>
            </div>
          </div>
        </div>

        {/* Quotations — grouped by site/branch */}
        <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
          <div className="px-4 py-3 border-b border-g200 flex items-center justify-between">
            <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-g400">All Quotations</span>
            <span className="text-[10px] text-g400">{quotes.length} quotes · {siteGroups.length} site{siteGroups.length !== 1 ? 's' : ''}</span>
          </div>
          {quotes.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-g400 italic">No quotes yet</div>
          ) : (
            <div className="divide-y divide-g100">
              {siteGroups.map(group => {
                const isSiteOpen = expandedSites.has(group.siteKey);
                const groupTotal = group.quotes.reduce((s, q) => {
                  const sub = (q.items ?? []).reduce((a, i) => a + (i.total ?? 0), 0);
                  const gst = (q.items ?? []).reduce((a, i) => a + ((i.total ?? 0) * ((i.gst ?? 0) / 100)), 0);
                  return s + sub + gst;
                }, 0);
                const openCount = group.quotes.filter(q => q.status === 'Sent').length;
                return (
                  <div key={group.siteKey}>
                    {/* Site/branch header row */}
                    <button
                      type="button"
                      onClick={() => toggleSite(group.siteKey)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left cursor-pointer',
                        isSiteOpen ? 'bg-indigo-50' : 'hover:bg-indigo-50/60'
                      )}
                    >
                      <ChevronRight size={12} className={cn('text-indigo-400 shrink-0 transition-transform duration-200', isSiteOpen && 'rotate-90')} />
                      <MapPin size={11} className="text-indigo-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-semibold text-g700">{group.siteName}</span>
                        {group.siteCity && <span className="text-[10px] text-g400 ml-1.5">{group.siteCity}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {openCount > 0 && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            {openCount} open
                          </span>
                        )}
                        <span className="text-[10px] text-g400">{group.quotes.length} quote{group.quotes.length !== 1 ? 's' : ''}</span>
                        <span className="text-[11px] font-semibold text-blk">{fVal(groupTotal)}</span>
                        {group.quotes.length >= 1 && (
                          <button
                            type="button"
                            title="Log follow-up for all quotes at this site"
                            onClick={e => { e.stopPropagation(); setBulkFormSite(bulkFormSite === group.siteKey ? null : group.siteKey); }}
                            className={cn(
                              'h-5 inline-flex items-center gap-1 px-2 rounded-full border text-[9px] font-semibold transition-colors',
                              bulkFormSite === group.siteKey
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50'
                            )}
                          >
                            + Log All
                          </button>
                        )}
                      </div>
                    </button>

                    {bulkFormSite === group.siteKey && (
                      <BulkFollowUpForm
                        quoteIds={group.quotes.map(q => q.id)}
                        siteName={group.siteName}
                        onClose={() => setBulkFormSite(null)}
                      />
                    )}

                    {/* Expanded: individual quote rows */}
                    {isSiteOpen && (
                      <div className="divide-y divide-g100 bg-g50/30">
                        {group.quotes.map(q => {
                          const desc = (q.items ?? [])[0]?.desc ?? '';
                          const isExpanded = expandedQuote === q.id;
                          const subTotal  = (q.items ?? []).reduce((s, i) => s + (i.total ?? 0), 0);
                          const gstTotal  = (q.items ?? []).reduce((s, i) => s + ((i.total ?? 0) * ((i.gst ?? 0) / 100)), 0);
                          const grandTotal = subTotal + gstTotal;
                          return (
                            <div key={q.id}>
                              <button type="button" title={`Toggle ${q.id}`} onClick={() => setExpandedQuote(isExpanded ? null : q.id)}
                                className={cn(
                                  'w-full flex items-center gap-3 pl-9 pr-4 py-2.5 transition-colors text-left cursor-pointer',
                                  isExpanded ? 'bg-blue-50' : 'hover:bg-blue-50'
                                )}>
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[q.status] ?? 'bg-g300'}`} />
                                <span className="font-mono text-[10px] font-semibold text-g600 w-28 shrink-0">{q.id}</span>
                                <span className="text-[11px] text-g500 flex-1 truncate">{desc || '—'}</span>
                                <span className="text-[11px] font-semibold text-blk whitespace-nowrap">{fVal(grandTotal)}</span>
                                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[q.status] ?? STATUS_BADGE.Draft}`}>{q.status}</span>
                                <span className="text-[10px] text-g400 text-right shrink-0 whitespace-nowrap">{q.date ? fmtIST(new Date(q.date), 'dd-MMM-yyyy, HH:mm') : '—'}</span>
                                <ChevronRight size={12} className={cn('text-g300 shrink-0 transition-transform duration-200', isExpanded && 'rotate-90')} />
                              </button>

                              {isExpanded && (
                                <div className="bg-blue-50/30 border-t border-blue-100 px-4 py-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-blue-600">Line Items — {q.id}</span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        title="Download Quote PDF"
                                        onClick={() => {
                                          const cust = data.customers.find(x => x.name === q.cust);
                                          const unit = q.unitId ? data.units.find(u => u.id === q.unitId) : data.units.find(u => u.is_default);
                                          const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
                                          const sig = unitSig ?? data.signatories.find((s: any) => s.is_default);
                                          generateQuotePDF(q, cust, data.settings, sig, true, unit);
                                        }}
                                        className="h-6 inline-flex items-center gap-1 px-2 border border-g200 bg-white rounded-[3px] text-[9px] font-medium text-g600 hover:bg-g50 transition-colors"
                                      >
                                        <FileText size={9} /> PDF
                                      </button>
                                      <button
                                        type="button"
                                        title="View quote documents"
                                        onClick={() => openAttachmentModal('quote', q.id)}
                                        className="h-6 inline-flex items-center gap-1 px-2 border border-g200 bg-white rounded-[3px] text-[9px] font-medium text-g600 hover:bg-g50 transition-colors"
                                      >
                                        <Paperclip size={9} /> Docs
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => navigate(`/quotes/new?id=${q.id}`)}
                                        title="Edit quote"
                                        className="h-6 inline-flex items-center gap-1 px-2 border border-g200 bg-white rounded-[3px] text-[9px] font-medium text-g600 hover:bg-g50 transition-colors"
                                      >
                                        <ExternalLink size={9} /> Edit
                                      </button>
                                    </div>
                                  </div>
                                  <div className="bg-white border border-g200 rounded-[3px] overflow-x-auto">
                                    <table className="w-full border-collapse text-[11px]">
                                      <thead className="bg-g100">
                                        <tr>
                                          <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-left border-b border-g200 w-6">#</th>
                                          <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-left border-b border-g200">Description</th>
                                          <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-left border-b border-g200">Material</th>
                                          <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-center border-b border-g200 w-12">Qty</th>
                                          <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-center border-b border-g200 w-12">UOM</th>
                                          <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-right border-b border-g200">Unit Rate</th>
                                          <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-center border-b border-g200 w-12">GST%</th>
                                          <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-right border-b border-g200">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(q.items ?? []).map((item, i) => (
                                          <tr key={i} className="hover:bg-g50/50">
                                            <td className="px-2.5 py-1.5 border-b border-g100 font-mono text-g400">{i + 1}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-blk">{item.desc || <span className="text-g300 italic">—</span>}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-g500">{item.mat || '—'}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-center font-mono text-blk">{item.qty}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-center text-g500">{item.uom}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-right font-mono text-blk">{formatINR(item.unitPrice ?? 0)}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-center font-mono text-g500">{item.gst ?? 0}%</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-right font-mono font-semibold text-blk">{formatINR(item.total ?? 0)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="flex justify-end gap-5 items-center pt-2">
                                    <span className="text-[10px] text-g600">Sub-Total: <strong className="text-blk font-bold font-mono">{formatINR(subTotal)}</strong></span>
                                    <span className="text-[10px] text-g600">GST: <strong className="text-blk font-bold font-mono">{formatINR(gstTotal)}</strong></span>
                                    <span className="text-[11px] text-red-mrt font-bold font-mono tracking-tight">Grand: {formatINR(grandTotal)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
          <div className="px-4 py-3 border-b border-g200">
            <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-g400">Activity Timeline</span>
          </div>
          {timeline.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-g400 italic">No follow-up activity logged</div>
          ) : (
            <div className="px-4 py-3 space-y-3">
              {timeline.map((t, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-g100 flex items-center justify-center shrink-0">
                      {CHANNEL_ICON[t.channel] ?? <MessageCircle size={11} className="text-g400" />}
                    </div>
                    {i < timeline.length - 1 && <div className="w-px flex-1 bg-g200 mt-1" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11.5px] font-semibold text-blk">{t.channel}</span>
                      <span className="text-[9px] text-g400 font-mono">{t.quoteId}</span>
                    </div>
                    <div className="text-[11px] text-g500 mt-0.5">{t.note}</div>
                    <div className="text-[9.5px] text-g400 mt-1">{t.who} · {t.ts ? fmtIST(new Date(t.ts), 'dd-MMM-yyyy, HH:mm') : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = 'pipeline' | 'winrate' | 'enqs';
type BoardView = 'customers' | 'quotations';

export function IntelligenceBoard() {
  const { data } = useAppStore();
  const pin = data.settings?.intelligence_pin ?? '';
  const [searchParams] = useSearchParams();
  const custParam = searchParams.get('customer') ?? '';

  const [unlocked, setUnlocked] = useState(() =>
    !pin || sessionStorage.getItem('intel_unlocked') === '1'
  );
  // If navigated from dashboard with ?customer=X, open All Quotations pre-filtered
  const [boardView, setBoardView] = useState<BoardView>(custParam ? 'quotations' : 'customers');
  const [quotationSearch, setQuotationSearch] = useState(custParam);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('pipeline');
  const [selId, setSelId] = useState<string | null>(null);

  const allStats = useCustomerStats(data.customers, data.enquiries, data.quotes, data.orders);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allStats
      .filter(s => !q || s.customer.name.toLowerCase().includes(q) || (s.customer.seg ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortKey === 'pipeline') return b.pipeline - a.pipeline;
        if (sortKey === 'winrate')  return b.winRate - a.winRate;
        return b.enqs.length - a.enqs.length;
      });
  }, [allStats, search, sortKey]);

  // Auto-select first on load or when filter changes
  useEffect(() => {
    if (filtered.length && !filtered.find(s => s.customer.id === selId)) {
      setSelId(filtered[0].customer.id);
    }
  }, [filtered]);

  // Sync ?customer= param changes (e.g. back/forward nav)
  useEffect(() => {
    if (custParam) {
      setBoardView('quotations');
      setQuotationSearch(custParam);
    }
  }, [custParam]);

  const selectedStats = filtered.find(s => s.customer.id === selId) ?? filtered[0] ?? null;

  const handleUnlock = () => {
    sessionStorage.setItem('intel_unlocked', '1');
    setUnlocked(true);
  };

  if (!unlocked) {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-300">
        <PinGate correctPin={pin} onUnlock={handleUnlock} title="Customer Intel Board" />
      </div>
    );
  }

  const SORTS: { key: SortKey; label: string }[] = [
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'winrate',  label: 'Win Rate' },
    { key: 'enqs',     label: 'Enquiries' },
  ];

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Page header */}
      <div className="px-5 pt-4 pb-3 border-b border-g200 bg-white shrink-0 flex items-end justify-between">
        <div>
          <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-0.5">Analytics</div>
          <h1 className="font-serif text-[20px] text-blk tracking-tight leading-tight">
            Customer <em className="italic text-red-mrt">Intel Board</em>
          </h1>
        </div>
        {/* View toggle */}
        <div className="flex gap-0.5 bg-g100 rounded-[3px] p-0.5 mb-0.5">
          {([['customers', 'By Customer'], ['quotations', 'All Quotations']] as [BoardView, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setBoardView(v)}
              className={cn(
                'px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded-[2px] transition-colors',
                boardView === v ? 'bg-white text-blk shadow-sm' : 'text-g500 hover:text-blk'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* All Quotations view */}
      {boardView === 'quotations' && (
        <AllQuotationsView quotes={data.quotes} customers={data.customers} initialSearch={quotationSearch} />
      )}

      {/* Two-panel board — Customer view */}
      {boardView === 'customers' && <div className="flex flex-1 overflow-hidden">

        {/* ── Left: ranked customer list ── */}
        <div className="w-[300px] min-w-[300px] bg-white border-r border-g200 flex flex-col">
          {/* Sort pills */}
          <div className="px-3 pt-3 pb-2 border-b border-g200">
            <div className="text-[8.5px] font-bold tracking-[1.5px] uppercase text-g400 mb-2">Sort by</div>
            <div className="flex gap-1.5">
              {SORTS.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSortKey(s.key)}
                  className={cn(
                    'text-[10px] px-2.5 py-1 rounded-full border transition-colors',
                    sortKey === s.key
                      ? 'bg-g800 text-white border-g800 font-semibold'
                      : 'bg-white text-g500 border-g200 hover:border-g400'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {/* Search */}
          <div className="px-3 py-2 border-b border-g200">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customers…"
              className="w-full text-[11.5px] bg-g50 border border-g200 rounded-[3px] px-2.5 py-1.5 outline-none focus:border-g400 placeholder:text-g400"
            />
          </div>
          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.map(s => {
              const isSel = s.customer.id === selId;
              return (
                <button
                  key={s.customer.id}
                  type="button"
                  onClick={() => setSelId(s.customer.id)}
                  className={cn(
                    'w-full text-left px-3 py-3 border-b border-g100 transition-colors relative',
                    isSel ? 'bg-blue-50' : 'hover:bg-g50'
                  )}
                >
                  {isSel && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-500 rounded-r-sm" />}
                  {/* Row 1: name */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <InitialAvatar name={s.customer.name} size="sm" />
                    <span className={cn('text-[12.5px] font-semibold truncate leading-tight', isSel ? 'text-blue-700' : 'text-blk')}>
                      {s.customer.name}
                    </span>
                  </div>
                  {/* Row 2: segment · pipeline · win-rate */}
                  <div className="flex items-center gap-2 pl-8">
                    {s.customer.seg && (
                      <span className="text-[10px] text-g400 truncate flex-1">{s.customer.seg}</span>
                    )}
                    <span className={cn('text-[11px] font-mono font-bold shrink-0', isSel ? 'text-blue-600' : 'text-g700')}>
                      {fVal(s.pipeline)}
                    </span>
                    <WrBadge pct={s.winRate} />
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-[12px] text-g400 italic">No customers match</div>
            )}
          </div>
        </div>

        {/* ── Right: detail ── */}
        {selectedStats ? (
          <CustomerDetail stats={selectedStats} allFollowups={data.followups} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-[13px] text-g400">
            Select a customer to view analytics
          </div>
        )}
      </div>}
    </div>
  );
}

// ── All Quotations view ───────────────────────────────────────────────────────

function AllQuotationsView({
  quotes,
  customers,
  initialSearch = '',
}: {
  quotes: Quote[];
  customers: Customer[];
  initialSearch?: string;
}) {
  const navigate = useNavigate();
  const { data, openAttachmentModal } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [search, setSearch] = useState(initialSearch);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [bulkFormSiteAQ, setBulkFormSiteAQ] = useState<string | null>(null);

  // If caller changes initialSearch (e.g. dashboard click), sync it in
  const prevInitial = React.useRef(initialSearch);
  React.useEffect(() => {
    if (initialSearch !== prevInitial.current) {
      prevInitial.current = initialSearch;
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return quotes
      .filter(qt => !q || qt.cust.toLowerCase().includes(q) || qt.id.toLowerCase().includes(q))
      .filter(qt => statusFilter === 'All' || qt.status === statusFilter)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [quotes, search, statusFilter]);

  // Group by customer, then by site within each customer
  const groups = useMemo(() => {
    const custMap = new Map<string, Quote[]>();
    for (const qt of filtered) {
      const existing = custMap.get(qt.cust);
      if (existing) existing.push(qt);
      else custMap.set(qt.cust, [qt]);
    }
    return Array.from(custMap.entries())
      .map(([cust, qs]) => {
        const custRec = customers.find(c => c.name === cust);
        const siteMap = new Map<string, { siteKey: string; siteName: string; siteCity: string; quotes: Quote[] }>();
        for (const q of qs) {
          const site = q.siteId ? custRec?.sites?.find(s => s.id === q.siteId) : null;
          const key = site?.id ?? '__general__';
          const name = site?.name ?? (custRec?.sites?.find(s => s.isPrimary)?.name ?? 'Head Office / General');
          const city = site?.city ?? (custRec?.sites?.find(s => s.isPrimary)?.city ?? '');
          if (!siteMap.has(key)) siteMap.set(key, { siteKey: key, siteName: name, siteCity: city, quotes: [] });
          siteMap.get(key)!.quotes.push(q);
        }
        return { cust, custRec, siteGroups: [...siteMap.values()] };
      })
      .sort((a, b) => a.cust.localeCompare(b.cust));
  }, [filtered, customers]);

  const toggleSite = (key: string) =>
    setExpandedSites(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const totalQuotes = groups.reduce((s, g) => s + g.siteGroups.reduce((ss, sg) => ss + sg.quotes.length, 0), 0);

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-cream">
      {/* Toolbar */}
      <div className="bg-white border-b border-g200 px-5 py-2.5 flex items-center gap-3 shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customer or quote…"
          className="w-60 text-[11.5px] bg-g50 border border-g200 rounded-[3px] px-2.5 py-1.5 outline-none focus:border-g400 placeholder:text-g400"
        />
        <div className="flex gap-1">
          {['All', 'Draft', 'Sent', 'Won', 'Lost', 'Parked'].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded-full border transition-colors',
                statusFilter === s
                  ? 'bg-g800 text-white border-g800'
                  : 'bg-white text-g500 border-g200 hover:border-g400'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-g400 font-mono">{totalQuotes} quotes · {groups.length} customers</span>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {groups.length === 0 && (
          <div className="text-center py-16 text-[13px] text-g400 italic">No quotations match</div>
        )}
        {groups.map(({ cust, custRec, siteGroups }) => {
          const primarySite = custRec?.sites?.find(s => s.isPrimary) ?? custRec?.sites?.[0];
          const cityLabel = primarySite?.city ?? primarySite?.state ?? '';
          const totalValue = siteGroups.reduce((s, sg) => s + sg.quotes.reduce((ss, q) => {
            const sub = (q.items ?? []).reduce((a, i) => a + (i.total ?? 0), 0);
            const gst = (q.items ?? []).reduce((a, i) => a + ((i.total ?? 0) * ((i.gst ?? 0) / 100)), 0);
            return ss + sub + gst;
          }, 0), 0);
          const allQuotes = siteGroups.flatMap(sg => sg.quotes);
          const wonCount = allQuotes.filter(q => q.status === 'Won').length;
          const openCount = allQuotes.filter(q => q.status === 'Sent').length;

          return (
            <div key={cust} className="bg-white border border-g200 rounded-[4px] overflow-hidden">
              {/* Customer header */}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-g50 border-b border-g200">
                <InitialAvatar name={cust} size="sm" />
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-blk leading-tight">{cust}</span>
                  {cityLabel && (
                    <span className="flex items-center gap-1 text-[10px] text-g400 shrink-0">
                      <MapPin size={9} className="shrink-0" />{cityLabel}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-right">
                  {openCount > 0 && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {openCount} open
                    </span>
                  )}
                  <div className="text-[10px] text-g400">{allQuotes.length} quote{allQuotes.length !== 1 ? 's' : ''} · {wonCount} won</div>
                  <div className="font-mono text-[12px] font-bold text-blk">{fVal(totalValue)}</div>
                </div>
              </div>

              {/* Site groups within customer */}
              <div className="divide-y divide-g100">
                {siteGroups.map(group => {
                  const siteKey = `${cust}__${group.siteKey}`;
                  const isSiteOpen = expandedSites.has(siteKey);
                  const groupTotal = group.quotes.reduce((s, q) => {
                    const sub = (q.items ?? []).reduce((a, i) => a + (i.total ?? 0), 0);
                    const gst = (q.items ?? []).reduce((a, i) => a + ((i.total ?? 0) * ((i.gst ?? 0) / 100)), 0);
                    return s + sub + gst;
                  }, 0);
                  const siteOpenCount = group.quotes.filter(q => q.status === 'Sent').length;

                  return (
                    <div key={group.siteKey}>
                      {/* Site/branch row */}
                      <button
                        type="button"
                        onClick={() => toggleSite(siteKey)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left cursor-pointer',
                          isSiteOpen ? 'bg-indigo-50' : 'hover:bg-indigo-50/60'
                        )}
                      >
                        <ChevronRight size={12} className={cn('text-indigo-400 shrink-0 transition-transform duration-200', isSiteOpen && 'rotate-90')} />
                        <MapPin size={11} className="text-indigo-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-semibold text-g700">{group.siteName}</span>
                          {group.siteCity && <span className="text-[10px] text-g400 ml-1.5">{group.siteCity}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {siteOpenCount > 0 && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              {siteOpenCount} open
                            </span>
                          )}
                          <span className="text-[10px] text-g400">{group.quotes.length} quote{group.quotes.length !== 1 ? 's' : ''}</span>
                          <span className="text-[11px] font-semibold text-blk">{fVal(groupTotal)}</span>
                          {group.quotes.length >= 1 && (
                            <button
                              type="button"
                              title="Log follow-up for all quotes at this site"
                              onClick={e => { e.stopPropagation(); setBulkFormSiteAQ(bulkFormSiteAQ === siteKey ? null : siteKey); }}
                              className={cn(
                                'h-5 inline-flex items-center gap-1 px-2 rounded-full border text-[9px] font-semibold transition-colors',
                                bulkFormSiteAQ === siteKey
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-indigo-600 border-indigo-300 hover:bg-indigo-50'
                              )}
                            >
                              + Log All
                            </button>
                          )}
                        </div>
                      </button>

                      {bulkFormSiteAQ === siteKey && (
                        <BulkFollowUpForm
                          quoteIds={group.quotes.map(q => q.id)}
                          siteName={group.siteName}
                          onClose={() => setBulkFormSiteAQ(null)}
                        />
                      )}

                      {/* Expanded quote rows */}
                      {isSiteOpen && (
                        <div className="divide-y divide-g100 bg-g50/30">
                          {group.quotes.map(q => {
                            const subTotal = (q.items ?? []).reduce((s, i) => s + (i.total ?? 0), 0);
                            const gstTotal = (q.items ?? []).reduce((s, i) => s + ((i.total ?? 0) * ((i.gst ?? 0) / 100)), 0);
                            const grand = subTotal + gstTotal;
                            const desc = (q.items ?? [])[0]?.desc ?? '';
                            const isExpanded = expandedQuote === q.id;

                            return (
                              <div key={q.id}>
                                <button
                                  type="button"
                                  title={`Toggle ${q.id}`}
                                  onClick={() => setExpandedQuote(isExpanded ? null : q.id)}
                                  className={cn(
                                    'w-full flex items-center gap-3 pl-9 pr-4 py-2 transition-colors text-left cursor-pointer',
                                    isExpanded ? 'bg-blue-50' : 'hover:bg-blue-50'
                                  )}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[q.status] ?? 'bg-g300'}`} />
                                  <span className="font-mono text-[10px] font-semibold text-g600 w-28 shrink-0">{q.id}</span>
                                  <span className="text-[11px] text-g500 flex-1 truncate min-w-0">{desc || '—'}</span>
                                  <span className="font-mono text-[11px] font-semibold text-blk whitespace-nowrap shrink-0">{fVal(grand)}</span>
                                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_BADGE[q.status] ?? STATUS_BADGE.Draft}`}>{q.status}</span>
                                  <span className="text-[10px] text-g400 shrink-0 whitespace-nowrap">{q.date ? fmtIST(new Date(q.date), 'dd-MMM-yy') : '—'}</span>
                                  <ChevronRight size={12} className={cn('text-g300 shrink-0 transition-transform duration-200', isExpanded && 'rotate-90')} />
                                </button>

                                {isExpanded && (
                                  <div className="bg-blue-50/30 border-t border-blue-100 px-4 py-3">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-blue-600">Line Items — {q.id}</span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          title="Download Quote PDF"
                                          onClick={() => {
                                            const cust2 = data.customers.find(x => x.name === q.cust);
                                            const unit = q.unitId ? data.units.find(u => u.id === q.unitId) : data.units.find(u => u.is_default);
                                            const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
                                            const sig = unitSig ?? data.signatories.find((s: any) => s.is_default);
                                            generateQuotePDF(q, cust2, data.settings, sig, true, unit);
                                          }}
                                          className="h-6 inline-flex items-center gap-1 px-2 border border-g200 bg-white rounded-[3px] text-[9px] font-medium text-g600 hover:bg-g50 transition-colors"
                                        >
                                          <FileText size={9} /> PDF
                                        </button>
                                        <button
                                          type="button"
                                          title="View quote documents"
                                          onClick={() => openAttachmentModal('quote', q.id)}
                                          className="h-6 inline-flex items-center gap-1 px-2 border border-g200 bg-white rounded-[3px] text-[9px] font-medium text-g600 hover:bg-g50 transition-colors"
                                        >
                                          <Paperclip size={9} /> Docs
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => navigate(`/quotes/new?id=${q.id}`)}
                                          title="Edit quote"
                                          className="h-6 inline-flex items-center gap-1 px-2 border border-g200 bg-white rounded-[3px] text-[9px] font-medium text-g600 hover:bg-g50 transition-colors"
                                        >
                                          <ExternalLink size={9} /> Edit
                                        </button>
                                      </div>
                                    </div>
                                    <div className="bg-white border border-g200 rounded-[3px] overflow-x-auto">
                                      <table className="w-full border-collapse text-[11px]">
                                        <thead className="bg-g100">
                                          <tr>
                                            <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-left border-b border-g200 w-6">#</th>
                                            <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-left border-b border-g200">Description</th>
                                            <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-left border-b border-g200">Material</th>
                                            <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-center border-b border-g200 w-12">Qty</th>
                                            <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-center border-b border-g200 w-12">UOM</th>
                                            <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-right border-b border-g200">Unit Rate</th>
                                            <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-center border-b border-g200 w-12">GST%</th>
                                            <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2.5 py-1.5 text-right border-b border-g200">Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(q.items ?? []).map((item, idx) => (
                                            <tr key={idx} className="hover:bg-g50/50">
                                              <td className="px-2.5 py-1.5 border-b border-g100 font-mono text-g400">{idx + 1}</td>
                                              <td className="px-2.5 py-1.5 border-b border-g100 text-blk">{item.desc || <span className="text-g300 italic">—</span>}</td>
                                              <td className="px-2.5 py-1.5 border-b border-g100 text-g500">{item.mat || '—'}</td>
                                              <td className="px-2.5 py-1.5 border-b border-g100 text-center font-mono text-blk">{item.qty}</td>
                                              <td className="px-2.5 py-1.5 border-b border-g100 text-center text-g500">{item.uom}</td>
                                              <td className="px-2.5 py-1.5 border-b border-g100 text-right font-mono text-blk">{formatINR(item.unitPrice ?? 0)}</td>
                                              <td className="px-2.5 py-1.5 border-b border-g100 text-center font-mono text-g500">{item.gst ?? 0}%</td>
                                              <td className="px-2.5 py-1.5 border-b border-g100 text-right font-mono font-semibold text-blk">{formatINR(item.total ?? 0)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="flex justify-end gap-5 items-center pt-2">
                                      <span className="text-[10px] text-g600">Sub-Total: <strong className="text-blk font-bold font-mono">{formatINR(subTotal)}</strong></span>
                                      <span className="text-[10px] text-g600">GST: <strong className="text-blk font-bold font-mono">{formatINR(gstTotal)}</strong></span>
                                      <span className="text-[11px] text-red-mrt font-bold font-mono tracking-tight">Grand: {formatINR(grand)}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}