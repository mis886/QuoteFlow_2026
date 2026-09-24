import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { generateId, localDateStr, localDateTimeStr } from '../lib/utils';
import { normalizeIndianPhone } from '../lib/phone';
import { Enquiry, LineItem, Urgency, CustomerTier } from '../lib/types';
import { Button } from '../components/ui';
import { CustomerSearch } from '../components/CustomerSearch';
import { ProductSearch } from '../components/ProductSearch';
import { OptionSearch } from '../components/OptionSearch';
import { usePackingTypes } from '../hooks/usePackingTypes';
import { useProductCatalog } from '../hooks/useProductCatalog';

import { syncContactToCustomer } from '../lib/contactSync';

const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";

export function NewEnquiry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const { data, user, addEnquiry, updateEnquiry, addCustomer, stampName, refreshData, resolvedSignatory } = useAppStore();
  const packingTypeOptions = usePackingTypes();
  const { names: productNames, hsnMap: productHsnMap } = useProductCatalog();
  const [isSaving, setIsSaving] = useState(false);
  const [contactSyncMsg, setContactSyncMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!contactSyncMsg) return;
    const t = setTimeout(() => setContactSyncMsg(null), 6000);
    return () => clearTimeout(t);
  }, [contactSyncMsg]);

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


  const [date, setDate] = useState(localDateTimeStr(new Date()));
  const [src, setSrc] = useState('');
  const [custName, setCustName] = useState('');
  const [custEnqDocNo, setCustEnqDocNo] = useState('');
  const [siteId, setSiteId] = useState('');
  const [contactId, setContactId] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneAnomaly, setPhoneAnomaly] = useState(false);
  // True when the user has typed contact/email/phone manually — suppresses auto-fill
  const [contactManual, setContactManual] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  
  
  const [assigned, setAssigned] = useState('Sales Team');
  const [customerTier, setCustomerTier] = useState<CustomerTier | ''>('');
  // Auto-derived from resolvedSignatory for a new enquiry, or hydrated
  // read-only from the saved record when editing — see the effects below.
  // No longer user-editable; kept as plain state (not resolvedSignatory
  // read directly in JSX) so submit/PDF/DOCX/email code downstream is
  // unaffected.
  const [authName, setAuthName] = useState('');
  const [authDesignation, setAuthDesignation] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [reqDate, setReqDate] = useState(localDateStr(new Date(Date.now() + 86400000)));
  const [notes, setNotes] = useState('');
  const [managementNotes, setManagementNotes] = useState('');
  
  const [urgency, setUrgency] = useState<Urgency>('Normal');

  const [items, setItems] = useState<LineItem[]>([
    { seq: 1, desc: '', mat: '', qty: 1, uom: 'pcs', drwg: '', hsn: '', packing: '', packingType: '' }
  ]);
  
  const [enqId, setEnqId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Hydrate the form ONCE per enquiry. Guards against a background data refresh
  // (e.g. Supabase token refresh on tab focus) re-running this effect and wiping
  // the user's unsaved edits.
  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    const key = editId ? `edit:${editId}` : 'new';
    if (hydratedKey.current === key) return;
    if (editId) {
      const e = data.enquiries.find(x => x.id === editId);
      if (e) {
        hydratedKey.current = key;
        setEnqId(e.id);
        setDate(localDateTimeStr(new Date(e.recv)));
        setSrc(e.src);
        setCustName(e.cust);
        setCustEnqDocNo(e.custEnqDocNo || '');
        setSiteId(e.siteId || '');
        setContactId(e.contactId || '');
        setContact(e.contact || '');
        setEmail(e.email || '');
        setPhone(e.phone || '');
        setContactManual(false);
        setUrgency(e.urg);
        setAssigned(e.assigned || 'Sales Team');
        setCustomerTier(e.customerTier || '');
        // Read-only display of whatever was actually saved on this record —
        // does not re-resolve to the current viewer's signatory, so opening
        // an old enquiry from a different logged-in account doesn't silently
        // rewrite its history.
        setAuthName(e.authorizedPerson?.name || '');
        setAuthDesignation(e.authorizedPerson?.designation || '');
        setAuthPhone(e.authorizedPerson?.phone || '');
        setNotes(e.notes || '');
        setManagementNotes(e.managementNotes || '');
        setItems(e.items);
        
        const c = data.customers.find(x => x.name === e.cust);
        if (c && !e.customerTier) setCustomerTier(c.tier || '');
      }
    } else {
      hydratedKey.current = key;
      setEnqId(generateId('ENQ', data.enquiries.map(e => e.id)));
    }
  }, [editId, data.enquiries, data.customers]);

  // New enquiry only: keep the (locked, read-only) Authorized Signatory
  // fields in sync with the logged-in user's resolved signatory. Separate
  // from the hydrate effect above since resolvedSignatory can settle after
  // mount (data.signatories loading, or — for sales@ — the name+PIN gate
  // completing), and this must pick that up rather than freeze at whatever
  // resolvedSignatory was on the first render.
  useEffect(() => {
    if (editId) return;
    if (resolvedSignatory.status === 'resolved') {
      setAuthName(resolvedSignatory.name);
      setAuthDesignation(resolvedSignatory.designation);
      setAuthPhone(resolvedSignatory.phone);
    } else {
      setAuthName('');
      setAuthDesignation('');
      setAuthPhone('');
    }
  }, [editId, resolvedSignatory]);

  // Handle file uploads
  // Auto-fill effect
  useEffect(() => {
    if (!custName) return;
    const customer = data.customers.find(c => c.name === custName);
    if (!customer) return;

    if (!editId) setCustomerTier(customer.tier || '');

    const sites = customer.sites ?? [];
    if (siteId) {
      const site = sites.find(s => s.id === siteId);
      if (site) {
        const contacts = site.contacts ?? [];
        // 2026-09-11: the "re-resolve contact by id" branch that used to live
        // here (`if (contactId && !contactManual) { ...overwrite contact/
        // email/phone from data.customers... }`) was removed — it was a
        // live-join, not a snapshot. It ran on every render where custName/
        // siteId/contactId change, which includes the hydrate effect above
        // setting them from the saved enquiry's own contactId — so reopening
        // an existing enquiry for edit would silently overwrite the just-
        // hydrated contact/email/phone with whatever the CUSTOMER record
        // currently holds, clobbering the historical snapshot the moment the
        // customer's contact details were ever edited afterward (violates
        // the "snapshot at selection time, never rewrite saved records"
        // rule). It was also fully redundant for the interactive case — the
        // contact-picker dropdown below already sets contact/email/phone
        // directly on click, same as the "auto-pick primary contact" branch
        // below already does when setting contactId for the first time.
        if (!editId && !contactId && !contactManual) {
          const pc = (contacts as any[]).find((ct: any) => ct.isPrimary)
            || (contacts as any[]).find((ct: any) => ct.email || ct.phone || ct.name)
            || contacts[0];
          if (pc && (pc.name || pc.email || pc.phone)) {
            setContactId(pc.id); setContact(pc.name || ''); setEmail(pc.email || ''); setPhone(pc.phone || '');
          }
        }
      }
    } else {
      // Only auto-fill when there is exactly one site — if multiple exist the
      // doer must pick manually to avoid mismatched entries.
      if (sites.length === 1) {
        setSiteId(sites[0].id);
      }
    }
  }, [custName, siteId, contactId, contactManual, data.customers]);

  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { seq: items.length + 1, desc: '', mat: '', qty: 1, uom: 'pcs', drwg: '', hsn: '', packing: '', packingType: '' }]);
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, seq: i + 1 })));

  const handleSave = async (andQuote = false) => {
    const newErrors: Record<string, string> = {};
    if (!src) newErrors.src = 'Source is required';
    if (!custName) newErrors.custName = 'Customer is required';
    
    // Validate line items
    let itemHasError = false;
    const validatedItems = items.map(item => {
      if (!item.desc || Number(item.qty) <= 0) {
        itemHasError = true;
      }
      return item;
    });

    if (itemHasError) {
      newErrors.items = 'All items must have a description and valid quantity > 0';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return; 
    }

    setIsSaving(true);
    
    try {
      // Store exact date as iso string for age calculation
      const isoDate = new Date(date).toISOString();

      const enqData: Enquiry = {
        id: enqId,
// ... rest of lines

        recv: isoDate,
        src,
        cust: custName,
        custEnqDocNo,
        siteId,
        contactId,
        contact,
        email,
        phone: normalizeIndianPhone(phone).value,
        urg: urgency,
        status: editId ? (data.enquiries.find(x => x.id === editId)?.status || 'New') : 'New',
        assigned,
        doer: editId ? (data.enquiries.find(x => x.id === editId)?.doer) : stampName(),
        created_by: editId ? (data.enquiries.find(x => x.id === editId)?.created_by ?? null) : (user?.email ?? null),
        notes,
        managementNotes: managementNotes.trim() || undefined,
        ...(authName ? { authorizedPerson: { name: authName, designation: authDesignation, phone: authPhone } } : {}),
        ...(customerTier ? { customerTier } : {}),
        ageH: editId ? (data.enquiries.find(x => x.id === editId)?.ageH || 0) : 0,
        qRef: editId ? (data.enquiries.find(x => x.id === editId)?.qRef || null) : null,
        items,
      };

      if (editId) {
        await updateEnquiry(editId, enqData);
      } else {
        await addEnquiry(enqData);
      }

      // Auto-create customer if it doesn't exist
      if (!data.customers.find(c => c.name.toLowerCase() === custName.toLowerCase())) {
        await addCustomer({
          id: generateId('CUST', data.customers.map(c => c.id)),
          code: generateId('CUS', data.customers.map(c => c.code)),
          name: custName,
          seg: 'General',
          gstin: '',
          inco: 'Ex-Works',
          curr: 'INR',
          pay: '30 days',
          sites: [
            {
              id: 'SITE-' + Math.random().toString(36).substr(2, 5),
              name: 'Head Office',
              city: '',
              contacts: [
                { id: 'CONT-' + Math.random().toString(36).substr(2, 5), name: contact, role: 'Contact', email: email, phone: phone, isPrimary: true }
              ]
            }
          ]
        });
      }

      setDirty(false);   // persisted — no longer unsaved
      await refreshData();

      // Background contact sync — silently update customer profile
      let contactFull = false;
      try {
        const syncResult = await syncContactToCustomer(custName, contact, phone, email, data.customers);
        if (syncResult.action === 'full') { setContactSyncMsg(syncResult.message); contactFull = true; }
      } catch (e) { console.error('Contact sync failed:', e); }

      if (andQuote) navigate(`/quotes/new?enqRef=${enqId}`);
      else if (contactFull) setTimeout(() => navigate('/enquiries'), 4000);
      else navigate('/enquiries');
    } catch (error: any) {
      console.error("Failed to save enquiry:", error);
      setErrors({ global: 'Failed to save enquiry: ' + (error?.message || 'Unknown error') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Enquiry Module</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">{editId ? 'Edit' : 'Log'} <em className="italic text-red-mrt">{editId ? 'Enquiry' : 'New Enquiry'}</em></h1>
            <p className="text-xs text-g500 mt-1 font-light">{editId ? `Updating record ${editId}` : 'Capture all requirements with individual line items.'}</p>
          </div>
          <Button variant="secondary" onClick={() => { if (confirmLeave()) navigate('/enquiries'); }}>Back</Button>
        </div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto" onChange={markDirty}>
        <div className="bg-blk p-[9px_14px] rounded-[3px] inline-flex items-center gap-[12px] mb-[18px]">
          <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-white/30">Auto ENQ No.</div>
          <div className="font-mono text-[14px] font-bold text-white">{enqId}</div>
          <div className="font-mono text-[9px] text-white/20">{editId ? 'Existing Record' : 'Generated on save'}</div>
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-[14px] items-start">
          <div className="flex flex-col gap-[14px]">
            <div className="bg-white border border-g200 p-[18px_20px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200">Receipt Information</div>
              <div className="grid grid-cols-2 gap-[12px]">
                <div>
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Date & Time Received <span className="text-red-mrt">*</span></label>
                  <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Cust. Enquiry Doc No.</label>
                  <input type="text" placeholder="Ref/2024/01..." value={custEnqDocNo} onChange={e => setCustEnqDocNo(e.target.value)} className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Source <span className="text-red-mrt">*</span></label>
                  <select value={src} onChange={e => { setSrc(e.target.value); setErrors(prev => ({...prev, src: ''})); }} onFocus={() => setContactOpen(false)} className={`w-full font-sans text-[13px] text-blk bg-white border ${errors.src ? 'border-red-mrt focus:ring-red-lt' : 'border-g300 focus:border-red-mrt focus:ring-red-lt'} rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:ring-[3px]`}>
                    <option value="">Select...</option>
                    <option>Email</option><option>Phone</option><option>WhatsApp</option><option>Exhibition</option><option>Website</option><option>Walk-in</option><option>Referral</option><option>IndiaMART</option><option>Meta Ads</option><option>LinkedIn</option>
                  </select>
                  {errors.src && <div className="text-red-mrt text-[10px] mt-1 font-medium">{errors.src}</div>}
                </div>
              </div>
            </div>

            <div className="bg-white border border-g200 p-[18px_20px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200">Customer & Contact</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Customer <span className="text-red-mrt">*</span></label>
                  <CustomerSearch
                    customers={data.customers}
                    value={custName}
                    onChange={name => { setCustName(name); setSiteId(''); setContactId(''); setContact(''); setEmail(''); setPhone(''); setContactManual(false); setErrors({...errors, custName: ''}); const _cust = data.customers.find(c => c.name === name); setCustomerTier(_cust?.tier || ''); }}
                    error={!!errors.custName}
                  />
                  {errors.custName && <div className="text-red-mrt text-[10px] mt-1 font-medium">{errors.custName}</div>}
                </div>
                <div>
                  {(() => {
                    const custSites = data.customers.find(c => c.name === custName)?.sites ?? [];
                    const mustPick = custName && custSites.length > 1 && !siteId;
                    return (
                      <>
                        <label className="block text-[10px] font-bold tracking-[0.5px] uppercase mb-[4px] flex items-center gap-1.5">
                          <span className={mustPick ? 'text-red-mrt' : 'text-g600'}>Unit</span>
                          {mustPick && <span className="text-[9px] font-bold text-red-mrt">— Select required</span>}
                        </label>
                        <select
                          title="Unit"
                          value={siteId}
                          onChange={e => { setSiteId(e.target.value); setContactId(''); setContact(''); setEmail(''); setPhone(''); setContactManual(false); }}
                          disabled={!custName}
                          className={`w-full font-sans text-[13px] text-blk bg-white rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt disabled:bg-g50 disabled:cursor-not-allowed border ${mustPick ? 'border-red-mrt ring-[3px] ring-red-lt' : 'border-g300'}`}
                        >
                          <option value="">{custSites.length > 1 ? 'Select Unit...' : 'Select Unit...'}</option>
                          {custSites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.city})</option>)}
                        </select>
                      </>
                    );
                  })()}
                </div>
              </div>
              {(() => {
                const canEditTier = ['mis@himalayaterpene.com', 'shishir@himalayaterpene.com'].includes((user?.email ?? '').toLowerCase());
                return (
                  <div className="mt-3">
                    <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">
                      Customer Tier
                      {!canEditTier && <span className="ml-1 text-g400 font-normal normal-case text-[10px]">(view only)</span>}
                    </label>
                    <select
                      title="Customer Tier"
                      value={customerTier}
                      disabled={!canEditTier}
                      onChange={e => setCustomerTier(e.target.value as CustomerTier | '')}
                      className={`w-40 font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <option value="">— No tier —</option>
                      <option>New</option>
                      <option>Bronze</option>
                      <option>Silver</option>
                      <option>Gold</option>
                    </select>
                  </div>
                );
              })()}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div ref={contactRef} className="relative">
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Contact Person</label>
                  {(() => {
                    const siteContacts = ((data.customers.find(c => c.name === custName)?.sites ?? []).find(s => s.id === siteId)?.contacts ?? []) as any[];
                    const filtered = siteContacts.filter(ct => !contact || ct.name.toLowerCase().includes(contact.toLowerCase()));
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
                          className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt disabled:bg-g50 disabled:cursor-not-allowed"
                        />
                        {contactOpen && siteContacts.length > 0 && (
                          <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-g200 rounded-[4px] shadow-lg max-h-[160px] overflow-y-auto">
                            {filtered.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-g400 italic">No match — name will be saved as typed</div>
                            ) : (
                              filtered.map((ct: any) => (
                                <button
                                  key={ct.id}
                                  type="button"
                                  onMouseDown={() => {
                                    setContactId(ct.id);
                                    setContact(ct.name);
                                    setEmail(ct.email || '');
                                    setPhone(ct.phone || '');
                                    setContactManual(false);
                                    setContactOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[12px] hover:bg-g50 flex items-center justify-between gap-2"
                                >
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
                  <input type="tel" placeholder="+91 98XXX XXXXX" value={phone}
                    onChange={e => { setContactManual(true); setPhone(e.target.value); setPhoneAnomaly(false); }}
                    onBlur={() => { if (phone) { const { value, anomaly } = normalizeIndianPhone(phone); setPhone(value); setPhoneAnomaly(anomaly); } }}
                    className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                  {phoneAnomaly && <p className="text-amber-600 text-[11px] mt-1">Doesn't look like a standard Indian mobile number — saved as entered</p>}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Email</label>
                  <input type="email" placeholder="contact@company.com" value={email} onChange={e => { setContactManual(true); setEmail(e.target.value); }} className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Notes from Management</label>
                <textarea
                  placeholder="Any notes from management about this customer..."
                  value={managementNotes}
                  onChange={e => setManagementNotes(e.target.value)}
                  className="w-full min-h-[68px] font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt"
                />
              </div>
            </div>

            <div className="bg-white border border-g200">
              <div className="p-[11px_18px] border-b border-g200"><span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">Line Items <span className="text-red-mrt">*</span></span></div>
              <div className="p-[10px_12px]">
                <div className="overflow-x-auto">
                  {errors.items && <div className="text-red-mrt text-[11px] font-medium mb-2">{errors.items}</div>}
                  <table className="w-full border-collapse border border-g400 text-[12px]">
                    <thead className="bg-g100">
                      <tr>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400 w-8">#</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-red-mrt px-3 py-1.5 text-left border border-g400">Product Name *</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-28 whitespace-nowrap">No of Barrels</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-24">Packing</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-24">Total Qty</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400 w-48">Packing Type</th>
                        <th className="w-8 border border-g400"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const packingNum = parseFloat(item.packing || '');
                        const totalQty = item.qty > 0 && packingNum > 0 ? item.qty * packingNum : null;
                        return (
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
                            <td className="px-3 py-[5px] border border-g400 align-middle">
                              <input type="number" min="0" value={item.qty || ''} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} className="w-full bg-transparent outline-none font-mono text-[12px] text-center text-blk" placeholder="0" />
                            </td>
                            <td className="px-3 py-[5px] border border-g400 align-middle">
                              <input type="text" value={item.packing || ''} onChange={e => updateItem(idx, 'packing', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-blk text-center" />
                            </td>
                            <td className="px-3 py-[5px] border border-g400 align-middle bg-g100 text-center">
                              {totalQty !== null
                                ? <span className="font-mono text-[11px] text-g500">{totalQty}</span>
                                : <span className="text-g300 text-[11px]">—</span>}
                            </td>
                            <td className="px-3 py-[5px] border border-g400 align-middle">
                              <OptionSearch
                                options={packingTypeOptions}
                                value={item.packingType || ''}
                                onChange={val => updateItem(idx, 'packingType', val)}
                                placeholder="Packing type…"
                                freeText
                              />
                            </td>
                            <td className="px-1 py-[5px] border border-g400 align-middle">
                              <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="text-g400 hover:text-red-mrt p-1 transition-colors disabled:opacity-30" title="Remove">
                                <svg viewBox="0 0 16 16" width="13" height="13" className="fill-current"><path d="M5.5 1h5v1h-5V1zM3 3v1h10V3H3zm1 2v9h8V5H4zm2 1h1v7H6V6zm3 0h1v7H9V6z"/></svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="inline-flex items-center gap-[6px] p-[7px_9px] text-red-mrt cursor-pointer text-[12px] font-semibold border border-dashed border-red-mrt/25 rounded-[3px] transition-colors hover:bg-red-lt" onClick={addItem}>
                  <svg viewBox="0 0 16 16" className="w-[13px] h-[13px] stroke-red-mrt fill-none stroke-2"><path d="M8 3v10M3 8h10"/></svg>
                  Add Another Line Item
                </div>
              </div>
            </div>

            <div className="bg-white border border-g200 p-[18px_20px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200">Authorized Signatory & Notes</div>
              <div className="grid grid-cols-2 gap-[12px]">
                <div className="flex flex-col gap-2">
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-[4px]">Authorized Signatory</label>
                  {/* Auto-derived from the logged-in user (resolvedSignatory) for a
                      new enquiry, or the saved record's own value when editing —
                      never manually editable, see store/index.tsx. */}
                  {!editId && resolvedSignatory.status === 'unmapped' ? (
                    <div className="text-[12px] text-red-mrt bg-red-lt border border-red-mrt/20 rounded-[3px] px-3 py-2.5">
                      No signatory mapped for this account — contact MIS.
                    </div>
                  ) : !editId && resolvedSignatory.status === 'needs-picker' ? (
                    <div className="text-[12px] text-g500 bg-g50 border border-g200 rounded-[3px] px-3 py-2.5">
                      Waiting for identity selection…
                    </div>
                  ) : authName ? (
                    <div className="text-[13px] bg-g50 border border-g200 rounded-[3px] px-3 py-2.5 space-y-0.5">
                      <div className="font-bold text-blk">{authName}</div>
                      {authDesignation && <div className="text-g500">{authDesignation}</div>}
                      {authPhone && <div className="text-g400">{authPhone}</div>}
                    </div>
                  ) : (
                    <div className="text-[12px] text-g400 italic bg-g50 border border-dashed border-g200 rounded-[3px] px-3 py-2.5">
                      No signatory on record
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Quote Required By</label>
                  <input type="date" value={reqDate} onChange={e => setReqDate(e.target.value)} className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Internal Notes</label>
                  <textarea placeholder="Context, urgency detail..." value={notes} onChange={e => setNotes(e.target.value)} className="w-full min-h-[68px] font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[14px]">
            <div className="bg-white border border-g200 p-[16px_18px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200">Urgency Level <span className="text-red-mrt">*</span></div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'Hot', color: 'border-red-mrt text-red-mrt', bg: 'bg-red-mrt', hover: 'hover:border-red-mrt hover:bg-red-mrt/5', active: 'border-red-mrt bg-red-mrt/5', label: 'Same day', sla: '4h SLA' },
                  { id: 'Urgent', color: 'border-sP text-sP', bg: 'bg-sP', hover: 'hover:border-sP hover:bg-sP/5', active: 'border-sP bg-sP/5', label: '< 24h', sla: '24h SLA' },
                  { id: 'Normal', color: 'border-sN text-sN', bg: 'bg-sN', hover: 'hover:border-sN hover:bg-sN/5', active: 'border-sN bg-sN/5', label: '< 48h', sla: '48h SLA' },
                  { id: 'Low', color: 'border-sL text-sL', bg: 'bg-sL', hover: 'hover:border-sL hover:bg-sL/5', active: 'border-sL bg-sL/5', label: '< 72h', sla: '72h SLA' },
                ].map(u => {
                  const isActive = urgency === u.id;
                  return (
                    <div key={u.id} className={`border-2 rounded-[5px] p-[9px_6px] text-center cursor-pointer transition-colors select-none ${isActive ? u.active : `border-g200 ${u.hover}`}`} onClick={() => setUrgency(u.id as Urgency)}>
                      <div><span className={`inline-block w-[9px] h-[9px] rounded-full ${u.bg} mb-[4px]`}></span></div>
                      <div className={`text-[12px] font-semibold ${u.color}`}>{u.id}</div>
                      <div className="text-[10px] text-g500 mt-[1px]">{u.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-g100 border border-g200 p-[16px_18px] rounded-[3px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600 mb-[12px] pb-[7px] border-b border-g200">SLA Guidance</div>
              <div className="text-[11.5px] text-g600 leading-[1.8]">
                <div><span className="text-red-mrt font-bold">Hot</span> -- Quote within <strong>4h</strong></div>
                <div><span className="text-sP font-bold">Urgent</span> -- Quote within <strong>24h</strong></div>
                <div><span className="text-sN font-bold">Normal</span> -- Quote within <strong>48h</strong></div>
                <div><span className="text-sL font-bold">Low</span> -- Quote within <strong>72h</strong></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-[14px_20px] bg-g100 border-t border-g200 sticky bottom-0">
        <Button variant="primary" onClick={() => handleSave(false)} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Enquiry'}
        </Button>
        <Button variant="dark" onClick={() => handleSave(true)} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save & Create Quote'}
        </Button>
        <Button variant="secondary" onClick={() => { if (confirmLeave()) navigate('/enquiries'); }} disabled={isSaving}>Cancel</Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {errors.global && <div className="ml-4 text-red-mrt text-[11px] font-bold">{errors.global}</div>}
      </div>

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
