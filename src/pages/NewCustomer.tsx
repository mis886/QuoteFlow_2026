import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui';
import { Customer, Site, Contact, NextOrder } from '../lib/types';
import { generateId, PAY_OPTIONS, normalizePayTerms, findSimilarCustomers, isLead, MAIN_OFFICE_ID, cleanGstin, gstinProblem, gstinState, gstinStateWarning, panFromGstin, isValidPan } from '../lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { normalizeIndianPhone } from '../lib/phone';
import { Plus, Trash2, MapPin, User, Mail, Phone, Wand2 } from 'lucide-react';

const INCO_OPTIONS_CUST = [
  'EXW', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP', 'FCA',
  'Ex Bhiwandi Warehouse', 'Ex Bhiwandi Warehouse Self Pickup',
  'Ex Factory Warehouse', 'Delivered', 'Free Delivery till Transport', 'Ex-Port',
];


const normalizeInco = (raw: string | undefined): string => {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  const exact = INCO_OPTIONS_CUST.find(o => o.toLowerCase() === lower);
  if (exact) return exact;
  if (/bhiwandi.*self|self.*pickup/.test(lower)) return 'Ex Bhiwandi Warehouse Self Pickup';
  if (/bhiwandi/.test(lower)) return 'Ex Bhiwandi Warehouse';
  if (/ex.*factory|factory.*wh/.test(lower)) return 'Ex Factory Warehouse';
  if (/free.*del|del.*transport/.test(lower)) return 'Free Delivery till Transport';
  if (/delivered/.test(lower)) return 'Delivered';
  if (/ex.*port/.test(lower)) return 'Ex-Port';
  if (/^exw|ex.?work/.test(lower)) return 'EXW';
  if (/^fob/.test(lower)) return 'FOB';
  if (/^cif/.test(lower)) return 'CIF';
  if (/^cfr|^c&f/.test(lower)) return 'CFR';
  if (/^dap/.test(lower)) return 'DAP';
  if (/^ddp/.test(lower)) return 'DDP';
  if (/^fca/.test(lower)) return 'FCA';
  if (/^for/.test(lower)) return 'EXW';
  return '';
};


const SEG_OPTIONS = [
  'Adhesive', 'Camphor Tablet MFR / Bhimseni', 'Cosmetics', 'Dhoop & Agarbatti',
  'F & F - All', 'F & F - Fine Fragrance', 'F & F - Flavours', 'F & F - Incense',
  'F & F - Soaps & detergents', 'Lubricants', 'Mehandi', 'Misc', 'Paints',
  'Pharma', 'Phenyl', 'Resin Mfg', 'Rubber', 'Sodium Acetate', 'Textile Auxiliaries',
];

const normalizeSeg = (raw: string | undefined | null): string => {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  return SEG_OPTIONS.find(o => o.toLowerCase() === lower) || '';
};

const CRM_OPTIONS = ['Nimisha', 'Ruby', 'Shishir', 'Anil'];

function hasMixedContent(text: string) {
  return /(?:transport(?:er)?|lead\s*time|plant\s*:|unit\s*:|c\/o\b|for\s+dispatch|parcel\s+address|gst(?:in)?\s*:|mob(?:ile)?\s*(?:no)?\.?\s*[:\-–]|ph(?:one)?\s*(?:no)?\.?\s*[:\-–]|tel(?:ephone)?\s*(?:no)?\.?\s*[:\-–]|\b\d{10,}\b|\b\d{5,}[\s\-]\d{5,}\b|[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/i.test(text);
}

function titleCaseAddress(text: string): string {
  const lowerWords = new Set(['of', 'and', 'the', 'in', 'at', 'by', 'to', 'for', 'a', 'an', 'via', 'near']);
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    return trimmed.split(/\s+/).map((word, i) => {
      const letters = word.replace(/[^a-zA-Z]/g, '');
      if (!letters) return word;
      // Only fix words that are entirely lowercase — leave ALL-CAPS, Mixed-Case, XII, LTD. etc untouched
      if (letters !== letters.toLowerCase()) return word;
      // All-lowercase: apply connector rule or capitalise first letter
      if (i > 0 && lowerWords.has(letters)) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }).join('\n');
}

function extractPhones(value: string): string[] {
  return value
    .replace(/(?:\+91|0091)[\s\-]*/g, '')
    .split(/[,;\/]+/)
    .map(p => p.replace(/[^\d]/g, '').trim())
    .filter(p => p.length >= 10);
}

function isBarePhone(line: string): boolean {
  // Match lines that are purely phone numbers (digits, spaces, dashes, parens, commas between numbers)
  // e.g. "7830018788", "05862-258545", "9512360026, 7710274547"
  const stripped = line.replace(/(?:\+91|0091)[\s\-]*/g, '');
  // Must contain no letters, and have at least one group of 10+ contiguous digits
  return !/[a-zA-Z]/.test(stripped) && /\d{10,}|\d{5,}[\s\-]\d{5,}/.test(stripped);
}

function extractGstin(line: string): string {
  // GSTIN: 15-char alphanumeric matching the standard pattern
  const m = line.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/);
  return m ? m[1] : '';
}

function parseMixedAddress(raw: string): {
  cleanAddress: string;
  transporter: string;
  leadTimeNote: string;
  dispatchHint: string;
  siteName: string;
  phones: string[];
  gstin: string;
} {
  const lines = raw.split('\n');
  const kept: string[] = [];
  let transporter = '';
  let leadTime = '';
  let siteName = '';
  let gstin = '';
  const dispatchLines: string[] = [];
  const phones: string[] = [];
  const transporterRx   = /^(?:transport(?:er)?|carrier|via transport|by transport)\s*[:\-–]\s*/i;
  const leadTimeRx      = /^(?:lead\s*time|delivery\s*(?:time|note)|l\.?t\.?)\s*[:\-–]\s*/i;
  const plantRx         = /^(?:plant|unit|location)\s*[:\-–]\s*/i;
  const dispatchStartRx = /^(?:for\s+dispatch(?:ed)?\s+items?\s+only|c\/o\b|parcel\s+address\s*[:\-–]?)/i;
  const phoneRx         = /^(?:mob(?:ile)?\.?\s*(?:no\.?)?|ph(?:one)?\.?\s*(?:no\.?)?|tel(?:ephone)?\.?\s*(?:no\.?)?|contact\s*(?:no\.?|number)?|m\.?\s*no\.?)\s*[:\-–\s]\s*/i;
  const gstinLabelRx    = /^(?:gst(?:in)?|uin|gst\s*no\.?)\s*[:\-–\s]\s*/i;
  let inDispatch = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { if (!inDispatch) kept.push(''); continue; }
    if (transporterRx.test(trimmed)) {
      transporter = trimmed.replace(transporterRx, '').trim();
      inDispatch = false;
    } else if (leadTimeRx.test(trimmed)) {
      leadTime = trimmed.replace(leadTimeRx, '').trim();
      inDispatch = false;
    } else if (plantRx.test(trimmed)) {
      siteName = trimmed.replace(plantRx, '').trim();
      inDispatch = false;
    } else if (gstinLabelRx.test(trimmed)) {
      gstin = trimmed.replace(gstinLabelRx, '').trim().toUpperCase();
      inDispatch = false;
    } else if (phoneRx.test(trimmed)) {
      phones.push(...extractPhones(trimmed.replace(phoneRx, '').trim()));
      inDispatch = false;
    } else if (isBarePhone(trimmed)) {
      phones.push(...extractPhones(trimmed));
      inDispatch = false;
    } else if (dispatchStartRx.test(trimmed)) {
      inDispatch = true;
      dispatchLines.push(trimmed);
    } else if (inDispatch) {
      dispatchLines.push(trimmed);
    } else {
      // Check for bare GSTIN pattern anywhere in an address line
      const bareGstin = extractGstin(trimmed);
      if (bareGstin && !gstin) {
        gstin = bareGstin;
        // Keep the rest of the line (without the GSTIN) if there's other content
        const rest = trimmed.replace(bareGstin, '').replace(/^[\s,:\-–]+|[\s,:\-–]+$/g, '');
        if (rest) kept.push(rest);
      } else {
        kept.push(line);
      }
    }
  }
  return {
    cleanAddress: titleCaseAddress(kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()),
    transporter: titleCaseAddress(transporter),
    leadTimeNote: leadTime,
    dispatchHint: titleCaseAddress(dispatchLines.join('\n').trim()),
    siteName,
    phones,
    gstin,
  };
}

// mode="lead" = the Add / Edit Lead form (/customers/leads/new) — same form,
// saved into the same customers table with customer_status 'lead'. Every
// lead-only difference below is behind isLeadMode; customer mode is unchanged.
export function NewCustomer({ mode = 'customer' }: { mode?: 'customer' | 'lead' } = {}) {
  const isLeadMode = mode === 'lead';
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const navigate = useNavigate();
  const { data, user, addCustomer, updateCustomer } = useAppStore();

  // Promote mode (/customers/new?id=<LEAD-id>&promote=1, from the Customer
  // Lead page): the full customer form for a record that is STILL a lead.
  // Nothing changes in the database until Save & Promote, which saves the
  // form AND flips customer_status to 'customer' in one update. Set once when
  // the record loads, and only if it really is a lead — without the flag
  // (or for an existing customer) this is the normal Edit Customer form.
  const promoteFlag = !isLeadMode && searchParams.get('promote') === '1';
  const [isPromote, setIsPromote] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Lead mode and promote mode return to the Customer Lead list; customer
  // mode goes back wherever it came from, as before.
  const goBack = () => { if (isLeadMode || isPromote) navigate('/customers/leads'); else navigate(-1); };
  useEffect(() => {
    if (!editId) return;
    supabase
      .from('customers')
      .select('industry_segment, customer_type')
      .eq('customer_id', editId)
      .single()
      .then(({ data: row }) => {
        if (row != null) {
          setSeg(normalizeSeg(row.industry_segment) || row.industry_segment || '');
          setCustomerType(row.customer_type || '');
        }
      });
  }, [editId]);

  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [seg, setSeg] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [crm, setCrm] = useState('');
  const [tier, setTier] = useState('');
  const [inco, setInco] = useState('EXW');
  const [curr, setCurr] = useState('INR');
  const [pay, setPay] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [sites, setSites] = useState<Site[]>([
    { id: 'S1', name: 'Main Office', city: '', contacts: [{ id: 'C1', name: '', role: 'Purchase', email: '', isPrimary: true }] }
  ]);
  const [phoneAnomalies, setPhoneAnomalies] = useState<Set<string>>(new Set());
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [nextOrder1, setNextOrder1] = useState<NextOrder>({ product: '' });
  const [nextOrder2, setNextOrder2] = useState<NextOrder>({ product: '' });
  const [crossSellOpportunities, setCrossSellOpportunities] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [parsePreview, setParsePreview] = useState<Record<number, ReturnType<typeof parseMixedAddress> | null>>({});
  const [existingAudit, setExistingAudit] = useState<{ createdBy: string; createdDate: string; modifiedBy: string; modifiedDate: string } | null>(null);
  // Name as loaded — orders/enquiries/quotes link by company NAME, so renaming
  // a lead that already has records would orphan them (see the warning below).
  const [originalName, setOriginalName] = useState('');
  const [renameConfirmOpen, setRenameConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the form ONCE per record. Keyed on editId only (not data.customers) so
  // a background refreshData() — e.g. a Supabase token refresh fired on tab
  // switch — does not re-run this effect and wipe the user's unsaved edits.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (editId) {
      if (loadedFor.current === editId) return; // already hydrated this record
      const cust = data.customers.find(c => c.id === editId);
      if (cust) {
        loadedFor.current = editId;
        setId(cust.id);
        setCode(cust.code);
        setName(cust.name);
        setSeg(normalizeSeg(cust.seg) || cust.seg || '');
        setCustomerType(cust.customerType || '');
        setCrm(cust.crm || '');
        setTier(cust.tier || '');
        setInco(normalizeInco(cust.inco) || cust.inco || 'EXW');
        setCurr(cust.curr || 'INR');
        setPay(normalizePayTerms(cust.pay) || cust.pay);
        const loadedGstin = cleanGstin(cust.gstin);
        setGstin(loadedGstin);
        // A valid GSTIN always decides the PAN (see derivedPan); the stored PAN is only used without one.
        setPan(cleanGstin(cust.pan));
        // Main Office only (cloned — the form edits it in place).
        setSites(cust.sites.slice(0, 1).map(s => ({ ...s, contacts: (s.contacts ?? []).map(ct => ({ ...ct })) })));
        setCreditLimit(cust.creditLimit != null ? String(cust.creditLimit) : '');
        setNextOrder1({ product: cust.nextOrder1?.product || '', qty: cust.nextOrder1?.qty || '', date: cust.nextOrder1?.date || '' });
        setNextOrder2({ product: cust.nextOrder2?.product || '', qty: cust.nextOrder2?.qty || '', date: cust.nextOrder2?.date || '' });
        setCrossSellOpportunities(cust.crossSellOpportunities || '');
        setNotes(cust.notes || '');
        setOriginalName(cust.name);
        if (promoteFlag && cust.customerStatus === 'lead') {
          // Promoting: keep everything the lead has (company, contacts, Main
          // Office, commercial terms, segment, type, CRM, GSTIN/PAN) and start
          // the customer-only fields empty for the user to fill.
          setIsPromote(true);
          setTier('');
          setCreditLimit('');
          setNextOrder1({ product: '' });
          setNextOrder2({ product: '' });
          setCrossSellOpportunities('');
          setNotes('');
        }
        setExistingAudit({
          createdBy: cust.createdBy || '',
          createdDate: cust.createdDate || '',
          modifiedBy: cust.modifiedBy || '',
          modifiedDate: cust.modifiedDate || '',
        });
      }
    } else if (loadedFor.current !== '__new__') {
      loadedFor.current = '__new__';
      if (isLeadMode) {
        // LEAD-YYYY-NNN, counting only LEAD- ids. This IS the saved
        // customer_id, and it's kept as-is if the lead is later promoted.
        const leadId = generateId('LEAD', data.customers.map(c => c.id));
        setId(leadId);
        setCode(leadId);
        setPay('100% Advance');
        setCreditLimit('0');
      } else {
        // The real id that will be saved (customer_id) — shown read-only.
        const custId = generateId('CUST', data.customers.map(c => c.id));
        setId(custId);
        setCode(custId);
      }
    }
  }, [editId, data.customers]);

  // `sites` only ever holds the Main Office — each branch / plant is a
  // separate customer.
  const updateSite = (sIdx: number, field: keyof Site, value: any) => {
    const s = [...sites]; (s[sIdx] as any)[field] = value; setSites(s);
  };
  const addContact = (sIdx: number) => {
    const s = [...sites];
    s[sIdx].contacts.push({ id: 'C' + Date.now(), name: '', role: '', email: '' });
    setSites(s);
  };
  const updateContact = (sIdx: number, cIdx: number, field: keyof Contact, value: any) => {
    const s = [...sites]; (s[sIdx].contacts[cIdx] as any)[field] = value; setSites(s);
  };
  const removeContact = (sIdx: number, cIdx: number) => {
    const s = [...sites]; s[sIdx].contacts = s[sIdx].contacts.filter((_, i) => i !== cIdx); setSites(s);
  };

  const addExtraEmail = (sIdx: number, cIdx: number) => {
    const s = [...sites];
    const ct = s[sIdx].contacts[cIdx];
    s[sIdx].contacts[cIdx] = { ...ct, extraEmails: [...(ct.extraEmails ?? []), ''] };
    setSites(s);
  };
  const updateExtraEmail = (sIdx: number, cIdx: number, eIdx: number, value: string) => {
    const s = [...sites];
    const arr = [...(s[sIdx].contacts[cIdx].extraEmails ?? [])];
    arr[eIdx] = value;
    s[sIdx].contacts[cIdx] = { ...s[sIdx].contacts[cIdx], extraEmails: arr };
    setSites(s);
  };
  const removeExtraEmail = (sIdx: number, cIdx: number, eIdx: number) => {
    const s = [...sites];
    const arr = (s[sIdx].contacts[cIdx].extraEmails ?? []).filter((_, i) => i !== eIdx);
    s[sIdx].contacts[cIdx] = { ...s[sIdx].contacts[cIdx], extraEmails: arr };
    setSites(s);
  };
  // Instead of just rejecting a pasted "a@x.com, b@y.com" style value, split
  // it into the main email + auto-created extra chips — that's clearly how
  // people are actually using this field (see the 32-customer cleanup).
  const splitPastedEmails = (sIdx: number, cIdx: number, value: string) => {
    const parts = value.split(/[,;]/).map(s => s.trim()).filter(s => s.includes('@'));
    if (parts.length <= 1) return;
    const s = [...sites];
    const ct = s[sIdx].contacts[cIdx];
    s[sIdx].contacts[cIdx] = { ...ct, email: parts[0], extraEmails: [...(ct.extraEmails ?? []), ...parts.slice(1)] };
    setSites(s);
  };

  const addExtraPhone = (sIdx: number, cIdx: number) => {
    const s = [...sites];
    const ct = s[sIdx].contacts[cIdx];
    s[sIdx].contacts[cIdx] = { ...ct, extraPhones: [...(ct.extraPhones ?? []), ''] };
    setSites(s);
  };
  const updateExtraPhone = (sIdx: number, cIdx: number, pIdx: number, value: string) => {
    const s = [...sites];
    const arr = [...(s[sIdx].contacts[cIdx].extraPhones ?? [])];
    arr[pIdx] = value;
    s[sIdx].contacts[cIdx] = { ...s[sIdx].contacts[cIdx], extraPhones: arr };
    setSites(s);
  };
  const removeExtraPhone = (sIdx: number, cIdx: number, pIdx: number) => {
    const s = [...sites];
    const arr = (s[sIdx].contacts[cIdx].extraPhones ?? []).filter((_, i) => i !== pIdx);
    s[sIdx].contacts[cIdx] = { ...s[sIdx].contacts[cIdx], extraPhones: arr };
    setSites(s);
  };
  // Mirrors splitPastedEmails. Returns true if it split the value (caller
  // should skip its own single-number normalize/anomaly check in that case).
  const splitPastedPhones = (sIdx: number, cIdx: number, value: string): boolean => {
    const parts = value.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1) return false;
    const s = [...sites];
    const ct = s[sIdx].contacts[cIdx];
    s[sIdx].contacts[cIdx] = { ...ct, phone: parts[0], extraPhones: [...(ct.extraPhones ?? []), ...parts.slice(1)] };
    setSites(s);
    return true;
  };

  // Lead mode: Contact Person / Mobile / Email in Company Profile are the Main
  // Office's primary contact — the same data the Main Office card shows.
  const primaryContactIdx = Math.max(0, sites[0]?.contacts.findIndex(c => c.isPrimary) ?? 0);
  const primaryContact = sites[0]?.contacts[primaryContactIdx];
  const setPrimaryContactField = (field: 'name' | 'phone' | 'email', value: string) => {
    if (!sites[0]) {
      setSites([{ id: 'S1', name: 'Main Office', city: '', contacts: [{ id: 'C1', name: '', role: 'Purchase', email: '', isPrimary: true, [field]: value }] }]);
      return;
    }
    if (!sites[0].contacts.length) {
      const s = [...sites];
      s[0] = { ...s[0], contacts: [{ id: 'C1', name: '', role: 'Purchase', email: '', isPrimary: true, [field]: value }] };
      setSites(s);
      return;
    }
    updateContact(0, primaryContactIdx, field, value);
  };

  // Records still pointing at the loaded name (orders/enquiries/quotes link by
  // company NAME, not id). Only matters when an existing lead is renamed.
  const nameChanged = !!editId && !!originalName && name.trim() !== originalName.trim();
  const sameName = (n: string | undefined) => (n ?? '').trim().toLowerCase() === originalName.trim().toLowerCase();
  const linkedToOldName = nameChanged ? {
    // Only documents WITHOUT a customer_id — those link by name and would be
    // orphaned. Documents with an id stay linked after a rename.
    enquiries: data.enquiries.filter(e => !e.customerId && sameName(e.cust)).length,
    quotes: data.quotes.filter(q => !q.customerId && sameName(q.cust)).length,
    orders: data.orders.filter(o => !o.customerId && sameName(o.cust)).length,
  } : { enquiries: 0, quotes: 0, orders: 0 };
  const hasLinkedToOldName = linkedToOldName.enquiries + linkedToOldName.quotes + linkedToOldName.orders > 0;
  const linkedSummary = [
    linkedToOldName.enquiries && `${linkedToOldName.enquiries} enquir${linkedToOldName.enquiries === 1 ? 'y' : 'ies'}`,
    linkedToOldName.quotes && `${linkedToOldName.quotes} quote${linkedToOldName.quotes === 1 ? '' : 's'}`,
    linkedToOldName.orders && `${linkedToOldName.orders} order${linkedToOldName.orders === 1 ? '' : 's'}`,
  ].filter(Boolean).join(', ');

  // Duplicate check against BOTH customers and leads (never the record being
  // edited): same GSTIN (blocks a NEW record), same PAN under another GSTIN
  // (info only), or same normalised name / mobile / email (amber warning).
  const similarCustomers = useMemo(() => {
    const contacts = sites.flatMap(s => s.contacts ?? []);
    return findSimilarCustomers({
      name,
      gstins: [gstin],
      phones: contacts.flatMap(ct => [ct.phone, ...(ct.extraPhones ?? [])]),
      emails: contacts.flatMap(ct => [ct.email, ...(ct.extraEmails ?? [])]),
    }, data.customers, editId || undefined);
  }, [name, gstin, sites, data.customers, editId]);
  const gstinDuplicate = similarCustomers.find(s => s.kind === 'gstin');
  // Same PAN, different GSTIN = a branch / plant of an existing company.
  // Suggest (never force) "<Company> - <City>" so branches are easy to tell
  // apart in the customer picker. Hidden once the name already has a " - ".
  const branchMatch = !gstinDuplicate && !name.includes(' - ') ? similarCustomers.find(s => s.samePan) : undefined;
  const branchCity = sites[0]?.city?.trim() || '';
  const suggestedBranchName = branchMatch && branchCity ? `${(name.trim() || branchMatch.customer.name.trim())} - ${branchCity}` : '';
  // Save & Promote: an existing CUSTOMER that looks like this lead → confirm.
  const similarMaster = similarCustomers.find(s => s.kind !== 'pan' && !isLead(s.customer));
  const [promoteDupOpen, setPromoteDupOpen] = useState(false);
  const promoteDupOk = useRef(false);

  // PAN always comes from a valid Company GSTIN (characters 3–12); '' = no
  // valid GSTIN, so the PAN field is typed by hand.
  const derivedPan = panFromGstin(gstin);
  // GSTIN fields: clean as typed / pasted (case, spaces, dots, dashes,
  // look-alike Greek / Cyrillic letters) and fill an empty State from a valid
  // GSTIN's state code.
  const setCompanyGstin = (raw: string) => {
    const val = cleanGstin(raw).slice(0, 15);
    setGstin(val);
    const st = gstinState(val);
    if (st && sites[0] && !sites[0].state?.trim()) updateSite(0, 'state', st);
  };
  // Red error (with [Use this] when only the last character is missing) or
  // the amber state-mismatch warning under a GSTIN field.
  const gstinHint = (value: string | undefined, state: string | undefined, apply: (v: string) => void) => {
    const p = gstinProblem(value);
    // Still being typed — a quiet counter instead of a red error (saving is
    // blocked either way until it is blank, URP or a valid GSTIN).
    if (p.kind === 'invalid' && cleanGstin(value).length < 14) {
      return <p className="text-g400 text-[10.5px] mt-1">{cleanGstin(value).length}/15 characters</p>;
    }
    if (p.kind !== 'ok') {
      return (
        <p className="text-red-mrt text-[10.5px] mt-1 flex items-center gap-2 flex-wrap">
          <span>{p.message}</span>
          {p.suggestion && (
            <button type="button" onClick={() => apply(p.suggestion!)}
              className="font-bold text-[10px] uppercase tracking-wide border border-current rounded-[3px] px-2 py-0.5 bg-white hover:opacity-80">
              Use this
            </button>
          )}
        </p>
      );
    }
    const warn = gstinStateWarning(value, state);
    return warn ? <p className="text-amber-700 text-[10.5px] mt-1">{warn}</p> : null;
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Company name is required';
    if (isLeadMode) {
      if (!primaryContact?.name?.trim()) e.contactName = 'Contact person is required';
      if (!primaryContact?.phone?.trim()) e.contactPhone = 'Mobile is required';
    }
    // Company GSTIN: blank, "URP" or a valid 15-character GSTIN. (A state that
    // doesn't match the GSTIN's state code is only a warning.)
    // An incomplete GSTIN or a wrong check digit blocks the save.
    if (gstinProblem(gstin).kind !== 'ok') e.save = `Company GSTIN: ${gstinProblem(gstin).message}`;
    // PAN comes from a valid GSTIN; typed by hand only when there is none.
    if (!derivedPan && pan.trim() && !isValidPan(pan)) e.save = 'PAN is not valid — 5 letters, 4 digits, 1 letter (e.g. AABCM1234A).';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    // A NEW record can't reuse a GSTIN that already exists (customer or lead).
    // Editing an existing record only shows the warning.
    if (!editId && gstinDuplicate) {
      setErrors(prev => ({ ...prev, save: gstinDuplicate.message }));
      return;
    }
    if (isPromote && similarMaster && !promoteDupOk.current) { setPromoteDupOpen(true); return; }
    // Lead renamed (in the lead form, or while promoting) while records still
    // use the old name → confirm first.
    if ((isLeadMode || isPromote) && hasLinkedToOldName && !renameConfirmOpen) { setRenameConfirmOpen(true); return; }
    setRenameConfirmOpen(false);
    // Main Office only — saved to the customers row's own columns.
    const normalizedSites = sites.slice(0, 1).map(site => ({
      ...site,
      id: MAIN_OFFICE_ID,
      gstin: cleanGstin(site.gstin),
      contacts: site.contacts.map(ct => ({
        ...ct,
        phone: ct.phone ? normalizeIndianPhone(ct.phone).value : ct.phone,
        extraPhones: (ct.extraPhones ?? []).filter(p => p.trim()).map(p => normalizeIndianPhone(p).value),
        extraEmails: (ct.extraEmails ?? []).filter(e => e.trim()),
      })),
    }));
    const base = {
      id, code: code.trim().toUpperCase(), name: name.trim(),
      seg, customerType, inco, curr, pay, gstin: cleanGstin(gstin), pan: derivedPan || cleanGstin(pan) || undefined, sites: normalizedSites,
      crm: crm.trim() || undefined,
    };
    // mapCustomerToDB only writes fields that are PRESENT on the object, so
    // lead mode leaves out every field the lead form doesn't edit (credit
    // limit, tier, next orders, cross-sell, notes) — saving a lead never
    // overwrites or blanks them.
    // customer_status 'lead' is set only when a NEW lead is created — an edit
    // never sends it, so this form can't turn a customer back into a lead.
    const cust: Customer = isLeadMode
      ? {
          ...base,
          ...(editId ? {} : { customerStatus: 'lead' as const }),
        }
      : {
          ...base,
          tier: (tier || undefined) as Customer['tier'],
          creditLimit: creditLimit !== '' ? Number(creditLimit) : undefined,
          nextOrder1: nextOrder1.product ? nextOrder1 : undefined,
          nextOrder2: nextOrder2.product ? nextOrder2 : undefined,
          crossSellOpportunities: crossSellOpportunities.trim() || undefined,
          notes: notes.trim() || undefined,
        };
    const saveRecord = async () => {
      if (editId) {
        await updateCustomer(editId, { ...cust, modifiedBy: user?.email ?? undefined, modifiedDate: new Date().toISOString() });
      } else {
        await addCustomer({ ...cust, createdBy: user?.email ?? undefined, createdDate: new Date().toISOString() });
      }
    };
    if (isPromote && editId) {
      // ONE update on the same row (same LEAD- id, so linked enquiries /
      // quotes / orders stay connected): every form field + the move to
      // Customer Master. updateCustomer logs it (customerStatus lead →
      // customer). On failure it's still a lead — stay here with the error.
      setSaving(true);
      try {
        await updateCustomer(editId, {
          ...cust,
          customerStatus: 'customer',
          promotedAt: new Date().toISOString(),
          modifiedBy: user?.email ?? undefined,
          modifiedDate: new Date().toISOString(),
        });
      } catch (err: any) {
        setSaving(false);
        setToast(`Promote failed: ${err?.message || 'could not save — check your connection.'}`);
        setTimeout(() => setToast(null), 6000);
        return;
      }
      setSaving(false);
      navigate('/customers', { state: { toast: `${name.trim()} moved to Customer Master.` } });
      return;
    }
    if (isLeadMode) {
      setSaving(true);
      try {
        await saveRecord();
      } catch (err: any) {
        setSaving(false);
        setErrors(prev => ({ ...prev, save: err?.message || 'Could not save — check your connection.' }));
        return;
      }
      setSaving(false);
      goBack();
      return;
    }
    try {
      await saveRecord();
    } catch (err: any) {
      setErrors(prev => ({ ...prev, save: err?.message || 'Could not save — check your connection.' }));
      return;
    }
    navigate(-1);
  };

  const inputCls = 'w-full font-sans text-sm bg-white border border-g300 rounded-[3px] p-2 outline-none focus:border-red-mrt focus:ring-4 focus:ring-red-lt transition-all';
  const labelCls = 'block text-[10px] font-bold text-g600 uppercase tracking-wide mb-1';

  // Shared between modes — customer mode shows it next to GSTIN/PAN, lead
  // mode in Tier's slot (leads have no tier).
  const crmField = (
    <div>
      <label className={labelCls}>CRM</label>
      <select title="CRM" value={crm} onChange={e => setCrm(e.target.value)} className={inputCls}>
        <option value=""></option>
        {crm && !CRM_OPTIONS.includes(crm) && <option value={crm}>{crm}</option>}
        {CRM_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">

      {/* Sticky header */}
      <div className="bg-white border-b border-g200 sticky top-0 z-10 pt-5 px-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              {isLeadMode
                ? <>{editId ? 'Edit' : 'Add'} <em className="italic text-lead-text">Lead</em></>
                : isPromote
                  ? <>Promote to <em className="italic text-red-mrt">Customer</em></>
                  : <>{editId ? 'Edit' : 'Add'} <em className="italic text-red-mrt">Customer</em></>}
            </h2>
            {isPromote ? (
              <div className="mt-1.5 text-[11.5px] text-lead-text bg-lead-bg border border-lead/50 rounded-[3px] px-2.5 py-1.5 max-w-[640px] leading-snug">
                Promoting lead <strong>{originalName}</strong> ({code}) — fill the remaining details and click Save to move it to Customer Master.
              </div>
            ) : (
            <p className="text-xs text-g500 mt-1">
              {isLeadMode
                ? (editId ? `Updating lead ${code}` : 'Small-order / IndiaMART buyer — promote to Customer Master once orders cross ₹1 lakh.')
                : (editId ? `Updating corporate record ${code}` : 'Create a new hierarchical customer master record.')}
            </p>
            )}
            {editId && existingAudit && (existingAudit.createdBy || existingAudit.modifiedBy) && (
              <div className="text-[10.5px] text-g400 mt-1 space-y-0.5">
                {existingAudit.createdBy && (
                  <p>Added by <span className="font-mono">{existingAudit.createdBy}</span>{existingAudit.createdDate ? ` · ${new Date(existingAudit.createdDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>
                )}
                {existingAudit.modifiedBy && (
                  <p>Last edited by <span className="font-mono">{existingAudit.modifiedBy}</span>{existingAudit.modifiedDate ? ` · ${new Date(existingAudit.modifiedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {errors.save && <span className="text-red-mrt text-[11px] max-w-[260px]">{errors.save}</span>}
            <Button variant="secondary" onClick={goBack}>Cancel</Button>
            {isLeadMode
              ? <Button variant="primary" className="bg-lead hover:bg-lead-strong hover:shadow-none" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Lead'}</Button>
              : isPromote
                ? <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save & Promote'}</Button>
                : <Button variant="primary" onClick={handleSave}>Save Record</Button>}
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="p-6 flex-1 overflow-y-auto pb-20 space-y-[14px]">

        {/* Row 1: Company Profile (left 8) + Commercial Terms (right 4) */}
        <div className="grid grid-cols-12 gap-[14px] items-start">

          {/* Company Profile */}
          <div className="col-span-8 bg-white border border-g200 rounded-[3px] p-5 space-y-4">
            <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200">
              Company Profile
            </div>

            <div>
              <label className={labelCls}>{isLeadMode ? 'Lead Code' : 'Customer Code'}</label>
              <div className="bg-g100 border border-g200 rounded-[3px] p-2 text-xs font-mono font-bold text-g500">{code}</div>
            </div>

            <div>
              <label className={labelCls}>Company Name <span className="text-red-mrt">*</span></label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                className={inputCls + (errors.name ? ' border-red-mrt' : '')}
                placeholder="e.g. Aditya Birla Chemicals"
              />
              {errors.name && <p className="text-red-mrt text-[10px] mt-1">{errors.name}</p>}
              {similarCustomers.map(s => (
                <div key={s.customer.id} className={`mt-1.5 flex items-center justify-between gap-3 text-[11px] rounded-[3px] px-2.5 py-1.5 leading-snug border ${
                  s.kind === 'gstin' ? 'text-red-mrt bg-red-lt border-red-mrt/30'
                    : s.kind === 'pan' ? 'text-g600 bg-g100 border-g200'
                    : 'text-amber-800 bg-amber-50 border-amber-300'}`}>
                  <span>{s.message}{s.kind === 'gstin' && !editId ? ' — a new record with this GSTIN cannot be saved.' : ''}</span>
                  {/* New record only: open the existing one instead of creating a duplicate. */}
                  {!editId && s.kind !== 'pan' && (
                    <button type="button"
                      onClick={() => navigate(isLead(s.customer) ? `/customers/leads/new?id=${encodeURIComponent(s.customer.id)}` : `/customers/new?id=${encodeURIComponent(s.customer.id)}`, { replace: true })}
                      className="shrink-0 font-bold text-[10px] uppercase tracking-wide border border-current rounded-[3px] px-2 py-0.5 bg-white hover:opacity-80">
                      Use this
                    </button>
                  )}
                </div>
              ))}
              {branchMatch && (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] rounded-[3px] px-2.5 py-1.5 leading-snug border text-g600 bg-g100 border-g200">
                  <span>
                    <strong>Branch / Plant:</strong> name it "&lt;Company&gt; - &lt;City&gt;" (e.g. "Indigo Paints Ltd - Cochin") so branches are easy to tell apart in the customer picker.
                    {!branchCity && ' Fill in the City below to get a suggestion.'}
                  </span>
                  {suggestedBranchName && (
                    <button type="button" onClick={() => setName(suggestedBranchName)}
                      className="shrink-0 font-bold text-[10px] tracking-wide border border-current rounded-[3px] px-2 py-0.5 bg-white hover:opacity-80">
                      Use "{suggestedBranchName}"
                    </button>
                  )}
                </div>
              )}
              {(isLeadMode || isPromote) && hasLinkedToOldName && (
                <div className="mt-1.5 text-[11px] text-lead-text bg-lead-bg border border-lead/50 rounded-[3px] px-2.5 py-1.5 leading-snug">
                  {linkedSummary} still use the old name "<strong>{originalName}</strong>". They won't be renamed, so this lead's order total may stop adding up.
                </div>
              )}
            </div>

            {isLeadMode && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Contact Person <span className="text-red-mrt">*</span></label>
                  <input type="text" value={primaryContact?.name || ''} onChange={e => setPrimaryContactField('name', e.target.value)}
                    className={inputCls + (errors.contactName ? ' border-red-mrt' : '')} placeholder="e.g. Ramesh Patel" />
                  {errors.contactName && <p className="text-red-mrt text-[10px] mt-1">{errors.contactName}</p>}
                </div>
                <div>
                  <label className={labelCls}>Mobile <span className="text-red-mrt">*</span></label>
                  <input type="tel" value={primaryContact?.phone || ''} onChange={e => setPrimaryContactField('phone', e.target.value)}
                    className={inputCls + ' font-mono' + (errors.contactPhone ? ' border-red-mrt' : '')} placeholder="98XXXXXXXX" />
                  {errors.contactPhone && <p className="text-red-mrt text-[10px] mt-1">{errors.contactPhone}</p>}
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input type="email" value={primaryContact?.email || ''} onChange={e => setPrimaryContactField('email', e.target.value)}
                    className={inputCls} placeholder="buyer@company.com" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Segment</label>
                <select title="Segment" value={seg} onChange={e => setSeg(e.target.value)} className={inputCls}>
                  <option value=""></option>
                  {seg && !SEG_OPTIONS.includes(seg) && <option value={seg}>{seg}</option>}
                  {SEG_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Customer Type</label>
                <select title="Customer Type" value={customerType} onChange={e => setCustomerType(e.target.value)} className={inputCls}>
                  <option value=""></option>
                  <option value="Trader">Trader</option>
                  <option value="End User">End User</option>
                </select>
              </div>
              {isLeadMode ? crmField : (
                <div>
                  <label className={labelCls}>Tier</label>
                  <select title="Tier" value={tier} onChange={e => setTier(e.target.value)} className={inputCls}>
                    <option value=""></option>
                    <option value="Bronze">Bronze</option>
                    <option value="Silver">Silver</option>
                    <option value="Gold">Gold</option>
                  </select>
                </div>
              )}
            </div>

            <div className={`grid ${isLeadMode ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
              {!isLeadMode && crmField}

              <div>
                <label className={labelCls}>Company GSTIN{isLeadMode && <span className="normal-case font-normal text-g400"> (optional)</span>}</label>
                <input
                  type="text" value={gstin}
                  onChange={e => setCompanyGstin(e.target.value)}
                  className={inputCls + ' font-mono uppercase'}
                  placeholder="27AABCF5171D1ZW"
                />
                {gstinHint(gstin, sites[0]?.state, setCompanyGstin)}
              </div>

              <div>
                <label className={labelCls}>PAN No.{derivedPan
                  ? <span className="normal-case font-normal text-g400"> (from GSTIN)</span>
                  : isLeadMode && <span className="normal-case font-normal text-g400"> (optional)</span>}</label>
                <input
                  type="text" value={derivedPan || pan}
                  readOnly={!!derivedPan}
                  onChange={e => setPan(cleanGstin(e.target.value).slice(0, 10))}
                  className={inputCls + ' font-mono' + (derivedPan ? ' bg-g100 text-g500 cursor-not-allowed' : '')}
                  placeholder="AABCM1234A"
                />
                {!derivedPan && pan.trim() && !isValidPan(pan) && (
                  <p className="text-red-mrt text-[10.5px] mt-1">PAN should be 5 letters, 4 digits, 1 letter (e.g. AABCM1234A).</p>
                )}
              </div>
            </div>
          </div>

          {/* Commercial Terms */}
          <div className="col-span-4 bg-white border border-g200 rounded-[3px] p-5 space-y-4">
            <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200">
              Commercial Terms
            </div>
            <p className="text-[11px] text-g400">
              These defaults auto-populate when this customer is selected in a quotation or order.
            </p>

            <div>
              <label className={labelCls}>Incoterms</label>
              <select title="Incoterms" value={inco} onChange={e => setInco(e.target.value)} className={inputCls}>
                {!INCO_OPTIONS_CUST.includes(inco) && inco && <option value={inco}>{inco}</option>}
                {INCO_OPTIONS_CUST.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Currency</label>
              <select title="Currency" value={curr} onChange={e => setCurr(e.target.value)} className={inputCls}>
                <option>INR</option>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Payment Terms</label>
              <select value={pay} onChange={e => setPay(e.target.value)} className={inputCls}>
                <option value="">— Select —</option>
                {PAY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                {!(PAY_OPTIONS as readonly string[]).includes(pay) && pay && <option value={pay}>{pay}</option>}
              </select>
            </div>

            <div>
              <label className={labelCls}>Credit Limit (₹)</label>
              {isLeadMode ? (
                <div className="bg-g100 border border-g200 rounded-[3px] p-2 text-sm text-g500">
                  {creditLimit !== '' && Number(creditLimit) > 0
                    ? `${Number(creditLimit).toLocaleString('en-IN')} · read-only`
                    : '0 · not allowed'}
                </div>
              ) : (
                <input
                  type="number" value={creditLimit} onChange={e => setCreditLimit(e.target.value)}
                  className={inputCls} placeholder="e.g. 500000" min="0"
                />
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Main Office & Contacts (full width). One address per
            customer — a branch / plant with its own GSTIN is a separate customer. */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="font-mono text-[10px] font-bold tracking-[1px] uppercase text-blk flex items-center gap-2">
              <MapPin size={13} className="text-red-mrt" />
              Main Office
            </div>
          </div>

          <div className="space-y-4">
            {sites.map((site, sIdx) => (
              <div key={site.id} className="bg-white border border-g200 rounded-[3px] shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
                <div className="bg-g50 p-4 border-b border-g200 flex items-center gap-3">
                  <MapPin size={15} className="text-red-mrt shrink-0" />
                  <input
                    type="text" value={site.name}
                    onChange={e => updateSite(sIdx, 'name', e.target.value)}
                    placeholder="Main Office"
                    className="bg-transparent border-none outline-none font-sans font-bold text-sm text-blk placeholder:text-g400 flex-1"
                  />
                  <input
                    type="text" value={site.city || ''}
                    onChange={e => updateSite(sIdx, 'city', e.target.value)}
                    placeholder="City"
                    className="bg-white border border-g300 rounded px-2 py-1 text-xs w-28 outline-none focus:border-red-mrt"
                  />
                  <input
                    type="text" value={site.state || ''}
                    onChange={e => updateSite(sIdx, 'state', e.target.value)}
                    placeholder="State"
                    className="bg-white border border-g300 rounded px-2 py-1 text-xs w-28 outline-none focus:border-red-mrt"
                  />
                  <input
                    type="text" value={site.pincode || ''}
                    onChange={e => updateSite(sIdx, 'pincode', e.target.value)}
                    placeholder="Pincode"
                    className="bg-white border border-g300 rounded px-2 py-1 text-xs font-mono w-24 outline-none focus:border-red-mrt"
                  />
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className={labelCls}>Full Address / Postal Address</label>
                      {hasMixedContent(site.fullAddress || site.address || '') && !parsePreview[sIdx] && (
                        <button
                          type="button"
                          title="Detect and split transporter, lead time, dispatch address from this text"
                          onClick={() => {
                            const raw = site.fullAddress || site.address || '';
                            setParsePreview(p => ({ ...p, [sIdx]: parseMixedAddress(raw) }));
                          }}
                          className="flex items-center gap-1 text-[10px] font-bold text-sW border border-sW/40 rounded px-2 py-0.5 hover:border-sW hover:bg-sW/5 transition-colors"
                        >
                          <Wand2 size={10} /> Parse &amp; Split
                        </button>
                      )}
                    </div>
                    <textarea
                      value={site.fullAddress || ''}
                      onChange={e => { updateSite(sIdx, 'fullAddress', e.target.value); setParsePreview(p => ({ ...p, [sIdx]: null })); }}
                      placeholder="Complete corporate address for this site..."
                      className="w-full font-sans text-xs bg-g50 border border-g300 rounded-[3px] p-2 outline-none focus:border-red-mrt h-14 resize-none transition-all focus:bg-white"
                    />
                    {parsePreview[sIdx] && (() => {
                      const pv = parsePreview[sIdx]!;
                      return (
                        <div className="mt-2 bg-sW/5 border border-sW/30 rounded-[4px] p-3 space-y-1.5 text-[11px]">
                          <div className="font-bold text-sW text-[10px] uppercase tracking-wide mb-2">Parsed — review before applying</div>
                          <div><span className="text-g500 font-bold">Address: </span><span className="text-blk whitespace-pre-wrap">{pv.cleanAddress || '—'}</span></div>
                          {pv.siteName && <div><span className="text-g500 font-bold">Site name: </span><span className="text-blk">{pv.siteName}</span></div>}
                          {pv.dispatchHint && <div><span className="text-g500 font-bold">Dispatch hint: </span><span className="text-blk whitespace-pre-wrap">{pv.dispatchHint}</span></div>}
                          {pv.transporter && <div><span className="text-g500 font-bold">Transporter: </span><span className="text-blk">{pv.transporter}</span></div>}
                          {pv.leadTimeNote && <div><span className="text-g500 font-bold">Lead time: </span><span className="text-blk">{pv.leadTimeNote}</span></div>}
                          {pv.phones.length > 0 && <div><span className="text-g500 font-bold">Phone(s): </span><span className="text-blk font-mono">{pv.phones.join(', ')}</span></div>}
                          <div className="flex gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                updateSite(sIdx, 'fullAddress', pv.cleanAddress);
                                if (pv.siteName && !site.name) updateSite(sIdx, 'name', pv.siteName);
                                if (pv.transporter && !site.transporter) updateSite(sIdx, 'transporter', pv.transporter);
                                if (pv.leadTimeNote && !site.leadTimeNote) updateSite(sIdx, 'leadTimeNote', pv.leadTimeNote);
                                if (pv.dispatchHint && !site.dispatchAddress) updateSite(sIdx, 'dispatchAddress', pv.dispatchHint);
                                if (pv.phones.length > 0) {
                                  // Fill primary contact's phone if empty, otherwise add a new contact row
                                  const s = [...sites];
                                  const primaryIdx = s[sIdx].contacts.findIndex(c => c.isPrimary);
                                  const target = primaryIdx >= 0 ? primaryIdx : 0;
                                  if (!s[sIdx].contacts[target]?.phone) {
                                    s[sIdx].contacts[target] = { ...s[sIdx].contacts[target], phone: pv.phones.join(', ') };
                                  } else {
                                    s[sIdx].contacts.push({ id: 'C' + Date.now(), name: 'Phone', role: 'Purchase', email: '', phone: pv.phones.join(', ') });
                                  }
                                  setSites(s);
                                }
                                setParsePreview(pv2 => ({ ...pv2, [sIdx]: null }));
                              }}
                              className="px-3 py-1 bg-sW text-white text-[10px] font-bold rounded hover:opacity-90 transition-opacity"
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => setParsePreview(pv2 => ({ ...pv2, [sIdx]: null }))}
                              className="px-3 py-1 bg-g100 text-g500 text-[10px] font-bold rounded hover:bg-g200 transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <label className={labelCls}>Dispatch / Delivery Address</label>
                    <textarea
                      value={site.dispatchAddress || ''}
                      onChange={e => updateSite(sIdx, 'dispatchAddress', e.target.value)}
                      placeholder="Where goods are physically delivered (e.g. c/o courier, warehouse address)..."
                      className="w-full font-sans text-xs bg-g50 border border-g300 rounded-[3px] p-2 outline-none focus:border-red-mrt h-14 resize-none transition-all focus:bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Preferred Transporter</label>
                      <input
                        type="text"
                        value={site.transporter || ''}
                        onChange={e => updateSite(sIdx, 'transporter', e.target.value)}
                        placeholder="e.g. Shiv Road Carriers"
                        className="w-full font-sans text-xs bg-white border border-g300 rounded-[3px] p-2 outline-none focus:border-red-mrt"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Lead Time / Delivery Note</label>
                      <input
                        type="text"
                        value={site.leadTimeNote || ''}
                        onChange={e => updateSite(sIdx, 'leadTimeNote', e.target.value)}
                        placeholder="e.g. For dispatched items only"
                        className="w-full font-sans text-xs bg-white border border-g300 rounded-[3px] p-2 outline-none focus:border-red-mrt"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-g500 flex items-center gap-1.5">
                        <User size={10} /> Contact Persons at this site
                      </div>
                      <button type="button" onClick={() => addContact(sIdx)} className="text-[11px] font-bold text-red-mrt flex items-center gap-1 hover:underline">
                        <Plus size={12} /> Add Contact
                      </button>
                    </div>
                    <div className="space-y-2">
                      {site.contacts.map((ct, cIdx) => (
                        <div key={ct.id} className="p-3 bg-g50 border border-g200 rounded-[3px] space-y-2 group">
                          <div className="flex items-center gap-2">
                            <input
                              type="text" value={ct.name}
                              onChange={e => updateContact(sIdx, cIdx, 'name', e.target.value)}
                              placeholder="Contact Name"
                              className="bg-white border border-g300 rounded px-2 py-1 flex-1 text-xs outline-none focus:border-red-mrt"
                            />
                            <input
                              type="text" value={ct.role}
                              onChange={e => updateContact(sIdx, cIdx, 'role', e.target.value)}
                              placeholder="Designation / Role"
                              className="bg-white border border-g300 rounded px-2 py-1 w-40 text-xs outline-none focus:border-red-mrt"
                            />
                            <label className="flex items-center gap-1.5 px-2 text-[10px] font-bold text-g500 uppercase cursor-pointer whitespace-nowrap">
                              <input
                                type="checkbox" checked={!!ct.isPrimary}
                                onChange={() => {
                                  const s = [...sites];
                                  s[sIdx].contacts.forEach((c, i) => c.isPrimary = i === cIdx);
                                  setSites(s);
                                }}
                                className="w-3 h-3 accent-red-mrt"
                              />
                              Primary
                            </label>
                            <button type="button" onClick={() => removeContact(sIdx, cIdx)} className="text-g300 group-hover:text-red-mrt transition-colors" title="Remove contact">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Mail size={11} className="absolute left-2.5 top-[7px] text-g400" />
                              <input
                                type="email" value={ct.email}
                                onChange={e => updateContact(sIdx, cIdx, 'email', e.target.value)}
                                onBlur={e => splitPastedEmails(sIdx, cIdx, e.target.value)}
                                placeholder="email@company.com"
                                className="w-full bg-white border border-g300 rounded pl-7 pr-2 py-1 text-xs outline-none focus:border-red-mrt"
                              />
                              {(ct.extraEmails ?? []).map((extra, eIdx) => (
                                <div key={eIdx} className="flex items-center gap-1 mt-1">
                                  <input
                                    type="email" value={extra}
                                    onChange={e => updateExtraEmail(sIdx, cIdx, eIdx, e.target.value)}
                                    placeholder="another email"
                                    className="flex-1 bg-white border border-g300 rounded pl-2 pr-2 py-1 text-xs outline-none focus:border-red-mrt"
                                  />
                                  <button type="button" onClick={() => removeExtraEmail(sIdx, cIdx, eIdx)} className="text-g300 hover:text-red-mrt" title="Remove"><Trash2 size={12} /></button>
                                </div>
                              ))}
                              <button type="button" onClick={() => addExtraEmail(sIdx, cIdx)} className="text-[10px] font-bold text-red-mrt hover:underline mt-1">+ Add Email</button>
                            </div>
                            <div className="relative flex-1">
                              <Phone size={11} className="absolute left-2.5 top-[7px] text-g400" />
                              <input
                                type="tel" value={ct.phone || ''}
                                onChange={e => { updateContact(sIdx, cIdx, 'phone', e.target.value); const key = `${sIdx}-${cIdx}`; setPhoneAnomalies(prev => { const n = new Set(prev); n.delete(key); return n; }); }}
                                onBlur={() => { const v = ct.phone || ''; if (!v) return; if (splitPastedPhones(sIdx, cIdx, v)) return; const { value, anomaly } = normalizeIndianPhone(v); updateContact(sIdx, cIdx, 'phone', value); const key = `${sIdx}-${cIdx}`; setPhoneAnomalies(prev => { const n = new Set(prev); anomaly ? n.add(key) : n.delete(key); return n; }); }}
                                placeholder="Phone / Mobile"
                                className="w-full bg-white border border-g300 rounded pl-7 pr-2 py-1 text-xs outline-none focus:border-red-mrt"
                              />
                              {phoneAnomalies.has(`${sIdx}-${cIdx}`) && <p className="text-amber-600 text-[10px] mt-0.5 pl-0.5">Doesn't look like a standard Indian mobile number — saved as entered</p>}
                              {(ct.extraPhones ?? []).map((extra, pIdx) => (
                                <div key={pIdx} className="flex items-center gap-1 mt-1">
                                  <input
                                    type="tel" value={extra}
                                    onChange={e => updateExtraPhone(sIdx, cIdx, pIdx, e.target.value)}
                                    placeholder="another number"
                                    className="flex-1 bg-white border border-g300 rounded pl-2 pr-2 py-1 text-xs outline-none focus:border-red-mrt"
                                  />
                                  <button type="button" onClick={() => removeExtraPhone(sIdx, cIdx, pIdx)} className="text-g300 hover:text-red-mrt" title="Remove"><Trash2 size={12} /></button>
                                </div>
                              ))}
                              <button type="button" onClick={() => addExtraPhone(sIdx, cIdx)} className="text-[10px] font-bold text-red-mrt hover:underline mt-1">+ Add Contact Number</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rows 3–4 (Next Expected Orders, Cross-Sell, Notes) — Customer Master only; the Lead form doesn't show or save them. */}
        {!isLeadMode && (<>
        {/* Row 3: Next Expected Orders */}
        <div className="bg-white border border-g200 rounded-[3px] p-5 space-y-4">
          <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200">
            Next Expected Orders
          </div>
          <p className="text-[11px] text-g400">Anticipated upcoming purchase — product, quantity, and expected date.</p>
          {([{ label: 'Order 1', val: nextOrder1, set: setNextOrder1 }, { label: 'Order 2', val: nextOrder2, set: setNextOrder2 }] as const).map(({ label, val, set }) => (
            <div key={label} className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-5">
                <label className={labelCls}>{label} — Product</label>
                <input
                  type="text" value={val.product}
                  onChange={e => set(prev => ({ ...prev, product: e.target.value }))}
                  className={inputCls} placeholder="e.g. Spiral Wound Gaskets DN150"
                />
              </div>
              <div className="col-span-3">
                <label className={labelCls}>Qty</label>
                <input
                  type="number" value={val.qty ?? ''}
                  onChange={e => set(prev => ({ ...prev, qty: e.target.value ? Number(e.target.value) : undefined }))}
                  className={inputCls} placeholder="0" min="0"
                />
              </div>
              <div className="col-span-4">
                <label className={labelCls}>Expected Date</label>
                <input
                  type="date" value={val.date ?? ''}
                  onChange={e => set(prev => ({ ...prev, date: e.target.value || undefined }))}
                  className={inputCls}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Row 4: Notes & Cross-sell */}
        <div className="grid grid-cols-2 gap-[14px]">
          <div className="bg-white border border-g200 rounded-[3px] p-5 space-y-3">
            <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200">
              Cross-Sell Opportunities
            </div>
            <textarea
              value={crossSellOpportunities}
              onChange={e => setCrossSellOpportunities(e.target.value)}
              placeholder="e.g. Expand to valve packing, RTJ gaskets..."
              className="w-full font-sans text-sm bg-g50 border border-g300 rounded-[3px] p-2 outline-none focus:border-red-mrt h-24 resize-none transition-all focus:bg-white"
            />
          </div>
          <div className="bg-white border border-g200 rounded-[3px] p-5 space-y-3">
            <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200">
              Notes from Management
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes from management about this customer..."
              className="w-full font-sans text-sm bg-g50 border border-g300 rounded-[3px] p-2 outline-none focus:border-red-mrt h-24 resize-none transition-all focus:bg-white"
            />
          </div>
        </div>
        </>)}

      </div>

      {/* Promote-mode save error (the record stays a lead). */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-[420px] px-4 py-2.5 rounded-[4px] shadow-lg text-[12.5px] font-medium text-white bg-red-mrt animate-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}

      {promoteDupOpen && similarMaster && (
        <ConfirmDialog
          title="Promote anyway?"
          confirmLabel="Promote anyway"
          onConfirm={() => { promoteDupOk.current = true; setPromoteDupOpen(false); handleSave(); }}
          onCancel={() => setPromoteDupOpen(false)}
        >
          Looks like existing customer <strong>{similarMaster.customer.name}</strong> ({similarMaster.customer.id}). Promote anyway?
        </ConfirmDialog>
      )}

      {renameConfirmOpen && (
        <ConfirmDialog
          title={`Rename "${originalName}"?`}
          tone="lead"
          confirmLabel="Save anyway"
          busy={saving}
          onConfirm={handleSave}
          onCancel={() => setRenameConfirmOpen(false)}
        >
          {linkedSummary} use the old name "<strong>{originalName}</strong>". They link to this lead by company name and will <strong>not</strong> be renamed, so this lead's order total may stop adding up.
        </ConfirmDialog>
      )}
    </div>
  );
}
