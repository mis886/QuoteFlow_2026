import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAppStore } from '../store';
import { Badge, Button } from '../components/ui';
import { canDeleteRecords, formatINR, fmtDate, fmtIST, doerLabel, siteLabel, resolveAdjustments, maxItemGstRate, normalizeSearchText } from '../lib/utils';
import { Order, OrderItem, DispatchEntry, DispatchFulfillmentType } from '../lib/types';

type SubType = DispatchFulfillmentType | 'not_set';

const thBase = 'font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] whitespace-nowrap border-b border-g200';
const thCls = `${thBase} text-left`;
const thRightCls = `${thBase} text-right`;
const pillCls = (active: boolean) => `px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${active ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`;

// Same "Punched At" recency colouring as Orders.tsx: today = green, within 7 days = amber, older = neutral.
function punchedAtClass(createdAt: string): { text: string; title?: string } {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const punched = new Date(createdAt); punched.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - punched.getTime()) / 86400000);
  if (days === 0) return { text: 'text-emerald-600 font-semibold', title: 'Punched today' };
  if (days <= 7) return { text: 'text-amber-600 font-semibold', title: `${days} day(s) ago` };
  return { text: 'text-g600' };
}

const fulfillmentLabel = (t: SubType) => t === 'self_pickup' ? 'Self Pickup' : t === 'delivery' ? 'Delivery' : 'Not Set';

function SoCell({ soNumber, pending }: { soNumber?: string; pending?: boolean }) {
  if (soNumber) return <span className="font-mono text-[10.5px] font-bold text-sW">{soNumber}</span>;
  return pending ? <span className="font-mono text-[10.5px] text-g400" title="Generating SO number…">…</span> : <span className="text-g400">—</span>;
}

// Expanded line-item table, shared by all three tabs.
function LineItemsPanel({ title, items, grand }: { title: string; items: OrderItem[]; grand: number }) {
  const subTotal = items.reduce((s, i) => s + i.total, 0);
  const itemGst = items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
  return (
    <div className="p-[10px_16px]">
      <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-sW mb-[7px]">{title}</div>
      {items.length === 0 ? (
        <div className="text-g400 text-[11.5px] py-2">No line items recorded.</div>
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
            {items.map(i => {
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
      {items.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-g200 gap-5 items-center">
          <span className="text-[12px] text-g600">Sub-Total: <strong className="text-blk font-bold font-mono">{formatINR(subTotal)}</strong></span>
          <span className="text-[12px] text-g600">GST: <strong className="text-blk font-bold font-mono">{formatINR(Math.round(itemGst))}</strong></span>
          <span className="text-[13px] text-red-mrt font-bold font-mono tracking-tight">Grand: {formatINR(Math.round(grand))}</span>
        </div>
      )}
    </div>
  );
}

export function Dispatch() {
  const navigate = useNavigate();
  const { data, user, deleteDispatchEntry, ensureSoNumbers } = useAppStore();
  const canDelete = canDeleteRecords(user?.email);

  const [tab, setTab] = useState<'pending' | 'toDispatch' | 'toSend'>('pending');
  const [subType, setSubType] = useState<SubType>('delivery');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const orderFor = (entry: DispatchEntry): Order | undefined => data.orders.find(o => o.id === entry.orderId);

  // Order Pending for Dispatch — read-only view of every Order Confirmed
  // order that has no dispatch entry yet. Once an entry is created it drops
  // out of here and shows under "Order → Dispatch" instead. Nothing here
  // changes an order's status.
  const dispatchedOrderIds = useMemo(() => new Set(data.dispatchEntries.map(e => e.orderId)), [data.dispatchEntries]);
  const pendingOrders = useMemo(
    () => data.orders.filter(o => o.status === 'Order Confirmed' && !dispatchedOrderIds.has(o.id)),
    [data.orders, dispatchedOrderIds],
  );
  // Order's own fulfillment type first, then the customer's typical pattern,
  // else "Not Set" so no confirmed order is ever hidden.
  const orderFulfillment = (o: Order): SubType => {
    if (o.fulfillmentType === 'delivery' || o.fulfillmentType === 'self_pickup') return o.fulfillmentType;
    const cf = data.customers.find(c => c.name === o.cust)?.fulfilmentType;
    if (cf === 'Delivery') return 'delivery';
    if (cf === 'Self Pickup') return 'self_pickup';
    return 'not_set';
  };

  // Assign SO numbers to pending orders that don't have one yet. The ref
  // keeps it from ever running twice at once; once a run's saves land in
  // local state, missingSoKey changes and the effect re-checks for anything
  // that appeared in the meantime.
  const soRunning = useRef(false);
  const missingSoKey = pendingOrders.filter(o => !o.soNumber).map(o => o.id).sort().join(',');
  useEffect(() => {
    if (!missingSoKey || soRunning.current) return;
    soRunning.current = true;
    ensureSoNumbers(missingSoKey.split(','))
      .catch(err => console.error('ensureSoNumbers failed:', err))
      .finally(() => { soRunning.current = false; });
  }, [missingSoKey]);

  const entries = data.dispatchEntries;
  // "Sent" is tracked purely by sentAt being set (see the "Dispatch → Sent"
  // button below, and the Status dropdown in NewDispatchEntry.tsx) — an
  // entry lives in exactly one of the two tabs at a time. All tabs share
  // the same Delivery/Self Pickup sub-split.
  const toDispatchEntries = entries.filter(e => !e.sentAt);
  const sentEntries = entries.filter(e => e.sentAt);
  const activeEntries = tab === 'toSend' ? sentEntries : toDispatchEntries;

  const pendingCount = (t: SubType) => pendingOrders.filter(o => orderFulfillment(o) === t).length;
  const deliveryCount = tab === 'pending' ? pendingCount('delivery') : activeEntries.filter(e => e.fulfillmentType === 'delivery').length;
  const selfPickupCount = tab === 'pending' ? pendingCount('self_pickup') : activeEntries.filter(e => e.fulfillmentType === 'self_pickup').length;
  const notSetCount = tab === 'pending' ? pendingCount('not_set') : 0;

  // "Not Set" only exists for pending orders — fall back to Delivery when
  // switching to a tab that doesn't have it.
  const switchTab = (t: typeof tab) => {
    setTab(t);
    setExpandedRow(null);
    if (t !== 'pending' && subType === 'not_set') setSubType('delivery');
  };

  const qs = search.trim().toLowerCase();
  const orderMatches = (o: Order | undefined, fallbackId: string) => {
    if (!qs) return true;
    if (fallbackId.toLowerCase().includes(qs)) return true;
    if (!o) return false;
    return (o.soNumber || '').toLowerCase().includes(qs) ||
      normalizeSearchText(o.cust).includes(normalizeSearchText(qs)) ||
      (o.poNo || '').toLowerCase().includes(qs) ||
      o.items.some(i => (i.desc || '').toLowerCase().includes(qs));
  };

  const visiblePending = useMemo(
    () => pendingOrders
      .filter(o => orderFulfillment(o) === subType && orderMatches(o, o.id))
      .sort((a, b) => (b.created_at || b.poDate || '').localeCompare(a.created_at || a.poDate || '')),
    [pendingOrders, subType, qs, data.customers],
  );

  const visibleEntries = useMemo(
    () => activeEntries
      .filter(e => e.fulfillmentType === subType && orderMatches(orderFor(e), e.orderId))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [activeEntries, subType, qs, data.orders],
  );

  const rowCount = tab === 'pending' ? visiblePending.length : visibleEntries.length;

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
          <div onClick={() => switchTab('pending')} className={pillCls(tab === 'pending')}>
            Order Pending for Dispatch ({pendingOrders.length})
          </div>
          <div onClick={() => switchTab('toDispatch')} className={pillCls(tab === 'toDispatch')}>
            Order → Dispatch ({toDispatchEntries.length})
          </div>
          <div onClick={() => switchTab('toSend')} className={pillCls(tab === 'toSend')}>
            Dispatch → Sent ({sentEntries.length})
          </div>
        </div>

        <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <div onClick={() => setSubType('delivery')} className={`flex items-center gap-1.5 ${pillCls(subType === 'delivery')}`}>
            <span className="w-[7px] h-[7px] rounded-full bg-sN shrink-0" /> Delivery ({deliveryCount})
          </div>
          <div onClick={() => setSubType('self_pickup')} className={`flex items-center gap-1.5 ${pillCls(subType === 'self_pickup')}`}>
            <span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED] shrink-0" /> Self Pickup ({selfPickupCount})
          </div>
          {tab === 'pending' && (notSetCount > 0 || subType === 'not_set') && (
            <div onClick={() => setSubType('not_set')} className={`flex items-center gap-1.5 ${pillCls(subType === 'not_set')}`}>
              <span className="w-[7px] h-[7px] rounded-full bg-g400 shrink-0" /> Not Set ({notSetCount})
            </div>
          )}
        </div>

        <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>
        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[200px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="SO No, Order Ref, company, PO No, item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        <div className="ml-auto font-mono text-[10px] text-g500">
          {tab === 'pending' ? `${rowCount} order(s)` : `${rowCount} entr${rowCount === 1 ? 'y' : 'ies'}`}
        </div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="bg-white border border-g200 overflow-x-auto m-0">
          {tab === 'pending' ? (
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-g100">
                <tr>
                  <th className={thCls}>SO No.</th>
                  <th className={thCls}>Order Ref</th>
                  <th className={thCls}>Customer - Unit</th>
                  <th className={thCls}>PO Number</th>
                  <th className={thCls}>PO Date</th>
                  <th className={thCls}>Schedule Date</th>
                  <th className={thCls}>Items</th>
                  <th className={thRightCls}>Order Value</th>
                  <th className={thCls}>Fulfillment</th>
                  <th className={thCls}>Punched At</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visiblePending.length === 0 ? (
                  <tr><td colSpan={12} className="text-center p-8 text-g400 text-[13px]">
                    {qs ? 'No matching orders' : subType === 'not_set' ? 'No confirmed orders without a fulfillment type' : `No confirmed ${fulfillmentLabel(subType)} orders pending for dispatch`}
                  </td></tr>
                ) : (
                  visiblePending.map(o => {
                    const subTotal = o.items.reduce((s, i) => s + i.total, 0);
                    const itemGst = o.items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
                    const grandTotal = resolveAdjustments(o.adjustments, subTotal, itemGst, maxItemGstRate(o.items)).grand;
                    const isExpanded = expandedRow === o.id;
                    const sl = siteLabel(data.customers.find(c => c.name === o.cust), o.siteId || data.enquiries.find(e => e.id === o.enqRef)?.siteId);
                    return (
                      <React.Fragment key={o.id}>
                        <tr
                          className={`group transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sW/5 ${isExpanded ? 'bg-sW/5' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : o.id)}
                        >
                          <td className="px-[13px] py-[10px] align-top"><SoCell soNumber={o.soNumber} pending /></td>
                          <td className="px-[13px] py-[10px] align-top"><span className="font-mono text-[10px] font-bold text-sQ">{o.id}</span></td>
                          <td className="px-[13px] py-[10px] align-top">
                            <div className="font-semibold">{o.cust}{sl ? <span className="font-normal text-g500"> — {sl}</span> : null}</div>
                          </td>
                          <td className="px-[13px] py-[10px] align-top font-mono text-[11px] font-bold text-g700">{o.poNo || '—'}</td>
                          <td className="px-[13px] py-[10px] align-top text-[11.5px] text-g600 whitespace-nowrap">
                            {o.poDate ? fmtIST(new Date(o.poDate), 'dd-MMM-yyyy') : '--'}
                          </td>
                          <td className="px-[13px] py-[10px] align-top text-[11.5px] text-g600 whitespace-nowrap">
                            {o.scheduleDate ? fmtIST(new Date(o.scheduleDate), 'dd-MMM-yyyy') : '--'}
                          </td>
                          <td className="px-[13px] py-[10px] align-top">
                            <span className="font-mono text-[10px] font-bold bg-g100 text-g600 px-[7px] py-[2px] rounded-full inline-flex items-center">
                              {o.items.length} item(s)
                            </span>
                          </td>
                          <td className="px-[13px] py-[10px] align-top text-right font-mono text-[12px] font-bold">{formatINR(Math.round(grandTotal))}</td>
                          <td className="px-[13px] py-[10px] align-top">{fulfillmentLabel(orderFulfillment(o))}</td>
                          <td className="px-[13px] py-[10px] align-top text-[11.5px] whitespace-nowrap">
                            {o.created_at ? (() => {
                              const cls = punchedAtClass(o.created_at);
                              return <span className={cls.text} title={cls.title}>{fmtIST(new Date(o.created_at), 'dd-MMM-yyyy')}</span>;
                            })() : <span className="text-g600">--</span>}
                          </td>
                          <td className="px-[13px] py-[10px] align-top"><Badge status={o.status} /></td>
                          <td className="px-[13px] py-[10px] align-top" onClick={ev => ev.stopPropagation()}>
                            <Button size="sm" variant="success" className="active:scale-95 transition-transform" onClick={() => navigate(`/dispatch/new?orderRef=${o.id}`)}>Create Dispatch</Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-sW/[0.02] border-b-2 border-sW">
                            <td colSpan={12} className="p-0">
                              <LineItemsPanel title={`Order Line Items -- ${o.soNumber ? `${o.soNumber} / ` : ''}${o.id}`} items={o.items} grand={grandTotal} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="bg-g100">
                <tr>
                  <th className={thCls}>SO No.</th>
                  <th className={thCls}>Order Ref</th>
                  <th className={thCls}>Customer</th>
                  <th className={thCls}>PO No.</th>
                  <th className={thCls}>Fulfillment</th>
                  <th className={thCls}>Items</th>
                  <th className={thRightCls}>Value</th>
                  <th className={thCls}>Transporter</th>
                  <th className={thCls}>Promised Delivery</th>
                  <th className={thCls}>Estimated Delivery</th>
                  <th className={thCls}>Dispatched On</th>
                  <th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 ? (
                  <tr><td colSpan={12} className="text-center p-8 text-g400 text-[13px]">{qs ? 'No matching entries' : `No ${subType === 'self_pickup' ? 'Self Pickup' : 'Delivery'} entries ${tab === 'toSend' ? 'sent yet' : 'yet'}`}</td></tr>
                ) : (
                  visibleEntries.map(entry => {
                    const order = orderFor(entry);
                    const isExpanded = expandedRow === entry.id;
                    const lineItems = (entry.items && entry.items.length > 0) ? entry.items : (order?.items || []);
                    return (
                      <React.Fragment key={entry.id}>
                        <tr
                          className={`group transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sW/5 ${isExpanded ? 'bg-sW/5' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                        >
                          <td className="px-[13px] py-[10px] align-top"><SoCell soNumber={order?.soNumber} /></td>
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
                            <div className="flex flex-col gap-[3px]">
                              <div className="flex gap-1.5 flex-wrap">
                                {tab === 'toDispatch' && (
                                  // Opens the full entry form with the Status dropdown
                                  // pre-set to "Dispatch → Sent" (and existing data
                                  // prefilled), instead of marking it sent immediately.
                                  // The entry only actually moves to the Dispatch → Sent
                                  // tab once the user fills in the Documents Attachment
                                  // section there and clicks Save.
                                  <Button size="sm" variant="success" onClick={() => navigate(`/dispatch/new?orderRef=${entry.orderId}&toSent=1`)}>Dispatch → Sent</Button>
                                )}
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
                              {/* 2026-09-21: shows just the name of whoever made the most
                                  recent change — updatedBy if the entry's been edited since
                                  it was created, else createdBy — resolved through the team
                                  roster to a display name (falls back to the raw email if
                                  no roster match), single line, no "Created:"/"Updated:"
                                  label, positioned under the action buttons. */}
                              {(entry.updatedBy || entry.createdBy) && (
                                <span className="text-[10px] font-mono text-g400 whitespace-nowrap">{doerLabel(entry.updatedBy || entry.createdBy, data.roster)}</span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-sW/[0.02] border-b-2 border-sW">
                            <td colSpan={12} className="p-0">
                              <LineItemsPanel title={`Dispatch Line Items -- ${entry.orderId}`} items={lineItems} grand={entry.value || 0} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
