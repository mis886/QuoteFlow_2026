import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import type { Customer, MergeResult } from '../lib/types';
import type { SimilarCustomer } from '../lib/utils';
import { isLead, normalizeSearchText, nameTier } from '../lib/utils';

// Customer Lead → Customer Master: the "looks like an existing customer"
// popup shown at Save & Promote, the merge confirm, and the Customer Master
// picker behind the lead row's "Merge into customer…" action. Merging is MIS
// only (canMerge) — the merge_lead_into_customer DB function checks the same.

const cityOf = (c: Customer) => c.sites?.[0]?.city?.trim() || '';

// Promote found Customer Master records that look like this lead.
//   MERGE INTO <code> — MIS only; everyone else sees it disabled.
//   CREATE AS NEW CUSTOMER — hidden when any match has the exact same GSTIN
//     AND the same billing address (kind 'gstin' — promote_lead would refuse
//     it anyway), or when onCreateNew is omitted. 2026-10-06: same GSTIN with
//     a DIFFERENT billing address (kind 'gstinUnit') is another unit — the
//     button stays, with an amber note on that match.
//   CANCEL — nothing changes.
//   notice — red line under the title (promote_lead said DUPLICATE_GSTIN).
export function LeadMatchDialog({
  leadName, matches, notice, canMerge, busy = false, onMerge, onCreateNew, onCancel,
}: {
  leadName: string;
  matches: SimilarCustomer[];
  notice?: string;
  canMerge: boolean;
  busy?: boolean;
  onMerge: (target: Customer) => void;
  onCreateNew?: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  const sameGstin = matches.some(m => m.kind === 'gstin');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-[6px] shadow-2xl w-full max-w-xl border border-g200 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-serif text-[18px] text-blk leading-snug">This lead looks like an existing customer</h3>
          <p className="text-[12.5px] text-g600 mt-1"><strong>{leadName}</strong> matches {matches.length === 1 ? 'this Customer Master record' : 'these Customer Master records'}:</p>
          {notice && <p className="text-[12px] font-bold text-red-mrt mt-1.5">{notice}</p>}
          <div className="mt-3 space-y-2 max-h-[45vh] overflow-y-auto">
            {matches.map(m => (
              <div key={m.customer.id} className="border border-g200 rounded-[4px] px-3 py-2 text-[12px] flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-blk">
                    <span className="font-mono text-[11px] text-g500 mr-1.5">{m.customer.id}</span>{m.customer.name}
                  </div>
                  <div className="text-g500 text-[11px] mt-0.5">
                    GSTIN <span className="font-mono">{m.customer.gstin || '—'}</span> · {cityOf(m.customer) || '—'}
                  </div>
                  <div className="text-[10.5px] mt-0.5">
                    Matched on: <span className="font-bold text-lead-text">{m.matchedOn.join(', ')}</span>
                  </div>
                  {m.kind === 'pan' && <div className="text-[10.5px] text-g500 mt-0.5">{m.message}</div>}
                  {m.kind === 'gstinUnit' && <div className="text-[10.5px] text-amber-800 bg-amber-50 border border-amber-300 rounded-[3px] px-1.5 py-1 mt-1">{m.message}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <Button size="sm" variant="secondary"
                    className="border-lead text-lead-text bg-white hover:bg-lead/10 whitespace-nowrap disabled:opacity-50"
                    disabled={!canMerge || busy}
                    title={canMerge ? `Move this lead's documents to ${m.customer.id} and delete the lead` : 'Only MIS can merge'}
                    onClick={() => onMerge(m.customer)}>
                    Merge into {m.customer.id}
                  </Button>
                  {!canMerge && <div className="text-[10px] text-g400 mt-1">Ask MIS to merge</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-g200 bg-g100/40 rounded-b-[6px]">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          {onCreateNew && !sameGstin && (
            <Button variant="primary" className="bg-sW text-white border-transparent hover:bg-sW/90 hover:shadow-none" onClick={onCreateNew} disabled={busy}>
              {busy ? 'Saving…' : 'Create as new customer'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// "All enquiries, quotes, orders and samples of <lead> move to <customer>.
// The lead will be deleted. Continue?"
export function MergeConfirmDialog({ lead, target, busy, onConfirm, onCancel }: {
  lead: { id: string; name: string };
  target: Customer;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      title={`Merge into ${target.id}?`}
      tone="lead"
      confirmLabel="Merge"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>All enquiries, quotes, orders and samples of <strong>{lead.name}</strong> ({lead.id}) move to <strong>{target.name}</strong> ({target.id}).</p>
      <p className="mt-2">Any contact person, phone, email, address or GSTIN that <strong>{target.name}</strong> doesn't have will be <strong>ADDED</strong> from the lead. Existing details of <strong>{target.name}</strong> are never overwritten.</p>
      <p className="mt-2">The lead will be deleted. Continue?</p>
    </ConfirmDialog>
  );
}

// Lead row's "Merge into customer…" (MIS only): pick a Customer Master record.
export function CustomerMasterPicker({ customers, leadName, onPick, onCancel }: {
  customers: Customer[];
  leadName: string;
  onPick: (target: Customer) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const masters = useMemo(() => customers.filter(c => !isLead(c)), [customers]);
  const shown = useMemo(() => {
    const n = normalizeSearchText(q);
    const list = n
      ? masters.filter(c => normalizeSearchText(c.name ?? '').includes(n) || c.id.toLowerCase().includes(q.trim().toLowerCase()) || (c.gstin ?? '').toLowerCase().includes(q.trim().toLowerCase()))
      : masters;
    return [...list].sort((a, b) => (n ? nameTier(a.name ?? '', q) - nameTier(b.name ?? '', q) : 0) || (a.name || '').localeCompare(b.name || '')).slice(0, 50);
  }, [masters, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-[6px] shadow-2xl w-full max-w-lg border border-g200 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-serif text-[18px] text-blk leading-snug">Merge {leadName} into…</h3>
          <div className="mt-3 flex items-center gap-1.5 border border-g200 rounded px-2 h-8 focus-within:border-lead">
            <Search size={12} className="text-g400 shrink-0" />
            <input autoFocus type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Customer name, code or GSTIN…"
              className="bg-transparent border-none outline-none text-[12.5px] w-full" />
          </div>
          <div className="mt-2 max-h-[50vh] overflow-y-auto border border-g100 rounded">
            {shown.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-g400">No Customer Master record matches.</div>
            ) : shown.map(c => (
              <button key={c.id} type="button" onClick={() => onPick(c)}
                className="w-full text-left px-3 py-2 text-[12px] border-b border-g100 last:border-b-0 hover:bg-lead/5">
                <span className="font-mono text-[11px] text-g500 mr-1.5">{c.id}</span>
                <span className="font-semibold text-blk">{c.name}</span>
                <span className="text-g400"> · {[cityOf(c), c.gstin].filter(Boolean).join(' · ') || '—'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-g200 bg-g100/40 rounded-b-[6px]">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// Toast text after a merge.
export const mergeSummary = (r: MergeResult) => {
  const plural = (v: number | undefined, one: string, many: string) => `${Number(v) || 0} ${Number(v) === 1 ? one : many}`;
  const added = r.details_added?.length ?? 0;
  return `Merged: ${plural(r.enquiries, 'enquiry', 'enquiries')}, ${plural(r.quotes, 'quote', 'quotes')}, ${plural(r.orders, 'order', 'orders')} moved · ${plural(added, 'detail', 'details')} added`;
};

// Error text → what to show. MERGE_NOT_ALLOWED → "Only MIS can merge".
export const mergeErrorText = (err: any): string => {
  const msg = String(err?.message ?? err ?? '');
  if (msg.includes('MERGE_NOT_ALLOWED')) return 'Only MIS can merge';
  return `Merge failed: ${msg || 'could not save — check your connection.'}`;
};
