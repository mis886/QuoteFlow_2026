// Soft gate for the Production workspace.
//
// Reads `app_settings.production_beta_enabled`. The flag exists so an
// admin can deliberately disable Production in an environment that
// isn't ready (e.g. a fresh staging DB without the prod_* tables).
//
// Defaults are biased toward "on" — anything that isn't an explicit
// `false` is treated as enabled. That covers: column missing, row
// missing, network failure on the lookup, NULL value. We'd rather
// occasionally show /production in a broken state than block the
// shop floor with a false-positive lock screen.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type GateState = 'loading' | 'enabled' | 'disabled';

export function useProductionEnabled(): GateState {
  const [state, setState] = useState<GateState>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('production_beta_enabled')
          .eq('id', 'config')
          .single();
        if (cancelled) return;
        if (error) { setState('enabled'); return; }
        const v = (data as { production_beta_enabled?: boolean | null } | null)
          ?.production_beta_enabled;
        setState(v === false ? 'disabled' : 'enabled');
      } catch {
        if (!cancelled) setState('enabled');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
