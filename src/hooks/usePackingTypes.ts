import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PACKING_TYPES } from '../lib/products';

const LS_KEY = 'qf_custom_packing_types';

function mergeWithDefaults(extra: string[]): string[] {
  return [...new Set([...PACKING_TYPES, ...extra])].sort((a, b) => a.localeCompare(b));
}

function readLocalFallback(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeLocalFallback(names: string[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(names));
  } catch {}
}

export function usePackingTypes(): string[] {
  const [types, setTypes] = useState<string[]>(() => mergeWithDefaults(readLocalFallback()));

  useEffect(() => {
    supabase
      .from('packing_types')
      .select('name')
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          console.warn(
            '[usePackingTypes] DB fetch failed — packing_types table may not exist yet.',
            'Using localStorage fallback.',
            'Error:', error.message,
            '\nTo fix permanently, run this in the Supabase SQL Editor:\n' +
            'https://app.supabase.com/project/nheujyknkqeimgpdfyiw/sql/new\n\n' +
            'See migrations/2026-06-26_packing_types.sql'
          );
          return;
        }
        if (data && data.length > 0) {
          const names = data.map((r: { name: string }) => r.name);
          console.log('[usePackingTypes] loaded from DB:', names.length, 'entries');
          setTypes(names);
        } else {
          console.log('[usePackingTypes] DB table empty — using hardcoded + localStorage fallback');
        }
      });
  }, []);

  return types;
}

export async function savePackingTypes(packingValues: string[]): Promise<void> {
  const unique = [...new Set(packingValues.map(t => t.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const { error } = await supabase
    .from('packing_types')
    .upsert(unique.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true });

  if (error) {
    console.warn('[savePackingTypes] DB save failed, persisting to localStorage:', error.message);
    const existing = readLocalFallback();
    const merged = [...new Set([...existing, ...unique])].sort((a, b) => a.localeCompare(b));
    writeLocalFallback(merged);
  } else {
    console.log('[savePackingTypes] saved to DB:', unique);
  }
}
