# DO from the Dispatch board: which order line it is for

Applies to a NEW Delivery Order opened from the Dispatch board (Step 6 →
`/stock-movements/new-outward?fromDispatch=1&orderRef=…`). Plain Stock
Movements → New Outward and editing an existing DO (`?movementId=`) are not
affected. Rule added 2026-11-03.

## The rule

The lot's product must be in the order, and the DO uses THAT order line.

1. When Warehouse + Lot No find the lot, the lot's product name is turned into
   its billing name (Stock Inward catalogue, e.g. "Beta Pinene 95%" →
   "Beta Pinene"; a lot not in the catalogue uses its own name).
2. Both names are compared with letters and digits only, lower case. A line
   matches when the names are equal; if no line is equal, a line matches when
   one name starts with the other ("betapinene" / "betapinene95").
3. Lines with barrels still left win. If more than one matches, the line
   already picked stays, else the first.
4. The form switches to that line exactly like the "Product (from order)"
   picker: Billing Name = the line's product name as in the order, and
   "Order needs (remaining)", the packing note and the barrels check follow
   it. Product Name / Code, Packing, Packing Type and MOU stay the lot's.
5. No line matches → a red note under Product Name ("Lot … is … — this
   product is not in order SO-…. Order has: …") and Save is blocked.
6. Picking a different line by hand in "Product (from order)" that isn't the
   lot's product shows a red note too and blocks Save; picking the right
   line clears it.

Code: `src/lib/doOrderLine.ts` (matching) and `src/pages/NewStockOutward.tsx`
(Lot No auto-fill, `lotLineMismatch`, `saveBlock`).

## Example

SO-2026-789 / ORD-2026-871: line 1 Alpha Pinene (20 barrels, packing 175),
line 2 Beta Pinene (40 barrels, packing 200).

- Swastik + lot 202020 (Beta Pinene 95%) → Beta Pinene, order needs 40, no
  packing note.
- Balaji + lot 101010 (Alpha Pinene 95% -ve 24) → Alpha Pinene, order needs 20.
