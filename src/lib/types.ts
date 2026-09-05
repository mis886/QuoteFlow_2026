export type EnqStatus = 'New' | 'In Review' | 'Quoted' | 'Won' | 'Lost' | 'Parked';
export type Urgency = 'Hot' | 'Urgent' | 'Normal' | 'Low';
export type QuoteStatus = 'Draft' | 'Sent' | 'Won' | 'Lost' | 'Parked';
export type OrderStatus = 'Order Confirmed' | 'Processing' | 'Delivered' | 'Order Pending for Dispatch';

export interface LineItem {
  seq: number;
  desc: string;
  mat: string;
  qty: number;
  uom: string;
  drwg?: string;
  hsn?: string;
  packing?: string;
  packingType?: string;
}

export interface QuoteItem extends LineItem {
  hsn: string;
  unitPrice: number;
  gst: number;
  total: number;
  rateOverride?: boolean;     // when true, rate cell shows rateText (or "Regret") instead of numeric
  rateText?: string;          // custom text for rate cell when rateOverride is on
  priceBasis?: string;        // unit the rate is quoted per (e.g. "Mtr") — when different from qty UOM
  priceBasisConv?: number;    // conversion: 1 qty-UOM = N priceBasis units (e.g. 1 Nos = 3.2 Mtr)
}

export interface OrderItem extends LineItem {
  hsn?: string;
  agreedRate: number;
  gst: number;
  total: number;
  remarks?: string;
  priceBasis?: string;
  priceBasisConv?: number;
  rateOverride?: boolean;
  rateText?: string;
}

// Extra taxes (VAT/TDS/TCS…) and charges (Freight/P&F…) on an order.
// Percentage lines are computed on the items sub-total (excl. GST).
export type OrderAdjustmentKind = 'tax' | 'charge' | 'other';
export interface OrderAdjustment {
  id: string;
  kind: OrderAdjustmentKind;       // grouping/label hint
  label: string;                   // e.g. 'Freight', 'TDS', 'Packing & Forwarding'
  mode: 'percent' | 'value';       // % of sub-total, or fixed amount
  rate: number;                    // the % or the fixed amount, as entered
  direction: 'add' | 'deduct';     // add (charges) or deduct (e.g. TDS withheld)
  taxable?: boolean;               // true = added to taxable value BEFORE GST (e.g. P&F, Freight);
                                   // false/undefined = applied to the total AFTER GST (e.g. TDS, TCS)
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
  extraEmails?: string[];
  phone?: string;
  extraPhones?: string[];
  isPrimary?: boolean;
}

export interface Site {
  id: string;
  name: string;
  city: string;
  state?: string;
  country?: string;
  address?: string;
  fullAddress?: string;
  dispatchAddress?: string;
  transporter?: string;
  leadTimeNote?: string;
  gstin?: string;
  pincode?: string;
  isPrimary?: boolean;
  contacts: Contact[];
}

export interface NextOrder {
  product: string;
  qty?: number;
  date?: string; // ISO date YYYY-MM-DD
}

export interface Attachment {
  id: string;
  fileName: string;
  storagePath: string;
  uploadedAt: string;
}

export interface Enquiry {
  id: string;
  recv: string;
  src: string;
  cust: string;
  custEnqDocNo?: string;
  siteId?: string;
  contactId?: string;
  contact: string;
  email: string;
  phone?: string;          // customer contact phone
  urg: Urgency;
  status: EnqStatus;
  assigned: string;
  doer?: string;
  created_by?: string;     // display name of the user who created the enquiry
  notes: string;
  ageH: number;
  qRef: string | null;
  items: LineItem[];
  attachments?: Attachment[];
  authorizedPerson?: {
    name: string;
    designation: string;
    phone?: string;
  };
  customerTier?: CustomerTier;
  gmailMessageId?: string;
  created_at?: string;     // when the enquiry was punched into the system
}

export interface Quote {
  id: string;
  enqRef: string | null; // ON DELETE SET NULL if the enquiry it was raised from is deleted
  cust: string;
  siteId?: string;
  contactId?: string;
  contact?: string;
  email?: string;
  phone?: string;             // customer contact phone (carried from enquiry)
  date: string;
  validity: string;
  status: QuoteStatus;
  inco: string;
  curr: string;
  pay: string;
  items: QuoteItem[];
  notes?: string[];           // numbered notes printed below item table in PDF
  attachments?: Attachment[];
  authorizedPerson?: {
    name: string;
    designation: string;
    phone?: string;
  };
  customerTier?: CustomerTier;
  terms?: string;
  insurance?: number;         // INR only; user-applied 0.15% charge on subtotal
  unitId?: string;
  custEnquiryDocNo?: string;
  doer?: string;
  created_at?: string;        // when the quote was punched into the system
  sent_at?: string;           // when "Mark Sent" was clicked (sent to customer)
  negotiations?: NegotiationRound[];
}

// One round of price/terms negotiation on a quote. Keys match the jsonb shape
// stored in quotes.negotiations exactly — no camelCase translation layer.
export interface NegotiationRound {
  round: number;
  date: string;
  requested_by: 'customer' | 'internal';
  notes?: string;
  doer: string;
  created_at: string;
  items: NegotiationRoundItem[];
}

// Snapshot of one quote line item as it stood when this round was added —
// copied at save time, not live-joined back to quotes.items later (items
// can themselves be edited/reordered after). Mirrors the fields shown in
// the quote's own Line Items table so the historical record is self-
// contained (same HSN/packing/GST/etc. detail the doer saw when negotiating).
export interface NegotiationRoundItem {
  seq: number;
  desc: string;
  hsn: string;
  qty: number;
  packing?: string;
  packingType?: string;
  priceBasis?: string;
  gst: number;
  original_unit_price: number;
  revised_unit_price: number | null;
  discount_pct: number | null;
}

export interface Order {
  id: string;
  quoteRef: string | null; // ON DELETE SET NULL if the source quotation is deleted
  enqRef: string | null;   // ON DELETE SET NULL if the source enquiry is deleted
  cust: string;
  siteId?: string;
  contactId?: string;
  contact?: string;
  email?: string;
  phone?: string;             // customer contact phone (carried from quote)
  custEnquiryDocNo?: string;  // carried enquiry → quote → order
  poNo: string;
  poDate: string;
  dlvDate: string;
  scheduleDate?: string;
  status: OrderStatus;
  value: number;
  insurance?: number;      // INR only; user-applied 0.15% charge on subtotal
  inco?: string;
  curr?: string;
  pay?: string;
  items: OrderItem[];
  created_at?: string;
  updated_at?: string;
  adjustments?: OrderAdjustment[];   // line taxes & charges applied between GST and Grand Total
  poFileName?: string;
  attachments?: Attachment[];
  authorizedPerson?: {
    name: string;
    designation: string;
    phone?: string;
  };
  customerTier?: CustomerTier;
  terms?: string;
  bankingDetails?: {
    bankName: string;
    accountNo: string;
    ifscCode: string;
    branchName?: string;
    swiftCode?: string;
  };
  unitId?: string;
  bankAccountId?: string;
  priceBasis?: string;
  countryOfOrigin?: string;
  eximCode?: string;
  customPoint?: string;
  pan?: string;
  hsn?: string;
  shipToAddress?: string;
  sheetsExportedAt?: string;
  doer?: string;
  // Dispatch-related fields, capturable at order-creation time and carried
  // forward as defaults when a dispatch entry is later created for this order.
  fulfillmentType?: DispatchFulfillmentType;
  transporter?: string;
  promisedDeliveryDate?: string;
  estimatedDeliveryDate?: string;
  remark?: string;
  // Set on the leftover order automatically created by a partial dispatch —
  // points back to the order it was split off from, for traceability.
  splitFromOrderId?: string;
  // One-way flag: set true the first time a dispatch entry is created for a
  // split order, and never reset — used to permanently hide it from the
  // Orders module even after that dispatch entry is later deleted.
  dispatchFinalized?: boolean;
}

export interface CompanyUnit {
  id: string;
  name: string;
  gstin?: string;
  address?: string;
  signatory_id?: string;
  header_url?: string | null;
  sig_url?: string | null;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BankAccount {
  id: string;
  unit_id: string;
  beneficiary: string;
  bank_name: string;
  branch_address?: string;
  account_no: string;
  ifsc: string;
  branch_code?: string;
  micr?: string;
  swift?: string;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type CustomerTier = 'New' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface Customer {
  id: string;            // = customer_id in DB
  code: string;          // same as id (customer_id)
  name: string;          // company_name
  seg: string;           // industry_segment
  gstin: string;
  pan?: string;
  inco: string;          // incoterms
  curr: string;          // currency
  pay: string;           // payment_terms
  sites: Site[];         // primary site maps to city/billing_address/state/pincode + contacts
  tier?: CustomerTier;
  turnover?: number;     // last_fy_turnover
  revenue?: number;      // revenue_ytd
  ratingPayment?: number;    // payment_rating
  ratingOrders?: number;     // orders_rating
  ratingTrend?: number;      // trend_rating
  overallRating?: number;    // overall_rating (DB computed, read-only)
  creditLimit?: number;      // credit_limit
  nextOrder1?: NextOrder;    // next_order_product1 / qty1 / date1
  nextOrder2?: NextOrder;    // next_order_product2 / qty2 / date2
  crossSellOpportunities?: string;
  notes?: string;
  totalQuotes?: number;  // total_quotes (read-only from DB)
  createdBy?: string;    // created_by
  createdDate?: string;  // created_date
  modifiedBy?: string;   // modified_by
  modifiedDate?: string; // modified_date
  nextOrders?: string[]; // derived display list (product names from nextOrder1/2)
  customerType?: string; // customer_type
  crm?: string; // crm (DB column) — name of the person/CRM owner handling this customer
  fulfilmentType?: string; // fulfilment_type — customer's typical pattern: 'Self Pickup' | 'Delivery' | 'Both', derived from order history. Used to default Order/Dispatch fulfillment type + transporter.
}

export interface FollowUpLog {
  ts: string;
  who: string;
  channel: 'Called' | 'To Call' | 'WhatsApp' | 'Email' | 'Meeting' | 'Visit' | 'Internal';
  note: string;
  nextDate?: string;
  nextTime?: string;
  nextChannel?: string;
  nextNote?: string;
}

// ── Pipeline / Kanban ──────────────────────────────────────────────
// The board tracks an enquiry all the way to won. The first two lanes are
// derived from enquiry status (no quote yet); the rest are quote stages
// stored on the FollowUp record.

// Quote-stage values persisted on FollowUp.stage. 'Closed' is one lane;
// the actual result lives in `outcome`.
export type PipelineStage =
  | 'Sent Quotation'
  | 'Offer Acknowledged'
  | '1st Follow-up'
  | '2nd Follow-up'
  | 'Negotiation'
  | 'Closed';

export type PipelineOutcome = 'Won' | 'Lost' | 'Rejected' | 'Other';

// All board lanes left→right. 'New Enquiry' and 'To Quote' are enquiry-backed
// (pre-quote); the remainder map 1:1 to PipelineStage.
export type BoardLane = 'New Enquiry' | 'To Quote' | PipelineStage;

export const PIPELINE_STAGES: PipelineStage[] = [
  'Sent Quotation',
  'Offer Acknowledged',
  '1st Follow-up',
  '2nd Follow-up',
  'Negotiation',
  'Closed',
];

export const BOARD_LANES: BoardLane[] = ['New Enquiry', 'To Quote', ...PIPELINE_STAGES];

// Default turnaround time (in days) allowed in each lane before a TAT warning.
// 'Closed' has no TAT — the clock stops once closed.
// Kept for backward-compat with configs saved before TAT became hour-precise.
export const DEFAULT_STAGE_TAT: Record<BoardLane, number> = {
  'New Enquiry': 1,
  'To Quote': 2,
  'Sent Quotation': 1,
  'Offer Acknowledged': 2,
  '1st Follow-up': 3,
  '2nd Follow-up': 4,
  'Negotiation': 7,
  'Closed': 0,
};

// Default TAT in HOURS — the canonical unit. Derived from the day defaults.
export const DEFAULT_STAGE_TAT_H: Record<BoardLane, number> = {
  'New Enquiry': 24,
  'To Quote': 48,
  'Sent Quotation': 24,
  'Offer Acknowledged': 48,
  '1st Follow-up': 72,
  '2nd Follow-up': 96,
  'Negotiation': 168,
  'Closed': 0,
};

export interface FollowUp {
  id: string; // quote_id
  quote_id: string | null; // ON DELETE SET NULL if the quote is deleted — row survives, orphaned
  owner: string;
  next_date: string | null;
  next_time?: string | null;
  status?: 'open' | 'closed';
  stage?: PipelineStage;            // current quote-stage lane
  stage_entered_at?: string;        // ISO ts the card entered `stage` (TAT clock)
  outcome?: PipelineOutcome | null; // result when stage === 'Closed'
  logs: FollowUpLog[];
  created_at?: string;
  updated_at?: string;
}

// ── Team roster / doer KPI ─────────────────────────────────────────
// Maps a free-text doer/owner/who identity to the process role that person
// owns, so the Doer KPI page can aggregate per-role scores. Stored in the
// `team_roster` table; see migrations/2026-06-08_team_roster.sql.
export type DoerRole =
  | 'DEO'          // enters enquiries; converts quote→order on PO
  | 'Rate Entry'   // enters rates, turns enquiry into quote, marks sent
  | 'SC_1'         // runs follow-ups per the TAT pipeline after quote sent
  | 'Negotiation'  // handles cards in the Negotiation lane
  | 'PI Sender'    // Accounts; issues the Proforma Invoice (scoring deferred)
  | 'Technical'    // MIS / system administration
  | 'Admin'        // full-access administrator
  | 'Other';

export const DOER_ROLES: DoerRole[] = ['DEO', 'Rate Entry', 'SC_1', 'Negotiation', 'PI Sender', 'Technical', 'Admin', 'Other'];

// Default role that owns each board lane. Editable per lane in Settings →
// Pipeline TAT (persisted as AppSettings.pipeline_roles). Used to show each
// doer the cards sitting in the stages their role owns.
export const DEFAULT_STAGE_ROLE: Record<BoardLane, DoerRole> = {
  'New Enquiry': 'DEO',
  'To Quote': 'Rate Entry',
  'Sent Quotation': 'SC_1',
  'Offer Acknowledged': 'SC_1',
  '1st Follow-up': 'SC_1',
  '2nd Follow-up': 'SC_1',
  'Negotiation': 'Negotiation',
  'Closed': 'Other',
};

export interface TeamMember {
  email: string;          // join key; matched case-insensitively to doer/owner/who
  display_name: string;
  role: DoerRole;
  active: boolean;
  // Extra identities this login appears under in older records (e.g. an old
  // Google profile name from before a rename). Also matched to doer/owner/who
  // so historical data attributes correctly. Lowercased.
  aliases?: string[];
  // SHA-256 hash of this doer's identity password (set by admin). Empty/absent =
  // no password required. Never displayed.
  password_hash?: string;
}

// Minimal date-range shape used by KPI aggregation (mirrors the store's
// GlobalDateRange without importing from the store, to avoid a cycle).
export interface GlobalDateRangeLike {
  startDate?: string;
  endDate?: string;
}

export interface DataStore {
  enquiries: Enquiry[];
  quotes: Quote[];
  orders: Order[];
  customers: Customer[];
  followups: FollowUp[];
  settings: AppSettings | null;
  signatories: AuthorizedSignatory[];
  units: CompanyUnit[];
  bankAccounts: BankAccount[];
  roster: TeamMember[];
  dispatchEntries: DispatchEntry[];
  tickets: Ticket[];
}

// ── Dispatch (Order → Dispatch) ────────────────────────────────────
// One dispatch_entries row per order, created manually (mirrors the
// real-world manual Google Form fill for the HTPL Self Pickup FMS / HTPL
// Delivery FMS). See src/pages/Dispatch.tsx and src/pages/NewDispatchEntry.tsx
// for the UI.
export type DispatchFulfillmentType = 'self_pickup' | 'delivery';

export interface DispatchEntry {
  id: string;
  orderId: string;
  fulfillmentType: DispatchFulfillmentType;
  docLinkStatus: 'attached' | 'not_uploaded';
  docLinkUrl?: string;
  vehicleNumber?: string;    // self pickup (SP7)
  transporter?: string;      // delivery (DO8), optional
  remark?: string;
  numUnits?: string;         // "Number of Drum/Bag" from the intake form
  unit?: string;             // kgs / lts / ml / gm
  promisedDeliveryDate?: string;
  estimatedDeliveryDate?: string;
  formFilledBy?: string;
  createdBy?: string;
  created_at?: string;
  updated_at?: string;
  // The line items actually being dispatched in this specific dispatch
  // action — captured here, independent of the order's own (unchanged)
  // items, so a partial dispatch doesn't overwrite the order's confirmed
  // total. Any undispatched remainder gets split into a separate order
  // instead. insurance/value are this dispatch's own totals, same idea.
  items?: OrderItem[];
  insurance?: number;
  value?: number;
}

// ── Tickets (internal issue-tracking) ──────────────────────────────
// One row per ticket, no threaded replies — a single description in, a
// single resolution note out, plus a status field. Raised by any staff
// member (src/pages/TicketRaise.tsx), triaged/resolved by admins
// (src/pages/TicketResolver.tsx). See supabase/migrations/20260831060000_add_tickets_table.sql.
export type TicketModule = 'Enquiry' | 'Quotation' | 'Order' | 'Dispatch' | 'Customer' | 'Sampling' | 'Other';
export type TicketPriority = 'Low' | 'Medium' | 'High';
export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export interface Ticket {
  id: string;
  raisedByEmail: string;
  raisedByName: string;
  module: TicketModule;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  attachmentPath?: string;
  attachmentName?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  created_at?: string;
  updated_at?: string;
}

// Stockbook module — lot-wise raw-material stock ledger, migrated from the
// "Stock Lot Godown Wise" tab of the HIMALAYA STOCK SUMMARY Google Sheet.
// Quantity is split across whichever party/godown currently holds it.
// See supabase/migrations/20260901060000_create_stock_lots_table.sql.
// 2026-09-04: lot_type ("Type") and tanker_unload ("Tanker Unload") were
// dropped from the table entirely. op_qty/unit/packaging_type were also
// dropped and merged into no_of_barrels/mou/packing_type — the same
// columns the Stock Inward form (NewStockInward.tsx) writes to — so data
// entered via Inward now shows up in Stockbook instead of landing in
// columns nobody displayed. See
// supabase/migrations/20260904130000_stockbook_drop_type_tanker_merge_columns.sql.
export interface StockLot {
  id: string;
  serialNo?: number;          // running S.No. — matches the original sheet's row order for migrated lots
  whLotNo?: string;
  factLotNo?: string;
  productCode?: string;
  productName: string;
  inwardDate?: string;        // ISO date
  sampleOff: boolean;
  // No of Barrels used to be its own field here — removed from the Stockbook
  // UI 2026-09-05 (see StockLotModal.tsx's comment): it was editable
  // independently of the qty_* party columns below and could silently
  // diverge from the real per-warehouse barrel count that Stock Movements'
  // Inward/Outward forms track. The stock_lots.no_of_barrels column still
  // exists and is still written once at lot creation (NewStockInward.tsx),
  // but Stockbook no longer reads or edits it.
  coaFile?: string;
  coaUrl?: string;             // public Supabase Storage URL for the actual COA PDF, when one has been uploaded/matched
  qtyHariom?: number;
  qtyWadaHe?: number;
  qtyHe?: number;
  qtyReliable?: number;
  qtySwastik?: number;
  qtyBalaji?: number;
  qtyWada?: number;
  packing?: number;             // legacy numeric "pack size per unit" — set via StockLotModal's manual edit, NOT by Inward
  packingDetail?: string;       // packing_detail column — Inward's own "Packing" field (text); the value a lot created via
                                 // New Inward actually has, since Inward never writes the legacy numeric `packing` above
  mou?: string;                 // mou column (Measure of Unit) — shared with the Stock Inward form
  packingType?: string;         // packing_type column — shared with the Stock Inward form
  quantity?: number;
  make?: string;
  remark?: string;
  created_by?: string;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Stock Movements module — append-only inward/outward ledger, replacing the
// "Stock Inward" Google Form. Saving an inward entry also upserts the
// matching stock_lots row (by wh_lot_no) so Stockbook's running balances
// stay correct — this table is the immutable transaction log, stock_lots
// is the current-balance view. See src/pages/StockMovements.tsx and
// supabase/migrations/20260903060000_create_stock_movements_table.sql.
export type StockMovementType = 'inward' | 'outward';
// The Inward form's Warehouse dropdown only ever offers these 4 parties/
// godowns. Outward has its own separate list (adds WADA + free-text
// "Other") defined locally in NewStockOutward.tsx.
export type StockMovementWarehouse = 'Hariom' | 'Reliable' | 'Swastik' | 'Balaji';

export interface StockMovement {
  id: string;
  type: StockMovementType;
  warehouse: string;
  whLotNo?: string;          // required for inward; optional for outward (a DO can be logged with no known lot)
  stockCategory?: string;
  factLotNo?: string;        // inward only — stock_movements.fact_lot_no
  productName: string;
  inwardDate?: string;       // stock_movements.inward_date — Inward's "Inward Date"; also holds Outward's own "Lot Date" (shared DB column)
  lotQty?: number;
  packing?: number;          // outward's own "Packing" field (stock_movements.packing) — NOT the same as packingDetail below
  weightType?: string;       // outward's own "Weight Type" field (stock_movements.weight_type)
  packagingType?: string;    // outward's own "Type" field (stock_movements.packaging_type)
  totalQty?: number;
  make?: string;
  remark?: string;
  // Inward-only fields — exclusive columns added for the Stock Inward form
  // (see supabase/migrations/20260903120400_stock_inward_exclusive_columns.sql).
  // Deliberately separate from packing/weightType/packagingType above, which
  // Inward does NOT write to — do not conflate the two sets.
  noOfBarrels?: string;      // stock_movements.no_of_barrels
  mou?: string;              // stock_movements.mou (Measure of Unit — KG/LTR)
  packingType?: string;      // stock_movements.packing_type (16-option Packing Type list)
  packingDetail?: string;    // stock_movements.packing_detail (Inward's own "Packing" field)
  sampleOff?: boolean;       // stock_movements.sample_off — mirrors stock_lots.sample_off
  coaFile?: string;          // stock_movements.coa_file — mirrors stock_lots.coa_file
  coaUrl?: string;           // stock_movements.coa_url — mirrors stock_lots.coa_url
  // Outward-only fields (Delivery Order Sale form) — see src/pages/NewStockOutward.tsx
  // and supabase/migrations/20260903120000_stock_movements_add_outward_columns.sql.
  doNumber?: string;
  doDate?: string;
  numArticles?: string;
  partyName?: string;
  otherParty?: string;
  transporter?: string;
  otherTransporter?: string;
  note?: string;
  created_by?: string;
  created_at?: string;
}

export interface AuthorizedSignatory {
  id: string;
  name: string;
  designation: string;
  phone: string;
  is_default: boolean;
}

export interface AppSettings {
  id: string;
  header_url: string | null;
  sig_url: string | null;
  bank_name: string;
  bank_acc: string;
  bank_ifsc: string;
  bank_swift: string;
  gmail_enabled: boolean;
  gmail_labels: string[];
  gmail_sync_freq: number;
  gmail_last_sync: string | null;
  intelligence_pin?: string;
  sheets_webhook_url?: string;
  sheets_drive_folder_id?: string;
  signatory_name?: string;
  signatory_title?: string;
  signatory_phone?: string;
  // Per-lane TAT in days (legacy). Superseded by pipeline_tat_h.
  pipeline_tat?: Partial<Record<BoardLane, number>>;
  // Per-lane TAT in HOURS, editable in Settings. Falls back to pipeline_tat
  // (×24) then DEFAULT_STAGE_TAT_H.
  pipeline_tat_h?: Partial<Record<BoardLane, number>>;
  // Which role owns each board lane. Drives the per-doer stage workload on the
  // Doer KPI page. Missing lanes fall back to DEFAULT_STAGE_ROLE.
  pipeline_roles?: Partial<Record<BoardLane, DoerRole>>;
}
