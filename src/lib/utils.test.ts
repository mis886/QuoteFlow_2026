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
import { getCurrentQuoteItems, getEffectiveTotals, getEffectiveTotalsUpToRound } from './utils';
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
