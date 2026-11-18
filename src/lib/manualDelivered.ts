// 2026-11-18: picking "Delivered" BY HAND in an order status dropdown (order
// detail panel, order form). Orders normally become Delivered by themselves
// once their whole dispatch is finished (store's
// autoMarkOrderDeliveredFromDispatch). By hand: admins only (the store's
// isAdmin / ADMIN_EMAILS), after a confirmation, logged as
// "Manually marked Delivered by <user>" (store's manualDeliveredLogNote).
import { orderDispatchCompleteInDb } from './dispatchEntrySteps';

/** Is the "Delivered" option in the dropdown? Admins always; anyone else only
 *  when the order already IS Delivered, so it still displays — never pickable. */
export const showDeliveredOption = (isAdmin: boolean, currentStatus: string | undefined) =>
  isAdmin || currentStatus === 'Delivered';

/** May this login switch the order TO Delivered by hand? */
export const canPickDelivered = (isAdmin: boolean, currentStatus: string | undefined) =>
  isAdmin && currentStatus !== 'Delivered';

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
