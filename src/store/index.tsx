import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Customer, Site, Contact, DataStore, Enquiry, Order, Quote, FollowUp, FollowUpLog, AuthorizedSignatory, CompanyUnit, BankAccount, PipelineStage, PipelineOutcome, TeamMember, DoerRole, EnqStatus } from '../lib/types';
import { supabase, signOut, getSettings } from '../lib/supabase';
import { uploadToS3 } from '../lib/s3';
import { fetchLabelledEmails, fetchEmailAttachments } from '../lib/gmail';
import { calculateAgeHours, generateId } from '../lib/utils';
import { User } from '@supabase/supabase-js';

// Separate, purpose-specific mapping for the Authorized Signatory panel
// (NewEnquiry/NewQuote/NewOrder) — deliberately NOT reused from/merged into
// the activeDoer resolution below, which is live-looked-up against
// data.roster for generic KPI "doer" attribution, unrelated to who a
// document's signatory should be.
// Names here match authorized_signatories rows as they actually exist in
// Supabase today (confirmed live, not guessed) — e.g. "Chaudhari" not
// "Chaudhary", "Agrawal" not "Agarwal". sales@ is intentionally absent: it
// resolves via the PIN-gated name picker (see resolveSalesIdentity /
// SalesIdentityGate) instead of a static mapping, since one login covers
// two different people.
const EMAIL_TO_SIGNATORY: Record<string, { name: string; preferSignatoryId?: string }> = {
  'accounts@himalayaterpene.com': { name: 'Saidas Chaudhari' },
  'anil@himalayaterpene.com':     { name: 'Anil Agarwal' },
  'mis@himalayaterpene.com':      { name: 'Mansi' },
  // Two authorized_signatories rows are both named "Samata Yadav" (Billing
  // Executive/+919987682255 and CRM/+918657000610) — preferSignatoryId pins
  // mum@ to the confirmed-correct one (Billing Executive) by id, since a
  // plain name match can't disambiguate between them.
  'mum@himalayaterpene.com':      { name: 'Samata Yadav', preferSignatoryId: 'sig-1782203400891' },
  'pc@himalayaterpene.com':       { name: 'Omkar' },
  'shishir@himalayaterpene.com':  { name: 'Shishir Agrawal' },
};

export interface ResolvedSignatoryInfo {
  name: string;
  designation: string;
  phone: string;
}

// 'resolved'   — a name is known (either from EMAIL_TO_SIGNATORY, or from the
//                sales@ PIN picker) and matched/attempted against
//                authorized_signatories.
// 'unmapped'   — the logged-in email has no signatory mapping at all (not one
//                of EMAIL_TO_SIGNATORY's entries, and not sales@).
// 'needs-picker' — logged in as sales@himalayaterpene.com but this session
//                hasn't picked+verified Nimisha Pawar / Ruby yet.
export type SignatoryResolution =
  | ({ status: 'resolved' } & ResolvedSignatoryInfo)
  | { status: 'unmapped' }
  | { status: 'needs-picker' };

export const SALES_EMAIL = 'sales@himalayaterpene.com';
export const SALES_SIGNATORY_NAMES = ['Nimisha Pawar', 'Ruby'] as const;
export type SalesSignatoryName = typeof SALES_SIGNATORY_NAMES[number];

// Case-insensitive name match against the live authorized_signatories list,
// preferring a specific row by id when the name alone is ambiguous (see
// EMAIL_TO_SIGNATORY's mum@ entry). Returns name-only (blank
// designation/phone) rather than null when the mapped name has no matching
// row yet — the signatory should still resolve, just without invented data,
// per the "don't fabricate designation/phone" requirement.
function resolveSignatoryByName(
  name: string,
  signatories: AuthorizedSignatory[],
  preferId?: string,
): ResolvedSignatoryInfo {
  const key = name.trim().toLowerCase();
  const matches = signatories.filter(s => s.name.trim().toLowerCase() === key);
  const match = (preferId && matches.find(s => s.id === preferId)) || matches[0];
  return { name, designation: match?.designation ?? '', phone: match?.phone ?? '' };
}

export interface GlobalDateRange {
  startDate: string;
  endDate: string;
  preset: 'today' | 'yesterday' | 'last-7-days' | 'this-week' | 'this-month' | 'this-quarter' | 'this-year' | 'custom';
}

// The person identified after login (one Google login may be shared by several
// doers). Their display_name is what gets stamped on records this session.
export interface ActiveDoer {
  email: string;
  display_name: string;
  role: DoerRole;
}

interface AppContextType {
  data: DataStore;
  loading: boolean;
  user: User | null;
  authError: string | null;
  addEnquiry: (enquiry: Enquiry) => Promise<void>;
  updateEnquiry: (id: string, updates: Partial<Enquiry>) => Promise<void>;
  deleteEnquiry: (id: string) => Promise<void>;
  addQuote: (quote: Quote) => Promise<void>;
  updateQuote: (id: string, updates: Partial<Quote>) => Promise<void>;
  deleteQuote: (id: string) => Promise<void>;
  addOrder: (order: Order) => Promise<void>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  addCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addFollowUpLog: (quoteId: string, log: FollowUpLog, nextDate?: string | null, nextTime?: string | null, owner?: string, stageOverride?: string | null) => Promise<void>;
  addFollowUpLogBulk: (quoteIds: string[], log: FollowUpLog, nextDate?: string | null, nextTime?: string | null) => Promise<void>;
  closeFollowUp: (quoteId: string, outcome?: PipelineOutcome) => Promise<void>;
  reopenFollowUp: (quoteId: string) => Promise<void>;
  setFollowUpStage: (quoteId: string, stage: PipelineStage, outcome?: PipelineOutcome | null) => Promise<void>;
  addSignatory: (sig: AuthorizedSignatory) => Promise<void>;
  updateSignatory: (id: string, updates: Partial<AuthorizedSignatory>) => Promise<void>;
  deleteSignatory: (id: string) => Promise<void>;
  addUnit: (u: CompanyUnit) => Promise<void>;
  updateUnit: (id: string, updates: Partial<CompanyUnit>) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  addBankAccount: (b: BankAccount) => Promise<void>;
  updateBankAccount: (id: string, updates: Partial<BankAccount>) => Promise<void>;
  deleteBankAccount: (id: string) => Promise<void>;
  addTeamMember: (m: TeamMember) => Promise<void>;
  updateTeamMember: (email: string, role: DoerRole, displayName: string, updates: Partial<TeamMember>) => Promise<void>;
  deleteTeamMember: (email: string, role: DoerRole, displayName: string) => Promise<void>;
  roleForDoer: (nameOrEmail?: string | null) => DoerRole[];
  // Active doer (post-login identity on a possibly-shared Google login).
  activeDoer: ActiveDoer | null;
  setActiveDoer: (d: ActiveDoer | null) => void;
  clearActiveDoer: () => void;
  // The name to stamp on records this session: active doer's name, else email.
  stampName: () => string;
  // Locked Authorized Signatory for NewEnquiry/NewQuote/NewOrder, resolved
  // from the logged-in email (see EMAIL_TO_SIGNATORY / SignatoryResolution).
  resolvedSignatory: SignatoryResolution;
  // sales@'s PIN-picked identity this session (Nimisha Pawar / Ruby, or null
  // before picked) — set by SalesIdentityGate once the PIN is verified.
  salesIdentity: SalesSignatoryName | null;
  setSalesIdentity: (name: SalesSignatoryName | null) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  globalDateRange: GlobalDateRange | null;
  setGlobalDateRange: (range: GlobalDateRange | null) => void;
  detailPanel: { type: 'enquiry' | 'quote' | 'order' | null, id: string | null };
  openDetailPanel: (type: 'enquiry' | 'quote' | 'order', id: string) => void;
  closeDetailPanel: () => void;
  attachmentModal: { type: 'enquiry' | 'quote' | 'order' | null, id: string | null };
  openAttachmentModal: (type: 'enquiry' | 'quote' | 'order', id: string) => void;
  closeAttachmentModal: () => void;
  refreshData: () => Promise<void>;
  syncGmailEnquiries: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// generateId() computes "next" as (max existing number + 1) from whatever's
// in local React state — if two tabs/people insert within the same window,
// before either's state has refreshed with the other's save, they compute
// the identical ID and race. quotes/enquiries/orders have `id` as PRIMARY
// KEY so a collision errors loudly; customers.customer_id now has a unique
// constraint too (added directly in Supabase), so it errors instead of
// silently duplicating. This retries on that specific error by re-fetching
// IDs fresh from the DB (not stale local state) and regenerating, so a
// collision self-heals instead of failing the user's save.
async function insertWithIdRetry<T extends { id: string }>(
  table: string,
  record: T,
  mapToDB: (r: T) => any,
  idPrefix: string,
  fetchExistingIds: () => Promise<string[]>,
  maxAttempts = 3,
): Promise<{ error: any; finalRecord: T }> {
  let current = record;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { error } = await supabase.from(table).insert([mapToDB(current)]);
    if (!error) return { error: null, finalRecord: current };
    // 23505 = Postgres unique_violation. Only retry on that; anything else
    // is a real error the caller should surface as-is.
    if (error.code !== '23505' || attempt === maxAttempts - 1) {
      return { error, finalRecord: current };
    }
    const freshIds = await fetchExistingIds();
    const newId = generateId(idPrefix, freshIds);
    current = { ...current, id: newId } as T;
  }
  return { error: new Error('Could not generate a unique ID after retries'), finalRecord: current };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DataStore>({
    enquiries: [],
    quotes: [],
    orders: [],
    customers: [],
    followups: [],
    settings: null,
    signatories: [],
    units: [],
    bankAccounts: [],
    roster: [],
  });

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeDoer, setActiveDoerState] = useState<ActiveDoer | null>(() => {
    try { const s = sessionStorage.getItem('active_doer'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  // sales@'s PIN-picked identity — persisted in localStorage (not
  // sessionStorage) so it survives closing the browser/tab, not just SPA
  // navigation within one tab session. Without this, Ruby/Nimisha had to
  // re-enter their PIN every single time they reopened the site, since
  // sessionStorage is wiped on tab/browser close. Still cleared on explicit
  // sign-out (via the Topbar "sign out" control) or a real logout.
  const [salesIdentity, setSalesIdentityState] = useState<SalesSignatoryName | null>(() => {
    try { return (localStorage.getItem('sales_signatory_identity') as SalesSignatoryName | null) ?? null; } catch { return null; }
  });
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [detailPanel, setDetailPanel] = useState<{ type: 'enquiry' | 'quote' | 'order' | null, id: string | null }>({ type: null, id: null });
  const [attachmentModal, setAttachmentModal] = useState<{ type: 'enquiry' | 'quote' | 'order' | null, id: string | null }>({ type: null, id: null });
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [globalDateRange, setGlobalDateRange] = useState<GlobalDateRange | null>(() => {
    const stored = localStorage.getItem('globalDateRange');
    return stored ? JSON.parse(stored) : null;
  });

  const openDetailPanel = (type: 'enquiry' | 'quote' | 'order', id: string) => setDetailPanel({ type, id });
  const closeDetailPanel = () => setDetailPanel({ type: null, id: null });

  const openAttachmentModal = (type: 'enquiry' | 'quote' | 'order', id: string) => setAttachmentModal({ type, id });
  const closeAttachmentModal = () => setAttachmentModal({ type: null, id: null });

  const checkUserDomain = (u: User | null) => {
    if (u && u.email && !u.email.endsWith('@himalayaterpene.com')) {
      setAuthError('Access restricted to @himalayaterpene.com users only.');
      signOut();
      return null;
    }
    setAuthError(null);
    return u;
  };

  useEffect(() => {
    let mounted = true;

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const validatedUser = checkUserDomain(session?.user ?? null);
      setUser(validatedUser);
      setAuthChecked(true);
      if (validatedUser) {
        refreshData().finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const validatedUser = checkUserDomain(session?.user ?? null);
      setUser(validatedUser);
      // TOKEN_REFRESHED fires automatically in the background every time Supabase
      // silently renews the session (no user action, nothing on screen changed).
      // It used to trigger a full 10-table refreshData() reload here, which was
      // the main driver of our egress overage — skip it, nothing needs re-fetching.
      if (event === 'TOKEN_REFRESHED') return;
      if (validatedUser) {
        refreshData().finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setData({ enquiries: [], quotes: [], orders: [], customers: [], followups: [], settings: null, signatories: [], units: [], bankAccounts: [], roster: [] });
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Auto-resolve the active doer from the authenticated email so no manual
  // "Who's working?" selection is needed after login. Looked up live against
  // data.roster (not a hardcoded map) so an edit in Settings → Team Roster
  // takes effect on next login without a code change. Re-runs whenever the
  // roster reloads/changes, not just on user change, since data.roster isn't
  // populated yet on the very first run (refreshData() is still in flight).
  useEffect(() => {
    const email = user?.email?.toLowerCase() ?? null;
    if (email) {
      const matches = data.roster.filter(m => m.active && m.email.toLowerCase() === email);
      // Exactly one active roster row for this login resolves directly. Zero
      // matches (unmapped login) or several matches (a shared login covering
      // more than one person, e.g. sales@) both leave activeDoer null — the
      // latter is handled by the SalesIdentityGate / salesIdentity picker,
      // unchanged by this.
      const doer = matches.length === 1
        ? { email, display_name: matches[0].display_name, role: matches[0].role }
        : null;
      setActiveDoerState(doer);
      try {
        if (doer) sessionStorage.setItem('active_doer', JSON.stringify(doer));
        else sessionStorage.removeItem('active_doer');
      } catch {}
    } else {
      setActiveDoerState(null);
      try { sessionStorage.removeItem('active_doer'); } catch {}
    }
    // sales@'s PIN-picked identity must clear on any sign-out path (explicit
    // logout, session expiry, domain-check failure) — cleared here alongside
    // active_doer rather than only in the logout() button handler, so every
    // path that lands here covers it. Also clears if a different, non-sales@
    // user is now logged in, in case a stale value ever lingered in
    // localStorage from an earlier session. It deliberately does NOT clear
    // just because this is a fresh page load while still logged in as
    // sales@ — that's what makes the PIN "stick" across browser restarts.
    if (authChecked && email !== SALES_EMAIL) {
      setSalesIdentityState(null);
      try { localStorage.removeItem('sales_signatory_identity'); } catch {}
    }
  }, [user, data.roster, authChecked]);

  // Authorized Signatory resolution for NewEnquiry/NewQuote/NewOrder's
  // locked signatory panel — derived on every render (cheap: a handful of
  // array scans over data.signatories) rather than its own
  // useState+useEffect, so it can never lag one render behind user/data.
  const email = user?.email?.toLowerCase() ?? null;
  const resolvedSignatory: SignatoryResolution = (() => {
    if (!email) return { status: 'unmapped' };
    if (email === SALES_EMAIL) {
      if (!salesIdentity) return { status: 'needs-picker' };
      return { status: 'resolved', ...resolveSignatoryByName(salesIdentity, data.signatories) };
    }
    const mapped = EMAIL_TO_SIGNATORY[email];
    if (!mapped) return { status: 'unmapped' };
    return { status: 'resolved', ...resolveSignatoryByName(mapped.name, data.signatories, mapped.preferSignatoryId) };
  })();

  const setSalesIdentity = (name: SalesSignatoryName | null) => {
    setSalesIdentityState(name);
    try {
      if (name) localStorage.setItem('sales_signatory_identity', name);
      else localStorage.removeItem('sales_signatory_identity');
    } catch { /* localStorage unavailable — keep in-memory only */ }
  };

  // Persist global date range to localStorage — survives SPA navigation, resets on hard page reload
  useEffect(() => {
    localStorage.setItem('globalDateRange', JSON.stringify(globalDateRange));
  }, [globalDateRange]);

  const mapEnquiryFromDB = (e: any): Enquiry => {
    const obj: any = { ...e };
    obj.siteId = e.site_id;
    obj.contactId = e.contact_id;
    obj.phone = e.contact_phone ?? undefined;
    obj.ageH = e.recv ? calculateAgeHours(e.recv) : (e.age_h || 0);
    obj.qRef = e.q_ref;
    if ('authorized_person' in e) {
      obj.authorizedPerson = e.authorized_person;
      delete obj.authorized_person;
    }
    if ('customer_tier' in e) {
      obj.customerTier = e.customer_tier;
      delete obj.customer_tier;
    }

    delete obj.site_id;
    delete obj.contact_id;
    delete obj.contact_phone;
    delete obj.age_h;
    delete obj.q_ref;

    return obj;
  };

const mapEnquiryToDB = (e: any) => {
  const obj: any = {};
  // Always include these core fields
  if ('id' in e) obj.id = e.id;
  if ('recv' in e) obj.recv = e.recv;
  if ('src' in e) obj.src = e.src;
  if ('cust' in e) obj.cust = e.cust;
  if ('contact' in e) obj.contact = e.contact;
  if ('email' in e) obj.email = e.email;
  if ('phone' in e) obj.contact_phone = e.phone || null;
  if ('urg' in e) obj.urg = e.urg;
  if ('status' in e) obj.status = e.status;
  if ('assigned' in e) obj.assigned = e.assigned;
  if ('doer' in e) obj.doer = e.doer;
  if ('created_by' in e) obj.created_by = e.created_by ?? null;
  if ('notes' in e) obj.notes = e.notes;
  if ('items' in e) obj.items = e.items;
  if ('attachments' in e) obj.attachments = e.attachments;
  if ('authorizedPerson' in e) obj.authorized_person = e.authorizedPerson || null;
  if ('customerTier' in e) obj.customer_tier = e.customerTier || null;

  // Handle snake_case conversions with defaults
  obj.site_id = e.siteId || e.site_id || null;
  obj.contact_id = e.contactId || e.contact_id || null;
  obj.age_h = Math.floor(Number(e.ageH ?? e.age_h ?? 0)) || 0;
  obj.q_ref = e.qRef || e.q_ref || null;
  
  return obj;
};



  const mapQuoteFromDB = (q: any): Quote => {
    const obj: any = { ...q };
    obj.enqRef = q.enq_ref;
    if (q.site_id) obj.siteId = q.site_id;
    if (q.contact_id) obj.contactId = q.contact_id;
    if (q.unit_id) obj.unitId = q.unit_id;
    if (q.cust_enquiry_doc_no) obj.custEnquiryDocNo = q.cust_enquiry_doc_no;
    if (q.contact_phone) obj.phone = q.contact_phone;
    if ('authorized_person' in q) {
      obj.authorizedPerson = q.authorized_person;
      delete obj.authorized_person;
    }
    if ('customer_tier' in q) {
      obj.customerTier = q.customer_tier;
      delete obj.customer_tier;
    }
    delete obj.enq_ref;
    delete obj.site_id;
    delete obj.contact_id;
    delete obj.unit_id;
    delete obj.cust_enquiry_doc_no;
    delete obj.contact_phone;
    return obj;
  };

  const mapQuoteToDB = (q: any) => {
    const obj: any = {};
    if ('id' in q) obj.id = q.id;
    if ('cust' in q) obj.cust = q.cust;
    if ('date' in q) obj.date = q.date;
    if ('validity' in q) obj.validity = q.validity;
    if ('status' in q) obj.status = q.status;
    if ('inco' in q) obj.inco = q.inco;
    if ('curr' in q) obj.curr = q.curr;
    if ('pay' in q) obj.pay = q.pay;
    if ('items' in q) obj.items = q.items;
    if ('attachments' in q) obj.attachments = q.attachments;
    if ('authorizedPerson' in q) obj.authorized_person = q.authorizedPerson;
    if ('customerTier' in q) obj.customer_tier = q.customerTier || null;
    if ('terms' in q) obj.terms = q.terms;

    if ('enqRef' in q) obj.enq_ref = q.enqRef || null;
    else if ('enq_ref' in q) obj.enq_ref = q.enq_ref || null;

    if ('siteId' in q) obj.site_id = q.siteId || null;
    else if ('site_id' in q) obj.site_id = q.site_id || null;

    if ('contactId' in q) obj.contact_id = q.contactId || null;
    if ('contact' in q) obj.contact = q.contact || null;
    if ('email' in q) obj.email = q.email || null;
    if ('phone' in q) obj.contact_phone = q.phone || null;

    if ('unitId' in q) obj.unit_id = q.unitId || null;
    if ('custEnquiryDocNo' in q) obj.cust_enquiry_doc_no = q.custEnquiryDocNo || null;
    if ('notes' in q) obj.notes = q.notes ?? [];
    if ('doer' in q) obj.doer = q.doer;
    if ('sent_at' in q) obj.sent_at = q.sent_at || null;
    if ('insurance' in q) obj.insurance = q.insurance ?? 0;
    if ('negotiations' in q) obj.negotiations = q.negotiations ?? [];

    return obj;
  };

  const mapOrderFromDB = (o: any): Order => {
    const obj: any = { ...o };
    obj.quoteRef = o.quote_ref;
    obj.enqRef = o.enq_ref;
    if (o.site_id) obj.siteId = o.site_id;
    if (o.contact_id) obj.contactId = o.contact_id;
    if (o.contact_phone) obj.phone = o.contact_phone;
    if (o.cust_enquiry_doc_no) obj.custEnquiryDocNo = o.cust_enquiry_doc_no;
    obj.poNo = o.po_no;
    obj.poDate = o.po_date;
    obj.dlvDate = o.dlv_date;
    if (o.schedule_date) obj.scheduleDate = o.schedule_date;
    if (o.po_filename) obj.poFileName = o.po_filename;
    if (o.sheets_exported_at) obj.sheetsExportedAt = o.sheets_exported_at;
    if (o.company_unit_id) obj.unitId = o.company_unit_id;
    if (o.bank_account_id) obj.bankAccountId = o.bank_account_id;
    if (o.shipping_address) obj.shipToAddress = o.shipping_address;
    if (o.price_basis) obj.priceBasis = o.price_basis;
    if (o.country_of_origin) obj.countryOfOrigin = o.country_of_origin;
    if (o.exim_code) obj.eximCode = o.exim_code;
    if (o.custom_point) obj.customPoint = o.custom_point;
    if (o.pan) obj.pan = o.pan;
    if (o.hsn) obj.hsn = o.hsn;
    if (o.pay) obj.pay = o.pay;
    if ('authorized_person' in o) {
      obj.authorizedPerson = o.authorized_person;
      delete obj.authorized_person;
    }
    if ('customer_tier' in o) {
      obj.customerTier = o.customer_tier;
      delete obj.customer_tier;
    }

    delete obj.quote_ref;
    delete obj.enq_ref;
    delete obj.site_id;
    delete obj.contact_id;
    delete obj.contact_phone;
    delete obj.cust_enquiry_doc_no;
    delete obj.po_no;
    delete obj.po_date;
    delete obj.dlv_date;
    delete obj.schedule_date;
    delete obj.po_filename;
    delete obj.sheets_exported_at;
    delete obj.company_unit_id;
    delete obj.bank_account_id;
    delete obj.shipping_address;
    delete obj.price_basis;
    delete obj.country_of_origin;
    delete obj.exim_code;
    delete obj.custom_point;
    delete obj.pan;
    delete obj.hsn;

    return obj;
  };

  const mapOrderToDB = (o: any) => {
    const obj: any = {};
    if ('id' in o) obj.id = o.id;
    if ('cust' in o) obj.cust = o.cust;
    if ('status' in o) obj.status = o.status;
    if ('value' in o) obj.value = o.value;
    if ('insurance' in o) obj.insurance = o.insurance ?? null;
    if ('items' in o) obj.items = o.items;
    if ('inco' in o) obj.inco = o.inco;
    if ('curr' in o) obj.curr = o.curr;

    if ('quoteRef' in o) obj.quote_ref = o.quoteRef || null;
    else if ('quote_ref' in o) obj.quote_ref = o.quote_ref || null;

    if ('enqRef' in o) obj.enq_ref = o.enqRef || null;
    else if ('enq_ref' in o) obj.enq_ref = o.enq_ref || null;

    if ('siteId' in o) obj.site_id = o.siteId || null;
    else if ('site_id' in o) obj.site_id = o.site_id || null;

    if ('poNo' in o) obj.po_no = o.poNo;
    else if ('po_no' in o) obj.po_no = o.po_no;

    if ('poDate' in o) obj.po_date = o.poDate;
    else if ('po_date' in o) obj.po_date = o.po_date;

    if ('dlvDate' in o) obj.dlv_date = o.dlvDate;
    else if ('dlv_date' in o) obj.dlv_date = o.dlv_date;

    if ('scheduleDate' in o) obj.schedule_date = o.scheduleDate || null;
    else if ('schedule_date' in o) obj.schedule_date = o.schedule_date || null;

    if ('poFileName' in o) obj.po_filename = o.poFileName;
    else if ('po_filename' in o) obj.po_filename = o.po_filename;

    // Fields added in migration add_missing_order_columns
    if ('contactId' in o) obj.contact_id = o.contactId || null;
    if ('contact' in o) obj.contact = o.contact || null;
    if ('phone' in o) obj.contact_phone = o.phone || null;
    if ('email' in o) obj.email = o.email || null;
    if ('shipToAddress' in o) obj.shipping_address = o.shipToAddress || null;
    if ('custEnquiryDocNo' in o) obj.cust_enquiry_doc_no = o.custEnquiryDocNo || null;
    if ('unitId' in o) obj.company_unit_id = o.unitId || null;
    if ('bankAccountId' in o) obj.bank_account_id = o.bankAccountId || null;
    if ('authorizedPerson' in o) obj.authorized_person = o.authorizedPerson || null;
    if ('customerTier' in o) obj.customer_tier = o.customerTier || null;
    if ('terms' in o) obj.terms = o.terms || null;
    if ('pay' in o) obj.pay = o.pay || null;
    if ('doer' in o) obj.doer = o.doer;

    return obj;
  };

  const refreshData = async () => {
    try {
      const [
        { data: enquiries },
        { data: quotes },
        { data: orders },
        { data: customers },
        { data: followups },
        { data: settings },
        { data: signatories },
        { data: units },
        { data: bankAccountsData },
        { data: rosterData },
      ] = await Promise.all([
        supabase.from('enquiries').select('*').order('recv', { ascending: false }),
        supabase.from('quotes').select('*').order('date', { ascending: false }),
        supabase.from('orders').select('*').order('po_date', { ascending: false }),
        supabase.from('customers').select('*').order('company_name'),
        supabase.from('followups').select('*'),
        supabase.from('app_settings').select('*').eq('id', 'config').single(),
        supabase.from('authorized_signatories').select('*').order('name'),
        supabase.from('company_units').select('*').order('name'),
        supabase.from('bank_accounts').select('*'),
        supabase.from('team_roster').select('*').order('display_name'),
      ]);

      setData({
        enquiries: (enquiries || []).map(mapEnquiryFromDB),
        quotes: (quotes || []).map(mapQuoteFromDB),
        orders: (orders || []).map(mapOrderFromDB),
        customers: (customers || []).map(mapCustomerFromDB),
        followups: (followups || []).map((f: any) => ({
          ...f,
          // Backfill stage for rows created before the pipeline existed.
          stage: f.stage || (f.status === 'closed' ? 'Closed' : 'Sent Quotation'),
          stage_entered_at: f.stage_entered_at || f.updated_at || f.created_at,
        })),
        settings: (settings as any) || null,
        signatories: signatories || [],
        units: units || [],
        bankAccounts: bankAccountsData || [],
        roster: (rosterData as TeamMember[]) || [],
      });
      await linkPendingPOSubmissions();
    } catch (error) {
      console.error('Error fetching data from Supabase:', error);
    } finally {
      setLoading(false);
    }
  };

  const addEnquiry = async (enquiry: Enquiry) => {
    const { error, finalRecord } = await insertWithIdRetry<Enquiry>(
      'enquiries',
      enquiry,
      mapEnquiryToDB,
      'ENQ',
      async () => {
        const { data: rows } = await supabase.from('enquiries').select('id');
        return (rows ?? []).map(r => r.id);
      },
    );
    if (!error) {
      setData(prev => ({ ...prev, enquiries: [finalRecord, ...prev.enquiries] }));
    } else {
      console.error('Error adding enquiry:', error);
      throw new Error(error.message || 'Error adding enquiry');
    }
  };

  const updateEnquiry = async (id: string, updates: Partial<Enquiry>) => {
    const dbUpdates = mapEnquiryToDB(updates);
    const { error } = await supabase.from('enquiries').update(dbUpdates).eq('id', id);
    if (!error) {
      setData(prev => ({
        ...prev,
        enquiries: prev.enquiries.map(e => e.id === id ? { ...e, ...updates } : e)
      }));
    } else {
      console.error('Error updating enquiry:', error);
      throw error;
    }
  };

  const deleteEnquiry = async (id: string) => {
    // Deletes are independent per module — only this enquiry row is removed.
    // FK is ON DELETE SET NULL, not CASCADE: any quote/order that referenced
    // it survives in the DB with enqRef nulled, so mirror that in local state
    // (map, don't filter) rather than making them vanish from the UI.
    const { error } = await supabase.from('enquiries').delete().eq('id', id);
    if (error) throw error;

    setData(prev => ({
      ...prev,
      enquiries: prev.enquiries.filter(e => e.id !== id),
      quotes: prev.quotes.map(q => q.enqRef === id ? { ...q, enqRef: null } : q),
      orders: prev.orders.map(o => o.enqRef === id ? { ...o, enqRef: null } : o),
    }));
  };

  const addQuote = async (quote: Quote) => {
    const { error, finalRecord } = await insertWithIdRetry<Quote>(
      'quotes',
      quote,
      mapQuoteToDB,
      'HTP',
      async () => {
        const { data: rows } = await supabase.from('quotes').select('id');
        return (rows ?? []).map(r => r.id);
      },
    );
    if (!error) {
      setData(prev => ({ ...prev, quotes: [finalRecord, ...prev.quotes] }));
    } else {
      console.error('Error adding quote:', error);
      throw error;
    }
  };

  const updateQuote = async (id: string, updates: Partial<Quote>) => {
    const dbUpdates = mapQuoteToDB(updates);
    const { error } = await supabase.from('quotes').update(dbUpdates).eq('id', id);
    if (!error) {
      setData(prev => ({
        ...prev,
        quotes: prev.quotes.map(q => q.id === id ? { ...q, ...updates } : q)
      }));
    } else {
      console.error('Error updating quote:', error);
      throw error;
    }
  };

  const deleteQuote = async (id: string) => {
    // Deletes are independent per module — only this quote row is removed.
    // FK is ON DELETE SET NULL, not CASCADE: any order/followup that
    // referenced it survives in the DB with its ref nulled, so mirror that
    // in local state (map, don't filter) rather than making them vanish.
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) { console.error('deleteQuote failed', error); throw error; }

    setData(prev => ({
      ...prev,
      quotes: prev.quotes.filter(q => q.id !== id),
      orders: prev.orders.map(o => o.quoteRef === id ? { ...o, quoteRef: null } : o),
      followups: prev.followups.map((f: any) => f.quote_id === id ? { ...f, quote_id: null } : f),
    }));
  };

  const addOrder = async (order: Order) => {
    const { error, finalRecord } = await insertWithIdRetry<Order>(
      'orders',
      order,
      mapOrderToDB,
      'ORD',
      async () => {
        const { data: rows } = await supabase.from('orders').select('id');
        return (rows ?? []).map(r => r.id);
      },
    );
    if (!error) {
      setData(prev => ({ ...prev, orders: [finalRecord, ...prev.orders] }));
    } else {
      console.error('Error adding order:', error);
      throw error;
    }
  };

  const updateOrder = async (id: string, updates: Partial<Order>) => {
    const dbUpdates = mapOrderToDB(updates);
    const { error } = await supabase.from('orders').update(dbUpdates).eq('id', id);
    if (!error) {
      setData(prev => ({
        ...prev,
        orders: prev.orders.map(o => o.id === id ? { ...o, ...updates } : o)
      }));
    } else {
      console.error('Error updating order:', error);
      throw error;
    }
  };

  const deleteOrder = async (id: string) => {
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (!error) {
      setData(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== id) }));
    } else {
      console.error('Error deleting order:', error);
      throw error;
    }
  };

  const fixPhone = (v: any): string => {
    if (v == null) return '';
    const s = String(v).trim();
    if (/^[0-9.]+[eE][+\-]?[0-9]+$/.test(s)) return String(Math.round(Number(s)));
    return s;
  };

  const mapCustomerFromDB = (c: any): Customer => {
    const contacts: Contact[] = [];
    if (c.primary_contact_name || c.primary_contact_email) {
      contacts.push({ id: 'C1', name: c.primary_contact_name || '', role: c.primary_contact_designation || '', email: c.primary_contact_email || '', extraEmails: c.primary_contact_extra_emails || undefined, phone: fixPhone(c.primary_contact_phone), extraPhones: c.primary_contact_extra_phones || undefined, isPrimary: true });
    }
    if (c.contact2_name || c.contact2_email) {
      contacts.push({ id: 'C2', name: c.contact2_name || '', role: c.contact2_designation || '', email: c.contact2_email || '', extraEmails: c.contact2_extra_emails || undefined, phone: fixPhone(c.contact2_phone), extraPhones: c.contact2_extra_phones || undefined });
    }
    if (c.contact3_name || c.contact3_email) {
      contacts.push({ id: 'C3', name: c.contact3_name || '', role: c.contact3_designation || '', email: c.contact3_email || '', extraEmails: c.contact3_extra_emails || undefined, phone: fixPhone(c.contact3_phone), extraPhones: c.contact3_extra_phones || undefined });
    }
    if (contacts.length === 0) {
      contacts.push({ id: 'C1', name: '', role: 'Purchase', email: '', isPrimary: true });
    }

    const primarySite: Site = {
      id: 'S1',
      name: c.site_name || 'Main Office',
      city: c.city || '',
      state: c.state || '',
      address: c.billing_address || '',
      fullAddress: c.billing_address || '',
      dispatchAddress: c.dispatch_address || '',
      transporter: c.preferred_transporter || '',
      leadTimeNote: c.lead_time_note || '',
      pincode: c.pincode || '',
      gstin: c.site_gstin || '',
      isPrimary: true,
      contacts,
    };

    const toNum = (v: any, fallback = 0) => v != null && v !== '' ? Number(v) || fallback : fallback;
    const toNumOrUndef = (v: any) => v != null && v !== '' ? Number(v) || undefined : undefined;

    const nextOrder1 = c.next_order_product1
      ? { product: c.next_order_product1, qty: toNumOrUndef(c.next_order_qty1), date: c.next_order_date1 || undefined }
      : undefined;
    const nextOrder2 = c.next_order_product2
      ? { product: c.next_order_product2, qty: toNumOrUndef(c.next_order_qty2), date: c.next_order_date2 || undefined }
      : undefined;

    return {
      id: c.customer_id,
      code: c.customer_id,
      name: c.company_name || '',
      seg: c.industry_segment || '',
      gstin: c.gstin || '',
      pan: c.pan || '',
      inco: c.incoterms || 'Ex-Works',
      curr: c.currency || 'INR',
      pay: c.payment_terms || '',
      tier: c.tier ?? 'New',
      turnover: toNum(c.last_fy_turnover),
      revenue: toNum(c.revenue_ytd),
      ratingPayment: toNum(c.payment_rating) * 10,
      ratingOrders:  toNum(c.orders_rating)  * 10,
      ratingTrend:   toNum(c.trend_rating)   * 10,
      overallRating: toNumOrUndef(c.overall_rating),
      creditLimit: toNumOrUndef(c.credit_limit),
      crossSellOpportunities: c.cross_sell_opportunities || '',
      notes: c.notes || '',
      totalQuotes: toNum(c.total_quotes),
      createdBy: c.created_by || '',
      createdDate: c.created_date || '',
      modifiedBy: c.modified_by || '',
      modifiedDate: c.modified_date || '',
      nextOrder1,
      nextOrder2,
      nextOrders: [nextOrder1?.product, nextOrder2?.product].filter(Boolean) as string[],
      customerType: c.customer_type || '',
      sites: [primarySite],
    };
  };

  const mapCustomerToDB = (c: Partial<Customer>) => {
    const primarySite = c.sites?.[0];
    const contacts = primarySite?.contacts ?? [];
    const [c1, c2, c3] = contacts;

    const obj: any = {};
    if ('id' in c || 'code' in c) obj.customer_id = c.id ?? c.code;
    if ('name' in c)   obj.company_name  = c.name;
    if ('seg' in c)    obj.industry_segment = c.seg;
    if ('gstin' in c)  obj.gstin         = c.gstin;
    if ('pan' in c)    obj.pan           = c.pan ?? null;
    if ('inco' in c)   obj.incoterms     = c.inco;
    if ('curr' in c)   obj.currency      = c.curr;
    if ('pay' in c)    obj.payment_terms  = c.pay;
    if ('tier' in c)   obj.tier          = (c.tier === 'New') ? null : c.tier;
    if ('turnover' in c)      obj.last_fy_turnover = c.turnover ?? null;
    if ('revenue' in c)       obj.revenue_ytd      = c.revenue ?? null;
    if ('ratingPayment' in c) obj.payment_rating = (c.ratingPayment ?? 0) / 10;
    if ('ratingOrders'  in c) obj.orders_rating  = (c.ratingOrders  ?? 0) / 10;
    if ('ratingTrend'   in c) obj.trend_rating   = (c.ratingTrend   ?? 0) / 10;
    if ('creditLimit' in c)   obj.credit_limit   = c.creditLimit ?? null;
    if ('crossSellOpportunities' in c) obj.cross_sell_opportunities = c.crossSellOpportunities ?? null;
    if ('notes' in c)  obj.notes = c.notes ?? null;
    if ('createdBy' in c)   obj.created_by   = c.createdBy;
    if ('createdDate' in c) obj.created_date  = c.createdDate ?? null;
    if ('modifiedBy' in c)  obj.modified_by   = c.modifiedBy ?? null;
    if ('modifiedDate' in c) obj.modified_date = c.modifiedDate ?? null;
    if ('customerType' in c) obj.customer_type = c.customerType ?? null;

    // Primary site → flat address columns
    if (primarySite) {
      obj.site_name             = primarySite.name || null;
      obj.city                  = primarySite.city || null;
      obj.state                 = primarySite.state || null;
      obj.billing_address       = primarySite.fullAddress || primarySite.address || null;
      obj.pincode               = primarySite.pincode || null;
      obj.site_gstin            = primarySite.gstin ?? null;
      obj.dispatch_address      = primarySite.dispatchAddress ?? null;
      obj.preferred_transporter = primarySite.transporter ?? null;
      obj.lead_time_note        = primarySite.leadTimeNote ?? null;
    }

    // Flat contact columns
    if (c1 !== undefined) {
      obj.primary_contact_name        = c1?.name;
      obj.primary_contact_designation = c1?.role;
      obj.primary_contact_email       = c1?.email;
      obj.primary_contact_extra_emails = c1?.extraEmails?.length ? c1.extraEmails : null;
      obj.primary_contact_phone       = c1?.phone;
      obj.primary_contact_extra_phones = c1?.extraPhones?.length ? c1.extraPhones : null;
    }
    if (c2 !== undefined) {
      obj.contact2_name        = c2?.name;
      obj.contact2_designation = c2?.role;
      obj.contact2_email       = c2?.email;
      obj.contact2_extra_emails = c2?.extraEmails?.length ? c2.extraEmails : null;
      obj.contact2_phone       = c2?.phone;
      obj.contact2_extra_phones = c2?.extraPhones?.length ? c2.extraPhones : null;
    }
    if (c3 !== undefined) {
      obj.contact3_name        = c3?.name;
      obj.contact3_designation = c3?.role;
      obj.contact3_email       = c3?.email;
      obj.contact3_extra_emails = c3?.extraEmails?.length ? c3.extraEmails : null;
      obj.contact3_phone       = c3?.phone;
      obj.contact3_extra_phones = c3?.extraPhones?.length ? c3.extraPhones : null;
    }

    // Next orders
    if ('nextOrder1' in c) {
      obj.next_order_product1 = c.nextOrder1?.product ?? null;
      obj.next_order_qty1     = c.nextOrder1?.qty ?? null;
      obj.next_order_date1    = c.nextOrder1?.date ?? null;
    }
    if ('nextOrder2' in c) {
      obj.next_order_product2 = c.nextOrder2?.product ?? null;
      obj.next_order_qty2     = c.nextOrder2?.qty ?? null;
      obj.next_order_date2    = c.nextOrder2?.date ?? null;
    }

    return obj;
  };

  const addCustomer = async (customer: Customer) => {
    // mapCustomerToDB derives customer_id from `c.id ?? c.code` — every call
    // site sets `id`, so `code` is never the value actually written or
    // constrained; regenerating `.id` alone (what insertWithIdRetry does) is
    // sufficient to resolve a customer_id collision. `code` has no DB
    // uniqueness constraint of its own and doesn't need parallel retry.
    const { error, finalRecord } = await insertWithIdRetry<Customer>(
      'customers',
      customer,
      mapCustomerToDB,
      'CUST',
      async () => {
        const { data: rows } = await supabase.from('customers').select('customer_id');
        return (rows ?? []).map(r => r.customer_id);
      },
    );
    if (!error) {
      setData(prev => ({ ...prev, customers: [...prev.customers, finalRecord] }));
    } else {
      console.error('Error adding customer:', error);
      throw error;
    }
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    const { error } = await supabase.from('customers').update(mapCustomerToDB(updates)).eq('customer_id', id);
    if (!error) {
      setData(prev => ({
        ...prev,
        customers: prev.customers.map(c => c.id === id ? { ...c, ...updates } : c)
      }));
    } else {
      console.error('Error updating customer:', error);
      throw error;
    }
  };

  const deleteCustomer = async (id: string) => {
    const { error } = await supabase.from('customers').delete().eq('customer_id', id);
    if (!error) {
      setData(prev => ({
        ...prev,
        customers: prev.customers.filter(c => c.id !== id)
      }));
    } else {
      console.error('Error deleting customer:', error);
    }
  };

  // Map real follow-up log count → pipeline stage (excludes quote-sent entries).
  const stageFromLogCount = (count: number): PipelineStage => {
    if (count <= 0) return 'Sent Quotation';
    if (count === 1) return 'Offer Acknowledged';
    if (count === 2) return '1st Follow-up';
    if (count === 3) return '2nd Follow-up';
    return 'Negotiation';
  };

  const addFollowUpLog = async (quoteId: string, log: any, nextDate: string | null = null, nextTime: string | null = null, owner: string = '', stageOverride: string | null = null) => {
    const existing = data.followups.find(f => f.quote_id === quoteId);
    const nowIso = new Date().toISOString();

    if (existing) {
      const updatedLogs = [log, ...existing.logs];
      // If caller supplied an explicit stage, use it; otherwise auto-derive from log count.
      const newStage: PipelineStage = stageOverride
        ? (stageOverride as PipelineStage)
        : (() => {
            const realCount = updatedLogs.filter((l: any) => {
              const n: string = l.note ?? '';
              return !n.startsWith('Quote sent —') && !n.startsWith('Sent MRT-') && !n.startsWith('Sent ');
            }).length;
            return stageFromLogCount(realCount);
          })();
      const stageChanged = newStage !== existing.stage;

      const { error } = await supabase
        .from('followups')
        .update({
          logs: updatedLogs,
          next_date: nextDate,
          next_time: nextTime,
          status: 'open',
          owner: owner || existing.owner,
          stage: newStage,
          // Reset stage TAT clock only when advancing to a new stage
          ...(stageChanged ? { stage_entered_at: nowIso } : {}),
          updated_at: nowIso,
        })
        .eq('quote_id', quoteId);

      if (!error) {
        setData(prev => ({
          ...prev,
          followups: prev.followups.map(f => f.quote_id === quoteId ? {
            ...f,
            logs: updatedLogs,
            next_date: nextDate,
            next_time: nextTime,
            status: 'open' as const,
            owner: owner || f.owner,
            stage: newStage,
            ...(stageChanged ? { stage_entered_at: nowIso } : {}),
          } : f)
        }));
      } else {
        console.error('Error updating follow-up:', error);
        throw error;
      }
    } else {
      const nowIso = new Date().toISOString();
      const newFollowUp = {
        id: quoteId,
        quote_id: quoteId,
        owner: owner || stampName(),
        next_date: nextDate,
        next_time: nextTime,
        status: 'open' as const,
        stage: 'Sent Quotation' as PipelineStage,
        stage_entered_at: nowIso,
        outcome: null,
        logs: [log],
        created_at: nowIso,
        updated_at: nowIso
      };

      const { error } = await supabase.from('followups').insert([newFollowUp]);
      if (!error) {
        setData(prev => ({
          ...prev,
          followups: [...prev.followups, newFollowUp]
        }));
      } else {
        console.error('Error creating follow-up:', error);
        throw error;
      }
    }
  };

  const addFollowUpLogBulk = async (quoteIds: string[], log: FollowUpLog, nextDate: string | null = null, nextTime: string | null = null) => {
    await Promise.all(quoteIds.map(qid => addFollowUpLog(qid, log, nextDate, nextTime)));
  };

  // Propagate a quote outcome to its parent enquiry so enquiry-based views
  // (Enquiries Won/Lost tabs, Analytics, funnel) stay consistent with the quote.
  // `enqStatus` null = no change. Updates both DB and local state.
  const syncEnquiryStatusForQuote = async (quoteId: string, enqStatus: EnqStatus | null) => {
    if (!enqStatus) return;
    const quote = data.quotes.find(q => q.id === quoteId);
    const enqId = quote?.enqRef;
    if (!enqId) return;
    const enq = data.enquiries.find(e => e.id === enqId);
    if (!enq || enq.status === enqStatus) return;
    const { error } = await supabase.from('enquiries').update({ status: enqStatus }).eq('id', enqId);
    if (error) { console.error('Error syncing enquiry status:', error); return; }
    setData(prev => ({
      ...prev,
      enquiries: prev.enquiries.map(e => e.id === enqId ? { ...e, status: enqStatus } : e),
    }));
  };

  const closeFollowUp = async (quoteId: string, outcome: PipelineOutcome = 'Other') => {
    const { error } = await supabase
      .from('followups')
      .update({
        status: 'closed',
        stage: 'Closed',
        outcome,
        stage_entered_at: new Date().toISOString(),
        next_date: null,
        next_time: null,
        updated_at: new Date().toISOString(),
      })
      .eq('quote_id', quoteId);
    if (error) {
      console.error('Error closing follow-up:', error);
      throw error;
    }

    // Sync quote.status so Dashboard, pipeline counts, and filters all reflect the real state
    if (outcome === 'Won' || outcome === 'Lost') {
      const { error: qErr } = await supabase
        .from('quotes')
        .update({ status: outcome })
        .eq('id', quoteId);
      if (qErr) console.error('Error updating quote status:', qErr);
      // Propagate to the parent enquiry so enquiry-based views stay in sync.
      await syncEnquiryStatusForQuote(quoteId, outcome);
    }

    setData(prev => ({
      ...prev,
      followups: prev.followups.map(f => f.quote_id === quoteId
        ? { ...f, status: 'closed' as const, stage: 'Closed' as PipelineStage, outcome, next_date: null, next_time: null }
        : f),
      quotes: (outcome === 'Won' || outcome === 'Lost')
        ? prev.quotes.map(q => q.id === quoteId ? { ...q, status: outcome } : q)
        : prev.quotes,
    }));
  };

  // Move a quote's card to a pipeline stage and reset its TAT clock.
  // Moving to 'Closed' also flips status to closed; moving out of Closed reopens.
  const setFollowUpStage = async (quoteId: string, stage: PipelineStage, outcome: PipelineOutcome | null = null) => {
    const nowIso = new Date().toISOString();
    const isClosed = stage === 'Closed';
    const existing = data.followups.find(f => f.quote_id === quoteId);

    const update: Record<string, any> = {
      stage,
      stage_entered_at: nowIso,
      status: isClosed ? 'closed' : 'open',
      outcome: isClosed ? (outcome ?? 'Other') : null,
      updated_at: nowIso,
    };
    if (isClosed) { update.next_date = null; update.next_time = null; }

    if (existing) {
      const { error } = await supabase.from('followups').update(update).eq('quote_id', quoteId);
      if (error) { console.error('Error setting stage:', error); throw error; }
    } else {
      // No follow-up row yet — create one.
      const row = {
        id: quoteId,
        quote_id: quoteId,
        owner: stampName(),
        next_date: null,
        next_time: null,
        logs: [],
        created_at: nowIso,
        ...update,
      };
      const { error } = await supabase.from('followups').insert([row]);
      if (error) { console.error('Error creating follow-up on stage move:', error); throw error; }
    }

    // Sync quote.status when closing as Won or Lost
    const resolvedOutcome = isClosed ? (outcome ?? 'Other') : null;
    if (isClosed && (resolvedOutcome === 'Won' || resolvedOutcome === 'Lost')) {
      const { error: qErr } = await supabase.from('quotes').update({ status: resolvedOutcome }).eq('id', quoteId);
      if (qErr) console.error('Error updating quote status on stage close:', qErr);
      await syncEnquiryStatusForQuote(quoteId, resolvedOutcome);
    }

    setData(prev => ({
      ...prev,
      followups: prev.followups.map(f => f.quote_id === quoteId
        ? { ...f, stage, stage_entered_at: nowIso, status: (isClosed ? 'closed' : 'open') as 'open' | 'closed',
            outcome: resolvedOutcome,
            ...(isClosed ? { next_date: null, next_time: null } : {}) }
        : f),
      quotes: (isClosed && (resolvedOutcome === 'Won' || resolvedOutcome === 'Lost'))
        ? prev.quotes.map(q => q.id === quoteId ? { ...q, status: resolvedOutcome as 'Won' | 'Lost' } : q)
        : prev.quotes,
    }));
  };

  const reopenFollowUp = async (quoteId: string) => {
    // Reopening pulls the card out of Closed back into Negotiation and
    // restarts that stage's TAT clock.
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('followups')
      .update({ status: 'open', stage: 'Negotiation', outcome: null, stage_entered_at: nowIso, updated_at: nowIso })
      .eq('quote_id', quoteId);
    if (error) {
      console.error('Error reopening follow-up:', error);
      throw error;
    }
    // Reset quote status back to Sent so it re-enters the pipeline
    const { error: qErr } = await supabase.from('quotes').update({ status: 'Sent' }).eq('id', quoteId);
    if (qErr) console.error('Error resetting quote status on reopen:', qErr);
    // The enquiry had a quote, so it returns to 'Quoted' (not Won/Lost).
    await syncEnquiryStatusForQuote(quoteId, 'Quoted');

    setData(prev => ({
      ...prev,
      followups: prev.followups.map(f => f.quote_id === quoteId
        ? { ...f, status: 'open' as const, stage: 'Negotiation' as PipelineStage, outcome: null, stage_entered_at: nowIso }
        : f),
      quotes: prev.quotes.map(q => q.id === quoteId && (q.status === 'Won' || q.status === 'Lost')
        ? { ...q, status: 'Sent' as const }
        : q),
    }));
  };

  const addSignatory = async (sig: AuthorizedSignatory) => {
    const { error } = await supabase.from('authorized_signatories').insert([sig]);
    if (!error) {
      setData(prev => ({ ...prev, signatories: [...prev.signatories, sig] }));
    } else {
      console.error('Error adding signatory:', error);
      throw error;
    }
  };

  const updateSignatory = async (id: string, updates: Partial<AuthorizedSignatory>) => {
    const { error } = await supabase.from('authorized_signatories').update(updates).eq('id', id);
    if (!error) {
      setData(prev => ({
        ...prev,
        signatories: prev.signatories.map(s => s.id === id ? { ...s, ...updates } : s)
      }));
    } else {
      console.error('Error updating signatory:', error);
      throw error;
    }
  };

  const deleteSignatory = async (id: string) => {
    const { error } = await supabase.from('authorized_signatories').delete().eq('id', id);
    if (!error) {
      setData(prev => ({
        ...prev,
        signatories: prev.signatories.filter(s => s.id !== id)
      }));
    } else {
      console.error('Error deleting signatory:', error);
      throw error;
    }
  };

  // ── Team roster (people → process role) ──────────────────────────
  // The roster key is the (email, role, display_name) triple: one login can hold
  // several roles, one role can be covered by several people, and — since a
  // shared login (e.g. sales@) can now have two people covering the SAME role —
  // display_name disambiguates rows that would otherwise collide on (email, role).
  const addTeamMember = async (m: TeamMember) => {
    const row = {
      ...m,
      email: m.email.trim().toLowerCase(),
      aliases: (m.aliases ?? []).map(a => a.trim().toLowerCase()).filter(Boolean),
    };
    const { error } = await supabase.from('team_roster').insert([row]);
    if (!error) {
      setData(prev => ({ ...prev, roster: [...prev.roster, row] }));
    } else {
      console.error('Error adding team member:', error);
      throw error;
    }
  };

  const updateTeamMember = async (email: string, role: DoerRole, displayName: string, updates: Partial<TeamMember>) => {
    const key = email.trim().toLowerCase();
    const nameKey = displayName.trim();
    const normalized: Partial<TeamMember> = 'aliases' in updates
      ? { ...updates, aliases: (updates.aliases ?? []).map(a => a.trim().toLowerCase()).filter(Boolean) }
      : updates;
    const patch = { ...normalized, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('team_roster').update(patch).eq('email', key).eq('role', role).eq('display_name', nameKey);
    if (!error) {
      setData(prev => ({
        ...prev,
        roster: prev.roster.map(m => (m.email === key && m.role === role && m.display_name === nameKey) ? { ...m, ...normalized } : m)
      }));
    } else {
      console.error('Error updating team member:', error);
      throw error;
    }
  };

  const deleteTeamMember = async (email: string, role: DoerRole, displayName: string) => {
    const key = email.trim().toLowerCase();
    const nameKey = displayName.trim();
    const { error } = await supabase.from('team_roster').delete().eq('email', key).eq('role', role).eq('display_name', nameKey);
    if (!error) {
      setData(prev => ({ ...prev, roster: prev.roster.filter(m => !(m.email === key && m.role === role && m.display_name === nameKey)) }));
    } else {
      console.error('Error deleting team member:', error);
      throw error;
    }
  };

  // Resolve a free-text doer/owner/who (email, display name, OR alias) to its
  // role(s). Case-insensitive; an identity may hold several roles → returns all.
  const roleForDoer = (nameOrEmail?: string | null): DoerRole[] => {
    if (!nameOrEmail) return [];
    const key = nameOrEmail.trim().toLowerCase();
    return data.roster
      .filter(m =>
        m.email.toLowerCase() === key ||
        m.display_name.trim().toLowerCase() === key ||
        (m.aliases ?? []).some(a => a.trim().toLowerCase() === key))
      .map(m => m.role);
  };

  // ── Active doer (post-login identity) ────────────────────────────
  const setActiveDoer = (d: ActiveDoer | null) => {
    setActiveDoerState(d);
    try {
      if (d) sessionStorage.setItem('active_doer', JSON.stringify(d));
      else sessionStorage.removeItem('active_doer');
    } catch { /* sessionStorage unavailable — keep in-memory only */ }
  };
  const clearActiveDoer = () => setActiveDoer(null);

  // Name stamped on records this session: sales@'s picked identity (Nimisha
  // Pawar / Ruby) takes priority since it's the real person behind that
  // shared login; else the identified doer; else the login.
  const stampName = (): string =>
    salesIdentity || activeDoer?.display_name || user?.email || user?.user_metadata?.full_name || 'Unknown';

  const addUnit = async (u: CompanyUnit) => {
    // Strip undefined keys so Supabase doesn't reject them; coerce empties to null
    const row: Record<string, any> = { id: u.id, name: u.name, is_default: !!u.is_default };
    if (u.gstin) row.gstin = u.gstin;
    if (u.address) row.address = u.address;
    if (u.signatory_id) row.signatory_id = u.signatory_id;
    if (u.header_url) row.header_url = u.header_url;
    if (u.sig_url) row.sig_url = u.sig_url;
    const { error } = await supabase.from('company_units').insert([row]);
    if (!error) setData(prev => ({ ...prev, units: [...prev.units, u] }));
    else { console.error('Error adding unit:', error); throw new Error(error.message || 'Failed to add unit'); }
  };

  const updateUnit = async (id: string, updates: Partial<CompanyUnit>) => {
    const row: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      row[k] = v === '' ? null : v;
    }
    const { error } = await supabase.from('company_units').update(row).eq('id', id);
    if (!error) setData(prev => ({ ...prev, units: prev.units.map(u => u.id === id ? { ...u, ...updates } : u) }));
    else { console.error('Error updating unit:', error); throw new Error(error.message || 'Failed to update unit'); }
  };

  const deleteUnit = async (id: string) => {
    const { error } = await supabase.from('company_units').delete().eq('id', id);
    if (!error) setData(prev => ({
      ...prev,
      units: prev.units.filter(u => u.id !== id),
      bankAccounts: prev.bankAccounts.filter(b => b.unit_id !== id),
    }));
    else { console.error('Error deleting unit:', error); throw error; }
  };

  const addBankAccount = async (b: BankAccount) => {
    const { error } = await supabase.from('bank_accounts').insert([b]);
    if (!error) setData(prev => ({ ...prev, bankAccounts: [...prev.bankAccounts, b] }));
    else { console.error('Error adding bank account:', error); throw error; }
  };

  const updateBankAccount = async (id: string, updates: Partial<BankAccount>) => {
    const { error } = await supabase.from('bank_accounts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) setData(prev => ({ ...prev, bankAccounts: prev.bankAccounts.map(b => b.id === id ? { ...b, ...updates } : b) }));
    else { console.error('Error updating bank account:', error); throw error; }
  };

  const deleteBankAccount = async (id: string) => {
    const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
    if (!error) setData(prev => ({ ...prev, bankAccounts: prev.bankAccounts.filter(b => b.id !== id) }));
    else { console.error('Error deleting bank account:', error); throw error; }
  };

  const linkPendingPOSubmissions = async () => {
    const { data: pending } = await supabase
      .from('po_submissions').select('*').eq('linked', false);
    if (!pending?.length) return;
    setData(prev => {
      let orders = prev.orders;
      for (const sub of pending) {
        const order = orders.find(o => o.quoteRef === sub.quote_id);
        if (order) {
          supabase.from('orders').update({ po_filename: sub.storage_path }).eq('id', order.id);
          supabase.from('po_submissions').update({ linked: true }).eq('id', sub.id);
          orders = orders.map(o =>
            o.id === order.id ? { ...o, poFileName: sub.storage_path } : o
          );
        }
      }
      return { ...prev, orders };
    });
  };

  const syncGmailEnquiries = async (silent = false) => {
    const currentSettings = await supabase.from('app_settings').select('*').eq('id', 'config').single();
    const s = currentSettings.data;
    if (!s?.gmail_enabled || !s.gmail_labels?.length) return;

    try {
      const emails = await fetchLabelledEmails(s.gmail_labels, s.gmail_last_sync, silent);
      const now = new Date().toISOString();

      for (const email of emails) {
        const alreadyExists = await supabase
          .from('enquiries').select('id').eq('gmail_message_id', email.messageId).maybeSingle();
        if (alreadyExists.data) continue;

        const newEnq: Enquiry = {
          id: `ENQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          recv: email.date,
          src: 'Email',
          cust: email.from,
          contact: email.from,
          email: email.fromEmail,
          urg: 'Normal',
          status: 'New',
          assigned: '',
          notes: `Subject: ${email.subject}\n\n${email.body}`,
          ageH: 0,
          qRef: null,
          items: [],
          gmailMessageId: email.messageId,
        };

        // Fetch and upload email attachments to storage
        const emailAttachments: import('../lib/types').Attachment[] = [];
        try {
          const rawAttachments = await fetchEmailAttachments(email.messageId, email.payload, silent);
          for (const att of rawAttachments) {
            const attId = Math.random().toString(36).substr(2, 9);
            const safeName = att.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `enquiries/${newEnq.id}/${attId}_${safeName}`;
            const file = new File([att.blob], att.fileName, { type: att.mimeType });
            const storagePath = await uploadToS3(file, path);
            if (storagePath) {
              emailAttachments.push({
                id: attId,
                fileName: att.fileName,
                storagePath,
                uploadedAt: new Date().toISOString(),
              });
            }
          }
        } catch {
          // attachment fetch/upload failure should not block enquiry creation
        }

        if (emailAttachments.length) newEnq.attachments = emailAttachments;

        const dbPayload = { ...mapEnquiryToDB(newEnq), gmail_message_id: email.messageId };
        const { error } = await supabase.from('enquiries').insert([dbPayload]);
        if (!error) {
          setData(prev => ({ ...prev, enquiries: [newEnq, ...prev.enquiries] }));
        }
      }

      await supabase.from('app_settings').update({ gmail_last_sync: now }).eq('id', 'config');
      setData(prev => prev.settings ? { ...prev, settings: { ...prev.settings, gmail_last_sync: now } } : prev);
    } catch (err: any) {
      if (silent) return; // background sync: swallow all errors silently
      console.error('Gmail sync error:', err);
      throw err; // manual sync: let Settings UI catch and display the error
    }
  };

  useEffect(() => {
    const freq = data.settings?.gmail_sync_freq ?? 0;
    const enabled = data.settings?.gmail_enabled ?? false;
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    if (enabled && freq > 0) {
      syncIntervalRef.current = setInterval(() => syncGmailEnquiries(true), freq * 60 * 1000);
    }
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, [data.settings?.gmail_enabled, data.settings?.gmail_sync_freq]);

  const logout = async () => {
    await signOut();
    setUser(null);
  };

  return (
    <AppContext.Provider
      value={{
        data,
        loading,
        user,
        authError,
        addEnquiry,
        updateEnquiry,
        deleteEnquiry,
        addQuote,
        updateQuote,
        deleteQuote,
        addOrder,
        updateOrder,
        deleteOrder,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addFollowUpLog,
        addFollowUpLogBulk,
        closeFollowUp,
        reopenFollowUp,
        setFollowUpStage,
        addSignatory,
        updateSignatory,
        deleteSignatory,
        addTeamMember,
        updateTeamMember,
        deleteTeamMember,
        roleForDoer,
        activeDoer,
        setActiveDoer,
        clearActiveDoer,
        stampName,
        resolvedSignatory,
        salesIdentity,
        setSalesIdentity,
        addUnit,
        updateUnit,
        deleteUnit,
        addBankAccount,
        updateBankAccount,
        deleteBankAccount,
        globalSearchQuery,
        setGlobalSearchQuery,
        globalDateRange,
        setGlobalDateRange,
        detailPanel,
        openDetailPanel,
        closeDetailPanel,
        attachmentModal,
        openAttachmentModal,
        closeAttachmentModal,
        refreshData,
        syncGmailEnquiries,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppStore must be used within an AppProvider');
  }
  return context;
}
