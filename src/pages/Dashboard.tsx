import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store';
import { formatINR, cn, getThisWeekRange, localDateStr, siteLabel, fmtIST } from '../lib/utils';
import { Badge, Button } from '../components/ui';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, IndianRupee, FileSignature, Trophy, Activity, Phone, Mail, MessageSquare, Users, FileText, ShoppingBag, AlertCircle, CalendarClock, TrendingUp, ChevronDown, ChevronRight, Calendar, ChevronLeft } from 'lucide-react';

type Period = '30d' | 'quarter' | 'year';
type DashTab = 'overview' | 'this-week' | 'calendar';

type CalendarEventType = 'followup' | 'overdue-enq' | 'order-dlv' | 'quote-pending';

type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  label: string;
  sublabel: string;
  contact?: string;
  color: 'purple' | 'red' | 'teal' | 'orange';
  onClick: () => void;
};

type CalendarDayMap = Record<string, CalendarEvent[]>;

type ActivityItem = {
  ts: string;
  type: 'enquiry' | 'quote' | 'order' | 'followup';
  who: string;
  title: string;
  subtitle: string;
  refId: string;
  refType: string;
};

function getOffsetWeekRange(offset: number) {
  const { start: baseStart } = getThisWeekRange();
  const start = new Date(baseStart);
  start.setDate(start.getDate() + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return { start, end, days };
}

function dateKey(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function Dashboard() {
  // @ts-ignore - Assuming globalDateRange is added to the store
  const { data, openDetailPanel, user, globalDateRange, activeDoer } = useAppStore();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('30d');
  const [activeTab, setActiveTab] = useState<DashTab>('overview');
  const [expandedMdo, setExpandedMdo] = useState<Record<string, boolean>>({});
  const [calendarWeekOffset, setCalendarWeekOffset] = useState<number>(0);
  // "Show next" paging for the Needs Attention & Open Quote Value panels.
  const [attnPage, setAttnPage] = useState(0);
  const [openCustPage, setOpenCustPage] = useState(0);

  // Rotating sub-text index for KPI cards: 0=current, 1=vs last week, 2=vs last month. Ticks every 15s.
  const [kpiSubIdx, setKpiSubIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setKpiSubIdx(i => (i + 1) % 3), 15000);
    return () => clearInterval(t);
  }, []);

  const userName = user?.email ? user.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ') : 'User';
  const formattedName = userName.charAt(0).toUpperCase() + userName.slice(1);

  const openEnqs = data.enquiries.filter(e => e.status === 'New' || e.status === 'In Review');
  const attnEnqs = openEnqs.filter(e => e.ageH >= 4);

  const openQuotes = data.quotes.filter(q => q.status === 'Sent');

  const openPipeVal = openQuotes.reduce((acc, q) => {
    const sub = q.items.reduce((s, i) => s + i.total, 0);
    const gst = q.items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
    return acc + sub + gst;
  }, 0);


  const openQuoteString = openQuotes.length > 0
    ? `${openQuotes.length} quotes awaiting PO`
    : 'No sent quotes';

  // Avg E2Q: diff quote.date − enquiry.recv for enquiries that have a linked quote
  const e2qSamples: number[] = [];
  for (const enq of data.enquiries) {
    if (!enq.qRef) continue;
    const quote = data.quotes.find(q => q.id === enq.qRef);
    if (!quote?.date || !enq.recv) continue;
    const diffH = (new Date(quote.date).getTime() - new Date(enq.recv).getTime()) / 3_600_000;
    if (diffH >= 0) e2qSamples.push(diffH);
  }
  const avgE2Q = e2qSamples.length
    ? (e2qSamples.reduce((a, b) => a + b, 0) / e2qSamples.length).toFixed(1)
    : null;

  const now = Date.now();

  // Period window in ms — drives the "current period" filter used for KPI values.
  const periodMs = period === '30d' ? 30 * 24 * 3600 * 1000
    : period === 'quarter' ? 91 * 24 * 3600 * 1000
    : 365 * 24 * 3600 * 1000;

  const isWithinCurrentPeriod = (dateString?: string | null) => {
    if (!dateString) return false;
    const d = new Date(dateString).getTime();
    if (globalDateRange?.startDate && d < new Date(globalDateRange.startDate).getTime()) return false;
    if (globalDateRange?.endDate && d > new Date(globalDateRange.endDate).getTime() + 86400000) return false;
    if (!globalDateRange?.startDate && !globalDateRange?.endDate) return (now - d) <= periodMs;
    return true;
  };

  // A quote counts as "sent" once it has left Draft — i.e. it reached the
  // customer. Won/Lost quotes were necessarily sent first, so they're included;
  // Draft/Parked are not. This keeps "Quotes Sent" consistent with the pipeline
  // (Sent + Won + Lost) instead of counting unsent drafts.
  const wasSent = (q: { status: string }) => q.status === 'Sent' || q.status === 'Won' || q.status === 'Lost';

  // Quotes in current period — kept for display values; trends are now shown via rotating sub-text.
  const quotesInPeriod = data.quotes.filter(q => isWithinCurrentPeriod(q.date));
  // Subset that has actually been sent — drives the "Quotes Sent" KPI and all derived metrics.
  // Draft/Parked quotes are excluded: they haven't reached the customer so they shouldn't
  // inflate value or dilute conversion rate.
  const sentQuotesInPeriod = quotesInPeriod.filter(wasSent);
  const quoteValInPeriod = sentQuotesInPeriod.reduce((acc, q) => acc + q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0), 0);
  const wonQuotesInPeriod = sentQuotesInPeriod.filter(q => q.status === 'Won');
  // Q→O denominator = sent quotes (Sent + Won + Lost), not all quotes including unsent drafts.
  const q2oRate = sentQuotesInPeriod.length ? Math.round((wonQuotesInPeriod.length / sentQuotesInPeriod.length) * 100) : 0;

  // ── Rolling 7d / 30d windows for sub-text rotation ─────────────────────────
  // "Current" = last 7d (or 30d); "prev" = the 7d (or 30d) before that.
  const DAY = 86_400_000;
  const inLast = (dateString: string | null | undefined, days: number) => {
    if (!dateString) return false;
    const age = now - new Date(dateString).getTime();
    return age >= 0 && age <= days * DAY;
  };
  const inPrevWindow = (dateString: string | null | undefined, days: number) => {
    if (!dateString) return false;
    const age = now - new Date(dateString).getTime();
    return age > days * DAY && age <= 2 * days * DAY;
  };

  // Helper: build the rotating 3-entry sub array for a card.
  // Each entry: { text, dir } where dir = 'up' | 'dn' | 'neutral' | null (for plain text).
  // inverse=true → lower is better (e.g. avg E2Q hours), so a negative delta is "up".
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const dirOf = (n: number, inverse = false): 'up' | 'dn' | 'neutral' => {
    if (n === 0) return 'neutral';
    if (inverse) return n < 0 ? 'up' : 'dn';
    return n > 0 ? 'up' : 'dn';
  };
  type SubEntry = { text: string; dir?: 'up' | 'dn' | 'neutral' | null };
  const buildSub = (base: string, weekDelta: number | null, monthDelta: number | null, label: string, inverse = false): SubEntry[] => [
    { text: base, dir: null },
    weekDelta === null
      ? { text: `vs last week — no data`, dir: 'neutral' }
      : { text: `${signed(weekDelta)} ${label} vs last week`, dir: dirOf(weekDelta, inverse) },
    monthDelta === null
      ? { text: `vs last month — no data`, dir: 'neutral' }
      : { text: `${signed(monthDelta)} ${label} vs last month`, dir: dirOf(monthDelta, inverse) },
  ];

  // ── Per-KPI week / month deltas ────────────────────────────────────────────
  // Quotes sent
  const quotesLast7  = data.quotes.filter(q => wasSent(q) && inLast(q.date, 7)).length;
  const quotesPrev7  = data.quotes.filter(q => wasSent(q) && inPrevWindow(q.date, 7)).length;
  const quotesLast30 = data.quotes.filter(q => wasSent(q) && inLast(q.date, 30)).length;
  const quotesPrev30 = data.quotes.filter(q => wasSent(q) && inPrevWindow(q.date, 30)).length;
  const quotesSentWeekDelta  = quotesLast7  - quotesPrev7;
  const quotesSentMonthDelta = quotesLast30 - quotesPrev30;

  // Quote value (in lakhs, 1 decimal)
  const sumQuoteVal = (qs: typeof data.quotes) =>
    qs.reduce((acc, q) => acc + q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0), 0);
  const qvLast7  = sumQuoteVal(data.quotes.filter(q => wasSent(q) && inLast(q.date, 7)));
  const qvPrev7  = sumQuoteVal(data.quotes.filter(q => wasSent(q) && inPrevWindow(q.date, 7)));
  const qvLast30 = sumQuoteVal(data.quotes.filter(q => wasSent(q) && inLast(q.date, 30)));
  const qvPrev30 = sumQuoteVal(data.quotes.filter(q => wasSent(q) && inPrevWindow(q.date, 30)));
  const inLakhs = (v: number) => +(v / 100_000).toFixed(1);
  const quoteValWeekDelta  = inLakhs(qvLast7  - qvPrev7);
  const quoteValMonthDelta = inLakhs(qvLast30 - qvPrev30);

  // Q→O conversion rate (percentage points) — denominator is sent quotes only (Sent+Won+Lost).
  const ratePctPts = (qs: typeof data.quotes): number | null => {
    const sent = qs.filter(wasSent);
    if (sent.length === 0) return null;
    return Math.round((sent.filter(q => q.status === 'Won').length / sent.length) * 100);
  };
  const r7  = ratePctPts(data.quotes.filter(q => inLast(q.date, 7)));
  const rp7 = ratePctPts(data.quotes.filter(q => inPrevWindow(q.date, 7)));
  const r30 = ratePctPts(data.quotes.filter(q => inLast(q.date, 30)));
  const rp30= ratePctPts(data.quotes.filter(q => inPrevWindow(q.date, 30)));
  const q2oWeekDelta  = r7  !== null && rp7  !== null ? r7  - rp7  : null;
  const q2oMonthDelta = r30 !== null && rp30 !== null ? r30 - rp30 : null;

  // E2Q average (hours). Compare by avg in window. Inverse: lower is better.
  const avgE2QIn = (predicate: (d: string | null | undefined) => boolean): number | null => {
    const samples: number[] = [];
    for (const enq of data.enquiries) {
      if (!enq.qRef) continue;
      const quote = data.quotes.find(q => q.id === enq.qRef);
      if (!quote?.date || !enq.recv) continue;
      if (!predicate(quote.date)) continue;
      const diffH = (new Date(quote.date).getTime() - new Date(enq.recv).getTime()) / 3_600_000;
      if (diffH >= 0) samples.push(diffH);
    }
    return samples.length ? +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(1) : null;
  };
  const e7  = avgE2QIn(d => inLast(d, 7));
  const ep7 = avgE2QIn(d => inPrevWindow(d, 7));
  const e30 = avgE2QIn(d => inLast(d, 30));
  const ep30= avgE2QIn(d => inPrevWindow(d, 30));
  const e2qWeekDelta  = e7  !== null && ep7  !== null ? +(e7  - ep7 ).toFixed(1) : null;
  const e2qMonthDelta = e30 !== null && ep30 !== null ? +(e30 - ep30).toFixed(1) : null;

  // Open pipeline = current snapshot of open quotes; no historical comparison meaningful here.
  // Use change in open quote count vs same time 7/30 days ago = open quotes whose date is older than the window cutoff.
  const openPipeWeekDelta  = openQuotes.filter(q => inLast(q.date, 7)).length;
  const openPipeMonthDelta = openQuotes.filter(q => inLast(q.date, 30)).length;

  const today = new Date();
  const formattedDate = fmtIST(today, 'EEE, dd-MMM-yyyy');

  const AgeCell = ({ hours }: { hours: number }) => {
    let color = "text-[#059669]";
    let dot = "bg-[#059669]";
    let text = `${hours.toFixed(1)}h`;
    if (hours < 0.1) text = "Now";
    else if (hours >= 24) {
      color = "text-red-mrt";
      dot = "bg-red-mrt animate-pulse";
      text = `${Math.floor(hours/24)}d ${Math.round(hours%24)}h`;
    } else if (hours >= 4) {
      color = "text-[#d97706]";
      dot = "bg-[#d97706]";
      text = `${Math.round(hours)}h`;
    }
    return (
      <div className={`flex items-center gap-1.5 font-mono text-[10.5px] font-bold ${color}`}>
        <div className={`w-[7px] h-[7px] rounded-full ${dot}`}></div>
        {text}
      </div>
    );
  };

  // Enquiry Sources for pie chart
  const sourceColors = ['#D42027', '#2563EB', '#059669', '#d97706', '#7C3AED'];
  const sources = ['Email', 'Phone', 'WhatsApp', 'Exhibition', 'Website'];
  const sourceCounts = sources.map((src, i) => ({
    src,
    count: data.enquiries.filter(e => e.src === src).length,
    color: sourceColors[i],
  })).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  const totalSources = sourceCounts.reduce((s, c) => s + c.count, 0);

  // Open Quote Value By Customer
  const custQuotes: Record<string, number> = {};
  openQuotes.forEach(q => {
    custQuotes[q.cust] = (custQuotes[q.cust] || 0) + q.items.reduce((acc, i) => acc + i.total + (i.total * i.gst / 100), 0);
  });
  const openCustDataAll = Object.entries(custQuotes)
    .map(([cust, val]) => ({ cust, val }))
    .sort((a, b) => b.val - a.val);
  const maxOpenCustVal = Math.max(...openCustDataAll.map(c => c.val), 1);
  // Page through 5 at a time; bar width stays relative to the overall max.
  const OPEN_CUST_PAGE = 5;
  const openCustData = openCustDataAll.slice(openCustPage * OPEN_CUST_PAGE, openCustPage * OPEN_CUST_PAGE + OPEN_CUST_PAGE);

  // ── Real-time tips derived from live data ─────────────────────────────────
  const SLA_H_TIPS: Record<string, number> = { Hot: 4, Urgent: 24, Normal: 48, Low: 72 };

  const e2qTips = useMemo((): string[] => {
    const tips: string[] = [];
    const unquoted = data.enquiries.filter(e => !e.qRef && (e.status === 'New' || e.status === 'In Review'));
    if (unquoted.length > 0) {
      const oldest = unquoted.reduce((a, b) => (a.ageH > b.ageH ? a : b));
      const age = oldest.ageH >= 24 ? `${Math.floor(oldest.ageH / 24)}d ${Math.round(oldest.ageH % 24)}h` : `${oldest.ageH.toFixed(0)}h`;
      tips.push(`${unquoted.length} open enq${unquoted.length === 1 ? 'uiry' : 'uiries'} still unquoted — oldest is ${oldest.cust} at ${age}`);
    }
    const slaBreached = data.enquiries.filter(e => !e.qRef && (e.status === 'New' || e.status === 'In Review') && e.ageH > (SLA_H_TIPS[e.urg] ?? 48));
    if (slaBreached.length > 0)
      tips.push(`${slaBreached.length} enq${slaBreached.length === 1 ? 'uiry' : 'uiries'} past SLA target — quote immediately`);
    const custE2q: Record<string, number[]> = {};
    for (const enq of data.enquiries) {
      if (!enq.qRef || !enq.recv) continue;
      const quote = data.quotes.find(q => q.id === enq.qRef);
      if (!quote?.date) continue;
      const h = (new Date(quote.date).getTime() - new Date(enq.recv).getTime()) / 3_600_000;
      if (h < 0) continue;
      if (!custE2q[enq.cust]) custE2q[enq.cust] = [];
      custE2q[enq.cust].push(h);
    }
    const custAvgs = Object.entries(custE2q)
      .map(([c, hs]) => ({ c, avg: hs.reduce((a, b) => a + b, 0) / hs.length }))
      .sort((a, b) => b.avg - a.avg);
    if (custAvgs.length > 0 && custAvgs[0].avg > 24)
      tips.push(`Slowest to quote: ${custAvgs[0].c} avg ${custAvgs[0].avg.toFixed(1)}h — prioritise their next enquiry`);
    if (tips.length === 0)
      tips.push(`Current avg ${avgE2Q}h — target under 24h for all urgency levels`);
    return tips.slice(0, 3);
  }, [data.enquiries, data.quotes, avgE2Q]);

  const pipelineTips = useMemo((): string[] => {
    const tips: string[] = [];
    const stale7 = openQuotes.filter(q => !inLast(q.date, 7));
    if (stale7.length > 0)
      tips.push(`${stale7.length} quote${stale7.length === 1 ? '' : 's'} sent over 7 days ago with no PO — follow up today`);
    const noFollowup = openQuotes.filter(q => {
      const fu = data.followups.find(f => f.quote_id === q.id);
      return !fu || !fu.logs || fu.logs.length === 0;
    });
    if (noFollowup.length > 0)
      tips.push(`${noFollowup.length} sent quote${noFollowup.length === 1 ? '' : 's'} with zero follow-up logged`);
    const biggestOpen = openQuotes.reduce((best, q) => {
      const v = q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0);
      return v > best.v ? { q, v } : best;
    }, { q: null as typeof openQuotes[0] | null, v: 0 });
    if (biggestOpen.q && biggestOpen.v > 0)
      tips.push(`Biggest open quote: ${biggestOpen.q.cust} — ${formatINR(biggestOpen.v)} — call them first`);
    if (tips.length === 0)
      tips.push(`Pipeline healthy at ${formatINR(openPipeVal)} across ${openQuotes.length} quotes`);
    return tips.slice(0, 3);
  }, [openQuotes, data.followups, openPipeVal]);

  const q2oTips = useMemo((): string[] => {
    const tips: string[] = [];
    const lostQt = data.quotes.filter(q => q.status === 'Lost');
    if (lostQt.length > 0) {
      const lostVal = lostQt.reduce((s, q) => s + q.items.reduce((a, i) => a + i.total + (i.total * i.gst / 100), 0), 0);
      tips.push(`${lostQt.length} lost quote${lostQt.length === 1 ? '' : 's'} worth ${formatINR(lostVal)} — review for pricing patterns`);
    }
    const draftCount = data.quotes.filter(q => q.status === 'Draft').length;
    if (draftCount > 0)
      tips.push(`${draftCount} draft quote${draftCount === 1 ? '' : 's'} never sent — send or discard to keep rate accurate`);
    if (q2oRate < 20 && quotesInPeriod.length > 3)
      tips.push(`${q2oRate}% conversion is below 20% — schedule follow-ups within 24h of sending`);
    else if (q2oRate >= 50)
      tips.push(`Strong ${q2oRate}% conversion — keep following up quickly after sending`);
    if (tips.length === 0)
      tips.push(`${wonQuotesInPeriod.length} wins from ${quotesInPeriod.length} quotes this period`);
    return tips.slice(0, 3);
  }, [data.quotes, q2oRate, quotesInPeriod, wonQuotesInPeriod]);

  const quotesSentTips = useMemo((): string[] => {
    const tips: string[] = [];
    const draftOld = data.quotes.filter(q => q.status === 'Draft' && q.date && (now - new Date(q.date).getTime()) > 2 * DAY);
    if (draftOld.length > 0)
      tips.push(`${draftOld.length} draft${draftOld.length === 1 ? '' : 's'} sitting for 2+ days — review and send or delete`);
    if (quotesSentMonthDelta > 0)
      tips.push(`+${quotesSentMonthDelta} vs last month — momentum is up, keep quoting fast`);
    else if (quotesSentMonthDelta < 0)
      tips.push(`${quotesSentMonthDelta} vs last month — ${Math.abs(quotesSentMonthDelta)} fewer quotes sent than last month`);
    const unlinked = data.enquiries.filter(e => e.qRef == null && (e.status === 'New' || e.status === 'In Review' || e.status === 'Quoted'));
    if (unlinked.length > 0)
      tips.push(`${unlinked.length} enquir${unlinked.length === 1 ? 'y' : 'ies'} not yet linked to a quote`);
    if (tips.length === 0)
      tips.push(`${sentQuotesInPeriod.length} quotes sent this period — on track`);
    return tips.slice(0, 3);
  }, [data.quotes, data.enquiries, quotesSentMonthDelta, sentQuotesInPeriod]);

  const quoteValTips = useMemo((): string[] => {
    const tips: string[] = [];
    if (quoteValMonthDelta > 0)
      tips.push(`+${quoteValMonthDelta}L vs last month — value is growing`);
    else if (quoteValMonthDelta < 0)
      tips.push(`${quoteValMonthDelta}L vs last month — check if smaller orders or fewer high-value quotes`);
    if (openCustData.length > 0)
      tips.push(`Top open quote customer: ${openCustData[0].cust} — ${formatINR(openCustData[0].val)} awaiting PO`);
    const avgItems = quotesInPeriod.length
      ? (quotesInPeriod.reduce((s, q) => s + q.items.length, 0) / quotesInPeriod.length).toFixed(1)
      : null;
    if (avgItems && parseFloat(avgItems) < 2)
      tips.push(`Avg ${avgItems} items per quote — add accessories/services to increase basket value`);
    if (tips.length === 0)
      tips.push(`${formatINR(quoteValInPeriod)} quoted this period`);
    return tips.slice(0, 3);
  }, [quoteValMonthDelta, openCustData, quotesInPeriod, quoteValInPeriod]);
  // ─────────────────────────────────────────────────────────────────────────────

  // Recent Quotations (latest 5)
  const recentQuotes = [...data.quotes]
    .filter(q => q.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  // ── This Week computations ────────────────────────────────────────────────
  const { start: weekStart, end: weekEnd } = getThisWeekRange();

  const inThisWeek = (dateStr?: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr).getTime();
    return d >= weekStart.getTime() && d <= weekEnd.getTime();
  };

  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    // Enquiries received this week
    data.enquiries.forEach(e => {
      if (!inThisWeek(e.recv)) return;
      items.push({
        ts: e.recv,
        type: 'enquiry',
        who: e.assigned || 'Team',
        title: `Enquiry ${e.id} received from ${e.cust}`,
        subtitle: `${e.urg} · ${e.items.length} item${e.items.length !== 1 ? 's' : ''} · ${e.src}`,
        refId: e.id,
        refType: 'enquiry',
      });
    });

    // Quotes issued (non-draft) this week
    data.quotes.forEach(q => {
      if (q.status === 'Draft') return;
      if (!inThisWeek(q.date)) return;
      const val = q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0);
      items.push({
        ts: q.date,
        type: 'quote',
        who: 'Team',
        title: `Quote ${q.id} issued to ${q.cust}`,
        subtitle: `${q.status} · ${formatINR(val)}`,
        refId: q.id,
        refType: 'quote',
      });
    });

    // Orders punched this week (use created_at — the system punch timestamp)
    data.orders.forEach(o => {
      const punchedAt = (o as any).created_at;
      if (!inThisWeek(punchedAt)) return;
      const val = o.items.reduce((s, i) => s + (i.total || 0), 0);
      items.push({
        ts: punchedAt,
        type: 'order',
        who: 'Team',
        title: `Order ${o.id} received from ${o.cust}`,
        subtitle: `PO: ${o.poNo} · ${formatINR(val)}`,
        refId: o.id,
        refType: 'order',
      });
    });

    // Follow-up logs this week
    data.followups.forEach(fu => {
      (fu.logs || []).forEach(log => {
        if (!inThisWeek(log.ts)) return;
        items.push({
          ts: log.ts,
          type: 'followup',
          who: log.who || fu.owner || 'Team',
          title: `Follow-up logged on ${fu.quote_id}`,
          subtitle: `${log.channel} · ${log.note?.slice(0, 60) || '—'}`,
          refId: fu.quote_id,
          refType: 'quote',
        });
      });
    });

    return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [data, weekStart.getTime()]);

  // ── MDO Panel computations ─────────────────────────────────────────────────
  const SLA_H: Record<string, number> = { Hot: 4, Urgent: 24, Normal: 48, Low: 72 };

  const mdoPendingFollowups = useMemo(() =>
    data.followups.filter(fu =>
      fu.status === 'open' && fu.next_date && inThisWeek(fu.next_date) &&
      (!activeDoer || fu.owner === activeDoer.display_name)
    ), [data.followups, weekStart.getTime(), activeDoer]);

  const mdoOverdueEnqs = useMemo(() =>
    data.enquiries.filter(e =>
      (e.status === 'New' || e.status === 'In Review') &&
      e.ageH >= (SLA_H[e.urg] ?? 48)
    ), [data.enquiries]);

  const mdoQuotesAwaitingDecision = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    return data.quotes.filter(q => {
      if (q.status !== 'Sent') return false;
      const fu = data.followups.find(f => f.quote_id === q.id);
      if (!fu || !fu.logs || fu.logs.length === 0) return true;
      const lastLog = fu.logs[fu.logs.length - 1];
      return new Date(lastLog.ts).getTime() < sevenDaysAgo;
    });
  }, [data.quotes, data.followups]);

  const mdoOpenOrders = useMemo(() => {
    const todayTs = new Date();
    todayTs.setHours(23, 59, 59, 999);
    return data.orders.filter(o =>
      o.status === 'Processing' && o.dlvDate && new Date(o.dlvDate) <= todayTs
    );
  }, [data.orders]);

  const mdoPipelineCounts = useMemo(() => ({
    openEnqs: data.enquiries.filter(e => e.status === 'New' || e.status === 'In Review').length,
    sentQuotes: data.quotes.filter(q => q.status === 'Sent').length,
    processingOrders: data.orders.filter(o => o.status === 'Processing').length,
  }), [data]);

  const toggleMdo = (key: string) => setExpandedMdo(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Calendar computations ──────────────────────────────────────────────────
  const calendarEvents = useMemo<CalendarDayMap>(() => {
    const map: CalendarDayMap = {};
    const addEvent = (key: string, evt: CalendarEvent) => {
      if (!map[key]) map[key] = [];
      map[key].push(evt);
    };

    // Purple — follow-ups due (with contact details via quote→customer join)
    data.followups.forEach(fu => {
      if (!fu.next_date || fu.status === 'closed') return;
      const key = fu.next_date.slice(0, 10);
      const quote = data.quotes.find(q => q.id === fu.quote_id);
      const cust = quote ? data.customers.find(c => c.name === quote.cust) : undefined;
      const site = cust?.sites.find(s => s.isPrimary) ?? cust?.sites[0];
      const contact = site?.contacts.find(ct => ct.isPrimary) ?? site?.contacts[0];
      const contactLine = contact
        ? [contact.name, contact.phone].filter(Boolean).join(' · ')
        : fu.owner || 'Team';
      addEvent(key, {
        id: fu.id,
        type: 'followup',
        label: fu.quote_id,
        sublabel: quote?.cust || fu.owner || 'Team',
        contact: contactLine,
        color: 'purple',
        onClick: () => openDetailPanel('quote' as any, fu.quote_id),
      });
    });

    // Red — overdue enquiries
    const SLA_CAL: Record<string, number> = { Hot: 4, Urgent: 24, Normal: 48, Low: 72 };
    data.enquiries.forEach(e => {
      if ((e.status !== 'New' && e.status !== 'In Review') || !e.recv) return;
      if (e.ageH < (SLA_CAL[e.urg] ?? 48)) return;
      // `recv` is TIMESTAMPTZ — bucket by LOCAL date so the pin lands in the
      // same day column the grid renders (slice(0,10) would use the UTC day
      // and shift late-evening IST enquiries into the wrong day/week).
      const key = localDateStr(new Date(e.recv));
      addEvent(key, {
        id: e.id,
        type: 'overdue-enq',
        label: e.id,
        sublabel: `${e.cust} · ${e.urg}`,
        color: 'red',
        onClick: () => openDetailPanel('enquiry' as any, e.id),
      });
    });

    // Teal — order delivery deadlines
    data.orders.forEach(o => {
      if (!o.created_at || o.status !== 'Processing') return;
      const key = o.created_at.slice(0, 10);
      addEvent(key, {
        id: o.id,
        type: 'order-dlv',
        label: o.id,
        sublabel: o.cust,
        color: 'teal',
        onClick: () => openDetailPanel('order' as any, o.id),
      });
    });

    // Orange — quotes awaiting decision (sent 7+ days ago)
    const sevenDaysAgo = Date.now() - 7 * 24 * 3_600_000;
    data.quotes.forEach(q => {
      if (q.status !== 'Sent' || !q.date) return;
      if (new Date(q.date).getTime() > sevenDaysAgo) return;
      const key = q.date.slice(0, 10);
      addEvent(key, {
        id: q.id,
        type: 'quote-pending',
        label: q.id,
        sublabel: q.cust,
        color: 'orange',
        onClick: () => openDetailPanel('quote' as any, q.id),
      });
    });

    return map;
  }, [data.followups, data.enquiries, data.orders, data.quotes, data.customers]);

  const { start: calWeekStart, end: calWeekEnd, days: calDays } = useMemo(
    () => getOffsetWeekRange(calendarWeekOffset),
    [calendarWeekOffset]
  );

  const calWeekLabel = `${calWeekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${fmtIST(calWeekEnd, 'dd-MMM-yyyy')}`;
  const todayKey = dateKey(new Date());

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-y-auto">
      <div className="pt-5 px-[30px] shrink-0">
        <div className="flex items-start justify-between gap-3 pb-4">
          <div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight flex items-baseline gap-2">
              Good morning, <em className="italic text-red-mrt font-serif ml-0.5">{formattedName}</em>
            </h1>
            <p className="text-[13px] text-g600 mt-1 font-medium">
              {formattedDate} — <strong className={attnEnqs.length > 0 ? "text-red-mrt" : "text-[#059669]"}>
                {attnEnqs.length > 0 ? `${attnEnqs.length} enquiries need response today` : 'All caught up today'}
              </strong>
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 mt-2">
            {/* {activeTab === 'overview' && !globalDateRange?.startDate && !globalDateRange?.endDate && (
              <select
                title="Dashboard period"
                value={period}
                onChange={e => setPeriod(e.target.value as Period)}
                className="h-8 px-2.5 pr-7 text-[11px] font-mono font-bold tracking-[1px] text-g600 bg-white border border-g200 rounded-[3px] outline-none focus:border-red-mrt appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_7px_center] cursor-pointer"
              >
                <option value="30d">Last 30 days</option>
                <option value="quarter">This quarter</option>
                <option value="year">This year</option>
              </select>
            )} */}
            <Button variant="secondary" onClick={() => navigate('/enquiries')}>View All</Button>
            <Button variant="primary" onClick={() => navigate('/enquiries/new')}>
              <Plus size={14} className="stroke-[2.5px]" /> Log Enquiry
            </Button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 border-b border-g200 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] font-bold tracking-[1.5px] uppercase border-b-2 -mb-px transition-colors focus:outline-none',
              activeTab === 'overview'
                ? 'border-red-mrt text-red-mrt'
                : 'border-transparent text-g400 hover:text-g600'
            )}
          >
            <TrendingUp size={12} />
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('this-week')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] font-bold tracking-[1.5px] uppercase border-b-2 -mb-px transition-colors focus:outline-none',
              activeTab === 'this-week'
                ? 'border-red-mrt text-red-mrt'
                : 'border-transparent text-g400 hover:text-g600'
            )}
          >
            <Activity size={12} />
            This Week
            {activityFeed.length > 0 && (
              <span className="ml-1 bg-red-mrt text-white font-mono text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                {activityFeed.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] font-bold tracking-[1.5px] uppercase border-b-2 -mb-px transition-colors focus:outline-none',
              activeTab === 'calendar'
                ? 'border-red-mrt text-red-mrt'
                : 'border-transparent text-g400 hover:text-g600'
            )}
          >
            <Calendar size={12} />
            Calendar
          </button>
        </div>
      </div>

      {activeTab === 'this-week' && (
        <div className="px-[30px] pb-6 flex flex-col gap-4">

          {/* Pipeline snapshot KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-g200 rounded-[8px] p-4 flex items-center gap-3 shadow-sm">
              <div className="w-9 h-9 rounded-[6px] bg-blue-50 flex items-center justify-center shrink-0">
                <FileText size={16} className="text-blue-500" />
              </div>
              <div>
                <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400">Open Enquiries</div>
                <div className="font-serif text-[26px] font-bold text-blk leading-none mt-0.5">{mdoPipelineCounts.openEnqs}</div>
              </div>
            </div>
            <div className="bg-white border border-g200 rounded-[8px] p-4 flex items-center gap-3 shadow-sm">
              <div className="w-9 h-9 rounded-[6px] bg-orange-50 flex items-center justify-center shrink-0">
                <FileSignature size={16} className="text-orange-500" />
              </div>
              <div>
                <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400">Quotes Pending PO</div>
                <div className="font-serif text-[26px] font-bold text-blk leading-none mt-0.5">{mdoPipelineCounts.sentQuotes}</div>
              </div>
            </div>
            <div className="bg-white border border-g200 rounded-[8px] p-4 flex items-center gap-3 shadow-sm">
              <div className="w-9 h-9 rounded-[6px] bg-teal-50 flex items-center justify-center shrink-0">
                <ShoppingBag size={16} className="text-teal-500" />
              </div>
              <div>
                <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400">Orders Processing</div>
                <div className="font-serif text-[26px] font-bold text-blk leading-none mt-0.5">{mdoPipelineCounts.processingOrders}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1.6fr_1fr] gap-4 items-start">

            {/* Activity Feed */}
            <div className="bg-white border border-g200 rounded-[8px] overflow-hidden shadow-sm">
              <div className="p-[10px_16px] border-b border-g200 flex items-center justify-between">
                <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 flex items-center gap-2">
                  <Activity size={11} className="text-red-mrt" />
                  What Happened This Week
                </span>
                <span className="font-mono text-[9px] text-g400 tracking-[1px]">{weekLabel}</span>
              </div>
              {activityFeed.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 text-center">
                  <div className="text-[24px] mb-2 opacity-20">📋</div>
                  <div className="text-[13px] font-bold text-blk mb-1">No activity yet</div>
                  <div className="text-[12px] text-g400">Enquiries, quotes, orders and follow-ups logged this week will appear here.</div>
                </div>
              ) : (
                <div className="divide-y divide-g100">
                  {activityFeed.map((item, idx) => {
                    const iconMap = {
                      enquiry: <FileText size={13} className="text-blue-500" />,
                      quote: <FileSignature size={13} className="text-orange-500" />,
                      order: <ShoppingBag size={13} className="text-emerald-500" />,
                      followup: <Phone size={13} className="text-purple-500" />,
                    };
                    const dotColor = {
                      enquiry: 'bg-blue-500',
                      quote: 'bg-orange-500',
                      order: 'bg-emerald-500',
                      followup: 'bg-purple-500',
                    }[item.type];
                    const timeStr = new Date(item.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = new Date(item.ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => openDetailPanel(item.refType as any, item.refId)}
                        className="w-full flex items-start gap-3 p-[10px_16px] hover:bg-g50 transition-colors text-left focus:outline-none"
                      >
                        <div className="relative flex flex-col items-center shrink-0 mt-0.5">
                          <div className={cn('w-[28px] h-[28px] rounded-full flex items-center justify-center', {
                            'bg-blue-50': item.type === 'enquiry',
                            'bg-orange-50': item.type === 'quote',
                            'bg-emerald-50': item.type === 'order',
                            'bg-purple-50': item.type === 'followup',
                          })}>
                            {iconMap[item.type]}
                          </div>
                          {idx < activityFeed.length - 1 && (
                            <div className="w-px flex-1 bg-g100 mt-1 h-full absolute top-[28px] bottom-[-10px]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-[12.5px] font-semibold text-blk leading-tight">{item.title}</div>
                            <div className="text-right shrink-0">
                              <div className="font-mono text-[9.5px] font-bold text-g400">{timeStr}</div>
                              <div className="font-mono text-[9px] text-g300">{dateStr}</div>
                            </div>
                          </div>
                          <div className="text-[11.5px] text-g500 mt-0.5 truncate">{item.subtitle}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} />
                            <span className="font-mono text-[9px] text-g400">{item.who}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* MDO Panel */}
            <div className="flex flex-col gap-3">
              <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 flex items-center gap-2 pt-1">
                <CalendarClock size={11} className="text-red-mrt" />
                What To Do — MDO
              </div>

              {/* Pending follow-ups this week */}
              <MdoSection
                title="Follow-ups Due This Week"
                count={mdoPendingFollowups.length}
                color="purple"
                expanded={!!expandedMdo['fu']}
                onToggle={() => toggleMdo('fu')}
                emptyText="No follow-ups due this week"
              >
                {mdoPendingFollowups.map(fu => (
                  <button type="button" key={fu.id} onClick={() => openDetailPanel('quote' as any, fu.quote_id)} className="w-full text-left px-3 py-2 hover:bg-g50 border-b border-g100 last:border-0 focus:outline-none">
                    <div className="font-mono text-[10px] font-bold text-purple-600">{fu.quote_id}</div>
                    <div className="text-[11.5px] text-blk font-medium">{fu.owner}</div>
                    <div className="text-[11px] text-g400">{fu.next_date} {fu.next_time}</div>
                  </button>
                ))}
              </MdoSection>

              {/* Overdue enquiries */}
              <MdoSection
                title="Overdue Enquiries"
                count={mdoOverdueEnqs.length}
                color="red"
                expanded={!!expandedMdo['enq']}
                onToggle={() => toggleMdo('enq')}
                emptyText="No SLA breaches"
              >
                {mdoOverdueEnqs.map(e => (
                  <button type="button" key={e.id} onClick={() => openDetailPanel('enquiry' as any, e.id)} className="w-full text-left px-3 py-2 hover:bg-g50 border-b border-g100 last:border-0 focus:outline-none">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-[10px] font-bold text-red-mrt">{e.id}</div>
                      <Badge status={e.urg} />
                    </div>
                    <div className="text-[11.5px] text-blk font-medium truncate">{e.cust}</div>
                    <div className="text-[11px] text-red-mrt font-mono">{e.ageH >= 24 ? `${Math.floor(e.ageH/24)}d ${Math.round(e.ageH%24)}h` : `${e.ageH.toFixed(1)}h`} old</div>
                  </button>
                ))}
              </MdoSection>

              {/* Quotes awaiting decision */}
              <MdoSection
                title="Quotes Awaiting Decision"
                count={mdoQuotesAwaitingDecision.length}
                color="orange"
                expanded={!!expandedMdo['qt']}
                onToggle={() => toggleMdo('qt')}
                emptyText="All quotes recently followed up"
              >
                {mdoQuotesAwaitingDecision.map(q => {
                  const val = q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0);
                  return (
                    <button type="button" key={q.id} onClick={() => openDetailPanel('quote' as any, q.id)} className="w-full text-left px-3 py-2 hover:bg-g50 border-b border-g100 last:border-0 focus:outline-none">
                      <div className="font-mono text-[10px] font-bold text-orange-600">{q.id}</div>
                      <div className="text-[11.5px] text-blk font-medium truncate">{q.cust}</div>
                      <div className="font-mono text-[11px] text-g500">{formatINR(val)}</div>
                    </button>
                  );
                })}
              </MdoSection>

              {/* Open orders overdue */}
              <MdoSection
                title="Orders Overdue / Due Today"
                count={mdoOpenOrders.length}
                color="teal"
                expanded={!!expandedMdo['ord']}
                onToggle={() => toggleMdo('ord')}
                emptyText="No overdue orders"
              >
                {mdoOpenOrders.map(o => (
                  <button type="button" key={o.id} onClick={() => openDetailPanel('order' as any, o.id)} className="w-full text-left px-3 py-2 hover:bg-g50 border-b border-g100 last:border-0 focus:outline-none">
                    <div className="font-mono text-[10px] font-bold text-teal-600">{o.id}</div>
                    <div className="text-[11.5px] text-blk font-medium truncate">{o.cust}</div>
                    <div className="text-[11px] text-g400">Due: {o.dlvDate}</div>
                  </button>
                ))}
              </MdoSection>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="px-[30px] pb-6 flex flex-col gap-4">

          {/* Navigation bar */}
          <div className="flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => setCalendarWeekOffset(o => o - 1)}
              className="flex items-center gap-1.5 h-8 px-3 font-mono text-[10px] font-bold tracking-[1.5px] uppercase text-g600 bg-white border border-g200 rounded-[3px] hover:border-g400 transition-colors focus:outline-none"
            >
              <ChevronLeft size={12} />
              Prev Week
            </button>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase text-g500">
                {calWeekLabel}
              </span>
              {calendarWeekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setCalendarWeekOffset(0)}
                  className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-red-mrt hover:opacity-70 focus:outline-none"
                >
                  Today
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCalendarWeekOffset(o => o + 1)}
              className="flex items-center gap-1.5 h-8 px-3 font-mono text-[10px] font-bold tracking-[1.5px] uppercase text-g600 bg-white border border-g200 rounded-[3px] hover:border-g400 transition-colors focus:outline-none"
            >
              Next Week
              <ChevronRight size={12} />
            </button>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 flex-wrap">
            {(
              [
                { color: 'purple', label: 'Follow-up due' },
                { color: 'red',    label: 'Overdue enquiry' },
                { color: 'teal',   label: 'Order delivery' },
                { color: 'orange', label: 'Quote awaiting PO' },
              ] as { color: CalendarEvent['color']; label: string }[]
            ).map(({ color, label }) => (
              <div key={color} className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-full', CAL_PILL_COLORS[color].dot)} />
                <span className="font-mono text-[9px] text-g500">{label}</span>
              </div>
            ))}
          </div>

          {/* Desktop 7-column grid */}
          <div className="hidden md:grid grid-cols-7 border border-g200 rounded-[8px] overflow-hidden shadow-sm">
            {calDays.map(day => {
              const key = dateKey(day);
              return (
                <CalendarDayColumn
                  key={key}
                  date={day}
                  events={calendarEvents[key] ?? []}
                  isToday={key === todayKey}
                />
              );
            })}
          </div>

          {/* Mobile list view */}
          <div className="md:hidden flex flex-col gap-3">
            {calDays.map(day => {
              const key = dateKey(day);
              const events = calendarEvents[key] ?? [];
              const isToday = key === todayKey;
              const dayLabel = day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
              return (
                <div key={key} className={cn('bg-white border border-g200 rounded-[8px] overflow-hidden', isToday && 'border-red-mrt/40')}>
                  <div className={cn('px-4 py-2 border-b border-g200 font-mono text-[10px] font-bold tracking-[1.5px] uppercase', isToday ? 'text-red-mrt bg-red-50' : 'text-g500')}>
                    {dayLabel}
                  </div>
                  {events.length === 0 ? (
                    <div className="px-4 py-3 text-[11px] text-g300 italic">No events</div>
                  ) : (
                    <div className="flex flex-col divide-y divide-g100">
                      {events.map((evt, i) => {
                        const c = CAL_PILL_COLORS[evt.color];
                        return (
                          <button key={i} type="button" onClick={evt.onClick}
                            className="flex items-start gap-3 px-4 py-2.5 hover:bg-g50 focus:outline-none text-left">
                            <div className={cn('w-2 h-2 rounded-full shrink-0 mt-1', c.dot)} />
                            <div>
                              <div className="font-mono text-[10.5px] font-bold text-blk">{evt.label}</div>
                              <div className="text-[11px] text-g500">{evt.sublabel}</div>
                              {evt.contact && <div className="text-[10.5px] text-g400">{evt.contact}</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}

      {activeTab === 'overview' && (
      <div className="px-[30px] pb-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-5 gap-3 mb-3">
          <StatCard
            label="Avg E2Q Time"
            value={avgE2Q !== null ? `${avgE2Q}h` : '--'}
            subIdx={kpiSubIdx}
            sub={buildSub(
              e2qSamples.length > 0 ? `${e2qSamples.length} quoted enq${e2qSamples.length === 1 ? '' : 's'}` : 'No data yet',
              e2qWeekDelta,
              e2qMonthDelta,
              'h',
              true,
            )}
            color="blue"
            icon={<Clock size={16} strokeWidth={2} />}
            tips={e2qTips}
            onClick={() => navigate('/analytics')}
          />
          <StatCard
            label="Open Pipeline"
            value={formatINR(openPipeVal)}
            subIdx={kpiSubIdx}
            sub={[
              openQuoteString,
              `${openPipeWeekDelta} new this week`,
              `${openPipeMonthDelta} new this month`,
            ]}
            color="purple"
            icon={<IndianRupee size={16} strokeWidth={2} />}
            tips={pipelineTips}
            onClick={() => navigate('/quotes')}
          />
          <StatCard
            label="Q→O Conversion"
            value={`${q2oRate}%`}
            subIdx={kpiSubIdx}
            sub={buildSub(
              quotesInPeriod.length > 0 ? `${wonQuotesInPeriod.length} won from ${quotesInPeriod.length} quotes` : 'No quotes in period',
              q2oWeekDelta,
              q2oMonthDelta,
              'pp',
            )}
            color="green"
            icon={<Trophy size={16} strokeWidth={2} />}
            tips={q2oTips}
            onClick={() => navigate('/analytics')}
          />
          <StatCard
            label="Quotes Sent"
            value={sentQuotesInPeriod.length.toString()}
            subIdx={kpiSubIdx}
            sub={buildSub(
              'Total quotations issued',
              quotesSentWeekDelta,
              quotesSentMonthDelta,
              'quotes',
            )}
            color="orange"
            icon={<FileSignature size={16} strokeWidth={2} />}
            tips={quotesSentTips}
            onClick={() => navigate('/quotes')}
          />
          <StatCard
            label="Quote Value"
            value={formatINR(quoteValInPeriod)}
            subIdx={kpiSubIdx}
            sub={buildSub(
              'Total value quoted',
              quoteValWeekDelta,
              quoteValMonthDelta,
              'L',
            )}
            color="red"
            icon={<IndianRupee size={16} strokeWidth={2} />}
            tips={quoteValTips}
          />
        </div>

        {/* Pipeline Funnel */}
        <PipelineFunnel data={data} navigate={navigate} />

        {data.enquiries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white border border-g200 border-dashed rounded-[4px] mt-6">
            <div className="w-16 h-16 bg-red-mrt/5 rounded-full flex items-center justify-center mb-4">
              <Plus size={24} className="text-red-mrt stroke-[2px]" />
            </div>
            <h2 className="text-[18px] font-serif font-bold text-blk mb-2">Welcome to EnquiryBoss</h2>
            <p className="text-[13px] text-g500 text-center max-w-[400px] mb-6">
              Your dashboard is looking a little empty. Start by logging your first enquiry to capture line items and speed up your quoting process.
            </p>
            <Button variant="primary" onClick={() => navigate('/enquiries/new')}>
              Log your first Enquiry
            </Button>
          </div>
        ) : (
          <>
            {/* Top panels */}
            <div className="grid grid-cols-[1.5fr_2fr] gap-3 mb-3">
              {/* Needs Attention */}
              <div className="bg-white border border-g200 rounded-[6px] overflow-hidden shadow-sm hover:shadow transition-shadow">
                <div className="p-[10px_16px] border-b border-g200 flex items-center justify-between">
                  <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 flex items-center gap-2">
                    {attnEnqs.length > 0 ? (
                      <><span className="text-red-mrt text-[11px]">⚠</span> Needs Attention</>
                    ) : (
                      <><span className="text-[#059669] text-[11px]">✓</span> Inbox Zero</>
                    )}
                  </span>
                </div>
                <div className="p-0">
                  {openEnqs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center">
                      <div className="text-[20px] mb-2 opacity-30">🚀</div>
                      <div className="text-[14px] font-bold text-blk mb-1">Queue is empty</div>
                      <div className="text-[12.5px] text-g500">No open enquiries right now.</div>
                    </div>
                  ) : attnEnqs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center">
                      <div className="text-[14px] font-bold text-blk mb-1">Looking good</div>
                      <div className="text-[12.5px] text-g500">All open enquiries are within SLA.</div>
                    </div>
                  ) : (
                    attnEnqs.slice(attnPage * 3, attnPage * 3 + 3).map(e => {
                      const urgBox: Record<string, string> = {
                        Hot: 'bg-red-mrt/10 text-red-mrt border-red-mrt/20',
                        Urgent: 'bg-sP/10 text-sP border-sP/20',
                        Normal: 'bg-sN/10 text-sN border-sN/20',
                        Low: 'bg-sL/10 text-sL border-sL/20',
                      };
                      const urgAge: Record<string, string> = {
                        Hot: 'text-red-mrt',
                        Urgent: 'text-sP',
                        Normal: 'text-sN',
                        Low: 'text-sL',
                      };
                      const boxCls = urgBox[e.urg] ?? urgBox.Hot;
                      const ageCls = urgAge[e.urg] ?? urgAge.Hot;
                      return (
                      <div key={e.id} className="flex flex-col gap-1 p-[10px_16px] border-b border-g100 last:border-0 cursor-pointer hover:bg-g50 transition-colors" onClick={() => navigate(`/enquiries/new?id=${e.id}`)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-[28px] h-[28px] rounded-[3px] flex items-center justify-center font-mono text-[12px] uppercase font-bold shrink-0 border ${boxCls}`}>
                              Δ
                            </div>
                            <div>
                              <div className={`font-mono text-[10px] font-bold tracking-wider mb-0.5 ${ageCls}`}>{e.id}</div>
                              <div className="text-[13px] font-bold text-blk">{e.cust}{(() => { const sl = siteLabel(data.customers.find(c => c.name === e.cust), e.siteId); return sl ? <span className="font-normal text-g400"> — {sl}</span> : null; })()}</div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge status={e.urg} />
                            <div className={`font-mono text-[11px] font-bold ${ageCls}`}>
                              {e.ageH >= 24 ? Math.floor(e.ageH/24)+'d' : e.ageH.toFixed(1)+'h'} old
                            </div>
                          </div>
                        </div>
                        <div className="text-[12px] text-g500 ml-[38px] truncate max-w-[280px]">
                          {e.items.length} item{e.items.length !== 1 && 's'}: {e.items.map(i => i.desc).join(', ')}
                        </div>
                      </div>
                      );
                    })
                  )}
                  {attnEnqs.length > 3 && (
                    <div className="flex items-center justify-between p-[8px_16px] border-t border-g100">
                      <span className="text-[10.5px] text-g400">
                        {attnPage * 3 + 1}–{Math.min(attnPage * 3 + 3, attnEnqs.length)} of {attnEnqs.length}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={attnPage === 0}
                          onClick={() => setAttnPage(p => Math.max(0, p - 1))}
                          className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500 hover:text-blk disabled:opacity-30 disabled:cursor-default px-1.5 focus:outline-none"
                        >← Prev</button>
                        <button
                          type="button"
                          disabled={(attnPage + 1) * 3 >= attnEnqs.length}
                          onClick={() => setAttnPage(p => p + 1)}
                          className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-red-mrt hover:opacity-70 disabled:opacity-30 disabled:cursor-default px-1.5 focus:outline-none"
                        >Show next →</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Open Quote Value By Customer */}
              <div className="bg-white border border-g200 p-[16px] rounded-[6px] shadow-sm hover:shadow transition-shadow">
                <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500 mb-3">Open Quote Value By Customer</div>
                <div className="space-y-2.5">
                  {openCustData.length > 0 ? openCustData.map((c, i) => {
                    const pct = Math.round((c.val / maxOpenCustVal) * 100);
                    const barColors = ['#D42027','#7C3AED','#2563EB','#059669','#d97706'];
                    const col = barColors[i % barColors.length];
                    return (
                      <button
                        key={c.cust}
                        type="button"
                        title={`View all open quotes for ${c.cust}`}
                        onClick={() => navigate(`/intelligence?customer=${encodeURIComponent(c.cust)}`)}
                        className="w-full text-left group cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[11.5px] font-semibold text-blk truncate max-w-[130px] group-hover:text-red-mrt transition-colors">{c.cust}</div>
                          <div className="font-mono text-[11px] font-bold text-blk whitespace-nowrap">{formatINR(c.val)}</div>
                        </div>
                        <div className="h-[8px] bg-g100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500 group-hover:opacity-80" style={{ width: `${pct}%`, backgroundColor: col }} />
                        </div>
                      </button>
                    );
                  }) : (
                    <div className="text-[12px] text-g400 text-center mt-8 italic">No quotes awaiting PO.</div>
                  )}
                </div>
                {openCustDataAll.length > OPEN_CUST_PAGE && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-g100">
                    <span className="text-[10.5px] text-g400">
                      {openCustPage * OPEN_CUST_PAGE + 1}–{Math.min(openCustPage * OPEN_CUST_PAGE + OPEN_CUST_PAGE, openCustDataAll.length)} of {openCustDataAll.length}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={openCustPage === 0}
                        onClick={() => setOpenCustPage(p => Math.max(0, p - 1))}
                        className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500 hover:text-blk disabled:opacity-30 disabled:cursor-default px-1.5 focus:outline-none"
                      >← Prev</button>
                      <button
                        type="button"
                        disabled={(openCustPage + 1) * OPEN_CUST_PAGE >= openCustDataAll.length}
                        onClick={() => setOpenCustPage(p => p + 1)}
                        className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-red-mrt hover:opacity-70 disabled:opacity-30 disabled:cursor-default px-1.5 focus:outline-none"
                      >Show next →</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom 2 panels */}
            <div className="grid grid-cols-2 gap-3 mb-3">

              {/* Recent Enquiries */}
              <div className="bg-white border border-g200 rounded-[6px] overflow-hidden shadow-sm hover:shadow transition-shadow">
                <div className="p-[10px_16px] border-b border-g200 flex items-center justify-between">
                  <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">Recent Enquiries</span>
                  <button onClick={() => navigate('/enquiries')} className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-red-mrt hover:opacity-70 flex items-center gap-1 focus:outline-none">
                    All Enquiries <span>→</span>
                  </button>
                </div>
                <div className="p-0">
                  {data.enquiries.slice(0, 5).map(e => (
                    <div key={e.id} className="flex items-center p-[9px_16px] border-b border-g100 last:border-0 cursor-pointer hover:bg-g50 transition-colors overflow-hidden" onClick={() => openDetailPanel('enquiry', e.id)}>
                      <div className="w-[120px] font-mono text-[11px] font-bold text-red-mrt shrink-0 tracking-wider truncate pr-2">{e.id}</div>
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="font-bold text-[13px] truncate">{e.cust}{(() => { const sl = siteLabel(data.customers.find(c => c.name === e.cust), e.siteId); return sl ? <span className="font-normal text-g400"> — {sl}</span> : null; })()}</div>
                      </div>
                      <div className="flex items-center justify-end shrink-0 w-[190px] gap-2.5">
                        <span className="font-mono text-[10px] text-g400 bg-g50">{e.items.length} items</span>
                        <div className="w-[68px] flex justify-center">
                          <Badge status={e.status} />
                        </div>
                        <div className="w-[42px] flex justify-end">
                          <AgeCell hours={e.ageH} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Quotations */}
              <div className="bg-white border border-g200 rounded-[6px] overflow-hidden shadow-sm hover:shadow transition-shadow">
                <div className="p-[10px_16px] border-b border-g200 flex items-center justify-between">
                  <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">Recent Quotations</span>
                  <button type="button" onClick={() => navigate('/quotes')} className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-red-mrt hover:opacity-70 flex items-center gap-1 focus:outline-none">
                    View all →
                  </button>
                </div>
                {recentQuotes.length === 0 ? (
                  <div className="text-[12px] text-g400 text-center p-8 italic">No quotations yet.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-3 px-[16px] py-[7px] border-b border-g100">
                      <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400">Quote No.</div>
                      <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400">Customer</div>
                      <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400 text-right">Value</div>
                      <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400 text-right">Date</div>
                    </div>
                    {recentQuotes.map(q => {
                      const val = q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0);
                      return (
                        <div key={q.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-3 items-center px-[16px] py-[8px] border-b border-g100 last:border-0 hover:bg-g50 cursor-pointer transition-colors" onClick={() => openDetailPanel('quote', q.id)}>
                          <div className="font-mono text-[10.5px] font-bold text-red-mrt truncate">{q.id}</div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-medium text-blk truncate">{q.cust}{(() => { const sl = siteLabel(data.customers.find(c => c.name === q.cust), (q as any).siteId); return sl ? <span className="font-normal text-g400"> — {sl}</span> : null; })()}</div>
                          </div>
                          <div className="font-mono text-[11px] font-bold text-blk text-right whitespace-nowrap">{formatINR(val)}</div>
                          <div className="font-mono text-[10px] text-g400 text-right whitespace-nowrap">{new Date(q.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}

function SourcePieChart({ data, total }: { data: { src: string; count: number; color: string }[]; total: number }) {
  const SIZE = 120;
  const R = 42;
  const STROKE = 14;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const circumference = 2 * Math.PI * R;
  const GAP = 2; // gap between segments in px along circumference

  // Build stroke-dasharray segments
  let cumOffset = 0;
  const segments = data.map(d => {
    const arcLen = (d.count / total) * circumference;
    const dashLen = Math.max(arcLen - GAP, 0);
    const seg = { ...d, dashLen, dashOffset: -cumOffset };
    cumOffset += arcLen;
    return seg;
  });

  const topSrc = data[0]?.src ?? '';

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ transform: 'rotate(-90deg)' }}>
          {/* track */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f3f4f6" strokeWidth={STROKE} />
          {segments.map((s, i) => (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none"
              stroke={s.color} strokeWidth={STROKE}
              strokeDasharray={`${s.dashLen} ${circumference - s.dashLen}`}
              strokeDashoffset={s.dashOffset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 8, color: '#9ca3af', letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' }}>{topSrc}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        {data.map(d => (
          <div key={d.src} className="flex items-center gap-2">
            <div className="w-[3px] h-[28px] rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-[11.5px] font-semibold text-blk truncate">{d.src}</div>
              <div className="w-full h-[3px] bg-g100 rounded-full mt-0.5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round((d.count / total) * 100)}%`, backgroundColor: d.color }} />
              </div>
            </div>
            <div className="font-mono text-[11px] font-bold text-blk shrink-0">{d.count}</div>
            <div className="font-mono text-[9.5px] text-g400 w-[26px] text-right shrink-0">{Math.round((d.count / total) * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const STAT_COLORS = {
  blue:   { top: 'border-t-blue-500',   iconBg: 'bg-blue-50',   iconText: 'text-blue-500',   tip: 'bg-blue-600'    },
  purple: { top: 'border-t-purple-500', iconBg: 'bg-purple-50', iconText: 'text-purple-500', tip: 'bg-purple-600'  },
  green:  { top: 'border-t-emerald-500',iconBg: 'bg-emerald-50',iconText: 'text-emerald-500',tip: 'bg-emerald-600' },
  orange: { top: 'border-t-orange-500', iconBg: 'bg-orange-50', iconText: 'text-orange-500', tip: 'bg-orange-600'  },
  red:    { top: 'border-t-red-500',    iconBg: 'bg-red-50',    iconText: 'text-red-500',    tip: 'bg-red-600'     },
};

type SubEntry = { text: string; dir?: 'up' | 'dn' | 'neutral' | null };

function StatCard({ label, value, sub, subIdx = 0, trend, trendColor, color, icon, tips, onClick }: {
  label: string; value: string;
  sub?: string | string[] | SubEntry[];
  subIdx?: number;
  trend?: string; trendColor?: 'up' | 'dn' | 'neutral';
  color: keyof typeof STAT_COLORS; icon: React.ReactNode;
  tips?: string[];
  onClick?: () => void;
}) {
  const c = STAT_COLORS[color];
  const subList: SubEntry[] = Array.isArray(sub)
    ? (sub as any[]).map((s): SubEntry => typeof s === 'string' ? { text: s, dir: null } : s)
    : sub
      ? [{ text: sub as string, dir: null }]
      : [];
  const currentSub = subList.length > 0 ? subList[subIdx % subList.length] : undefined;
  const dirColor = currentSub?.dir === 'up' ? 'text-emerald-600'
    : currentSub?.dir === 'dn' ? 'text-red-500'
    : currentSub?.dir === 'neutral' ? 'text-g400'
    : 'text-g400';
  const arrow = currentSub?.dir === 'up' ? '↑' : currentSub?.dir === 'dn' ? '↓' : '';
  const clickProps = onClick
    ? { onClick, role: 'button' as const, tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } }
    : {};
  return (
    <div
      {...clickProps}
      className={cn('bg-white rounded-[10px] border border-g200 border-t-[3px] p-5 flex flex-col gap-2 shadow-sm hover:shadow transition-shadow relative group/statcard overflow-visible', onClick && 'cursor-pointer', c.top)}>
      <div className="flex items-start justify-between gap-2">
        <div className={cn('font-mono text-[10px] font-bold tracking-[1.5px] uppercase text-g500')}>{label}</div>
        <div className={cn('w-8 h-8 rounded-[6px] flex items-center justify-center shrink-0', c.iconBg)}>
          <div className={cn('w-4 h-4', c.iconText)}>{icon}</div>
        </div>
      </div>
      <div className="font-sans text-[28px] leading-none font-bold text-blk tracking-tight">{value}</div>
      {trend && (
        <div className={cn('flex items-center gap-1 text-[11px] font-semibold',
          trendColor === 'up' ? 'text-emerald-600' : trendColor === 'dn' ? 'text-red-500' : 'text-g400')}>
          {trendColor === 'up' && '↑'}
          {trendColor === 'dn' && '↓'}
          {trend} <span className="font-normal text-g400">vs last month</span>
        </div>
      )}
      {!trend && currentSub && (
        <div
          key={subIdx}
          className={cn('flex items-center gap-1 text-[11px] font-medium truncate animate-in fade-in duration-500',
            currentSub.dir ? dirColor : 'text-g400',
            currentSub.dir && currentSub.dir !== 'neutral' ? 'font-semibold' : '')}
        >
          {arrow && <span>{arrow}</span>}
          <span className="truncate">{currentSub.text}</span>
        </div>
      )}

      {/* Flying tip banner — appears above card on hover */}
      {tips && tips.length > 0 && (
        <div className={cn(
          'absolute bottom-[calc(100%+8px)] left-0 right-0 z-50',
          'opacity-0 translate-y-1 pointer-events-none',
          'group-hover/statcard:opacity-100 group-hover/statcard:translate-y-0 group-hover/statcard:pointer-events-auto',
          'transition-all duration-200 ease-out',
        )}>
          <div className={cn('rounded-[8px] p-3 shadow-lg text-white', c.tip)}>
            <div className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase opacity-75 mb-2">How to improve</div>
            <ul className="space-y-1.5">
              {tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10.5px] leading-snug">
                  <span className="opacity-60 shrink-0 mt-[1px]">›</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* arrow pointing down */}
          <div className="flex justify-center -mt-[1px]">
            <svg viewBox="0 0 12 6" className="w-3 h-3 drop-shadow-sm">
              <polygon points="0,0 12,0 6,6" className={cn(
                color === 'blue'   ? 'fill-blue-600'    :
                color === 'purple' ? 'fill-purple-600'  :
                color === 'green'  ? 'fill-emerald-600' :
                color === 'orange' ? 'fill-orange-600'  :
                'fill-red-600'
              )} />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineFunnel({ data, navigate }: { data: any; navigate: (path: string) => void }) {
  const fmt = (v: number) => v === 0 ? '₹0' : `₹${(v / 100000).toFixed(1)}L`;

  const quoteVal = (quotes: any[]) =>
    quotes.reduce((s: number, q: any) => s + q.items.reduce((a: number, i: any) => a + i.total + (i.total * i.gst / 100), 0), 0);

  const openEnqs   = data.enquiries.filter((e: any) => e.status === 'New' || e.status === 'In Review');
  const quotedEnqs = data.enquiries.filter((e: any) => e.status === 'Quoted');
  const sentQts    = data.quotes.filter((q: any) => q.status === 'Sent');
  const wonQts     = data.quotes.filter((q: any) => q.status === 'Won');
  const lostEnqs   = data.enquiries.filter((e: any) => e.status === 'Lost');
  const lostQts    = data.quotes.filter((q: any) => q.status === 'Lost');
  const activeOrds = data.orders.filter((o: any) => o.status === 'Processing');

  const stages = [
    { label: 'Open Enquiries', sub: 'pending quote',    count: openEnqs.length,   val: 0,                  color: 'text-blue-600',    bar: 'bg-blue-500',    hover: 'group-hover:bg-blue-50',    badge: 'text-blue-700 bg-blue-50 border-blue-200',    path: '/enquiries' },
    { label: 'Quoted',         sub: 'draft / not sent', count: quotedEnqs.length, val: quoteVal(data.quotes.filter((q: any) => quotedEnqs.some((e: any) => e.id === q.enqRef))), color: 'text-purple-600', bar: 'bg-purple-500', hover: 'group-hover:bg-purple-50', badge: 'text-purple-700 bg-purple-50 border-purple-200', path: '/quotes' },
    { label: 'Awaiting PO',    sub: 'sent, no order yet', count: sentQts.length,  val: quoteVal(sentQts),  color: 'text-orange-600',  bar: 'bg-orange-500',  hover: 'group-hover:bg-orange-50',  badge: 'text-orange-700 bg-orange-50 border-orange-200', path: '/quotes' },
    { label: 'Won',            sub: 'PO received',      count: wonQts.length,     val: quoteVal(wonQts),   color: 'text-emerald-600', bar: 'bg-emerald-500', hover: 'group-hover:bg-emerald-50', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', path: '/quotes' },
    { label: 'Lost',           sub: 'enqs + quotes',    count: lostEnqs.length + lostQts.length, val: quoteVal(lostQts), color: 'text-red-600', bar: 'bg-red-500', hover: 'group-hover:bg-red-50', badge: 'text-red-700 bg-red-50 border-red-200', path: '/enquiries' },
    { label: 'Active Orders',  sub: 'in processing',    count: activeOrds.length, val: 0,                  color: 'text-teal-600',    bar: 'bg-teal-500',    hover: 'group-hover:bg-teal-50',    badge: 'text-teal-700 bg-teal-50 border-teal-200',    path: '/orders' },
  ];

  const maxCount = Math.max(...stages.map(s => s.count), 1);

  // Milestones to badge on a stage (key = stage label, value = threshold)
  // Thresholds match confetti milestones exactly — same numbers user sees celebrated
  const totalSentQuotes = data.quotes.filter((q: any) => q.status === 'Sent' || q.status === 'Won' || q.status === 'Lost').length;
  const STAGE_MILESTONES: Record<string, { threshold: number; label: string; count: number }[]> = {
    'Awaiting PO':   [{ threshold: 10, label: '10 Sent', count: totalSentQuotes }, { threshold: 50, label: '50 Sent', count: totalSentQuotes }, { threshold: 100, label: '100 Sent 🚀', count: totalSentQuotes }, { threshold: 250, label: '250 Sent 🔥', count: totalSentQuotes }],
    'Open Enquiries':[{ threshold: 10, label: '10 Enqs', count: openEnqs.length }, { threshold: 50, label: '50 Enqs', count: openEnqs.length }, { threshold: 100, label: '100 Enqs 🎯', count: openEnqs.length }, { threshold: 500, label: '500 Enqs 🏆', count: openEnqs.length }],
    'Won':           [{ threshold: 1,  label: 'First Win! 🎉', count: wonQts.length }, { threshold: 10, label: '10 Won 🏅', count: wonQts.length }, { threshold: 50, label: '50 Won 🥇', count: wonQts.length }],
    'Active Orders': [{ threshold: 5,  label: '5 Active', count: activeOrds.length }, { threshold: 10, label: '10 Active', count: activeOrds.length }],
  };

  function getStageBadge(label: string) {
    const milestones = STAGE_MILESTONES[label];
    if (!milestones) return null;
    const hit = [...milestones].reverse().find(m => m.count >= m.threshold);
    return hit ?? null;
  }

  return (
    <div className="bg-white border border-g200 rounded-[6px] overflow-hidden shadow-sm mb-3">
      <div className="p-[10px_16px] border-b border-g200 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">Sales Journey Pipeline</span>
        <span className="font-mono text-[9px] text-g400 tracking-[1px]">Click a stage to filter</span>
      </div>
      <div className="flex items-stretch">
        {stages.map((s, idx) => {
          const barPct = Math.max(12, Math.round((s.count / maxCount) * 100));
          const badge = getStageBadge(s.label);
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => navigate(s.path)}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 px-3 cursor-pointer transition-colors group focus:outline-none relative ${s.hover}`}
            >
              <div className="w-full flex justify-center mb-1">
                <div className={`${s.bar} rounded-sm transition-all duration-300 opacity-80 group-hover:opacity-100 pipeline-bar`}
                  style={{ '--bar-h': '4px', '--bar-w': `${Math.max(20, barPct)}%` } as React.CSSProperties} />
              </div>
              <span className={`font-mono text-[9px] font-bold tracking-[1.5px] uppercase ${s.color}`}>{s.label}</span>
              <span className="font-serif text-[20px] text-blk leading-none font-bold">{s.count}</span>
              <span className={`font-mono text-[10px] font-bold ${s.color}`}>{fmt(s.val)}</span>
              {'sub' in s && s.sub && (
                <span className="font-mono text-[8px] text-g400 tracking-wide">{s.sub}</span>
              )}
              {badge && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono text-[8px] font-bold border ${s.badge}`}>
                  🏆 {badge.label}
                </span>
              )}
              {idx < stages.length - 1 && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 text-g300 text-[10px] font-bold select-none pointer-events-none">›</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CAL_PILL_COLORS: Record<CalendarEvent['color'], { pill: string; dot: string }> = {
  purple: { pill: 'bg-purple-50 border border-purple-200 text-purple-700', dot: 'bg-purple-500' },
  red:    { pill: 'bg-red-50 border border-red-200 text-red-700',          dot: 'bg-red-500'    },
  teal:   { pill: 'bg-teal-50 border border-teal-200 text-teal-700',       dot: 'bg-teal-500'   },
  orange: { pill: 'bg-orange-50 border border-orange-200 text-orange-700', dot: 'bg-orange-500' },
};

function CalendarDayColumn({ date, events, isToday }: {
  date: Date;
  events: CalendarEvent[];
  isToday: boolean;
}) {
  const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const dayNum  = date.getDate();
  const monthShort = date.toLocaleDateString('en-GB', { month: 'short' });

  return (
    <div className={cn('flex flex-col min-h-[420px] border-r border-g200 last:border-r-0', isToday ? 'bg-red-50/40' : 'bg-white')}>
      <div className={cn('flex flex-col items-center py-2 border-b border-g200 shrink-0', isToday ? 'bg-red-50' : '')}>
        <span className={cn('font-mono text-[9px] font-bold tracking-[1.5px] uppercase', isToday ? 'text-red-mrt' : 'text-g400')}>
          {dayName}
        </span>
        <span className={cn('font-serif text-[20px] leading-none font-bold mt-0.5', isToday ? 'text-red-mrt' : 'text-blk')}>
          {dayNum}
        </span>
        <span className="font-mono text-[8px] text-g300 mt-0.5">{monthShort}</span>
      </div>
      <div className="flex flex-col gap-1 p-1.5 overflow-y-auto">
        {events.length === 0 && (
          <div className="text-[9px] text-g300 text-center mt-4 select-none">—</div>
        )}
        {events.map((evt, i) => {
          const c = CAL_PILL_COLORS[evt.color];
          return (
            <button
              key={`${evt.type}-${evt.id}-${i}`}
              type="button"
              onClick={evt.onClick}
              className={cn('w-full text-left px-2 py-1 rounded-[4px] flex items-start gap-1.5 transition-opacity hover:opacity-75 focus:outline-none', c.pill)}
            >
              <div className={cn('w-1.5 h-1.5 rounded-full mt-[3px] shrink-0', c.dot)} />
              <div className="min-w-0">
                <div className="font-mono text-[9px] font-bold truncate leading-tight">{evt.label}</div>
                <div className="text-[8.5px] text-g500 truncate leading-tight">{evt.sublabel}</div>
                {evt.contact && <div className="text-[8px] text-g400 truncate leading-tight">{evt.contact}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MDO_COLORS = {
  purple: { badge: 'bg-purple-100 text-purple-700', header: 'text-purple-700', dot: 'bg-purple-500' },
  red:    { badge: 'bg-red-100 text-red-600',       header: 'text-red-600',    dot: 'bg-red-500'    },
  orange: { badge: 'bg-orange-100 text-orange-700', header: 'text-orange-700', dot: 'bg-orange-500' },
  teal:   { badge: 'bg-teal-100 text-teal-700',     header: 'text-teal-700',   dot: 'bg-teal-500'   },
};

function MdoSection({
  title, count, color, expanded, onToggle, emptyText, children,
}: {
  title: string;
  count: number;
  color: keyof typeof MDO_COLORS;
  expanded: boolean;
  onToggle: () => void;
  emptyText: string;
  children: React.ReactNode;
}) {
  const c = MDO_COLORS[color];
  return (
    <div className="bg-white border border-g200 rounded-[8px] overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-[10px_14px] hover:bg-g50 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />
          <span className={cn('font-mono text-[9.5px] font-bold tracking-[1.5px] uppercase', c.header)}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full', c.badge)}>{count}</span>
          {expanded ? <ChevronDown size={12} className="text-g400" /> : <ChevronRight size={12} className="text-g400" />}
        </div>
      </button>
      {expanded && (
        count === 0 ? (
          <div className="px-4 py-3 text-[11.5px] text-g400 italic border-t border-g100">{emptyText}</div>
        ) : (
          <div className="border-t border-g100">{children}</div>
        )
      )}
    </div>
  );
}