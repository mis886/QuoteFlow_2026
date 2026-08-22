// ─────────────────────────────────────────────────────────────────
// Read-only bridge from Production → CRM tables.
// Beta contract: this module SELECTs from public.orders only.
// It never INSERTs / UPDATEs / DELETEs. The CRM AppProvider stays
// untouched.
// ─────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase';

export interface CrmOrderLite {
  id: string;             // order PK
  po_no: string | null;
  po_date: string | null;
  dlv_date: string | null;
  cust: string | null;    // customer name (denormalised on orders)
  status: string | null;
  items: CrmOrderItem[];  // JSONB
}

export interface CrmOrderItem {
  seq?: number;
  desc?: string;
  mat?: string;
  qty?: number;
  uom?: string;
  drwg?: string;
  hsn?: string;
  agreedRate?: number;
  gst?: number;
  total?: number;
  remarks?: string;
}

// Open Orders only — Processing status. We surface PO No + customer
// for the picker.
export async function listOpenCrmOrders(): Promise<CrmOrderLite[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, po_no, po_date, dlv_date, cust, status, items')
    .eq('status', 'Processing')
    .order('po_date', { ascending: false });
  if (error) {
    console.error('listOpenCrmOrders', error);
    return [];
  }
  return (data || []) as CrmOrderLite[];
}

// Return only those CRM orders that don't yet have ANY production job
// linked back to them (via prod_jobs.order_id = orders.id).
export async function listOrdersWithoutJobs(): Promise<CrmOrderLite[]> {
  const [orders, linkedRows] = await Promise.all([
    listOpenCrmOrders(),
    supabase.from('prod_jobs').select('order_id').not('order_id', 'is', null),
  ]);
  const linked = new Set((linkedRows.data || []).map((r: any) => r.order_id));
  return orders.filter(o => !linked.has(o.id));
}
