import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { formatINR, siteLabel, PAY_OPTIONS, canDeleteRecords, resolveAdjustments, maxItemGstRate, generateId } from '../lib/utils';
import { DispatchFulfillmentType, Order, OrderItem, CustomerTier } from '../lib/types';
import { ProductSearch } from '../components/ProductSearch';
import { OptionSearch } from '../components/OptionSearch';
import { usePackingTypes } from '../hooks/usePackingTypes';
import { useProductCatalog } from '../hooks/useProductCatalog';

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
  const { data, user, loading, addDispatchEntry, updateDispatchEntry, updateOrder, addOrder } = useAppStore();
  const canEditTier = canDeleteRecords(user?.email);
  const packingTypeOptions = usePackingTypes();
  const { names: productNames, hsnMap: productHsnMap } = useProductCatalog();

  const [type, setType] = useState<DispatchFulfillmentType>('delivery');
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
  // Order Line Items — editable copy of the order's saved items, same as
  // Customer & Contact / Trading Terms above: corrections here are saved
  // back onto the order itself via updateOrder on Save.
  const [items, setItems] = useState<OrderItem[]>([]);
  const [insurance, setInsurance] = useState(0);

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
    setItems(order.items.map(i => ({ ...i })));
    setInsurance(order.insurance ?? 0);
    // Carried forward from the order (now fillable there at creation time) —
    // overridden below by the dispatch entry's own saved values, if one exists.
    if (order.fulfillmentType) setType(order.fulfillmentType);
    setTransporter(order.transporter || '');
    setRemark(order.remark || '');
    setPromisedDeliveryDate(order.promisedDeliveryDate || '');
    setEstimatedDeliveryDate(order.estimatedDeliveryDate || '');
  };

  // Mirrors NewOrder.tsx's updateItem — recomputes an item's Amount whenever
  // qty, rate, or packing (which feeds Total Qty) changes.
  const updateItem = (idx: number, field: keyof OrderItem, value: any) => {
    const ni = [...items];
    const updated = { ...ni[idx], [field]: value };
    if (field === 'qty' || field === 'agreedRate' || field === 'priceBasisConv' || field === 'packing') {
      const packingNum = parseFloat(updated.packing || '') || 0;
      const totalQty = Number(updated.qty) * (packingNum || 1);
      const conv = Number(updated.priceBasisConv) || 1;
      updated.total = totalQty * conv * Number(updated.agreedRate);
    }
    ni[idx] = updated;
    setItems(ni);
  };

  // Unlike NewOrder.tsx's removeItem, this deliberately does NOT renumber the
  // remaining items' `seq` after a removal — handleSubmit's leftover-split
  // calc below matches edited items back to baselineItems by seq, and this
  // form (unlike NewOrder.tsx) never adds new lines, only removes existing
  // ones. Renumbering would shift a later item onto an earlier item's seq,
  // making the calc compare the wrong pair and misattribute quantities.
  const removeItem = (idx: number) => { if (items.length === 1) return; setItems(items.filter((_, i) => i !== idx)); };

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
      // Entry's own saved value wins; fall back to what hydrateFromOrder just
      // set from the order rather than blanking it when the entry has none.
      setType(existing.fulfillmentType || order.fulfillmentType || 'delivery');
      setTransporter(existing.transporter || order.transporter || '');
      setRemark(existing.remark || order.remark || '');
      setPromisedDeliveryDate(existing.promisedDeliveryDate || order.promisedDeliveryDate || '');
      setEstimatedDeliveryDate(existing.estimatedDeliveryDate || order.estimatedDeliveryDate || '');
      // Reopening a saved dispatch entry must show what was actually
      // dispatched, not the order's own (unchanged) confirmed quantities —
      // the entry carries its own items/insurance snapshot for exactly this.
      if (existing.items && existing.items.length) setItems(existing.items.map(i => ({ ...i })));
      if (typeof existing.insurance === 'number') setInsurance(existing.insurance);
    }
  }, [orderRef, data.orders, data.dispatchEntries]);

  // This page only ever supports the ?orderRef= entry point now (the
  // standalone "search any order" mode has been removed) — once the store
  // has finished loading, if hydration above didn't find a real order to
  // work with (no orderRef, or a stale/invalid one), bounce back to the
  // Dispatch list instead of showing anything here. Guarded on `loading` so
  // this doesn't fire prematurely on a fresh page load before data.orders
  // has arrived, which would incorrectly bounce away a valid orderRef.
  useEffect(() => {
    if (loading) return;
    if (hydratedRef.current) return;
    navigate('/dispatch', { replace: true });
  }, [loading, orderRef, data.orders]);

  const selectedOrder = selectedOrderId ? data.orders.find(o => o.id === selectedOrderId) : null;
  const isEditMode = !!existingEntryId;
  const selectedCustomer = selectedOrder ? data.customers.find(c => c.name === selectedOrder.cust) : undefined;

  // Order totals — mirrors the exact Subtotal/Insurance/Taxable Value/GST
  // Total/Order Value math used on the Order form itself, now recomputed
  // live off the editable `items` state above (not the frozen order.items)
  // so corrections here are reflected immediately, before Save.
  const orderTotals = useMemo(() => {
    if (!selectedOrder) return null;
    const isINR = (curr || 'INR') === 'INR';
    const subTotal = items.reduce((s, i) => s + i.total, 0);
    const ins = isINR ? insurance : 0;
    const itemGst = items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
    const scaledItemGst = isINR && subTotal > 0 ? itemGst * (subTotal + ins) / subTotal : 0;
    const maxGstRate = isINR ? maxItemGstRate(items) : 0;
    const adj = resolveAdjustments(selectedOrder.adjustments, subTotal, scaledItemGst, maxGstRate);
    const gstTotal = isINR ? adj.gstTotal : 0;
    const grandTotal = Math.round(subTotal + ins + adj.preNet + gstTotal + adj.postNet);
    return { isINR, subTotal, ins, adj, gstTotal, grandTotal };
  }, [selectedOrder, items, curr, insurance]);

  const handleSubmit = async () => {
    if (!selectedOrderId || !selectedOrder || saving) return;
    setSaving(true);
    setError('');
    try {
      // Detect a partial dispatch: if the user has edited any line's "No of
      // Barrels" down from what's actually being dispatched here, the
      // undispatched remainder must not be lost — split it off into a new
      // order (status "Order Pending for Dispatch", linked back via
      // splitFromOrderId) so it stays visible in the Orders module and can
      // be dispatched later, potentially split further.
      //
      // The comparison baseline is what THIS dispatch action has already
      // accounted for — the dispatch entry's own saved items when editing an
      // existing one, or the order's full confirmed items on a fresh
      // dispatch — never the order's own items directly. The order's items
      // are never rewritten by a dispatch (see the updateOrder call below),
      // so "Order Confirmed" always keeps showing what was actually
      // confirmed, however many times it's since been split.
      const existingEntry = existingEntryId ? data.dispatchEntries.find(e => e.id === existingEntryId) : null;
      const baselineItems = (existingEntry?.items && existingEntry.items.length) ? existingEntry.items : selectedOrder.items;
      // Iterate the BASELINE items, not the edited `items` — a line fully
      // removed from `items` (via the delete-row button) has no seq to look
      // up there, so iterating `items` would silently drop its entire
      // original quantity instead of carrying it into the leftover order.
      // A baseline line missing from `items` is treated as 0 dispatched.
      const editedBySeq = new Map(items.map(i => [i.seq, i]));
      const leftoverItemsRaw: OrderItem[] = [];
      baselineItems.forEach(orig => {
        const edited = editedBySeq.get(orig.seq);
        const editedQty = edited ? Number(edited.qty) : 0;
        const remainderQty = Number(orig.qty) - editedQty;
        if (remainderQty > 0) {
          const packingNum = parseFloat(orig.packing || '') || 0;
          const totalQty = remainderQty * (packingNum || 1);
          const conv = Number(orig.priceBasisConv) || 1;
          const total = totalQty * conv * Number(orig.agreedRate);
          leftoverItemsRaw.push({ ...orig, qty: remainderQty, total });
        }
      });
      const leftoverItems = leftoverItemsRaw.map((it, i) => ({ ...it, seq: i + 1 }));

      if (leftoverItems.length > 0) {
        const summary = leftoverItems.map(i => `${i.desc || '(item)'} — ${i.qty} left`).join(', ');
        const proceed = window.confirm(
          `This dispatch covers only part of the order (${summary}). The undispatched remainder will be split into a new order under "Order Pending for Dispatch" so it isn't lost. Continue?`
        );
        if (!proceed) { setSaving(false); return; }

        // Leftover order recomputes its own Subtotal → GST → Order Value from
        // its own (smaller) item quantities. Insurance and any fixed-amount
        // ('value'-mode) taxes/charges stay on the original dispatched order
        // only; percentage-mode adjustments are carried over and recomputed
        // proportionally here off the leftover subtotal.
        const isINR = (curr || 'INR') === 'INR';
        const leftoverSubTotal = leftoverItems.reduce((s, i) => s + i.total, 0);
        const leftoverItemGst = leftoverItems.reduce((s, i) => s + (i.total * i.gst / 100), 0);
        const leftoverMaxGstRate = isINR ? maxItemGstRate(leftoverItems) : 0;
        const leftoverPercentAdjustments = (selectedOrder.adjustments || []).filter(a => a.mode === 'percent');
        const leftoverAdj = resolveAdjustments(leftoverPercentAdjustments, leftoverSubTotal, isINR ? leftoverItemGst : 0, leftoverMaxGstRate);
        const leftoverGstTotal = isINR ? leftoverAdj.gstTotal : 0;
        const leftoverValue = Math.round(leftoverSubTotal + leftoverAdj.preNet + leftoverGstTotal + leftoverAdj.postNet);

        const newOrder: Order = {
          id: generateId('ORD', data.orders.map(o => o.id)),
          quoteRef: selectedOrder.quoteRef,
          enqRef: selectedOrder.enqRef,
          cust: selectedOrder.cust,
          siteId: selectedOrder.siteId,
          contactId: selectedOrder.contactId,
          contact: contact || undefined,
          email: email || undefined,
          phone: phone || undefined,
          custEnquiryDocNo: custEnquiryDocNo || undefined,
          poNo: selectedOrder.poNo,
          poDate: selectedOrder.poDate,
          dlvDate: selectedOrder.dlvDate,
          scheduleDate: selectedOrder.scheduleDate,
          status: 'Order Pending for Dispatch',
          value: leftoverValue,
          insurance: 0,
          inco: inco || undefined,
          curr: curr || undefined,
          pay: pay || undefined,
          items: leftoverItems,
          adjustments: leftoverPercentAdjustments,
          authorizedPerson: selectedOrder.authorizedPerson,
          customerTier: customerTier || undefined,
          terms: selectedOrder.terms,
          bankingDetails: selectedOrder.bankingDetails,
          unitId: selectedOrder.unitId,
          bankAccountId: selectedOrder.bankAccountId,
          priceBasis: selectedOrder.priceBasis,
          countryOfOrigin: selectedOrder.countryOfOrigin,
          eximCode: selectedOrder.eximCode,
          customPoint: selectedOrder.customPoint,
          pan: selectedOrder.pan,
          hsn: selectedOrder.hsn,
          shipToAddress: shipAddr || undefined,
          doer: selectedOrder.doer,
          // Dispatch-specific fields (Transporter, Promised/Estimated Delivery
          // Date, Fulfillment Type) are deliberately left blank on the
          // leftover order — they describe *this* dispatch, not the
          // still-undispatched remainder, which gets its own fresh values
          // when it's eventually dispatched.
          splitFromOrderId: selectedOrder.id,
        };
        await addOrder(newOrder);
      }

      // Persist corrections made to the order's own trading/contact details
      // only — NOT items/insurance/value. The order keeps showing exactly
      // what was confirmed, for as long as it exists, regardless of how much
      // of it has since been dispatched; what's actually being dispatched
      // now lives on the dispatch entry itself (below), and any undispatched
      // remainder lives on the leftover order split off above.
      //
      // A leftover order (status "Order Pending for Dispatch") that's now
      // getting its own dispatch entry — whether fully dispatched here or
      // partially (splitting off yet another remainder above) — is done
      // being "pending"; flip it back to "Order Confirmed" so it drops out
      // of that tab. Orders that started as Order Confirmed/Processing/
      // Delivered are left untouched.
      const orderUpdates: Partial<Order> = {
        contact: contact || undefined,
        phone: phone || undefined,
        email: email || undefined,
        customerTier: customerTier || undefined,
        inco: inco || undefined,
        curr: curr || undefined,
        pay: pay || undefined,
        shipToAddress: shipAddr || undefined,
        custEnquiryDocNo: custEnquiryDocNo || undefined,
      };
      if (selectedOrder.status === 'Order Pending for Dispatch') {
        orderUpdates.status = 'Order Confirmed';
      }
      // Permanent marker for a split order once it's ever been dispatched —
      // unlike the status flip above, this is never reset, so the order
      // stays hidden from the Orders module (see isRetiredSplitOrder in
      // Orders.tsx) even after this dispatch entry is later deleted.
      if (selectedOrder.splitFromOrderId) {
        orderUpdates.dispatchFinalized = true;
      }
      await updateOrder(selectedOrderId, orderUpdates);

      const extra = {
        transporter: transporter || undefined,
        remark: remark || undefined,
        promisedDeliveryDate: promisedDeliveryDate || undefined,
        estimatedDeliveryDate: estimatedDeliveryDate || undefined,
        // This dispatch's own line items/insurance/value — what's actually
        // being dispatched right now, independent of the order's own totals.
        items,
        insurance: curr === 'INR' ? insurance : 0,
        value: orderTotals ? orderTotals.grandTotal : selectedOrder.value,
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

          {/* Order selection — Fulfillment Type now lives in the Customer & Contact card below, alongside the rest of the dispatch-specific fields */}
          <div className="bg-white border border-g200">
            <div className={sectionHeaderCls}>Order Selection</div>
            <div className="p-[14px_16px]">
              <div>
                <label className={labelCls}>Order (must be Order Confirmed)</label>
                {selectedOrder ? (
                  <div className="flex items-center justify-between gap-2 border border-g200 rounded-[3px] px-3 h-[38px] bg-g50">
                    <div className="min-w-0 text-[13px]">
                      <span className="font-mono font-bold text-sW mr-2">{selectedOrder.id}</span>
                      <span className="font-semibold">{selectedOrder.cust}</span>
                      <span className="text-g500 font-mono ml-2">{selectedOrder.poNo}</span>
                    </div>
                  </div>
                ) : (
                  // Only visible for a single render tick before the
                  // redirect effect above sends us back to /dispatch.
                  <div className="text-g400 text-[12.5px] px-1 py-2">Loading…</div>
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

                {/* Dispatch Details — fulfillment type + the fields filled in by the customer-facing form, folded into Customer & Contact */}
                <div className="p-[0_16px_14px]">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-[12px]">
                    <div>
                      <label className={labelCls}>Fulfillment Type</label>
                      <select value={type} onChange={e => setType(e.target.value as DispatchFulfillmentType)} className={selectCls}>
                        <option value="delivery">Delivery</option>
                        <option value="self_pickup">Self Pickup</option>
                      </select>
                    </div>
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
                    <div className="col-span-2 sm:col-span-1">
                      <label className={labelCls}>Remark</label>
                      <input className={inputCls} value={remark} onChange={e => setRemark(e.target.value)} placeholder="Optional remark" />
                    </div>
                  </div>
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

          {/* Order line items — read-only reference styled exactly like the Order form's table, through Order Value */}
          {selectedOrder && orderTotals && (
            <div className="bg-white border border-g200">
              <div className="p-[11px_16px] border-b border-g200">
                <span className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g500">Order Line Items</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-g400 text-[12px]">
                  <thead className="bg-g100">
                    <tr>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400 w-8">#</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400">Product Name</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-left border border-g400 w-24">HSN Code</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-32 whitespace-nowrap">No of Barrels</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-24">Packing</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-24 whitespace-nowrap">Total Qty</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-28">Packing Type</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-28">Price Basis</th>
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-right border border-g400 w-28">Unit Rate ({orderTotals.isINR ? '₹' : '$'})</th>
                      {orderTotals.isINR && <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-center border border-g400 w-20">GST %</th>}
                      <th className="font-mono text-[8px] tracking-[1px] uppercase text-g500 px-3 py-1.5 text-right border border-g400 w-28">Amount ({orderTotals.isINR ? '₹' : '$'})</th>
                      <th className="w-8 border border-g400"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i, idx) => {
                      const packNum = parseFloat(i.packing || '');
                      const totalQty = i.qty > 0 && packNum > 0 ? i.qty * packNum : null;
                      return (
                        <tr key={i.seq} className="hover:bg-g50/50">
                          <td className="px-3 py-[5px] border border-g400 align-middle font-mono font-bold text-g400 text-[11px]">{i.seq}</td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <ProductSearch
                              value={i.desc}
                              names={productNames}
                              hsnMap={productHsnMap}
                              onChange={(desc, hsn) => {
                                const ni = [...items];
                                const resolvedHsn = !desc ? '' : (hsn !== undefined ? hsn : (desc in productHsnMap ? productHsnMap[desc] : undefined));
                                ni[idx] = { ...ni[idx], desc, ...(resolvedHsn !== undefined ? { hsn: resolvedHsn } : {}) };
                                setItems(ni);
                              }}
                            />
                          </td>
                          <td className={`px-3 py-[5px] border border-g400 align-middle${i.desc in productHsnMap ? ' bg-g100' : ''}`}>
                            <input
                              type="text"
                              title="HSN Code"
                              value={i.hsn || ''}
                              readOnly={i.desc in productHsnMap}
                              onChange={e => updateItem(idx, 'hsn', e.target.value)}
                              className={`w-full bg-transparent outline-none font-mono text-[11px] ${i.desc in productHsnMap ? 'text-g500 cursor-default select-none' : 'text-blk'}`}
                            />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <input type="number" min="1" value={i.qty || ''} onChange={e => updateItem(idx, 'qty', Number(e.target.value))}
                              className={`w-full bg-transparent outline-none font-mono text-[12px] text-center ${Number(i.qty) <= 0 ? 'text-red-mrt' : 'text-blk'}`} />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <input type="text" value={i.packing || ''} onChange={e => updateItem(idx, 'packing', e.target.value)} className="w-full bg-transparent outline-none text-[12px] font-sans text-center text-blk" />
                          </td>
                          <td className="px-3 py-[5px] border border-g400 align-middle bg-g100 text-center font-mono text-[11px] text-g500">{totalQty ?? '—'}</td>
                          <td className="px-3 py-[5px] border border-g400 align-middle">
                            <OptionSearch
                              options={packingTypeOptions}
                              value={i.packingType || ''}
                              onChange={val => updateItem(idx, 'packingType', val)}
                              placeholder="Packing type…"
                            />
                          </td>
                          <td className="px-1 py-[3px] border border-g400 align-middle">
                            <select value={i.priceBasis || 'Per kg'} onChange={e => updateItem(idx, 'priceBasis', e.target.value)} className="w-full bg-transparent outline-none font-sans text-[11px] text-blk text-center cursor-pointer">
                              {['Per kg', 'Per MT', 'Per Ltr', 'Per KL', 'Per Unit', 'Per Drum', 'Per Can'].map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                          <td className="px-[6px] py-[5px] border border-g400 align-middle">
                            <div className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={!!i.rateOverride}
                                onChange={e => updateItem(idx, 'rateOverride', e.target.checked)}
                                title="Override rate with text"
                                className="accent-red-600 shrink-0 cursor-pointer"
                              />
                              {i.rateOverride ? (
                                <input
                                  type="text"
                                  value={i.rateText || ''}
                                  placeholder="Regret"
                                  onChange={e => updateItem(idx, 'rateText', e.target.value)}
                                  className="flex-1 bg-transparent outline-none font-mono text-[11px] text-red-mrt placeholder:text-g400 min-w-0"
                                />
                              ) : (
                                <input type="number" step="any" min="0" value={i.agreedRate || ''} placeholder="0.00" onChange={e => updateItem(idx, 'agreedRate', Number(e.target.value))}
                                  className="flex-1 bg-transparent outline-none font-mono text-[12px] text-right text-blk placeholder:text-g300 min-w-0" />
                              )}
                            </div>
                          </td>
                          {orderTotals.isINR && (
                            <td className="px-3 py-[5px] border border-g400 align-middle">
                              <select value={i.gst} onChange={e => updateItem(idx, 'gst', Number(e.target.value))} className="w-full bg-transparent outline-none text-[12px] text-center font-mono text-blk appearance-none cursor-pointer">
                                <option value={18}>18%</option><option value={12}>12%</option><option value={5}>5%</option><option value={0}>0%</option>
                              </select>
                            </td>
                          )}
                          <td className="px-3 py-[5px] border border-g400 align-middle text-right font-mono text-[12px] font-bold text-blk">{formatINR(i.total)}</td>
                          <td className="px-1 py-[5px] border border-g400 align-middle">
                            <button type="button" onClick={() => removeItem(idx)} disabled={items.length === 1} className="text-g400 hover:text-red-mrt p-1 transition-colors disabled:opacity-30" title="Remove">
                              <svg viewBox="0 0 16 16" width="13" height="13" className="fill-current"><path d="M5.5 1h5v1h-5V1zM3 3v1h10V3H3zm1 2v9h8V5H4zm2 1h1v7H6V6zm3 0h1v7H9V6z" /></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-g200 bg-g50/50">
                      <td colSpan={orderTotals.isINR ? 11 : 10} className="px-3 py-2 text-right text-[11px] text-g500">Subtotal (before tax)</td>
                      <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk">{formatINR(orderTotals.subTotal)}</td>
                    </tr>
                    {orderTotals.isINR && (
                      <tr className="border-b border-g200 bg-g50/50">
                        <td colSpan={11} className="px-3 py-2 text-right">
                          <span className="text-[11px] text-g500">Insurance</span>
                          <button
                            type="button"
                            onClick={() => setInsurance(Math.round(orderTotals.subTotal * 0.0015 * 100) / 100)}
                            className="block ml-auto text-[10px] text-blue-600 hover:text-blue-800 underline underline-offset-2 leading-tight"
                          >Apply 0.15%</button>
                        </td>
                        <td className="px-3 py-1 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={insurance === 0 ? '' : insurance}
                            onChange={e => setInsurance(e.target.value === '' ? 0 : Math.round(parseFloat(e.target.value) * 100) / 100)}
                            placeholder="0.00"
                            className="w-full text-right font-mono text-[12px] font-bold text-blk bg-transparent border-b border-g300 focus:border-blue-500 outline-none py-0.5 pr-0"
                          />
                        </td>
                      </tr>
                    )}
                    {orderTotals.adj.lines.filter(l => l.taxable).map(l => (
                      <tr key={l.id} className="bg-g50/50">
                        <td colSpan={orderTotals.isINR ? 11 : 10} className="px-3 py-2 text-right text-[11px] text-g500 truncate">
                          {l.label || '(unnamed)'}{l.mode === 'percent' ? ` (${l.rate}%)` : ''}{l.direction === 'deduct' ? ' −' : ''}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[12px] font-bold ${l.amount < 0 ? 'text-red-mrt' : 'text-blk'}`}>
                          {l.amount < 0 ? '−' : ''}{formatINR(Math.abs(l.amount))}
                        </td>
                      </tr>
                    ))}
                    {orderTotals.isINR && (orderTotals.adj.preNet !== 0 || orderTotals.ins > 0) && (
                      <tr className="bg-g50/50">
                        <td colSpan={11} className="px-3 py-2 text-right text-[11px] text-g600 border-t border-g100">Taxable Value</td>
                        <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk border-t border-g100">{formatINR(orderTotals.subTotal + orderTotals.ins + orderTotals.adj.preNet)}</td>
                      </tr>
                    )}
                    {orderTotals.isINR && (
                      <tr className="border-b border-g200 bg-g50/50">
                        <td colSpan={11} className="px-3 py-2 text-right text-[11px] text-g500">GST Total</td>
                        <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk">{formatINR(orderTotals.gstTotal)}</td>
                      </tr>
                    )}
                    {orderTotals.adj.lines.filter(l => !l.taxable).map(l => (
                      <tr key={l.id} className="bg-g50/50">
                        <td colSpan={orderTotals.isINR ? 11 : 10} className="px-3 py-2 text-right text-[11px] text-g500">
                          {l.label || '(unnamed)'}{l.mode === 'percent' ? ` (${l.rate}%)` : ''}{l.direction === 'deduct' ? ' −' : ''}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono text-[12px] font-bold ${l.amount < 0 ? 'text-red-mrt' : 'text-blk'}`}>
                          {l.amount < 0 ? '−' : ''}{formatINR(Math.abs(l.amount))}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-[#1e293b]">
                      <td colSpan={orderTotals.isINR ? 11 : 10} className="px-3 py-2.5 text-right text-[12px] font-bold text-white">Order Value</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[13px] font-bold text-white">{formatINR(orderTotals.grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

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
