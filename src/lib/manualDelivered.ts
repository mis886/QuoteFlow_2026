// 2026-11-18: picking "Delivered" BY HAND in an order status dropdown (order
// detail panel, order form — 2026-11-19 user rule: in BOTH only these logins;
// the store's updateOrder enforces it). Orders normally become Delivered by themselves
// once their whole dispatch is finished (store's
// autoMarkOrderDeliveredFromDispatch). By hand: only the logins in
// MANUAL_DELIVERED_EMAILS, after a confirmation, logged as
// "Manually marked Delivered by <user>" (store's manualDeliveredLogNote).
import { orderDispatchCompleteInDb } from './dispatchEntrySteps';

// 2026-11-18 (user decision): its own small list — NOT ADMIN_EMAILS (which
// also has anil@) and not the Delete list. Change it here only.
export const MANUAL_DELIVERED_EMAILS = ['mis@himalayaterpene.com', 'shishir@himalayaterpene.com'];
export const canMarkDeliveredManually = (email: string | null | undefined): boolean =>
  MANUAL_DELIVERED_EMAILS.includes((email ?? '').trim().toLowerCase());
// 2026-11-19 (user rule): Delivered = automatic from Dispatch, or by hand by
// these logins only — in the detail panel AND the order form. The store's
// updateOrder refuses any other change to Delivered with this message.
export const MANUAL_DELIVERED_ONLY_MSG = 'Only mis@ or shishir@ can mark an order Delivered by hand — otherwise it is marked Delivered automatically from Dispatch';

/** Is the "Delivered" option in the dropdown? For an allowed login always;
 *  anyone else only when the order already IS Delivered, so it still
 *  displays — never pickable. `allowed` = canMarkDeliveredManually(email). */
export const showDeliveredOption = (allowed: boolean, currentStatus: string | undefined) =>
  allowed || currentStatus === 'Delivered';

/** May this login switch the order TO Delivered by hand? */
export const canPickDelivered = (allowed: boolean, currentStatus: string | undefined) =>
  allowed && currentStatus !== 'Delivered';

/** The confirmation before an admin marks Delivered by hand. The question
 *  depends on whether the order's dispatch is actually finished (database
 *  now); if that can't be checked it asks the "not finished" one. */
export async function confirmManualDelivered(orderId: string): Promise<boolean> {
  let finished = false;
  try { finished = await orderDispatchCompleteInDb(orderId); } catch { /* ask the cautious question */ }
  return window.confirm(finished
    ? 'Mark this order Delivered?'
    : "This order isn't fully finished in Dispatch. Mark Delivered anyway?");
}
