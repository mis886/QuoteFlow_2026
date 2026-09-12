// Finished Lots — the "Finished Lots" tab of Stock Movements
// (src/pages/StockMovements.tsx). Visually mirrors Stockbook.tsx's table
// (src/pages/Stockbook.tsx) — same column set/order, same search bar
// treatment, same fonts/spacing/borders/sticky-header styling. Reads
// public.stock_lots filtered to is_finished = true — rows land here when
// Stockbook's "Finished Lot" button (shown once a lot's Total Quantity
// hits 0) is clicked, which sets is_finished/finished_at on that same
// stock_lots row (see Stockbook.tsx's handleFinish()) rather than moving
// the data to a separate table. Self-contained (own Supabase query, own
// state) — no shared state with Stockbook.tsx, same convention
// StockMovements.tsx uses for its own separate mapRow().

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronsUpDown, ChevronUp, ChevronDown, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDate, normalizeSearchText } from '../lib/utils';
import { StockLot } from '../lib/types';
import FloatingHorizontalScrollbar from './FloatingHorizontalScrollbar';
import FloatingVerticalScrollbar from './FloatingVerticalScrollbar';

function mapRow(r: any): StockLot {
  return {
    id: r.id,
    serialNo: r.serial_no ?? undefined,
    whLotNo: r.wh_lot_no ?? undefined,
    factLotNo: r.fact_lot_no ?? undefined,
    productCode: r.product_code ?? undefined,
    productName: r.product_name,
    inwardDate: r.inward_date ?? undefined,
    sampleOff: !!r.sample_off,
    noOfBarrels: r.no_of_barrels ?? undefined,
    coaFile: r.coa_file ?? undefined,
    coaUrl: r.coa_url ?? undefined,
    qtyHariom: r.qty_hariom ?? undefined,
    qtyReliable: r.qty_reliable ?? undefined,
    qtySwastik: r.qty_swastik ?? undefined,
    qtyBalaji: r.qty_balaji ?? undefined,
    packing: r.packing ?? undefined,
    packingDetail: r.packing_detail ?? undefined,
    mou: r.mou ?? undefined,
    packingType: r.packing_type ?? undefined,
    quantity: r.quantity ?? undefined,
    make: r.make ?? undefined,
    remark: r.remark ?? undefined,
    created_by: r.created_by ?? undefined,
    updated_by: r.updated_by ?? undefined,
    created_at: r.created_at ?? undefined,
    updated_at: r.updated_at ?? undefined,
    isFinished: !!r.is_finished,
    finishedAt: r.finished_at ?? undefined,
  };
}

// Same "0 reads as —" rule as Stockbook.tsx's own num().
const num = (v?: number) => (v === undefined || v === null || v === 0 ? '—' : v.toLocaleString('en-IN'));

export function FinishedLotsTable() {
  const [lots, setLots] = useState<StockLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string>('whLotNo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Single scroll container for both axes — same sticky-header requirement
  // (and the same nested-overflow gotcha) as Stockbook.tsx's own tableScrollRef.
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_lots')
      .select('*')
      .eq('is_finished', true)
      .order('finished_at', { ascending: false });
    if (!error && data) setLots(data.map(mapRow));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search.trim());
    let list = lots.filter(l => {
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
  }, [lots, search, sortCol, sortDir]);

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

        <button
          type="button"
          onClick={load}
          title="Refresh"
          className="inline-flex items-center justify-center h-7 w-7 rounded-[3px] text-g500 hover:bg-g100 hover:text-blk transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>

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
                <Th label="Finished On" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={18} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={18} className="text-center p-8 text-g400 text-[13px]">No finished lots yet.</td></tr>
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
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{l.noOfBarrels && l.noOfBarrels !== '0' ? l.noOfBarrels : '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyHariom)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyReliable)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtySwastik)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyBalaji)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{l.packing != null ? num(l.packing) : (l.packingDetail || '—')}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.mou || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.packingType || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(l.quantity)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.finishedAt ? new Date(l.finishedAt).toLocaleDateString('en-IN') : '—'}</td>
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
