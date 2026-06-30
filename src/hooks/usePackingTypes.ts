import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PACKING_TYPES } from '../lib/products';

const LS_KEY = 'qf_custom_packing_types';

export function toTitleCase(str: string): string {
  return str.trim().toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

function mergeWithDefaults(extra: string[]): string[] {
  const all = [...PACKING_TYPES.map(toTitleCase), ...extra.map(toTitleCase)];
  return [...new Set(all)].sort((a, b) => a.localeCompare(b));
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
          console.warn('[usePackingTypes] DB fetch failed — using localStorage fallback:', error.message);
          return;
        }
        if (data && data.length > 0) {
          setTypes(data.map((r: { name: string }) => toTitleCase(r.name)));
        }
        // else: table empty — keep hardcoded + localStorage fallback
      });
  }, []);

  return types;
}

export async function savePackingTypes(packingValues: string[]): Promise<void> {
  const candidates = [...new Set(packingValues.map(toTitleCase).filter(Boolean))];
  if (candidates.length === 0) return;

  // Fetch existing records for case-insensitive deduplication
  const { data: existing, error: fetchErr } = await supabase
    .from('packing_types')
    .select('name');

  if (fetchErr) {
    // DB unavailable — persist to localStorage
    const ls = readLocalFallback();
    writeLocalFallback([...new Set([...ls, ...candidates])].sort((a, b) => a.localeCompare(b)));
    return;
  }

  const existingLower = new Set((existing ?? []).map((r: { name: string }) => r.name.toLowerCase()));
  const toInsert = candidates.filter(c => !existingLower.has(c.toLowerCase()));

  if (toInsert.length === 0) return;

  const { error } = await supabase
    .from('packing_types')
    .insert(toInsert.map(name => ({ name })));

  if (error) {
    console.warn('[savePackingTypes] DB insert failed — falling back to localStorage:', error.message);
    const ls = readLocalFallback();
    writeLocalFallback([...new Set([...ls, ...toInsert])].sort((a, b) => a.localeCompare(b)));
  }
}
