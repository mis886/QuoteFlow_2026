// Buying pattern per customer + product, built from Tally sales data in Supabase.
// Replaces the Google Sheet "Product_Dashboard". Pure calculation, no UI.
// Used by the "By Product" view of the Customer Intel page.

import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PatternStatus = 'Overdue' | 'Due soon' | 'On track' | 'Lost?' | 'Not enough history';

/** A growth figure: a % number, "New" (previous was 0), or "—" (both 0). */
export type Growth = number | 'New' | '—';

export interface FyVolume {
  fy: string;          // e.g. "23-24"
  kg: number;
  lts: number;
  isCurrent: boolean;  // true = current FY, year-to-date
}

export interface FyGrowth {
  label: string;       // e.g. "24-25 vs 23-24"
  value: Growth;
}

export interface BuyingPatternRow {
  customerKey: string;
  customerName: string;
  product: string;
  lastOrderDate: string;          // YYYY-MM-DD
  orderDates: string[];           // distinct invoice dates, oldest first
  orders: number;
  fyVolumes: FyVolume[];          // last 4 completed FYs + current FY
  growth: FyGrowth[];             // between consecutive completed FYs
  currentYtdVsLastYear: Growth;
  avgGapDays: number | null;
  predictedOrderDate: string | null;
  callDate: string | null;
  status: PatternStatus;
}

export interface BuyingPatternData {
  rows: BuyingPatternRow[];
  dataUpdatedTill: string | null; // YYYY-MM-DD
  productList: string[];
  fyLabels: string[];             // same order as each row's fyVolumes
}

export interface TallySaleRow {
  company_name: string | null;
  product_name: string | null;
  qty_num: number | string | null;
  unit: string | null;
  invoice_date: string | null;
}

export interface CustomerMapRow {
  tally_name_key: string;
  customer_label: string | null;
  customer_id: string | null;
  ignored: boolean | null;
}

export interface ProductMapRow {
  tally_name_key: string;
  product_label: string | null;
  ignored: boolean | null;
}

// ── Small date helpers (dates are plain "YYYY-MM-DD" strings) ─────────────────

const DAY_MS = 86_400_000;

// Turn "YYYY-MM-DD" into a whole day number, so we can subtract dates safely.
function toDayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

// Turn a day number back into "YYYY-MM-DD".
function fromDayNum(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

// Today's date on this computer, as "YYYY-MM-DD".
export function todayIso(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// Financial year runs 1-Apr to 31-Mar. Return the year it starts in.
function fyStartYear(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 4 ? y : y - 1;
}

// FY label: 2023 → "23-24".
function fyLabel(startYear: number): string {
  const two = (n: number) => String(n % 100).padStart(2, '0');
  return `${two(startYear)}-${two(startYear + 1)}`;
}

// The same calendar day one year earlier (29-Feb becomes 28-Feb).
function oneYearEarlier(iso: string): string {
  const y = Number(iso.slice(0, 4)) - 1;
  let md = iso.slice(5);
  if (md === '02-29') md = '02-28';
  return `${y}-${md}`;
}

// Growth from `prev` to `cur`, following the sheet's rules.
function growth(prev: number, cur: number): Growth {
  if (prev === 0) return cur > 0 ? 'New' : '—';
  return ((cur - prev) / prev) * 100;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();

// ── Main calculation ──────────────────────────────────────────────────────────

/**
 * Build one row per customer + product from raw Tally sales and the two name maps.
 * `today` is passed in (YYYY-MM-DD) so the result is easy to test.
 */
export function buildBuyingPatterns(
  sales: TallySaleRow[],
  customerMaps: CustomerMapRow[],
  productMaps: ProductMapRow[],
  today: string = todayIso(),
): { rows: BuyingPatternRow[]; productList: string[]; fyLabels: string[] } {
  // Step 1: make quick lookups for the two maps, keyed by UPPER(TRIM(name)).
  const custByKey = new Map(customerMaps.map(m => [norm(m.tally_name_key), m]));
  const prodByKey = new Map(productMaps.map(m => [norm(m.tally_name_key), m]));

  // Step 2: work out which FYs to show — last 4 completed + the current one.
  const curFy = fyStartYear(today);
  const fyYears = [curFy - 4, curFy - 3, curFy - 2, curFy - 1, curFy];
  const fyLabels = fyYears.map(fyLabel);

  // Date ranges for "this FY so far" vs "same period last year".
  const ytdFrom = `${curFy}-04-01`;
  const lyFrom = `${curFy - 1}-04-01`;
  const lyTo = oneYearEarlier(today);

  // Step 3: join each sale to its maps and group by customer + product.
  interface Group {
    customerKey: string;
    customerName: string;
    product: string;
    dates: Set<string>;
    kg: Map<number, number>;   // FY start year → kg
    lts: Map<number, number>;  // FY start year → lts
    ytd: number;               // kg + lts, this FY till today
    lastYearSamePeriod: number;
  }
  const groups = new Map<string, Group>();

  for (const s of sales) {
    if (!s.invoice_date) continue;
    const cm = custByKey.get(norm(s.company_name));
    const pm = prodByKey.get(norm(s.product_name));

    // Skip ignored names and names with no label.
    if (!cm || !pm || cm.ignored || pm.ignored) continue;
    const customerLabel = (cm.customer_label ?? '').trim();
    const productLabel = (pm.product_label ?? '').trim();
    if (!customerLabel || !productLabel) continue;

    const customerKey = cm.customer_id || customerLabel.toUpperCase();
    const key = `${customerKey}||${productLabel}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        customerKey, customerName: customerLabel, product: productLabel,
        dates: new Set(), kg: new Map(), lts: new Map(), ytd: 0, lastYearSamePeriod: 0,
      };
      groups.set(key, g);
    }

    const date = s.invoice_date.slice(0, 10);
    // Same customer + product + same date = ONE order.
    g.dates.add(date);

    // Volume: only kg and lts count; "nos" and blank units are left out.
    const unit = (s.unit ?? '').toLowerCase();
    const qty = Number(s.qty_num) || 0;
    if (unit !== 'kg' && unit !== 'lts') continue;
    const fy = fyStartYear(date);
    const bucket = unit === 'kg' ? g.kg : g.lts;
    bucket.set(fy, (bucket.get(fy) ?? 0) + qty);

    if (date >= ytdFrom && date <= today) g.ytd += qty;
    if (date >= lyFrom && date <= lyTo) g.lastYearSamePeriod += qty;
  }

  // Step 4: turn each group into a finished row.
  const todayNum = toDayNum(today);
  const rows: BuyingPatternRow[] = [];

  for (const g of groups.values()) {
    const orderDates = [...g.dates].sort();
    const orders = orderDates.length;
    const lastOrderDate = orderDates[orders - 1];

    // Volumes per FY.
    const fyVolumes: FyVolume[] = fyYears.map((y, i) => ({
      fy: fyLabels[i],
      kg: g.kg.get(y) ?? 0,
      lts: g.lts.get(y) ?? 0,
      isCurrent: y === curFy,
    }));

    // Growth between each pair of completed FYs (kg + lts together).
    const completed = fyVolumes.filter(v => !v.isCurrent);
    const growthList: FyGrowth[] = [];
    for (let i = 1; i < completed.length; i++) {
      const prev = completed[i - 1].kg + completed[i - 1].lts;
      const cur = completed[i].kg + completed[i].lts;
      growthList.push({ label: `${completed[i].fy} vs ${completed[i - 1].fy}`, value: growth(prev, cur) });
    }

    // Average gap between orders — only when there are at least 3 orders.
    let avgGapDays: number | null = null;
    if (orders >= 3) {
      const first = toDayNum(orderDates[0]);
      const last = toDayNum(lastOrderDate);
      // The average of consecutive gaps = total span ÷ number of gaps.
      avgGapDays = Math.round((last - first) / (orders - 1));
    }

    // Next expected order, and the day to call (5 days before it).
    const lastNum = toDayNum(lastOrderDate);
    const predictedNum = avgGapDays !== null ? lastNum + avgGapDays : null;
    const callNum = predictedNum !== null ? predictedNum - 5 : null;

    // Status, checked in this order.
    let status: PatternStatus;
    if (avgGapDays !== null && todayNum - lastNum > 3 * avgGapDays) status = 'Lost?';
    else if (callNum !== null && callNum < todayNum) status = 'Overdue';
    else if (callNum !== null && callNum <= todayNum + 7) status = 'Due soon';
    else if (callNum !== null) status = 'On track';
    else status = 'Not enough history';

    rows.push({
      customerKey: g.customerKey,
      customerName: g.customerName,
      product: g.product,
      lastOrderDate,
      orderDates,
      orders,
      fyVolumes,
      growth: growthList,
      currentYtdVsLastYear: growth(g.lastYearSamePeriod, g.ytd),
      avgGapDays,
      predictedOrderDate: predictedNum !== null ? fromDayNum(predictedNum) : null,
      callDate: callNum !== null ? fromDayNum(callNum) : null,
      status,
    });
  }

  // Step 5: the list of products for the dropdown, A → Z.
  const productList = [...new Set(rows.map(r => r.product))].sort((a, b) => a.localeCompare(b));

  return { rows, productList, fyLabels };
}

// ── Loading from Supabase ─────────────────────────────────────────────────────

// Supabase returns at most 1000 rows per request, so ask page by page until a
// page comes back short.
async function fetchAll<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as unknown as T[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

/** Load everything the "By Product" view needs. */
export async function loadBuyingPatterns(): Promise<BuyingPatternData> {
  // Load the sales rows, both maps and the latest sync log row at the same time.
  const [sales, customerMaps, productMaps, logRes] = await Promise.all([
    fetchAll<TallySaleRow>('tally_sales', 'id, company_name, product_name, qty_num, unit, invoice_date', 'id'),
    fetchAll<CustomerMapRow>('customer_name_map', 'tally_name_key, customer_label, customer_id, ignored', 'tally_name_key'),
    fetchAll<ProductMapRow>('product_name_map', 'tally_name_key, product_label, ignored', 'tally_name_key'),
    supabase.from('tally_sync_log').select('max_date').order('uploaded_at', { ascending: false }).limit(1),
  ]);
  if (logRes.error) throw new Error(`tally_sync_log: ${logRes.error.message}`);

  const { rows, productList, fyLabels } = buildBuyingPatterns(sales, customerMaps, productMaps);
  const dataUpdatedTill = (logRes.data?.[0] as { max_date: string | null } | undefined)?.max_date ?? null;
  return { rows, dataUpdatedTill, productList, fyLabels };
}
