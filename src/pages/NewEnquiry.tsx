import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { generateId, localDateStr, localDateTimeStr } from '../lib/utils';
import { Enquiry, LineItem, Urgency } from '../lib/types';
import { Button } from '../components/ui';
import { CustomerSearch } from '../components/CustomerSearch';

import { uploadToS3 } from '../lib/s3';
import { parseRfqPdf } from '../lib/rfqParser';
import { RfqMapDialog } from '../components/RfqMapDialog';

export function NewEnquiry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const { data, addEnquiry, updateEnquiry, addCustomer, stampName } = useAppStore();
  const [isSaving, setIsSaving] = useState(false);

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

  const descSuggestions = useMemo(() =>
    [...new Set(data.enquiries.flatMap(e => e.items.map(i => i.desc)).filter(Boolean))].sort(),
    [data.enquiries]);
  const matSuggestions = useMemo(() =>
    [...new Set(data.enquiries.flatMap(e => e.items.map(i => i.mat)).filter(Boolean))].sort(),
    [data.enquiries]);
  const drwgSuggestions = useMemo(() =>
    [...new Set(data.enquiries.flatMap(e => e.items.map(i => i.drwg ?? '').filter(Boolean)))].sort(),
    [data.enquiries]);

  const [date, setDate] = useState(localDateTimeStr(new Date()));
  const [src, setSrc] = useState('');
  const [custName, setCustName] = useState('');
  const [custEnqDocNo, setCustEnqDocNo] = useState('');
  const [siteId, setSiteId] = useState('');
  const [contactId, setContactId] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // True when the user has typed contact/email/phone manually — suppresses auto-fill
  const [contactManual, setContactManual] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const contactRef = useRef<HTMLDivElement>(null);
  
  const [enquiryDocs, setEnquiryDocs] = useState<{ id: string, fileName: string, file: File | null }[]>([]);
  const [drawingDocs, setDrawingDocs] = useState<{ id: string, fileName: string, file: File | null }[]>([]);
  
  const [assigned, setAssigned] = useState('Akki');
  const [reqDate, setReqDate] = useState(localDateStr(new Date(Date.now() + 86400000)));
  const [notes, setNotes] = useState('');
  
  const [urgency, setUrgency] = useState<Urgency>('Normal');

  // Beta: PDF extract
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedItems, setExtractedItems] = useState<LineItem[] | null>(null);
  const [mapDialog, setMapDialog] = useState<{ headers: string[]; rows: string[][] } | null>(null);

  const extractItemsFromPdf = async () => {
    const pdfDoc = enquiryDocs.find(d => d.file && d.fileName.toLowerCase().endsWith('.pdf'));
    if (!pdfDoc?.file) { setExtractError('Upload a PDF enquiry document first.'); return; }
    setIsExtracting(true);
    setExtractError('');
    setExtractedItems(null);
    try {
      const result = await parseRfqPdf(pdfDoc.file);
      if (result.items.length > 0) {
        // Auto-extracted successfully
        setExtractedItems(result.items);
        // Also show map button if confidence is low
        if (result.confidence < 0.75) {
          setExtractError(`Low confidence (${Math.round(result.confidence * 100)}%) — review carefully or use Map Columns.`);
        }
      } else {
        // Nothing extracted — open map dialog directly
        setMapDialog({ headers: result.rawHeaders, rows: result.rawRows });
      }
    } catch (err: any) {
      setExtractError(err.message || 'Extraction failed.');
    } finally {
      setIsExtracting(false);
    }
  };

  const applyExtractedItems = () => {
    if (!extractedItems) return;
    setItems(extractedItems.map((it, i) => ({ ...it, seq: i + 1 })));
    setExtractedItems(null);
    setExtractError('');
    markDirty();
  };

  const [items, setItems] = useState<LineItem[]>([
    { seq: 1, desc: '', mat: '', qty: 1, uom: 'pcs', drwg: '' }
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
        setAssigned(e.assigned || 'Akki');
        setNotes(e.notes || '');
        setItems(e.items);
        
        // Split existing attachments
        if (e.attachments) {
            setEnquiryDocs(e.attachments
                .filter(a => !a.fileName.toLowerCase().includes('drawing'))
                .map(a => ({ id: a.id, fileName: a.fileName, file: null })));
            setDrawingDocs(e.attachments
                .filter(a => a.fileName.toLowerCase().includes('drawing'))
                .map(a => ({ id: a.id, fileName: a.fileName, file: null })));
        }
        
        const c = data.customers.find(x => x.name === e.cust);
        if (c) {
          // Additional phone lookup if needed
        }
      }
    } else {
      hydratedKey.current = key;
      setEnqId(generateId('ENQ', data.enquiries.map(e => e.id)));
    }
  }, [editId, data.enquiries, data.customers]);

  // Handle file uploads
  // Auto-fill effect
  useEffect(() => {
    if (!custName) return;
    const customer = data.customers.find(c => c.name === custName);
    if (!customer) return;

    const sites = customer.sites ?? [];
    if (siteId) {
      const site = sites.find(s => s.id === siteId);
      if (site) {
        const contacts = site.contacts ?? [];
        // Only auto-fill when user selected a contact from the dropdown — never
        // auto-pick primary/first contact, as that overwrites manually typed values.
        if (contactId && !contactManual) {
          const c = contacts.find(ct => ct.id === contactId);
          if (c) {
            setContact(c.name);
            setEmail(c.email);
            setPhone(c.phone || '');
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'enquiry' | 'drawing') => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files) as File[];
      const newFiles = filesArray.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        fileName: type === 'drawing' && !file.name.toLowerCase().includes('drawing') ? `(Drawing) ${file.name}` : file.name,
        file
      }));
      
      if (type === 'enquiry') {
        setEnquiryDocs([...enquiryDocs, ...newFiles]);
      } else {
        setDrawingDocs([...drawingDocs, ...newFiles]);
      }
    }
  };

  const removeAttachment = (id: string, type: 'enquiry' | 'drawing') => {
    if (type === 'enquiry') {
        setEnquiryDocs(enquiryDocs.filter(a => a.id !== id));
    } else {
        setDrawingDocs(drawingDocs.filter(a => a.id !== id));
    }
  };

  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { seq: items.length + 1, desc: '', mat: '', qty: 1, uom: 'pcs', drwg: '' }]);
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
      // Upload new attachments to S3
      const allDocs = [...enquiryDocs, ...drawingDocs];
      const uploadedAttachments = await Promise.all(
        allDocs.map(async (a) => {
          if (!a.file) {
            // Already uploaded (edit mode)
            const existingEnq = data.enquiries.find(ex => ex.id === editId);
            const existingAtt = existingEnq?.attachments?.find(att => att.id === a.id);
            return existingAtt || { id: a.id, fileName: a.fileName, storagePath: '', uploadedAt: new Date().toISOString() };
          }
          
          try {
            const safeName = a.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `enquiries/${enqId}/${a.id}_${safeName}`;
            const s3Path = await uploadToS3(a.file, path);
            
            return {
              id: a.id,
              fileName: a.fileName,
              storagePath: s3Path || `local/${a.fileName}`, // Fallback path if S3 fails
              uploadedAt: new Date().toISOString()
            };
          } catch (uploadError) {
            console.error("Failed to upload attachment:", a.fileName, uploadError);
            return {
              id: a.id,
              fileName: a.fileName,
              storagePath: `upload-failed/${a.fileName}`,
              uploadedAt: new Date().toISOString()
            };
          }
        })
      );
      
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
        phone,
        urg: urgency,
        status: editId ? (data.enquiries.find(x => x.id === editId)?.status || 'New') : 'New',
        assigned,
        doer: editId ? (data.enquiries.find(x => x.id === editId)?.doer) : stampName(),
        notes,
        ageH: editId ? (data.enquiries.find(x => x.id === editId)?.ageH || 0) : 0,
        qRef: editId ? (data.enquiries.find(x => x.id === editId)?.qRef || null) : null,
        items,
        attachments: uploadedAttachments
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
      if (andQuote) navigate(`/quotes/new?enqRef=${enqId}`);
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

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto" onInput={markDirty} onChange={markDirty}>
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
                  <select value={src} onChange={e => { setSrc(e.target.value); setErrors({...errors, src: ''}) }} className={`w-full font-sans text-[13px] text-blk bg-white border ${errors.src ? 'border-red-mrt focus:ring-red-lt' : 'border-g300 focus:border-red-mrt focus:ring-red-lt'} rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:ring-[3px]`}>
                    <option value="">Select...</option>
                    <option>Email</option><option>Phone</option><option>WhatsApp</option><option>Exhibition</option><option>Website</option><option>Walk-in</option><option>Referral</option>
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
                    onChange={name => { setCustName(name); setSiteId(''); setContactId(''); setContact(''); setEmail(''); setPhone(''); setContactManual(false); setErrors({...errors, custName: ''}); }}
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
                  <input type="tel" placeholder="+91 98XXX XXXXX" value={phone} onChange={e => { setContactManual(true); setPhone(e.target.value); }} className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Email</label>
                  <input type="email" placeholder="contact@company.com" value={email} onChange={e => { setContactManual(true); setEmail(e.target.value); }} className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-g200">
              <div className="p-[11px_18px] border-b border-g200"><span className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-g500">Line Items <span className="text-red-mrt">*</span></span></div>
              <div className="p-[10px_12px]">
                <datalist id="enq-desc-list">{descSuggestions.map(s => <option key={s} value={s} />)}</datalist>
                <datalist id="enq-mat-list">{matSuggestions.map(s => <option key={s} value={s} />)}</datalist>
                <datalist id="enq-drwg-list">{drwgSuggestions.map(s => <option key={s} value={s} />)}</datalist>
                <datalist id="enq-uom-list"><option value="pcs"/><option value="sets"/><option value="pairs"/><option value="nos"/><option value="lot"/><option value="kg"/><option value="grams"/><option value="tonnes"/><option value="litre"/><option value="ml"/><option value="metre"/><option value="mm"/><option value="ft"/><option value="sqm"/><option value="sqft"/><option value="rolls"/><option value="sheets"/><option value="boxes"/></datalist>
                <div className="overflow-x-auto">
                  {errors.items && <div className="text-red-mrt text-[11px] font-medium mb-2">{errors.items}</div>}
                  <table className="w-full border-collapse border border-g400 text-[12px]">
                    <thead className="bg-g100">
                      <tr>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-left border border-g400 w-6">#</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-red-mrt px-2 py-1.5 text-left border border-g400 min-w-[200px]">Description *</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-left border border-g400 w-[110px]">Material / Grade</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-red-mrt px-2 py-1.5 text-center border border-g400 w-14">Qty *</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-center border border-g400 w-[88px]">UOM</th>
                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-left border border-g400 w-24">Dwg Ref</th>
                        <th className="w-8 border border-g400"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.seq} className="hover:bg-g50/50">
                          <td className="px-2 py-[5px] border border-g400 align-middle font-mono font-bold text-g400 text-[11px]">{item.seq}</td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <input type="text" list="enq-desc-list" placeholder="e.g. PHE Gaskets" value={item.desc} onChange={e => { updateItem(idx, 'desc', e.target.value); setErrors({...errors, items: ''}) }} className={`w-full bg-transparent outline-none text-[12px] font-sans placeholder:text-g300 ${errors.items && !item.desc ? 'text-red-mrt' : 'text-blk'}`} />
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <input type="text" list="enq-mat-list" placeholder="e.g. NBR 70 Shore A" value={item.mat} onChange={e => updateItem(idx, 'mat', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-blk placeholder:text-g300" />
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle text-center">
                            <input type="number" min="1" value={item.qty || ""} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); setErrors({...errors, items: ''}) }} className={`w-full bg-transparent outline-none font-mono text-[12px] text-center placeholder:text-g300 ${errors.items && Number(item.qty) <= 0 ? 'text-red-mrt' : 'text-blk'}`} placeholder="0" />
                          </td>
                          <td className="px-1 py-[3px] border border-g400 align-middle">
                            <input list="enq-uom-list" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} placeholder="uom" className="w-full bg-g50 border border-g300 rounded-[3px] px-1.5 py-[3px] font-mono text-[11px] text-blk outline-none cursor-pointer focus:border-red-mrt focus:bg-white transition-colors" />
                          </td>
                          <td className="px-2 py-[5px] border border-g400 align-middle">
                            <input type="text" list="enq-drwg-list" placeholder="Dwg no." value={item.drwg} onChange={e => updateItem(idx, 'drwg', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-blk placeholder:text-g300" />
                          </td>
                          <td className="px-1 py-[5px] border border-g400 align-middle">
                            <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="text-g400 hover:text-red-mrt p-1 transition-colors disabled:opacity-30" title="Remove">
                              <svg viewBox="0 0 16 16" width="13" height="13" className="fill-current"><path d="M5.5 1h5v1h-5V1zM3 3v1h10V3H3zm1 2v9h8V5H4zm2 1h1v7H6V6zm3 0h1v7H9V6z"/></svg>
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
              </div>
            </div>

            <div className="bg-white border border-g200 p-[18px_20px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200">Assignment & Notes</div>
              <div className="grid grid-cols-2 gap-[12px]">
                <div>
                  <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Assigned To</label>
                  <select title="Assigned To" value={assigned} onChange={e => setAssigned(e.target.value)} className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt">
                    <option>Support</option><option>Sales Team</option><option>Technical</option>
                  </select>
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

            <div className="bg-white border border-g200 p-[16px_18px] rounded-[3px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200">Enquiry Documents</div>
              <div className="border-2 border-dashed border-g200 rounded-[3px] p-4 text-center hover:border-red-mrt/30 transition-colors bg-g50 group cursor-pointer relative">
                <input type="file" multiple onChange={e => handleFileUpload(e, 'enquiry')} className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-g200 group-hover:border-red-mrt group-hover:text-red-mrt transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <div className="text-[11px] font-medium text-blk">Upload Docs (PDF, DOCX)</div>
                </div>
              </div>

              {enquiryDocs.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  {enquiryDocs.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-g100 rounded-[3px] border border-g200">
                      <span className="text-[10px] font-medium truncate">{a.fileName}</span>
                      <button onClick={() => removeAttachment(a.id, 'enquiry')} className="text-red-mrt p-1 hover:bg-red-mrt/10 rounded"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── AI Extract panel — auto-fill items from an uploaded PDF ── */}
              {enquiryDocs.some(d => d.file && d.fileName.toLowerCase().endsWith('.pdf')) && (
                <div className="mt-3 border border-dashed border-amber-300 bg-amber-50 rounded-[3px] p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-amber-700">Auto-fill Items from PDF</span>
                  </div>
                  <p className="text-[10px] text-amber-700 mb-2 leading-relaxed">Scans the uploaded PDF and extracts line items automatically. Review before applying.</p>

                  <button
                    type="button"
                    onClick={extractItemsFromPdf}
                    disabled={isExtracting}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[11px] font-bold rounded-[3px] transition-colors flex items-center justify-center gap-2"
                  >
                    {isExtracting
                      ? <><svg className="animate-spin w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4"/></svg>Extracting items...</>
                      : '⚡ Extract Items from PDF'
                    }
                  </button>

                  {extractError && (
                    <p className="mt-2 text-[10px] text-red-600 font-medium bg-red-50 border border-red-200 rounded px-2 py-1">{extractError}</p>
                  )}

                  {extractedItems && (
                    <div className="mt-3 border border-amber-300 rounded-[3px] overflow-hidden">
                      <div className="bg-amber-100 px-3 py-2 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-amber-800">{extractedItems.length} item{extractedItems.length !== 1 ? 's' : ''} found — review before applying</span>
                      </div>
                      <div className="max-h-[200px] overflow-y-auto divide-y divide-amber-100">
                        {extractedItems.map((it, i) => (
                          <div key={i} className="px-3 py-2 text-[10.5px] flex items-start gap-2">
                            <span className="font-mono text-amber-500 shrink-0 w-5">{it.seq}.</span>
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-blk">{it.desc}</span>
                              {it.mat && <span className="ml-1.5 text-g400 font-mono text-[9px]">[{it.mat}]</span>}
                            </div>
                            <span className="shrink-0 text-g600 font-mono text-[10px]">{it.qty} {it.uom}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 p-2 bg-amber-50 border-t border-amber-200">
                        <button type="button" onClick={applyExtractedItems} className="flex-1 py-1.5 bg-blk text-white text-[11px] font-bold rounded-[3px] hover:bg-g700 transition-colors">
                          Apply to Items Table
                        </button>
                        <button type="button" onClick={() => setExtractedItems(null)} className="px-3 py-1.5 bg-white border border-g300 text-[11px] text-g600 font-semibold rounded-[3px] hover:bg-g100 transition-colors">
                          Discard
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Map columns manually */}
                  {!extractedItems && !isExtracting && (
                    <button
                      type="button"
                      onClick={async () => {
                        const pdfDoc = enquiryDocs.find(d => d.file && d.fileName.toLowerCase().endsWith('.pdf'));
                        if (!pdfDoc?.file) return;
                        setIsExtracting(true);
                        try {
                          const result = await parseRfqPdf(pdfDoc.file);
                          setMapDialog({ headers: result.rawHeaders, rows: result.rawRows });
                        } catch { /* ignore */ }
                        finally { setIsExtracting(false); }
                      }}
                      className="mt-2 w-full py-1.5 bg-white border border-amber-300 text-amber-700 text-[10.5px] font-semibold rounded-[3px] hover:bg-amber-50 transition-colors"
                    >
                      Map Columns Manually
                    </button>
                  )}
                  {extractedItems && (
                    <button
                      type="button"
                      onClick={async () => {
                        const pdfDoc = enquiryDocs.find(d => d.file && d.fileName.toLowerCase().endsWith('.pdf'));
                        if (!pdfDoc?.file) return;
                        try {
                          const result = await parseRfqPdf(pdfDoc.file);
                          setMapDialog({ headers: result.rawHeaders, rows: result.rawRows });
                        } catch { /* ignore */ }
                      }}
                      className="mt-2 w-full py-1.5 bg-white border border-amber-300 text-amber-700 text-[10.5px] font-semibold rounded-[3px] hover:bg-amber-50 transition-colors"
                    >
                      Map Columns Manually
                    </button>
                  )}
                </div>
              )}

              {/* Map dialog */}
              {mapDialog && (
                <RfqMapDialog
                  headers={mapDialog.headers}
                  rows={mapDialog.rows}
                  onApply={mapped => { setItems(mapped); setMapDialog(null); setExtractedItems(null); setExtractError(''); markDirty(); }}
                  onClose={() => setMapDialog(null)}
                />
              )}
            </div>

            <div className="bg-white border border-g200 p-[16px_18px] rounded-[3px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200">Technical Drawings</div>
              <div className="border-2 border-dashed border-g200 rounded-[3px] p-4 text-center hover:border-red-mrt/30 transition-colors bg-g50 group cursor-pointer relative">
                <input type="file" multiple onChange={e => handleFileUpload(e, 'drawing')} className="absolute inset-0 opacity-0 cursor-pointer" />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-g200 group-hover:border-red-mrt group-hover:text-red-mrt transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <div className="text-[11px] font-medium text-blk">Upload Drawings (PDF, DWG)</div>
                </div>
              </div>

              {drawingDocs.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  {drawingDocs.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-g100 rounded-[3px] border border-g200">
                      <span className="text-[10px] font-medium truncate">{a.fileName}</span>
                      <button onClick={() => removeAttachment(a.id, 'drawing')} className="text-red-mrt p-1 hover:bg-red-mrt/10 rounded"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>
                  ))}
                </div>
              )}
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
          {isSaving ? 'Uploading...' : 'Save Enquiry'}
        </Button>
        <Button variant="dark" onClick={() => handleSave(true)} disabled={isSaving}>
          {isSaving ? 'Uploading...' : 'Save & Create Quote'}
        </Button>
        <Button variant="secondary" onClick={() => { if (confirmLeave()) navigate('/enquiries'); }} disabled={isSaving}>Cancel</Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {errors.global && <div className="ml-4 text-red-mrt text-[11px] font-bold">{errors.global}</div>}
      </div>
    </div>
  );
}
