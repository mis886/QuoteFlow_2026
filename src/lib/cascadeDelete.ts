import type { Order, Quote, FollowUp } from './types';
import type { DownstreamRecord } from '../components/CascadeDeleteModal';
import { resolveAdjustments, maxItemGstRate } from './utils';

// DownstreamRecord is imported as a type only (erased at compile time), so
// this module and CascadeDeleteModal.tsx importing friendlyDeleteError back
// from here is not a runtime circular dependency.

// Single source of truth for "what does deleting this record take down with
// it" — used by every delete trigger (register row buttons, the detail
// panel, and the CascadeDeleteModal itself) so they can't drift out of sync
// the way the Quotations register's plain-confirm path did: it only checked
// for linked orders and missed followups entirely, which is why deleting
// HTP-2026-244 surfaced a raw FK error instead of the cascade modal.

function followupRecord(quoteId: string, followups: FollowUp[]): DownstreamRecord[] {
  const row = followups.find(f => f.quote_id === quoteId);
  if (!row) return [];
  const n = row.logs?.length ?? 0;
  return [{ id: quoteId, type: 'followup', status: `${n} logged activit${n === 1 ? 'y' : 'ies'}` }];
}

function orderRecord(o: Order): DownstreamRecord {
  const sub = o.items.reduce((s, i) => s + i.total, 0);
  const gst = o.items.reduce((s, i) => s + i.total * i.gst / 100, 0);
  return { id: o.id, type: 'order', status: o.status, grandTotal: resolveAdjustments(o.adjustments, sub, gst, maxItemGstRate(o.items)).grand };
}

/** Everything that will be cascade-deleted along with this quote: its orders and its followup record, if any. */
export function getQuoteDownstream(quoteId: string, data: { orders: Order[]; followups: FollowUp[] }): DownstreamRecord[] {
  const orders = data.orders.filter(o => o.quoteRef === quoteId).map(orderRecord);
  return [...orders, ...followupRecord(quoteId, data.followups)];
}

/** Everything that will be cascade-deleted along with this enquiry: its quotes, their orders, and their followup records. */
export function getEnquiryDownstream(enqId: string, data: { quotes: Quote[]; orders: Order[]; followups: FollowUp[] }): DownstreamRecord[] {
  const linkedQuotes = data.quotes.filter(q => q.enqRef === enqId);
  const quoteRecords: DownstreamRecord[] = linkedQuotes.map(q => ({ id: q.id, type: 'quote', status: q.status }));
  const orderRecords = data.orders
    .filter(o => linkedQuotes.some(q => q.id === o.quoteRef) || o.enqRef === enqId)
    .map(orderRecord);
  const followupRecords = linkedQuotes.flatMap(q => followupRecord(q.id, data.followups));
  return [...quoteRecords, ...orderRecords, ...followupRecords];
}

/**
 * Rewrites a raw Postgres constraint-violation error into a message naming
 * the actual blocker, so "violates foreign key constraint ..." never reaches
 * the UI verbatim. Anything else (network errors, RLS denials, etc.) passes
 * through unchanged.
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
