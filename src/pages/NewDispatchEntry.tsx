import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { formatINR, siteLabel, PAY_OPTIONS, canDeleteRecords, resolveAdjustments, maxItemGstRate, generateId, fmtDate } from '../lib/utils';
import { DispatchFulfillmentType, DispatchEntry, Order, OrderItem, CustomerTier } from '../lib/types';
import { ProductSearch } from '../components/ProductSearch';
import { OptionSearch } from '../components/OptionSearch';
import { usePackingTypes } from '../hooks/usePackingTypes';
import { useProductCatalog } from '../hooks/useProductCatalog';
import { Upload, ExternalLink, Loader2, Search, X, Mail } from 'lucide-react';
import { supabase, uploadPublicFile, resolveCoaStorageUrl } from '../lib/supabase';
import { SendEmailModal, DispatchEmailAttachment } from '../components/SendEmailModal';

// "Documents Attachment" fields shown in this form once an existing dispatch
// entry's Status is switched to "Dispatch → Sent" (see the sentStatus select
// below). Mirrors the "PO Document" field on the Order form (NewOrder.tsx):
// a file picked here is only uploaded when the whole form is saved, not
// immediately on selection. COA is handled separately below (see the COA
// picker state further down) — it reuses the shared coa_document library
// (search-and-attach, or upload-new-and-attach) the same way
// NewStockInward.tsx's "COA" section does, rather than a plain file input.
type DispatchDocKey = 'invoiceEwayBill' | 'lr' | 'supplierPortal' | 'termCardAttachment';
// 2026-09-19: Invoice/Eway Bill and LR now accept any number of documents
// (multi-file), matching the "+ Add Email" / "+ Add Contact Number" pattern
// on the Customer form — see MULTI_DOC_FIELDS/multiDocSlots below. Supplier
// Portal and Term Card Attachment are unchanged, still single-file.
type MultiDocKey = 'invoiceEwayBill' | 'lr';
type SingleDocKey = 'supplierPortal' | 'termCardAttachment';

const DISPATCH_DOC_FIELDS: { key: DispatchDocKey; label: string; urlKey: keyof DispatchEntry; nameKey: keyof DispatchEntry; filesKey?: keyof DispatchEntry; slug: string; multi: boolean }[] = [
  { key: 'invoiceEwayBill', label: 'Invoice / Eway Bill', urlKey: 'invoiceEwayBillUrl', nameKey: 'invoiceEwayBillName', filesKey: 'invoiceEwayBillFiles', slug: 'invoice-eway-bill', multi: true },
  { key: 'lr', label: 'LR', urlKey: 'lrUrl', nameKey: 'lrName', filesKey: 'lrFiles', slug: 'lr', multi: true },
  { key: 'supplierPortal', label: 'Supplier Portal', urlKey: 'supplierPortalUrl', nameKey: 'supplierPortalName', slug: 'supplier-portal', multi: false },
  { key: 'termCardAttachment', label: 'Term Card Attachment', urlKey: 'termCardAttachmentUrl', nameKey: 'termCardAttachmentName', slug: 'term-card-attachment', multi: false },
];
const SINGLE_DOC_FIELDS = DISPATCH_DOC_FIELDS.filter(f => !f.multi) as (Omit<typeof DISPATCH_DOC_FIELDS[number], 'key'> & { key: SingleDocKey })[];
const MULTI_DOC_FIELDS = DISPATCH_DOC_FIELDS.filter(f => f.multi) as (Omit<typeof DISPATCH_DOC_FIELDS[number], 'key' | 'filesKey'> & { key: MultiDocKey; filesKey: keyof DispatchEntry })[];

// One row in a multi-document field's list — either a file already saved on
// this entry (kind: 'existing') or a freshly-picked file not yet uploaded
// (kind: 'new'). Unlike the Customer form's "+ Add Email" (which adds a
// blank row to type into), a file field has nothing to add until a file is
// actually chosen — so both the primary "Upload" control (when the field is
// still empty) and the "+ Add" link (once it has files) open the same OS
// file picker and append a filled 'new' slot the instant something is
// picked. There's no empty/unfilled slot state to render.
type DocSlot =
  | { id: string; kind: 'existing'; url: string; name: string }
  | { id: string; kind: 'new'; file: File; localUrl: string };

let docSlotSeq = 0;
const newDocSlotId = () => `slot-${Date.now()}-${++docSlotSeq}`;

// Builds a multi-doc field's initial slot list from its saved files array,
// falling back to the legacy single url/name columns for any entry that
// predates this feature (or the migration backfill, as a safety net).
const buildDocSlots = (files: { url: string; name: string }[] | undefined, legacyUrl?: string, legacyName?: string): DocSlot[] => {
  if (files && files.length) return files.map(f => ({ id: newDocSlotId(), kind: 'existing' as const, url: f.url, name: f.name }));
  if (legacyUrl) return [{ id: newDocSlotId(), kind: 'existing' as const, url: legacyUrl, name: legacyName || 'Document' }];
  return [];
};

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow disabled:bg-g50 disabled:cursor-not-allowed disabled:text-g500";
const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt disabled:opacity-60 disabled:cursor-not-allowed";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";
const sectionHeaderCls = "font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt p-[11px_16px] border-b border-g200";

// One read-only box in the "Order Details" card — grey '—' when empty,
// truncated with a tooltip so long values never overflow the box.
function ReadOnlyBox({ label, value, className = 'text-[12.5px]', children }: { label: string; value?: string | null; className?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className={labelCls}>{label}</label>
      <div className="flex items-center border border-g200 rounded-[3px] px-3 h-[38px] bg-g50 min-w-0" title={value || undefined}>
        {value
          ? <span className={`truncate min-w-0 ${className}`}>{children ?? value}</span>
          : <span className="text-g400 text-[12.5px]">—</span>}
      </div>
    </div>
  );
}

const INCO_OPTIONS = [
  'EXW', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP', 'FCA',
  'Ex Bhiwandi Warehouse', 'Ex Bhiwandi Warehouse Self Pickup',
  'Ex Factory Warehouse', 'Delivered', 'Free Delivery till Transport', 'Ex-Port',
];

// Full-page "New Dispatch Entry" form — mirrors the page chrome + bordered
// card sections used by NewOrder.tsx (Customer & Contact / Delivery Terms
// panels) rather than a small modal, since this form carries the full order
// summary + line items. Also doubles as the "Edit" flow for an already
// created dispatch entry: opened as /dispatch/new?orderRef=<orderId>, it
// preloads that order (skipping the search step) and, if a dispatch entry
// already exists for it, preloads that entry's saved fields too and saves
// via updateDispatchEntry instead of addDispatchEntry.
export function NewDispatchEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderRef = searchParams.get('orderRef');
  // Set when opened from the Dispatch list's "Dispatch → Sent" button
  // (?toSent=1) so the Status dropdown below opens pre-switched to
  // "Dispatch → Sent" and the Documents Attachment / COA section is visible
  // right away — the entry itself isn't marked sent until Save is clicked.
  const toSent = searchParams.get('toSent') === '1';
  // Set by the Dispatched tab's "Send Email" button (?email=1) — opens the
  // Email to Client popup automatically once the saved entry has loaded.
  const autoEmail = searchParams.get('email') === '1';
  const { data, user, loading, addDispatchEntry, updateDispatchEntry, updateOrder, addOrder, isReadOnlyUser, isAdmin, markDispatchEmailSent } = useAppStore();
  const canEditTier = canDeleteRecords(user?.email);
  // This whole page is locked to view-only for isReadOnlyUser (the Bhiwandi
  // warehouse login) — see the <fieldset> wraps below — with one deliberate
  // exception: the LR document field, which is the one thing that login is
  // allowed to upload/replace/remove. Every other logged-in user gets the
  // opposite: LR is view-only for them, everything else on this page is
  // normal. See isReadOnlyUser usage throughout this file.
  // mum@himalayaterpene.com and every ADMIN_EMAILS login (mis@, shishir@,
  // anil@ — see isAdmin in store/index.tsx) get the same LR edit access as
  // isReadOnlyUser (the Bhiwandi login) — but ONLY for LR. Unlike Bhiwandi,
  // none of these logins are read-only anywhere else in the app; this is
  // purely an added exception to who can edit the LR field, computed with
  // canEditLr below.
  const canEditLr = isReadOnlyUser || isAdmin || (user?.email ?? '').toLowerCase() === 'mum@himalayaterpene.com';
  const packingTypeOptions = usePackingTypes();
  const { names: productNames, hsnMap: productHsnMap } = useProductCatalog();

  const [type, setType] = useState<'' | DispatchFulfillmentType>('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);

  // Order-derived fields — auto-fetched from the order, but editable here so
  // a typo or trading-term change can be corrected without leaving this page.
  // Saved back onto the order itself (Customer + Unit stay read-only since
  // changing them has knock-on effects on site/contact/GST elsewhere).
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [customerTier, setCustomerTier] = useState<CustomerTier | ''>('');
  const [inco, setInco] = useState('');
  const [curr, setCurr] = useState('INR');
  const [pay, setPay] = useState('');
  const [shipAddr, setShipAddr] = useState('');
  const [custEnquiryDocNo, setCustEnquiryDocNo] = useState('');
  // Order Line Items — editable copy of the order's saved items, same as
  // Customer & Contact / Trading Terms above: corrections here are saved
  // back onto the order itself via updateOrder on Save.
  const [items, setItems] = useState<OrderItem[]>([]);
  const [insurance, setInsurance] = useState(0);

  // Dispatch-specific fields
  const [transporter, setTransporter] = useState('');
  const [remark, setRemark] = useState('');
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState('');
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  // Which of Dispatch.tsx's two tabs this entry shows under — mirrors that
  // page's own sentAt-based split (see its "Dispatch → Sent" button).
  // Defaults to 'to_dispatch' for a brand-new entry; hydrated from the
  // existing entry's sentAt below when editing one.
  const [sentStatus, setSentStatus] = useState<'to_dispatch' | 'sent'>('to_dispatch');

  // "Documents Attachment" — only meaningful (and only ever shown) once
  // sentStatus === 'sent'.
  // Single-file fields (Supplier Portal, Term Card Attachment) — unchanged
  // from before: docFiles/docLocalUrls hold a freshly-picked, not-yet-
  // uploaded file; existingDocUrls/Names hold what's already saved.
  // touchedDocs tracks which of these two fields the user actually changed
  // this session, so handleSubmit only overwrites those.
  const [docFiles, setDocFiles] = useState<Partial<Record<SingleDocKey, File>>>({});
  const [docLocalUrls, setDocLocalUrls] = useState<Partial<Record<SingleDocKey, string>>>({});
  const [existingDocUrls, setExistingDocUrls] = useState<Partial<Record<SingleDocKey, string>>>({});
  const [existingDocNames, setExistingDocNames] = useState<Partial<Record<SingleDocKey, string>>>({});
  const [touchedDocs, setTouchedDocs] = useState<Set<SingleDocKey>>(new Set());

  // Multi-file fields (Invoice/Eway Bill, LR) — one list of DocSlot rows per
  // field; see the DocSlot type above. multiDocTouched mirrors touchedDocs:
  // only fields the user actually added/picked/removed something in get
  // written back on Save, leaving every other field's saved list untouched.
  const [multiDocSlots, setMultiDocSlots] = useState<Record<MultiDocKey, DocSlot[]>>({ invoiceEwayBill: [], lr: [] });
  const [multiDocTouched, setMultiDocTouched] = useState<Set<MultiDocKey>>(new Set());

  // Invoice Number — a plain manually-typed value, shown next to Remark in
  // the Customer & Contact card (not gated behind Status, same as Remark).
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const handleDocFileChange = (key: SingleDocKey, file: File) => {
    setDocFiles(prev => ({ ...prev, [key]: file }));
    setDocLocalUrls(prev => ({ ...prev, [key]: URL.createObjectURL(file) }));
    setTouchedDocs(prev => new Set(prev).add(key));
  };

  const handleDocRemove = (key: SingleDocKey) => {
    setDocFiles(prev => { const n = { ...prev }; delete n[key]; return n; });
    setDocLocalUrls(prev => { const n = { ...prev }; delete n[key]; return n; });
    setExistingDocUrls(prev => ({ ...prev, [key]: undefined }));
    setExistingDocNames(prev => ({ ...prev, [key]: undefined }));
    setTouchedDocs(prev => new Set(prev).add(key));
  };

  // Picking a file for a multi-doc field — via either the primary "Upload"
  // control (field still empty) or the "+ Add" link (field already has
  // files) — appends it as a new, already-filled slot in one step.
  const pickAndAddMultiDocFile = (key: MultiDocKey, file: File) => {
    setMultiDocSlots(prev => ({ ...prev, [key]: [...prev[key], { id: newDocSlotId(), kind: 'new', file, localUrl: URL.createObjectURL(file) }] }));
    setMultiDocTouched(prev => new Set(prev).add(key));
  };

  const removeMultiDocSlot = (key: MultiDocKey, slotId: string) => {
    setMultiDocSlots(prev => ({ ...prev, [key]: prev[key].filter(s => s.id !== slotId) }));
    setMultiDocTouched(prev => new Set(prev).add(key));
  };

  // COA — search the shared coa_document library (by product name or lot no.)
  // and attach one, or upload a brand-new certificate there. Adapted from the
  // identical picker in NewStockInward.tsx's "COA" section. 2026-09-19:
  // multi-document, like Invoice/Eway Bill and LR — coaFiles holds every
  // attached {url,name}, each already fully resolved the moment it's picked
  // (a library search-select just references an existing storage URL, and
  // "Upload New" both stores the file and inserts it into coa_document
  // immediately) — unlike LR/Invoice there's no deferred-upload File object
  // to track here, only the final list written to this dispatch entry on
  // Save (via coaTouched, same as every other Documents Attachment field).
  const [coaFiles, setCoaFiles] = useState<{ url: string; name: string }[]>([]);
  const [coaTouched, setCoaTouched] = useState(false);
  // Once at least one COA is attached, the search/upload panel hides behind
  // a "+ Add COA" link (mirroring Invoice/Eway Bill and LR) and this toggles
  // it back open to attach another. With nothing attached yet, the panel is
  // always shown directly — see the render below.
  const [showCoaPicker, setShowCoaPicker] = useState(false);
  const [coaSearch, setCoaSearch] = useState('');
  const [coaSearchDebounced, setCoaSearchDebounced] = useState('');
  const [coaResults, setCoaResults] = useState<any[]>([]);
  const [coaSearchLoading, setCoaSearchLoading] = useState(false);
  const [newCoaFile, setNewCoaFile] = useState<File | null>(null);
  const [coaUploading, setCoaUploading] = useState(false);
  const [coaUploadError, setCoaUploadError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setCoaSearchDebounced(coaSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [coaSearch]);

  useEffect(() => {
    if (sentStatus !== 'sent') return;
    const controller = new AbortController();
    setCoaSearchLoading(true);
    let query = supabase.from('coa_document').select('*').order('created_at', { ascending: false }).limit(20).abortSignal(controller.signal);
    if (coaSearchDebounced) query = query.or(`product_name.ilike.%${coaSearchDebounced}%,lot_no.ilike.%${coaSearchDebounced}%`);
    query.then(({ data: rows, error }) => {
      if (controller.signal.aborted) return;
      if (error) { console.error(error); setCoaResults([]); setCoaSearchLoading(false); return; }
      setCoaResults(rows ?? []);
      setCoaSearchLoading(false);
    });
    return () => controller.abort();
  }, [coaSearchDebounced, sentStatus]);

  const selectCoaDoc = (doc: any) => {
    setCoaFiles(prev => [...prev, { url: resolveCoaStorageUrl(doc.storage_path), name: doc.file_name }]);
    setCoaTouched(true);
    setShowCoaPicker(false);
    setCoaSearch('');
  };

  const removeCoaFile = (url: string) => {
    setCoaFiles(prev => prev.filter(f => f.url !== url));
    setCoaTouched(true);
  };

  const handleUploadNewCoa = async () => {
    setCoaUploadError('');
    if (!newCoaFile) { setCoaUploadError('Choose a file to upload.'); return; }
    setCoaUploading(true);
    try {
      const ext = newCoaFile.name.split('.').pop() || 'bin';
      // No single "product name" field applies to a dispatch (an order can
      // carry several line items) — fall back through the first line item's
      // product, then the customer name, so the shared library still gets a
      // meaningful, searchable label instead of a blank one.
      const coaProductName = (items[0]?.desc || selectedOrder?.cust || existingEntryId || selectedOrderId || 'Dispatch').trim();
      const safeProductName = coaProductName.replace(/[^a-zA-Z0-9]/g, '_');
      const path = `COA/${safeProductName}_${Date.now()}.${ext}`;
      const { data: url, error: uploadError } = await uploadPublicFile('coa-gc-documents', path, newCoaFile);
      if (uploadError || !url) throw uploadError || new Error('Upload failed');

      const { data: row, error: insertError } = await supabase.from('coa_document').insert({
        product_name: coaProductName,
        lot_no: null,
        doc_type: 'COA',
        file_name: newCoaFile.name,
        storage_path: url,
        file_size: newCoaFile.size,
        uploaded_by: user?.email ?? null,
        notes: `Dispatch ${existingEntryId || selectedOrderId || ''}`.trim(),
      }).select().single();
      if (insertError || !row) throw insertError || new Error('Could not save document reference');

      selectCoaDoc(row);
      setCoaResults(prev => [row, ...prev]);
      setNewCoaFile(null);
    } catch (e: any) {
      console.error(e);
      setCoaUploadError(e?.message || 'Failed to upload document.');
    }
    setCoaUploading(false);
  };

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Email to Client needs a saved entry — its attachments come from saved
  // documents, and onSent stamps email_sent_at on that entry's id.
  const openEmailModal = () => {
    if (!existingEntryId) { setError('Please save the dispatch entry first'); return; }
    setError('');
    setShowEmailModal(true);
  };

  // ?email=1 — open the popup once, as soon as the order (and its saved
  // entry, set in the same hydration pass) has loaded.
  const autoEmailDone = useRef(false);
  useEffect(() => {
    if (!autoEmail || autoEmailDone.current || !selectedOrderId || isReadOnlyUser) return;
    autoEmailDone.current = true;
    openEmailModal();
  }, [autoEmail, selectedOrderId, existingEntryId, isReadOnlyUser]);

  const hydrateFromOrder = (order: Order) => {
    setContact(order.contact || '');
    setPhone(order.phone || '');
    setEmail(order.email || '');
    setCustomerTier(order.customerTier || '');
    setInco(order.inco || '');
    setCurr(order.curr || 'INR');
    setPay(order.pay || '');
    setShipAddr(order.shipToAddress || '');
    setCustEnquiryDocNo(order.custEnquiryDocNo || '');
    setItems(order.items.map(i => ({ ...i })));
    setInsurance(order.insurance ?? 0);
    // Carried forward from the order (now fillable there at creation time) —
    // overridden below by the dispatch entry's own saved values, if one exists.
    if (order.fulfillmentType) setType(order.fulfillmentType);
    setTransporter(order.transporter || '');
    setRemark(order.remark || '');
    setPromisedDeliveryDate(order.promisedDeliveryDate || '');
    setEstimatedDeliveryDate(order.estimatedDeliveryDate || '');
  };

  // Mirrors NewOrder.tsx's updateItem — recomputes an item's Amount whenever
  // qty, rate, or packing (which feeds Total Qty) changes.
  const updateItem = (idx: number, field: keyof OrderItem, value: any) => {
    const ni = [...items];
    const updated = { ...ni[idx], [field]: value };
    if (field === 'qty' || field === 'agreedRate' || field === 'priceBasisConv' || field === 'packing') {
      const packingNum = parseFloat(updated.packing || '') || 0;
      const totalQty = Number(updated.qty) * (packingNum || 1);
      const conv = Number(updated.priceBasisConv) || 1;
      updated.total = totalQty * conv * Number(updated.agreedRate);
    }
    ni[idx] = updated;
    setItems(ni);
  };

  // Unlike NewOrder.tsx's removeItem, this deliberately does NOT renumber the
  // remaining items' `seq` after a removal — handleSubmit's leftover-split
  // calc below matches edited items back to baselineItems by seq, and this
  // form (unlike NewOrder.tsx) never adds new lines, only removes existing
  // ones. Renumbering would shift a later item onto an earlier item's seq,
  // making the calc compare the wrong pair and misattribute quantities.
  const removeItem = (idx: number) => { if (items.length === 1) return; setItems(items.filter((_, i) => i !== idx)); };

  // Preload from ?orderRef= — used both when the order/customer picker
  // hasn't run yet, and for the "Edit" flow off an existing dispatch entry.
  // Guarded to run once so it never clobbers in-progress edits.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !orderRef) return;
    const order = data.orders.find(o => o.id === orderRef);
    if (!order) return;
    hydratedRef.current = true;
    setSelectedOrderId(order.id);
    hydrateFromOrder(order);
    const existing = data.dispatchEntries.find(e => e.orderId === order.id);
    if (existing) {
      setExistingEntryId(existing.id);
      // Entry's own saved value wins; fall back to what hydrateFromOrder just
      // set from the order rather than blanking it when the entry has none.
      setType(existing.fulfillmentType || order.fulfillmentType || '');
      setTransporter(existing.transporter || order.transporter || '');
      setRemark(existing.remark || order.remark || '');
      setPromisedDeliveryDate(existing.promisedDeliveryDate || order.promisedDeliveryDate || '');
      setEstimatedDeliveryDate(existing.estimatedDeliveryDate || order.estimatedDeliveryDate || '');
      setSentStatus(existing.sentAt || toSent ? 'sent' : 'to_dispatch');
      setExistingDocUrls({
        supplierPortal: existing.supplierPortalUrl,
        termCardAttachment: existing.termCardAttachmentUrl,
      });
      setExistingDocNames({
        supplierPortal: existing.supplierPortalName,
        termCardAttachment: existing.termCardAttachmentName,
      });
      setMultiDocSlots({
        invoiceEwayBill: buildDocSlots(existing.invoiceEwayBillFiles, existing.invoiceEwayBillUrl, existing.invoiceEwayBillName),
        lr: buildDocSlots(existing.lrFiles, existing.lrUrl, existing.lrName),
      });
      setCoaFiles(existing.coaFiles && existing.coaFiles.length ? existing.coaFiles : (existing.coaUrl ? [{ url: existing.coaUrl, name: existing.coaName || 'COA' }] : []));
      setInvoiceNumber(existing.invoiceNumber || '');
      // Reopening a saved dispatch entry must show what was actually
      // dispatched, not the order's own (unchanged) confirmed quantities —
      // the entry carries its own items/insurance snapshot for exactly this.
      if (existing.items && existing.items.length) setItems(existing.items.map(i => ({ ...i })));
      if (typeof existing.insurance === 'number') setInsurance(existing.insurance);
    } else {
      // Brand-new entry (e.g. "Create Dispatch" off the Order Pending for
      // Dispatch tab, which opens with ?toSent=1): start in Dispatch → Sent
      // so the Documents Attachment section is visible right away, and fill
      // any blanks hydrateFromOrder left from the customer/site defaults.
      if (toSent) setSentStatus('sent');
      const cust = data.customers.find(c => c.name === order.cust);
      if (!order.fulfillmentType) {
        if (cust?.fulfilmentType === 'Delivery') setType('delivery');
        else if (cust?.fulfilmentType === 'Self Pickup') setType('self_pickup');
      }
      if (!order.transporter) {
        const site = cust?.sites.find(s => s.id === order.siteId);
        if (site?.transporter) setTransporter(site.transporter);
      }
      if (!order.promisedDeliveryDate) {
        const fallbackDate = order.dlvDate || order.scheduleDate;
        if (fallbackDate) setPromisedDeliveryDate(fallbackDate.slice(0, 10));
      }
    }
  }, [orderRef, data.orders, data.dispatchEntries]);

  // This page only ever supports the ?orderRef= entry point now (the
  // standalone "search any order" mode has been removed) — once the store
  // has finished loading, if hydration above didn't find a real order to
  // work with (no orderRef, or a stale/invalid one), bounce back to the
  // Dispatch list instead of showing anything here. Guarded on `loading` so
  // this doesn't fire prematurely on a fresh page load before data.orders
  // has arrived, which would incorrectly bounce away a valid orderRef.
  useEffect(() => {
    if (loading) return;
    if (hydratedRef.current) return;
    navigate('/dispatch', { replace: true });
  }, [loading, orderRef, data.orders]);

  const selectedOrder = selectedOrderId ? data.orders.find(o => o.id === selectedOrderId) : null;
  const isEditMode = !!existingEntryId;
  const selectedCustomer = selectedOrder ? data.customers.find(c => c.name === selectedOrder.cust) : undefined;

  // "Email to Client" attachments — every document already saved on this
  // entry (the 4 Documents Attachment fields + COA), whichever of those are
  // actually present. Built from existingDocUrls/Names + multiDocSlots'
  // 'existing' rows + coaFiles (what's persisted), not docFiles / freshly-
  // picked multiDocSlots rows — a file has to actually be uploaded before it
  // can be emailed. Invoice/Eway Bill, LR, and now COA can each contribute
  // more than one attachment under the same label since they're multi-file
  // (coaFiles entries are always already-resolved, so every one of them
  // counts as "saved" here — see the coaFiles comment above).
  const dispatchEmailAttachments: DispatchEmailAttachment[] = useMemo(() => {
    const list: DispatchEmailAttachment[] = [];
    for (const field of SINGLE_DOC_FIELDS) {
      const url = existingDocUrls[field.key];
      if (url) list.push({ label: field.label, url, fileName: existingDocNames[field.key] || field.label });
    }
    for (const field of MULTI_DOC_FIELDS) {
      for (const slot of multiDocSlots[field.key]) {
        if (slot.kind === 'existing') list.push({ label: field.label, url: slot.url, fileName: slot.name || field.label });
      }
    }
    for (const f of coaFiles) list.push({ label: 'COA', url: f.url, fileName: f.name || 'COA' });
    return list;
  }, [existingDocUrls, existingDocNames, multiDocSlots, coaFiles]);

  // Order totals — mirrors the exact Subtotal/Insurance/Taxable Value/GST
  // Total/Order Value math used on the Order form itself, now recomputed
  // live off the editable `items` state above (not the frozen order.items)
  // so corrections here are reflected immediately, before Save.
  const orderTotals = useMemo(() => {
    if (!selectedOrder) return null;
    const isINR = (curr || 'INR') === 'INR';
    const subTotal = items.reduce((s, i) => s + i.total, 0);
    const ins = isINR ? insurance : 0;
    const itemGst = items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
    const scaledItemGst = isINR && subTotal > 0 ? itemGst * (subTotal + ins) / subTotal : 0;
    const maxGstRate = isINR ? maxItemGstRate(items) : 0;
    const adj = resolveAdjustments(selectedOrder.adjustments, subTotal, scaledItemGst, maxGstRate);
    const gstTotal = isINR ? adj.gstTotal : 0;
    const grandTotal = Math.round(subTotal + ins + adj.preNet + gstTotal + adj.postNet);
    return { isINR, subTotal, ins, adj, gstTotal, grandTotal };
  }, [selectedOrder, items, curr, insurance]);

  const handleSubmit = async () => {
    if (!selectedOrderId || !selectedOrder || saving) return;
    if (!type) { setError('Please select Delivery or Self Pickup'); return; }
    setSaving(true);
    setError('');
    try {
      // Detect a partial dispatch: if the user has edited any line's "No of
      // Barrels" down from what's actually being dispatched here, the
      // undispatched remainder must not be lost — split it off into a new
      // order (status "Order Pending for Dispatch", linked back via
      // splitFromOrderId) so it stays visible in the Orders module and can
      // be dispatched later, potentially split further.
      //
      // The comparison baseline is what THIS dispatch action has already
      // accounted for — the dispatch entry's own saved items when editing an
      // existing one, or the order's full confirmed items on a fresh
      // dispatch — never the order's own items directly. The order's items
      // are never rewritten by a dispatch (see the updateOrder call below),
      // so "Order Confirmed" always keeps showing what was actually
      // confirmed, however many times it's since been split.
      const existingEntry = existingEntryId ? data.dispatchEntries.find(e => e.id === existingEntryId) : null;
      const baselineItems = (existingEntry?.items && existingEntry.items.length) ? existingEntry.items : selectedOrder.items;
      // Iterate the BASELINE items, not the edited `items` — a line fully
      // removed from `items` (via the delete-row button) has no seq to look
      // up there, so iterating `items` would silently drop its entire
      // original quantity instead of carrying it into the leftover order.
      // A baseline line missing from `items` is treated as 0 dispatched.
      const editedBySeq = new Map(items.map(i => [i.seq, i]));
      const leftoverItemsRaw: OrderItem[] = [];
      baselineItems.forEach(orig => {
        const edited = editedBySeq.get(orig.seq);
        const editedQty = edited ? Number(edited.qty) : 0;
        const remainderQty = Number(orig.qty) - editedQty;
        if (remainderQty > 0) {
          const packingNum = parseFloat(orig.packing || '') || 0;
          const totalQty = remainderQty * (packingNum || 1);
          const conv = Number(orig.priceBasisConv) || 1;
          const total = totalQty * conv * Number(orig.agreedRate);
          leftoverItemsRaw.push({ ...orig, qty: remainderQty, total });
        }
      });
      const leftoverItems = leftoverItemsRaw.map((it, i) => ({ ...it, seq: i + 1 }));

      if (leftoverItems.length > 0) {
        const summary = leftoverItems.map(i => `${i.desc || '(item)'} — ${i.qty} left`).join(', ');
        const proceed = window.confirm(
          `This dispatch covers only part of the order (${summary}). The undispatched remainder will be split into a new order under "Order Pending for Dispatch" so it isn't lost. Continue?`
        );
        if (!proceed) { setSaving(false); return; }

        // Leftover order recomputes its own Subtotal → GST → Order Value from
        // its own (smaller) item quantities. Insurance and any fixed-amount
        // ('value'-mode) taxes/charges stay on the original dispatched order
        // only; percentage-mode adjustments are carried over and recomputed
        // proportionally here off the leftover subtotal.
        const isINR = (curr || 'INR') === 'INR';
        const leftoverSubTotal = leftoverItems.reduce((s, i) => s + i.total, 0);
        const leftoverItemGst = leftoverItems.reduce((s, i) => s + (i.total * i.gst / 100), 0);
        const leftoverMaxGstRate = isINR ? maxItemGstRate(leftoverItems) : 0;
        const leftoverPercentAdjustments = (selectedOrder.adjustments || []).filter(a => a.mode === 'percent');
        const leftoverAdj = resolveAdjustments(leftoverPercentAdjustments, leftoverSubTotal, isINR ? leftoverItemGst : 0, leftoverMaxGstRate);
        const leftoverGstTotal = isINR ? leftoverAdj.gstTotal : 0;
        const leftoverValue = Math.round(leftoverSubTotal + leftoverAdj.preNet + leftoverGstTotal + leftoverAdj.postNet);

        const newOrder: Order = {
          id: generateId('ORD', data.orders.map(o => o.id)),
          quoteRef: selectedOrder.quoteRef,
          enqRef: selectedOrder.enqRef,
          cust: selectedOrder.cust,
          siteId: selectedOrder.siteId,
          contactId: selectedOrder.contactId,
          contact: contact || undefined,
          email: email || undefined,
          phone: phone || undefined,
          custEnquiryDocNo: custEnquiryDocNo || undefined,
          poNo: selectedOrder.poNo,
          poDate: selectedOrder.poDate,
          dlvDate: selectedOrder.dlvDate,
          scheduleDate: selectedOrder.scheduleDate,
          status: 'Order Pending for Dispatch',
          value: leftoverValue,
          insurance: 0,
          inco: inco || undefined,
          curr: curr || undefined,
          pay: pay || undefined,
          items: leftoverItems,
          adjustments: leftoverPercentAdjustments,
          authorizedPerson: selectedOrder.authorizedPerson,
          customerTier: customerTier || undefined,
          terms: selectedOrder.terms,
          bankingDetails: selectedOrder.bankingDetails,
          unitId: selectedOrder.unitId,
          bankAccountId: selectedOrder.bankAccountId,
          priceBasis: selectedOrder.priceBasis,
          countryOfOrigin: selectedOrder.countryOfOrigin,
          eximCode: selectedOrder.eximCode,
          customPoint: selectedOrder.customPoint,
          pan: selectedOrder.pan,
          hsn: selectedOrder.hsn,
          shipToAddress: shipAddr || undefined,
          doer: selectedOrder.doer,
          // Dispatch-specific fields (Transporter, Promised/Estimated Delivery
          // Date, Fulfillment Type) are deliberately left blank on the
          // leftover order — they describe *this* dispatch, not the
          // still-undispatched remainder, which gets its own fresh values
          // when it's eventually dispatched.
          splitFromOrderId: selectedOrder.id,
        };
        await addOrder(newOrder);
      }

      // Persist corrections made to the order's own trading/contact details
      // only — NOT items/insurance/value. The order keeps showing exactly
      // what was confirmed, for as long as it exists, regardless of how much
      // of it has since been dispatched; what's actually being dispatched
      // now lives on the dispatch entry itself (below), and any undispatched
      // remainder lives on the leftover order split off above.
      //
      // A leftover order (status "Order Pending for Dispatch") that's now
      // getting its own dispatch entry — whether fully dispatched here or
      // partially (splitting off yet another remainder above) — is done
      // being "pending"; flip it back to "Order Confirmed" so it drops out
      // of that tab. Orders that started as Order Confirmed/Processing/
      // Delivered are left untouched.
      const orderUpdates: Partial<Order> = {
        contact: contact || undefined,
        phone: phone || undefined,
        email: email || undefined,
        customerTier: customerTier || undefined,
        inco: inco || undefined,
        curr: curr || undefined,
        pay: pay || undefined,
        shipToAddress: shipAddr || undefined,
        custEnquiryDocNo: custEnquiryDocNo || undefined,
      };
      if (selectedOrder.status === 'Order Pending for Dispatch') {
        orderUpdates.status = 'Order Confirmed';
      }
      // Permanent marker for a split order once it's ever been dispatched —
      // unlike the status flip above, this is never reset, so the order
      // stays hidden from the Orders module (see isRetiredSplitOrder in
      // Orders.tsx) even after this dispatch entry is later deleted.
      if (selectedOrder.splitFromOrderId) {
        orderUpdates.dispatchFinalized = true;
      }
      await updateOrder(selectedOrderId, orderUpdates);

      // Preserve the original sentAt timestamp if this entry was already
      // "sent" and stays that way — only stamp a fresh one the moment it
      // transitions from Order → Dispatch to Dispatch → Sent here. Going
      // back to Order → Dispatch clears it (undefined → null via
      // mapDispatchEntryToDB's `'sentAt' in d` check in store/index.tsx).
      const sentAt = sentStatus === 'sent' ? (existingEntry?.sentAt || new Date().toISOString()) : undefined;

      // Documents Attachment — upload only the fields the user actually
      // touched this session, only now on Save, exactly like the Order
      // form's PO Document field.
      const docUpdates: Partial<DispatchEntry> = {};
      // Single-file fields (Supplier Portal, Term Card Attachment) —
      // unchanged: a freshly-picked file uploads and records its public URL
      // + original name; cleared via "×" with nothing re-picked writes
      // undefined so mapDispatchEntryToDB nulls out both columns.
      for (const field of SINGLE_DOC_FIELDS) {
        if (!touchedDocs.has(field.key)) continue;
        const file = docFiles[field.key];
        if (file) {
          const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const pathPrefix = existingEntryId || selectedOrderId;
          const { data: publicUrl, error: uploadError } = await uploadPublicFile('dispatch-documents', `${pathPrefix}/${field.slug}/${safeName}`, file);
          if (uploadError || !publicUrl) throw uploadError || new Error(`Could not upload ${field.label}`);
          (docUpdates as any)[field.urlKey] = publicUrl;
          (docUpdates as any)[field.nameKey] = file.name;
        } else {
          (docUpdates as any)[field.urlKey] = undefined;
          (docUpdates as any)[field.nameKey] = undefined;
        }
      }
      // Multi-file fields (Invoice/Eway Bill, LR) — upload every freshly-
      // picked ('new') slot, keep every already-saved ('existing') slot,
      // and drop removed slots (they're just not in the array anymore),
      // then save the resulting list as this field's files array. Each new
      // file's storage path includes its slot id so multiple files picked
      // for the same field in the same session never collide with each
      // other.
      for (const field of MULTI_DOC_FIELDS) {
        if (!multiDocTouched.has(field.key)) continue;
        const files: { url: string; name: string }[] = [];
        for (const slot of multiDocSlots[field.key]) {
          if (slot.kind === 'existing') {
            files.push({ url: slot.url, name: slot.name });
          } else {
            const safeName = slot.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const pathPrefix = existingEntryId || selectedOrderId;
            const { data: publicUrl, error: uploadError } = await uploadPublicFile('dispatch-documents', `${pathPrefix}/${field.slug}/${slot.id}-${safeName}`, slot.file);
            if (uploadError || !publicUrl) throw uploadError || new Error(`Could not upload ${field.label}`);
            files.push({ url: publicUrl, name: slot.file.name });
          }
        }
        (docUpdates as any)[field.filesKey] = files;
      }
      // COA is attached via the search/upload picker above, not a raw file
      // input, so every entry in coaFiles is already fully resolved by the
      // time we get here — just persist the current list if touched, same
      // as the multi-file fields above.
      if (coaTouched) {
        (docUpdates as any).coaFiles = coaFiles;
      }

      const extra = {
        transporter: transporter || undefined,
        remark: remark || undefined,
        invoiceNumber: invoiceNumber || undefined,
        promisedDeliveryDate: promisedDeliveryDate || undefined,
        estimatedDeliveryDate: estimatedDeliveryDate || undefined,
        sentAt,
        // This dispatch's own line items/insurance/value — what's actually
        // being dispatched right now, independent of the order's own totals.
        items,
        insurance: curr === 'INR' ? insurance : 0,
        value: orderTotals ? orderTotals.grandTotal : selectedOrder.value,
        ...docUpdates,
      };

      if (existingEntryId) {
        await updateDispatchEntry(existingEntryId, { fulfillmentType: type as DispatchFulfillmentType, ...extra });
      } else {
        await addDispatchEntry(selectedOrderId, type as DispatchFulfillmentType, extra);
      }
      // Land on the tab/pill the saved entry now lives under.
      navigate(`/dispatch?tab=${existingEntry?.emailSentAt ? 'emailSent' : sentAt ? 'dispatched' : 'toDispatch'}&type=${type}`);
    } catch (err: any) {
      setError(err?.message || 'Could not save — check your connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="pt-4 px-5 pb-3 border-b border-g200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-0.5">Module 04</div>
            <h1 className="font-serif text-[22px] text-blk tracking-tight leading-tight">
              New <em className="italic text-red-mrt">Dispatch Entry</em>
            </h1>
            <p className="text-xs text-g500 mt-0.5 font-light">
              {type === 'self_pickup' ? 'Self Pickup Form' : 'HTPL Delivery FMS Form'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isEditMode && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-g500 uppercase tracking-wide">Status</label>
                <select title="Dispatch status" value={sentStatus} disabled={isReadOnlyUser}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSentStatus(e.target.value as 'to_dispatch' | 'sent')}
                  className="font-mono text-[11px] font-bold border border-g300 rounded-[3px] p-[5px_10px] outline-none focus:border-red-mrt bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="to_dispatch">Order → Dispatch</option>
                  <option value="sent">Dispatch → Sent</option>
                </select>
              </div>
            )}
            <Button variant="secondary" onClick={() => navigate('/dispatch')}>Back</Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-8 pt-3 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[12px]">

          {/* Everything down to Documents Attachment is locked for
              isReadOnlyUser (the Bhiwandi login) — LR is their one carved-out
              exception, handled field-by-field inside that section instead
              of being wrapped by this fieldset. */}
          <fieldset disabled={isReadOnlyUser} className="contents">

          {isEditMode && selectedOrder && (
            <div className="bg-sW/5 border border-sW/20 rounded-[3px] p-[9px_14px] flex items-center gap-[10px] text-[12px]">
              <span className="text-sW text-[14px]">✓</span>
              <div><strong className="text-sW">Loaded from {selectedOrder.id} ({selectedOrder.cust})</strong> — customer & trading details auto-filled below. Just confirm Delivery or Self Pickup.</div>
            </div>
          )}

          {/* Order selection — Fulfillment Type now lives in the Customer & Contact card below, alongside the rest of the dispatch-specific fields */}
          <div className="bg-white border border-g200">
            <div className={sectionHeaderCls}>Order Details</div>
            {selectedOrder ? (
              // Read-only, one box per field — mirrors the header row on
              // the Edit Order page. Customer lives in the card below.
              <div className="p-[14px_16px] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-[12px]">
                {/* SO No. — assigned automatically on the Dispatch page */}
                <ReadOnlyBox label="SO No." value={selectedOrder.soNumber} className="font-mono text-[12px] font-bold text-sW" />
                <ReadOnlyBox
                  label="Order Ref"
                  value={selectedOrder.quoteRef ? `${selectedOrder.id}  ${selectedOrder.quoteRef}` : selectedOrder.id}
                  className="text-[12.5px]"
                >
                  <span className="font-mono font-bold text-sQ">{selectedOrder.id}</span>
                  {selectedOrder.quoteRef && <span className="font-mono text-[10px] text-g500 ml-2">{selectedOrder.quoteRef}</span>}
                </ReadOnlyBox>
                <ReadOnlyBox label="Enq Reference" value={selectedOrder.enqRef} className="font-mono text-[12px]" />
                <ReadOnlyBox label="PO Number" value={selectedOrder.poNo} className="font-mono text-[12px]" />
                <ReadOnlyBox label="PO Date" value={selectedOrder.poDate ? fmtDate(selectedOrder.poDate) : ''} />
                <ReadOnlyBox label="Required Delivery By" value={selectedOrder.dlvDate ? fmtDate(selectedOrder.dlvDate) : ''} />
                <ReadOnlyBox label="Schedule Date" value={selectedOrder.scheduleDate ? fmtDate(selectedOrder.scheduleDate) : ''} />
              </div>
            ) : (
              // Only visible for a single render tick before the
              // redirect effect above sends us back to /dispatch.
              <div className="p-[14px_16px] text-g400 text-[12.5px]">Loading…</div>
            )}
          </div>

          {/* Customer & Contact / Delivery & Trading Terms — auto-fetched, editable */}
          {selectedOrder && (
            <div className="grid grid-cols-12 gap-[12px]">
              <div className="col-span-12 lg:col-span-8 bg-white border border-g200">
                <div className={sectionHeaderCls}>Customer & Contact</div>
                <div className="p-[14px_16px] grid grid-cols-2 gap-[12px]">
                  <div>
                    <label className={labelCls}>Customer</label>
                    <input className={inputCls} value={selectedOrder.cust} disabled />
                  </div>
                  <div>
                    <label className={labelCls}>Unit</label>
                    <input className={inputCls} value={siteLabel(selectedCustomer, selectedOrder.siteId) || '—'} disabled />
                  </div>
                </div>
                <div className="p-[0_16px_14px] grid grid-cols-3 gap-[12px]">
                  <div>
                    <label className={labelCls}>Contact Person</label>
                    <input className={inputCls} value={contact} onChange={e => setContact(e.target.value)} placeholder="Contact name" />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98XXX XXXXX" />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@company.com" />
                  </div>
                </div>
                <div className="p-[0_16px_14px]">
                  <label className={labelCls}>
                    Customer Tier
                    {!canEditTier && <span className="ml-1 text-g400 font-normal normal-case text-[10px]">(view only)</span>}
                  </label>
                  <select value={customerTier} disabled={!canEditTier} onChange={e => setCustomerTier(e.target.value as CustomerTier | '')} className={selectCls + ' w-40'}>
                    <option value="">— No tier —</option>
                    <option>New</option>
                    <option>Bronze</option>
                    <option>Silver</option>
                    <option>Gold</option>
                    <option>Platinum</option>
                  </select>
                </div>

                {/* Dispatch Details — fulfillment type + the fields filled in by the customer-facing form, folded into Customer & Contact */}
                <div className="p-[0_16px_14px]">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-[12px]">
                    <div>
                      <label className={labelCls}>Fulfillment Type</label>
                      <select value={type} onChange={e => setType(e.target.value as '' | DispatchFulfillmentType)} className={selectCls}>
                        <option value="">Select...</option>
                        <option value="delivery">Delivery</option>
                        <option value="self_pickup">Self Pickup</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Transporter</label>
                      <input className={inputCls} value={transporter} onChange={e => setTransporter(e.target.value)} placeholder="Transporter name" />
                    </div>
                    <div>
                      <label className={labelCls}>Promised Delivery Date</label>
                      <input type="date" className={inputCls} value={promisedDeliveryDate} onChange={e => setPromisedDeliveryDate(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Estimated Delivery Date</label>
                      <input type="date" className={inputCls} value={estimatedDeliveryDate} onChange={e => setEstimatedDeliveryDate(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Remark</label>
                      <input className={inputCls} value={remark} onChange={e => setRemark(e.target.value)} placeholder="Optional remark" />
                    </div>
                    <div>
                      <label className={labelCls}>Invoice Number</label>
                      <input className={inputCls} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Enter Invoice Number" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-12 lg:col-span-4 bg-white border border-g200 self-start">
                <div className={sectionHeaderCls}>Delivery / Trading Terms</div>
                <div className="p-[14px_16px] flex flex-col gap-[12px]">
                  <div>
                    <label className={labelCls}>Incoterms</label>
                    <select value={inco} onChange={e => setInco(e.target.value)} className={selectCls}>
                      <option value="">— Select —</option>
                      {INCO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      {inco && !INCO_OPTIONS.includes(inco) && <option value={inco}>{inco}</option>}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Currency</label>
                    <select value={curr} onChange={e => setCurr(e.target.value)} className={selectCls + ' font-bold'}>
                      <option>INR</option><option>USD</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Payment Terms</label>
                    <select value={pay} onChange={e => setPay(e.target.value)} className={selectCls}>
                      <option value="">— Select —</option>
                      {(PAY_OPTIONS as readonly string[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      {pay && !(PAY_OPTIONS as readonly string[]).includes(pay) && <option value={pay}>{pay}</option>}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Shipping Address</label>
                    <input className={inputCls} value={shipAddr} onChange={e => setShipAddr(e.target.value)} placeholder="Delivery address" />
                  </div>
                  <div>
                    <label className={labelCls}>Cust. Enquiry Doc No.</label>
                    <input className={inputCls} value={custEnquiryDocNo} onChange={e => setCustEnquiryDocNo(e.target.value)} placeholder="Ref/2024/01..." />
                  </div>
                </div>
              </div>
            </div>
          )}

          </fieldset>

          {/* Documents Attachment — only once this entry's Status (above) is switched
              to "Dispatch → Sent". Uploads are deferred to Save, same as PO Document. */}
          {selectedOrder && sentStatus === 'sent' && (
            <div className="bg-white border border-g200">
              <div className={sectionHeaderCls}>Documents Attachment</div>
              <div className="p-[14px_16px] grid grid-cols-2 sm:grid-cols-4 gap-[12px]">
                {/* Invoice/Eway Bill and LR — multi-document. With no files
                    yet, this looks and behaves exactly like Supplier Portal/
                    Term Card Attachment's single upload button below — one
                    click opens the file picker and attaches it. Once it has
                    a file, that same picker (now reached via a "+ Add" link
                    under the list) is used to attach more; a picked file is
                    never a separate two-step "empty row" — see the DocSlot
                    comment above. LR is the one field exempt from the
                    page-wide read-only lock for isReadOnlyUser (the Bhiwandi
                    login) — canEditLr also lets mum@ and every ADMIN_EMAILS
                    login edit it. Everyone else is locked out of LR.
                    Invoice/Eway Bill locks the normal way, for isReadOnlyUser
                    only. Either way every already-saved file's Open link
                    still works, so viewing is never blocked. */}
                {MULTI_DOC_FIELDS.map(field => {
                  const slots = multiDocSlots[field.key];
                  const isFieldLocked = field.key === 'lr' ? !canEditLr : isReadOnlyUser;
                  const inputId = `dispatch-doc-${field.key}-picker`;
                  return (
                    <div key={field.key}>
                      <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[3px]">{field.label}</label>
                      <div className="flex flex-col gap-1.5">
                        <input type="file" id={inputId} className="hidden" disabled={isFieldLocked}
                          onChange={e => { if (e.target.files?.length) { pickAndAddMultiDocFile(field.key, e.target.files[0]); e.target.value = ''; } }}
                          accept=".pdf,.jpeg,.jpg,.png,.webp" />
                        {slots.length === 0 ? (
                          <label htmlFor={inputId}
                            className={`font-sans text-[11px] font-medium rounded-[3px] p-[7px_10px] flex items-center gap-2 h-[36px] flex-1 min-w-0 border ${isFieldLocked ? 'cursor-not-allowed bg-g50 text-g500 border-g200' : 'cursor-pointer text-blk bg-white border-g300 hover:bg-g50 transition-colors'}`}>
                            <Upload size={13} className="text-g500 shrink-0" />
                            <span className="truncate">{isFieldLocked ? 'Not uploaded' : `Upload ${field.label}`}</span>
                          </label>
                        ) : (
                          <>
                            {slots.map(slot => (
                              <div key={slot.id} className="flex items-center gap-1.5">
                                <div className="font-sans text-[11px] font-medium rounded-[3px] p-[7px_10px] flex items-center gap-2 h-[36px] flex-1 min-w-0 border text-blk bg-white border-g300">
                                  <Upload size={13} className="text-g500 shrink-0" />
                                  <span className={`truncate ${slot.kind === 'new' ? '' : 'text-emerald-600'}`}>{slot.kind === 'new' ? slot.file.name : slot.name}</span>
                                </div>
                                <a href={slot.kind === 'new' ? slot.localUrl : slot.url} target="_blank" rel="noopener noreferrer" title={`Open ${field.label}`}
                                  className="p-1.5 text-g400 hover:text-blue-600 transition-colors shrink-0" onClick={e => e.stopPropagation()}>
                                  <ExternalLink size={14} />
                                </a>
                                {!isFieldLocked && (
                                  <button type="button" title="Remove" onClick={() => removeMultiDocSlot(field.key, slot.id)} className="text-g400 hover:text-red-mrt text-[16px] shrink-0">×</button>
                                )}
                              </div>
                            ))}
                            {!isFieldLocked && (
                              <label htmlFor={inputId} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer mt-0.5">
                                + Add {field.label}
                              </label>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Supplier Portal / Term Card Attachment — unchanged single-file fields. */}
                {SINGLE_DOC_FIELDS.map(field => {
                  const file = docFiles[field.key];
                  const localUrl = docLocalUrls[field.key];
                  const existingUrl = existingDocUrls[field.key];
                  const existingName = existingDocNames[field.key];
                  const inputId = `dispatch-doc-${field.key}`;
                  const isFieldLocked = isReadOnlyUser;
                  return (
                    <div key={field.key}>
                      <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[3px]">{field.label}</label>
                      <div className="flex items-center gap-1.5">
                        <input type="file" id={inputId} className="hidden" disabled={isFieldLocked}
                          onChange={e => { if (e.target.files?.length) handleDocFileChange(field.key, e.target.files[0]); }}
                          accept=".pdf,.jpeg,.jpg,.png,.webp" />
                        <label htmlFor={inputId}
                          className={`font-sans text-[11px] font-medium rounded-[3px] p-[7px_10px] flex items-center gap-2 h-[36px] flex-1 min-w-0 border ${isFieldLocked ? 'cursor-not-allowed bg-g50 text-g500 border-g200' : 'cursor-pointer text-blk bg-white border-g300 hover:bg-g50 transition-colors'}`}>
                          <Upload size={13} className="text-g500 shrink-0" />
                          {file
                            ? <span className="truncate">{file.name}</span>
                            : existingName
                            ? <span className={`truncate ${isFieldLocked ? '' : 'text-emerald-600'}`}>{isFieldLocked ? existingName : 'Existing (click to replace)'}</span>
                            : <span className="truncate">{isFieldLocked ? 'Not uploaded' : `Upload ${field.label}`}</span>}
                        </label>
                        {file && localUrl && (
                          <a href={localUrl} target="_blank" rel="noopener noreferrer" title="Preview selected file"
                            className="p-1.5 text-g400 hover:text-blue-600 transition-colors" onClick={e => e.stopPropagation()}>
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {!file && existingUrl && (
                          <a href={existingUrl} target="_blank" rel="noopener noreferrer" title={`Open ${field.label}`}
                            className="p-1.5 text-g400 hover:text-blue-600 transition-colors" onClick={e => e.stopPropagation()}>
                            <ExternalLink size={14} />
                          </a>
                        )}
                        {(file || existingUrl || existingName) && !isFieldLocked && (
                          <button type="button" title="Remove" onClick={() => handleDocRemove(field.key)} className="text-g400 hover:text-red-mrt text-[16px]">×</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* COA — search the shared coa_document library (same widget as the
                  Stock Movement "Log New Inward" form's COA section) and attach an
                  existing certificate, or upload a brand-new one to the library.
                  2026-09-19: multi-document, same idea as Invoice/Eway Bill and
                  LR — once at least one COA is attached, the search/upload panel
                  collapses behind a "+ Add COA" link; with none attached, the
                  panel is shown directly, same as before this change. Unlike LR,
                  COA still has no per-user carve-out — every control in this
                  section is locked for isReadOnlyUser same as everything else on
                  the page, via the fieldset wrap below (native <fieldset disabled>
                  auto-disables every button/input inside it, so no per-control
                  lock check is needed here). */}
              <fieldset disabled={isReadOnlyUser} className="contents">
              <div className="px-[16px] pb-[14px] pt-[2px] border-t border-g200 mt-[2px]">
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[6px]">COA</label>
                {coaFiles.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {coaFiles.map(f => (
                      <div key={f.url} className="flex items-center justify-between gap-2 bg-g100 border border-g200 rounded-[3px] px-2.5 py-2">
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-blk truncate">{f.name}</div>
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-[10.5px] text-red-mrt hover:underline">View PDF</a>
                        </div>
                        <button type="button" onClick={() => removeCoaFile(f.url)} className="p-1 text-g400 hover:text-red-mrt shrink-0" title="Remove"><X size={14} /></button>
                      </div>
                    ))}
                    {!showCoaPicker && (
                      <button type="button" onClick={() => setShowCoaPicker(true)} className="text-[11px] text-blue-600 hover:text-blue-800 font-medium text-left">
                        + Add COA
                      </button>
                    )}
                  </div>
                )}
                {(coaFiles.length === 0 || showCoaPicker) && (
                  <>
                    <div className="relative mb-2">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-g400 pointer-events-none" />
                      <input
                        type="text" value={coaSearch} onChange={e => setCoaSearch(e.target.value)}
                        placeholder="Search existing COA by product or lot no."
                        className={`${inputCls} pl-8 pr-8`}
                      />
                      {coaSearchLoading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-g400 animate-spin" />}
                    </div>
                    <div className="max-h-[160px] overflow-y-auto border border-g200 rounded-[3px] divide-y divide-g100 mb-3">
                      {coaResults.length === 0 ? (
                        <div className="text-center py-4 text-g400 text-xs italic">
                          {coaSearchLoading ? 'Searching…' : 'No matching COA documents found.'}
                        </div>
                      ) : (
                        coaResults.map(doc => (
                          <button
                            type="button" key={doc.id} onClick={() => selectCoaDoc(doc)}
                            className="w-full text-left flex items-center gap-3 p-2 hover:bg-g50"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-semibold text-blk truncate">{doc.product_name}{doc.lot_no ? ` — Lot ${doc.lot_no}` : ''}</div>
                              <div className="text-[10px] text-g500 truncate">{doc.file_name}</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="pt-2 border-t border-g200">
                      <div className="text-[10px] font-medium text-g500 mb-2 uppercase tracking-wider font-mono">Or Upload New COA</div>
                      <input
                        type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                        onChange={e => setNewCoaFile(e.target.files?.[0] ?? null)}
                        className="w-full font-sans text-xs text-blk bg-white border border-g300 rounded-[3px] p-[6px_10px] outline-none file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-g100 file:text-g700 hover:file:bg-g200"
                      />
                      {coaUploadError && <p className="mt-2 text-[10.5px] text-red-mrt font-medium">{coaUploadError}</p>}
                      <div className="flex justify-end items-center mt-2 gap-3">
                        {coaFiles.length > 0 && (
                          <button type="button" onClick={() => setShowCoaPicker(false)} className="text-g500 hover:text-blk text-xs font-medium">
                            Cancel
                          </button>
                        )}
                        <button
                          type="button" onClick={handleUploadNewCoa} disabled={coaUploading}
                          className="bg-blk hover:bg-g700 text-white text-xs font-semibold px-4 py-2 rounded shadow-sm disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                        >
                          {coaUploading ? <><Loader2 size={14} className="animate-spin"/> Uploading...</> : 'Upload & Attach'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              </fieldset>
            </div>
          )}

          {/* Order line items — read-only reference styled exactly like the Order form's table, through Order Value.
              Locked for isReadOnlyUser like the rest of the page — no LR-style exception here. */}
          {selectedOrder && orderTotals && (
            <fieldset disabled={isReadOnlyUser} className="contents">
            <div className="bg-white border border-g200">
              <div className="p-[11px_16px] border-b border-g200">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g500">Order Line Items</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-g400 text-[12px]">
                  <thead className="bg-g100">
                    <tr>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400 w-8">#</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400">Product Name</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400 w-24">HSN Code</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-32 whitespace-nowrap">No of Barrels</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-24">Packing</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-24 whitespace-nowrap">Total Qty</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-28">Packing Type</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-28">Price Basis</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-right border border-g400 w-28">Unit Rate ({orderTotals.isINR ? '₹' : '$'})</th>
                      {orderTotals.isINR && <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-20">GST %</th>}
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-right border border-g400 w-28">Amount ({orderTotals.isINR ? '₹' : '$'})</th>
                      <th className="w-8 border border-g400"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i, idx) => {
                      const packNum = parseFloat(i.packing || '');
                      const totalQty = i.qty > 0 && packNum > 0 ? i.qty * packNum : null;
                      return (
                        <tr key={i.seq} className="hover:bg-g50/50">
                          <td className="px-3 py-[5px] border border-g400 align-middle font-mono font-bold text-g400 text-[11px]">{i.seq}</td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <ProductSearch
                              value={i.desc}
                              names={productNames}
                              hsnMap={productHsnMap}
                              onChange={(desc, hsn) => {
                                const ni = [...items];
                                const resolvedHsn = !desc ? '' : (hsn !== undefined ? hsn : (desc in productHsnMap ? productHsnMap[desc] : undefined));
                                ni[idx] = { ...ni[idx], desc, ...(resolvedHsn !== undefined ? { hsn: resolvedHsn } : {}) };
                                setItems(ni);
                              }}
                            />
                          </td>
                          <td className={`px-3 py-[5px] border border-g400 align-middle${i.desc in productHsnMap ? ' bg-g100' : ''}`}>
                            <input
                              type="text"
                              title="HSN Code"
                              value={i.hsn || ''}
                              readOnly={i.desc in productHsnMap}
                              onChange={e => updateItem(idx, 'hsn', e.target.value)}
                              className={`w-full bg-transparent outline-none font-mono text-[11px] ${i.desc in productHsnMap ? 'text-g500 cursor-default select-none' : 'text-blk'}`}
                            />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <input type="number" min="1" value={i.qty || ''} onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                              className={`w-full bg-transparent outline-none font-mono text-[12px] text-center ${Number(i.qty) <= 0 ? 'text-red-mrt' : 'text-blk'}`} />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <input type="text" value={i.packing || ''} onChange={e => updateItem(idx, 'packing', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-center text-blk" />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle bg-g100 text-center font-mono text-[11px] text-g500">{totalQty ?? '—'}</td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <OptionSearch
                              options={packingTypeOptions}
                              value={i.packingType || ''}
                              onChange={val => updateItem(idx, 'packingType', val)}
                              placeholder="Packing type…"
                              freeText
                            />
                          </td>
                          <td className="px-1 py-[3px] border border-g400 align-middle">
                            <select value={i.priceBasis || 'Per kg'} onChange={e => updateItem(idx, 'priceBasis', e.target.value)} className="w-full bg-transparent outline-none font-sans text-[11px] text-blk text-center cursor-pointer">
                              {['Per kg', 'Per MT', 'Per Ltr', 'Per KL', 'Per Unit', 'Per Drum', 'Per Can'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                          <td className="px-[6px] py-[5px] border border-g400 align-middle">
                            <div className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={!!i.rateOverride}
                                onChange={e => updateItem(idx, 'rateOverride', e.target.checked)}
                                title="Override rate with text"
                                className="accent-red-600 shrink-0 cursor-pointer"
                              />
                              {i.rateOverride ? (
                                <input
                                  type="text"
                                  value={i.rateText || ''}
                                  placeholder="Regret"
                                  onChange={e => updateItem(idx, 'rateText', e.target.value)}
                                  className="flex-1 bg-transparent outline-none font-mono text-[11px] text-red-mrt placeholder:text-g400 min-w-0"
                                />
                              ) : (
                                <input type="number" step="any" min="0" value={i.agreedRate || ''} placeholder="0.00" onChange={e => updateItem(idx, 'agreedRate', Number(e.target.value))}
                                  className="flex-1 bg-transparent outline-none font-mono text-[12px] text-right text-blk placeholder:text-g300 min-w-0" />
                              )}
                            </div>
                          </td>
                          {orderTotals.isINR && (
                            <td className="px-3 py-[5px] border border-g400 align-middle">
                              <select value={i.gst} onChange={e => updateItem(idx, 'gst', Number(e.target.value))} className="w-full bg-transparent outline-none text-[12px] text-center font-mono text-blk appearance-none cursor-pointer">
                                <option value={18}>18%</option><option value={12}>12%</option><option value={5}>5%</option><option value={0}>0%</option>
                              </select>
                            </td>
                          )}
                          <td className="px-3 py-[5px] border border-g400 align-middle text-right font-mono text-[12px] font-bold text-blk">{formatINR(i.total)}</td>
                          <td className="px-1 py-[5px] border border-g400 align-middle">
                            <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="text-g400 hover:text-red-mrt p-1 transition-colors disabled:opacity-30" title="Remove">
                              <svg viewBox="0 0 16 16" width="13" height="13" className="fill-current"><path d="M5.5 1h5v1h-5V1zM3 3v1h10V3H3zm1 2v9h8V5H4zm2 1h1v7H6V6zm3 0h1v7H9V6z" /></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-g200 bg-g50/50">
                      <td colSpan={orderTotals.isINR ? 11 : 10} className="px-3 py-2 text-right text-[11px] text-g500">Subtotal (before tax)</td>
                      <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk">{formatINR(orderTotals.subTotal)}</td>
                    </tr>
                    {orderTotals.isINR && (
                      <tr className="border-b border-g200 bg-g50/50">
                        <td colSpan={11} className="px-3 py-2 text-right">
                          <span className="text-[11px] text-g500">Insurance</span>
                          <button
                            type="button"
                            onClick={() => setInsurance(Math.round(orderTotals.subTotal * 0.0015 * 100) / 100)}
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
                      </tr>
                    )}
                    {orderTotals.adj.lines.filter(l => l.taxable).map(l => (
                      <tr key={l.id} className="bg-g50/50">
                        <td colSpan={orderTotals.isINR ? 11 : 10} className="px-3 py-2 text-right text-[11px] text-g500 truncate">
                          {l.label || '(unnamed)'}{l.mode === 'percent' ? ` (${l.rate}%)` : ''}{l.direction === 'deduct' ? ' −' : ''}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[12px] font-bold ${l.amount < 0 ? 'text-red-mrt' : 'text-blk'}`}>
                          {l.amount < 0 ? '−' : ''}{formatINR(Math.abs(l.amount))}
                        </td>
                      </tr>
                    ))}
                    {orderTotals.isINR && (orderTotals.adj.preNet !== 0 || orderTotals.ins > 0) && (
                      <tr className="bg-g50/50">
                        <td colSpan={11} className="px-3 py-2 text-right text-[11px] text-g600 border-t border-g100">Taxable Value</td>
                        <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk border-t border-g100">{formatINR(orderTotals.subTotal + orderTotals.ins + orderTotals.adj.preNet)}</td>
                      </tr>
                    )}
                    {orderTotals.isINR && (
                      <tr className="border-b border-g200 bg-g50/50">
                        <td colSpan={11} className="px-3 py-2 text-right text-[11px] text-g500">GST Total</td>
                        <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk">{formatINR(orderTotals.gstTotal)}</td>
                      </tr>
                    )}
                    {orderTotals.adj.lines.filter(l => !l.taxable).map(l => (
                      <tr key={l.id} className="bg-g50/50">
                        <td colSpan={orderTotals.isINR ? 11 : 10} className="px-3 py-2 text-right text-[11px] text-g500">
                          {l.label || '(unnamed)'}{l.mode === 'percent' ? ` (${l.rate}%)` : ''}{l.direction === 'deduct' ? ' −' : ''}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[12px] font-bold ${l.amount < 0 ? 'text-red-mrt' : 'text-blk'}`}>
                          {l.amount < 0 ? '−' : ''}{formatINR(Math.abs(l.amount))}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#1e293b]">
                      <td colSpan={orderTotals.isINR ? 11 : 10} className="px-3 py-2.5 text-right text-[12px] font-bold text-white">Order Value</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[13px] font-bold text-white">{formatINR(orderTotals.grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            </fieldset>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-[3px] p-[10px_14px] text-[12.5px] text-red-600 font-medium">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1 pb-2">
            {/* Save is deliberately NOT disabled for isReadOnlyUser: LR uploads on
                this page are only persisted when the form is saved (see the
                Documents Attachment comment above), so blocking Save would also
                block the one LR exception that's supposed to keep working. Every
                other field on this page is locked, so Save can only ever persist
                an LR change for this user — nothing else can have changed. */}
            <Button variant="dark" disabled={!selectedOrderId || saving} onClick={handleSubmit}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button
              variant="dark"
              disabled={!selectedOrderId || isReadOnlyUser}
              title={!existingEntryId ? 'Please save the dispatch entry first' : undefined}
              onClick={openEmailModal}
            >
              <Mail size={12} />
              Email to Client
            </Button>
            <div className="h-5 w-px bg-g200 mx-1" />
            <Button variant="secondary" onClick={() => navigate('/dispatch')}>Cancel</Button>
          </div>
        </div>
      </div>

      {showEmailModal && selectedOrder && (
        <SendEmailModal
          mode="dispatch"
          doc={{ id: existingEntryId || selectedOrderId || '', invoiceNumber } as any}
          attachments={dispatchEmailAttachments}
          customer={selectedCustomer}
          siteId={selectedOrder.siteId || undefined}
          settings={data.settings}
          defaultSignatory={data.signatories.find((s: any) => s.is_default)}
          onClose={() => setShowEmailModal(false)}
          onSent={async () => {
            // Fires only after the email actually went out — stamps the entry
            // so it moves to the Email Sent tab. A failed send never gets here.
            if (!existingEntryId) return;
            try {
              await markDispatchEmailSent(existingEntryId);
              navigate(`/dispatch?tab=emailSent&type=${type || 'delivery'}`);
            } catch (err: any) {
              setError(`Email was sent, but it could not be recorded: ${err?.message || 'unknown error'}`);
            }
          }}
        />
      )}
    </div>
  );
}
