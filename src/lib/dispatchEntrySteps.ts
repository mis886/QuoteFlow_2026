// Saves Step 8–11 rows (dispatch_steps, entry_id = the entry) for ONE dispatch
// entry. The one place these rows are written: the board's "Invoice done" /
// "Bhiwandi informed" / "LR received" / "Documents sent" buttons
// (Dispatch.tsx runEntryStepAction), and — since 2026-10-23 — the entry
// page, which completes each step by itself once its proof is saved
// (autoCompleteEntrySteps).
import { supabase } from './supabase';
import { logActivity } from './activityLog';
import type { DispatchEntry } from './types';
import { DispatchStepRecord, STEP_ACTIONS, STEP9_MANUAL_REMARK, STEP11_WHATSAPP_REMARK, StepAction, StepNo, entryPosition, entryStepBlock, isImportedEntry, mapStepFromDB, openStepWrites, showStep11WhatsApp, step11WhatsAppBlock, stepDef } from './dispatchFlow';

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
 * A step someone already finished (the screen was out of date, or two clicks
 * landed together) is not an error: nothing is written or logged, `inserted`
 * is empty and `alreadyDone` holds the saved rows, for the caller to refresh.
 * This is checked before the proof, which a finished step doesn't need: Step 9
 * marked manually has no Bhiwandi email.
 * `manualStep9`: "Mark Step 9 done (Bhiwandi already informed)" — Step 9 is
 * saved without a Bhiwandi email, with the remark the database accepts for it.
 */
export async function saveEntryStepRows({ entry, entries, action, remark, doneBy, orderLabel, logNote, manualStep9 = false }: {
  entry: DispatchEntry;
  entries: DispatchEntry[];          // every dispatch entry (for the round), may include `entry`
  action: StepAction;
  remark?: string;
  doneBy?: string | null;
  orderLabel: string;                // SO no. (or order id) for the activity log
  logNote?: string;                  // "Done (…)" in the log; default the button label
  manualStep9?: boolean;
}): Promise<{ inserted: any[]; alreadyDone: DispatchStepRecord[] }> {
  const e = await freshEntry(entry);
  const records = await loadEntryStepRecords(e.id);
  const { open, alreadyDone } = openStepWrites(action.writes, records);
  if (!open.length) return { inserted: [], alreadyDone };
  const blocked = open.map(w => manualStep9 && w.stepNo === 9 ? undefined : entryStepBlock(e, w.stepNo)).find(Boolean);
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
  const rows = open.map((w, i) => ({
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
  if (error?.code === '23505') {
    // Saved by someone else in the moment since the check above.
    const saved = await loadEntryStepRecords(e.id);
    return { inserted: [], alreadyDone: saved.filter(r => open.some(w => w.stepNo === r.stepNo)) };
  }
  if (error) throw error;
  for (const row of inserted || []) {
    logActivity({
      module: 'dispatch_steps', recordId: e.orderId,
      recordLabel: `${orderLabel} · ${e.invoiceNumber ? `INV ${e.invoiceNumber} · ` : ''}Step ${row.step_no} ${stepDef(row.step_no as StepNo).title} · Done (${logNote || action.label})`,
      action: 'insert', after: row,
    });
  }
  return { inserted: inserted || [], alreadyDone: [] };
}

/**
 * 2026-11-03: Step 11 "Send through WhatsApp" — the documents went out on
 * WhatsApp outside the app (customers with no email). Nothing is sent: it
 * records docs_sent_via = 'whatsapp' + email_sent_at (so the entry counts as
 * "documents sent" everywhere, like an emailed one), then writes Step 11 Done
 * with the remark "sent via WhatsApp". Checked again against the database
 * first (still at Step 11, not sent, required documents saved). If Step 11
 * can't be written the WhatsApp mark is taken back, so the entry never ends up
 * half-done. Throws with the reason.
 * 2026-11-04: moved here from Dispatch.tsx — the button is on the entry page
 * (NewDispatchEntry.tsx) now, not the Dispatch drawer.
 * `markSent` / `clearMark` = the store's markDispatchDocsSentWhatsApp /
 * clearDispatchDocsSentWhatsApp (they also update the page's data).
 */
export async function markEntryDocsSentWhatsApp({ entry, entries, customer, doneBy, orderLabel, markSent, clearMark }: {
  entry: DispatchEntry;
  entries: DispatchEntry[];
  customer?: Parameters<typeof step11WhatsAppBlock>[1];
  doneBy?: string | null;
  orderLabel: string;
  markSent: (id: string) => Promise<string | null>;
  clearMark: (id: string) => Promise<boolean>;
}): Promise<{ sentAt: string; inserted: any[]; alreadyDone: DispatchStepRecord[] }> {
  const e = entry;
  const [{ data: fresh, error: freshErr }, records] = await Promise.all([
    supabase.from('dispatch_entries')
      .select('email_sent_at, invoice_eway_bill_files, invoice_eway_bill_url, lr_files, lr_url, coa_files, coa_url, supplier_portal_url, fulfillment_type')
      .eq('id', e.id).single(),
    loadEntryStepRecords(e.id),
  ]);
  if (freshErr) throw freshErr;
  const now: DispatchEntry = {
    ...e,
    emailSentAt: fresh.email_sent_at || undefined,
    invoiceEwayBillFiles: Array.isArray(fresh.invoice_eway_bill_files) ? fresh.invoice_eway_bill_files : undefined,
    invoiceEwayBillUrl: fresh.invoice_eway_bill_url || undefined,
    lrFiles: Array.isArray(fresh.lr_files) ? fresh.lr_files : undefined,
    lrUrl: fresh.lr_url || undefined,
    coaFiles: Array.isArray(fresh.coa_files) ? fresh.coa_files : undefined,
    coaUrl: fresh.coa_url || undefined,
    supplierPortalUrl: fresh.supplier_portal_url || undefined,
    fulfillmentType: fresh.fulfillment_type || e.fulfillmentType,
  };
  const stale = 'The documents for this entry were already sent.';
  if (now.emailSentAt) throw new Error(stale);
  if (!showStep11WhatsApp(now, entryPosition(now, records).column)) throw new Error('This entry is not at Step 11 (Steps 8–10 must be done first).');
  const blocked = step11WhatsAppBlock(now, customer);
  if (blocked) throw new Error(blocked);
  const sentAt = await markSent(e.id);
  if (!sentAt) throw new Error(stale);
  let result: Awaited<ReturnType<typeof saveEntryStepRows>>;
  try {
    result = await saveEntryStepRows({
      entry: { ...now, emailSentAt: sentAt, docsSentVia: 'whatsapp' }, entries,
      action: STEP_ACTIONS[11]![0], remark: STEP11_WHATSAPP_REMARK,
      doneBy, orderLabel, logNote: 'documents sent on WhatsApp',
    });
  } catch (err) {
    await clearMark(e.id).catch(() => {});
    throw err;
  }
  logActivity({
    module: 'dispatch_entries', recordId: e.id,
    recordLabel: `${orderLabel} · ${e.invoiceNumber ? `INV ${e.invoiceNumber} · ` : ''}Step 11 done — documents sent on WhatsApp`,
    action: 'update', before: { email_sent_at: null, docs_sent_via: null }, after: { email_sent_at: sentAt, docs_sent_via: 'whatsapp' },
  });
  return { sentAt, ...result };
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
      const { inserted } = await saveEntryStepRows({
        entry: e, entries, action: STEP_ACTIONS[step as StepNo]![0], doneBy, orderLabel, logNote: AUTO_NOTE[step as 8 | 9 | 10 | 11],
      });
      if (inserted.length) written.push(step);
      // Marked at the same moment by someone else: this catches up with it too.
      records = await loadEntryStepRecords(entry.id);
    }
  } catch (err: any) {
    const label = step && step <= 11 ? STEP_ACTIONS[step as StepNo]?.[0]?.label : undefined;
    throw new Error(`Step ${step ?? 8} was not marked done (${err?.message || 'check your connection'})${label ? `. Use “${label}” on the Dispatch board` : ''}`);
  }
  return written;
}
