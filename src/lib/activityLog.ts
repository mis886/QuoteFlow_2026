// Writes one row per insert/update/delete into activity_log (see
// supabase/migrations/20260824045750_add_activity_log_table.sql), called from
// the mutation functions in src/store/index.tsx and directly from
// src/pages/Sampling.tsx / SamplingNew.tsx, whose samples/sample_products
// writes don't go through the central store. Never throws and never awaited
// by its callers — a logging failure must never block or delay the real save
// it's describing.

import { supabase } from './supabase';

export type ActivityAction = 'insert' | 'update' | 'delete';

interface LogActivityParams {
  module: string;
  recordId: string;
  recordLabel?: string | null;
  action: ActivityAction;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
}

// Mirrors store/index.tsx's stampName() priority (sales@'s PIN-picked
// identity > resolved doer > the Google-auth login) but reads it straight
// from the storage keys the store itself already writes to (sessionStorage
// 'active_doer', localStorage 'sales_signatory_identity') — this module has
// no React context to read AppProvider's state from directly.
async function resolveActor(): Promise<{ email: string | null; name: string }> {
  let email: string | null = null;
  let googleName: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email ?? null;
    googleName = (user?.user_metadata as any)?.full_name ?? null;
  } catch { /* no session — leave email/googleName null */ }

  let salesIdentity: string | null = null;
  try { salesIdentity = localStorage.getItem('sales_signatory_identity'); } catch { /* unavailable */ }

  let doerName: string | null = null;
  try {
    const raw = sessionStorage.getItem('active_doer');
    doerName = raw ? (JSON.parse(raw)?.display_name ?? null) : null;
  } catch { /* unavailable / malformed */ }

  const name = salesIdentity || doerName || email || googleName || 'Unknown';
  return { email, name };
}

// Union of before/after's top-level keys, keeping only ones that actually
// differ (deep-compared via JSON so array/object fields like `items` diff
// correctly, not just changed by reference).
function diffFields(before: Record<string, any>, after: Record<string, any>): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { old: oldVal ?? null, new: newVal ?? null };
    }
  }
  return changes;
}

export async function logActivity({ module, recordId, recordLabel, action, before, after }: LogActivityParams): Promise<void> {
  try {
    let changes: Record<string, any> | null;

    if (action === 'insert') {
      changes = after ?? null;
    } else if (action === 'delete') {
      changes = before ?? null;
    } else {
      const diff = diffFields(before ?? {}, after ?? {});
      if (Object.keys(diff).length === 0) return; // no real field change — don't log a no-op edit
      changes = diff;
    }

    const { email, name } = await resolveActor();

    const { error } = await supabase.from('activity_log').insert({
      actor_email: email,
      actor_name: name,
      module,
      record_id: recordId,
      record_label: recordLabel ?? null,
      action,
      changes,
    });
    if (error) console.error('logActivity failed:', error);
  } catch (err) {
    console.error('logActivity threw:', err);
  }
}
