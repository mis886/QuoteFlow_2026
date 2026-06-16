// Module 09 — Dispatch Board
// Two panels: Ready-to-Dispatch pool (readyQty > 0) + Dispatch Register.

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ChevronDown, ChevronRight, Plus, Pencil, Undo2, Boxes } from 'lucide-react';
import { useProductionData } from '../lib/useProductionData';
import {
  listMoldingSessions, listFinishingSessions,
  listInspectionSessions, listDispatchItems,
  listDispatches, updateDispatchStatus,
  updateDispatch, updateDispatchItem, reverseDispatch, insertFgMovement,
} from '../lib/db';
import { jcStats, reversedDispatchIdSet } from '../lib/jcStats';
import { productIdentity } from '../lib/productLabel';
import { CorrectionModal } from '../components/CorrectionModal';
import { PageHeader, Table, THead, TH, TR, TD, EmptyRow } from '../components/table';
import { fmtIST, fmtDate } from '../../lib/utils';
import { useAppStore } from '../../store';
import type {
  MoldingSession, FinishingSession, InspectionSession, DispatchItem,
  Dispatch, FgStockRow,
} from '../lib/types';

const DISPATCH_STATUSES = ['Dispatched', 'In Transit', 'Delivered', 'Returned'] as const;

export function DispatchBoard() {
  const navigate = useNavigate();
  const { jobs, fgStock, refresh: refreshShared } = useProductionData();
  const { user } = useAppStore();

  const [molding,    setMolding]    = useState<MoldingSession[]>([]);
  const [finishing,  setFinishing]  = useState<FinishingSession[]>([]);
  const [inspection, setInspection] = useState<InspectionSession[]>([]);
  const [dispItems,  setDispItems]  = useState<DispatchItem[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const [collapsedCust, setCollapsedCust] = useState<Set<string>>(new Set());
  const [correcting, setCorrecting] = useState<Dispatch | null>(null);
  const [corrFields, setCorrFields] = useState<{ qty: string; courier: string; tracking: string; invoiceSeq: string; mode: string }>({ qty: '', courier: '', tracking: '', invoiceSeq: '', mode: '' });

  const load = async () => {
    setLoading(true);
    const [m, f, i, di, d] = await Promise.all([
      listMoldingSessions(), listFinishingSessions(),
      listInspectionSessions(), listDispatchItems(), listDispatches(),
    ]);
    setMolding(m); setFinishing(f); setInspection(i);
    setDispItems(di); setDispatches(d);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Items of reversed dispatches don't count as dispatched (qty returns to pool).
  const reversedIds = useMemo(() => reversedDispatchIdSet(dispatches), [dispatches]);
  const stats = (jcId: string) => jcStats(jcId, molding, finishing, inspection, dispItems, reversedIds);

  // FG (surplus) stock balance per family code.
  const fgByFamily = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of fgStock) m.set(r.family_code, (m.get(r.family_code) || 0) + (r.qty || 0));
    return [...m.entries()].filter(([, q]) => q !== 0).sort((a, b) => a[0].localeCompare(b[0]));
  }, [fgStock]);

  // Ready-to-dispatch pool, grouped Customer → PO → job cards.
  const readyPool = useMemo(() => {
    return jobs
      .map(j => ({ job: j, stats: stats(j.id) }))
      .filter(({ stats }) => stats.readyQty > 0)
      .sort((a, b) => (a.job.promised_date || '').localeCompare(b.job.promised_date || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, molding, finishing, inspection, dispItems, reversedIds]);

  const readyGroups = useMemo(() => {
    const byCust = new Map<string, {
      customer: string;
      totalReady: number;
      pos: Map<string, { po: string; totalReady: number; rows: typeof readyPool }>;
    }>();
    for (const row of readyPool) {
      const cust = row.job.customer_name || '— No customer —';
      const po   = row.job.po_no || '— No PO —';
      if (!byCust.has(cust)) byCust.set(cust, { customer: cust, totalReady: 0, pos: new Map() });
      const c = byCust.get(cust)!;
      c.totalReady += row.stats.readyQty;
      if (!c.pos.has(po)) c.pos.set(po, { po, totalReady: 0, rows: [] });
      const p = c.pos.get(po)!;
      p.totalReady += row.stats.readyQty;
      p.rows.push(row);
    }
    return [...byCust.values()].sort((a, b) => a.customer.localeCompare(b.customer));
  }, [readyPool]);

  // Already-dispatched qty per job (excludes reversed dispatches).
  const dispatchedByJob = useMemo(() => {
    const m: Record<string, number> = {};
    for (const di of dispItems) {
      if (di.dispatch_id && reversedIds.has(di.dispatch_id)) continue;
      m[di.job_card_id] = (m[di.job_card_id] || 0) + (di.qty_dispatched || 0);
    }
    return m;
  }, [dispItems, reversedIds]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleStatusChange = async (id: string, status: string) => {
    await updateDispatchStatus(id, status);
    await load();
  };

  const getItemsForDispatch = (dspId: string) =>
    dispItems.filter(di => di.dispatch_id === dspId);

  const toggleCust = (cust: string) => {
    setCollapsedCust(prev => {
      const next = new Set(prev);
      next.has(cust) ? next.delete(cust) : next.add(cust);
      return next;
    });
  };

  // Open the Create Dispatch form preselected to a customer + PO.
  const dispatchPo = (customer: string, po: string) => {
    const q = new URLSearchParams();
    if (customer && !customer.startsWith('—')) q.set('customer', customer);
    if (po && !po.startsWith('—')) q.set('po', po);
    navigate(`/production/dispatch/new${q.toString() ? `?${q}` : ''}`);
  };

  // ── Dispatch correction ──
  const startCorrection = (d: Dispatch) => {
    setCorrecting(d);
    setCorrFields({
      qty: String(d.total_qty_dispatched ?? ''),
      courier: d.courier_name || '',
      tracking: d.tracking_number || '',
      invoiceSeq: d.invoice_seq || '',
      mode: d.mode || '',
    });
  };
  const saveCorrection = async (note: string) => {
    if (!correcting) return;
    const items = getItemsForDispatch(correcting.id);
    const newTotal = corrFields.qty.trim() ? parseInt(corrFields.qty, 10) : (correcting.total_qty_dispatched ?? 0);
    // If there's exactly one line item, keep its qty in sync with the header total.
    if (items.length === 1 && newTotal !== (correcting.total_qty_dispatched ?? 0)) {
      await updateDispatchItem(items[0].id, { qty_dispatched: newTotal }, note);
    }
    const seqPad = corrFields.invoiceSeq.trim() ? corrFields.invoiceSeq.padStart(4, '0') : correcting.invoice_seq;
    const invoiceNo = (correcting.financial_year && correcting.tax_type && seqPad)
      ? `${correcting.financial_year}/${correcting.tax_type}/${seqPad}`
      : correcting.invoice_no;
    await updateDispatch(correcting.id, {
      total_qty_dispatched: newTotal,
      courier_name:    corrFields.courier.trim() || null,
      tracking_number: corrFields.tracking.trim() || null,
      mode:            corrFields.mode.trim() || null,
      invoice_seq:     seqPad,
      invoice_no:      invoiceNo,
    }, user?.email, note);
    setCorrecting(null);
    await load();
  };

  // ── Reverse a dispatch (qty returns to ready pool) ──
  const handleReverse = async (d: Dispatch) => {
    const note = window.prompt(`Reverse dispatch ${d.id} (${d.invoice_no})?\nDispatched qty will return to the ready pool.\n\nReason:`);
    if (note === null) return;
    if (!note.trim()) { alert('A reason is required to reverse a dispatch.'); return; }
    await reverseDispatch(d.id, user?.email, note.trim());
    await load();
  };

  // ── Post a job's surplus (ready beyond what its order needs) to FG stock ──
  const postSurplus = async (job: typeof jobs[number], surplus: number) => {
    if (surplus <= 0) return;
    const family = job.family_code || job.product_id || '';
    if (!family) { alert('This job has no family code / product — cannot post to FG stock.'); return; }
    // Prevent double-posting: check if this job has already been moved to stock.
    const alreadyPosted = fgStock.some(r => r.job_card_id === job.id && r.movement === 'surplus_in');
    if (alreadyPosted) {
      alert(`Surplus for job ${job.id} has already been added to finished-goods stock.\nClick the button only once per job.`);
      return;
    }
    if (!window.confirm(`Post ${surplus} surplus pcs of ${family} to finished-goods stock?\nThese were produced beyond order ${job.id}'s quantity and will be available for future orders of the same family.`)) return;
    const row: FgStockRow = {
      id: `FG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      family_code: family,
      product_id: job.product_id || null,
      job_card_id: job.id,
      qty: surplus,
      movement: 'surplus_in',
      note: `Surplus from ${job.id} (over-produced beyond order qty)`,
      created_by: user?.email || null,
    };
    await insertFgMovement(row);
    await Promise.all([load(), refreshShared()]);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · Module 09"
        title="Dispatch Board"
        subtitle="Ready pool + dispatch register. readyQty = passed − dispatched."
        actions={
          <button type="button" onClick={() => navigate('/production/dispatch/new')}
            className="inline-flex items-center gap-1.5 bg-[#107E3E] text-white text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#0B5C2A] transition-colors">
            <Plus size={13} /> Create Dispatch
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Ready-to-Dispatch Pool ── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] font-semibold text-[#111]">Ready to Dispatch</span>
            <span className="bg-[#E8F5E9] text-[#107E3E] text-[10px] font-medium px-2 py-0.5 rounded-full border border-[#C5E1A5]">
              {readyPool.length} job{readyPool.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="text-center py-6 text-[12px] text-[#555]">Loading…</div>
          ) : readyPool.length === 0 ? (
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] p-6 text-center text-[12px] text-[#555] italic">
              No jobs ready to dispatch yet.
            </div>
          ) : (
            <div className="space-y-2">
              {readyGroups.map(group => {
                const collapsed = collapsedCust.has(group.customer);
                return (
                  <div key={group.customer} className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden">
                    {/* Customer header */}
                    <button type="button" onClick={() => toggleCust(group.customer)}
                      className="w-full px-3 py-2 border-b border-[#E4E5E6] bg-[#FAFAFA] flex items-center gap-2 text-left hover:bg-[#F3F6F9] transition-colors">
                      {collapsed ? <ChevronRight size={13} className="text-[#555]" /> : <ChevronDown size={13} className="text-[#555]" />}
                      <span className="text-[12px] font-semibold text-[#111] flex-1">{group.customer}</span>
                      <span className="text-[10px] text-[#555]">{group.pos.size} PO{group.pos.size !== 1 ? 's' : ''}</span>
                      <span className="bg-[#E8F5E9] text-[#107E3E] text-[10px] font-medium px-2 py-0.5 rounded-full border border-[#C5E1A5]">
                        {group.totalReady.toLocaleString()} pcs ready
                      </span>
                    </button>

                    {!collapsed && (
                      <div className="divide-y divide-[#F0F0F0]">
                        {[...group.pos.values()].map(po => (
                          <div key={po.po} className="px-3 py-2">
                            {/* PO sub-header */}
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555]">PO</span>
                              <span className="font-mono text-[11px] font-bold text-[#0A6ED1]">{po.po}</span>
                              <span className="text-[10px] text-[#107E3E]">{po.totalReady.toLocaleString()} pcs ready</span>
                              <button type="button" onClick={() => dispatchPo(group.customer, po.po)}
                                className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-medium bg-[#107E3E] text-white rounded-[3px] px-2 py-0.5 hover:bg-[#0B5C2A] transition-colors">
                                <Package size={11} /> Dispatch this PO →
                              </button>
                            </div>
                            {/* Job rows */}
                            <table className="w-full border-collapse text-[11.5px]">
                              <thead>
                                <tr className="text-[9.5px] text-[#555] uppercase tracking-wider">
                                  <th className="text-left pb-1 pr-3 font-semibold">Job Card</th>
                                  <th className="text-left pb-1 pr-3 font-semibold">Product</th>
                                  <th className="text-left pb-1 pr-3 font-semibold">Promised</th>
                                  <th className="text-right pb-1 pr-3 font-semibold">Ordered</th>
                                  <th className="text-right pb-1 pr-3 font-semibold">Dispatched</th>
                                  <th className="text-right pb-1 pr-3 font-semibold text-[#107E3E]">Ready</th>
                                  <th className="text-right pb-1 pr-3 font-semibold">Remaining</th>
                                  <th className="text-right pb-1 font-semibold">Surplus</th>
                                </tr>
                              </thead>
                              <tbody>
                                {po.rows.map(({ job, stats }) => {
                                  const already   = dispatchedByJob[job.id] || 0;
                                  const remaining = job.qty ? Math.max(0, job.qty - already) : null;
                                  // Surplus = ready beyond what the order still needs (over-production).
                                  const surplus   = remaining != null ? Math.max(0, stats.readyQty - remaining) : 0;
                                  const overdue   = job.promised_date && job.promised_date < new Date().toISOString().slice(0, 10);
                                  const surplusPosted = fgStock.some(r => r.job_card_id === job.id && r.movement === 'surplus_in');
                                  return (
                                    <tr key={job.id} className="border-t border-[#F3F3F3] hover:bg-[#EEF4FF] cursor-pointer"
                                      onClick={() => navigate(`/production/dispatch/new?jc=${job.id}`)}>
                                      <td className="py-1 pr-3 font-mono text-[#0A6ED1] font-bold whitespace-nowrap">
                                        {job.priority === 'emergency' && <span className="text-[#BB0000] mr-0.5">🔴</span>}{job.id}
                                      </td>
                                      <td className="py-1 pr-3 text-[#111] max-w-[200px] truncate">{productIdentity(job)}</td>
                                      <td className={`py-1 pr-3 font-mono whitespace-nowrap ${overdue ? 'text-[#BB0000] font-semibold' : 'text-[#555]'}`}>
                                        {fmtDate(job.promised_date)}{overdue ? ' ⚠' : ''}
                                      </td>
                                      <td className="py-1 pr-3 text-right font-mono text-[#555]">{(job.qty || 0).toLocaleString()}</td>
                                      <td className="py-1 pr-3 text-right font-mono text-[#555]">{stats.dispatched.toLocaleString()}</td>
                                      <td className="py-1 pr-3 text-right font-mono font-semibold text-[#107E3E]">{stats.readyQty.toLocaleString()}</td>
                                      <td className="py-1 pr-3 text-right font-mono text-[#111]">{remaining != null ? remaining.toLocaleString() : '—'}</td>
                                      <td className="py-1 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                        {surplus > 0 && !surplusPosted ? (
                                          <button type="button" onClick={() => postSurplus(job, surplus)}
                                            title="Move over-produced units into finished-goods stock"
                                            className="inline-flex items-center gap-1 text-[10px] font-medium text-[#E9730C] border border-[#FFE0B2] bg-[#FFF8EC] rounded-[3px] px-1.5 py-0.5 hover:bg-[#FFE0B2] transition-colors">
                                            <Boxes size={10} /> +{surplus} → stock
                                          </button>
                                        ) : surplus > 0 && surplusPosted ? (
                                          <span className="text-[10px] text-[#107E3E] font-medium" title="Already added to finished-goods stock">✓ in stock</span>
                                        ) : <span className="font-mono text-[#9E9E9E]">—</span>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Finished-Goods (surplus) Stock ── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Boxes size={13} className="text-[#E9730C]" />
            <span className="text-[12px] font-semibold text-[#111]">Finished-Goods Stock</span>
            <span className="text-[10px] text-[#555]">surplus held by family code · usable on future orders</span>
          </div>
          {fgByFamily.length === 0 ? (
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] p-4 text-center text-[11.5px] text-[#555] italic">
              No surplus finished-goods stock. Over-produced units posted from the ready pool appear here.
            </div>
          ) : (
            <Table>
              <THead>
                <tr><TH>Family (Type·Model·MOC)</TH><TH className="text-right">On-hand (pcs)</TH></tr>
              </THead>
              <tbody>
                {fgByFamily.map(([family, qty]) => (
                  <TR key={family}>
                    <TD className="font-mono text-[11px] text-[#0A6ED1] font-semibold">{family}</TD>
                    <TD className="text-right font-mono font-semibold text-[#107E3E]">{qty.toLocaleString()}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        {/* ── Dispatch Register ── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[12px] font-semibold text-[#111]">Dispatch Register</span>
            <span className="text-[10px] text-[#555]">{dispatches.length} invoice{dispatches.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden">
            {dispatches.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-[#555] italic">No dispatches yet.</div>
            ) : (
              <table className="w-full border-collapse text-[12px]">
                <thead className="bg-[#FAFAFA]">
                  <tr>
                    {['', 'DSP ID', 'Invoice No', 'Date', 'Customer', 'Total Qty', 'Mode', 'Courier / Tracking', 'Status', 'Value', 'Actions'].map(h => (
                      <th key={h} className="text-[10px] font-semibold text-[#555] uppercase px-3 py-2 text-left whitespace-nowrap border-b border-[#E4E5E6]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map(d => {
                    const isOpen = expanded.has(d.id);
                    const items  = getItemsForDispatch(d.id);
                    const reversed = d.status === 'Reversed';
                    const statusColor = reversed                 ? 'text-[#9E9E9E]' :
                                        d.status === 'Delivered' ? 'text-[#107E3E]' :
                                        d.status === 'Returned'  ? 'text-[#BB0000]' :
                                        d.status === 'In Transit'? 'text-[#0A6ED1]' : 'text-[#E9730C]';
                    return (
                      <>
                        <tr key={d.id} className={`border-b border-[#F3F3F3] hover:bg-[#EEF4FF] cursor-pointer ${reversed ? 'opacity-55' : ''}`}
                          onClick={() => toggleExpand(d.id)}>
                          <td className="px-3 py-2">
                            {isOpen ? <ChevronDown size={12} className="text-[#555]" /> : <ChevronRight size={12} className="text-[#555]" />}
                          </td>
                          <td className="px-3 py-2 font-mono text-[10.5px] font-bold text-[#0A6ED1]">{d.id}</td>
                          <td className="px-3 py-2 font-semibold text-[#111]">
                            <span className={reversed ? 'line-through' : ''}>{d.invoice_no}</span>
                            {reversed && <span className="ml-1.5 text-[9px] bg-[#FFEBEE] text-[#BB0000] px-1.5 py-0.5 rounded font-medium align-middle">REVERSED</span>}
                            {d.corrected_at && !reversed && <span className="ml-1.5 text-[9px] bg-[#FFF3E0] text-[#E9730C] px-1.5 py-0.5 rounded font-medium align-middle">corrected</span>}
                          </td>
                          <td className="px-3 py-2 text-[#555] whitespace-nowrap">{d.dispatch_date}</td>
                          <td className="px-3 py-2 font-medium text-[#111]">{d.customer_name}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">{d.total_qty_dispatched?.toLocaleString()}</td>
                          <td className="px-3 py-2 text-[#555]">{d.mode || '—'}</td>
                          <td className="px-3 py-2 text-[#555] max-w-[160px] truncate">
                            {d.courier_name || '—'}
                            {d.tracking_number && <span className="ml-1 font-mono text-[10px]">· {d.tracking_number}</span>}
                          </td>
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            <select
                              value={d.status}
                              onChange={e => handleStatusChange(d.id, e.target.value)}
                              disabled={reversed}
                              className={`text-[11px] font-medium border border-[#E4E5E6] rounded-[3px] px-1.5 py-0.5 bg-white outline-none disabled:bg-[#F5F6F7] ${statusColor}`}
                              title="Update status"
                            >
                              {DISPATCH_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-[#555]">
                            {d.invoice_value ? `₹${Number(d.invoice_value).toLocaleString('en-IN')}` : '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {reversed ? (
                              <span className="text-[10px] text-[#9E9E9E] italic" title={d.reversal_note || ''}>reversed</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => startCorrection(d)} title="Correct this dispatch"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-[#E9730C] border border-[#FFE0B2] rounded-[3px] px-1.5 py-0.5 hover:bg-[#FFF8EC] transition-colors">
                                  <Pencil size={10} /> Correct
                                </button>
                                <button type="button" onClick={() => handleReverse(d)} title="Reverse this dispatch (qty returns to pool)"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-[#BB0000] border border-[#FFCDD2] rounded-[3px] px-1.5 py-0.5 hover:bg-[#FFEBEE] transition-colors">
                                  <Undo2 size={10} /> Reverse
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* Expanded line items */}
                        {isOpen && (
                          <tr key={`${d.id}-exp`} className="bg-[#FAFAFA] border-b border-[#E4E5E6]">
                            <td colSpan={11} className="px-6 py-3">
                              <div className="text-[10.5px] font-semibold text-[#555] uppercase tracking-wider mb-2">
                                Line Items — {items.length} job card{items.length !== 1 ? 's' : ''}
                              </div>
                              {items.length === 0 ? (
                                <div className="text-[11px] text-[#555] italic">No line items.</div>
                              ) : (
                                <table className="w-full border-collapse text-[11.5px]">
                                  <thead>
                                    <tr className="text-[10px] text-[#555] uppercase">
                                      <th className="text-left pb-1 pr-4">Job Card</th>
                                      <th className="text-left pb-1 pr-4">Description</th>
                                      <th className="text-left pb-1 pr-4">Die No</th>
                                      <th className="text-right pb-1 pr-4">Ordered</th>
                                      <th className="text-right pb-1 pr-4">Dispatched</th>
                                      <th className="text-right pb-1">Remaining</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map(item => (
                                      <tr key={item.id} className="border-t border-[#EBEBEB]">
                                        <td className="py-1 pr-4 font-mono text-[#0A6ED1] font-bold">{item.job_card_id}</td>
                                        <td className="py-1 pr-4 text-[#111]">{item.ordered_item || '—'}</td>
                                        <td className="py-1 pr-4 font-mono text-[#555]">{item.die_no || '—'}</td>
                                        <td className="py-1 pr-4 text-right font-mono">{item.ordered_qty?.toLocaleString() || '—'}</td>
                                        <td className="py-1 pr-4 text-right font-mono font-semibold text-[#107E3E]">{item.qty_dispatched.toLocaleString()}</td>
                                        <td className="py-1 text-right font-mono">{item.remaining_qty?.toLocaleString() ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {d.bilty_no && (
                                <div className="mt-2 text-[10.5px] text-[#555]">
                                  Bilty: <strong>{d.bilty_no}</strong>
                                  {d.bilty_date && ` · ${d.bilty_date}`}
                                  {d.no_of_cartons && ` · ${d.no_of_cartons} cartons`}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Dispatch correction modal */}
      {correcting && (
        <CorrectionModal
          entryId={`${correcting.id} · ${correcting.invoice_no}`}
          onClose={() => setCorrecting(null)}
          onConfirm={saveCorrection}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Total Qty Dispatched</label>
              <input type="number" className="w-full text-[12px] border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]"
                value={corrFields.qty} onChange={e => setCorrFields(f => ({ ...f, qty: e.target.value }))} title="Total qty" />
              {getItemsForDispatch(correcting.id).length > 1 && (
                <div className="text-[9.5px] text-[#E9730C] mt-0.5">Multi-line dispatch — header total only; edit line qty per item separately.</div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Invoice Seq (4-digit)</label>
              <input className="w-full text-[12px] font-mono border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]"
                value={corrFields.invoiceSeq} maxLength={4}
                onChange={e => setCorrFields(f => ({ ...f, invoiceSeq: e.target.value.replace(/\D/g, '').slice(0, 4) }))} title="Invoice seq" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Transport Mode</label>
              <input className="w-full text-[12px] border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]"
                value={corrFields.mode} onChange={e => setCorrFields(f => ({ ...f, mode: e.target.value }))} title="Mode" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Courier</label>
              <input className="w-full text-[12px] border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]"
                value={corrFields.courier} onChange={e => setCorrFields(f => ({ ...f, courier: e.target.value }))} title="Courier" />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Tracking / LR No</label>
              <input className="w-full text-[12px] border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]"
                value={corrFields.tracking} onChange={e => setCorrFields(f => ({ ...f, tracking: e.target.value }))} title="Tracking" />
            </div>
          </div>
        </CorrectionModal>
      )}
    </div>
  );
}
