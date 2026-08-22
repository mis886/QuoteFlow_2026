# EnqBoss — Task Tracker

> Last updated: 2026-05-21
> Legend: ✅ Done · 🔄 In Progress · ⬜ Pending · ❌ Known Issue

---

## 1. Dashboard

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Replace "Win Rate" KPI with **Q→O Conversion Rate** | ✅ | Counts quotes with status `Won` ÷ total quotes in period |
| 1.2 | Fix Q→O showing 0% despite 3 orders | ✅ | Was comparing orders by `poDate`; now uses `quote.status === 'Won'` |
| 1.3 | Calendar / This Week timezone fix (IST) | ✅ | `dateKey()` uses `getFullYear/Month/Date()` not `toISOString()` |
| 1.4 | "Due Today" tasks showing on wrong date in calendar | ✅ | Same timezone fix applied to Dashboard & FollowUps |

---

## 2. Enquiries

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Expandable row to show line items | ✅ | Click row to expand; `React.Fragment` pattern |
| 2.2 | Filter state persists across navigation (URL params) | ✅ | Tab, source, urgency filters in `?tab=&src=&urg=` |
| 2.3 | Date filter showing wrong entries (IST offset bug) | ✅ | `isInDateRange` now uses `localDateStr(new Date(dateStr))` |
| 2.4 | Received time "20 May 04:23" treated as May 19 in filter | ✅ | Root cause: UTC ISO stored, slice(0,10) gave UTC date; fixed |

---

## 3. Quotations

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Detail panel — Edit Customer link near customer name | ✅ | `ExternalLink` icon in header, navigates to `/customers/new?id=` |
| 3.2 | Quote date / validity default to correct IST date | ✅ | Replaced `toISOString()` with `localDateStr()` |
| 3.3 | Customer GSTIN shown in Quote detail panel | ✅ | Falls back: site GSTIN → customer GSTIN |

---

## 4. Orders

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | Separate `ship_to_address` field on orders | ✅ | Persisted from NewOrder, printed in PI PDF |
| 4.2 | Ship To block in PI PDF | ✅ | Renders after Bill To if `order.shipToAddress` present |
| 4.3 | PO Date / Delivery Date default to correct IST date | ✅ | `localDateStr()` used in state init |

---

## 5. Follow-Ups

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | "This Week" and "Calendar" tabs in Command Centre left panel | ✅ | `FUCalWeekGrid` component, prev/next/today nav |
| 5.2 | Calendar timezone fix | ✅ | `dateKey()` uses local date parts |
| 5.3 | Edit Customer link near customer name in detail panel | ✅ | `ExternalLink` icon, `useNavigate(-1)` back pattern |

---

## 6. Customers

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | Parse & Split mixed address fields | ✅ | Detects transporter, lead time, plant/unit, dispatch address, phone, GSTIN |
| 6.2 | `Plant:` / `Unit:` → Site Name field | ✅ | Not appended to leadTimeNote |
| 6.3 | `Parcel address:` → Dispatch Address | ✅ | Mapped in `dispatchStartRx` |
| 6.4 | Title-case: only fix entirely-lowercase words | ✅ | Leaves ALL-CAPS / Mixed-Case untouched |
| 6.5 | Phone extraction — labeled (`Mob No:`) + bare 10-digit + STD landline (`05862-258545`) | ✅ | `isBarePhone()` handles both patterns |
| 6.6 | GSTIN extraction from address text | ✅ | `extractGstin()` + `gstinLabelRx`; bare 15-char pattern also detected |
| 6.7 | "Fix All Addresses" bulk modal | ✅ | Scans all sites, shows per-site preview, apply once per customer |
| 6.8 | `hasMixedContent` in Customers.tsx updated (phone/GSTIN bare detection) | ✅ | Matches NewCustomer.tsx pattern |
| 6.9 | Expandable customer row → site details grid | ✅ | Click row; shows site cards with GSTIN, transporter, lead time, contacts |
| 6.10 | Sites count column in table (before Primary Contact) | ✅ | MapPin icon + count + primary city |
| 6.11 | GSTIN column in customer table | ✅ | Company GSTIN → primary site GSTIN fallback |
| 6.12 | Company-level GSTIN field in Edit Customer form | ✅ | Above PAN field; loads/saves correctly |
| 6.13 | Search bar + filters persist across navigation (URL params) | ✅ | `?q=&seg=&tier=` in URL; Cancel/Save use `navigate(-1)` |
| 6.14 | "Clear filters" button | ✅ | Appears when any filter active; resets all params |
| 6.15 | Customer list sorted A→Z | ✅ | `localeCompare` case-insensitive sort after filter |
| 6.16 | Edit Customer link from Detail Panel (Enquiry/Quote) | ✅ | `ExternalLink` icon next to customer name `<h2>` |

---

## 7. Duplicate Detection

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7.1 | `normalizeName` strips location/unit suffixes after legal suffix | ✅ | `"DCM Shriram Ltd. Ajbapur"` → `"dcm shriram"` |
| 7.2 | Dash-separated location suffix stripped | ✅ | `"DCM Shriram - Meerut"` → `"dcm shriram"` |
| 7.3 | Fuzzy matching for typos (Levenshtein ≥ 85%) | ✅ | `"Godavari"` ↔ `"Godavery"` grouped |
| 7.4 | `"Dalmia Bharat Sugar & Industries Ltd, Unit-Nigohi"` grouped correctly | ✅ | Unit-name suffix stripped |

---

## 8. PDF Generation

| # | Task | Status | Notes |
|---|------|--------|-------|
| 8.1 | Quote PDF — customer GSTIN from site or company level | ✅ | `primarySite?.gstin \|\| customer?.gstin` |
| 8.2 | PI PDF — Bill To GSTIN fallback | ✅ | Same pattern |
| 8.3 | PI PDF — Ship To block | ✅ | Renders `order.shipToAddress` |
| 8.4 | Quote PDF — customer GSTIN hidden (was requested previously) | ✅ | Controlled by setting |

---

## 9. Global / Cross-cutting

| # | Task | Status | Notes |
|---|------|--------|-------|
| 9.1 | All date defaults use IST local time | ✅ | `localDateStr()` / `localDateTimeStr()` helpers in `utils.ts` |
| 9.2 | `resolveDateRange()` presets (Today, Yesterday, This Week…) use IST | ✅ | Fixed `iso()` helper inside function |
| 9.3 | `isInDateRange()` filter uses IST local date | ✅ | `localDateStr(new Date(dateStr))` instead of `slice(0,10)` |
| 9.4 | `addWorkingHours()` returns local date | ✅ | |

---

## 10. Pending / Next Up

| # | Task | Status | Notes |
|---|------|--------|-------|
| 10.1 | Supabase `pan` column — confirm exists or add | ⬜ | `ALTER TABLE customers ADD COLUMN IF NOT EXISTS pan TEXT;` ready |
| 10.2 | Search persistence on Enquiries page (tab/src/urg) | ✅ | URL params done |
| 10.3 | Quotes page — filter persistence across navigation | ⬜ | Not yet done (same pattern as Enquiries/Customers) |
| 10.4 | Orders page — filter persistence across navigation | ⬜ | Not yet done |
| 10.5 | Customer abbreviation matching (`BCL` → `Balrampur Chini Mills`) | ⬜ | Requested but not implemented — needs abbreviation lookup table |
| 10.6 | Company name search by keyword repeats (common brand grouping) | ⬜ | Requested; complex — deferred |
| 10.7 | Verify `ship_to_address` column exists in Supabase `orders` table | ⬜ | May need `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_to_address TEXT;` |

---

## SQL Migrations Needed (run in Supabase SQL editor)

```sql
-- 1. PAN column on customers (if missing)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pan TEXT;

-- 2. Ship-to address on orders (if missing)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_to_address TEXT;

-- 3. gstin column on customers already exists (confirmed in supabase_schema.sql)
-- No action needed.
```
