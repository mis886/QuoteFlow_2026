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
          setTypes(['Tanker']);
          return;
        }
        if (data) {
          const names = data.map((r: { name: string }) => r.name);
          // Ensure Tanker is present even if the DB row hasn't been inserted yet
          if (!names.includes('Tanker')) names.push('Tanker');
          setTypes(names.sort());
        }
      });
  }, []);

  return types;
}
