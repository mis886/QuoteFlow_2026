import React from 'react';
import { formatINR } from '../lib/utils';
import type { OrderItem } from '../lib/types';

const thCls = 'font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 border-b border-g200';

// Expanded line-item table, shared by List → Delivered and the Dispatch drawer
// (moved here from Dispatch.tsx on 2026-10-13).
//   remaining — barrels still to dispatch per line (remainingByLine); adds a
//     "Remaining" column (the drawer, for a partial dispatch).
//   scroll — the table keeps its natural width and scrolls sideways inside a
//     narrow parent (the drawer) instead of squeezing its columns.
export function LineItemsPanel({ title, items, grand, remaining, scroll = false }: {
  title: string;
  items: OrderItem[];
  grand: number;
  remaining?: Map<number, number>;
  scroll?: boolean;
}) {
  const subTotal = items.reduce((s, i) => s + i.total, 0);
  const itemGst = items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
  const table = (
    <table className={`w-full border-collapse text-[11.5px] m-0 mb-2 ${scroll ? 'min-w-[760px]' : ''}`}>
      <thead className="bg-g100">
        <tr>
          <th className={`${thCls} text-left`}>#</th>
          <th className={`${thCls} text-left`}>Product Name</th>
          <th className={`${thCls} text-left`}>HSN Code</th>
          <th className={`${thCls} text-right`}>No of Barrels</th>
          {remaining && <th className={`${thCls} text-right`}>Remaining</th>}
          <th className={`${thCls} text-right`}>Packing</th>
          <th className={`${thCls} text-right`}>Total Qty</th>
          <th className={`${thCls} text-left`}>Packing Type</th>
          <th className={`${thCls} text-right`}>Unit Rate (₹)</th>
          <th className={`${thCls} text-right`}>GST%</th>
          <th className={`${thCls} text-right`}>Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        {items.map(i => {
          const packNum = parseFloat(i.packing || '');
          const totalQty = i.qty > 0 && packNum > 0 ? i.qty * packNum : null;
          const left = remaining?.get(i.seq) ?? 0;
          return (
            <tr key={i.seq}>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[10px] text-g400 w-6">{i.seq}</td>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-medium">{i.desc}</td>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[10px]">{i.hsn || '—'}</td>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[11.5px] font-bold text-right">{i.qty}</td>
              {remaining && (
                <td className={`px-2.5 py-1.5 border-b border-g100 font-mono text-[11.5px] font-bold text-right ${left > 0 ? 'text-red-mrt' : 'text-g400'}`}>{left}</td>
              )}
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[11px] text-right">{i.packing || '—'}</td>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[11.5px] font-bold text-right">{totalQty ?? '—'}</td>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk text-[11px] text-g600">{i.packingType || '—'}</td>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-right">{formatINR(i.agreedRate)}</td>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-right">{i.gst}%</td>
              <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono font-bold text-right">{formatINR(i.total)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <div className="p-[10px_16px]">
      <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-sW mb-[7px]">{title}</div>
      {items.length === 0 ? (
        <div className="text-g400 text-[11.5px] py-2">No line items recorded.</div>
      ) : scroll ? <div className="overflow-x-auto">{table}</div> : table}
      {items.length > 0 && (
        <div className={`flex justify-end pt-2 border-t border-g200 items-center ${scroll ? 'flex-wrap gap-x-5 gap-y-1' : 'gap-5'}`}>
          <span className="text-[12px] text-g600">Sub-Total: <strong className="text-blk font-bold font-mono">{formatINR(subTotal)}</strong></span>
          <span className="text-[12px] text-g600">GST: <strong className="text-blk font-bold font-mono">{formatINR(Math.round(itemGst))}</strong></span>
          <span className="text-[13px] text-red-mrt font-bold font-mono tracking-tight">Grand: {formatINR(Math.round(grand))}</span>
        </div>
      )}
    </div>
  );
}
