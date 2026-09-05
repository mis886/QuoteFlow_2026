// Stockbook — lot-wise raw-material stock ledger, by godown/party.
// Migrated from the "Stock Lot Godown Wise" tab of the HIMALAYA STOCK
// SUMMARY Google Sheet; managed directly in EnqBoss from here on.
// Self-contained (own Supabase queries, no global store plumbing) — same
// pattern as ProductCatalogManager.tsx. Editing an existing lot opens
// src/components/StockLotModal.tsx (edit-only). There is currently no
// in-app "add a new lot" entry point — that full-page flow
// (src/pages/NewStockLot.tsx, route /stockbook/new) was removed.
// See supabase/migrations/20260901060000_create_stock_lots_table.sql for
// the schema.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronsUpDown, ChevronUp, ChevronDown, Pencil, Trash2, RefreshCw, Warehouse } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDate, normalizeSearchText } from '../lib/utils';
import { StockLot } from '../lib/types';
import { StockLotModal } from '../components/StockLotModal';
import FloatingHorizontalScrollbar from '../components/FloatingHorizontalScrollbar';
import FloatingVerticalScrollbar from '../components/FloatingVerticalScrollbar';

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
    coaFile: r.coa_file ?? undefined,
    coaUrl: r.coa_url ?? undefined,
    qtyHariom: r.qty_hariom ?? undefined,
    qtyWadaHe: r.qty_wada_he ?? undefined,
    qtyHe: r.qty_he ?? undefined,
    qtyReliable: r.qty_reliable ?? undefined,
    qtySwastik: r.qty_swastik ?? undefined,
    qtyBalaji: r.qty_balaji ?? undefined,
    qtyWada: r.qty_wada ?? undefined,
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
  };
}

const num = (v?: number) => (v === undefined || v === null ? '—' : v.toLocaleString('en-IN'));

export function Stockbook() {
  const [lots, setLots] = useState<StockLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string>('serialNo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<StockLot | null>(null);
  // Single scroll container for both axes — sticky headers below need to
  // stick to the SAME element that scrolls vertically, and nesting a
  // separate overflow-x-auto div inside a separate overflow-y-auto one
  // breaks that (the inner div's overflow-x forces its own overflow-y to
  // compute as "auto" too, per the CSS overflow spec, making IT the sticky
  // positioning ancestor instead of the actual outer scroller — the classic
  // "sticky header doesn't stick" nested-scroll-container gotcha).
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_lots')
      .select('*')
      .order('serial_no', { ascending: true, nullsFirst: false });
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
        l.whLotNo, l.factLotNo, l.productCode, l.productName, l.make, l.remark,
      ].filter(Boolean).join(' '));
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      let av: any, bv: any;
      if (sortCol === 'serialNo') { av = a.serialNo ?? Infinity; bv = b.serialNo ?? Infinity; }
      else if (sortCol === 'productName') { av = a.productName?.toLowerCase() || ''; bv = b.productName?.toLowerCase() || ''; }
      else if (sortCol === 'whLotNo') { av = a.whLotNo || ''; bv = b.whLotNo || ''; }
      else if (sortCol === 'quantity') { av = a.quantity ?? -Infinity; bv = b.quantity ?? -Infinity; }
      else if (sortCol === 'make') { av = a.make?.toLowerCase() || ''; bv = b.make?.toLowerCase() || ''; }
      else { av = a.inwardDate || ''; bv = b.inwardDate || ''; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [lots, search, sortCol, sortDir]);

  const openEdit = (lot: StockLot) => { setEditingLot(lot); setModalOpen(true); };

  const handleDelete = async (lot: StockLot) => {
    if (!window.confirm(`Delete stock lot "${lot.productName}" (${lot.whLotNo || lot.factLotNo || 'no lot no.'})?`)) return;
    const { error } = await supabase.from('stock_lots').delete().eq('id', lot.id);
    if (!error) setLots(prev => prev.filter(l => l.id !== lot.id));
  };

  // sticky top-0 + z-10 + an explicit (non-transparent) background pins
  // these header cells to the top of the table's own scroll container as
  // the body scrolls past underneath — see the merged single-scroll-axis
  // container below (tableScrollRef) for why this only works reliably once
  // the table has ONE scrolling ancestor instead of two nested ones.
  // The active-sort branch uses --color-red-lt-solid (an opaque tint) rather
  // than bg-red-lt/40 — --color-red-lt is itself a low-alpha rgba(), so a
  // sticky header using it (or any opacity-modified version of it) let
  // scrolled-past row text visibly bleed through instead of being hidden
  // like every other (opaque bg-g100) header.
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
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Inventory</div>
        <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight flex items-center gap-2">
          <Warehouse size={20} className="text-red-mrt shrink-0" />
          Stock <em className="italic text-red-mrt">Book</em>
        </h1>
        <p className="text-xs text-g500 mt-1 font-light">Lot-wise raw-material stock, split by party / godown.</p>
      </div>

      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-4">
        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[240px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="Lot no., product, make..."
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
                <SortTh col="serialNo" label="S.No." />
                <SortTh col="whLotNo" label="Lot No" />
                <Th label="Factory Lot Number" />
                <Th label="Product Code" />
                <SortTh col="productName" label="Product Name" />
                <SortTh col="inwardDate" label="Inward Date" />
                <Th label="Sample Off" />
                <Th label="COA" />
                <Th label="Hariom" />
                <Th label="Wada-HE" />
                <Th label="HE" />
                <Th label="Reliable" />
                <Th label="Swastik" />
                <Th label="BALAJI" />
                <Th label="Wada" />
                <Th label="Packing" />
                <Th label="MOU" />
                <Th label="Packing Type" />
                <SortTh col="quantity" label="Total Quantity" />
                <SortTh col="make" label="Make" />
                <Th label="Remark" />
                <th className="sticky top-0 z-10 bg-g100 px-[13px] py-[9px] border-b border-g200 w-[70px]" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={22} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={22} className="text-center p-8 text-g400 text-[13px]">No stock lots match this filter</td></tr>
              ) : (
                filtered.map(l => (
                  <tr key={l.id} className="group transition-colors border-b border-g100 last:border-b-0 hover:bg-red-mrt/5">
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g500 whitespace-nowrap">{l.serialNo ?? '—'}</td>
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
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyHariom)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyWadaHe)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyHe)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyReliable)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtySwastik)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyBalaji)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyWada)}</td>
                    {/* l.packing is the legacy numeric "pack size per unit" (set via StockLotModal's manual
                        edit); l.packingDetail is the text value the Inward form's own "Packing" field
                        writes — a lot created via New Inward only ever has packingDetail set, so fall back
                        to it whenever packing itself is empty, rather than showing "—" despite Inward data
                        existing for this lot. */}
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{l.packing != null ? num(l.packing) : (l.packingDetail || '—')}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.mou || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.packingType || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(l.quantity)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center whitespace-nowrap">
                      {l.make
                        ? <span className="inline-flex items-center text-[10.5px] text-g600 bg-g100 px-2 py-0.5 rounded-[3px] font-medium">{l.make}</span>
                        : '—'}
                    </td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g500 max-w-[220px] truncate" title={l.remark}>{l.remark || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEdit(l)}
                          className="p-1.5 rounded text-g400 hover:text-blk hover:bg-g100 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(l)}
                          className="p-1.5 rounded text-g400 hover:text-red-mrt hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <FloatingHorizontalScrollbar containerRef={tableScrollRef} />
      <FloatingVerticalScrollbar containerRef={tableScrollRef} horizontalContainerRef={tableScrollRef} />

      {editingLot && (
        <StockLotModal
          open={modalOpen}
          lot={editingLot}
          onClose={() => setModalOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
