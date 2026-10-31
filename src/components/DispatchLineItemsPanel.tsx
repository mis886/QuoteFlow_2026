import { LineItemsPanel } from './LineItemsPanel';
import type { DispatchEntry, Order } from '../lib/types';

// "Dispatch Line Items" for ONE dispatch entry — what that entry actually
// dispatched (its own items; a partial dispatch has several entries per
// order, told apart by Invoice No.). Falls back to the order's items only
// for an entry saved without any. Used by List → Delivered
// and List → Delivered.
export function DispatchLineItemsPanel({ entry, order }: { entry: DispatchEntry; order?: Order }) {
  const items = entry.items && entry.items.length > 0 ? entry.items : (order?.items || []);
  return <LineItemsPanel title={`Dispatch Line Items -- ${entry.orderId}`} items={items} grand={entry.value || 0} />;
}
