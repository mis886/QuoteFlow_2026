import { useCallback, useMemo } from 'react';
import { useProductCatalog } from './useProductCatalog';
import { LINE_ITEM_PRODUCT_NAMES, billingNameFor, buildBillingHsnMap, normName } from '../lib/lineItemProducts';

// Line items of Enquiry / Quotation / Order / Dispatch entry (2026-11-19):
// Product Name (typeable, suggestions from PRODUCTS) → Billing Name → HSN.
// See src/lib/lineItemProducts.ts.
export function useLineItemProducts() {
  const { entries } = useProductCatalog();
  const billingHsn = useMemo(() => buildBillingHsnMap(entries), [entries]);

  const names = LINE_ITEM_PRODUCT_NAMES as string[];

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

  return { names, hintMap, withProduct, withBilling };
}
