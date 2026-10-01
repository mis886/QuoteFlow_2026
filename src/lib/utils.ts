import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { OrderAdjustment, Customer, NegotiationRound, NegotiationRoundItem, QuoteItem, Quote, TeamMember } from './types';

export const ALLOWED_DELETE_EMAILS = ['shishir@himalayaterpene.com', 'mis@himalayaterpene.com'];

// ── Payment Terms — shared across Orders, Quotations, and Customers ──────────

export const PAY_OPTIONS = [
  '1 Day', '3 Days', '7 Days', '10 Days', '14 Days', '18 Days', '30 Days Net', '45 Days',
  '60 Days', '90 Days', '120 Days', '50% Advance, 50% on Delivery', '100% Advance',
  'LC at Sight', 'Advance',
] as const;

/** Advance-type terms that require a PI (Proforma Invoice) rather than an OC (Order Confirmation). */
export const ADVANCE_PAY = new Set<string>(['Advance', '100% Advance']);

// Shared allowlist for order-side actions gated to Accounts/Mumbai office:
// confirming payment received (Order Confirmed) and marking an order Complete
// (Delivered). Both checks currently allow the same two people — one list,
// two named predicates so call sites stay self-documenting about which
// permission they're actually checking.
export const ALLOWED_ORDER_ACTION_EMAILS = ['accounts@himalayaterpene.com', 'mum@himalayaterpene.com'];
export const canConfirmPayment = (email: string | null | undefined): boolean =>
  ALLOWED_ORDER_ACTION_EMAILS.includes((email ?? '').toLowerCase());
export const canCompleteOrder = (email: string | null | undefined): boolean =>
  ALLOWED_ORDER_ACTION_EMAILS.includes((email ?? '').toLowerCase());

export function normalizePayTerms(raw: string | undefined): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  const exact = (PAY_OPTIONS as readonly string[]).find(o => o.toLowerCase() === lower);
  if (exact) return exact;
  if (/100.*adv|adv.*100/.test(lower)) return '100% Advance';
  if (/50.*adv|adv.*50/.test(lower)) return '50% Advance, 50% on Delivery';
  if (/lc|sight/.test(lower)) return 'LC at Sight';
  if (/^1\D/.test(lower)) return '1 Day';
  if (/120/.test(lower)) return '120 Days';
  if (/90/.test(lower)) return '90 Days';
  if (/60/.test(lower)) return '60 Days';
  if (/45/.test(lower)) return '45 Days';
  if (/30/.test(lower)) return '30 Days Net';
  if (/14/.test(lower)) return '14 Days';
  if (/10/.test(lower)) return '10 Days';
  if (/7/.test(lower)) return '7 Days';
  if (/3/.test(lower)) return '3 Days';
  if (/adv/.test(lower)) return 'Advance';
  return '';
}
export const canDeleteRecords = (email: string | null | undefined): boolean =>
  ALLOWED_DELETE_EMAILS.includes((email ?? '').toLowerCase());

// Logins allowed to use the "Order Pending for Dispatch" button in Orders
// (sends a confirmed order to Dispatch). sales@ is the shared login used by
// Nimisha Pawar and Ruby; anil@ is intentionally NOT included.
export const SEND_TO_DISPATCH_EMAILS = ['sales@himalayaterpene.com', 'mis@himalayaterpene.com', 'shishir@himalayaterpene.com'];
export const canSendToDispatch = (email: string | null | undefined): boolean =>
  SEND_TO_DISPATCH_EMAILS.includes((email ?? '').trim().toLowerCase());

// Enquiry "Source" options (enquiries.src) — New Enquiry's Source dropdown.
export const ENQUIRY_SOURCES = [
  'Email', 'Phone', 'WhatsApp', 'Exhibition', 'Website', 'Walk-in', 'Referral', 'IndiaMART', 'Meta Ads', 'LinkedIn',
] as const;

// Customer Lead (small / IndiaMART buyers): a lead can be promoted to
// Customer Master once its total order value reaches this (₹1 lakh).
export const LEAD_PROMOTE_THRESHOLD = 100000;
// Orders that don't count toward a lead's total / "ordered at least once".
// 'Lost' is the only dead-order status in OrderStatus (there is no
// Cancelled / Rejected for orders).
export const LEAD_EXCLUDED_ORDER_STATUSES: readonly string[] = ['Lost'];
export const isLead = (c: { customerStatus?: string } | null | undefined): boolean => c?.customerStatus === 'lead';

// ── Customer / lead matching + duplicate check ───────────────────────────────
// Everything here searches BOTH Customer Master rows and Customer Leads (same
// customers table).

// Exact company-name match, trimmed + case-insensitive — the "already exists"
// check used before any enquiry / quote / order creates a lead.
export function findCustomerByName<T extends { name: string }>(name: string | null | undefined, customers: T[]): T | undefined {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return undefined;
  return customers.find(c => (c.name ?? '').trim().toLowerCase() === key);
}

const COMPANY_NOISE_WORDS = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'co', 'company']);
// "M/s. ABC Chemicals (India) Pvt. Ltd." → "abcchemicalsindia"
export function normalizeCompanyName(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/m\/s/g, ' ')
    .replace(/[.,&()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !COMPANY_NOISE_WORDS.has(w))
    .join('');
}

// ── Documents ↔ customers ────────────────────────────────────────────────────
// Enquiries / quotes / orders / samples carry customer_id (customerId). Always
// match on that FIRST; only a document without one falls back to the company
// name (trimmed, case-insensitive) — `cust` is just the printed name snapshot.
type CustomerDocRef = { cust?: string | null; customerId?: string | null };

export function customerOfDoc<T extends { id: string; name: string }>(doc: CustomerDocRef | null | undefined, customers: T[]): T | undefined {
  if (!doc) return undefined;
  if (doc.customerId) {
    const byId = customers.find(c => c.id === doc.customerId);
    if (byId) return byId;
  }
  return findCustomerByName(doc.cust, customers);
}

export function isDocOfCustomer(doc: CustomerDocRef, customer: { id: string; name: string }): boolean {
  if (doc.customerId) return doc.customerId === customer.id;
  const key = (doc.cust ?? '').trim().toLowerCase();
  return !!key && key === (customer.name ?? '').trim().toLowerCase();
}

// customer id → its documents, in one pass (for pages that total every
// customer at once). Same rule as isDocOfCustomer.
export function groupDocsByCustomer<D extends CustomerDocRef>(docs: D[], customers: { id: string; name: string }[]): Map<string, D[]> {
  const ids = new Set(customers.map(c => c.id));
  const idsByName = new Map<string, string[]>();
  for (const c of customers) {
    const key = (c.name ?? '').trim().toLowerCase();
    if (!key) continue;
    const list = idsByName.get(key);
    if (list) list.push(c.id); else idsByName.set(key, [c.id]);
  }
  const out = new Map<string, D[]>();
  const add = (id: string, d: D) => { const list = out.get(id); if (list) list.push(d); else out.set(id, [d]); };
  for (const d of docs) {
    if (d.customerId) { if (ids.has(d.customerId)) add(d.customerId, d); continue; }
    for (const id of idsByName.get((d.cust ?? '').trim().toLowerCase()) ?? []) add(id, d);
  }
  return out;
}

// Sites a document can be raised for: Main Office (S1) + active extra sites.
export const activeSites = <S extends { isActive?: boolean }>(sites: S[] | undefined | null): S[] =>
  (sites ?? []).filter(s => s.isActive !== false);

// ── GSTIN ────────────────────────────────────────────────────────────────────
const GSTIN_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const GSTIN_14_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z$/;
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Greek / Cyrillic capitals that look exactly like Latin ones — they arrive
// via copy-paste from PDFs / WhatsApp and make a GSTIN that looks right but
// never matches anything.
const LOOKALIKES: Record<string, string> = {
  // Greek
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  // Cyrillic
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
};
// Clean a typed / pasted / imported GSTIN or PAN: uppercase, look-alike
// letters → Latin, then drop everything that isn't A–Z / 0–9 (spaces, dots,
// dashes, …). Used on every GSTIN field and before every save.
export function cleanGstin(raw: string | null | undefined): string {
  return (raw ?? '')
    .toUpperCase()
    .replace(/[^\x00-\x7F]/g, ch => LOOKALIKES[ch] ?? ch)
    .replace(/[^A-Z0-9]/g, '');
}

// The 15th character of a GSTIN, computed from its first 14.
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 === 1 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

// A real GSTIN: 15-character format, a valid GST state code, and a correct
// check digit (after cleanGstin, so spaces / case don't matter).
export function isValidGstin(s: string | null | undefined): boolean {
  const g = cleanGstin(s);
  return GSTIN_RX.test(g) && g.slice(0, 2) in GST_STATE_CODES && gstinCheckChar(g) === g[14];
}

// What's wrong with a GSTIN field's value. Blank and "URP" are fine.
//   incomplete — 14 characters, last one missing → `suggestion` is the full GSTIN
//   invalid    — bad format / state code / check digit → blocks saving
export function gstinProblem(value: string | null | undefined): { kind: 'ok' | 'incomplete' | 'invalid'; message: string; suggestion?: string } {
  const g = cleanGstin(value);
  if (!g || g === 'URP') return { kind: 'ok', message: '' };
  if (GSTIN_14_RX.test(g) && g.slice(0, 2) in GST_STATE_CODES) {
    const suggestion = g + gstinCheckChar(g);
    return { kind: 'incomplete', suggestion, message: `GSTIN looks incomplete — last character missing. Did you mean ${suggestion}?` };
  }
  if (!GSTIN_RX.test(g)) return { kind: 'invalid', message: 'Not a valid 15-character GSTIN (leave blank or enter URP if unregistered).' };
  if (!(g.slice(0, 2) in GST_STATE_CODES)) return { kind: 'invalid', message: `GSTIN state code ${g.slice(0, 2)} is not a valid GST state code.` };
  if (gstinCheckChar(g) !== g[14]) return { kind: 'invalid', message: 'GSTIN check digit is wrong — please re-check the number' };
  return { kind: 'ok', message: '' };
}

// PAN = GSTIN characters 3–12. '' when the GSTIN isn't valid.
export const panFromGstin = (gstin: string | null | undefined): string => isValidGstin(gstin) ? cleanGstin(gstin).slice(2, 12) : '';
export const isValidPan = (s: string | null | undefined): boolean => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanGstin(s));

// Only a VALID GSTIN is ever compared — "URP", "NA", "N/A", "-", "NIL",
// "UNREGISTERED", a wrong check digit etc. become '' so they never block a
// save or count as a GSTIN / PAN match.
const normGstin = (s: string | null | undefined): string => isValidGstin(s) ? cleanGstin(s) : '';

// First two digits of a GSTIN = GST state code.
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  // Valid codes with no single state: 97 = Other Territory, 99 = Centre Jurisdiction.
  '97': '', '99': '',
};
export const gstinState = (gstin: string | null | undefined): string =>
  isValidGstin(gstin) ? (GST_STATE_CODES[cleanGstin(gstin).slice(0, 2)] ?? '') : '';
// Loose state-name compare ("Maharashtra" vs "MAHARASHTRA ", "Orissa" vs "Odisha").
const stateKey = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z]/g, '').replace(/and/g, '');
  return k === 'orissa' ? 'odisha' : k === 'uttaranchal' ? 'uttarakhand' : k === 'newdelhi' ? 'delhi' : k === 'pondicherry' ? 'puducherry' : k;
};
// Amber, never blocks: a valid GSTIN whose state code disagrees with the
// State typed for that site. '' = fine.
export function gstinStateWarning(gstin: string | null | undefined, state: string | null | undefined): string {
  const st = gstinState(gstin);
  if (st && state?.trim() && stateKey(state) !== stateKey(st)) return `GSTIN state code ${cleanGstin(gstin).slice(0, 2)} is ${st}, but State says ${state.trim()}.`;
  return '';
}
// Last 10 digits; '' when there are fewer than 10 (not a usable mobile).
export const last10Digits = (s: string | null | undefined): string => {
  const d = (s ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};
const normEmail = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase();

export type SimilarCustomerKind = 'gstin' | 'pan' | 'similar';
export interface SimilarCustomer {
  kind: SimilarCustomerKind;   // gstin = block a NEW record, pan = info only, similar = amber warning
  customer: Customer;
  message: string;
}

// Duplicate check for a record about to be created / saved. Strongest match
// per existing record, GSTIN matches first:
//   gstin   — same GSTIN (ignoring case / spaces)
//   pan     — same PAN (GSTIN characters 3–12) under a different GSTIN: the
//             same company's other GST registration (branch / plant) — valid
//   similar — same normalised company name, same mobile (last 10 digits) or
//             same email
// excludeId = the record being edited, so it never matches itself.
export function findSimilarCustomers(
  input: { name?: string; gstins?: (string | null | undefined)[]; phones?: (string | null | undefined)[]; emails?: (string | null | undefined)[] },
  customers: Customer[],
  excludeId?: string,
): SimilarCustomer[] {
  const nameKey = normalizeCompanyName(input.name);
  const gstins = new Set((input.gstins ?? []).map(normGstin).filter(Boolean));
  const pans = new Set([...gstins].filter(g => g.length === 15).map(g => g.slice(2, 12)));
  const phones = new Set((input.phones ?? []).map(last10Digits).filter(Boolean));
  const emails = new Set((input.emails ?? []).map(normEmail).filter(Boolean));

  const out: SimilarCustomer[] = [];
  for (const c of customers) {
    if (excludeId && c.id === excludeId) continue;
    const cGstins = [c.gstin, ...(c.sites ?? []).map(s => s.gstin)].map(normGstin).filter(Boolean);
    if (cGstins.some(g => gstins.has(g))) {
      out.push({ kind: 'gstin', customer: c, message: `This GSTIN already exists: ${c.name} (${c.id})` });
      continue;
    }
    const contacts = (c.sites ?? []).flatMap(s => s.contacts ?? []);
    const sameName = !!nameKey && normalizeCompanyName(c.name) === nameKey;
    const samePhone = phones.size > 0 && contacts.some(ct => [ct.phone, ...(ct.extraPhones ?? [])].some(p => phones.has(last10Digits(p))));
    const sameEmail = emails.size > 0 && contacts.some(ct => [ct.email, ...(ct.extraEmails ?? [])].some(e => emails.has(normEmail(e))));
    if (sameName || samePhone || sameEmail) {
      out.push({ kind: 'similar', customer: c, message: `Possible duplicate: ${c.name} (${c.id}, ${isLead(c) ? 'Lead' : 'Customer'})` });
      continue;
    }
    if (cGstins.some(g => g.length === 15 && pans.has(g.slice(2, 12)))) {
      out.push({ kind: 'pan', customer: c, message: `Same company, other GST registration: ${c.name}` });
    }
  }
  const rank: Record<SimilarCustomerKind, number> = { gstin: 0, pan: 1, similar: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

// The lead an enquiry / quote / order creates for a company that isn't in the
// customers table yet — same shape as the Add Lead form: LEAD-YYYY-NNN id (no
// CUS- code), contact in the Main Office site, 100% Advance, no credit.
export function buildLeadRecord(
  name: string,
  customers: { id: string }[],
  contact: { name?: string; phone?: string; email?: string } = {},
): Customer {
  const leadId = generateId('LEAD', customers.map(c => c.id));
  return {
    id: leadId,
    code: leadId,
    name: name.trim(),
    seg: '',
    gstin: '',
    inco: 'EXW',
    curr: 'INR',
    pay: '100% Advance',
    creditLimit: 0,
    customerStatus: 'lead',
    sites: [{
      id: 'S1', name: 'Main Office', city: '',
      contacts: [{ id: 'C1', name: (contact.name ?? '').trim(), role: 'Purchase', email: (contact.email ?? '').trim(), phone: (contact.phone ?? '').trim(), isPrimary: true }],
    }],
  };
}

// Quotes / orders have no place to show a duplicate warning (the company name
// arrives from the enquiry), so they only create a lead when there is no exact
// match AND no normalised-name match. Returns null when nothing should be
// created.
export function leadForUnknownCompany(
  name: string,
  customers: Customer[],
  contact: { name?: string; phone?: string; email?: string } = {},
): Customer | null {
  if (!name.trim() || findCustomerByName(name, customers)) return null;
  const key = normalizeCompanyName(name);
  const lookalike = key ? customers.find(c => normalizeCompanyName(c.name) === key) : undefined;
  if (lookalike) {
    console.info(`[customers] "${name}" looks like existing ${lookalike.name} (${lookalike.id}) — no lead created.`);
    return null;
  }
  return buildLeadRecord(name, customers, contact);
}

// Dispatch Board (Kanban): logins allowed to press Done / Hold / Resume on
// steps 1–7 — Samata (mum@) plus the ADMIN_EMAILS logins in
// store/index.tsx. Everyone else sees the board read-only. The Bhiwandi
// read-only login (isReadOnlyUser) stays locked regardless.
export const DISPATCH_BOARD_EMAILS = ['mum@himalayaterpene.com', 'mis@himalayaterpene.com', 'shishir@himalayaterpene.com', 'anil@himalayaterpene.com'];
export const canActOnDispatchBoard = (email: string | null | undefined): boolean =>
  DISPATCH_BOARD_EMAILS.includes((email ?? '').trim().toLowerCase());

// When the Dispatch Board's step buttons went live (30 Sep 2026, 11:30 AM
// IST). Orders sent to Dispatch before this (and entries saved before it)
// start their current step's timer from here instead of from the original
// send time, so the board didn't open with everything already late.
export const BOARD_GO_LIVE_AT = '2026-09-30T06:00:00Z';

// An order's status is LOCKED once it's been sent to Dispatch
// (sentToDispatchAt) or has any dispatch entry. Non-admins can't change the
// status of a locked order (store's updateOrder enforces it too); admins can,
// after a confirm. See isLockedStatusChangeAllowed for the exceptions.
export const isOrderStatusLocked = (
  o: { id: string; sentToDispatchAt?: string },
  dispatchEntries: { orderId: string }[],
): boolean => !!o.sentToDispatchAt || dispatchEntries.some(e => e.orderId === o.id);

// Status moves still allowed on a locked order without an admin override:
// → 'Delivered' once every line has been dispatched (totalRemaining = 0),
// and the legacy 'Order Pending for Dispatch' → 'Order Confirmed' flip.
export const isLockedStatusChangeAllowed = (
  from: string,
  to: string,
  fullyDispatched: boolean,
): boolean =>
  (to === 'Delivered' && fullyDispatched) ||
  (from === 'Order Pending for Dispatch' && to === 'Order Confirmed');

// Partial dispatch: one order (one Order No. + SO No.) can have many dispatch
// entries. Per order line (matched by seq): order qty (No of Barrels) minus
// that line's qty summed across ALL of the order's entries, floored at 0. A
// legacy entry saved without its own items counts as the whole order.
type QtyLine = { seq: number; qty: number };
export function remainingByLine(
  order: { id: string; items: QtyLine[] },
  entries: { orderId: string; items?: QtyLine[] }[],
): Map<number, number> {
  const dispatched = new Map<number, number>();
  for (const e of entries) {
    if (e.orderId !== order.id) continue;
    const lines = e.items && e.items.length ? e.items : order.items;
    for (const l of lines) dispatched.set(l.seq, (dispatched.get(l.seq) || 0) + (Number(l.qty) || 0));
  }
  const remaining = new Map<number, number>();
  for (const l of order.items) remaining.set(l.seq, Math.max(0, (Number(l.qty) || 0) - (dispatched.get(l.seq) || 0)));
  return remaining;
}

export const totalRemaining = (
  order: { id: string; items: QtyLine[] },
  entries: { orderId: string; items?: QtyLine[] }[],
): number => [...remainingByLine(order, entries).values()].reduce((s, q) => s + q, 0);

// Has at least one dispatch entry and nothing left to dispatch.
export const isFullyDispatched = (
  order: { id: string; items: QtyLine[] },
  entries: { orderId: string; items?: QtyLine[] }[],
): boolean => entries.some(e => e.orderId === order.id) && totalRemaining(order, entries) === 0;

/**
 * Returns a display label for a site — "City — Branch" or just whichever part exists.
 * Pass the customer record + the siteId stored on the doc (quote/order/enquiry).
 */
export function siteLabel(customer: Customer | undefined, siteId: string | undefined | null): string {
  if (!customer) return '';
  const site = (siteId && customer.sites.find(s => s.id === siteId))
    || customer.sites.find(s => s.isPrimary)
    || customer.sites[0];
  if (!site) return '';
  const city = site.city?.trim() || '';
  const branch = (site.name?.trim() && site.name.trim() !== customer.name.trim()) ? site.name.trim() : '';
  if (city && branch) return `${city} — ${branch}`;
  return city || branch || site.state?.trim() || '';
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Order taxes & charges ────────────────────────────────────────────────────
// Each adjustment resolves to a signed rupee amount (% lines computed on the
// items sub-total excl. GST; + adds, − deducts).
//
// Crucially, a `taxable` adjustment (e.g. Packing & Forwarding, Freight that's
// part of the supply value) is added to the taxable base BEFORE GST, and GST is
// then charged on that combined value at the order's highest item GST rate.
// Non-taxable lines (e.g. TDS, TCS) apply to the total AFTER GST.
//
// Worked example (the customer's case): Sub 6000 + P&F 0.5% (=30, taxable) →
// taxable value 6030; GST @18% = 1085.40; grand = 7115.40. Correct.
export interface ResolvedAdjustment extends OrderAdjustment {
  amount: number;   // signed: + adds to total, − deducts
}

export interface AdjustedTotals {
  lines: ResolvedAdjustment[];
  preNet: number;        // signed sum of taxable (pre-GST) adjustments
  postNet: number;       // signed sum of post-GST adjustments
  chargeGst: number;     // GST charged on the taxable adjustments (at maxGstRate)
  net: number;           // preNet + chargeGst + postNet (total added beyond sub+itemGst)
  taxableValue: number;  // subTotal + preNet
  gstTotal: number;      // itemGst + chargeGst
  grand: number;         // subTotal + preNet + itemGst + chargeGst + postNet
}

export function resolveAdjustments(
  adjustments: OrderAdjustment[] | undefined,
  subTotal: number,
  itemGst = 0,
  maxGstRate = 0,
): AdjustedTotals {
  const lines: ResolvedAdjustment[] = (adjustments || []).map(a => {
    const base = a.mode === 'percent' ? (subTotal * (Number(a.rate) || 0)) / 100 : (Number(a.rate) || 0);
    const amount = a.direction === 'deduct' ? -base : base;
    return { ...a, amount };
  });
  const preNet  = lines.filter(l => l.taxable).reduce((s, l) => s + l.amount, 0);
  const postNet = lines.filter(l => !l.taxable).reduce((s, l) => s + l.amount, 0);
  const chargeGst = (preNet * maxGstRate) / 100;
  const gstTotal = itemGst + chargeGst;
  const taxableValue = subTotal + preNet;
  return {
    lines, preNet, postNet, chargeGst,
    net: preNet + chargeGst + postNet,
    taxableValue, gstTotal,
    grand: subTotal + preNet + gstTotal + postNet,
  };
}

/** Highest GST% across an order's line items — used as the rate for taxable charges. */
export function maxItemGstRate(items: { gst: number }[]): number {
  return items.reduce((m, i) => Math.max(m, Number(i.gst) || 0), 0);
}

/** Returns YYYY-MM-DD in local time (avoids UTC offset shift from toISOString) */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns YYYY-MM-DDTHH:mm in local time for datetime-local inputs */
export function localDateTimeStr(d: Date): string {
  return `${localDateStr(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const formatINR = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatUSD = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// ── Quote line-item totals — shared by the quote form/edit item table and
// the negotiation-round picker/display, so both compute Amount / Subtotal /
// GST Total / Grand Total identically. ───────────────────────────────────

// Amount for one line item: qty * packing-size * price-basis-conversion * unit price.
// Mirrors NewQuote.tsx's updateItem() total calc exactly.
export function computeItemTotal(qty: number, packing: string | undefined, unitPrice: number, priceBasisConv: number = 1): number {
  const packingNum = parseFloat(packing || '') || 0;
  const totalQty = Number(qty) * (packingNum || 1);
  return totalQty * (Number(priceBasisConv) || 1) * Number(unitPrice);
}

export interface QuoteTotals {
  subTotal: number;
  gstTotal: number;
  grandTotal: number;
}

// Subtotal / GST total / grand total for a set of items — mirrors NewQuote.tsx's
// totals calc exactly (GST base = subtotal + insurance; non-INR skips GST/insurance).
export function computeQuoteTotals(items: { total: number; gst: number }[], curr: string, insurance: number): QuoteTotals {
  const subTotal = items.reduce((s, i) => s + i.total, 0);
  const ins = curr === 'INR' ? insurance : 0;
  const gstTotal = curr === 'INR' && subTotal > 0
    ? items.reduce((s, i) => s + i.total * i.gst / 100, 0) * (subTotal + ins) / subTotal
    : 0;
  const grandTotal = curr === 'INR' ? Math.round(subTotal + ins + gstTotal) : subTotal;
  return { subTotal, gstTotal, grandTotal };
}

// ── Negotiation rounds — "what's the current price" for a quote ──────────

// A discount_pct with no explicit revised_unit_price is applied against
// original_unit_price rather than requiring the caller to hand-calculate it.
export function effectiveNegotiatedPrice(it: NegotiationRoundItem): number | null {
  if (it.revised_unit_price != null) return it.revised_unit_price;
  if (it.discount_pct != null) return it.original_unit_price * (1 - it.discount_pct / 100);
  return null;
}

// Effective items for a quote as of a given round in its negotiation
// history: fold every round with round <= roundNumber, in order (oldest to
// newest), tracking the latest revised price found per seq. A later round
// only overwrites the seqs it actually touched — an item a later round
// doesn't mention keeps whatever revision an earlier round gave it, instead
// of resetting to the original price just because the most recent round
// considered didn't mention it. A round only ever stores the items it
// actually touched, so this merges by seq rather than treating any single
// round's items[] as the whole item list: a negotiation amends prices on the
// existing quote, it doesn't redefine which products are being quoted.
//
// Filtered/sorted by `round` explicitly rather than trusting array order or
// slicing the array: rounds are always appended in order with
// round = (prior length + 1) today, but doing this by round number means it
// can't silently regress if that invariant ever stops holding (e.g. a future
// edit/reorder feature), and lets callers ask "as of round N" for any N, not
// just "all rounds" or "up to array index N".
export function getEffectiveItemsUpToRound(quote: Pick<Quote, 'items' | 'negotiations'>, roundNumber: number): QuoteItem[] {
  const rounds = (quote.negotiations ?? [])
    .filter(r => r.round <= roundNumber)
    .sort((a, b) => a.round - b.round);
  const latestPriceBySeq = new Map<number, number>();
  for (const round of rounds) {
    for (const it of round.items) {
      const price = effectiveNegotiatedPrice(it);
      if (price != null) latestPriceBySeq.set(it.seq, price);
    }
  }
  if (latestPriceBySeq.size === 0) return quote.items;
  return quote.items.map(item => {
    const price = latestPriceBySeq.get(item.seq);
    if (price == null) return item;
    return { ...item, unitPrice: price, total: computeItemTotal(item.qty, item.packing, price, item.priceBasisConv) };
  });
}

// Current (i.e. as of the latest round — every negotiation applied) effective
// items for a quote. Thin wrapper over getEffectiveItemsUpToRound so there's
// one fold implementation, not two that could drift apart.
export function getCurrentQuoteItems(items: QuoteItem[], negotiations: NegotiationRound[] | undefined): QuoteItem[] {
  return getEffectiveItemsUpToRound({ items, negotiations }, Number.POSITIVE_INFINITY);
}

// Subtotal/GST/Grand Total for a quote as of a given round in its negotiation
// history — getEffectiveItemsUpToRound()'s resolved prices fed through the
// exact same computeQuoteTotals() formula used for a quote's original
// totals, so per-round boxes, the "current" total, and the original total
// can never compute the math differently from one another.
export function getEffectiveTotalsUpToRound(quote: Pick<Quote, 'items' | 'negotiations' | 'curr' | 'insurance'>, roundNumber: number): QuoteTotals {
  const effectiveItems = getEffectiveItemsUpToRound(quote, roundNumber);
  return computeQuoteTotals(effectiveItems, quote.curr, quote.insurance ?? 0);
}

// Current (as of the latest round) totals for a quote. Thin wrapper over
// getEffectiveTotalsUpToRound — call sites should use this instead of
// re-deriving subtotal/GST/grand total by hand from getCurrentQuoteItems()'s
// output.
export function getEffectiveTotals(quote: Pick<Quote, 'items' | 'negotiations' | 'curr' | 'insurance'>): QuoteTotals {
  return getEffectiveTotalsUpToRound(quote, Number.POSITIVE_INFINITY);
}

// Per-item row shape for a negotiation round's export table — same fields
// the PDF/DOCX item table already renders (Sr No/desc/hsn/qty/packing/
// totalQty/packingType/rate/per), just sourced from the round's own items
// (the touched subset, matching what the in-app Form step's negotiation
// sections show) rather than the whole quote.
export interface NegotiationExportItem {
  seq: number;
  desc: string;
  hsn: string;
  qty: number;
  packing: string;
  totalQty: string;
  packingType: string;
  rate: number;
  perUnit: string;
}

export interface NegotiationExportTable {
  round: number;
  date: string;
  items: NegotiationExportItem[];
  totals: QuoteTotals;
  insurance: number;
}

// One export-ready table per negotiation round, in round order — used by
// both the PDF and DOCX generators to render a "Negotiation N — Revised
// Pricing" table after the main item table, mirroring the same column set.
export function getNegotiationExportTables(quote: Pick<Quote, 'negotiations' | 'curr' | 'insurance'>): NegotiationExportTable[] {
  const rounds = quote.negotiations ?? [];
  const insurance = quote.insurance ?? 0;
  return rounds.map(r => {
    const items: NegotiationExportItem[] = r.items.map(it => {
      const packingNum = parseFloat(it.packing || '') || 0;
      const totalQty = it.qty && packingNum ? String(it.qty * packingNum) : '';
      const pb = it.priceBasis?.trim();
      const perUnit = !pb ? 'kg' : pb.startsWith('Per ') ? pb.slice(4) : pb;
      return {
        seq: it.seq,
        desc: it.desc,
        hsn: it.hsn,
        qty: it.qty,
        packing: it.packing || '',
        totalQty,
        packingType: it.packingType || '',
        rate: effectiveNegotiatedPrice(it) ?? it.original_unit_price,
        perUnit,
      };
    });
    const totals = computeQuoteTotals(
      r.items.map(it => ({
        total: computeItemTotal(it.qty, it.packing, effectiveNegotiatedPrice(it) ?? it.original_unit_price, 1),
        gst: it.gst,
      })),
      quote.curr,
      insurance,
    );
    return { round: r.round, date: r.date, items, totals, insurance };
  });
}

// Format a Date in Asia/Kolkata (IST, UTC+5:30) using date-fns-style tokens.
// Supported tokens: yyyy, yy, MMM, MM, dd, d, EEE, HH, hh, mm, a, aa
const IST_TZ = 'Asia/Kolkata';
const _istParts = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TZ,
    year: 'numeric', month: 'short', day: '2-digit',
    weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});
  const hour24 = parseInt(p.hour === '24' ? '00' : p.hour, 10);
  const hour12 = ((hour24 + 11) % 12) + 1;
  return {
    yyyy: p.year,
    yy: p.year.slice(-2),
    MMM: p.month,
    MM: String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(p.month) + 1).padStart(2, '0'),
    dd: p.day,
    d: String(parseInt(p.day, 10)),
    EEE: p.weekday,
    HH: String(hour24).padStart(2, '0'),
    hh: String(hour12).padStart(2, '0'),
    mm: p.minute,
    a: hour24 < 12 ? 'AM' : 'PM',
    aa: hour24 < 12 ? 'AM' : 'PM',
  };
};
export function fmtIST(d: Date, pattern: string): string {
  const t = _istParts(d);
  return pattern.replace(/yyyy|yy|MMM|MM|dd|EEE|HH|hh|mm|aa|a|d/g, (m) => (t as any)[m] ?? m);
}

// Convert ISO date string (YYYY-MM-DD) to display format (dd-MMM-yyyy)
// e.g. '2026-05-13' → '13-May-2026'
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d).padStart(2, '0')}-${months[m - 1]}-${y}`;
}

export const calculateAgeHours = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  return Math.max(0, (now.getTime() - date.getTime()) / 3600000);
};

// TAT (turnaround) health for a card sitting in a stage.
// `enteredAt` = when it entered the stage, `tatHours` = allowed hours.
// Returns 'none' when no TAT (e.g. Closed), else green→amber(≥80%)→red(breached).
export type TatHealth = 'ok' | 'warn' | 'breach' | 'none';
export function tatHealth(
  enteredAt: string | null | undefined,
  tatHours: number
): { health: TatHealth; elapsedH: number; pct: number; overdueH: number } {
  if (!enteredAt || !tatHours || tatHours <= 0) {
    return { health: 'none', elapsedH: 0, pct: 0, overdueH: 0 };
  }
  const elapsedH = calculateAgeHours(enteredAt);
  const pct = elapsedH / tatHours;
  const overdueH = Math.max(0, elapsedH - tatHours);
  let health: TatHealth = 'ok';
  if (pct >= 1) health = 'breach';
  else if (pct >= 0.8) health = 'warn';
  return { health, elapsedH, pct, overdueH };
}

// Compact "2d 4h" / "5h" elapsed label.
export function fmtElapsed(hours: number): string {
  const h = Math.floor(hours);
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem ? `${d}d ${rem}h` : `${d}d`;
}

// Working hours: Mon–Sat 09:00–18:00
export function addWorkingHours(from: Date, hours: number): { date: string; time: string } {
  let d = new Date(from);
  let remaining = hours * 60;
  while (remaining > 0) {
    d = new Date(d.getTime() + 60_000);
    const day = d.getDay();
    const h = d.getHours();
    if (day !== 0 && h >= 9 && h < 18) remaining--;
  }
  return {
    date: localDateStr(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

// Convert a Quote's structured terms (JSON string from NewQuote) into
// human-readable numbered lines suitable for an Order's terms textarea.
// If the input isn't JSON, returns it unchanged.
const TNC_LABELS: { key: string; label: string }[] = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'leadTime', label: 'Lead Time' },
  { key: 'pnf',      label: 'Packing & Fwd' },
  { key: 'freight',  label: 'Freight' },
  { key: 'payment',  label: 'Payment' },
  { key: 'validity', label: 'Validity' },
  { key: 'taxes',    label: 'Taxes' },
];

// Strip an existing "1." / "2)" / "- " / "• " prefix so we can renumber cleanly.
function stripLinePrefix(line: string): string {
  return line.replace(/^\s*(?:\d+\s*[.)\]:-]|[-•])\s+/, '').trim();
}

// Take any mix of (a) a JSON terms blob at the start, (b) free-text lines,
// (c) already-numbered lines, and return a clean newline-separated
// numbered list. Always safe to call repeatedly.
export function parseQuoteTerms(raw: string | undefined | null): string {
  if (!raw) return '';
  let body = raw.trim();
  const collectedLines: string[] = [];

  // If the string starts with a JSON object, extract it (find matching brace)
  // and expand it into key/value lines.
  if (body.startsWith('{')) {
    let depth = 0;
    let endIdx = -1;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx > 0) {
      const jsonSlice = body.slice(0, endIdx + 1);
      try {
        const parsed = JSON.parse(jsonSlice) as Record<string, string>;
        TNC_LABELS.forEach(({ key, label }) => {
          const value = (parsed[key] || '').trim();
          if (value) collectedLines.push(`${label}: ${value}`);
        });
        body = body.slice(endIdx + 1).trim();
      } catch {
        /* fall through — treat whole thing as text */
      }
    }
  }

  // Append remaining text lines (each gets de-prefixed so renumbering is clean)
  body
    .split(/\r?\n/)
    .map(stripLinePrefix)
    .filter(line => line.length > 0)
    .forEach(line => collectedLines.push(line));

  // Renumber every line as "1. …", "2. …" etc.
  return collectedLines.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

export function isInDateRange(
  dateStr: string | undefined | null,
  range: { startDate: string; endDate: string } | null
): boolean {
  if (!range || (!range.startDate && !range.endDate)) return true;
  if (!dateStr) return false;
  // Parse to Date and extract LOCAL date parts — avoids UTC offset shifting
  // e.g. "2026-05-19T22:53:00Z" is 2026-05-20 in IST (UTC+5:30)
  const d = localDateStr(new Date(dateStr));
  if (range.startDate && d < range.startDate) return false;
  if (range.endDate && d > range.endDate) return false;
  return true;
}

export function resolveDateRange(preset: string): { startDate: string; endDate: string } {
  const now = new Date();
  const iso = localDateStr;

  if (preset === 'today') {
    const s = iso(now);
    return { startDate: s, endDate: s };
  }
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    const s = iso(y);
    return { startDate: s, endDate: s };
  }
  if (preset === 'last-7-days') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { startDate: iso(start), endDate: iso(now) };
  }
  if (preset === 'this-week') {
    const { start, end } = getThisWeekRange();
    return { startDate: iso(start), endDate: iso(end) };
  }
  if (preset === 'this-month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: iso(start), endDate: iso(end) };
  }
  if (preset === 'this-quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    const end = new Date(now.getFullYear(), q * 3 + 3, 0);
    return { startDate: iso(start), endDate: iso(end) };
  }
  if (preset === 'this-year') {
    return { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` };
  }
  return { startDate: '', endDate: '' };
}

export function getThisWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, …
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMon);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Lowercases and strips everything that isn't a letter or digit, so
 * punctuation/spacing differences ("A.K BHAYANI & SONS" vs "ak bhayani sons")
 * don't prevent a match — e.g. "A.K BHAYANI & SONS" normalizes to
 * "akbhayanisons", so a search for "ak" (no period) still finds it.
 */
export function normalizeSearchText(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Returns a search-relevance tier for ranking rows by customer/company name
 * match, optionally boosted by exact matches on other reference fields (ID,
 * PO number, linked quote/enquiry ref, etc.) that the same search box also
 * matches against.
 * 0 = name is an exact match, OR one of exactMatches is an exact match
 *     (case-insensitive) — an exact ref/PO/ID hit is as strong a signal as an
 *     exact name hit, so both share the top tier.
 * 1 = name starts with query, 2 = name contains query elsewhere,
 * 3 = match was against some other field only partially (item description,
 *     etc.) — deliberately excludes exactMatches' fields, which are already
 *     covered by tier 0; a partial hit there isn't a strong enough signal to
 *     rank above a loose name match.
 * The three name-based checks compare normalizeSearchText(name) against
 * normalizeSearchText(query), so punctuation differences don't push a
 * genuine match down to the fallback tier. exactMatches is intentionally
 * compared on raw lowercased values, not normalized — those are exact
 * ref/ID/PO hits from a different, unrelated fix and are out of scope here.
 * Apply as a stable second sort after the table's primary column sort so that
 * within each tier the column order is preserved.
 */
export function nameTier(name: string, query: string, exactMatches: (string | undefined | null)[] = []): 0 | 1 | 2 | 3 {
  const q = query.toLowerCase();
  if (exactMatches.some(v => (v ?? '').toLowerCase() === q)) return 0;
  const n = normalizeSearchText(name);
  const nq = normalizeSearchText(query);
  if (n === nq) return 0;
  if (n.startsWith(nq)) return 1;
  if (n.includes(nq)) return 2;
  return 3;
}

// 2026-09-19: resolves a stored created_by/updated_by value (an email) to
// the matching team_roster member's display name, at the user's request —
// Stockbook/Finished Lots/Stock Movements/Dispatch all show "Created By"/
// "Updated By" as a name where one is known, falling back to the raw email
// (same style Sampling.tsx already shows created_by in) when no roster
// member matches, or '' when there's no value at all (nothing shown).
// Matches by email OR alias, case-insensitively — same matching used by
// roleForDoer in store/index.tsx — and does NOT filter by `active`, since a
// since-deactivated team member's name should still show on old records.
// 2026-09-21: briefly showed the email in parentheses alongside a matched
// name; reverted the same day at the user's request — back to name-only.
export function doerLabel(value: string | null | undefined, roster: TeamMember[]): string {
  if (!value) return '';
  const key = value.trim().toLowerCase();
  const match = roster.find(m =>
    m.email.toLowerCase() === key ||
    (m.aliases ?? []).some(a => a.trim().toLowerCase() === key));
  return match?.display_name || value;
}

export const generateId = (prefix: string, existingIds: (string | undefined | null)[]) => {
  const yr = new Date().getFullYear();
  let maxNum = 0;
  for (const id of existingIds) {
    if (!id) continue;
    const match = id.match(new RegExp(`${prefix}-\\d+-(\\d+)`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-${yr}-${String(maxNum + 1).padStart(3, '0')}`;
};

// Site picker options for a document: Main Office + active extra sites, plus
// the document's own site even if it has since been hidden.
export function pickableSites<S extends { id: string; isActive?: boolean }>(sites: S[] | undefined | null, currentSiteId?: string | null): S[] {
  return (sites ?? []).filter(s => s.isActive !== false || s.id === currentSiteId);
}
