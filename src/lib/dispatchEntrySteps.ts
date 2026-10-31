// Saves Step 8–11 rows (dispatch_steps, entry_id = the entry) for ONE dispatch
// entry. The one place these rows are written: the board's "Invoice done" /
// "Bhiwandi informed" / "LR received" / "Documents sent" buttons
// (Dispatch.tsx runEntryStepAction), and — since 2026-10-23 — the entry
// page, which completes each step by itself once its proof is saved
// (autoCompleteEntrySteps).
import { supabase } from './supabase';
import { logActivity } from './activityLog';
import type { DispatchEntry } from './types';
import { DispatchStepRecord, STEP_ACTIONS, STEP9_MANUAL_REMARK, StepAction, StepNo, entryPosition, entryStepBlock, isImportedEntry, mapStepFromDB, stepDef } from './dispatchFlow';

/** The entry as saved in the database right now — the fields the Step 8–11 rules read. */
async function freshEntry(entry: DispatchEntry): Promise<DispatchEntry> {
  const { data: fresh, error } = await supabase.from('dispatch_entries')
    .select('invoice_number, invoice_eway_bill_files, invoice_eway_bill_url, bhiwandi_email_sent_at, lr_files, lr_url, email_sent_at, fulfillment_type, created_at').eq('id', entry.id).single();
  if (error) throw error;
  return {
    ...entry,
    invoiceNumber: fresh.invoice_number || undefined,
    invoiceEwayBillFiles: Array.isArray(fresh.invoice_eway_bill_files) ? fresh.invoice_eway_bill_files : undefined,
    invoiceEwayBillUrl: fresh.invoice_eway_bill_url || undefined,
    bhiwandiEmailSentAt: fresh.bhiwandi_email_sent_at || undefined,
    lrFiles: Array.isArray(fresh.lr_files) ? fresh.lr_files : undefined,
    lrUrl: fresh.lr_url || undefined,
    emailSentAt: fresh.email_sent_at || undefined,
    fulfillmentType: fresh.fulfillment_type || entry.fulfillmentType,
    created_at: entry.created_at || fresh.created_at || undefined,
  };
}

/** One entry's saved Step 8–11 rows. */
export async function loadEntryStepRecords(entryId: string): Promise<DispatchStepRecord[]> {
  const { data: rows, error } = await supabase.from('dispatch_steps').select('*').eq('entry_id', entryId);
  if (error) throw error;
  return (rows || []).map(mapStepFromDB);
}

/** One order's saved step rows, for the new-entry check (readyForNewEntry). */
export async function loadOrderStepRecords(orderId: string): Promise<DispatchStepRecord[]> {
  const { data: rows, error } = await supabase.from('dispatch_steps').select('*').eq('order_id', orderId);
  if (error) throw error;
  return (rows || []).map(mapStepFromDB);
}

/**
 * Checks the step's proof against the entry as saved in the database right
 * now (entryStepBlock; the database trigger enforce_dispatch_entry_step_prereqs
 * checks 8, 9 and 10 again), then inserts the action's rows and logs them.
 * Throws with the refusal ("Add invoice no. and attach Invoice / Eway Bill
 * first" / "Send email to Bhiwandi first" / "Upload LR first" / "Send Email
 * to Client first") or the database error. Returns the inserted rows (raw, as
 * Supabase returns them).
 * `manualStep9`: "Mark Step 9 done (Bhiwandi already informed)" — Step 9 is
 * saved without a Bhiwandi email, with the remark the database accepts for it.
 */
export async function saveEntryStepRows({ entry, entries, records, action, remark, doneBy, orderLabel, logNote, manualStep9 = false }: {
  entry: DispatchEntry;
  entries: DispatchEntry[];          // every dispatch entry (for the round), may include `entry`
  records: DispatchStepRecord[];     // step records — only this entry's are used
  action: StepAction;
  remark?: string;
  doneBy?: string | null;
  orderLabel: string;                // SO no. (or order id) for the activity log
  logNote?: string;                  // "Done (…)" in the log; default the button label
  manualStep9?: boolean;
}): Promise<any[]> {
  const e = await freshEntry(entry);
  const blocked = action.writes.map(w => manualStep9 && w.stepNo === 9 ? undefined : entryStepBlock(e, w.stepNo)).find(Boolean);
  if (blocked) throw new Error(blocked);
  if (manualStep9) remark = STEP9_MANUAL_REMARK;
  // Which shipment of the order this entry closed (1, 2, …) — same as the
  // drawer's rounds. An entry with no created_at yet counts as the newest.
  const created = (x: DispatchEntry) => (x.created_at ? new Date(x.created_at).getTime() : Infinity);
  const round = [...entries.filter(x => x.id !== e.id), e]
    .filter(x => x.orderId === e.orderId && !isImportedEntry(x))
    .sort((a, b) => created(a) - created(b))
    .findIndex(x => x.id === e.id) + 1 || 1;
  const pos = entryPosition(e, records);
  const nowIso = new Date().toISOString();
  const rows = action.writes.map((w, i) => ({
    order_id: e.orderId,
    entry_id: e.id,
    round,
    step_no: w.stepNo,
    status: w.status,
    planned_at: w.stepNo === pos.column ? pos.plannedAt ?? null : null,
    done_at: nowIso,
    done_by: doneBy ?? null,
    remark: i === 0 && remark?.trim() ? remark.trim() : null,
  }));
  const { data: inserted, error } = await supabase.from('dispatch_steps').insert(rows).select('*');
  if (error) throw error;
  for (const row of inserted || []) {
    logActivity({
      module: 'dispatch_steps', recordId: e.orderId,
      recordLabel: `${orderLabel} · ${e.invoiceNumber ? `INV ${e.invoiceNumber} · ` : ''}Step ${row.step_no} ${stepDef(row.step_no as StepNo).title} · Done (${logNote || action.label})`,
      action: 'insert', after: row,
    });
  }
  return inserted || [];
}

/** What each auto-completed step says in the activity log. */
const AUTO_NOTE: Record<8 | 9 | 10 | 11, string> = { 8: 'invoice no. saved', 9: 'email sent to Bhiwandi', 10: 'LR uploaded', 11: 'email sent' };

/**
 * 2026-10-23: completes an entry's Steps 8 → 9 → 10 → 11 in order, each only
 * while the entry is AT that step and its proof is saved (invoice no. +
 * invoice file / Bhiwandi email / LR file / email sent — entryStepBlock),
 * with the same row and log as the board buttons. Never writes a second row
 * for a step or moves an entry back. Self Pickup skips 10 as usual
 * (entryPosition). `skipSteps` stops at a step this login may not complete.
 * Returns the steps written; throws "Step N was not marked done (…)" if a
 * write fails.
 */
export async function autoCompleteEntrySteps({ entry, entries, doneBy, orderLabel, skipSteps = [] }: {
  entry: DispatchEntry;
  entries: DispatchEntry[];
  doneBy?: string | null;
  orderLabel: string;
  skipSteps?: number[];
}): Promise<number[]> {
  if (isImportedEntry(entry)) return [];
  const written: number[] = [];
  let step: number | undefined;
  try {
    const e = await freshEntry(entry);
    let records = await loadEntryStepRecords(entry.id);
    for (let guard = 0; guard < 4; guard++) {
      step = entryPosition(e, records).column;
      if (step > 11 || skipSteps.includes(step) || entryStepBlock(e, step)) break;
      try {
        const inserted = await saveEntryStepRows({
          entry: e, entries, records, action: STEP_ACTIONS[step as StepNo]![0], doneBy, orderLabel, logNote: AUTO_NOTE[step as 8 | 9 | 10 | 11],
        });
        records = [...records, ...inserted.map(mapStepFromDB)];
        written.push(step);
      } catch (err: any) {
        // Marked at the same moment by someone else (one row per entry +
        // step) — catch up with what's saved and carry on.
        if (err?.code !== '23505') throw err;
        records = await loadEntryStepRecords(entry.id);
      }
    }
  } catch (err: any) {
    const label = step && step <= 11 ? STEP_ACTIONS[step as StepNo]?.[0]?.label : undefined;
    throw new Error(`Step ${step ?? 8} was not marked done (${err?.message || 'check your connection'})${label ? `. Use “${label}” on the Dispatch board` : ''}`);
  }
  return written;
}
