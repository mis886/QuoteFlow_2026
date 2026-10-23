// Saves Step 8–10 rows (dispatch_steps, entry_id = the entry) for ONE dispatch
// entry. The one place these rows are written: the board's "Invoice done" /
// "LR received" / "Documents sent" buttons (Dispatch.tsx runEntryStepAction),
// and — since 2026-10-23 — saving an invoice no. on the entry page
// (NewDispatchEntry.tsx completes Step 8 with the same row).
import { supabase } from './supabase';
import { logActivity } from './activityLog';
import type { DispatchEntry } from './types';
import { DispatchStepRecord, StepAction, StepNo, entryPosition, entryStepBlock, isImportedEntry, stepDef } from './dispatchFlow';

/**
 * Checks Step 8 / 9 against the entry as saved in the database right now
 * (the database trigger enforce_dispatch_entry_step_prereqs checks again),
 * then inserts the action's rows and logs them. Throws with the refusal
 * ("Add invoice no. first" / "Upload LR first") or the database error.
 * Returns the inserted rows (raw, as Supabase returns them).
 */
export async function saveEntryStepRows({ entry, entries, records, action, remark, doneBy, orderLabel, logNote }: {
  entry: DispatchEntry;
  entries: DispatchEntry[];          // every dispatch entry (for the round), may include `entry`
  records: DispatchStepRecord[];     // step records — only this entry's are used
  action: StepAction;
  remark?: string;
  doneBy?: string | null;
  orderLabel: string;                // SO no. (or order id) for the activity log
  logNote?: string;                  // "Done (…)" in the log; default the button label
}): Promise<any[]> {
  const { data: fresh, error: freshErr } = await supabase.from('dispatch_entries')
    .select('invoice_number, lr_files, lr_url, created_at').eq('id', entry.id).single();
  if (freshErr) throw freshErr;
  const e: DispatchEntry = {
    ...entry,
    invoiceNumber: fresh.invoice_number || undefined,
    lrFiles: Array.isArray(fresh.lr_files) ? fresh.lr_files : undefined,
    lrUrl: fresh.lr_url || undefined,
    created_at: entry.created_at || fresh.created_at || undefined,
  };
  const blocked = action.writes.map(w => entryStepBlock(e, w.stepNo)).find(Boolean);
  if (blocked) throw new Error(blocked);
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
