// Stock Register (2026-10-06) — one page, two tabs:
//   Stock Summary — the lot-wise stock ledger (src/pages/StockSummary.tsx),
//                   unchanged; a Lot No there opens that lot's Stock Book.
//   Stock Book    — read-only passbook: one row per OUTWARD entry
//                   (stock_movements where type = 'outward'), with the barrels
//                   given and the barrels left in that lot after it.
// The active tab lives in the URL (?tab=summary | ?tab=book, plus &lot=<Lot No>
// when the Stock Book was opened from a Lot No), so a refresh stays put.
//
// No new tables or columns. Data is read with the same two queries Stock
// Summary and Stock Movements already use (stock_lots / stock_movements) and
// the same row mappers. Entries are still added / edited / deleted in Stock
// Movements only.
//
// BALANCE maths (Stock Book), per lot — matched to stock_lots by wh_lot_no,
// case-insensitive, the same way the Outward form matches a lot:
//   currentBarrels = qty_hariom + qty_reliable + qty_swastik + qty_balaji
//   startBarrels   = currentBarrels + SUM(num_articles of ALL its outward rows)
//   balance after a row = startBarrels − running total of num_articles,
//   rows taken in date order (then created_at)
// so a lot's latest row always equals its barrels on Stock Summary today.
// It is worked out over ALL of the lot's outward rows, before any search /
// date filter is applied — filtering only hides rows, it never changes a
// balance.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Warehouse, List, BookOpen, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDate, fmtIST, normalizeSearchText } from '../lib/utils';
import { StockLot, StockMovement } from '../lib/types';
import { StockSummary, mapRow as mapLotRow } from './StockSummary';
import { mapRow as mapMovementRow } from './StockMovements';
import FloatingHorizontalScrollbar from '../components/FloatingHorizontalScrollbar';
import FloatingVerticalScrollbar from '../components/FloatingVerticalScrollbar';

type RegisterTab = 'summary' | 'book';

// Same pill look as the Dispatch page's "Table | Board" toggle.
const pillCls = (active: boolean) => `px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${active ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`;

const lotKey = (s?: string | null) => (s || '').trim().toLowerCase();
const barrelsOf = (m: StockMovement) => Number(m.numArticles) || 0;
const currentBarrels = (l: StockLot) => (l.qtyHariom ?? 0) + (l.qtyReliable ?? 0) + (l.qtySwastik ?? 0) + (l.qtyBalaji ?? 0);
// DATE column: DO Date, else the day the entry was created (IST). yyyy-MM-dd.
const rowDate = (m: StockMovement) => m.doDate || (m.created_at ? fmtIST(new Date(m.created_at), 'yyyy-MM-dd') : '');
const partyOf = (m: StockMovement) => (m.partyName === 'Other' ? (m.otherParty || 'Other') : (m.partyName || ''));
const brl = (n: number) => `${n.toLocaleString('en-IN')} brl`;

interface BookRow {
  m: StockMovement;
  lotNo: string;            // as typed on the outward entry ('' = none)
  date: string;             // yyyy-MM-dd
  party: string;
  outward: number;
  balance: number | null;   // null = no Lot No, or no matching stock lot
}

export function StockRegister() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: RegisterTab = searchParams.get('tab') === 'book' ? 'book' : 'summary';
  const lotFilter = tab === 'book' ? (searchParams.get('lot') || '') : '';

  const openTab = (t: RegisterTab, lot?: string) => {
    const next: Record<string, string> = { tab: t };
    if (t === 'book' && lot) next.lot = lot;
    setSearchParams(next);
  };

  // ALL lots (finished ones too — an old outward row still needs its lot to
  // work out a balance) + every outward entry.
  const [lots, setLots] = useState<StockLot[]>([]);
  const [outwards, setOutwards] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [lotsRes, movRes] = await Promise.all([
      supabase.from('stock_lots').select('*').order('serial_no', { ascending: true, nullsFirst: false }),
      supabase.from('stock_movements').select('*').eq('type', 'outward').order('created_at', { ascending: true }),
    ]);
    if (!lotsRes.error && lotsRes.data) setLots(lotsRes.data.map(mapLotRow));
    if (!movRes.error && movRes.data) setOutwards(movRes.data.map(mapMovementRow));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Header stat boxes. Active lots = the lots listed on Stock Summary.
  const activeLots = useMemo(() => lots.filter(l => !l.isFinished), [lots]);
  const zeroBalanceLots = activeLots.filter(l => currentBarrels(l) === 0).length;
  const thisMonth = fmtIST(new Date(), 'yyyy-MM');
  const outwardThisMonth = outwards.filter(m => rowDate(m).startsWith(thisMonth)).length;

  // Every outward row with its balance, in passbook order: Lot No, then date,
  // then created_at. Rows without a Lot No go last.
  const bookRows = useMemo<BookRow[]>(() => {
    // First match wins, same as the Outward form's own lookup (limit 1).
    const lotByKey = new Map<string, StockLot>();
    for (const l of lots) { const k = lotKey(l.whLotNo); if (k && !lotByKey.has(k)) lotByKey.set(k, l); }

    const byLot = new Map<string, StockMovement[]>();
    for (const m of outwards) {
      const k = lotKey(m.whLotNo);
      if (!byLot.has(k)) byLot.set(k, []);
      byLot.get(k)!.push(m);
    }
    const out: BookRow[] = [];
    const keys = [...byLot.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })));
    for (const k of keys) {
      const rows = byLot.get(k)!.slice().sort((a, b) =>
        rowDate(a).localeCompare(rowDate(b)) || (a.created_at || '').localeCompare(b.created_at || ''));
      const lot = k ? lotByKey.get(k) : undefined;
      let left = lot ? currentBarrels(lot) + rows.reduce((s, m) => s + barrelsOf(m), 0) : 0;
      for (const m of rows) {
        const outward = barrelsOf(m);
        left -= outward;
        out.push({ m, lotNo: (m.whLotNo || '').trim(), date: rowDate(m), party: partyOf(m), outward, balance: lot ? left : null });
      }
    }
    return out;
  }, [lots, outwards]);

  // Stock Book toolbar filters.
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const hasFilters = !!(search || fromDate || toDate || lotFilter);
  const clearFilters = () => { setSearch(''); setFromDate(''); setToDate(''); if (lotFilter) openTab('book'); };

  const shownRows = useMemo(() => {
    const q = normalizeSearchText(search.trim());
    const lotK = lotKey(lotFilter);
    return bookRows.filter(r => {
      if (lotK && lotKey(r.lotNo) !== lotK) return false;
      if (fromDate && (!r.date || r.date < fromDate)) return false;
      if (toDate && (!r.date || r.date > toDate)) return false;
      if (!q) return true;
      return normalizeSearchText([r.lotNo, r.m.doNumber, r.party].filter(Boolean).join(' ')).includes(q);
    });
  }, [bookRows, search, fromDate, toDate, lotFilter]);
  const shownLotCount = new Set(shownRows.map(r => lotKey(r.lotNo)).filter(Boolean)).size;
  const shownOutwardTotal = shownRows.reduce((s, r) => s + r.outward, 0);

  // Same single-scroll-container + sticky header set-up as the Stock Summary table.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const Th = ({ label, align = 'text-center' }: { label: string; align?: string }) => (
    <th className={`sticky top-0 z-10 bg-g100 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] whitespace-nowrap border-b border-g200 text-g500 ${align}`}>
      {label}
    </th>
  );
  const dateInputCls = 'h-7 bg-white border border-g200 rounded px-2 font-sans text-xs text-blk outline-none focus:border-red-mrt focus:ring-2 focus:ring-red-lt';

  const tabs = (
    <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
      <div onClick={() => openTab('summary')} className={`flex items-center gap-1.5 ${pillCls(tab === 'summary')}`}>
        <List size={12} /> Stock Summary
      </div>
      <div onClick={() => openTab('book')} className={`flex items-center gap-1.5 ${pillCls(tab === 'book')}`}>
        <BookOpen size={12} /> Stock Book
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Inventory</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight flex items-center gap-2">
              <Warehouse size={20} className="text-red-mrt shrink-0" />
              Stock <em className="italic text-red-mrt">Register</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">Lot-wise raw-material stock and outward history, by party / godown.</p>
          </div>
          {/* Same box styling as the Dispatch board's header counters. */}
          <div className="flex items-stretch gap-2 shrink-0">
            {([
              ['Active lots', activeLots.length, 'bg-white text-blk'],
              [`Outward · ${fmtIST(new Date(), 'MMM')}`, outwardThisMonth, 'bg-[#E8F5E9] text-[#0B5C2A]'],
              ['Zero balance', zeroBalanceLots, 'bg-[#FFEBEE] text-[#9A0000]'],
            ] as const).map(([label, count, cls]) => (
              <div key={label} className={`border border-g200 rounded-[6px] px-3 py-1.5 min-w-[92px] ${cls}`}>
                <div className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase opacity-80">{label}</div>
                <div className="text-[22px] font-bold leading-tight">{loading ? '…' : count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {tab === 'summary' ? (
        <StockSummary tabs={tabs} onOpenLot={lot => openTab('book', lot)} onLotsChanged={load} />
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-4">
            {tabs}
            <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
            <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[240px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
              <Search size={11} className="text-g400 shrink-0" />
              <input
                type="text"
                placeholder="Lot no., DO no., party name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
              />
            </div>
            <label className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500">
              From <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={dateInputCls} />
            </label>
            <label className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500">
              To <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={dateInputCls} />
            </label>
            {lotFilter && (
              <span className="inline-flex items-center gap-1 h-7 px-2 rounded-[3px] bg-red-lt-solid text-red-mrt font-mono text-[10.5px] font-bold whitespace-nowrap">
                Lot {lotFilter}
                <button type="button" onClick={() => openTab('book')} title="Show all lots" className="hover:opacity-70"><X size={11} /></button>
              </span>
            )}
            <button type="button" onClick={clearFilters} disabled={!hasFilters}
              className="h-7 px-2.5 rounded-[3px] border border-g200 bg-white text-[11.5px] font-medium text-g600 hover:text-blk hover:bg-g100 transition-colors disabled:opacity-40 disabled:cursor-default">
              Clear
            </button>
            <button type="button" onClick={load} title="Refresh"
              className="inline-flex items-center justify-center h-7 w-7 rounded-[3px] text-g500 hover:bg-g100 hover:text-blk transition-colors">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="ml-auto font-mono text-[10px] text-g500">{shownRows.length} entries · {shownLotCount} lots</div>
          </div>

          <div className="px-6 pt-[14px] flex-1 min-h-0">
            <div ref={tableScrollRef} className="table-scroll-hide-native-bar h-full bg-white border border-g200 overflow-auto m-0">
              <table className="w-full border-collapse text-[12px]">
                <thead className="bg-g100">
                  <tr>
                    <Th label="S.No." />
                    <Th label="Lot No" />
                    <Th label="Date" />
                    <Th label="DO No" />
                    <Th label="Party Name" align="text-left" />
                    <Th label="Outward" align="text-right" />
                    <Th label="Balance" align="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
                  ) : shownRows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center p-8 text-g400 text-[13px]">No outward entries match this filter</td></tr>
                  ) : (
                    shownRows.map((r, idx) => {
                      // Thicker line after the last (shown) row of each lot.
                      const next = shownRows[idx + 1];
                      const lastOfLot = !!next && lotKey(next.lotNo) !== lotKey(r.lotNo);
                      return (
                        <tr key={r.m.id} className={`transition-colors hover:bg-red-mrt/5 ${lastOfLot ? 'border-b-2 border-g300' : 'border-b border-g100 last:border-b-0'}`}>
                          <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g500 whitespace-nowrap">{idx + 1}</td>
                          <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] font-bold text-red-mrt whitespace-nowrap">{r.lotNo || '—'}</td>
                          <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] font-bold whitespace-nowrap">
                            <button type="button" title="Open this outward entry"
                              onClick={() => navigate(`/stock-movements/new-outward?movementId=${encodeURIComponent(r.m.id)}`)}
                              className="font-mono font-bold text-[#2563EB] underline underline-offset-2 hover:opacity-70">
                              {r.m.doNumber || 'Open'}
                            </button>
                          </td>
                          <td className="px-[13px] py-[9px] align-top text-left font-semibold text-blk min-w-[220px]">{r.party || '—'}</td>
                          <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] text-g600 whitespace-nowrap">{brl(r.outward)}</td>
                          <td className={`px-[13px] py-[9px] align-top text-right font-mono text-[11px] font-bold whitespace-nowrap ${r.balance === null ? 'text-g400' : r.balance <= 0 ? 'text-red-mrt' : 'text-blk'}`}
                            title={r.balance === null ? (r.lotNo ? 'No stock lot matches this Lot No' : 'This outward entry has no Lot No') : undefined}>
                            {r.balance === null ? '—' : brl(r.balance)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 px-6 pt-2 pb-5 text-[11px] text-g500 flex-wrap">
            <span>Click a Lot No on Stock Summary to open its Stock Book · DO No opens the outward entry</span>
            <span className="font-mono text-[10.5px] text-blk font-bold whitespace-nowrap">Total outward (filtered): {brl(shownOutwardTotal)}</span>
          </div>
          <FloatingHorizontalScrollbar containerRef={tableScrollRef} />
          <FloatingVerticalScrollbar containerRef={tableScrollRef} horizontalContainerRef={tableScrollRef} />
        </div>
      )}
    </div>
  );
}
