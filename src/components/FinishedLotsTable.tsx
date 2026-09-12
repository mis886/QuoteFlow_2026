// Finished Lots — the "Finished Lots" tab of Stock Movements
// (src/pages/StockMovements.tsx). Visually mirrors Stockbook.tsx's table
// (src/pages/Stockbook.tsx) — same column set/order, same search bar
// treatment, same fonts/spacing/borders/sticky-header styling — but this is
// UI-only for now. There is no stock_finished_lots table yet: no Supabase
// query, no shared data or component state with Stockbook.tsx. FINISHED_LOTS
// below is a hardcoded empty array; the table always renders its "no rows"
// state until the real Finished Lots schema/logic is built in a later pass.
// See FinishedLot in src/lib/types.ts for the placeholder row shape.

import React, { useMemo, useRef, useState } from 'react';
import { Search, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { fmtDate, normalizeSearchText } from '../lib/utils';
import { FinishedLot } from '../lib/types';
import FloatingHorizontalScrollbar from './FloatingHorizontalScrollbar';
import FloatingVerticalScrollbar from './FloatingVerticalScrollbar';

// No data source yet — see this file's header comment. Always empty until
// the real Finished Lots table/schema exists.
const FINISHED_LOTS: FinishedLot[] = [];

// Same "0 reads as —" rule as Stockbook.tsx's own num() — kept identical so
// a real data source can be wired in later without a styling mismatch.
const num = (v?: number) => (v === undefined || v === null || v === 0 ? '—' : v.toLocaleString('en-IN'));

export function FinishedLotsTable() {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string>('whLotNo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Single scroll container for both axes — same sticky-header requirement
  // (and the same nested-overflow gotcha) as Stockbook.tsx's own tableScrollRef.
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search.trim());
    let list = FINISHED_LOTS.filter(l => {
      if (!q) return true;
      const hay = normalizeSearchText([
        l.whLotNo, l.factLotNo, l.productCode, l.productName,
      ].filter(Boolean).join(' '));
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      let av: any, bv: any;
      if (sortCol === 'productName') { av = a.productName?.toLowerCase() || ''; bv = b.productName?.toLowerCase() || ''; }
      else if (sortCol === 'inwardDate') { av = a.inwardDate || ''; bv = b.inwardDate || ''; }
      else if (sortCol === 'quantity') { av = a.quantity ?? -Infinity; bv = b.quantity ?? -Infinity; }
      else { av = a.whLotNo || ''; bv = b.whLotNo || ''; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [search, sortCol, sortDir]);

  const SortTh = ({ col, label }: { col: string; label: string }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`sticky top-0 z-10 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] whitespace-nowrap border-b border-g200 cursor-pointer select-none hover:bg-g200 transition-colors text-center ${sortCol === col ? 'text-red-mrt bg-red-lt-solid' : 'text-g500 bg-g100'}`}
    >
      <span className="inline-flex items-center justify-center gap-1 w-full">
        {label}
        {sortCol === col ? (sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />) : <ChevronsUpDown size={9} className="text-g300" />}
      </span>
    </th>
  );

  const Th = ({ label }: { label: string }) => (
    <th className="sticky top-0 z-10 bg-g100 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] whitespace-nowrap border-b border-g200 text-center text-g500">
      {label}
    </th>
  );

  return (
    <>
      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[240px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="Lot no., product..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        <div className="ml-auto font-mono text-[10px] text-g500">{filtered.length} lots</div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 min-h-0">
        <div ref={tableScrollRef} className="table-scroll-hide-native-bar h-full bg-white border border-g200 overflow-auto m-0">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-g100">
              <tr>
                <Th label="S.No." />
                <SortTh col="whLotNo" label="Lot No" />
                <Th label="Factory Lot Number" />
                <Th label="Product Code" />
                <SortTh col="productName" label="Product Name" />
                <SortTh col="inwardDate" label="Inward Date" />
                <Th label="Sample Off" />
                <Th label="COA" />
                <Th label="Opening Stock" />
                <Th label="Hariom" />
                <Th label="Reliable" />
                <Th label="Swastik" />
                <Th label="BALAJI" />
                <Th label="Packing" />
                <Th label="MOU" />
                <Th label="Packing Type" />
                <SortTh col="quantity" label="Total Quantity" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={17} className="text-center p-8 text-g400 text-[13px]">No finished lots yet — this module is coming soon.</td></tr>
              ) : (
                filtered.map((l, idx) => (
                  <tr key={l.id} className="group transition-colors border-b border-g100 last:border-b-0 hover:bg-red-mrt/5">
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g500 whitespace-nowrap">{idx + 1}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] font-bold text-red-mrt whitespace-nowrap">{l.whLotNo || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] text-g600 whitespace-nowrap">{l.factLotNo || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] text-g600 whitespace-nowrap">{l.productCode || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-semibold text-blk min-w-[200px]">{l.productName}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{fmtDate(l.inwardDate)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center">
                      {l.sampleOff
                        ? <span className="text-[10px] font-semibold text-sW">Yes</span>
                        : <span className="text-[10px] text-g400">No</span>}
                    </td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] whitespace-nowrap max-w-[160px] truncate">
                      {l.coaUrl ? (
                        <a
                          href={l.coaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${l.coaFile || 'COA PDF'}`}
                          className="text-red-mrt underline decoration-dotted hover:decoration-solid"
                          onClick={e => e.stopPropagation()}
                        >
                          {l.coaFile || 'View PDF'}
                        </a>
                      ) : l.coaFile ? (
                        <span className="text-g600" title="No PDF on file for this lot yet">{l.coaFile}</span>
                      ) : (
                        <span className="text-g600">—</span>
                      )}
                    </td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{l.openingStock || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyHariom)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyReliable)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtySwastik)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyBalaji)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.packing)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.mou || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.packingType || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(l.quantity)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <FloatingHorizontalScrollbar containerRef={tableScrollRef} />
        <FloatingVerticalScrollbar containerRef={tableScrollRef} horizontalContainerRef={tableScrollRef} />
      </div>
    </>
  );
}
