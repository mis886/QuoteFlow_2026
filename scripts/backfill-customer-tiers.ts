// One-off backfill: recomputes every customer's `tier` from their real,
// cumulative Order value now that tier is rule-based (see
// computeCustomerTier in src/lib/utils.ts) rather than a manual pick.
// Going forward, src/store/index.tsx keeps tier in sync automatically
// whenever orders change — this script only needs to run ONCE, to fix
// up whatever tier every existing customer had under the old manual
// system. Safe to re-run: it only writes rows whose computed tier
// differs from what's currently stored.
//
// Usage:
//   npx tsx scripts/backfill-customer-tiers.ts --dry-run   (report only, no writes — run this first)
//   npx tsx scripts/backfill-customer-tiers.ts             (apply the updates)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nheujyknkqeimgpdfyiw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oZXVqeWtua3FlaW1ncGRmeWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzM2ODIsImV4cCI6MjA5NjkwOTY4Mn0.5j_CYqyjCNY1tGozklqY4iUnQh3HLpFBw8EiNeu05Dw';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DRY_RUN = process.argv.includes('--dry-run');

type Tier = 'New' | 'Bronze' | 'Silver' | 'Gold';

function computeTier(total: number): Tier {
  if (total <= 0) return 'New';
  if (total >= 10000000) return 'Gold';
  if (total >= 1000000) return 'Silver';
  return 'Bronze';
}

async function main() {
  const { data: customers, error: custErr } = await supabase.from('customers').select('customer_id, name, tier');
  if (custErr) throw custErr;
  const { data: orders, error: ordErr } = await supabase.from('orders').select('cust, value');
  if (ordErr) throw ordErr;

  const totals = new Map<string, number>();
  for (const o of orders ?? []) {
    totals.set(o.cust, (totals.get(o.cust) ?? 0) + (o.value ?? 0));
  }

  let changed = 0;
  const summary: Record<Tier, number> = { New: 0, Bronze: 0, Silver: 0, Gold: 0 };

  for (const c of customers ?? []) {
    const total = totals.get(c.name) ?? 0;
    const nextTier = computeTier(total);
    summary[nextTier]++;
    if (c.tier !== nextTier) {
      changed++;
      console.log(`${c.name} (${c.customer_id}): ${c.tier ?? 'New'} -> ${nextTier}  (total ₹${total.toLocaleString('en-IN')})`);
      if (!DRY_RUN) {
        const { error } = await supabase.from('customers').update({ tier: nextTier }).eq('customer_id', c.customer_id);
        if (error) console.error(`  FAILED to update ${c.customer_id}:`, error.message);
      }
    }
  }

  console.log(`\n${DRY_RUN ? '[DRY RUN] Would update' : 'Updated'} ${changed} of ${customers?.length ?? 0} customers.`);
  console.log('New tier distribution:', summary);
}

main().catch(err => { console.error(err); process.exit(1); });
