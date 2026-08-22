import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { normalizeSearchText, nameTier } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface SampleHit { id: string; cust: string; product_name: string; }

interface ResultRow {
  id: string;
  title: string;
  subtitle: string;
  tier: 0 | 1 | 2 | 3;
  path: string;
}

interface ResultGroup {
  label: string;
  rows: ResultRow[];
}

const MAX_PER_GROUP = 5;

export function GlobalSearchResults({ query, onNavigate }: { query: string; onNavigate: () => void }) {
  const navigate = useNavigate();
  const { data } = useAppStore();
  const [samples, setSamples] = useState<SampleHit[]>([]);
  const trimmed = query.trim();

  // Samples aren't part of the central store (Sampling.tsx fetches them on
  // its own), so fetch a small matching set directly here, debounced.
  useEffect(() => {
    if (trimmed.length < 2) { setSamples([]); return; }
    const handle = setTimeout(async () => {
      const { data: rows } = await supabase
        .from('samples')
        .select('id, cust, product_name')
        .or(`cust.ilike.%${trimmed}%,product_name.ilike.%${trimmed}%`)
        .limit(10);
      setSamples((rows as SampleHit[]) ?? []);
    }, 300);
    return () => clearTimeout(handle);
  }, [trimmed]);

  const groups = useMemo<ResultGroup[]>(() => {
    if (!trimmed) return [];
    const q = normalizeSearchText(trimmed);
    const matches = (text: string | undefined | null) => normalizeSearchText(text ?? '').includes(q);
    const rank = (text: string, exacts: (string | undefined | null)[] = []) => nameTier(text, trimmed, exacts);

    const customerRows: ResultRow[] = data.customers
      .filter(c => matches(c.name) || matches(c.id))
      .map(c => ({ id: c.id, title: c.name, subtitle: c.id, tier: rank(c.name, [c.id]), path: `/customers/new?id=${c.id}` }))
      .sort((a, b) => a.tier - b.tier)
      .slice(0, MAX_PER_GROUP);

    const enquiryRows: ResultRow[] = data.enquiries
      .filter(e => matches(e.cust) || matches(e.id) || matches(e.contact))
      .map(e => ({ id: e.id, title: e.cust, subtitle: e.id, tier: rank(e.cust, [e.id]), path: `/enquiries/new?id=${e.id}` }))
      .sort((a, b) => a.tier - b.tier)
      .slice(0, MAX_PER_GROUP);

    const quoteRows: ResultRow[] = data.quotes
      .filter(qt => matches(qt.cust) || matches(qt.id))
      .map(qt => ({ id: qt.id, title: qt.cust, subtitle: qt.id, tier: rank(qt.cust, [qt.id]), path: `/quotes/new?id=${qt.id}` }))
      .sort((a, b) => a.tier - b.tier)
      .slice(0, MAX_PER_GROUP);

    const orderRows: ResultRow[] = data.orders
      .filter(o => matches(o.cust) || matches(o.id) || matches(o.poNo))
      .map(o => ({ id: o.id, title: o.cust, subtitle: `${o.id} · PO ${o.poNo}`, tier: rank(o.cust, [o.id, o.poNo]), path: `/orders/new?id=${o.id}` }))
      .sort((a, b) => a.tier - b.tier)
      .slice(0, MAX_PER_GROUP);

    const sampleRows: ResultRow[] = samples
      .map(s => ({ id: s.id, title: s.cust, subtitle: s.product_name, tier: rank(`${s.cust} ${s.product_name}`), path: `/sampling/new?id=${s.id}` }))
      .sort((a, b) => a.tier - b.tier)
      .slice(0, MAX_PER_GROUP);

    return [
      { label: 'Customers', rows: customerRows },
      { label: 'Enquiries', rows: enquiryRows },
      { label: 'Quotations', rows: quoteRows },
      { label: 'Orders', rows: orderRows },
      { label: 'Sampling', rows: sampleRows },
    ].filter(g => g.rows.length > 0);
  }, [trimmed, data.customers, data.enquiries, data.quotes, data.orders, samples]);

  if (!trimmed) return null;

  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      className="absolute top-[36px] left-0 w-[360px] max-h-[420px] overflow-y-auto bg-white border border-g200 rounded-[6px] shadow-lg z-50"
    >
      {groups.length === 0 ? (
        <div className="px-3 py-4 text-[12px] text-g400 text-center">No results for "{trimmed}"</div>
      ) : (
        groups.map(g => (
          <div key={g.label} className="border-b border-g100 last:border-b-0">
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-[0.5px] uppercase text-g400">{g.label}</div>
            {g.rows.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { navigate(r.path); onNavigate(); }}
                className="w-full text-left px-3 py-2 hover:bg-g50 transition-colors flex flex-col"
              >
                <span className="text-[12.5px] text-blk font-medium truncate">{r.title || '(no name)'}</span>
                <span className="text-[10.5px] text-g400 truncate">{r.subtitle}</span>
              </button>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
