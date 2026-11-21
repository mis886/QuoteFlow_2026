// 2026-11-18: DO form (NewStockOutward.tsx) — pick a lot by PRODUCT NAME.
// Pure helpers for the Product Name search and the Lot No list, kept apart
// from the page so they can be tested on their own.

// One stock_lots row as the pickers show it: barrels = the HEADER warehouse's
// party column (same figure the Lot No lookup uses).
export type StockLotOption = { lotNo: string; productName: string; productCode: string; lotDate: string; barrels: number };

const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Every word typed appears in the product's name, catalogue billing name or code. */
export const productMatches = (query: string, productName: string, productCode: string, billingName: string): boolean => {
  const words = normText(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = ` ${normText(`${productName} ${billingName} ${productCode}`)} `;
  const squashed = hay.replace(/ /g, '');
  return words.every(w => hay.includes(w) || squashed.includes(w));
};
/**
 * The lots the pickers may offer for one warehouse: one per Lot No — the SAME
 * row findOutwardLot resolves to (the list must be in its order: serial_no,
 * created_at, id) — so the barrels shown are the barrels the row fills with.
 */
export const dedupeLots = (rows: { wh_lot_no: string | null; product_name: string | null; product_code: string | null; inward_date: string | null; qty: unknown }[],
  codeFor: (name: string) => string): StockLotOption[] => {
  const seen = new Set<string>();
  const out: StockLotOption[] = [];
  for (const r of rows) {
    const lotNo = r.wh_lot_no || '';
    // A Lot No with spaces round it can't be found by the lookup (it trims).
    if (!lotNo.trim() || lotNo !== lotNo.trim()) continue;
    const k = lotNo.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const productName = r.product_name || '';
    out.push({ lotNo, productName, productCode: r.product_code || codeFor(productName), lotDate: r.inward_date || '', barrels: Number(r.qty) || 0 });
  }
  return out;
};
/** Upper / lower case and extra spaces ignored, trimmed. */
export const sameName = (s: string | null | undefined) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
/**
 * 2026-11-21 (user rule — replaces the 2026-11-19 exact-name match): the lots
 * whose stock product name CONTAINS the row's Product Name text ("Beta Pinene"
 * → "Beta Pinene 95%", "Beta Pinene 98%", "Beta Pinene 98% -ve (rob)").
 * Empty text → every lot.
 */
export function lotsContaining<T extends { productName: string }>(lots: T[], productText: string): T[] {
  const want = sameName(productText);
  return want ? lots.filter(o => sameName(o.productName).includes(want)) : lots;
}
/** Oldest lot first (no date last), then Lot No. */
export const byLotAge = (a: { lotDate: string; lotNo: string }, b: { lotDate: string; lotNo: string }) =>
  (a.lotDate || '9999') < (b.lotDate || '9999') ? -1 : (a.lotDate || '9999') > (b.lotDate || '9999') ? 1
    : a.lotNo.localeCompare(b.lotNo, undefined, { numeric: true });
/**
 * The Lot No list's groups: one per stock product name (names differing only
 * in case / spaces are one group, shown as first seen), A→Z; lots oldest first.
 */
export function groupLotsByProduct<T extends { productName: string; lotDate: string; lotNo: string }>(lots: T[]): { name: string; lots: T[] }[] {
  const by = new Map<string, { name: string; lots: T[] }>();
  for (const o of lots) {
    const k = sameName(o.productName);
    const g = by.get(k) ?? { name: o.productName.trim() || '(no product name)', lots: [] };
    g.lots.push(o);
    by.set(k, g);
  }
  return [...by.values()]
    .map(g => ({ ...g, lots: [...g.lots].sort(byLotAge) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

