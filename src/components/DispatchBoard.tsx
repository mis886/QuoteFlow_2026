import React from 'react';
import { Pause, Play, Undo2 } from 'lucide-react';
import { fmtIST } from '../lib/utils';
import type { Order } from '../lib/types';
import {
  DISPATCH_STEPS, STEP_ACTIONS, BoardCard, BoardOrderCard, ColumnNo, StepAction, StepNo, fmtDuration, TimeState, doPendingText, step6AlreadyEmailed, needsPaymentCheck,
} from '../lib/dispatchFlow';

// "Board" view of the Dispatch module — since 2026-10-19 a LIST: step tiles
// + one row per card (built by buildBoard() in dispatchFlow.ts). This file
// only draws them; the drawer (DispatchDrawer.tsx) holds the step buttons.

const fmtClock = (iso: string, now: number) => {
  const d = new Date(iso);
  const sameDay = fmtIST(d, 'yyyy-MM-dd') === fmtIST(new Date(now), 'yyyy-MM-dd');
  const time = fmtIST(d, 'hh:mm a').replace(/^0/, '');
  return sameDay ? time : `${fmtIST(d, 'dd MMM')}, ${time}`;
};

const TIME_BAR_CLS: Record<TimeState, string> = {
  on_time: 'bg-[#E8F5E9] text-[#0B5C2A]',
  due_soon: 'bg-[#FFF3E0] text-[#8A4500]',
  late: 'bg-[#FFEBEE] text-[#9A0000]',
  hold: 'bg-[#EFEDEA] text-[#333]',
  done: 'bg-[#E8F5E9] text-[#0B5C2A]',
  none: 'bg-g100 text-g500',
};
const TIME_DOT_CLS: Partial<Record<TimeState, string>> = {
  on_time: 'bg-[#107E3E]',
  due_soon: 'bg-[#E9730C]',
  late: 'bg-[#BB0000]',
  done: 'bg-[#107E3E]',
};

export function TimeBar({ card, now }: { card: BoardCard; now: number }) {
  const state = card.state;
  const plannedAt = card.position.plannedAt;
  let text: string;
  if (state === 'hold' && card.kind === 'order') text = `On hold · ${card.position.hold?.reason || ''}`;
  // A done entry with no email = its order was marked Delivered (List → Delivered).
  else if (state === 'done' && card.kind === 'entry') text = card.entry.emailSentAt ? `Email sent ${fmtClock(card.entry.emailSentAt, now)}` : 'Marked delivered';
  else if (!plannedAt) text = 'No start time';
  else if (state === 'late') text = `Late by ${fmtDuration(now - new Date(plannedAt).getTime())}`;
  else if (state === 'due_soon') text = `Due in ${fmtDuration(new Date(plannedAt).getTime() - now)}`;
  else text = `Due ${fmtClock(plannedAt, now)}`;
  return (
    <div className={`flex items-center gap-1.5 rounded-[4px] px-2 py-[4px] text-[11px] font-medium ${TIME_BAR_CLS[state]}`}>
      {state === 'hold'
        ? <Pause size={10} className="shrink-0" />
        : <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${TIME_DOT_CLS[state] || 'bg-g400'}`} />}
      <span className="truncate">{text}</span>
    </div>
  );
}

export const TypeDot = ({ type }: { type: string }) => type === 'self_pickup'
  ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED]" />Self Pickup</span>
  : type === 'delivery'
    ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-[7px] h-[7px] rounded-full bg-[#2563EB]" />Delivery</span>
    : <span className="text-g400 whitespace-nowrap">Not set</span>;

export const AutoTag = () => (
  <span className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase bg-[#E8F0FD] text-[#1D4ED8] rounded-[3px] px-[5px] py-[1px]">Auto</span>
);

/**
 * Step 1–7 buttons for an order card (black = manual Done, white = second
 * choice), or a single Resume button while the card is on hold.
 * 2026-10-06: shown to EVERY login. Only logins allowed to act (canAct —
 * see canActOnDispatchBoard) can click; for everyone else the buttons are
 * disabled, greyed out, with a tooltip. Who is allowed did not change.
 */
export const STEP_BUTTONS_LOCKED_TIP = 'Only Admin / Samata can update dispatch steps';
export const step6Label = (card: BoardOrderCard) =>
  step6AlreadyEmailed(card) ? 'Mark Step 6 done (DO already emailed)' : 'Open DO → Email to Client';

export function StepActionButtons({ card, busy, canAct, onAction, onResume, omitStep6MarkDone }: {
  card: BoardOrderCard;
  busy: boolean;
  canAct: boolean;
  onAction: (card: BoardOrderCard, action: StepAction) => void;
  onResume: (card: BoardOrderCard) => void;
  // The drawer shows "Mark Step 6 done" in its Step 6 row instead.
  omitStep6MarkDone?: boolean;
}) {
  if (card.column > 7) return null;
  const base = `text-[11.5px] font-semibold rounded-[4px] px-2.5 py-[6px] transition-colors disabled:opacity-50 ${canAct ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed'}`;
  const off = busy || !canAct;
  // The tooltip sits on the wrapper too — some browsers don't show a
  // disabled button's own title.
  const tip = canAct ? undefined : STEP_BUTTONS_LOCKED_TIP;
  if (card.position.hold) {
    return (
      <div title={tip} className={canAct ? undefined : 'cursor-not-allowed'}>
        <button type="button" disabled={off} title={tip} onClick={() => { if (canAct) onResume(card); }}
          className={`${base} w-full inline-flex items-center justify-center gap-1.5 bg-blk text-white hover:bg-dark`}>
          <Play size={11} /> Resume
        </button>
      </div>
    );
  }
  // 2026-10-16: Step 6 with a DO already saved — the button opens that DO
  // (edit mode) to email it; the email is what completes Step 6. If every DO
  // is already emailed, it marks Step 6 done instead (no email is sent).
  const actions = (card.position.step === 6 && card.doPending
    ? (STEP_ACTIONS[6] || []).map(a => a.primary ? { ...a, label: step6Label(card) } : a)
    : STEP_ACTIONS[card.position.step] || [])
    // "Mark Step 6 done" is for board logins only (hidden, not greyed, for others).
    .filter(a => !((omitStep6MarkDone || !canAct) && a.primary && step6AlreadyEmailed(card)));
  if (!actions.length) return null;
  return (
    <div className={`flex gap-1.5 ${canAct ? '' : 'cursor-not-allowed'}`} title={tip}>
      {actions.map(a => (
        <button key={a.label} type="button" disabled={off} title={tip} onClick={() => { if (canAct) onAction(card, a); }}
          className={`${base} ${a.primary ? 'flex-1 bg-blk text-white hover:bg-dark' : 'bg-white text-blk border border-g300 hover:bg-g100'}`}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Small "↶ Undo" link under an order card's step buttons — takes back the
 * order's last step click (after a confirm box). The page renders it only
 * for logins allowed to undo, and only when there is a click to take back.
 */
export function UndoLink({ busy, onUndo }: { busy: boolean; onUndo: () => void }) {
  return (
    <div className="flex justify-end -mt-0.5">
      <button type="button" onClick={onUndo} disabled={busy} title="Undo the last step on this order"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-g600 hover:text-red-mrt hover:underline transition-colors disabled:opacity-50 disabled:cursor-wait">
        <Undo2 size={11} /> Undo
      </button>
    </div>
  );
}

const itemSummary =(lines: { desc: string; qty: number }[]) => {
  if (!lines.length) return '—';
  const first = `${(lines[0].desc || 'Item').trim()} × ${lines[0].qty}`;
  return lines.length > 1 ? `${first} +${lines.length - 1} more` : first;
};

const stepLabel = (no: ColumnNo) => no === 11 ? 'DONE' : `STEP ${String(no).padStart(2, '0')}`;

// ── List view (2026-10-19) ────────────────────────────────────────────────
// Replaced the 11 kanban columns with: clickable step tiles (filter) + one
// compact row per card + 10 progress dots. Clicking a row opens the same
// DispatchDrawer as before, where every step button / Undo / Edit / Delete
// lives — so the workflow rules are unchanged, only the layout is new.

type DotState = 'done' | 'current' | 'hold' | 'skipped' | 'upcoming';

/** One dot per step 1–10, worked out from the card's position. */
function progressDots(card: BoardCard): DotState[] {
  const out: DotState[] = [];
  const selfPickup = card.fulfillment === 'self_pickup';
  for (let n = 1; n <= 10; n++) {
    if (card.kind === 'order') {
      const cur = card.position.step;
      if (card.position.skipped.includes(n as StepNo)) out.push('skipped');
      else if (n < cur) out.push('done');
      else if (n === cur) out.push(card.position.hold ? 'hold' : 'current');
      else if (n === 9 && selfPickup) out.push('skipped');
      else out.push('upcoming');
    } else {
      // Entry cards: steps 1–7 are already behind them.
      const col = card.column;
      if (n <= 7) out.push(n === 1 && card.order && !needsPaymentCheck(card.order.pay) ? 'skipped' : 'done');
      else if (n === 9 && selfPickup) out.push('skipped');
      else if (col === 11 || n < col) out.push('done');
      else if (n === col) out.push('current');
      else out.push('upcoming');
    }
  }
  return out;
}

const DOT_CLS: Record<DotState, string> = {
  done: 'bg-[#107E3E]',
  current: 'bg-[#2563EB] ring-[3px] ring-[#2563EB]/30',
  hold: 'bg-[#E9730C] ring-[3px] ring-[#E9730C]/30',
  skipped: 'border-[1.5px] border-dashed border-g400 bg-transparent',
  upcoming: 'bg-g300',
};
const DOT_WORD: Record<DotState, string> = {
  done: 'Done', current: 'Now', hold: 'On hold', skipped: 'Skipped', upcoming: 'Waiting',
};

// Most urgent first.
const STATE_RANK: Record<TimeState, number> = { late: 0, due_soon: 1, hold: 2, on_time: 3, none: 4, done: 5 };

const PAGE = 100;

type OrderQty = { ordered: number; dispatched: number; remaining: number };

// Invoice numbers stacked one per line, or a grey "—" when there are none.
function InvoiceCell({ invoices }: { invoices: string[] }) {
  if (!invoices.length) return <div className="font-mono text-[10.5px] text-g400">—</div>;
  return (
    <div className="flex flex-col gap-[1px] min-w-0" title={invoices.join(', ')}>
      {invoices.map((inv, i) => (
        <span key={i} className="font-mono text-[10.5px] text-g500 truncate">{inv}</span>
      ))}
    </div>
  );
}

function Row({ card, now, onOpen, qty, orderInvoices }: { card: BoardCard; now: number; onOpen?: (card: BoardCard) => void; qty?: OrderQty; orderInvoices?: string[] }) {
  const order = card.order;
  const orderId = card.kind === 'order' ? card.order.id : card.entry.orderId;
  // An entry row is one dispatch → its own invoice. An order row (what is
  // still left to dispatch) → the invoices of the order's earlier dispatches.
  const invoices = card.kind === 'entry'
    ? (card.entry.invoiceNumber ? [card.entry.invoiceNumber] : [])
    : orderInvoices || [];
  const lines = card.kind === 'order'
    ? card.remaining
    : (card.entry.items || []).filter(i => Number(i.qty) > 0).map(i => ({ desc: i.desc, qty: Number(i.qty) }));
  const step = DISPATCH_STEPS[card.column - 1];
  const dots = progressDots(card);
  const open = () => onOpen?.(card);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      className="grid grid-cols-[150px_minmax(200px,1.6fr)_140px_80px_80px_80px_minmax(180px,1.2fr)_150px_190px] gap-3 items-center px-4 py-[10px] border-b border-g200 last:border-b-0 hover:bg-g100 focus:bg-g100 focus:outline-none cursor-pointer transition-colors"
    >
      {/* Order */}
      <div className="flex flex-col gap-[2px] min-w-0">
        <span className="font-mono text-[12px] font-bold text-red-mrt truncate">{order?.soNumber || '—'}</span>
        <span className="font-mono text-[10.5px] text-g500 truncate">{orderId}</span>
      </div>

      {/* Customer · product */}
      <div className="flex flex-col gap-[2px] min-w-0">
        <span className="text-[13.5px] font-semibold text-blk truncate" title={order?.cust}>{order?.cust || '—'}</span>
        <span className="text-[12px] text-g600 truncate" title={lines.map(l => `${l.desc} × ${l.qty}`).join(', ')}>{itemSummary(lines)}</span>
      </div>

      {/* Invoice no(s) — dispatch_entries.invoice_number (Step 08) */}
      <InvoiceCell invoices={invoices} />

      {/* Barrels — the ORDER's ordered / dispatched / remaining, every row */}
      <div className="text-right font-mono text-[12px] text-g700">{qty ? qty.ordered : '—'}</div>
      <div className="text-right font-mono text-[12px] text-g700">{qty ? qty.dispatched : '—'}</div>
      <div className={`text-right font-mono text-[12px] ${qty && qty.dispatched > 0 && qty.remaining > 0 ? 'font-bold text-amber-700' : 'text-g700'}`}>
        {qty ? qty.remaining : '—'}
      </div>

      {/* Current step + any flag */}
      <div className="flex flex-col gap-[2px] min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[9.5px] font-bold tracking-[1px] text-g500">{stepLabel(card.column)}</span>
          {step?.auto && card.column !== 11 && <AutoTag />}
        </span>
        <span className="text-[13px] text-blk truncate">{step?.title}</span>
        {card.kind === 'order' && card.doPending && (
          <span className="text-[10.5px] font-semibold text-amber-700 leading-snug truncate" title={doPendingText(card.doPending)}>{doPendingText(card.doPending)}</span>
        )}
        {card.kind === 'entry' && card.position.invoiceMissing && (
          <span className="text-[10.5px] font-semibold text-[#9A0000]">Invoice no. missing</span>
        )}
      </div>

      {/* 10 dots */}
      <div className="flex items-center gap-[5px]">
        {dots.map((d, i) => (
          <span key={i} title={`Step ${String(i + 1).padStart(2, '0')} · ${DISPATCH_STEPS[i].title} · ${DOT_WORD[d]}`}
            className={`w-[9px] h-[9px] rounded-full shrink-0 box-border ${DOT_CLS[d]}`} />
        ))}
      </div>

      {/* Due / late */}
      <div className="min-w-0">
        <TimeBar card={card} now={now} />
      </div>
    </div>
  );
}

// List → Delivered: an order marked Delivered that has no dispatch entry at
// all. Not a BoardCard (nothing to place on a step), so it gets its own
// read-only row with the same columns — not clickable, no dots or timer.
export interface DeliveredOrderRow {
  order: Order;
  fulfillment: string;
}

function DeliveredOrderRowView({ row, qty }: { row: DeliveredOrderRow; qty?: OrderQty }) {
  const o = row.order;
  const lines = (o.items || []).filter(i => Number(i.qty) > 0).map(i => ({ desc: i.desc, qty: Number(i.qty) }));
  return (
    <div className="grid grid-cols-[150px_minmax(200px,1.6fr)_140px_80px_80px_80px_minmax(180px,1.2fr)_150px_190px] gap-3 items-center px-4 py-[10px] border-b border-g200 last:border-b-0">
      <div className="flex flex-col gap-[2px] min-w-0">
        <span className="font-mono text-[12px] font-bold text-red-mrt truncate">{o.soNumber || '—'}</span>
        <span className="font-mono text-[10.5px] text-g500 truncate">{o.id}</span>
      </div>
      <div className="flex flex-col gap-[2px] min-w-0">
        <span className="text-[13.5px] font-semibold text-blk truncate" title={o.cust}>{o.cust || '—'}</span>
        <span className="text-[12px] text-g600 truncate" title={lines.map(l => `${l.desc} × ${l.qty}`).join(', ')}>{itemSummary(lines)}</span>
      </div>
      <InvoiceCell invoices={[]} />
      <div className="text-right font-mono text-[12px] text-g700">{qty ? qty.ordered : '—'}</div>
      <div className="text-right font-mono text-[12px] text-g700">{qty ? qty.dispatched : '—'}</div>
      <div className={`text-right font-mono text-[12px] ${qty && qty.dispatched > 0 && qty.remaining > 0 ? 'font-bold text-amber-700' : 'text-g700'}`}>
        {qty ? qty.remaining : '—'}
      </div>
      <div className="flex flex-col gap-[2px] min-w-0">
        <span className="font-mono text-[9.5px] font-bold tracking-[1px] text-g500">{stepLabel(11)}</span>
        <span className="text-[13px] text-blk truncate">Marked delivered</span>
      </div>
      <div />
      <div className="min-w-0 text-[11px] text-g400">—</div>
    </div>
  );
}

type ListItem = { kind: 'card'; card: BoardCard } | { kind: 'deliveredOrder'; row: DeliveredOrderRow };

// Newest-first key for Done rows: email sent, else entry created, else order date.
const doneKey = (it: ListItem) => it.kind === 'deliveredOrder'
  ? (it.row.order.created_at || it.row.order.poDate || '')
  : it.card.kind === 'entry' ? (it.card.entry.emailSentAt || it.card.entry.created_at || '') : '';

export function DispatchBoard({ cards, now, onOpen, qty, invoices, deliveredOrders = [] }: {
  cards: BoardCard[];
  now: number;
  // Invoice numbers per order id, from its dispatch entries (Dispatch.tsx).
  invoices?: Map<string, string[]>;
  // Barrels per order id (Dispatch.tsx's boardQty) — same numbers as the
  // Table's Order Pending for Dispatch.
  qty?: Map<string, OrderQty>;
  // List → Delivered only: orders marked Delivered with no dispatch entry.
  deliveredOrders?: DeliveredOrderRow[];
  onOpen?: (card: BoardCard) => void;
  // Kept so Dispatch.tsx doesn't need to change; step buttons and Delete now
  // live only in the drawer.
  renderActions?: (card: BoardCard) => React.ReactNode;
  onDelete?: (card: BoardCard) => void;
}) {
  const [stepFilter, setStepFilter] = React.useState<ColumnNo | 'all'>('all');
  const [limit, setLimit] = React.useState(PAGE);
  React.useEffect(() => { setLimit(PAGE); }, [stepFilter, cards.length, deliveredOrders.length]);

  const byColumn = new Map<ColumnNo, BoardCard[]>();
  for (const c of cards) {
    const list = byColumn.get(c.column) || [];
    list.push(c);
    byColumn.set(c.column, list);
  }

  // Delivered orders without an entry sit under Done.
  const items: ListItem[] = [
    ...(stepFilter === 'all' ? cards : (byColumn.get(stepFilter) || [])).map(card => ({ kind: 'card' as const, card })),
    ...(stepFilter === 'all' || stepFilter === 11 ? deliveredOrders.map(row => ({ kind: 'deliveredOrder' as const, row })) : []),
  ];
  const shown = items.sort((a, b) => {
    const sa: TimeState = a.kind === 'card' ? a.card.state : 'done';
    const sb: TimeState = b.kind === 'card' ? b.card.state : 'done';
    const r = STATE_RANK[sa] - STATE_RANK[sb];
    if (r) return r;
    const colA = a.kind === 'card' ? a.card.column : 11;
    const colB = b.kind === 'card' ? b.card.column : 11;
    if (colA === 11 && colB === 11) return doneKey(b).localeCompare(doneKey(a));
    const pa = a.kind === 'card' ? a.card.position.plannedAt || '' : '';
    const pb = b.kind === 'card' ? b.card.position.plannedAt || '' : '';
    return pa.localeCompare(pb);
  });
  const totalDelayed = cards.filter(c => c.state === 'late').length;

  const tiles: { key: ColumnNo | 'all'; top: string; title: string; count: number; delayed: number }[] = [
    { key: 'all', top: 'ALL', title: 'All orders', count: cards.length + deliveredOrders.length, delayed: totalDelayed },
    ...DISPATCH_STEPS.map(s => {
      const list = byColumn.get(s.no) || [];
      const extra = s.no === 11 ? deliveredOrders.length : 0;
      return { key: s.no, top: stepLabel(s.no), title: s.title, count: list.length + extra, delayed: list.filter(c => c.state === 'late').length };
    }),
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col px-6 pb-5 pt-[14px] gap-3">
      {/* Step tiles — click to show only that step */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-[6px] shrink-0">
        {tiles.map(t => {
          const on = stepFilter === t.key;
          return (
            <button key={String(t.key)} type="button" onClick={() => setStepFilter(t.key)} aria-pressed={on}
              className={`text-left rounded-[6px] p-[7px_8px] min-w-0 border transition-colors ${on ? 'border-red-mrt bg-red-lt' : 'border-g200 bg-white hover:bg-g100'}`}>
              <div className="flex items-start justify-between gap-1">
                <span className="font-mono text-[8.5px] font-bold tracking-[1px] text-red-mrt">{t.top}</span>
                <span className={`text-[15px] font-bold leading-none ${t.count ? 'text-blk' : 'text-g400'}`}>{t.count}</span>
              </div>
              <div className="text-[11px] text-g700 truncate mt-[3px]" title={t.title}>{t.title}</div>
              <div className={`text-[10px] mt-[1px] ${t.delayed ? 'text-[#9A0000] font-semibold' : 'text-g400'}`}>{t.delayed ? `${t.delayed} delayed` : '—'}</div>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 bg-white border border-g200 rounded-[6px] overflow-auto">
        <div className="min-w-[1260px]">
          <div className="sticky top-0 z-[1] grid grid-cols-[150px_minmax(200px,1.6fr)_140px_80px_80px_80px_minmax(180px,1.2fr)_150px_190px] gap-3 px-4 py-[9px] bg-g100 border-b border-g200 font-mono text-[9.5px] font-bold tracking-[1.5px] uppercase text-g500">
            <div>Order</div><div>Customer · Product</div><div>Invoice No</div>
            <div className="text-right">Ordered</div><div className="text-right">Dispatched</div><div className="text-right">Remaining</div>
            <div>Current step</div><div>Progress</div><div>Due</div>
          </div>
          {shown.length === 0 ? (
            <div className="text-center text-[12px] text-g400 py-12">No orders here. Try another step or clear the search.</div>
          ) : (
            <>
              {shown.slice(0, limit).map(it => it.kind === 'card' ? (
                <Row key={it.card.key} card={it.card} now={now} onOpen={onOpen}
                  qty={qty?.get(it.card.kind === 'order' ? it.card.order.id : it.card.entry.orderId)}
                  orderInvoices={it.card.kind === 'order' ? invoices?.get(it.card.order.id) : undefined} />
              ) : (
                <DeliveredOrderRowView key={`do:${it.row.order.id}`} row={it.row} qty={qty?.get(it.row.order.id)} />
              ))}
              {shown.length > limit && (
                <div className="flex justify-center py-3 border-t border-g200">
                  <button type="button" onClick={() => setLimit(l => l + PAGE)}
                    className="text-[12px] font-semibold text-red-mrt hover:underline">
                    Show more ({shown.length - limit} left)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Dot legend */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-g600 shrink-0">
        <span className="font-mono text-[9.5px] font-bold tracking-[1.5px] uppercase text-g500">Progress dots</span>
        {(['done', 'current', 'hold', 'skipped', 'upcoming'] as DotState[]).map(d => (
          <span key={d} className="inline-flex items-center gap-1.5">
            <span className={`w-[9px] h-[9px] rounded-full box-border ${DOT_CLS[d]}`} />{DOT_WORD[d]}
          </span>
        ))}
        <span className="ml-auto text-g500">{shown.length} shown · click a row for steps &amp; actions</span>
      </div>
    </div>
  );
}
