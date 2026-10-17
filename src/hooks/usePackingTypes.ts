import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function usePackingTypes(): string[] {
  const [types, setTypes] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('packing_types')
      .select('name')
      .order('sort_order')
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          console.warn('[usePackingTypes] DB fetch failed:', error.message);
          setTypes([]);
          return;
        }
        if (data) {
          // Keep the DB order (sort_order, then name) — don't re-sort here
          setTypes(data.map((r: { name: string }) => r.name));
        }
      });
  }, []);

  return types;
}
