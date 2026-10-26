import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, List, Rows3, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../store';
import { Badge, Button } from '../components/ui';
import { customerOfDoc, canDeleteRecords, formatINR, fmtIST, doerLabel, siteLabel, resolveAdjustments, maxItemGstRate, normalizeSearchText, totalRemaining, remainingByLine, canActOnDispatchBoard, punchedAtClass } from '../lib/utils';
import { Order, DispatchEntry, DispatchFulfillmentType } from '../lib/types';
import { buildBoard, mapStepFromDB, mapLinkedDOFromDB, LinkedDO, step6AlreadyEmailed, stepDef, lastStepClick, describeStepClick, BoardCard, BoardOrderCard, BoardEntryCard, DispatchStepRecord, LastStepClick, StepAction, StepNo, DONE_COLUMN, entryPosition, unionBoardRows } from '../lib/dispatchFlow';
import { saveEntryStepRows } from '../lib/dispatchEntrySteps';
import { DispatchBoard, DeliveredOrderRow, StepActionButtons, UndoLink } from '../components/DispatchBoard';
import { LineItemsPanel } from '../components/LineItemsPanel';
import { DispatchLineItemsPanel } from '../components/DispatchLineItemsPanel';
import { thCls, thRightCls, isImportedEntry, SoCell, DispatchEntryHeadCells, DispatchEntryCells, DispatchEntryActions } from '../components/DispatchEntryCells';
import { DispatchDrawer, StepEditPatch } from '../components/DispatchDrawer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { friendlyDeleteError } from '../lib/cascadeDelete';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';

type SubType = DispatchFulfillmentType | 'not_set';
type DispatchTab = 'pending' | 'dispatched' | 'emailSent';

const pillCls = (active: boolean) => `px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${active ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`;

const fulfillmentLabel = (t: SubType) => t === 'self_pickup' ? 'Self Pickup' : t === 'delivery' ? 'Delivery' : 'Not Set';


// 'active' / 'delayed' pills were removed — an old ?pill= value falls back to All.
const BOARD_PILLS = ['all', 'hold', 'partial', 'delivered'] as const;
type BoardPill = typeof BOARD_PILLS[number];

export function Dispatch() {
  const navigate = useNavigate();
  const { data, user, deleteDispatchEntry, ensureSoNumbers, isReadOnlyUser, removeOrderFromDispatch, openDetailPanel } = useAppStore();
  const canDelete = canDeleteRecords(user?.email);

  // Initial tab/pill come from the URL (?tab=pending|dispatched|emailSent
  // &type=delivery|self_pickup) — NewDispatchEntry.tsx sends the user back
  // here that way after Save / Email to Client so they land on the entry
  // they just made. Anything else (incl. the retired ?tab=toDispatch)
  // falls back to Pending.
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<DispatchTab>(() => {
    const t = searchParams.get('tab');
    return t === 'dispatched' || t === 'emailSent' ? t : 'pending';
  });
  const [subType, setSubType] = useState<DispatchFulfillmentType>(() =>
    searchParams.get('type') === 'self_pickup' ? 'self_pickup' : 'delivery');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Order Pending for Dispatch: All, or only orders already partly dispatched
  // (?pending=partial in the URL).
  const [pendingFilter, setPendingFilter] = useState<'all' | 'partial'>(() => searchParams.get('pending') === 'partial' ? 'partial' : 'all');

  // Table (this page as it always was) vs the Kanban Board view — kept in
  // the URL as ?view=board so a refresh stays on the board.
  const [view, setView] = useState<'table' | 'board'>(() => searchParams.get('view') === 'board' ? 'board' : 'table');
  // Opens on All. ?pill=… (e.g. Back from an entry opened in List →
  // Delivered) picks another; anything unknown falls back to All.
  const [boardFilter, setBoardFilter] = useState<BoardPill>(() => {
    const p = searchParams.get('pill');
    return BOARD_PILLS.includes(p as BoardPill) ? p as BoardPill : 'all';
  });
  const [boardType, setBoardType] = useState<'both' | DispatchFulfillmentType>('both');
  // Board timers ("Due in 12 min", "Late by 1h 20m") re-evaluate every minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (view !== 'board') return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, [view]);

  // Board step history (dispatch_steps — steps 1–7 only; 8–10 come from the
  // dispatch entries themselves). Loaded when the board opens and refreshed
  // on the same 1-minute tick, so clicks made by someone else show up
  // without a page reload.
  const [stepRecords, setStepRecords] = useState<DispatchStepRecord[]>([]);
  // 2026-10-16: DOs (Outward entries) linked to an order — loaded on the same
  // tick, so a Step 6 card knows its DO is saved but not emailed yet.
  const [linkedDOs, setLinkedDOs] = useState<LinkedDO[]>([]);
  useEffect(() => {
    if (view !== 'board') return;
    supabase.from('dispatch_steps').select('*').then(({ data: rows, error }) => {
      if (error) { console.error('Error loading dispatch steps:', error); return; }
      setStepRecords((rows || []).map(mapStepFromDB));
    });
    supabase.from('stock_movements').select('id, do_number, order_id, dispatch_round, email_sent_at').not('order_id', 'is', null)
      .then(({ data: rows, error }) => {
        if (error) { console.error('Error loading linked DOs:', error); return; }
        setLinkedDOs((rows || []).map(mapLinkedDOFromDB));
      });
  }, [view, now]);

  // Done / Hold / Resume on steps 1–7: Samata (mum@) + ADMIN_EMAILS only;
  // everyone else sees the board read-only. Never changes an order's status.
  const canActOnBoard = canActOnDispatchBoard(user?.email) && !isReadOnlyUser;
  const [busyCardKey, setBusyCardKey] = useState<string | null>(null);
  const stepLogLabel = (o: Order, stepNo: number, what: string) =>
    `${o.soNumber || o.id} · Step ${stepNo} ${stepDef(stepNo as StepNo).title} · ${what}`;

  const runStepAction = async (card: BoardOrderCard, action: StepAction, remark?: string) => {
    if (!canActOnBoard || busyCardKey) return;
    setBusyCardKey(card.key);
    try {
      const nowIso = new Date().toISOString();
      const rows = action.writes.map((w, i) => ({
        order_id: card.order.id,
        round: card.position.round,
        step_no: w.stepNo,
        status: w.status,
        planned_at: w.stepNo === card.position.step ? card.position.plannedAt ?? null : null,
        // A hold's done_at is filled in later, when it's resumed.
        done_at: w.status === 'hold' ? null : nowIso,
        done_by: user?.email ?? null,
        remark: i === 0 && remark?.trim() ? remark.trim() : null,
      }));
      const { data: inserted, error } = await supabase.from('dispatch_steps').insert(rows).select('*');
      if (error) throw error;
      setStepRecords(prev => [...prev, ...(inserted || []).map(mapStepFromDB)]);
      for (const row of inserted || []) {
        const what = row.status === 'done' ? `Done (${action.label})` : row.status === 'skipped' ? 'Skipped' : 'On hold';
        logActivity({ module: 'dispatch_steps', recordId: card.order.id, recordLabel: stepLogLabel(card.order, row.step_no, what), action: 'insert', after: row });
      }
    } catch (err: any) {
      alert(`Could not save: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setBusyCardKey(null);
    }
  };

  // 2026-10-22: Steps 8–10 of ONE dispatch entry are manual — "Invoice done"
  // / "LR received" / "Documents sent" save a dispatch_steps row with
  // entry_id. Steps 8 and 9 need the entry's invoice no. / LR file: checked
  // (in saveEntryStepRows) against the entry as saved in the database right
  // now, and again by the database itself (trigger
  // enforce_dispatch_entry_step_prereqs) —
  // either refusal shows the same message and saves nothing.
  const runEntryStepAction = async (card: BoardEntryCard, action: StepAction, remark?: string) => {
    if (!canActOnBoard || busyCardKey) return;
    const e = card.entry;
    setBusyCardKey(card.key);
    try {
      // Prereq check, round, planned time, insert + activity log — shared
      // with the entry page's Step 8 auto-complete (saveEntryStepRows).
      const inserted = await saveEntryStepRows({
        entry: e, entries: data.dispatchEntries, records: stepRecords, action, remark,
        doneBy: user?.email ?? null,
        orderLabel: card.order ? (card.order.soNumber || card.order.id) : e.orderId,
      });
      setStepRecords(prev => [...prev, ...inserted.map(mapStepFromDB)]);
    } catch (err: any) {
      // The database's own refusal ("Add invoice no. first" / "Upload LR
      // first") comes through here as the error message.
      showToast('err', err?.message || `Could not save: ${JSON.stringify(err)}`);
    } finally {
      setBusyCardKey(null);
    }
  };

  const resumeHold = async (card: BoardOrderCard, remark?: string) => {
    const hold = card.position.hold?.record;
    if (!canActOnBoard || busyCardKey || !hold) return;
    setBusyCardKey(card.key);
    try {
      const resumedAt = new Date().toISOString();
      const patch: Record<string, any> = { done_at: resumedAt, done_by: user?.email ?? null };
      if (remark?.trim()) patch.remark = [hold.remark, remark.trim()].filter(Boolean).join(' · ');
      const { error } = await supabase.from('dispatch_steps').update(patch).eq('id', hold.id);
      if (error) throw error;
      setStepRecords(prev => prev.map(r => r.id === hold.id ? { ...r, doneAt: resumedAt, doneBy: patch.done_by ?? undefined, remark: patch.remark ?? r.remark } : r));
      logActivity({
        module: 'dispatch_steps', recordId: card.order.id, recordLabel: stepLogLabel(card.order, hold.stepNo, 'Resumed'),
        action: 'update', before: { status: 'hold', resumed_at: null }, after: { status: 'resumed', resumed_at: resumedAt },
      });
    } catch (err: any) {
      alert(`Could not resume: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setBusyCardKey(null);
    }
  };

  // 2026-10-16: every DO of the round is already emailed but there's no Step 6
  // row (emailed by a login without board access, or Step 6 was undone) —
  // "Mark Step 6 done (DO already emailed)" writes the same row the Outward
  // form's markDispatchStepDone writes on email, timed at the latest DO email,
  // with the same "already marked" check. No email is sent.
  const markStep6DoneFromEmail = async (card: BoardOrderCard, remark?: string) => {
    const p = card.doPending;
    if (!canActOnBoard || busyCardKey || !p || !step6AlreadyEmailed(card)) return;
    setBusyCardKey(card.key);
    try {
      const { data: already, error: checkErr } = await supabase.from('dispatch_steps').select('*')
        .eq('order_id', card.order.id).eq('round', card.position.round).eq('step_no', 6).eq('status', 'done').limit(1);
      if (checkErr) throw checkErr;
      if (already && already.length > 0) {
        // Someone already marked it — just catch up with that row.
        const rec = mapStepFromDB(already[0]);
        setStepRecords(prev => prev.some(r => r.id === rec.id) ? prev : [...prev, rec]);
        return;
      }
      const latest = p.dos.map(d => d.emailSentAt).filter((v): v is string => !!v)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime()).pop();
      const { data: inserted, error } = await supabase.from('dispatch_steps').insert({
        order_id: card.order.id,
        round: card.position.round,
        step_no: 6,
        status: 'done',
        planned_at: card.position.plannedAt ?? null,
        done_at: latest ?? new Date().toISOString(),
        done_by: user?.email ?? null,
        remark: remark?.trim() || null,
      }).select('*');
      if (error) throw error;
      setStepRecords(prev => [...prev, ...(inserted || []).map(mapStepFromDB)]);
      const doNos = p.dos.map(d => d.doNumber || '—').join(', ');
      logActivity({
        module: 'dispatch_steps', recordId: card.order.id,
        recordLabel: stepLogLabel(card.order, 6, `Done (DO ${doNos} already emailed)`),
        action: 'insert', after: inserted?.[0],
      });
    } catch (err: any) {
      alert(`Could not save: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setBusyCardKey(null);
    }
  };

  // 2026-10-05: Step 6 "DO issued ✓" no longer marks the step done straight
  // away — the Stock Movements Outward form has to be saved first.
  // 2026-10-06: that form now opens as a normal FULL PAGE (like New Enquiry)
  // instead of a popup over the board. We only navigate here; the page
  // (NewStockOutward.tsx, ?fromDispatch=1) prefills itself from the order.
  // Back/Cancel there = nothing changes.
  // 2026-10-16: saving the DO no longer completes Step 6 — EMAILING it does
  // (the form writes the Step 6 row then). Once a DO is saved for this round
  // (card.doPending) the button becomes "Open DO → Email to Client" and
  // opens that DO in edit mode instead of a new one.
  const handleStepAction = (card: BoardOrderCard, action: StepAction, remark?: string) => {
    if (card.position.step === 6 && action.primary) {
      if (!canActOnBoard || busyCardKey) return;
      if (step6AlreadyEmailed(card)) return markStep6DoneFromEmail(card, remark);
      const params = new URLSearchParams({
        ...(card.doPending ? { movementId: card.doPending.open.id } : {}),
        fromDispatch: '1',
        orderRef: card.order.id,
        round: String(card.position.round),
        plannedAt: card.position.plannedAt || '',
      });
      // Remark typed in the drawer travels along, so it is still saved on the step.
      if (remark?.trim()) params.set('remark', remark.trim());
      // 2026-10-12: Step 6 now runs for Self Pickup too — the form opens with
      // Fulfilment Type already set to Self Pickup.
      if (card.fulfillment === 'self_pickup') params.set('fulfilment', 'self_pickup');
      navigate(`/stock-movements/new-outward?${params.toString()}`);
      return;
    }
    return runStepAction(card, action, remark);
  };

  // 2026-10-06: step buttons are shown to every login; canAct decides whether
  // they can be clicked (disabled + tooltip otherwise). The guards inside
  // runStepAction / resumeHold / handleStepAction stay as the real lock.
  // 2026-10-13: an order card also gets a small "↶ Undo" link under its step
  // buttons — only for logins allowed to undo, and only when the order has a
  // last step click to take back.
  const renderBoardActions = (card: BoardCard) => card.kind === 'order' ? (
    <>
      <StepActionButtons card={card} busy={busyCardKey === card.key} canAct={canActOnBoard} onAction={handleStepAction} onResume={resumeHold} />
      {canUndoOnBoard && ordersWithUndo.has(card.order.id) && <UndoLink busy={undoBusy} onUndo={() => requestUndo(card.order)} />}
    </>
  ) : null;

  // "Undo last step" (card link + drawer button): takes back the order's most
  // recent step 1–7 click — deletes that click's dispatch_steps rows, or
  // un-resumes a resumed hold. Only dispatch_steps is touched; never dispatch
  // entries, the order, its status, or a Step 6 Outward entry (DO).
  // 2026-10-13: was ADMIN_EMAILS only — now everyone who can click the step
  // buttons (canActOnDispatchBoard, not the read-only login).
  const canUndoOnBoard = canActOnBoard;
  const ordersWithUndo = useMemo(() => {
    const byOrder = new Map<string, DispatchStepRecord[]>();
    for (const r of stepRecords) {
      const list = byOrder.get(r.orderId) || [];
      list.push(r);
      byOrder.set(r.orderId, list);
    }
    return new Set([...byOrder].filter(([, recs]) => lastStepClick(recs)).map(([id]) => id));
  }, [stepRecords]);
  // Step 6 "DO issued ✓" also saved an Outward entry (the DO), which reduced
  // stock. Undo removes ONLY the Step 6 dispatch_steps row — never the
  // stock_movements row, stock_lots or the DO number.
  const undoesStep6Do = (click: LastStepClick) =>
    click.kind === 'delete' && click.rows.some(r => r.stepNo === 6 && r.status === 'done');
  const [undoBusy, setUndoBusy] = useState(false);
  // The click waiting in the in-app confirm box (Cancel = nothing changes).
  const [undoTarget, setUndoTarget] = useState<{ order: Order; click: LastStepClick } | null>(null);
  // `click` given (drawer) = exactly that click — for an entry row, its last
  // Step 8–10 click; otherwise the order's last Step 1–7 click.
  const requestUndo = (order: Order, click?: LastStepClick) => {
    if (!canUndoOnBoard || undoBusy) return;
    const target = click ?? lastStepClick(stepRecords.filter(r => r.orderId === order.id));
    if (target) setUndoTarget({ order, click: target });
  };
  const confirmUndo = async () => {
    if (!undoTarget || !canUndoOnBoard || undoBusy) return;
    const { order, click } = undoTarget;
    const what = describeStepClick(click);
    setUndoBusy(true);
    try {
      // A Step 6 undo leaves the Outward entry (DO) and the stock alone — the log says so.
      const label = undoesStep6Do(click)
        ? `${order.soNumber || order.id} · Undo · Step 6 ${stepDef(6).title} — DO not deleted`
        : `${order.soNumber || order.id} · Undo · ${what}`;
      if (click.kind === 'delete') {
        const ids = click.rows.map(r => r.id);
        const { data: deleted, error } = await supabase.from('dispatch_steps').delete().in('id', ids).select('id');
        if (error) throw error;
        if ((deleted || []).length !== ids.length) throw new Error('The step could not be removed (it may already have been undone). Refresh and try again.');
        setStepRecords(prev => prev.filter(r => !ids.includes(r.id)));
        logActivity({ module: 'dispatch_steps', recordId: order.id, recordLabel: label, action: 'delete', before: { undone: click.rows } });
      } else {
        const { data: updated, error } = await supabase.from('dispatch_steps').update({ done_at: null }).eq('id', click.row.id).select('id');
        if (error) throw error;
        if ((updated || []).length !== 1) throw new Error('The resume could not be undone. Refresh and try again.');
        setStepRecords(prev => prev.map(r => r.id === click.row.id ? { ...r, doneAt: undefined } : r));
        logActivity({
          module: 'dispatch_steps', recordId: order.id, recordLabel: label,
          action: 'update', before: { status: 'resumed', resumed_at: click.at }, after: { status: 'hold', resumed_at: null },
        });
      }
    } catch (err: any) {
      alert(`Undo failed: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setUndoBusy(false);
      setUndoTarget(null);
    }
  };

  // Detail drawer — opened by clicking an SO No. on any board card (order
  // or entry card); always shows the whole order. The clicked card is kept
  // because the drawer's Edit / Delete act on it (the order, or that entry).
  const [drawerCard, setDrawerCard] = useState<BoardCard | null>(null);
  const drawerOrderId = drawerCard ? (drawerCard.kind === 'order' ? drawerCard.order.id : drawerCard.entry.orderId) : null;
  const openDrawer = (card: BoardCard) => setDrawerCard(card);
  const closeDrawer = useCallback(() => setDrawerCard(null), []);

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  // ✎ Step edit (all users) — one dispatch_steps row: status, actual time
  // (done_at) and remark. Planned is always recalculated, never stored here.
  // The board, drawer and step counts all recalculate from stepRecords.
  const saveStepEdit = async (order: Order, rec: DispatchStepRecord, patch: StepEditPatch) => {
    const row = { status: patch.status, done_at: patch.doneAt, remark: patch.remark };
    const { data: updated, error } = await supabase.from('dispatch_steps').update(row).eq('id', rec.id).select('*');
    if (error) throw error;
    if (!updated || updated.length === 0) throw new Error("Nothing was saved — the step may have been removed, or you don't have permission.");
    setStepRecords(prev => prev.map(r => r.id === rec.id ? mapStepFromDB(updated[0]) : r));
    logActivity({
      module: 'dispatch_steps', recordId: order.id, recordLabel: stepLogLabel(order, rec.stepNo, 'Edited'),
      action: 'update',
      before: { status: rec.status, done_at: rec.doneAt ?? null, remark: rec.remark ?? null },
      after: row,
    });
    showToast('ok', `Step ${rec.stepNo} updated.`);
  };

  // DELETE (admins only — same canDeleteRecords as Enquiries / Quotes /
  // Orders). Order card → taken off the board (never deleted from Orders);
  // entry card → that one dispatch entry, and its round restarts from its
  // first step (see deleteDispatchEntry in the store).
  // Where the order restarts: Step 1 if this is its first real dispatch,
  // else Step 5 (later rounds). Imported entries aren't rounds → undefined.
  const restartStepOf = (entry: DispatchEntry): number | undefined => {
    if (isImportedEntry(entry)) return undefined;
    const earlier = data.dispatchEntries.filter(e => e.orderId === entry.orderId && e.id !== entry.id && !isImportedEntry(e)
      && new Date(e.created_at || 0).getTime() < new Date(entry.created_at || 0).getTime());
    return earlier.length ? 5 : 1;
  };
  const deleteConfirmText = (entry: DispatchEntry) => {
    const step = restartStepOf(entry);
    return step ? `Delete this dispatch? The order will restart from Step ${step}. SO No. and Order Ref will stay the same.`
      : 'Delete this dispatch? This cannot be undone.';
  };
  // Drops the reset round's step rows from the board's local copy.
  const afterEntryDeleted = (deletedSteps: any[], restartStep?: number) => {
    const ids = new Set(deletedSteps.map(r => r.id));
    if (ids.size) setStepRecords(prev => prev.filter(r => !ids.has(r.id)));
    return restartStep ? ` The order restarts from Step ${restartStep}.` : '';
  };
  const [deleteCard, setDeleteCard] = useState<BoardCard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestDelete = (card: BoardCard) => {
    if (!canDelete) return;
    if (card.kind === 'order') {
      const n = data.dispatchEntries.filter(e => e.orderId === card.order.id).length;
      if (n > 0) { showToast('err', `This order has ${n} dispatch entr${n === 1 ? 'y' : 'ies'}. Delete those entries first.`); return; }
    }
    setDeleteCard(card);
  };
  const confirmDelete = async () => {
    if (!deleteCard || !canDelete) return;
    setDeleting(true);
    try {
      if (deleteCard.kind === 'order') {
        const o = deleteCard.order;
        await removeOrderFromDispatch(o.id);
        setStepRecords(prev => prev.filter(r => r.orderId !== o.id));
        showToast('ok', `${o.soNumber || o.id} removed from the Dispatch board. It stays in Orders.`);
      } else {
        const e = deleteCard.entry;
        const { deletedSteps, restartStep } = await deleteDispatchEntry(e.id);
        showToast('ok', `Dispatch entry ${e.invoiceNumber || e.id} deleted.${afterEntryDeleted(deletedSteps, restartStep)}`);
      }
      setDeleteCard(null);
      setDrawerCard(null);
    } catch (err) {
      setDeleteCard(null);
      showToast('err', `Delete failed: ${friendlyDeleteError(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  // Table → Email Sent / Dispatched Delete button — also used by List → Delivered.
  const deleteEntryWithConfirm = async (entry: DispatchEntry) => {
    if (!canDelete) return;
    if (!confirm(deleteConfirmText(entry))) return;
    try {
      const { deletedSteps, restartStep } = await deleteDispatchEntry(entry.id);
      afterEntryDeleted(deletedSteps, restartStep);
    } catch (err: any) {
      alert(`Delete failed: ${err?.message || JSON.stringify(err)}`);
    }
  };

  // List → Delivered: a row click expands its Dispatch Line Items (like
  // Table → Email Sent); Edit opens the entry form, whose Back / Save return
  // to List → Delivered (from=board&pill=delivered).
  const openEntryForm = (entry: DispatchEntry) => navigate(`/dispatch/new?entryId=${entry.id}&from=board&pill=delivered`);
  const openDeliveredCard = (card: BoardCard) => card.kind === 'entry' ? openEntryForm(card.entry) : openDrawer(card);
  // The Table's Actions cell (Edit / Delete side by side + doer name).
  const deliveredEntryActions = (card: BoardEntryCard) => {
    const entry = card.entry;
    const by = entry.updatedBy || entry.createdBy;
    return (
      <DispatchEntryActions
        onEdit={() => openEntryForm(entry)}
        onDelete={canDelete ? () => deleteEntryWithConfirm(entry) : undefined}
        doer={by ? doerLabel(by, data.roster) : undefined}
        centered />
    );
  };

  const orderFor = (entry: DispatchEntry): Order | undefined => data.orders.find(o => o.id === entry.orderId);

  // Order Pending for Dispatch — read-only view of every order that was
  // sent here (sentToDispatchAt — the "Order Pending for Dispatch" button
  // in Orders), is still Order Confirmed (or legacy Order Pending for
  // Dispatch), and still has barrels left to dispatch (totalRemaining > 0).
  // A partial dispatch keeps the same order here until every line has gone
  // out; each dispatch shows under "Dispatched" as its own entry. Nothing
  // here changes an order's status.
  const pendingOrders = useMemo(
    () => data.orders.filter(o => !!o.sentToDispatchAt && (o.status === 'Order Confirmed' || o.status === 'Order Pending for Dispatch') && totalRemaining(o, data.dispatchEntries) > 0),
    [data.orders, data.dispatchEntries],
  );
  // Shown in the Fulfillment column only (this tab has no Delivery/Self
  // Pickup split) — order's own type first, then the customer's typical
  // pattern, else "Not Set".
  const orderFulfillment = (o: Order): SubType => {
    if (o.fulfillmentType === 'delivery' || o.fulfillmentType === 'self_pickup') return o.fulfillmentType;
    const cf = customerOfDoc(o, data.customers)?.fulfilmentType;
    if (cf === 'Delivery') return 'delivery';
    if (cf === 'Self Pickup') return 'self_pickup';
    return 'not_set';
  };

  // Assign SO numbers to every order shown anywhere on this page that
  // doesn't have one yet — pending orders plus every order linked to a
  // dispatch entry (covers orders dispatched before SO numbers existed).
  // The ref keeps it from ever running twice at once; once a run's saves
  // land in local state, missingSoKey changes and the effect re-checks for
  // anything that appeared in the meantime.
  const soRunning = useRef(false);
  const missingSoKey = useMemo(() => {
    const ids = new Set(pendingOrders.filter(o => !o.soNumber).map(o => o.id));
    for (const e of data.dispatchEntries) {
      // Entries imported from old "Delivered" orders never get an SO number.
      if (isImportedEntry(e)) continue;
      const o = data.orders.find(x => x.id === e.orderId);
      if (o && !o.soNumber) ids.add(o.id);
    }
    return [...ids].sort().join(',');
  }, [pendingOrders, data.dispatchEntries, data.orders]);
  useEffect(() => {
    if (!missingSoKey || soRunning.current) return;
    soRunning.current = true;
    ensureSoNumbers(missingSoKey.split(','))
      .catch(err => console.error('ensureSoNumbers failed:', err))
      .finally(() => { soRunning.current = false; });
  }, [missingSoKey]);

  const entries = data.dispatchEntries;
  // Each entry lives in exactly one of the two entry tabs:
  //   emailSentAt set (Email to Client succeeded) → Email Sent
  //   else                                        → Dispatched
  // (the old "Order → Dispatch" stage is retired — an entry without sentAt
  // still lands in Dispatched, so no entry is ever hidden). Both share the
  // same Delivery/Self Pickup sub-split.
  const emailSentEntries = entries.filter(e => e.emailSentAt);
  const sentEntries = entries.filter(e => !e.emailSentAt);
  const activeEntries = tab === 'emailSent' ? emailSentEntries : sentEntries;
  const deliveryCount = activeEntries.filter(e => e.fulfillmentType === 'delivery').length;
  const selfPickupCount = activeEntries.filter(e => e.fulfillmentType === 'self_pickup').length;

  // Keep the URL in step so a refresh stays on the same tab/pill/view.
  const syncUrl = (t: DispatchTab, type: DispatchFulfillmentType, v: 'table' | 'board' = view, pf: 'all' | 'partial' = pendingFilter) =>
    setSearchParams({
      ...(t === 'pending' ? (pf === 'partial' ? { pending: 'partial' } : {}) : { tab: t, type }),
      ...(v === 'board' ? { view: 'board', ...(boardFilter !== 'all' ? { pill: boardFilter } : {}) } : {}),
    }, { replace: true });
  // List pills — kept in the URL (?pill=, none for All) so a refresh or
  // Back from an entry lands on the same pill.
  const switchBoardFilter = (f: BoardPill) => {
    setBoardFilter(f);
    const p = new URLSearchParams(searchParams);
    if (f === 'all') p.delete('pill'); else p.set('pill', f);
    setSearchParams(p, { replace: true });
  };
  const switchPendingFilter = (pf: 'all' | 'partial') => {
    setPendingFilter(pf);
    syncUrl(tab, subType, view, pf);
  };
  const switchTab = (t: DispatchTab) => {
    setTab(t);
    setExpandedRow(null);
    syncUrl(t, subType);
  };
  const switchSubType = (type: DispatchFulfillmentType) => {
    setSubType(type);
    syncUrl(tab, type);
  };
  const switchView = (v: 'table' | 'board') => {
    setView(v);
    syncUrl(tab, subType, v);
  };

  const qs = search.trim().toLowerCase();
  const orderMatches = (o: Order | undefined, fallbackId: string) => {
    if (!qs) return true;
    if (fallbackId.toLowerCase().includes(qs)) return true;
    if (!o) return false;
    return (o.soNumber || '').toLowerCase().includes(qs) ||
      normalizeSearchText(o.cust).includes(normalizeSearchText(qs)) ||
      (o.poNo || '').toLowerCase().includes(qs) ||
      o.items.some(i => (i.desc || '').toLowerCase().includes(qs));
  };

  // Barrels per pending order: ordered (sum of line qty), remaining
  // (totalRemaining) and dispatched (the difference). Display only.
  const pendingQty = useMemo(() => {
    const m = new Map<string, { ordered: number; dispatched: number; remaining: number }>();
    for (const o of pendingOrders) {
      const ordered = o.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
      const remaining = totalRemaining(o, data.dispatchEntries);
      m.set(o.id, { ordered, remaining, dispatched: Math.max(0, ordered - remaining) });
    }
    return m;
  }, [pendingOrders, data.dispatchEntries]);
  const isPartlyDispatched = (o: Order) => (pendingQty.get(o.id)?.dispatched ?? 0) > 0;

  // Search first; the All / Partly dispatched pill then narrows what's left
  // (its counts are shown before that last step).
  const searchedPending = useMemo(
    () => pendingOrders
      .filter(o => orderMatches(o, o.id))
      .sort((a, b) => (b.created_at || b.poDate || '').localeCompare(a.created_at || a.poDate || '')),
    [pendingOrders, qs],
  );
  const partlyDispatchedCount = searchedPending.filter(isPartlyDispatched).length;
  const visiblePending = pendingFilter === 'partial' ? searchedPending.filter(isPartlyDispatched) : searchedPending;

  const visibleEntries = useMemo(
    () => activeEntries
      .filter(e => e.fulfillmentType === subType && (orderMatches(orderFor(e), e.orderId) ||
        (e.invoiceNumber || '').toLowerCase().includes(qs)))
      // Email Sent: newest email first; Dispatched: newest entry first.
      .sort((a, b) => tab === 'emailSent'
        ? (b.emailSentAt || '').localeCompare(a.emailSentAt || '')
        : (b.created_at || '').localeCompare(a.created_at || '')),
    [activeEntries, subType, qs, data.orders, tab],
  );

  const rowCount = tab === 'pending' ? visiblePending.length : visibleEntries.length;
  // Email Sent adds "Email Sent On" — Dispatched: 10 columns, Email Sent: 11.
  const isEmailSentTab = tab === 'emailSent';
  const entryColCount = isEmailSentTab ? 11 : 10;

  // ── Board view ──────────────────────────────────────────────────────────
  const boardCards = useMemo(
    () => view === 'board' ? buildBoard(data.orders, data.dispatchEntries, stepRecords, orderFulfillment, now, linkedDOs) : [],
    [view, data.orders, data.dispatchEntries, data.customers, stepRecords, now, linkedDOs],
  );
  // List's Invoice No column: every invoice number (dispatch_entries.invoice_number,
  // filled at Step 08) per order id, oldest dispatch first.
  const boardInvoices = useMemo(() => {
    const m = new Map<string, string[]>();
    if (view !== 'board') return m;
    const sorted = [...data.dispatchEntries].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    for (const e of sorted) {
      if (!e.invoiceNumber) continue;
      const list = m.get(e.orderId) || [];
      list.push(e.invoiceNumber);
      m.set(e.orderId, list);
    }
    return m;
  }, [view, data.dispatchEntries]);
  const boardSearchMatch = (c: BoardCard) => {
    if (!qs) return true;
    const o = c.order;
    return (o?.soNumber || '').toLowerCase().includes(qs)
      || (c.kind === 'order' ? c.order.id : c.entry.orderId).toLowerCase().includes(qs)
      || (!!o && normalizeSearchText(o.cust).includes(normalizeSearchText(qs)))
      || (c.kind === 'entry' && (c.entry.invoiceNumber || '').toLowerCase().includes(qs))
      || (c.kind === 'order' && (boardInvoices.get(c.order.id) || []).some(inv => inv.toLowerCase().includes(qs)));
  };
  // List → Delivered (all time, separate from buildBoard, which keeps only
  // the last 7 days of Done and skips imported entries): one row per entry
  // whose email was sent OR whose order is marked Delivered (imported ones
  // included), plus one row per Delivered order that has no entry at all.
  const deliveredCards = useMemo<BoardEntryCard[]>(() => {
    if (view !== 'board') return [];
    const ordersById = new Map(data.orders.map(o => [o.id, o]));
    const out: BoardEntryCard[] = [];
    for (const e of data.dispatchEntries) {
      const order = ordersById.get(e.orderId);
      if (!e.emailSentAt && order?.status !== 'Delivered') continue;
      out.push({
        kind: 'entry', key: `d:${e.id}`, entry: e, order, position: entryPosition(e, stepRecords),
        column: DONE_COLUMN, fulfillment: e.fulfillmentType, state: 'done',
      });
    }
    return out;
  }, [view, data.orders, data.dispatchEntries, stepRecords]);
  // Entry ids in the Delivered list (all of it, before type/search) — a Done
  // row in any other List tab whose entry is here reads "Delivered".
  const deliveredEntryIds = useMemo(() => new Set(deliveredCards.map(c => c.entry.id)), [deliveredCards]);
  const deliveredOrderRows = useMemo<DeliveredOrderRow[]>(() => {
    if (view !== 'board') return [];
    const withEntry = new Set(data.dispatchEntries.map(e => e.orderId));
    return data.orders
      .filter(o => o.status === 'Delivered' && !withEntry.has(o.id))
      .map(o => ({ order: o, fulfillment: orderFulfillment(o) }));
  }, [view, data.orders, data.dispatchEntries, data.customers]);

  // Barrels per order shown on the List — same numbers as pendingQty above
  // (Order Pending for Dispatch). Entry rows show their order's numbers.
  const boardQty = useMemo(() => {
    const m = new Map<string, { ordered: number; dispatched: number; remaining: number }>();
    const add = (o: Order | undefined) => {
      if (!o || m.has(o.id)) return;
      const ordered = o.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
      const remaining = totalRemaining(o, data.dispatchEntries);
      m.set(o.id, { ordered, remaining, dispatched: Math.max(0, ordered - remaining) });
    };
    for (const c of [...boardCards, ...deliveredCards]) {
      add(c.kind === 'order' ? c.order : c.order ?? data.orders.find(x => x.id === c.entry.orderId));
    }
    for (const r of deliveredOrderRows) add(r.order);
    return m;
  }, [boardCards, deliveredCards, deliveredOrderRows, data.dispatchEntries]);
  // Type + search narrow everything; the pills then filter what's left
  // (their counts are shown before that last step).
  // Order rows only, already partly dispatched — the Table's "Partially Dispatched".
  const isBoardPartial = (c: BoardCard) => {
    if (c.kind !== 'order') return false;
    const q = boardQty.get(c.order.id);
    return !!q && q.dispatched > 0 && q.remaining > 0;
  };
  const boardBase = boardCards.filter(c => (boardType === 'both' || c.fulfillment === boardType) && boardSearchMatch(c));
  const boardHoldCount = boardBase.filter(c => c.state === 'hold').length;
  const boardPartialCount = boardBase.filter(isBoardPartial).length;
  const deliveredBase = deliveredCards.filter(c => (boardType === 'both' || c.fulfillment === boardType) && boardSearchMatch(c));
  const deliveredOrdersBase = deliveredOrderRows.filter(r => (boardType === 'both' || r.fulfillment === boardType) && (!qs
    || (r.order.soNumber || '').toLowerCase().includes(qs)
    || r.order.id.toLowerCase().includes(qs)
    || normalizeSearchText(r.order.cust).includes(normalizeSearchText(qs))));
  const boardDeliveredCount = deliveredBase.length + deliveredOrdersBase.length;
  const delayedRows = boardBase.filter(c => c.state === 'late');
  const holdRows = boardBase.filter(c => c.state === 'hold');
  const partialRows = boardBase.filter(isBoardPartial);
  // All = union of every row list, each order/entry once; a row that is in
  // an active list and in Delivered keeps its active version. Active
  // (boardBase) and Delayed no longer have pills but still feed All.
  const allRows = unionBoardRows([boardBase, delayedRows, holdRows, partialRows, deliveredBase], deliveredOrdersBase);
  const boardAllCount = allRows.cards.length + allRows.deliveredOrders.length;
  const boardVisible = boardFilter === 'hold' ? holdRows
    : boardFilter === 'partial' ? partialRows
    : boardFilter === 'delivered' ? deliveredBase
    : allRows.cards;
  const boardVisibleDeliveredOrders = boardFilter === 'delivered' ? deliveredOrdersBase
    : boardFilter === 'all' ? allRows.deliveredOrders
    : undefined;
  // Header count boxes — follow the selected pill (and type/search).
  const headerCounts = {
    inProgress: boardVisible.filter(c => c.column !== DONE_COLUMN).length,
    delayed: boardVisible.filter(c => c.state === 'late').length,
    onHold: boardVisible.filter(c => c.state === 'hold').length,
    emailSent: boardVisible.filter(c => c.column === DONE_COLUMN && c.kind === 'entry' && !!c.entry.emailSentAt).length,
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Module 04</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Dispatch <em className="italic text-red-mrt">Control</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">Every confirmed order, stage by stage — split by how it leaves the warehouse.</p>
          </div>
          {view === 'board' && (
            <div className="flex items-stretch gap-2 shrink-0">
              {([
                ['In progress', headerCounts.inProgress, 'bg-white text-blk'],
                ['Delayed', headerCounts.delayed, 'bg-[#FFEBEE] text-[#9A0000]'],
                ['On hold', headerCounts.onHold, 'bg-white text-blk'],
                ['Email sent', headerCounts.emailSent, 'bg-[#E8F5E9] text-[#0B5C2A]'],
              ] as const).map(([label, count, cls]) => (
                <div key={label} className={`border border-g200 rounded-[6px] px-3 py-1.5 min-w-[92px] ${cls}`}>
                  <div className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase opacity-80">{label}</div>
                  <div className="text-[22px] font-bold leading-tight">{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2.5 mt-4 bg-white border-b border-g200 flex-wrap">
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <div onClick={() => switchView('table')} className={`flex items-center gap-1.5 ${pillCls(view === 'table')}`}>
            <List size={12} /> Table
          </div>
          <div onClick={() => switchView('board')} className={`flex items-center gap-1.5 ${pillCls(view === 'board')}`}>
            <Rows3 size={12} /> List
          </div>
        </div>
        <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>

        {view === 'board' ? (
          <>
            <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
              <div onClick={() => switchBoardFilter('all')} className={pillCls(boardFilter === 'all')}>All ({boardAllCount})</div>
              <div onClick={() => switchBoardFilter('hold')} className={pillCls(boardFilter === 'hold')}>On hold ({boardHoldCount})</div>
              <div onClick={() => switchBoardFilter('partial')} className={pillCls(boardFilter === 'partial')}>Partially Dispatched ({boardPartialCount})</div>
              <div onClick={() => switchBoardFilter('delivered')} className={pillCls(boardFilter === 'delivered')}>Delivered ({boardDeliveredCount})</div>
            </div>
            <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
            <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
              <div onClick={() => setBoardType('both')} className={pillCls(boardType === 'both')}>Both</div>
              <div onClick={() => setBoardType('delivery')} className={`flex items-center gap-1.5 ${pillCls(boardType === 'delivery')}`}>
                <span className="w-[7px] h-[7px] rounded-full bg-[#2563EB] shrink-0" /> Delivery
              </div>
              <div onClick={() => setBoardType('self_pickup')} className={`flex items-center gap-1.5 ${pillCls(boardType === 'self_pickup')}`}>
                <span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED] shrink-0" /> Self Pickup
              </div>
            </div>
            <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
            <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[220px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
              <Search size={11} className="text-g400 shrink-0" />
              <input
                type="text"
                placeholder="SO No, Order Ref, company, invoice…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
              />
            </div>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-g600 whitespace-nowrap">
              <span className="inline-flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-full bg-[#107E3E]" />On time</span>
              <span className="inline-flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-full bg-[#E9730C]" />Due within 1h</span>
              <span className="inline-flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-full bg-[#BB0000]" />Delayed</span>
            </div>
          </>
        ) : (<>
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <div onClick={() => switchTab('pending')} className={pillCls(tab === 'pending')}>
            Order Pending for Dispatch ({pendingOrders.length})
          </div>
          <div onClick={() => switchTab('dispatched')} className={pillCls(tab === 'dispatched')}>
            Dispatched ({sentEntries.length})
          </div>
          <div onClick={() => switchTab('emailSent')} className={pillCls(tab === 'emailSent')}>
            Email Sent ({emailSentEntries.length})
          </div>
        </div>

        {tab !== 'pending' && (
          <>
            <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
            <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
              <div onClick={() => switchSubType('delivery')} className={`flex items-center gap-1.5 ${pillCls(subType === 'delivery')}`}>
                <span className="w-[7px] h-[7px] rounded-full bg-sN shrink-0" /> Delivery ({deliveryCount})
              </div>
              <div onClick={() => switchSubType('self_pickup')} className={`flex items-center gap-1.5 ${pillCls(subType === 'self_pickup')}`}>
                <span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED] shrink-0" /> Self Pickup ({selfPickupCount})
              </div>
            </div>
          </>
        )}

        <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[200px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="SO No, Order Ref, company, PO No, item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        {tab === 'pending' && (
          <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
            <div onClick={() => switchPendingFilter('all')} className={pillCls(pendingFilter === 'all')}>All ({searchedPending.length})</div>
            <div onClick={() => switchPendingFilter('partial')} className={pillCls(pendingFilter === 'partial')}>Partially Dispatched ({partlyDispatchedCount})</div>
          </div>
        )}

        <div className="ml-auto font-mono text-[10px] text-g500">
          {tab === 'pending' ? `${rowCount} order(s)` : `${rowCount} entr${rowCount === 1 ? 'y' : 'ies'}`}
        </div>
        </>)}
      </div>

      {view === 'board' ? (
        <DispatchBoard cards={boardVisible} qty={boardQty} invoices={boardInvoices} deliveredOrders={boardVisibleDeliveredOrders} deliveredEntryIds={deliveredEntryIds} now={now}
          onOpen={boardFilter === 'delivered' ? openDeliveredCard : openDrawer}
          entryActions={boardFilter === 'delivered' ? deliveredEntryActions : undefined}
          renderExpanded={boardFilter === 'delivered' ? (c => <DispatchLineItemsPanel entry={c.entry} order={c.order} />) : undefined}
          onOpenDeliveredOrder={boardFilter === 'delivered' ? (o => openDetailPanel('order', o.id)) : undefined}
          renderActions={renderBoardActions} onDelete={canDelete ? requestDelete : undefined} />
      ) : (
      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="bg-white border border-g200 overflow-x-auto m-0">
          {tab === 'pending' ? (
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-g100">
                <tr>
                  <th className={thCls}>SO No.</th>
                  <th className={thCls}>Order Ref</th>
                  <th className={thCls}>Customer - Unit</th>
                  <th className={thCls}>PO Number</th>
                  <th className={thCls}>PO Date</th>
                  <th className={thCls}>Schedule Date</th>
                  <th className={thCls}>Items</th>
                  <th className={thRightCls}>Ordered</th>
                  <th className={thRightCls}>Dispatched</th>
                  <th className={thRightCls}>Remaining</th>
                  <th className={thRightCls}>Order Value</th>
                  <th className={thCls}>Fulfillment</th>
                  <th className={thCls}>Punched At</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePending.length === 0 ? (
                  <tr><td colSpan={15} className="text-center p-8 text-g400 text-[13px]">
                    {qs ? 'No matching orders' : pendingFilter === 'partial' ? 'No partially dispatched orders' : 'No confirmed orders pending for dispatch'}
                  </td></tr>
                ) : (
                  visiblePending.map(o => {
                    const subTotal = o.items.reduce((s, i) => s + i.total, 0);
                    const itemGst = o.items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
                    const grandTotal = resolveAdjustments(o.adjustments, subTotal, itemGst, maxItemGstRate(o.items)).grand;
                    const isExpanded = expandedRow === o.id;
                    const sl = siteLabel(customerOfDoc(o, data.customers), o.siteId || data.enquiries.find(e => e.id === o.enqRef)?.siteId);
                    const qty = pendingQty.get(o.id) ?? { ordered: 0, dispatched: 0, remaining: 0 };
                    return (
                      <React.Fragment key={o.id}>
                        <tr
                          className={`group transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sW/5 ${isExpanded ? 'bg-sW/5' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : o.id)}
                        >
                          <td className="px-[13px] py-[10px] align-top whitespace-nowrap"><SoCell soNumber={o.soNumber} hasOrder /></td>
                          <td className="px-[13px] py-[10px] align-top whitespace-nowrap"><span className="font-mono text-[10px] font-bold text-sQ">{o.id}</span></td>
                          <td className="px-[13px] py-[10px] align-top">
                            <div className="font-semibold">{o.cust}{sl ? <span className="font-normal text-g500"> — {sl}</span> : null}</div>
                          </td>
                          <td className="px-[13px] py-[10px] align-top font-mono text-[11px] font-bold text-g700">{o.poNo || '—'}</td>
                          <td className="px-[13px] py-[10px] align-top text-[11.5px] text-g600 whitespace-nowrap">
                            {o.poDate ? fmtIST(new Date(o.poDate), 'dd-MMM-yyyy') : '--'}
                          </td>
                          <td className="px-[13px] py-[10px] align-top text-[11.5px] text-g600 whitespace-nowrap">
                            {o.scheduleDate ? fmtIST(new Date(o.scheduleDate), 'dd-MMM-yyyy') : '--'}
                          </td>
                          <td className="px-[13px] py-[10px] align-top">
                            <span className="font-mono text-[10px] font-bold bg-g100 text-g600 px-[7px] py-[2px] rounded-full inline-flex items-center">
                              {o.items.length} item(s)
                            </span>
                          </td>
                          <td className="px-[13px] py-[10px] align-top text-right font-mono text-[12px]">{qty.ordered}</td>
                          <td className="px-[13px] py-[10px] align-top text-right font-mono text-[12px]">{qty.dispatched}</td>
                          <td className={`px-[13px] py-[10px] align-top text-right font-mono text-[12px] ${qty.dispatched > 0 ? 'font-bold text-amber-600' : ''}`}
                            title={qty.dispatched > 0 ? 'Partially dispatched' : undefined}>{qty.remaining}</td>
                          <td className="px-[13px] py-[10px] align-top text-right font-mono text-[12px] font-bold">{formatINR(Math.round(grandTotal))}</td>
                          <td className="px-[13px] py-[10px] align-top">{fulfillmentLabel(orderFulfillment(o))}</td>
                          <td className="px-[13px] py-[10px] align-top text-[11.5px] whitespace-nowrap">
                            {o.created_at ? (() => {
                              const cls = punchedAtClass(o.created_at);
                              return <span className={cls.text} title={cls.title}>{fmtIST(new Date(o.created_at), 'dd-MMM-yyyy')}</span>;
                            })() : <span className="text-g600">--</span>}
                          </td>
                          <td className="px-[13px] py-[10px] align-top"><Badge status={o.status} /></td>
                          <td className="px-[13px] py-[10px] align-top" onClick={ev => ev.stopPropagation()}>
                            <Button size="sm" variant="success" className="active:scale-95 transition-transform" onClick={() => navigate(`/dispatch/new?orderRef=${o.id}&toSent=1`)}>Create Dispatch</Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-sW/[0.02] border-b-2 border-sW">
                            <td colSpan={15} className="p-0">
                              <LineItemsPanel title={`Order Line Items -- ${o.soNumber ? `${o.soNumber} / ` : ''}${o.id}`} items={o.items} grand={grandTotal}
                                remaining={remainingByLine(o, data.dispatchEntries)} showDispatched />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            // Fixed layout + fixed column widths so the Delivery and Self
            // Pickup pills render identically instead of auto-sizing to
            // whatever rows happen to be showing.
            <table className="w-full table-fixed border-collapse text-[12.5px]">
              <colgroup>
                <col style={{ width: 110 }} />{/* SO No. */}
                <col style={{ width: 110 }} />{/* Order Ref */}
                <col style={{ width: 200 }} />{/* Customer */}
                <col style={{ width: 120 }} />{/* PO No. */}
                <col style={{ width: 90 }} />{/* Items */}
                <col style={{ width: 120 }} />{/* Value */}
                <col style={{ width: 150 }} />{/* Transporter */}
                <col style={{ width: 110 }} />{/* Invoice No. */}
                <col style={{ width: 115 }} />{/* Dispatched On */}
                {isEmailSentTab && <col style={{ width: 165 }} />}{/* Email Sent On */}
                <col style={{ width: 260 }} />{/* Actions — wide enough for Edit + Delete side by side */}
              </colgroup>
              <thead className="bg-g100">
                <tr>
                  <DispatchEntryHeadCells showEmailSent={isEmailSentTab} />
                  <th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 ? (
                  <tr><td colSpan={entryColCount} className="text-center p-8 text-g400 text-[13px]">{qs ? 'No matching entries' : `No ${subType === 'self_pickup' ? 'Self Pickup' : 'Delivery'} entries ${tab === 'emailSent' ? 'emailed yet' : 'dispatched yet'}`}</td></tr>
                ) : (
                  visibleEntries.map(entry => {
                    const order = orderFor(entry);
                    const isExpanded = expandedRow === entry.id;
                    return (
                      <React.Fragment key={entry.id}>
                        <tr
                          className={`group transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sW/5 ${isExpanded ? 'bg-sW/5' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                        >
                          <DispatchEntryCells entry={entry} order={order} showEmailSent={isEmailSentTab} />
                          <td className="px-[13px] py-[10px] align-top whitespace-nowrap" onClick={ev => ev.stopPropagation()}>
                            <DispatchEntryActions
                              onEdit={() => navigate(`/dispatch/new?entryId=${entry.id}`)}
                              onDelete={canDelete ? () => deleteEntryWithConfirm(entry) : undefined}
                              doer={(entry.updatedBy || entry.createdBy) ? doerLabel(entry.updatedBy || entry.createdBy, data.roster) : undefined} />
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-sW/[0.02] border-b-2 border-sW">
                            <td colSpan={entryColCount} className="p-0">
                              <DispatchLineItemsPanel entry={entry} order={order} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}

      {view === 'board' && drawerOrderId && (() => {
        const o = data.orders.find(x => x.id === drawerOrderId);
        if (!o) return null;
        // Unfiltered board, so the drawer still finds the order card when
        // the current filter/search hides it.
        const orderCard = boardCards.find((c): c is BoardOrderCard => c.kind === 'order' && c.order.id === o.id);
        return (
          <DispatchDrawer
            order={o}
            entries={data.dispatchEntries.filter(e => e.orderId === o.id)}
            records={stepRecords.filter(r => r.orderId === o.id)}
            linkedDOs={linkedDOs.filter(d => d.orderId === o.id)}
            fulfillment={orderCard?.fulfillment ?? orderFulfillment(o)}
            orderCard={orderCard}
            now={now}
            roster={data.roster}
            canAct={canActOnBoard}
            busy={!!busyCardKey && (busyCardKey === orderCard?.key || busyCardKey === drawerCard?.key)}
            onAction={handleStepAction}
            onEntryAction={runEntryStepAction}
            onResume={resumeHold}
            canUndo={canUndoOnBoard}
            undoBusy={undoBusy}
            onUndo={click => requestUndo(o, click)}
            site={siteLabel(customerOfDoc(o, data.customers), o.siteId || data.enquiries.find(e => e.id === o.enqRef)?.siteId)}
            openedFrom={boardCards.find(c => c.key === drawerCard?.key) ?? drawerCard!}
            canDelete={canDelete}
            onSaveStep={(rec, patch) => saveStepEdit(o, rec, patch)}
            onDelete={requestDelete}
            onClose={closeDrawer}
          />
        );
      })()}

      {undoTarget && (() => {
        const { order, click } = undoTarget;
        const by = click.kind === 'delete' ? click.rows[0].doneBy : click.row.doneBy;
        const when = fmtIST(new Date(click.at), 'dd MMM, hh:mm a');
        // Step 6 "DO issued ✓" also saved an Outward entry — Undo leaves it alone.
        const undoesDo = undoesStep6Do(click);
        return (
          <ConfirmDialog
            title={`Undo the last step for ${order.soNumber || order.id}?`}
            confirmLabel="Undo"
            busy={undoBusy}
            onConfirm={confirmUndo}
            onCancel={() => setUndoTarget(null)}
          >
            <div className="font-semibold text-blk">{describeStepClick(click)}</div>
            <div className="text-g500">({when}{by ? ` by ${doerLabel(by, data.roster)}` : ''})</div>
            <div className="mt-2">The card moves back to where it was. Dispatch entries and the order's status are not changed.</div>
            {undoesDo && (
              <div className="mt-2 font-semibold text-[#8A4500] bg-[#FFF3E0] border border-[#E9730C]/40 rounded-[4px] px-2.5 py-2">
                This only moves the card back to Step 6. The DO (Outward entry) is NOT deleted and the stock is NOT put back. If the DO was wrong, ask MIS / Shishir to delete it from Stock Movements → Outward — that will restore the stock.
              </div>
            )}
          </ConfirmDialog>
        );
      })()}

      {deleteCard && (
        deleteCard.kind === 'order' ? (
          <ConfirmDialog
            title={`Remove ${deleteCard.order.soNumber || deleteCard.order.id} – ${deleteCard.order.cust} from the Dispatch board?`}
            confirmLabel="Remove"
            busy={deleting}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteCard(null)}
          >
            The order stays in Orders and can be sent to Dispatch again.
          </ConfirmDialog>
        ) : (
          <ConfirmDialog
            title={`Delete dispatch entry ${deleteCard.entry.invoiceNumber || deleteCard.entry.id} for ${deleteCard.order?.cust || deleteCard.entry.orderId}?`}
            confirmLabel="Delete"
            busy={deleting}
            onConfirm={confirmDelete}
            onCancel={() => setDeleteCard(null)}
          >
            {deleteConfirmText(deleteCard.entry)}
          </ConfirmDialog>
        )
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] max-w-[440px] flex items-center gap-2 px-4 py-2.5 rounded-[4px] shadow-lg text-[12.5px] font-medium text-white animate-in slide-in-from-bottom-2 ${toast.type === 'ok' ? 'bg-sW' : 'bg-red-mrt'}`}>
          {toast.type === 'ok' && <CheckCircle2 size={14} className="shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
