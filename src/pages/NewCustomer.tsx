import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { Customer, Site, Contact } from '../lib/types';
import { generateId } from '../lib/utils';
import { Plus, Trash2, MapPin, User, Mail, Phone, Wand2 } from 'lucide-react';

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

export function NewCustomer() {
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const navigate = useNavigate();
  const { data, addCustomer, updateCustomer } = useAppStore();

  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [seg, setSeg] = useState('Power / Nuclear');
  const [inco, setInco] = useState('Ex-Works');
  const [curr, setCurr] = useState('INR');
  const [pay, setPay] = useState('30 days');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [sites, setSites] = useState<Site[]>([
    { id: 'S1', name: 'Main Office', city: '', contacts: [{ id: 'C1', name: '', role: 'Purchase', email: '', isPrimary: true }] }
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [parsePreview, setParsePreview] = useState<Record<number, ReturnType<typeof parseMixedAddress> | null>>({});

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
        setSeg(cust.seg || 'Power / Nuclear');
        setInco(cust.inco || 'Ex-Works');
        setCurr(cust.curr || 'INR');
        setPay(cust.pay || '30 days');
        setGstin(cust.gstin || '');
        setPan(cust.pan || '');
        setSites(cust.sites || []);
      }
    } else if (loadedFor.current !== '__new__') {
      loadedFor.current = '__new__';
      setId(generateId('CUST', data.customers.map(c => c.id)));
      setCode(generateId('CUS', data.customers.map(c => c.code)));
    }
  }, [editId, data.customers]);

  const addSite = () => {
    setSites([...sites, {
      id: 'S' + Date.now(), name: '', city: '',
      contacts: [{ id: 'C' + Date.now(), name: '', role: '', email: '', isPrimary: false }]
    }]);
  };
  const updateSite = (sIdx: number, field: keyof Site, value: any) => {
    const s = [...sites]; (s[sIdx] as any)[field] = value; setSites(s);
  };
  const removeSite = (sIdx: number) => setSites(sites.filter((_, i) => i !== sIdx));
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

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Company name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const cust: Customer = {
      id, code: code.trim().toUpperCase(), name: name.trim(),
      seg, inco, curr, pay, gstin: gstin.trim().toUpperCase(), pan: pan.trim().toUpperCase() || undefined, sites
    };
    if (editId) await updateCustomer(editId, cust);
    else await addCustomer(cust);
    navigate(-1);
  };

  const inputCls = 'w-full font-sans text-sm bg-white border border-g300 rounded-[3px] p-2 outline-none focus:border-red-mrt focus:ring-4 focus:ring-red-lt transition-all';
  const labelCls = 'block text-[10px] font-bold text-g600 uppercase tracking-wide mb-1';

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">

      {/* Sticky header */}
      <div className="bg-white border-b border-g200 sticky top-0 z-10 pt-5 px-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              {editId ? 'Edit' : 'Add'} <em className="italic text-red-mrt">Customer</em>
            </h2>
            <p className="text-xs text-g500 mt-1">
              {editId ? `Updating corporate record ${code}` : 'Create a new hierarchical customer master record.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save Record</Button>
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
              <label className={labelCls}>Customer Code</label>
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
            </div>

            <div>
              <label className={labelCls}>Segment</label>
              <select title="Segment" value={seg} onChange={e => setSeg(e.target.value)} className={inputCls}>
                <option>Power / Nuclear</option>
                <option>Sugar</option>
                <option>Chemical</option>
                <option>Valve OEM</option>
                <option>PHE OEM</option>
                <option>Defence</option>
                <option>Export</option>
                <option>General</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Company GSTIN</label>
              <input
                type="text" value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())}
                className={inputCls + ' font-mono uppercase'}
                placeholder="27AABCF5171D1ZW"
                maxLength={15}
              />
              <p className="text-[10px] text-g400 mt-1">Company-level GSTIN — for Ex-Works customers or single GSTIN covering all sites</p>
            </div>

            <div>
              <label className={labelCls}>PAN No.</label>
              <input
                type="text" value={pan} onChange={e => setPan(e.target.value.toUpperCase())}
                className={inputCls + ' font-mono'}
                placeholder="AABCM1234A"
                maxLength={10}
              />
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
                <option>Ex-Works</option>
                <option>FOB</option>
                <option>CIF</option>
                <option>FOR</option>
                <option>DDP</option>
                <option>DAP</option>
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
              <input
                type="text" value={pay} onChange={e => setPay(e.target.value)}
                className={inputCls} placeholder="e.g. 30 days net"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Sites & Contacts (full width) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="font-mono text-[10px] font-bold tracking-[1px] uppercase text-blk flex items-center gap-2">
              <MapPin size={13} className="text-red-mrt" />
              Manufacturing Units
              <span className="ml-1 px-1.5 py-0.5 bg-g200 rounded font-mono text-[9px] text-g500">{sites.length}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={addSite} className="gap-1.5">
              <Plus size={14} /> Add New Site
            </Button>
          </div>

          <div className="space-y-4">
            {sites.map((site, sIdx) => (
              <div key={site.id} className="bg-white border border-g200 rounded-[3px] shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
                <div className="bg-g50 p-4 border-b border-g200 flex items-center gap-3">
                  <MapPin size={15} className="text-red-mrt shrink-0" />
                  <input
                    type="text" value={site.name}
                    onChange={e => updateSite(sIdx, 'name', e.target.value)}
                    placeholder="Unit Name (e.g. Pune Plant)"
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
                    type="text" value={site.gstin || ''}
                    onChange={e => updateSite(sIdx, 'gstin', e.target.value.toUpperCase())}
                    placeholder="GSTIN"
                    className="bg-white border border-g300 rounded px-2 py-1 text-xs font-mono w-44 outline-none focus:border-red-mrt"
                  />
                  <button type="button" onClick={() => removeSite(sIdx)} className="text-g400 hover:text-red-mrt transition-colors p-1" title="Remove site">
                    <Trash2 size={15} />
                  </button>
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
                          {pv.gstin && <div><span className="text-g500 font-bold">GSTIN: </span><span className="text-blk font-mono">{pv.gstin}</span></div>}
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
                                if (pv.gstin && !site.gstin) updateSite(sIdx, 'gstin', pv.gstin);
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
                                placeholder="email@company.com"
                                className="w-full bg-white border border-g300 rounded pl-7 pr-2 py-1 text-xs outline-none focus:border-red-mrt"
                              />
                            </div>
                            <div className="relative flex-1">
                              <Phone size={11} className="absolute left-2.5 top-[7px] text-g400" />
                              <input
                                type="tel" value={ct.phone || ''}
                                onChange={e => updateContact(sIdx, cIdx, 'phone', e.target.value)}
                                placeholder="Phone / Mobile"
                                className="w-full bg-white border border-g300 rounded pl-7 pr-2 py-1 text-xs outline-none focus:border-red-mrt"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {sites.length === 0 && (
              <div className="text-center py-10 text-g400 text-sm border border-dashed border-g300 rounded-[3px]">
                No sites added yet. Click "Add New Site" to begin.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
