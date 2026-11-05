# Delivery Orders: one DO, many products, and which order line each is for

## One DO, many products (user decision 2026-11-03)

One DO = ONE warehouse + ONE DO number + ONE OR MORE product lines. It is
saved, printed (PDF / DOCX) and emailed to the customer as ONE document in
ONE email. Products in a different warehouse need a separate DO (a different
DO number), because the DO number prefix comes from the warehouse
(B- / S- / R- / H-, and W- for Wada — see "Wada warehouse" below).

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
  Any refusal (not enough stock, unknown lot, same lot twice, missing
  barrels / packing) raises, so nothing is saved and no stock changes.
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

No of Barrels fills with EXACTLY the lot's barrels at the header warehouse
(Stock Summary's party column, the "Available at …" figure) when a Lot No is
entered — not capped by the order (changed later on 2026-11-03, user's rule).
The user edits it down; their figure stays until the Lot No or Warehouse
changes. Rows prefilled from the Board start with No of Barrels empty. A lot
with no stock there leaves it empty. More barrels than the order line still
needs shows "Order needs only N barrels … — enter how many to dispatch" on
the row and blocks Save; it is never changed automatically. Opening a saved
DO shows its saved barrels.

Save is blocked while ANY row has a problem — no valid lot, same lot on two
rows (a product not in the order is allowed since 2026-11-04), missing packing, no stock, barrels more than
the lot has, barrels more than the order line still needs (summed over the
line's rows — see "One product from 2+ lots" below).
Since the 2026-11-03 UI cleanup there is no text under the rows: the box
that is wrong (Lot No, No of Barrels or Packing) gets a red border with the
message as its tooltip ("Available at …" / "Order needs (remaining)" are in
the No of Barrels tooltip). Save stays clickable; with a problem it saves
nothing and shows one toast, e.g. "Row 1 (Lot 101010): order needs only 20
barrels of Alpha Pinene — you entered 30."

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

DO email subject = Delivery Order <DO No> — <Party Name>, for every DO
emailed from 2026-11-05 onwards. Party Name as on the DO form, trimmed
("Other" → the typed party, as on the PDF); blank → the linked order's
customer (`dispatchOrderView`); both blank → just "Delivery Order <DO No>".
Built when the modal opens (still editable there), never saved
(`SendEmailModal.tsx`, `outwardParty`).

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

**Product mismatch is ALLOWED (user decision 2026-11-04).** 25231ee
required the lot's product to be in the order and blocked Save otherwise
("Lot … is … — this product is not in order …"). That block is removed
everywhere — new DO from the board, saved DO (edit), every row incl.
"+ Add product", stock warehouses and Wada — because sometimes a different
product is sent from a lot on purpose (e.g. ORD-2026-867 line "Dipentene" × 4
sent from lot 260914 "Pine Oil 211 (MOL)" at BALAJI). No red Lot No / Billing
Name box and no toast for it. The database never checked the product
(`save_outward_do` checked live 2026-11-04: lots, barrels, packing, same lot
twice, Wada names, stock — no product rule), so nothing changed there.

A matching product still picks its order line (rules below). A product with
NO matching line keeps the line picked with "+ Add product … for <line>",
else the row's own line (Board prefill / the line it had), else the default
of rule 3 over ALL lines — a row of a DO linked to an order always has a
line (`orderLineForRow`). Every other check stays: the line's rows ≤ its
remaining, barrels ≤ the lot's stock, Lot No in stock, required fields, same
lot twice, Wada rules.

1. When Warehouse + Lot No find the lot, the lot's product name is turned into
   its billing name (Stock Inward catalogue, e.g. "Beta Pinene 95%" →
   "Beta Pinene"; a lot not in the catalogue uses its own name).
2. Both names are compared with letters and digits only, lower case. A line
   matches when the names are equal; if no line is equal, a line matches when
   one name starts with the other ("betapinene" / "betapinene95").
3. A line picked for the row with "+ Add product … for <line>" wins when it
   matches. Otherwise (changed 2026-11-04, ORD-2026-869 bug — two "Camphor
   Powder" lines, line 1 140 × 25 with 140 left and line 2 50 × 30 with 0
   left; the 2nd lot of line 1 defaulted to line 2 and Save failed): lines
   with barrels still left AFTER the other rows of this DO win (remaining −
   those rows' barrels > 0); if none, lines with any remaining; else every
   match — so a line with 0 left is never picked while another matching line
   has some. Within that: the row's current line stays, then a line already
   on this DO (same product, another lot), else the first.
   Lines are named "Line 1 – Camphor Powder 140 × 25 (140 left)" (Line No =
   position in the order, qty × packing, remaining) in the "for …" options
   and in the row's Billing Name / No of Barrels tooltips ("Order line: …"),
   so lines with the same name can be told apart. A row on a line with 0 left
   gets "Line 2 – Camphor Powder 50 × 30 has 0 left — to use another order
   line, remove this row and add it again with "+ Add product" for that
   line." (the "for …" choice only applies to a NEW row). Other barrel
   messages name the line too: "Order needs only 20 barrels of Line 1 –
   Alpha Pinene 20 × 180 — …".
4. The row switches to that line: "Order needs (remaining)", the packing note
   and the barrels check follow it. Product Name / Code, Packing, Packing Type
   and MOU stay the lot's. Billing Name (2026-11-04, `billingNameForRow`) is
   filled automatically and stays editable: the lot's billing name from rule 1
   (catalogue, else the lot's own name) when the product matched the line,
   else the ORDER LINE's product name (lot 260914 on ORD-2026-867 →
   "Dipentene").
5. No line matches → allowed since 2026-11-04 (see above): no note, nothing
   blocked.

The old "Product (from order)" picker is gone — a row's order line comes from
its lot, the line picked with "+ Add product", or (product not in the order)
the row's own line.

Code: `src/lib/doOrderLine.ts` (matching) and `src/pages/NewStockOutward.tsx`
(`pickOrderLine`, `fillFromLot`, `rowInfos`, `saveBlock`).

## One product from 2+ lots (user decision 2026-11-03)

Real case: ORD-2026-848 has ONE line "Anthamber Tops" × 4; DO B-0813 (BALAJI)
fills it from lot 260902 × 3 + another lot × 1. This used to be blocked ("…
is on another row of this DO — use one row per product").

- The SAME order line may be on several rows of one DO, each with a
  DIFFERENT lot. The same lot twice on one DO is still blocked (form and
  `save_outward_do`). Wada DOs: same rule, a different Lot No on each row.
- Barrels are checked per ORDER LINE: the rows of that line on this DO added
  up must be ≤ the line's remaining (`barrelsByOrderLine` /
  `orderOverMessage` in `doOrderLine.ts`). Too many → EVERY row of that line
  gets the red No of Barrels box; tooltip / toast e.g. "Order needs only 20
  barrels of Alpha Pinene — rows 1 + 2 of this DO add up to 25." The No of
  Barrels tooltip also shows "This DO (rows 1 + 2): 25 barrels". Each row
  still can't go over its own lot's stock at the warehouse.
- "Remaining" is as before: the order line minus the dispatch entries of
  EARLIER rounds (`remainingByLine`). Other DOs of the same round are not
  subtracted (unchanged).
- "+ Add product" (Board / linked DO) has a "for …" choice: the line matching
  the lot's product (default; Wada: the line its Billing Name matches) or a
  chosen order line — also one already on the DO. A picked row starts with
  that line's Billing Name and goes back to it if its lot is cleared.
- Database: migration `20261103190000_outward_do_same_order_line_many_lots.sql`
  removes ONLY `save_outward_do`'s "The same order line is on two lines of
  this DO." check.
- Board / Step 6 / Outward list / Stock Book / PDF / DOCX / email: unchanged —
  each row is already its own `stock_movements` row, Stock Book row and PDF /
  DOCX table row (own Lot No / Lot Date, Total row adds them up).

## Wada warehouse (no stock link, added 2026-11-03)

Wada's lots live in a different website (separate Supabase project). EnqBoss
has NO Wada stock and must not get any, but orders are dispatched from Wada,
so its DOs are made, emailed and listed here like any other.

- **Where:** only the Outward / DO form's Warehouse list (after BALAJI). Not
  in Stock Inward, Stock Summary columns or anywhere else.
- **DO number:** `W-0001`, `W-0002` … (same generator as R- / S- / H- / B-;
  no start number). No other warehouse uses `W-`.
- **Rows are fully manual.** Lot No is free text — no `stock_lots` lookup, no
  auto-fill, no "lot not found" / "no stock" / barrels-vs-stock checks, and
  nothing is cleared when Lot No changes. The user types Lot No, Lot Date,
  Product Name, Product Code, Billing Name, No of Barrels, Packing, Packing
  Type and MOU; Total Qty = barrels × packing. Required: Lot No, Product
  Name, Billing Name, No of Barrels, Packing (same red box + tooltip + one
  toast on Save). Same lot twice on one DO is still refused.
- **From the Dispatch board:** rows prefilled from the order lines (Billing
  Name from the line), and the order rules stay — there is no lot, so the
  typed Billing Name picks the order line with the same matcher
  (`orderLineForRow`, `onBillingChange`). Not in the order → allowed since
  2026-11-04: the row keeps its "+ Add product" / own line (no red Billing
  Name); the line's rows together must be ≤ its remaining
  (several rows per line allowed, each with its own Lot No — see "One product
  from 2+ lots"). Code: `wadaRowInfo` in `NewStockOutward.tsx`.
- **Switching warehouse** to / from Wada on a NEW DO: DO number regenerates;
  header fields and each row's Lot No, Billing Name and order line are kept;
  the other row fields are cleared and the new warehouse's rules apply. A
  SAVED DO can't be switched between Wada and a stock warehouse (toast "Make
  a new DO instead…"; the database refuses it too — `WAREHOUSE_SWITCH`).
- **Database** (`supabase/migrations/20261103170000_outward_do_wada_no_stock.sql`):
  `save_outward_do` with warehouse `wada` (case-insensitive) saves / updates
  the `stock_movements` rows only — never `adjust_lot_stock`, never reads
  `stock_lots` (also requires Product Name + Billing Name).
  `delete_outward_movement` deletes a Wada line with no stock put back, so
  `delete_outward_do`, Outward → Delete, `undo_step6_with_dos` and
  `delete_dispatch_entry_reset` (which all delete through it) work unchanged.
  New nullable `stock_movements.product_code` holds the typed Product Code —
  written for Wada lines only; stock lines still take their code from the
  catalogue.
- **Lists:** shown in Stock Movements → Outward (one row per DO; Edit / PDF /
  DOCX / Email). NOT in Stock Summary (stock_lots never changes) and left out
  of the Stock Register → Stock Book (`isNoStockWarehouse` filter in
  `StockRegister.tsx`).
- **Dispatch board:** a Wada DO counts like any other DO (grouped by
  `do_number`); emailing it completes Step 6; "+ New DO (another warehouse)"
  offers Wada.
- **PDF / DOCX / email:** godown block "M/s. WADA FACTORY", GUT N 227, 228 &
  Jamghar, Post Nehroli, Wada, Dist. Palghar, MUMBAI SUBURBAN, Pin 421303,
  Mobile +91 86570 00602 (`GODOWN_ADDRESSES` in pdfGenerator.ts +
  outwardDocx.ts). Self Pickup email contact: Girish / +91 86570 00602
  (`OUTWARD_PICKUP_CONTACTS`, SendEmailModal.tsx).
- **History Log:** same rows as other DOs, warehouse "Wada".

## Example

SO-2026-789 / ORD-2026-871: line 1 Alpha Pinene (20 barrels, packing 175),
line 2 Beta Pinene (40 barrels, packing 200).

- From the board the DO opens with two rows (Alpha Pinene, Beta Pinene).
- Swastik + lot 202020 (Beta Pinene 95%) on one row → Beta Pinene, order needs
  40, no packing note. Lot 101010 is at BALAJI, not Swastik, so the Alpha row
  is removed and saved as its own DO via "+ New DO (another warehouse)":
  BALAJI + lot 101010 (Alpha Pinene 95% -ve 24) → Alpha Pinene, order needs 20.
