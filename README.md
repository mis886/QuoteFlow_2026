# EnqBoss — Sales Pipeline & Order Management

EnqBoss is an internal B2B sales operations tool for **Himalaya TerpenesRubber Technologies**, built to manage the full pipeline from customer enquiry through quotation, order, and follow-up. It replaces manual spreadsheet workflows with a structured, searchable, and PDF-ready system.

**Tech Stack:** React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · Supabase (Postgres + Storage) · jsPDF · pdfjs-dist · Gmail API · Google Sheets webhooks

---

## Modules

### 1. Dashboard

Real-time pipeline overview. Configurable period (30 days / quarter / year / custom date range).

**KPI cards**

| Card | Description |
|---|---|
| Open Enquiries | Count of enquiries with status New or In Review |
| Q→O Conversion | Won quotes ÷ total quotes in period (%) |
| Open Quote Value | Sum of subtotal + GST for all Sent/Draft quotes |
| Contact Mix | Breakdown of follow-up channels (Call / WhatsApp / Email / Meeting / Visit) |

**Calendar tabs**
- **This Week** — Mon–Sun grid showing follow-up due dates, overdue enquiries, delivery dates, and pending quotes older than 7 days
- **Calendar** — same event types plotted on a month grid with prev/next navigation

All date logic uses IST local time (not UTC) to avoid off-by-one issues for late-night entries.

---

### 2. Enquiries

Tracks incoming customer requests from first contact through quoting.

**Fields:** Enquiry ID · Customer · Site · Contact · Email · Received (datetime) · Source (Email / Phone / WhatsApp / Reference / Walk-in / Portal) · Urgency (Normal / Urgent / Critical) · Status · Notes · Line Items (description, material, quantity, UOM, drawing ref) · Attachments

**Features**
- Tab filter: All · Open · New · In Review · Quoted · Won · Lost · Parked
- Source and urgency dropdowns; global date range filter on received date
- Search by customer name, enquiry ID, item description, or material
- Filter state persists in URL params (`?tab=&src=&urg=`) — survives navigation
- Expandable rows to view line items inline
- One-click "Create Quote" from any enquiry row
- Attachment viewer and Gmail message linking

---

### 3. Quotations

Generates and tracks customer quotations derived from enquiries or created standalone.

**Fields:** Quote ID · Date · Validity · Customer · Site · Contact · Email · Incoterms · Currency · Payment Terms · Status · Customer Enquiry Doc No · Line Items · Terms & Conditions · Authorised Signatory · Company Unit

**Line Items:** Seq · Description · Material · HSN Code · Qty · UOM · Unit Rate · GST % · Amount

**Terms & Conditions (auto-filled from incoterms)**
Delivery · Lead Time · Packing & Forwarding · Freight · Payment · Validity · Taxes

**Features**
- Status flow: Draft → Sent → Won / Lost / Parked
- T&C auto-populate based on selected incoterms (EXW / FOB / CIF / DDP etc.)
- Multi-signatory support — default signatory auto-loaded from Settings
- **Copy from Quote** — pick any past quote to pre-fill line items
- **Upload PDF** — extract line items from a previously prepared MRT quote PDF using `pdfjs-dist`; handles `Rs. 1,880=00` price format; parsed items shown in a review panel before applying
- PDF generation with company letterhead, GSTIN, authorized signature block
- Send by email with Gmail integration; triggers follow-up creation
- Customer GSTIN shown on PDF (site GSTIN → company GSTIN fallback); can be hidden via setting

---

### 4. Orders

Records confirmed purchase orders and generates Proforma Invoice (PI) PDFs.

**Fields:** Order ID · PO Number · PO Date · Delivery Date · Customer · Quote Ref · Enquiry Ref · Status · Ship-To Address · Bank Account · EXIM details (HSN, country of origin, customs point) · Line Items · Terms & Conditions · Notes

**Features**
- Status: Processing → Delivered
- Bill To / Ship To blocks — separate `shipToAddress` field printed in PI PDF
- GSTIN on PI: site GSTIN → company GSTIN fallback
- Multi-unit banking details selectable per order
- Full T&C clause library: inspection, warranty, packing, cancellation, force majeure, jurisdiction, LD, quality, returns
- **Google Sheets export** via webhook — pushes order + items to a configured sheet for ERP sync; shows validation warnings before export
- PO date and delivery date default to IST local date

---

### 5. Customers

Master record for all customer companies with multi-site and multi-contact support.

**Company fields:** Name · GSTIN · PAN · Industry Segment · Tier (New / Bronze / Silver / Gold) · Incoterms · Currency · Payment Terms · Rating · Turnover · Next Order (predicted)

**Site fields:** Name · City · State · Pincode · Address · Dispatch Address · Transporter · Lead Time Note · GSTIN

**Contact fields:** Name · Role · Phone · Email · Primary flag

**Features**
- **Smart address parsing** — detects and splits transporter, lead time, plant/unit name, dispatch address, phone numbers (mobile + STD landline), and GSTIN from unstructured pasted text
- **Fix All Addresses** bulk modal — scans all sites, shows per-site diff preview, applies in one click
- **Duplicate detection** — `normalizeName` strips legal suffixes and location qualifiers; Levenshtein similarity ≥ 85% groups typo variants (e.g. "Godavari" ↔ "Godavery")
- Expandable customer rows — click to see all linked sites as cards (GSTIN, transporter, lead time, contacts)
- Sites count column with primary city; GSTIN column (company → primary site fallback)
- Search + segment + tier filters persist in URL params (`?q=&seg=&tier=`)
- "Clear filters" button appears when any filter is active
- List sorted A→Z by company name (case-insensitive)
- Edit Customer accessible from Enquiry, Quote, and Follow-Up detail panels via ExternalLink icon

---

### 6. Follow-Ups

Tracks all customer communication linked to open quotes, with next-action scheduling.

**Log channels:** Called · WhatsApp · Email · Meeting · Visit

**Fields per log:** Timestamp · Channel · Notes · Next follow-up date + time

**Features**
- Left panel: quote list filtered by status; search by customer or quote ID
- **This Week** tab — Mon–Sun calendar grid showing which quotes have follow-ups due
- **Timeline** tab — chronological log grouped by date with channel icons
- Next follow-up date shown with overdue highlight
- Edit Customer shortcut from detail panel header
- All date handling in IST local time

---

### 7. Duplicate Review

Accessible from the Customers page. Scans all customers and groups likely duplicates.

**Detection logic**
1. `normalizeName` — lowercases, strips legal suffixes (`Ltd`, `Pvt Ltd`, `LLP`, `Inc`, `Corp`, `& Co`) and everything after them (unit names, city names, distillery names), strips dash-separated location suffixes
2. Levenshtein similarity ≥ 85% on normalized names longer than 4 characters — catches typos like "Hindustan" ↔ "Hindusathan"

Review UI shows groups side by side; select a primary record and merge or skip each group.

---

### 8. PDF Generation

Two generators built on `jsPDF` + `jspdf-autotable`.

| Generator | Output | Used in |
|---|---|---|
| `generateQuotePDF` | Quotation with letterhead, line items table, T&C, signature block | Quotes |
| `generatePIPDF` | Proforma Invoice with Bill To + Ship To, banking details, EXIM fields | Orders |

Both generators:
- Pull company letterhead from Settings (header image URL per unit)
- Format currency in INR (`en-IN` locale) or USD / EUR / GBP
- Calculate subtotal, GST per line, and grand total
- Include GSTIN (site → company fallback)

---

### 9. Settings

| Section | What it configures |
|---|---|
| Company Units | Name · GSTIN · Letterhead URL · Default flag |
| Bank Accounts | Bank name · Account no · IFSC · SWIFT · Branch · Currency · linked to unit |
| Signatories | Authorised person name · designation · phone · default flag |
| Gmail Integration | Label filter · sync frequency · enable/disable toggle |
| Google Sheets | Webhook URL · Drive folder ID for order export |
| Intelligence PIN | App-level access PIN |

---

## Date & Timezone

All dates are computed in **IST (UTC+5:30)** using local `Date` methods — never `toISOString()` which returns UTC and causes off-by-one date bugs for entries made after 18:30 IST.

Key helpers in `src/lib/utils.ts`:

| Helper | Purpose |
|---|---|
| `localDateStr(d)` | Returns `YYYY-MM-DD` in local time |
| `localDateTimeStr(d)` | Returns `YYYY-MM-DDTHH:mm` in local time |
| `isInDateRange(dateStr, range)` | Converts full ISO timestamp to local date before comparing |
| `resolveDateRange(preset)` | Resolves Today / Yesterday / This Week / This Month / This Quarter / This Year in local time |
| `addWorkingHours(from, hours)` | Adds working hours (Mon–Sat 09:00–18:00) in local time |

---

## URL Filter Persistence

Filters are stored in URL search params so they survive navigation, refresh, and Cancel-from-edit back-navigation:

| Page | Params |
|---|---|
| Enquiries | `?tab=&src=&urg=` |
| Customers | `?q=&seg=&tier=` |

---

## SQL Migrations

Run in Supabase SQL editor if columns are missing:

```sql
-- PAN on customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS pan TEXT;

-- Ship-to address on orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_to_address TEXT;

-- Company-level GSTIN on customers (already exists in schema — verify before running)
-- ALTER TABLE customers ADD COLUMN IF NOT EXISTS gstin TEXT;
```

---

## Project Structure

```
src/
  pages/
    Dashboard.tsx          Pipeline overview, calendar, KPIs
    Enquiries.tsx          Enquiry list with filters
    NewEnquiry.tsx         Create / edit enquiry
    Quotes.tsx             Quote list
    NewQuote.tsx           Create / edit quote, PDF preview, copy/upload items
    Orders.tsx             Order list
    NewOrder.tsx           Create / edit order, PI PDF, Sheets export
    Customers.tsx          Customer list, expandable sites, duplicate review
    NewCustomer.tsx        Create / edit customer, address parser
    FollowUps.tsx          Follow-up command centre, calendar, timeline
    Settings.tsx           App configuration
  components/
    DetailPanel.tsx        Slide-in panel for enquiry / quote details
    DuplicateReviewPanel.tsx  Levenshtein duplicate grouping UI
    GlobalDateRangePicker.tsx Top-bar date range filter (all pages)
    CustomerSearch.tsx     Typeahead customer selector
    Layout.tsx             App shell
    Sidebar.tsx            Navigation sidebar
    Topbar.tsx             Global search + date picker
    ui.tsx                 Shared UI primitives (Badge, Button, SourceIcon, DateFilterBanner)
  lib/
    types.ts               All TypeScript interfaces
    utils.ts               Date helpers, formatINR, isInDateRange, resolveDateRange
    pdfGenerator.ts        Quote PDF + PI PDF generators
  store/                   Zustand store with Supabase sync
```
