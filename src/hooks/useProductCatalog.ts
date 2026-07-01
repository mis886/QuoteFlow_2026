import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ProductCatalogEntry {
  id: string;
  product_name: string;
  hsn_code: string | null;
}

export interface ProductCatalogResult {
  names: string[];
  hsnMap: Record<string, string>;
  entries: ProductCatalogEntry[];
  loading: boolean;
  reload: () => void;
}

export function useProductCatalog(): ProductCatalogResult {
  const [entries, setEntries] = useState<ProductCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('product_catalog')
      .select('id, product_name, hsn_code')
      .order('product_name')
      .then(({ data, error }) => {
        if (!error && data) setEntries(data as ProductCatalogEntry[]);
        setLoading(false);
      });
  }, [rev]);

  const reload = useCallback(() => setRev(r => r + 1), []);

  const names = entries.map(e => e.product_name);
  const hsnMap = Object.fromEntries(entries.map(e => [e.product_name, e.hsn_code ?? '']));

  return { names, hsnMap, entries, loading, reload };
}
