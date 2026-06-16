// Module 09 — Create Dispatch
// Two-panel: form left, dispatch log right.
// Invoice format: FY/TAX_TYPE/NNNN  e.g. 26-27/SGST/0650
// Unit-wise: same invoice seq allowed in different units, duplicate blocked within same unit.

import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Plus, Trash2, CheckCircle2, Truck, Search, Check } from 'lucide-react';
import { useProductionData } from '../lib/useProductionData';
import {
  listMoldingSessions, listFinishingSessions,
  listInspectionSessions, listDispatchItems,
  insertDispatch, insertDispatchItem, listDispatches,
} from '../lib/db';
import { AttachmentUploader } from '../components/AttachmentUploader';
import { ComboBox } from '../components/ComboBox';
import { jcStats, reversedDispatchIdSet, nextDspId, nextDspItemId } from '../lib/jcStats';
import { productIdentity } from '../lib/productLabel';
import { PageHeader } from '../components/table';
import type {
  MoldingSession, FinishingSession, InspectionSession,
  DispatchItem, Dispatch,
} from '../lib/types';
import { useAppStore } from '../../store';
import { fmtDate } from '../../lib/utils';

const TRANSPORT_MODES = ['Road', 'Courier', 'Rail', 'Air', 'Hand Delivery'];
const UNITS      = ['Unit 1', 'Unit 2'];
const TAX_TYPES  = ['SGST', 'IGST'];

/** Returns '26-27' for dates in FY 2026-27, etc. */
function financialYear(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  const start  = m >= 4 ? y : y - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

/** Builds the full invoice number from parts */
function buildInvoiceNo(fy: string, taxType: string, seq: string): string {
  return `${fy}/${taxType}/${seq.padStart(4, '0')}`;
}

interface LineRow {
  key: number;
  jcId: string;
  qty: string;
  unit: string;
  poNo: string;      // prefilled from job's order
  search: string;    // search box text
}

let keySeq = 0;
const mkRow = (): LineRow => ({ key: ++keySeq, jcId: '', qty: '', unit: 'pcs', poNo: '', search: '' });

export function CreateDispatch() {
  const navigate       = useNavigate();
  const [params]       = useSearchParams();
  const { jobs }       = useProductionData();
  const { user }       = useAppStore();

  const [molding,    setMolding]    = useState<MoldingSession[]>([]);
  const [finishing,  setFinishing]  = useState<FinishingSession[]>([]);
  const [inspection, setInspection] = useState<InspectionSession[]>([]);
  const [dispItems,  setDispItems]  = useState<DispatchItem[]>([]);
  const [allDisps,   setAllDisps]   = useState<Dispatch[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [savedId,    setSavedId]    = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Invoice header ──
  const [unitId,        setUnitId]        = useState('Unit 1');
  const [taxType,       setTaxType]       = useState('SGST');
  const [invoiceSeq,    setInvoiceSeq]    = useState('');    // 4-digit
  const [dispDate,      setDispDate]      = useState(new Date().toISOString().slice(0, 10));
  const [customerName,  setCustomerName]  = useState('');
  const [poNo,          setPoNo]          = useState('');
  const [mode,          setMode]          = useState('Road');
  const [courier,       setCourier]       = useState('');
  const [tracking,      setTracking]      = useState('');
  const [biltyNo,       setBiltyNo]       = useState('');
  const [biltyDate,     setBiltyDate]     = useState('');
  const [cartons,       setCartons]       = useState('');
  const [invoiceValue,  setInvoiceValue]  = useState('');
  const [remarks,       setRemarks]       = useState('');
  const [lines,         setLines]         = useState<LineRow[]>([mkRow()]);
  const [lineSearchOpen, setLineSearchOpen] = useState<number | null>(null); // key of open dropdown

  useEffect(() => {
    Promise.all([
      listMoldingSessions(), listFinishingSessions(),
      listInspectionSessions(), listDispatchItems(),
      listDispatches(),
    ]).then(([m, f, i, di, d]) => {
      setMolding(m); setFinishing(f); setInspection(i); setDispItems(di); setAllDisps(d);
      const preJc = params.get('jc');
      const preCust = params.get('customer');
      const prePo = params.get('po');
      if (preCust) setCustomerName(preCust);
      if (prePo) setPoNo(prePo);
      if (preJc) {
        const job = jobs.find(j => j.id === preJc);
        if (job) {
          setCustomerName(prev => prev || job.customer_name || '');
          setPoNo(prev => prev || job.po_no || '');
          setLines([{ key: ++keySeq, jcId: preJc, qty: '', unit: 'pcs', poNo: job.po_no || '', search: `${preJc} · ${job.product_desc}` }]);
        }
      }
    });
  }, []);

  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  // Computed
  const fy         = useMemo(() => financialYear(dispDate), [dispDate]);
  const invoiceNo  = useMemo(() => invoiceSeq ? buildInvoiceNo(fy, taxType, invoiceSeq) : '', [fy, taxType, invoiceSeq]);

  // Duplicate check within same unit
  const isDuplicate = useMemo(() => {
    if (!invoiceSeq) return false;
    return allDisps.some(d =>
      d.unit_id === unitId &&
      d.invoice_seq === invoiceSeq.padStart(4, '0') &&
      d.financial_year === fy
    );
  }, [allDisps, unitId, invoiceSeq, fy]);

  const reversedIds = useMemo(() => reversedDispatchIdSet(allDisps), [allDisps]);
  const readyMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const j of jobs) {
      const s = jcStats(j.id, molding, finishing, inspection, dispItems, reversedIds);
      if (s.readyQty > 0) map[j.id] = s.readyQty;
    }
    return map;
  }, [jobs, molding, finishing, inspection, dispItems, reversedIds]);

  const readyJobs = useMemo(() => jobs.filter(j => (readyMap[j.id] || 0) > 0), [jobs, readyMap]);

  // ── History-derived dropdown options (no options table) ──
  const customerOptions = useMemo(() => {
    const s = new Set<string>();
    readyJobs.forEach(j => j.customer_name && s.add(j.customer_name));
    allDisps.forEach(d => d.customer_name && s.add(d.customer_name));
    jobs.forEach(j => j.customer_name && s.add(j.customer_name));
    return [...s].sort();
  }, [readyJobs, allDisps, jobs]);

  // PO numbers — scoped to the chosen customer when one is set.
  const poOptions = useMemo(() => {
    const cust = customerName.trim().toLowerCase();
    const match = (c?: string | null) => !cust || (c || '').toLowerCase() === cust;
    const s = new Set<string>();
    jobs.forEach(j => { if (j.po_no && match(j.customer_name)) s.add(j.po_no); });
    allDisps.forEach(d => { if (d.po_no && match(d.customer_name)) s.add(d.po_no); });
    return [...s].sort();
  }, [jobs, allDisps, customerName]);

  const courierOptions = useMemo(
    () => [...new Set(allDisps.map(d => d.courier_name).filter(Boolean) as string[])].sort(),
    [allDisps]
  );
  const modeOptions = useMemo(
    () => [...new Set([...TRANSPORT_MODES, ...allDisps.map(d => d.mode).filter(Boolean) as string[]])],
    [allDisps]
  );

  // Already-dispatched qty per job card (across all prior dispatches) — used to
  // show "remaining in order" while editing a line.
  const dispatchedByJob = useMemo(() => {
    const m: Record<string, number> = {};
    for (const di of dispItems) m[di.job_card_id] = (m[di.job_card_id] || 0) + (di.qty_dispatched || 0);
    return m;
  }, [dispItems]);

  // Ready job cards matching the chosen customer + PO (for the quick picker).
  const readyForPo = useMemo(() => {
    const cust = customerName.trim().toLowerCase();
    const po   = poNo.trim().toLowerCase();
    if (!cust && !po) return [];
    return readyJobs.filter(j =>
      (!cust || (j.customer_name || '').toLowerCase() === cust) &&
      (!po   || (j.po_no || '').toLowerCase() === po)
    );
  }, [readyJobs, customerName, poNo]);

  // Dispatch log sorted newest first
  const recentDisps = useMemo(
    () => [...allDisps].sort((a, b) => (b.dispatch_date || '').localeCompare(a.dispatch_date || '') || (b.id || '').localeCompare(a.id || '')),
    [allDisps]
  );

  const updateLine = (key: number, patch: Partial<LineRow>) => {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  };
  const removeLine = (key: number) => setLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : prev);

  const totalQty = lines.reduce((a, l) => a + (parseInt(l.qty, 10) || 0), 0);

  // Quick-picker: add a ready job as a line (default qty = ready), or remove it
  // if already present. Drops a leading blank line on first add.
  const jobIsPicked = (jcId: string) => lines.some(l => l.jcId === jcId);
  const toggleJobLine = (jcId: string) => {
    const job   = jobs.find(j => j.id === jcId);
    const ready = readyMap[jcId] || 0;
    setLines(prev => {
      if (prev.some(l => l.jcId === jcId)) {
        const next = prev.filter(l => l.jcId !== jcId);
        return next.length ? next : [mkRow()];
      }
      const cleaned = prev.filter(l => l.jcId || l.search.trim()); // drop empty rows
      return [...cleaned, {
        key: ++keySeq, jcId, qty: String(ready), unit: 'pcs',
        poNo: job?.po_no || poNo || '', search: `${jcId} · ${job?.product_desc || ''}`,
      }];
    });
    if (job) {
      setCustomerName(prev => prev || job.customer_name || '');
      setPoNo(prev => prev || job.po_no || '');
    }
  };

  const selectJob = (lineKey: number, jcId: string) => {
    const job   = jobs.find(j => j.id === jcId);
    const ready = readyMap[jcId] || 0;
    updateLine(lineKey, {
      jcId,
      qty:    String(ready),
      poNo:   job?.po_no || '',
      search: jcId ? `${jcId} · ${job?.product_desc || ''}` : '',
    });
    if (job && !customerName) setCustomerName(job.customer_name || '');
    setLineSearchOpen(null);
  };

  const showBanner = (id: string) => {
    setSavedId(id);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setSavedId(null), 8000);
  };

  const save = async () => {
    if (!invoiceSeq.trim()) { alert('Enter the invoice sequence number.'); return; }
    if (isDuplicate) { alert(`Invoice ${invoiceNo} already exists for ${unitId}. Use a different number.`); return; }
    if (!customerName.trim()) { alert('Customer name is required.'); return; }
    if (!poNo.trim()) { alert('PO Number is required.'); return; }
    const validLines = lines.filter(l => l.jcId && l.qty);
    if (validLines.length === 0) { alert('Add at least one job card line with a quantity.'); return; }
    for (const l of validLines) {
      const ready = readyMap[l.jcId] || 0;
      const qty   = parseInt(l.qty, 10) || 0;
      if (qty <= 0) { alert(`${l.jcId}: qty must be > 0.`); return; }
      if (qty > ready) { alert(`${l.jcId}: qty (${qty}) exceeds ready pool (${ready} pcs).`); return; }
    }
    setSaving(true);
    try {
      const dspId    = nextDspId(allDisps.map(d => d.id));
      const seqPad   = invoiceSeq.padStart(4, '0');
      const dsp: Dispatch = {
        id:                   dspId,
        invoice_no:           buildInvoiceNo(fy, taxType, invoiceSeq),
        invoice_seq:          seqPad,
        financial_year:       fy,
        unit_id:              unitId,
        tax_type:             taxType,
        dispatch_date:        dispDate,
        customer_name:        customerName.trim(),
        po_no:                poNo.trim() || validLines[0]?.poNo?.trim() || null,
        total_qty_dispatched: totalQty,
        mode:                 mode || null,
        courier_name:         courier.trim()  || null,
        tracking_number:      tracking.trim() || null,
        bilty_no:             biltyNo.trim()  || null,
        bilty_date:           biltyDate || null,
        no_of_cartons:        cartons ? parseInt(cartons, 10) : null,
        invoice_value:        invoiceValue ? parseFloat(invoiceValue) : null,
        status:               'Dispatched',
        remarks:              remarks.trim() || null,
        entered_by:           user?.email || null,
      };
      await insertDispatch(dsp);

      for (let seq = 0; seq < validLines.length; seq++) {
        const l    = validLines[seq];
        const job  = jobs.find(j => j.id === l.jcId);
        const ordQ = job?.qty || null;
        const prev = dispItems.filter(di => di.job_card_id === l.jcId).reduce((a, di) => a + (di.qty_dispatched || 0), 0);
        const item: DispatchItem = {
          id:            nextDspItemId(seq),
          dispatch_id:   dspId,
          job_card_id:   l.jcId,
          qty_dispatched: parseInt(l.qty, 10),
          unit:          l.unit,
          ordered_qty:   ordQ,
          remaining_qty: ordQ != null ? ordQ - prev - (parseInt(l.qty, 10) || 0) : null,
          order_id:      job?.order_id || null,
          po_no:         l.poNo.trim() || null,
          ordered_item:  job?.product_desc || null,
          die_no:        job?.mould_code   || null,
          dispatch_date: dispDate,
          invoice_no:    dsp.invoice_no,
          entered_by:    user?.email || null,
        };
        await insertDispatchItem(item);
      }

      const refreshed = await listDispatches();
      setAllDisps(refreshed);
      setInvoiceSeq('');
      setLines([mkRow()]);
      setPoNo('');
      setTracking(''); setBiltyNo(''); setBiltyDate('');
      setCartons(''); setInvoiceValue(''); setRemarks('');
      showBanner(dspId);
    } catch (e: any) {
      alert(e?.message || 'Save failed.');
    } finally { setSaving(false); }
  };

  // Searchable job filter per line
  const lineFilteredJobs = (search: string) => {
    const t = search.trim().toLowerCase();
    if (!t) return readyJobs.slice(0, 15);
    return readyJobs.filter(j =>
      j.id.toLowerCase().includes(t) ||
      (j.family_code || '').toLowerCase().includes(t) ||
      (j.product_desc || '').toLowerCase().includes(t) ||
      (j.customer_name || '').toLowerCase().includes(t)
    ).slice(0, 15);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · Module 09"
        title="Create Dispatch"
        subtitle="One invoice per dispatch. Qty capped to ready pool per job card."
        actions={
          <button type="button" onClick={save} disabled={saving || isDuplicate}
            className="inline-flex items-center gap-1.5 bg-[#107E3E] text-white text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#0B5C2A] disabled:opacity-40 transition-colors">
            <Save size={13} /> {saving ? 'Saving…' : 'Save Dispatch'}
          </button>
        }
      />

      {/* Success banner */}
      {savedId && (
        <div className="mx-4 mt-3 bg-[#E8F5E9] border border-[#C5E1A5] rounded-[3px] px-3 py-2.5 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
          <CheckCircle2 size={14} className="text-[#107E3E] shrink-0" />
          <div className="flex-1 text-[11.5px] text-[#107E3E]">
            Dispatch saved: <strong className="font-mono">{savedId}</strong>
            <span className="ml-2 text-[#107E3E]/70 text-[10.5px]">— visible in the log panel →</span>
          </div>
          <button type="button" onClick={() => setSavedId(null)}
            className="text-[#107E3E]/60 hover:text-[#107E3E] text-[14px] leading-none px-1">×</button>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 overflow-hidden flex gap-3 p-4">

        {/* LEFT — form */}
        <div className="flex-1 overflow-y-auto space-y-3 min-w-0">

          {/* Invoice number */}
          <Card title="Invoice">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Unit + Tax type row */}
              <div className="space-y-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555]">Unit</label>
                <div className="flex gap-2">
                  {UNITS.map(u => (
                    <button key={u} type="button" onClick={() => setUnitId(u)}
                      className={`flex-1 text-[11.5px] font-medium py-1.5 border rounded-[3px] transition-colors ${
                        unitId === u ? 'bg-[#0A6ED1] text-white border-[#0A6ED1]' : 'bg-white text-[#555] border-[#E4E5E6] hover:border-[#0A6ED1] hover:text-[#0A6ED1]'
                      }`}>{u}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555]">Tax Type</label>
                <div className="flex gap-2">
                  {TAX_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setTaxType(t)}
                      className={`flex-1 text-[11.5px] font-medium py-1.5 border rounded-[3px] transition-colors ${
                        taxType === t ? 'bg-[#E9730C] text-white border-[#E9730C]' : 'bg-white text-[#555] border-[#E4E5E6] hover:border-[#E9730C] hover:text-[#E9730C]'
                      }`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Invoice seq + preview */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555]">Invoice Number *</label>
                <div className="flex items-center gap-2">
                  {/* FY prefix (readonly) */}
                  <span className="font-mono text-[12px] text-[#555] bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 whitespace-nowrap">
                    {fy}/{taxType}/
                  </span>
                  {/* 4-digit seq */}
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]{1,4}"
                    className={`w-[80px] font-mono text-[13px] text-[#111] border rounded-[3px] px-2.5 py-1.5 outline-none text-center tracking-widest ${
                      isDuplicate ? 'border-[#BB0000] bg-[#FFEBEE]' : 'border-[#E4E5E6] focus:border-[#0A6ED1]'
                    }`}
                    value={invoiceSeq}
                    onChange={e => setInvoiceSeq(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0001"
                    title="4-digit invoice sequence"
                  />
                  {/* Live preview */}
                  {invoiceNo && (
                    <span className={`font-mono text-[13px] font-bold px-3 py-1.5 rounded-[3px] ${
                      isDuplicate ? 'bg-[#FFEBEE] text-[#BB0000] border border-[#FFCDD2]' : 'bg-[#E8F5E9] text-[#107E3E] border border-[#C5E1A5]'
                    }`}>
                      {invoiceNo}
                      {isDuplicate && <span className="ml-2 text-[10px]">⚠ duplicate in {unitId}</span>}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[#888]">
                  Same sequence is allowed across different units — duplicate blocked within the same unit.
                </div>
              </div>
            </div>
          </Card>

          {/* Invoice attachment */}
          <Card title="Invoice Attachment">
            <AttachmentUploader
              type="other"
              shiftDate={dispDate}
              label="Invoice PDF / Scan"
              accept=".pdf,.jpg,.jpeg,.png"
            />
          </Card>

          {/* Customer & dates */}
          <Card title="Shipment Details">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Dispatch Date *">
                <input type="date" className={inp} value={dispDate} onChange={e => setDispDate(e.target.value)} title="Date" />
              </Field>
              <Field label="Customer *">
                <ComboBox value={customerName} onChange={v => { setCustomerName(v); setPoNo(''); }}
                  options={customerOptions} placeholder="Select or type customer" title="Customer" />
              </Field>
              <Field label="PO Number *">
                <ComboBox value={poNo} onChange={setPoNo}
                  options={poOptions} placeholder="Select or type PO" title="PO number" />
              </Field>
              <Field label="Transport Mode">
                <ComboBox value={mode} onChange={setMode} options={modeOptions} placeholder="Road" title="Mode" />
              </Field>
              <Field label="Courier Name">
                <ComboBox value={courier} onChange={setCourier} options={courierOptions} placeholder="Blue Dart" title="Courier" />
              </Field>
              <Field label="Tracking / LR No">
                <input className={inp} value={tracking} onChange={e => setTracking(e.target.value)} title="Tracking" />
              </Field>
              <Field label="Bilty No">
                <input className={inp} value={biltyNo} onChange={e => setBiltyNo(e.target.value)} title="Bilty no" />
              </Field>
              <Field label="Bilty Date">
                <input type="date" className={inp} value={biltyDate} onChange={e => setBiltyDate(e.target.value)} title="Bilty date" />
              </Field>
              <Field label="Cartons">
                <input type="number" className={inp} value={cartons} onChange={e => setCartons(e.target.value)} title="No of cartons" />
              </Field>
              <Field label="Invoice Value (₹)">
                <input type="number" step="0.01" className={inp} value={invoiceValue} onChange={e => setInvoiceValue(e.target.value)} title="Value" />
              </Field>
              <Field label="Remarks" className="md:col-span-3">
                <input className={inp} value={remarks} onChange={e => setRemarks(e.target.value)} title="Remarks" />
              </Field>
            </div>
          </Card>

          {/* Ready job cards for the selected customer / PO — tick to add as lines */}
          {(customerName.trim() || poNo.trim()) && (
            <Card title="Ready Job Cards for this PO">
              {readyForPo.length === 0 ? (
                <div className="text-[11px] text-[#888] italic py-1">
                  No ready job cards for {customerName.trim() || '—'}{poNo.trim() ? ` · PO ${poNo.trim()}` : ''}.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {readyForPo.map(j => {
                    const ready     = readyMap[j.id] || 0;
                    const ordered   = j.qty || 0;
                    const already   = dispatchedByJob[j.id] || 0;
                    const picked    = jobIsPicked(j.id);
                    const remaining = ordered ? Math.max(0, ordered - already) : null;
                    return (
                      <button key={j.id} type="button" onClick={() => toggleJobLine(j.id)}
                        className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-[3px] border transition-colors ${
                          picked ? 'bg-[#E8F5E9] border-[#C5E1A5]' : 'bg-white border-[#E4E5E6] hover:border-[#0A6ED1]'
                        }`}>
                        <span className={`w-3.5 h-3.5 rounded-[2px] border flex items-center justify-center shrink-0 ${picked ? 'bg-[#107E3E] border-[#107E3E]' : 'border-[#CCC] bg-white'}`}>
                          {picked && <Check size={10} className="text-white" />}
                        </span>
                        <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1] shrink-0">{j.id}</span>
                        <span className="text-[11px] text-[#333] truncate flex-1">{productIdentity(j)}</span>
                        <span className="text-[10px] text-[#107E3E] font-medium shrink-0">{ready} ready</span>
                        {remaining != null && (
                          <span className="text-[10px] text-[#555] shrink-0">· {remaining} left in order</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* Line items with searchable job/product dropdown */}
          <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
            <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#333] uppercase tracking-wider flex-1">Dispatch Line Items</span>
              <span className="text-[10px] text-[#555]">Total: <strong className="text-[#107E3E]">{totalQty.toLocaleString()} pcs</strong></span>
            </div>
            <div className="p-3 space-y-3">
              {/* Column headers */}
              <div className="grid grid-cols-[3fr_1fr_1fr_1fr_32px] gap-2">
                {['Job Card / Product', 'Qty', 'Unit', 'PO No (auto)', ''].map((h, i) => (
                  <div key={i} className="text-[9.5px] font-semibold uppercase tracking-wider text-[#555]">{h}</div>
                ))}
              </div>

              {lines.map(line => {
                const job    = jobs.find(j => j.id === line.jcId);
                const ready  = line.jcId ? (readyMap[line.jcId] || 0) : 0;
                const qtyNum = parseInt(line.qty, 10) || 0;
                const over   = qtyNum > ready && ready > 0;
                const filtered = lineFilteredJobs(line.search);

                return (
                  <div key={line.key} className="space-y-1">
                    <div className="grid grid-cols-[3fr_1fr_1fr_1fr_32px] gap-2 items-start">
                      {/* Searchable job/product picker */}
                      <div className="relative">
                        <div className="relative">
                          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#888]" />
                          <input
                            className={`${inp} pl-6`}
                            value={line.search}
                            placeholder="Search job ID or product…"
                            title="Job card"
                            onChange={e => {
                              updateLine(line.key, { search: e.target.value, jcId: '', qty: '' });
                              setLineSearchOpen(line.key);
                            }}
                            onFocus={() => setLineSearchOpen(line.key)}
                            onBlur={() => setTimeout(() => setLineSearchOpen(null), 150)}
                          />
                        </div>
                        {lineSearchOpen === line.key && filtered.length > 0 && (
                          <div className="absolute z-[200] top-full left-0 right-0 mt-0.5 bg-white border border-[#E4E5E6] rounded-[3px] shadow-lg max-h-[200px] overflow-y-auto">
                            {filtered.map(j => (
                              <button key={j.id} type="button"
                                onMouseDown={() => selectJob(line.key, j.id)}
                                className="w-full px-2.5 py-2 text-left hover:bg-[#E8F0FD] transition-colors border-b border-[#F3F3F3] last:border-0">
                                <div className="text-[11px] font-bold text-[#0A6ED1] font-mono">{j.id}</div>
                                <div className="text-[10.5px] text-[#333] truncate">{productIdentity(j)}</div>
                                <div className="text-[9.5px] text-[#888] flex gap-2">
                                  <span>{j.customer_name}</span>
                                  <span className="text-[#107E3E] font-medium">Ready: {readyMap[j.id]} pcs</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {job && (
                          <div className="mt-0.5 text-[10px] text-[#555] flex gap-2 flex-wrap">
                            <span>{productIdentity(job)}</span>
                            {job.mould_code && <span className="text-[#888]">· Die: {job.mould_code}</span>}
                            {job.qty ? (() => {
                              const already   = dispatchedByJob[job.id] || 0;
                              const remaining = Math.max(0, job.qty - already - (parseInt(line.qty, 10) || 0));
                              return <span className="text-[#888]">· {remaining} left in order (of {job.qty})</span>;
                            })() : null}
                          </div>
                        )}
                      </div>

                      {/* Qty */}
                      <div>
                        <input type="number" min={1} max={ready || undefined}
                          className={`${inp} ${over ? 'border-[#BB0000]' : ''}`}
                          value={line.qty}
                          onChange={e => updateLine(line.key, { qty: e.target.value })}
                          title="Qty to dispatch"
                          placeholder={ready > 0 ? `max ${ready}` : '0'} />
                        {over
                          ? <div className="text-[9.5px] text-[#BB0000] mt-0.5">Exceeds ready ({ready})</div>
                          : ready > 0 && <div className="text-[9.5px] text-[#107E3E] mt-0.5">{ready} ready</div>}
                      </div>

                      {/* Unit */}
                      <select className={inp} value={line.unit}
                        onChange={e => updateLine(line.key, { unit: e.target.value })} title="Unit">
                        {['pcs', 'kg', 'sets', 'nos'].map(u => <option key={u}>{u}</option>)}
                      </select>

                      {/* PO No (prefilled) */}
                      <input className={inp} value={line.poNo}
                        onChange={e => updateLine(line.key, { poNo: e.target.value })}
                        placeholder="Auto from order"
                        title="PO Number" />

                      {/* Remove */}
                      <button type="button" onClick={() => removeLine(line.key)} title="Remove line"
                        className="text-[#BB0000] hover:text-[#8E0000] pt-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              <button type="button" onClick={() => setLines(prev => [...prev, mkRow()])}
                className="inline-flex items-center gap-1 text-[11px] text-[#0A6ED1] hover:underline mt-1">
                <Plus size={12} /> Add Job Card Line
              </button>
            </div>
          </div>

          <div className="text-[10.5px] text-[#555] border-t border-[#E4E5E6] pt-2">
            Entry is permanent · Corrections require a new entry
          </div>
        </div>

        {/* RIGHT — dispatch log */}
        <div className="w-[340px] flex-shrink-0 flex flex-col overflow-y-auto">
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-[#E4E5E6] text-[11px] font-semibold text-[#333] uppercase tracking-wider flex items-center gap-2">
              <Truck size={12} className="text-[#333]" />
              Dispatch Log
              <span className="font-normal normal-case text-[10.5px] text-[#555]">— {recentDisps.length} dispatches</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {recentDisps.length === 0 ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">No dispatches yet</div>
              ) : (
                <div className="divide-y divide-[#F0F0F0]">
                  {recentDisps.map(d => (
                    <div key={d.id}
                      className={`px-3 py-2.5 hover:bg-[#FAFAFA] transition-colors ${savedId === d.id ? 'bg-[#E8F5E9]' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className={`font-mono text-[10px] font-bold ${savedId === d.id ? 'text-[#107E3E]' : 'text-[#107E3E]'}`}>
                            {savedId === d.id && '✓ '}{d.id}
                          </span>
                          <span className="ml-2 text-[10px] text-[#555]">{fmtDate(d.dispatch_date)}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-[#111] whitespace-nowrap">
                          {(d.total_qty_dispatched || 0).toLocaleString()} pcs
                        </span>
                      </div>
                      {/* Invoice no with unit/tax badge */}
                      <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10.5px] text-[#0A6ED1] font-semibold">{d.invoice_no}</span>
                        {d.unit_id && (
                          <span className="text-[9px] bg-[#E8F0FD] text-[#0A6ED1] px-1.5 rounded font-medium">{d.unit_id}</span>
                        )}
                        {d.tax_type && (
                          <span className={`text-[9px] px-1.5 rounded font-medium ${d.tax_type === 'IGST' ? 'bg-[#FFF3E0] text-[#E9730C]' : 'bg-[#E8F5E9] text-[#107E3E]'}`}>
                            {d.tax_type}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[10px] text-[#555] space-y-0.5">
                        <div className="truncate font-medium text-[#333]">{d.customer_name}</div>
                        <div className="flex gap-2 flex-wrap text-[9.5px]">
                          {d.mode && <span className="bg-[#F0F0F0] px-1.5 rounded">{d.mode}</span>}
                          {d.courier_name && <span>{d.courier_name}</span>}
                          {d.tracking_number && <span className="text-[#0A6ED1] font-mono">{d.tracking_number}</span>}
                        </div>
                        {d.remarks && (
                          <div className="text-[9.5px] text-[#666] italic truncate">{d.remarks}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const inp = 'w-full font-sans text-[12px] text-[#111] bg-white border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
      <div className="px-3 py-2 border-b border-[#E4E5E6] text-[11px] font-semibold text-[#333] uppercase tracking-wider">{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">{label}</label>
      {children}
    </div>
  );
}
