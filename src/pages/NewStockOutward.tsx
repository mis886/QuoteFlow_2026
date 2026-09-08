// Full-page "New Outward" entry form for the Stock Movements module —
// mirrors the "Delivery Order Sale" Google Form the team currently uses.
// Page chrome, section-card pattern, and single-column full-width layout
// are copied exactly from the finalized src/pages/NewStockInward.tsx (see
// that file's own header comment for the page-shell rationale).
//
// Save logic does two things client-side, no DB trigger:
//   1. Inserts one row into stock_movements (type: 'outward') — the
//      immutable audit trail.
//   2. IF a Lot No was given and it matches an existing stock_lots row
//      AND the Warehouse is one of the 5 known parties (not "Other"),
//      decrements stock_lots.quantity by Total Quantity and that party's
//      qty_* column by Number of Articles (barrel/article count — same
//      "party column tracks count, not quantity" rule as Inward's
//      no_of_barrels; see NewStockInward.tsx's 2026-09-05 comment).
//      Otherwise (no Lot No, no match, or Warehouse "Other") the movement
//      is still logged — the stock_lots side is best-effort and never
//      blocks the save.
// See src/pages/StockMovements.tsx for the list view and
// supabase/migrations/20260903120000_stock_movements_add_outward_columns.sql /
// 20260903120100_stock_movements_lot_no_nullable.sql /
// 20260903120200_stock_movements_add_do_date.sql for the schema.
//
// Party Name and Transporter option lists are placeholders (small seed
// lists, marked TODO below) pending the full 533-entry / 193-entry lists
// from the real Delivery Order Sale form.
//
// 2026-09-07: the "Quantity & Packing" section was replaced with a copy of
// NewStockInward.tsx's "Quantity" section, field-for-field, at the user's
// request (they compared the two forms directly). What changed, underlying
// state keys unchanged (still `numArticles`/`packing`/`totalQty`/
// `weightType`/`packagingType`, still writing the same stock_movements
// columns — this was a UI/behavior change, not a schema change):
//   - "Number of Articles" relabeled "No of Barrels", now REQUIRED (was
//     optional), and got the same barrels×packing→Total Quantity auto-calc
//     Inward's No of Barrels field has (see onNumArticlesChange/
//     onPackingChange below) — previously these three fields were
//     independent and all optional.
//   - "Total Quantity" is now also REQUIRED (was optional).
//   - "Packing" lost its `type="number"` (Inward's own Packing field is
//     plain text) — purely cosmetic, values are handled as strings either
//     way.
//   - "Weight Type" (a KG/LTR radio-button pair) became "MOU (Measure of
//     Unit)", a KG/LTR **select** — same two choices, same underlying
//     `weightType` field/DB column, just a different widget matching
//     Inward's MOU field exactly.
//   - "Type" (a PACKAGING_TYPES select) was simply relabeled "Packing
//     Type" — same select, same options, same `packagingType` field.
// This means an Outward entry that used to skip Number of Articles no
// longer can — see this file's PARTY_COLUMN-decrement comment above, which
// is now accurate unconditionally rather than only "when filled in".
//
// 2026-09-07 (later, same day): "DO & Lot Details" reflowed to one line of
// Warehouse/DO Number/DO Date/Lot No/Lot Date followed by a second line of
// Product Name/Product Code, at the user's request (grid-cols-4 → -5, no
// field order change was needed). This ALSO added a Product Code field to
// Outward for the first time, matching Inward's own read-only auto-derived
// field — which required a real decision, asked via AskUserQuestion (user
// chose "add it, matching Inward"): Product Name here previously drew its
// options from PRODUCT_NAMES (stockMovementOptions.ts, plain strings, no
// codes) while Product Code only exists tied to PRODUCTS
// (stockInwardProducts.ts, {name, code} pairs) — the two lists' name
// strings don't reliably match each other (e.g. "Alpha Pinene 95 +ve" here
// vs. "Alpha Pinene 95 +ve 30-35" in PRODUCTS), so a code lookup against the
// old list would come back blank most of the time. Fixed by switching
// Product Name's own source to PRODUCTS too — same list Inward's dropdown
// offers, same code lookup on selection (see onChange below). This is a
// real, deliberate side effect worth knowing about: the exact option
// strings in Outward's Product Name dropdown changed (some old
// PRODUCT_NAMES entries have no exact match in PRODUCTS and vice versa) —
// flag if the user reports a product they used to be able to pick is now
// missing from the list. PRODUCT_NAMES/stockMovementOptions.ts itself is
// untouched and no longer imported here (still used elsewhere? — grep
// before removing it outright if that's ever asked).
// Product Code itself is UI-only here, same as it effectively is for
// Inward's own "existing lot" path: it's derived locally for the user's
// reference and is never written to stock_lots, because Outward's
// stock_lots decrement below only ever UPDATEs an existing lot's party
// column + quantity (never descriptive fields, never an INSERT) — the same
// "insert-only" convention documented for Inward (see PARTY_COLUMN comment
// above). There is no stock_movements.product_code column either (Inward
// doesn't write one there), so nothing about the save() logic changed.
//
// 2026-09-07 (still later): Party Name and Transporter switched from the
// two small hardcoded placeholder lists (PARTY_NAMES/TRANSPORTERS below —
// TODO'd since this module was first built, meant to eventually hold the
// real 533/193-entry lists) to a live query against the `customers` table,
// at the user's request. Only customers with a preferred_transporter on
// file appear in Party Name now (fulfilment_type — Self Pickup / Delivery
// / Both — is deliberately NOT filtered on, per the user's explicit ask to
// include both). Selecting a Party Name auto-fills Transporter with that
// customer's preferred_transporter (still a normal editable combobox
// afterward — this is a convenience prefill, not a lock, since the "Other"
// escape hatch and manual correction both still need to work). Transporter's
// own dropdown options are now the distinct preferred_transporter values
// found across those same customers, instead of the old short hardcoded
// list. See loadPartyTransporters() below. PARTY_NAMES/TRANSPORTERS consts
// are left in place, unused, per this module's "don't delete superseded
// code" convention — nothing in this file references them anymore.

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui';
import { SearchableCombobox } from '../components/SearchableCombobox';
import { PACKAGING_TYPES } from '../lib/stockMovementOptions';
// 2026-09-07: Product Name now draws from the same PRODUCTS list Inward
// uses (instead of stockMovementOptions.ts's plain-string PRODUCT_NAMES),
// so a Product Code can be looked up on selection — see the file-header
// comment above for why the two lists couldn't stay separate once Product
// Code was added.
import { PRODUCTS } from '../lib/stockInwardProducts';

// Combobox options — derived from PRODUCTS, the single source of truth also
// used for the Product Code auto-fill lookup below (same pattern as
// NewStockInward.tsx's own PRODUCT_NAME_OPTIONS).
const PRODUCT_NAME_OPTIONS = PRODUCTS.map(p => p.name);

// Single source of truth for "given a Product Name, what's its Product
// Code" — used by both the Product Name combobox's own onChange AND the
// Lot No auto-fill lookup below, so there's only ever one code-lookup path
// (2026-09-08: the Lot No auto-fill feature reuses this instead of matching
// against PRODUCTS a second time).
const codeForProductName = (name: string): string => PRODUCTS.find(p => p.name === name)?.code ?? '';

// MOU's own fixed option pair — pulled out to a const (was inline <option>s)
// so the component below can widen it with an out-of-list auto-filled value
// the same way it already does for PACKAGING_TYPES.
const MOU_OPTIONS = ['KG', 'LTR'];

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow";
const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";
const sectionHeaderCls = "font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200";
const cardCls = "bg-white border border-g200 p-[18px_20px]";

// Outward's own Warehouse list. Originally also offered WADA and a
// free-text "Other" (distinct from Inward's 4-option list); both were
// removed from the dropdown 2026-09-07 at the user's request. The
// isOtherWarehouse/otherWarehouse form logic below is left in place but is
// now unreachable (form.warehouse can never be 'Other' again) rather than
// torn out, in case "Other" is ever wanted back — same "leave it, don't
// delete" convention used elsewhere in this module (StockLotModal.tsx,
// InwardEditModal.tsx). PARTY_COLUMN's WADA entry is similarly harmless
// dead data now, left as-is for the same reason.
const WAREHOUSES = ['Hariom', 'Reliable', 'Swastik', 'BALAJI'];

// Party/godown → the stock_lots quantity column it feeds. Only the 5 known
// parties have an entry — "Other" (and any custom typed name) intentionally
// has none, so the decrement step below skips it.
const PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom',
  Reliable: 'qty_reliable',
  Swastik: 'qty_swastik',
  BALAJI: 'qty_balaji',
  WADA: 'qty_wada',
};

// Superseded 2026-09-07 — Party Name/Transporter now come live from the
// `customers` table (see loadPartyTransporters() in the component below).
// Left here unused rather than deleted, per this module's convention.
const PARTY_NAMES = [
  'A P INK', 'AARAV FRAGRANCES & FLAVOURS PVT. LTD.', 'ASIAN PAINTS LTD', 'BERGER PAINTS INDIA LTD',
  'GRASIM INDUSTRIES LIMITED', 'ITC LIMITED', 'ROBERTET INDIA PRIVATE LIMITED', 'SHALIMAR PAINTS LTD', 'Other',
];
const TRANSPORTERS = [
  'A H TRANSPORT', 'AASHIRWAD GOODS CARRIES', 'ABHINAV TRANSPORT (INDIA) PVT. LTD.', 'VRL LOGISTICS',
  'YASHWANT TRANSPORT', 'Other',
];

const emptyForm = {
  warehouse: '', otherWarehouse: '',
  doNumber: '', doDate: '', lotNo: '', lotDate: '', productName: '', productCode: '',
  numArticles: '', packing: '', totalQty: '', weightType: '', packagingType: '',
  partyName: '', otherParty: '', transporter: '', otherTransporter: '', note: '',
};

export function NewStockOutward() {
  const navigate = useNavigate();
  const { user } = useAppStore();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 2026-09-07: Party Name options + the customer->transporter lookup used
  // to auto-fill Transporter, both sourced live from `customers` — see the
  // file-header comment. Only customers with a preferred_transporter on
  // file are included (fulfilment_type is not filtered on). 'Other' is
  // appended so a party not yet in the customers table can still be typed
  // in via the existing isOtherParty/otherParty free-text field.
  const [partyNameOptions, setPartyNameOptions] = useState<string[]>([]);
  const [transporterOptions, setTransporterOptions] = useState<string[]>([]);
  const [transporterByParty, setTransporterByParty] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const loadPartyTransporters = async () => {
      const { data, error: fetchErr } = await supabase
        .from('customers')
        .select('company_name, preferred_transporter')
        .not('preferred_transporter', 'is', null)
        .neq('preferred_transporter', '')
        .order('company_name', { ascending: true });
      if (fetchErr || !data || cancelled) return;
      const names: string[] = [];
      const map: Record<string, string> = {};
      const transporterSet = new Set<string>();
      for (const row of data as { company_name: string | null; preferred_transporter: string | null }[]) {
        const name = (row.company_name || '').trim();
        const transporter = (row.preferred_transporter || '').trim();
        if (!name || !transporter) continue;
        if (!(name in map)) { map[name] = transporter; names.push(name); }
        transporterSet.add(transporter);
      }
      setPartyNameOptions([...names, 'Other']);
      setTransporterByParty(map);
      setTransporterOptions([...Array.from(transporterSet).sort(), 'Other']);
    };
    loadPartyTransporters();
    return () => { cancelled = true; };
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  // Returns a finite number, or null if v is empty/not a valid number — same
  // helper NewStockInward.tsx uses to gate its Total Quantity auto-calc
  // below (never NaN, never treats "" as 0).
  const parseNum = (v: string): number | null => {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  // Auto-fills Total Quantity = No of Barrels × Packing whenever both are
  // valid numbers — mirrors NewStockInward.tsx's onNoOfBarrelsChange/
  // onPackingChange exactly, added 2026-09-07 when this section was made to
  // match Inward's Quantity section field-for-field (see file header). Total
  // Quantity stays a normal editable field otherwise; if either source is
  // empty/invalid, it's left exactly as it is (no clearing, no NaN).
  const onNumArticlesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => {
      const barrels = parseNum(v);
      const packing = parseNum(f.packing);
      const totalQty = barrels !== null && packing !== null ? String(barrels * packing) : f.totalQty;
      return { ...f, numArticles: v, totalQty };
    });
  };

  const onPackingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => {
      const barrels = parseNum(f.numArticles);
      const packing = parseNum(v);
      const totalQty = barrels !== null && packing !== null ? String(barrels * packing) : f.totalQty;
      return { ...f, packing: v, totalQty };
    });
  };

  const isOtherWarehouse = form.warehouse === 'Other';
  const isOtherParty = form.partyName === 'Other';
  const isOtherTransporter = form.transporter === 'Other';

  // "No stock found for this lot at <Warehouse>" — set by the auto-fill
  // lookup below when Lot No matches a real stock_lots row but that party
  // column is 0/null, so the user knows their Warehouse/Lot No combination
  // looks off instead of silently getting no auto-fill and no explanation.
  const [lotWarning, setLotWarning] = useState('');

  // Auto-fills the rest of the form from the matching stock_lots row once
  // both Warehouse and Lot No are filled in, added 2026-09-08 at the user's
  // request. Debounced 400ms after the last Lot No keystroke (and re-run on
  // Warehouse change) so it doesn't query on every keystroke — same ilike
  // match on wh_lot_no that save() itself uses below, so "will this
  // auto-fill" and "will this decrement a real lot at save time" always
  // agree. A lot that isn't found is treated as a brand-new lot (no error,
  // no warning) — only an existing lot with zero stock at the selected
  // Warehouse gets the inline warning; every other field is only ever
  // filled in when currently empty, never overwriting something the user
  // already typed.
  useEffect(() => {
    setLotWarning('');
    const warehouse = form.warehouse;
    const lotNo = form.lotNo.trim();
    const partyCol = PARTY_COLUMN[warehouse];
    if (!lotNo || !partyCol) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('stock_lots')
        .select('*')
        .ilike('wh_lot_no', lotNo)
        .limit(1);
      if (cancelled) return;

      const existing = data?.[0];
      if (!existing) return; // no match — likely a brand-new lot, nothing to fill in

      const qtyAtWarehouse = existing[partyCol];
      if (!qtyAtWarehouse || qtyAtWarehouse <= 0) {
        setLotWarning(`No stock found for this lot at ${warehouse}.`);
        return;
      }

      setForm(f => {
        // Warehouse/Lot No may have moved on while this lookup was in
        // flight — cancelled (above) only covers a fully superseded effect
        // run; this covers the same run's result arriving after the user
        // already changed one of the two fields again.
        if (f.warehouse !== warehouse || f.lotNo.trim() !== lotNo) return f;

        const next = { ...f };
        if (!f.productName.trim()) next.productName = existing.product_name || '';
        // 2026-09-08: prefer the lot's own product_code (written directly by
        // NewStockInward.tsx's dropdown at lot creation) over re-deriving it
        // from product_name — legacy/sheet-imported lots' free-text names
        // (e.g. "Alpha Pinene 95 % -ve") don't exactly match PRODUCTS'
        // stricter entries (e.g. "Alpha Pinene 95% -ve 24"), so a name-based
        // lookup silently came back blank for exactly the lots most likely
        // to need it. codeForProductName is still tried as a best-effort
        // fallback for the rarer case of an old lot with no product_code at
        // all — exact match only, no fuzzy matching (a wrong code on a real
        // Delivery Order is worse than a blank one the user fills in).
        if (!f.productCode.trim()) {
          next.productCode = existing.product_code || codeForProductName(next.productName);
        }
        if (!f.numArticles.trim() && existing.no_of_barrels != null) {
          next.numArticles = String(existing.no_of_barrels);
        }
        // Same packing/packingDetail fallback Stockbook.tsx's own Packing
        // column uses: the legacy numeric `packing` column wins when set,
        // otherwise fall back to the text `packing_detail` column Inward
        // actually writes.
        if (!f.packing.trim()) {
          const fallbackPacking = existing.packing != null ? String(existing.packing) : (existing.packing_detail || '');
          if (fallbackPacking) next.packing = fallbackPacking;
        }
        if (!f.packagingType.trim()) next.packagingType = existing.packing_type || '';
        if (!f.weightType.trim()) next.weightType = existing.mou || '';

        // Same barrels×packing auto-calc onNumArticlesChange/onPackingChange
        // use, run once here so Total Quantity ends up populated too —
        // never from stock_lots.quantity directly, which is the lot's
        // total remaining stock across every party, not this transaction.
        if (!f.totalQty.trim()) {
          const barrels = parseNum(next.numArticles);
          const packing = parseNum(next.packing);
          if (barrels !== null && packing !== null) next.totalQty = String(barrels * packing);
        }

        return next;
      });
    }, 400);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.warehouse, form.lotNo]);

  // 2026-09-07: Number of Articles ("No of Barrels" now) and Total Quantity
  // became required here too, matching Inward's Quantity section exactly —
  // previously both were optional (see the file-header comment's now-stale
  // note about that). PARTY_COLUMN's decrement below already treated
  // numArticles as the barrel-count-equivalent field; this just makes that
  // relationship required rather than optional, same as Inward's.
  const isValid = !!(
    form.warehouse && (!isOtherWarehouse || form.otherWarehouse.trim()) &&
    form.doNumber.trim() && form.productName.trim() &&
    form.numArticles.trim() && form.totalQty.trim()
  );

  // 2026-09-08: keep an out-of-list Packing Type/MOU value visible in its
  // <select> — needed now that the Lot No auto-fill above can set either
  // field to a legacy stock_lots value (e.g. "New Plastic", "Kg") that isn't
  // one of this form's own fixed options. A native <select> shows nothing
  // selected when its value doesn't match any <option>, which is exactly
  // why auto-filled Packing Type/MOU were rendering as blank "Select..."
  // despite the value being set in form state.
  const packagingTypeOptions =
    form.packagingType && !PACKAGING_TYPES.includes(form.packagingType)
      ? [...PACKAGING_TYPES, form.packagingType]
      : PACKAGING_TYPES;
  const weightTypeOptions =
    form.weightType && form.weightType !== 'KG' && form.weightType !== 'LTR'
      ? [...MOU_OPTIONS, form.weightType]
      : MOU_OPTIONS;

  const save = async () => {
    if (!isValid) { setError('Please fill in all required fields.'); return; }
    setSaving(true);
    setError('');

    const warehouseToSave = isOtherWarehouse ? form.otherWarehouse.trim() : form.warehouse;
    const lotNo = form.lotNo.trim();
    const totalQty = num(form.totalQty);
    // The party column tracks Number of Articles (barrel/article count),
    // not Total Quantity — see the file-header comment above.
    const numArticles = num(form.numArticles);

    const movementPayload = {
      type: 'outward',
      warehouse: warehouseToSave,
      wh_lot_no: lotNo || null,
      product_name: form.productName.trim(),
      do_number: form.doNumber.trim(),
      do_date: form.doDate || null,
      inward_date: form.lotDate || null,
      num_articles: form.numArticles.trim() || null,
      packing: num(form.packing),
      weight_type: form.weightType || null,
      packaging_type: form.packagingType || null,
      total_qty: totalQty,
      party_name: form.partyName || null,
      other_party: isOtherParty ? (form.otherParty.trim() || null) : null,
      transporter: form.transporter || null,
      other_transporter: isOtherTransporter ? (form.otherTransporter.trim() || null) : null,
      note: form.note.trim() || null,
      created_by: user?.email ?? null,
    };

    const { error: moveErr } = await supabase.from('stock_movements').insert(movementPayload);
    if (moveErr) { setError(moveErr.message); setSaving(false); return; }

    // Best-effort stock_lots decrement — only when there's a lot to match
    // against and the warehouse is one of the known parties. Never blocks
    // the save: a missing lot, an "Other" warehouse, or an update error
    // here just means the movement stands without touching stock_lots.
    const partyCol = PARTY_COLUMN[form.warehouse];
    if (lotNo && partyCol) {
      try {
        const { data: existingLots } = await supabase
          .from('stock_lots')
          .select('*')
          .ilike('wh_lot_no', lotNo)
          .limit(1);
        const existing = existingLots?.[0];
        if (existing) {
          await supabase.from('stock_lots')
            .update({
              [partyCol]: (existing[partyCol] ?? 0) - (numArticles ?? 0),
              quantity: (existing.quantity ?? 0) - (totalQty ?? 0),
              updated_at: new Date().toISOString(),
              updated_by: user?.email ?? null,
            })
            .eq('id', existing.id);
        }
      } catch (e) {
        console.error('Outward stock_lots decrement failed (movement was still logged):', e);
      }
    }

    navigate('/stock-movements');
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Stock Movements Module</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">Log <em className="italic text-red-mrt">New Outward</em></h1>
            <p className="text-xs text-g500 mt-1 font-light">Record a Delivery Order stock outward — replaces the Delivery Order Sale Google Form.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/stock-movements')}>Back</Button>
        </div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[14px]">
          <div className={cardCls}>
            <div className={sectionHeaderCls}>DO &amp; Lot Details</div>
            {/* 2026-09-07: grid-cols-4 -> -5 so Warehouse/DO Number/DO Date/
                Lot No/Lot Date sit on one line and Product Name/Product Code
                wrap to the next, at the user's request. */}
            <div className="grid grid-cols-5 gap-[12px]">
              <div>
                <label className={labelCls}>Warehouse <span className="text-red-mrt">*</span></label>
                <select className={selectCls} value={form.warehouse} onChange={set('warehouse')}>
                  <option value="">Select...</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              {isOtherWarehouse && (
                <div>
                  <label className={labelCls}>Other Warehouse <span className="text-red-mrt">*</span></label>
                  <input className={inputCls} value={form.otherWarehouse} onChange={set('otherWarehouse')} />
                </div>
              )}
              <div>
                <label className={labelCls}>DO Number <span className="text-red-mrt">*</span></label>
                <input className={inputCls} value={form.doNumber} onChange={set('doNumber')} />
              </div>
              <div>
                <label className={labelCls}>DO Date</label>
                <input type="date" className={inputCls} value={form.doDate} onChange={set('doDate')} />
              </div>
              <div>
                <label className={labelCls}>Lot No</label>
                <input className={inputCls} value={form.lotNo} onChange={set('lotNo')} />
                {lotWarning && <p className="text-amber-600 text-[11px] mt-1">{lotWarning}</p>}
              </div>
              <div>
                <label className={labelCls}>Lot Date</label>
                <input type="date" className={inputCls} value={form.lotDate} onChange={set('lotDate')} />
              </div>
              <div>
                <label className={labelCls}>Product Name <span className="text-red-mrt">*</span></label>
                <SearchableCombobox
                  className={inputCls}
                  options={PRODUCT_NAME_OPTIONS}
                  value={form.productName}
                  onChange={v => setForm(f => ({ ...f, productName: v, productCode: codeForProductName(v) }))}
                />
              </div>
              <div>
                <label className={labelCls}>Product Code</label>
                <input className={`${inputCls} bg-g100 text-g600 cursor-not-allowed`} value={form.productCode} readOnly />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Quantity</div>
            <div className="grid grid-cols-5 gap-[12px]">
              <div>
                <label className={labelCls}>No of Barrels <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.numArticles} onChange={onNumArticlesChange} />
              </div>
              <div>
                <label className={labelCls}>Packing</label>
                <input className={inputCls} value={form.packing} onChange={onPackingChange} />
              </div>
              <div>
                <label className={labelCls}>Total Quantity <span className="text-red-mrt">*</span></label>
                <input type="number" className={inputCls} value={form.totalQty} onChange={set('totalQty')} />
              </div>
              <div>
                <label className={labelCls}>Packing Type</label>
                <select className={selectCls} value={form.packagingType} onChange={set('packagingType')}>
                  <option value="">Select...</option>
                  {packagingTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>MOU (Measure of Unit)</label>
                <select className={selectCls} value={form.weightType} onChange={set('weightType')}>
                  <option value="">Select...</option>
                  {weightTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Party, Transporter &amp; Note</div>
            <div className="grid grid-cols-4 gap-[12px]">
              <div>
                <label className={labelCls}>Party Name</label>
                <SearchableCombobox
                  className={inputCls}
                  options={partyNameOptions}
                  value={form.partyName}
                  onChange={v => setForm(f => ({ ...f, partyName: v, transporter: transporterByParty[v] || f.transporter }))}
                />
              </div>
              {isOtherParty && (
                <div>
                  <label className={labelCls}>Other Party</label>
                  <input className={inputCls} value={form.otherParty} onChange={set('otherParty')} />
                </div>
              )}
              <div>
                <label className={labelCls}>Transporter</label>
                <SearchableCombobox className={inputCls} options={transporterOptions} value={form.transporter} onChange={v => setForm(f => ({ ...f, transporter: v }))} />
              </div>
              {isOtherTransporter && (
                <div>
                  <label className={labelCls}>Other Transporter</label>
                  <input className={inputCls} value={form.otherTransporter} onChange={set('otherTransporter')} />
                </div>
              )}
            </div>
            <div className="mt-3">
              <label className={labelCls}>Note</label>
              <textarea className={`${inputCls} min-h-[68px]`} value={form.note} onChange={set('note')} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-[14px_20px] bg-g100 border-t border-g200 sticky bottom-0">
        <Button variant="primary" onClick={save} disabled={!isValid || saving}>
          {saving ? 'Saving…' : 'Save Outward Entry'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/stock-movements')} disabled={saving}>Cancel</Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {error && <div className="ml-4 text-red-mrt text-[11px] font-bold">{error}</div>}
      </div>
    </div>
  );
}
