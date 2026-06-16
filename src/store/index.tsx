import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Customer, DataStore, Enquiry, Order, Quote, FollowUp, FollowUpLog, AuthorizedSignatory, CompanyUnit, BankAccount, PipelineStage, PipelineOutcome, TeamMember, DoerRole, EnqStatus } from '../lib/types';
import { supabase, signOut, getSettings } from '../lib/supabase';
import { uploadToS3 } from '../lib/s3';
import { fetchLabelledEmails, fetchEmailAttachments } from '../lib/gmail';
import { calculateAgeHours } from '../lib/utils';
import { User } from '@supabase/supabase-js';

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
  addOrder: (order: Order) => Promise<void>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
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
  updateTeamMember: (email: string, role: DoerRole, updates: Partial<TeamMember>) => Promise<void>;
  deleteTeamMember: (email: string, role: DoerRole) => Promise<void>;
  roleForDoer: (nameOrEmail?: string | null) => DoerRole[];
  // Active doer (post-login identity on a possibly-shared Google login).
  activeDoer: ActiveDoer | null;
  setActiveDoer: (d: ActiveDoer | null) => void;
  clearActiveDoer: () => void;
  // The name to stamp on records this session: active doer's name, else email.
  stampName: () => string;
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
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeDoer, setActiveDoerState] = useState<ActiveDoer | null>(() => {
    try { const s = sessionStorage.getItem('active_doer'); return s ? JSON.parse(s) : null; } catch { return null; }
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
      if (validatedUser) {
        refreshData().finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const validatedUser = checkUserDomain(session?.user ?? null);
      setUser(validatedUser);
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
    if (e.gmail_message_id) obj.gmailMessageId = e.gmail_message_id;

    delete obj.site_id;
    delete obj.contact_id;
    delete obj.contact_phone;
    delete obj.age_h;
    delete obj.q_ref;
    delete obj.gmail_message_id;

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
  if ('notes' in e) obj.notes = e.notes;
  if ('items' in e) obj.items = e.items;
  if ('attachments' in e) obj.attachments = e.attachments;
  if ('gmailMessageId' in e) obj.gmail_message_id = e.gmailMessageId ?? null;
  else if ('gmail_message_id' in e) obj.gmail_message_id = e.gmail_message_id;

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
    if (o.po_filename) obj.poFileName = o.po_filename;
    if (o.sheets_exported_at) obj.sheetsExportedAt = o.sheets_exported_at;
    if (o.unit_id) obj.unitId = o.unit_id;
    if (o.bank_account_id) obj.bankAccountId = o.bank_account_id;
    if (o.price_basis) obj.priceBasis = o.price_basis;
    if (o.country_of_origin) obj.countryOfOrigin = o.country_of_origin;
    if (o.exim_code) obj.eximCode = o.exim_code;
    if (o.custom_point) obj.customPoint = o.custom_point;
    if (o.pan) obj.pan = o.pan;
    if (o.hsn) obj.hsn = o.hsn;
    if ('authorized_person' in o) {
      obj.authorizedPerson = o.authorized_person;
      delete obj.authorized_person;
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
    delete obj.po_filename;
    delete obj.sheets_exported_at;
    delete obj.unit_id;
    delete obj.bank_account_id;
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
    if ('items' in o) obj.items = o.items;
    if ('adjustments' in o) obj.adjustments = o.adjustments || [];
    if ('inco' in o) obj.inco = o.inco;
    if ('authorizedPerson' in o) obj.authorized_person = o.authorizedPerson;
    if ('terms' in o) obj.terms = o.terms;
    if ('attachments' in o) obj.attachments = o.attachments;

    if ('quoteRef' in o) obj.quote_ref = o.quoteRef || null;
    else if ('quote_ref' in o) obj.quote_ref = o.quote_ref || null;

    if ('enqRef' in o) obj.enq_ref = o.enqRef || null;
    else if ('enq_ref' in o) obj.enq_ref = o.enq_ref || null;

    if ('siteId' in o) obj.site_id = o.siteId || null;
    else if ('site_id' in o) obj.site_id = o.site_id || null;

    if ('contactId' in o) obj.contact_id = o.contactId || null;
    if ('contact' in o) obj.contact = o.contact || null;
    if ('email' in o) obj.email = o.email || null;
    if ('phone' in o) obj.contact_phone = o.phone || null;
    if ('custEnquiryDocNo' in o) obj.cust_enquiry_doc_no = o.custEnquiryDocNo || null;

    if ('poNo' in o) obj.po_no = o.poNo;
    else if ('po_no' in o) obj.po_no = o.po_no;

    if ('poDate' in o) obj.po_date = o.poDate;
    else if ('po_date' in o) obj.po_date = o.po_date;

    if ('dlvDate' in o) obj.dlv_date = o.dlvDate;
    else if ('dlv_date' in o) obj.dlv_date = o.dlv_date;

    if ('poFileName' in o) obj.po_filename = o.poFileName;
    else if ('po_filename' in o) obj.po_filename = o.po_filename;

    if ('sheetsExportedAt' in o) obj.sheets_exported_at = o.sheetsExportedAt;

    if ('unitId' in o) obj.unit_id = o.unitId || null;
    if ('bankAccountId' in o) obj.bank_account_id = o.bankAccountId || null;
    if ('priceBasis' in o) obj.price_basis = o.priceBasis || null;
    if ('countryOfOrigin' in o) obj.country_of_origin = o.countryOfOrigin || null;
    if ('eximCode' in o) obj.exim_code = o.eximCode || null;
    if ('customPoint' in o) obj.custom_point = o.customPoint || null;
    if ('pan' in o) obj.pan = o.pan || null;
    if ('hsn' in o) obj.hsn = o.hsn || null;
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
        { data: rosterData }
      ] = await Promise.all([
        supabase.from('enquiries').select('*').order('recv', { ascending: false }),
        supabase.from('quotes').select('*').order('date', { ascending: false }),
        supabase.from('orders').select('*').order('po_date', { ascending: false }),
        supabase.from('customers').select('*').order('name'),
        supabase.from('followups').select('*'),
        supabase.from('app_settings').select('*').eq('id', 'config').single(),
        supabase.from('authorized_signatories').select('*').order('name'),
        supabase.from('company_units').select('*').order('name'),
        supabase.from('bank_accounts').select('*'),
        supabase.from('team_roster').select('*').order('display_name')
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
    const { error } = await supabase.from('enquiries').insert([mapEnquiryToDB(enquiry)]);
    if (!error) {
      setData(prev => ({ ...prev, enquiries: [enquiry, ...prev.enquiries] }));
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
    const { error } = await supabase.from('enquiries').delete().eq('id', id);
    if (!error) {
      setData(prev => ({
        ...prev,
        enquiries: prev.enquiries.filter(e => e.id !== id)
      }));
    } else {
      console.error('Error deleting enquiry:', error);
      throw error;
    }
  };

  const addQuote = async (quote: Quote) => {
    const { error } = await supabase.from('quotes').insert([mapQuoteToDB(quote)]);
    if (!error) {
      setData(prev => ({ ...prev, quotes: [quote, ...prev.quotes] }));
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

  const addOrder = async (order: Order) => {
    const { error } = await supabase.from('orders').insert([mapOrderToDB(order)]);
    if (!error) {
      setData(prev => ({ ...prev, orders: [order, ...prev.orders] }));
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

  const mapCustomerFromDB = (c: any): Customer => ({
    ...c,
    sites: Array.isArray(c.sites) ? c.sites.map((s: any) => ({
      ...s,
      contacts: Array.isArray(s.contacts) ? s.contacts : [],
    })) : [],
    ratingPayment: c.rating_payment ?? 0,
    ratingOrders: c.rating_orders ?? 0,
    ratingTrend: c.rating_trend ?? 0,
    nextOrders: c.next_orders ?? [],
    tier: c.tier ?? 'New',
    turnover: c.turnover ?? 0,
    revenue: c.revenue ?? 0,
    rating_payment: undefined,
    rating_orders: undefined,
    rating_trend: undefined,
    next_orders: undefined,
  });

  const mapCustomerToDB = (c: Partial<Customer>) => {
    const obj: any = { ...c };
    if ('ratingPayment' in c) { obj.rating_payment = c.ratingPayment; delete obj.ratingPayment; }
    if ('ratingOrders' in c)  { obj.rating_orders  = c.ratingOrders;  delete obj.ratingOrders;  }
    if ('ratingTrend' in c)   { obj.rating_trend   = c.ratingTrend;   delete obj.ratingTrend;   }
    if ('nextOrders' in c)    { obj.next_orders    = c.nextOrders;    delete obj.nextOrders;    }
    return obj;
  };

  const addCustomer = async (customer: Customer) => {
    const { error } = await supabase.from('customers').insert([mapCustomerToDB(customer)]);
    if (!error) {
      setData(prev => ({ ...prev, customers: [...prev.customers, customer] }));
    } else {
      console.error('Error adding customer:', error);
      throw error;
    }
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    const { error } = await supabase.from('customers').update(mapCustomerToDB(updates)).eq('id', id);
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
    const { error } = await supabase.from('customers').delete().eq('id', id);
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
  // The roster key is the (email, role) pair: one login can hold several roles,
  // and one role can be covered by several people.
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

  const updateTeamMember = async (email: string, role: DoerRole, updates: Partial<TeamMember>) => {
    const key = email.trim().toLowerCase();
    const normalized: Partial<TeamMember> = 'aliases' in updates
      ? { ...updates, aliases: (updates.aliases ?? []).map(a => a.trim().toLowerCase()).filter(Boolean) }
      : updates;
    const patch = { ...normalized, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('team_roster').update(patch).eq('email', key).eq('role', role);
    if (!error) {
      setData(prev => ({
        ...prev,
        roster: prev.roster.map(m => (m.email === key && m.role === role) ? { ...m, ...normalized } : m)
      }));
    } else {
      console.error('Error updating team member:', error);
      throw error;
    }
  };

  const deleteTeamMember = async (email: string, role: DoerRole) => {
    const key = email.trim().toLowerCase();
    const { error } = await supabase.from('team_roster').delete().eq('email', key).eq('role', role);
    if (!error) {
      setData(prev => ({ ...prev, roster: prev.roster.filter(m => !(m.email === key && m.role === role)) }));
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

  // Name stamped on records this session: the identified doer, else the login.
  const stampName = (): string =>
    activeDoer?.display_name || user?.email || user?.user_metadata?.full_name || 'Unknown';

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
        addOrder,
        updateOrder,
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
