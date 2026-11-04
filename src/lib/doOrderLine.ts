// 2026-11-03: a DO row linked to an order is for the order line whose product
// IS the lot's product (NewStockOutward.tsx). The lot's product is turned into
// its billing name (Stock Inward catalogue, e.g. "Beta Pinene 95%" → "Beta
// Pinene") and compared with each order line's product name.
// 2026-11-04 (user decision): a product NOT in the order is allowed — the row
// then keeps its picked / own line (orderLineForRow); nothing is blocked.
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

/**
 * 2026-11-04: an order line as the DO form names it, so two lines with the
 * same product can be told apart: "Line 1 – Camphor Powder 140 × 25", and with
 * `left` (the line's remaining) "… (140 left)". Line No = position in the order.
 */
export function orderLineLabel(o: Order, seq: number, left?: number): string {
  const idx = o.items.findIndex(i => i.seq === seq);
  if (idx < 0) return 'this product';
  const i = o.items[idx];
  const packing = String(i.packing ?? '').trim();
  const size = `${Number(i.qty) || 0}${packing ? ` × ${packing}` : ''}`;
  return `Line ${idx + 1} – ${(i.desc || 'Item').trim()} ${size}${left === undefined ? '' : ` (${left} left)`}`;
}

/**
 * The "too many barrels for the order line" message for one row, or ''. `onDo` = the line's rows when it is on 2+ rows.
 * `line` = orderLineLabel without "left". 2026-11-04: a line with nothing left
 * says so and how to put the row on another line (the "for …" choice only
 * applies to a new row, so the row has to be added again).
 */
export function orderOverMessage(barrels: number, orderNeeds: number | null, line: string, onDo: { sum: number; rows: number[] } | null): string {
  if (orderNeeds === null) return '';
  if (orderNeeds === 0 && (onDo ? onDo.sum : barrels) > 0) {
    return `${line} has 0 left — to use another order line, remove this row and add it again with "+ Add product" for that line.`;
  }
  const needs = `Order needs only ${orderNeeds} barrel${orderNeeds === 1 ? '' : 's'} of ${line}`;
  if (onDo) return onDo.sum > orderNeeds ? `${needs} — rows ${onDo.rows.join(' + ')} of this DO add up to ${onDo.sum}.` : '';
  return barrels > orderNeeds ? `${needs} — you entered ${barrels}.` : '';
}

/**
 * The order line a DO for this lot should use, or null if the lot's product
 * isn't in the order.
 * 2026-11-04 (ORD-2026-869 bug: two "Camphor Powder" lines, the 2nd lot went
 * to the line with 0 left): `onDo` = barrels the OTHER rows of this DO already
 * put on each order line (a key = the line is used). Lines with barrels left
 * AFTER those rows win, then lines with any remaining, else every match —
 * so a line with 0 left is never picked while another match has some. Within
 * that pool: the row's current line stays, then a line already on this DO
 * (same product, another lot), else the first.
 */
export function orderLineSeqForLot(o: Order, entries: DispatchEntry[], lotBilling: string, currentSeq: number | null, onDo: Map<number, number> = new Map()): number | null {
  return bestLine(o, orderLinesForLot(o, lotBilling), entries, currentSeq, onDo);
}

// The 2a93408 default among `lines` (see orderLineSeqForLot), or null if none.
function bestLine(o: Order, lines: Order['items'], entries: DispatchEntry[], currentSeq: number | null, onDo: Map<number, number>): number | null {
  if (!lines.length) return null;
  const remaining = remainingByLine(o, entries);
  const left = (seq: number) => (remaining.get(seq) ?? 0) - (onDo.get(seq) ?? 0);
  const afterDo = lines.filter(i => left(i.seq) > 0);
  const anyLeft = lines.filter(i => (remaining.get(i.seq) ?? 0) > 0);
  const pool = afterDo.length ? afterDo : anyLeft.length ? anyLeft : lines;
  return (pool.find(i => i.seq === currentSeq) ?? pool.find(i => onDo.has(i.seq)) ?? pool[0]).seq;
}

/**
 * 2026-11-04 (user decision): a lot's product does NOT have to be in the order
 * — sometimes another product is sent from a lot on purpose (order line
 * "Dipentene", lot 260914 "Pine Oil 211 (MOL)"). The order line a DO row is
 * for, and whether the row's product matched it:
 * - product matches order lines → the "+ Add product" line (`pinSeq`) if it is
 *   one of them, else orderLineSeqForLot (as before);
 * - no match → the "+ Add product" line, else the row's own line (Board
 *   prefill / its line so far), else the 2a93408 default over ALL lines — so a
 *   row of a DO linked to an order always has a line (null only if the order
 *   has no lines).
 */
export function orderLineForRow(
  o: Order, entries: DispatchEntry[], productBilling: string,
  row: { pinSeq: number | null; currentSeq: number | null }, onDo: Map<number, number> = new Map(),
): { seq: number | null; matched: boolean } {
  const matches = orderLinesForLot(o, productBilling);
  if (matches.length) {
    if (row.pinSeq != null && matches.some(m => m.seq === row.pinSeq)) return { seq: row.pinSeq, matched: true };
    return { seq: bestLine(o, matches, entries, row.currentSeq, onDo), matched: true };
  }
  const own = [row.pinSeq, row.currentSeq].find(s => s != null && o.items.some(i => i.seq === s));
  return { seq: own ?? bestLine(o, o.items, entries, null, onDo), matched: false };
}

/**
 * 2026-11-04: a lot row's Billing Name on a DO linked to an order — the lot's
 * billing name (catalogue, else the lot's own product name) when its product
 * matched the row's line, else the ORDER LINE's product name. Never left empty
 * while one of them has a value (`current` is the last resort).
 */
export function billingNameForRow(o: Order, pick: { seq: number | null; matched: boolean }, lotBilling: string, current: string): string {
  const lineDesc = pick.seq !== null ? (o.items.find(i => i.seq === pick.seq)?.desc || '').trim() : '';
  return (pick.matched ? lotBilling.trim() : lineDesc) || lineDesc || lotBilling.trim() || current;
}
