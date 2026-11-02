// Supabase returns at most 1000 rows per request and says nothing about the
// rest. Every query that can reach that loads through here, one page at a time.
// `build` makes a fresh query for each page. It needs a stable order, ending in
// a unique column (usually .order('id')), so pages never overlap or skip rows.
export async function fetchAllRows<T = any>(
  build: () => { range(from: number, to: number): PromiseLike<{ data: any; error: any }> },
  pageSize = 1000,
): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return { data: rows, error: null };
  }
}
