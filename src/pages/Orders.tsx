import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { Badge, Button, DateFilterBanner } from '../components/ui';
import { Search, Loader2, Mail, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatINR, fmtIST, isInDateRange, resolveAdjustments, maxItemGstRate, siteLabel } from '../lib/utils';
import { generatePIPDF } from '../lib/pdfGenerator';
import { exportOrderToSheets, buildSheetsPayload } from '../lib/sheets';
import { getS3SignedUrl } from '../lib/s3';
import { Order } from '../lib/types';
import { SendEmailModal } from '../components/SendEmailModal';

// Colour the "Delivery By" date by urgency, mirroring the SLA colouring used in
// Enquiries. Delivered orders show neutral (the clock has stopped).
function dlvDateClass(dlvDate: string, status: string): { text: string; title?: string } {
  if (status === 'Delivered') return { text: 'text-g600' };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(dlvDate); due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { text: 'text-red-mrt font-bold', title: `Past due by ${Math.abs(days)} day(s)` };
  if (days <= 7) return { text: 'text-amber-600 font-semibold', title: days === 0 ? 'Due today' : `Due in ${days} day(s)` };
  return { text: 'text-emerald-600', title: `Due in ${days} day(s)` };
}

// Colour "Punched At" by recency: today = green, within 7 days = amber, older = neutral.
function punchedAtClass(createdAt: string): { text: string; title?: string } {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const punched = new Date(createdAt); punched.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - punched.getTime()) / 86400000);
  if (days === 0) return { text: 'text-emerald-600 font-semibold', title: 'Punched today' };
  if (days <= 7) return { text: 'text-amber-600 font-semibold', title: `${days} day(s) ago` };
  return { text: 'text-g600' };
}

export function Orders() {
  const store = useAppStore();
  const { data, user, globalSearchQuery, setGlobalSearchQuery, updateOrder, openAttachmentModal } = store;
  const { globalDateRange, setGlobalDateRange } = store as any;
  const navigate = useNavigate();
  const [tab, setTab] = useState<'All' | 'Processing' | 'Delivered'>('All');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [downloadingPOId, setDownloadingPOId] = useState<string | null>(null);
  const [siteQuery, setSiteQuery] = useState('');
  const [siteDebounced, setSiteDebounced] = useState('');
  const [sortCol, setSortCol] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const t = setTimeout(() => setSiteDebounced(siteQuery), 250);
    return () => clearTimeout(t);
  }, [siteQuery]);
  const [sendModalOrder, setSendModalOrder] = useState<Order | null>(null);
  const [exportingSheets, setExportingSheets] = useState<string | null>(null);
  const [sheetsToast, setSheetsToast] = useState<{type: "ok"|"warn"|"err"; msg: string} | null>(null);
  const statusCounts = {
    Processing: data.orders.filter(o => o.status === 'Processing').length,
    Delivered: data.orders.filter(o => o.status === 'Delivered').length,
    All: data.orders.length
  };

  const handleDownloadPO = async (poFileName: string, orderId: string, poNo: string) => {
    setDownloadingPOId(orderId);
    const url = await getS3SignedUrl(poFileName, true);
    setDownloadingPOId(null);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `PO_${poNo}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };


  const showToast = (type: 'ok'|'warn'|'err', msg: string) => {
    setSheetsToast({ type, msg });
    setTimeout(() => setSheetsToast(null), 5000);
  };

  const handleExportSheets = async (o: Order) => {
    const url = data.settings?.sheets_webhook_url;
    if (!url) { showToast('err', 'Set the Sheets Web App URL in Settings → Integrations first.'); return; }
    setExportingSheets(o.id);
    try {
      const qt = data.quotes.find(q => q.id === o.quoteRef);
      const warnings = await exportOrderToSheets(url, await buildSheetsPayload(o, qt, user?.email ?? '', data.settings?.sheets_drive_folder_id));
      await updateOrder(o.id, { sheetsExportedAt: new Date().toISOString() });
      if (warnings.length) showToast('warn', 'Exported with issues: ' + warnings.join('; '));
      else showToast('ok', 'Exported to Google Sheets ✓');
    } catch (err) {
      showToast('err', 'Export failed: ' + (err as Error).message);
    } finally {
      setExportingSheets(null);
    }
  };

  const applySearch = (search: string) => {
    setGlobalSearchQuery(search);
  };

  const filteredOrders = useMemo(() => {
    const qs = globalSearchQuery.toLowerCase();
    const sq = siteDebounced.toLowerCase();
    const list = data.orders.filter(o => {
      if (tab !== 'All' && o.status !== tab) return false;
      if (qs) {
        const match = o.cust.toLowerCase().includes(qs) || o.id.toLowerCase().includes(qs) || o.poNo.toLowerCase().includes(qs);
        if (!match) return false;
      }
      if (!isInDateRange(o.poDate, globalDateRange)) return false;
      if (sq) {
        const cust = data.customers.find(c => c.name === o.cust);
        const sl = siteLabel(cust, (o as any).siteId) || '';
        const site = (cust?.sites ?? []).find((s: any) => s.id === (o as any).siteId);
        const city = (site as any)?.city || '';
        if (!sl.toLowerCase().includes(sq) && !city.toLowerCase().includes(sq)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      let av: any, bv: any;
      if (sortCol === 'poDate') { av = a.poDate; bv = b.poDate; }
      else if (sortCol === 'cust') { av = a.cust.toLowerCase(); bv = b.cust.toLowerCase(); }
      else if (sortCol === 'status') { av = a.status; bv = b.status; }
      else if (sortCol === 'value') { av = a.items.reduce((s, i) => s + i.total, 0); bv = b.items.reduce((s, i) => s + i.total, 0); }
      else if (sortCol === 'items') { av = a.items.length; bv = b.items.length; }
      else if (sortCol === 'dlvDate') { av = a.dlvDate || ''; bv = b.dlvDate || ''; }
      else if (sortCol === 'created_at') { av = a.created_at || ''; bv = b.created_at || ''; }
      else { av = a.poDate; bv = b.poDate; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [data.orders, data.customers, globalSearchQuery, siteDebounced, tab, globalDateRange, sortCol, sortDir]);

  const TabSelect = ({ current, label, count }: { current: string, label: string, count?: number }) => {
    const isActive = tab === current;
    return (
      <div 
        onClick={() => setTab(current as any)}
        className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${isActive ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
      >
        {label} {count !== undefined && `(${count})`}
      </div>
    );
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const SortTh = ({ col, children, right }: { col: string; children: React.ReactNode; right?: boolean }) => {
    const active = sortCol === col;
    return (
      <th
        className={`font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] whitespace-nowrap border-b border-g200 cursor-pointer select-none hover:text-blk group ${right ? 'text-right' : 'text-left'}`}
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active ? (sortDir === 'asc' ? <ChevronUp size={10} className="text-red-mrt" /> : <ChevronDown size={10} className="text-red-mrt" />) : <ChevronsUpDown size={10} className="text-g300 group-hover:text-g400" />}
        </span>
      </th>
    );
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {sheetsToast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-[4px] shadow-lg text-[12.5px] font-medium animate-in slide-in-from-bottom-2 ${sheetsToast.type === 'ok' ? 'bg-[#0F9D58] text-white' : sheetsToast.type === 'warn' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'}`}>
          {(sheetsToast.type === 'ok' || sheetsToast.type === 'warn')
            ? <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
          }
          {sheetsToast.msg}
        </div>
      )}
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">
              Module 03
            </div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Orders <em className="italic text-red-mrt">Register</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">Orders converted from Won quotations.</p>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <Button onClick={() => navigate('/quotes')} variant="secondary">
              Quotations
            </Button>
            <Button 
              onClick={() => navigate('/orders/new')} 
              className="gap-2 bg-[#EAF8F1] border-[1.5px] border-[#A2DEBD] text-[#229A58] hover:bg-[#D5F2E1] font-bold tracking-[2.5px] px-4"
            >
              <span className="font-mono pt-[1px] font-bold">→</span> ORDER
            </Button>
          </div>
        </div>
      </div>

      <DateFilterBanner globalDateRange={globalDateRange} onClear={() => setGlobalDateRange(null)} />

      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-0">
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <TabSelect current="All" label="All" count={statusCounts.All} />
          <TabSelect current="Processing" label="Processing" count={statusCounts.Processing} />
          <TabSelect current="Delivered" label="Delivered" count={statusCounts.Delivered} />
        </div>
        
        <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>

        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[160px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="Company, PO No, Order No..."
            value={globalSearchQuery}
            onChange={(e) => applySearch(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[140px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="Unit / city..."
            value={siteQuery}
            onChange={e => setSiteQuery(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        <div className="ml-auto font-mono text-[10px] text-g500">
          {filteredOrders.length} order(s)
        </div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="bg-white border border-g200 overflow-x-auto m-0">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-g100">
              <tr>
                <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Order No.</th>
                <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Quote Ref</th>
                <SortTh col="cust">Customer - Unit</SortTh>
                <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">PO Number</th>
                <SortTh col="poDate">PO Date</SortTh>
                <SortTh col="items">Items</SortTh>
                <SortTh col="value" right>Order Value</SortTh>
                <SortTh col="created_at">Punched At</SortTh>
                <SortTh col="status">Status</SortTh>
                <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr><td colSpan={10} className="text-center p-8 text-g400 text-[13px]">No orders yet</td></tr>
              ) : (
                filteredOrders.map(o => {
                  const subTotal = o.items.reduce((s, i) => s + i.total, 0);
                  const itemGst = o.items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
                  const grandTotal = resolveAdjustments(o.adjustments, subTotal, itemGst, maxItemGstRate(o.items)).grand;
                  const isExpanded = expandedRow === o.id;

                  return (
                    <React.Fragment key={o.id}>
                      <tr 
                        className={`transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sW/5 ${isExpanded ? 'bg-sW/5' : ''}`}
                        onClick={() => setExpandedRow(isExpanded ? null : o.id)}
                      >
                        <td className="px-[13px] py-[10px] align-middle"><span className="font-mono text-[10.5px] font-bold text-sW">{o.id}</span></td>
                        <td className="px-[13px] py-[10px] align-middle"><span className="font-mono text-[10px] font-bold text-sQ">{o.quoteRef}</span></td>
                        <td className="px-[13px] py-[10px] align-middle">
                          <div className="font-semibold">{o.cust}{(() => { const sl = siteLabel(data.customers.find(c => c.name === o.cust), (o as any).siteId || data.enquiries.find(e => e.id === o.enqRef)?.siteId); return sl ? <span className="font-normal text-g500"> — {sl}</span> : null; })()}</div>
                        </td>
                        <td className="px-[13px] py-[10px] align-middle font-mono text-[11px] font-bold text-g700">
                          <div className="flex items-center gap-1.5">
                            {o.poNo}
                            {o.poFileName && o.poFileName.startsWith('http') && (
                              <a href={o.poFileName} target="_blank" rel="noopener noreferrer" className="ml-1 text-red-mrt hover:text-red-900">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              </a>
                            )}
                            {o.poFileName && !o.poFileName.startsWith('http') && (
                              <button 
                                disabled={downloadingPOId === o.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadPO(o.poFileName!, o.id, o.poNo);
                                }} 
                                className="ml-1 text-red-mrt hover:text-red-900 disabled:opacity-50 inline-flex items-center"
                              >
                                {downloadingPOId === o.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-[13px] py-[10px] align-middle text-[11.5px] text-g600 whitespace-nowrap">
                          {o.poDate ? fmtIST(new Date(o.poDate), 'dd-MMM-yyyy') : '--'}
                        </td>
                        <td className="px-[13px] py-[10px] align-middle">
                          <span className="font-mono text-[10px] font-bold bg-g100 text-g600 px-[7px] py-[2px] rounded-full inline-flex items-center">
                            {o.items.length} item(s)
                          </span>
                        </td>
                        <td className="px-[13px] py-[10px] align-middle text-right font-mono text-[12px] font-bold">{formatINR(grandTotal)}</td>
                        {/* <td className="px-[13px] py-[10px] align-middle text-[11.5px] whitespace-nowrap">
                          {o.dlvDate ? (() => {
                            // Colour the due date only while the order is still open:
                            // red = past due, amber = within 7 days, green = safe.
                            const cls = dlvDateClass(o.dlvDate, o.status);
                            return <span className={cls.text} title={cls.title}>{fmtIST(new Date(o.dlvDate), 'dd-MMM-yyyy')}</span>;
                          })() : <span className="text-g600">--</span>}
                        </td> */}
                        <td className="px-[13px] py-[10px] align-middle text-[11.5px] whitespace-nowrap">
                          {(o as any).created_at ? (() => {
                            const cls = punchedAtClass((o as any).created_at);
                            return <span className={cls.text} title={cls.title}>{fmtIST(new Date((o as any).created_at), 'dd-MMM-yyyy')}</span>;
                          })() : <span className="text-g600">--</span>}
                        </td>
                        <td className="px-[13px] py-[10px] align-middle"><Badge status={o.status} /></td>
                        <td className="px-[13px] py-[10px] align-middle" onClick={ev => ev.stopPropagation()}>
                          <div className="flex gap-1.5 flex-wrap">
                            {o.status !== 'Delivered' && (
                              <Button 
                                size="sm" 
                                variant="dark" 
                                onClick={() => {
                                  // mark as delivered
                                  updateOrder(o.id, { status: 'Delivered' }).catch(console.error);
                                }}
                              >
                                Complete
                              </Button>
                            )}
                            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); navigate(`/orders/new?orderId=${o.id}`); }}>Edit</Button>
                            <Button size="sm" variant="secondary" onClick={(e) => {
                              e.stopPropagation();
                              const qt = data.quotes.find(q => q.id === o.quoteRef);
                              const cust = data.customers.find(c => c.name === o.cust);
                              const unit = o.unitId ? data.units.find(u => u.id === o.unitId) : data.units.find(u => u.is_default);
                              const bank = o.bankAccountId ? data.bankAccounts.find(b => b.id === o.bankAccountId)
                                : data.bankAccounts.find(b => b.unit_id === unit?.id && b.is_default);
                              const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
                              const sig = unitSig ?? data.signatories.find(s => s.is_default);
                              generatePIPDF(o, qt, cust, data.settings, sig, true, unit, bank);
                            }}>PI</Button>
                            {false && (
                              <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setSendModalOrder(o); }}>
                                <Mail size={11} className="mr-1" />Email
                              </Button>
                            )}
                            <Button size="sm" variant="secondary" onClick={(ev) => { ev.stopPropagation(); openAttachmentModal('order', o.id); }}>Docs</Button>
                            {data.settings?.sheets_webhook_url && (
                              o.sheetsExportedAt ? (
                                <button type="button" disabled title={`Exported ${fmtIST(new Date(o.sheetsExportedAt!), 'dd-MMM-yyyy')}`} className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-[3px] border border-[#A2DEBD] bg-[#EAF8F1] cursor-not-allowed shrink-0">
                                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="#0F9D58" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </button>
                              ) : (
                                <button type="button" title="Export to Google Sheets" onClick={e => { e.stopPropagation(); handleExportSheets(o); }} disabled={exportingSheets === o.id} className="w-[26px] h-[26px] inline-flex items-center justify-center rounded-[3px] border border-g200 bg-white hover:border-[#0F9D58] hover:bg-green-50 disabled:opacity-40 disabled:pointer-events-none transition-all shrink-0">{exportingSheets === o.id ? <Loader2 size={12} className="animate-spin text-g400" /> : <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none"><rect x="3" y="2" width="13" height="17" rx="1.5" fill="#0F9D58"/><rect x="7" y="2" width="9" height="2.5" rx="0.8" fill="#87D8AF"/><line x1="6" y1="9.5" x2="14" y2="9.5" stroke="white" strokeWidth="1.2"/><line x1="6" y1="12.5" x2="14" y2="12.5" stroke="white" strokeWidth="1.2"/><line x1="6" y1="15.5" x2="11" y2="15.5" stroke="white" strokeWidth="1.2"/></svg>}</button>
                              )
                            )} 
                          </div> 
                          {/* // hide temporaryly to prevent unnecessary entries in google sheet otherwise its most useful button */}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-sW/[0.02] border-b-2 border-sW">
                          <td colSpan={10} className="p-0">
                            <div className="p-[10px_16px]">
                              <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-sW mb-[7px]">Order Line Items -- {o.id}</div>
                              <table className="w-full border-collapse text-[11.5px] m-0 mb-2">
                                <thead className="bg-g100">
                                  <tr>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">#</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Description</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Material (MOC)</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Qty</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">UOM</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Agreed Rate</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">GST%</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-right border-b border-g200">Total</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {o.items.map(i => (
                                    <tr key={i.seq}>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[10px] text-g400 w-6">{i.seq}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-medium">{i.desc}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[11px] text-g600">{i.mat}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[11.5px] font-bold">{i.qty}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk">{i.uom}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono">{formatINR(i.agreedRate)}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono">{i.gst}%</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono font-bold text-right">{formatINR(i.total)}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-[11px] text-g500">{i.remarks || '--'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
      </div>
      {sendModalOrder && (
        <SendEmailModal
          mode="order"
          doc={sendModalOrder}
          relatedQuote={data.quotes.find(q => q.id === sendModalOrder.quoteRef)}
          customer={data.customers.find(c => c.name === sendModalOrder.cust)}
          siteId={sendModalOrder.siteId}
          settings={data.settings}
          defaultSignatory={data.signatories.find((s: any) => s.is_default)}
          onClose={() => setSendModalOrder(null)}
          onSent={() => setSendModalOrder(null)}
        />
      )}
    </div>
  );
}
