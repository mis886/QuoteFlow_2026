import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, FlaskConical, Clock, CheckCircle2, XCircle, X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { localDateStr } from '../lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type SampleStatus = 'pending' | 'dispatched' | 'feedback_received' | 'approved' | 'rejected';
type SampleOutcome = 'approved' | 'rejected' | 'reformulation_needed';

interface Sample {
  id: string;
  enq_ref?: string | null;
  quote_ref?: string | null;
  cust: string;
  product_name: string;
  product_grade?: string | null;
  quantity: number;
  unit: string;
  sent_date?: string | null;
  followup_due?: string | null;
  courier_details?: string | null;
  cost: number;
  status: SampleStatus;
  feedback_received: boolean;
  outcome?: SampleOutcome | null;
  notes?: string | null;
  sent_by?: string | null;
  created_at?: string | null;
}

const UNITS = ['g', 'ml', 'kg', 'L'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SampleStatusBadge({ status }: { status: SampleStatus }) {
  const cfg: Record<SampleStatus, { bg: string; dot: string; label: string }> = {
    pending:           { bg: 'bg-yellow-50 text-yellow-700', dot: 'bg-yellow-400', label: 'Pending' },
    dispatched:        { bg: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500', label: 'Dispatched' },
    feedback_received: { bg: 'bg-amber-50 text-amber-700',  dot: 'bg-amber-500',  label: 'Feedback Rcvd' },
    approved:          { bg: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Approved' },
    rejected:          { bg: 'bg-red-50 text-red-700',      dot: 'bg-red-500',    label: 'Rejected' },
  };
  const c = cfg[status] ?? cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold whitespace-nowrap ${c.bg}`}>
      <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
}

function OutcomeCell({ outcome }: { outcome?: SampleOutcome | null }) {
  if (!outcome) return <span className="text-g400 text-[11px]">Pending</span>;
  if (outcome === 'approved') return <span className="text-emerald-600 font-semibold text-[11px]">✓ Approved</span>;
  if (outcome === 'rejected') return <span className="text-red-600 font-semibold text-[11px]">✗ Rejected</span>;
  return <span className="text-amber-600 font-semibold text-[11px]">↺ Reformulation</span>;
}

function FollowUpCell({ date, resolved }: { date?: string | null; resolved: boolean }) {
  if (resolved) return <span className="font-mono text-[11px] text-g400">{fmtDate(date)}</span>;
  if (!date) return <span className="text-g400 text-[11px]">—</span>;
  const today = localDateStr(new Date());
  const diff = Math.ceil((new Date(date).getTime() - new Date(today).getTime()) / 86400000);
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px]">{fmtDate(date)}</span>
      {diff < 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold uppercase tracking-wide bg-red-50 text-red-700 whitespace-nowrap w-fit">
          Overdue
        </span>
      )}
      {diff >= 0 && diff <= 3 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 whitespace-nowrap w-fit">
          Due Soon
        </span>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }: {
  label: string; value: number;
  color: 'purple' | 'amber' | 'green' | 'red' | 'yellow';
  icon: React.ReactNode;
}) {
  const cfg = {
    purple: { border: 'border-t-purple-500', iconBg: 'bg-purple-50', iconText: 'text-purple-500' },
    amber:  { border: 'border-t-amber-500',  iconBg: 'bg-amber-50',  iconText: 'text-amber-500'  },
    green:  { border: 'border-t-emerald-500',iconBg: 'bg-emerald-50',iconText: 'text-emerald-500' },
    red:    { border: 'border-t-red-500',    iconBg: 'bg-red-50',    iconText: 'text-red-500'    },
    yellow: { border: 'border-t-yellow-400', iconBg: 'bg-yellow-50', iconText: 'text-yellow-500' },
  };
  const c = cfg[color];
  return (
    <div className={`bg-white rounded-[10px] border border-g200 border-t-[3px] ${c.border} p-5 flex flex-col gap-2 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase text-g500">{label}</div>
        <div className={`w-8 h-8 rounded-[6px] flex items-center justify-center shrink-0 ${c.iconBg}`}>
          <span className={c.iconText}>{icon}</span>
        </div>
      </div>
      <div className="font-sans text-[28px] leading-none font-bold text-blk tracking-tight">{value}</div>
    </div>
  );
}

// ─── Feedback Modal ───────────────────────────────────────────────────────────

function FeedbackModal({ sample, onClose, onSaved }: {
  sample: Sample;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState<SampleOutcome | null>(sample.outcome ?? null);
  const [notes, setNotes] = useState(sample.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!outcome) { setError('Please select an outcome.'); return; }
    setSaving(true);
    setError('');
    const newStatus: SampleStatus = outcome === 'approved' ? 'approved' : 'rejected';
    const { error: err } = await supabase
      .from('samples')
      .update({
        outcome,
        status: newStatus,
        feedback_received: true,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sample.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  };

  const outcomes: { value: SampleOutcome; label: string; activeClass: string; inactiveClass: string }[] = [
    {
      value: 'approved',
      label: '✓ Approved',
      activeClass: 'bg-emerald-600 text-white border-emerald-600',
      inactiveClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400',
    },
    {
      value: 'rejected',
      label: '✗ Rejected',
      activeClass: 'bg-red-600 text-white border-red-600',
      inactiveClass: 'bg-red-50 text-red-700 border-red-200 hover:border-red-400',
    },
    {
      value: 'reformulation_needed',
      label: '↺ Reformulation',
      activeClass: 'bg-amber-500 text-white border-amber-500',
      inactiveClass: 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center animate-in fade-in duration-200"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-g300">
        {/* Header */}
        <div className="p-4 border-b border-g200 flex items-center justify-between bg-white">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-0.5">Record Feedback</div>
            <div className="font-serif text-[18px] text-blk tracking-tight">{sample.id}</div>
            <div className="text-[11px] text-g500 mt-0.5">{sample.product_name}{sample.product_grade ? ` · ${sample.product_grade}` : ''} · {sample.cust}</div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded text-g400 hover:text-blk hover:bg-g100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-red-600 text-[11.5px] bg-red-50 border border-red-200 rounded-[3px] px-3 py-2">{error}</div>
          )}

          <div>
            <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-g500 mb-2">Outcome</div>
            <div className="grid grid-cols-3 gap-2">
              {outcomes.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOutcome(opt.value)}
                  className={`px-2 py-3 border rounded-[5px] text-[11px] font-bold tracking-wide transition-all ${outcome === opt.value ? opt.activeClass : opt.inactiveClass}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Notes</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              placeholder="Customer feedback, test results, observations..."
              className="w-full font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-all resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-g200 flex items-center justify-end gap-2 bg-g50">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving || !outcome} onClick={handleSave} className="gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Saving...' : 'Save Feedback'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Sampling() {
  const navigate = useNavigate();
  useAppStore(); // keep store subscription for future use
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackTarget, setFeedbackTarget] = useState<Sample | null>(null);
  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | SampleStatus>('all');

  const fetchSamples = async () => {
    const { data: rows, error } = await supabase
      .from('samples')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && rows) setSamples(rows as Sample[]);
    setLoading(false);
  };

  useEffect(() => { fetchSamples(); }, []);

  const today = localDateStr(new Date());
  const thisMonthStart = `${today.slice(0, 7)}-01`;

  const stats = useMemo(() => ({
    pending:          samples.filter(s => s.status === 'pending').length,
    sentThisMonth:    samples.filter(s => s.sent_date && s.sent_date >= thisMonthStart).length,
    awaitingFeedback: samples.filter(s => !s.feedback_received).length,
    approved:         samples.filter(s => s.outcome === 'approved').length,
    rejected:         samples.filter(s => s.outcome === 'rejected' || s.outcome === 'reformulation_needed').length,
  }), [samples, thisMonthStart]);

  const filtered = useMemo(() => {
    let list = samples;
    if (tabFilter !== 'all') list = list.filter(s => s.status === tabFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.id.toLowerCase().includes(q) ||
        s.cust.toLowerCase().includes(q) ||
        s.product_name.toLowerCase().includes(q) ||
        (s.quote_ref ?? '').toLowerCase().includes(q) ||
        (s.enq_ref ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [samples, tabFilter, search]);

  const tabCounts = useMemo(() => ({
    all:               samples.length,
    pending:           samples.filter(s => s.status === 'pending').length,
    dispatched:        samples.filter(s => s.status === 'dispatched').length,
    feedback_received: samples.filter(s => s.status === 'feedback_received').length,
    approved:          samples.filter(s => s.status === 'approved').length,
    rejected:          samples.filter(s => s.status === 'rejected').length,
  }), [samples]);

  const TabBtn = ({ value, label }: { value: typeof tabFilter; label: string }) => (
    <div
      onClick={() => setTabFilter(value)}
      className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${
        tabFilter === value ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'
      }`}
    >
      {label} ({tabCounts[value]})
    </div>
  );

  const thCls = "font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200";
  const tdCls = "px-[13px] py-[10px] align-middle";

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Page header */}
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">
              Module 04
            </div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Sampling <em className="italic text-red-mrt">Tracker</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">New customer samples only · Status tracked per batch</p>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <Button onClick={() => navigate('/sampling/new')} variant="primary" className="gap-2">
              <Plus size={14} className="stroke-2" /> Log New Sample
            </Button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="px-6 pt-4 grid grid-cols-5 gap-3">
        <StatCard label="Pending Dispatch"           value={stats.pending}          color="yellow" icon={<Clock size={16} />} />
        <StatCard label="Samples Sent (This Month)"  value={stats.sentThisMonth}    color="purple" icon={<FlaskConical size={16} />} />
        <StatCard label="Awaiting Feedback"          value={stats.awaitingFeedback} color="amber"  icon={<Clock size={16} />} />
        <StatCard label="Approved → Order"           value={stats.approved}         color="green"  icon={<CheckCircle2 size={16} />} />
        <StatCard label="Rejected / Reformulation"   value={stats.rejected}         color="red"    icon={<XCircle size={16} />} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-4">
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <TabBtn value="all"               label="All" />
          <TabBtn value="pending"           label="Pending" />
          <TabBtn value="dispatched"        label="Dispatched" />
          <TabBtn value="feedback_received" label="Feedback Rcvd" />
          <TabBtn value="approved"          label="Approved" />
          <TabBtn value="rejected"          label="Rejected" />
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[220px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="Sample ID, customer, product..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        <div className="ml-auto font-mono text-[10px] text-g500">
          {filtered.length} sample{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Sample register table */}
      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="bg-white border border-g200 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-g100">
              <tr>
                <th className={thCls}>Sample ID</th>
                <th className={thCls}>Customer</th>
                <th className={thCls}>Product</th>
                <th className={thCls}>Qty Sent</th>
                <th className={thCls}>Linked Ref</th>
                <th className={thCls}>Sent Date</th>
                <th className={thCls}>Follow-Up Due</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Outcome</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center p-10">
                    <div className="flex items-center justify-center gap-2 text-g400">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-[13px]">Loading samples...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center p-10 text-g400 text-[13px]">
                    {search || tabFilter !== 'all'
                      ? 'No samples match this filter'
                      : 'No samples logged yet — click "+ Log Sample" to get started'}
                  </td>
                </tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="border-b border-g100 last:border-b-0 hover:bg-g50 transition-colors">
                    <td className={tdCls}>
                      <span className="font-mono text-[10.5px] font-bold text-red-mrt">{s.id}</span>
                    </td>
                    <td className={tdCls}>
                      <div className="text-[12.5px] font-medium text-blk whitespace-nowrap">{s.cust}</div>
                    </td>
                    <td className={tdCls}>
                      <div className="text-[12.5px] text-blk font-medium">{s.product_name}</div>
                      {s.product_grade && (
                        <div className="text-[10.5px] text-g500 mt-0.5">{s.product_grade}</div>
                      )}
                    </td>
                    <td className={`${tdCls} font-mono text-[11.5px] whitespace-nowrap`}>
                      {s.quantity > 0 ? `${s.quantity} ${s.unit}` : '—'}
                    </td>
                    <td className={tdCls}>
                      {(s.quote_ref || s.enq_ref) ? (
                        <span className="font-mono text-[10.5px] font-bold text-g600">{s.quote_ref || s.enq_ref}</span>
                      ) : (
                        <span className="text-g400 text-[11px]">—</span>
                      )}
                    </td>
                    <td className={`${tdCls} font-mono text-[11px] text-g600 whitespace-nowrap`}>
                      {fmtDate(s.sent_date)}
                    </td>
                    <td className={tdCls}>
                      <FollowUpCell date={s.followup_due} resolved={!!s.outcome} />
                    </td>
                    <td className={tdCls}>
                      <SampleStatusBadge status={s.status} />
                    </td>
                    <td className={tdCls}>
                      <OutcomeCell outcome={s.outcome} />
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5">
                        {!s.outcome && (
                          <button
                            onClick={() => setFeedbackTarget(s)}
                            className="font-mono text-[9px] font-bold tracking-[1px] uppercase px-2.5 py-1.5 bg-white border border-g300 rounded-[3px] text-g600 hover:border-red-mrt hover:text-red-mrt transition-colors whitespace-nowrap"
                          >
                            Record Feedback
                          </button>
                        )}
                        {s.status === 'approved' && (
                          <button
                            onClick={() => navigate(`/orders/new?cust=${encodeURIComponent(s.cust)}`)}
                            className="font-mono text-[9px] font-bold tracking-[1px] uppercase px-2.5 py-1.5 bg-emerald-50 border border-emerald-300 rounded-[3px] text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500 transition-colors whitespace-nowrap"
                          >
                            Convert to Order
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {feedbackTarget && (
        <FeedbackModal
          sample={feedbackTarget}
          onClose={() => setFeedbackTarget(null)}
          onSaved={() => { setFeedbackTarget(null); fetchSamples(); }}
        />
      )}
    </div>
  );
}
