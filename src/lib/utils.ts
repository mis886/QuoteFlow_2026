import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { OrderAdjustment, Customer, NegotiationRound, NegotiationRoundItem, QuoteItem, Quote } from './types';

export const ALLOWED_DELETE_EMAILS = ['shishir@himalayaterpene.com', 'mis@himalayaterpene.com'];

// ── Payment Terms — shared across Orders, Quotations, and Customers ──────────

export const PAY_OPTIONS = [
  '3 Days', '7 Days', '14 Days', '30 Days Net', '45 Days', '60 Days',
  '90 Days', '120 Days', '50% Advance, 50% on Delivery', '100% Advance',
  'LC at Sight', 'Advance',
] as const;

/** Advance-type terms that require a PI (Proforma Invoice) rather than an OC (Order Confirmation). */
export const ADVANCE_PAY = new Set<string>(['Advance', '100% Advance']);

// Shared allowlist for order-side actions gated to Accounts/Mumbai office:
// confirming payment received (Order Confirmed) and marking an order Complete
// (Delivered). Both checks currently allow the same two people — one list,
// two named predicates so call sites stay self-documenting about which
// permission they're actually checking.
export const ALLOWED_ORDER_ACTION_EMAILS = ['accounts@himalayaterpene.com', 'mum@himalayaterpene.com'];
export const canConfirmPayment = (email: string | null | undefined): boolean =>
  ALLOWED_ORDER_ACTION_EMAILS.includes((email ?? '').toLowerCase());
export const canCompleteOrder = (email: string | null | undefined): boolean =>
  ALLOWED_ORDER_ACTION_EMAILS.includes((email ?? '').toLowerCase());

export function normalizePayTerms(raw: string | undefined): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  const exact = (PAY_OPTIONS as readonly string[]).find(o => o.toLowerCase() === lower);
  if (exact) return exact;
  if (/100.*adv|adv.*100/.test(lower)) return '100% Advance';
  if (/50.*adv|adv.*50/.test(lower)) return '50% Advance, 50% on Delivery';
  if (/lc|sight/.test(lower)) return 'LC at Sight';
  if (/120/.test(lower)) return '120 Days';
  if (/90/.test(lower)) return '90 Days';
  if (/60/.test(lower)) return '60 Days';
  if (/45/.test(lower)) return '45 Days';
  if (/30/.test(lower)) return '30 Days Net';
  if (/14/.test(lower)) return '14 Days';
  if (/7/.test(lower)) return '7 Days';
  if (/3/.test(lower)) return '3 Days';
  if (/adv/.test(lower)) return 'Advance';
  return '';
}
export const canDeleteRecords = (email: string | null | undefined): boolean =>
  ALLOWED_DELETE_EMAILS.includes((email ?? '').toLowerCase());

/**
 * Returns a display label for a site — "City — Branch" or just whichever part exists.
 * Pass the customer record + the siteId stored on the doc (quote/order/enquiry).
 */
export function siteLabel(customer: Customer | undefined, siteId: string | undefined | null): string {
  if (!customer) return '';
  const site = (siteId && customer.sites.find(s => s.id === siteId))
    || customer.sites.find(s => s.isPrimary)
    || customer.sites[0];
  if (!site) return '';
  const city = site.city?.trim() || '';
  const branch = (site.name?.trim() && site.name.trim() !== customer.name.trim()) ? site.name.trim() : '';
  if (city && branch) return `${city} — ${branch}`;
  return city || branch || site.state?.trim() || '';
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Order taxes & charges ────────────────────────────────────────────────────
// Each adjustment resolves to a signed rupee amount (% lines computed on the
// items sub-total excl. GST; + adds, − deducts).
//
// Crucially, a `taxable` adjustment (e.g. Packing & Forwarding, Freight that's
// part of the supply value) is added to the taxable base BEFORE GST, and GST is
// then charged on that combined value at the order's highest item GST rate.
// Non-taxable lines (e.g. TDS, TCS) apply to the total AFTER GST.
//
// Worked example (the customer's case): Sub 6000 + P&F 0.5% (=30, taxable) →
// taxable value 6030; GST @18% = 1085.40; grand = 7115.40. Correct.
export interface ResolvedAdjustment extends OrderAdjustment {
  amount: number;   // signed: + adds to total, − deducts
}

export interface AdjustedTotals {
  lines: ResolvedAdjustment[];
  preNet: number;        // signed sum of taxable (pre-GST) adjustments
  postNet: number;       // signed sum of post-GST adjustments
  chargeGst: number;     // GST charged on the taxable adjustments (at maxGstRate)
  net: number;           // preNet + chargeGst + postNet (total added beyond sub+itemGst)
  taxableValue: number;  // subTotal + preNet
  gstTotal: number;      // itemGst + chargeGst
  grand: number;         // subTotal + preNet + itemGst + chargeGst + postNet
}

export function resolveAdjustments(
  adjustments: OrderAdjustment[] | undefined,
  subTotal: number,
  itemGst = 0,
  maxGstRate = 0,
): AdjustedTotals {
  const lines: ResolvedAdjustment[] = (adjustments || []).map(a => {
    const base = a.mode === 'percent' ? (subTotal * (Number(a.rate) || 0)) / 100 : (Number(a.rate) || 0);
    const amount = a.direction === 'deduct' ? -base : base;
    return { ...a, amount };
  });
  const preNet  = lines.filter(l => l.taxable).reduce((s, l) => s + l.amount, 0);
  const postNet = lines.filter(l => !l.taxable).reduce((s, l) => s + l.amount, 0);
  const chargeGst = (preNet * maxGstRate) / 100;
  const gstTotal = itemGst + chargeGst;
  const taxableValue = subTotal + preNet;
  return {
    lines, preNet, postNet, chargeGst,
    net: preNet + chargeGst + postNet,
    taxableValue, gstTotal,
    grand: subTotal + preNet + gstTotal + postNet,
  };
}

/** Highest GST% across an order's line items — used as the rate for taxable charges. */
export function maxItemGstRate(items: { gst: number }[]): number {
  return items.reduce((m, i) => Math.max(m, Number(i.gst) || 0), 0);
}

/** Returns YYYY-MM-DD in local time (avoids UTC offset shift from toISOString) */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns YYYY-MM-DDTHH:mm in local time for datetime-local inputs */
export function localDateTimeStr(d: Date): string {
  return `${localDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const formatINR = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatUSD = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// ── Quote line-item totals — shared by the quote form/edit item table and
// the negotiation-round picker/display, so both compute Amount / Subtotal /
// GST Total / Grand Total identically. ───────────────────────────────────

// Amount for one line item: qty * packing-size * price-basis-conversion * unit price.
// Mirrors NewQuote.tsx's updateItem() total calc exactly.
export function computeItemTotal(qty: number, packing: string | undefined, unitPrice: number, priceBasisConv: number = 1): number {
  const packingNum = parseFloat(packing || '') || 0;
  const totalQty = Number(qty) * (packingNum || 1);
  return totalQty * (Number(priceBasisConv) || 1) * Number(unitPrice);
}

export interface QuoteTotals {
  subTotal: number;
  gstTotal: number;
  grandTotal: number;
}

// Subtotal / GST total / grand total for a set of items — mirrors NewQuote.tsx's
// totals calc exactly (GST base = subtotal + insurance; non-INR skips GST/insurance).
export function computeQuoteTotals(items: { total: number; gst: number }[], curr: string, insurance: number): QuoteTotals {
  const subTotal = items.reduce((s, i) => s + i.total, 0);
  const ins = curr === 'INR' ? insurance : 0;
  const gstTotal = curr === 'INR' && subTotal > 0
    ? items.reduce((s, i) => s + i.total * i.gst / 100, 0) * (subTotal + ins) / subTotal
    : 0;
  const grandTotal = curr === 'INR' ? Math.round(subTotal + ins + gstTotal) : subTotal;
  return { subTotal, gstTotal, grandTotal };
}

// ── Negotiation rounds — "what's the current price" for a quote ──────────

// A discount_pct with no explicit revised_unit_price is applied against
// original_unit_price rather than requiring the caller to hand-calculate it.
export function effectiveNegotiatedPrice(it: NegotiationRoundItem): number | null {
  if (it.revised_unit_price != null) return it.revised_unit_price;
  if (it.discount_pct != null) return it.original_unit_price * (1 - it.discount_pct / 100);
  return null;
}

// Effective items for a quote as of a given round in its negotiation
// history: fold every round with round <= roundNumber, in order (oldest to
// newest), tracking the latest revised price found per seq. A later round
// only overwrites the seqs it actually touched — an item a later round
// doesn't mention keeps whatever revision an earlier round gave it, instead
// of resetting to the original price just because the most recent round
// considered didn't mention it. A round only ever stores the items it
// actually touched, so this merges by seq rather than treating any single
// round's items[] as the whole item list: a negotiation amends prices on the
// existing quote, it doesn't redefine which products are being quoted.
//
// Filtered/sorted by `round` explicitly rather than trusting array order or
// slicing the array: rounds are always appended in order with
// round = (prior length + 1) today, but doing this by round number means it
// can't silently regress if that invariant ever stops holding (e.g. a future
// edit/reorder feature), and lets callers ask "as of round N" for any N, not
// just "all rounds" or "up to array index N".
export function getEffectiveItemsUpToRound(quote: Pick<Quote, 'items' | 'negotiations'>, roundNumber: number): QuoteItem[] {
  const rounds = (quote.negotiations ?? [])
    .filter(r => r.round <= roundNumber)
    .sort((a, b) => a.round - b.round);
  const latestPriceBySeq = new Map<number, number>();
  for (const round of rounds) {
    for (const it of round.items) {
      const price = effectiveNegotiatedPrice(it);
      if (price != null) latestPriceBySeq.set(it.seq, price);
    }
  }
  if (latestPriceBySeq.size === 0) return quote.items;
  return quote.items.map(item => {
    const price = latestPriceBySeq.get(item.seq);
    if (price == null) return item;
    return { ...item, unitPrice: price, total: computeItemTotal(item.qty, item.packing, price, item.priceBasisConv) };
  });
}

// Current (i.e. as of the latest round — every negotiation applied) effective
// items for a quote. Thin wrapper over getEffectiveItemsUpToRound so there's
// one fold implementation, not two that could drift apart.
export function getCurrentQuoteItems(items: QuoteItem[], negotiations: NegotiationRound[] | undefined): QuoteItem[] {
  return getEffectiveItemsUpToRound({ items, negotiations }, Number.POSITIVE_INFINITY);
}

// Subtotal/GST/Grand Total for a quote as of a given round in its negotiation
// history — getEffectiveItemsUpToRound()'s resolved prices fed through the
// exact same computeQuoteTotals() formula used for a quote's original
// totals, so per-round boxes, the "current" total, and the original total
// can never compute the math differently from one another.
export function getEffectiveTotalsUpToRound(quote: Pick<Quote, 'items' | 'negotiations' | 'curr' | 'insurance'>, roundNumber: number): QuoteTotals {
  const effectiveItems = getEffectiveItemsUpToRound(quote, roundNumber);
  return computeQuoteTotals(effectiveItems, quote.curr, quote.insurance ?? 0);
}

// Current (as of the latest round) totals for a quote. Thin wrapper over
// getEffectiveTotalsUpToRound — call sites should use this instead of
// re-deriving subtotal/GST/grand total by hand from getCurrentQuoteItems()'s
// output.
export function getEffectiveTotals(quote: Pick<Quote, 'items' | 'negotiations' | 'curr' | 'insurance'>): QuoteTotals {
  return getEffectiveTotalsUpToRound(quote, Number.POSITIVE_INFINITY);
}

// Per-item row shape for a negotiation round's export table — same fields
// the PDF/DOCX item table already renders (Sr No/desc/hsn/qty/packing/
// totalQty/packingType/rate/per), just sourced from the round's own items
// (the touched subset, matching what the in-app Form step's negotiation
// sections show) rather than the whole quote.
export interface NegotiationExportItem {
  seq: number;
  desc: string;
  hsn: string;
  qty: number;
  packing: string;
  totalQty: string;
  packingType: string;
  rate: number;
  perUnit: string;
}

export interface NegotiationExportTable {
  round: number;
  date: string;
  items: NegotiationExportItem[];
  totals: QuoteTotals;
  insurance: number;
}

// One export-ready table per negotiation round, in round order — used by
// both the PDF and DOCX generators to render a "Negotiation N — Revised
// Pricing" table after the main item table, mirroring the same column set.
export function getNegotiationExportTables(quote: Pick<Quote, 'negotiations' | 'curr' | 'insurance'>): NegotiationExportTable[] {
  const rounds = quote.negotiations ?? [];
  const insurance = quote.insurance ?? 0;
  return rounds.map(r => {
    const items: NegotiationExportItem[] = r.items.map(it => {
      const packingNum = parseFloat(it.packing || '') || 0;
      const totalQty = it.qty && packingNum ? String(it.qty * packingNum) : '';
      const pb = it.priceBasis?.trim();
      const perUnit = !pb ? 'kg' : pb.startsWith('Per ') ? pb.slice(4) : pb;
      return {
        seq: it.seq,
        desc: it.desc,
        hsn: it.hsn,
        qty: it.qty,
        packing: it.packing || '',
        totalQty,
        packingType: it.packingType || '',
        rate: effectiveNegotiatedPrice(it) ?? it.original_unit_price,
        perUnit,
      };
    });
    const totals = computeQuoteTotals(
      r.items.map(it => ({
        total: computeItemTotal(it.qty, it.packing, effectiveNegotiatedPrice(it) ?? it.original_unit_price, 1),
        gst: it.gst,
      })),
      quote.curr,
      insurance,
    );
    return { round: r.round, date: r.date, items, totals, insurance };
  });
}

// Format a Date in Asia/Kolkata (IST, UTC+5:30) using date-fns-style tokens.
// Supported tokens: yyyy, yy, MMM, MM, dd, d, EEE, HH, hh, mm, a, aa
const IST_TZ = 'Asia/Kolkata';
const _istParts = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TZ,
    year: 'numeric', month: 'short', day: '2-digit',
    weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});
  const hour24 = parseInt(p.hour === '24' ? '00' : p.hour, 10);
  const hour12 = ((hour24 + 11) % 12) + 1;
  return {
    yyyy: p.year,
    yy: p.year.slice(-2),
    MMM: p.month,
    MM: String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(p.month) + 1).padStart(2, '0'),
    dd: p.day,
    d: String(parseInt(p.day, 10)),
    EEE: p.weekday,
    HH: String(hour24).padStart(2, '0'),
    hh: String(hour12).padStart(2, '0'),
    mm: p.minute,
    a: hour24 < 12 ? 'AM' : 'PM',
    aa: hour24 < 12 ? 'AM' : 'PM',
  };
};
export function fmtIST(d: Date, pattern: string): string {
  const t = _istParts(d);
  return pattern.replace(/yyyy|yy|MMM|MM|dd|EEE|HH|hh|mm|aa|a|d/g, (m) => (t as any)[m] ?? m);
}

// Convert ISO date string (YYYY-MM-DD) to display format (dd-MMM-yyyy)
// e.g. '2026-05-13' → '13-May-2026'
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d).padStart(2, '0')}-${months[m - 1]}-${y}`;
}

export const calculateAgeHours = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  return Math.max(0, (now.getTime() - date.getTime()) / 3600000);
};

// TAT (turnaround) health for a card sitting in a stage.
// `enteredAt` = when it entered the stage, `tatHours` = allowed hours.
// Returns 'none' when no TAT (e.g. Closed), else green→amber(≥80%)→red(breached).
export type TatHealth = 'ok' | 'warn' | 'breach' | 'none';
export function tatHealth(
  enteredAt: string | null | undefined,
  tatHours: number
): { health: TatHealth; elapsedH: number; pct: number; overdueH: number } {
  if (!enteredAt || !tatHours || tatHours <= 0) {
    return { health: 'none', elapsedH: 0, pct: 0, overdueH: 0 };
  }
  const elapsedH = calculateAgeHours(enteredAt);
  const pct = elapsedH / tatHours;
  const overdueH = Math.max(0, elapsedH - tatHours);
  let health: TatHealth = 'ok';
  if (pct >= 1) health = 'breach';
  else if (pct >= 0.8) health = 'warn';
  return { health, elapsedH, pct, overdueH };
}

// Compact "2d 4h" / "5h" elapsed label.
export function fmtElapsed(hours: number): string {
  const h = Math.floor(hours);
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem ? `${d}d ${rem}h` : `${d}d`;
}

// Working hours: Mon–Sat 09:00–18:00
export function addWorkingHours(from: Date, hours: number): { date: string; time: string } {
  let d = new Date(from);
  let remaining = hours * 60;
  while (remaining > 0) {
    d = new Date(d.getTime() + 60_000);
    const day = d.getDay();
    const h = d.getHours();
    if (day !== 0 && h >= 9 && h < 18) remaining--;
  }
  return {
    date: localDateStr(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

// Convert a Quote's structured terms (JSON string from NewQuote) into
// human-readable numbered lines suitable for an Order's terms textarea.
// If the input isn't JSON, returns it unchanged.
const TNC_LABELS: { key: string; label: string }[] = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'leadTime', label: 'Lead Time' },
  { key: 'pnf',      label: 'Packing & Fwd' },
  { key: 'freight',  label: 'Freight' },
  { key: 'payment',  label: 'Payment' },
  { key: 'validity', label: 'Validity' },
  { key: 'taxes',    label: 'Taxes' },
];

// Strip an existing "1." / "2)" / "- " / "• " prefix so we can renumber cleanly.
function stripLinePrefix(line: string): string {
  return line.replace(/^\s*(?:\d+\s*[.)\]:-]|[-•])\s+/, '').trim();
}

// Take any mix of (a) a JSON terms blob at the start, (b) free-text lines,
// (c) already-numbered lines, and return a clean newline-separated
// numbered list. Always safe to call repeatedly.
export function parseQuoteTerms(raw: string | undefined | null): string {
  if (!raw) return '';
  let body = raw.trim();
  const collectedLines: string[] = [];

  // If the string starts with a JSON object, extract it (find matching brace)
  // and expand it into key/value lines.
  if (body.startsWith('{')) {
    let depth = 0;
    let endIdx = -1;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx > 0) {
      const jsonSlice = body.slice(0, endIdx + 1);
      try {
        const parsed = JSON.parse(jsonSlice) as Record<string, string>;
        TNC_LABELS.forEach(({ key, label }) => {
          const value = (parsed[key] || '').trim();
          if (value) collectedLines.push(`${label}: ${value}`);
        });
        body = body.slice(endIdx + 1).trim();
      } catch {
        /* fall through — treat whole thing as text */
      }
    }
  }

  // Append remaining text lines (each gets de-prefixed so renumbering is clean)
  body
    .split(/\r?\n/)
    .map(stripLinePrefix)
    .filter(line => line.length > 0)
    .forEach(line => collectedLines.push(line));

  // Renumber every line as "1. …", "2. …" etc.
  return collectedLines.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

export function isInDateRange(
  dateStr: string | undefined | null,
  range: { startDate: string; endDate: string } | null
): boolean {
  if (!range || (!range.startDate && !range.endDate)) return true;
  if (!dateStr) return false;
  // Parse to Date and extract LOCAL date parts — avoids UTC offset shifting
  // e.g. "2026-05-19T22:53:00Z" is 2026-05-20 in IST (UTC+5:30)
  const d = localDateStr(new Date(dateStr));
  if (range.startDate && d < range.startDate) return false;
  if (range.endDate && d > range.endDate) return false;
  return true;
}

export function resolveDateRange(preset: string): { startDate: string; endDate: string } {
  const now = new Date();
  const iso = localDateStr;

  if (preset === 'today') {
    const s = iso(now);
    return { startDate: s, endDate: s };
  }
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const s = iso(y);
    return { startDate: s, endDate: s };
  }
  if (preset === 'last-7-days') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { startDate: iso(start), endDate: iso(now) };
  }
  if (preset === 'this-week') {
    const { start, end } = getThisWeekRange();
    return { startDate: iso(start), endDate: iso(end) };
  }
  if (preset === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: iso(start), endDate: iso(end) };
  }
  if (preset === 'this-quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0);
    return { startDate: iso(start), endDate: iso(end) };
  }
  if (preset === 'this-year') {
    return { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` };
  }
  return { startDate: '', endDate: '' };
}

export function getThisWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, …
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMon);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Lowercases and strips everything that isn't a letter or digit, so
 * punctuation/spacing differences ("A.K BHAYANI & SONS" vs "ak bhayani sons")
 * don't prevent a match — e.g. "A.K BHAYANI & SONS" normalizes to
 * "akbhayanisons", so a search for "ak" (no period) still finds it.
 */
export function normalizeSearchText(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Returns a search-relevance tier for ranking rows by customer/company name
 * match, optionally boosted by exact matches on other reference fields (ID,
 * PO number, linked quote/enquiry ref, etc.) that the same search box also
 * matches against.
 * 0 = name is an exact match, OR one of exactMatches is an exact match
 *     (case-insensitive) — an exact ref/PO/ID hit is as strong a signal as an
 *     exact name hit, so both share the top tier.
 * 1 = name starts with query, 2 = name contains query elsewhere,
 * 3 = match was against some other field only partially (item description,
 *     etc.) — deliberately excludes exactMatches' fields, which are already
 *     covered by tier 0; a partial hit there isn't a strong enough signal to
 *     rank above a loose name match.
 * The three name-based checks compare normalizeSearchText(name) against
 * normalizeSearchText(query), so punctuation differences don't push a
 * genuine match down to the fallback tier. exactMatches is intentionally
 * compared on raw lowercased values, not normalized — those are exact
 * ref/ID/PO hits from a different, unrelated fix and are out of scope here.
 * Apply as a stable second sort after the table's primary column sort so that
 * within each tier the column order is preserved.
 */
export function nameTier(name: string, query: string, exactMatches: (string | undefined | null)[] = []): 0 | 1 | 2 | 3 {
  const q = query.toLowerCase();
  if (exactMatches.some(v => (v ?? '').toLowerCase() === q)) return 0;
  const n = normalizeSearchText(name);
  const nq = normalizeSearchText(query);
  if (n === nq) return 0;
  if (n.startsWith(nq)) return 1;
  if (n.includes(nq)) return 2;
  return 3;
}

export const generateId = (prefix: string, existingIds: (string | undefined | null)[]) => {
  const yr = new Date().getFullYear();
  let maxNum = 0;
  for (const id of existingIds) {
    if (!id) continue;
    const match = id.match(new RegExp(`${prefix}-\\d+-(\\d+)`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-${yr}-${String(maxNum + 1).padStart(3, '0')}`;
};
