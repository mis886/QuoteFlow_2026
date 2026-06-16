// Bulk-import jobs from open CRM Orders.
// Each order line becomes one Production Job, preserving the
// Beta read-only contract on public.orders.

import { useEffect, useMemo, useState } from 'react';
import { X, Check, Download, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui';
import { listOrdersWithoutJobs, type CrmOrderLite } from '../lib/crmReadOnly';
import { insertJob, logStageEvent, nextJobId } from '../lib/db';
import { localDateStr } from '../../lib/utils';
import type { ProductionJob } from '../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after every selected line has been written. */
  onImported: () => void | Promise<void>;
  existingJobIds: string[];
}

interface DraftLine {
  orderId: string;
  poNo: string | null;
  customer: string;
  productDesc: string;
  qty: number;
  promised: string | null;
  seq: number | undefined;
  // Inferred during import — not editable here:
  compoundCode: string;
}

function flatten(orders: CrmOrderLite[]): DraftLine[] {
  const out: DraftLine[] = [];
  for (const o of orders) {
    const items = o.items || [];
    if (items.length === 0) {
      out.push({
        orderId: o.id, poNo: o.po_no, customer: o.cust || '—',
        productDesc: '(no line items)',
        qty: 0, promised: o.dlv_date, seq: undefined, compoundCode: '',
      });
      continue;
    }
    items.forEach(it => {
      const desc = [it.desc, it.mat].filter(Boolean).join(' · ');
      out.push({
        orderId: o.id,
        poNo: o.po_no,
        customer: o.cust || '—',
        productDesc: desc || '(empty line)',
        qty: it.qty || 0,
        promised: o.dlv_date,
        seq: it.seq,
        compoundCode: it.mat || '',
      });
    });
  }
  return out;
}

export function ImportFromOrdersModal({ open, onClose, onImported, existingJobIds }: Props) {
  const [orders, setOrders] = useState<CrmOrderLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicked(new Set()); setFilter('');
    (async () => {
      setLoading(true);
      const data = await listOrdersWithoutJobs();
      setOrders(data);
      setLoading(false);
    })();
  }, [open]);

  const allLines = useMemo(() => flatten(orders), [orders]);
  const lines = useMemo(() => {
    if (!filter.trim()) return allLines;
    const t = filter.toLowerCase();
    return allLines.filter(l =>
      (l.poNo || '').toLowerCase().includes(t) ||
      l.customer.toLowerCase().includes(t) ||
      l.productDesc.toLowerCase().includes(t)
    );
  }, [allLines, filter]);

  const keyFor = (l: DraftLine) => `${l.orderId}:${l.seq ?? 0}`;

  const toggle = (k: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visible = lines.filter(l => l.qty > 0).map(keyFor);
    const allChecked = visible.every(k => picked.has(k));
    setPicked(prev => {
      const next = new Set(prev);
      if (allChecked) visible.forEach(k => next.delete(k));
      else            visible.forEach(k => next.add(k));
      return next;
    });
  };

  const submit = async () => {
    if (picked.size === 0) return;
    setImporting(true);
    try {
      const idPool = [...existingJobIds];
      const today = localDateStr(new Date());
      for (const l of lines) {
        if (!picked.has(keyFor(l))) continue;
        const id = nextJobId(idPool);
        idPool.push(id);
        const job: ProductionJob = {
          id,
          job_card_no: id.replace(/^MRT-\d+-/, 'JC'),
          order_id: l.orderId,
          order_line_seq: l.seq ?? null,
          customer_id: null,
          customer_name: l.customer,
          product_desc: l.productDesc,
          qty: l.qty,
          qty_to_mould: l.qty,
          qty_done: 0,
          promised_date: l.promised,
          lsd: null,
          order_start_date: today,
          target_completion_date: null,
          priority: 'normal',
          emergency_reason: null,
          notes: l.poNo ? `Imported from CRM Order ${l.poNo}` : null,
          stage: 'queued',
          status: 'queued',
          batch_code: null,
          batch_name: null,
          mould_code: null,
          cavities: null,
          cure_time_min: null,
          cure_temp_c: null,
          compound_code: l.compoundCode || null,
          tikli_size: null,
          press_id: null,
          inspector: null,
          inspection_result: null,
          pdi_officer: null,
          inspection_passed_at: null,
          courier: null,
          consignment_no: null,
          dispatched_at: null,
          otd_result: null,
          fg_stock_at_print: null,
          wip_stock_at_print: null,
          press_operator_name: null,
          finishing_checked_by: null,
          inspection_checked_by: null,
          approved_by: null,
        };
        await insertJob(job);
        await logStageEvent(job.id, 'queued', null, null,
          l.poNo ? `Imported from CRM Order ${l.poNo} line ${l.seq ?? '?'}` : 'Imported from CRM');
      }
      await onImported();
      onClose();
    } catch (e) {
      console.error('Import failed', e);
      alert('Import failed. See console.');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const visibleCount = lines.filter(l => l.qty > 0).length;
  const allChecked = visibleCount > 0 && lines.filter(l => l.qty > 0).every(l => picked.has(keyFor(l)));
  const selectedQty = lines
    .filter(l => picked.has(keyFor(l)))
    .reduce((s, l) => s + l.qty, 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-[4px] w-full max-w-[820px] max-h-[85vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between shrink-0">
          <div className="text-[13px] font-semibold text-[#111] flex items-center gap-1.5">
            <Download size={14} className="text-[#111]" /> Import from open CRM Orders
            <span className="ml-2 font-normal text-[#333] text-[11px]">
              One job per order line · read-only on CRM orders
            </span>
          </div>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="text-[#333] hover:text-[#111]">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-[#E4E5E6] flex items-center gap-2 shrink-0">
          <input
            type="text"
            placeholder="Filter by PO, customer, product…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="flex-1 font-sans text-[12px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt"
          />
          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={visibleCount === 0}
            className="text-[11px] text-[#111] border border-[#CCC] rounded-[3px] px-2.5 py-1 hover:bg-[#FAFAFA] disabled:opacity-50"
          >
            {allChecked ? 'Deselect all visible' : 'Select all visible'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-[12px] text-[#555]">
              <Loader2 size={14} className="inline animate-spin mr-1" /> Loading open orders…
            </div>
          ) : lines.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-[#555]">
              No open orders without production jobs.
            </div>
          ) : (
            <div className="divide-y divide-[#F3F3F3]">
              {lines.map(l => {
                const k = keyFor(l);
                const checked = picked.has(k);
                const disabled = l.qty === 0;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(k)}
                    className={`w-full text-left px-4 py-2 flex items-start gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      checked ? 'bg-red-mrt/5' : 'hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <span
                      className={`shrink-0 mt-0.5 w-[14px] h-[14px] rounded-[2px] border flex items-center justify-center ${
                        checked ? 'bg-red-mrt border-[#0A6ED1]' : 'border-[#CCC] bg-white'
                      }`}
                    >
                      {checked && <Check size={10} className="text-white" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-[#0A6ED1]">
                          {l.poNo || l.orderId}
                          {l.seq ? <span className="text-[#333] font-normal"> · L{l.seq}</span> : null}
                        </span>
                        <span className="text-[12.5px] font-semibold text-[#111] truncate max-w-[420px]">
                          {l.productDesc}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-[#333] mt-0.5">
                        {l.customer} · {l.qty ? `${l.qty.toLocaleString()} pcs` : 'no qty'}
                        {l.promised ? ` · due ${l.promised}` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#E4E5E6] flex items-center gap-2 shrink-0">
          <div className="text-[11px] text-[#333] flex-1">
            {picked.size > 0
              ? <><strong>{picked.size}</strong> line{picked.size === 1 ? '' : 's'} selected · {selectedQty.toLocaleString()} pcs total</>
              : 'No lines selected'}
          </div>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={picked.size === 0 || importing}
            className="gap-1"
          >
            {importing ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {importing ? 'Importing…' : `Import ${picked.size || ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
