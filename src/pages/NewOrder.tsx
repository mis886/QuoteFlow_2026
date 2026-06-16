import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { generateId, formatINR, parseQuoteTerms, localDateStr, resolveAdjustments, maxItemGstRate } from '../lib/utils';
import { OrderItem, Order, AuthorizedSignatory, OrderStatus, OrderAdjustment, OrderAdjustmentKind } from '../lib/types';
import { Button } from '../components/ui';
import { CustomerSearch } from '../components/CustomerSearch';
import { generatePIPDF } from '../lib/pdfGenerator';
import { downloadPIDOCX } from '../lib/quoteDocx';
import { uploadToS3 } from '../lib/s3';
import { Upload } from 'lucide-react';
import { SendEmailModal } from '../components/SendEmailModal';

const STEPS = ['Form', 'Preview'];

// Pre-defined optional T&C clauses the doer can toggle per customer requirement.
// Selected clauses are appended to the Terms & Conditions textarea as separate lines.
const OPTIONAL_TNC_CLAUSES = [
  'Inspection: Customer inspection welcome at our works before dispatch.',
  'Warranty: 6 months from date of dispatch against manufacturing defects.',
  'Packing: Standard export packing included.',
  'Cancellation: Once accepted, the order cannot be cancelled.',
  'Force Majeure: Delivery subject to force majeure conditions.',
  'Jurisdiction: All disputes subject to Meerut jurisdiction only.',
  'Advance: 50% advance with PO, balance before dispatch.',
  'LD Clause: No LD clause applicable.',
  'Quality: As per approved sample / drawing only.',
  'Returns: No returns accepted on customized items.',
];

const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";

export function NewOrder() {
  const [searchParams, setSearchParams] = useSearchParams();
  const quoteRef = searchParams.get('quoteRef');
  const editOrderId = searchParams.get('orderId');
  const navigate = useNavigate();
  const { data, addOrder, updateOrder, updateQuote, addCustomer, addSignatory, closeFollowUp, stampName } = useAppStore();

  // Linked quote / enquiry references. Seeded from the URL when converting a
  // quote, and re-hydrated from the saved order when editing — so editing never
  // wipes the original references. Always written through on save.
  const [linkedQuoteRef, setLinkedQuoteRef] = useState<string>(quoteRef || '');
  const [linkedEnqRef, setLinkedEnqRef] = useState<string>('');

  const descSuggestions = useMemo(() =>
    [...new Set([
      ...data.enquiries.flatMap(e => e.items.map(i => i.desc)),
      ...data.orders.flatMap(o => o.items.map(i => i.desc)),
    ].filter(Boolean))].sort(), [data.enquiries, data.orders]);
  const matSuggestions = useMemo(() =>
    [...new Set([
      ...data.enquiries.flatMap(e => e.items.map(i => i.mat)),
      ...data.orders.flatMap(o => o.items.map(i => i.mat)),
    ].filter(Boolean))].sort(), [data.enquiries, data.orders]);

  const [step, setStep] = useState(1);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [dupOrderAlert, setDupOrderAlert] = useState<{ existingId: string } | null>(null);

  const [poNo, setPoNo] = useState('');
  const [poFile, setPoFile] = useState<File | null>(null);
  const [existingPoFileName, setExistingPoFileName] = useState<string | null>(null);
  const [poDate, setPoDate] = useState(localDateStr(new Date()));
  const [dlvDate, setDlvDate] = useState(localDateStr(new Date(Date.now() + 30 * 86400000)));
  const [dlvTerms, setDlvTerms] = useState('EXW - Ex Works');
  const [customDlvTerms, setCustomDlvTerms] = useState('');
  const [dlvPriority, setDlvPriority] = useState('Standard');
  const [shipAddr, setShipAddr] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [custEnquiryDocNo, setCustEnquiryDocNo] = useState('');
  const [contactManual, setContactManual] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  const [custName, setCustName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [contactId, setContactId] = useState('');
  const [authName, setAuthName] = useState('');
  const [authDesignation, setAuthDesignation] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [selectedSigId, setSelectedSigId] = useState('');
  const [customTerms, setCustomTerms] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('Processing');
  const [sigMsg, setSigMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [adjustments, setAdjustments] = useState<OrderAdjustment[]>([]);
  const [orderId, setOrderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [unitId, setUnitId] = useState<string>('');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [priceBasis, setPriceBasis] = useState<string>('');
  const [eximCode, setEximCode] = useState<string>('');
  const [customPoint, setCustomPoint] = useState<string>('');
  const [pan, setPan] = useState<string>('');
  const [defaultHsn, setDefaultHsn] = useState<string>('');
  const [showExim, setShowExim] = useState(false);

  // Auto-load default signatory
  useEffect(() => {
    if (editOrderId || quoteRef || authName) return;
    const def = data.signatories.find((s: any) => s.is_default);
    if (def) { setAuthName(def.name); setAuthDesignation(def.designation); setAuthPhone(def.phone); setSelectedSigId(def.id); }
  }, [data.signatories, editOrderId, quoteRef]);

  // Auto-load default unit (when not editing an existing order that already has one)
  useEffect(() => {
    if (unitId || editOrderId) return;
    const def = data.units.find(u => u.is_default) ?? data.units[0];
    if (def) setUnitId(def.id);
  }, [data.units, unitId, editOrderId]);

  // When unit changes, pick that unit's default bank account
  useEffect(() => {
    if (!unitId) { setBankAccountId(''); return; }
    if (bankAccountId && data.bankAccounts.find(b => b.id === bankAccountId)?.unit_id === unitId) return;
    const banks = data.bankAccounts.filter(b => b.unit_id === unitId);
    const def = banks.find(b => b.is_default) ?? banks[0];
    setBankAccountId(def?.id ?? '');
  }, [unitId, data.bankAccounts]);

  // Load / init — hydrate the form ONCE per order/quote. Without this guard a
  // background data refresh (e.g. Supabase token refresh on tab focus changes
  // data.orders' reference) would re-run this effect and silently overwrite the
  // user's unsaved edits — exactly the "switch tab → rates revert" bug.
  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    const key = editOrderId ? `edit:${editOrderId}` : quoteRef ? `quote:${quoteRef}` : 'new';
    if (hydratedKey.current === key) return;   // already initialised this target

    if (editOrderId) {
      const o = data.orders.find(ord => ord.id === editOrderId);
      if (o) {
        hydratedKey.current = key;             // mark hydrated only once data is present
        if (o.quoteRef) setLinkedQuoteRef(o.quoteRef);
        if (o.enqRef) setLinkedEnqRef(o.enqRef);
        else if (o.quoteRef) { const q = data.quotes.find(x => x.id === o.quoteRef); if (q?.enqRef) setLinkedEnqRef(q.enqRef); }
        setOrderId(o.id); setPoNo(o.poNo); setPoDate(o.poDate); setDlvDate(o.dlvDate);
        setCustName(o.cust); setAuthName(o.authorizedPerson?.name || '');
        setAuthDesignation(o.authorizedPerson?.designation || ''); setAuthPhone(o.authorizedPerson?.phone || '');
        setOrderStatus(o.status as OrderStatus); setCustomTerms(parseQuoteTerms(o.terms)); setItems(o.items);
        if (Array.isArray(o.adjustments)) setAdjustments(o.adjustments);
        if (o.unitId) setUnitId(o.unitId);
        if (o.bankAccountId) setBankAccountId(o.bankAccountId);
        if (o.priceBasis) setPriceBasis(o.priceBasis);
        if (o.eximCode) setEximCode(o.eximCode);
        if (o.customPoint) setCustomPoint(o.customPoint);
        if (o.pan) setPan(o.pan);
        if (o.hsn) setDefaultHsn(o.hsn);
        if (o.priceBasis || o.eximCode || o.customPoint || o.pan || o.hsn) setShowExim(true);
        if (o.poFileName) setExistingPoFileName(o.poFileName);
        if (o.shipToAddress) setShipAddr(o.shipToAddress);
        if (o.siteId) setSiteId(o.siteId);
        if (o.contactId) setContactId(o.contactId);
        if (o.contact) setContact(o.contact);
        if (o.email) setEmail(o.email);
        if (o.phone) setPhone(o.phone);
        if (o.custEnquiryDocNo) setCustEnquiryDocNo(o.custEnquiryDocNo);
        setContactManual(!o.contactId && !!(o.contact || o.email));
        const matched = data.signatories.find((s: AuthorizedSignatory) => s.name === o.authorizedPerson?.name);
        if (matched) setSelectedSigId(matched.id);
      }
    } else if (quoteRef) {
      // Duplicate guard: warn if this quote was already converted to an order
      const existing = data.orders.find(o => o.quoteRef === quoteRef);
      if (existing) { setDupOrderAlert({ existingId: existing.id }); return; }
      const q = data.quotes.find(e => e.id === quoteRef);
      if (q) {
        hydratedKey.current = key;             // hydrate from quote only once
        setLinkedQuoteRef(q.id);
        if (q.enqRef) setLinkedEnqRef(q.enqRef);
        setOrderId(generateId('ORD', data.orders.map(o => o.id)));
        setCustName(q.cust); setAuthName(q.authorizedPerson?.name || '');
        if (q.siteId) setSiteId(q.siteId);
        if (q.contactId) setContactId(q.contactId);
        if (q.contact) setContact(q.contact);
        if (q.email) setEmail(q.email);
        if (q.phone) setPhone(q.phone);
        // Carry the customer's enquiry doc number forward (editable).
        if (q.custEnquiryDocNo) setCustEnquiryDocNo(q.custEnquiryDocNo);
        // Preserve manual contact if quote had no contactId
        setContactManual(!q.contactId && !!(q.contact || q.email));
        setAuthDesignation(q.authorizedPerson?.designation || ''); setAuthPhone(q.authorizedPerson?.phone || '');
        setCustomTerms(parseQuoteTerms(q.terms));
        setItems(q.items.map(i => ({ ...i, agreedRate: i.unitPrice, remarks: '' })));
      }
    } else {
      hydratedKey.current = key;
      setOrderId(generateId('ORD', data.orders.map(o => o.id)));
      setItems([{ seq: 1, desc: '', mat: '', qty: 1, uom: 'pcs', agreedRate: 0, gst: 18, total: 0, remarks: '' }]);
    }
  }, [quoteRef, editOrderId, data.orders, data.quotes]);

  // Cascading customer → site → contact auto-fill
  useEffect(() => {
    if (!custName) return;
    const customer = data.customers.find(c => c.name === custName);
    if (!customer) return;
    if (!editOrderId) {
      setDlvTerms(customer.inco || 'EXW - Ex Works');
      if (!priceBasis) setPriceBasis(customer.inco || '');
    }
    const sites = customer.sites ?? [];
    if (siteId) {
      const site = sites.find((s: any) => s.id === siteId);
      if (site) {
        if (!editOrderId && !quoteRef) setShipAddr((site as any).dispatchAddress || site.address || (site as any).fullAddress || '');
        const contacts = site.contacts ?? [];
        if (contactId && !contactManual) {
          const ct = contacts.find((c: any) => c.id === contactId);
          if (ct) { setContact(ct.name); setEmail(ct.email); setPhone(ct.phone || ''); }
        }
      }
    } else { if (sites.length === 1) setSiteId(sites[0].id); }
  }, [custName, siteId, contactId, contactManual, data.customers, editOrderId, quoteRef]);

  // T&C from delivery terms
  useEffect(() => {
    if (editOrderId) return;
    const sel = dlvTerms === 'OVERRIDE' ? customDlvTerms : dlvTerms;
    let t = '';
    if (sel.includes('EXW')) t = '1. Delivery: Ex-Works, Meerut.\n2. Packing & Forwarding: Extra @ 2%.\n3. Freight: To be paid by the buyer.\n4. Payment: As per agreement.\n5. Taxes: GST 18% extra as applicable.';
    else if (sel.includes('FOB')) t = '1. Delivery: FOB Port of Loading.\n2. Packing & Forwarding: Included.\n3. Freight: Payable by buyer from port.\n4. Payment: As per agreement.';
    else if (sel.includes('DDP') || sel.includes('DAP') || sel.includes('CIF')) t = `1. Delivery: ${sel} Destination.\n2. Insurance & Freight: Included.\n3. Taxes/Duties: As per quotation.\n4. Payment: As per agreement.`;
    if (t && !customTerms) setCustomTerms(t);
  }, [dlvTerms, customDlvTerms, editOrderId]);

  // ── Unsaved-changes guard ──
  // `dirty` flips true on the first edit after the form hydrates, and is cleared
  // on a successful save. While dirty, refreshing/closing the tab or leaving the
  // page prompts a confirmation so in-progress rate edits aren't lost.
  const [dirty, setDirty] = useState(false);
  const markDirty = () => { if (!dirty) setDirty(true); };

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Confirm before in-app navigation away (Back / Cancel) when there are edits.
  const confirmLeave = () =>
    !dirty || window.confirm('You have unsaved changes. Leave without saving?');

  // Item helpers
  const updateItem = (idx: number, field: keyof OrderItem, value: any) => {
    const ni = [...items]; (ni[idx] as any)[field] = value;
    if (field === 'qty' || field === 'agreedRate' || field === 'priceBasisConv') {
      const conv = Number(ni[idx].priceBasisConv) || 1;
      ni[idx].total = Number(ni[idx].qty) * conv * Number(ni[idx].agreedRate);
    }
    if (field === 'priceBasis' && !value) {
      ni[idx].priceBasisConv = undefined;
      ni[idx].total = Number(ni[idx].qty) * Number(ni[idx].agreedRate);
    }
    setItems(ni);
  };
  const addItem = () => setItems([...items, { seq: items.length + 1, desc: '', mat: '', qty: 1, uom: 'pcs', agreedRate: 0, gst: 18, total: 0, remarks: '' }]);
  const removeItem = (idx: number) => { if (items.length === 1) return; setItems(items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, seq: i + 1 }))); };

  const subTotal = items.reduce((s, i) => s + i.total, 0);
  const itemGst  = items.reduce((s, i) => s + i.total * i.gst / 100, 0);
  const maxGstRate = maxItemGstRate(items);
  // Taxable charges (P&F, Freight…) add to the base before GST; GST recomputed
  // on that combined value. Post-GST lines (TDS/TCS) apply after GST.
  const adj = resolveAdjustments(adjustments, subTotal, itemGst, maxGstRate);
  const adjLines = adj.lines;
  const gstTotal = adj.gstTotal;          // items GST + GST on taxable charges
  const grandTotal = adj.grand;

  // Adjustment row helpers
  const addAdjustment = (kind: OrderAdjustmentKind, label = '') => {
    const isTds = /tds/i.test(label);
    setAdjustments(a => [...a, {
      id: 'adj-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      kind, label, mode: 'percent', rate: 0,
      direction: kind === 'tax' && isTds ? 'deduct' : 'add',
      // Charges (P&F, Freight…) are part of the supply value → taxable before GST.
      // Taxes (TDS/TCS) apply after GST → not taxable.
      taxable: kind === 'charge',
    }]);
  };
  const updateAdjustment = (id: string, patch: Partial<OrderAdjustment>) =>
    setAdjustments(a => a.map(x => x.id === id ? { ...x, ...patch } : x));
  const removeAdjustment = (id: string) => setAdjustments(a => a.filter(x => x.id !== id));

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    // PO number: required, and at least 3 characters to catch stray/test input.
    const poTrimmed = poNo.trim();
    if (!poTrimmed) e.poNo = 'PO Number is required';
    else if (poTrimmed.length < 3) e.poNo = 'PO Number looks too short — enter the customer PO reference';
    if (!custName) e.custName = 'Customer is required';
    if (items.some(i => !i.desc || Number(i.qty) <= 0)) e.items = 'All items need a description and quantity > 0';
    // Quote ref is compulsory when this order was converted from a quote.
    // Without it the attachment chain (ENQ → Quote → Order) is broken.
    if (quoteRef && !linkedQuoteRef) e.quoteRef = 'Quote reference is missing — cannot save without it';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildOrderData = (): Order => {
    const effQuoteRef = linkedQuoteRef || quoteRef || '';
    const effEnqRef = linkedEnqRef || (effQuoteRef ? (data.quotes.find(q => q.id === effQuoteRef)?.enqRef || '') : '');
    return {
    id: orderId, quoteRef: effQuoteRef,
    enqRef: effEnqRef,
    cust: custName, siteId: siteId || undefined,
    contactId: contactId || undefined,
    contact: contact || undefined,
    email: email || undefined,
    phone: phone || undefined,
    custEnquiryDocNo: custEnquiryDocNo.trim() || undefined,
    poNo: poNo.trim(), poDate, dlvDate,
    status: editOrderId ? orderStatus : 'Processing',
    value: grandTotal,
    inco: dlvTerms === 'OVERRIDE' ? customDlvTerms : dlvTerms,
    items, adjustments,
    poFileName: existingPoFileName || undefined,
    authorizedPerson: { name: authName, designation: authDesignation, phone: authPhone },
    terms: customTerms,
    unitId: unitId || undefined,
    bankAccountId: bankAccountId || undefined,
    priceBasis: priceBasis || undefined,
    eximCode: eximCode || undefined,
    customPoint: customPoint || undefined,
    pan: pan || undefined,
    hsn: defaultHsn || undefined,
    shipToAddress: shipAddr || undefined,
    // Preserve original doer on edit; stamp submitter email on new
    doer: editOrderId ? (data.orders.find(o => o.id === editOrderId)?.doer) : stampName(),
    };
  };

  // Persist the order (with PO upload if any). Returns the orderPayload used,
  // so callers like Generate-PI can pass the same object straight to the PDF.
  const persistOrder = async (): Promise<Order | null> => {
    if (!validateStep1()) { setStep(1); return null; }
    setErrors({});
    let finalPoFileName = poFile ? poFile.name : existingPoFileName || undefined;
    if (poFile) {
      try {
        const safeName = poFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const s3Path = await uploadToS3(poFile, `orders/${orderId}/${safeName}`);
        if (s3Path) finalPoFileName = s3Path;
      } catch { /* use local name */ }
    }
    const orderPayload: Order = { ...buildOrderData(), poFileName: finalPoFileName };
    if (editOrderId) {
      await updateOrder(editOrderId, orderPayload);
    } else {
      await addOrder(orderPayload);
      if (quoteRef) {
        await updateQuote(quoteRef, { status: 'Won' });
        // Converting to an order wins the quote → close its follow-up process.
        try { await closeFollowUp(quoteRef, 'Won'); } catch { /* no follow-up row — ignore */ }
      }
      if (!data.customers.find(c => c.name.toLowerCase() === custName.toLowerCase())) {
        await addCustomer({ id: generateId('CUST', data.customers.map(c => c.id)), code: generateId('CUS', data.customers.map(c => c.code)), name: custName, seg: 'General', gstin: '', inco: 'Ex-Works', curr: 'INR', pay: '30 days', sites: [] });
      }
    }
    return orderPayload;
  };

  // Save only: persist + navigate back to /orders. No PDF.
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = await persistOrder();
      if (payload) { setDirty(false); navigate('/orders'); }
    } catch (err) {
      setErrors({ global: `Failed to save: ${(err as any)?.message || 'Check connection'}` });
    } finally { setIsSaving(false); }
  };

  // Generate PI: persist (if needed) + download the PDF. Stays on the page
  // so the doer can review and re-tweak before final exit.
  const handleGeneratePI = async () => {
    setIsSaving(true);
    try {
      const payload = await persistOrder();
      if (!payload) return;
      setDirty(false);   // persisted — no longer unsaved
      const qt = quoteRef ? data.quotes.find(q => q.id === quoteRef) : undefined;
      const unit = unitId ? data.units.find(u => u.id === unitId) : data.units.find(u => u.is_default);
      const bank = bankAccountId ? data.bankAccounts.find(b => b.id === bankAccountId)
        : data.bankAccounts.find(b => b.unit_id === unit?.id && b.is_default);
      const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
      const sig = unitSig ?? data.signatories.find((s: any) => s.is_default);
      generatePIPDF(payload, qt, data.customers.find(c => c.name === custName), data.settings, sig, true, unit, bank);
    } catch (err) {
      setErrors({ global: `Failed to generate PI: ${(err as any)?.message || 'Check connection'}` });
    } finally { setIsSaving(false); }
  };

  const handleGeneratePIDOCX = async () => {
    setIsSaving(true);
    try {
      const payload = await persistOrder();
      if (!payload) return;
      setDirty(false);
      const qt = quoteRef ? data.quotes.find(q => q.id === quoteRef) : undefined;
      const unit = unitId ? data.units.find(u => u.id === unitId) : data.units.find(u => u.is_default);
      const bank = bankAccountId ? data.bankAccounts.find(b => b.id === bankAccountId)
        : data.bankAccounts.find(b => b.unit_id === unit?.id && b.is_default);
      const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
      const sig = unitSig ?? data.signatories.find((s: any) => s.is_default);
      await downloadPIDOCX(payload, qt, data.customers.find(c => c.name === custName), data.settings, sig, unit, bank);
    } catch (err) {
      setErrors({ global: `Failed to generate DOCX: ${(err as any)?.message || 'Check connection'}` });
    } finally { setIsSaving(false); }
  };

  const goPreview = () => { if (validateStep1()) setStep(2); };

  const Stepper = () => (
    <div className="flex items-center flex-1 px-6">
      {STEPS.map((label, i) => {
        const n = i + 1; const active = step === n; const done = step > n;
        return (
          <React.Fragment key={n}>
            <button type="button" onClick={() => done ? setStep(n) : undefined}
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
  const relatedQuote = quoteRef ? data.quotes.find(q => q.id === quoteRef) : undefined;

  if (dupOrderAlert) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-g50 animate-in fade-in duration-200">
        <div className="bg-white border border-amber-200 rounded-[8px] shadow-lg p-7 max-w-[420px] w-full mx-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-amber-500"><path d="M10 2L2 17h16L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div className="font-bold text-[14px] text-blk mb-1">Quote Already Converted</div>
              <div className="text-[12.5px] text-g600 leading-relaxed">
                <span className="font-mono font-bold text-sQ">{quoteRef}</span> has already been converted to order{' '}
                <span className="font-mono font-bold text-sW">{dupOrderAlert.existingId}</span>.
              </div>
              <div className="text-[12px] text-g500 mt-2">Would you like to edit the existing order, or create a new one anyway?</div>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <Button variant="primary" onClick={() => {
              // Clear the alert and switch this page to edit the existing order.
              // The hydrate effect keys on editOrderId and re-runs to load it.
              const id = dupOrderAlert.existingId;
              setDupOrderAlert(null);
              setSearchParams({ orderId: id });
            }} className="flex-1">
              Edit {dupOrderAlert.existingId}
            </Button>
            <Button variant="secondary" onClick={() => {
              setDupOrderAlert(null);
              const q = data.quotes.find(e => e.id === quoteRef);
              if (q) {
                hydratedKey.current = `quote:${quoteRef}`;
                setLinkedQuoteRef(q.id);
                if (q.enqRef) setLinkedEnqRef(q.enqRef);
                setOrderId(generateId('ORD', data.orders.map(o => o.id)));
                setCustName(q.cust); setAuthName(q.authorizedPerson?.name || '');
                if ((q as any).siteId) setSiteId((q as any).siteId);
                if ((q as any).contactId) setContactId((q as any).contactId);
                if ((q as any).contact) setContact((q as any).contact);
                if ((q as any).email) setEmail((q as any).email);
                setContactManual(!(q as any).contactId && !!((q as any).contact || (q as any).email));
                setAuthDesignation(q.authorizedPerson?.designation || ''); setAuthPhone(q.authorizedPerson?.phone || '');
                setCustomTerms(parseQuoteTerms(q.terms));
                setItems(q.items.map(i => ({ ...i, agreedRate: i.unitPrice, remarks: '' })));
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
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-0.5">Module 03</div>
            <h1 className="font-serif text-[22px] text-blk tracking-tight leading-tight">
              {editOrderId ? 'Edit' : 'Create'} <em className="italic text-red-mrt">Order</em>
            </h1>
          </div>
          <Stepper />
          <div className="flex items-center gap-3 shrink-0">
            {editOrderId && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-g500 uppercase tracking-wide">Status</label>
                <select title="Order status" value={orderStatus}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setOrderStatus(e.target.value as OrderStatus)}
                  className="font-mono text-[11px] font-bold border border-g300 rounded-[3px] p-[5px_10px] outline-none focus:border-red-mrt bg-white cursor-pointer">
                  <option value="Processing">Processing</option>
                  <option value="Delivered">Delivered</option>
                </select>
              </div>
            )}
            <Button variant="secondary" onClick={() => { if (confirmLeave()) navigate('/orders'); }}>Back</Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-6 pt-3 flex-1 overflow-y-auto" onInput={markDirty} onChange={markDirty}>

        {/* ══ STEP 1: Form ══ */}
        {step === 1 && (
          <div className="flex flex-col gap-[12px]">

            {quoteRef && !editOrderId && (
              <div className="bg-sW/5 border border-sW/20 rounded-[3px] p-[9px_14px] flex items-center gap-[10px] text-[12px]">
                <span className="text-sW text-[14px]">✓</span>
                <div><strong className="text-sW">Converted from {quoteRef} ({custName})</strong> — Line items loaded.</div>
              </div>
            )}

            {/* Order ID + PO dates row */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="bg-blk p-[9px_16px] rounded-[3px] shrink-0">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-white/40 mb-0.5">Order No.</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-bold text-white">{orderId}</span>
                  {(linkedQuoteRef || quoteRef) && (
                    <span className="font-mono text-[9px] text-white/40 border-l border-white/10 pl-2">{linkedQuoteRef || quoteRef}</span>
                  )}
                </div>
              </div>
              {/* Quote Ref — shown as required field when converting from a quote */}
              {quoteRef && (
                <div>
                  <label className="block text-[10px] font-bold tracking-[0.5px] uppercase mb-[3px] text-g500">
                    Quote Reference <span className="text-red-mrt">*</span>
                  </label>
                  <div className={`font-mono text-[13px] font-bold px-[10px] py-[7px] rounded-[3px] border ${errors.quoteRef ? 'border-red-mrt bg-red-lt text-red-mrt' : 'border-g200 bg-g50 text-blk'}`}>
                    {linkedQuoteRef || <span className="text-red-mrt">MISSING</span>}
                  </div>
                  {errors.quoteRef && <p className="text-red-mrt text-[10px] mt-1">{errors.quoteRef}</p>}
                </div>
              )}
              {/* ENQ Ref — read-only, traced from the quote */}
              {linkedEnqRef && (
                <div>
                  <label className="block text-[10px] font-bold tracking-[0.5px] uppercase mb-[3px] text-g500">ENQ Reference</label>
                  <div className="font-mono text-[13px] font-bold px-[10px] py-[7px] rounded-[3px] border border-g200 bg-g50 text-blk">
                    {linkedEnqRef}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[3px]">PO Number <span className="text-red-mrt">*</span></label>
                <input type="text" value={poNo} placeholder="Customer PO reference"
                  onChange={e => { setPoNo(e.target.value); setErrors({ ...errors, poNo: '' }); }}
                  className={`font-sans text-[13px] text-blk bg-white border ${errors.poNo ? 'border-red-mrt' : 'border-g300 focus:border-red-mrt'} rounded-[3px] p-[7px_10px] outline-none focus:ring-[3px] focus:ring-red-lt w-[180px]`} />
                {errors.poNo && <p className="text-red-mrt text-[10px] mt-1">{errors.poNo}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[3px]">PO Date</label>
                <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)}
                  className="font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-red-mrt uppercase tracking-[0.5px] mb-[3px]">Required Delivery By</label>
                <input type="date" value={dlvDate} onChange={e => setDlvDate(e.target.value)}
                  className="font-mono text-[13px] font-bold text-blk bg-white border-2 border-red-mrt/30 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[3px]">Priority</label>
                <select title="Priority" value={dlvPriority} onChange={e => setDlvPriority(e.target.value)} className={selectCls + ' w-[160px]'}>
                  <option>Standard</option><option>Priority</option><option>Critical - Expedite</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[3px]">PO Document</label>
                <div className="flex items-center gap-1.5">
                  <input type="file" id="po-upload" className="hidden" onChange={e => { if (e.target.files?.length) setPoFile(e.target.files[0]); }} accept=".pdf,.jpeg,.jpg,.png" />
                  <label htmlFor="po-upload" className="cursor-pointer font-sans text-[11px] font-medium text-blk bg-white border border-g300 rounded-[3px] p-[7px_10px] flex items-center gap-2 hover:bg-g50 transition-colors h-[36px] w-[140px]">
                    <Upload size={13} className="text-g500 shrink-0" />
                    {poFile ? <span className="truncate">{poFile.name}</span> : existingPoFileName ? <span className="truncate">{existingPoFileName}</span> : 'Upload PO'}
                  </label>
                  {(poFile || existingPoFileName) && <button type="button" title="Remove" onClick={() => { setPoFile(null); setExistingPoFileName(null); }} className="text-g400 hover:text-red-mrt text-[16px]">×</button>}
                </div>
              </div>
            </div>

            {/* Customer & Contact + Delivery Terms */}
            <div className="grid grid-cols-12 gap-[12px]">
              <div className="col-span-8 bg-white border border-g200">
                <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt p-[11px_16px] border-b border-g200">Customer & Contact</div>
                <div className="p-[12px_16px] grid grid-cols-2 gap-[10px]">
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Customer <span className="text-red-mrt">*</span></label>
                    <CustomerSearch
                      customers={data.customers}
                      value={custName}
                      onChange={name => { setCustName(name); setSiteId(''); setContactId(''); setContact(''); setEmail(''); setPhone(''); setContactManual(false); setErrors({ ...errors, custName: '' }); }}
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
                            onBlur={() => setTimeout(() => setContactOpen(false), 150)}
                            className={`w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt disabled:bg-g50 disabled:cursor-not-allowed`}
                          />
                          {contactOpen && siteContacts.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-g200 rounded-[4px] shadow-lg max-h-[160px] overflow-y-auto">
                              {filtered.length === 0 ? (
                                <div className="px-3 py-2 text-[11px] text-g400 italic">No match — name will be saved as typed</div>
                              ) : (
                                filtered.map((ct: any) => (
                                  <button key={ct.id} type="button" onMouseDown={() => { setContactId(ct.id); setContact(ct.name); setEmail(ct.email || ''); setPhone(ct.phone || ''); setContactManual(false); setContactOpen(false); }} className="w-full text-left px-3 py-2 text-[12px] hover:bg-g50 flex items-center justify-between gap-2">
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
                <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600 p-[11px_16px] border-b border-g200">Delivery</div>
                <div className="p-[12px_16px] flex flex-col gap-[10px]">
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Delivery Terms</label>
                    <select title="Delivery terms" value={dlvTerms} onChange={e => setDlvTerms(e.target.value)} className={selectCls}>
                      <option>EXW - Ex Works</option><option>FOB - Free On Board</option>
                      <option>CIF - Cost, Insurance & Freight</option><option>CIP - Carriage and Insurance Paid To</option>
                      <option>DAP - Delivered At Place</option><option>DDP - Delivered Duty Paid</option>
                      <option>FCA - Free Carrier</option><option>CPT - Carriage Paid To</option>
                      <option value="OVERRIDE">Override...</option>
                    </select>
                    {dlvTerms === 'OVERRIDE' && <input type="text" value={customDlvTerms} placeholder="Specify custom terms..." onChange={e => setCustomDlvTerms(e.target.value)} className="w-full mt-2 font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt" />}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Shipping Address</label>
                    <input type="text" value={shipAddr} onChange={e => setShipAddr(e.target.value)} placeholder="Delivery address"
                      className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Cust. Enquiry Doc No.</label>
                    <input type="text" value={custEnquiryDocNo} onChange={e => setCustEnquiryDocNo(e.target.value)} placeholder="Ref/2024/01..."
                      className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt" />
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white border border-g200">
              <div className="p-[11px_16px] border-b border-g200 flex items-center justify-between">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g500">Order Line Items</span>
                {errors.items && <span className="text-red-mrt text-[11px] font-medium">{errors.items}</span>}
              </div>
              <div className="p-[10px_12px]">
                <datalist id="ord-desc-list">{descSuggestions.map(s => <option key={s} value={s} />)}</datalist>
                <datalist id="ord-mat-list">{matSuggestions.map(s => <option key={s} value={s} />)}</datalist>
                <datalist id="ord-uom-list"><option value="pcs"/><option value="sets"/><option value="pairs"/><option value="nos"/><option value="lot"/><option value="kg"/><option value="grams"/><option value="tonnes"/><option value="litre"/><option value="ml"/><option value="metre"/><option value="mm"/><option value="ft"/><option value="sqm"/><option value="sqft"/><option value="rolls"/><option value="sheets"/><option value="boxes"/></datalist>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-g400 text-[12px]">
                    <thead className="bg-g100">
                      <tr>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-left border border-g400 w-8">#</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-red-mrt px-2 py-1.5 text-left border border-g400 min-w-[200px]">Description *</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-left border border-g400 w-[110px]">MOC</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-center border border-g400 w-[78px]" title="Leave blank to use default HSN">HSN</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-red-mrt px-2 py-1.5 text-center border border-g400 w-14">Qty *</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-center border border-g400 w-[72px]">UOM</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-center border border-g400 w-[88px]">Rate Per</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-red-mrt px-2 py-1.5 text-right border border-g400 w-32">Agreed Rate *</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-center border border-g400 w-20">GST %</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-right border border-g400 w-28">Total</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-left border border-g400 w-[110px]">Remarks</th>
                        <th className="w-8 border border-g400"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.seq} className="hover:bg-g50/50">
                          <td className="px-2 py-[5px] border border-g400 align-middle font-mono font-bold text-g400 text-[11px]">{item.seq}</td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <input type="text" list="ord-desc-list" value={item.desc}
                              onChange={e => { updateItem(idx, 'desc', e.target.value); setErrors({ ...errors, items: '' }); }}
                              className={`w-full bg-transparent outline-none text-[12px] font-sans placeholder:text-g300 ${errors.items && !item.desc ? 'text-red-mrt' : 'text-blk'}`} />
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <input type="text" list="ord-mat-list" value={item.mat} onChange={e => updateItem(idx, 'mat', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-blk placeholder:text-g300" />
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <input type="text" value={item.hsn || ''} onChange={e => updateItem(idx, 'hsn', e.target.value)} placeholder="default" className="w-full bg-transparent outline-none font-mono text-[11px] text-center text-blk placeholder:text-g300" />
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle text-center">
                            <input type="number" min="1" value={item.qty || ''} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); setErrors({ ...errors, items: '' }); }}
                              className={`w-full bg-transparent outline-none font-mono text-[12px] text-center placeholder:text-g300 ${errors.items && Number(item.qty) <= 0 ? 'text-red-mrt' : 'text-blk'}`} placeholder="0" />
                          </td>
                          {/* UOM */}
                          <td className="px-1 py-[3px] border border-g400 align-middle">
                            <input list="ord-uom-list" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} placeholder="uom" className="w-full bg-g50 border border-g300 rounded-[3px] px-1.5 py-[3px] font-mono text-[11px] text-blk outline-none focus:border-red-mrt focus:bg-white transition-colors" />
                          </td>
                          {/* Rate Per */}
                          <td className="px-1 py-[3px] border border-g400 align-top">
                            <input
                              list="ord-uom-list"
                              value={item.priceBasis || ''}
                              onChange={e => updateItem(idx, 'priceBasis', e.target.value)}
                              placeholder={item.uom || '—'}
                              title="Rate is per this unit (leave blank = same as UOM)"
                              className="w-full bg-g50 border border-g300 rounded-[3px] px-1.5 py-[3px] font-mono text-[11px] text-blk outline-none focus:border-red-mrt focus:bg-white transition-colors placeholder:text-g300"
                            />
                            {item.priceBasis && item.priceBasis !== item.uom && (
                              <div className="mt-1 flex items-center gap-0.5">
                                <span className="font-mono text-[9px] text-g400 shrink-0">1&nbsp;{item.uom}&nbsp;=</span>
                                <input
                                  type="number" step="any" min="0"
                                  value={item.priceBasisConv || ''}
                                  onChange={e => updateItem(idx, 'priceBasisConv', Number(e.target.value))}
                                  placeholder="×"
                                  title={`How many ${item.priceBasis} per 1 ${item.uom}`}
                                  className="w-10 bg-amber-50 border border-amber-300 rounded-[3px] px-1 py-[2px] font-mono text-[11px] text-blk outline-none focus:border-red-mrt transition-colors placeholder:text-g300 text-center"
                                />
                                <span className="font-mono text-[9px] text-g400 shrink-0">{item.priceBasis}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <input type="number" step="any" min="0" value={item.agreedRate || ''} onChange={e => updateItem(idx, 'agreedRate', Number(e.target.value))}
                              className="w-full bg-transparent outline-none font-mono text-[12px] text-right text-blk font-bold placeholder:text-g300" placeholder="0.00" />
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <select title="GST rate" value={item.gst} onChange={e => updateItem(idx, 'gst', Number(e.target.value))} className="w-full bg-transparent outline-none text-[12px] text-center font-mono text-blk appearance-none cursor-pointer">
                              <option value={18}>18%</option><option value={12}>12%</option><option value={5}>5%</option><option value={0}>0%</option>
                            </select>
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle text-right font-mono text-[12px] font-bold text-blk">{formatINR(item.total)}</td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <input type="text" value={item.remarks || ''} onChange={e => updateItem(idx, 'remarks', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-blk placeholder:text-g300" placeholder="Note..." />
                          </td>
                          <td className="px-1 py-[5px] border border-g400 align-middle">
                            <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="text-g400 hover:text-red-mrt p-1 transition-colors disabled:opacity-30" title="Remove">
                              <svg viewBox="0 0 16 16" width="13" height="13" className="fill-current"><path d="M5.5 1h5v1h-5V1zM3 3v1h10V3H3zm1 2v9h8V5H4zm2 1h1v7H6V6zm3 0h1v7H9V6z" /></svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="inline-flex items-center gap-[6px] p-[7px_9px] text-red-mrt cursor-pointer text-[12px] font-semibold border border-dashed border-red-mrt/25 rounded-[3px] transition-colors hover:bg-red-lt" onClick={addItem}>
                  <svg viewBox="0 0 16 16" className="w-[13px] h-[13px] stroke-red-mrt fill-none stroke-2"><path d="M8 3v10M3 8h10"/></svg>
                  Add Another Line Item
                </div>
                <div className="mt-3 flex justify-end">
                  <div className="w-[320px] bg-g50/50 border border-g200 rounded-[3px] p-[10px_14px] space-y-1.5 text-[12px]">
                    <div className="flex justify-between text-g500"><span>Sub-Total (excl. GST)</span><span className="font-mono font-bold text-blk">{formatINR(subTotal)}</span></div>
                    {/* Pre-GST charges (P&F, Freight…) — added to taxable value */}
                    {adjLines.filter(l => l.taxable).map(l => (
                      <div key={l.id} className="flex justify-between text-g500">
                        <span className="truncate pr-2">{l.label || '(unnamed)'}{l.mode === 'percent' ? ` (${l.rate}%)` : ''}{l.direction === 'deduct' ? ' −' : ''}</span>
                        <span className={`font-mono font-bold ${l.amount < 0 ? 'text-red-mrt' : 'text-blk'}`}>{l.amount < 0 ? '−' : ''}{formatINR(Math.abs(l.amount))}</span>
                      </div>
                    ))}
                    {adj.preNet !== 0 && (
                      <div className="flex justify-between text-g600 border-t border-g100 pt-1"><span>Taxable Value</span><span className="font-mono font-bold text-blk">{formatINR(adj.taxableValue)}</span></div>
                    )}
                    <div className="flex justify-between text-g500"><span>Total GST{maxGstRate ? ` (@ ${maxGstRate}%)` : ''}</span><span className="font-mono font-bold text-blk">{formatINR(gstTotal)}</span></div>
                    {/* Post-GST lines (TDS/TCS) */}
                    {adjLines.filter(l => !l.taxable).map(l => (
                      <div key={l.id} className="flex justify-between text-g500">
                        <span className="truncate pr-2">{l.label || '(unnamed)'}{l.mode === 'percent' ? ` (${l.rate}%)` : ''}{l.direction === 'deduct' ? ' −' : ''}</span>
                        <span className={`font-mono font-bold ${l.amount < 0 ? 'text-red-mrt' : 'text-blk'}`}>{l.amount < 0 ? '−' : ''}{formatINR(Math.abs(l.amount))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-bold text-blk border-t border-g200 pt-2 text-[13px]"><span>Order Value</span><span className="font-mono text-red-mrt text-[15px]">{formatINR(grandTotal)}</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Taxes & Charges (VAT/TDS/TCS, Freight, P&F, Other) */}
            <div className="bg-white border border-g200">
              <div className="p-[11px_16px] border-b border-g200 flex items-center justify-between flex-wrap gap-2">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g500">Taxes &amp; Charges (added to / deducted from total)</span>
                <div className="flex items-center gap-1.5">
                  {([['charge', 'Freight'], ['charge', 'Packing & Forwarding'], ['charge', 'Carriage'], ['tax', 'TDS'], ['tax', 'TCS'], ['tax', 'VAT'], ['other', '']] as [OrderAdjustmentKind, string][]).map(([k, label], i) => (
                    <button key={i} type="button" onClick={() => addAdjustment(k, label)}
                      className="text-[10px] font-semibold text-red-mrt border border-red-mrt/25 rounded-[3px] px-2 py-1 hover:bg-red-lt transition-colors">
                      + {label || 'Other'}
                    </button>
                  ))}
                </div>
              </div>
              {adjustments.length === 0 ? (
                <div className="p-[12px_16px] text-[11px] text-g400 italic">No extra taxes or charges. Use the buttons above to add Freight, P&amp;F, TDS, TCS, etc.</div>
              ) : (
                <div className="p-[10px_12px] space-y-2">
                  {adjustments.map(a => {
                    const resolved = adjLines.find(l => l.id === a.id);
                    return (
                      <div key={a.id} className="grid grid-cols-[100px_1fr_96px_92px_96px_110px_28px] gap-2 items-center">
                        <select title="Type" value={a.kind} onChange={e => updateAdjustment(a.id, { kind: e.target.value as OrderAdjustmentKind })}
                          className="font-mono text-[11px] border border-g300 rounded-[3px] px-2 py-[6px] outline-none focus:border-red-mrt bg-white">
                          <option value="charge">Charge</option>
                          <option value="tax">Tax</option>
                          <option value="other">Other</option>
                        </select>
                        <input type="text" value={a.label} placeholder="Label (e.g. Freight, TDS)"
                          onChange={e => updateAdjustment(a.id, { label: e.target.value })}
                          className="text-[12px] border border-g300 rounded-[3px] px-2 py-[6px] outline-none focus:border-red-mrt" />
                        <div className="flex">
                          <button type="button" onClick={() => updateAdjustment(a.id, { mode: 'percent' })}
                            className={`flex-1 text-[11px] font-semibold py-[6px] border rounded-l-[3px] ${a.mode === 'percent' ? 'bg-blk text-white border-blk' : 'bg-white text-g500 border-g300'}`}>%</button>
                          <button type="button" onClick={() => updateAdjustment(a.id, { mode: 'value' })}
                            className={`flex-1 text-[11px] font-semibold py-[6px] border -ml-px rounded-r-[3px] ${a.mode === 'value' ? 'bg-blk text-white border-blk' : 'bg-white text-g500 border-g300'}`}>₹</button>
                        </div>
                        <input type="number" step="any" min="0" value={a.rate || ''} placeholder={a.mode === 'percent' ? '%' : 'amount'}
                          onChange={e => updateAdjustment(a.id, { rate: Number(e.target.value) })}
                          className="font-mono text-[12px] text-right border border-g300 rounded-[3px] px-2 py-[6px] outline-none focus:border-red-mrt" />
                        <button type="button" title={a.taxable ? 'Added before GST (GST applies on it)' : 'Applied after GST'}
                          onClick={() => updateAdjustment(a.id, { taxable: !a.taxable })}
                          className={`text-[10px] font-semibold py-[6px] rounded-[3px] border ${a.taxable ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-white text-g500 border-g300'}`}>
                          {a.taxable ? 'Pre-GST' : 'Post-GST'}
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button type="button" title="Add or deduct" onClick={() => updateAdjustment(a.id, { direction: a.direction === 'add' ? 'deduct' : 'add' })}
                            className={`text-[11px] font-bold w-7 py-[6px] rounded-[3px] border ${a.direction === 'deduct' ? 'bg-red-lt text-red-mrt border-red-mrt/30' : 'bg-green-50 text-green-700 border-green-300'}`}>
                            {a.direction === 'deduct' ? '−' : '+'}
                          </button>
                          <span className={`font-mono text-[11px] font-bold ${resolved && resolved.amount < 0 ? 'text-red-mrt' : 'text-blk'}`}>
                            {resolved ? `${resolved.amount < 0 ? '−' : ''}${formatINR(Math.abs(resolved.amount))}` : '—'}
                          </span>
                        </div>
                        <button type="button" onClick={() => removeAdjustment(a.id)} title="Remove" className="text-g400 hover:text-red-mrt p-1">
                          <svg viewBox="0 0 16 16" width="13" height="13" className="fill-current"><path d="M5.5 1h5v1h-5V1zM3 3v1h10V3H3zm1 2v9h8V5H4zm2 1h1v7H6V6zm3 0h1v7H9V6z" /></svg>
                        </button>
                      </div>
                    );
                  })}
                  <div className="text-[10px] text-g400 pt-1">Percentages apply on the items sub-total (excl. GST). <strong className="text-amber-700">Pre-GST</strong> charges (e.g. P&amp;F, Freight) are added to the taxable value and GST is charged on the combined amount{maxGstRate ? ` (@ ${maxGstRate}%)` : ''}; <strong>Post-GST</strong> lines (e.g. TDS) apply after GST.</div>
                </div>
              )}
            </div>

            {/* Export / Tax Details for PI */}
            <div className="bg-white border border-g200">
              <button
                type="button"
                onClick={() => setShowExim(v => !v)}
                className="w-full flex items-center justify-between p-[11px_16px] hover:bg-g50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={showExim}
                    onChange={e => setShowExim(e.target.checked)}
                    onClick={e => e.stopPropagation()}
                    className="accent-red-mrt w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600">Export / Tax Details (for Proforma Invoice)</span>
                  {!showExim && (priceBasis || eximCode || customPoint || pan || defaultHsn) && (
                    <span className="text-[9px] text-amber-600 font-bold">● has data</span>
                  )}
                </div>
                <svg viewBox="0 0 16 16" width="14" height="14" className={`fill-g400 transition-transform duration-200 ${showExim ? 'rotate-180' : ''}`}>
                  <path d="M8 10.5L2 4.5h12z" />
                </svg>
              </button>
              {showExim && (
                <div className="p-[12px_16px] grid grid-cols-3 gap-3 border-t border-g200">
                  <div>
                    <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Price Basis (Incoterms)</label>
                    <input type="text" value={priceBasis} onChange={e => setPriceBasis(e.target.value)} placeholder="EXW - Ex Works"
                      className="w-full font-sans text-[13px] text-blk border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Exim Code</label>
                    <input type="text" value={eximCode} onChange={e => setEximCode(e.target.value.toUpperCase())} placeholder="IEC0123456789"
                      className="w-full font-mono text-[13px] text-blk border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt uppercase" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Custom Point</label>
                    <input type="text" value={customPoint} onChange={e => setCustomPoint(e.target.value)} placeholder="ICD Tughlakabad, New Delhi"
                      className="w-full font-sans text-[13px] text-blk border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Company PAN No.</label>
                    <input type="text" value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="ABMFM1195K"
                      className="w-full font-mono text-[13px] text-blk border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt uppercase" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Default HSN Code</label>
                    <input type="text" value={defaultHsn} onChange={e => setDefaultHsn(e.target.value)} placeholder="40169390"
                      className="w-full font-mono text-[13px] text-blk border border-g300 rounded-[3px] p-[7px_10px] outline-none focus:border-red-mrt" />
                    <div className="text-[9px] text-g400 mt-1">Used when an item row has no HSN. Override per-item in the items table.</div>
                  </div>
                </div>
              )}
            </div>

            {/* Company Unit & Bank Account for PI */}
            <div className="bg-white border border-g200">
              <div className="p-[11px_16px] border-b border-g200 flex items-center justify-between">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600">Company Unit & Bank Account (for Proforma Invoice)</span>
                {data.units.length === 0 && (
                  <button type="button" onClick={() => navigate('/settings')} className="text-[9px] font-bold text-red-mrt uppercase hover:underline">Configure in Settings →</button>
                )}
              </div>
              <div className="p-[12px_16px] grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Company Unit</label>
                  <select title="Select unit" value={unitId} onChange={e => setUnitId(e.target.value)} className={selectCls} disabled={data.units.length === 0}>
                    <option value="">{data.units.length === 0 ? '— No units configured —' : '— Select unit —'}</option>
                    {data.units.map(u => (
                      <option key={u.id} value={u.id}>{u.name}{u.is_default ? ' (default)' : ''}</option>
                    ))}
                  </select>
                  {unitId && (() => {
                    const u = data.units.find(x => x.id === unitId);
                    return u ? (
                      <div className="text-[10px] text-g400 mt-1.5 font-mono leading-relaxed">
                        {u.gstin && <div>GSTIN: <span className="text-g600 font-semibold">{u.gstin}</span></div>}
                        {u.address && <div className="truncate" title={u.address}>{u.address}</div>}
                      </div>
                    ) : null;
                  })()}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Bank Account</label>
                  <select title="Select bank account" value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} className={selectCls} disabled={!unitId}>
                    <option value="">{!unitId ? '— Select unit first —' : '— Select bank account —'}</option>
                    {data.bankAccounts.filter(b => b.unit_id === unitId).map(b => (
                      <option key={b.id} value={b.id}>{b.bank_name} · ****{b.account_no.slice(-4)}{b.is_default ? ' (default)' : ''}</option>
                    ))}
                  </select>
                  {bankAccountId && (() => {
                    const b = data.bankAccounts.find(x => x.id === bankAccountId);
                    return b ? (
                      <div className="text-[10px] text-g400 mt-1.5 font-mono leading-relaxed">
                        <div>A/c: <span className="text-g600 font-semibold">{b.account_no}</span> · IFSC: <span className="text-g600 font-semibold">{b.ifsc}</span></div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>

            {/* Signatory & T&C */}
            <div className="grid grid-cols-12 gap-[12px]">
              <div className="col-span-8 bg-white border border-g200">
                <div className="p-[11px_16px] border-b border-g200 flex items-center justify-between">
                  <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt">Terms & Conditions (Proforma)</span>
                  <button type="button" onClick={() => setCustomTerms('')} className="text-[9px] font-bold text-g400 uppercase hover:text-red-mrt hover:underline">Reset</button>
                </div>
                <div className="p-[12px_16px] space-y-3">
                  <textarea value={customTerms} onChange={e => setCustomTerms(e.target.value)}
                    placeholder="1. Delivery within 3-4 weeks&#10;2. Freight extra at actuals&#10;3. GST 18% extra"
                    className="w-full min-h-[140px] font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt resize-none" />

                  {/* Optional additional clauses */}
                  <div>
                    <div className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 mb-2">Additional Clauses (optional)</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {OPTIONAL_TNC_CLAUSES.map(clause => {
                        const checked = customTerms.includes(clause);
                        return (
                          <label key={clause} className="flex items-start gap-2 cursor-pointer text-[11.5px] text-g700 hover:bg-g50 px-1.5 py-1 rounded">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                if (checked) {
                                  // Remove the clause line (any prefix/numbering) then renumber the rest
                                  const lines = customTerms.split(/\r?\n/).filter(l => !l.includes(clause));
                                  setCustomTerms(parseQuoteTerms(lines.join('\n')));
                                } else {
                                  // Append clause and renumber
                                  const next = (customTerms.trim() ? customTerms.trim() + '\n' : '') + clause;
                                  setCustomTerms(parseQuoteTerms(next));
                                }
                              }}
                              className="mt-0.5 accent-red-mrt"
                            />
                            <span>{clause}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-4 bg-white border border-g200">
                <div className="p-[11px_16px] border-b border-g200"><span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600">Authorized Signatory</span></div>
                <div className="p-[12px_16px] flex flex-col gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Select from List</label>
                    <select title="Select signatory" value={selectedSigId}
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
            <div className="grid grid-cols-3 gap-[12px]">
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200 mb-3">Order Info</div>
                <div className="space-y-1.5 text-[12px]">
                  <div className="flex justify-between"><span className="text-g500">Order No.</span><span className="font-mono font-bold text-blk">{orderId}</span></div>
                  <div className="flex justify-between"><span className="text-g500">PO No.</span><span className="font-medium">{poNo}</span></div>
                  <div className="flex justify-between"><span className="text-g500">PO Date</span><span>{poDate}</span></div>
                  <div className="flex justify-between"><span className="text-g500">Delivery By</span><span className="text-red-mrt font-medium">{dlvDate}</span></div>
                  {editOrderId && <div className="flex justify-between"><span className="text-g500">Status</span><span className="font-bold uppercase text-[10px] px-2 py-0.5 bg-g100 rounded">{orderStatus}</span></div>}
                </div>
              </div>
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200 mb-3">Customer</div>
                <div className="text-[12px] space-y-1">
                  <div className="font-bold text-[14px] text-blk">{custName || '—'}</div>
                  {contact && <div className="text-g500">{contact}</div>}
                  {email && <div className="text-g400 text-[11px] break-all">{email}</div>}
                  {shipAddr && <div className="text-g400 text-[11px] mt-1 border-t border-g100 pt-1">{shipAddr}</div>}
                </div>
              </div>
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt pb-2 border-b border-g200 mb-3">Delivery</div>
                <div className="text-[12px] space-y-1.5">
                  <div className="flex justify-between"><span className="text-g500">Terms</span><span>{dlvTerms === 'OVERRIDE' ? customDlvTerms : dlvTerms}</span></div>
                  <div className="flex justify-between"><span className="text-g500">Priority</span><span>{dlvPriority}</span></div>
                  {(poFile || existingPoFileName) && <div className="flex justify-between"><span className="text-g500">PO Doc</span><span className="text-green-600 text-[11px]">✓ Attached</span></div>}
                </div>
              </div>
            </div>

            <div className="bg-white border border-g200 rounded-[3px]">
              <div className="p-[11px_16px] border-b border-g200 flex justify-between items-center">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600">{items.length} Line Item{items.length !== 1 ? 's' : ''}</span>
                <span className="font-mono text-[12px] font-bold text-red-mrt">{formatINR(grandTotal)}</span>
              </div>
              <table className="w-full text-[12px]">
                <tbody>
                  {items.map(item => (
                    <tr key={item.seq} className="border-b border-g200 last:border-0">
                      <td className="px-4 py-2 font-mono text-g400 text-[10px] w-8">{item.seq}</td>
                      <td className="px-4 py-2 text-blk">{item.desc || <span className="text-g300 italic">No description</span>}</td>
                      <td className="px-4 py-2 text-g500">{item.mat}</td>
                      <td className="px-4 py-2 text-g500 text-right w-24">{item.qty} {item.uom}</td>
                      <td className="px-4 py-2 font-mono text-right w-36">
                        {formatINR(item.agreedRate)}
                        {item.priceBasis && item.priceBasis !== item.uom && (
                          <span className="block text-[9px] text-g400 font-normal">
                            per {item.priceBasis}{item.priceBasisConv ? ` · 1 ${item.uom}=${item.priceBasisConv} ${item.priceBasis}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono font-bold text-right w-28 text-blk">{formatINR(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end p-4">
                <div className="w-[300px] text-[12px] space-y-1.5">
                  <div className="flex justify-between text-g500"><span>Sub-Total</span><span className="font-mono">{formatINR(subTotal)}</span></div>
                  {adjLines.filter(l => l.taxable).map(l => (
                    <div key={l.id} className="flex justify-between text-g500">
                      <span className="truncate pr-2">{l.label || '(unnamed)'}{l.mode === 'percent' ? ` (${l.rate}%)` : ''}</span>
                      <span className={`font-mono ${l.amount < 0 ? 'text-red-mrt' : ''}`}>{l.amount < 0 ? '−' : ''}{formatINR(Math.abs(l.amount))}</span>
                    </div>
                  ))}
                  {adj.preNet !== 0 && <div className="flex justify-between text-g600 border-t border-g100 pt-1"><span>Taxable Value</span><span className="font-mono">{formatINR(adj.taxableValue)}</span></div>}
                  <div className="flex justify-between text-g500"><span>GST</span><span className="font-mono">{formatINR(gstTotal)}</span></div>
                  {adjLines.filter(l => !l.taxable).map(l => (
                    <div key={l.id} className="flex justify-between text-g500">
                      <span className="truncate pr-2">{l.label || '(unnamed)'}{l.mode === 'percent' ? ` (${l.rate}%)` : ''}</span>
                      <span className={`font-mono ${l.amount < 0 ? 'text-red-mrt' : ''}`}>{l.amount < 0 ? '−' : ''}{formatINR(Math.abs(l.amount))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-blk border-t border-g200 pt-2 text-[14px]"><span>Order Value</span><span className="font-mono text-red-mrt">{formatINR(grandTotal)}</span></div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-[12px]">
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g500 pb-2 border-b border-g200 mb-3">Authorized Signatory</div>
                {authName ? (
                  <div className="text-[12px] space-y-1"><div className="font-bold text-[14px] text-blk">{authName}</div><div className="text-g500">{authDesignation}</div>{authPhone && <div className="text-g400">{authPhone}</div>}</div>
                ) : <div className="text-[11px] text-g400 italic">No signatory set</div>}
              </div>
              <div className="bg-white border border-g200 rounded-[3px] p-4">
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g500 pb-2 border-b border-g200 mb-3">Terms & Conditions</div>
                <div className="text-[11px] text-g500 whitespace-pre-wrap leading-relaxed line-clamp-6">{customTerms || <span className="italic">No terms set</span>}</div>
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
              <button type="button" onClick={handleSave} disabled={isSaving}
                className="bg-white border border-g300 text-blk font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-g50 hover:border-blk disabled:opacity-50 flex items-center gap-2">
                <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M4 2v12h8V6l-4-4H4zm1 1h2v3h2V3h1.172L11 3.828V13H5V3zm2 6v3h2v-3H7z" /></svg>
                {isSaving ? 'Saving...' : (editOrderId ? 'Save Amendments' : 'Save Order')}
              </button>
              <button type="button" onClick={handleGeneratePI} disabled={isSaving}
                className="bg-g700 text-white font-mono text-[11px] font-bold tracking-widest uppercase px-[20px] py-[10px] rounded-[3px] shadow-sm hover:bg-blk disabled:opacity-50 flex items-center gap-2">
                <svg viewBox="0 0 16 16" width="12" height="12" className="fill-current"><path d="M4 2v12h8V6l-4-4H4zm1 1h2v3h2V3h1.172L11 3.828V13H5V3zm2 6v3h2v-3H7z" /></svg>
                {isSaving ? 'Working...' : 'PDF'}
              </button>
              <button type="button" onClick={handleGeneratePIDOCX} disabled={isSaving}
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
              <button type="button" onClick={() => { if (confirmLeave()) navigate('/orders'); }} disabled={isSaving} className="bg-white border border-g300 text-g600 font-mono text-[10px] font-bold tracking-widest uppercase px-[16px] py-[9px] rounded-[3px] hover:bg-g50 disabled:opacity-50">
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
          mode="order"
          doc={buildOrderData()}
          relatedQuote={relatedQuote}
          customer={customer}
          siteId={siteId || undefined}
          settings={data.settings}
          defaultSignatory={data.signatories.find((s: any) => s.is_default)}
          onClose={() => setShowEmailModal(false)}
          onSent={async () => {
            setShowEmailModal(false);
            await handleSave();
          }}
        />
      )}
    </div>
  );
}