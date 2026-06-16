import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { OrderAdjustment, Customer } from './types';

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

export const generateId = (prefix: string, existingIds: string[]) => {
  const yr = new Date().getFullYear();
  let maxNum = 0;
  for (const id of existingIds) {
    const match = id.match(new RegExp(`${prefix}-\\d+-(\\d+)`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-${yr}-${String(maxNum + 1).padStart(3, '0')}`;
};
