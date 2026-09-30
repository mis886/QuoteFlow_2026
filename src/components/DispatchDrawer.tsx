import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CircleDashed, Pencil, Undo2, X } from 'lucide-react';
import { fmtIST, doerLabel } from '../lib/utils';
import type { DispatchEntry, Order, TeamMember } from '../lib/types';
import {
  BoardCard, BoardOrderCard, DispatchStepRecord, OrderStepHistory, StepAction, StepRecordStatus,
  drawerSteps, entryPosition, fmtDuration, isImportedEntry, stepDef, lastStepClick, describeStepClick, allowedStepStatuses,
} from '../lib/dispatchFlow';
import { StepActionButtons, TimeBar, TypeDot } from './DispatchBoard';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from './ui';

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
// order info, steps 1–10 with Planned / Actual / Delay, every dispatch entry
// of the order, a remark box and the current step's buttons. Nothing here
// changes an order's status.

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

function StepRow({ step, now, roster, onEdit }: { step: OrderStepHistory; now: number; roster: TeamMember[]; onEdit?: () => void }) {
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
              never on auto-skips or the automatic steps 8–10. */}
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
      </div>
    </div>
  );
}

export function DispatchDrawer({
  order, entries, records, fulfillment, orderCard, now, roster, canAct, busy, onAction, onResume,
  canUndo, undoBusy, onUndo, openedFrom, canDelete, onSaveStep, onDelete, onClose,
}: {
  order: Order;
  entries: DispatchEntry[];            // this order's entries
  records: DispatchStepRecord[];       // this order's step records
  fulfillment: BoardOrderCard['fulfillment'];
  orderCard?: BoardOrderCard;          // present while the order is still on the board
  now: number;
  roster: TeamMember[];
  canAct: boolean;
  busy: boolean;
  onAction: (card: BoardOrderCard, action: StepAction, remark?: string) => Promise<void> | void;
  onResume: (card: BoardOrderCard, remark?: string) => Promise<void> | void;
  canUndo: boolean;                    // ADMIN_EMAILS only
  undoBusy: boolean;
  onUndo: () => void;
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
  const lastClick = lastStepClick(records);
  const realEntries = entries.filter(e => !isImportedEntry(e))
    .sort((a, b) => (ms(a.created_at) || 0) - (ms(b.created_at) || 0));
  const items = orderCard
    ? orderCard.remaining
    : order.items.map(i => ({ desc: i.desc, qty: Number(i.qty) || 0 }));
  const canActHere = canAct && !!orderCard && orderCard.column <= 7;

  const act = async (card: BoardOrderCard, action: StepAction) => { await onAction(card, action, remark); setRemark(''); };
  const resume = async (card: BoardOrderCard) => { await onResume(card, remark); setRemark(''); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-[460px] h-full bg-white border-l border-g200 shadow-[-8px_0_24px_rgba(0,0,0,0.08)] flex flex-col animate-in slide-in-from-right duration-200">
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
          <div className="px-4 py-3 border-b border-g200 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12px]">
            <div className="col-span-2">
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[1.5px] text-g400 mb-0.5">Item</div>
              {items.length ? items.map((l, i) => (
                <div key={i} className="text-blk">{(l.desc || 'Item').trim()} × {l.qty}</div>
              )) : <div className="text-g400">—</div>}
            </div>
            <div>
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[1.5px] text-g400 mb-0.5">Payment terms</div>
              <div className="text-blk">{order.pay || '—'}</div>
            </div>
            <div>
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[1.5px] text-g400 mb-0.5">Type</div>
              <div className="text-blk"><TypeDot type={fulfillment} /></div>
            </div>
            <div className="col-span-2">
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[1.5px] text-g400 mb-0.5">Sent to dispatch</div>
              <div className="text-blk">{fmtWhen(order.sentToDispatchAt)}</div>
            </div>
          </div>

          {/* Steps 1–10 */}
          <div className="px-4 py-3 border-b border-g200">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[2px] text-red-mrt">Steps</div>
              <div className="flex items-center gap-1.5 flex-nowrap">
                {canUndo && lastClick && (
                  <button type="button" onClick={onUndo} disabled={undoBusy}
                    title={`Admins only — takes back: ${describeStepClick(lastClick)}`}
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
            {steps.map(s => <StepRow key={s.stepNo} step={s} now={now} roster={roster} onEdit={() => openStepEditor(s)} />)}
          </div>

          {/* Dispatch entries */}
          <div className="px-4 py-3">
            <div className="font-mono text-[8.5px] font-bold uppercase tracking-[2px] text-red-mrt mb-2">Dispatch entries</div>
            {realEntries.length === 0 ? (
              <div className="text-[12px] text-g400">No dispatch entry yet.</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {realEntries.map(e => {
                  const pos = entryPosition(e);
                  const where = pos.column === 11 ? 'Done' : `Step ${pos.column} · ${stepDef(pos.column).title}`;
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
                      <button type="button" onClick={() => navigate(`/dispatch/new?entryId=${e.id}&from=board`)}
                        className="text-[11px] font-semibold text-red-mrt hover:underline shrink-0">Open →</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Remark + current step's buttons */}
        {(canActHere || orderCard?.column === 8) && orderCard && (
          <div className="border-t border-g200 px-4 py-3 flex flex-col gap-2 bg-cream">
            {canActHere && (
              <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2}
                placeholder="Remark (saved with the next button you press)"
                className="w-full font-sans text-[12.5px] text-blk bg-white border border-g300 rounded-[4px] p-[7px_9px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt resize-none" />
            )}
            {canActHere && <StepActionButtons card={orderCard} busy={busy} onAction={act} onResume={resume} />}
            {orderCard.column === 8 && (
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
