import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { generateId, formatINR, localDateStr, fmtDate, PAY_OPTIONS, normalizePayTerms } from '../lib/utils';
import { QuoteItem, Quote, AuthorizedSignatory, QuoteStatus } from '../lib/types';
import { usePackingTypes } from '../hooks/usePackingTypes';
import { useProductCatalog } from '../hooks/useProductCatalog';
import { ProductSearch } from '../components/ProductSearch';
import { OptionSearch } from '../components/OptionSearch';
import { Button } from '../components/ui';
import { CustomerSearch } from '../components/CustomerSearch';
import { generateQuotePDF } from '../lib/pdfGenerator';
import { downloadQuoteDOCX } from '../lib/quoteDocx';
import { SendEmailModal } from '../components/SendEmailModal';
import { Copy, Upload, X, AlertCircle } from 'lucide-react';
import { syncContactToCustomer } from '../lib/contactSync';

const STEPS = ['Form', 'Preview'];

type TncState = {
  leadTime: string; freight: string; payment: string; validity: string; taxes: string;
};

const defaultTnc = (): TncState => ({
  leadTime: '',
  freight: '',
  payment: '',
  validity: '',
  taxes: 'GST Extra as applicable, 18% at present',
});

const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";

const INCO_OPTIONS = [
  'EXW',
  'FOB',
  'CIF',
  'CFR',
  'DAP',
  'DDP',
  'FCA',
  'Ex Bhiwandi Warehouse',
  'Ex Bhiwandi Warehouse Self Pickup',
  'Ex Factory Warehouse',
  'Delivered',
  'Free Delivery till Transport',
  'Ex-Port',
];

const normalizeInco = (raw: string | undefined): string => {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  const exact = INCO_OPTIONS.find(o => o.toLowerCase() === lower);
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
  return '';
};


function TncComboCell({ value, suggestions, onChange, label, standalone }: {
  value: string;
  suggestions: string[];
  onChange: (v: string) => void;
  label: string;
  standalone?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value);

  // Close only when focus leaves the container entirely — avoids the race where
  // a document mousedown listener fires before the button click registers.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) setOpen(false);
    };
    el.addEventListener('focusout', handler);
    return () => el.removeEventListener('focusout', handler);
  }, []);

  return (
    <div ref={ref} className={`relative${standalone ? ' mt-2' : ''}`}>
      <input
        type="text"
        title={label}
        placeholder={`Enter ${label}`}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className={standalone
          ? 'w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt'
          : 'w-full font-sans text-[12px] text-blk bg-transparent px-2 py-1 outline-none focus:bg-g50 rounded-[2px]'}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-g300 rounded-[3px] shadow-lg max-h-44 overflow-y-auto">
          {filtered.map(s => (
            <li key={s}>
              <button
                type="button"
                onClick={() => { onChange(s); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11.5px] text-blk hover:bg-red-lt/40 hover:text-red-mrt transition-colors"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewQuote() {
  const [searchParams, setSearchParams] = useSearchParams();
  const enqRef = searchParams.get('enqRef');
  const editId = searchParams.get('id');
  const custParam = searchParams.get('cust');
  const navigate = useNavigate();
  const { data, addQuote, updateQuote, updateEnquiry, addCustomer, addSignatory, stampName } = useAppStore();
  const packingTypeOptions = usePackingTypes();
  const { names: productNames, hsnMap: productHsnMap } = useProductCatalog();

  // Linked enquiry reference. Seeded from the URL when converting an enquiry,
  // and re-hydrated from the saved quote when editing — so editing never wipes
  // the original enqRef. Always written through on save.
  const [linkedEnqRef, setLinkedEnqRef] = useState<string>(enqRef || '');

  // ── Unsaved-changes guard ──
  // `dirty` flips on first edit, clears on a successful save; while dirty,
  // refreshing / closing / leaving the page warns before discarding edits.
  const [dirty, setDirty] = useState(false);
  const markDirty = () => setDirty(d => d || true);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  const confirmLeave = () =>
    !dirty || window.confirm('You have unsaved changes. Leave without saving?');

  const hsnSuggestions = useMemo(() =>
    [...new Set(data.quotes.flatMap(q => q.items.map(i => i.hsn ?? '')).filter(Boolean))].sort(),
    [data.quotes]);

  const [step, setStep] = useState(1);
  const [insurance, setInsurance] = useState(0);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [dupQuoteAlert, setDupQuoteAlert] = useState<{ existingId: string } | null>(null);

  const [date, setDate] = useState(localDateStr(new Date()));
  const [validity, setValidity] = useState(localDateStr(new Date(Date.now() + 86400000)));
  const [custName, setCustName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [contactId, setContactId] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [contactManual, setContactManual] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = contactRef.current;
    if (!el) return;
    const handler = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node | null)) setContactOpen(false); };
    el.addEventListener('focusout', handler);
    return () => el.removeEventListener('focusout', handler);
  }, []);
  const [inco, setInco] = useState('EXW');
  const [customInco, setCustomInco] = useState('');
  const [curr, setCurr] = useState('INR');
  const [pay, setPay] = useState('30 Days Net');
  const [unitId, setUnitId] = useState('');
  const [custEnquiryDocNo, setCustEnquiryDocNo] = useState('');
  const [authName, setAuthName] = useState('');
  const [authDesignation, setAuthDesignation] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [selectedSigId, setSelectedSigId] = useState('');
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('Draft');
  const [tnc, setTnc] = useState<TncState>(defaultTnc);
  const setTncField = (k: keyof TncState, v: string) => setTnc((p: TncState) => ({ ...p, [k]: v }));

  // Collect unique historical values per T&C field from all saved quotes
  const tncSuggestions = useMemo(() => {
    const acc: Record<keyof TncState, Set<string>> = {
      leadTime: new Set(), freight: new Set(), payment: new Set(), validity: new Set(), taxes: new Set(),
    };
    for (const q of data.quotes) {
      if (!q.terms) continue;
      try {
        const parsed: Partial<TncState> = JSON.parse(q.terms);
        for (const k of Object.keys(acc) as (keyof TncState)[]) {
          const v = parsed[k];
          if (v && v.trim()) acc[k].add(v.trim());
        }
      } catch { /**/ }
    }
    // Also seed with known defaults so new users get suggestions immediately
    const d = defaultTnc();
    for (const k of Object.keys(acc) as (keyof TncState)[]) acc[k].add(d[k]);
    return Object.fromEntries(
      Object.entries(acc).map(([k, s]) => [k, [...s].sort()])
    ) as Record<keyof TncState, string[]>;
  }, [data.quotes]);

  // Past custom inco values (those that were OVERRIDE saves — not in the fixed list)
  const customIncoSuggestions = useMemo(() =>
    [...new Set(data.quotes.map(q => q.inco).filter(v => v && !INCO_OPTIONS.includes(v)) as string[])].sort()
  , [data.quotes]);

  const [sigMsg, setSigMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [quoteId, setQuoteId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedQuote, setSavedQuote] = useState<Quote | null>(null);
  const [contactSyncMsg, setContactSyncMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!contactSyncMsg) return;
    const t = setTimeout(() => setContactSyncMsg(null), 6000);
    return () => clearTimeout(t);
  }, [contactSyncMsg]);

  // Copy from quote
  const [showCopyQuote, setShowCopyQuote] = useState(false);
  // PDF upload
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<QuoteItem[] | null>(null);

  // Auto-load default signatory. app_settings always wins when loaded; is_default is
  // fallback only while settings hasn't arrived yet. authName is NOT in the top guard —
  // that fixes the timing race where signatories load first, set the fallback, then
  // settings loads but finds authName already set and returns early (wrong result).
  useEffect(() => {
    if (editId) return;
    if (data.settings?.signatory_name) {
      setAuthName(data.settings.signatory_name);
      setAuthDesignation(data.settings.signatory_title || '');
      setAuthPhone(data.settings.signatory_phone || '');
      const matched = data.signatories.find((s: AuthorizedSignatory) => s.name === data.settings!.signatory_name);
      if (matched) setSelectedSigId(matched.id);
    } else if (!authName) {
      const def = data.signatories.find((s: AuthorizedSignatory) => s.is_default);
      if (def) { setAuthName(def.name); setAuthDesignation(def.designation); setAuthPhone(def.phone || ''); setSelectedSigId(def.id); }
    }
  }, [data.signatories, data.settings, editId]);

  // Load / init — runs once per target (editId/enqRef) to avoid wiping unsaved
  // changes on store updates, but re-runs when the target changes (e.g. the
  // duplicate dialog switches this page into editing the existing quote).
  const initedFor = useRef<string | null>(null);
  useEffect(() => {
    const target = editId ? `id:${editId}` : enqRef ? `enq:${enqRef}` : custParam ? `cust:${custParam}` : 'new';
    if (initedFor.current === target) return;
    initedFor.current = target;
    if (editId) {
      const q = data.quotes.find(x => x.id === editId);
      if (q) {
        if (q.enqRef) setLinkedEnqRef(q.enqRef);
        setQuoteId(q.id); setDate(q.date); setValidity(q.validity || localDateStr(new Date(new Date(q.date + 'T00:00:00').getTime() + 86400000)));
        setCustName(q.cust);
        const savedInco = q.inco || '';
        const _ni = normalizeInco(savedInco);
        setInco(_ni || 'OVERRIDE'); setCustomInco(_ni ? '' : savedInco);
        setCurr(q.curr || 'INR'); setPay(normalizePayTerms(q.pay) || '30 Days Net');
        setAuthName(q.authorizedPerson?.name || ''); setAuthDesignation(q.authorizedPerson?.designation || ''); setAuthPhone(q.authorizedPerson?.phone || '');
        setQuoteStatus(q.status);
        if (q.unitId) setUnitId(q.unitId);
        if (q.custEnquiryDocNo) setCustEnquiryDocNo(q.custEnquiryDocNo);
        if (q.terms) { try { setTnc({ ...defaultTnc(), ...JSON.parse(q.terms) }); } catch { /**/ } }
        setItems(q.items);
        setInsurance(q.insurance ?? 0);
        setNotes(q.notes ?? []);
        const matched = data.signatories.find((s: AuthorizedSignatory) => s.name === q.authorizedPerson?.name);
        if (matched) setSelectedSigId(matched.id);
        const c = data.customers.find(x => x.name === q.cust);
        if (c) {
          const ps = (q.siteId && (c.sites ?? []).find((s: any) => s.id === q.siteId))
            || (c.sites ?? []).find((s: any) => s.isPrimary)
            || (c.sites ?? [])[0];
          if (ps) { setSiteId(ps.id); const pc = (ps.contacts ?? []).find((ct: any) => ct.isPrimary) || (ps.contacts ?? [])[0]; if (pc) { setContactId(pc.id); setContact(pc.name); setEmail(pc.email); setPhone(pc.phone || ''); } }
        }
        // Saved quote contact details win over re-derived ones.
        if (q.contact) setContact(q.contact);
        if (q.email) setEmail(q.email);
        if (q.phone) setPhone(q.phone);
      }
    } else if (enqRef) {
      // Duplicate guard: warn if this enquiry was already converted to a quote
      const existing = data.quotes.find(q => q.enqRef === enqRef);
      if (existing) { setDupQuoteAlert({ existingId: existing.id }); return; }
      setQuoteId(generateId('HTP', data.quotes.map(q => q.id)));
      const enq = data.enquiries.find(e => e.id === enqRef);
      if (enq) {
        setCustName(enq.cust); if (enq.siteId) setSiteId(enq.siteId); if (enq.contactId) setContactId(enq.contactId);
        setContact(enq.contact); setEmail(enq.email); setPhone(enq.phone || '');
        // Carry the customer's enquiry doc number forward (editable).
        if (enq.custEnqDocNo) setCustEnquiryDocNo(enq.custEnqDocNo);
        // If the enquiry had no contactId the details were typed manually — preserve them
        setContactManual(!enq.contactId && !!(enq.contact || enq.email));
        const cr = data.customers.find(c => c.name === enq.cust);
        if (cr) { const ci = cr.inco || ''; { const _n = normalizeInco(ci); setInco(_n || 'OVERRIDE'); setCustomInco(_n ? '' : (ci || '')); } setCurr(cr.curr || 'INR'); setPay(normalizePayTerms(cr.pay) || '30 Days Net'); }
        setItems(enq.items.map((i, idx) => ({ ...i, seq: idx + 1, hsn: i.hsn || '', unitPrice: 0, gst: 18, total: 0 })));
      }
    } else {
      setQuoteId(generateId('HTP', data.quotes.map(q => q.id)));
      setItems([{ seq: 1, desc: '', mat: '', hsn: '', qty: 1, uom: 'pcs', packing: '', packingType: '', priceBasis: 'Per kg', unitPrice: 0, gst: 18, total: 0 }]);
      if (custParam) {
        setCustName(custParam);
        const cr = data.customers.find(c => c.name === custParam);
        if (cr) {
          const ci = cr.inco || '';
          { const _n = normalizeInco(ci); setInco(_n || 'OVERRIDE'); setCustomInco(_n ? '' : (ci || '')); }
          setCurr(cr.curr || 'INR');
          setPay(normalizePayTerms(cr.pay) || '30 Days Net');
          const ps = (cr.sites ?? []).find((s: any) => s.isPrimary) || (cr.sites ?? [])[0];
          if (ps) {
            setSiteId(ps.id);
            const pc = (ps.contacts ?? []).find((ct: any) => ct.isPrimary) || (ps.contacts ?? [])[0];
            if (pc) { setContactId(pc.id); setContact(pc.name); setEmail(pc.email); setPhone(pc.phone || ''); }
          }
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, enqRef, custParam]);

  // Auto-load default unit
  useEffect(() => {
    if (unitId || editId) return;
    const def = data.units.find(u => u.is_default) ?? data.units[0];
    if (def) setUnitId(def.id);
  }, [data.units, unitId, editId]);

  // Cascading customer → site → contact auto-fill
  useEffect(() => {
    if (!custName) return;
    const customer = data.customers.find(c => c.name === custName);
    if (!customer) return;
    if (!editId) { const ci = customer.inco || ''; { const _n = normalizeInco(ci); setInco(_n || 'OVERRIDE'); setCustomInco(_n ? '' : (ci || '')); } setCurr(customer.curr || 'INR'); setPay(normalizePayTerms(customer.pay) || '30 Days Net'); }
    const sites = customer.sites ?? [];
    if (siteId) {
      const site = sites.find(s => s.id === siteId);
      if (site) {
        const contacts = site.contacts ?? [];
        if (contactId && !contactManual) {
          const ct = contacts.find((c: any) => c.id === contactId);
          if (ct) { setContact(ct.name || ''); setEmail(ct.email || ''); setPhone(ct.phone || ''); }
        } else if (!editId && !contactId && !contactManual) {
          const pc = (contacts as any[]).find((ct: any) => ct.isPrimary)
            || (contacts as any[]).find((ct: any) => ct.email || ct.phone || ct.name)
            || contacts[0];
          if (pc && (pc.name || pc.email || pc.phone)) {
            setContactId(pc.id); setContact(pc.name || ''); setEmail(pc.email || ''); setPhone(pc.phone || '');
          }
        }
      }
    } else {
      const ps = (sites as any[]).find((s: any) => s.isPrimary) ?? sites[0];
      if (ps) setSiteId(ps.id);
    }
  }, [custName, siteId, contactId, contactManual, data.customers, editId]);

  // T&C auto-fill: payment from Payment Terms, validity from Valid Until date.
  useEffect(() => {
    setTnc(p => ({ ...p, payment: pay, validity: fmtDate(validity) }));
  }, [pay, validity]);

  // Item helpers
  const updateItem = (idx: number, field: keyof QuoteItem, value: any) => {
    const ni = [...items]; (ni[idx] as any)[field] = value;
    if (field === 'qty' || field === 'unitPrice' || field === 'priceBasisConv' || field === 'packing') {
      const packingNum = parseFloat(ni[idx].packing || '') || 0;
      const totalQty = Number(ni[idx].qty) * (packingNum || 1);
      const conv = Number(ni[idx].priceBasisConv) || 1;
      ni[idx].total = totalQty * conv * Number(ni[idx].unitPrice);
    }
    // Clear conv when priceBasis is cleared
    if (field === 'priceBasis' && !value) {
      ni[idx].priceBasisConv = undefined;
      const packingNum = parseFloat(ni[idx].packing || '') || 0;
      const totalQty = Number(ni[idx].qty) * (packingNum || 1);
      ni[idx].total = totalQty * Number(ni[idx].unitPrice);
    }
    setItems(ni);
  };
  const addItem = () => setItems([...items, { seq: items.length + 1, desc: '', mat: '', hsn: '', qty: 1, uom: 'pcs', packing: '', packingType: '', priceBasis: 'Per kg', unitPrice: 0, gst: 18, total: 0, rateOverride: false, rateText: '' }]);
  const removeItem = (idx: number) => { if (items.length === 1) return; setItems(items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, seq: i + 1 }))); };

  // Copy items from an existing quote
  const copyFromQuote = (srcQuote: Quote) => {
    const copied = srcQuote.items.map((it, idx) => ({ ...it, seq: idx + 1 }));
    setItems(copied);
    markDirty();
    setShowCopyQuote(false);
  };

  // Extract line items from a PDF using pdfjs-dist
  const handlePdfUpload = async (file: File) => {
    setPdfError(null);
    setPdfParsing(true);
    setPdfPreview(null);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const pageLines: { y: number; text: string }[] = [];
        for (const item of content.items as any[]) {
          if (!item.str?.trim()) continue;
          const y = Math.round(item.transform[5]);
          const existing = pageLines.find(l => Math.abs(l.y - y) < 4);
          if (existing) existing.text += ' ' + item.str;
          else pageLines.push({ y, text: item.str });
        }
        pageLines.sort((a, b) => b.y - a.y);
        fullText += pageLines.map(l => l.text).join('\n') + '\n';
      }
      const extracted = parsePdfTextToItems(fullText);
      if (extracted.length === 0) {
        setPdfError('Could not detect line items in this PDF. Try the "Copy from quote" option instead.');
      } else {
        setPdfPreview(extracted);
      }
    } catch (err: any) {
      setPdfError('Failed to read PDF: ' + (err?.message ?? 'unknown error'));
    } finally {
      setPdfParsing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  // Parse PDF text into line items — handles MRT quote format:
  // "[seq] [qty] [uom] [description] Rs. X,XXX=00 [uom]"
  const parsePdfTextToItems = (text: string): QuoteItem[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const results: QuoteItem[] = [];

    // Normalise price strings: "1,880=00" or "1,880.00" → "1880"
    const parsePrice = (s: string): number => {
      // Replace trailing =XX (paise with = sign) with .XX, strip commas/Rs./spaces
      const clean = s.replace(/=(\d{2})$/, '.$1').replace(/[,\s]/g, '').replace(/^[Rrs.]+/i, '');
      return parseFloat(clean) || 0;
    };

    // Known T&C keywords — skip lines that are terms rows, not item rows
    const tncKeywords = /delivery|lead\s*time|packing|freight|payment|validity|taxes|forwarding|gst\s*extra/i;

    // UOM words to recognise
    const uomRx = /\b(nos?|pcs?|sets?|kgs?|mtrs?|mtr|meters?|pairs?|rolls?|lengths?|units?)\b/i;

    // MRT format: line starts with seq number, then qty+uom, then desc, then Rs. price, then uom
    // e.g. "1 1 Nos Rubber seat as per drawing-Siliconed Butyl Rs. 1,880=00 Nos"
    const mrtRx = /^(\d{1,3})\s+(\d+(?:\.\d+)?)\s*(nos?|pcs?|sets?|kgs?|mtrs?|mtr|meters?|pairs?|rolls?|lengths?|units?)?\s+(.+?)\s+Rs\.?\s*([\d,]+=\d{2}|[\d,]+(?:\.\d+)?)\s*(nos?|pcs?|sets?|kgs?|mtrs?|meters?|pairs?|units?)?$/i;

    // Generic fallback: "1. description ... price"
    const genericRx = /^(\d{1,3})[.):\s]\s+(.+)/;

    for (const line of lines) {
      if (tncKeywords.test(line)) continue;

      // Try MRT-specific pattern first
      const mm = line.match(mrtRx);
      if (mm) {
        const seq = parseInt(mm[1], 10);
        const qty = parseFloat(mm[2]) || 1;
        const uom = mm[3] || mm[6] || 'Nos';
        const desc = mm[4].trim();
        const unitPrice = parsePrice(mm[5]);
        if (desc.length < 3 || tncKeywords.test(desc)) continue;
        results.push({ seq, desc, mat: '', hsn: '', qty, uom, unitPrice, gst: 18, total: qty * unitPrice });
        continue;
      }

      // Generic fallback: seq + rest, look for Rs./price at end
      const gm = line.match(genericRx);
      if (!gm) continue;
      const seq = parseInt(gm[1], 10);
      if (seq < 1 || seq > 200) continue;
      const rest = gm[2];
      if (tncKeywords.test(rest)) continue;

      // Normalise and extract price: Rs. X,XXX=00 or plain number at end
      const priceMatch = rest.match(/Rs\.?\s*([\d,]+=\d{2}|[\d,]+(?:\.\d+)?)\s*(?:nos?|pcs?|sets?|kgs?)?$/i);
      const unitPrice = priceMatch ? parsePrice(priceMatch[1]) : 0;

      // Extract qty: first standalone number (possibly followed by uom)
      const qtyMatch = rest.match(/^(\d+(?:\.\d+)?)\s*(nos?|pcs?|sets?|kgs?|mtrs?|meters?|pairs?)?/i);
      const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
      const uomMatch = rest.match(uomRx);
      const uom = uomMatch ? uomMatch[1] : 'Nos';

      // Description: strip leading qty/uom and trailing price
      let desc = rest
        .replace(/^(\d+(?:\.\d+)?)\s*(nos?|pcs?|sets?|kgs?|mtrs?|meters?|pairs?)?\s*/i, '')
        .replace(/Rs\.?\s*[\d,]+=\d{2}/i, '')
        .replace(/Rs\.?\s*[\d,]+(?:\.\d+)?/i, '')
        .replace(/\s*(nos?|pcs?|sets?|kgs?)\s*$/i, '')
        .trim();
      if (!desc || desc.length < 3) continue;

      results.push({ seq, desc, mat: '', hsn: '', qty, uom, unitPrice, gst: 18, total: qty * unitPrice });
    }

    return results;
  };

  const subTotal = items.reduce((s, i) => s + i.total, 0);
  const ins = curr === 'INR' ? insurance : 0;
  // GST base = subtotal + insurance (insurance contributes to taxable amount)
  const gstTotal = curr === 'INR' && subTotal > 0
    ? items.reduce((s, i) => s + i.total * i.gst / 100, 0) * (subTotal + ins) / subTotal
    : 0;
  const grandTotal = curr === 'INR' ? Math.round(subTotal + ins + gstTotal) : subTotal;
  const sym = curr === 'USD' ? '$' : '₹';
  const fmtAmt = (v: number) => curr === 'USD'
    ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : formatINR(v);

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!custName) e.custName = 'Customer is required';
    if (items.some(i => !i.desc || Number(i.qty) <= 0)) e.items = 'All items need a description and quantity > 0';
    // ENQ ref is compulsory when this quote was converted from an enquiry.
    // Without it the attachment chain (ENQ → Quote → Order) is broken.
    if (enqRef && !linkedEnqRef) e.enqRef = 'Enquiry reference is missing — cannot save without it';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildQuoteData = (statusOverride?: QuoteStatus): Quote => {
    const status = statusOverride ?? quoteStatus;
    const existing = editId ? data.quotes.find(q => q.id === editId) : undefined;
    // Stamp sent_at the first time the quote becomes Sent; never overwrite an
    // earlier sent time. Drives the "Punched At" (sent) KPI on Rate Entry.
    const sent_at = status === 'Sent'
      ? (existing?.sent_at ?? new Date().toISOString())
      : existing?.sent_at;
    return {
      id: quoteId, enqRef: linkedEnqRef || enqRef || '', cust: custName, date, validity,
      siteId: siteId || undefined,
      contactId: contactId || undefined,
      contact: contact || undefined,
      email: email || undefined,
      phone: phone || undefined,
      // Stays Draft until actually sent (email module / manual). Convert-to-order
      // sets Won separately. Don't auto-flip a saved draft to 'Sent'.
      status,
      curr, pay, items,
      insurance: curr === 'INR' ? ins : 0,
      notes: notes.filter(n => n.trim()),
      authorizedPerson: { name: authName, designation: authDesignation, phone: authPhone },
      terms: JSON.stringify(tnc),
      inco: inco === 'OVERRIDE' ? customInco : inco,
      unitId: unitId || undefined,
      custEnquiryDocNo: custEnquiryDocNo.trim() || undefined,
      // Preserve original doer on edit; stamp submitter email on new
      doer: editId ? (existing?.doer) : stampName(),
      sent_at,
    };
  };

  // Persist the quote (without PDF). Returns the qData used, so callers can
  // reuse it for the PDF without rebuilding.
  const persistQuote = async (statusOverride?: QuoteStatus): Promise<Quote | null> => {
    if (!validateStep1()) { setStep(1); return null; }
    setErrors({});
    const qData = buildQuoteData(statusOverride);
    if (editId) {
      await updateQuote(editId, qData);
      // Re-establish the enquiry back-link if it was ever lost.
      if (qData.enqRef) {
        const enq = data.enquiries.find(e => e.id === qData.enqRef);
        if (enq && enq.qRef !== qData.id) await updateEnquiry(qData.enqRef, { qRef: qData.id });
      }
    } else {
      await addQuote(qData);
      if (qData.enqRef) await updateEnquiry(qData.enqRef, { status: 'Quoted', qRef: quoteId });
    }
    if (!data.customers.find(c => c.name.toLowerCase() === custName.toLowerCase())) {
      await addCustomer({ id: generateId('CUST', data.customers.map(c => c.id)), code: generateId('CUS', data.customers.map(c => c.code)), name: custName, seg: 'General', gstin: '', inco: 'Ex-Works', curr: 'INR', pay: '30 days', sites: [] });
    }
    return qData;
  };

  // Run contact sync after save — silently for cases 1/2, brief toast for case 3.
  // Returns true if navigation should be delayed (case 3 shown).
  const doContactSync = async (): Promise<boolean> => {
    try {
      const r = await syncContactToCustomer(custName, contact, phone, email, data.customers);
      if (r.action === 'full') { setContactSyncMsg(r.message); return true; }
    } catch (e) { console.error('Contact sync failed:', e); }
    return false;
  };

  // Save only: persist + navigate to /quotes. No PDF.
  const handleSave = async (statusOverride?: QuoteStatus) => {
    setIsSaving(true);
    try {
      const qData = await persistQuote(statusOverride);
      if (!qData) return;
      setDirty(false);
      const delayed = await doContactSync();
      if (delayed) setTimeout(() => navigate('/quotes'), 4000);
      else navigate('/quotes');
    } catch (e: any) {
      console.error('Save failed:', e);
      setErrors({ global: `Failed to save: ${e?.message || e?.details || 'Unknown error — check browser console for details.'}` });
    } finally { setIsSaving(false); }
  };


  // Save + download PDF.
  const handleGeneratePDF = async () => {
    setIsSaving(true);
    try {
      const qData = await persistQuote();
      if (!qData) return;
      setDirty(false);
      await doContactSync();
      const unit = unitId ? data.units.find(u => u.id === unitId) : data.units.find(u => u.is_default);
      const sig = data.signatories.find((s: any) => s.is_default);
      generateQuotePDF(qData, data.customers.find(c => c.name === custName), data.settings, sig, true, unit);
    } catch (e: any) {
      console.error('PDF generation failed:', e);
      setErrors({ global: `Failed to generate PDF: ${e?.message || e?.details || 'Unknown error — check browser console for details.'}` });
    } finally { setIsSaving(false); }
  };

  // Generate DOCX: persist + download.
  const handleGenerateDOCX = async () => {
    setIsSaving(true);
    try {
      const qData = await persistQuote();
      if (!qData) return;
      setDirty(false);
      await doContactSync();
      const unit = unitId ? data.units.find(u => u.id === unitId) : data.units.find(u => u.is_default);
      const sig = data.signatories.find((s: any) => s.is_default);
      await downloadQuoteDOCX(qData, data.customers.find(c => c.name === custName), data.settings, sig, unit);
    } catch (e: any) {
      console.error('DOCX generation failed:', e);
      setErrors({ global: `Failed to generate DOCX: ${e?.message || e?.details || 'Unknown error — check browser console for details.'}` });
    } finally { setIsSaving(false); }
  };

  const goPreview = () => { if (validateStep1()) setStep(2); };

  // Stepper
  const Stepper = () => (
    <div className="flex items-center flex-1 px-6">
      {STEPS.map((label, i) => {
        const n = i + 1; const active = step === n; const done = step > n;
        return (
          <React.Fragment key={n}>
            <button type="button" onClick={() => (done || n < step) ? setStep(n) : undefined}
              className={`flex flex-col items-center gap-1 ${done ? 'cursor-pointer' : 'cursor-default'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${active ? 'bg-red-mrt text-white shadow-sm' : done ? 'bg-green-500 text-white' : 'bg-g200 text-g400'}`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${active ? 'text-red-mrt' : done ? 'text-green-600' : 'text-g400'}`}>{label}</span>
            </button>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 transition-all ${step > n ? 'bg-green-400' : 'bg-g200'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );

  const customer = data.customers.find(c => c.name === custName);

  if (dupQuoteAlert) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-g50 animate-in fade-in duration-200">
        <div className="bg-white border border-amber-200 rounded-[8px] shadow-lg p-7 max-w-[420px] w-full mx-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-amber-500"><path d="M10 2L2 17h16L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div className="font-bold text-[14px] text-blk mb-1">Enquiry Already Converted</div>
              <div className="text-[12.5px] text-g600 leading-relaxed">
                <span className="font-mono font-bold text-sQ">{enqRef}</span> has already been converted to quote{' '}
                <span className="font-mono font-bold text-red-mrt">{dupQuoteAlert.existingId}</span>.
              </div>
              <div className="text-[12px] text-g500 mt-2">Would you like to edit the existing quote, or create a new one anyway?</div>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <Button variant="primary" onClick={() => {
              // Switch this same mounted page into edit mode for the existing quote.
              // Clear the alert and change the id param; the load effect keys on
              // editId and re-runs to hydrate the existing quote.
              const id = dupQuoteAlert.existingId;
              setDupQuoteAlert(null);
              setSearchParams({ id });
            }} className="flex-1">
              Edit {dupQuoteAlert.existingId}
            </Button>
            <Button variant="secondary" onClick={() => {
              setDupQuoteAlert(null);
              setQuoteId(generateId('HTP', data.quotes.map(q => q.id)));
              const enq = data.enquiries.find(e => e.id === enqRef);
              if (enq) {
                setCustName(enq.cust); if (enq.siteId) setSiteId(enq.siteId); if (enq.contactId) setContactId(enq.contactId);
                setContact(enq.contact); setEmail(enq.email);
                setContactManual(!enq.contactId && !!(enq.contact || enq.email));
                const cr = data.customers.find(c => c.name === enq.cust);
                if (cr) { const ci = cr.inco || ''; { const _n = normalizeInco(ci); setInco(_n || 'OVERRIDE'); setCustomInco(_n ? '' : (ci || '')); } setCurr(cr.curr || 'INR'); setPay(normalizePayTerms(cr.pay) || '30 Days Net'); }
                setItems(enq.items.map((i, idx) => ({ ...i, seq: idx + 1, hsn: i.hsn || '', unitPrice: 0, gst: 18, total: 0 })));
              }
            }} className="flex-1">
              Create New Anyway
            </Button>
          </div>
          <button type="button" onClick={() => navigate(-1)} className="mt-3 w-full text-center text-[11px] text-g400 hover:text-g600">← Go back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">

      {/* Header */}
      <div className="pt-4 px-5 pb-3 border-b border-g200">
        <div className="flex items-center justify-between gap-4">
          <div className="shrink-0">
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-0.5">Module 02</div>
            <h1 className="font-serif text-[22px] text-blk tracking-tight leading-tight">
              {editId ? 'Edit' : 'Create'} <em className="italic text-red-mrt">Quotation</em>
            </h1>
          </div>
          <Stepper />
          <div className="flex items-center gap-3 shrink-0">
            {editId && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-g500 uppercase tracking-wide">Status</label>
                <select title="Quote status" value={quoteStatus}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setQuoteStatus(e.target.value as QuoteStatus)}
                  className="font-mono text-[11px] font-bold border border-g300 rounded-[3px] p-[5px_10px] outline-none focus:border-red-mrt bg-white cursor-pointer">
                  <option value="Draft">Draft</option><option value="Sent">Sent</option>
                  <option value="Won">Won</option><option value="Lost">Lost</option><option value="Parked">Parked</option>
                </select>
              </div>
            )}
            <Button variant="secondary" onClick={() => { if (confirmLeave()) navigate('/quotes'); }}>Back</Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-6 pt-3 flex-1 overflow-y-auto" onInput={markDirty} onChange={markDirty}>

        {/* ══ STEP 1: Form ══ */}
        {step === 1 && (
          <div className="flex flex-col gap-[12px]">

            {enqRef && (
              <div className="bg-sW/5 border border-sW/20 rounded-[3px] p-[9px_14px] flex items-center gap-[10px] text-[12px]">
                <span className="text-sW text-[14px]">✓</span>
                <div><strong className="text-sW">Items loaded from {enqRef}</strong> — Add unit prices to complete.</div>
              </div>
            )}

            {/* Quote ID + dates row */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="bg-blk p-[9px_16px] rounded-[3px] shrink-0">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-white/40 mb-0.5">Quote Ref</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-bold text-white">{quoteId}</span>
                  {(linkedEnqRef || enqRef) && (
                    <span className="font-mono text-[9px] text-white/40 border-l border-white/10 pl-2">ENQ: {linkedEnqRef || enqRef}</span>
                  )}
                </div>
              </div>
              {/* ENQ Ref — shown as required field when converting from enquiry */}
              {enqRef && (
                <div>
                  <label className="block text-[10px] font-bold tracking-[0.5px] uppercase mb-[3px] text-g500">
                    ENQ Reference <span className="text-red-mrt">*</span>
                  </label>
                  <div className={`font-mono text-[13px] font-bold px-[10px] py-[7px] rounded-[3px] border ${errors.enqRef ? 'border-red-mrt bg-red-lt text-red-mrt' : 'border-g200 bg-g50 text-blk'}`}>
                    {linkedEnqRef || <span className="text-red-mrt">MISSING</span>}
                  </div>
                  {errors.enqRef && <p className="text-red-mrt text-[10px] mt-1">{errors.enqRef}</p>}
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[3px]">Date of Issue</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-red-mrt uppercase tracking-[0.5px] mb-[3px]">Valid Until</label>
                <input type="date" value={validity} onChange={e => setValidity(e.target.value)}
                  className="font-mono text-[13px] font-bold text-blk bg-white border-2 border-red-mrt/30 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[3px]">Customer Enquiry Doc No.</label>
                <input type="text" value={custEnquiryDocNo} onChange={e => setCustEnquiryDocNo(e.target.value)}
                  placeholder="(if customer provided one)"
                  className="font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
              </div>
            </div>

            {/* Customer & Contact + Trading Terms */}
            <div className="grid grid-cols-12 gap-[12px]">
              <div className="col-span-8 bg-white border border-g200">
                <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt p-[11px_16px] border-b border-g200">Customer & Contact</div>
                <div className="p-[12px_16px] grid grid-cols-2 gap-[10px]">
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Customer <span className="text-red-mrt">*</span></label>
                    <CustomerSearch
                      customers={data.customers}
                      value={custName}
                      onChange={name => {
                        setCustName(name); setSiteId(''); setContactId(''); setContact(''); setEmail(''); setPhone(''); setContactManual(false); setErrors({ ...errors, custName: '' });
                        if (name) {
                          const cust = data.customers.find(c => c.name === name);
                          if (cust) {
                            const sites = (cust.sites ?? []) as any[];
                            const ps = sites.find((s: any) => s.isPrimary) || sites[0];
                            if (ps) {
                              setSiteId(ps.id);
                              const contacts = (ps.contacts ?? []) as any[];
                              const pc = contacts.find((ct: any) => ct.isPrimary) || contacts.find((ct: any) => ct.email || ct.phone || ct.name) || contacts[0];
                              if (pc && (pc.name || pc.email || pc.phone)) { setContactId(pc.id); setContact(pc.name || ''); setEmail(pc.email || ''); setPhone(pc.phone || ''); }
                            }
                          }
                        }
                      }}
                      error={!!errors.custName}
                    />
                    {errors.custName && <p className="text-red-mrt text-[10px] mt-1">{errors.custName}</p>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Unit</label>
                    <select value={siteId} onChange={e => { setSiteId(e.target.value); setContactId(''); setContact(''); setEmail(''); setPhone(''); setContactManual(false); }} disabled={!custName} className={selectCls + ' disabled:bg-g50 disabled:cursor-not-allowed'}>
                      <option value="">Select Unit...</option>
                      {(data.customers.find(c => c.name === custName)?.sites ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` (${s.city})` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <div className="p-[0_16px_12px] grid grid-cols-3 gap-[10px]">
                  <div ref={contactRef} className="relative">
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Contact Person</label>
                    {(() => {
                      const siteContacts = ((data.customers.find(c => c.name === custName)?.sites ?? []).find((s: any) => s.id === siteId)?.contacts ?? []) as any[];
                      const filtered = siteContacts.filter((ct: any) => !contact || ct.name.toLowerCase().includes(contact.toLowerCase()));
                      return (
                        <>
                          <input
                            type="text"
                            placeholder={siteId ? 'Type or search contact...' : 'Select site first'}
                            value={contact}
                            disabled={!siteId}
                            onChange={e => { setContact(e.target.value); setContactId(''); setContactManual(true); setContactOpen(true); }}
                            onFocus={() => { if (siteId) setContactOpen(true); }}
                            className={`w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt disabled:bg-g50 disabled:cursor-not-allowed`}
                          />
                          {contactOpen && siteContacts.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-g200 rounded-[4px] shadow-lg max-h-[160px] overflow-y-auto">
                              {filtered.length === 0 ? (
                                <div className="px-3 py-2 text-[11px] text-g400 italic">No match — name will be saved as typed</div>
                              ) : (
                                filtered.map((ct: any) => (
                                  <button key={ct.id} type="button" onClick={() => { setContactId(ct.id); setContact(ct.name); setEmail(ct.email || ''); setPhone(ct.phone || ''); setContactManual(false); setContactOpen(false); }} className="w-full text-left px-3 py-2 text-[12px] hover:bg-g50 flex items-center justify-between gap-2">
                                    <span className="font-medium text-blk">{ct.name}</span>
                                    {ct.role && <span className="text-[10px] text-g400 font-mono">{ct.role}</span>}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Phone</label>
                    <input type="tel" placeholder="+91 98XXX XXXXX" value={phone} onChange={e => { setContactManual(true); setPhone(e.target.value); }}
                      className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Email</label>
                    <input type="email" placeholder="contact@company.com" value={email} onChange={e => { setContactManual(true); setEmail(e.target.value); }}
                      className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                  </div>
                </div>
              </div>

              <div className="col-span-4 bg-white border border-g200">
                <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600 p-[11px_16px] border-b border-g200">Trading Terms</div>
                <div className="p-[12px_16px] flex flex-col gap-[10px]">
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Incoterms</label>
                    <select value={inco} onChange={e => { const v = e.target.value; setInco(v); if (v !== 'OVERRIDE') setCustomInco(''); }} className={selectCls}>
                      {INCO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      <option value="OVERRIDE">Other / Override…</option>
                    </select>
                    {inco === 'OVERRIDE' && (
                      <TncComboCell
                        label="Custom Incoterm"
                        value={customInco}
                        suggestions={customIncoSuggestions}
                        onChange={setCustomInco}
                        standalone
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Payment Terms</label>
                    <select value={pay} onChange={e => setPay(e.target.value)} className="w-full font-sans text-[13px] text-blk border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt bg-white appearance-none cursor-pointer">
                      <option>3 Days</option>
                      <option>7 Days</option>
                      <option>14 Days</option>
                      <option>30 Days Net</option>
                      <option>45 Days</option>
                      <option>60 Days</option>
                      <option>90 Days</option>
                      <option>120 Days</option>
                      <option>50% Advance, 50% on Delivery</option>
                      <option>100% Advance</option>
                      <option>LC at Sight</option>
                      <option>Advance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Currency</label>
                    <select value={curr} onChange={e => setCurr(e.target.value)} className={selectCls + ' font-bold'}>
                      <option>INR</option><option>USD</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white border border-g200">
              <div className="p-[11px_16px] border-b border-g200 flex items-center justify-between gap-2">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g500">Line Items <span className="text-red-mrt">*</span></span>
                <div className="hidden flex items-center gap-2 ml-auto">
                  {errors.items && <span className="text-red-mrt text-[11px] font-medium">{errors.items}</span>}
                  {/* Copy from existing quote */}
                  <button
                    type="button"
                    onClick={() => setShowCopyQuote(v => !v)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border border-g300 text-[11px] font-medium text-g600 hover:border-red-mrt hover:text-red-mrt transition-colors"
                  >
                    <Copy size={11} /> Copy from Quote
                  </button>
                  {/* Upload PDF */}
                  <button
                    type="button"
                    onClick={() => { setPdfError(null); setPdfPreview(null); pdfInputRef.current?.click(); }}
                    disabled={pdfParsing}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border border-g300 text-[11px] font-medium text-g600 hover:border-red-mrt hover:text-red-mrt transition-colors disabled:opacity-50"
                  >
                    <Upload size={11} /> {pdfParsing ? 'Reading PDF…' : 'Upload PDF'}
                  </button>
                  <input ref={pdfInputRef} type="file" accept="application/pdf" title="Upload quote PDF" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); }} />
                </div>
              </div>

              {/* Copy-from-quote panel */}
              {showCopyQuote && (() => {
                const custQuotes = data.quotes.filter(q => q.cust === custName && q.items.length > 0);
                const allQuotes = data.quotes.filter(q => q.items.length > 0);
                const list = custQuotes.length > 0 ? custQuotes : allQuotes;
                return (
                  <div className="border-b border-g200 bg-g50 p-3">
                    <div className="text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-2">
                      {custQuotes.length > 0 ? `Quotes for ${custName}` : 'All Quotes'} — click to copy line items
                    </div>
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                      {list.map(q => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => copyFromQuote(q)}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-[4px] bg-white border border-g200 hover:border-red-mrt hover:bg-red-50 text-left transition-colors"
                        >
                          <span className="font-mono text-[10.5px] font-bold text-red-mrt shrink-0">{q.id}</span>
                          <span className="text-[11px] text-g600 truncate flex-1">{q.cust} — {q.items.length} item{q.items.length !== 1 ? 's' : ''}: {q.items.map(i => i.desc).filter(Boolean).join(', ')}</span>
                          <span className="text-[10px] text-g400 shrink-0">{q.date}</span>
                        </button>
                      ))}
                      {list.length === 0 && <div className="text-[11px] text-g400 px-2 py-1">No quotes found.</div>}
                    </div>
                  </div>
                );
              })()}

              {/* PDF error */}
              {pdfError && (
                <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 flex items-start gap-2">
                  <AlertCircle size={13} className="text-red-mrt mt-0.5 shrink-0" />
                  <span className="text-[11px] text-red-700">{pdfError}</span>
                  <button type="button" title="Dismiss" onClick={() => setPdfError(null)} className="ml-auto text-g400 hover:text-blk"><X size={12} /></button>
                </div>
              )}

              {/* PDF preview — confirm before applying */}
              {pdfPreview && (
                <div className="border-b border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-[0.5px]">PDF extracted {pdfPreview.length} items — review & confirm</span>
                    <button type="button" title="Discard PDF preview" onClick={() => setPdfPreview(null)} className="text-g400 hover:text-blk"><X size={12} /></button>
                  </div>
                  <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto mb-2">
                    {pdfPreview.map((it, i) => (
                      <div key={i} className="flex gap-3 text-[11px] px-2 py-1 bg-white rounded border border-amber-100">
                        <span className="font-mono text-g400 w-4 shrink-0">{it.seq}.</span>
                        <span className="flex-1 truncate text-blk">{it.desc}</span>
                        <span className="text-g500 shrink-0">Barrels: {it.qty}</span>
                        <span className="text-g500 font-mono shrink-0">₹{it.unitPrice.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setItems(pdfPreview); setPdfPreview(null); markDirty(); }} className="px-3 py-1.5 bg-red-mrt text-white rounded-[4px] text-[11px] font-bold hover:bg-red-700 transition-colors">
                      Use These Items
                    </button>
                    <button type="button" onClick={() => setPdfPreview(null)} className="px-3 py-1.5 border border-g300 text-g600 rounded-[4px] text-[11px] font-medium hover:bg-g100 transition-colors">
                      Discard
                    </button>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <datalist id="qt-hsn-list">{hsnSuggestions.map(s => <option key={s} value={s} />)}</datalist>
                  <table className="w-full border-collapse border border-g400 text-[12px]">
                    <thead className="bg-g100">
                      <tr>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400 w-8">#</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-red-mrt px-3 py-1.5 text-left border border-g400">Product Name</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400 w-24">HSN Code</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-red-mrt px-3 py-1.5 text-center border border-g400 w-32 whitespace-nowrap">No of Barrels *</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-24">Packing</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-24 whitespace-nowrap">Total Qty</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-28">Packing Type</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-28">Price Basis</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-right border border-g400 w-28">Unit Rate ({sym})</th>
                        {curr === 'INR' && <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-20">GST %</th>}
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-right border border-g400 w-28">Amount ({sym})</th>
                        <th className="w-8 border border-g400"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.seq} className="hover:bg-g50/50">
                          <td className="px-3 py-[5px] border border-g400 align-middle font-mono font-bold text-g400 text-[11px]">{item.seq}</td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <ProductSearch
                              value={item.desc}
                              names={productNames}
                              hsnMap={productHsnMap}
                              onChange={(desc, hsn) => {
                                const ni = [...items];
                                const resolvedHsn = !desc ? '' : (hsn ?? (desc in productHsnMap ? productHsnMap[desc] : undefined));
                                ni[idx] = { ...ni[idx], desc, ...(resolvedHsn !== undefined ? { hsn: resolvedHsn } : {}) };
                                setItems(ni);
                                setErrors({ ...errors, items: '' });
                              }}
                              error={!!(errors.items && !item.desc)}
                            />
                          </td>
                          <td className={`px-3 py-[5px] border border-g400 align-middle${item.desc in productHsnMap ? ' bg-g100' : ''}`}>
                            <input
                              type="text"
                              list={item.desc in productHsnMap ? undefined : 'qt-hsn-list'}
                              title="HSN Code"
                              value={item.hsn}
                              readOnly={item.desc in productHsnMap}
                              onChange={e => updateItem(idx, 'hsn', e.target.value)}
                              className={`w-full bg-transparent outline-none font-mono text-[11px] ${item.desc in productHsnMap ? 'text-g500 cursor-default select-none' : 'text-blk'}`}
                            />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <input type="number" min="1" value={item.qty || ''} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); setErrors({ ...errors, items: '' }); }}
                              className={`w-full bg-transparent outline-none font-mono text-[12px] text-center ${errors.items && Number(item.qty) <= 0 ? 'text-red-mrt' : 'text-blk'}`} />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <input type="text" value={item.packing || ''} onChange={e => updateItem(idx, 'packing', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-blk" />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle bg-g100 text-center">
                            {(() => { const p = parseFloat(item.packing || ''); const t = item.qty * p; return (p > 0 && item.qty > 0) ? <span className="font-mono text-[11px] text-g500">{Number.isInteger(t) ? t : t}</span> : <span className="text-g300 text-[11px]">—</span>; })()}
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <OptionSearch
                              options={packingTypeOptions}
                              value={item.packingType || ''}
                              onChange={val => updateItem(idx, 'packingType', val)}
                              placeholder="Packing type…"
                            />
                          </td>
                          <td className="px-1 py-[3px] border border-g400 align-middle">
                            <select value={item.priceBasis || 'Per kg'} onChange={e => updateItem(idx, 'priceBasis', e.target.value)}
                              className="w-full bg-transparent outline-none font-sans text-[11px] text-blk text-center cursor-pointer">
                              {['Per kg','Per MT','Per Ltr','Per KL','Per Unit','Per Drum','Per Can'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                          <td className="px-[6px] py-[5px] border border-g400 align-middle">
                            <div className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={!!item.rateOverride}
                                onChange={e => updateItem(idx, 'rateOverride', e.target.checked)}
                                title="Override rate with text"
                                className="accent-red-600 shrink-0 cursor-pointer"
                              />
                              {item.rateOverride ? (
                                <input
                                  type="text"
                                  value={item.rateText || ''}
                                  placeholder="Regret"
                                  onChange={e => updateItem(idx, 'rateText', e.target.value)}
                                  className="flex-1 bg-transparent outline-none font-mono text-[11px] text-red-mrt placeholder:text-g400 min-w-0"
                                />
                              ) : (
                                <input type="number" step="any" min="0" value={item.unitPrice || ''} placeholder="0.00" onChange={e => updateItem(idx, 'unitPrice', Number(e.target.value))}
                                  className="flex-1 bg-transparent outline-none font-mono text-[12px] text-right text-blk placeholder:text-g300 min-w-0" />
                              )}
                            </div>
                          </td>
                          {curr === 'INR' && (
                            <td className="px-3 py-[5px] border border-g400 align-middle">
                              <select value={item.gst} onChange={e => updateItem(idx, 'gst', Number(e.target.value))} className="w-full bg-transparent outline-none text-[12px] text-center font-mono text-blk appearance-none cursor-pointer">
                                <option value={18}>18%</option><option value={12}>12%</option><option value={5}>5%</option><option value={0}>0%</option>
                              </select>
                            </td>
                          )}
                          <td className="px-3 py-[5px] border border-g400 align-middle text-right font-mono text-[12px] font-bold text-blk">{fmtAmt(item.total)}</td>
                          <td className="px-1 py-[5px] border border-g400 align-middle">
                            <button type="button" onClick={() => removeItem(idx)} className="text-g400 hover:text-red-mrt p-1 transition-colors disabled:opacity-30" title="Remove">
                              <svg viewBox="0 0 16 16" width="13" height="13" className="fill-current"><path d="M5.5 1h5v1h-5V1zM3 3v1h10V3H3zm1 2v9h8V5H4zm2 1h1v7H6V6zm3 0h1v7H9V6z" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-g200 bg-g50/50">
                        <td colSpan={8} className="px-3 py-2 text-right text-[11px] text-g500">Subtotal (before tax)</td>
                        <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk">{fmtAmt(subTotal)}</td>
                        <td></td>
                      </tr>
                      {curr === 'INR' && (
                        <tr className="border-b border-g200 bg-g50/50">
                          <td colSpan={8} className="px-3 py-2 text-right">
                            <span className="text-[11px] text-g500">Insurance</span>
                            <button
                              type="button"
                              onClick={() => setInsurance(Math.round(subTotal * 0.0015 * 100) / 100)}
                              className="block ml-auto text-[10px] text-blue-600 hover:text-blue-800 underline underline-offset-2 leading-tight"
                            >Apply 0.15%</button>
                          </td>
                          <td className="px-3 py-1 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={insurance === 0 ? '' : insurance}
                              onChange={e => setInsurance(e.target.value === '' ? 0 : Math.round(parseFloat(e.target.value) * 100) / 100)}
                              placeholder="0.00"
                              className="w-full text-right font-mono text-[12px] font-bold text-blk bg-transparent border-b border-g300 focus:border-blue-500 outline-none py-0.5 pr-0"
                            />
                          </td>
                          <td></td>
                        </tr>
                      )}
                      {curr === 'INR' && (
                        <tr className="border-b border-g200 bg-g50/50">
                          <td colSpan={8} className="px-3 py-2 text-right text-[11px] text-g500">GST Total</td>
                          <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk">{fmtAmt(gstTotal)}</td>
                          <td></td>
                        </tr>
                      )}
                      <tr className="bg-[#1e293b]">
                        <td colSpan={8} className="px-3 py-2.5 text-right text-[12px] font-bold text-white">Grand Total</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[13px] font-bold text-white">{fmtAmt(grandTotal)}</td>
                        <td className="bg-[#1e293b]"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="p-[8px_12px] flex items-start gap-3 flex-wrap">
                  <div className="inline-flex items-center gap-[6px] p-[7px_9px] text-red-mrt cursor-pointer text-[12px] font-semibold border border-dashed border-red-mrt/25 rounded-[3px] transition-colors hover:bg-red-lt" onClick={addItem}>
                    <svg viewBox="0 0 16 16" className="w-[13px] h-[13px] stroke-red-mrt fill-none stroke-2"><path d="M8 3v10M3 8h10"/></svg>
                    Add Another Line Item
                  </div>
                  <div className="inline-flex items-center gap-[6px] p-[7px_9px] text-g600 cursor-pointer text-[12px] font-semibold border border-dashed border-g300 rounded-[3px] transition-colors hover:bg-g50" onClick={() => setNotes(n => [...n, ''])}>
                    <svg viewBox="0 0 16 16" className="w-[13px] h-[13px] stroke-g500 fill-none stroke-2"><path d="M8 3v10M3 8h10"/></svg>
                    Add Note
                  </div>
                </div>
                {notes.length > 0 && (
                  <div className="px-3 pb-3 space-y-1.5">
                    <div className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 mb-1">Notes (printed below item table)</div>
                    {notes.map((note, ni) => (
                      <div key={ni} className="flex items-start gap-2">
                        <span className="font-mono text-[11px] text-g400 mt-[7px] shrink-0">{ni + 1}.</span>
                        <input
                          type="text"
                          value={note}
                          placeholder={`Note ${ni + 1}`}
                          onChange={e => setNotes(n => n.map((v, i) => i === ni ? e.target.value : v))}
                          className="flex-1 bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[12px] font-sans text-blk outline-none focus:border-red-mrt placeholder:text-g300"
                        />
                        <button type="button" onClick={() => setNotes(n => n.filter((_, i) => i !== ni))} className="text-g400 hover:text-red-mrt mt-[5px] p-1 transition-colors" title="Remove note">
                          <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M5.5 1h5v1h-5V1zM3 3v1h10V3H3zm1 2v9h8V5H4zm2 1h1v7H6V6zm3 0h1v7H9V6z" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Company Unit for PDF */}
            <div className="bg-white border border-g200">
              <div className="p-[11px_16px] border-b border-g200 flex items-center justify-between">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600">Company Unit (for Quotation PDF)</span>
                {data.units.length === 0 && (
                  <button type="button" onClick={() => navigate('/settings')} className="text-[9px] font-bold text-red-mrt uppercase hover:underline">Configure in Settings →</button>
                )}
              </div>
              <div className="p-[12px_16px]">
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Company Unit</label>
                <select title="Select unit" value={unitId} onChange={e => setUnitId(e.target.value)} className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" disabled={data.units.length === 0}>
                  <option value="">{data.units.length === 0 ? '— No units configured —' : '— Select unit —'}</option>
                  {data.units.map(u => (
                    <option key={u.id} value={u.id}>{u.name}{u.is_default ? ' (default)' : ''}</option>
                  ))}
                </select>
                {unitId && (() => {
                  const u = data.units.find(x => x.id === unitId);
                  return u ? (
                    <div className="text-[10px] text-g400 mt-1.5 font-mono leading-relaxed">
                      {u.gstin && <span>GSTIN: <span className="text-g600 font-semibold">{u.gstin}</span></span>}
                      {u.header_url && <span className="ml-3 text-emerald-600">✓ Letterhead set</span>}
                    </div>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Signatory & T&C */}
            <div className="grid grid-cols-12 gap-[12px]">
              {/* T&C */}
              <div className="col-span-8 bg-white border border-g200">
                <div className="p-[11px_16px] border-b border-g200 flex items-center justify-between">
                  <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt">Terms & Conditions</span>
                  <button type="button" onClick={() => setTnc(p => ({ ...p, ...defaultTnc(), payment: pay, validity }))} className="text-[9px] font-bold text-g400 uppercase hover:text-red-mrt hover:underline">Reset</button>
                </div>
                <div className="p-[12px_16px]">
                  <table className="w-full border border-g200 text-[12px] border-collapse">
                    <thead>
                      <tr className="bg-g50">
                        <th className="w-7 border border-g200 px-2 py-1.5 font-mono text-[9px] text-g400 text-center">#</th>
                        <th className="w-[150px] border border-g200 px-2 py-1.5 font-bold text-g600 text-left text-[11px]">Condition</th>
                        <th className="border border-g200 px-2 py-1.5 font-bold text-g600 text-left text-[11px]">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([['leadTime','Lead Time'],['freight','Freight']] as [keyof TncState, string][]).map(([key, label], idx) => (
                        <tr key={key} className="border-b border-g200">
                          <td className="border border-g200 px-2 py-1 font-mono text-[9px] text-g400 text-center">{idx + 1}</td>
                          <td className="border border-g200 px-2 py-1 font-bold text-g600 whitespace-nowrap text-[11px]">{label}</td>
                          <td className="border border-g200 px-1 py-0.5">
                            <TncComboCell label={label} value={tnc[key]} suggestions={tncSuggestions[key]} onChange={v => setTncField(key, v)} />
                          </td>
                        </tr>
                      ))}
                      <tr className="border-b border-g200">
                        <td className="border border-g200 px-2 py-1 font-mono text-[9px] text-g400 text-center">3</td>
                        <td className="border border-g200 px-2 py-1 font-bold text-g600 whitespace-nowrap text-[11px]">Payment</td>
                        <td className="border border-g200 px-2 py-[5px] text-[12px] text-g500 bg-g50">{tnc.payment}</td>
                      </tr>
                      <tr className="border-b border-g200">
                        <td className="border border-g200 px-2 py-1 font-mono text-[9px] text-g400 text-center">4</td>
                        <td className="border border-g200 px-2 py-1 font-bold text-g600 whitespace-nowrap text-[11px]">Validity</td>
                        <td className="border border-g200 px-2 py-[5px] text-[12px] text-g500 bg-g50">{tnc.validity}</td>
                      </tr>
                      <tr>
                        <td className="border border-g200 px-2 py-1 font-mono text-[9px] text-g400 text-center">5</td>
                        <td className="border border-g200 px-2 py-1 font-bold text-g600 whitespace-nowrap text-[11px]">Taxes</td>
                        <td className="border border-g200 px-2 py-[5px] bg-g50">
                          <input type="text" value={tnc.taxes} onChange={e => setTncField('taxes', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-g500" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Signatory */}
              <div className="col-span-4 bg-white border border-g200">
                <div className="p-[11px_16px] border-b border-g200"><span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600">Authorized Signatory</span></div>
                <div className="p-[12px_16px] flex flex-col gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Select from List</label>
                    <select value={selectedSigId}
                      onChange={e => { const sid = e.target.value; setSelectedSigId(sid); const sig = data.signatories.find(s => s.id === sid); if (sig) { setAuthName(sig.name); setAuthDesignation(sig.designation); setAuthPhone(sig.phone); } }}
                      className={selectCls}>
                      <option value="">-- Select or Type Below --</option>
                      {data.signatories.map(s => <option key={s.id} value={s.id}>{s.name} ({s.designation})</option>)}
                    </select>
                  </div>
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px]">Details</label>
                    <button type="button" onClick={async () => {
                      if (!authName.trim()) { setSigMsg({ type: 'error', text: 'Enter a name first' }); setTimeout(() => setSigMsg(null), 3000); return; }
                      try { const ns: AuthorizedSignatory = { id: 'sig-' + Date.now(), name: authName.trim(), designation: authDesignation.trim(), phone: authPhone.trim(), is_default: false }; await addSignatory(ns); setSelectedSigId(ns.id); setSigMsg({ type: 'success', text: 'Saved' }); setTimeout(() => setSigMsg(null), 3000); }
                      catch { setSigMsg({ type: 'error', text: 'Could not save' }); }
                    }} className="text-[9px] font-bold text-red-mrt uppercase hover:underline">Save to List</button>
                  </div>
                  {sigMsg && <div className={`text-[10px] font-semibold ${sigMsg.type === 'success' ? 'text-green-600' : 'text-red-mrt'}`}>{sigMsg.text}</div>}
                  <div className="flex flex-col gap-2">
                    <input type="text" value={authName} onChange={e => { setAuthName(e.target.value); setSelectedSigId(''); }} placeholder="Name"
                      className="w-full font-sans text-[13px] text-blk border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
                    <input type="text" value={authDesignation} onChange={e => { setAuthDesignation(e.target.value); setSelectedSigId(''); }} placeholder="Designation"
                      className="w-full font-sans text-[13px] text-blk border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
                    <input type="text" value={authPhone} onChange={e => { setAuthPhone(e.target.value); setSelectedSigId(''); }} placeholder="Phone"
                      className="w-full font-sans text-[13px] text-blk border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ STEP 2: Preview ══ */}
        {step === 2 && (
          <div className="space-y-[12px]">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-[12px]">
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200 mb-3">Quote Info</div>
                <div className="space-y-1.5 text-[12px]">
                  <div className="flex justify-between"><span className="text-g500">Reference</span><span className="font-mono font-bold text-blk">{quoteId}</span></div>
                  <div className="flex justify-between"><span className="text-g500">Date</span><span>{date}</span></div>
                  <div className="flex justify-between"><span className="text-g500">Valid Until</span><span className="text-red-mrt font-medium">{fmtDate(validity)}</span></div>
                  {editId && <div className="flex justify-between"><span className="text-g500">Status</span><span className="font-bold uppercase text-[10px] px-2 py-0.5 bg-g100 rounded">{quoteStatus}</span></div>}
                </div>
              </div>
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200 mb-3">Customer</div>
                <div className="text-[12px] space-y-1">
                  <div className="font-bold text-[14px] text-blk">{custName || '—'}</div>
                  {contact && <div className="text-g500">{contact}</div>}
                  {email && <div className="text-g400 text-[11px] break-all">{email}</div>}
                </div>
              </div>
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200 mb-3">Trading Terms</div>
                <div className="text-[12px] space-y-1.5">
                  <div className="flex justify-between"><span className="text-g500">Incoterms</span><span className="font-medium">{inco === 'OVERRIDE' ? customInco : inco}</span></div>
                  <div className="flex justify-between"><span className="text-g500">Payment</span><span>{pay}</span></div>
                  <div className="flex justify-between"><span className="text-g500">Currency</span><span className="font-bold">{curr}</span></div>
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-white border border-g200 rounded-[3px]">
              <div className="p-[11px_16px] border-b border-g200 flex justify-between items-center">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600">{items.length} Line Item{items.length !== 1 ? 's' : ''}</span>
                <span className="font-mono text-[12px] font-bold text-red-mrt">{fmtAmt(grandTotal)}</span>
              </div>
              <table className="w-full text-[12px]">
                <tbody>
                  {items.map(item => (
                    <tr key={item.seq} className="border-b border-g200 last:border-0">
                      <td className="px-4 py-2 font-mono text-g400 text-[10px] w-8">{item.seq}</td>
                      <td className="px-4 py-2 text-blk">
                        {item.desc || <span className="text-g300 italic">No description</span>}
                        {(item.packing || item.packingType) && (
                          <span className="block text-[10px] text-g400 mt-0.5">{[item.packing, item.packingType].filter(Boolean).join(' · ')}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-g500 text-right w-16">{item.qty}</td>
                      <td className="px-4 py-2 font-mono text-right w-36">
                        {item.rateOverride
                          ? <span className="text-red-mrt font-bold">{item.rateText?.trim() || 'Regret'}</span>
                          : <span>
                              {fmtAmt(item.unitPrice)}
                              {item.priceBasis && item.priceBasis !== item.uom && (
                                <span className="block text-[9px] text-g400 font-normal">
                                  per {item.priceBasis}{item.priceBasisConv ? ` · 1 ${item.uom}=${item.priceBasisConv} ${item.priceBasis}` : ''}
                                </span>
                              )}
                            </span>
                        }
                      </td>
                      <td className="px-4 py-2 font-mono font-bold text-right w-28 text-blk">{item.rateOverride ? '—' : fmtAmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end p-4">
                <div className="w-[240px] text-[12px] space-y-1.5">
                  <div className="flex justify-between text-g500"><span>Sub-Total</span><span className="font-mono">{fmtAmt(subTotal)}</span></div>
                  {curr === 'INR' && ins > 0 && <div className="flex justify-between text-g500"><span>Insurance</span><span className="font-mono">{fmtAmt(ins)}</span></div>}
                  {curr === 'INR' && <div className="flex justify-between text-g500"><span>GST</span><span className="font-mono">{fmtAmt(gstTotal)}</span></div>}
                  <div className="flex justify-between font-bold text-blk border-t border-g200 pt-2 text-[14px]"><span>Grand Total</span><span className="font-mono text-red-mrt">{fmtAmt(grandTotal)}</span></div>
                </div>
              </div>
            </div>

            {/* Signatory & T&C */}
            <div className="grid grid-cols-2 gap-[12px]">
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g500 pb-2 border-b border-g200 mb-3">Authorized Signatory</div>
                {authName ? (
                  <div className="text-[12px] space-y-1"><div className="font-bold text-[14px] text-blk">{authName}</div><div className="text-g500">{authDesignation}</div>{authPhone && <div className="text-g400">{authPhone}</div>}</div>
                ) : <div className="text-[11px] text-g400 italic">No signatory set</div>}
              </div>
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g500 pb-2 border-b border-g200 mb-3">Terms & Conditions</div>
                <table className="w-full text-[11px] border-collapse">
                  <tbody>
                    {([['Lead Time',tnc.leadTime],['Freight',tnc.freight],['Payment',tnc.payment],['Validity',tnc.validity],['Taxes',tnc.taxes]] as [string,string][]).map(([label, val], i) => (
                      <tr key={label} className="border-b border-g200 last:border-0">
                        <td className="pr-1.5 py-1 font-mono text-[9px] text-g400 w-4 align-top">{i + 1}</td>
                        <td className="pr-3 py-1 font-bold text-g600 whitespace-nowrap align-top">{label}</td>
                        <td className="py-1 text-g500">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="flex items-center justify-between p-[12px_20px] bg-white border-t border-g200 sticky bottom-0 z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
        <div>
          {step > 1 && (
            <button type="button" onClick={() => setStep(1)} className="bg-white border border-g300 text-g600 font-mono text-[10px] font-bold tracking-widest uppercase px-[16px] py-[9px] rounded-[3px] hover:bg-g50 flex items-center gap-2">
              ← Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-[10px]">
          {step === 1 ? (
            <button type="button" onClick={goPreview} className="bg-red-mrt text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-red-h hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2">
              Preview →
            </button>
          ) : (
            <>
              <button type="button" onClick={() => handleSave()} disabled={isSaving}
                className="bg-red-mrt text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-red-h disabled:opacity-50 flex items-center gap-2">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={handleGeneratePDF} disabled={isSaving}
                className="bg-g700 text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-blk disabled:opacity-50 flex items-center gap-2">
                <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M4 2v12h8V6l-4-4H4zm1 1h2v3h2V3h1.172L11 3.828V13H5V3zm2 6v3h2v-3H7z" /></svg>
                {isSaving ? 'Working...' : 'PDF'}
              </button>
              <button type="button" onClick={handleGenerateDOCX} disabled={isSaving}
                className="bg-blue-600 text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M4 2v12h8V6l-4-4H4zm1 1h2v3h2V3h1.172L11 3.828V13H5V3zm2 6v3h2v-3H7z" /></svg>
                {isSaving ? 'Working...' : 'DOCX'}
              </button>
              <button type="button" onClick={() => setShowEmailModal(true)} disabled={isSaving}
                className="bg-blk text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-g700 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 flex items-center gap-2">
                <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M2 4h12v8H2zM3 5l5 3.5L13 5v-.5L8 8 3 4.5V5z" /></svg>
                Email to Client
              </button>
              <div className="h-5 w-px bg-g200" />
              <button type="button" onClick={() => { if (confirmLeave()) navigate('/quotes'); }} disabled={isSaving} className="bg-white border border-g300 text-g600 font-mono text-[10px] font-bold tracking-widest uppercase px-[16px] py-[9px] rounded-[3px] hover:bg-g50 disabled:opacity-50">
                Cancel
              </button>
            </>
          )}
          {errors.global && <span className="text-red-mrt text-[11px] font-bold">{errors.global}</span>}
        </div>
      </div>

      {/* Email modal */}
      {showEmailModal && (
        <SendEmailModal
          mode="quote"
          doc={buildQuoteData()}
          customer={customer}
          siteId={siteId || undefined}
          settings={data.settings}
          defaultSignatory={data.signatories.find((s: any) => s.is_default)}
          onClose={() => setShowEmailModal(false)}
          onSent={async () => {
            setShowEmailModal(false);
            // Emailing via the integrated module counts as "Sent" — flip Draft → Sent
            // (don't downgrade Won/Lost/Parked). Pass it explicitly so the save
            // doesn't race the state update.
            const sentStatus: QuoteStatus = quoteStatus === 'Draft' ? 'Sent' : quoteStatus;
            if (quoteStatus === 'Draft') setQuoteStatus('Sent');
            await handleSave(sentStatus);
          }}
        />
      )}

      {/* Contact sync — Case 3 toast (all slots full) */}
      {contactSyncMsg && (
        <div className="fixed bottom-5 right-5 z-50 max-w-[360px] bg-amber-50 border border-amber-300 rounded-[4px] shadow-lg p-[12px_14px] flex items-start gap-2.5 animate-in slide-in-from-bottom-2 duration-300">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"><path d="M10 2L2 17h16L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <p className="text-[11.5px] text-amber-800 leading-relaxed flex-1">{contactSyncMsg}</p>
          <button type="button" onClick={() => setContactSyncMsg(null)} className="shrink-0 text-amber-400 hover:text-amber-700 ml-1 font-bold text-[16px] leading-none">×</button>
        </div>
      )}
    </div>
  );
}