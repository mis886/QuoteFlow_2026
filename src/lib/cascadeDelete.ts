/**
 * Rewrites a raw Postgres constraint-violation error into a message naming
 * the actual blocker, so "violates foreign key constraint ..." never reaches
 * the UI verbatim. Anything else (network errors, RLS denials, etc.) passes
 * through unchanged.
 *
 * Deletes across Enquiry/Quotation/Order/Sample are independent per module
 * (quotes.enq_ref, orders.enq_ref, orders.quote_ref, followups.quote_id are
 * all ON DELETE SET NULL, not CASCADE), so this constraint-violation path
 * should be rare — but other, unrelated FK constraints can still legitimately
 * block a delete, so it's kept for that case.
 */
export function friendlyDeleteError(err: unknown): string {
  const msg = (err as { message?: string })?.message || String(err);
  const m = msg.match(/violates foreign key constraint "([^"]+)" on table "([^"]+)"/);
  if (m) {
    const [, constraint, table] = m;
    return `This record still has linked "${table}" records blocking deletion (constraint: ${constraint}). Please report this — it means a dependency was missed.`;
  }
  return msg;
}
