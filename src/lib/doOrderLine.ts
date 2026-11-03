// 2026-11-03: a DO opened from the Dispatch board must be for the order line
// whose product IS the lot's product (NewStockOutward.tsx). The lot's product
// is turned into its billing name (Stock Inward catalogue, e.g. "Beta Pinene
// 95%" → "Beta Pinene") and compared with each order line's product name.
import type { DispatchEntry, Order } from './types';
import { remainingByLine } from './utils';

const norm = (s: string | undefined | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The lot's product as the order would name it: its billing name, else the lot's own name. */
export const lotBillingName = (lotProduct: string, billingFor: (name: string) => string) =>
  billingFor(lotProduct) || lotProduct;

const exactMatch = (desc: string | undefined, lotBilling: string) => !!norm(lotBilling) && norm(desc) === norm(lotBilling);
const prefixMatch = (desc: string | undefined, lotBilling: string) => {
  const a = norm(desc), b = norm(lotBilling);
  return !!a && !!b && (a.startsWith(b) || b.startsWith(a));
};

/** Order lines for the lot's product: exact name matches, else "one starts with the other" ones. */
export function orderLinesForLot(o: Order, lotBilling: string) {
  const exact = o.items.filter(i => exactMatch(i.desc, lotBilling));
  return exact.length ? exact : o.items.filter(i => prefixMatch(i.desc, lotBilling));
}

/**
 * 2026-11-03 (user decision): one order line may be on several rows of a DO
 * (one product filled from 2+ lots). Per order line: its rows' barrels added
 * up and their row numbers (1-based), for the "line's rows ≤ remaining" check.
 */
export function barrelsByOrderLine(rows: { orderLineSeq: number | null; numArticles: string }[]) {
  const sums = new Map<number, { sum: number; rows: number[] }>();
  rows.forEach((r, i) => {
    if (r.orderLineSeq == null) return;
    const s = sums.get(r.orderLineSeq) ?? { sum: 0, rows: [] };
    const n = Number((r.numArticles ?? '').trim());
    s.sum += (r.numArticles ?? '').trim() !== '' && Number.isFinite(n) ? n : 0;
    s.rows.push(i + 1);
    sums.set(r.orderLineSeq, s);
  });
  return sums;
}

/** The "too many barrels for the order line" message for one row, or ''. `onDo` = the line's rows when it is on 2+ rows. */
export function orderOverMessage(barrels: number, orderNeeds: number | null, desc: string, onDo: { sum: number; rows: number[] } | null): string {
  if (orderNeeds === null) return '';
  const needs = `Order needs only ${orderNeeds} barrel${orderNeeds === 1 ? '' : 's'} of ${desc}`;
  if (onDo) return onDo.sum > orderNeeds ? `${needs} — rows ${onDo.rows.join(' + ')} of this DO add up to ${onDo.sum}.` : '';
  return barrels > orderNeeds ? `${needs} — you entered ${barrels}.` : '';
}

/**
 * The order line a DO for this lot should use, or null if the lot's product
 * isn't in the order. Lines with barrels left win; among those the line
 * already picked stays, else the first.
 * 2026-11-03 (one DO, many products): `taken` = order lines other rows of the
 * same DO already use — free lines win; if only taken lines match, one of
 * them is still returned and the form shows the duplicate.
 */
export function orderLineSeqForLot(o: Order, entries: DispatchEntry[], lotBilling: string, currentSeq: number | null, taken: Set<number> = new Set()): number | null {
  const all = orderLinesForLot(o, lotBilling);
  if (!all.length) return null;
  const free = all.filter(i => !taken.has(i.seq));
  const matches = free.length ? free : all;
  const remaining = remainingByLine(o, entries);
  const withBarrels = matches.filter(i => (remaining.get(i.seq) ?? 0) > 0);
  const pool = withBarrels.length ? withBarrels : matches;
  return (pool.find(i => i.seq === currentSeq) ?? pool[0]).seq;
}
