import { useCallback, useMemo } from 'react';
import { useProductCatalog } from './useProductCatalog';
import { useAppStore } from '../store';
import { LINE_ITEM_PRODUCT_NAMES, billingNameFor, buildBillingHsnMap, normName } from '../lib/lineItemProducts';

// Line items of Enquiry / Quotation / Order / Dispatch entry (2026-11-19):
// Product Name (suggestions from PRODUCTS) → Billing Name → HSN.
// See src/lib/lineItemProducts.ts.
export function useLineItemProducts() {
  const { entries } = useProductCatalog();
  const { data } = useAppStore();
  const billingHsn = useMemo(() => buildBillingHsnMap(entries), [entries]);

  const names = LINE_ITEM_PRODUCT_NAMES as string[];

  // 2026-11-19 (user rule — Enquiry / Quotation / Order are strict): a Product
  // Name may be SAVED only if it is a product-list name, or it is already on a
  // saved enquiry / quotation / order line (an old free-text name, kept as it
  // is — also when carried forward Enquiry → Quote → Order). New free text
  // (typed, or brought in by the RFQ import) is refused at Save.
  const listNames = useMemo(() => new Set(names.map(normName)), [names]);
  const savedNames = useMemo(() => {
    const s = new Set<string>();
    for (const docs of [data.enquiries, data.quotes, data.orders] as { items?: { desc?: string }[] }[][]) {
      for (const d of docs ?? []) for (const it of d.items ?? []) { const k = normName(it.desc); if (k) s.add(k); }
    }
    return s;
  }, [data.enquiries, data.quotes, data.orders]);
  const allowedName = useCallback(
    (name: string) => { const k = normName(name); return !!k && (listNames.has(k) || savedNames.has(k)); },
    [listNames, savedNames],
  );

  const hsnForBilling = useCallback(
    (billingName: string | null | undefined) => billingHsn.get(normName(billingName)) ?? '',
    [billingHsn],
  );

  /** Product name → HSN, only for the hint shown beside each dropdown suggestion. */
  const hintMap = useMemo(
    () => Object.fromEntries(names.map(n => [n, hsnForBilling(billingNameFor(n))])),
    [names, hsnForBilling],
  );

  /** New Product Name: Billing Name filled from the list, or cleared; HSN follows it. */
  const withProduct = useCallback(<T extends object>(item: T, desc: string): T & { desc: string; billingName: string; hsn: string } => {
    const billingName = billingNameFor(desc);
    return { ...item, desc, billingName, hsn: hsnForBilling(billingName) };
  }, [hsnForBilling]);

  /** Billing Name typed by hand: HSN follows it. */
  const withBilling = useCallback(<T extends object>(item: T, billingName: string): T & { billingName: string; hsn: string } => (
    { ...item, billingName, hsn: hsnForBilling(billingName) }
  ), [hsnForBilling]);

  return { names, hintMap, withProduct, withBilling, allowedName };
}
