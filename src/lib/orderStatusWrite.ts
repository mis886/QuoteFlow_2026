// 2026-11-18: the orders UPDATE behind the store's updateOrder, with an
// optional status guard. `onlyIfStatusIn` makes it conditional — the row is
// written only while its status is STILL one of those (checked by Postgres in
// the same UPDATE, so two tabs racing for the same order can't both win: the
// second one's WHERE no longer matches and it changes 0 rows).
// Returns true if a row was written. Without the guard it behaves as before
// (no row count is asked for) and returns true when there was no error.
// The caller writes the History Log line ONLY when this returns true.
type OrdersClient = {
  from: (table: 'orders') => any;
};

export async function writeOrderUpdate(
  client: OrdersClient,
  id: string,
  dbUpdates: Record<string, unknown>,
  onlyIfStatusIn?: readonly string[],
): Promise<boolean> {
  if (!onlyIfStatusIn) {
    const { error } = await client.from('orders').update(dbUpdates).eq('id', id);
    if (error) throw error;
    return true;
  }
  const { data, error } = await client.from('orders').update(dbUpdates)
    .eq('id', id).in('status', [...onlyIfStatusIn]).select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}
