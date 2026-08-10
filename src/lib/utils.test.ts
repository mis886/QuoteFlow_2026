// Regression test for negotiation-round price resolution.
// No test framework is configured in this project (no vitest/jest) — this is
// a standalone script using Node's built-in assert, runnable via:
//   npx tsx src/lib/utils.test.ts
//
// Repro (based on quote HTP-2026-413): a quote with two line items, where
// round 1 revises both items' prices, and round 2 revises only one of them.
// The item round 2 doesn't touch must keep round 1's price, not reset to
// the original — and subtotal/GST/grand total must be computed from those
// corrected per-item prices.

import assert from 'node:assert/strict';
import { getCurrentQuoteItems, getEffectiveTotals, getEffectiveTotalsUpToRound, getEffectiveItemsUpToRound, nameTier, normalizeSearchText } from './utils';
import type { QuoteItem, NegotiationRound } from './types';

const items: QuoteItem[] = [
  { seq: 1, desc: 'Alpha Pinene', mat: '', qty: 10, uom: 'kg', hsn: '29021900', unitPrice: 10, gst: 18, total: 100 },
  { seq: 2, desc: 'Anthamber Residue', mat: '', qty: 20, uom: 'kg', hsn: '29021900', unitPrice: 30, gst: 18, total: 600 },
];

const negotiations: NegotiationRound[] = [
  {
    round: 1,
    date: '2026-08-01',
    requested_by: 'customer',
    doer: 'test',
    created_at: '2026-08-01T00:00:00Z',
    items: [
      { seq: 1, desc: 'Alpha Pinene', hsn: '29021900', qty: 10, gst: 18, original_unit_price: 10, revised_unit_price: 20, discount_pct: null },
      { seq: 2, desc: 'Anthamber Residue', hsn: '29021900', qty: 20, gst: 18, original_unit_price: 30, revised_unit_price: 10, discount_pct: null },
    ],
  },
  {
    round: 2,
    date: '2026-08-05',
    requested_by: 'customer',
    doer: 'test',
    created_at: '2026-08-05T00:00:00Z',
    items: [
      // Only seq 1 revised again in round 2 — seq 2 is not mentioned at all.
      { seq: 1, desc: 'Alpha Pinene', hsn: '29021900', qty: 10, gst: 18, original_unit_price: 20, revised_unit_price: 50, discount_pct: null },
    ],
  },
];

const quote = { items, negotiations, curr: 'INR', insurance: 0 };

// seq 1: latest revision is round 2's ₹50.
// seq 2: round 2 never mentions it, so it must keep round 1's ₹10 — NOT reset to the original ₹30.
const effectiveItems = getCurrentQuoteItems(items, negotiations);
const seq1 = effectiveItems.find(i => i.seq === 1)!;
const seq2 = effectiveItems.find(i => i.seq === 2)!;

assert.equal(seq1.unitPrice, 50, `seq 1 (Alpha Pinene) should be ₹50 (round 2's revision), got ₹${seq1.unitPrice}`);
assert.equal(seq2.unitPrice, 10, `seq 2 (Anthamber Residue) should be ₹10 (round 1's revision, carried forward), got ₹${seq2.unitPrice}`);

// Subtotal = (50 × 10) + (10 × 20) = 500 + 200 = ₹700, NOT (50×10)+(30×20)=₹1,100.
const { subTotal, gstTotal, grandTotal } = getEffectiveTotals(quote);
assert.equal(subTotal, 700, `Subtotal should be ₹700.00, got ₹${subTotal}`);
assert.notEqual(subTotal, 1100, 'Subtotal must not be the wrong ₹1,100.00 (i.e. seq 2 must not have reset to its original price)');

// GST/grand total must be derived from the corrected ₹700 subtotal, not the wrong ₹1,100 one.
const expectedGst = 700 * 0.18; // single GST rate across both items in this fixture
const expectedGrand = Math.round(700 + expectedGst);
assert.equal(gstTotal, expectedGst, `GST total should be computed from the ₹700 subtotal (expected ${expectedGst}), got ${gstTotal}`);
assert.equal(grandTotal, expectedGrand, `Grand total should be ₹${expectedGrand} (from the ₹700 subtotal), got ₹${grandTotal}`);

console.log('PASS: negotiation round price resolution — seq 2 correctly carries forward round 1\'s revised price');
console.log(`  seq 1 = ₹${seq1.unitPrice}, seq 2 = ₹${seq2.unitPrice}`);
console.log(`  Subtotal = ₹${subTotal.toFixed(2)}, GST = ₹${gstTotal.toFixed(2)}, Grand Total = ₹${grandTotal.toFixed(2)}`);

// ── Per-round "running total as of this round" (each round's summary box on
// the quote edit page) ──────────────────────────────────────────────────────
// Round 1 touches every item on the quote, so "as of round 1" is just round
// 1's own items: (20×10) + (10×20) = 200 + 200 = ₹400.
const round1Totals = getEffectiveTotalsUpToRound(quote, 1);
assert.equal(round1Totals.subTotal, 400, `Round 1's running total should be ₹400.00, got ₹${round1Totals.subTotal}`);

// Round 2 only revises seq 1 — "as of round 2" must still include seq 2 at
// its round-1-revised ₹10, not just round 2's own touched-items subset
// (which would wrongly total ₹500 — Alpha Pinene only, Anthamber dropped).
const round2Totals = getEffectiveTotalsUpToRound(quote, 2);
assert.equal(round2Totals.subTotal, 700, `Round 2's running total should be ₹700.00, got ₹${round2Totals.subTotal}`);
assert.notEqual(round2Totals.subTotal, 500, 'Round 2\'s running total must not be the wrong ₹500.00 (i.e. must not silently drop seq 2 just because round 2 didn\'t mention it)');
// "As of the latest round" must agree with the plain "current" total.
assert.equal(round2Totals.subTotal, subTotal, 'getEffectiveTotalsUpToRound at the latest round number should match getEffectiveTotals');

console.log('PASS: per-round running totals — round 1 = ₹400.00, round 2 = ₹700.00 (not ₹500.00)');

// ── "Add Negotiation Round" form's baseline (getCurrentQuoteItems, not
// quote.items) ──────────────────────────────────────────────────────────────
// NegotiationRoundForm seeds its editable rows — and therefore its "Unit
// Rate" reference column, its live preview total, and the original_unit_price
// it saves onto the new round — from getCurrentQuoteItems(quote.items,
// quote.negotiations), not from quote.items directly. Round 3 below revises
// both items down to ₹1 each, mirroring HTP-2026-413: opening a new round
// after that must show both items' current price as ₹1 (not the original
// ₹10/₹30), and the "preview — not saved" total (nothing ticked yet) must
// equal round 3's own running total of ₹30.00, not ₹700.00.
const round3: NegotiationRound = {
  round: 3,
  date: '2026-08-08',
  requested_by: 'customer',
  doer: 'test',
  created_at: '2026-08-08T00:00:00Z',
  items: [
    { seq: 1, desc: 'Alpha Pinene', hsn: '29021900', qty: 10, gst: 18, original_unit_price: 50, revised_unit_price: 1, discount_pct: null },
    { seq: 2, desc: 'Anthamber Residue', hsn: '29021900', qty: 20, gst: 18, original_unit_price: 10, revised_unit_price: 1, discount_pct: null },
  ],
};
const quoteAfterRound3 = { items, negotiations: [...negotiations, round3], curr: 'INR', insurance: 0 };

// This is exactly what NegotiationRoundForm's itemRows seed calls.
const newRoundBaseline = getCurrentQuoteItems(quoteAfterRound3.items, quoteAfterRound3.negotiations);
const baselineSeq1 = newRoundBaseline.find(i => i.seq === 1)!;
const baselineSeq2 = newRoundBaseline.find(i => i.seq === 2)!;

assert.equal(baselineSeq1.unitPrice, 1, `New round's baseline Unit Rate for Alpha Pinene should be ₹1 (current effective price), got ₹${baselineSeq1.unitPrice}`);
assert.equal(baselineSeq2.unitPrice, 1, `New round's baseline Unit Rate for Anthamber Residue should be ₹1 (current effective price), got ₹${baselineSeq2.unitPrice}`);
assert.notEqual(baselineSeq1.unitPrice, 10, 'New round baseline must not fall back to the quote\'s original ₹10 for Alpha Pinene');
assert.notEqual(baselineSeq2.unitPrice, 30, 'New round baseline must not fall back to the quote\'s original ₹30 for Anthamber Residue');

// The live "preview — not saved" total with nothing ticked must match round
// 3's own running total (₹30.00), not the wrong ₹700.00 the original-price
// baseline would have produced.
const newRoundPreviewTotals = getEffectiveTotals(quoteAfterRound3);
assert.equal(newRoundPreviewTotals.subTotal, 30, `New round's unedited preview Subtotal should be ₹30.00, got ₹${newRoundPreviewTotals.subTotal}`);
assert.notEqual(newRoundPreviewTotals.subTotal, 700, 'New round preview must not show the wrong ₹700.00 (i.e. must not be seeded from the quote\'s original prices)');
assert.equal(newRoundPreviewTotals.subTotal, getEffectiveTotalsUpToRound(quoteAfterRound3, 3).subTotal, 'New round\'s unedited preview must match round 3\'s own running total');

console.log('PASS: new-round form baseline — Unit Rate ₹1/₹1 (current effective price), preview Subtotal ₹30.00 (not ₹700.00)');

// ── NegotiationRoundDetail's saved-round table must show a row per
// as-of-round item, not per round.items entry ───────────────────────────────
// Round 4 below (mirroring HTP-2026-413) only touches Alpha Pinene (revised
// to ₹100) — round.items has length 1 — but Anthamber Residue, carried
// forward from round 3's ₹1 revision, must still be represented so the
// visible rows reconcile with the ₹1,020.00 total shown below the table
// (₹1,000 Alpha Pinene + ₹20 Anthamber Residue).
const round4: NegotiationRound = {
  round: 4,
  date: '2026-08-09',
  requested_by: 'customer',
  doer: 'test',
  created_at: '2026-08-09T00:00:00Z',
  items: [
    { seq: 1, desc: 'Alpha Pinene', hsn: '29021900', qty: 10, gst: 18, original_unit_price: 1, revised_unit_price: 100, discount_pct: null },
  ],
};
const quoteAfterRound4 = { items, negotiations: [...negotiations, round3, round4], curr: 'INR', insurance: 0 };

// This is exactly what NegotiationRoundDetail's table now renders one row per.
const round4AsOfItems = getEffectiveItemsUpToRound(quoteAfterRound4, 4);
assert.equal(round4AsOfItems.length, quoteAfterRound4.items.length, `Round 4's rendered row count should match the full item set (${quoteAfterRound4.items.length}), not round.items.length (${round4.items.length})`);
assert.notEqual(round4AsOfItems.length, round4.items.length, 'Round 4 must not render only round.items.length rows — that drops carried-forward Anthamber Residue');

const round4Seq2 = round4AsOfItems.find(i => i.seq === 2)!;
assert.equal(round4Seq2.unitPrice, 1, `Carried-forward Anthamber Residue in round 4's table should show ₹1 (round 3's revision), got ₹${round4Seq2.unitPrice}`);

const round4Totals = getEffectiveTotalsUpToRound(quoteAfterRound4, 4);
assert.equal(round4Totals.subTotal, 1020, `Round 4's running total should be ₹1,020.00 (₹1,000 Alpha Pinene + ₹20 Anthamber Residue), got ₹${round4Totals.subTotal}`);

console.log('PASS: round 4 table row count matches asOfItems.length (2), not round.items.length (1) — reconciles with ₹1,020.00 total');

// ── nameTier: exact ref/PO/ID match ranks with exact name match, above loose
// name matches ────────────────────────────────────────────────────────────
// An order whose customer name only loosely contains the query, but whose PO
// number is an exact hit, must rank at the very top tier (0) — same as an
// exact customer-name match — not buried below it.
assert.equal(nameTier('Acme Corp', 'acme corp'), 0, 'Exact (case-insensitive) name match should be tier 0');
assert.equal(nameTier('Beta Industries', 'PO-2024-777', ['PO-2024-777']), 0, 'Exact match on an extra ref (PO number) should be tier 0 even though the name has nothing to do with the query');
assert.equal(nameTier('Acme Corporation', 'acme'), 1, 'Name starting with the query (no exact match) should be tier 1');
assert.equal(nameTier('Global Acme Traders', 'acme'), 2, 'Name containing the query elsewhere should be tier 2');
assert.equal(nameTier('Unrelated Customer', 'acme'), 3, 'No match at all (fallback, e.g. matched only via item description) should be tier 3');
// Existing Customers.tsx call style (no extra list) must keep working.
assert.equal(nameTier('Acme Corp', 'acme corp', []), 0, 'nameTier must still work with an explicit empty extra-match list');

console.log('PASS: nameTier — exact ref/PO/ID match (tier 0) ranks above starts-with (1), contains (2), and fallback (3)');

// ── normalizeSearchText + nameTier: punctuation-separated names match an
// unpunctuated query ─────────────────────────────────────────────────────
// "A.K BHAYANI & SONS" collapses to "akbhayanisons" (periods, spaces, and
// "&" all stripped) — a search for "ak" should therefore find it, ranked in
// the top (starts-with) tier, not buried in the fallback tier just because
// the raw strings "ak" and "a.k bhayani & sons" don't literally line up.
assert.equal(normalizeSearchText('A.K BHAYANI & SONS'), 'akbhayanisons', `normalizeSearchText('A.K BHAYANI & SONS') should be 'akbhayanisons', got '${normalizeSearchText('A.K BHAYANI & SONS')}'`);
assert.equal(normalizeSearchText('V.D.H.ORGANICS (P) LTD.'), 'vdhorganicspltd', `normalizeSearchText('V.D.H.ORGANICS (P) LTD.') should be 'vdhorganicspltd', got '${normalizeSearchText('V.D.H.ORGANICS (P) LTD.')}'`);

assert.equal(nameTier('A.K BHAYANI & SONS', 'ak'), 1, `"A.K BHAYANI & SONS" should rank in the starts-with tier (1) for query "ak" once punctuation is normalized away, got tier ${nameTier('A.K BHAYANI & SONS', 'ak')}`);
assert.notEqual(nameTier('A.K BHAYANI & SONS', 'ak'), 3, '"A.K BHAYANI & SONS" must not fall back to tier 3 for query "ak" — that was the bug being fixed');
assert.equal(nameTier('V.D.H.ORGANICS (P) LTD.', 'vdh'), 1, `"V.D.H.ORGANICS (P) LTD." should rank in the starts-with tier (1) for query "vdh", got tier ${nameTier('V.D.H.ORGANICS (P) LTD.', 'vdh')}`);

// exactMatches (ref/PO/ID tier-0 behavior from the previous fix) is compared
// on raw lowercased values, not normalized — must still pass unchanged.
assert.equal(nameTier('Beta Industries', 'PO-2024-777', ['PO-2024-777']), 0, 'exactMatches tier-0 behavior from the previous fix must still work unchanged after normalization was added to the name-based tiers');

console.log('PASS: normalizeSearchText + nameTier — punctuation-separated names ("A.K BHAYANI & SONS" -> "akbhayanisons") match an unpunctuated query, exactMatches tier-0 unaffected');
