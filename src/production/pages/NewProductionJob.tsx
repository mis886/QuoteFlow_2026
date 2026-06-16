// New Production Job — v2 design system.
// Each line item becomes a separate Job Card entering the Moulding queue.
// "Our Product" searchable dropdown prefills Die, Cavities, Cure, Temp, Compound per line.

import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Download, Save, AlertTriangle, Search, CheckCircle2, Boxes } from 'lucide-react';
import { useProductionData } from '../lib/useProductionData';
import { insertJob, logStageEvent, nextJobId, insertFgMovement } from '../lib/db';
import { assignJobsToPress } from '../lib/actions';
import { listOrdersWithoutJobs, type CrmOrderLite } from '../lib/crmReadOnly';
import { localDateStr, fmtDate } from '../../lib/utils';
import { PageHeader } from '../components/table';
import type { ProductionJob, Product } from '../lib/types';

// ── Per-line draft ──────────────────────────────────────────────────────────
interface DraftLine {
  product_id:    string;    // selected from product master (optional)
  family_code:   string;    // Type_Model_MOC of the selected product
  product_desc:  string;
  qty:           string;
  mould_code:    string;
  cavities:      string;
  cure_time_min: string;
  cure_temp_c:   string;
  compound_code: string;
  tikli_size:    string;
  productSearch: string;    // text in the search box
  fromStock:     string;    // qty allocated from finished-goods stock (reduces moulding)
}

const blankLine = (): DraftLine => ({
  product_id:    '',
  family_code:   '',
  product_desc:  '',
  qty:           '',
  mould_code:    '',
  cavities:      '',
  cure_time_min: '',
  cure_temp_c:   '',
  compound_code: '',
  tikli_size:    '',
  productSearch: '',
  fromStock:     '',
});

// ── Component ───────────────────────────────────────────────────────────────
export function NewProductionJob() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetOrderId = searchParams.get('order');
  const { jobs, products, presses, compounds, fgStock, refresh, loading } = useProductionData();

  // FG stock on-hand per family code (Type_Model_MOC).
  const fgByFamily = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of fgStock) m.set(r.family_code, (m.get(r.family_code) || 0) + (r.qty || 0));
    return m;
  }, [fgStock]);

  const [customerName,     setCustomerName]     = useState('');
  const [orderRef,         setOrderRef]         = useState('');
  const [importedOrderId,  setImportedOrderId]  = useState<string | null>(null);
  const [promised,         setPromised]         = useState(localDateStr(new Date(Date.now() + 7 * 86400000)));
  const [priority,         setPriority]         = useState<'normal' | 'emergency'>('normal');
  const [emergencyReason,  setEmergencyReason]  = useState('');
  const [notes,            setNotes]            = useState('');
  const [lines,            setLines]            = useState<DraftLine[]>([blankLine()]);
  const [saving,           setSaving]           = useState(false);
  const [err,              setErr]              = useState<string | null>(null);
  const [productDropOpen,  setProductDropOpen]  = useState<number | null>(null);

  // CRM open orders
  const [openOrders,    setOpenOrders]    = useState<CrmOrderLite[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    listOrdersWithoutJobs().then(list => { setOpenOrders(list); setLoadingOrders(false); });
  }, []);

  const existingIds = useMemo(() => jobs.map(j => j.id), [jobs]);

  useEffect(() => { setErr(null); }, [customerName, lines, promised]);

  // Compound code lookup from compound_id
  const compoundCodeFor = (compoundId?: string | null): string => {
    if (!compoundId) return '';
    return compounds.find(c => c.id === compoundId)?.code || '';
  };

  // ── Product selection per line ─────────────────────────────────────────────
  const selectProduct = (lineIdx: number, p: Product) => {
    setLines(ls => ls.map((l, i) => i !== lineIdx ? l : {
      ...l,
      product_id:    p.id,
      family_code:   p.family_code || '',
      product_desc:  l.product_desc || p.name,   // don't override if already typed
      mould_code:    p.mould_code    ?? l.mould_code,
      cavities:      p.cavities      != null ? String(p.cavities)      : l.cavities,
      cure_time_min: p.cure_time_min != null ? String(p.cure_time_min) : l.cure_time_min,
      cure_temp_c:   p.cure_temp_c   != null ? String(p.cure_temp_c)   : l.cure_temp_c,
      compound_code: compoundCodeFor(p.compound_id) || l.compound_code,
      productSearch: `${p.code} · ${p.name}`,
    }));
    setProductDropOpen(null);
  };

  const filteredProducts = (search: string): Product[] => {
    const t = search.trim().toLowerCase();
    const active = products.filter(p => p.is_active !== false);
    if (!t) return active.slice(0, 12);
    return active.filter(p =>
      p.code.toLowerCase().includes(t) ||
      p.name.toLowerCase().includes(t) ||
      (p.mould_code || '').toLowerCase().includes(t)
    ).slice(0, 12);
  };

  // ── Import from CRM order ──────────────────────────────────────────────────
  const importFromOrder = (orderId: string) => {
    if (!orderId) return;
    const o = openOrders.find(x => x.id === orderId);
    if (!o) return;
    setImportedOrderId(o.id);
    setCustomerName(o.cust || '');
    setOrderRef(o.po_no || o.id);
    if (o.dlv_date) setPromised(o.dlv_date);
    const newLines: DraftLine[] = (o.items || []).map(it => ({
      ...blankLine(),
      product_desc:  [it.desc, it.mat].filter(Boolean).join(' · '),
      qty:           it.qty != null ? String(it.qty) : '',
      compound_code: it.mat || '',
    }));
    setLines(newLines.length ? newLines : [blankLine()]);
  };

  const clearImport = () => {
    setImportedOrderId(null); setCustomerName(''); setOrderRef(''); setLines([blankLine()]);
  };

  // Auto-import when arriving from the Orders page (?order=<id>), once orders load.
  const autoImportedRef = useRef(false);
  useEffect(() => {
    if (autoImportedRef.current) return;
    if (loadingOrders || !presetOrderId) return;
    if (openOrders.some(o => o.id === presetOrderId)) {
      autoImportedRef.current = true;
      importFromOrder(presetOrderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingOrders, presetOrderId, openOrders]);

  // ── Line helpers ───────────────────────────────────────────────────────────
  const updateLine = (i: number, patch: Partial<DraftLine>) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const addLine    = () => setLines(ls => [...ls, blankLine()]);
  const removeLine = (i: number) => setLines(ls => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);

  const canSave =
    customerName.trim().length > 0 &&
    promised &&
    lines.every(l => l.product_desc.trim() && Number(l.qty) > 0) &&
    (priority !== 'emergency' || emergencyReason.trim().length > 0);

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!canSave) {
      setErr('Customer name, promised date, and product/qty per line are required.');
      return;
    }
    setSaving(true);
    try {
      const ids = [...existingIds];
      const created: { id: string; productId: string | null }[] = [];
      for (let i = 0; i < lines.length; i++) {
        const l  = lines[i];
        const id = nextJobId(ids);
        ids.push(id);
        created.push({ id, productId: l.product_id || null });
        const orderQty = Number(l.qty);
        // Allocate from finished-goods stock (capped at available + order qty).
        const family   = l.family_code.trim();
        const available = family ? (fgByFamily.get(family) || 0) : 0;
        const fromStock = Math.max(0, Math.min(parseInt(l.fromStock, 10) || 0, available, orderQty));
        const toMould   = Math.max(0, orderQty - fromStock);
        const job: ProductionJob = {
          id,
          order_id:         importedOrderId || orderRef || null,
          order_line_seq:   i + 1,
          customer_name:    customerName.trim(),
          product_id:       l.product_id || null,
          family_code:      family || null,
          product_desc:     l.product_desc.trim(),
          qty:              orderQty,
          qty_to_mould:     toMould,
          qty_done:         0,
          promised_date:    promised,
          priority,
          emergency_reason: priority === 'emergency' ? emergencyReason.trim() : null,
          notes:            notes.trim() || null,
          stage:            'moulding',
          status:           'queued',
          mould_code:       l.mould_code.trim()    || null,
          cavities:         l.cavities             ? Number(l.cavities)      : null,
          cure_time_min:    l.cure_time_min        ? Number(l.cure_time_min) : null,
          cure_temp_c:      l.cure_temp_c          ? Number(l.cure_temp_c)   : null,
          compound_code:    l.compound_code.trim() || null,
          tikli_size:       l.tikli_size.trim()    || null,
          job_card_no:      `JC${id.split('-').pop()}`,
          po_no:            orderRef.trim() || null,
        };
        await insertJob(job);
        await logStageEvent(id, 'moulding', null, null,
          fromStock > 0 ? `Job created · ${fromStock} from FG stock, mould ${toMould}` : 'Job created');

        // Draw the allocation down from FG stock (append-only ledger row).
        if (fromStock > 0 && family) {
          await insertFgMovement({
            id: `FG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            family_code: family,
            product_id: l.product_id || null,
            ref_job_id: id,
            qty: -fromStock,
            movement: 'order_consume',
            note: `Allocated to ${id} (order ${orderRef || importedOrderId || '—'})`,
            created_by: null,
          });
        }
      }

      // Auto-assign press based on the product's configured presses:
      //   • exactly 1 compatible press → assign automatically (if idle)
      //   • more than 1 → leave unassigned and tell the user to pick on the board
      // Jobs sharing a single press are batched so they queue behind one another.
      const needPick: string[] = [];
      const bySinglePress = new Map<string, string[]>();
      for (const c of created) {
        const prod = c.productId ? products.find(p => p.id === c.productId) : undefined;
        const pressIds = (prod?.press_ids || []).filter(Boolean);
        if (pressIds.length === 1) {
          const arr = bySinglePress.get(pressIds[0]) || [];
          arr.push(c.id);
          bySinglePress.set(pressIds[0], arr);
        } else if (pressIds.length > 1) {
          needPick.push(c.id);
        }
      }
      for (const [pressId, jobIds] of bySinglePress) {
        const press = presses.find(p => p.id === pressId);
        if (press && press.status === 'idle') {
          try { await assignJobsToPress(jobIds, pressId); } catch { /* leave queued on failure */ }
        }
      }

      await refresh();
      if (needPick.length > 0) {
        alert(
          `${needPick.length} job${needPick.length > 1 ? 's have' : ' has'} multiple compatible presses — ` +
          `choose a press for ${needPick.join(', ')} from the Moulding queue ("Assign Press").`
        );
      }
      navigate('/production/sequencer/mould');
    } catch (e: any) {
      setErr(e?.message || 'Failed to save');
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-[12px] text-[#333]">Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · New"
        title="New Production Job"
        subtitle="One line per product — each becomes a separate Job Card in the Moulding queue."
        actions={
          <button type="button" onClick={save} disabled={!canSave || saving}
            className="inline-flex items-center gap-1.5 bg-[#0A6ED1] text-white text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#085EA8] disabled:opacity-40 transition-colors">
            <Save size={13} /> {saving ? 'Saving…' : 'Save & Send to Moulding'}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 w-full">

        {/* Import from CRM order */}
        <div className="bg-[#E8F0FD] border border-[#C2D8F8] rounded-[3px] px-3 py-2.5 flex items-center gap-2 flex-wrap">
          <Download size={13} className="text-[#0A6ED1] shrink-0" />
          <span className="text-[11.5px] font-semibold text-[#0A6ED1]">Import from open CRM Order</span>
          <select
            title="Pick an open CRM order"
            className={`${inp} flex-1 min-w-[240px]`}
            value={importedOrderId || ''}
            onChange={e => importFromOrder(e.target.value)}
            disabled={loadingOrders}
          >
            <option value="">
              {loadingOrders ? 'Loading orders…' : openOrders.length === 0 ? 'No open orders without jobs' : '— Select an open Order —'}
            </option>
            {openOrders.map(o => {
              const lc  = (o.items || []).length;
              const tq  = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0);
              return (
                <option key={o.id} value={o.id}>
                  {o.po_no || o.id} · {o.cust || '—'} · {lc} line{lc !== 1 ? 's' : ''} · {tq.toLocaleString()} pcs
                  {o.dlv_date ? ` · due ${fmtDate(o.dlv_date)}` : ''}
                </option>
              );
            })}
          </select>
          {importedOrderId && (
            <button type="button" onClick={clearImport}
              className="text-[11px] text-[#0A6ED1] border border-[#C2D8F8] rounded-[3px] px-2 py-1 hover:bg-[#C2D8F8] transition-colors">
              Clear import
            </button>
          )}
        </div>
        {importedOrderId && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#555] -mt-1">
            <CheckCircle2 size={11} className="text-[#107E3E]" />
            Imported from order <span className="font-mono bg-[#FAFAFA] border border-[#E4E5E6] px-1.5 rounded">{orderRef}</span> — fill in Mould / Cavities / Cure per line below.
          </div>
        )}

        {/* Header card */}
        <Card title="Job Details">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Customer / Party *">
              <input className={inp} value={customerName} onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Varalka Engineers Pvt Ltd" title="Customer name" />
            </Field>
            <Field label="Customer PO / Reference">
              <input className={inp} value={orderRef} onChange={e => setOrderRef(e.target.value)}
                placeholder="e.g. Dom2627/7059" title="PO reference" />
            </Field>
            <Field label="Promised Date *">
              <input type="date" className={inp} value={promised} onChange={e => setPromised(e.target.value)}
                title="Promised date" />
            </Field>
            <Field label="Priority">
              <select className={inp} value={priority} onChange={e => setPriority(e.target.value as any)} title="Priority">
                <option value="normal">Normal</option>
                <option value="emergency">🔴 Emergency</option>
              </select>
            </Field>
            {priority === 'emergency' && (
              <Field label="Emergency Reason *" className="md:col-span-2">
                <input className={`${inp} border-[#BB0000] focus:border-[#BB0000]`}
                  value={emergencyReason} onChange={e => setEmergencyReason(e.target.value)}
                  placeholder="e.g. Plant shutdown risk…" title="Emergency reason" />
              </Field>
            )}
            <Field label="Internal Notes" className={priority === 'emergency' ? '' : 'md:col-span-2'}>
              <input className={inp} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Optional remarks" title="Notes" />
            </Field>
          </div>
        </Card>

        {/* Priority banner */}
        {priority === 'emergency' && (
          <div className="bg-[#FFF1F0] border border-[#FFCDD2] rounded-[3px] px-3 py-2 flex items-center gap-2 text-[12px] text-[#BB0000]">
            <AlertTriangle size={13} className="shrink-0" />
            <strong>🔴 Emergency job</strong> — will be flagged across all dashboards and prioritised in the moulding queue.
          </div>
        )}

        {/* Line items */}
        <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
          <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
            <div className="text-[11px] font-semibold text-[#333] uppercase tracking-wider flex-1">
              Line Items
              <span className="ml-2 font-normal normal-case tracking-normal text-[#555]">· one production job per line</span>
            </div>
            <button type="button" onClick={addLine}
              className="inline-flex items-center gap-1 text-[10.5px] text-[#0A6ED1] border border-[#C2D8F8] rounded-[3px] px-2 py-0.5 hover:bg-[#E8F0FD] transition-colors">
              <Plus size={10} /> Add Line
            </button>
          </div>

          <div className="divide-y divide-[#F3F3F3]">
            {lines.map((l, i) => (
              <div key={i} className="p-3 space-y-2">

                {/* Row 1: Our Product + Product Description + Qty */}
                <div className="grid grid-cols-1 md:grid-cols-[240px_1fr_80px] gap-2 items-end">

                  {/* Our Product — searchable dropdown */}
                  <Field label="Our Product">
                    <div className="relative">
                      <div className="relative">
                        <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#888] pointer-events-none" />
                        <input
                          className={`${inp} pl-6`}
                          value={l.productSearch}
                          placeholder="Search product code or name…"
                          title="Our product"
                          autoComplete="off"
                          onChange={e => {
                            updateLine(i, { productSearch: e.target.value, product_id: '', family_code: '' });
                            setProductDropOpen(i);
                          }}
                          onFocus={() => setProductDropOpen(i)}
                          onBlur={() => setTimeout(() => setProductDropOpen(null), 150)}
                        />
                      </div>
                      {productDropOpen === i && (
                        <div className="absolute z-[200] top-full left-0 right-0 mt-0.5 bg-white border border-[#E4E5E6] rounded-[3px] shadow-lg max-h-[200px] overflow-y-auto">
                          {filteredProducts(l.productSearch).length === 0 ? (
                            <div className="px-3 py-2.5 text-[11px] text-[#888] italic">No products match</div>
                          ) : filteredProducts(l.productSearch).map(p => (
                            <button key={p.id} type="button"
                              onMouseDown={() => selectProduct(i, p)}
                              className={`w-full px-2.5 py-2 text-left hover:bg-[#E8F0FD] transition-colors border-b border-[#F3F3F3] last:border-0 ${l.product_id === p.id ? 'bg-[#F0F7FF]' : ''}`}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">{p.code}</span>
                                {l.product_id === p.id && <CheckCircle2 size={10} className="text-[#107E3E]" />}
                              </div>
                              <div className="text-[11px] text-[#333] truncate">{p.name}</div>
                              <div className="text-[9.5px] text-[#888] flex gap-2 mt-0.5 flex-wrap">
                                {p.mould_code    && <span>Die: {p.mould_code}</span>}
                                {p.cavities      && <span>Cav: {p.cavities}</span>}
                                {p.cure_time_min && <span>Cure: {p.cure_time_min}m</span>}
                                {p.cure_temp_c   && <span>{p.cure_temp_c}°C</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {l.product_id && (
                      <div className="mt-0.5 text-[9.5px] text-[#107E3E] flex items-center gap-1">
                        <CheckCircle2 size={9} /> Prefilled from product master
                      </div>
                    )}
                  </Field>

                  {/* Our Product Description */}
                  <Field label="Our Product Description *">
                    <input className={inp} value={l.product_desc}
                      onChange={e => updateLine(i, { product_desc: e.target.value })}
                      placeholder="e.g. PHE Gasket M10 EPDM 500×500mm"
                      title="Product description" />
                  </Field>

                  {/* Qty */}
                  <Field label="Qty *">
                    <input type="number" className={inp} value={l.qty}
                      onChange={e => updateLine(i, { qty: e.target.value })}
                      placeholder="0" title="Qty" />
                  </Field>
                </div>

                {/* Finished-goods stock available for this family — allocate to reduce moulding */}
                {(() => {
                  const stock = l.family_code ? (fgByFamily.get(l.family_code) || 0) : 0;
                  if (stock <= 0) return null;
                  const orderQty = parseInt(l.qty, 10) || 0;
                  const alloc    = parseInt(l.fromStock, 10) || 0;
                  const toMould  = Math.max(0, orderQty - alloc);
                  return (
                    <div className="bg-[#FFF8EC] border border-[#FFE0B2] rounded-[3px] px-2.5 py-1.5 flex items-center gap-2 flex-wrap text-[11px]">
                      <Boxes size={12} className="text-[#E9730C] shrink-0" />
                      <span className="text-[#E9730C] font-medium">{stock.toLocaleString()} pcs in finished-goods stock</span>
                      <span className="text-[#555]">·</span>
                      <span className="text-[#555]">Use from stock:</span>
                      <input type="number" min={0} max={Math.min(stock, orderQty || stock)}
                        className="w-[70px] text-[11px] border border-[#FFE0B2] rounded-[3px] px-1.5 py-0.5 outline-none focus:border-[#E9730C]"
                        value={l.fromStock}
                        onChange={e => updateLine(i, { fromStock: e.target.value })}
                        placeholder="0" title="Allocate from stock" />
                      {alloc > 0 && (
                        <span className="text-[#107E3E]">→ mould only <strong>{toMould.toLocaleString()}</strong> pcs</span>
                      )}
                    </div>
                  );
                })()}

                {/* Row 2: Die / Mould, Cav, Cure, Temp, Compound, Tikli */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <Field label="Die / Mould">
                    <input className={inp} value={l.mould_code}
                      onChange={e => updateLine(i, { mould_code: e.target.value })}
                      placeholder="e.g. 551/1100" title="Die / mould code" />
                  </Field>
                  <Field label="Cav">
                    <input type="number" className={inp} value={l.cavities}
                      onChange={e => updateLine(i, { cavities: e.target.value })}
                      placeholder="2" title="Cavities" />
                  </Field>
                  <Field label="Cure (min)">
                    <input type="number" className={inp} value={l.cure_time_min}
                      onChange={e => updateLine(i, { cure_time_min: e.target.value })}
                      placeholder="18" title="Cure time minutes" />
                  </Field>
                  <Field label="Temp (°C)">
                    <input type="number" className={inp} value={l.cure_temp_c}
                      onChange={e => updateLine(i, { cure_temp_c: e.target.value })}
                      placeholder="165" title="Cure temperature" />
                  </Field>
                  <Field label="Compound">
                    <input className={inp} value={l.compound_code}
                      onChange={e => updateLine(i, { compound_code: e.target.value })}
                      placeholder="GCH_M6M_NBR" title="Compound code" />
                  </Field>
                  <Field label="Tikli Size">
                    <input className={inp} value={l.tikli_size}
                      onChange={e => updateLine(i, { tikli_size: e.target.value })}
                      placeholder="5.4×6 holes" title="Tikli size" />
                  </Field>
                </div>

                {/* Remove line */}
                {lines.length > 1 && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => removeLine(i)}
                      className="inline-flex items-center gap-1 text-[10.5px] text-[#BB0000] hover:text-[#8E0000] hover:bg-[#FFEBEE] px-2 py-0.5 rounded-[3px] transition-colors">
                      <Trash2 size={10} /> Remove line
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="bg-[#FFEBEE] border border-[#FFCDD2] rounded-[3px] px-3 py-2 text-[11.5px] text-[#BB0000] flex items-center gap-2">
            <AlertTriangle size={13} className="shrink-0" /> {err}
          </div>
        )}

        {/* Bottom actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={() => navigate('/production')}
            className="px-[11px] py-[5px] text-[11px] border border-[#E4E5E6] rounded-[3px] text-[#333] bg-white hover:bg-[#F5F6F7] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!canSave || saving}
            className="inline-flex items-center gap-1.5 bg-[#0A6ED1] text-white text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#085EA8] disabled:opacity-40 transition-colors">
            <Save size={13} /> {saving ? 'Saving…' : 'Save & Send to Moulding'}
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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
