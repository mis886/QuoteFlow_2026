import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { Search, X } from 'lucide-react';
import { formatINR, siteLabel, PAY_OPTIONS, canDeleteRecords } from '../lib/utils';
import { DispatchFulfillmentType, Order, CustomerTier } from '../lib/types';

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow disabled:bg-g50 disabled:cursor-not-allowed disabled:text-g500";
const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt disabled:opacity-60 disabled:cursor-not-allowed";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";
const sectionHeaderCls = "font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt p-[11px_16px] border-b border-g200";

const INCO_OPTIONS = [
  'EXW', 'FOB', 'CIF', 'CFR', 'DAP', 'DDP', 'FCA',
  'Ex Bhiwandi Warehouse', 'Ex Bhiwandi Warehouse Self Pickup',
  'Ex Factory Warehouse', 'Delivered', 'Free Delivery till Transport', 'Ex-Port',
];

// Full-page "New Dispatch Entry" form — mirrors the page chrome + bordered
// card sections used by NewOrder.tsx (Customer & Contact / Delivery Terms
// panels) rather than a small modal, since this form carries the full order
// summary + line items. Also doubles as the "Edit" flow for an already
// created dispatch entry: opened as /dispatch/new?orderRef=<orderId>, it
// preloads that order (skipping the search step) and, if a dispatch entry
// already exists for it, preloads that entry's saved fields too and saves
// via updateDispatchEntry instead of addDispatchEntry.
export function NewDispatchEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderRef = searchParams.get('orderRef');
  const { data, user, addDispatchEntry, updateDispatchEntry, updateOrder } = useAppStore();
  const canEditTier = canDeleteRecords(user?.email);

  const [type, setType] = useState<DispatchFulfillmentType>('delivery');
  const [orderQuery, setOrderQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);

  // Order-derived fields — auto-fetched from the order, but editable here so
  // a typo or trading-term change can be corrected without leaving this page.
  // Saved back onto the order itself (Customer + Unit stay read-only since
  // changing them has knock-on effects on site/contact/GST elsewhere).
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [customerTier, setCustomerTier] = useState<CustomerTier | ''>('');
  const [inco, setInco] = useState('');
  const [curr, setCurr] = useState('INR');
  const [pay, setPay] = useState('');
  const [shipAddr, setShipAddr] = useState('');
  const [custEnquiryDocNo, setCustEnquiryDocNo] = useState('');

  // Dispatch-specific fields
  const [transporter, setTransporter] = useState('');
  const [remark, setRemark] = useState('');
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState('');
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hydrateFromOrder = (order: Order) => {
    setContact(order.contact || '');
    setPhone(order.phone || '');
    setEmail(order.email || '');
    setCustomerTier(order.customerTier || '');
    setInco(order.inco || '');
    setCurr(order.curr || 'INR');
    setPay(order.pay || '');
    setShipAddr(order.shipToAddress || '');
    setCustEnquiryDocNo(order.custEnquiryDocNo || '');
  };

  // Preload from ?orderRef= — used both when the order/customer picker
  // hasn't run yet, and for the "Edit" flow off an existing dispatch entry.
  // Guarded to run once so it never clobbers in-progress edits.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !orderRef) return;
    const order = data.orders.find(o => o.id === orderRef);
    if (!order) return;
    hydratedRef.current = true;
    setSelectedOrderId(order.id);
    hydrateFromOrder(order);
    const existing = data.dispatchEntries.find(e => e.orderId === order.id);
    if (existing) {
      setExistingEntryId(existing.id);
      setType(existing.fulfillmentType);
      setTransporter(existing.transporter || '');
      setRemark(existing.remark || '');
      setPromisedDeliveryDate(existing.promisedDeliveryDate || '');
      setEstimatedDeliveryDate(existing.estimatedDeliveryDate || '');
    }
  }, [orderRef, data.orders, data.dispatchEntries]);

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
  const isEditMode = !!existingEntryId;
  const selectedCustomer = selectedOrder ? data.customers.find(c => c.name === selectedOrder.cust) : undefined;

  const handleSubmit = async () => {
    if (!selectedOrderId || saving) return;
    setSaving(true);
    setError('');
    try {
      // Persist any corrections made to the order's own trading/contact details.
      await updateOrder(selectedOrderId, {
        contact: contact || undefined,
        phone: phone || undefined,
        email: email || undefined,
        customerTier: customerTier || undefined,
        inco: inco || undefined,
        curr: curr || undefined,
        pay: pay || undefined,
        shipToAddress: shipAddr || undefined,
        custEnquiryDocNo: custEnquiryDocNo || undefined,
      });

      const extra = {
        transporter: transporter || undefined,
        remark: remark || undefined,
        promisedDeliveryDate: promisedDeliveryDate || undefined,
        estimatedDeliveryDate: estimatedDeliveryDate || undefined,
      };

      if (existingEntryId) {
        await updateDispatchEntry(existingEntryId, { fulfillmentType: type, ...extra });
      } else {
        await addDispatchEntry(selectedOrderId, type, extra);
      }
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
            <p className="text-xs text-g500 mt-0.5 font-light">
              {type === 'self_pickup' ? 'Self Pickup Form' : 'HTPL Delivery FMS Form'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/dispatch')}>Back</Button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-8 pt-3 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-[12px]">

          {isEditMode && selectedOrder && (
            <div className="bg-sW/5 border border-sW/20 rounded-[3px] p-[9px_14px] flex items-center gap-[10px] text-[12px]">
              <span className="text-sW text-[14px]">✓</span>
              <div><strong className="text-sW">Loaded from {selectedOrder.id} ({selectedOrder.cust})</strong> — customer & trading details auto-filled below. Just confirm Delivery or Self Pickup.</div>
            </div>
          )}

          {/* Fulfillment Type + Order selection */}
          <div className="bg-white border border-g200">
            <div className={sectionHeaderCls}>Order Selection</div>
            <div className="p-[14px_16px] grid grid-cols-12 gap-[16px]">
              <div className="col-span-12 sm:col-span-3">
                <label className={labelCls}>Fulfillment Type</label>
                <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px] w-fit">
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
              </div>

              <div className="col-span-12 sm:col-span-9">
                <label className={labelCls}>
                  Order (must be Order Confirmed)
                  {eligibleOrders.length === 0 && !selectedOrder && <span className="text-g400 normal-case font-normal tracking-normal"> — none available</span>}
                </label>
                {selectedOrder ? (
                  <div className="flex items-center justify-between gap-2 border border-g200 rounded-[3px] px-3 h-[38px] bg-g50">
                    <div className="min-w-0 text-[13px]">
                      <span className="font-mono font-bold text-sW mr-2">{selectedOrder.id}</span>
                      <span className="font-semibold">{selectedOrder.cust}</span>
                      <span className="text-g500 font-mono ml-2">{selectedOrder.poNo}</span>
                    </div>
                    {!isEditMode && (
                      <button onClick={() => setSelectedOrderId(null)} className="text-g400 hover:text-blk shrink-0"><X size={14} /></button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center gap-1.5 border border-g300 rounded-[3px] px-[10px] h-[36px] focus-within:border-red-mrt focus-within:ring-[3px] focus-within:ring-red-lt">
                      <Search size={13} className="text-g400 shrink-0" />
                      <input
                        type="text"
                        placeholder="Search customer, PO No, Order No..."
                        value={orderQuery}
                        onChange={e => setOrderQuery(e.target.value)}
                        className="bg-transparent border-none outline-none font-sans text-[13px] text-blk w-full placeholder:text-g400"
                      />
                    </div>
                    <div className="border border-g200 border-t-0 rounded-b-[3px] max-h-[240px] overflow-y-auto bg-white">
                      {filteredOrders.length === 0 ? (
                        <div className="text-g400 text-[11.5px] px-3 py-4 text-center">No confirmed orders match — pick a different order or check it doesn't already have a dispatch entry.</div>
                      ) : (
                        filteredOrders.map(o => (
                          <div
                            key={o.id}
                            onClick={() => { setSelectedOrderId(o.id); hydrateFromOrder(o); }}
                            className="px-3 py-2 text-[12.5px] cursor-pointer hover:bg-g100 border-b border-g100 last:border-b-0 flex items-center gap-2 transition-colors"
                          >
                            <span className="font-mono font-bold text-sW shrink-0">{o.id}</span>
                            <span className="font-semibold truncate">{o.cust}</span>
                            <span className="text-g500 font-mono text-[10.5px] ml-auto shrink-0">{o.poNo}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Customer & Contact / Delivery & Trading Terms — auto-fetched, editable */}
          {selectedOrder && (
            <div className="grid grid-cols-12 gap-[12px]">
              <div className="col-span-12 lg:col-span-8 bg-white border border-g200">
                <div className={sectionHeaderCls}>Customer & Contact</div>
                <div className="p-[14px_16px] grid grid-cols-2 gap-[12px]">
                  <div>
                    <label className={labelCls}>Customer</label>
                    <input className={inputCls} value={selectedOrder.cust} disabled />
                  </div>
                  <div>
                    <label className={labelCls}>Unit</label>
                    <input className={inputCls} value={siteLabel(selectedCustomer, selectedOrder.siteId) || '—'} disabled />
                  </div>
                </div>
                <div className="p-[0_16px_14px] grid grid-cols-3 gap-[12px]">
                  <div>
                    <label className={labelCls}>Contact Person</label>
                    <input className={inputCls} value={contact} onChange={e => setContact(e.target.value)} placeholder="Contact name" />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98XXX XXXXX" />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@company.com" />
                  </div>
                </div>
                <div className="p-[0_16px_14px]">
                  <label className={labelCls}>
                    Customer Tier
                    {!canEditTier && <span className="ml-1 text-g400 font-normal normal-case text-[10px]">(view only)</span>}
                  </label>
                  <select value={customerTier} disabled={!canEditTier} onChange={e => setCustomerTier(e.target.value as CustomerTier | '')} className={selectCls + ' w-40'}>
                    <option value="">— No tier —</option>
                    <option>New</option>
                    <option>Bronze</option>
                    <option>Silver</option>
                    <option>Gold</option>
                    <option>Platinum</option>
                  </select>
                </div>
              </div>

              <div className="col-span-12 lg:col-span-4 bg-white border border-g200 self-start">
                <div className={sectionHeaderCls}>Delivery / Trading Terms</div>
                <div className="p-[14px_16px] flex flex-col gap-[12px]">
                  <div>
                    <label className={labelCls}>Incoterms</label>
                    <select value={inco} onChange={e => setInco(e.target.value)} className={selectCls}>
                      <option value="">— Select —</option>
                      {INCO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      {inco && !INCO_OPTIONS.includes(inco) && <option value={inco}>{inco}</option>}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Currency</label>
                    <select value={curr} onChange={e => setCurr(e.target.value)} className={selectCls + ' font-bold'}>
                      <option>INR</option><option>USD</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Payment Terms</label>
                    <select value={pay} onChange={e => setPay(e.target.value)} className={selectCls}>
                      <option value="">— Select —</option>
                      {(PAY_OPTIONS as readonly string[]).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      {pay && !(PAY_OPTIONS as readonly string[]).includes(pay) && <option value={pay}>{pay}</option>}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Shipping Address</label>
                    <input className={inputCls} value={shipAddr} onChange={e => setShipAddr(e.target.value)} placeholder="Delivery address" />
                  </div>
                  <div>
                    <label className={labelCls}>Cust. Enquiry Doc No.</label>
                    <input className={inputCls} value={custEnquiryDocNo} onChange={e => setCustEnquiryDocNo(e.target.value)} placeholder="Ref/2024/01..." />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Order line items — read-only reference, not editable here */}
          {selectedOrder && (
            <div className="bg-white border border-g200">
              <div className={sectionHeaderCls}>Order Line Items — {selectedOrder.id}</div>
              <div className="overflow-x-auto">
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

          {/* Dispatch Details — the 4 fields filled in by the customer-facing form */}
          <div className="bg-white border border-g200">
            <div className={sectionHeaderCls}>Dispatch Details</div>
            <div className="p-[14px_16px] grid grid-cols-1 sm:grid-cols-4 gap-[12px]">
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
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-[3px] p-[10px_14px] text-[12.5px] text-red-600 font-medium">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1 pb-2">
            <Button variant="secondary" onClick={() => navigate('/dispatch')}>Cancel</Button>
            <Button variant="dark" disabled={!selectedOrderId || saving} onClick={handleSubmit}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
