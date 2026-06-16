// Tiny Supabase realtime helper for Production.
// Subscribes to INSERT/UPDATE/DELETE on a `prod_*` table and fires
// the callback once per change. We don't try to merge payloads into
// state — the caller re-fetches via the existing list functions. This
// keeps state-shape logic in one place (db.ts) and avoids the JSONB-
// payload mismatches realtime can serve.

import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

type Handler = () => void;

export function useRealtimeTable(table: string, onChange: Handler) {
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    const channel = supabase
      .channel(`prod-${table}-${Math.random().toString(36).slice(2, 7)}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        () => handler.current(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table]);
}

// Subscribe to multiple tables. Each change debounces a single refresh
// so a burst of inserts only triggers one re-fetch.
export function useRealtimeTables(tables: string[], onChange: Handler) {
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => handler.current(), 120);
    };

    const channels = tables.map(t =>
      supabase
        .channel(`prod-${t}-${Math.random().toString(36).slice(2, 7)}`)
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: t },
          debounced,
        )
        .subscribe()
    );

    return () => {
      if (timer) clearTimeout(timer);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
    // The tables array is expected to be stable; if not, the parent
    // should memoise it. We pass-through the same array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
