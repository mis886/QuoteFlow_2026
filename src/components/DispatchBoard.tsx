import React from 'react';
import { Pause, Play, Undo2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { fmtIST } from '../lib/utils';
import type { Order } from '../lib/types';
import { DispatchEntryCells, DispatchEntryHeadCells, thCenterClsCompact } from './DispatchEntryCells';
import {
  DISPATCH_STEPS, DONE_COLUMN, STEP_ACTIONS, BoardCard, BoardOrderCard, BoardEntryCard, ColumnNo, StepAction, StepNo, fmtDuration, TimeState, doPendingText, step6AlreadyEmailed, needsPaymentCheck, entryStepBlock,
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

// `wrap`: let long text ("Email sent 21 Oct, 3:45 pm") wrap instead of
// being cut off with "…" (List rows); the drawer keeps one line.
export function TimeBar({ card, now, wrap = false }: { card: BoardCard; now: number; wrap?: boolean }) {
  const state = card.state;
  const plannedAt = card.position.plannedAt;
  let text: string;
  if (state === 'hold' && card.kind === 'order') text = `On hold · ${card.position.hold?.reason || ''}`;
  // A done entry: email time if emailed, else when Step 11 was clicked; with
  // neither, its order was marked Delivered (List → Delivered).
  else if (state === 'done' && card.kind === 'entry') {
    text = card.entry.emailSentAt ? `Email sent ${fmtClock(card.entry.emailSentAt, now)}`
      : card.position.doneAt ? `Documents sent ${fmtClock(card.position.doneAt, now)}`
      : 'Marked delivered';
  }
  else if (!plannedAt) text = 'No start time';
  else if (state === 'late') text = `Late by ${fmtDuration(now - new Date(plannedAt).getTime())}`;
  else if (state === 'due_soon') text = `Due in ${fmtDuration(new Date(plannedAt).getTime() - now)}`;
  else text = `Due ${fmtClock(plannedAt, now)}`;
  return (
    <div className={`flex items-center gap-1.5 rounded-[4px] px-2 py-[4px] text-[11px] font-medium ${TIME_BAR_CLS[state]}`}>
      {state === 'hold'
        ? <Pause size={10} className="shrink-0" />
        : <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${TIME_DOT_CLS[state] || 'bg-g400'}`} />}
      <span className={wrap ? 'leading-snug' : 'truncate'} title={text}>{text}</span>
    </div>
  );
}

export const TypeDot = ({ type }: { type: string }) => type === 'self_pickup'
  ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED]" />Self Pickup</span>
  : type === 'delivery'
    ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-[7px] h-[7px] rounded-full bg-[#2563EB]" />Delivery</span>
    : <span className="text-g400 whitespace-nowrap">Not set</span>;

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
 * Step 8–11 button for a dispatch entry (2026-10-22: these steps are manual):
 * "Invoice done" / "Bhiwandi informed" / "LR received" / "Documents sent".
 * Same lock as Steps 1–7 (canAct). Step 8 stays disabled until the entry has
 * an invoice no. and an Invoice / Eway Bill file, Step 9 until the Bhiwandi
 * email was sent, Step 10 until it has an LR file, Step 11 until Email to
 * Client was sent — with the reason in red under it. `link` is the
 * entry-page button ("Attach Documents & Send →" / "Open Entry →")
 * shown next to it.
 */
export function EntryStepButtons({ card, busy, canAct, onAction, link }: {
  card: BoardEntryCard;
  busy: boolean;
  canAct: boolean;
  onAction: (card: BoardEntryCard, action: StepAction) => void;
  link?: React.ReactNode;
}) {
  if (card.column === DONE_COLUMN) return null;
  const action = (STEP_ACTIONS[card.column] || [])[0];
  if (!action) return null;
  const blocked = entryStepBlock(card.entry, card.column);
  const off = busy || !canAct || !!blocked;
  const tip = !canAct ? STEP_BUTTONS_LOCKED_TIP : blocked;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1.5 items-stretch">
        <div className={`flex-1 ${off && !busy ? 'cursor-not-allowed' : ''}`} title={tip}>
          <button type="button" disabled={off} title={tip} onClick={() => { if (!off) onAction(card, action); }}
            className={`w-full text-[11.5px] font-semibold rounded-[4px] px-2.5 py-[7px] bg-blk text-white hover:bg-dark transition-colors disabled:opacity-50 ${busy ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed'}`}>
            {action.label}
          </button>
        </div>
        {link}
      </div>
      {blocked && <div className="text-[11px] font-semibold text-[#9A0000]">{blocked}</div>}
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

const stepLabel = (no: ColumnNo) => no === DONE_COLUMN ? 'DONE' : `STEP ${String(no).padStart(2, '0')}`;

// ── List view (2026-10-19) ────────────────────────────────────────────────
// Replaced the kanban columns with: clickable step tiles (filter) + one
// compact row per card + 11 progress dots. Clicking a row opens the same
// DispatchDrawer as before, where every step button / Undo / Edit / Delete
// lives — so the workflow rules are unchanged, only the layout is new.

type DotState = 'done' | 'current' | 'hold' | 'skipped' | 'upcoming';

/** One dot per step 1–11, worked out from the card's position. Step 9
 * (Bhiwandi) is a normal dot for every entry; LR (10) is dashed for Self Pickup. */
function progressDots(card: BoardCard): DotState[] {
  const out: DotState[] = [];
  const selfPickup = card.fulfillment === 'self_pickup';
  for (let n = 1; n < DONE_COLUMN; n++) {
    if (card.kind === 'order') {
      const cur = card.position.step;
      if (card.position.skipped.includes(n as StepNo)) out.push('skipped');
      else if (n < cur) out.push('done');
      else if (n === cur) out.push(card.position.hold ? 'hold' : 'current');
      else if (n === 10 && selfPickup) out.push('skipped');
      else out.push('upcoming');
    } else {
      // Entry cards: steps 1–7 are already behind them.
      const col = card.column;
      if (n <= 7) out.push(n === 1 && card.order && !needsPaymentCheck(card.order.pay) ? 'skipped' : 'done');
      else if (n === 10 && selfPickup) out.push('skipped');
      else if (col === DONE_COLUMN || n < col) out.push('done');
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
  if (!invoices.length) return <div className="font-mono text-[10.5px] text-g400 text-center">—</div>;
  return (
    <div className="flex flex-col items-center gap-[1px] min-w-0" title={invoices.join(', ')}>
      {invoices.map((inv, i) => (
        <span key={i} className="font-mono text-[10.5px] text-g500 truncate max-w-full">{inv}</span>
      ))}
    </div>
  );
}

// Column template for every tab except Delivered (which uses the Table's
// Email Sent columns — DeliveredTable below). Everything is centred. Each
// column is minmax(Npx, Nfr): at its minimum the row is 1074px (fits 1366px
// with the sidebar open); on wider screens the extra width is shared out in
// proportion across all columns instead of piling up after Customer.
// Order 100 · Punched At 100 · Customer 250 · Invoice 76 · Ordered/Dispatched/
// Remaining 80 · Current step 120 · Progress 120 (11 dots) · Due 112, 4px gaps,
// 12px side padding.
const GRID = 'grid grid-cols-[minmax(100px,100fr)_minmax(100px,100fr)_minmax(250px,250fr)_minmax(76px,76fr)_minmax(80px,80fr)_minmax(80px,80fr)_minmax(80px,80fr)_minmax(120px,120fr)_minmax(120px,120fr)_minmax(112px,112fr)] gap-x-1 px-3 text-center';
const GRID_MIN_W = 'min-w-[1178px]';

// 2026-10-30: "Punched At" = when the order came into Dispatch ("Order
// Pending for Dispatch" clicked — orders.sent_to_dispatch_at), never the
// order's created_at. Every row of one order shows the same time. Old
// orders imported before the Dispatch module have none: an entry row falls
// back to the entry's created_at, anything else shows "--".
const fmtPunched = (iso?: string) => iso ? fmtIST(new Date(iso), 'dd MMM HH:mm') : '--';
function PunchedCell({ at }: { at?: string }) {
  return <div className="font-mono text-[11.5px] text-g700 whitespace-nowrap">{fmtPunched(at)}</div>;
}

function Row({ card, now, onOpen, qty, orderInvoices, deliveredEntryIds, punchedAt }: { card: BoardCard; now: number; onOpen?: (card: BoardCard) => void; qty?: OrderQty; orderInvoices?: string[]; deliveredEntryIds?: Set<string>; punchedAt?: string }) {
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
  // Per ENTRY: Done (all steps finished) AND in the Delivered list →
  // "Delivered" instead of "Email Sent". Order rows and entries still on a
  // step keep their step name.
  const stepTitle = card.kind === 'entry' && card.column === DONE_COLUMN && deliveredEntryIds?.has(card.entry.id)
    ? 'Delivered' : step?.title;
  const dots = progressDots(card);
  const open = () => onOpen?.(card);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      className={`${GRID} items-center py-[10px] border-b border-g200 last:border-b-0 hover:bg-g100 focus:bg-g100 focus:outline-none cursor-pointer transition-colors`}
    >
      {/* Order */}
      <OrderCell soNumber={order?.soNumber} orderId={orderId} centered />

      {/* Punched At — sent to Dispatch */}
      <PunchedCell at={punchedAt} />

      {/* Customer · product */}
      <CustomerCell cust={order?.cust} lines={lines} />

      {/* Invoice no(s) — dispatch_entries.invoice_number (Step 08) */}
      <InvoiceCell invoices={invoices} />

      {/* Barrels — the ORDER's ordered / dispatched / remaining, every row */}
      <QtyCells qty={qty} />

      {/* Current step + any flag */}
      <div className="flex flex-col items-center gap-[2px] min-w-0">
        <span className="font-mono text-[9.5px] font-bold tracking-[1px] text-g500">{stepLabel(card.column)}</span>
        <span className="text-[13px] text-blk truncate max-w-full" title={stepTitle}>{stepTitle}</span>
        {card.kind === 'order' && card.doPending && (
          <span className="text-[10.5px] font-semibold text-amber-700 leading-snug truncate max-w-full" title={doPendingText(card.doPending)}>{doPendingText(card.doPending)}</span>
        )}
        {card.kind === 'entry' && card.position.invoiceMissing && (
          <span className="text-[10.5px] font-semibold text-[#9A0000]">Invoice no. missing</span>
        )}
      </div>

      {/* 11 dots (2px apart so the group fits its 120px column) */}
      <div className="flex items-center justify-center gap-[2px]">
        {dots.map((d, i) => (
          <span key={i} title={`Step ${String(i + 1).padStart(2, '0')} · ${DISPATCH_STEPS[i].title} · ${DOT_WORD[d]}`}
            className={`w-[9px] h-[9px] rounded-full shrink-0 box-border ${DOT_CLS[d]}`} />
        ))}
      </div>

      {/* Due / late — wraps rather than cutting "Email sent 21 Oct, …" off */}
      <div className="min-w-0 flex justify-center">
        <div className="min-w-0"><TimeBar card={card} now={now} wrap /></div>
      </div>
    </div>
  );
}

// Order column: SO number (red, bold) with the order id under it (grey).
// `hideMissingSo` (List → Delivered): no SO number → only the order id;
// the other tabs show "—" for a missing SO.
function OrderCell({ soNumber, orderId, centered = false, hideMissingSo = false }: { soNumber?: string; orderId?: string; centered?: boolean; hideMissingSo?: boolean }) {
  return (
    <div className={`flex flex-col gap-[2px] min-w-0 ${centered ? 'items-center' : ''}`}>
      {(soNumber || !hideMissingSo) && <span className="font-mono text-[12px] font-bold text-red-mrt truncate max-w-full">{soNumber || '—'}</span>}
      {orderId && <span className="font-mono text-[10.5px] text-g500 truncate max-w-full">{orderId}</span>}
    </div>
  );
}

// Customer (up to 2 lines) over the item summary, centred.
function CustomerCell({ cust, lines }: { cust?: string; lines: { desc: string; qty: number }[] }) {
  return (
    <div className="flex flex-col items-center gap-[2px] min-w-0">
      <span className="text-[13.5px] font-semibold text-blk leading-snug line-clamp-2 break-words max-w-full" title={cust}>{cust || '—'}</span>
      <span className="text-[12px] text-g600 truncate max-w-full" title={lines.map(l => `${l.desc} × ${l.qty}`).join(', ')}>{itemSummary(lines)}</span>
    </div>
  );
}

// Ordered / Dispatched / Remaining, centred; Remaining orange while part
// of the order is still to go.
function QtyCells({ qty }: { qty?: OrderQty }) {
  return (
    <>
      <div className="font-mono text-[12px] text-g700">{qty ? qty.ordered : '—'}</div>
      <div className="font-mono text-[12px] text-g700">{qty ? qty.dispatched : '—'}</div>
      <div className={`font-mono text-[12px] ${qty && qty.dispatched > 0 && qty.remaining > 0 ? 'font-bold text-amber-700' : 'text-g700'}`}>
        {qty ? qty.remaining : '—'}
      </div>
    </>
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
    <div className={`${GRID} items-center py-[10px] border-b border-g200 last:border-b-0`}>
      <OrderCell soNumber={o.soNumber} orderId={o.id} centered />
      <PunchedCell at={o.sentToDispatchAt} />
      <CustomerCell cust={o.cust} lines={lines} />
      <InvoiceCell invoices={[]} />
      <QtyCells qty={qty} />
      <div className="flex flex-col items-center gap-[2px] min-w-0">
        <span className="font-mono text-[9.5px] font-bold tracking-[1px] text-g500">{stepLabel(DONE_COLUMN)}</span>
        <span className="text-[13px] text-blk truncate">Marked delivered</span>
      </div>
      <div />
      <div className="min-w-0 text-[11px] text-g400 text-center">—</div>
    </div>
  );
}

// ── List → Delivered (Both / Delivery / Self Pickup) ─────────────────────
// The Table's Email Sent columns minus Items and Transporter
// (DispatchEntryCells, shared with the Table) + its Actions cell. A row
// click expands that entry's Dispatch Line Items under it. "Marked
// delivered" orders (no entry) show "—" for the entry fields and open the
// order. SO No. and Order Ref share one Order column (OrderCell, as in the
// All tab). Every column has a fixed width (Customer ~260px, long names
// wrap); they add up to 1074px so it fits 1366px with the sidebar open, and
// any extra width is shared out across all columns.
const DELIVERED_COLS = 8;
// Everything centred, across and up/down (the expanded line items keep
// their own alignment — it's a separate row).
const DELIVERED_PROPS = { showEmailSent: true, compact: true, hideItemsAndTransporter: true, centered: true, mergeOrder: true, dispatchedOnFormat: 'dd MMM HH:mm' } as const;
const deliveredOrderCell = (order: Order | undefined, orderId: string | undefined) =>
  <OrderCell soNumber={order?.soNumber} orderId={orderId || order?.id} centered hideMissingSo />;
function DeliveredTable({ items, entryActions, renderExpanded, onOpenOrder }: {
  items: ListItem[];
  entryActions: (card: BoardEntryCard) => React.ReactNode;
  renderExpanded?: (card: BoardEntryCard) => React.ReactNode;
  onOpenOrder?: (order: Order) => void;
}) {
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const rowCls = 'group transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sW/5';
  return (
    <table className="w-full min-w-[1074px] table-fixed border-collapse text-[12.5px]">
      <colgroup>
        <col style={{ width: 112 }} />{/* Order — SO No. over Order Ref */}
        <col style={{ width: 258 }} />{/* Customer — wraps */}
        <col style={{ width: 106 }} />{/* PO No. */}
        <col style={{ width: 102 }} />{/* Value */}
        <col style={{ width: 88 }} />{/* Invoice No. */}
        <col style={{ width: 104 }} />{/* Dispatched On */}
        <col style={{ width: 156 }} />{/* Email Sent On */}
        <col style={{ width: 148 }} />{/* Actions — Edit + Delete side by side */}
      </colgroup>
      <thead className="bg-g100 sticky top-0 z-[1]">
        <tr>
          <DispatchEntryHeadCells {...DELIVERED_PROPS} />
          <th className={thCenterClsCompact}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map(it => {
          if (it.kind === 'deliveredOrder') {
            const o = it.row.order;
            return (
              <tr key={`do:${o.id}`} className={rowCls} onClick={() => onOpenOrder?.(o)}>
                <DispatchEntryCells order={o} {...DELIVERED_PROPS} orderCell={deliveredOrderCell(o, o.id)} />
                <td />
              </tr>
            );
          }
          const card = it.card;
          if (card.kind !== 'entry') {
            return (
              <tr key={card.key} className="border-b border-g100">
                <DispatchEntryCells order={card.order} {...DELIVERED_PROPS} orderCell={deliveredOrderCell(card.order, card.order.id)} />
                <td />
              </tr>
            );
          }
          const isOpen = !!renderExpanded && expandedKey === card.key;
          return (
            <React.Fragment key={card.key}>
              <tr className={`${rowCls} ${isOpen ? 'bg-sW/5' : ''}`} aria-expanded={isOpen}
                onClick={() => renderExpanded && setExpandedKey(k => k === card.key ? null : card.key)}>
                <DispatchEntryCells entry={card.entry} order={card.order} {...DELIVERED_PROPS} orderCell={deliveredOrderCell(card.order, card.entry.orderId)} />
                <td className="px-[9px] py-[10px] align-middle text-center whitespace-nowrap" onClick={stop} onKeyDown={stop}>{entryActions(card)}</td>
              </tr>
              {isOpen && (
                <tr className="bg-sW/[0.02] border-b-2 border-sW">
                  <td colSpan={DELIVERED_COLS} className="p-0">{renderExpanded!(card)}</td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

type ListItem = { kind: 'card'; card: BoardCard } | { kind: 'deliveredOrder'; row: DeliveredOrderRow };

// A row's Punched At (see PunchedCell).
const punchedAtOf = (it: ListItem): string | undefined => it.kind === 'deliveredOrder'
  ? it.row.order.sentToDispatchAt
  : it.card.order?.sentToDispatchAt || (it.card.kind === 'entry' ? it.card.entry.created_at : undefined);

// Newest-first key for Done rows: email sent, else entry created, else order date.
const doneKey = (it: ListItem) => it.kind === 'deliveredOrder'
  ? (it.row.order.created_at || it.row.order.poDate || '')
  : it.card.kind === 'entry' ? (it.card.entry.emailSentAt || it.card.entry.created_at || '') : '';

export function DispatchBoard({ cards, now, onOpen, qty, invoices, deliveredOrders = [], deliveredEntryIds, entryActions, onOpenDeliveredOrder, renderExpanded }: {
  cards: BoardCard[];
  now: number;
  // Entry ids in the List → Delivered list (Dispatch.tsx deliveredCards).
  // A Done entry row whose id is here shows "Delivered" as its step.
  deliveredEntryIds?: Set<string>;
  // List → Delivered: clicking an entry row expands this under it (Dispatch
  // Line Items) instead of calling onOpen; click again to collapse.
  renderExpanded?: (card: BoardEntryCard) => React.ReactNode;
  // List → Delivered: Edit / Delete (+ doer) for entry rows; turns on the
  // Actions column. Order rows get an empty cell.
  entryActions?: (card: BoardEntryCard) => React.ReactNode;
  // List → Delivered: click on a "Marked delivered" row (order, no entry).
  onOpenDeliveredOrder?: (order: Order) => void;
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
  // entryActions given = List → Delivered → the Table's Email Sent columns.
  const deliveredLayout = !!entryActions;
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
    ...(stepFilter === 'all' || stepFilter === DONE_COLUMN ? deliveredOrders.map(row => ({ kind: 'deliveredOrder' as const, row })) : []),
  ];
  // Punched At header: newest first → oldest first → back to the normal sort.
  const [punchSort, setPunchSort] = React.useState<'none' | 'desc' | 'asc'>('none');
  const cyclePunchSort = () => setPunchSort(s => s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none');
  const punchMs = (it: ListItem) => { const v = punchedAtOf(it); const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };
  const shown = items.sort((a, b) => {
    if (punchSort !== 'none') {
      const ta = punchMs(a), tb = punchMs(b);
      // Rows without a time stay at the bottom either way.
      if (ta !== tb) {
        if (ta === null) return 1;
        if (tb === null) return -1;
        return punchSort === 'desc' ? tb - ta : ta - tb;
      }
    }
    const sa: TimeState = a.kind === 'card' ? a.card.state : 'done';
    const sb: TimeState = b.kind === 'card' ? b.card.state : 'done';
    const r = STATE_RANK[sa] - STATE_RANK[sb];
    if (r) return r;
    const colA = a.kind === 'card' ? a.card.column : DONE_COLUMN;
    const colB = b.kind === 'card' ? b.card.column : DONE_COLUMN;
    if (colA === DONE_COLUMN && colB === DONE_COLUMN) return doneKey(b).localeCompare(doneKey(a));
    const pa = a.kind === 'card' ? a.card.position.plannedAt || '' : '';
    const pb = b.kind === 'card' ? b.card.position.plannedAt || '' : '';
    return pa.localeCompare(pb);
  });
  // 2026-10-30: no "All orders" tile — the All pill above (All | On hold |
  // Partially Dispatched | Delivered) already shows everything. With no tile
  // picked the list shows all rows; clicking the picked tile again clears it.
  const tiles: { key: ColumnNo; top: string; title: string; count: number; delayed: number }[] =
    DISPATCH_STEPS.map(s => {
      const list = byColumn.get(s.no) || [];
      const extra = s.no === DONE_COLUMN ? deliveredOrders.length : 0;
      return { key: s.no, top: stepLabel(s.no), title: s.title, count: list.length + extra, delayed: list.filter(c => c.state === 'late').length };
    });

  return (
    <div className="flex-1 min-h-0 flex flex-col px-6 pb-5 pt-[14px] gap-3">
      {/* Step tiles — click to show only that step */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-[6px] shrink-0">
        {tiles.map(t => {
          const on = stepFilter === t.key;
          return (
            <button key={String(t.key)} type="button" onClick={() => setStepFilter(on ? 'all' : t.key)} aria-pressed={on}
              title={on ? 'Click again to show all steps' : undefined}
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
        <div className={deliveredLayout ? '' : GRID_MIN_W}>
          {deliveredLayout ? (
            shown.length === 0
              ? <div className="text-center text-[12px] text-g400 py-12">No delivered entries here. Try another step or clear the search.</div>
              : <DeliveredTable items={shown.slice(0, limit)} entryActions={entryActions!} renderExpanded={renderExpanded} onOpenOrder={onOpenDeliveredOrder} />
          ) : (
            <>
              <div className={`sticky top-0 z-[1] ${GRID} items-center py-[9px] bg-g100 border-b border-g200 font-mono text-[9.5px] font-bold tracking-[1.5px] uppercase text-g500`}>
                <div>Order</div>
                <div role="button" tabIndex={0} onClick={cyclePunchSort}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cyclePunchSort(); } }}
                  title={punchSort === 'none' ? 'Sort newest first' : punchSort === 'desc' ? 'Sort oldest first' : 'Back to the normal order'}
                  className="inline-flex items-center justify-center gap-1 cursor-pointer select-none hover:text-blk group">
                  Punched At
                  {punchSort === 'asc' ? <ChevronUp size={10} className="text-red-mrt" />
                    : punchSort === 'desc' ? <ChevronDown size={10} className="text-red-mrt" />
                    : <ChevronsUpDown size={10} className="text-g300 group-hover:text-g400" />}
                </div>
                <div>Customer · Product</div><div>Invoice No</div>
                <div>Ordered</div><div>Dispatched</div><div>Remaining</div>
                <div>Current step</div><div>Progress</div><div>Due</div>
              </div>
              {shown.length === 0 ? (
                <div className="text-center text-[12px] text-g400 py-12">No orders here. Try another step or clear the search.</div>
              ) : shown.slice(0, limit).map(it => it.kind === 'card' ? (
                <Row key={it.card.key} card={it.card} now={now} onOpen={onOpen} deliveredEntryIds={deliveredEntryIds} punchedAt={punchedAtOf(it)}
                  qty={qty?.get(it.card.kind === 'order' ? it.card.order.id : it.card.entry.orderId)}
                  orderInvoices={it.card.kind === 'order' ? invoices?.get(it.card.order.id) : undefined} />
              ) : (
                <DeliveredOrderRowView key={`do:${it.row.order.id}`} row={it.row} qty={qty?.get(it.row.order.id)} />
              ))}
            </>
          )}
          {shown.length > 0 && (
            <>
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
        <span className="ml-auto text-g500">{shown.length} shown · {deliveredLayout ? 'click a row for its line items' : <>click a row for steps &amp; actions</>}</span>
      </div>
    </div>
  );
}
