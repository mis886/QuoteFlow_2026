import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseISO, isToday } from 'date-fns';
import { useAppStore } from '../store';
import { cn, fmtIST, tatHealth, fmtElapsed, type TatHealth, siteLabel, isInDateRange } from '../lib/utils';
import { generateQuotePDF, generatePIPDF } from '../lib/pdfGenerator';
import {
  BOARD_LANES,
  DEFAULT_STAGE_TAT_H,
  type BoardLane,
  type PipelineStage,
  type PipelineOutcome,
  type Enquiry,
  type Quote,
  type FollowUp,
  type FollowUpLog,
} from '../lib/types';
import {
  ChevronRight,
  ChevronLeft,
  Clock,
  AlertTriangle,
  FilePlus2,
  CheckCircle2,
  X,
  Trophy,
  Ban,
  ThumbsDown,
  CircleDot,
  History,
  Phone,
  MessageCircle,
  Mail,
  Plus,
  Paperclip,
  FileText,
  Receipt,
} from 'lucide-react';

const PRE_QUOTE_LANES: BoardLane[] = ['New Enquiry', 'To Quote'];
const SLA_H: Record<string, number> = { Hot: 4, Urgent: 24, Normal: 48, Low: 72 };

// Format a TAT budget in hours as a compact label: 96 → "4d", 100 → "4d 4h", 5 → "5h".
function fmtTat(hours: number): string {
  const h = Math.round(hours);
  if (h <= 0) return '0h';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem ? `${d}d ${rem}h` : `${d}d`;
}

// One unified card model for both enquiry-backed and quote-backed lanes.
interface BoardCard {
  key: string;
  lane: BoardLane;
  kind: 'enquiry' | 'quote';
  cust: string;
  site?: string;        // branch / site name shown next to the customer
  title: string;        // ref shown prominently (ENQ no. or quote id)
  subtitle: string;     // secondary ref
  value: number;
  owner: string;
  enteredAt: string | null;
  tatHours: number;
  tat: { health: TatHealth; elapsedH: number; pct: number; overdueH: number };
  enquiry?: Enquiry;
  quote?: Quote;
  followUp?: FollowUp;
  outcome?: PipelineOutcome | null;
}

// Channel styling for the left-side "what happened" chat pills.
const CHANNEL_PILL: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  Called:   { icon: '📞', bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700' },
  WhatsApp: { icon: '💬', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  Email:    { icon: '📧', bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700' },
  Meeting:  { icon: '🤝', bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-700' },
  Visit:    { icon: '📍', bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700' },
};

const LANE_META: Record<BoardLane, { tint: string; bar: string; text: string }> = {
  'New Enquiry':       { tint: 'bg-slate-50',   bar: 'bg-slate-400',   text: 'text-slate-600' },
  'To Quote':          { tint: 'bg-indigo-50',  bar: 'bg-indigo-400',  text: 'text-indigo-600' },
  'Sent Quotation':    { tint: 'bg-blue-50',    bar: 'bg-blue-400',    text: 'text-blue-600' },
  'Offer Acknowledged':{ tint: 'bg-cyan-50',    bar: 'bg-cyan-400',    text: 'text-cyan-600' },
  '1st Follow-up':     { tint: 'bg-amber-50',   bar: 'bg-amber-400',   text: 'text-amber-600' },
  '2nd Follow-up':     { tint: 'bg-orange-50',  bar: 'bg-orange-400',  text: 'text-orange-600' },
  'Negotiation':       { tint: 'bg-purple-50',  bar: 'bg-purple-400',  text: 'text-purple-600' },
  'Closed':            { tint: 'bg-emerald-50', bar: 'bg-emerald-400', text: 'text-emerald-600' },
};

const HEALTH_RING: Record<TatHealth, string> = {
  ok: 'border-g200',
  warn: 'border-amber-400 ring-1 ring-amber-200',
  breach: 'border-red-mrt ring-1 ring-red-200',
  none: 'border-g200',
};

const OUTCOME_META: Record<PipelineOutcome, { icon: React.ReactNode; cls: string; label: string }> = {
  Won:      { icon: <Trophy size={11} />,    cls: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'Won' },
  Lost:     { icon: <Ban size={11} />,       cls: 'bg-red-50 text-red-mrt border-red-200',               label: 'Lost' },
  Rejected: { icon: <ThumbsDown size={11} />,cls: 'bg-rose-50 text-rose-600 border-rose-200',            label: 'Rejected' },
  Other:    { icon: <CircleDot size={11} />, cls: 'bg-g100 text-g600 border-g300',                       label: 'Other' },
};

export default function PipelineBoard({
  ownerFilter = 'All Owners',
  search = '',
  dateRange = null,
}: { ownerFilter?: string; search?: string; dateRange?: { startDate: string; endDate: string } | null }) {
  const navigate = useNavigate();
  const { data, setFollowUpStage, closeFollowUp } = useAppStore();
  const [closing, setClosing] = useState<BoardCard | null>(null);
  const [viewingKey, setViewingKey] = useState<string | null>(null);

  // Resolve TAT (in hours) for a lane: hours config → legacy days config → default.
  const tatHoursFor = (lane: BoardLane): number => {
    const h = data.settings?.pipeline_tat_h?.[lane];
    if (h != null) return h;
    const days = data.settings?.pipeline_tat?.[lane];
    if (days != null) return days * 24;
    return DEFAULT_STAGE_TAT_H[lane];
  };

  // Resolve the site/branch name for a customer + explicit siteId, falling
  // back to the customer's primary/first site (PROCESS_MAP §6.4).
  const siteNameFor = (custName: string, siteId?: string): string | undefined => {
    const cust = data.customers.find(c => c.name === custName);
    const label = siteLabel(cust, siteId);
    return label || undefined;
  };

  const lanes = useMemo(() => {
    const map: Record<BoardLane, BoardCard[]> = {} as any;
    for (const l of BOARD_LANES) map[l] = [];

    const matches = (cust: string, ref: string) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return cust.toLowerCase().includes(q) || ref.toLowerCase().includes(q);
    };

    // ── Pre-quote lanes from enquiries (not yet quoted) ──
    for (const enq of data.enquiries) {
      if (enq.qRef) continue;                       // already quoted → lives in quote lanes
      if (enq.status === 'Lost' || enq.status === 'Parked') continue;
      const lane: BoardLane | null =
        enq.status === 'New' ? 'New Enquiry' :
        enq.status === 'In Review' ? 'To Quote' : null;
      if (!lane) continue;
      if (!matches(enq.cust, enq.id)) continue;
      if (dateRange && !isInDateRange(enq.recv, dateRange)) continue;
      if (ownerFilter !== 'All Owners' && (enq.assigned || 'Unassigned') !== ownerFilter) continue;

      const enteredAt = enq.recv;
      const tatHours = SLA_H[enq.urg] ?? tatHoursFor(lane);
      map[lane].push({
        key: `enq:${enq.id}`,
        lane, kind: 'enquiry',
        cust: enq.cust,
        site: siteNameFor(enq.cust, enq.siteId),
        title: enq.id,
        subtitle: `${enq.urg} · ${enq.src || 'RFQ'}`,
        value: 0,
        owner: enq.assigned || 'Unassigned',
        enteredAt, tatHours,
        tat: tatHealth(enteredAt, tatHours),
        enquiry: enq,
      });
    }

    // ── Quote-backed lanes (Sent … Closed) ──
    for (const quote of data.quotes) {
      const followUp = data.followups.find(f => f.quote_id === quote.id);
      const stage: PipelineStage =
        (followUp?.stage as PipelineStage) ||
        (quote.status === 'Won' ? 'Closed' :
         quote.status === 'Lost' ? 'Closed' : 'Sent Quotation');
      const lane = stage as BoardLane;
      if (!matches(quote.cust, quote.id)) continue;
      if (dateRange && !isInDateRange(quote.date, dateRange)) continue;
      const owner = followUp?.owner || 'Unassigned';
      if (ownerFilter !== 'All Owners' && owner !== ownerFilter) continue;

      const enteredAt = followUp?.stage_entered_at || quote.date || null;
      const tatHours = tatHoursFor(lane);
      const isClosed = lane === 'Closed';
      const outcome: PipelineOutcome | null =
        followUp?.outcome ?? (quote.status === 'Won' ? 'Won' : quote.status === 'Lost' ? 'Lost' : null);

      map[lane].push({
        key: `q:${quote.id}`,
        lane, kind: 'quote',
        cust: quote.cust,
        site: siteNameFor(quote.cust, quote.siteId || data.enquiries.find(e => e.id === quote.enqRef)?.siteId),
        title: quote.id,
        subtitle: `Ref: ${quote.enqRef || '—'}`,
        value: quote.items.reduce((a, i) => a + i.total, 0),
        owner,
        enteredAt: isClosed ? null : enteredAt,
        tatHours: isClosed ? 0 : tatHours,
        tat: isClosed ? { health: 'none', elapsedH: 0, pct: 0, overdueH: 0 } : tatHealth(enteredAt, tatHours),
        quote, followUp, outcome,
      });
    }

    // Sort each lane: worst TAT first, then most recently entered.
    for (const l of BOARD_LANES) {
      map[l].sort((a, b) => {
        const order = { breach: 0, warn: 1, ok: 2, none: 3 };
        if (order[a.tat.health] !== order[b.tat.health]) return order[a.tat.health] - order[b.tat.health];
        return b.tat.pct - a.tat.pct;
      });
    }
    return map;
  }, [data.enquiries, data.quotes, data.followups, data.settings, ownerFilter, search, dateRange]);

  const laneBreaches = (lane: BoardLane) => lanes[lane].filter(c => c.tat.health === 'breach').length;

  // Resolve the open drawer's card from the live lane map so it reflects the
  // latest data (e.g. right after logging an activity).
  const viewingCard = viewingKey
    ? BOARD_LANES.flatMap(l => lanes[l]).find(c => c.key === viewingKey) ?? null
    : null;

  // ── Card move handlers ──
  const advance = async (card: BoardCard) => {
    if (card.kind === 'enquiry') {
      // Leaving a pre-quote lane means: create the quotation for this enquiry.
      navigate(`/quotes/new?enqRef=${encodeURIComponent(card.enquiry!.id)}`);
      return;
    }
    const idx = BOARD_LANES.indexOf(card.lane);
    const next = BOARD_LANES[idx + 1];
    if (!next || next === 'New Enquiry' || next === 'To Quote') return;
    if (next === 'Closed') { setClosing(card); return; }
    await setFollowUpStage(card.quote!.id, next as PipelineStage);
  };

  const goBack = async (card: BoardCard) => {
    if (card.kind === 'enquiry') return;
    const idx = BOARD_LANES.indexOf(card.lane);
    const prev = BOARD_LANES[idx - 1];
    if (!prev || prev === 'New Enquiry' || prev === 'To Quote') return; // can't push a quote back into pre-quote lanes
    await setFollowUpStage(card.quote!.id, prev as PipelineStage);
  };

  const doClose = async (card: BoardCard, outcome: PipelineOutcome) => {
    await closeFollowUp(card.quote!.id, outcome);
    setClosing(null);
  };

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden bg-cream">
      <div className="flex h-full gap-3 p-3 min-w-max">
        {BOARD_LANES.map(lane => {
          const meta = LANE_META[lane];
          const cards = lanes[lane];
          const breaches = laneBreaches(lane);
          const isPreQuote = PRE_QUOTE_LANES.includes(lane);
          const laneTatH = tatHoursFor(lane);
          return (
            <div key={lane} className="w-[260px] shrink-0 flex flex-col bg-white rounded-[6px] border border-g200 overflow-hidden">
              {/* Lane header */}
              <div className={cn('px-3 py-2 border-b border-g200', meta.tint)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.bar)} />
                    <span className={cn('text-[11px] font-bold uppercase tracking-wide truncate', meta.text)}>{lane}</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-g500 shrink-0">{cards.length}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-g400 font-mono">
                    {lane === 'Closed' ? 'no TAT' : isPreQuote ? `SLA-based` : `TAT ${fmtTat(laneTatH)}`}
                  </span>
                  {breaches > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-mrt">
                      <AlertTriangle size={9} /> {breaches} late
                    </span>
                  )}
                </div>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {cards.length === 0 && (
                  <div className="text-center text-[10px] text-g400 py-6">—</div>
                )}
                {cards.map(card => (
                  <Card
                    key={card.key}
                    card={card}
                    onAdvance={() => advance(card)}
                    onBack={() => goBack(card)}
                    onOpen={() => setViewingKey(card.key)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {closing && (
        <CloseDialog
          card={closing}
          onCancel={() => setClosing(null)}
          onPick={(o) => doClose(closing, o)}
        />
      )}

      {viewingCard && (
        <CardDrawer
          card={viewingCard}
          onClose={() => setViewingKey(null)}
          onCreateQuote={() => navigate(`/quotes/new?enqRef=${encodeURIComponent(viewingCard.enquiry!.id)}`)}
        />
      )}
    </div>
  );
}

function Card({ card, onAdvance, onBack, onOpen }: { card: BoardCard; onAdvance: () => void; onBack: () => void; onOpen: () => void }) {
  const isClosed = card.lane === 'Closed';
  const canBack = card.kind === 'quote' && !['Sent Quotation'].includes(card.lane);
  const advanceLabel =
    card.kind === 'enquiry' ? 'Create Quote' :
    card.lane === 'Negotiation' ? 'Close' :
    card.lane === 'Closed' ? '' : 'Next';
  const logCount = card.followUp?.logs?.length ?? 0;

  return (
    <div className={cn('rounded-[6px] border bg-white p-2.5 shadow-sm', HEALTH_RING[card.tat.health])}>
      {/* Clickable body — opens the activity drawer */}
      <button type="button" onClick={onOpen} className="w-full text-left focus:outline-none group">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-blk truncate group-hover:text-red-mrt transition-colors">
              {card.cust}
              {card.site && <span className="font-normal text-g500"> — {card.site}</span>}
            </div>
            <div className="font-mono text-[10px] text-sQ truncate">{card.title}</div>
          </div>
          {isClosed && card.outcome && (
            <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[8px] font-bold uppercase tracking-wide shrink-0', OUTCOME_META[card.outcome].cls)}>
              {OUTCOME_META[card.outcome].icon}{OUTCOME_META[card.outcome].label}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-1.5 text-[10px] text-g500">
          <span className="truncate">{card.subtitle}</span>
          {card.value > 0 && <span className="font-mono shrink-0">₹{card.value.toLocaleString('en-IN')}</span>}
        </div>

        {/* Activity hint */}
        {card.kind === 'quote' && (
          <div className="flex items-center gap-1 mt-1 text-[9px] text-g400 group-hover:text-g600 transition-colors">
            <History size={9} />
            {logCount > 0
              ? <span>{logCount} log{logCount === 1 ? '' : 's'}{card.followUp?.logs?.[0] ? ` · last ${fmtIST(parseISO(card.followUp.logs[0].ts), 'dd MMM')}` : ''}</span>
              : <span>No activity yet — click to log</span>}
          </div>
        )}
      </button>

      {/* TAT line */}
      {!isClosed && card.tatHours > 0 && (
        <div className={cn(
          'flex items-center gap-1 mt-2 text-[10px] font-medium',
          card.tat.health === 'breach' ? 'text-red-mrt' :
          card.tat.health === 'warn' ? 'text-amber-600' : 'text-g500'
        )}>
          {card.tat.health === 'breach'
            ? <AlertTriangle size={10} className="animate-pulse" />
            : <Clock size={10} />}
          <span>
            {card.tat.health === 'breach'
              ? `Overdue ${fmtElapsed(card.tat.overdueH)}`
              : `${fmtElapsed(card.tat.elapsedH)} in stage`}
          </span>
          <span className="text-g400">/ {fmtTat(card.tatHours)} TAT</span>
        </div>
      )}

      {/* Progress bar */}
      {!isClosed && card.tatHours > 0 && (
        <div className="h-1 mt-1.5 rounded-full bg-g100 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all',
              card.tat.health === 'breach' ? 'bg-red-mrt' :
              card.tat.health === 'warn' ? 'bg-amber-400' : 'bg-emerald-400')}
            style={{ width: `${Math.min(100, Math.round(card.tat.pct * 100))}%` }}
          />
        </div>
      )}

      {/* Move controls */}
      {!isClosed && (
        <div className="flex items-center gap-1 mt-2.5">
          {canBack && (
            <button
              type="button" onClick={onBack} title="Move back a stage"
              className="p-1.5 rounded-[4px] border border-g200 text-g400 hover:text-blk hover:bg-g50 transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
          )}
          <button
            type="button" onClick={onAdvance}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wide transition-colors',
              card.kind === 'enquiry'
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-blk text-white hover:bg-g700'
            )}
          >
            {card.kind === 'enquiry' ? <FilePlus2 size={11} /> : <ChevronRight size={11} />}
            {advanceLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function CloseDialog({ card, onCancel, onPick }: { card: BoardCard; onCancel: () => void; onPick: (o: PipelineOutcome) => void }) {
  const { openAttachmentModal } = useAppStore();
  const outcomes: PipelineOutcome[] = ['Won', 'Lost', 'Rejected', 'Other'];
  const hasPO = (card.quote?.attachments?.length ?? 0) > 0;

  const handlePick = (o: PipelineOutcome) => {
    if (o === 'Won' && !hasPO) {
      openAttachmentModal('quote', card.quote!.id);
      onCancel();
      return;
    }
    onPick(o);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="bg-white rounded-[8px] w-full max-w-sm p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[15px] font-serif italic text-blk">Close follow-up</h3>
          <button type="button" onClick={onCancel} className="text-g400 hover:text-blk"><X size={16} /></button>
        </div>
        <p className="text-[12px] text-g500 mb-4">
          <span className="font-bold text-blk">{card.cust}</span> · {card.title}. Pick an outcome.
        </p>
        {!hasPO && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-[4px] text-[11px] text-amber-700">
            <Trophy size={12} className="shrink-0" />
            <span><strong>Won</strong> requires a PO attachment. Upload it first, then mark Won.</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {outcomes.map(o => (
            <button
              key={o} type="button" onClick={() => handlePick(o)}
              title={o === 'Won' && !hasPO ? 'Upload PO first' : undefined}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 py-2.5 rounded-[5px] border text-[12px] font-bold transition-colors',
                OUTCOME_META[o].cls,
                o === 'Won' && !hasPO ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-95'
              )}
            >
              {OUTCOME_META[o].icon}{OUTCOME_META[o].label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-g400">
          <CheckCircle2 size={11} /> Closing stops the TAT clock and moves the card to the Closed lane.
        </div>
      </div>
    </div>
  );
}

// Right-side slide-over: contact strip + activity history + inline log form.
function CardDrawer({ card, onClose, onCreateQuote }: { card: BoardCard; onClose: () => void; onCreateQuote: () => void }) {
  const { data, addFollowUpLog, closeFollowUp, openAttachmentModal, stampName } = useAppStore();
  const [markingOutcome, setMarkingOutcome] = useState<null | 'Won' | 'Lost'>(null);
  const isEnquiry = card.kind === 'enquiry';

  // Open the cross-chain document modal (enquiry + all quotes + all orders +
  // customer PO uploads), resolved from this card's entity (PROCESS_MAP §6.1).
  const openDocs = () => {
    if (isEnquiry && card.enquiry) openAttachmentModal('enquiry', card.enquiry.id);
    else if (card.quote) openAttachmentModal('quote', card.quote.id);
    onClose(); // hand focus fully to the document modal
  };

  const order = card.quote ? data.orders.find(o => o.quoteRef === card.quote!.id) : undefined;

  const handleQuotePDF = () => {
    const q = card.quote;
    if (!q) return;
    const c = data.customers.find(x => x.name === q.cust);
    const unit = q.unitId ? data.units.find(u => u.id === q.unitId) : data.units.find(u => u.is_default);
    const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
    const sig = unitSig ?? data.signatories.find(s => s.is_default);
    generateQuotePDF(q, c, data.settings, sig, true, unit);
  };

  const handlePIPDF = () => {
    const q = card.quote;
    if (!q || !order) return;
    const c = data.customers.find(x => x.name === order.cust);
    const unit = order.unitId ? data.units.find(u => u.id === order.unitId) : data.units.find(u => u.is_default);
    const bank = order.bankAccountId
      ? data.bankAccounts.find(b => b.id === order.bankAccountId)
      : data.bankAccounts.find(b => b.unit_id === unit?.id && b.is_default);
    const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
    const sig = unitSig ?? data.signatories.find(s => s.is_default);
    generatePIPDF(order, q, c, data.settings, sig, true, unit, bank);
  };

  const cust = data.customers.find(c => c.name === card.cust);
  const siteId = isEnquiry ? card.enquiry?.siteId : (card.quote?.siteId || data.enquiries.find(e => e.id === card.quote?.enqRef)?.siteId);
  const site = (siteId && cust?.sites.find(s => s.id === siteId)) || cust?.sites.find(s => s.isPrimary) || cust?.sites?.[0];
  const contacts = site?.contacts ?? [];

  const logs = card.followUp?.logs ?? [];

  const [channel, setChannel] = useState<FollowUpLog['channel']>('Called');
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [nextNote, setNextNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async () => {
    if (!note.trim() || !card.quote) return;
    setSaving(true); setErrorMsg('');
    try {
      const log: FollowUpLog = {
        ts: new Date().toISOString(),
        who: stampName(),
        channel,
        note: note.trim(),
        nextDate: nextDate || undefined,
        nextChannel: nextDate ? channel : undefined,
        nextNote: nextDate ? (nextNote.trim() || undefined) : undefined,
      };
      await addFollowUpLog(card.quote.id, log, nextDate || null, nextTime || null);
      setNote(''); setNextDate(''); setNextTime(''); setNextNote('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to log activity.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md h-full bg-white shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-g200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-mrt mb-0.5">{card.lane}</div>
              <h2 className="text-[17px] font-serif italic text-blk truncate">
                {card.cust}{card.site && <span className="text-g500 not-italic font-sans text-[13px]"> — {card.site}</span>}
              </h2>
              <div className="font-mono text-[11px] text-sQ mt-0.5">{card.title}</div>
            </div>
            <button type="button" onClick={onClose} title="Close" className="text-g400 hover:text-blk p-1 shrink-0"><X size={18} /></button>
          </div>

          {/* Document / PDF actions — quote cards only */}
          {!isEnquiry && (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <button
                type="button" onClick={handleQuotePDF} title="Download Quotation PDF"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-[4px] border border-g300 text-blk bg-white hover:bg-g50 hover:border-blk transition-colors"
              >
                <FileText size={12} /> Quote PDF
              </button>
              <button
                type="button" onClick={handlePIPDF} disabled={!order}
                title={order ? 'Download Proforma Invoice PDF' : 'No order created yet for this quote'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-[4px] border border-g300 text-blk bg-white hover:bg-g50 hover:border-blk transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-g300"
              >
                <Receipt size={12} /> PI PDF
              </button>
              <button
                type="button" onClick={openDocs} title="View all documents (enquiry, quotes, orders, POs)"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-[4px] border border-g300 text-blk bg-white hover:bg-g50 hover:border-blk transition-colors"
              >
                <Paperclip size={12} /> Docs
              </button>
            </div>
          )}

          {/* WON / LOST — quick outcome buttons for non-closed quote cards */}
          {!isEnquiry && card.lane !== 'Closed' && (
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => setMarkingOutcome('Lost')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-[4px] border border-red-mrt/40 text-red-mrt bg-white hover:bg-red-50 transition-colors"
              >
                <Ban size={11} /> Lost
              </button>
              <button
                type="button"
                onClick={() => {
                  const hasPO = (card.quote?.attachments?.length ?? 0) > 0;
                  if (!hasPO) {
                    openAttachmentModal('quote', card.quote!.id);
                    onClose();
                    return;
                  }
                  setMarkingOutcome('Won');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-[4px] border border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                title="Requires PO attachment"
              >
                <Trophy size={11} /> Won
              </button>
              {markingOutcome && (
                <div className="ml-auto flex items-center gap-1.5 bg-g50 border border-g200 rounded-[4px] px-2.5 py-1.5 text-[10px]">
                  <span className="text-g600 font-medium">Confirm mark as {markingOutcome}?</span>
                  <button
                    type="button"
                    onClick={async () => { await closeFollowUp(card.quote!.id, markingOutcome); setMarkingOutcome(null); onClose(); }}
                    className="text-[10px] font-bold text-emerald-700 hover:underline"
                  >Yes</button>
                  <button type="button" onClick={() => setMarkingOutcome(null)} className="text-[10px] text-g400 hover:text-blk">Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* Contact strip */}
          {contacts.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {contacts.map(ct => (
                <div key={ct.id} className="flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="font-semibold text-blk">{ct.name}</span>
                  {ct.role && <span className="px-1.5 py-0.5 bg-g100 rounded text-[8px] font-bold uppercase text-g500 tracking-wide">{ct.role}</span>}
                  {ct.phone && (
                    <a href={`tel:${ct.phone}`} className="inline-flex items-center gap-1 text-blk hover:text-red-mrt"><Phone size={10} className="text-g400" />{ct.phone}</a>
                  )}
                  {ct.phone && (
                    <a href={`https://wa.me/91${ct.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900"><MessageCircle size={10} />WhatsApp</a>
                  )}
                  {ct.email && (
                    <a href={`mailto:${ct.email}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"><Mail size={10} />Email</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        {isEnquiry ? (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="text-[12px] text-g600 leading-relaxed">
              This enquiry hasn't been quoted yet. Activity tracking begins once a quotation is created.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-g50 border border-g200 rounded-[4px] px-3 py-2">
                <div className="text-[9px] uppercase font-bold text-g400">Urgency</div>
                <div className="font-semibold text-blk mt-0.5">{card.enquiry?.urg}</div>
              </div>
              <div className="bg-g50 border border-g200 rounded-[4px] px-3 py-2">
                <div className="text-[9px] uppercase font-bold text-g400">Items</div>
                <div className="font-semibold text-blk mt-0.5">{card.enquiry?.items.length ?? 0}</div>
              </div>
            </div>
            <button
              type="button" onClick={onCreateQuote}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-[5px] bg-indigo-600 text-white text-[12px] font-bold uppercase tracking-wide hover:bg-indigo-700 transition-colors"
            >
              <FilePlus2 size={13} /> Create Quote
            </button>
          </div>
        ) : (
          <>
            {/* Activity history */}
            <div className="flex-1 overflow-y-auto p-5 bg-g50">
              <div className="flex items-center gap-2 mb-3">
                <History size={14} className="text-g400" />
                <span className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-g500">Activity History</span>
              </div>
              {(() => {
                const q = card.quote!;
                const qTotal = q.items.reduce((s, i) => s + i.total, 0);
                const qItemDesc = q.items[0]?.desc ?? '';
                const qItemCount = q.items.length;
                const quoteSentNote = `Sent ${q.id} for ${qItemDesc}${qItemCount > 1 ? ` — ${qItemCount} items` : ''}. ₹${qTotal.toLocaleString('en-IN')}.`;
                const sentLog: FollowUpLog = {
                  ts: q.date ? `${q.date}T09:00:00.000Z` : new Date().toISOString(),
                  who: card.followUp?.owner || card.owner || 'System',
                  channel: 'Email',
                  note: quoteSentNote,
                  nextDate: card.followUp?.logs?.[0]?.nextDate,
                  nextChannel: card.followUp?.logs?.[0]?.nextChannel,
                };
                // Real logs without any duplicate quote-sent entries
                const realLogs = logs.filter(l => !(l.note?.startsWith('Quote sent —') || l.note?.startsWith('Sent ')));
                const allLogs: FollowUpLog[] = [sentLog, ...realLogs].reverse(); // newest first for chat view

                return (
                <div className="space-y-2">
                  {allLogs.map((log, idx) => {
                    const isQuoteSent = idx === allLogs.length - 1; // last in reversed = first chronologically
                    const cfg = CHANNEL_PILL[log.channel] ?? CHANNEL_PILL.Called;

                    if (isQuoteSent) {
                      return (
                        <div key={idx} className="flex justify-center">
                          <div className="bg-amber-50 border border-amber-200 rounded-[10px] px-4 py-3 max-w-[90%] w-full">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[13px]">📄</span>
                              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700">Quote Sent</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 ml-1">ON TIME</span>
                              <span className="text-[8.5px] font-mono text-amber-600/70 ml-auto">{fmtIST(parseISO(log.ts), 'dd MMM · hh:mm aa')}</span>
                            </div>
                            <p className="text-[12.5px] text-blk leading-relaxed">{log.note}</p>
                            {log.nextDate && (
                              <div className="mt-1.5 text-[11px] font-semibold text-sR">
                                → Next: {isToday(parseISO(log.nextDate)) ? 'Today' : fmtIST(parseISO(log.nextDate), 'dd-MMM-yyyy')}{log.nextChannel ? ` via ${log.nextChannel}` : ''}
                              </div>
                            )}
                            <div className="text-[8.5px] text-amber-600/60 mt-1">{log.who}</div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <React.Fragment key={idx}>
                        {/* LEFT — what happened */}
                        <div className="flex justify-start">
                          <div className={cn('max-w-[80%] rounded-[14px] rounded-tl-[4px] border px-3 py-2', cfg.bg, cfg.border)}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[10px]">{cfg.icon}</span>
                              <span className={cn('text-[8.5px] font-bold uppercase tracking-widest', cfg.text)}>{log.channel}</span>
                            </div>
                            <p className="text-[12.5px] text-blk leading-relaxed whitespace-pre-wrap">{log.note}</p>
                            <div className="text-[8.5px] text-g400 mt-1 text-right">
                              {log.who} · {fmtIST(parseISO(log.ts), 'dd MMM, hh:mm aa')}
                            </div>
                          </div>
                        </div>

                        {/* RIGHT — next to-do */}
                        {log.nextDate && (
                          <div className="flex justify-end">
                            <div className="max-w-[80%] rounded-[14px] rounded-tr-[4px] px-3 py-2 shadow-sm border border-[#c5e9a8] bg-[#DCF8C6]">
                              <div className="text-[8.5px] font-bold uppercase tracking-widest text-emerald-800/70 mb-0.5">
                                To-Do{log.nextChannel ? ` · ${log.nextChannel}` : ''}
                              </div>
                              <div className="text-[12px] font-semibold text-emerald-900">
                                {isToday(parseISO(log.nextDate)) ? 'Today' : fmtIST(parseISO(log.nextDate), 'dd-MMM-yyyy')}
                              </div>
                              {log.nextNote && (
                                <p className="text-[11.5px] leading-relaxed whitespace-pre-wrap mt-1 text-emerald-950/90">{log.nextNote}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                );
              })()}
            </div>

            {/* Inline log form */}
            <div className="shrink-0 border-t border-g200 p-4 bg-white">
              <div className="flex items-center gap-1.5 mb-2">
                <Plus size={12} className="text-red-mrt" />
                <span className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-red-mrt">Log Activity</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <select
                  title="Channel" value={channel} onChange={e => setChannel(e.target.value as FollowUpLog['channel'])}
                  className="bg-white border border-g300 rounded-[3px] px-2 py-[6px] text-[11.5px] outline-none focus:border-red-mrt"
                >
                  <option>Called</option><option>WhatsApp</option><option>Email</option><option>Meeting</option><option>Visit</option>
                </select>
                <input
                  type="date" title="Next follow-up date" value={nextDate} onChange={e => setNextDate(e.target.value)}
                  className="bg-white border border-g300 rounded-[3px] px-2 py-[6px] text-[11.5px] outline-none focus:border-red-mrt"
                />
                <input
                  type="time" title="Next follow-up time" value={nextTime} onChange={e => setNextTime(e.target.value)}
                  className="bg-white border border-g300 rounded-[3px] px-2 py-[6px] text-[11.5px] outline-none focus:border-red-mrt"
                />
              </div>
              {nextDate && (
                <textarea
                  value={nextNote} onChange={e => setNextNote(e.target.value)} rows={2}
                  placeholder="What to do on next follow-up? (optional)"
                  className="w-full bg-white border border-g300 rounded-[3px] px-2 py-1.5 text-[11.5px] outline-none focus:border-red-mrt resize-none mb-2"
                />
              )}
              <textarea
                value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="What happened? What did the customer say?"
                className="w-full bg-white border border-g300 rounded-[3px] px-2 py-1.5 text-[12px] outline-none focus:border-red-mrt resize-none"
              />
              {errorMsg && <div className="text-[10px] text-red-mrt font-medium mt-1">{errorMsg}</div>}
              <div className="flex justify-end mt-2">
                <button
                  type="button" onClick={handleSave} disabled={!note.trim() || saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-mrt text-white text-[10px] font-bold tracking-wider uppercase rounded-[3px] hover:bg-red-h disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 size={11} /> {saving ? 'Saving…' : 'Save Activity'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
