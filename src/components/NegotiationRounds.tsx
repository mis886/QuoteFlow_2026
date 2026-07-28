import { useState } from 'react';
import { useAppStore } from '../store';
import { Quote, NegotiationRound, NegotiationRoundItem } from '../lib/types';
import { Plus, X, CheckCircle2 } from 'lucide-react';
import { cn, fmtIST, formatINR, formatUSD, computeItemTotal, computeQuoteTotals, effectiveNegotiatedPrice as effectivePrice } from '../lib/utils';
import { QuoteTotalsFooter } from './QuoteTotalsFooter';
import { parseISO } from 'date-fns';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtPrice(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// Same derivation as the quote's own Line Items table: qty * packing size,
// only shown when both are meaningful numbers.
function totalQty(qty: number, packing?: string): string {
  const p = parseFloat(packing || '');
  const t = qty * p;
  return (p > 0 && qty > 0) ? String(Number.isInteger(t) ? t : t) : '—';
}

// items are only ever the ones the user selected for this round — total is
// the quote's full item count at save time, for the "N of M" phrasing.
function roundSummary(items: NegotiationRoundItem[], total: number): string {
  if (items.length === 0) return 'Terms discussion';
  if (items.length === 1) {
    const it = items[0];
    const price = effectivePrice(it);
    const detail = [
      price != null ? `${fmtPrice(it.original_unit_price)} → ${fmtPrice(price)}` : null,
      it.discount_pct != null ? `-${it.discount_pct}%` : null,
    ].filter(Boolean).join(', ');
    return `revised pricing on 1 of ${total} item${total === 1 ? '' : 's'} (${it.desc}: ${detail})`;
  }
  return `revised pricing on ${items.length} of ${total} items`;
}

interface ItemRow {
  seq: number;
  desc: string;
  hsn: string;
  qty: number;
  packing?: string;
  packingType?: string;
  priceBasis?: string;
  priceBasisConv?: number;
  gst: number;
  original_unit_price: number;
  checked: boolean;
  revisedUnitPrice: string;
  discountPct: string;
}

// Effective price for a row mid-edit: revised rate wins, else discount % off
// original, else the item's own unrevised price (mirrors effectivePrice()
// for saved NegotiationRoundItems, but sourced from live form state).
function rowEffectivePrice(row: ItemRow): number {
  if (row.checked && row.revisedUnitPrice) return Number(row.revisedUnitPrice);
  if (row.checked && row.discountPct) return row.original_unit_price * (1 - Number(row.discountPct) / 100);
  return row.original_unit_price;
}

const th = 'font-mono text-[8px] tracking-[1px] uppercase text-g500 px-2 py-1.5 text-left border border-g300';

// Read-only detail for a single saved round: items table + its own
// Subtotal/Insurance/GST/Grand Total + notes/doer. Shared by the tabbed
// view inside NegotiationRounds (Preview / DetailPanel) and by the quote
// edit Form step, which stacks every round's detail one after another
// instead of tab-switching between them.
export function NegotiationRoundDetail({ quote, round }: { quote: Quote; round: NegotiationRound }) {
  const sym = quote.curr === 'USD' ? '$' : '₹';
  const fmtAmt = (v: number) => quote.curr === 'USD' ? formatUSD(v) : formatINR(v);
  // Totals for just this round's items (not the whole quote — round.items is
  // only the subset that was selected, so this is a "this round" subtotal,
  // not a reconstructed whole-quote grand total for that point in time).
  const totals = computeQuoteTotals(
    round.items.map(it => ({
      total: computeItemTotal(it.qty, it.packing, effectivePrice(it) ?? it.original_unit_price, 1),
      gst: it.gst,
    })),
    quote.curr,
    quote.insurance ?? 0,
  );

  return (
    <div className="border border-g200 rounded-[4px] divide-y divide-g100 text-[12px]">
      <div className="p-3 bg-g50 grid grid-cols-2 gap-3">
        <div>
          <div className="text-g500 font-mono text-[9px] font-bold tracking-wider mb-0.5 uppercase">Date</div>
          <div className="text-blk font-medium">{round.date}</div>
        </div>
        <div>
          <div className="text-g500 font-mono text-[9px] font-bold tracking-wider mb-0.5 uppercase">Requested By</div>
          <div className="text-blk font-medium capitalize">{round.requested_by}</div>
        </div>
      </div>

      <div className="bg-white overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-g100">
            <tr>
              <th className={cn(th, 'w-8')}>#</th>
              <th className={cn(th, 'text-red-mrt')}>Product Name</th>
              <th className={cn(th, 'w-20')}>HSN Code</th>
              <th className={cn(th, 'text-center w-20')}>No of Barrels</th>
              <th className={cn(th, 'text-center w-16')}>Packing</th>
              <th className={cn(th, 'text-center w-16')}>Total Qty</th>
              <th className={cn(th, 'text-center w-24')}>Packing Type</th>
              <th className={cn(th, 'text-center w-20')}>Price Basis</th>
              <th className={cn(th, 'text-right w-20')}>Unit Rate ({sym})</th>
              <th className={cn(th, 'text-center w-14')}>GST %</th>
              <th className={cn(th, 'text-right w-20')}>Revised Rate ({sym})</th>
              <th className={cn(th, 'text-center w-16')}>Discount %</th>
            </tr>
          </thead>
          <tbody>
            {round.items.map(it => {
              const price = effectivePrice(it);
              return (
                <tr key={it.seq}>
                  <td className="px-2 py-1.5 border border-g200 font-mono font-bold text-g400">{it.seq}</td>
                  <td className="px-2 py-1.5 border border-g200 text-blk">{it.desc}</td>
                  <td className="px-2 py-1.5 border border-g200 font-mono text-g500">{it.hsn || '—'}</td>
                  <td className="px-2 py-1.5 border border-g200 text-center">{it.qty}</td>
                  <td className="px-2 py-1.5 border border-g200 text-center">{it.packing || '—'}</td>
                  <td className="px-2 py-1.5 border border-g200 text-center bg-g50 text-g500">{totalQty(it.qty, it.packing)}</td>
                  <td className="px-2 py-1.5 border border-g200 text-center">{it.packingType || '—'}</td>
                  <td className="px-2 py-1.5 border border-g200 text-center">{it.priceBasis || '—'}</td>
                  <td className="px-2 py-1.5 border border-g200 text-right font-mono text-g600">{fmtPrice(it.original_unit_price)}</td>
                  <td className="px-2 py-1.5 border border-g200 text-center font-mono">{it.gst}%</td>
                  <td className="px-2 py-1.5 border border-g200 text-right font-mono text-blk font-bold">{price != null ? fmtPrice(price) : '—'}</td>
                  <td className="px-2 py-1.5 border border-g200 text-center font-mono text-g600">{it.discount_pct != null ? `${it.discount_pct}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-white">
        <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-2">Negotiated Total (this round's items)</div>
        <table className="w-full border-collapse text-[11px]">
          <QuoteTotalsFooter
            colSpan={1}
            curr={quote.curr}
            subTotal={totals.subTotal}
            gstTotal={totals.gstTotal}
            grandTotal={totals.grandTotal}
            fmtAmt={fmtAmt}
            insurance={quote.insurance ?? 0}
          />
        </table>
      </div>

      {round.notes && (
        <div className="p-3 bg-white">
          <div className="text-g500 font-mono text-[9px] font-bold tracking-wider mb-1 uppercase">Notes</div>
          <div className="text-g600 leading-relaxed whitespace-pre-wrap">{round.notes}</div>
        </div>
      )}
      <div className="p-3 bg-white text-[10px] text-g400">
        <span className="font-semibold text-g500">{round.doer}</span>
        {' · '}
        {fmtIST(parseISO(round.created_at), 'dd MMM, HH:mm')}
      </div>
    </div>
  );
}

// The "add a round" inline form: item picker (checkboxes + revised rate/
// discount %), live negotiated-total preview, notes, save/cancel. Fully
// self-contained (owns its own field state, seeded from quote.items at
// mount) and controlled only via onCancel/onSaved, so it can be dropped
// in wherever a round needs to be addable — NegotiationRounds' own header
// button (Preview/DetailPanel) and the quote edit Form step both render
// this the same way, each behind their own "+ Add Negotiation Round"
// toggle button.
export function NegotiationRoundForm({
  quote, onCancel, onSaved,
}: {
  quote: Quote;
  onCancel: () => void;
  onSaved: (round: number) => void;
}) {
  const { data, updateQuote, addFollowUpLog, stampName } = useAppStore();
  const rounds = quote.negotiations ?? [];
  const sym = quote.curr === 'USD' ? '$' : '₹';
  const fmtAmt = (v: number) => quote.curr === 'USD' ? formatUSD(v) : formatINR(v);

  const [date, setDate] = useState(todayISO());
  const [requestedBy, setRequestedBy] = useState<'customer' | 'internal'>('customer');
  const [notes, setNotes] = useState('');
  const [itemRows, setItemRows] = useState<ItemRow[]>(() => quote.items.map(it => ({
    seq: it.seq,
    desc: it.desc,
    hsn: it.hsn,
    qty: it.qty,
    packing: it.packing,
    packingType: it.packingType,
    priceBasis: it.priceBasis,
    priceBasisConv: it.priceBasisConv,
    gst: it.gst,
    original_unit_price: it.unitPrice,
    checked: false,
    revisedUnitPrice: '',
    discountPct: '',
  })));
  // Preview-only insurance override for the negotiated-total footer below —
  // starts at the quote's actual current insurance, but toggling/editing it
  // here never writes back to the quote (this whole table is a live preview).
  const [previewInsurance, setPreviewInsurance] = useState(quote.insurance ?? 0);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const toggleRow = (seq: number) => {
    setItemRows(rows => rows.map(r => r.seq === seq ? { ...r, checked: !r.checked } : r));
  };

  const updateRow = (seq: number, field: 'revisedUnitPrice' | 'discountPct', value: string) => {
    setItemRows(rows => rows.map(r => r.seq === seq ? { ...r, [field]: value } : r));
  };

  const checkedRows = itemRows.filter(r => r.checked);
  const invalidCheckedRow = checkedRows.find(r => !r.revisedUnitPrice && !r.discountPct);
  const canSave = checkedRows.length > 0 && !invalidCheckedRow;

  // Live preview: every quote item at its negotiated price if checked (revised
  // rate or discount % applied), else its normal unitPrice — run through the
  // same totals calc the real Line Items table uses, so this is what the
  // quote's Grand Total would become if these negotiated prices were applied.
  // Preview only — does not touch the quote's own items/totals.
  const previewTotals = computeQuoteTotals(
    itemRows.map(row => ({
      total: computeItemTotal(row.qty, row.packing, rowEffectivePrice(row), row.priceBasisConv),
      gst: row.gst,
    })),
    quote.curr,
    previewInsurance,
  );

  const handleSave = async () => {
    if (checkedRows.length === 0) { setErrorMsg('Select at least one item for this round.'); return; }
    if (invalidCheckedRow) { setErrorMsg(`Enter a revised price or discount % for ${invalidCheckedRow.desc}.`); return; }

    setSaving(true);
    setErrorMsg('');
    try {
      const round = rounds.length + 1;
      const items: NegotiationRoundItem[] = checkedRows.map(r => ({
        seq: r.seq,
        desc: r.desc,
        hsn: r.hsn,
        qty: r.qty,
        packing: r.packing,
        packingType: r.packingType,
        priceBasis: r.priceBasis,
        gst: r.gst,
        original_unit_price: r.original_unit_price,
        revised_unit_price: r.revisedUnitPrice ? Number(r.revisedUnitPrice) : null,
        discount_pct: r.discountPct ? Number(r.discountPct) : null,
      }));
      const newRound: NegotiationRound = {
        round,
        date,
        requested_by: requestedBy,
        notes: notes.trim() || undefined,
        doer: stampName(),
        created_at: new Date().toISOString(),
        items,
      };
      await updateQuote(quote.id, { negotiations: [...rounds, newRound] });

      const existing = data.followups.find(f => f.quote_id === quote.id);
      await addFollowUpLog(
        quote.id,
        {
          ts: new Date().toISOString(),
          who: stampName(),
          note: `Negotiation round ${round} added — ${roundSummary(items, itemRows.length)}`,
          channel: 'Internal',
        },
        existing?.next_date ?? null,
        existing?.next_time ?? null,
        existing?.owner || stampName(),
        'Negotiation',
      );

      onSaved(round);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save negotiation round');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-3 py-3 bg-red-lt/30 border border-red-mrt/20 rounded-[4px] space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Date</label>
          <input
            type="date"
            title="Negotiation round date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[11.5px] outline-none focus:border-red-mrt"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Requested By</label>
          <select
            title="Who initiated this round"
            value={requestedBy}
            onChange={e => setRequestedBy(e.target.value as 'customer' | 'internal')}
            className="w-full bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[11.5px] outline-none focus:border-red-mrt"
          >
            <option value="customer">Customer</option>
            <option value="internal">Internal</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border border-g300 rounded-[3px]">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-g100">
            <tr>
              <th className={cn(th, 'w-6')}></th>
              <th className={cn(th, 'w-8')}>#</th>
              <th className={cn(th, 'text-red-mrt')}>Product Name</th>
              <th className={cn(th, 'w-20')}>HSN Code</th>
              <th className={cn(th, 'text-center w-20')}>No of Barrels</th>
              <th className={cn(th, 'text-center w-16')}>Packing</th>
              <th className={cn(th, 'text-center w-16')}>Total Qty</th>
              <th className={cn(th, 'text-center w-24')}>Packing Type</th>
              <th className={cn(th, 'text-center w-20')}>Price Basis</th>
              <th className={cn(th, 'text-right w-20')}>Unit Rate ({sym})</th>
              <th className={cn(th, 'text-center w-14')}>GST %</th>
              <th className={cn(th, 'text-right w-24')}>Revised Rate ({sym})</th>
              <th className={cn(th, 'text-center w-20')}>Discount %</th>
            </tr>
          </thead>
          <tbody>
            {itemRows.map(row => (
              <tr key={row.seq} className={cn(!row.checked && 'opacity-50')}>
                <td className="px-2 py-1.5 border border-g200 align-middle bg-white">
                  <input
                    type="checkbox"
                    title="Include in this round"
                    checked={row.checked}
                    onChange={() => toggleRow(row.seq)}
                  />
                </td>
                <td className="px-2 py-1.5 border border-g200 font-mono font-bold text-g400 bg-white">{row.seq}</td>
                <td className="px-2 py-1.5 border border-g200 text-blk bg-white">{row.desc}</td>
                <td className="px-2 py-1.5 border border-g200 font-mono text-g500 bg-white">{row.hsn || '—'}</td>
                <td className="px-2 py-1.5 border border-g200 text-center bg-white">{row.qty}</td>
                <td className="px-2 py-1.5 border border-g200 text-center bg-white">{row.packing || '—'}</td>
                <td className="px-2 py-1.5 border border-g200 text-center bg-g50 text-g500">{totalQty(row.qty, row.packing)}</td>
                <td className="px-2 py-1.5 border border-g200 text-center bg-white">{row.packingType || '—'}</td>
                <td className="px-2 py-1.5 border border-g200 text-center bg-white">{row.priceBasis || '—'}</td>
                <td className="px-2 py-1.5 border border-g200 text-right font-mono text-g600 bg-white">{fmtPrice(row.original_unit_price)}</td>
                <td className="px-2 py-1.5 border border-g200 text-center font-mono bg-white">{row.gst}%</td>
                <td className="px-1 py-1 border border-g200 bg-white">
                  <input
                    type="number"
                    title={`Revised unit price for ${row.desc}`}
                    placeholder="—"
                    value={row.revisedUnitPrice}
                    disabled={!row.checked}
                    onChange={e => updateRow(row.seq, 'revisedUnitPrice', e.target.value)}
                    className="w-full text-right bg-white border border-g300 rounded-[3px] px-1.5 py-[4px] text-[11px] outline-none focus:border-red-mrt disabled:bg-g100 disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-1 py-1 border border-g200 bg-white">
                  <input
                    type="number"
                    title={`Discount percentage for ${row.desc}`}
                    placeholder="—"
                    value={row.discountPct}
                    disabled={!row.checked}
                    onChange={e => updateRow(row.seq, 'discountPct', e.target.value)}
                    className="w-full text-right bg-white border border-g300 rounded-[3px] px-1.5 py-[4px] text-[11px] outline-none focus:border-red-mrt disabled:bg-g100 disabled:cursor-not-allowed"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-g200 rounded-[3px] p-3">
        <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt mb-2">Negotiated Total (preview — not saved)</div>
        <table className="w-full border-collapse text-[11px]">
          <QuoteTotalsFooter
            colSpan={1}
            curr={quote.curr}
            subTotal={previewTotals.subTotal}
            gstTotal={previewTotals.gstTotal}
            grandTotal={previewTotals.grandTotal}
            fmtAmt={fmtAmt}
            insurance={previewInsurance}
            onApplyInsurance={() => setPreviewInsurance(Math.round(previewTotals.subTotal * 0.0015 * 100) / 100)}
            onInsuranceChange={setPreviewInsurance}
          />
        </table>
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="What was discussed / requested?"
        rows={2}
        className="w-full bg-white border border-g300 rounded-[3px] px-2 py-1.5 text-[12px] outline-none focus:border-red-mrt resize-none"
      />

      {errorMsg && <div className="text-[10px] text-red-mrt font-medium">{errorMsg}</div>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-7 px-3 border border-g200 rounded-[3px] text-[10px] font-medium text-g500 hover:bg-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !canSave}
          className="h-7 inline-flex items-center gap-1 px-3 bg-red-mrt text-white text-[10px] font-bold tracking-wider uppercase rounded-[3px] hover:bg-red-h disabled:opacity-50"
        >
          <CheckCircle2 size={10} /> Save
        </button>
      </div>
    </div>
  );
}

// Full negotiation section for Preview/DetailPanel: header (round count +
// add/cancel toggle), a tab per round with NegotiationRoundDetail, and
// NegotiationRoundForm when adding. Unconditional on quote.status — every
// quote can have rounds added regardless of Draft/Sent/Won/Lost/etc.
export function NegotiationRounds({ quote }: { quote: Quote }) {
  const rounds = quote.negotiations ?? [];

  const [activeRound, setActiveRound] = useState(rounds.length > 0 ? rounds.length - 1 : 0);
  const [showForm, setShowForm] = useState(false);

  const current = rounds[activeRound];

  return (
    <section>
      <div className="mb-[12px] pb-[7px] border-b border-g200 mt-8 flex items-center justify-between gap-3">
        <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt">
          Negotiation{rounds.length > 0 ? ` · ${rounds.length} round${rounds.length === 1 ? '' : 's'}` : ''}
        </span>
        {showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-[4px] border border-g200 text-g500 bg-white hover:bg-g50 hover:text-blk transition-colors"
          >
            <X size={12} /> Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-[4px] border border-red-mrt bg-red-mrt text-white hover:bg-red-h transition-colors shadow-sm"
          >
            <Plus size={12} /> Add Negotiation Round
          </button>
        )}
      </div>

      {rounds.length > 0 && !showForm && (
        <>
          <div className="flex gap-0 border-b border-g200 mb-3">
            {rounds.map((r, i) => (
              <button
                key={r.round}
                type="button"
                onClick={() => setActiveRound(i)}
                className={cn(
                  'px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider uppercase border-b-2 -mb-px transition-colors focus:outline-none',
                  i === activeRound ? 'border-red-mrt text-red-mrt' : 'border-transparent text-g400 hover:text-g600'
                )}
              >
                Negotiation {r.round}
              </button>
            ))}
          </div>

          {current && <NegotiationRoundDetail quote={quote} round={current} />}
        </>
      )}

      {showForm && (
        <NegotiationRoundForm
          quote={quote}
          onCancel={() => setShowForm(false)}
          onSaved={(round) => { setShowForm(false); setActiveRound(round - 1); }}
        />
      )}
    </section>
  );
}
