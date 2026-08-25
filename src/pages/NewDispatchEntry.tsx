import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { Search, X } from 'lucide-react';
import { fmtIST, formatINR } from '../lib/utils';
import { DispatchFulfillmentType } from '../lib/types';

const inputCls = "w-full bg-white border border-g200 rounded-[3px] px-2.5 h-8 text-[12.5px] text-blk outline-none focus:border-red-mrt focus:ring-2 focus:ring-red-lt transition-colors";
const labelCls = "font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 mb-1 block";

// Full-page "New Dispatch Entry" form — mirrors the page chrome used by
// NewOrder.tsx (module eyebrow, serif title, Back button) rather than a
// small modal, since this form carries the full order summary + line items.
export function NewDispatchEntry() {
  const navigate = useNavigate();
  const { data, addDispatchEntry } = useAppStore();

  const [type, setType] = useState<DispatchFulfillmentType>('delivery');
  const [orderQuery, setOrderQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [transporter, setTransporter] = useState('');
  const [remark, setRemark] = useState('');
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState('');
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const eligibleOrders = useMemo(() => {
    const takenIds = new Set(data.dispatchEntries.map(e => e.orderId));
    return data.orders.filter(o => o.status === 'Order Confirmed' && !takenIds.has(o.id));
  }, [data.orders, data.dispatchEntries]);

  const filteredOrders = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return eligibleOrders.slice(0, 30);
    return eligibleOrders.filter(o => o.cust.toLowerCase().includes(q) || o.poNo.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)).slice(0, 30);
  }, [eligibleOrders, orderQuery]);

  const selectedOrder = selectedOrderId ? data.orders.find(o => o.id === selectedOrderId) : null;

  const handleSubmit = async () => {
    if (!selectedOrderId || saving) return;
    setSaving(true);
    setError('');
    try {
      await addDispatchEntry(selectedOrderId, type, {
        transporter: transporter || undefined,
        remark: remark || undefined,
        promisedDeliveryDate: promisedDeliveryDate || undefined,
        estimatedDeliveryDate: estimatedDeliveryDate || undefined,
      });
      navigate('/dispatch');
    } catch (err: any) {
      setError(err?.message || 'Could not save — check your connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="pt-4 px-5 pb-3 border-b border-g200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-0.5">Module 04</div>
            <h1 className="font-serif text-[22px] text-blk tracking-tight leading-tight">
              New <em className="italic text-red-mrt">Dispatch Entry</em>
            </h1>
          </div>
          <Button variant="secondary" onClick={() => navigate('/dispatch')}>Back</Button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-8 pt-4 flex-1 overflow-y-auto">
        <div className="max-w-[900px] mx-auto">
          <div className={labelCls}>Fulfillment Type</div>
          <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px] w-fit mb-4">
            <div
              onClick={() => setType('delivery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${type === 'delivery' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
            >
              <span className="w-[7px] h-[7px] rounded-full bg-sN shrink-0" /> Delivery
            </div>
            <div
              onClick={() => setType('self_pickup')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${type === 'self_pickup' ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
            >
              <span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED] shrink-0" /> Self Pickup
            </div>
          </div>

          <div className={labelCls}>Order (must be Order Confirmed){eligibleOrders.length === 0 && <span className="text-g400 normal-case font-normal tracking-normal"> — none available</span>}</div>
          {selectedOrder ? (
            <div className="flex items-center justify-between gap-2 border border-g200 rounded-[3px] px-2.5 h-9 mb-4 bg-g100/50">
              <div className="min-w-0 text-[12.5px]">
                <span className="font-mono font-bold text-sW mr-2">{selectedOrder.id}</span>
                <span className="font-semibold">{selectedOrder.cust}</span>
                <span className="text-g500 font-mono ml-2">{selectedOrder.poNo}</span>
              </div>
              <button onClick={() => setSelectedOrderId(null)} className="text-g400 hover:text-blk shrink-0"><X size={13} /></button>
            </div>
          ) : (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 border border-g200 rounded-[3px] px-2.5 h-8 mb-1.5 focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
                <Search size={11} className="text-g400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search customer, PO No, Order No..."
                  value={orderQuery}
                  onChange={e => setOrderQuery(e.target.value)}
                  className="bg-transparent border-none outline-none font-sans text-[12.5px] text-blk w-full placeholder:text-g400"
                />
              </div>
              <div className="border border-g200 rounded-[3px] max-h-[220px] overflow-y-auto">
                {filteredOrders.length === 0 ? (
                  <div className="text-g400 text-[11.5px] px-2.5 py-3 text-center">No confirmed orders match — pick a different order or check it doesn't already have a dispatch entry.</div>
                ) : (
                  filteredOrders.map(o => (
                    <div
                      key={o.id}
                      onClick={() => setSelectedOrderId(o.id)}
                      className="px-2.5 py-1.5 text-[12px] cursor-pointer hover:bg-g100 border-b border-g100 last:border-b-0 flex items-center gap-2"
                    >
                      <span className="font-mono font-bold text-sW">{o.id}</span>
                      <span className="font-semibold truncate">{o.cust}</span>
                      <span className="text-g500 font-mono text-[10.5px] ml-auto shrink-0">{o.poNo}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {selectedOrder && (
            <div className="mb-4">
              <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g400 mb-2">Order Details (auto-fetched)</div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 mb-3 border border-g200 rounded-[3px] bg-g100/40 px-3 py-2.5">
                <div>
                  <div className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g400">PO Number</div>
                  <div className="text-[12px] text-blk font-medium mt-0.5">{selectedOrder.poNo || '—'}</div>
                </div>
                <div>
                  <div className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g400">PO Date</div>
                  <div className="text-[12px] text-blk font-medium mt-0.5">{selectedOrder.poDate ? fmtIST(new Date(selectedOrder.poDate), 'dd-MMM-yyyy') : '—'}</div>
                </div>
                <div>
                  <div className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g400">Incoterms</div>
                  <div className="text-[12px] text-blk font-medium mt-0.5">{selectedOrder.inco || '—'}</div>
                </div>
                <div>
                  <div className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g400">Payment Terms</div>
                  <div className="text-[12px] text-blk font-medium mt-0.5">{selectedOrder.pay || '—'}</div>
                </div>
              </div>

              <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-sW mb-[7px]">Order Line Items -- {selectedOrder.id}</div>
              <div className="border border-g200 rounded-[3px] overflow-x-auto">
                <table className="w-full border-collapse text-[11.5px] m-0">
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
                    {selectedOrder.items.map(i => {
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
              </div>
            </div>
          )}

          <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g400 mb-2 mt-2">Dispatch Details</div>
          <div className="grid grid-cols-2 gap-3 mb-1">
            <div>
              <label className={labelCls}>Transporter</label>
              <input className={inputCls} value={transporter} onChange={e => setTransporter(e.target.value)} placeholder="Transporter name" />
            </div>
            <div>
              <label className={labelCls}>Promised Delivery Date</label>
              <input type="date" className={inputCls} value={promisedDeliveryDate} onChange={e => setPromisedDeliveryDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Estimated Delivery Date</label>
              <input type="date" className={inputCls} value={estimatedDeliveryDate} onChange={e => setEstimatedDeliveryDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Remark</label>
              <input className={inputCls} value={remark} onChange={e => setRemark(e.target.value)} placeholder="Optional remark" />
            </div>
          </div>

          {error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-[3px] p-2.5 text-[12px] text-red-600 font-medium">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-g200">
            <Button variant="secondary" onClick={() => navigate('/dispatch')}>Cancel</Button>
            <Button variant="dark" disabled={!selectedOrderId || saving} onClick={handleSubmit}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
