// Stock Movements — inward/outward stock entry ledger, replacing the
// "Stock Inward" / "Delivery Order Sale" Google Forms. Self-contained (own
// Supabase queries, no global store plumbing), same pattern as StockSummary.tsx.
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
//
// 2026-09-05: two follow-on fixes.
// 1. mapRow() below was never reading sample_off/coa_file/coa_url off the
//    stock_movements row, so every Inward entry's `sampleOff`/`coaFile`/
//    `coaUrl` came through as undefined here even though the DB row had the
//    real values (NewStockInward.tsx's save() writes them; the columns exist
//    on StockMovement per src/lib/types.ts) — that's why editing an Inward
//    entry looked like Sample Off / COA had never been filled in. Fixed by
//    mapping all three columns like every other field.
// 2. Inward's Edit button now navigates to /stock-movements/new?movementId=<id>
//    (src/pages/NewStockInward.tsx handles both create and edit, same
//    ?id=-style full-page-edit convention as Orders/Quotes) instead of
//    opening src/components/InwardEditModal.tsx as a popup — the user wanted
//    Inward's edit to match how Orders/Quotes edit (a full page). Outward's
//    Edit button was UNCHANGED at the time — it kept opening
//    OutwardEditModal.tsx as a popup; only Inward was asked to become a full
//    page. (Outward caught up 2026-09-09 — see below.)
//
// 2026-09-09: Outward's Edit button now ALSO navigates to a full page
// (/stock-movements/new-outward?movementId=<id>, handled by
// src/pages/NewStockOutward.tsx), same conversion Inward went through above.
// src/components/OutwardEditModal.tsx had gone stale — it was never updated
// as NewStockOutward.tsx's create form gained required+auto-calc No of
// Barrels, MOU/Packing Type selects, a trimmed Warehouse list, and live
// customers-backed Party Name/Transporter, so editing an entry visibly
// showed the old field set. Rather than update the modal a second time, it's
// retired the same way InwardEditModal.tsx was: no longer imported/rendered
// here, left on disk unused. editingMovement/modalOpen state and openEdit()
// are removed along with it — nothing else in this file used them.
//
// 2026-09-12: added a third "Finished Lots" tab alongside Inward/Outward.
// It renders src/components/FinishedLotsTable.tsx, a self-contained
// component (own Supabase query, own state) that visually mirrors
// StockSummary.tsx's table — it does NOT share `movements`/`search`/`load()`
// above, since those are Inward/Outward-specific (stock_movements rows,
// warehouse/DO-number search fields) and don't apply to finished-goods
// lots. It reads public.stock_lots filtered to is_finished = true: rows
// land there via Stock Summary's "Finished Lot" button (shown once a lot's
// Total Quantity hits 0), which sets is_finished/finished_at on that row
// (see StockSummary.tsx's handleFinish()) so it drops out of the active
// Stock Summary ledger and appears here instead. The shared search box / New
// Inward/Outward button / entry count in the toolbar below are hidden
// while this tab is active, same as before — they're Inward/Outward-only
// concepts and don't apply to this tab's own self-contained toolbar.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { fmtDate, fmtIST, normalizeSearchText, doerLabel, canDeleteRecords, friendlyStockError } from '../lib/utils';
import { logActivity } from '../lib/activityLog';
import { StockMovement } from '../lib/types';
import { Button } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import FloatingHorizontalScrollbar from '../components/FloatingHorizontalScrollbar';
import FloatingVerticalScrollbar from '../components/FloatingVerticalScrollbar';
import { FinishedLotsTable } from '../components/FinishedLotsTable';

export function mapRow(r: any): StockMovement {
  return {
    id: r.id,
    type: r.type,
    warehouse: r.warehouse,
    whLotNo: r.wh_lot_no ?? undefined,
    stockCategory: r.stock_category ?? undefined,
    factLotNo: r.fact_lot_no ?? undefined,
    productName: r.product_name,
    billingName: r.billing_name ?? undefined,
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
    fulfilmentType: r.fulfilment_type ?? undefined,
    emailSentAt: r.email_sent_at ?? undefined,
    orderId: r.order_id ?? undefined,
    dispatchRound: r.dispatch_round ?? undefined,
    note: r.note ?? undefined,
    noOfBarrels: r.no_of_barrels ?? undefined,
    mou: r.mou ?? undefined,
    packingType: r.packing_type ?? undefined,
    packingDetail: r.packing_detail ?? undefined,
    sampleOff: !!r.sample_off,
    coaFile: r.coa_file ?? undefined,
    coaUrl: r.coa_url ?? undefined,
    created_by: r.created_by ?? undefined,
    created_at: r.created_at ?? undefined,
    updated_by: r.updated_by ?? undefined,
    updated_at: r.updated_at ?? undefined,
  };
}

// 2026-10-12: Outward tab's own sub-tabs + pills, same idea as Dispatch's
// Dispatched / Email Sent + Delivery / Self Pickup (see Dispatch.tsx).
//   Saved      = email_sent_at is null     Email Sent = email_sent_at is set
// 'not_set' covers older entries saved before Fulfilment Type became
// required (empty or "Both") — its pill only shows while such entries exist,
// so they never drop out of sight.
type MovementTab = 'inward' | 'outward' | 'finished';
type OutwardSub = 'saved' | 'emailSent';
type OutwardType = 'delivery' | 'self_pickup' | 'not_set';
const outwardTypeOf = (m: StockMovement): OutwardType =>
  m.fulfilmentType === 'Delivery' ? 'delivery' : m.fulfilmentType === 'Self Pickup' ? 'self_pickup' : 'not_set';
const OUTWARD_TYPE_LABEL: Record<OutwardType, string> = { delivery: 'Delivery', self_pickup: 'Self Pickup', not_set: 'Not Set' };

const pillCls = (active: boolean) => `px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${active ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`;

const num = (v?: number) => (v === undefined || v === null ? '—' : v.toLocaleString('en-IN'));

// Party/godown → the stock_lots quantity column each side's entries feed —
// kept in sync with INWARD's Balaji/OUTWARD's BALAJI casing difference (see
// InwardEditModal.tsx / OutwardEditModal.tsx for the same maps).
const INWARD_PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom', Reliable: 'qty_reliable', Swastik: 'qty_swastik', Balaji: 'qty_balaji',
};
const OUTWARD_PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom', Reliable: 'qty_reliable', Swastik: 'qty_swastik', BALAJI: 'qty_balaji',
};

// sticky top-0 + z-10 + an explicit (non-transparent) background pins this
// header cell to the top of the table's own scroll container as the body
// scrolls past underneath — see the merged single-scroll-axis container
// (tableScrollRef) below for why this only works reliably once the table
// has ONE scrolling ancestor instead of two nested ones.
const Th = ({ label }: { label: string }) => (
  <th className={`sticky top-0 z-10 bg-g100 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] whitespace-nowrap border-b border-g200 text-g500 text-center`}>
    {label}
  </th>
);

export function StockMovements() {
  const navigate = useNavigate();
  const { user, activeDoer, data, isReadOnlyUser } = useAppStore();
  // 2026-10-13: deleting an Inward / Outward (DO) entry is for mis@ and
  // shishir@ only (canDeleteRecords) — nobody else sees the Delete button.
  const canDelete = canDeleteRecords(user?.email) && !isReadOnlyUser;
  // The entry waiting in the in-app confirm box (Cancel = nothing changes).
  const [deleteTarget, setDeleteTarget] = useState<StockMovement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await handleDelete(deleteTarget);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // 2026-10-12: tab / Outward sub-tab / pill come from the URL
  // (?tab=outward&sub=saved|emailSent&type=delivery|self_pickup) and are
  // written back on every switch, so a refresh stays on the same view and
  // NewStockOutward.tsx can send the user back to the right one. Inward is
  // the default and keeps a bare URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<MovementTab>(() => {
    const t = searchParams.get('tab');
    return t === 'outward' || t === 'finished' ? t : 'inward';
  });
  const [outwardSub, setOutwardSub] = useState<OutwardSub>(() =>
    searchParams.get('sub') === 'emailSent' ? 'emailSent' : 'saved');
  const [outwardType, setOutwardType] = useState<OutwardType>(() => {
    const t = searchParams.get('type');
    return t === 'self_pickup' || t === 'not_set' ? t : 'delivery';
  });
  const syncUrl = (t: MovementTab, sub: OutwardSub, type: OutwardType) => {
    setSearchParams(t === 'outward' ? { tab: t, sub, type } : t === 'finished' ? { tab: t } : {}, { replace: true });
  };
  const switchTab = (t: MovementTab) => { setTab(t); syncUrl(t, outwardSub, outwardType); };
  const switchOutwardSub = (sub: OutwardSub) => { setOutwardSub(sub); syncUrl(tab, sub, outwardType); };
  const switchOutwardType = (type: OutwardType) => { setOutwardType(type); syncUrl(tab, outwardSub, type); };
  const [finishedCount, setFinishedCount] = useState(0);
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

  // Separate lightweight count query (head: true, no rows fetched) for the
  // "Finished Lots" tab label, matching the Inward/Outward count style —
  // stock_lots is a different table from `movements` above so this can't
  // be derived from that state.
  useEffect(() => {
    supabase.from('stock_lots').select('id', { count: 'exact', head: true }).eq('is_finished', true)
      .then(({ count }) => setFinishedCount(count ?? 0));
  }, []);

  const handleDelete = async (m: StockMovement) => {
    // The real lock — the button is hidden for everyone else, this stops any other path.
    if (!canDelete) return;

    // 2026-10-26: an Outward (DO) delete puts its stock back and deletes the
    // row in ONE database transaction — delete_outward_movement, the same
    // function a Dispatch delete uses for its DOs (supabase/migrations/
    // 20261026120000_dispatch_delete_with_dos.sql). If it fails, nothing is
    // deleted. Inward deletes keep the logic below.
    if (m.type === 'outward') {
      const { error } = await supabase.rpc('delete_outward_movement', { p_id: m.id, p_actor: activeDoer?.email ?? user?.email ?? null });
      if (error) { alert(`Delete failed — nothing was changed: ${error.message}`); return; }
      setMovements(prev => prev.filter(x => x.id !== m.id));
      logActivity({
        module: 'stock_movements', recordId: m.id,
        recordLabel: `DO ${m.doNumber || '—'} · ${m.productName} · Lot ${m.whLotNo || '—'}`,
        action: 'delete', before: m,
      });
      return;
    }

    const partyCol = m.type === 'inward' ? INWARD_PARTY_COLUMN[m.warehouse] : OUTWARD_PARTY_COLUMN[m.warehouse];
    const whLotNo = (m.whLotNo || '').trim();
    const qty = m.totalQty ?? 0;
    // The party column tracks barrel/article count (No of Barrels for
    // Inward, Number of Articles for Outward), NOT Total Quantity — see
    // NewStockInward.tsx's 2026-09-05 comment — so its delta is computed
    // from that field, separately from `quantity`'s Total-Quantity-based delta.
    const partyQty = Number((m.type === 'inward' ? m.noOfBarrels : m.numArticles) || 0) || 0;
    if (partyCol && whLotNo && (qty || partyQty)) {
      // Inward added `qty`/`partyQty` to the lot, so deleting subtracts them
      // back off. Outward subtracted them, so deleting adds them back.
      const delta = m.type === 'inward' ? -qty : qty;
      const partyDelta = m.type === 'inward' ? -partyQty : partyQty;
      // 2026-10-26: a stock_lots change the database refuses (e.g. the
      // "never below 0" rule, when this inward's stock was already
      // dispatched) now stops the delete — the entry stays — instead of
      // deleting it anyway and leaving the stock out of step.
      let stockErr: any = null;
      try {
        const { data: lots, error: findErr } = await supabase.from('stock_lots').select('*').ilike('wh_lot_no', whLotNo).limit(1);
        if (findErr) stockErr = findErr;
        const lot = lots?.[0];
        if (lot) {
          const newQuantity = (lot.quantity ?? 0) + delta;
          if (newQuantity <= 0) {
            // The entry being deleted was the only thing keeping this lot's
            // Total Quantity above zero — e.g. it was the sole Inward entry
            // that ever created this lot. Leaving behind a zeroed-out row
            // (every descriptive field still filled in, but every quantity
            // column reading 0) reads as a stale "ghost" lot in Stock Summary,
            // not as "this entry was undone" — so the whole stock_lots row
            // is removed instead of updated to a zero. If OTHER movements
            // still reference this same wh_lot_no, they simply won't find a
            // matching lot next time (same as any Stock Movements entry
            // whose lot was never created / already deleted directly from
            // Stock Summary) rather than corrupting a lot that's still in use.
            ({ error: stockErr } = await supabase.from('stock_lots').delete().eq('id', lot.id));
          } else {
            ({ error: stockErr } = await supabase.from('stock_lots').update({
              [partyCol]: (lot[partyCol] ?? 0) + partyDelta,
              quantity: newQuantity,
              updated_at: new Date().toISOString(),
              // 2026-09-19: activeDoer (the specific person acting right
              // now, matching SendEmailModal.tsx's "who is sending this"
              // identity), falling back to the raw login email — was raw
              // user?.email only.
              updated_by: activeDoer?.email ?? user?.email ?? null,
            }).eq('id', lot.id));
          }
        }
      } catch (e) {
        stockErr = e;
      }
      if (stockErr) {
        alert(`Delete failed — nothing was changed. ${friendlyStockError(stockErr)}`);
        return;
      }
    }

    const { error } = await supabase.from('stock_movements').delete().eq('id', m.id);
    if (error) alert(`The stock was updated, but the entry could not be deleted: ${error.message}`);
    if (!error) {
      setMovements(prev => prev.filter(x => x.id !== m.id));
      logActivity({
        module: 'stock_movements', recordId: m.id,
        recordLabel: `Inward · Lot ${m.whLotNo || '—'} · ${m.productName}`,
        action: 'delete', before: m,
      });
    }
  };

  const inwardCount = movements.filter(m => m.type === 'inward').length;
  const outwardCount = movements.filter(m => m.type === 'outward').length;

  // Outward sub-tab + pill counts (not narrowed by the search box, same as
  // the Inward / Outward tab counts above).
  const outwardMovements = movements.filter(m => m.type === 'outward');
  const savedCount = outwardMovements.filter(m => !m.emailSentAt).length;
  const emailSentCount = outwardMovements.length - savedCount;
  const isEmailSentSub = tab === 'outward' && outwardSub === 'emailSent';
  const activeOutward = outwardMovements.filter(m => !!m.emailSentAt === (outwardSub === 'emailSent'));
  const deliveryCount = activeOutward.filter(m => outwardTypeOf(m) === 'delivery').length;
  const selfPickupCount = activeOutward.filter(m => outwardTypeOf(m) === 'self_pickup').length;
  const notSetCount = activeOutward.length - deliveryCount - selfPickupCount;
  const outwardColCount = isEmailSentSub ? 17 : 16;

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search.trim());
    const rows = movements.filter(m => {
      if (m.type !== tab) return false;
      if (tab === 'outward') {
        if (!!m.emailSentAt !== (outwardSub === 'emailSent')) return false;
        if (outwardTypeOf(m) !== outwardType) return false;
      }
      if (!q) return true;
      const hay = normalizeSearchText([
        m.whLotNo, m.stockCategory, m.productName, m.warehouse, m.make, m.remark,
        m.doNumber, m.partyName, m.otherParty, m.transporter, m.otherTransporter, m.note,
      ].filter(Boolean).join(' '));
      return hay.includes(q);
    });
    // Email Sent: newest email first. Everything else keeps load() order
    // (newest entry first).
    return tab === 'outward' && outwardSub === 'emailSent'
      ? rows.sort((a, b) => (b.emailSentAt || '').localeCompare(a.emailSentAt || ''))
      : rows;
  }, [movements, search, tab, outwardSub, outwardType]);

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
            onClick={() => switchTab('inward')}
            className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${tab === 'inward' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
          >
            Inward ({inwardCount})
          </div>
          <div
            onClick={() => switchTab('outward')}
            className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${tab === 'outward' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
          >
            Outward ({outwardCount})
          </div>
          <div
            onClick={() => switchTab('finished')}
            className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${tab === 'finished' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
          >
            Finished Lots ({finishedCount})
          </div>
        </div>

        {tab !== 'finished' && (
          <>
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
          </>
        )}
      </div>

      {tab === 'outward' && (
        <div className="flex items-center gap-2 px-6 py-2 bg-white border-b border-g200 flex-wrap">
          <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
            <div onClick={() => switchOutwardSub('saved')} className={pillCls(outwardSub === 'saved')}>
              Saved ({savedCount})
            </div>
            <div onClick={() => switchOutwardSub('emailSent')} className={pillCls(outwardSub === 'emailSent')}>
              Email Sent ({emailSentCount})
            </div>
          </div>
          <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
          <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
            <div onClick={() => switchOutwardType('delivery')} className={`flex items-center gap-1.5 ${pillCls(outwardType === 'delivery')}`}>
              <span className="w-[7px] h-[7px] rounded-full bg-sN shrink-0" /> Delivery ({deliveryCount})
            </div>
            <div onClick={() => switchOutwardType('self_pickup')} className={`flex items-center gap-1.5 ${pillCls(outwardType === 'self_pickup')}`}>
              <span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED] shrink-0" /> Self Pickup ({selfPickupCount})
            </div>
            {(notSetCount > 0 || outwardType === 'not_set') && (
              <div onClick={() => switchOutwardType('not_set')} className={`flex items-center gap-1.5 ${pillCls(outwardType === 'not_set')}`}>
                <span className="w-[7px] h-[7px] rounded-full bg-g400 shrink-0" /> Not Set ({notSetCount})
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'finished' ? (
        <FinishedLotsTable />
      ) : tab === 'outward' ? (
        <div className="px-6 pb-7 pt-[14px] flex-1 min-h-0">
          <div ref={tableScrollRef} className="table-scroll-hide-native-bar h-full bg-white border border-g200 overflow-auto m-0">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-g100">
                <tr>
                  <Th label="DO Date" />
                  <Th label="DO Number" />
                  {isEmailSentSub && <Th label="Email Sent On" />}
                  <Th label="Lot No" />
                  <Th label="Product Name" />
                  <Th label="Billing Name" />
                  <Th label="Warehouse" />
                  <Th label="Party Name" />
                  <Th label="Transporter" />
                  <Th label="Fulfilment Type" />
                  <Th label="No of Barrels" />
                  <Th label="Packing" />
                  <Th label="MOU" />
                  <Th label="Packing Type" />
                  <Th label="Total Qty" />
                  <Th label="Note" />
                  <Th label="Actions" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={outwardColCount} className="text-center p-8 text-g400 text-[13px]">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={outwardColCount} className="text-center p-8 text-g400 text-[13px]">{search.trim() ? 'No outward entries match this filter' : `No ${OUTWARD_TYPE_LABEL[outwardType]} outward entries ${isEmailSentSub ? 'emailed yet' : 'saved'}`}</td></tr>
                ) : (
                  filtered.map(m => (
                    <tr key={m.id} className="group transition-colors border-b border-g100 last:border-b-0 hover:bg-red-mrt/5">
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{fmtDate(m.doDate)}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] font-bold text-red-mrt whitespace-nowrap">{m.doNumber || '—'}</td>
                      {isEmailSentSub && (
                        <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{m.emailSentAt ? fmtIST(new Date(m.emailSentAt), 'dd-MMM-yyyy hh:mm a') : '—'}</td>
                      )}
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] text-g600 whitespace-nowrap">{m.whLotNo || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-semibold text-blk min-w-[180px]">{m.productName}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 min-w-[140px]">{m.billingName || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{m.warehouse}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap max-w-[180px] truncate" title={m.partyName === 'Other' ? m.otherParty : m.partyName}>
                        {m.partyName === 'Other' ? (m.otherParty || 'Other') : (m.partyName || '—')}
                      </td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap max-w-[160px] truncate" title={m.transporter === 'Other' ? m.otherTransporter : m.transporter}>
                        {m.transporter === 'Other' ? (m.otherTransporter || 'Other') : (m.transporter || '—')}
                      </td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{m.fulfilmentType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{m.numArticles || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{num(m.packing)}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{m.weightType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{m.packagingType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(m.totalQty)}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g500 max-w-[220px] truncate" title={m.note}>{m.note || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center">
                        <div className="flex flex-col items-center gap-[3px]">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* 2026-09-09: Outward's Edit now opens the full-page
                                NewStockOutward.tsx (same ?movementId=-style
                                full-page-edit convention Inward's own Edit button
                                already uses below), not a modal — see the
                                2026-09-09 file-header note above.
                                2026-09-21: switched from hover-reveal icon buttons
                                to labeled Edit/Delete buttons, always visible, at
                                the user's request — matching the Button style
                                already used in Dispatch and Sampling. */}
                            <Button size="sm" variant="secondary" onClick={() => navigate(`/stock-movements/new-outward?movementId=${m.id}`)}>Edit</Button>
                            {canDelete && <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(m)}>Delete</Button>}
                          </div>
                          {/* 2026-09-21: shows just the name of whoever made the most
                              recent change — updated_by if the entry's been edited since
                              it was created, else created_by — resolved through the team
                              roster to a display name (falls back to the raw email if no
                              roster match), single line, no "Created:"/"Updated:" label,
                              under the row's action buttons. Unlike the icon buttons
                              above, this stays visible without hovering the row. */}
                          {(m.updated_by || m.created_by) && (
                            <span className="text-[10px] font-mono text-g400 whitespace-nowrap">{doerLabel(m.updated_by || m.created_by, data.roster)}</span>
                          )}
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
                  <Th label="Lot No" />
                  <Th label="Factory Lot No" />
                  <Th label="Product Name" />
                  <Th label="Warehouse" />
                  <Th label="No of Barrels" />
                  <Th label="Packing" />
                  <Th label="MOU" />
                  <Th label="Packing Type" />
                  <Th label="Total Qty" />
                  <Th label="Make" />
                  <Th label="Remark" />
                  <Th label="Actions" />
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
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{fmtDate(m.inwardDate)}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] font-bold text-red-mrt whitespace-nowrap">{m.whLotNo || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[10.5px] text-g600 whitespace-nowrap">{m.factLotNo || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-semibold text-blk min-w-[180px]">{m.productName}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{m.warehouse}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{m.noOfBarrels || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] text-g600">{m.packingDetail || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{m.mou || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g600 whitespace-nowrap">{m.packingType || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center font-mono text-[11px] font-bold text-blk whitespace-nowrap">{num(m.totalQty)}</td>
                      <td className="px-[13px] py-[9px] align-top text-center whitespace-nowrap">
                        {m.make
                          ? <span className="inline-flex items-center text-[10.5px] text-g600 bg-g100 px-2 py-0.5 rounded-[3px] font-medium">{m.make}</span>
                          : '—'}
                      </td>
                      <td className="px-[13px] py-[9px] align-top text-center text-g500 max-w-[220px] truncate" title={m.remark}>{m.remark || '—'}</td>
                      <td className="px-[13px] py-[9px] align-top text-center">
                        <div className="flex flex-col items-center gap-[3px]">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Inward's Edit opens the full-page NewStockInward.tsx (same
                                ?id=-style full-page-edit convention as Orders/Quotes),
                                not a modal — see the 2026-09-05 file-header note above.
                                2026-09-21: switched from hover-reveal icon buttons to
                                labeled Edit/Delete buttons, always visible, at the
                                user's request — matching the Button style already used
                                in Dispatch and Sampling. */}
                            <Button size="sm" variant="secondary" onClick={() => navigate(`/stock-movements/new?movementId=${m.id}`)}>Edit</Button>
                            {canDelete && <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(m)}>Delete</Button>}
                          </div>
                          {/* 2026-09-21: shows just the name of whoever made the most
                              recent change — updated_by if the entry's been edited since
                              it was created, else created_by — resolved through the team
                              roster to a display name (falls back to the raw email if no
                              roster match), single line, no "Created:"/"Updated:" label,
                              under the row's action buttons. Unlike the icon buttons
                              above, this stays visible without hovering the row. */}
                          {(m.updated_by || m.created_by) && (
                            <span className="text-[10px] font-mono text-g400 whitespace-nowrap">{doerLabel(m.updated_by || m.created_by, data.roster)}</span>
                          )}
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

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete this ${deleteTarget.type} entry for "${deleteTarget.productName}" (${deleteTarget.whLotNo || 'no lot no.'})?`}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        >
          This also reverses its effect on the matching Stock Summary lot, if one is found.
        </ConfirmDialog>
      )}
    </div>
  );
}
