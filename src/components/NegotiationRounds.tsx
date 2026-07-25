import { useState } from 'react';
import { useAppStore } from '../store';
import { Quote, NegotiationRound, NegotiationRoundItem } from '../lib/types';
import { Plus, X, CheckCircle2 } from 'lucide-react';
import { cn, fmtIST } from '../lib/utils';
import { parseISO } from 'date-fns';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// A discount_pct with no explicit revised_unit_price is applied against
// original_unit_price rather than requiring the user to hand-calculate it.
function effectivePrice(it: NegotiationRoundItem): number | null {
  if (it.revised_unit_price != null) return it.revised_unit_price;
  if (it.discount_pct != null) return it.original_unit_price * (1 - it.discount_pct / 100);
  return null;
}

function fmtPrice(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function roundSummary(round: NegotiationRound): string {
  const touched = round.items.filter(it => it.revised_unit_price != null || it.discount_pct != null);
  const total = round.items.length;
  if (touched.length === 0) return 'Terms discussion';
  if (touched.length === 1) {
    const it = touched[0];
    const price = effectivePrice(it);
    const detail = [
      price != null ? `${fmtPrice(it.original_unit_price)} → ${fmtPrice(price)}` : null,
      it.discount_pct != null ? `-${it.discount_pct}%` : null,
    ].filter(Boolean).join(', ');
    return `revised pricing on 1 of ${total} item${total === 1 ? '' : 's'} (${it.desc}: ${detail})`;
  }
  return `revised pricing on ${touched.length} of ${total} items`;
}

interface ItemRow {
  seq: number;
  desc: string;
  original_unit_price: number;
  revisedUnitPrice: string;
  discountPct: string;
}

export function NegotiationRounds({ quote }: { quote: Quote }) {
  const { data, updateQuote, addFollowUpLog, stampName } = useAppStore();
  const rounds = quote.negotiations ?? [];

  const [activeRound, setActiveRound] = useState(rounds.length > 0 ? rounds.length - 1 : 0);
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [requestedBy, setRequestedBy] = useState<'customer' | 'internal'>('customer');
  const [notes, setNotes] = useState('');
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const openForm = () => {
    setItemRows(quote.items.map(it => ({
      seq: it.seq,
      desc: it.desc,
      original_unit_price: it.unitPrice,
      revisedUnitPrice: '',
      discountPct: '',
    })));
    setShowForm(true);
  };

  const resetForm = () => {
    setDate(todayISO());
    setRequestedBy('customer');
    setNotes('');
    setItemRows([]);
    setErrorMsg('');
  };

  const updateRow = (seq: number, field: 'revisedUnitPrice' | 'discountPct', value: string) => {
    setItemRows(rows => rows.map(r => r.seq === seq ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const round = rounds.length + 1;
      const items: NegotiationRoundItem[] = itemRows.map(r => ({
        seq: r.seq,
        desc: r.desc,
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
          note: `Negotiation round ${round} added — ${roundSummary(newRound)}`,
          channel: 'Internal',
        },
        existing?.next_date ?? null,
        existing?.next_time ?? null,
        existing?.owner || stampName(),
        'Negotiation',
      );

      resetForm();
      setShowForm(false);
      setActiveRound(round - 1);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save negotiation round');
    } finally {
      setSaving(false);
    }
  };

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
            onClick={() => { resetForm(); setShowForm(false); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-[4px] border border-g200 text-g500 bg-white hover:bg-g50 hover:text-blk transition-colors"
          >
            <X size={12} /> Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={openForm}
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

          {current && (
            <div className="border border-g200 rounded-[4px] divide-y divide-g100 text-[12px]">
              <div className="p-3 bg-g50 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-g500 font-mono text-[9px] font-bold tracking-wider mb-0.5 uppercase">Date</div>
                  <div className="text-blk font-medium">{current.date}</div>
                </div>
                <div>
                  <div className="text-g500 font-mono text-[9px] font-bold tracking-wider mb-0.5 uppercase">Requested By</div>
                  <div className="text-blk font-medium capitalize">{current.requested_by}</div>
                </div>
              </div>

              <div className="bg-white">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="text-g400 font-mono text-[9px] uppercase tracking-wider">
                      <th className="text-left px-3 py-2 font-bold">Product</th>
                      <th className="text-right px-3 py-2 font-bold">Original Price</th>
                      <th className="text-right px-3 py-2 font-bold">Revised Price</th>
                      <th className="text-right px-3 py-2 font-bold">Discount %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.items.map(it => {
                      const price = effectivePrice(it);
                      return (
                        <tr key={it.seq} className="border-t border-g100">
                          <td className="px-3 py-1.5 text-blk">{it.desc}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-g600">{fmtPrice(it.original_unit_price)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-blk font-medium">{price != null ? fmtPrice(price) : '—'}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-g600">{it.discount_pct != null ? `${it.discount_pct}%` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {current.notes && (
                <div className="p-3 bg-white">
                  <div className="text-g500 font-mono text-[9px] font-bold tracking-wider mb-1 uppercase">Notes</div>
                  <div className="text-g600 leading-relaxed whitespace-pre-wrap">{current.notes}</div>
                </div>
              )}
              <div className="p-3 bg-white text-[10px] text-g400">
                <span className="font-semibold text-g500">{current.doer}</span>
                {' · '}
                {fmtIST(parseISO(current.created_at), 'dd MMM, HH:mm')}
              </div>
            </div>
          )}
        </>
      )}

      {showForm && (
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

          <div className="border border-g200 rounded-[3px] overflow-hidden">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="bg-g50 text-g400 font-mono text-[9px] uppercase tracking-wider">
                  <th className="text-left px-2 py-1.5 font-bold">Product</th>
                  <th className="text-right px-2 py-1.5 font-bold w-[110px]">Revised Price</th>
                  <th className="text-right px-2 py-1.5 font-bold w-[90px]">Discount %</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.map(row => (
                  <tr key={row.seq} className="border-t border-g100">
                    <td className="px-2 py-1.5 text-blk bg-white">
                      {row.desc}
                      <span className="block text-[9px] text-g400">was {fmtPrice(row.original_unit_price)}</span>
                    </td>
                    <td className="px-2 py-1 bg-white">
                      <input
                        type="number"
                        title={`Revised unit price for ${row.desc}`}
                        placeholder="—"
                        value={row.revisedUnitPrice}
                        onChange={e => updateRow(row.seq, 'revisedUnitPrice', e.target.value)}
                        className="w-full text-right bg-white border border-g300 rounded-[3px] px-2 py-[4px] text-[11.5px] outline-none focus:border-red-mrt"
                      />
                    </td>
                    <td className="px-2 py-1 bg-white">
                      <input
                        type="number"
                        title={`Discount percentage for ${row.desc}`}
                        placeholder="—"
                        value={row.discountPct}
                        onChange={e => updateRow(row.seq, 'discountPct', e.target.value)}
                        className="w-full text-right bg-white border border-g300 rounded-[3px] px-2 py-[4px] text-[11.5px] outline-none focus:border-red-mrt"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
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
              onClick={() => { resetForm(); setShowForm(false); }}
              disabled={saving}
              className="h-7 px-3 border border-g200 rounded-[3px] text-[10px] font-medium text-g500 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="h-7 inline-flex items-center gap-1 px-3 bg-red-mrt text-white text-[10px] font-bold tracking-wider uppercase rounded-[3px] hover:bg-red-h disabled:opacity-50"
            >
              <CheckCircle2 size={10} /> Save
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
