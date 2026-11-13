// Stock Summary — lot-wise raw-material stock ledger, by godown/party.
// Migrated from the "Stock Lot Godown Wise" tab of the HIMALAYA STOCK
// SUMMARY Google Sheet; managed directly in EnqBoss from here on.
// Self-contained (own Supabase queries, no global store plumbing) — same
// pattern as ProductCatalogManager.tsx.
// See supabase/migrations/20260901060000_create_stock_lots_table.sql for
// the schema.
//
// 2026-09-05: the per-row Edit/Delete buttons (which opened
// src/components/StockLotModal.tsx) were removed entirely at the user's
// request — editing a lot's numbers directly here bypassed Stock Movements'
// Inward/Outward forms and could silently diverge from them (this is the
// same root cause as the "No of Barrels" removal earlier today — see
// StockLotModal.tsx's own comment and stock_movements_module.md). Stock Summary
// is now purely a read-only ledger view; all changes to a lot's quantities
// go through Stock Movements (src/pages/StockMovements.tsx) instead.
// StockLotModal.tsx itself is left on disk unused rather than deleted, in
// case anything still references it.
//
// 2026-09-05 (later, same day): Delete was asked back — user wants to be
// able to remove a whole row/lot from Stock Summary, just not edit its numbers
// directly (Edit is deliberately NOT restored — that's the part that caused
// the earlier confusion). Delete here is a plain confirm-then-delete of the
// stock_lots row, same as it worked before the removal above — it does NOT
// touch stock_movements (the Inward/Outward audit log is unaffected; if
// entries referencing this lot no still exist there, they simply won't find
// a matching lot next time, same as the existing behavior documented in
// StockMovements.tsx's own handleDelete comment).
//
// 2026-09-07: `num()` (the per-cell quantity formatter) now shows a dash for
// 0 as well as null/undefined — editing an Inward entry's Warehouse moves
// its barrels to the new party column and nets the OLD one down to exactly
// 0 (not null), so a warehouse that no longer holds any of a lot was
// showing a literal "0" instead of the usual "—" for "no stock here". See
// NewStockInward.tsx / stock_movements_module.md for the edit-mode logic
// that produces that 0.
//
// 2026-09-10: S.No. no longer displays the stored `serial_no` column —
// that value is assigned once at row creation and never changes, so
// deleting a row left a permanent gap below it instead of Google Sheets'
// behavior of shifting every following row up by one. S.No. is now purely
// `idx + 1`, the row's position in the currently-rendered `filtered` array
// (see the .map() below) — recomputed fresh on every render, so a delete
// anywhere in the list automatically closes the gap with no renumbering
// logic needed, since nothing is stored. The column's own sort toggle was
// removed for the same reason (sorting by "position in the list" is
// meaningless once it's computed) — the underlying list still defaults to
// serial_no-ascending order (unchanged, see the sort comparator below),
// just no longer user-selectable via this column's header. Nothing else in
// the codebase keys off `serial_no` (Stock Movements matches lots by
// wh_lot_no), so the stored column itself is untouched — display-only fix.
//
// 2026-09-11: Wada-HE/HE/Wada party columns removed entirely (UI, code, and
// the stock_lots.qty_wada_he/qty_he/qty_wada DB columns themselves — see
// 20260911150000_stock_summary_drop_wada_columns.sql) — only 4 real warehouses
// are in active use (Hariom/Reliable/Swastik/Balaji, matching
// StockMovementWarehouse in src/lib/types.ts and the Inward/Outward forms'
// own 4-option dropdown). qty_he was null/zero on every row (no data lost).
// qty_wada_he/qty_wada had real values on 35 rows total — not dead data,
// current barrel counts for lots physically at a location called "Wada"
// that just isn't one of the 4 dropdown warehouses. A one-off UPDATE was
// run directly against the live DB immediately before the drop migration,
// appending a "[legacy stock, moved off system 2026-09-11] Wada: N" (or
// "Wada-HE: N") note to each affected row's remark (existing remarks
// preserved, appended on a new line) so that data isn't silently lost, just
// no longer tracked as its own party column.
//
// 2026-09-12: Delete removed again — users should no longer be able to
// delete a stock lot row directly from Stock Summary. Lots now leave the
// ledger only via the Finished Lot flow (see `isDepleted`/handleFinish
// above) or by getting corrected through Stock Movements.

//
// 2026-11-13: warehouse pills (All | Hariom | Reliable | Swastik | BALAJI,
// kept in the URL as ?wh=BALAJI) + a sticky totals row. A picked warehouse
// shows only lots with barrels > 0 THERE, and Total Quantity becomes that
// warehouse's barrels × packing (sorted by it too). Works together with
// search and the COA-missing filter; the COA cards still count all lots.
// Totals = the rows on screen: lots, barrels (all 4 warehouses, or the picked
// one), each warehouse column's own barrel sum, and quantity per unit (Kg /
// Ltr / other, never added across units). Quantity total = the sum of the
// Total Quantity cells, except lots with no Packing, which are left out and
// listed in an amber note. Packing = what the Packing column shows: numeric
// `packing`, else `packing_detail` when it is a plain number (packingOf).
// Wada is not a button (no stock in EnqBoss).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronsUpDown, ChevronUp, ChevronDown, RefreshCw, PackageCheck, Pencil, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { useAppStore } from '../store';
import { fmtDate, normalizeSearchText } from '../lib/utils';
import { StockLot } from '../lib/types';
import { COA_BUCKETS, CoaBucket, coaAgeBucket, coaAgeDays, isCoaMissing } from '../lib/coaAge';
import { CoaAttachModal } from '../components/CoaAttachModal';
import FloatingHorizontalScrollbar from '../components/FloatingHorizontalScrollbar';
import FloatingVerticalScrollbar from '../components/FloatingVerticalScrollbar';

export function mapRow(r: any): StockLot {
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

// 2026-09-07: zero is now shown as a dash too, same as an empty/never-set
// column — a warehouse that currently holds none of a lot (e.g. after
// editing an Inward entry to move its barrels to a different warehouse,
// which nets the old warehouse's column down to exactly 0 rather than
// leaving it null) reads the same as "no stock here" either way, and
// showing a bare "0" instead of "—" was confusing/looked like a bug.
const num = (v?: number) => (v === undefined || v === null || v === 0 ? '—' : v.toLocaleString('en-IN'));

// 2026-11-13: warehouse pills. `key` is what goes in ?wh=.
type WhKey = 'Hariom' | 'Reliable' | 'Swastik' | 'BALAJI';
const WAREHOUSES: { key: WhKey; field: 'qtyHariom' | 'qtyReliable' | 'qtySwastik' | 'qtyBalaji' }[] = [
  { key: 'Hariom', field: 'qtyHariom' },
  { key: 'Reliable', field: 'qtyReliable' },
  { key: 'Swastik', field: 'qtySwastik' },
  { key: 'BALAJI', field: 'qtyBalaji' },
];
const parseWh = (v: string | null): WhKey | null =>
  WAREHOUSES.find(w => w.key.toLowerCase() === (v || '').trim().toLowerCase())?.key ?? null;
const whField = (wh: WhKey) => WAREHOUSES.find(w => w.key === wh)!.field;
const allBarrels = (l: StockLot) => WAREHOUSES.reduce((s, w) => s + (Number(l[w.field]) || 0), 0);
// Packing as the Packing column shows it: numeric `packing`, else
// `packing_detail` when it is a plain number ("175"). null = no Packing.
const packingOf = (l: StockLot): number | null => {
  const p = Number(l.packing);
  if (l.packing != null && Number.isFinite(p) && p !== 0) return p;
  const d = String(l.packingDetail ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(d) && Number(d) !== 0) return Number(d);
  return null;
};
const hasPacking = (l: StockLot) => packingOf(l) !== null;
// Same pill look as Stock Register's [Stock Summary] [Stock Book] toggle.
const pillCls = (active: boolean) => `px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${active ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`;
// Indian commas, up to 1 decimal.
const fmt1 = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
// MOU groups: Kg and Ltr spellings merge; anything else stays as written.
const unitOf = (mou?: string) => {
  const m = (mou || '').trim();
  const k = m.toLowerCase();
  if (['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'].includes(k)) return 'Kg';
  if (['ltr', 'ltrs', 'litre', 'litres', 'liter', 'liters', 'l'].includes(k)) return 'Ltr';
  return m || '(no MOU)';
};

// 2026-10-06: this is now the "Stock Summary" TAB of the Stock Register page
// (src/pages/StockRegister.tsx), which owns the page header, the stat boxes
// and the tab toggle. Table, columns, data and search are unchanged.
//   tabs          — the [Stock Summary] [Stock Book] toggle, shown first in the toolbar
//   onOpenLot     — a Lot No was clicked → open its Stock Book
//   onLotsChanged — a lot was finished / the list refreshed → refresh the stat boxes
export function StockSummary({ tabs, onOpenLot, onLotsChanged }: {
  tabs?: React.ReactNode;
  onOpenLot?: (lotNo: string) => void;
  onLotsChanged?: () => void;
} = {}) {
  const { user, activeDoer, data, isAdmin } = useAppStore();
  const [lots, setLots] = useState<StockLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string>('serialNo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // A "COA missing" card picked: only those lots, oldest inward date first.
  const [coaFilter, setCoaFilter] = useState<'all' | CoaBucket | null>(null);
  const [coaLot, setCoaLot] = useState<StockLot | null>(null);
  // Picked warehouse lives in the URL (?wh=BALAJI) next to Stock Register's ?tab=.
  const [searchParams, setSearchParams] = useSearchParams();
  const wh = parseWh(searchParams.get('wh'));
  const pickWh = (next: WhKey | null) => setSearchParams(prev => {
    const p = new URLSearchParams(prev);
    if (next) p.set('wh', next); else p.delete('wh');
    return p;
  });
  // Barrels shown for a row: the picked warehouse's, else all 4.
  const rowBarrels = (l: StockLot) => (wh ? Number(l[whField(wh)]) || 0 : allBarrels(l));
  // Total Quantity cell: the picked warehouse's barrels × packing, else the
  // stored all-warehouse quantity (unchanged).
  const rowQty = (l: StockLot): number | undefined =>
    wh ? (hasPacking(l) ? rowBarrels(l) * packingOf(l)! : undefined) : l.quantity;

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
    const { data, error } = await fetchAllRows(() => supabase
      .from('stock_lots')
      .select('*')
      .eq('is_finished', false)
      .order('serial_no', { ascending: true, nullsFirst: false })
      .order('id'));
    if (!error && data) setLots(data.map(mapRow));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleFinish = async (lot: StockLot) => {
    if (!window.confirm(`Mark stock lot "${lot.productName}" (${lot.whLotNo || lot.factLotNo || 'no lot no.'}) as finished? It will move out of Stock Summary into the Finished Lots tab in Stock Movements.`)) return;
    const { error } = await supabase.from('stock_lots').update({
      is_finished: true,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // 2026-09-19: activeDoer (the specific person acting right now,
      // matching SendEmailModal.tsx's "who is sending this" identity),
      // falling back to the raw login email — was raw user?.email only.
      updated_by: activeDoer?.email ?? user?.email ?? null,
    }).eq('id', lot.id);
    if (!error) { setLots(prev => prev.filter(l => l.id !== lot.id)); onLotsChanged?.(); }
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  };

  const pickCoaFilter = (next: 'all' | CoaBucket | null) => {
    setCoaFilter(next);
    setSortCol(next ? 'inwardDate' : 'serialNo');
    setSortDir('asc');
  };

  const coaMissingLots = useMemo(() => lots.filter(isCoaMissing), [lots]);
  const coaCounts = useMemo(() => {
    const counts = new Map<CoaBucket, number>();
    for (const l of coaMissingLots) counts.set(coaAgeBucket(l), (counts.get(coaAgeBucket(l)) ?? 0) + 1);
    return counts;
  }, [coaMissingLots]);
  const coaCards: { key: 'all' | CoaBucket; label: string; count: number; sub: string; cls: string }[] = [
    { key: 'all', label: 'Total missing', count: coaMissingLots.length, sub: `of ${lots.length} lots`, cls: 'bg-g100 text-g700' },
    ...COA_BUCKETS.map(b => ({ key: b.key, label: b.label, count: coaCounts.get(b.key) ?? 0, sub: b.range, cls: b.card })),
  ];
  const coaFilterLabel = coaCards.find(c => c.key === coaFilter)?.label;

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search.trim());
    let list = lots.filter(l => {
      if (coaFilter && (!isCoaMissing(l) || (coaFilter !== 'all' && coaAgeBucket(l) !== coaFilter))) return false;
      if (wh && !(rowBarrels(l) > 0)) return false;
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
      else if (sortCol === 'quantity') { av = rowQty(a) ?? -Infinity; bv = rowQty(b) ?? -Infinity; }
      else if (sortCol === 'make') { av = a.make?.toLowerCase() || ''; bv = b.make?.toLowerCase() || ''; }
      else { av = a.inwardDate || ''; bv = b.inwardDate || ''; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, search, sortCol, sortDir, coaFilter, wh]);

  // Totals for the rows on screen.
  const totals = useMemo(() => {
    const perWh = WAREHOUSES.map(w => filtered.reduce((s, l) => s + (Number(l[w.field]) || 0), 0));
    const barrels = filtered.reduce((s, l) => s + rowBarrels(l), 0);
    const byUnit = new Map<string, number>();
    const noPacking: StockLot[] = [];
    for (const l of filtered) {
      if (!hasPacking(l)) { noPacking.push(l); continue; }
      const q = Number(rowQty(l)) || 0;
      const u = unitOf(l.mou);
      byUnit.set(u, (byUnit.get(u) ?? 0) + q);
    }
    const order = (u: string) => (u === 'Kg' ? 0 : u === 'Ltr' ? 1 : 2);
    const qtyText = [...byUnit.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
      .map(([u, q]) => `${fmt1(q)} ${u}`)
      .join(' · ');
    return { perWh, barrels, qtyText, noPacking };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, wh]);

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

  const Th = ({ label, active }: { label: string; active?: boolean }) => (
    <th className={`sticky top-0 z-10 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] whitespace-nowrap border-b border-g200 text-center ${active ? 'text-red-mrt bg-red-lt-solid' : 'bg-g100 text-g500'}`}>
      {label}
    </th>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-6 mt-3 shrink-0">
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500">COA missing</span>
          <span className="text-[10.5px] text-g400">pending since inward date · click a card to see those lots</span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {coaCards.map(c => (
            <button
              key={c.key}
              type="button"
              aria-pressed={coaFilter === c.key}
              onClick={() => pickCoaFilter(coaFilter === c.key ? null : c.key)}
              className={`text-left border border-g200 rounded-[6px] px-3 py-1.5 min-w-0 transition-opacity hover:opacity-85 ${c.cls} ${coaFilter === c.key ? 'outline-2 outline-current' : ''}`}
            >
              <div className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase opacity-80 truncate">{c.label}</div>
              <div className="text-[22px] font-bold leading-tight">{loading ? '…' : c.count}</div>
              <div className="text-[10px] opacity-75 truncate">{c.sub}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-3">
        {tabs}
        {tabs && <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>}
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

        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]" role="group" aria-label="Warehouse">
          <div role="button" aria-pressed={!wh} onClick={() => pickWh(null)} className={pillCls(!wh)}>All</div>
          {WAREHOUSES.map(w => (
            <div key={w.key} role="button" aria-pressed={wh === w.key} onClick={() => pickWh(w.key)} className={pillCls(wh === w.key)}>{w.key}</div>
          ))}
        </div>

        {coaFilterLabel && (
          <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-red-lt border border-red-mrt/30 text-[11px] font-semibold text-red-mrt whitespace-nowrap">
            COA missing · {coaFilter === 'all' ? 'All' : coaFilterLabel}
            <button type="button" title="Clear" onClick={() => pickCoaFilter(null)} className="p-0.5 rounded-full hover:bg-red-mrt/10"><X size={11} /></button>
          </span>
        )}

        <button
          type="button"
          onClick={() => { load(); onLotsChanged?.(); }}
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
                {WAREHOUSES.map(w => <Th key={w.key} label={w.key} active={wh === w.key} />)}
                <Th label="Packing" />
                <Th label="MOU" />
                <Th label="Packing Type" />
                <SortTh col="quantity" label={wh ? `Total Quantity (${wh})` : 'Total Quantity'} />
                <SortTh col="make" label="Make" />
                <Th label="Remark" />
                {/* 2026-09-21: the "Created / Updated By" column was removed
                    from Stock Summary at the user's request — still shown in
                    Stock Movements and Dispatch. */}
                <th className="sticky top-0 z-10 bg-g100 px-[13px] py-[9px] border-b border-g200 w-[130px]" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={20} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={20} className="text-center p-8 text-g400 text-[13px]">No stock lots match this filter</td></tr>
              ) : (
                filtered.map((l, idx) => {
                const isDepleted = l.quantity === 0;
                return (
                  <tr key={l.id} className="group transition-colors border-b border-g100 last:border-b-0 hover:bg-red-mrt/5">
                    {/* 2026-09-10: computed position in `filtered`, NOT the stored
                        serial_no — Sheets-style row numbering (1..N, no gaps, no
                        duplicates) requires this to be recalculated fresh on every
                        render off whatever rows currently exist, since serial_no is
                        assigned once at creation and never shifts on delete. See
                        this file's header comment / the S.No. column header above
                        (no longer sortable — sorting by "position in the list" is
                        meaningless once it's computed rather than stored). */}
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g500 whitespace-nowrap">{idx + 1}</td>
                    {/* 2026-10-06: Lot No opens that lot's Stock Book (outward passbook). */}
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] font-bold text-red-mrt whitespace-nowrap">
                      {l.whLotNo && onOpenLot ? (
                        <button type="button" onClick={() => onOpenLot(l.whLotNo!)} title="Open this lot's Stock Book"
                          className="font-mono font-bold text-red-mrt underline underline-offset-2 hover:opacity-70">
                          {l.whLotNo}
                        </button>
                      ) : (l.whLotNo || '—')}
                    </td>
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
                      {isCoaMissing(l) ? (() => {
                        const days = coaAgeDays(l);
                        const bucket = COA_BUCKETS.find(b => b.key === coaAgeBucket(l))!;
                        return (
                          <button
                            type="button"
                            onClick={() => setCoaLot(l)}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9.5px] font-bold tracking-[0.5px] whitespace-nowrap hover:opacity-85 transition-opacity ${bucket.pill}`}
                          >
                            MISSING · {days === null ? 'no date' : `${days} day${days === 1 ? '' : 's'}`}
                          </button>
                        );
                      })() : (
                        <span className="inline-flex items-center gap-1 max-w-full">
                          {l.coaUrl?.trim() ? (
                            <a
                              href={l.coaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open ${l.coaFile || 'COA PDF'}`}
                              className="text-red-mrt underline decoration-dotted hover:decoration-solid truncate"
                              onClick={e => e.stopPropagation()}
                            >
                              {l.coaFile || 'View PDF'}
                            </a>
                          ) : (
                            <span className="text-g600 truncate" title="No PDF on file for this lot yet">{l.coaFile}</span>
                          )}
                          {isAdmin && (
                            <button type="button" title="Change COA" onClick={() => setCoaLot(l)}
                              className="shrink-0 p-0.5 text-g400 hover:text-red-mrt transition-colors">
                              <Pencil size={11} />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    {/* Read-only historical snapshot — stock_lots.no_of_barrels is
                        written once at lot creation (NewStockInward.tsx) and never
                        updated after, unlike the live qty_* running-balance columns
                        that follow. Distinct from those on purpose — see the
                        StockLot.noOfBarrels comment in src/lib/types.ts. */}
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{l.noOfBarrels && l.noOfBarrels !== '0' ? l.noOfBarrels : '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyHariom)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyReliable)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtySwastik)}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(l.qtyBalaji)}</td>
                    {/* l.packing is the legacy numeric "pack size per unit" (set via StockLotModal's manual
                        edit); l.packingDetail is the text value the Inward form's own "Packing" field
                        writes — a lot created via New Inward only ever has packingDetail set, so fall back
                        to it whenever packing itself is empty, rather than showing "—" despite Inward data
                        existing for this lot. */}
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{l.packing != null ? num(l.packing) : (l.packingDetail || '—')}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.mou || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{l.packingType || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(rowQty(l))}</td>
                    <td className="px-[13px] py-[9px] align-top text-center whitespace-nowrap">
                      {l.make
                        ? <span className="inline-flex items-center text-[10.5px] text-g600 bg-g100 px-2 py-0.5 rounded-[3px] font-medium">{l.make}</span>
                        : '—'}
                    </td>
                    <td className="px-[13px] py-[9px] align-top text-center text-g500 max-w-[220px] truncate" title={l.remark}>{l.remark || '—'}</td>
                    <td className="px-[13px] py-[9px] align-top">
                      <div className="flex items-center justify-center gap-1">
                        {isDepleted && (
                          <button
                            type="button"
                            onClick={() => handleFinish(l)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-[3px] bg-blk text-white text-[10px] font-bold hover:bg-g700 transition-colors whitespace-nowrap"
                            title="Move this fully depleted lot to Finished Lots"
                          >
                            <PackageCheck size={11} /> Finished Lot
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })
              )}
            </tbody>
            {!loading && filtered.length > 0 && (() => {
              const ft = 'sticky bottom-0 z-10 bg-g100 border-t-2 border-g300 px-[13px] py-[9px] align-top';
              return (
                <tfoot>
                  <tr>
                    <td colSpan={9} className={`${ft} text-[11px] text-blk whitespace-nowrap`}>
                      <span className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 mr-2">Total{wh ? ` · ${wh}` : ''}</span>
                      <span className="font-semibold">{filtered.length.toLocaleString('en-IN')} lots</span>
                      <span className="text-g400 mx-1.5">·</span>
                      <span className="font-semibold">{fmt1(totals.barrels)} barrels</span>
                      {totals.noPacking.length > 0 && (
                        <span
                          className="ml-3 inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 cursor-help"
                          title={`No Packing — quantity not counted:\n${totals.noPacking.map(l => `${l.whLotNo || l.factLotNo || '(no lot no.)'} · ${l.productName} · ${fmt1(rowBarrels(l))} brl`).join('\n')}`}
                        >
                          <AlertTriangle size={11} />
                          {totals.noPacking.length} lot{totals.noPacking.length === 1 ? ' has' : 's have'} no Packing — quantity not counted
                        </span>
                      )}
                    </td>
                    {WAREHOUSES.map((w, i) => (
                      <td key={w.key} className={`${ft} text-center font-mono text-[11px] font-bold whitespace-nowrap ${wh === w.key ? 'text-red-mrt' : 'text-blk'}`}>{num(totals.perWh[i])}</td>
                    ))}
                    <td colSpan={3} className={ft} />
                    <td className={`${ft} text-center font-mono text-[11px] font-bold text-blk whitespace-nowrap`}>{totals.qtyText || '—'}</td>
                    <td colSpan={3} className={ft} />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
      <FloatingHorizontalScrollbar containerRef={tableScrollRef} />
      <FloatingVerticalScrollbar containerRef={tableScrollRef} horizontalContainerRef={tableScrollRef} />
      {coaLot && (
        <CoaAttachModal
          lot={coaLot}
          onClose={() => setCoaLot(null)}
          onSaved={() => { setCoaLot(null); load(); onLotsChanged?.(); }}
        />
      )}
    </div>
  );
}
