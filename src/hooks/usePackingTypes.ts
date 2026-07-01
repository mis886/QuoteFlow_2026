import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function usePackingTypes(): string[] {
  const [types, setTypes] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('packing_types')
      .select('name')
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          console.warn('[usePackingTypes] DB fetch failed:', error.message);
          return;
        }
        if (data) setTypes(data.map((r: { name: string }) => r.name));
      });
  }, []);

  return types;
}
