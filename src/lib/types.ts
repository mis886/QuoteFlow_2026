export type EnqStatus = 'New' | 'In Review' | 'Quoted' | 'Won' | 'Lost' | 'Parked';
export type Urgency = 'Hot' | 'Urgent' | 'Normal' | 'Low';
export type QuoteStatus = 'Draft' | 'Sent' | 'Won' | 'Lost' | 'Parked';
export type OrderStatus = 'Processing' | 'Delivered';

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
  phone?: string;
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
  notes: string;
  ageH: number;
  qRef: string | null;
  items: LineItem[];
  attachments?: Attachment[];
  gmailMessageId?: string;
  created_at?: string;     // when the enquiry was punched into the system
}

export interface Quote {
  id: string;
  enqRef: string;
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
  terms?: string;
  unitId?: string;
  custEnquiryDocNo?: string;
  doer?: string;
  created_at?: string;        // when the quote was punched into the system
  sent_at?: string;           // when "Mark Sent" was clicked (sent to customer)
}

export interface Order {
  id: string;
  quoteRef: string;
  enqRef: string;
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
  status: OrderStatus;
  value: number;
  inco?: string;
  curr?: string;
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
  nextOrders?: string[]; // derived display list (product names from nextOrder1/2)
}

export interface FollowUpLog {
  ts: string;
  who: string;
  channel: 'Called' | 'To Call' | 'WhatsApp' | 'Email' | 'Meeting' | 'Visit';
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
  quote_id: string;
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
  | 'Other';

export const DOER_ROLES: DoerRole[] = ['DEO', 'Rate Entry', 'SC_1', 'Negotiation', 'PI Sender', 'Other'];

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
  // Extra identities this login appears under in older records (e.g. a Google
  // profile name like "Himalaya TerpenesRubber Technologies A"). Also matched to
  // doer/owner/who so historical data attributes correctly. Lowercased.
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
