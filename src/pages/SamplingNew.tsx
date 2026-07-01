import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadPublicFile } from '../lib/supabase';
import { useAppStore } from '../store';
import { localDateStr } from '../lib/utils';
import { Button } from '../components/ui';
import { CustomerSearch } from '../components/CustomerSearch';

const UNITS = ['g', 'ml', 'kg', 'L'];

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";
const sectionHeaderCls = "font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200";

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

export function SamplingNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data } = useAppStore();

  const today = localDateStr(new Date());

  const [sentDate,     setSentDate]     = useState(today);
  const [followupDue,  setFollowupDue]  = useState(() => addDaysToDate(today, 3));
  const [courier,      setCourier]      = useState('');
  const [podFile,      setPodFile]      = useState<File | null>(null);
  const [cost,         setCost]         = useState('');
  const [cust,         setCust]         = useState(() => searchParams.get('cust') ?? '');
  const [linkedRef,    setLinkedRef]    = useState(() => searchParams.get('enqRef') ?? searchParams.get('quoteRef') ?? '');
  const [sentBy,       setSentBy]       = useState('');
  const [productName,  setProductName]  = useState('');
  const [productGrade, setProductGrade] = useState('');
  const [lotNo,        setLotNo]        = useState('');
  const [coaFile,      setCoaFile]      = useState<File | null>(null);
  const [quantity,     setQuantity]     = useState('');
  const [unit,         setUnit]         = useState('g');
  const [notes,        setNotes]        = useState('');

  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  // Auto-update follow-up date when dispatch date changes (default: sentDate + 3 days)
  useEffect(() => {
    if (sentDate) setFollowupDue(addDaysToDate(sentDate, 3));
  }, [sentDate]);

  const previewId = `SAMP-${Date.now()}`;

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!cust.trim())        errs.cust        = 'Customer is required.';
    if (!productName.trim()) errs.productName = 'Product name is required.';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    setErrors({});

    const sampleId = `SAMP-${Date.now()}`;

    // Upload POD and COA files to sample-attachments bucket
    let podUrl: string | null = null;
    let coaUrl: string | null = null;

    if (podFile) {
      const ext = podFile.name.split('.').pop() || 'bin';
      const { data: url } = await uploadPublicFile('sample-attachments', `${sampleId}/pod.${ext}`, podFile);
      podUrl = url ?? null;
    }
    if (coaFile) {
      const ext = coaFile.name.split('.').pop() || 'bin';
      const { data: url } = await uploadPublicFile('sample-attachments', `${sampleId}/coa.${ext}`, coaFile);
      coaUrl = url ?? null;
    }

    const ref    = linkedRef.trim();
    const upper  = ref.toUpperCase();
    const isQt   = upper.startsWith('HTP') || upper.startsWith('QT');

    const { error } = await supabase.from('samples').insert({
      id:              sampleId,
      cust:            cust.trim(),
      quote_ref:       (ref && isQt)  ? ref : null,
      enq_ref:         (ref && !isQt) ? ref : null,
      product_name:    productName.trim(),
      product_grade:   productGrade.trim() || null,
      lot_no:          lotNo.trim() || null,
      quantity:        parseFloat(quantity) || 0,
      unit,
      sent_date:       sentDate || null,
      followup_due:    followupDue || null,
      courier_details: courier.trim() || null,
      pod_file:        podUrl,
      coa_file:        coaUrl,
      cost:            parseFloat(cost) || 0,
      status:          'pending',
      feedback_received: false,
      sent_by:         sentBy.trim() || null,
      notes:           notes.trim() || null,
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    });

    setSaving(false);
    if (error) { setErrors({ global: error.message }); return; }
    navigate('/sampling');
  };

  const selectCls = `${inputCls} cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px]`;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Page header */}
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Sampling Module</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Log <em className="italic text-red-mrt">New Sample</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">Dispatch a sample to a new customer for evaluation.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/sampling')}>Back</Button>
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        {/* Auto ID pill */}
        <div className="bg-blk p-[9px_14px] rounded-[3px] inline-flex items-center gap-[12px] mb-[18px]">
          <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-white/30">Auto Sample ID</div>
          <div className="font-mono text-[14px] font-bold text-white">{previewId}</div>
          <div className="font-mono text-[9px] text-white/20">Generated on save</div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-[1fr_340px] gap-[14px] items-start">
          {/* LEFT — main form sections */}
          <div className="flex flex-col gap-[14px]">

            {/* DISPATCH INFORMATION */}
            <div className="bg-white border border-g200 p-[18px_20px]">
              <div className={sectionHeaderCls}>Dispatch Information</div>
              <div className="grid grid-cols-2 gap-[12px]">
                <div>
                  <label className={labelCls}>Dispatch Date <span className="text-red-mrt">*</span></label>
                  <input type="date" value={sentDate} onChange={e => setSentDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Follow-up Due Date</label>
                  <input type="date" value={followupDue} onChange={e => setFollowupDue(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Courier / Tracking</label>
                  <input type="text" value={courier} onChange={e => setCourier(e.target.value)}
                    placeholder="Blue Dart AWB#, DTDC, India Post..."
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>POD</label>
                  <div className="flex items-center gap-1.5">
                    <input type="file" id="pod-upload" className="hidden"
                      accept=".pdf,.jpeg,.jpg,.png"
                      onChange={e => setPodFile(e.target.files?.[0] ?? null)} />
                    <label htmlFor="pod-upload"
                      className="cursor-pointer font-sans text-[12px] font-medium text-blk bg-white border border-g300 rounded-[3px] p-[7px_10px] flex items-center gap-2 hover:bg-g50 transition-colors min-h-[36px] w-full">
                      <Upload size={13} className="text-g500 shrink-0" />
                      {podFile
                        ? <span className="truncate text-[11.5px]">{podFile.name}</span>
                        : <span className="text-g400">Upload proof of delivery</span>}
                    </label>
                    {podFile && (
                      <button type="button" title="Remove" onClick={() => setPodFile(null)}
                        className="text-g400 hover:text-red-mrt text-[18px] leading-none shrink-0">×</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Sample Cost ₹</label>
                  <input type="number" value={cost} onChange={e => setCost(e.target.value)}
                    placeholder="0" min="0" step="any" className={inputCls} />
                </div>
              </div>
            </div>

            {/* CUSTOMER & CONTACT */}
            <div className="bg-white border border-g200 p-[18px_20px]">
              <div className={sectionHeaderCls}>Customer & Contact</div>
              <div className="grid grid-cols-2 gap-[12px]">
                <div>
                  <label className={labelCls}>Customer <span className="text-red-mrt">*</span></label>
                  <CustomerSearch
                    customers={data.customers}
                    value={cust}
                    onChange={name => { setCust(name); setErrors(e => ({ ...e, cust: '' })); }}
                    error={!!errors.cust}
                  />
                  {errors.cust && <div className="text-red-mrt text-[10px] mt-1 font-medium">{errors.cust}</div>}
                </div>
                <div>
                  <label className={labelCls}>Linked Quote / Enquiry Ref</label>
                  <input type="text" value={linkedRef} onChange={e => setLinkedRef(e.target.value)}
                    placeholder="e.g. HTP-2026-020 or ENQ-2026-025"
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Sent By</label>
                  <input type="text" value={sentBy} onChange={e => setSentBy(e.target.value)}
                    placeholder="Name of person who dispatched the sample"
                    className={inputCls} />
                </div>
              </div>
            </div>

            {/* SAMPLE DETAILS */}
            <div className="bg-white border border-g200 p-[18px_20px]">
              <div className={sectionHeaderCls}>Sample Details</div>
              <div className="grid grid-cols-2 gap-[12px]">
                <div>
                  <label className={labelCls}>Product Name <span className="text-red-mrt">*</span></label>
                  <input type="text" value={productName}
                    onChange={e => { setProductName(e.target.value); setErrors(er => ({ ...er, productName: '' })); }}
                    placeholder="e.g. Alpha Terpineol"
                    className={`${inputCls}${errors.productName ? ' border-red-mrt' : ''}`} />
                  {errors.productName && <div className="text-red-mrt text-[10px] mt-1 font-medium">{errors.productName}</div>}
                </div>
                <div>
                  <label className={labelCls}>Grade / Purity</label>
                  <input type="text" value={productGrade} onChange={e => setProductGrade(e.target.value)}
                    placeholder="e.g. 98% GC"
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Lot No</label>
                  <input type="text" value={lotNo} onChange={e => setLotNo(e.target.value)}
                    placeholder="e.g. LOT-2026-001"
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>COA</label>
                  <div className="flex items-center gap-1.5">
                    <input type="file" id="coa-upload" className="hidden"
                      accept=".pdf,.jpeg,.jpg,.png"
                      onChange={e => setCoaFile(e.target.files?.[0] ?? null)} />
                    <label htmlFor="coa-upload"
                      className="cursor-pointer font-sans text-[12px] font-medium text-blk bg-white border border-g300 rounded-[3px] p-[7px_10px] flex items-center gap-2 hover:bg-g50 transition-colors min-h-[36px] w-full">
                      <Upload size={13} className="text-g500 shrink-0" />
                      {coaFile
                        ? <span className="truncate text-[11.5px]">{coaFile.name}</span>
                        : <span className="text-g400">Upload certificate of analysis</span>}
                    </label>
                    {coaFile && (
                      <button type="button" title="Remove" onClick={() => setCoaFile(null)}
                        className="text-g400 hover:text-red-mrt text-[18px] leading-none shrink-0">×</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Sample Quantity</label>
                  <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)}
                    placeholder="0" min="0" step="any" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Unit</label>
                  <select value={unit} onChange={e => setUnit(e.target.value)} className={selectCls}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* TECHNICAL SPECS / REMARKS */}
            <div className="bg-white border border-g200 p-[18px_20px]">
              <div className={sectionHeaderCls}>Technical Specs / Remarks</div>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                rows={5}
                placeholder="Purity specifications, application notes, special handling, COA details..."
                className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt resize-none"
              />
            </div>
          </div>

          {/* RIGHT — guidance panels */}
          <div className="flex flex-col gap-[14px]">
            {/* Sampling Guidelines */}
            <div className="bg-g100 border border-g200 p-[16px_18px] rounded-[3px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g600 mb-[12px] pb-[7px] border-b border-g200">Sampling Guidelines</div>
              <div className="text-[11.5px] text-g600 leading-[1.9]">
                <div className="font-bold text-blk mb-2">New Customer Sampling Policy</div>
                <div className="flex flex-col gap-[7px] text-[11px]">
                  <div className="flex items-start gap-1.5">
                    <span className="text-red-mrt font-bold mt-px shrink-0">›</span>
                    <span>Only dispatch samples to prospects / new accounts</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-red-mrt font-bold mt-px shrink-0">›</span>
                    <span>Existing customers <span className="font-semibold">(Bronze / Silver / Gold)</span> proceed directly to Order — no sample needed</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-red-mrt font-bold mt-px shrink-0">›</span>
                    <span>Default follow-up window: <strong>3 days</strong> after dispatch</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-red-mrt font-bold mt-px shrink-0">›</span>
                    <span>Log feedback as soon as customer responds</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sample Status */}
            <div className="bg-white border border-g200 p-[16px_18px] rounded-[3px]">
              <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-[12px] pb-[7px] border-b border-g200">Sample Status</div>
              <div className="text-[11px] text-g500 mb-3">This record will be created with status:</div>
              <div className="flex items-center gap-1.5 mb-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-[11px] font-semibold bg-yellow-50 text-yellow-700">
                  <span className="w-[5px] h-[5px] rounded-full bg-yellow-400 shrink-0" />
                  Pending
                </span>
              </div>
              <div className="text-[10px] text-g400 font-mono tracking-wide uppercase mb-2">Workflow</div>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Pending',            active: true,  color: 'bg-yellow-400' },
                  { label: 'Dispatched',         active: false, color: 'bg-purple-500' },
                  { label: 'Feedback Received',  active: false, color: 'bg-amber-500'  },
                  { label: 'Approved / Rejected',active: false, color: 'bg-emerald-500'},
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${step.active ? step.color : 'bg-g200'}`} />
                    <span className={`text-[11px] ${step.active ? 'font-semibold text-blk' : 'text-g400'}`}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex items-center gap-2 p-[14px_20px] bg-g100 border-t border-g200 sticky bottom-0">
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Log Sample'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/sampling')} disabled={saving}>
          Cancel
        </Button>
        <div className="ml-auto text-[11px] text-g500">Fields marked <span className="text-red-mrt">*</span> required</div>
        {errors.global && (
          <div className="ml-4 text-red-mrt text-[11px] font-bold">{errors.global}</div>
        )}
      </div>
    </div>
  );
}
