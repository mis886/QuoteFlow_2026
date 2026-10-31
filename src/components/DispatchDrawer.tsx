import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CircleDashed, Pencil, Undo2, X } from 'lucide-react';
import { fmtIST, doerLabel, formatINR, resolveAdjustments, maxItemGstRate, remainingByLine, punchedAtClass } from '../lib/utils';
import type { DispatchEntry, Order, TeamMember } from '../lib/types';
import {
  BoardCard, BoardEntryCard, BoardOrderCard, DispatchStepRecord, EntryColumn, LastStepClick, LinkedDO, OrderStepHistory, StepAction, StepRecordStatus,
  drawerSteps, entryPosition, fmtDuration, isImportedEntry, stepDef, lastStepClick, lastEntryStepClick, describeStepClick, allowedStepStatuses,
  step6AlreadyEmailed, STEP_ACTIONS, STEP9_MANUAL_ACTION, DONE_COLUMN,
} from '../lib/dispatchFlow';
import { EntryStepButtons, StepActionButtons, STEP_BUTTONS_LOCKED_TIP, TimeBar, TypeDot, step6Label } from './DispatchBoard';
import { ConfirmDialog } from './ConfirmDialog';
import { LineItemsPanel } from './LineItemsPanel';
import { Badge, Button } from './ui';

// <input type="datetime-local"> works in the browser's local time.
const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const STATUS_LABEL: Record<StepRecordStatus, string> = { done: 'Done', skipped: 'Skipped', hold: 'Hold' };

export interface StepEditPatch { status: StepRecordStatus; doneAt: string | null; remark: string | null; }

// Right-side drawer opened by clicking an SO No. on the Dispatch Board:
// order info, steps 1–11 with Planned / Actual / Delay, every dispatch entry
// of the order, a remark box and the current step's buttons. Nothing here
// changes an order's status.
// 2026-10-13: the order info block now shows the same details as the
// Dispatch → Order Pending for Dispatch table, incl. its line-items table.

const fmtDate = (d?: string) => d ? fmtIST(new Date(d), 'dd-MMM-yyyy') : '--';
const Field = ({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) => (
  <div className={wide ? 'col-span-2 sm:col-span-3' : undefined}>
    <div className="font-mono text-[8.5px] font-bold uppercase tracking-[1.5px] text-g400 mb-0.5">{label}</div>
    <div className="text-blk break-words">{children}</div>
  </div>
);

const fmtWhen = (iso?: string) => iso ? `${fmtIST(new Date(iso), 'dd MMM')}, ${fmtIST(new Date(iso), 'hh:mm a').replace(/^0/, '')}` : '—';
const ms = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

function StepIcon({ step, late }: { step: OrderStepHistory; late: boolean }) {
  if (step.state === 'done') {
    return (
      <span className={`w-[18px] h-[18px] rounded-full text-white inline-flex items-center justify-center ${late ? 'bg-[#BB0000]' : 'bg-[#107E3E]'}`}>
        <Check size={11} strokeWidth={3} />
      </span>
    );
  }
  if (step.state === 'skipped') return <CircleDashed size={18} className="text-g400" />;
  if (step.state === 'current') return <span className={`w-[18px] h-[18px] rounded-full border-[2.5px] ${step.onHold ? 'border-g500' : 'border-red-mrt'} bg-white inline-block`} />;
  if (step.state === 'not_recorded') return <span className="w-[18px] h-[18px] rounded-full bg-g200 inline-block" />;
  return <span className="w-[18px] h-[18px] rounded-full border-2 border-g300 bg-white inline-block" />;
}

function StepRow({ step, now, roster, onEdit, doLines, rowAction }: {
  step: OrderStepHistory; now: number; roster: TeamMember[]; onEdit?: () => void;
  doLines?: { text: string; pending: boolean }[];   // Step 6: the round's linked DOs
  rowAction?: { label: string; busy: boolean; onClick: () => void };   // Step 6: "Mark Step 6 done (DO already emailed)"
}) {
  const def = stepDef(step.stepNo);
  const planned = ms(step.plannedAt);
  const actual = ms(step.doneAt);
  const lateBy = step.state === 'done' ? actual - planned : step.state === 'current' && !step.onHold ? now - planned : NaN;
  const isLate = !Number.isNaN(lateBy) && lateBy > 0;

  let delay: React.ReactNode = <span className="text-g400">—</span>;
  if (step.state === 'done' && !Number.isNaN(lateBy)) {
    delay = isLate ? <span className="text-[#9A0000] font-semibold">+{fmtDuration(lateBy)}</span> : <span className="text-[#0B5C2A] font-semibold">On time</span>;
  } else if (step.state === 'current') {
    delay = step.onHold ? <span className="text-g600 font-semibold">On hold</span>
      : isLate ? <span className="text-[#9A0000] font-semibold">Late {fmtDuration(lateBy)}</span>
      : <span className="text-[#0B5C2A]">In progress</span>;
  }

  const stateLabel = step.state === 'skipped' ? 'Skipped'
    : step.state === 'not_recorded' ? 'Not recorded'
    : step.state === 'upcoming' ? 'Upcoming'
    : step.state === 'current' ? (step.onHold ? 'On hold' : 'Current')
    : null;

  return (
    <div className={`grid grid-cols-[22px_1fr] gap-2.5 py-2.5 border-b border-g100 last:border-b-0 ${step.state === 'current' ? 'bg-red-lt -mx-4 px-4' : ''}`}>
      <div className="pt-[2px]"><StepIcon step={step} late={isLate} /></div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] font-bold tracking-[1.5px] text-red-mrt">STEP {String(step.stepNo).padStart(2, '0')}</span>
          <span className={`text-[12.5px] font-semibold truncate ${step.state === 'skipped' || step.state === 'upcoming' || step.state === 'not_recorded' ? 'text-g500' : 'text-blk'}`}>{def.title}</span>
          {stateLabel && <span className={`ml-auto text-[10px] font-semibold shrink-0 ${step.state === 'current' ? 'text-red-mrt' : 'text-g400'}`}>{stateLabel}</span>}
          {/* ✎ — only on steps backed by a saved row (done / skipped / hold);
              never on auto-skips or steps nobody has clicked yet. */}
          {onEdit && step.record && (
            <button type="button" onClick={onEdit} title="Edit this step"
              className={`${stateLabel ? '' : 'ml-auto'} shrink-0 p-0.5 text-g400 hover:text-red-mrt transition-colors`}>
              <Pencil size={12} />
            </button>
          )}
        </div>
        {(step.state === 'done' || step.state === 'current') && (
          <div className="grid grid-cols-3 gap-2 mt-1 text-[11px]">
            <div><div className="font-mono text-[8.5px] uppercase tracking-[1px] text-g400">Planned</div><div className="text-g700">{fmtWhen(step.plannedAt)}</div></div>
            <div><div className="font-mono text-[8.5px] uppercase tracking-[1px] text-g400">Actual</div><div className="text-g700">{fmtWhen(step.doneAt)}</div></div>
            <div><div className="font-mono text-[8.5px] uppercase tracking-[1px] text-g400">Delay</div><div>{delay}</div></div>
          </div>
        )}
        {step.doneBy && step.state === 'done' && (
          <div className="text-[10.5px] text-g500 mt-0.5">by {doerLabel(step.doneBy, roster)}</div>
        )}
        {step.remark && (
          <div className={`text-[11px] mt-0.5 ${step.remark === 'Invoice no. missing' ? 'text-[#9A0000] font-semibold' : 'text-g600'}`}>{step.remark}</div>
        )}
        {doLines?.map(l => (
          <div key={l.text} className={`text-[11px] mt-0.5 ${l.pending ? 'text-amber-700 font-semibold' : 'text-g600'}`}>{l.text}</div>
        ))}
        {rowAction && (
          <button type="button" onClick={rowAction.onClick} disabled={rowAction.busy}
            className="mt-1.5 text-[11.5px] font-semibold rounded-[4px] px-2.5 py-[5px] bg-blk text-white hover:bg-dark transition-colors disabled:opacity-50 disabled:cursor-wait">
            {rowAction.label}
          </button>
        )}
      </div>
    </div>
  );
}

// A dispatch entry's link: one label for Steps 8, 10 and 11 (2026-10-26 — the
// entry page is where the invoice no., LR and documents are attached and the
// email is sent); Step 9 opens the same page, where Email to Client sends the
// Bhiwandi email; Done entries open for viewing their documents.
// Since 2026-10-23 the step completes on that page once its proof is saved
// (invoice no. + file / Bhiwandi email / LR / email sent); the "Invoice done"
// / "Bhiwandi informed" / "LR received" / "Documents sent" button next to it
// is the fallback.
const entryActionLabel = (col: EntryColumn) =>
  col === DONE_COLUMN ? 'View Documents →' : col === 9 ? 'Open Entry →' : 'Attach Documents & Send →';
const entryPagePath = (entryId: string) => `/dispatch/new?entryId=${entryId}&from=board`;

export function DispatchDrawer({
  order, site, entries, records, linkedDOs = [], fulfillment, orderCard, now, roster, canAct, busy, onAction, onEntryAction, onEntryManualStep9, onResume,
  canUndo, undoBusy, onUndo, openedFrom, canDelete, onSaveStep, onDelete, onClose,
}: {
  order: Order;
  site?: string;                       // the customer's unit / site label, if any
  entries: DispatchEntry[];            // this order's entries
  records: DispatchStepRecord[];       // this order's step records
  linkedDOs?: LinkedDO[];              // this order's DOs (stock_movements.order_id)
  fulfillment: BoardOrderCard['fulfillment'];
  orderCard?: BoardOrderCard;          // present while the order is still on the board
  now: number;
  roster: TeamMember[];
  canAct: boolean;
  busy: boolean;
  onAction: (card: BoardOrderCard, action: StepAction, remark?: string) => Promise<void> | void;
  // Steps 8–11 of the entry the drawer was opened from.
  onEntryAction: (card: BoardEntryCard, action: StepAction, remark?: string) => Promise<void> | void;
  // "Mark Step 9 done (Bhiwandi already informed)" — Step 9 without the email.
  onEntryManualStep9: (card: BoardEntryCard) => Promise<void> | void;
  onResume: (card: BoardOrderCard, remark?: string) => Promise<void> | void;
  canUndo: boolean;                    // same logins as the step buttons
  undoBusy: boolean;
  // The click to take back: the order's last Step 1–7 click, or — opened
  // from an entry row — that entry's last Step 8–11 click.
  onUndo: (click: LastStepClick) => void;
  // The card that was clicked — Edit / Delete act on it (the order for an
  // order card, that one dispatch entry for an entry card).
  openedFrom: BoardCard;
  canDelete: boolean;                  // canDeleteRecords (admins) only
  onSaveStep: (record: DispatchStepRecord, patch: StepEditPatch) => Promise<void>;
  onDelete: (card: BoardCard) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [remark, setRemark] = useState('');

  // ✎ step editor (all users): Actual (done_at), Status, Remark of one row.
  const [editing, setEditing] = useState<{ step: OrderStepHistory; record: DispatchStepRecord } | null>(null);
  const [editStatus, setEditStatus] = useState<StepRecordStatus>('done');
  const [editDoneAt, setEditDoneAt] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const openStepEditor = (step: OrderStepHistory) => {
    if (!step.record) return;
    setEditing({ step, record: step.record });
    setEditStatus(step.record.status);
    setEditDoneAt(toLocalInput(step.record.doneAt));
    setEditRemark(step.record.remark || '');
    setEditError('');
  };
  const saveStepEdit = async () => {
    if (!editing) return;
    // A hold's done_at is "resumed at" — empty means still on hold. Done /
    // skipped always need a time.
    if (editStatus !== 'hold' && !editDoneAt) { setEditError('Enter the actual date & time.'); return; }
    const doneAtIso = editDoneAt ? new Date(editDoneAt).toISOString() : null;
    setEditSaving(true);
    try {
      await onSaveStep(editing.record, { status: editStatus, doneAt: doneAtIso, remark: editRemark.trim() || null });
      setEditing(null);
    } catch (err: any) {
      setEditError(err?.message || 'Could not save — check your connection.');
    } finally {
      setEditSaving(false);
    }
  };

  // EDIT (all users): the order card opens Edit Order, an entry card opens
  // that dispatch entry — both come back to the board afterwards.
  const openEdit = () => {
    if (openedFrom.kind === 'entry') navigate(`/dispatch/new?entryId=${encodeURIComponent(openedFrom.entry.id)}&from=board`);
    else navigate(`/orders/new?orderId=${encodeURIComponent(order.id)}&from=board`);
  };

  useEffect(() => {
    // While the ✎ step editor is open, Escape closes only that popup.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing]);
  useEffect(() => { setRemark(''); }, [order.id]);

  const steps = drawerSteps(order, entries, records, fulfillment, orderCard?.position);
  const lastClick = openedFrom.kind === 'entry' ? lastEntryStepClick(records, openedFrom.entry.id) : lastStepClick(records);
  const realEntries = entries.filter(e => !isImportedEntry(e))
    .sort((a, b) => (ms(a.created_at) || 0) - (ms(b.created_at) || 0));
  // Dispatch entries section: only the entry row the drawer was opened from.
  const openedEntryId = openedFrom.kind === 'entry' ? openedFrom.entry.id : undefined;
  const shownEntries = realEntries.filter(e => e.id === openedEntryId);
  // Order value + line items, calculated the same way as the Pending table.
  const subTotal = order.items.reduce((s, i) => s + i.total, 0);
  const itemGst = order.items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
  const grandTotal = resolveAdjustments(order.adjustments, subTotal, itemGst, maxItemGstRate(order.items)).grand;
  // Partial dispatch: show a "Remaining" column once any line has gone out.
  const remaining = remainingByLine(order, entries);
  const partlyDispatched = order.items.some(i => (remaining.get(i.seq) ?? 0) < (Number(i.qty) || 0));
  const punched = order.created_at ? punchedAtClass(order.created_at) : null;
  // 2026-10-06: the remark box + step buttons show for every login while the
  // order is on steps 1–7; canAct only decides whether they are enabled.
  const hasStepActions = !!orderCard && orderCard.column <= 7;
  // Opened from an entry row that is still waiting on step 8–11 (not Done).
  const entryWaiting = openedFrom.kind === 'entry' && openedFrom.column !== DONE_COLUMN;
  // 2026-10-16: Step 6 row — the DOs of the round the drawer's steps 5–7
  // come from (the open round, else the last closed one): saved / emailed.
  const focusRound = orderCard ? orderCard.position.round : realEntries.length;
  const step6DoLines = linkedDOs.filter(d => d.round === focusRound).map(d => d.emailSentAt
    ? { text: `DO ${d.doNumber || '—'} emailed ${fmtWhen(d.emailSentAt)}`, pending: false }
    : { text: `DO ${d.doNumber || '—'} saved, email pending`, pending: true });
  // Every DO already emailed but no Step 6 row — the Step 6 row gets "Mark
  // Step 6 done (DO already emailed)" (board logins only; no email is sent).
  const markStep6Action = orderCard && canAct && step6AlreadyEmailed(orderCard)
    ? (STEP_ACTIONS[6] || []).find(a => a.primary) : undefined;

  const act = async (card: BoardOrderCard, action: StepAction) => { if (!canAct) return; await onAction(card, action, remark); setRemark(''); };
  const actEntry = async (card: BoardEntryCard, action: StepAction) => { if (!canAct) return; await onEntryAction(card, action, remark); setRemark(''); };
  const resume = async (card: BoardOrderCard) => { if (!canAct) return; await onResume(card, remark); setRemark(''); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-[460px] lg:max-w-[640px] h-full bg-white border-l border-g200 shadow-[-8px_0_24px_rgba(0,0,0,0.08)] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-g200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-bold text-red-mrt">{order.soNumber || '—'}</span>
                <span className="font-mono text-[10.5px] text-g500">{order.id}</span>
              </div>
              <div className="font-serif text-[19px] text-blk leading-tight mt-0.5 truncate">{order.cust}</div>
            </div>
            <button type="button" onClick={onClose} title="Close" className="p-1 text-g400 hover:text-blk shrink-0"><X size={18} /></button>
          </div>
          {orderCard && <div className="mt-2.5"><TimeBar card={orderCard} now={now} /></div>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Order info */}
          <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-[12px]">
            <Field label="SO No."><span className="font-mono text-[11px] font-bold text-sW">{order.soNumber || '—'}</span></Field>
            <Field label="Order Ref"><span className="font-mono text-[11px] font-bold text-sQ">{order.id}</span></Field>
            <Field label="Status"><Badge status={order.status} /></Field>
            <Field label="Customer - Unit" wide>
              <span className="font-semibold">{order.cust}</span>{site ? <span className="text-g500"> — {site}</span> : null}
            </Field>
            <Field label="PO Number"><span className="font-mono text-[11px] font-bold text-g700">{order.poNo || '—'}</span></Field>
            <Field label="PO Date">{fmtDate(order.poDate)}</Field>
            <Field label="Schedule Date">{fmtDate(order.scheduleDate)}</Field>
            <Field label="Order Value"><span className="font-mono font-bold">{formatINR(Math.round(grandTotal))}</span></Field>
            <Field label="Payment terms">{order.pay || '—'}</Field>
            <Field label="Fulfillment"><TypeDot type={fulfillment} /></Field>
            <Field label="Punched At">
              {punched ? <span className={punched.text} title={punched.title}>{fmtDate(order.created_at)}</span> : <span className="text-g600">--</span>}
            </Field>
            <Field label="Sent to dispatch">{fmtWhen(order.sentToDispatchAt)}</Field>
          </div>
          {/* Line items — same table as the Pending tab's expanded row; scrolls
              sideways inside the drawer. */}
          <div className="border-b border-g200">
            <LineItemsPanel
              title={`Order Line Items -- ${order.soNumber ? `${order.soNumber} / ` : ''}${order.id}`}
              items={order.items}
              grand={grandTotal}
              remaining={partlyDispatched ? remaining : undefined}
              scroll
            />
          </div>

          {/* Steps 1–11 */}
          <div className="px-4 py-3 border-b border-g200">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[2px] text-red-mrt">Steps</div>
              <div className="flex items-center gap-1.5 flex-nowrap">
                {canUndo && lastClick && (
                  <button type="button" onClick={() => onUndo(lastClick)} disabled={undoBusy}
                    title={`Takes back: ${describeStepClick(lastClick)}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-mrt border border-red-mrt/40 rounded-[4px] px-2 py-[3px] hover:bg-red-lt transition-colors disabled:opacity-50 disabled:cursor-wait">
                    <Undo2 size={11} /> Undo last step
                  </button>
                )}
                <Button size="sm" variant="secondary" className="h-[24px]" onClick={openEdit}
                  title={openedFrom.kind === 'entry' ? 'Edit this dispatch entry' : 'Edit this order'}>
                  Edit
                </Button>
                {canDelete && (
                  <Button size="sm" variant="ghost" className="h-[24px] text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(openedFrom)}
                    title={openedFrom.kind === 'entry' ? 'Delete this dispatch entry' : 'Remove this order from the Dispatch board'}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
            {steps.map(s => (
              <StepRow key={s.stepNo} step={s} now={now} roster={roster} onEdit={() => openStepEditor(s)}
                doLines={s.stepNo === 6 ? step6DoLines : undefined}
                rowAction={s.stepNo === 6 && markStep6Action ? { label: step6Label(orderCard!), busy, onClick: () => act(orderCard!, markStep6Action) } : undefined} />
            ))}
          </div>

          {/* Dispatch entries — entry rows only. An order row is what is left to
              dispatch: it gets its own entry at Step 8, nothing from earlier ones. */}
          {openedFrom.kind === 'entry' && (
            <div className="px-4 py-3">
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[2px] text-red-mrt mb-2">Dispatch entries</div>
              {shownEntries.length === 0 ? (
                <div className="text-[12px] text-g400">No dispatch entry yet.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {shownEntries.map(e => {
                    const pos = entryPosition(e, records);
                    const where = pos.column === DONE_COLUMN ? 'Done' : `Step ${pos.column} · ${stepDef(pos.column).title}`;
                    return (
                      <div key={e.id} className="flex items-center gap-2 border border-g200 rounded-[4px] px-2.5 py-2">
                        <span className="font-mono text-[10px] font-bold bg-[#F3EEFF] text-[#5B21B6] rounded-[3px] px-1.5 py-[1px] shrink-0">INV {e.invoiceNumber || '—'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11.5px] text-blk truncate">{where}</div>
                          <div className="text-[10.5px] text-g500">
                            {e.emailSentAt ? `Email sent ${fmtWhen(e.emailSentAt)}` : `Dispatched ${fmtWhen(e.created_at)}`}
                            {pos.invoiceMissing && <span className="text-[#9A0000] font-semibold"> · Invoice no. missing</span>}
                          </div>
                        </div>
                        <button type="button" onClick={() => navigate(entryPagePath(e.id))}
                          className="text-[11px] font-semibold text-red-mrt hover:underline shrink-0">{entryActionLabel(pos.column)}</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Remark + current step's buttons */}
        {((orderCard && (hasStepActions || orderCard.column === 8)) || entryWaiting) && (
          <div className="border-t border-g200 px-4 py-3 flex flex-col gap-2 bg-cream">
            {/* Entry waiting on Step 8–11: remark + the step's button,
                with the entry-page link next to it. */}
            {entryWaiting && openedFrom.kind === 'entry' && (
              <>
                <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2}
                  disabled={!canAct} title={canAct ? undefined : STEP_BUTTONS_LOCKED_TIP}
                  placeholder="Remark (saved with the next button you press)"
                  className="w-full font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[4px] p-[7px_9px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt resize-none disabled:opacity-50 disabled:cursor-not-allowed" />
                <EntryStepButtons card={openedFrom} busy={busy} canAct={canAct} onAction={actEntry}
                  link={
                    <button type="button" onClick={() => navigate(entryPagePath(openedFrom.entry.id))}
                      className="shrink-0 bg-red-mrt hover:bg-red-h text-white text-[11.5px] font-semibold rounded-[4px] px-2.5 py-[7px] transition-colors whitespace-nowrap">
                      {entryActionLabel(openedFrom.column)}
                    </button>
                  } />
                {/* 2026-10-30: Bhiwandi was told some other way — Step 9 without
                    the email (board logins only, same as Undo). Saved with the
                    remark "marked manually"; the typed remark is not used. */}
                {openedFrom.column === 9 && canAct && !openedFrom.entry.bhiwandiEmailSentAt && (
                  <button type="button" disabled={busy} onClick={() => onEntryManualStep9(openedFrom)}
                    className="w-full text-[11.5px] font-semibold rounded-[4px] px-2.5 py-[6px] bg-white text-blk border border-g300 hover:bg-g100 transition-colors disabled:opacity-50 disabled:cursor-wait">
                    {STEP9_MANUAL_ACTION.label}
                  </button>
                )}
              </>
            )}
            {orderCard && hasStepActions && (
              <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2}
                disabled={!canAct} title={canAct ? undefined : STEP_BUTTONS_LOCKED_TIP}
                placeholder="Remark (saved with the next button you press)"
                className="w-full font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[4px] p-[7px_9px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt resize-none disabled:opacity-50 disabled:cursor-not-allowed" />
            )}
            {orderCard && hasStepActions && <StepActionButtons card={orderCard} busy={busy} canAct={canAct} onAction={act} onResume={resume} omitStep6MarkDone />}
            {orderCard?.column === 8 && (
              <button type="button" onClick={() => navigate(`/dispatch/new?orderRef=${order.id}&toSent=1&from=board`)}
                className="w-full bg-red-mrt hover:bg-red-h text-white text-[12px] font-semibold rounded-[4px] px-2.5 py-[7px] transition-colors">
                Create Dispatch Entry →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ✎ Edit one step's row. Planned is calculated, so it's shown, not edited. */}
      {editing && (() => {
        const statuses = allowedStepStatuses(editing.record.stepNo, editing.record.status);
        const labelCls = 'block font-mono text-[8.5px] font-bold uppercase tracking-[1.5px] text-g500 mb-1';
        const inputCls = 'w-full font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[3px] p-[6px_8px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt';
        return (
          <ConfirmDialog
            title={`Edit Step ${String(editing.record.stepNo).padStart(2, '0')} · ${stepDef(editing.record.stepNo as OrderStepHistory['stepNo']).title}`}
            confirmLabel="Save"
            busy={editSaving}
            onConfirm={saveStepEdit}
            onCancel={() => setEditing(null)}
          >
            <div className="flex flex-col gap-3 mt-1">
              <div className="text-[11.5px] text-g500">Planned: <span className="text-g700 font-medium">{fmtWhen(editing.step.plannedAt)}</span> <span className="text-g400">(calculated)</span></div>
              <div>
                <label className={labelCls}>Status</label>
                <div className="flex gap-1.5">
                  {statuses.map(s => (
                    <button key={s} type="button" onClick={() => setEditStatus(s)}
                      className={`px-3 py-1 rounded-[3px] border text-[11.5px] font-semibold transition-colors ${editStatus === s ? 'bg-blk text-white border-blk' : 'bg-white text-g700 border-g300 hover:bg-g100'}`}>
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>{editStatus === 'hold' ? 'Resumed at (leave empty while still on hold)' : 'Actual date & time'}</label>
                <input type="datetime-local" value={editDoneAt} onChange={e => { setEditDoneAt(e.target.value); setEditError(''); }} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Remark</label>
                <textarea value={editRemark} onChange={e => setEditRemark(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
              </div>
              {editError && <div className="text-[11.5px] text-red-mrt font-medium">{editError}</div>}
            </div>
          </ConfirmDialog>
        );
      })()}
    </div>
  );
}
