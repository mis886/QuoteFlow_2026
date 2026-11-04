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
//
// 2026-09-09: this page now also handles EDITING an existing Outward entry,
// via ?movementId=<id> in the URL — same conversion Inward went through on
// 2026-09-05 (see NewStockInward.tsx's own comment), for the same reason:
// src/components/OutwardEditModal.tsx (the old popup) was never updated
// when this create form's fields changed (No of Barrels required+auto-calc,
// MOU/Packing Type selects, trimmed Warehouse list, live customers-backed
// Party Name/Transporter), so editing an entry showed a visibly stale form.
// Rather than update the modal a second time, it's retired the same way
// InwardEditModal.tsx was — left on disk unused (src/pages/StockMovements.tsx
// no longer imports or renders it) rather than deleted, in case anything
// still references it. When movementId is present, this page fetches that
// one stock_movements row directly (self-contained, no store cache), pre-
// fills every field, and save() ports OutwardEditModal.tsx's own
// reconciliation logic: reverse the OLD entry's stock_lots decrement (add
// its quantity/barrels back to whichever lot the OLD warehouse+lot no
// matched), then re-apply the NEW (edited) decrement against whichever lot
// the NEW warehouse+lot no matches — both steps via adjustLotStock() (since
// 2026-10-26 the adjust_lot_stock database function: locked, never below 0,
// a refusal stops the save; was a best-effort adjustLot()), ported from
// the modal rather than upgraded to Inward's lotId-pinning fix, since
// Outward's decrement has no insert branch for that fix to matter to (a
// lot that isn't found is just skipped, on both the reversal and re-apply
// side — no way to spin off a duplicate row the way Inward's insert-or-
// update branch could). The plain "create a new entry" path (no
// movementId) is untouched by any of this.
// The Lot No auto-fill effect below is skipped entirely while editing
// (isEditing) — it exists to help populate a blank create-mode form from a
// lot the user is drawing down, which doesn't apply once every field is
// already populated from the movement being edited; running it anyway
// could also show a spurious "No stock found" warning purely because THIS
// SAME movement's own not-yet-reversed decrement is what's currently
// keeping that party column low.
//
// 2026-09-09 (later, same day): DO Number is no longer hand-typed — it's
// auto-generated, warehouse-prefixed (first 4 letters, uppercase — HARI/
// RELI/SWAS/BALA), sequential per warehouse, e.g. HARI-0001, HARI-0002, ...,
// never resetting. See DO_NUMBER_PREFIX/generateNextDoNumber below and the
// Warehouse-select effect that calls it the moment a Warehouse is picked
// (and regenerates on a Warehouse change, in create mode only — editing
// never regenerates, see that effect's own comment). Existing legacy plain-
// numeric DO Numbers (e.g. "90") are untouched and don't collide with or
// affect the new sequence — they simply never match a "<PREFIX>-####"
// pattern, so generateNextDoNumber ignores them entirely. A DB-level unique
// constraint (stock_movements_do_number_unique migration) guarantees no two
// entries ever share a DO Number even under concurrent saves for the same
// warehouse; save()'s create-mode path uses insertOutwardWithRetry to catch
// that constraint's 23505 violation and retry with a freshly-generated
// number rather than surfacing a raw DB error.
//
// 2026-09-12: added PDF/DOCX/Email to Client buttons, matching how
// NewQuote.tsx/NewOrder.tsx already do this. Outward entries carry no
// price/GST/bank data, so the generated document is a plain "Delivery
// Order" (see generateOutwardPDF/downloadOutwardDOCX in
// src/lib/pdfGenerator.ts / src/lib/outwardDocx.ts), not a Proforma
// Invoice — no pricing table anywhere. buildOutwardData() assembles a
// StockMovement straight from current form state (mirroring
// movementPayload's own field mapping below) so all three work even
// before Save is clicked. Customer is resolved for the Email modal by
// matching Party Name against data.customers — a non-match (e.g. "Other")
// just leaves the To field blank, an expected fallback.
//
// 2026-11-03 (user decision): ONE DO, MANY PRODUCTS. One DO = ONE warehouse +
// ONE DO number + ONE OR MORE product lines, saved, printed (PDF / DOCX) and
// emailed as ONE document. Products in another warehouse need another DO (the
// DO number's prefix comes from the warehouse). The form is now:
//   1. Header, filled once — Warehouse → DO Number (generated as before,
//      never regenerated in edit mode), DO Date.
//   2. Product lines table — per row: Lot No, Lot Date, Product Name / Code
//      (from the lot), Billing Name, No of Barrels, Packing, Total Quantity,
//      Packing Type, MOU. Each row keeps the old single-lot behaviour: the lot
//      is looked up in the HEADER warehouse (findOutwardLot + that
//      warehouse's column), "Available at …", "From lot …", the barrels
//      auto-fill, the 25231ee rule (the lot's product picks the order line;
//      not in the order → red note, Save blocked) and the b14a218 rule (empty
//      or unknown Lot No clears that row's lot fields). "+ Add product" adds a
//      row, ✕ removes one (at least one stays). Totals under the table. The
//      old "Product (from order)" picker is gone — a row's order line comes
//      from its lot; two rows may not share a lot. (Later 2026-11-03, user
//      decision: they MAY share an order line — one product from 2+ lots;
//      that line's rows together must stay ≤ its remaining. "+ Add product"
//      can pick the line.)
//   3. Party, Transporter, Fulfilment Type, Note — once, as before.
// Changing the Warehouse clears every row's lot fields (they refill from the
// new warehouse's stock) and, for a new DO, regenerates the DO number.
// From the Dispatch board the form opens with one row per order line that
// still has barrels left (or the lines in ?lines=, for "+ New DO (another
// warehouse)"), Billing Name prefilled, lot fields empty.
// Save goes through the save_outward_do database function (supabase/
// migrations/20261103120000_outward_do_multi_line.sql): ONE transaction that
// writes one stock_movements row per line and changes every line's stock
// (edit: puts back every old line first). Any refusal saves nothing. This
// replaces the browser-side adjustLotStock() + insertOutwardWithRetry() /
// row update of 2026-10-26; the DO-number retry on 23505 is kept
// (saveOutwardDoWithRetry). See docs/dispatch_do_order_line.md.
//
// 2026-11-03 (later): "Wada" warehouse, NOT linked to stock (its lots are in
// another system). DO numbers W-0001…; every row field is typed (no lot
// lookup, no stock checks); from the Board the typed Billing Name picks the
// order line and the order rules still apply (wadaRowInfo / onBillingChange).
// Saving / deleting never touches stock_lots (20261103170000 migration). A
// saved DO can't be switched between Wada and a stock warehouse.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { Button } from '../components/ui';
import { SearchableCombobox } from '../components/SearchableCombobox';
// 2026-09-07: Product Name now draws from the same PRODUCTS list Inward
// uses (instead of stockMovementOptions.ts's plain-string PRODUCT_NAMES),
// so a Product Code can be looked up on selection — see the file-header
// comment above for why the two lists couldn't stay separate once Product
// Code was added.
import { PRODUCTS } from '../lib/stockInwardProducts';
import { lotBillingName, orderLineSeqForLot, orderLinesForLot, barrelsByOrderLine, orderOverMessage, orderLineLabel } from '../lib/doOrderLine';
import { isImportedEntry, orderLinesWithoutDo } from '../lib/dispatchFlow';
import { Loader2, Plus, X } from 'lucide-react';
import { Order, DispatchEntry, OutwardDO, OutwardDoLine } from '../lib/types';
import { fmtIST, canActOnDispatchBoard, dispatchOrderView, remainingByLine, outwardTransporterName, friendlyStockError, isNoStockWarehouse } from '../lib/utils';
import { logActivity } from '../lib/activityLog';
import { generateOutwardPDF } from '../lib/pdfGenerator';
import { downloadOutwardDOCX } from '../lib/outwardDocx';
import { SendEmailModal } from '../components/SendEmailModal';

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
const billingNameForProductName = (name: string): string => PRODUCTS.find(p => p.name === name)?.billingName ?? '';

// MOU's own fixed option pair — pulled out to a const (was inline <option>s)
// so the component below can widen it with an out-of-list auto-filled value
// the same way it already does for Packing Type.
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
// InwardEditModal.tsx). PARTY_COLUMN's WADA entry was removed outright
// (2026-09-11) rather than kept as dead data, since qty_wada no longer
// exists as a stock_lots column at all — see
// supabase/migrations/20260911150000_stock_summary_drop_wada_columns.sql.
// 2026-11-03: "Wada" is back, as a NO-STOCK warehouse (Outward / DO only):
// its lots live in another system, so a Wada DO never touches stock_lots —
// see isNoStockWarehouse below and docs/dispatch_do_order_line.md.
const WAREHOUSES = ['Hariom', 'Reliable', 'Swastik', 'BALAJI', 'Wada'];
// Wada rows are fully manual — Lot No is free text (no lot lookup, no stock
// checks, nothing cleared when it changes) and every field is typed.

// Party/godown → the stock_lots quantity column it feeds. Only the 4 known
// parties have an entry — "Other" (and any custom typed name) intentionally
// has none, so the decrement step below skips it.
const PARTY_COLUMN: Record<string, string> = {
  Hariom: 'qty_hariom',
  Reliable: 'qty_reliable',
  Swastik: 'qty_swastik',
  BALAJI: 'qty_balaji',
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

// THE lot an Outward entry draws from: wh_lot_no matched case-insensitively
// (ilike), first row in a FIXED order — stock_lots has duplicate wh_lot_no
// rows, so without one, save and delete could pick different rows.
// 2026-10-26: keep in sync with delete_outward_movement (supabase/migrations/
// 20261026120000_dispatch_delete_with_dos.sql), which puts the stock back.
const findOutwardLot = (lotNo: string) => supabase.from('stock_lots').select('*').ilike('wh_lot_no', lotNo)
  .order('serial_no', { ascending: true, nullsFirst: false })
  .order('created_at', { ascending: true })
  .order('id', { ascending: true })
  .limit(1);

// 2026-09-09: DO Number auto-generation, replacing free-hand entry.
// 2026-09-19: prefix shortened from each warehouse's first 4 letters to just
// its first letter (e.g. Reliable -> "R-0001") — a literal map (not derived
// via .slice(0,1).toUpperCase()) so the exact prefixes stay obvious and
// stable even if a warehouse's display name ever changes. The 4 warehouses
// below happen to all start with a different letter, so single-letter
// prefixes can't collide with each other today — if a future warehouse is
// added whose name starts with H/R/S/B, give it a different prefix letter
// here rather than relying on .slice(0,1). No entry for 'Other' — DO Number
// generation only applies to the 4 known warehouses this form's own dropdown
// offers (isOtherWarehouse is otherwise unreachable, see the WAREHOUSES
// comment above). Existing entries saved under the old 4-letter prefixes
// (e.g. "BALA-0002") are untouched — they simply don't match the new
// single-letter pattern, so the per-warehouse sequence below starts fresh at
// -0001 under the new prefix rather than continuing the old one.
const DO_NUMBER_PREFIX: Record<string, string> = {
  Hariom: 'H',
  Reliable: 'R',
  Swastik: 'S',
  BALAJI: 'B',
  // 2026-11-03: W-0001, W-0002 … (no hand-typed history, so no start number).
  Wada: 'W',
};

// 2026-11-02 (user decision): each warehouse's sequence continues from the
// number the team had reached when DO numbers were typed by hand. The next
// DO is never lower than these (e.g. first auto number for BALAJI = B-0810);
// once saved DOs go past it, the normal "highest + 1" rule takes over.
const DO_NUMBER_START: Record<string, number> = {
  BALAJI: 810,
  Swastik: 12,
  Reliable: 70,
  Hariom: 179,
};

// Next DO Number for `warehouse`: "<PREFIX>-0001", zero-padded to 4 digits,
// sequential per warehouse, never resets. Fetches every do_number starting
// with "<PREFIX>-" (cheap ilike prefix filter, scoped to Outward rows —
// Inward has no DO Number concept and always writes null), then validates
// each against the exact ^PREFIX-\d{4}$ shape in JS before taking the
// highest numeric suffix — guards against a near-miss value (extra digits,
// non-numeric suffix) being misread as part of the sequence. Existing
// legacy plain-numeric DO Numbers (e.g. "90") never match this prefix
// pattern at all, so they're ignored automatically — no separate filtering
// needed for them, exactly as intended.
async function generateNextDoNumber(warehouse: string): Promise<string> {
  const prefix = DO_NUMBER_PREFIX[warehouse];
  if (!prefix) return '';
  const { data } = await fetchAllRows(() => supabase
    .from('stock_movements')
    .select('do_number')
    .eq('type', 'outward')
    .ilike('do_number', `${prefix}-%`)
    .order('id'));
  const pattern = new RegExp(`^${prefix}-(\\d{4})$`);
  let max = 0;
  for (const row of (data ?? []) as { do_number: string | null }[]) {
    const match = pattern.exec(row.do_number || '');
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  const next = Math.max(max + 1, DO_NUMBER_START[warehouse] ?? 1);
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

// 2026-11-03: saves the WHOLE DO (every line + its stock) in one database
// transaction — save_outward_do. A new DO whose number someone else just
// took fails with 23505 (unique do_number + do_line_no, see the migration):
// retried with a freshly generated number, as insertOutwardWithRetry did.
// onRetryDoNumber keeps the visible DO Number in step with the number tried.
// An edit never changes the DO number, so it is never retried.
type SaveDoResult = { do_number: string; ids: string[]; before: any[]; after: any[] };
async function saveOutwardDoWithRetry(
  movementId: string | null,
  header: Record<string, any>,
  lines: Record<string, any>[],
  actor: string | null,
  onRetryDoNumber: (doNumber: string) => void,
  maxAttempts = 3,
): Promise<{ error: any; result?: SaveDoResult }> {
  let attemptHeader = header;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase.rpc('save_outward_do', {
      p_movement_id: movementId, p_header: attemptHeader, p_lines: lines, p_actor: actor,
    });
    if (!error) return { error: null, result: data as SaveDoResult };
    if (movementId || error.code !== '23505' || attempt === maxAttempts - 1) return { error };
    const nextDoNumber = await generateNextDoNumber(header.warehouse);
    attemptHeader = { ...attemptHeader, do_number: nextDoNumber };
    onRetryDoNumber(nextDoNumber);
  }
  return { error: new Error('Could not save the DO after several attempts — please try again.') };
}

// 2026-10-05: the same form can also be opened from the Dispatch board
// (Step 6 "Transporter & DO" → "DO issued ✓" button).
// 2026-10-06: that no longer happens in a popup. Dispatch.tsx now navigates
// to this same page as a normal full page (like New Enquiry):
//   /stock-movements/new-outward?fromDispatch=1&orderRef=<order id>&round=<n>&plannedAt=<iso>
// The page finds the order in the store and prefills the form once.
// 2026-11-03: &lines=<seq,seq> = "+ New DO (another warehouse)" — rows only
// for those order lines.
const DISPATCH_BOARD_PATH = '/dispatch';

// Warehouse + Lot No as one comparable key (lot match is case-insensitive).
const lotKeyOf = (warehouse: string, lotNo: string) => `${warehouse}|${lotNo.trim().toLowerCase()}`;
const sameLot = (a: string, b: string) => !!a.trim() && a.trim().toLowerCase() === b.trim().toLowerCase();

// 2026-10-12: Fulfilment Type is now required and must be one of these two
// ("Both" is a customer-level value, not something one Outward entry can be).
const FULFILMENT_TYPES = ['Delivery', 'Self Pickup'];

// The Outward list view (StockMovements.tsx) an entry belongs in — Saved or
// Email Sent sub-tab, Delivery / Self Pickup pill. Same URL params that page
// reads on load.
const outwardListPath = (emailSent: boolean, fulfilmentType?: string | null) => {
  const type = fulfilmentType === 'Self Pickup' ? 'self_pickup' : fulfilmentType === 'Delivery' ? 'delivery' : 'not_set';
  return `/stock-movements?tab=outward&sub=${emailSent ? 'emailSent' : 'saved'}&type=${type}`;
};

// 2026-10-15: the "unsaved draft" (added 2026-10-13) was removed at the
// user's request — leaving the form without Save keeps NOTHING, and the form
// always opens clean: the order prefill (from the Dispatch board), an empty
// form (plain New Outward) or the saved record (Edit). Old drafts the
// previous version left in localStorage ("outwardDraft:…") are deleted here
// so they can never come back.
function clearOldOutwardDrafts() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('outwardDraft:')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* storage unavailable — nothing to clean */ }
}

// ── The DO: header (once) + product lines ──────────────────────────────────
const emptyHeader = {
  warehouse: '', otherWarehouse: '', doNumber: '', doDate: '',
  partyName: '', otherParty: '', transporter: '', otherTransporter: '', fulfilmentType: '', note: '',
};
type Header = typeof emptyHeader;

// One product line (one stock_movements row). Total Quantity is never stored
// here — it is always No of Barrels × Packing (lineTotal).
type Line = {
  key: string;
  lotNo: string; lotDate: string; productName: string; productCode: string; billingName: string;
  numArticles: string; packing: string; packagingType: string; weightType: string;
  orderLineSeq: number | null;     // the order line this row is for (from its lot)
  billingTyped: boolean;           // plain New Outward: the user typed their own Billing Name
  userBarrelsKey: string | null;   // Warehouse + Lot No the user typed their own No of Barrels for
  autoBarrels: string | null;      // what the barrels auto-fill last put in
  lotTouched: boolean;             // false = a saved row whose Lot No / Warehouse wasn't changed yet
  lotFilled: boolean;              // a lot has filled this row (so there is something to clear)
  savedTotal?: number | null;      // edit: total_qty as saved
  // 2026-11-03: the order line the user picked for this row with "+ Add
  // product" (Board / linked DO). Wins over the matcher whenever the row's lot
  // (or, for Wada, its Billing Name) matches it, and survives a lot clear.
  pin: { seq: number; desc: string } | null;
};
let lineCounter = 0;
const newLine = (p: Partial<Line> = {}): Line => ({
  key: `line${++lineCounter}`,
  lotNo: '', lotDate: '', productName: '', productCode: '', billingName: '',
  numArticles: '', packing: '', packagingType: '', weightType: '',
  orderLineSeq: null, billingTyped: false, userBarrelsKey: null, autoBarrels: null,
  lotTouched: true, lotFilled: false, pin: null,
  ...p,
});
// b14a218 for one row: every lot field emptied (Lot No itself stays). A row
// pinned to an order line goes back to that line.
const clearedLine = (l: Line): Line => ({
  ...l, lotDate: '', productName: '', productCode: '', billingName: l.pin?.desc ?? '',
  numArticles: '', packing: '', packagingType: '', weightType: '',
  orderLineSeq: l.pin?.seq ?? null, billingTyped: false, userBarrelsKey: null, autoBarrels: null, lotFilled: false,
});

// Returns a finite number, or null if v is empty/not a valid number (never NaN, never "" as 0).
const parseNum = (v: string): number | null => {
  const t = (v ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
// 2026-11-03 (later, user's rule): No of Barrels when a row's lot is entered
// (or its Lot No / the header Warehouse changes) = EXACTLY the lot's barrels
// at the header warehouse in Stock Summary (the stock_lots party column, the
// "Available at …" figure) — NOT capped by what the order still needs (the
// cap added in c168940 is removed). The user then edits it down; an order
// over-dispatch is a row problem that blocks Save, never changed for them.
// No stock there → empty (the "No stock found" note blocks Save). Edit mode,
// the DO's own saved lot back → its saved barrels (that lot's Stock Summary
// figure already has this DO taken off).
export const barrelsForLot = (available: number, ownSaved: number | null): string =>
  ownSaved !== null ? String(ownSaved) : available > 0 ? String(available) : '';

const lineTotal = (l: Line): number | null => {
  const b = parseNum(l.numArticles), p = parseNum(l.packing);
  return b !== null && p !== null ? b * p : null;
};

// What the Lot No lookup found: the lot's own details and its barrels at the
// header warehouse. key = the Warehouse + Lot No it was looked up for.
type LotDetails = {
  lotNo: string; productName: string; productCode: string; packing: string;
  packagingType: string; weightType: string; inwardDate: string; available: number;
};
type Lookup = { key: string; lot: LotDetails | null };

// Board prefill: one row per order line (the given seqs, else every line
// with barrels left), Billing Name = the line's product name, lot fields empty.
function dispatchRowsFor(o: Order, entries: DispatchEntry[], seqs: number[] | null): Line[] {
  const remaining = remainingByLine(o, entries);
  const items = seqs ? o.items.filter(i => seqs.includes(i.seq)) : o.items.filter(i => (remaining.get(i.seq) ?? 0) > 0);
  const rows = items.map(i => newLine({ billingName: (i.desc || '').trim(), orderLineSeq: i.seq }));
  return rows.length ? rows : [newLine()];
}

// The page itself is a thin shell: the form below is re-created from scratch
// (fresh state, fresh prefill / saved record) whenever the thing being filled
// in changes (another order / round, another entry, or plain New Outward).
export function NewStockOutward() {
  const [searchParams] = useSearchParams();
  const movementId = searchParams.get('movementId');
  const orderRef = searchParams.get('orderRef') || '';
  const fromDispatch = !movementId && searchParams.get('fromDispatch') === '1' && !!orderRef;
  // 2026-10-16: `saved` changes after every save from the Board, so the form
  // reloads the entry fresh (edit mode) instead of keeping stale state.
  const formKey = movementId ? `edit:${movementId}:${searchParams.get('saved') || ''}`
    : fromDispatch ? `dispatch:${orderRef}:${Number(searchParams.get('round')) || 1}:${searchParams.get('lines') || ''}`
    : 'new';
  useEffect(() => { clearOldOutwardDrafts(); }, []);
  return <OutwardForm key={formKey} />;
}

function OutwardForm() {
  const navigate = useNavigate();
  const { user, activeDoer, data, isReadOnlyUser } = useAppStore();
  const [searchParams] = useSearchParams();
  const movementId = searchParams.get('movementId');
  const isEditing = !!movementId;

  // 2026-10-06: opened from the Dispatch board's Step 6 "DO issued ✓".
  const orderRef = searchParams.get('orderRef') || '';
  // 2026-10-16: boardLink = opened from the Board, new DO OR an existing one
  // ("Open DO → Email to Client") — Back goes to the board. fromDispatch
  // stays "new DO from the Board" only (order prefill, Billing Name rules…).
  const boardLink = searchParams.get('fromDispatch') === '1' && !!orderRef;
  const fromDispatch = !isEditing && boardLink;
  const dispatchRound = Number(searchParams.get('round')) || 1;
  const dispatchPlannedAt = searchParams.get('plannedAt') || '';
  const dispatchRemark = searchParams.get('remark') || '';
  const linesParam = searchParams.get('lines');
  const prefillSeqs = linesParam ? linesParam.split(',').map(Number).filter(n => Number.isFinite(n)) : null;
  // 2026-10-12: a Self Pickup card's Step 6 opens this form with Fulfilment
  // Type prefilled as Self Pickup (still editable).
  const dispatchFulfilment = fromDispatch && searchParams.get('fulfilment') === 'self_pickup' ? 'Self Pickup' : '';

  const [header, setHeader] = useState<Header>(emptyHeader);
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const headerRef = useRef(header); headerRef.current = header;
  const linesRef = useRef(lines); linesRef.current = lines;
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});
  const lookupsRef = useRef(lookups); lookupsRef.current = lookups;

  // 2026-10-12: stock_movements.email_sent_at of the DO being edited (null =
  // still in the Saved sub-tab). Set by markOutwardEmailSent below.
  const [emailSentAt, setEmailSentAt] = useState<string | null>(null);
  const [fulfilmentError, setFulfilmentError] = useState(false);
  // 2026-10-26: Transporter is required for Delivery (the DO email names it).
  const [transporterError, setTransporterError] = useState(false);

  // Where to go on Back / Cancel.
  const goBack = () => navigate(boardLink ? DISPATCH_BOARD_PATH : outwardListPath(!!emailSentAt, header.fulfilmentType || 'Delivery'));
  // 2026-10-16: the order + round this DO belongs to (stock_movements.order_id /
  // dispatch_round) — from the saved row in edit mode, else from the Board URL.
  const [linkedOrder, setLinkedOrder] = useState<{ orderId: string; round: number } | null>(
    fromDispatch ? { orderId: orderRef, round: dispatchRound } : null);
  // Green note after Email to Client completed Step 6 (or why it didn't).
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string; retry?: boolean } | null>(null);

  // The order the DO's rows are checked against (order lines, "Order needs"):
  // a new DO from the Board, or a saved DO linked to an order. Dispatch's
  // copy of the order (see dispatchOrderView).
  const rowsOrder = useMemo(() => {
    const id = linkedOrder?.orderId;
    const order = id ? data.orders.find(o => o.id === id) : undefined;
    return order && dispatchOrderView(order);
  }, [linkedOrder, data.orders]);
  // The order's dispatch entries BEFORE this DO's round — "remaining" for a
  // saved DO whose round already has its entry must not count that entry.
  const orderEntries = useMemo(() => {
    if (!rowsOrder || !linkedOrder) return [] as DispatchEntry[];
    const all = data.dispatchEntries.filter(e => e.orderId === rowsOrder.id);
    const real = all.filter(e => !isImportedEntry(e))
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    const later = new Set(real.slice(linkedOrder.round - 1).map(e => e.id));
    return all.filter(e => !later.has(e.id));
  }, [rowsOrder, linkedOrder, data.dispatchEntries]);
  const orderRemaining = useMemo(() => rowsOrder ? remainingByLine(rowsOrder, orderEntries) : new Map<number, number>(), [rowsOrder, orderEntries]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // 2026-11-03 (UI cleanup): Save with a row problem shows it as ONE toast
  // (same toast pattern as Customers.tsx) instead of text under the rows.
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (type: 'ok' | 'err', msg: string, ms = 6000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [loadingMovement, setLoadingMovement] = useState(isEditing);
  // Edit: every saved line as loaded — what stock_lots was last changed by
  // (its lots' "Available" already excludes these barrels), and the activity
  // log's "before". savedIds = the DO's rows (Email to Client stamps them all).
  const originalLines = useRef<{ warehouse: string; lotNo: string; numArticles: string }[]>([]);
  const originalRows = useRef<any[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!movementId) return;
    let cancelled = false;
    setLoadingMovement(true);
    (async () => {
      const { data: first, error: fetchErr } = await supabase.from('stock_movements').select('*').eq('id', movementId).single();
      if (cancelled) return;
      if (fetchErr || !first) {
        setError(fetchErr?.message || 'Could not load this Outward entry.');
        setLoadingMovement(false);
        return;
      }
      // 2026-11-03: the whole DO — every line with this DO number.
      let rows: any[] = [first];
      if (first.do_number) {
        const { data: all, error: allErr } = await supabase.from('stock_movements').select('*')
          .eq('type', 'outward').eq('do_number', first.do_number)
          .order('do_line_no', { ascending: true }).order('created_at', { ascending: true });
        if (cancelled) return;
        if (allErr) { setError(allErr.message); setLoadingMovement(false); return; }
        if (all && all.length) rows = all;
      }
      const isKnownWarehouse = WAREHOUSES.includes(first.warehouse);
      setHeader({
        warehouse: isKnownWarehouse ? first.warehouse : (first.warehouse ? 'Other' : ''),
        otherWarehouse: isKnownWarehouse ? '' : (first.warehouse || ''),
        doNumber: first.do_number || '',
        doDate: first.do_date || '',
        partyName: first.party_name || '',
        otherParty: first.other_party || '',
        transporter: first.transporter || '',
        otherTransporter: first.other_transporter || '',
        fulfilmentType: first.fulfilment_type || '',
        note: first.note || '',
      });
      setLines(rows.map(r => newLine({
        lotNo: r.wh_lot_no || '',
        lotDate: r.inward_date || '',
        productName: r.product_name || '',
        // Stock lines have no saved product_code — same exact-match
        // derivation as before. 2026-11-03: a Wada line keeps the code typed.
        productCode: r.product_code || codeForProductName(r.product_name || ''),
        // 2026-10-16: the saved billing_name; entries saved before it existed
        // fall back to the catalogue lookup.
        billingName: r.billing_name || billingNameForProductName(r.product_name || ''),
        numArticles: r.num_articles || '',
        packing: r.packing?.toString() ?? '',
        packagingType: r.packaging_type || '',
        weightType: r.weight_type || '',
        orderLineSeq: r.order_line_seq ?? null,
        lotTouched: false,
        lotFilled: true,
        savedTotal: r.total_qty ?? null,
      })));
      originalRows.current = rows;
      originalLines.current = rows.map(r => ({ warehouse: r.warehouse || '', lotNo: (r.wh_lot_no || '').trim(), numArticles: r.num_articles || '' }));
      setSavedIds(rows.map(r => r.id));
      setLinkedOrder(first.order_id && first.dispatch_round ? { orderId: first.order_id, round: first.dispatch_round } : null);
      setEmailSentAt(rows.every(r => !!r.email_sent_at) ? first.email_sent_at : null);
      setLoadingMovement(false);
    })();
    return () => { cancelled = true; };
  }, [movementId]);

  // Edit: barrels this DO already took from that lot at that warehouse (its
  // lot's "Available" is after this DO, so they count as available again).
  const originalBarrelsFor = (warehouse: string, lotNo: string): number | null => {
    const o = originalLines.current.find(x => PARTY_COLUMN[x.warehouse] && PARTY_COLUMN[x.warehouse] === PARTY_COLUMN[warehouse] && sameLot(x.lotNo, lotNo));
    return o ? (parseNum(o.numArticles) ?? 0) : null;
  };

  // 2026-09-07: Party Name options + the customer->transporter lookup used
  // to auto-fill Transporter, both sourced live from `customers` — see the
  // file-header comment. Only customers with a preferred_transporter on
  // file are included (fulfilment_type is not filtered on). 'Other' is
  // appended so a party not yet in the customers table can still be typed in.
  const [partyNameOptions, setPartyNameOptions] = useState<string[]>([]);
  const [transporterOptions, setTransporterOptions] = useState<string[]>([]);
  const [transporterByParty, setTransporterByParty] = useState<Record<string, string>>({});
  const [fulfilmentTypeByParty, setFulfilmentTypeByParty] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const loadPartyTransporters = async () => {
      const { data, error: fetchErr } = await fetchAllRows(() => supabase
        .from('customers')
        .select('company_name, preferred_transporter, fulfilment_type')
        .not('preferred_transporter', 'is', null)
        .neq('preferred_transporter', '')
        .order('company_name', { ascending: true })
        .order('customer_id'));
      if (fetchErr || !data || cancelled) return;
      const names: string[] = [];
      const map: Record<string, string> = {};
      const fulfilmentMap: Record<string, string> = {};
      const transporterSet = new Set<string>();
      for (const row of data as { company_name: string | null; preferred_transporter: string | null; fulfilment_type: string | null }[]) {
        const name = (row.company_name || '').trim();
        const transporter = (row.preferred_transporter || '').trim();
        const fulfilmentType = (row.fulfilment_type || '').trim();
        // 2026-10-12: only Delivery / Self Pickup are auto-filled — a "Both"
        // customer leaves the (now required) field empty for the user to pick.
        if (name && FULFILMENT_TYPES.includes(fulfilmentType)) fulfilmentMap[name] = fulfilmentType;
        if (!name || !transporter) continue;
        if (!(name in map)) { map[name] = transporter; names.push(name); }
        transporterSet.add(transporter);
      }
      setPartyNameOptions([...names, 'Other']);
      setTransporterByParty(map);
      setFulfilmentTypeByParty(fulfilmentMap);
      setTransporterOptions([...Array.from(transporterSet).sort(), 'Other']);
      // Prefilled Party Name (Dispatch board) never goes through the
      // combobox onChange, so fill Transporter / Fulfilment Type here the
      // same way picking the party by hand would — only if still empty.
      setHeader(h => h.partyName ? {
        ...h,
        transporter: h.transporter || map[h.partyName] || '',
        fulfilmentType: h.fulfilmentType || fulfilmentMap[h.partyName] || '',
      } : h);
    };
    loadPartyTransporters();
    return () => { cancelled = true; };
  }, []);

  // 2026-10-06: Dispatch prefill. Runs ONCE, as soon as the order is found
  // in the store (orders may still be loading on a direct page open).
  // 2026-11-03: one row per order line with barrels left (or the ?lines= ones).
  const dispatchPrefilled = useRef(false);
  useEffect(() => {
    if (!fromDispatch || !rowsOrder || dispatchPrefilled.current) return;
    dispatchPrefilled.current = true;
    const party = rowsOrder.cust || '';
    const orderFulfilment = rowsOrder.fulfillmentType === 'delivery' ? 'Delivery'
      : rowsOrder.fulfillmentType === 'self_pickup' ? 'Self Pickup' : '';
    setLines(dispatchRowsFor(rowsOrder, orderEntries, prefillSeqs));
    setHeader(h => ({
      ...h,
      doDate: fmtIST(new Date(), 'yyyy-MM-dd'),
      partyName: party,
      note: `${rowsOrder.soNumber || ''}${rowsOrder.soNumber ? ' · ' : ''}${rowsOrder.id}`,
      transporter: h.transporter || transporterByParty[party] || '',
      // 2026-10-16: the ORDER's own Fulfilment Type wins, then the Board URL,
      // then whatever is already in. Still editable.
      fulfilmentType: orderFulfilment || dispatchFulfilment || h.fulfilmentType || fulfilmentTypeByParty[party] || '',
    }));
  }, [rowsOrder]);

  // Marks Dispatch Step 6 done — same dispatch_steps row + activity log
  // runStepAction in Dispatch.tsx writes.
  // 2026-10-16: called when the DO is EMAILED, with the DO's own order + round
  // and the email time. Step 6 is written only once EVERY DO linked to that
  // order + round has been emailed, and never twice.
  // 2026-11-03: DOs are counted by DO number (a DO with 3 lines is one DO);
  // this DO's own lines don't count.
  type StepResult = { kind: 'done' } | { kind: 'waiting'; notEmailed: number } | { kind: 'error'; msg: string };
  const markDispatchStepDone = async (link: { orderId: string; round: number }, doneAt: string): Promise<StepResult> => {
    if (!canActOnDispatchBoard(user?.email) || isReadOnlyUser) return { kind: 'error', msg: 'you do not have permission to act on the Dispatch board' };
    try {
      const { data: others, error: othersErr } = await supabase.from('stock_movements').select('id, do_number')
        .eq('order_id', link.orderId).eq('dispatch_round', link.round).is('email_sent_at', null);
      if (othersErr) throw othersErr;
      const notEmailedDos = new Set((others || [])
        .filter(r => !savedIds.includes(r.id) && !(r.do_number && r.do_number === header.doNumber))
        .map(r => r.do_number || r.id));
      const notEmailed = notEmailedDos.size;
      if (notEmailed > 0) return { kind: 'waiting', notEmailed };
      // Already marked (page opened twice / email sent again)? Don't add a second row.
      const { data: already, error: checkErr } = await supabase.from('dispatch_steps').select('id')
        .eq('order_id', link.orderId).eq('round', link.round).eq('step_no', 6).eq('status', 'done').limit(1);
      if (checkErr) throw checkErr;
      if (already && already.length > 0) return { kind: 'done' };
      const { data: inserted, error: stepErr } = await supabase.from('dispatch_steps').insert({
        order_id: link.orderId,
        round: link.round,
        step_no: 6,
        status: 'done',
        planned_at: dispatchPlannedAt || null,
        done_at: doneAt,
        done_by: user?.email ?? null,
        remark: dispatchRemark.trim() || null,
      }).select('*');
      if (stepErr) throw stepErr;
      const so = data.orders.find(o => o.id === link.orderId)?.soNumber;
      logActivity({
        module: 'dispatch_steps', recordId: link.orderId,
        recordLabel: `${so || link.orderId} · Step 6 Transporter & DO · Done (DO ${header.doNumber || '—'} emailed)`,
        action: 'insert', after: inserted?.[0],
      });
      return { kind: 'done' };
    } catch (err: any) {
      return { kind: 'error', msg: err?.message || JSON.stringify(err) };
    }
  };

  // The Board URL for this DO in edit mode — where a Board save lands, and
  // what "Open DO → Email to Client" opens.
  const boardEditUrl = (id: string) => {
    const p = new URLSearchParams({ movementId: id, fromDispatch: '1', orderRef, round: String(dispatchRound) });
    if (dispatchPlannedAt) p.set('plannedAt', dispatchPlannedAt);
    if (dispatchRemark.trim()) p.set('remark', dispatchRemark.trim());
    p.set('saved', String(Date.now()));
    return `/stock-movements/new-outward?${p.toString()}`;
  };

  // After a successful save: plain Stock Movements goes back to its list.
  // 2026-10-16: from the Board the form stays open on the saved DO (edit
  // mode); Step 6 completes when the DO is emailed (markOutwardEmailSent).
  const afterSave = async (savedId?: string) => {
    if (boardLink) {
      const id = savedId || movementId;
      navigate(id ? boardEditUrl(id) : DISPATCH_BOARD_PATH, { replace: true });
      return;
    }
    navigate(outwardListPath(!!emailSentAt, header.fulfilmentType));
  };

  const retryDispatchStep = async () => {
    if (!linkedOrder || !emailSentAt) return;
    setSaving(true);
    const r = await markDispatchStepDone(linkedOrder, emailSentAt);
    setSaving(false);
    setEmailResult(stepResultNote(r));
  };

  const stepResultNote = (r: StepResult): { ok: boolean; msg: string; retry?: boolean } =>
    r.kind === 'done' ? { ok: true, msg: 'Email sent — Step 6 completed.' }
    : r.kind === 'waiting' ? { ok: false, msg: `Email sent. ${r.notEmailed} other DO${r.notEmailed === 1 ? '' : 's'} for this order ${r.notEmailed === 1 ? 'is' : 'are'} not emailed yet — Step 6 completes when every DO is emailed.` }
    : { ok: false, msg: `Email sent, but Dispatch Step 6 could not be marked done: ${r.msg}.`, retry: true };

  const setH = (k: keyof Header) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setHeader(h => ({ ...h, [k]: e.target.value }));
  const updateLine = (key: string, patch: Partial<Line>) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l));

  const isOtherWarehouse = header.warehouse === 'Other';
  const isOtherParty = header.partyName === 'Other';
  const isOtherTransporter = header.transporter === 'Other';

  // 2026-11-03: a Warehouse change clears every row's lot fields (b14a218) —
  // the lots are then looked up again at the new warehouse and refill.
  // 2026-11-03 (Wada): a switch to / from Wada (no stock) — a saved DO may not
  // make it (its stock would go out of step; save_outward_do refuses it too).
  // A new DO keeps every header field and each row's Lot No, Billing Name and
  // order line; the other row fields are cleared (they belonged to a stock lot,
  // or were typed for Wada) and the new warehouse's rules take over.
  const onWarehouseChange = (warehouse: string) => {
    const crossesWada = isNoStockWarehouse(warehouse) !== isNoStockWarehouse(headerRef.current.warehouse);
    if (crossesWada && isEditing) {
      showToast('err', 'Make a new DO instead — a saved DO cannot be moved between Wada and a stock warehouse.');
      return;
    }
    setHeader(h => ({ ...h, warehouse }));
    setLines(ls => ls.map(l => crossesWada
      ? { ...clearedLine(l), billingName: l.billingName, billingTyped: l.billingTyped, orderLineSeq: l.orderLineSeq, lotTouched: true }
      : (l.lotFilled ? clearedLine({ ...l, lotTouched: true }) : { ...l, lotTouched: true })));
    setLookups({});
  };

  // 2026-09-09: auto-generates the DO Number the moment a Warehouse is
  // picked, and regenerates it if the Warehouse changes again before saving
  // — see generateNextDoNumber() above. Never while editing: an existing DO's
  // number is saved and must never change.
  useEffect(() => {
    if (isEditing) return;
    const warehouse = header.warehouse;
    if (!DO_NUMBER_PREFIX[warehouse]) {
      setHeader(h => (h.doNumber ? { ...h, doNumber: '' } : h));
      return;
    }
    let cancelled = false;
    generateNextDoNumber(warehouse).then(doNumber => {
      if (cancelled) return;
      setHeader(h => (h.warehouse === warehouse ? { ...h, doNumber } : h));
    });
    return () => { cancelled = true; };
  }, [header.warehouse, isEditing]);

  // ── Lot No lookup, per row ────────────────────────────────────────────────
  // Each row's lot is looked up in the HEADER warehouse, 400ms after the last
  // keystroke (same findOutwardLot the database functions use), and the row
  // is filled from it exactly as the single-lot form did (see the 2026-09-08 …
  // 2026-11-03 notes in git history / docs): Product Name / Code, Packing,
  // Packing Type, MOU, Lot Date always from the lot (and locked); No of
  // Barrels = the lot's barrels at the warehouse (barrelsForLot — no cap by
  // the order since 2026-11-03 later) unless the user typed their own for
  // this Warehouse + Lot No; Billing Name = the order line's product name
  // (Board / linked DO) or the catalogue billing name (plain New Outward,
  // unless typed). From the Board / a linked DO, the lot's product picks the
  // row's order line (pickOrderLine: a picked line wins, then lines other rows
  // don't use; a line already on another row still matches — 2+ lots of one
  // product are fine).
  // Empty or unknown Lot No → that row's lot fields are cleared (b14a218).
  // A saved row in edit mode keeps its saved values until its Lot No (or the
  // Warehouse) is changed — the lookup only records the lot (locked fields,
  // "Available (after this DO)").
  // The order line for a row whose product (lot's billing name, or Wada's
  // typed Billing Name) is `productBilling`. 2026-11-03: the same order line
  // may be on several rows (one per lot), so a line other rows use still
  // matches, and a line the user picked with "+ Add product" (pin) wins when
  // it matches. 2026-11-04: otherwise a line with barrels left after the other
  // rows of this DO wins (orderLineSeqForLot) — never one with 0 left while
  // another matching line has some (ORD-2026-869, two "Camphor Powder" lines).
  const pickOrderLine = (l: Line, productBilling: string, othersCount: (o: Line) => boolean): number | null => {
    if (!rowsOrder) return null;
    if (l.pin && orderLinesForLot(rowsOrder, productBilling).some(m => m.seq === l.pin!.seq)) return l.pin.seq;
    const onDo = new Map<number, number>();
    for (const o of linesRef.current) {
      if (o.key === l.key || !othersCount(o) || o.orderLineSeq == null) continue;
      onDo.set(o.orderLineSeq, (onDo.get(o.orderLineSeq) ?? 0) + (parseNum(o.numArticles) ?? 0));
    }
    return orderLineSeqForLot(rowsOrder, orderEntries, productBilling, l.orderLineSeq, onDo);
  };

  const fillFromLot = (l: Line, lot: LotDetails, key: string): Line => {
    if (!l.lotTouched) return l;
    let orderLineSeq = l.orderLineSeq;
    let billingName = l.billingName;
    if (rowsOrder) {
      const seq = pickOrderLine(l, lotBillingName(lot.productName, billingNameForProductName), o => o.lotFilled);
      orderLineSeq = seq;
      if (seq !== null) billingName = (rowsOrder.items.find(i => i.seq === seq)?.desc || '').trim();
    } else if (!l.billingTyped) {
      billingName = billingNameForProductName(lot.productName);
    }
    let numArticles = l.numArticles;
    let autoBarrels = l.autoBarrels;
    const own = isEditing ? originalBarrelsFor(headerRef.current.warehouse, lot.lotNo) : null;
    if (l.userBarrelsKey !== key) {
      numArticles = barrelsForLot(lot.available, own);
      autoBarrels = numArticles || null;
    }
    return {
      ...l,
      productName: lot.productName, productCode: lot.productCode,
      packing: lot.packing, packagingType: lot.packagingType, weightType: lot.weightType,
      lotDate: lot.inwardDate || l.lotDate,
      billingName, orderLineSeq, numArticles, autoBarrels, lotFilled: true,
    };
  };

  const lookupSig = `${header.warehouse}#${lines.map(l => `${l.key}=${l.lotNo.trim().toLowerCase()}`).join(',')}`;
  useEffect(() => {
    const warehouse = header.warehouse;
    // 2026-11-03: Wada — Lot No is free text: no lookup, nothing cleared.
    if (isNoStockWarehouse(warehouse)) return;
    const partyCol = PARTY_COLUMN[warehouse];
    // No Lot No / no stock warehouse → clear straight away.
    const empty = linesRef.current.filter(l => !l.lotNo.trim() || !partyCol).map(l => l.key);
    if (empty.length) {
      setLines(ls => ls.map(l => empty.includes(l.key) && l.lotTouched && l.lotFilled ? clearedLine(l) : l));
      setLookups(p => {
        const next = { ...p };
        empty.forEach(k => delete next[k]);
        return next;
      });
    }
    if (!partyCol) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      for (const l of linesRef.current) {
        const lotNo = l.lotNo.trim();
        if (!lotNo) continue;
        const key = lotKeyOf(warehouse, lotNo);
        if (lookupsRef.current[l.key]?.key === key) continue;
        (async () => {
          const { data: found } = await findOutwardLot(lotNo);
          if (cancelled) return;
          const existing = found?.[0];
          // Same packing/packingDetail fallback as Stock Summary; the lot's own
          // product_code wins over a name lookup (2026-09-08).
          const lot: LotDetails | null = existing ? {
            lotNo,
            productName: existing.product_name || '',
            productCode: existing.product_code || codeForProductName(existing.product_name || ''),
            packing: existing.packing != null ? String(existing.packing) : (existing.packing_detail || ''),
            packagingType: existing.packing_type || '',
            weightType: existing.mou || '',
            inwardDate: existing.inward_date || '',
            // The party qty_* column — never no_of_barrels (see 2026-09-08).
            available: Number(existing[partyCol]) || 0,
          } : null;
          setLookups(p => ({ ...p, [l.key]: { key, lot } }));
          setLines(ls => ls.map(x => {
            // The row may have moved on while this lookup was in flight.
            if (x.key !== l.key || lotKeyOf(headerRef.current.warehouse, x.lotNo) !== key) return x;
            if (!lot) return x.lotTouched && x.lotFilled ? clearedLine(x) : x;
            return fillFromLot(x, lot, key);
          }));
        })();
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [lookupSig]);

  // 2026-11-03 (Wada): no lot, so the typed Billing Name picks the row's order
  // line (same matcher and tie-break as a lot's product, fillFromLot).
  const onBillingChange = (l: Line, billingName: string) => {
    if (isNoStockWarehouse(header.warehouse) && rowsOrder) {
      const orderLineSeq = billingName.trim() ? pickOrderLine(l, billingName, () => true) : null;
      updateLine(l.key, { billingName, billingTyped: true, orderLineSeq, lotTouched: true });
      return;
    }
    updateLine(l.key, { billingName, billingTyped: true });
  };

  // 2026-11-03: "+ Add product" from the Board / a linked DO can add a row for
  // a chosen order line — also one already on the DO (one product filled from
  // 2+ lots). '' = no choice: the row's lot (Wada: Billing Name) picks the line.
  const [addForSeq, setAddForSeq] = useState('');
  const addLine = () => {
    const item = rowsOrder && addForSeq ? rowsOrder.items.find(i => String(i.seq) === addForSeq) : undefined;
    const desc = (item?.desc || '').trim();
    setLines(ls => [...ls, item
      ? newLine({ billingName: desc, orderLineSeq: item.seq, pin: { seq: item.seq, desc } })
      : newLine()]);
  };
  const removeLine = (key: string) => setLines(ls => ls.length > 1 ? ls.filter(l => l.key !== key) : ls);

  // ── Per-row checks ────────────────────────────────────────────────────────
  // Save is blocked while ANY row has a problem; the problem shows on its row.
  type RowInfo = {
    lot: LotDetails | null; lookedUp: boolean; total: number | null; maxBarrels: number | null;
    orderNeeds: number | null; orderPacking: string; packingMismatch: boolean;
    problem: string; problemSoft: boolean;   // soft = not filled in yet (no red border)
    problemField: 'lot' | 'barrels' | 'packing' | 'product' | 'billing' | null;   // the box that gets the red border + tooltip
    lineOnDo: { sum: number; rows: number[] } | null;   // this row's order line on 2+ rows of this DO: their barrels / row numbers
  };
  const isWada = isNoStockWarehouse(header.warehouse);
  // 2026-11-03 (user decision): one order line may be on several rows of a DO
  // (one product filled from 2+ lots — each row its own lot; the same lot
  // twice is still blocked). The order check is per LINE: the barrels of all
  // its rows together must be ≤ what the line still needs. Too many → every
  // row of that line gets the red No of Barrels box + the total in its tooltip.
  const lineSums = barrelsByOrderLine(lines);
  const lineOnDoOf = (l: Line) => {
    const s = l.orderLineSeq != null ? lineSums.get(l.orderLineSeq) : undefined;
    return s && s.rows.length > 1 ? s : null;
  };
  // 2026-11-04: messages name the order line ("Line 2 – Camphor Powder 50 × 30").
  const overOrder = (l: Line, barrels: number, orderNeeds: number | null) =>
    orderOverMessage(barrels, orderNeeds, rowsOrder && l.orderLineSeq != null ? orderLineLabel(rowsOrder, l.orderLineSeq) : 'this product', lineOnDoOf(l));
  // 2026-11-03 (Wada): no lot, so a row's order line comes from its typed
  // Billing Name — same matcher as a lot's product (orderLinesForLot), and the
  // order rules (in the order, one lot per row, line's barrels ≤ remaining) apply.
  const wadaRowInfo = (l: Line): RowInfo => {
    const barrels = parseNum(l.numArticles);
    const total = lineTotal(l);
    const item = rowsOrder && l.orderLineSeq != null ? rowsOrder.items.find(i => i.seq === l.orderLineSeq) : undefined;
    const orderNeeds = item ? (orderRemaining.get(item.seq) ?? 0) : null;
    const orderPacking = item ? String(item.packing ?? '').trim() : '';
    const billing = l.billingName.trim();
    const lineMismatch = (() => {
      if (!rowsOrder || !l.lotTouched || !billing) return '';
      if (item && orderLinesForLot(rowsOrder, billing).some(m => m.seq === item.seq)) return '';
      const has = rowsOrder.items.map(i => (i.desc || '').trim()).filter(Boolean).join(', ');
      return `${billing} is not in order ${rowsOrder.soNumber || rowsOrder.id}. Order has: ${has}.`;
    })();
    const dupLot = !!l.lotNo.trim() && lines.some(o => o.key !== l.key && sameLot(o.lotNo, l.lotNo));
    let problem = '';
    let problemSoft = false;
    let problemField: RowInfo['problemField'] = null;
    if (!l.lotNo.trim()) { problem = 'Enter a Lot No.'; problemSoft = true; problemField = 'lot'; }
    else if (!l.productName.trim()) { problem = 'Enter a Product Name.'; problemSoft = true; problemField = 'product'; }
    else if (!billing) { problem = 'Enter a Billing Name.'; problemSoft = true; problemField = 'billing'; }
    else if (lineMismatch) { problem = lineMismatch; problemField = 'billing'; }
    else if (dupLot) { problem = `Lot ${l.lotNo.trim()} is on another row of this DO — use one row per lot.`; problemField = 'lot'; }
    else if (barrels === null || barrels <= 0) { problem = 'Enter No of Barrels.'; problemSoft = true; problemField = 'barrels'; }
    else if (parseNum(l.packing) === null) { problem = l.packing.trim() ? 'Packing must be a number.' : 'Enter Packing.'; problemSoft = !l.packing.trim(); problemField = 'packing'; }
    else if ((problem = overOrder(l, barrels, orderNeeds))) problemField = 'barrels';
    return { lot: null, lookedUp: false, total, maxBarrels: null, orderNeeds, orderPacking, packingMismatch: false, problem, problemSoft, problemField, lineOnDo: lineOnDoOf(l) };
  };
  const rowInfos: RowInfo[] = lines.map(l => {
    if (isWada) return wadaRowInfo(l);
    const key = lotKeyOf(header.warehouse, l.lotNo);
    const lk = lookups[l.key];
    const lookedUp = !!lk && lk.key === key;
    const lot = lookedUp ? lk.lot : null;
    const barrels = parseNum(l.numArticles);
    const total = lineTotal(l);
    const own = isEditing ? originalBarrelsFor(header.warehouse, l.lotNo) : null;
    const maxBarrels = lot ? lot.available + (own ?? 0) : null;
    const item = rowsOrder && l.orderLineSeq != null ? rowsOrder.items.find(i => i.seq === l.orderLineSeq) : undefined;
    const orderNeeds = item ? (orderRemaining.get(item.seq) ?? 0) : null;
    const orderPacking = item ? String(item.packing ?? '').trim() : '';
    const packingMismatch = (() => {
      if (!lot || !orderPacking || !lot.packing.trim()) return false;
      const a = parseNum(orderPacking), b = parseNum(lot.packing);
      return a !== null && b !== null ? a !== b : orderPacking.toLowerCase() !== lot.packing.trim().toLowerCase();
    })();
    // 25231ee: the lot's product must be in the order (Board / linked DO; a
    // saved row is only checked once its lot is changed).
    const lineMismatch = (() => {
      if (!rowsOrder || !lot || !l.lotTouched) return '';
      const matches = orderLinesForLot(rowsOrder, lotBillingName(lot.productName, billingNameForProductName));
      if (item && matches.some(m => m.seq === item.seq)) return '';
      const lotText = `Lot ${lot.lotNo} is ${lot.productName}`;
      const has = rowsOrder.items.map(i => (i.desc || '').trim()).filter(Boolean).join(', ');
      return `${lotText} — this product is not in order ${rowsOrder.soNumber || rowsOrder.id}. Order has: ${has}.`;
    })();
    const dupLot = !!lot && lines.some(o => o.key !== l.key && sameLot(o.lotNo, l.lotNo));
    // 2026-11-03 (UI cleanup, user's rule): no text under the row any more.
    // The problem's box (problemField) gets a red border and the message as
    // its tooltip; Save shows the first problem as a toast. Soft problems
    // (row not filled in yet) block Save but don't turn a box red.
    let problem = '';
    let problemSoft = false;
    let problemField: RowInfo['problemField'] = null;
    if (!header.warehouse) { problem = 'Select a Warehouse first.'; problemSoft = true; }
    else if (!PARTY_COLUMN[header.warehouse]) problem = 'Select a Warehouse that exists in Stock Summary.';
    else if (!lot) {
      problemSoft = !l.lotNo.trim() || !lookedUp;
      problemField = 'lot';
      problem = !l.lotNo.trim() ? 'Enter a Lot No.' : !lookedUp ? 'Looking up lot…' : `Lot ${l.lotNo.trim()} is not in Stock Summary.`;
    }
    else if (lineMismatch) { problem = lineMismatch; problemField = 'lot'; }
    else if (dupLot) { problem = `Lot ${lot.lotNo} is on another row of this DO — use one row per lot.`; problemField = 'lot'; }
    else if (parseNum(l.packing) === null) { problem = `Packing missing for lot ${lot.lotNo} — update the lot's packing in Stock Summary first.`; problemField = 'packing'; }
    else if (maxBarrels !== null && maxBarrels <= 0) { problem = `No stock found for this lot at ${header.warehouse}.`; problemField = 'lot'; }
    else if (barrels === null || barrels <= 0) { problem = 'Enter No of Barrels.'; problemSoft = true; problemField = 'barrels'; }
    else if (maxBarrels !== null && barrels > maxBarrels) { problem = `Only ${maxBarrels} barrels available at ${header.warehouse} (Lot ${lot.lotNo}) — you entered ${barrels}.`; problemField = 'barrels'; }
    // 2026-11-03 (later): barrels start at the lot's full stock, so this is
    // the usual first problem on a Board row — never corrected automatically.
    // 2026-11-03: per order line — the sum of all its rows on this DO.
    else if ((problem = overOrder(l, barrels, orderNeeds))) problemField = 'barrels';
    return { lot, lookedUp, total, maxBarrels, orderNeeds, orderPacking, packingMismatch, problem, problemSoft, problemField, lineOnDo: lineOnDoOf(l) };
  });
  const firstProblem = rowInfos.findIndex(r => !!r.problem);
  // "Row 1 (Lot 101010): order needs only 20 barrels of Alpha Pinene — you entered 30."
  const saveBlock = (() => {
    if (firstProblem < 0) return '';
    const p = rowInfos[firstProblem].problem;
    const lotNo = lines[firstProblem].lotNo.trim();
    return `Row ${firstProblem + 1}${lotNo ? ` (Lot ${lotNo})` : ''}: ${p.charAt(0).toLowerCase()}${p.slice(1)}`;
  })();
  const totalBarrels = lines.reduce((s, l) => s + (parseNum(l.numArticles) ?? 0), 0);
  const totalQty = rowInfos.reduce((s, r) => s + (r.total ?? 0), 0);

  const isValid = !!(header.warehouse && (!isOtherWarehouse || header.otherWarehouse.trim()) && header.doNumber.trim());

  // "+ New DO (another warehouse)" (a saved DO opened from the Board): order
  // lines with barrels left that are on no DO of this round yet.
  const [roundDoLines, setRoundDoLines] = useState<{ orderLineSeq?: number; billingName?: string }[] | null>(null);
  useEffect(() => {
    if (!isEditing || !boardLink || !linkedOrder) return;
    let cancelled = false;
    supabase.from('stock_movements').select('order_line_seq, billing_name')
      .eq('type', 'outward').eq('order_id', linkedOrder.orderId).eq('dispatch_round', linkedOrder.round)
      .then(({ data: rows, error: e }) => {
        if (cancelled || e) return;
        setRoundDoLines((rows || []).map(r => ({ orderLineSeq: r.order_line_seq ?? undefined, billingName: r.billing_name ?? undefined })));
      });
    return () => { cancelled = true; };
  }, [isEditing, boardLink, linkedOrder]);
  const linesWithoutDo = rowsOrder && roundDoLines
    ? orderLinesWithoutDo(rowsOrder, orderEntries, [{ lines: roundDoLines.map((l, i) => ({ id: String(i), ...l })) }])
    : [];
  const openNewDoForRest = () => {
    if (!linkedOrder || !linesWithoutDo.length) return;
    const p = new URLSearchParams({ fromDispatch: '1', orderRef: linkedOrder.orderId, round: String(linkedOrder.round) });
    if (dispatchPlannedAt) p.set('plannedAt', dispatchPlannedAt);
    if (dispatchRemark.trim()) p.set('remark', dispatchRemark.trim());
    if (header.fulfilmentType === 'Self Pickup') p.set('fulfilment', 'self_pickup');
    p.set('lines', linesWithoutDo.map(l => l.seq).join(','));
    navigate(`/stock-movements/new-outward?${p.toString()}`);
  };

  // The whole DO for PDF / DOCX / Email — from the form as it is now, even
  // before Save. Line 1's fields are also on the top level for older readers;
  // generateOutwardPDF / downloadOutwardDOCX print every line in `lines`.
  // In Edit mode the rows hold the SAVED billing_name (see the load effect).
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const buildOutwardData = (): OutwardDO => {
    const doLines: OutwardDoLine[] = lines.map(l => ({
      whLotNo: l.lotNo.trim() || undefined,
      inwardDate: l.lotDate || undefined,
      productName: l.productName.trim(),
      productCode: l.productCode || undefined,
      billingName: l.billingName.trim() || undefined,
      numArticles: l.numArticles.trim() || undefined,
      packing: num(l.packing) ?? undefined,
      totalQty: lineTotal(l) ?? undefined,
      packagingType: l.packagingType || undefined,
      weightType: l.weightType || undefined,
    }));
    const first = doLines[0];
    return {
      id: movementId || '',
      type: 'outward',
      warehouse: isOtherWarehouse ? header.otherWarehouse.trim() : header.warehouse,
      ...first,
      doNumber: header.doNumber.trim() || undefined,
      doDate: header.doDate || undefined,
      partyName: header.partyName || undefined,
      otherParty: isOtherParty ? (header.otherParty.trim() || undefined) : undefined,
      transporter: header.transporter || undefined,
      otherTransporter: isOtherTransporter ? (header.otherTransporter.trim() || undefined) : undefined,
      fulfilmentType: header.fulfilmentType || undefined,
      note: header.note.trim() || undefined,
      created_by: user?.email ?? undefined,
      lines: doLines,
    };
  };

  // Cheap customer resolution for the Email modal — a Party Name that isn't
  // a customer just leaves the To field blank (expected fallback).
  const customer = data.customers.find(c => c.name === header.partyName);

  const handleGeneratePDF = async () => {
    const unit = data.units.find(u => u.is_default);
    await generateOutwardPDF(buildOutwardData(), customer, data.settings, data.signatories.find(s => s.is_default), unit, true);
  };

  const handleGenerateDOCX = async () => {
    const unit = data.units.find(u => u.is_default);
    await downloadOutwardDOCX(buildOutwardData(), customer, data.settings, data.signatories.find(s => s.is_default), unit);
  };

  // 2026-10-12: "Email to Client" only works on a saved DO.
  // 2026-10-26: a Delivery DO's email names its transporter, so it must be
  // SAVED — checked against the database, and the form must not hold unsaved
  // Transporter / Fulfilment Type changes.
  const openEmailModal = async () => {
    if (!movementId) { setError('Please save the outward entry first'); return; }
    setError('');
    const { data: saved, error: loadErr } = await supabase.from('stock_movements')
      .select('transporter, other_transporter, fulfilment_type').eq('id', movementId).maybeSingle();
    if (loadErr || !saved) { setError(`Could not check this DO: ${loadErr?.message || 'entry not found'}`); return; }
    const savedTransporter = outwardTransporterName({ transporter: saved.transporter, otherTransporter: saved.other_transporter });
    const formTransporter = outwardTransporterName({ transporter: header.transporter, otherTransporter: isOtherTransporter ? header.otherTransporter : '' });
    if ((saved.fulfilment_type || '') !== header.fulfilmentType || (header.fulfilmentType === 'Delivery' && savedTransporter !== formTransporter)) {
      setError('Please save your changes first.');
      return;
    }
    if (saved.fulfilment_type === 'Delivery' && !savedTransporter) {
      setTransporterError(true);
      setError('Please select a transporter and save first.');
      return;
    }
    setShowEmailModal(true);
  };

  // 2026-10-12: stamps email_sent_at after "Email to Client" succeeds.
  // 2026-11-03: on EVERY line of the DO (one email, one PDF), logged once.
  // 2026-10-16: a DO linked to a Board order also completes Dispatch Step 6
  // here (once every DO of the round is emailed).
  const markOutwardEmailSent = async () => {
    if (!movementId) return;
    const sentAt = new Date().toISOString();
    try {
      const ids = savedIds.length ? savedIds : [movementId];
      let q = supabase.from('stock_movements').update({ email_sent_at: sentAt }).eq('type', 'outward');
      q = header.doNumber ? q.eq('do_number', header.doNumber) : q.in('id', ids);
      const { data: rows, error: updErr } = await q.select('id, do_number, fulfilment_type');
      if (updErr) throw updErr;
      if (!rows || rows.length === 0) throw new Error('entry not found');
      logActivity({
        module: 'stock_movements', recordId: movementId,
        recordLabel: `${rows[0].do_number || header.doNumber || movementId} · Outward · Email to Client sent${rows.length > 1 ? ` (${rows.length} products)` : ''}`,
        action: 'update', before: { email_sent_at: emailSentAt }, after: { email_sent_at: sentAt },
      });
      setEmailSentAt(sentAt);
      if (linkedOrder) {
        if (!canActOnDispatchBoard(user?.email) || isReadOnlyUser) {
          setEmailResult({ ok: false, msg: 'Email sent. Step 6 will be completed by MIS / Samata.' });
          return;
        }
        setEmailResult(stepResultNote(await markDispatchStepDone(linkedOrder, sentAt)));
        return;
      }
      navigate(outwardListPath(true, rows[0].fulfilment_type));
    } catch (err: any) {
      setError(`Email was sent, but it could not be recorded: ${err?.message || 'unknown error'}`);
    }
  };

  // The History Log's view of a DO: header once, one readable line per product.
  const doLogShape = (rows: any[]) => {
    const r0 = rows[0] || {};
    const shape: Record<string, any> = {
      do_number: r0.do_number, warehouse: r0.warehouse, do_date: r0.do_date, party_name: r0.party_name,
      transporter: r0.transporter, fulfilment_type: r0.fulfilment_type, note: r0.note,
    };
    rows.forEach((r, i) => {
      shape[`line_${i + 1}`] = `Lot ${r.wh_lot_no || '—'} · ${r.product_name || '—'} · ${r.billing_name || '—'} · ${r.num_articles || 0} × ${r.packing ?? '—'} = ${r.total_qty ?? '—'}`;
    });
    return shape;
  };

  const save = async () => {
    if (!isValid) { setError('Please select a Warehouse (DO Number is generated from it).'); return; }
    if (saveBlock) { setError(''); showToast('err', saveBlock); return; }
    if (!FULFILMENT_TYPES.includes(header.fulfilmentType)) {
      setFulfilmentError(true);
      setError('Please select Fulfilment Type (Delivery or Self Pickup).');
      return;
    }
    if (header.fulfilmentType === 'Delivery'
      && !outwardTransporterName({ transporter: header.transporter, otherTransporter: isOtherTransporter ? header.otherTransporter : '' })) {
      setTransporterError(true);
      setError('Please select a transporter for Delivery.');
      return;
    }
    setSaving(true);
    setError('');
    // 2026-09-19: activeDoer (the person acting right now), else the login.
    const actingEmail = activeDoer?.email ?? user?.email ?? null;
    const headerPayload = {
      warehouse: isOtherWarehouse ? header.otherWarehouse.trim() : header.warehouse,
      do_number: header.doNumber.trim(),
      do_date: header.doDate || null,
      party_name: header.partyName || null,
      other_party: isOtherParty ? (header.otherParty.trim() || null) : null,
      transporter: header.transporter || null,
      other_transporter: isOtherTransporter ? (header.otherTransporter.trim() || null) : null,
      fulfilment_type: header.fulfilmentType || null,
      note: header.note.trim() || null,
      // 2026-10-16: a DO made from the Board is linked to its order + round.
      order_id: fromDispatch ? orderRef : null,
      dispatch_round: fromDispatch ? dispatchRound : null,
    };
    const linesPayload = lines.map(l => ({
      wh_lot_no: l.lotNo.trim(),
      product_name: l.productName.trim(),
      // 2026-11-03: stored for Wada lines only (save_outward_do).
      product_code: l.productCode.trim() || null,
      billing_name: l.billingName.trim() || null,
      inward_date: l.lotDate || null,
      num_articles: l.numArticles.trim(),
      packing: l.packing.trim(),
      weight_type: l.weightType || null,
      packaging_type: l.packagingType || null,
      order_line_seq: l.orderLineSeq,
    }));
    const { error: saveErr, result } = await saveOutwardDoWithRetry(
      isEditing ? movementId : null, headerPayload, linesPayload, actingEmail,
      doNumber => setHeader(h => ({ ...h, doNumber })),
    );
    if (saveErr || !result) {
      // Nothing was saved and no stock changed (one database transaction).
      setError(friendlyStockError(saveErr) || 'Failed to save the DO.');
      setSaving(false);
      return;
    }
    const products = lines.map(l => l.productName.trim()).filter(Boolean).join(', ');
    logActivity({
      module: 'stock_movements', recordId: result.ids[0],
      recordLabel: `DO ${result.do_number || '—'} · ${products} · Lot ${lines.map(l => l.lotNo.trim() || '—').join(', ')}`,
      action: isEditing ? 'update' : 'insert',
      before: isEditing ? doLogShape(result.before) : undefined,
      after: doLogShape(result.after),
    });
    await afterSave(result.ids[0]);
    setSaving(false);
  };

  if (loadingMovement) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-g400">
        <Loader2 size={28} className="animate-spin" />
        <div className="font-mono text-[10px] font-bold tracking-[2px] uppercase">Loading Outward Entry…</div>
      </div>
    );
  }

  // 2026-10-06: a login that isn't allowed to act on the board could still
  // type this URL — no form for them, just a way back.
  if (fromDispatch && (!canActOnDispatchBoard(user?.email) || isReadOnlyUser)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="font-serif text-xl text-blk">You don't have permission to issue DO from Dispatch</div>
        <Button variant="secondary" onClick={goBack}>Back to Dispatch board</Button>
      </div>
    );
  }

  // 2026-10-16: the order this DO belongs to (header line).
  const headerOrder = rowsOrder || (boardLink ? data.orders.find(o => o.id === orderRef) : undefined);
  // A saved DO linked to a Board order that isn't emailed yet.
  const awaitingEmail = isEditing && !!linkedOrder && !emailSentAt && !emailResult;
  const canNewDo = isEditing && boardLink && !!linkedOrder && linesWithoutDo.length > 0
    && canActOnDispatchBoard(user?.email) && !isReadOnlyUser;
  const cellInput = 'w-full font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[3px] px-[7px] py-[6px] outline-none focus:border-red-mrt focus:ring-[2px] focus:ring-red-lt';
  const cellLocked = `${cellInput} bg-g100 text-g600 cursor-not-allowed`;
  const thCls = 'font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g500 text-left px-[5px] py-[6px] whitespace-nowrap border-b border-g200';

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">{boardLink ? 'Dispatch · Step 06 · Issue DO' : 'Stock Movements Module'}</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              {isEditing ? <>Edit <em className="italic text-red-mrt">Outward Entry</em></> : <>Log <em className="italic text-red-mrt">New Outward</em></>}
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">
              {isEditing ? 'Update a previously logged Delivery Order stock outward.' : 'Record a Delivery Order stock outward — one warehouse, one or more products.'}
            </p>
            {(boardLink || linkedOrder) && headerOrder && (
              <p className="text-[12px] text-blk mt-1 font-semibold">
                <span className="font-mono">{headerOrder.soNumber || headerOrder.id}</span> · {headerOrder.cust}
              </p>
            )}
          </div>
          <Button variant="secondary" onClick={goBack}>Back</Button>
        </div>
        {/* 2026-10-16: Step 6 completes when the DO is EMAILED, not on save. */}
        {awaitingEmail && (
          <div className="mt-3 border border-amber-300 bg-amber-50 text-amber-800 rounded-[4px] px-3 py-2 text-[12.5px] font-semibold">
            DO {header.doNumber || '—'} saved. Click Email to Client to complete Step 6.
          </div>
        )}
        {/* Opened from the Board after Step 6 was undone — the DO was already emailed once. */}
        {boardLink && isEditing && !!linkedOrder && !!emailSentAt && !emailResult && (
          <div className="mt-3 border border-amber-300 bg-amber-50 text-amber-800 rounded-[4px] px-3 py-2 text-[12.5px] font-semibold">
            DO {header.doNumber || '—'} was emailed {fmtIST(new Date(emailSentAt), 'dd-MMM-yyyy hh:mm a')}. Click Email to Client again to complete Step 6.
          </div>
        )}
        {emailResult && (
          <div className={`mt-3 border rounded-[4px] px-3 py-2 text-[12.5px] font-semibold flex flex-wrap items-center gap-2 ${emailResult.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
            <span className="flex-1 min-w-[200px]">{emailResult.msg}</span>
            {emailResult.retry && (
              <Button size="sm" variant="secondary" onClick={retryDispatchStep} disabled={saving}>{saving ? 'Trying…' : 'Try again'}</Button>
            )}
            <Button size="sm" variant="primary" onClick={() => navigate(DISPATCH_BOARD_PATH)}>Back to Board</Button>
          </div>
        )}
        {/* 2026-11-03: products of this order not on any DO of this round yet
            (e.g. stock in another warehouse) — they need their own DO. */}
        {canNewDo && (
          <div className="mt-3 border border-g200 bg-g50 rounded-[4px] px-3 py-2 text-[12.5px] flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[200px] text-g700">
              Not on any DO yet: <strong className="text-blk">{linesWithoutDo.map(l => `${l.desc || 'Item'} (${l.left})`).join(', ')}</strong>
            </span>
            <Button size="sm" variant="secondary" onClick={openNewDoForRest}>+ New DO (another warehouse)</Button>
          </div>
        )}
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[14px]">
          <div className={cardCls}>
            <div className={sectionHeaderCls}>DO Details</div>
            <div className="grid grid-cols-4 gap-[12px]">
              <div>
                <label className={labelCls}>Warehouse <span className="text-red-mrt">*</span></label>
                <select className={selectCls} value={header.warehouse} onChange={e => onWarehouseChange(e.target.value)}>
                  <option value="">Select...</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                  {header.warehouse && !WAREHOUSES.includes(header.warehouse) && <option value={header.warehouse}>{header.warehouse}</option>}
                </select>
                {isWada && <p className="text-[11px] text-g500 mt-1">Wada: not linked to stock — type every product field.</p>}
              </div>
              {isOtherWarehouse && (
                <div>
                  <label className={labelCls}>Other Warehouse <span className="text-red-mrt">*</span></label>
                  <input className={inputCls} value={header.otherWarehouse} onChange={setH('otherWarehouse')} />
                </div>
              )}
              <div>
                <label className={labelCls}>DO Number <span className="text-red-mrt">*</span></label>
                {/* 2026-09-09: auto-generated from the Warehouse, never typed;
                    never changes once saved. */}
                <input className={`${inputCls} bg-g100 text-g600 cursor-not-allowed`} value={header.doNumber} readOnly />
              </div>
              <div>
                <label className={labelCls}>DO Date</label>
                <input type="date" className={inputCls} value={header.doDate} onChange={setH('doDate')} />
              </div>
            </div>
          </div>

          <div className={cardCls}>
            <div className={sectionHeaderCls}>Products</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[1100px]">
                <thead>
                  <tr>
                    <th className={thCls}>#</th>
                    <th className={thCls}>Lot No *</th>
                    <th className={thCls}>Lot Date</th>
                    <th className={thCls}>Product Name{isWada && ' *'}</th>
                    <th className={thCls}>Product Code</th>
                    <th className={thCls}>Billing Name{isWada && ' *'}</th>
                    <th className={thCls}>No of Barrels *</th>
                    <th className={thCls}>Packing{isWada && ' *'}</th>
                    <th className={thCls}>Total Qty</th>
                    <th className={thCls}>Packing Type</th>
                    <th className={thCls}>MOU</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const info = rowInfos[idx];
                    const lot = info.lot;
                    // 2026-11-03 (UI cleanup, user's rule): no text under the
                    // row. A real problem turns its box red with the message as
                    // the box's tooltip; stock / order figures are tooltips too.
                    const bad = (f: RowInfo['problemField']) => !!info.problem && !info.problemSoft && info.problemField === f;
                    const tip = (f: RowInfo['problemField'], normal?: string) => (info.problem && info.problemField === f ? info.problem : normal) || undefined;
                    const redCls = 'border-red-mrt ring-[2px] ring-red-lt';
                    const fromLot = lot ? `From lot ${lot.lotNo}` : undefined;
                    // 2026-11-04: the row's order-line label (tooltip — no text under rows).
                    const lineTip = rowsOrder && l.orderLineSeq != null
                      ? `Order line: ${orderLineLabel(rowsOrder, l.orderLineSeq, orderRemaining.get(l.orderLineSeq) ?? 0)}` : undefined;
                    const stockTip = [
                      lot && (isEditing && !l.lotTouched
                        ? `Available (after this DO): ${lot.available}`
                        : `Available at ${header.warehouse} (Lot ${lot.lotNo}): ${info.maxBarrels ?? lot.available} barrels`),
                      info.orderNeeds !== null && `Order needs (remaining): ${info.orderNeeds} barrels`,
                      lineTip,
                      info.lineOnDo && `This DO (rows ${info.lineOnDo.rows.join(' + ')}): ${info.lineOnDo.sum} barrels`,
                    ].filter(Boolean).join(' · ');
                    const packingTip = info.packingMismatch && lot
                      ? `Order packing is ${info.orderPacking} per barrel, but lot ${lot.lotNo} is ${lot.packing} — the lot's packing is used.`
                      : fromLot;
                    const totalTip = isEditing && !l.lotTouched && l.savedTotal != null && info.total !== null && Number(l.savedTotal) !== info.total
                      ? `Recalculated from barrels × packing (saved: ${String(l.savedTotal)})` : '= No of Barrels × Packing';
                    return (
                      <tr key={l.key} className="align-top border-b border-g100">
                        <td className="px-[5px] py-[11px] font-mono text-[11px] text-g500">{idx + 1}</td>
                        <td className="px-[5px] py-[5px] w-[110px]">
                          <input className={`${cellInput} ${bad('lot') ? redCls : ''}`} value={l.lotNo} title={tip('lot', fromLot)}
                            onChange={e => updateLine(l.key, { lotNo: e.target.value, lotTouched: true, userBarrelsKey: null })} />
                        </td>
                        <td className="px-[5px] py-[5px] w-[130px]">
                          <input type="date" className={cellInput} value={l.lotDate} onChange={e => updateLine(l.key, { lotDate: e.target.value })} />
                        </td>
                        <td className="px-[5px] py-[5px] min-w-[170px]">
                          {/* 2026-10-16: Product Name / Code always come from the lot.
                              2026-11-03: Wada (no lot) — every field is typed. */}
                          {isWada
                            ? <input className={`${cellInput} ${bad('product') ? redCls : ''}`} value={l.productName} title={tip('product')}
                                onChange={e => updateLine(l.key, { productName: e.target.value })} />
                            : <input className={cellLocked} value={l.productName} readOnly title={fromLot} />}
                        </td>
                        <td className="px-[5px] py-[5px] w-[100px]">
                          {isWada
                            ? <input className={cellInput} value={l.productCode} onChange={e => updateLine(l.key, { productCode: e.target.value })} />
                            : <input className={cellLocked} value={l.productCode} readOnly title={fromLot} />}
                        </td>
                        <td className="px-[5px] py-[5px] min-w-[150px]">
                          {/* 2026-10-16: editable. From the Board it is the order line's product name. */}
                          <input className={`${cellInput} ${bad('billing') ? redCls : ''}`} value={l.billingName} title={tip('billing', lineTip)}
                            onChange={e => onBillingChange(l, e.target.value)} />
                        </td>
                        <td className="px-[5px] py-[5px] w-[90px]">
                          <input type="number" className={`${cellInput} ${bad('barrels') ? redCls : ''}`} value={l.numArticles} title={tip('barrels', stockTip)}
                            onChange={e => updateLine(l.key, { numArticles: e.target.value, userBarrelsKey: lotKeyOf(header.warehouse, l.lotNo) })} />
                        </td>
                        <td className="px-[5px] py-[5px] w-[75px]">
                          {isWada
                            ? <input className={`${cellInput} ${bad('packing') ? redCls : ''}`} value={l.packing} title={tip('packing')}
                                onChange={e => updateLine(l.key, { packing: e.target.value })} />
                            : <input className={`${cellLocked} ${bad('packing') ? redCls : ''}`} value={l.packing} readOnly title={tip('packing', packingTip)} />}
                        </td>
                        <td className="px-[5px] py-[5px] w-[95px]">
                          <input className={`${cellLocked} font-semibold`} value={info.total === null ? '' : String(info.total)} readOnly title={totalTip} />
                        </td>
                        <td className="px-[5px] py-[5px] w-[130px]">
                          {isWada
                            ? <input className={cellInput} value={l.packagingType} onChange={e => updateLine(l.key, { packagingType: e.target.value })} />
                            : <input className={cellLocked} value={l.packagingType} readOnly title={l.packagingType} />}
                        </td>
                        <td className="px-[5px] py-[5px] w-[60px]">
                          {isWada
                            ? <select className={cellInput} value={l.weightType} onChange={e => updateLine(l.key, { weightType: e.target.value })}>
                                <option value=""></option>
                                {MOU_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                {l.weightType && !MOU_OPTIONS.includes(l.weightType) && <option value={l.weightType}>{l.weightType}</option>}
                              </select>
                            : <input className={cellLocked} value={l.weightType} readOnly />}
                        </td>
                        <td className="px-[5px] py-[9px] w-[28px]">
                          <button type="button" onClick={() => removeLine(l.key)} disabled={lines.length <= 1}
                            title={lines.length <= 1 ? 'A DO needs at least one product' : 'Remove this product'}
                            className="p-1 text-g400 hover:text-red-mrt disabled:opacity-30 disabled:cursor-not-allowed">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <Button size="sm" variant="secondary" onClick={addLine}><Plus size={12} className="mr-1 inline" /> Add product</Button>
              {/* 2026-11-03: which order line the new row is for — also one
                  already on the DO (same product from another lot). */}
              {rowsOrder && (
                <label className="flex items-center gap-2 text-[11.5px] text-g600">
                  for
                  <select className="font-sans text-[12px] text-blk bg-white border border-g300 rounded-[3px] px-[6px] py-[4px] outline-none focus:border-red-mrt"
                    value={addForSeq} onChange={e => setAddForSeq(e.target.value)}>
                    <option value="">{isWada ? 'the line its Billing Name matches' : "the line matching the lot's product"}</option>
                    {rowsOrder.items.map(i => (
                      <option key={i.seq} value={String(i.seq)}>
                        {orderLineLabel(rowsOrder, i.seq, orderRemaining.get(i.seq) ?? 0)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="ml-auto text-[12px] text-g600">
                Total: <strong className="text-blk">{totalBarrels} barrel{totalBarrels === 1 ? '' : 's'}</strong>
                <span className="mx-2 text-g300">·</span>
                <strong className="text-blk">{totalQty.toLocaleString('en-IN')}</strong> total quantity
                <span className="mx-2 text-g300">·</span>
                {lines.length} product{lines.length === 1 ? '' : 's'}
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
                  value={header.partyName}
                  onChange={v => setHeader(h => ({ ...h, partyName: v, transporter: transporterByParty[v] || h.transporter, fulfilmentType: fulfilmentTypeByParty[v] || h.fulfilmentType }))}
                />
              </div>
              {isOtherParty && (
                <div>
                  <label className={labelCls}>Other Party</label>
                  <input className={inputCls} value={header.otherParty} onChange={setH('otherParty')} />
                </div>
              )}
              <div>
                <label className={labelCls}>Transporter{header.fulfilmentType === 'Delivery' && <> <span className="text-red-mrt">*</span></>}</label>
                <SearchableCombobox className={`${inputCls} ${transporterError && !isOtherTransporter ? 'border-red-mrt' : ''}`} options={transporterOptions} value={header.transporter}
                  onChange={v => { setTransporterError(false); setHeader(h => ({ ...h, transporter: v })); }} />
                {transporterError && <p className="text-red-mrt text-[11px] mt-1">Please select a transporter for Delivery.</p>}
              </div>
              {isOtherTransporter && (
                <div>
                  <label className={labelCls}>Other Transporter{header.fulfilmentType === 'Delivery' && <> <span className="text-red-mrt">*</span></>}</label>
                  <input className={`${inputCls} ${transporterError ? 'border-red-mrt' : ''}`} value={header.otherTransporter}
                    onChange={e => { setTransporterError(false); setH('otherTransporter')(e); }} />
                </div>
              )}
              <div>
                <label className={labelCls}>Fulfilment Type <span className="text-red-mrt">*</span></label>
                {/* 2026-10-12: required, Delivery / Self Pickup only. An old
                    entry saved as "Both" still shows its value here, but
                    Save asks for one of the two. */}
                <select
                  className={`${selectCls} ${fulfilmentError ? 'border-red-mrt' : ''}`}
                  value={header.fulfilmentType}
                  onChange={e => { setFulfilmentError(false); setTransporterError(false); setError(''); setH('fulfilmentType')(e); }}
                >
                  <option value="">Select...</option>
                  {FULFILMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  {header.fulfilmentType && !FULFILMENT_TYPES.includes(header.fulfilmentType) && (
                    <option value={header.fulfilmentType}>{header.fulfilmentType}</option>
                  )}
                </select>
                {fulfilmentError && <p className="text-red-mrt text-[11px] mt-1">Please select Delivery or Self Pickup.</p>}
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls}>Note</label>
              <textarea className={`${inputCls} min-h-[68px]`} value={header.note} onChange={setH('note')} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-[14px_20px] bg-g100 border-t border-g200 sticky bottom-0">
        {/* 2026-11-03 (UI cleanup): clickable even with a problem — save()
            then shows the first problem as a toast and saves nothing. */}
        <Button variant="primary" onClick={() => save()} disabled={saving}
          title={saveBlock || undefined}>
          {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Outward Entry'}
        </Button>
        <button type="button" onClick={handleGeneratePDF} disabled={saving}
          className="bg-g700 text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-blk disabled:opacity-50 flex items-center gap-2">
          <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M4 2v12h8V6l-4-4H4zm1 1h2v3h2V3h1.172L11 3.828V13H5V3zm2 6v3h2v-3H7z" /></svg>
          PDF
        </button>
        <button type="button" onClick={handleGenerateDOCX} disabled={saving}
          className="bg-blue-600 text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M4 2v12h8V6l-4-4H4zm1 1h2v3h2V3h1.172L11 3.828V13H5V3zm2 6v3h2v-3H7z" /></svg>
          DOCX
        </button>
        <button type="button" onClick={openEmailModal} disabled={saving}
          className="bg-blk text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-g700 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 flex items-center gap-2">
          <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M2 4h12v8H2zM3 5l5 3.5L13 5v-.5L8 8 3 4.5V5z" /></svg>
          Email to Client
        </button>
        <Button variant="secondary" onClick={goBack} disabled={saving}>Cancel</Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {error && <div className="ml-4 text-red-mrt text-[11px] font-bold max-w-[420px]">{error}</div>}
      </div>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 max-w-[560px] flex items-start gap-2 px-4 py-2.5 rounded-[4px] shadow-lg text-[12.5px] font-medium text-white animate-in slide-in-from-bottom-2 ${toast.type === 'ok' ? 'bg-sW' : 'bg-red-mrt'}`}>
          {toast.msg}
        </div>
      )}

      {showEmailModal && (
        <SendEmailModal
          mode="outward"
          doc={buildOutwardData()}
          customer={customer}
          settings={data.settings}
          defaultSignatory={data.signatories.find(s => s.is_default)}
          onClose={() => setShowEmailModal(false)}
          onSent={() => { setShowEmailModal(false); markOutwardEmailSent(); }}
        />
      )}
    </div>
  );
}
