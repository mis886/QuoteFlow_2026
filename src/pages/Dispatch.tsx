import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { canDeleteRecords, formatINR, fmtDate, fmtIST } from '../lib/utils';
import { Order, DispatchEntry, DispatchFulfillmentType } from '../lib/types';

export function Dispatch() {
  const navigate = useNavigate();
  const { data, user, deleteDispatchEntry } = useAppStore();
  const canDelete = canDeleteRecords(user?.email);

  const [tab, setTab] = useState<'toDispatch' | 'toSend'>('toDispatch');
  const [subType, setSubType] = useState<DispatchFulfillmentType>('delivery');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const entries = data.dispatchEntries;
  const selfPickupCount = entries.filter(e => e.fulfillmentType === 'self_pickup').length;
  const deliveryCount = entries.filter(e => e.fulfillmentType === 'delivery').length;

  const visibleEntries = useMemo(
    () => entries.filter(e => e.fulfillmentType === subType).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [entries, subType],
  );

  const orderFor = (entry: DispatchEntry): Order | undefined => data.orders.find(o => o.id === entry.orderId);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Module 04</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Dispatch <em className="italic text-red-mrt">Control</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">Every confirmed order, stage by stage — split by how it leaves the warehouse.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2.5 mt-4 bg-white border-b border-g200 flex-wrap">
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <div
            onClick={() => setTab('toDispatch')}
            className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${tab === 'toDispatch' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
          >
            Order → Dispatch ({entries.length})
          </div>
          <div
            title="Parked for a later phase — not built yet"
            className="px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium text-g400 whitespace-nowrap select-none cursor-not-allowed"
          >
            Dispatch → Sent
          </div>
        </div>

        {tab === 'toDispatch' && (
          <>
            <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
            <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
              <div
                onClick={() => setSubType('delivery')}
                className={`flex items-center gap-1.5 px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${subType === 'delivery' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
              >
                <span className="w-[7px] h-[7px] rounded-full bg-sN shrink-0" /> Delivery ({deliveryCount})
              </div>
              <div
                onClick={() => setSubType('self_pickup')}
                className={`flex items-center gap-1.5 px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${subType === 'self_pickup' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
              >
                <span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED] shrink-0" /> Self Pickup ({selfPickupCount})
              </div>
            </div>
          </>
        )}

        <div className="ml-auto font-mono text-[10px] text-g500">{visibleEntries.length} entr{visibleEntries.length === 1 ? 'y' : 'ies'}</div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        {tab === 'toSend' ? (
          <div className="bg-white border border-g200 rounded-[4px] p-10 text-center text-g400 text-[13px]">
            Dispatch → Sent is parked for a later phase — not built yet.
          </div>
        ) : (
          <div className="bg-white border border-g200 overflow-x-auto m-0">
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-g100">
                <tr>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Order Ref</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Customer</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">PO No.</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Fulfillment</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Items</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-right whitespace-nowrap border-b border-g200">Value</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Transporter</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Promised Delivery</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Estimated Delivery</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Dispatched On</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 ? (
                  <tr><td colSpan={11} className="text-center p-8 text-g400 text-[13px]">No {subType === 'self_pickup' ? 'Self Pickup' : 'Delivery'} entries yet</td></tr>
                ) : (
                  visibleEntries.map(entry => {
                    const order = orderFor(entry);
                    const isExpanded = expandedRow === entry.id;
                    const lineItems = (entry.items && entry.items.length > 0) ? entry.items : (order?.items || []);
                    const subTotal = lineItems.reduce((s, i) => s + i.total, 0);
                    const itemGst = lineItems.reduce((s, i) => s + (i.total * i.gst / 100), 0);
                    return (
                      <React.Fragment key={entry.id}>
                        <tr
                          className={`group transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sW/5 ${isExpanded ? 'bg-sW/5' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                        >
                          <td className="px-[13px] py-[10px] align-top"><span className="font-mono text-[10px] font-bold text-sQ">{entry.orderId}</span></td>
                          <td className="px-[13px] py-[10px] align-top">
                            <div className="font-semibold">{order?.cust || '—'}</div>
                          </td>
                          <td className="px-[13px] py-[10px] align-top font-mono text-[10.5px]">{order?.poNo || '—'}</td>
                          <td className="px-[13px] py-[10px] align-top">{entry.fulfillmentType === 'self_pickup' ? 'Self Pickup' : 'Delivery'}</td>
                          <td className="px-[13px] py-[10px] align-top">{entry.items?.length ?? 0} item(s)</td>
                          <td className="px-[13px] py-[10px] align-top text-right font-mono text-[12px] font-bold">{formatINR(Math.round(entry.value || 0))}</td>
                          <td className="px-[13px] py-[10px] align-top">{entry.transporter || '—'}</td>
                          <td className="px-[13px] py-[10px] align-top">{fmtDate(entry.promisedDeliveryDate)}</td>
                          <td className="px-[13px] py-[10px] align-top">{fmtDate(entry.estimatedDeliveryDate)}</td>
                          <td className="px-[13px] py-[10px] align-top">{entry.created_at ? fmtIST(new Date(entry.created_at), 'dd-MMM-yyyy') : '—'}</td>
                          <td className="px-[13px] py-[10px] align-top" onClick={ev => ev.stopPropagation()}>
                            <div className="flex gap-1.5 flex-wrap">
                              <Button size="sm" variant="secondary" onClick={() => navigate(`/dispatch/new?orderRef=${entry.orderId}`)}>Edit</Button>
                              {canDelete && (
                                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={async () => {
                                  if (!confirm(`Are you sure you want to delete the dispatch entry for ${entry.orderId}? This action cannot be undone.`)) return;
                                  try {
                                    await deleteDispatchEntry(entry.id);
                                  } catch (err: any) {
                                    alert(`Delete failed: ${err?.message || JSON.stringify(err)}`);
                                  }
                                }}>Delete</Button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-sW/[0.02] border-b-2 border-sW">
                            <td colSpan={11} className="p-0">
                              <div className="p-[10px_16px]">
                                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-sW mb-[7px]">Dispatch Line Items -- {entry.orderId}</div>
                                {lineItems.length === 0 ? (
                                  <div className="text-g400 text-[11.5px] py-2">No line items recorded for this dispatch entry.</div>
                                ) : (
                                  <table className="w-full border-collapse text-[11.5px] m-0 mb-2">
                                    <thead className="bg-g100">
                                      <tr>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">#</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Product Name</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">HSN Code</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-right border-b border-g200">No of Barrels</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-right border-b border-g200">Packing</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-right border-b border-g200">Total Qty</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Packing Type</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-right border-b border-g200">Unit Rate (₹)</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-right border-b border-g200">GST%</th>
                                        <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-right border-b border-g200">Amount (₹)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lineItems.map(i => {
                                        const packNum = parseFloat(i.packing || '');
                                        const totalQty = i.qty > 0 && packNum > 0 ? i.qty * packNum : null;
                                        return (
                                          <tr key={i.seq}>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[10px] text-g400 w-6">{i.seq}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-medium">{i.desc}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[10px]">{i.hsn || '—'}</td>
                                            <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[11.5px] font-bold text-right">{i.qty}</td>
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
                                )}
                                {lineItems.length > 0 && (
                                  <div className="flex justify-end pt-2 border-t border-g200 gap-5 items-center">
                                    <span className="text-[12px] text-g600">Sub-Total: <strong className="text-blk font-bold font-mono">{formatINR(subTotal)}</strong></span>
                                    <span className="text-[12px] text-g600">GST: <strong className="text-blk font-bold font-mono">{formatINR(Math.round(itemGst))}</strong></span>
                                    <span className="text-[13px] text-red-mrt font-bold font-mono tracking-tight">Grand: {formatINR(Math.round(entry.value || 0))}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

