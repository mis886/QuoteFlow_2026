# EnqBoss — User Manual

**Version:** 1.0 · **Last Updated:** May 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Dashboard](#3-dashboard)
4. [Enquiries (Module 01)](#4-enquiries-module-01)
   - 4.1 [Enquiry Register](#41-enquiry-register)
   - 4.2 [Log a New Enquiry](#42-log-a-new-enquiry)
   - 4.3 [Edit an Enquiry](#43-edit-an-enquiry)
5. [Quotations (Module 02)](#5-quotations-module-02)
   - 5.1 [Quotation Register](#51-quotation-register)
   - 5.2 [Create a Quotation](#52-create-a-quotation)
   - 5.3 [Send a Quote by Email](#53-send-a-quote-by-email)
   - 5.4 [Generate a PDF Quote](#54-generate-a-pdf-quote)
   - 5.5 [Update Quote Status](#55-update-quote-status)
   - 5.6 [Convert a Won Quote to an Order](#56-convert-a-won-quote-to-an-order)
6. [Orders (Module 03)](#6-orders-module-03)
   - 6.1 [Order Register](#61-order-register)
   - 6.2 [Create / Edit an Order](#62-create--edit-an-order)
   - 6.3 [Generate a Proforma Invoice (PI)](#63-generate-a-proforma-invoice-pi)
   - 6.4 [Export an Order to Google Sheets](#64-export-an-order-to-google-sheets)
   - 6.5 [Mark an Order as Delivered](#65-mark-an-order-as-delivered)
7. [Follow-Ups (CRM Command Centre)](#7-follow-ups-crm-command-centre)
8. [Customers (Master Data)](#8-customers-master-data)
9. [Analytics (Module 05)](#9-analytics-module-05)
10. [Customer Intel Board](#10-customer-intel-board)
11. [Documents & Attachments](#11-documents--attachments)
12. [Settings](#12-settings)
    - 12.1 [PDF & Branding](#121-pdf--branding)
    - 12.2 [Bank Details](#122-bank-details)
    - 12.3 [Gmail Integration](#123-gmail-integration)
    - 12.4 [Intelligence PIN](#124-intelligence-pin)
    - 12.5 [Integrations (Google Sheets)](#125-integrations-google-sheets)
13. [Keyboard Shortcuts & Tips](#13-keyboard-shortcuts--tips)

---

## 1. Overview

EnqBoss is a sales operations platform for manufacturing and engineering businesses. It manages the complete commercial lifecycle — from first customer enquiry through quotation, order, and delivery — in one place.

**Core workflow:**

```
Customer Enquiry → Quotation → Won → Order → Delivered
```

**Key capabilities:**
- Capture enquiries with multiple line items and technical drawings
- Generate branded PDF quotations and proforma invoices
- Track pipeline value and follow-up activity
- Export orders to Google Sheets for production planning
- Customer intelligence with tier rating and activity history

---

## 2. Getting Started

### Logging In

> 📸 **[SCREENSHOT: login-page.png]** — Login screen with email/password fields

1. Open the app URL in your browser.
2. Enter your work email and password.
3. Click **Sign In**.

The app remembers your session. You will only be asked to sign in again if you manually sign out or the session expires.

### Signing Out

Click your **initials avatar** at the bottom of the left sidebar → click **Sign Out** → confirm in the dialog.

### Navigation

The **sidebar** on the left contains all modules:

| Section | Items |
|---------|-------|
| **Main** | Dashboard, Enquiries, Quotations, Orders, Follow-Ups, Customers |
| **Insights** | Analytics, Customer Intel, System Plan |
| **Config** | Settings |

> 📸 **[SCREENSHOT: sidebar-overview.png]** — Full sidebar showing all nav items, active state, and user profile at bottom

---

## 3. Dashboard

The Dashboard is your daily starting point. It shows a real-time overview of pipeline health and requires immediate attention.

> 📸 **[SCREENSHOT: dashboard-full.png]** — Full dashboard view showing KPI cards, funnel, and panels

### 3.1 Header & Greeting

- **Greeting** shows your first name and the current date.
- **Status line** tells you how many enquiries need a response today, or "All caught up" if none are pending.
- Quick buttons: **View All** (goes to Enquiries) and **Log Enquiry** (opens the new enquiry form).

### 3.2 KPI Cards

Five cards across the top show live metrics:

| Card | What It Shows |
|------|--------------|
| **Open Enquiries** | Count of New + In Review enquiries. Trend vs last 30 days. |
| **Pending Line Items** | Total items across all open enquiries. |
| **Avg E2Q Time** | Average hours from enquiry received to quote sent. Lower is better. |
| **Open Quote Pipeline** | Total INR value of all "Sent" quotes awaiting PO. |
| **Active Orders** | Count of orders in "Processing" status. |

Trend arrows (▲/▼) indicate change vs the previous 30-day period. Green = good, red = needs attention.

> 📸 **[SCREENSHOT: dashboard-kpi-cards.png]** — 5 KPI cards with trend indicators

### 3.3 Sales Journey Funnel

A visual funnel shows how many enquiries are at each stage:

**Lead → Quoted → Sampling → Negotiating → Won → Lost**

Each stage shows the count of enquiries. Click any stage to jump to the filtered Enquiries list.

> 📸 **[SCREENSHOT: dashboard-funnel.png]** — Sales funnel with stage counts

### 3.4 Needs Attention

Shows the **top 3 oldest open enquiries** (New or In Review, older than 4 hours). Each card shows the ENQ ID, customer name, urgency badge, and how old the enquiry is. Click the row to open that enquiry.

If no enquiries are overdue, this panel shows an "Inbox Zero" message.

### 3.5 Recent Enquiries

The last 5 enquiries logged, with Edit, Detail, Quote, and Docs action buttons. Useful for quickly continuing work you started earlier.

### 3.6 Bar Charts

Three charts at the bottom:
- **Enquiries by Status** — distribution across all 6 statuses
- **Enquiry Sources** — where enquiries come from (Email, Phone, WhatsApp, Exhibition, Website)
- **Open Quote Pipeline by Customer** — top 5 customers by open quote value

---

## 4. Enquiries (Module 01)

### 4.1 Enquiry Register

> 📸 **[SCREENSHOT: enquiries-register.png]** — Enquiry list with filters, search, and action buttons visible

**Opening:** Click **Enquiries** in the sidebar.

The register shows all customer enquiries as a table. The column **Age** shows a color-coded indicator:
- 🟢 Green — less than 4 hours old
- 🟡 Orange — 4 to 24 hours
- 🔴 Red (pulsing) — more than 24 hours

**Filtering enquiries:**

| Control | How to Use |
|---------|-----------|
| Status tabs | Click **New**, **In Review**, **Quoted**, **Won**, **Lost**, or **Parked** to filter by status. Click **All** to see everything. |
| Search box | Type company name, item description, or material to filter live. |
| Source dropdown | Filter by how the enquiry arrived (Email, Phone, WhatsApp, Exhibition, Website). |
| Urgency dropdown | Filter by Hot, Urgent, Normal, or Low. |

**Expanding a row:** Click anywhere on an enquiry row to expand it and see all line items inline.

> 📸 **[SCREENSHOT: enquiry-row-expanded.png]** — Expanded row showing line items table and "Convert to Quotation" button

**Row actions:**

| Button | Action |
|--------|--------|
| **Edit** | Open the enquiry form to make changes |
| **Detail** | Open a read-only slide-in panel with full details |
| **Quote** | Jump directly to create a quotation for this enquiry (only shown if not yet quoted) |
| **Docs** | Open the Document Manager for this enquiry |

---

### 4.2 Log a New Enquiry

> 📸 **[SCREENSHOT: new-enquiry-form.png]** — Full enquiry form showing all sections

1. Click the **Log New Enquiry** button in the top-right of the Enquiry Register.
2. An auto-generated ENQ number appears in the black box at the top (e.g. `ENQ-2026-047`).

**Fill in the form:**

**Receipt Information**
- **Date & Time Received** — defaults to now; adjust if logging a past enquiry.
- **Customer Enquiry Doc No.** — the customer's own reference number (optional).
- **Source** — how the enquiry came in. Select from the dropdown.

**Customer & Contact**
- **Customer** — start typing to search existing customers. If new, the name is created automatically.
- **Site / Branch** — auto-populates from the customer record. Change if multiple sites.
- **Contact Person** — auto-populates. Change if needed.
- **Email** — auto-fills from the contact record.

**Urgency Level** (right panel)

Select the urgency — this sets the SLA target response time:

| Level | Response Target |
|-------|----------------|
| Hot | 4 hours |
| Urgent | 24 hours |
| Normal | 48 hours |
| Low | 72 hours |

> 📸 **[SCREENSHOT: urgency-selector.png]** — Four urgency radio cards with color coding

**Line Items**

Each enquiry must have at least one line item.

| Column | Required? | Notes |
|--------|-----------|-------|
| Description | Yes | Part or product name |
| Material / Grade | No | e.g. SS316, PTFE |
| Qty / UOM | Yes | Quantity and unit (Nos, MTR, KG, etc.) |
| Dwg Ref | No | Drawing number if applicable |

- Click **Add Another Line Item** (dashed button) to add more rows.
- Click the **red trash icon** on a row to remove it. The last row cannot be removed.

> 📸 **[SCREENSHOT: line-items-table.png]** — Line items table with add/remove buttons

**Assignment & Notes**
- **Assigned To** — select the person responsible.
- **Quote Required By** — deadline date for delivering the quotation.
- **Internal Notes** — free text, not visible to the customer.

**Documents** (right panel)
- Upload enquiry documents or technical drawings using the upload area. Drag-and-drop or click to browse.
- Uploaded files appear in a list with a delete option.

**Saving**

| Button | Action |
|--------|--------|
| **Save Enquiry** | Saves and returns to the register |
| **Save & Create Quote** | Saves and immediately opens the New Quotation form pre-filled with these details |
| **Cancel** | Discards all changes |

---

### 4.3 Edit an Enquiry

Click **Edit** on any row in the register. The same form opens pre-filled. All fields are editable including line items.

To change the status (e.g. mark as Parked or Lost), use the **Status** dropdown at the top of the form when in edit mode.

---

## 5. Quotations (Module 02)

### 5.1 Quotation Register

> 📸 **[SCREENSHOT: quotations-register.png]** — Quotation list with status tabs, value columns, and action buttons

**Opening:** Click **Quotations** in the sidebar.

**Filtering quotations:**
- **Status tabs:** All | Draft | Sent | Won | Lost | Parked
- **Search:** Company name, item, or quote number
- **Customer dropdown:** Filter by a specific customer

**Expanding a row:** Click a row to expand and see all line items with unit prices, GST, and totals.

**Row actions:**

| Button | When Shown | Action |
|--------|-----------|--------|
| **Edit** | Always | Edit the quotation |
| **Detail** | Always | Read-only slide-in panel |
| **PDF** | Always | Download PDF of the quote |
| **Docs** | Always | Open Document Manager |
| **Send** | Draft only | Opens the email composer |
| **Order** | Won or Sent | Convert to Order (disabled and shows "Ordered" if already converted) |

> 📸 **[SCREENSHOT: quote-row-actions.png]** — Quote row showing all action buttons including "Ordered" disabled state

---

### 5.2 Create a Quotation

> 📸 **[SCREENSHOT: new-quote-form.png]** — New quotation form showing all sections

**From an Enquiry (recommended):**
- On any enquiry row, click **Quote** — the form pre-fills with the customer, contact, and all line items from the enquiry.

**From scratch:**
- Click **New Quote** in the Quotation Register header.

The form is a two-step process: **Form → Preview**.

**Step 1: Form**

**Quote Info**
- **Quote Ref** is auto-generated (e.g. `Q-2026-031`).
- **Date of Issue** — defaults to today.
- **Valid Until** — required. Set the date the quote expires.

**Customer & Contact**
- Same cascade as enquiry: Customer → Site → Contact → Email auto-fills.

**Trading Terms** (right column)
- **Incoterms** — EXW, FOB, CIF, etc.
- **Currency** — INR is default.
- **Payment Terms** — free text (e.g. "50% advance, balance against delivery").

**Line Items**

| Column | Notes |
|--------|-------|
| Description | Part name (pre-filled from enquiry) |
| Material | MOC (pre-filled from enquiry) |
| HSN Code | Harmonized tariff code |
| Qty | Pre-filled from enquiry |
| Unit Price | Enter your selling price |
| GST % | 5, 12, 18, or 28 |
| Line Total | Auto-calculated (Qty × Unit Price) |

The form shows **Sub-Total**, **GST Amount**, and **Grand Total** live as you type.

**Terms & Conditions**
Expand this section to set Delivery, Lead Time, P&F, Freight, Payment, Validity, and Taxes. These print on the PDF.

**Authorized Signatory**
The default signatory is auto-selected. Change from the dropdown if needed.

**Step 2: Preview**
Review the formatted PDF before saving. Click **Back** to return and make changes.

**Save:** Click **Save & PDF** to save the quote and generate the PDF.

---

### 5.3 Send a Quote by Email

> 📸 **[SCREENSHOT: send-email-modal.png]** — Email composer modal for quotes

1. In the Quotation Register, click **Send** on any Draft quote.
2. The email composer opens:
   - **To:** Primary contact email (editable)
   - **CC:** Tick any additional contacts from the customer's site, or enter a custom email
   - **Subject:** Pre-filled; editable
   - **Body:** Pre-formatted professional message; editable
   - **Attachment:** The quote PDF is auto-attached
3. Click **Send Email**.
4. The quote status automatically changes to **Sent**.

---

### 5.4 Generate a PDF Quote

Click the **PDF** button on any quotation row. The PDF downloads immediately using:
- Your company letterhead (configured in Settings → PDF & Branding)
- Authorized signatory name and designation
- All line items with pricing and GST
- Terms & Conditions
- Bank details (if applicable)

---

### 5.5 Update Quote Status

In edit mode, use the **Status** dropdown at the bottom of the form:

| Status | Use When |
|--------|---------|
| Draft | Quote created but not yet sent |
| Sent | Quote emailed to customer |
| Won | Customer confirmed, PO expected |
| Lost | Customer chose a competitor or cancelled |
| Parked | On hold indefinitely |

> 📸 **[SCREENSHOT: quote-status-dropdown.png]** — Status dropdown with all options

---

### 5.6 Convert a Won Quote to an Order

1. Find the Won (or Sent) quote in the register.
2. Click the **Order** button on that row.
3. The New Order form opens, pre-filled with all quote details.
4. Fill in the PO Number, PO Date, and upload the customer's PO document.
5. Click **Save**.

After conversion, the **Order** button on the quote row is replaced with a disabled **"Ordered"** label.

> 📸 **[SCREENSHOT: quote-ordered-state.png]** — Quote row showing disabled "Ordered" button after conversion

---

## 6. Orders (Module 03)

### 6.1 Order Register

> 📸 **[SCREENSHOT: orders-register.png]** — Order list with status tabs and action buttons

**Opening:** Click **Orders** in the sidebar.

**Filtering:**
- **Tabs:** All | Processing | Delivered
- **Search:** Company name, PO number, or Order number

**PO Number column:** Shows the customer's PO number. If a PO document is attached:
- 🔗 Link icon → click to open the PO directly in the browser (public submission URL)
- ⬇ Download icon → click to download the PO file from storage

**Expanding a row:** Click anywhere on the row to see all line items with agreed rates and totals.

---

### 6.2 Create / Edit an Order

**Create from Quote:** Click **Order** button on a Won quote (see Section 5.6).

**Create manually:** Click the green **→ ORDER** button in the Order Register.

**Key fields:**

| Field | Notes |
|-------|-------|
| PO Number | Customer's purchase order number |
| PO Date | Date on the customer's PO |
| PO Document | Upload the customer's PO PDF or image |
| Delivery Date | Requested delivery date from the PO |
| Agreed Rate | Final negotiated price per item (may differ from quote unit price) |

**Banking Details** — fill in bank name, account number, IFSC, and SWIFT code. These appear on the Proforma Invoice PDF.

---

### 6.3 Generate a Proforma Invoice (PI)

> 📸 **[SCREENSHOT: pi-pdf-preview.png]** — Generated PI PDF in browser

Click **PI** on any order row. The PI PDF is generated instantly and opened in a new browser tab. It includes:
- Company letterhead
- Customer details and PO reference
- All line items with agreed rates, GST, and totals
- Delivery date
- Bank details for payment
- Authorized signatory

---

### 6.4 Export an Order to Google Sheets

> 📸 **[SCREENSHOT: sheets-export-button.png]** — Order row showing green spreadsheet icon button

> **Prerequisites:** The Sheets Web App URL and Drive Folder ID must be configured in **Settings → Integrations** (see Section 12.5), and the Apps Script must be deployed. See the setup guide at the end of Section 12.5.

**Exporting:**
1. Find the order in the register.
2. Click the **green spreadsheet icon** (📊) on the row.
3. A spinner appears while the export runs.
4. A toast notification appears at the bottom-right:

| Toast Colour | Meaning |
|-------------|---------|
| 🟢 Green — "Exported to Google Sheets ✓" | All rows written, Drive links saved |
| 🟡 Amber — "Exported with issues: …" | Rows written but a Drive file could not be uploaded; the message explains why |
| 🔴 Red — "Export failed: …" | Export did not complete; check the Apps Script deployment |

> 📸 **[SCREENSHOT: sheets-toast-success.png]** — Green success toast at bottom right

5. After a successful export, the spreadsheet icon is replaced with a **disabled green checkmark** (✓). Hovering shows the export date. This prevents duplicate exports.

> 📸 **[SCREENSHOT: sheets-exported-checkmark.png]** — Order row after export showing green checkmark button

**What gets written to the sheet:**

| Sheet Tab | What's Written |
|-----------|---------------|
| **PO** | One summary row: Order ID, timestamp, user email, PO number, PO date, customer, contact, items summary, PO value, quote value, delivery date, S. No. (auto-incremented), PO Acknowledgement status, and a Drive link to the PO document |
| **Ordered Items** | One row per line item: all item details, Job Card No. (JC1234, auto-incremented), drawing reference, and Drive link(s) to drawing files |

---

### 6.5 Mark an Order as Delivered

Click the **Complete** button on any Processing order row. The status changes to **Delivered** immediately.

> 📸 **[SCREENSHOT: order-complete-button.png]** — Order row with "Complete" button highlighted

---

## 7. Follow-Ups (CRM Command Centre)

> 📸 **[SCREENSHOT: followups-full.png]** — Split-panel view with queue on left and activity form on right

**Opening:** Click **Follow-Ups** in the sidebar.

The Command Centre is a split-panel view:
- **Left panel** — the follow-up queue (all quotes that need action)
- **Right panel** — activity log form and history for the selected quote

### 7.1 The Queue

The top of the left panel shows three counters:
- 🔴 **Overdue** — next action date has passed
- 🟠 **Today** — next action is due today
- 🟢 **Upcoming** — scheduled for a future date

Each quote card shows: priority badge, Quote ID, ENQ Ref, and customer name. Click a card to select it and see its history on the right.

**Filtering:** Use the search box to find a quote or customer. Use the owner dropdown to filter by salesperson.

### 7.2 Logging Activity

With a quote selected on the right:

1. **Channel** — select how you contacted the customer: Called, WhatsApp, Email, Meeting, or Visit.
2. **Note** — type what was discussed, any commitments made, or customer feedback.
3. **Next Action** — (optional) schedule the next follow-up:
   - Channel for next contact
   - Date for next contact
4. Click **Log Activity**.

The activity appears in the timeline below, sorted newest first.

> 📸 **[SCREENSHOT: followup-log-form.png]** — Activity log form with channel selector and note field

### 7.3 Activity Timeline

All logged activities for the selected quote appear in reverse chronological order. Each entry shows:
- Date and time
- Channel icon (📞 🟢 ✉ etc.)
- The note
- Who logged it
- Next action if scheduled

---

## 8. Customers (Master Data)

> 📸 **[SCREENSHOT: customers-list.png]** — Customer list with avatar, name, tier badge, and segment

**Opening:** Click **Customers** in the sidebar.

### 8.1 Customer List

Shows all customers with their tier badge (New / Bronze / Silver / Gold) and segment. Use the **search** box to find by name or code, or use the **Segment** dropdown to filter.

### 8.2 Customer Detail Panel

Click any customer row to open the detail panel on the right.

> 📸 **[SCREENSHOT: customer-detail-panel.png]** — Customer panel showing header, stats, contact info, and activity timeline

**Header:** Customer name, tier badge, segment, city.

**Stats:**
- FY Turnover (annual revenue from this customer)
- Total Revenue (cumulative)
- Composite Rating (0–100)

**Details:** GSTIN, payment terms, incoterms, currency.

**Primary Contact:** Name, role, email, phone. Quick-action buttons:
- 📞 Dial the phone number
- 🟢 Open WhatsApp
- ✉ Compose email

**Next Expected Orders:** Tags showing what products this customer is expected to order next.

### 8.3 Editing a Customer

1. In the detail panel, click the **Edit** button.
2. Update the **Tier**, **Turnover**, **Ratings** (Payment, Orders, Trend), or **Next Orders**.
3. Ratings are on a 0–10 scale and determine the tier automatically.

### 8.4 Adding a New Customer

Click **New Customer**. Fill in:
- Company name and code
- Segment
- GSTIN
- Site(s) with address
- Contact(s) with email and phone

Customers are also auto-created when you type a new name in the enquiry or quote form.

---

## 9. Analytics (Module 05)

> 📸 **[SCREENSHOT: analytics-full.png]** — Analytics page showing all KPI cards and charts

**Opening:** Click **Analytics** in the sidebar.

### 9.1 KPI Cards

| Card | Description |
|------|------------|
| Avg E2Q Time | Average hours from enquiry receipt to quote send |
| SLA Compliance | % of enquiries responded within their urgency SLA |
| Win Rate | Won quotes ÷ total closed (Won + Lost) |
| Total Line Items | Sum of items across all enquiries |
| Total Pipeline | INR value of all Sent quotes |

### 9.2 Charts

**E2Q Time by Customer** — horizontal bar chart showing your top 5 customers by average response time. Green bars = within target, red = over.

**Conversion Funnel** — shows drop-off at each stage from enquiry to order. Useful for spotting where deals are lost.

**Sources Breakdown** — donut chart showing which channels generate the most enquiries.

**SLA by Urgency** — grouped bars comparing actual response time vs target for Hot, Urgent, Normal, and Low enquiries.

---

## 10. Customer Intel Board

> 📸 **[SCREENSHOT: intel-board-full.png]** — Intel board with ranked list on left and customer 360 on right

**Opening:** Click **Customer Intel** in the sidebar.

If a PIN has been set in Settings → Intelligence, you will see a PIN entry screen first. Enter the PIN to unlock. The unlock persists for the browser tab session.

> 📸 **[SCREENSHOT: intel-pin-gate.png]** — PIN entry screen

### 10.1 Customer List (Left Panel)

Shows all customers ranked by a metric. Change the ranking using the sort pills at the top:
- **Pipeline Value** — total value of Sent quotes
- **Win Rate** — Won ÷ closed enquiries
- **Enquiries** — total enquiry count

Each row shows: customer avatar, name, segment, win-rate badge (green ≥65% / amber ≥45% / red <45%), and pipeline value.

Click a customer to view their 360° detail on the right.

### 10.2 Customer 360° Detail (Right Panel)

**KPI Strip (5 cells):**
- Enquiries (total)
- Win Rate (vs company average)
- Open Pipeline (INR, from Sent quotes)
- Won Revenue (INR, from orders)
- Last Activity (date of most recent follow-up log)

**Conversion Funnel:** Per-customer horizontal bar showing Enquiries → Quoted → Won.

**Revenue Trend:** 6-month mini bar chart built from order dates.

**All Quotations:** Table of every quote for this customer with status badge, value, and date.

**Activity Timeline:** All follow-up logs across all this customer's quotes, sorted newest first.

---

## 11. Documents & Attachments

Every Enquiry, Quotation, and Order has its own **Document Manager**.

### 11.1 Opening the Document Manager

Click **Docs** on any row in the Enquiry, Quotation, or Order register.

> 📸 **[SCREENSHOT: document-manager.png]** — Attachment modal showing upload area and file list

### 11.2 Uploading Files

1. Click inside the upload area or drag and drop a file.
2. Select the document type from the dropdown (e.g. Drawing, PO Document, Enquiry Doc).
3. The file uploads immediately and appears in the list below.

Accepted file types: PDF, PNG, JPG, DWG, DOCX, XLSX.

### 11.3 Downloading Files

Click the **download icon** next to any file to download it.

### 11.4 Deleting Files

Click the **trash icon** next to a file to delete it permanently.

### 11.5 PO Submissions (Orders)

When a customer submits a PO through the public link emailed to them, it appears in the Document Manager under **"Customer Submissions"** with a read-only tag. These cannot be deleted from the app.

> 📸 **[SCREENSHOT: po-submission-in-docs.png]** — Document manager showing a customer-submitted PO with "Submitted by Customer" label

---

## 12. Settings

**Opening:** Click **Settings** at the bottom of the sidebar.

> 📸 **[SCREENSHOT: settings-tabs.png]** — Settings page showing all 5 tabs

Settings are organized into five tabs. Click a tab to switch. Click **Save Settings** (top right) to save all changes.

---

### 12.1 PDF & Branding

> 📸 **[SCREENSHOT: settings-pdf-tab.png]** — PDF & Branding tab showing header upload and signatory table

**PDF Header / Letterhead:**
- Upload your company letterhead image (PNG or JPG, recommended width 1200px).
- This appears at the top of all PDF quotes and proforma invoices.
- Click **Remove** to clear it.

**Signature / Stamp Image:**
- Upload a PNG with transparent background (110×110px recommended).
- Appears in the signatory section of PDFs.

**Authorized Signatories:**
A table of people authorised to sign quotations and invoices.

| Column | Description |
|--------|------------|
| Name | Full name as it appears on the PDF |
| Designation | Job title |
| Phone | Contact number |
| Default | The default signatory is auto-selected on new quotes |

**Adding a signatory:**
1. Fill in Name, Designation, and Phone in the fields below the table.
2. Click **Add**.

**Setting a default:** Click the **star icon** next to a signatory.

**Deleting:** Click the **trash icon**. You cannot delete the default signatory.

---

### 12.2 Bank Details

> 📸 **[SCREENSHOT: settings-bank-tab.png]** — Bank details tab with input fields

Fill in your company's bank account details:
- Bank Name
- Account Number
- IFSC Code
- SWIFT Code (for international payments)

These appear on all Proforma Invoice PDFs.

---

### 12.3 Gmail Integration

> 📸 **[SCREENSHOT: settings-gmail-tab.png]** — Gmail tab showing toggle, labels field, and sync controls

**Purpose:** Automatically pull customer enquiry emails into the app.

**Setup:**
1. Toggle **Enable Gmail Sync** on.
2. Enter the Gmail **labels** to watch (comma-separated, e.g. `Enquiries, Customer RFQ`).
3. Set **Sync Frequency** in minutes (minimum 5, recommended 15).
4. Click **Save Settings**.
5. Click **Sync Now** to trigger an immediate sync.

The **Auth Status** indicator shows whether the Gmail token is active. If it shows "Inactive", click the **Connect Gmail** button and complete the Google authorization flow.

**Last Sync** timestamp updates after each sync. Emails from the watched labels are imported as new enquiries if they have not been seen before.

---

### 12.4 Intelligence PIN

> 📸 **[SCREENSHOT: settings-intel-tab.png]** — Intelligence tab showing PIN field

Set a numeric PIN to protect the Customer Intel Board. Leave blank to allow all logged-in users to access it without a PIN.

To change the PIN: type the new PIN in the field and click **Save Settings**.

---

### 12.5 Integrations (Google Sheets)

> 📸 **[SCREENSHOT: settings-integrations-tab.png]** — Integrations tab showing Sheets URL and Drive Folder ID fields

**Purpose:** One-click export of orders to a Google Sheet for production planning.

**Fields:**

| Field | What to Enter |
|-------|--------------|
| Apps Script Web App URL | The `/exec` URL from your deployed Google Apps Script |
| Google Drive Folder ID | The ID from the URL of your target Drive folder (the long string after `/folders/`) |

**One-time setup (do this before first export):**

**Step 1 — Create the Apps Script**
1. Open your target Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Delete all existing code and paste the Apps Script provided by your administrator.
4. Press **Ctrl+S** to save.

**Step 2 — Deploy the Apps Script**
1. Click **Deploy** (top right) → **New deployment**.
2. Click the gear icon next to "Select type" → **Web App**.
3. Set **Execute as:** Me.
4. Set **Who has access:** Anyone.
5. Click **Deploy**.
6. Copy the Web App URL (ends in `/exec`).
7. Click through any authorization prompts — allow all requested permissions including Google Drive and Google Sheets.

**Step 3 — Configure in Settings**
1. Paste the Web App URL into the **Apps Script Web App URL** field.
2. Open your target Drive folder in a browser. Copy the folder ID from the URL:  
   `https://drive.google.com/drive/folders/`**`THIS_IS_THE_ID`**
3. Paste it into the **Google Drive Folder ID** field.
4. Click **Save Settings**.

**Step 4 — Share the Drive folder (for Shared Drives)**
If your target folder is in a **Shared Drive** (not My Drive), the Google account that runs the Apps Script must be a member of that Shared Drive:
1. Open the Shared Drive in Google Drive.
2. Click the gear icon → **Manage members**.
3. Add the Apps Script account email as **Content Manager** or **Contributor**.

> After this setup, each order row in the register will show the green spreadsheet icon for export.

**Re-deploying after script changes:**
Any time the Apps Script code is updated, you must create a **New Version** of the deployment:
1. Extensions → Apps Script → Deploy → Manage deployments.
2. Click the **pencil icon** on the existing deployment.
3. Change **Version** to **New version**.
4. Click **Deploy**.

> ⚠️ Simply saving the script in the editor does NOT update the running deployment. A new version is always required.

---

## 13. Keyboard Shortcuts & Tips

### Global Search

Use the **search bar** in the top bar (present on Enquiries, Quotations, Orders, and Customers pages) to filter the visible list instantly. There is no need to press Enter — results filter as you type.

### Navigation Tips

- Clicking on a row in any register **expands** it to show line items inline.
- Clicking the same row again **collapses** it.
- Action buttons (Edit, PDF, Docs, etc.) are on the right side of each row. Click them without expanding the row first.

### Date Format

All dates in the app use **DD MMM YYYY** format (e.g. 14 May 2026) for display. When entering dates in form fields, use the date picker — do not type dates manually.

### INR Formatting

All currency values are displayed in Indian Rupee format:
- Values ≥ 1 Crore: shown as "X.XX Cr"
- Values ≥ 1 Lakh: shown as "X.XX L"
- Values below 1 Lakh: shown as "₹XX,XXX"

### Auto-Numbering

All IDs are auto-generated and cannot be manually set:
- Enquiries: `ENQ-YYYY-NNN`
- Quotations: `Q-YYYY-NNN`
- Orders: `ORD-YYYY-NNN`

The number resets to 001 at the start of each calendar year.

### Unsaved Changes

The app does **not** warn you before navigating away from an unsaved form. Always click **Save** before leaving a form page.

---

*For technical issues or to report a bug, contact your system administrator.*