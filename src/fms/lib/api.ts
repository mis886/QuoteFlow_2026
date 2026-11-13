// Talks to the "fms" Supabase edge function, which runs all FMS logic on the
// server (fms_* tables are locked to it). The signed-in EnqBoss user's session
// is sent automatically by supabase.functions.invoke.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export class FmsError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'FmsError';
  }
}

export async function fmsRaw<T = any>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('fms', { body: { op, args } });
  if (error) {
    // Network / server failure. The function itself reports expected problems as { error } with HTTP 200.
    let msg = 'Could not reach the FMS server. Check your connection and try again.';
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      }
    } catch {
      /* keep the generic message */
    }
    throw new FmsError(msg, 500);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as any).error) {
    throw new FmsError((data as any).error, (data as any).status ?? 400);
  }
  return data as T;
}

/** Calls an FMS operation and returns its `data`. */
export async function fms<T = any>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fmsRaw<{ data: T }>(op, args);
  return r.data;
}

// ---------------------------------------------------------------- refresh bus
// After any change, every mounted FMS page re-reads its data (the Next.js app
// used revalidatePath for this).
const REFRESH = 'fms:refresh';
export function refreshFms() {
  window.dispatchEvent(new Event(REFRESH));
}

/** Loads one FMS page's data; reloads after any FMS change and every minute while visible. */
export function useFmsPage<T>(op: string, args: Record<string, unknown> = {}) {
  const key = JSON.stringify(args);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<FmsError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fms<T>(op, JSON.parse(key))
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof FmsError ? e : new FmsError(String(e?.message ?? e), 500));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [op, key, tick]);

  useEffect(() => {
    const on = () => reload();
    window.addEventListener(REFRESH, on);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, 60_000);
    return () => {
      window.removeEventListener(REFRESH, on);
      window.clearInterval(id);
    };
  }, [reload]);

  return { data, error, loading, reload };
}
