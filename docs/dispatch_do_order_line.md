# Delivery Orders: one DO, many products, and which order line each is for

## One DO, many products (user decision 2026-11-03)

One DO = ONE warehouse + ONE DO number + ONE OR MORE product lines. It is
saved, printed (PDF / DOCX) and emailed to the customer as ONE document in
ONE email. Products in a different warehouse need a separate DO (a different
DO number), because the DO number prefix comes from the warehouse
(B- / S- / R- / H-).

### Storage

Still ONE `stock_movements` row PER PRODUCT LINE, so Stock Summary, the Stock
Book (StockRegister.tsx) and `adjust_lot_stock` keep working per lot.

- `do_line_no` (int, default 1) — line 1, 2, … of the DO. Every DO saved
  before this change is a 1-line DO (line 1) and works as before.
- `order_line_seq` (int, nullable) — the order line (`orders.items[].seq`) the
  line is for. Backfilled for DOs already linked to an order, by billing name.
- Unique `(do_number, do_line_no)` replaces unique `(do_number)`.
- Header fields (warehouse, do_number, do_date, party, transporter,
  fulfilment, note, order_id, dispatch_round, email_sent_at, created_by) are
  the same on every line of a DO.

Migration: `supabase/migrations/20261103120000_outward_do_multi_line.sql`
(backup first: `backup.stock_movements_20261103`).

### Database functions

- `save_outward_do(p_movement_id, p_header, p_lines, p_actor)` — ONE
  transaction. New DO: inserts every line and takes each line's stock through
  `adjust_lot_stock`. Edit (`p_movement_id` = any line of the DO): puts back
  every OLD line's stock, then takes every NEW line's stock; lines are updated
  in place by line number, extra new lines inserted, removed lines deleted.
  Any refusal (not enough stock, unknown lot, same lot / order line twice,
  missing barrels / packing) raises, so nothing is saved and no stock changes.
  Errors name the line and lot, e.g. `Line 2 (Lot 101010) — NOT_ENOUGH_STOCK: …`.
  A new DO whose number was just taken fails with 23505 and the form retries
  with a fresh number (`saveOutwardDoWithRetry`).
- `delete_outward_do(p_id, p_actor)` — deletes EVERY line of the DO and puts
  each line's stock back (`delete_outward_movement` per line), in one
  transaction. Used by Stock Movements → Outward → Delete.
- `delete_dispatch_entry_reset` — unchanged rules; now deletes the round's
  DOs through `delete_outward_do`, so every line of each DO goes.

### The form (`src/pages/NewStockOutward.tsx`)

1. DO Details, once: Warehouse → DO Number (generated, never changed in edit
   mode) → DO Date.
2. Products table: Lot No, Lot Date, Product Name, Product Code (from the
   lot), Billing Name, No of Barrels, Packing, Total Qty (= barrels × packing),
   Packing Type, MOU. Under each row: "From lot …", "Available at …",
   "Order needs (remaining)", the packing note, and the row's problem.
   "+ Add product" adds a row; ✕ removes one (at least one stays). Totals
   (barrels, quantity, products) under the table.
3. Party, Transporter, Fulfilment Type, Note, once.

Each row keeps the single-lot rules: the lot is looked up in the HEADER
warehouse; an empty or unknown Lot No clears that row's lot fields
(b14a218); the lot's product picks the order line (25231ee, rule below).
Changing the Warehouse clears every row's lot fields (they refill from the
new warehouse's stock) and, for a new DO, regenerates the DO number.

From the Board, No of Barrels auto-fills with the lot's stock at the
warehouse but never more than the order line still needs.

Save is blocked while ANY row has a problem — no valid lot, product not in
the order, same lot or same order line on two rows, missing packing, no stock,
barrels more than the lot has, barrels more than the order line still needs.
The problem shows on its row and in the Save button's tooltip.

Edit opens the whole DO (any line's id loads every line with that DO
number). A saved row keeps its saved values until its Lot No (or the
Warehouse) is changed; only then are the order-line rules checked again.

### From the Dispatch board

- New DO (`?fromDispatch=1&orderRef=…`): one row per order line that still
  has barrels left, Billing Name prefilled from the line, lot fields empty.
  The user fills the lots and removes rows for products not in this DO.
- "+ New DO (another warehouse)" — shown on a saved DO opened from the board
  and on the drawer's Step 6 when the order still has lines with barrels left
  that are on no DO of this round. Opens a NEW DO for the same order + round
  with rows only for those lines (`&lines=1,2`).
- A multi-line DO counts as ONE DO everywhere on the board (`groupLinkedDOs`
  in `src/lib/dispatchFlow.ts`): the card's "DO saved / emailed" text,
  `doPendingFor`, the drawer's Step 6 lines and the "not emailed" check.
  Step 6 is done when every DO of the order + round has been emailed.

### PDF / DOCX / Email

`generateOutwardPDF` and `downloadOutwardDOCX` take the whole DO
(`OutwardDO`: header + `lines`). A 1-line DO looks exactly as before. A DO
with 2+ lines prints the header once, one table row per product with its own
Lot No / Lot Date columns (the separate "Lot No.: | Dated:" line is left out)
and a Total row. Email to Client sends ONE email with that ONE PDF and sets
`email_sent_at` on every line, logged once in the History Log.

### Stock Movements list

Outward tab: one row per DO number. Products as a short list ("Beta Pinene
95% ×40, Alpha Pinene 95% -ve 24 ×20"), total barrels and total quantity.
Edit opens the whole DO; Delete deletes the whole DO; search finds a DO by
any of its lines' lot / product. Inward, Stock Summary and the Stock Book are
unchanged (one row per lot movement).

## Which order line a product line is for (rule added 2026-11-03, 25231ee)

Applies to every row of a DO opened from the Dispatch board, and to a
changed row of a saved DO linked to an order. Plain Stock Movements → New
Outward is not affected.

The lot's product must be in the order, and the row uses THAT order line.

1. When Warehouse + Lot No find the lot, the lot's product name is turned into
   its billing name (Stock Inward catalogue, e.g. "Beta Pinene 95%" →
   "Beta Pinene"; a lot not in the catalogue uses its own name).
2. Both names are compared with letters and digits only, lower case. A line
   matches when the names are equal; if no line is equal, a line matches when
   one name starts with the other ("betapinene" / "betapinene95").
3. Lines no other row of the DO uses win; then lines with barrels still left;
   then the row's current line; else the first.
4. The row switches to that line: Billing Name = the line's product name as in
   the order, and "Order needs (remaining)", the packing note and the barrels
   check follow it. Product Name / Code, Packing, Packing Type and MOU stay the
   lot's.
5. No line matches → a red note on the row ("Lot … is … — this product is not
   in order SO-…. Order has: …") and Save is blocked.

The old "Product (from order)" picker is gone — a row's order line always
comes from its lot.

Code: `src/lib/doOrderLine.ts` (matching) and `src/pages/NewStockOutward.tsx`
(`fillFromLot`, `rowInfos`, `saveBlock`).

## Example

SO-2026-789 / ORD-2026-871: line 1 Alpha Pinene (20 barrels, packing 175),
line 2 Beta Pinene (40 barrels, packing 200).

- From the board the DO opens with two rows (Alpha Pinene, Beta Pinene).
- Swastik + lot 202020 (Beta Pinene 95%) on one row → Beta Pinene, order needs
  40, no packing note. Lot 101010 is at BALAJI, not Swastik, so the Alpha row
  is removed and saved as its own DO via "+ New DO (another warehouse)":
  BALAJI + lot 101010 (Alpha Pinene 95% -ve 24) → Alpha Pinene, order needs 20.
