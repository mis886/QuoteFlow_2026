import React, { useState, useEffect, useRef } from 'react';
import { Search, RefreshCw, UserCircle2, X, Loader2 } from 'lucide-react';
import { SlaNotificationBell } from './SlaNotificationBell';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { hasActiveToken } from '../lib/gmail';
import { GlobalDateRangePicker } from './GlobalDateRangePicker';
import { WorkspaceSwitcher } from '../production/components/WorkspaceSwitcher';
import { supabase } from '../lib/supabase';

const PATH_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/enquiries': 'Enquiries',
  '/quotes': 'Quotations',
  '/orders': 'Orders',
  '/customers': 'Customers',
  '/analytics': 'Analytics',
  '/blueprint': 'System Plan',
  '/settings': 'Settings',
};

interface SearchHit {
  id: string;
  label: string;
  sub: string;
}
interface SearchResults {
  customers: SearchHit[];
  enquiries: SearchHit[];
  quotes: SearchHit[];
  orders: SearchHit[];
  samples: SearchHit[];
}

export function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { syncGmailEnquiries, data, activeDoer } = useAppStore();
  const [isSyncing, setIsSyncing] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const basePath = '/' + location.pathname.split('/')[1];
  const title = PATH_TITLES[basePath] || 'Dashboard';

  const gmailEnabled = data.settings?.gmail_enabled ?? false;

  // Clear search on route change
  useEffect(() => {
    setQuery('');
    setResults(null);
  }, [location.pathname]);

  // Debounced search trigger
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => runSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, data.customers, data.enquiries, data.quotes, data.orders]);

  // Click outside to close dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setResults(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ESC key to close dropdown
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setQuery(''); setResults(null); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const runSearch = async (q: string) => {
    setSearching(true);
    const lq = q.toLowerCase();

    const customers: SearchHit[] = (data.customers as any[])
      .filter(c => c.name?.toLowerCase().includes(lq) || (c.code ?? '').toLowerCase().includes(lq))
      .slice(0, 5)
      .map(c => ({ id: c.id, label: c.name, sub: c.code ?? '' }));

    const enquiries: SearchHit[] = (data.enquiries as any[])
      .filter(e => e.cust?.toLowerCase().includes(lq) || e.id?.toLowerCase().includes(lq) ||
        (e.items ?? []).some((i: any) => i.desc?.toLowerCase().includes(lq) || i.mat?.toLowerCase().includes(lq)))
      .slice(0, 5)
      .map(e => ({ id: e.id, label: e.id, sub: e.cust }));

    const quotes: SearchHit[] = (data.quotes as any[])
      .filter(qt => qt.cust?.toLowerCase().includes(lq) || qt.id?.toLowerCase().includes(lq))
      .slice(0, 5)
      .map(qt => ({ id: qt.id, label: qt.id, sub: qt.cust }));

    const orders: SearchHit[] = (data.orders as any[])
      .filter(o => o.cust?.toLowerCase().includes(lq) || o.id?.toLowerCase().includes(lq) || (o.poNo ?? '').toLowerCase().includes(lq))
      .slice(0, 5)
      .map(o => ({ id: o.id, label: o.id, sub: o.poNo ? `${o.cust} · PO ${o.poNo}` : o.cust }));

    const { data: sRows } = await supabase
      .from('samples')
      .select('id, cust, product_name')
      .or(`cust.ilike.%${q}%,id.ilike.%${q}%`)
      .limit(5);

    const samples: SearchHit[] = (sRows ?? []).map((s: any) => ({
      id: s.id, label: s.id, sub: `${s.cust}${s.product_name ? ' · ' + s.product_name : ''}`,
    }));

    setResults({ customers, enquiries, quotes, orders, samples });
    setSearching(false);
  };

  const go = (path: string) => {
    setQuery('');
    setResults(null);
    navigate(path);
  };

  const total = results
    ? results.customers.length + results.enquiries.length + results.quotes.length +
      results.orders.length + results.samples.length
    : 0;

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try { await syncGmailEnquiries(); } catch {}
    setIsSyncing(false);
  };

  const lastSync = data.settings?.gmail_last_sync
    ? new Date(data.settings.gmail_last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header className="h-[50px] bg-white border-b border-g200 flex items-center px-5 gap-2.5 shrink-0">
      <div className="text-[13px] text-g500">
        Himalaya TerpenesEQ <span className="text-g300 mx-1">/</span> <strong className="text-blk font-semibold">{title}</strong>
      </div>

      {/* Global search with dropdown */}
      <div ref={dropRef} className="ml-auto relative">
        <div className="flex items-center gap-2 bg-g100 border border-g200 rounded-[5px] px-2.5 h-[30px] w-[200px] transition-all focus-within:bg-white focus-within:border-g400 focus-within:ring-[3px] focus-within:ring-red-lt">
          {searching
            ? <Loader2 size={12} className="text-g400 shrink-0 animate-spin" />
            : <Search size={12} className="text-g400 shrink-0" />}
          <input
            ref={inputRef}
            type="text"
            placeholder="Search everywhere..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-[12.5px] text-blk w-full placeholder:text-g400"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }}
              className="text-g400 hover:text-blk transition-colors shrink-0"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Results dropdown */}
        {query.length >= 2 && (results !== null || searching) && (
          <div className="absolute top-[36px] right-0 w-[320px] bg-white border border-g200 rounded-[6px] shadow-xl z-50 overflow-hidden max-h-[420px] overflow-y-auto">
            {results !== null && total === 0 && !searching && (
              <div className="p-4 text-center text-g400 text-[12px]">No results for &ldquo;{query}&rdquo;</div>
            )}

            {results !== null && results.customers.length > 0 && (
              <Section label="Customers" count={results.customers.length}>
                {results.customers.map(h => (
                  <HitRow key={h.id} label={h.label} sub={h.sub} onClick={() => go(`/customers?q=${encodeURIComponent(query)}`)} />
                ))}
              </Section>
            )}

            {results !== null && results.enquiries.length > 0 && (
              <Section label="Enquiries" count={results.enquiries.length}>
                {results.enquiries.map(h => (
                  <HitRow key={h.id} label={h.label} sub={h.sub} mono onClick={() => go(`/enquiries?q=${encodeURIComponent(query)}`)} />
                ))}
              </Section>
            )}

            {results !== null && results.quotes.length > 0 && (
              <Section label="Quotations" count={results.quotes.length}>
                {results.quotes.map(h => (
                  <HitRow key={h.id} label={h.label} sub={h.sub} mono onClick={() => go(`/quotes?q=${encodeURIComponent(query)}`)} />
                ))}
              </Section>
            )}

            {results !== null && results.orders.length > 0 && (
              <Section label="Orders" count={results.orders.length}>
                {results.orders.map(h => (
                  <HitRow key={h.id} label={h.label} sub={h.sub} mono onClick={() => go(`/orders?q=${encodeURIComponent(query)}`)} />
                ))}
              </Section>
            )}

            {results !== null && results.samples.length > 0 && (
              <Section label="Sampling" count={results.samples.length}>
                {results.samples.map(h => (
                  <HitRow key={h.id} label={h.label} sub={h.sub} mono onClick={() => go(`/sampling?q=${encodeURIComponent(query)}`)} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>

      {/* Gmail sync pill — only shown when gmail is enabled */}
      {gmailEnabled && (
        <button
          onClick={handleSync}
          disabled={isSyncing}
          title={lastSync ? `Last synced ${lastSync}` : 'Sync Gmail enquiries'}
          className={`h-[30px] flex items-center gap-1.5 px-2.5 rounded-[5px] border text-[11px] font-medium transition-colors disabled:opacity-60 ${
            hasActiveToken()
              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
              : 'bg-g100 border-g200 text-g500 hover:bg-g200'
          }`}
        >
          <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{isSyncing ? 'Syncing…' : lastSync ? `Synced ${lastSync}` : 'Sync Gmail'}</span>
        </button>
      )}

      {/* Active doer — identity resolved automatically from login email */}
      {activeDoer && (
        <div
          title={`Signed in as ${activeDoer.display_name} (${activeDoer.role})`}
          className="h-[30px] flex items-center gap-1.5 px-2.5 rounded-[5px] border border-g200 bg-g100 text-[11px] font-medium text-g600"
        >
          <UserCircle2 size={13} className="text-red-mrt shrink-0" />
          <span className="hidden md:inline max-w-[120px] truncate">{activeDoer.display_name}</span>
        </div>
      )}

      <WorkspaceSwitcher />

      <GlobalDateRangePicker />

      <SlaNotificationBell />
    </header>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-[5px] bg-g50 border-b border-g100 font-mono text-[9px] font-bold tracking-[1.4px] uppercase text-g500 sticky top-0">
        {label} <span className="text-g400 font-normal">({count})</span>
      </div>
      {children}
    </div>
  );
}

function HitRow({ label, sub, mono = false, onClick }: { label: string; sub: string; mono?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-[7px] text-[12px] hover:bg-g50 border-b border-g100 last:border-0 transition-colors flex items-baseline gap-2"
    >
      <span className={`font-medium text-blk shrink-0 ${mono ? 'font-mono text-[10.5px]' : ''}`}>{label}</span>
      {sub && <span className="text-g400 text-[11px] truncate">{sub}</span>}
    </button>
  );
}
