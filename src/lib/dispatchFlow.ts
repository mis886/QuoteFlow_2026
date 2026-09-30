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
import { remainingByLine, totalRemaining, BOARD_GO_LIVE_AT } from './utils';

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

// Timestamps arrive in more than one format (Supabase's "2026-09-26
// 05:27:07+00" vs JS's "…Z"), so always compare them as real times.
const ms = (iso: string | undefined) => (iso ? new Date(iso).getTime() : NaN);
const byTime = (a: string | undefined, b: string | undefined) => (ms(a) || 0) - (ms(b) || 0);
const latestIso = (values: (string | undefined)[]): string | undefined =>
  values.filter((v): v is string => !!v && !Number.isNaN(ms(v))).sort(byTime).pop();

/** Anything that started before the board went live starts its timer at go-live. */
const isBeforeGoLive = (iso: string | undefined) => !!iso && ms(iso) < ms(BOARD_GO_LIVE_AT);
const goLiveFloor = (startIso: string | undefined, legacy: boolean) =>
  legacy ? latestIso([startIso, BOARD_GO_LIVE_AT]) : startIso;

export const mapStepFromDB = (r: any): DispatchStepRecord => ({
  id: r.id,
  orderId: r.order_id,
  round: r.round ?? 1,
  stepNo: r.step_no,
  status: r.status,
  plannedAt: r.planned_at ?? undefined,
  doneAt: r.done_at ?? undefined,
  doneBy: r.done_by ?? undefined,
  remark: r.remark ?? undefined,
  createdAt: r.created_at ?? undefined,
});

// ── Step 1–7 buttons ──────────────────────────────────────────────────────
// Each button writes one or more dispatch_steps rows for the card's current
// round. 'hold' puts the card on hold at that step (Resume brings it back).
export interface StepAction {
  label: string;
  primary: boolean;   // black button (manual Done); else white (second choice)
  writes: { stepNo: StepNo; status: StepRecordStatus }[];
}
export const STEP_ACTIONS: Partial<Record<StepNo, StepAction[]>> = {
  1: [
    { label: 'Payment received ✓', primary: true, writes: [{ stepNo: 1, status: 'done' }] },
    { label: 'Not received', primary: false, writes: [{ stepNo: 1, status: 'hold' }] },
  ],
  2: [
    { label: 'No overdue ✓', primary: true, writes: [{ stepNo: 2, status: 'done' }, { stepNo: 3, status: 'skipped' }, { stepNo: 4, status: 'skipped' }] },
    { label: 'Overdue found', primary: false, writes: [{ stepNo: 2, status: 'done' }] },
  ],
  3: [
    { label: 'Mgmt says Yes', primary: true, writes: [{ stepNo: 3, status: 'done' }] },
    { label: 'Mgmt says No', primary: false, writes: [{ stepNo: 3, status: 'hold' }] },
  ],
  4: [{ label: 'Payment received ✓', primary: true, writes: [{ stepNo: 4, status: 'done' }] }],
  5: [
    { label: 'Available ✓', primary: true, writes: [{ stepNo: 5, status: 'done' }] },
    { label: 'Not available', primary: false, writes: [{ stepNo: 5, status: 'hold' }] },
  ],
  6: [{ label: 'DO issued ✓', primary: true, writes: [{ stepNo: 6, status: 'done' }] }],
  7: [{ label: 'Picked up ✓', primary: true, writes: [{ stepNo: 7, status: 'done' }] }],
};

// ── Order cards ───────────────────────────────────────────────────────────
export interface OrderStepHistory {
  stepNo: StepNo;
  state: 'done' | 'skipped' | 'current' | 'upcoming' | 'not_recorded';
  plannedAt?: string;
  doneAt?: string;
  doneBy?: string;
  remark?: string;
  onHold?: boolean;
}

export interface OrderPosition {
  round: number;
  step: StepNo;               // 1–8
  plannedAt?: string;
  hold?: { record: DispatchStepRecord; reason: string };
  skipped: StepNo[];          // skipped steps in the current round
}

const autoSkips = (order: Order, stepNo: StepNo, fulfillment: DispatchFulfillmentType | 'not_set') =>
  (stepNo === 1 && !needsPaymentCheck(order.pay)) || (stepNo === 6 && fulfillment === 'self_pickup');

interface RoundWalk {
  history: OrderStepHistory[];
  position: OrderPosition;
}

/**
 * Walks steps 1–7 of ONE round (round 1 starts at step 1; later rounds —
 * the qty left after a partial dispatch — start at step 5, since steps 1–4
 * are once per order). `closed` = a dispatch entry already ended this round,
 * so any step without a record is "not_recorded" rather than current.
 */
function walkRound(
  order: Order,
  round: number,
  roundStart: string | undefined,
  records: DispatchStepRecord[],
  fulfillment: DispatchFulfillmentType | 'not_set',
  closed: boolean,
): RoundWalk {
  const legacy = isBeforeGoLive(order.sentToDispatchAt);
  const history: OrderStepHistory[] = [];
  const skipped: StepNo[] = [];
  let prevDone = roundStart;
  let position: OrderPosition | null = null;

  for (let s = round === 1 ? 1 : 5; s <= 7; s++) {
    const stepNo = s as StepNo;
    const recs = records.filter(r => r.round === round && r.stepNo === stepNo);
    const finished = recs.filter(r => r.status === 'done' || r.status === 'skipped')
      .sort((a, b) => byTime(a.doneAt, b.doneAt)).pop();
    const remark = [...recs].sort((a, b) => byTime(a.createdAt, b.createdAt)).map(r => r.remark).filter(Boolean).pop();
    const lastResume = latestIso(recs.filter(r => r.status === 'hold' && r.doneAt).map(r => r.doneAt));
    const plannedAt = plannedAtFor(goLiveFloor(latestIso([prevDone, lastResume]), legacy), stepNo);

    if (position) {
      // Already found the current step — the rest are still to come.
      history.push({ stepNo, state: autoSkips(order, stepNo, fulfillment) ? 'skipped' : 'upcoming' });
      continue;
    }
    if (finished) {
      if (finished.status === 'skipped') skipped.push(stepNo);
      history.push({ stepNo, state: finished.status === 'skipped' ? 'skipped' : 'done', plannedAt: finished.plannedAt || plannedAt, doneAt: finished.doneAt, doneBy: finished.doneBy, remark });
      prevDone = finished.doneAt || prevDone;
      continue;
    }
    if (autoSkips(order, stepNo, fulfillment)) {
      skipped.push(stepNo);
      history.push({ stepNo, state: 'skipped' });
      continue;
    }
    if (closed) {
      history.push({ stepNo, state: 'not_recorded', remark });
      continue;
    }
    const openHold = recs.find(r => r.status === 'hold' && !r.doneAt);
    history.push({ stepNo, state: 'current', plannedAt, remark, onHold: !!openHold });
    position = {
      round, step: stepNo, plannedAt, skipped: [...skipped],
      hold: openHold ? { record: openHold, reason: HOLD_REASONS[stepNo] || 'on hold' } : undefined,
    };
  }
  return {
    history,
    position: position || { round, step: 8, plannedAt: plannedAtFor(goLiveFloor(prevDone, legacy), 8), skipped },
  };
}

const realEntriesOf = (orderEntries: DispatchEntry[]) =>
  orderEntries.filter(e => !isImportedEntry(e)).sort((a, b) => byTime(a.created_at, b.created_at));

/**
 * Where an ORDER card sits. Round 1 runs steps 1→8 from the "Order Pending
 * for Dispatch" click; every later round restarts at step 5 with a fresh
 * timer from the latest dispatch entry.
 */
export function orderPosition(
  order: Order,
  orderEntries: DispatchEntry[],
  records: DispatchStepRecord[],
  fulfillment: DispatchFulfillmentType | 'not_set',
): OrderPosition {
  const real = realEntriesOf(orderEntries);
  const round = real.length + 1;
  const start = round === 1 ? order.sentToDispatchAt : real[real.length - 1].created_at;
  return walkRound(order, round, start, records, fulfillment, false).position;
}

export interface OrderRound {
  round: number;
  history: OrderStepHistory[];
  entry?: DispatchEntry;    // the dispatch entry that ended this round
  open: boolean;            // the round the order card is on now
}

/**
 * Every round of an order, for the drawer: steps 1–7 with planned / actual,
 * plus the dispatch entry that closed each finished round. Steps nobody
 * pressed Done on before an entry was saved (e.g. created from Table view)
 * show as "not_recorded" — never as an error.
 */
export function orderRounds(
  order: Order,
  orderEntries: DispatchEntry[],
  records: DispatchStepRecord[],
  fulfillment: DispatchFulfillmentType | 'not_set',
  stillOpen: boolean,
): OrderRound[] {
  const real = realEntriesOf(orderEntries);
  const rounds: OrderRound[] = [];
  const total = real.length + (stillOpen ? 1 : 0);
  for (let r = 1; r <= total; r++) {
    const start = r === 1 ? order.sentToDispatchAt : real[r - 2].created_at;
    const open = r === real.length + 1;
    rounds.push({ round: r, history: walkRound(order, r, start, records, fulfillment, !open).history, entry: real[r - 1], open });
  }
  return rounds;
}

// ── Entry cards ───────────────────────────────────────────────────────────
export interface EntryPosition {
  column: 8 | 9 | 10 | 11;
  plannedAt?: string;
  invoiceMissing: boolean;
}

/**
 * Where an ENTRY card sits, from the entry's own data:
 *   email sent                             → Done (still flagged if the invoice no. is missing)
 *   no invoice no.                         → step 8 (flagged "Invoice no. missing")
 *   invoice, Delivery, no LR               → step 9
 *   LR uploaded, or Self Pickup            → step 10 until emailed
 * Step 10's timer starts at the LR upload. The entry doesn't store when the
 * LR was uploaded, so its last save (updated_at) stands in for it. Entries
 * saved before the board went live start their timer at go-live.
 */
export function entryPosition(e: DispatchEntry): EntryPosition {
  const invoiceMissing = !e.invoiceNumber;
  if (e.emailSentAt) return { column: 11, invoiceMissing };
  if (invoiceMissing) return { column: 8, plannedAt: entryStepPlanned(e, 8), invoiceMissing };
  if (e.fulfillmentType !== 'self_pickup' && !entryHasLr(e)) return { column: 9, plannedAt: entryStepPlanned(e, 9), invoiceMissing };
  return { column: 10, plannedAt: entryStepPlanned(e, 10), invoiceMissing };
}

/** Planned time of an entry's own step 8 (invoice no.), 9 (LR) or 10 (email). */
export function entryStepPlanned(e: DispatchEntry, stepNo: 8 | 9 | 10): string | undefined {
  const legacy = isBeforeGoLive(e.created_at);
  const start = stepNo === 10 && e.fulfillmentType !== 'self_pickup' ? (e.updated_at || e.created_at) : e.created_at;
  return plannedAtFor(goLiveFloor(start, legacy), stepNo);
}

/**
 * The drawer's 10-row step list for one order: steps 1–4 from round 1
 * (once per order), steps 5–7 from the latest round, and steps 8–10 from
 * the dispatch entry that closed that round (or still to come if the
 * order card is open).
 */
export function drawerSteps(
  order: Order,
  orderEntries: DispatchEntry[],
  records: DispatchStepRecord[],
  fulfillment: DispatchFulfillmentType | 'not_set',
  openPosition: OrderPosition | undefined,
): OrderStepHistory[] {
  const rounds = orderRounds(order, orderEntries, records, fulfillment, !!openPosition);
  if (!rounds.length) return [];
  const first = rounds[0];
  const focus = rounds[rounds.length - 1];
  const steps: OrderStepHistory[] = [
    ...first.history.filter(h => h.stepNo <= 4),
    ...focus.history.filter(h => h.stepNo >= 5),
  ];
  const lastDone = latestIso(steps.filter(h => h.state === 'done').map(h => h.doneAt));
  const e = focus.entry;
  if (!e) {
    const selfPickup = fulfillment === 'self_pickup';
    steps.push(openPosition?.step === 8
      ? { stepNo: 8, state: 'current', plannedAt: openPosition.plannedAt }
      : { stepNo: 8, state: 'upcoming' });
    steps.push({ stepNo: 9, state: selfPickup ? 'skipped' : 'upcoming' });
    steps.push({ stepNo: 10, state: 'upcoming' });
    return steps;
  }
  const legacy = isBeforeGoLive(order.sentToDispatchAt);
  const pos = entryPosition(e);
  const selfPickup = e.fulfillmentType === 'self_pickup';
  steps.push(pos.column === 8
    ? { stepNo: 8, state: 'current', plannedAt: pos.plannedAt, remark: 'Invoice no. missing' }
    : { stepNo: 8, state: 'done', plannedAt: plannedAtFor(goLiveFloor(lastDone, legacy), 8), doneAt: e.created_at, doneBy: e.createdBy, remark: pos.invoiceMissing ? 'Invoice no. missing' : undefined });
  steps.push(selfPickup
    ? { stepNo: 9, state: 'skipped' }
    : entryHasLr(e)
      ? { stepNo: 9, state: 'done', plannedAt: entryStepPlanned(e, 9), remark: 'LR uploaded' }
      : pos.column === 9 ? { stepNo: 9, state: 'current', plannedAt: pos.plannedAt }
      : pos.column === 11 ? { stepNo: 9, state: 'not_recorded' }
      : { stepNo: 9, state: 'upcoming' });
  steps.push(e.emailSentAt
    ? { stepNo: 10, state: 'done', plannedAt: entryStepPlanned(e, 10), doneAt: e.emailSentAt }
    : pos.column === 10 ? { stepNo: 10, state: 'current', plannedAt: pos.plannedAt }
    : { stepNo: 10, state: 'upcoming' });
  return steps;
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
export function fmtDuration(durationMs: number): string {
  const mins = Math.max(0, Math.round(durationMs / 60000));
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
