// Production · Orders — open CRM orders awaiting a production job, sorted by
// promised / delivery date so the planner can sequence work and create a
// New Production Job (pre-filled from the chosen order) per the schedule.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, FileInput, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui';
import {
  Table, THead, TH, TR, TD, EmptyRow, PageHeader, FilterBar,
} from '../components/table';
import { listOrdersWithoutJobs, type CrmOrderLite } from '../lib/crmReadOnly';
import { fmtDate, localDateStr, formatINR } from '../../lib/utils';

type Urgency = 'all' | 'overdue' | 'soon' | 'later';

// Order Value = Σ line totals + GST (mirrors the CRM Orders register calc).
const orderValue = (o: CrmOrderLite): number =>
  (o.items || []).reduce((s, i) => {
    const tot = i.total ?? 0;
    return s + tot + (tot * (i.gst || 0)) / 100;
  }, 0);

export function ProductionOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CrmOrderLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('all');

  const load = () => {
    setLoading(true);
    listOrdersWithoutJobs().then(list => { setOrders(list); setLoading(false); });
  };
  useEffect(load, []);

  const today = localDateStr(new Date());
  const soonCutoff = localDateStr(new Date(Date.now() + 7 * 86400000)); // ≤7 days

  // Delivery-urgency bucket from the promised/delivery date.
  const urgencyOf = (o: CrmOrderLite): Exclude<Urgency, 'all'> | 'undated' => {
    if (!o.dlv_date) return 'undated';
    if (o.dlv_date < today) return 'overdue';
    if (o.dlv_date <= soonCutoff) return 'soon';
    return 'later';
  };

  // Sort by promised/delivery date (earliest first); undated last.
  const sorted = useMemo(() => {
    return [...orders].sort((a, b) => {
      const da = a.dlv_date || '';
      const db = b.dlv_date || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }, [orders]);

  // Counts per urgency bucket (computed before the urgency filter is applied).
  const counts = useMemo(() => {
    const c = { all: sorted.length, overdue: 0, soon: 0, later: 0 };
    for (const o of sorted) {
      const u = urgencyOf(o);
      if (u === 'overdue' || u === 'soon' || u === 'later') c[u]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, today, soonCutoff]);

  const filtered = useMemo(() => {
    return sorted.filter(o => {
      if (urgency !== 'all' && urgencyOf(o) !== urgency) return false;
      if (q) {
        const t = q.toLowerCase();
        return (
          (o.po_no || '').toLowerCase().includes(t) ||
          (o.id || '').toLowerCase().includes(t) ||
          (o.cust || '').toLowerCase().includes(t)
        );
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, q, urgency, today, soonCutoff]);

  const createJob = (orderId: string) =>
    navigate(`/production/jobs/new?order=${encodeURIComponent(orderId)}`);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module="Production · Orders"
        title="Orders"
        accent="to Sequence"
        subtitle="Open orders awaiting production, by promised date. Create a Production Job to send work to the sequencer."
        actions={
          <Button onClick={load} variant="secondary" className="gap-2">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      <FilterBar>
        {/* Delivery-urgency filter tabs with counts */}
        <div className="flex flex-wrap">
          <UrgencyTab label="All"        count={counts.all}     active={urgency === 'all'}     onClick={() => setUrgency('all')} />
          <UrgencyTab label="Overdue"    count={counts.overdue} active={urgency === 'overdue'} onClick={() => setUrgency(urgency === 'overdue' ? 'all' : 'overdue')} activeCls="bg-[#BB0000] text-white border-[#BB0000]" />
          <UrgencyTab label="Due ≤7 days" count={counts.soon}   active={urgency === 'soon'}    onClick={() => setUrgency(urgency === 'soon' ? 'all' : 'soon')}    activeCls="bg-[#E9730C] text-white border-[#E9730C]" />
          <UrgencyTab label="Later"      count={counts.later}   active={urgency === 'later'}   onClick={() => setUrgency(urgency === 'later' ? 'all' : 'later')} />
        </div>
        <div className="flex items-center gap-1.5 bg-white border border-[#E4E5E6] rounded px-2 h-7 min-w-[240px] focus-within:border-[#0A6ED1] focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-[#555] shrink-0" />
          <input
            type="text"
            placeholder="PO no, order, customer…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-[#111] w-full placeholder:text-[#555]"
          />
        </div>
        <div className="ml-auto font-mono text-[10px] text-[#333]">
          {filtered.length} open order{filtered.length !== 1 ? 's' : ''}
        </div>
      </FilterBar>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              <TH>PO / Order</TH>
              <TH>Customer</TH>
              <TH>Lines</TH>
              <TH>Total Qty</TH>
              <TH>Order Value</TH>
              <TH>PO Date</TH>
              <TH>Promised</TH>
              <TH>Action</TH>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <EmptyRow colSpan={8} text="Loading open orders…" />
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={8} text="No open orders awaiting a production job." />
            ) : filtered.map(o => {
              const lines = (o.items || []).length;
              const totalQty = (o.items || []).reduce((s, i) => s + (i.qty || 0), 0);
              const overdue = o.dlv_date && o.dlv_date < today;
              return (
                <TR key={o.id} onClick={() => createJob(o.id)}>
                  <TD>
                    <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">{o.po_no || o.id}</span>
                  </TD>
                  <TD className="text-[12.5px]">{o.cust || '—'}</TD>
                  <TD className="font-mono text-[11.5px]">{lines}</TD>
                  <TD className="font-mono text-[11.5px]">{totalQty.toLocaleString()}</TD>
                  <TD className="font-mono text-[11.5px] font-semibold">{formatINR(orderValue(o))}</TD>
                  <TD className="font-mono text-[11px] text-[#666]">{fmtDate(o.po_date)}</TD>
                  <TD className={`font-mono text-[11px] ${overdue ? 'text-[#BB0000] font-semibold' : 'text-[#666]'}`}>
                    {fmtDate(o.dlv_date)}{overdue ? ' ⚠' : ''}
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); createJob(o.id); }}
                      className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[#0A6ED1] border border-[#C2D8F8] rounded-[3px] px-2 py-1 hover:bg-[#E8F0FD] transition-colors whitespace-nowrap"
                    >
                      <FileInput size={11} /> Create Job <ArrowRight size={11} />
                    </button>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>

        <div className="mt-3 flex items-center gap-2 text-[11px] text-[#333]">
          <FileInput size={11} />
          <span>Click a row (or “Create Job”) to open a pre-filled New Production Job. Orders that already have a job are hidden.</span>
        </div>
      </div>
    </div>
  );
}

// Segmented urgency filter tab with count (joined-border pill group).
function UrgencyTab({ label, count, active, activeCls, onClick }: {
  label: string; count: number; active: boolean; activeCls?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11.5px] px-[13px] py-[5px] border border-r-0 last:border-r whitespace-nowrap transition-colors first:rounded-l-[3px] last:rounded-r-[3px] ${
        active
          ? (activeCls || 'bg-[#0A6ED1] text-white border-[#0A6ED1]')
          : 'bg-white text-[#6A6D70] border-[#E4E5E6] hover:bg-[#F7F7F7] hover:text-[#32363A]'
      }`}
    >
      {label} <span className="text-[10px] opacity-80">({count})</span>
    </button>
  );
}
