// Stock Register (2026-10-06) — one page, two tabs:
//   Stock Summary — the lot-wise stock ledger (src/pages/StockSummary.tsx),
//                   unchanged; a Lot No there opens that lot's Stock Book.
//   Stock Book    — read-only passbook: one row per stock movement (INWARD
//                   and OUTWARD), with the barrels in / out and the barrels
//                   left in that lot after it.
// The active tab lives in the URL (?tab=summary | ?tab=book, plus &lot=<Lot No>
// when the Stock Book was opened from a Lot No), so a refresh stays put.
//
// No new tables or columns. Data is read with the same two queries Stock
// Summary and Stock Movements already use (stock_lots / stock_movements) and
// the same row mappers. Entries are still added / edited / deleted in Stock
// Movements only.
//
// BALANCE maths (Stock Book), per lot — matched to stock_lots by wh_lot_no,
// case-insensitive, the same way the Outward form matches a lot. Rows are
// taken in date order (then created_at); each inward adds its barrels
// (no_of_barrels), each outward takes its barrels (num_articles) away.
//   currentBarrels = qty_hariom + qty_reliable + qty_swastik + qty_balaji
//   Where the running total starts:
//     • first entry is an INWARD            → 0
//     • no inward rows (old imported lots)  → currentBarrels + all outward
//     • inward rows, but an outward first   → currentBarrels − inward + outward
//       (opening stock from before the first logged entry)
//   The last row should equal currentBarrels. It always does for the two
//   back-calculated starts; when starting from 0 it may not, and that lot's
//   last Balance then carries an amber "mismatch" tag.
// Worked out over ALL of the lot's rows, before any search / date filter —
// filtering only hides rows, it never changes a balance.
//
// 2026-10-06 (later): inward rows added; ALL movements are now loaded with
// no type filter in the query (paged, so more than 1000 rows still load) and
// split by type here, case-insensitively; a failed query is logged and shown
// on the page instead of silently reading as "0 entries".
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
const isInward = (m: StockMovement) => String(m.type || '').trim().toLowerCase() === 'inward';
const isOutward = (m: StockMovement) => String(m.type || '').trim().toLowerCase() === 'outward';
// Barrels of one movement: Inward stores no_of_barrels, Outward num_articles.
const barrelsOf = (m: StockMovement) => Number(isInward(m) ? (m.noOfBarrels ?? m.numArticles) : (m.numArticles ?? m.noOfBarrels)) || 0;
const currentBarrels = (l: StockLot) => (l.qtyHariom ?? 0) + (l.qtyReliable ?? 0) + (l.qtySwastik ?? 0) + (l.qtyBalaji ?? 0);
// DATE column: DO Date (outward) / Inward Date (inward), else the day the
// entry was created (IST). yyyy-MM-dd.
const rowDate = (m: StockMovement) =>
  (isInward(m) ? m.inwardDate : m.doDate) || (m.created_at ? fmtIST(new Date(m.created_at), 'yyyy-MM-dd') : '');
// Inward entries store no supplier / party — only the Make — so they read
// "Inward · <Make>", or just "Inward".
const partyOf = (m: StockMovement) => {
  if (isInward(m)) return m.partyName || (m.make ? `Inward · ${m.make}` : 'Inward');
  return m.partyName === 'Other' ? (m.otherParty || 'Other') : (m.partyName || '');
};
const brl = (n: number) => `${n.toLocaleString('en-IN')} brl`;

// PostgREST returns at most 1000 rows per request — page through so every row loads.
async function fetchAll(table: string, orderCol: string): Promise<{ rows: any[]; error: string }> {
  const rows: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').order(orderCol, { ascending: true, nullsFirst: false }).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) { console.error(`Stock Register: could not load ${table}:`, error); return { rows, error: error.message || String(error) }; }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { rows, error: '' };
  }
}

interface BookRow {
  m: StockMovement;
  lotNo: string;            // as typed on the outward entry ('' = none)
  date: string;             // yyyy-MM-dd
  party: string;
  inward: number | null;    // barrels in  (inward rows only)
  outward: number | null;   // barrels out (outward rows only)
  balance: number | null;   // null = no Lot No, or no matching stock lot
  mismatch: number | null;  // set on a lot's LAST row when its balance ≠ Stock Summary: the Stock Summary barrels
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

  // ALL lots (finished ones too — an old row still needs its lot to work out
  // a balance) + every inward and outward entry.
  const [lots, setLots] = useState<StockLot[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    const [lotsRes, movRes] = await Promise.all([
      fetchAll('stock_lots', 'serial_no'),
      fetchAll('stock_movements', 'created_at'),
    ]);
    setLots(lotsRes.rows.map(mapLotRow));
    setMovements(movRes.rows.map(mapMovementRow).filter(m => isInward(m) || isOutward(m)));
    setLoadError([lotsRes.error && `Stock lots: ${lotsRes.error}`, movRes.error && `Stock movements: ${movRes.error}`].filter(Boolean).join(' · '));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Header stat boxes. Active lots = the lots listed on Stock Summary.
  const activeLots = useMemo(() => lots.filter(l => !l.isFinished), [lots]);
  const zeroBalanceLots = activeLots.filter(l => currentBarrels(l) === 0).length;
  const thisMonth = fmtIST(new Date(), 'yyyy-MM');
  const outwardThisMonth = movements.filter(m => isOutward(m) && rowDate(m).startsWith(thisMonth)).length;

  // Every inward / outward row with its balance, in passbook order: Lot No,
  // then date, then created_at. Rows without a Lot No go last.
  const bookRows = useMemo<BookRow[]>(() => {
    // First match wins, same as the Outward form's own lookup (limit 1).
    const lotByKey = new Map<string, StockLot>();
    for (const l of lots) { const k = lotKey(l.whLotNo); if (k && !lotByKey.has(k)) lotByKey.set(k, l); }

    const byLot = new Map<string, StockMovement[]>();
    for (const m of movements) {
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
      const totalIn = rows.reduce((s, m) => s + (isInward(m) ? barrelsOf(m) : 0), 0);
      const totalOut = rows.reduce((s, m) => s + (isInward(m) ? 0 : barrelsOf(m)), 0);
      const current = lot ? currentBarrels(lot) : 0;
      // See the BALANCE maths note at the top of this file.
      let left = isInward(rows[0]) ? 0 : current - totalIn + totalOut;
      rows.forEach((m, i) => {
        const inward = isInward(m);
        const qty = barrelsOf(m);
        left += inward ? qty : -qty;
        const last = i === rows.length - 1;
        out.push({
          m, lotNo: (m.whLotNo || '').trim(), date: rowDate(m), party: partyOf(m),
          inward: inward ? qty : null, outward: inward ? null : qty,
          balance: lot ? left : null,
          mismatch: lot && last && Math.abs(left - current) > 1e-6 ? current : null,
        });
      });
    }
    return out;
  }, [lots, movements]);

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
  const shownInwardTotal = shownRows.reduce((s, r) => s + (r.inward ?? 0), 0);
  const shownOutwardTotal = shownRows.reduce((s, r) => s + (r.outward ?? 0), 0);
  // Lots whose passbook doesn't end on their Stock Summary barrels (all lots, not just the filtered ones).
  const mismatchLotCount = bookRows.filter(r => r.mismatch !== null).length;

  // Same single-scroll-container + sticky header set-up as the Stock Summary table.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  // Header cells take the same alignment as their column's cells.
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
            <p className="text-xs text-g500 mt-1 font-light">Lot-wise raw-material stock, with inward and outward history, by party / godown.</p>
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
            <div className="ml-auto font-mono text-[10px] text-g500">
              {shownRows.length} entries · {shownLotCount} lots
              {mismatchLotCount > 0 && <span className="text-amber-700" title="Lots whose last Balance doesn't match Stock Summary"> · {mismatchLotCount} mismatch</span>}
            </div>
          </div>
          {loadError && (
            <div className="px-6 py-2 bg-red-lt-solid border-b border-red-mrt/30 text-[11.5px] font-bold text-red-mrt">
              Could not load everything — {loadError}. Press Refresh to try again.
            </div>
          )}

          <div className="px-6 pt-[14px] flex-1 min-h-0">
            <div ref={tableScrollRef} className="table-scroll-hide-native-bar h-full bg-white border border-g200 overflow-auto m-0">
              {/* 2026-10-06: fixed layout + explicit widths so headers and cells line
                  up and the columns don't spread out. Party Name takes the rest
                  (at least 260px — the table's min-width is the sum of the columns). */}
              <table className="w-full min-w-[1020px] table-fixed border-collapse text-[12px]">
                <colgroup>
                  <col style={{ width: 60 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 110 }} />
                  <col />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead className="bg-g100">
                  <tr>
                    <Th label="S.No." />
                    <Th label="Lot No" />
                    <Th label="Date" />
                    <Th label="DO No" />
                    <Th label="Party Name" align="text-left" />
                    <Th label="Inward" align="text-right" />
                    <Th label="Outward" align="text-right" />
                    <Th label="Balance" align="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
                  ) : shownRows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center p-8 text-g400 text-[13px]">No entries match this filter</td></tr>
                  ) : (
                    shownRows.map((r, idx) => {
                      // Thicker line after the last (shown) row of each lot.
                      const next = shownRows[idx + 1];
                      const lastOfLot = !!next && lotKey(next.lotNo) !== lotKey(r.lotNo);
                      return (
                        <tr key={r.m.id} className={`transition-colors hover:bg-red-mrt/5 ${lastOfLot ? 'border-b-2 border-g300' : 'border-b border-g100 last:border-b-0'}`}>
                          <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g500 whitespace-nowrap">{idx + 1}</td>
                          <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] font-bold text-red-mrt truncate" title={r.lotNo || undefined}>{r.lotNo || '—'}</td>
                          <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] font-bold truncate">
                            {r.outward !== null ? (
                              <button type="button" title="Open this outward entry"
                                onClick={() => navigate(`/stock-movements/new-outward?movementId=${encodeURIComponent(r.m.id)}`)}
                                className="font-mono font-bold text-[#2563EB] underline underline-offset-2 hover:opacity-70">
                                {r.m.doNumber || 'Open'}
                              </button>
                            ) : <span className="text-g400 font-normal">—</span>}
                          </td>
                          <td className="px-[13px] py-[9px] align-top text-left font-semibold text-blk truncate" title={r.party || undefined}>{r.party || '—'}</td>
                          <td className={`px-[13px] py-[9px] align-top text-right font-mono text-[11px] whitespace-nowrap ${r.inward !== null ? 'font-bold text-[#0B5C2A]' : 'text-g400'}`}>{r.inward !== null ? `+${brl(r.inward)}` : '—'}</td>
                          <td className={`px-[13px] py-[9px] align-top text-right font-mono text-[11px] whitespace-nowrap ${r.outward !== null ? 'text-g600' : 'text-g400'}`}>{r.outward !== null ? brl(r.outward) : '—'}</td>
                          <td className={`px-[13px] py-[9px] align-top text-right font-mono text-[11px] font-bold whitespace-nowrap ${r.balance === null ? 'text-g400' : r.balance <= 0 ? 'text-red-mrt' : 'text-blk'}`}
                            title={r.balance === null ? (r.lotNo ? 'No stock lot matches this Lot No' : 'This entry has no Lot No') : undefined}>
                            {r.mismatch !== null && (
                              <span title={`Doesn't match Stock Summary (${brl(r.mismatch)})`}
                                className="mr-1.5 inline-block align-middle font-sans text-[8.5px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-300 rounded-[3px] px-1 py-[1px] cursor-help">
                                mismatch
                              </span>
                            )}
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
            <span>Click a Lot No on Stock Summary to open its Stock Book · inward and outward entries in date order · DO No opens the outward entry</span>
            <span className="font-mono text-[10.5px] text-blk font-bold whitespace-nowrap">Total inward (filtered): {brl(shownInwardTotal)} · Total outward (filtered): {brl(shownOutwardTotal)}</span>
          </div>
          <FloatingHorizontalScrollbar containerRef={tableScrollRef} />
          <FloatingVerticalScrollbar containerRef={tableScrollRef} horizontalContainerRef={tableScrollRef} />
        </div>
      )}
    </div>
  );
}
