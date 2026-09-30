// Dispatch Board (Kanban) workflow — the 10 dispatch steps + Done, and the
// rules that place every order / dispatch entry on the board. Pure functions
// only (no store, no Supabase), so Dispatch.tsx and the board components
// share one source of truth.
//
// Two kinds of cards:
//   ORDER card — one per order that was sent to Dispatch and still has
//     barrels left (totalRemaining > 0). Lives in steps 1–8.
//   ENTRY card — one per dispatch entry. Placed purely from the entry's own
//     data (invoice no., LR files, email sent) in steps 8–10 / Done.
// Nothing here ever changes an order's status.
import type { DispatchEntry, DispatchFulfillmentType, Order } from './types';
import { remainingByLine, totalRemaining } from './utils';

export type StepNo = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
/** Board column: steps 1–10, or 11 = Done. */
export type ColumnNo = StepNo | 11;
export const DONE_COLUMN = 11 as const;

export interface StepDef {
  no: ColumnNo;
  title: string;
  subtitle: string;
  how: string;
  tatHours: number;
  auto: boolean;
  rule?: string;       // purple rule line
  autoRule?: string;   // blue "moves by itself" line
}

export const DISPATCH_STEPS: StepDef[] = [
  { no: 1, title: 'Payment Received', subtitle: 'Check receipt of payment', how: 'Bank account', tatHours: 4, auto: false, rule: 'Advance orders only — credit orders start at step 2' },
  { no: 2, title: 'Overdue Check', subtitle: 'Check overdue bills', how: 'Tally Prime', tatHours: 1, auto: false },
  { no: 3, title: 'Management Approval', subtitle: 'Confirm with management', how: 'WhatsApp / Phone', tatHours: 1, auto: false, rule: 'Only if bills are overdue' },
  { no: 4, title: 'Collect Payment', subtitle: 'Request & receive overdue payment', how: 'WhatsApp / Phone', tatHours: 1, auto: false, rule: 'Only if management says yes' },
  { no: 5, title: 'Material Check', subtitle: 'Material available or not', how: 'WhatsApp', tatHours: 1, auto: false },
  { no: 6, title: 'Transporter & DO', subtitle: 'Transporter confirmation & issue DO', how: 'Manual', tatHours: 12, auto: false, rule: 'Delivery only — Self Pickup skips this' },
  { no: 7, title: 'Pickup', subtitle: 'Check pickup of material', how: 'Phone', tatHours: 24, auto: false },
  { no: 8, title: 'Invoice', subtitle: 'Prepare invoice', how: 'Tally → Dispatch entry', tatHours: 1, auto: true, autoRule: 'Moves when a dispatch entry is saved' },
  { no: 9, title: 'Get LR', subtitle: 'Get LR from transporter', how: 'WhatsApp → Mail', tatHours: 24, auto: true, rule: 'Delivery only — Self Pickup skips this', autoRule: 'Moves when an LR file is uploaded' },
  { no: 10, title: 'Send Documents', subtitle: 'Send documents to the party', how: 'Email to Client', tatHours: 30, auto: true, autoRule: 'Moves when the email is sent' },
  { no: 11, title: 'Email Sent', subtitle: 'Completed', how: '', tatHours: 0, auto: false, rule: 'Emailed in the last 7 days' },
];

export const stepDef = (no: ColumnNo): StepDef => DISPATCH_STEPS[no - 1];

/** Shown on order cards as the person doing steps 1–7. */
export const DISPATCH_DOER_NAME = 'Samata';

/** Hold reasons, by the step the card was put on hold at. */
export const HOLD_REASONS: Partial<Record<StepNo, string>> = {
  1: 'waiting for payment',
  3: 'management said no',
  5: 'waiting for material',
};

/** Entries emailed longer ago than this drop off the Done column. */
export const DONE_WINDOW_DAYS = 7;

// ── Time (TAT) ────────────────────────────────────────────────────────────
// THE one place a step's planned time is calculated. Clock hours for now;
// switch this function to working hours later without touching callers.
export function plannedAtFor(startIso: string | undefined, stepNo: ColumnNo): string | undefined {
  if (!startIso) return undefined;
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return undefined;
  return new Date(start + stepDef(stepNo).tatHours * 3600000).toISOString();
}

// ── Saved step records (dispatch_steps table, Phase 2) ───────────────────
export type StepRecordStatus = 'done' | 'skipped' | 'hold';
export interface DispatchStepRecord {
  id: string;
  orderId: string;
  round: number;
  stepNo: number;
  status: StepRecordStatus;
  plannedAt?: string;
  // done/skipped: when it was completed. hold: when the hold was resumed
  // (undefined while still on hold).
  doneAt?: string;
  doneBy?: string;
  remark?: string;
  createdAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────
// Entries bulk-imported from old "Delivered" orders (before the Dispatch
// module existed) — hidden from the board and never counted as a round.
export const isImportedEntry = (e: DispatchEntry) => e.createdBy === 'system-import';

/** Advance payment terms need the step 1 payment-receipt check. */
export const needsPaymentCheck = (pay: string | undefined) => /advance/i.test(pay || '');

export const entryHasLr = (e: DispatchEntry) => (e.lrFiles?.length ?? 0) > 0 || !!e.lrUrl;

const latestIso = (values: (string | undefined)[]): string | undefined =>
  values.filter(Boolean).sort().pop();

// ── Order cards ───────────────────────────────────────────────────────────
export interface OrderStepHistory {
  stepNo: StepNo;
  state: 'done' | 'skipped' | 'current' | 'upcoming' | 'not_recorded';
  plannedAt?: string;
  doneAt?: string;
  doneBy?: string;
  remark?: string;
}

export interface OrderPosition {
  round: number;
  step: StepNo;               // 1–8
  plannedAt?: string;
  hold?: { record: DispatchStepRecord; reason: string };
  skipped: StepNo[];          // skipped steps in the current round
}

/**
 * Where an ORDER card sits. Round 1 runs steps 1→8; every later round (the
 * remaining qty after a partial dispatch) restarts at step 5 with a fresh
 * timer from the latest dispatch entry — steps 1–4 are once per order.
 */
export function orderPosition(
  order: Order,
  orderEntries: DispatchEntry[],
  records: DispatchStepRecord[],
  fulfillment: DispatchFulfillmentType | 'not_set',
): OrderPosition {
  const realEntries = orderEntries.filter(e => !isImportedEntry(e));
  const round = realEntries.length + 1;
  const roundRecords = records.filter(r => r.round === round);
  const firstStep: StepNo = round === 1 ? 1 : 5;
  let prevDone: string | undefined = round === 1
    ? order.sentToDispatchAt
    : latestIso(realEntries.map(e => e.created_at));
  const skipped: StepNo[] = [];

  for (let s = firstStep; s <= 7; s++) {
    const stepNo = s as StepNo;
    const recs = roundRecords.filter(r => r.stepNo === stepNo);
    const finished = recs.filter(r => r.status === 'done' || r.status === 'skipped')
      .sort((a, b) => (a.doneAt || '').localeCompare(b.doneAt || '')).pop();
    const autoSkip = (stepNo === 1 && !needsPaymentCheck(order.pay))
      || (stepNo === 6 && fulfillment === 'self_pickup');
    if (finished) {
      if (finished.status === 'skipped') skipped.push(stepNo);
      prevDone = finished.doneAt || prevDone;
      continue;
    }
    if (autoSkip) { skipped.push(stepNo); continue; }
    // Current step. A resumed hold restarts the timer from the resume time.
    const openHold = recs.find(r => r.status === 'hold' && !r.doneAt);
    const lastResume = latestIso(recs.filter(r => r.status === 'hold' && r.doneAt).map(r => r.doneAt));
    const start = latestIso([prevDone, lastResume]);
    return {
      round, step: stepNo, plannedAt: plannedAtFor(start, stepNo), skipped,
      hold: openHold ? { record: openHold, reason: HOLD_REASONS[stepNo] || 'on hold' } : undefined,
    };
  }
  return { round, step: 8, plannedAt: plannedAtFor(prevDone, 8), skipped };
}

/**
 * Step-by-step history for the drawer (steps 1–7 of one round). Steps before
 * the card's current step that have no record — e.g. a dispatch entry was
 * created from Table view before anyone pressed Done — are "not_recorded".
 */
export function orderStepHistory(
  order: Order,
  round: number,
  roundStartIso: string | undefined,
  records: DispatchStepRecord[],
  current: StepNo | null,
  fulfillment: DispatchFulfillmentType | 'not_set',
): OrderStepHistory[] {
  const out: OrderStepHistory[] = [];
  let prevDone = roundStartIso;
  const firstStep = round === 1 ? 1 : 5;
  for (let s = firstStep; s <= 7; s++) {
    const stepNo = s as StepNo;
    const recs = records.filter(r => r.round === round && r.stepNo === stepNo);
    const finished = recs.filter(r => r.status === 'done' || r.status === 'skipped')
      .sort((a, b) => (a.doneAt || '').localeCompare(b.doneAt || '')).pop();
    const autoSkip = (stepNo === 1 && !needsPaymentCheck(order.pay))
      || (stepNo === 6 && fulfillment === 'self_pickup');
    const lastResume = latestIso(recs.filter(r => r.status === 'hold' && r.doneAt).map(r => r.doneAt));
    const plannedAt = plannedAtFor(latestIso([prevDone, lastResume]), stepNo);
    const remark = [...recs].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).map(r => r.remark).filter(Boolean).pop();
    if (finished) {
      out.push({ stepNo, state: finished.status === 'skipped' ? 'skipped' : 'done', plannedAt, doneAt: finished.doneAt, doneBy: finished.doneBy, remark });
      prevDone = finished.doneAt || prevDone;
    } else if (autoSkip) {
      out.push({ stepNo, state: 'skipped' });
    } else if (current === null || stepNo < current) {
      out.push({ stepNo, state: 'not_recorded', remark });
    } else if (stepNo === current) {
      out.push({ stepNo, state: 'current', plannedAt, remark });
    } else {
      out.push({ stepNo, state: 'upcoming' });
    }
  }
  return out;
}

// ── Entry cards ───────────────────────────────────────────────────────────
export interface EntryPosition {
  column: 8 | 9 | 10 | 11;
  plannedAt?: string;
  invoiceMissing: boolean;
}

/**
 * Where an ENTRY card sits, from the entry's own data:
 *   no invoice no.                         → step 8 (flagged "Invoice no. missing")
 *   invoice, Delivery, no LR               → step 9
 *   LR uploaded, or Self Pickup            → step 10 until emailed
 *   email sent                             → Done
 * Step 10's timer starts at the LR upload. The entry doesn't store when the
 * LR was uploaded, so its last save (updated_at) stands in for it.
 */
export function entryPosition(e: DispatchEntry): EntryPosition {
  if (!e.invoiceNumber) return { column: 8, plannedAt: plannedAtFor(e.created_at, 8), invoiceMissing: true };
  if (e.emailSentAt) return { column: 11, invoiceMissing: false };
  const selfPickup = e.fulfillmentType === 'self_pickup';
  if (!selfPickup && !entryHasLr(e)) return { column: 9, plannedAt: plannedAtFor(e.created_at, 9), invoiceMissing: false };
  const start = selfPickup ? e.created_at : (e.updated_at || e.created_at);
  return { column: 10, plannedAt: plannedAtFor(start, 10), invoiceMissing: false };
}

// ── Time bar ──────────────────────────────────────────────────────────────
export type TimeState = 'on_time' | 'due_soon' | 'late' | 'hold' | 'done' | 'none';

export function timeState(plannedAt: string | undefined, now: number, onHold: boolean): TimeState {
  if (onHold) return 'hold';
  if (!plannedAt) return 'none';
  const diff = new Date(plannedAt).getTime() - now;
  if (diff < 0) return 'late';
  if (diff <= 3600000) return 'due_soon';
  return 'on_time';
}

/** "1h 20m", "2d 3h", "12 min". */
export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

// ── Board ─────────────────────────────────────────────────────────────────
export interface BoardOrderCard {
  kind: 'order';
  key: string;
  order: Order;
  position: OrderPosition;
  column: StepNo;
  remaining: { desc: string; qty: number }[];
  fulfillment: DispatchFulfillmentType | 'not_set';
  state: TimeState;
}
export interface BoardEntryCard {
  kind: 'entry';
  key: string;
  entry: DispatchEntry;
  order?: Order;
  position: EntryPosition;
  column: 8 | 9 | 10 | 11;
  fulfillment: DispatchFulfillmentType;
  state: TimeState;
}
export type BoardCard = BoardOrderCard | BoardEntryCard;

export function buildBoard(
  orders: Order[],
  entries: DispatchEntry[],
  records: DispatchStepRecord[],
  orderFulfillment: (o: Order) => DispatchFulfillmentType | 'not_set',
  now: number,
): BoardCard[] {
  const cards: BoardCard[] = [];
  const entriesByOrder = new Map<string, DispatchEntry[]>();
  for (const e of entries) {
    const list = entriesByOrder.get(e.orderId) || [];
    list.push(e);
    entriesByOrder.set(e.orderId, list);
  }
  const recordsByOrder = new Map<string, DispatchStepRecord[]>();
  for (const r of records) {
    const list = recordsByOrder.get(r.orderId) || [];
    list.push(r);
    recordsByOrder.set(r.orderId, list);
  }
  const ordersById = new Map(orders.map(o => [o.id, o]));

  // Same rule as Dispatch → Order Pending for Dispatch.
  for (const o of orders) {
    if (!o.sentToDispatchAt) continue;
    if (o.status !== 'Order Confirmed' && o.status !== 'Order Pending for Dispatch') continue;
    if (totalRemaining(o, entries) <= 0) continue;
    const fulfillment = orderFulfillment(o);
    const position = orderPosition(o, entriesByOrder.get(o.id) || [], recordsByOrder.get(o.id) || [], fulfillment);
    const rem = remainingByLine(o, entries);
    cards.push({
      kind: 'order', key: `o:${o.id}`, order: o, position, column: position.step, fulfillment,
      remaining: o.items.filter(i => (rem.get(i.seq) || 0) > 0).map(i => ({ desc: i.desc, qty: rem.get(i.seq) || 0 })),
      state: timeState(position.plannedAt, now, !!position.hold),
    });
  }

  const doneCutoff = now - DONE_WINDOW_DAYS * 86400000;
  for (const e of entries) {
    if (isImportedEntry(e)) continue;
    const position = entryPosition(e);
    if (position.column === 11) {
      if (!e.emailSentAt || new Date(e.emailSentAt).getTime() < doneCutoff) continue;
    }
    cards.push({
      kind: 'entry', key: `e:${e.id}`, entry: e, order: ordersById.get(e.orderId), position,
      column: position.column, fulfillment: e.fulfillmentType,
      state: position.column === 11 ? 'done' : timeState(position.plannedAt, now, false),
    });
  }
  return cards;
}
