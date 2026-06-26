import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PACKING_TYPES } from '../lib/products';

export function usePackingTypes(): string[] {
  const [types, setTypes] = useState<string[]>(PACKING_TYPES);

  useEffect(() => {
    supabase
      .from('packing_types')
      .select('name')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          setTypes(data.map((r: { name: string }) => r.name));
        }
      });
  }, []);

  return types;
}

export async function savePackingTypes(packingValues: string[]): Promise<void> {
  const unique = [...new Set(packingValues.map(t => t.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  await supabase
    .from('packing_types')
    .upsert(unique.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
}
