// Stock Movements — inward/outward stock entry ledger, replacing the
// "Stock Inward" Google Form. Self-contained (own Supabase queries, no
// global store plumbing), same pattern as Stockbook.tsx. Inward is fully
// functional; Outward is parked until that DO form's fields are shared —
// see src/components/StockInwardModal.tsx for the add form and
// supabase/migrations/20260903060000_create_stock_movements_table.sql for
// the schema.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDate, normalizeSearchText } from '../lib/utils';
import { StockMovement } from '../lib/types';
import { StockInwardModal } from '../components/StockInwardModal';
import FloatingHorizontalScrollbar from '../components/FloatingHorizontalScrollbar';
import FloatingVerticalScrollbar from '../components/FloatingVerticalScrollbar';

function mapRow(r: any): StockMovement {
  return {
    id: r.id,
    type: r.type,
    warehouse: r.warehouse,
    whLotNo: r.wh_lot_no,
    stockCategory: r.stock_category ?? undefined,
    productName: r.product_name,
    lotDate: r.lot_date ?? undefined,
    lotQty: r.lot_qty ?? undefined,
    packing: r.packing ?? undefined,
    weightType: r.weight_type ?? undefined,
    packagingType: r.packaging_type ?? undefined,
    totalQty: r.total_qty ?? undefined,
    make: r.make ?? undefined,
    remark: r.remark ?? undefined,
    created_by: r.created_by ?? undefined,
    created_at: r.created_at ?? undefined,
  };
}

const num = (v?: number) => (v === undefined || v === null ? '—' : v.toLocaleString('en-IN'));

const Th = ({ label, align }: { label: string; align?: 'right' }) => (
  <th className={`font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] whitespace-nowrap border-b border-g200 text-g500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {label}
  </th>
);

export function StockMovements() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'inward' | 'outward'>('inward');
  const [modalOpen, setModalOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const verticalScrollRef = useRef<HTMLDivElement>(null);

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

  const inwardCount = movements.filter(m => m.type === 'inward').length;
  const outwardCount = movements.filter(m => m.type === 'outward').length;

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search.trim());
    return movements.filter(m => {
      if (m.type !== tab) return false;
      if (!q) return true;
      const hay = normalizeSearchText([
        m.whLotNo, m.stockCategory, m.productName, m.warehouse, m.make, m.remark,
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
        <p className="text-xs text-g500 mt-1 font-light">Inward &amp; outward stock entries, replacing the Stock Inward Google Form.</p>
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
            title="Parked until the Outward form is ready"
            className="px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium text-g400 whitespace-nowrap select-none cursor-not-allowed"
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
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[3px] bg-red-mrt text-white text-[11px] font-bold hover:bg-red-h transition-colors"
          >
            <Plus size={12} /> New Inward
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
        <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
          <div className="bg-white border border-g200 rounded-[4px] p-10 text-center text-g400 text-[13px]">
            Outward stock entry is parked until the Outward form is ready — not built yet.
          </div>
        </div>
      ) : (
        <div ref={verticalScrollRef} className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
          <div ref={tableScrollRef} className="bg-white border border-g200 overflow-x-auto m-0">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-g100">
                <tr>
                  <Th label="Date" />
                  <Th label="WH Lot No" />
                  <Th label="Stock Category" />
                  <Th label="Product Name" />
                  <Th label="Warehouse" />
                  <Th label="Qty" align="right" />
                  <Th label="Packing" align="right" />
                  <Th label="Weight Type" />
                  <Th label="Type" />
                  <Th label="Total Qty" align="right" />
                  <Th label="Make" />
                  <Th label="Remark" />
                  <Th label="Entered By" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={13} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={13} className="text-center p-8 text-g400 text-[13px]">No inward entries match this filter</td></tr>
                ) : (
                  filtered.map(m => (
                    <tr key={m.id} className="group transition-colors border-b border-g100 last:border-b-0 hover:bg-red-mrt/5">
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{fmtDate(m.lotDate)}</td>
                      <td className="px-[13px] py-[9px] align-top font-mono text-[10.5px] font-bold text-red-mrt whitespace-nowrap">{m.whLotNo || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.stockCategory || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top font-semibold text-blk min-w-[180px]">{m.productName}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.warehouse}</td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] text-g600">{num(m.lotQty)}</td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] text-g600">{num(m.packing)}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.weightType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-g600 whitespace-nowrap">{m.packagingType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-right font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(m.totalQty)}</td>
                      <td className="px-[13px] py-[9px] align-top whitespace-nowrap">
                        {m.make
                          ? <span className="inline-flex items-center text-[10.5px] text-g600 bg-g100 px-2 py-0.5 rounded-[3px] font-medium">{m.make}</span>
                          : '—'}
                      </td>
                      <td className="px-[13px] py-[9px] align-top text-g500 max-w-[220px] truncate" title={m.remark}>{m.remark || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-g500 whitespace-nowrap">{m.created_by || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <FloatingHorizontalScrollbar containerRef={tableScrollRef} />
          <FloatingVerticalScrollbar containerRef={verticalScrollRef} horizontalContainerRef={tableScrollRef} />
        </div>
      )}

      <StockInwardModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
