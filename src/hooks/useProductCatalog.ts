import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export interface ProductCatalogEntry {
  id: string;
  product_name: string;
  hsn_code: string | null;
  // 2026-11-14: inactive products are kept but hidden from the dropdowns.
  active?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface ProductCatalogResult {
  /** ACTIVE product names only — what the Product Name dropdown offers. */
  names: string[];
  /** name → HSN ('' when the product has no HSN) for every product, active or not. */
  hsnMap: Record<string, string>;
  entries: ProductCatalogEntry[];
  loading: boolean;
  reload: () => void;
}

// product_catalog is the master product list (2026-11-14). Product Name in
// Enquiry / Quotation / Order / Dispatch / Sampling is a strict pick from it.
export function useProductCatalog(): ProductCatalogResult {
  const [entries, setEntries] = useState<ProductCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('product_catalog')
      .select('id, product_name, hsn_code, active')
      .order('product_name')
      .then(({ data, error }) => {
        if (!error && data) setEntries(data as ProductCatalogEntry[]);
        setLoading(false);
      });
  }, [rev]);

  const reload = useCallback(() => setRev(r => r + 1), []);

  const names = useMemo(() => entries.filter(e => e.active !== false).map(e => e.product_name), [entries]);
  const hsnMap = useMemo(() => Object.fromEntries(entries.map(e => [e.product_name, e.hsn_code ?? ''])), [entries]);

  return { names, hsnMap, entries, loading, reload };
}
