// 2026-11-19: Product Name → Billing Name → HSN for the LINE ITEMS of
// Enquiry / Quotation / Order / Dispatch entry (not Sampling).
//
// - Product Name suggestions = the product names in PRODUCTS
//   (src/lib/stockInwardProducts.ts — the ONE product list, also used by
//   Stock Inward/Outward), each name once.
// - Billing Name = that product's billingName when the Product Name matches a
//   PRODUCTS name (ignoring capitals and extra spaces), else blank. The user can
//   also type/correct it by hand.
// - HSN = product_catalog.hsn_code for the Billing Name (same matching), else
//   blank. product_catalog.product_name holds BILLING names.
// - Printing (Quotation PDF/DOCX/email, Order PI): the Billing Name, falling
//   back to the Product Name when a line has none (old records).

import { PRODUCTS } from './stockInwardProducts';

/** Lower-case, trimmed, runs of spaces collapsed — for name matching. */
export const normName = (s: string | null | undefined) =>
  (typeof s === 'string' ? s : '').trim().replace(/\s+/g, ' ').toLowerCase();

const billingByName = new Map<string, string>();
const uniqueNames: string[] = [];
for (const p of PRODUCTS) {
  const k = normName(p.name);
  if (!k || billingByName.has(k)) continue;
  billingByName.set(k, (p.billingName || '').trim());
  uniqueNames.push(p.name);
}

/** Product Name suggestions for line items — every PRODUCTS name, once. */
export const LINE_ITEM_PRODUCT_NAMES: readonly string[] = uniqueNames;

/** Billing Name for a Product Name ('' when it isn't a PRODUCTS name). */
export function billingNameFor(productName: string | null | undefined): string {
  return billingByName.get(normName(productName)) ?? '';
}

/** billing name (normalised) → HSN, from product_catalog rows. */
export function buildBillingHsnMap(rows: { product_name: string; hsn_code: string | null }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = normName(r.product_name);
    if (k && !m.has(k)) m.set(k, (r.hsn_code || '').trim());
  }
  return m;
}

/** The name printed for a line item: Billing Name, else the Product Name. */
export function lineItemPrintName(item: { billingName?: string | null; desc?: string | null }): string {
  const clean = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s === 'null' || s === 'undefined' || s === '-' ? '' : s;
  };
  return clean(item.billingName) || clean((item as any).product_name) || clean(item.desc);
}
