// Stock Movements — inward/outward stock entry ledger, replacing the
// "Stock Inward" / "Delivery Order Sale" Google Forms. Self-contained (own
// Supabase queries, no global store plumbing), same pattern as Stockbook.tsx.
// Both Inward and Outward are fully functional — see src/pages/NewStockInward.tsx
// and src/pages/NewStockOutward.tsx for the add forms (full pages, same
// convention as NewEnquiry/NewOrder — not modals) and
// supabase/migrations/20260903060000_create_stock_movements_table.sql (+ the
// later additive outward-column migrations) for the schema.
//
// 2026-09-04: added Edit/Delete to both tables (src/components/InwardEditModal.tsx
// / OutwardEditModal.tsx — same edit-as-modal convention as StockLotModal.tsx).
// Both Edit and Delete reconcile the linked stock_lots row: Delete reverses
// whatever quantity effect the entry had (best-effort — skipped if no
// matching lot/party column), Edit reverses the OLD effect then re-applies
// the NEW one. Also fixed the Inward table to show the columns Inward
// actually writes (No of Barrels/MOU/Packing Type/Packing/Factory Lot No)
// instead of the old Qty/Packing/Weight Type/Type/Stock Category columns,
// which Inward stopped populating once it moved to its own exclusive
// columns (see supabase/migrations/20260903120400_stock_inward_exclusive_columns.sql)
// — those were always showing "—". Outward's columns were unaffected (it
// still writes packing/weight_type/packaging_type as before).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, RefreshCw, ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { fmtDate, normalizeSearchText } from '../lib/utils';
import { StockMovement } from '../lib/types';
import { InwardEditModal } from '../components/InwardEditModal';
import { OutwardEditModal } from '../components/OutwardEditModal';
import FloatingHorizontalScrollbar from '../components/FloatingHorizontalScrollbar';
import FloatingVerticalScrollbar from '../components/FloatingVerticalScrollbar';

function mapRow(r: any): StockMovement {
  return {
    id: r.id,
    type: r.type,
    warehouse: r.warehouse,
    whLotNo: r.wh_lot_no ?? undefined,
    stockCategory: r.stock_category ?? undefined,
    factLotNo: r.fact_lot_no ?? undefined,
    productName: r.product_name,
    inwardDate: r.inward_date ?? undefined,
    lotQty: r.lot_qty ?? undefined,
    packing: r.packing ?? undefined,
    weightType: r.weight_type ?? undefined,
    packagingType: r.packaging_type ?? undefined,
    totalQty: r.total_qty ?? undefined,
    make: r.make ?? undefined,
    remark: r.remark ?? undefined,
    doNumber: r.do_number ?? undefined,
    doDate: r.do_date ?? undefined,
    numArticles: r.num_articles ?? undefined,
    partyName: r.party_name ?? undefined,
    otherParty: r.other_party ?? undefined,
    transporter: r.transporter ?? undefined,
    otherTransporter: r.other_transporter ?? undefined,
    note: r.note ?? undefined,
    noOfBarrels: r.no_of_barrels ?? undefined,
    mou: r.mou ?? undefined,
    packingType: r.packing_type ?? undefined,
    packingDetail: r.packing_detail ?? undefined,
    created_by: r.created_by ?? undefined,
    created_at: r.created_at ?? undefined,
  };
}

const num = (v?: number) => (v === undefined || v === null ? '—' : v.toLocaleString('en-IN'));

// Party/godown → the stock_lots quantity column each side's entries feed —
// kept in sync with INWARD's Balaji/OUTWARD's BALAJI casing difference (see
// InwardEditModal.tsx / OutwardEditModal.tsx for the same maps).
const INWARD_PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom', Reliable: 'qty_reliable', Swastik: 'qty_swastik', Balaji: 'qty_balaji',
};
const OUTWARD_PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom', Reliable: 'qty_reliable', Swastik: 'qty_swastik', BALAJI: 'qty_balaji', WADA: 'qty_wada',
};

// sticky top-0 + z-10 + an explicit (non-transparent) background pins this
// header cell to the top of the table's own scroll container as the body
// scrolls past underneath — see the merged single-scroll-axis container
// (tableScrollRef) below for why this only works reliably once the table
// has ONE scrolling ancestor instead of two nested ones.
const Th = ({ label, align }: { label: string; align?: 'right' }) => (
  <th className={`sticky top-0 z-10 bg-g100 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] whitespace-nowrap border-b border-g200 text-g500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {label}
  </th>
);

export function StockMovements() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'inward' | 'outward'>('inward');
  const [editingMovement, setEditingMovement] = useState<StockMovement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Single scroll container for both axes, shared by whichever tab
  // (Inward/Outward) is currently rendered — sticky headers below need to
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
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setMovements(data.map(mapRow));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (m: StockMovement) => { setEditingMovement(m); setModalOpen(true); };

  const handleDelete = async (m: StockMovement) => {
    if (!window.confirm(`Delete this ${m.type} entry for "${m.productName}" (${m.whLotNo || 'no lot no.'})? This also reverses its effect on the matching Stockbook lot, if one is found.`)) return;

    const partyCol = m.type === 'inward' ? INWARD_PARTY_COLUMN[m.warehouse] : OUTWARD_PARTY_COLUMN[m.warehouse];
    const whLotNo = (m.whLotNo || '').trim();
    const qty = m.totalQty ?? 0;
    if (partyCol && whLotNo && qty) {
      // Inward added `qty` to the lot, so deleting subtracts it back off.
      // Outward subtracted `qty`, so deleting adds it back.
      const delta = m.type === 'inward' ? -qty : qty;
      try {
        const { data: lots } = await supabase.from('stock_lots').select('*').ilike('wh_lot_no', whLotNo).limit(1);
        const lot = lots?.[0];
        if (lot) {
          const newQuantity = (lot.quantity ?? 0) + delta;
          if (newQuantity <= 0) {
            // The entry being deleted was the only thing keeping this lot's
            // Total Quantity above zero — e.g. it was the sole Inward entry
            // that ever created this lot. Leaving behind a zeroed-out row
            // (every descriptive field still filled in, but every quantity
            // column reading 0) reads as a stale "ghost" lot in Stockbook,
            // not as "this entry was undone" — so the whole stock_lots row
            // is removed instead of updated to a zero. If OTHER movements
            // still reference this same wh_lot_no, they simply won't find a
            // matching lot next time (same as any Stock Movements entry
            // whose lot was never created / already deleted directly from
            // Stockbook) rather than corrupting a lot that's still in use.
            await supabase.from('stock_lots').delete().eq('id', lot.id);
          } else {
            await supabase.from('stock_lots').update({
              [partyCol]: (lot[partyCol] ?? 0) + delta,
              quantity: newQuantity,
              updated_at: new Date().toISOString(),
              updated_by: user?.email ?? null,
            }).eq('id', lot.id);
          }
        }
      } catch (e) {
        console.error('Stock Movements delete: stock_lots reversal failed (movement is still deleted):', e);
      }
    }

    const { error } = await supabase.from('stock_movements').delete().eq('id', m.id);
    if (!error) setMovements(prev => prev.filter(x => x.id !== m.id));
  };

  const inwardCount = movements.filter(m => m.type === 'inward').length;
  const outwardCount = movements.filter(m => m.type === 'outward').length;

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search.trim());
    return movements.filter(m => {
      if (m.type !== tab) return false;
      if (!q) return true;
      const hay = normalizeSearchText([
        m.whLotNo, m.stockCategory, m.productName, m.warehouse, m.make, m.remark,
        m.doNumber, m.partyName, m.otherParty, m.transporter, m.otherTransporter, m.note,
      ].filter(Boolean).join(' '));
      return hay.includes(q);
    });
  }, [movements, search, tab]);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Inventory</div>
        <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight flex items-center gap-2">
          <ArrowLeftRight size={20} className="text-red-mrt shrink-0" />
          Stock <em className="italic text-red-mrt">Movements</em>
        </h1>
        <p className="text-xs text-g500 mt-1 font-light">Inward &amp; outward stock entries, replacing the Stock Inward and Delivery Order Sale Google Forms.</p>
      </div>

      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-4">
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <div
            onClick={() => setTab('inward')}
            className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${tab === 'inward' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
          >
            Inward ({inwardCount})
          </div>
          <div
            onClick={() => setTab('outward')}
            className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${tab === 'outward' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
          >
            Outward ({outwardCount})
          </div>
        </div>

        <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>

        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[240px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="Lot no., product, warehouse..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        {tab === 'inward' && (
          <button
            type="button"
            onClick={() => navigate('/stock-movements/new')}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[3px] bg-red-mrt text-white text-[11px] font-bold hover:bg-red-h transition-colors"
          >
            <Plus size={12} /> New Inward
          </button>
        )}

        {tab === 'outward' && (
          <button
            type="button"
            onClick={() => navigate('/stock-movements/new-outward')}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[3px] bg-red-mrt text-white text-[11px] font-bold hover:bg-red-h transition-colors"
          >
            <Plus size={12} /> New Outward
          </button>
        )}

        <button
          type="button"
          onClick={load}
          title="Refresh"
          className="inline-flex items-center justify-center h-7 w-7 rounded-[3px] text-g500 hover:bg-g100 hover:text-blk transition-colors"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>

        <div className="ml-auto font-mono text-[10px] text-g500">{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}</div>
      </div>

      {tab === 'outward' ? (
        <div className="px-6 pb-7 pt-[14px] flex-1 min-h-0">
          <div ref={tableScrollRef} className="table-scroll-hide-native-bar h-full bg-white border border-g200 overflow-auto m-0">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-g100">
                <tr>
                  <Th label="DO Date" />
                  <Th label="DO Number" />
                  <Th label="WH Lot No" />
                  <Th label="Product Name" />
                  <Th label="Warehouse" />
                  <Th label="Party Name" />
                  <Th label="Transporter" />
                  <Th label="Articles" align="right" />
                  <Th label="Packing" align="right" />
                  <Th label="Weight Type" />
                  <Th label="Type" />
                  <Th label="Total Qty" align="right" />
                  <Th label="Note" />
                  <Th label="Entered By" />
                  <th className="sticky top-0 z-10 bg-g100 px-[13px] py-[9px] border-b border-g200 w-[70px]" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={15} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={15} className="text-center p-8 text-g400 text-[13px]">No outward entries match this filter</td></tr>
                ) : (
                  filtered.map(m => (
                    <tr key={m.id} className="group transition-colors border-b border-g100 last:border-b-0 hover:bg-red-mrt/5">
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{fmtDate(m.doDate)}</td>
                      <td className="px-[13px] py-[9px] align-top font-mono text-[10.5px] font-bold text-red-mrt whitespace-nowrap">{m.doNumber || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top font-mono text-[10.5px] text-g600 whitespace-nowrap">{m.whLotNo || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top font-semibold text-blk min-w-[180px]">{m.productName}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.warehouse}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap max-w-[180px] truncate" title={m.partyName === 'Other' ? m.otherParty : m.partyName}>
                        {m.partyName === 'Other' ? (m.otherParty || 'Other') : (m.partyName || '—')}
                      </td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap max-w-[160px] truncate" title={m.transporter === 'Other' ? m.otherTransporter : m.transporter}>
                        {m.transporter === 'Other' ? (m.otherTransporter || 'Other') : (m.transporter || '—')}
                      </td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] text-g600">{m.numArticles || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] text-g600">{num(m.packing)}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.weightType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.packagingType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(m.totalQty)}</td>
                      <td className="px-[13px] py-[9px] align-top text-g500 max-w-[220px] truncate" title={m.note}>{m.note || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-g500 whitespace-nowrap">{m.created_by || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={() => openEdit(m)} className="p-1.5 rounded text-g400 hover:text-blk hover:bg-g100 transition-colors" title="Edit">
                            <Pencil size={12} />
                          </button>
                          <button type="button" onClick={() => handleDelete(m)} className="p-1.5 rounded text-g400 hover:text-red-mrt hover:bg-red-50 transition-colors" title="Delete">
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
          <FloatingHorizontalScrollbar containerRef={tableScrollRef} />
          <FloatingVerticalScrollbar containerRef={tableScrollRef} horizontalContainerRef={tableScrollRef} />
        </div>
      ) : (
        <div className="px-6 pb-7 pt-[14px] flex-1 min-h-0">
          <div ref={tableScrollRef} className="table-scroll-hide-native-bar h-full bg-white border border-g200 overflow-auto m-0">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-g100">
                <tr>
                  <Th label="Inward Date" />
                  <Th label="WH Lot No" />
                  <Th label="Factory Lot No" />
                  <Th label="Product Name" />
                  <Th label="Warehouse" />
                  <Th label="No of Barrels" align="right" />
                  <Th label="Packing" align="right" />
                  <Th label="MOU" />
                  <Th label="Packing Type" />
                  <Th label="Total Qty" align="right" />
                  <Th label="Make" />
                  <Th label="Remark" />
                  <Th label="Entered By" />
                  <th className="sticky top-0 z-10 bg-g100 px-[13px] py-[9px] border-b border-g200 w-[70px]" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={14} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={14} className="text-center p-8 text-g400 text-[13px]">No inward entries match this filter</td></tr>
                ) : (
                  filtered.map(m => (
                    <tr key={m.id} className="group transition-colors border-b border-g100 last:border-b-0 hover:bg-red-mrt/5">
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{fmtDate(m.inwardDate)}</td>
                      <td className="px-[13px] py-[9px] align-top font-mono text-[10.5px] font-bold text-red-mrt whitespace-nowrap">{m.whLotNo || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top font-mono text-[10.5px] text-g600 whitespace-nowrap">{m.factLotNo || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top font-semibold text-blk min-w-[180px]">{m.productName}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.warehouse}</td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] text-g600">{m.noOfBarrels || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] text-g600">{m.packingDetail || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.mou || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.packingType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(m.totalQty)}</td>
                      <td className="px-[13px] py-[9px] align-top whitespace-nowrap">
                        {m.make
                          ? <span className="inline-flex items-center text-[10.5px] text-g600 bg-g100 px-2 py-0.5 rounded-[3px] font-medium">{m.make}</span>
                          : '—'}
                      </td>
                      <td className="px-[13px] py-[9px] align-top text-g500 max-w-[220px] truncate" title={m.remark}>{m.remark || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-g500 whitespace-nowrap">{m.created_by || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button type="button" onClick={() => openEdit(m)} className="p-1.5 rounded text-g400 hover:text-blk hover:bg-g100 transition-colors" title="Edit">
                            <Pencil size={12} />
                          </button>
                          <button type="button" onClick={() => handleDelete(m)} className="p-1.5 rounded text-g400 hover:text-red-mrt hover:bg-red-50 transition-colors" title="Delete">
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
          <FloatingHorizontalScrollbar containerRef={tableScrollRef} />
          <FloatingVerticalScrollbar containerRef={tableScrollRef} horizontalContainerRef={tableScrollRef} />
        </div>
      )}

      {editingMovement && editingMovement.type === 'inward' && (
        <InwardEditModal
          open={modalOpen}
          movement={editingMovement}
          onClose={() => setModalOpen(false)}
          onSaved={load}
        />
      )}

      {editingMovement && editingMovement.type === 'outward' && (
        <OutwardEditModal
          open={modalOpen}
          movement={editingMovement}
          onClose={() => setModalOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
