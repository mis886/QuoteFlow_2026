import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { Badge, Button, DateFilterBanner } from '../components/ui';
import { Search, Plus, Send, ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QuoteStatus, Quote } from '../lib/types';
import { formatINR, fmtIST, isInDateRange, siteLabel } from '../lib/utils';
import { generateQuotePDF } from '../lib/pdfGenerator';
import { supabase } from '../lib/supabase';

export function Quotes() {
  const store = useAppStore();
  const { data, globalSearchQuery, setGlobalSearchQuery, openDetailPanel, openAttachmentModal, updateQuote, addFollowUpLog } = store;
  const { globalDateRange, setGlobalDateRange } = store as any;
  const navigate = useNavigate();
  const [tab, setTab] = useState<'All' | QuoteStatus>('All');
  const [custFilter, setCustFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [poReceivedIds, setPoReceivedIds] = useState<Set<string>>(new Set());
  const [siteQuery, setSiteQuery] = useState('');
  const [siteDebounced, setSiteDebounced] = useState('');
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const t = setTimeout(() => setSiteDebounced(siteQuery), 250);
    return () => clearTimeout(t);
  }, [siteQuery]);

  useEffect(() => {
    supabase.from('po_submissions').select('quote_id').then(({ data: rows }) => {
      if (rows) setPoReceivedIds(new Set(rows.map((r: any) => r.quote_id)));
    });
  }, []);

  const applySearch = (search: string) => {
    setGlobalSearchQuery(search);
  };

  const filteredQuotes = useMemo(() => {
    const qs = globalSearchQuery.toLowerCase();
    const sq = siteDebounced.toLowerCase();
    const list = data.quotes.filter(q => {
      if (tab !== 'All' && q.status !== tab) return false;
      if (qs) {
        const match = q.cust.toLowerCase().includes(qs) || q.id.toLowerCase().includes(qs) ||
          q.items.some(i => i.desc.toLowerCase().includes(qs));
        if (!match) return false;
      }
      if (custFilter && q.cust !== custFilter) return false;
      if (!isInDateRange(q.date, globalDateRange)) return false;
      if (sq) {
        const sl = siteLabel(data.customers.find(c => c.name === q.cust), (q as any).siteId) || '';
        const cust = data.customers.find(c => c.name === q.cust);
        const site = (cust?.sites ?? []).find((s: any) => s.id === (q as any).siteId);
        const city = (site as any)?.city || '';
        if (!sl.toLowerCase().includes(sq) && !city.toLowerCase().includes(sq)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      let av: any, bv: any;
      if (sortCol === 'date') { av = a.date; bv = b.date; }
      else if (sortCol === 'cust') { av = a.cust.toLowerCase(); bv = b.cust.toLowerCase(); }
      else if (sortCol === 'status') { av = a.status; bv = b.status; }
      else if (sortCol === 'value') { av = a.items.reduce((s, i) => s + i.total, 0); bv = b.items.reduce((s, i) => s + i.total, 0); }
      else if (sortCol === 'items') { av = a.items.length; bv = b.items.length; }
      else if (sortCol === 'sent_at') { av = a.sent_at || ''; bv = b.sent_at || ''; }
      else { av = a.date; bv = b.date; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [data.quotes, data.customers, globalSearchQuery, siteDebounced, tab, custFilter, globalDateRange, sortCol, sortDir]);

  const statusCounts = {
    Draft: data.quotes.filter(q => q.status === 'Draft').length,
    Sent: data.quotes.filter(q => q.status === 'Sent').length,
    Won: data.quotes.filter(q => q.status === 'Won').length,
    Lost: data.quotes.filter(q => q.status === 'Lost').length,
    Parked: data.quotes.filter(q => q.status === 'Parked').length,
    All: data.quotes.length
  };
  
  const customers = Array.from(new Set(data.quotes.map(q => q.cust)));

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
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">
              Module 02
            </div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Quotations <em className="italic text-red-mrt">Register</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">All quotes. Click row to expand line items.</p>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <Button onClick={() => navigate('/quotes/new')} variant="primary" className="gap-2">
              <Plus size={14} className="stroke-2" /> New Quote
            </Button>
          </div>
        </div>
      </div>

      <DateFilterBanner globalDateRange={globalDateRange} onClear={() => setGlobalDateRange(null)} />

      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-0">
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <TabSelect current="All" label="All" count={statusCounts.All} />
          <TabSelect current="Draft" label="Draft" count={statusCounts.Draft} />
          <TabSelect current="Sent" label="Sent" count={statusCounts.Sent} />
          <TabSelect current="Won" label="Won" count={statusCounts.Won} />
          <TabSelect current="Lost" label="Lost" count={statusCounts.Lost} />
          <TabSelect current="Parked" label="Parked" count={statusCounts.Parked} />
        </div>
        
        <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>

        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[160px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="Company, item, quote no..."
            value={globalSearchQuery}
            onChange={(e) => applySearch(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        <select
          title="Filter by customer"
          className="font-sans text-xs text-blk bg-white border border-g200 rounded py-1 pl-2 pr-6 cursor-pointer outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_7px_center]"
          value={custFilter}
          onChange={(e) => setCustFilter(e.target.value)}
        >
          <option value="">All Customers</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

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
          {filteredQuotes.length} quotes
        </div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="bg-white border border-g200 overflow-x-auto m-0">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-g100">
              <tr>
                <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Quote No.</th>
                <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">ENQ Ref</th>
                <SortTh col="cust">Customer - Unit</SortTh>
                <SortTh col="date">Date</SortTh>
                <SortTh col="items">Items</SortTh>
                <SortTh col="value" right>Value (excl. GST)</SortTh>
                <SortTh col="value" right>Grand Total</SortTh>
                <SortTh col="status">Status</SortTh>
                <SortTh col="sent_at">Punched At</SortTh>
                <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.length === 0 ? (
                <tr><td colSpan={10} className="text-center p-8 text-g400 text-[13px]">No quotations match</td></tr>
              ) : (
                filteredQuotes.map(q => {
                  const subTotal = q.items.reduce((s, i) => s + i.total, 0);
                  const gstTotal = q.items.reduce((s, i) => s + (i.total * i.gst / 100), 0);
                  const grandTotal = subTotal + gstTotal;
                  const isExpanded = expandedRow === q.id;

                  return (
                    <React.Fragment key={q.id}>
                      <tr 
                        className={`transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sQ/5 ${isExpanded ? 'bg-sQ/5' : ''}`}
                        onClick={() => setExpandedRow(isExpanded ? null : q.id)}
                      >
                        <td className="px-[13px] py-[10px] align-middle"><span className="font-mono text-[10.5px] font-bold text-sQ">{q.id}</span></td>
                        <td className="px-[13px] py-[10px] align-middle">{q.enqRef ? <span className="font-mono text-[10px] font-bold text-red-mrt">{q.enqRef}</span> : <span className="font-mono text-[10px] font-bold text-g400" title="Standalone quote — not linked to an enquiry">—</span>}</td>
                        <td className="px-[13px] py-[10px] align-middle">
                          <div className="font-semibold">{q.cust}{(() => { const sl = siteLabel(data.customers.find(c => c.name === q.cust), (q as any).siteId || data.enquiries.find(e => e.id === q.enqRef)?.siteId); return sl ? <span className="font-normal text-g500"> — {sl}</span> : null; })()}</div>
                        </td>
                        <td className="px-[13px] py-[10px] align-middle text-[11.5px] text-g600 whitespace-nowrap">
                          {q.date ? fmtIST(new Date(q.date), 'dd-MMM-yyyy') : '--'}
                        </td>
                        <td className="px-[13px] py-[10px] align-middle">
                          <span className="font-mono text-[10px] font-bold bg-g100 text-g600 px-[7px] py-[2px] rounded-full inline-flex items-center">
                            {q.items.length} item(s)
                          </span>
                        </td>
                        <td className="px-[13px] py-[10px] align-middle text-right font-mono text-[12px]">{formatINR(subTotal)}</td>
                        <td className="px-[13px] py-[10px] align-middle text-right font-mono text-[12px] font-bold">{formatINR(grandTotal)}</td>
                        <td className="px-[13px] py-[10px] align-middle">
                          <div className="flex items-center gap-1.5">
                            <Badge status={q.status} />
                            {poReceivedIds.has(q.id) && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-300 text-green-700 text-[9.5px] font-bold tracking-wide uppercase whitespace-nowrap">
                                <svg viewBox="0 0 24 24" width="9" height="9" stroke="currentColor" strokeWidth="2.5" fill="none"><polyline points="20 6 9 17 4 12"/></svg>
                                PO Received
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-[13px] py-[10px] align-middle text-[11.5px] text-g600 whitespace-nowrap">
                          {q.sent_at
                            ? fmtIST(new Date(q.sent_at), 'dd MMM HH:mm')
                            : q.status === 'Draft'
                              ? <span className="text-g400 italic">not sent</span>
                              : '--'}
                        </td>
                        <td className="px-[13px] py-[10px] align-middle" onClick={ev => ev.stopPropagation()}>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => navigate(`/quotes/new?id=${q.id}`)}>Edit</Button>
                            <Button size="sm" variant="secondary" onClick={(ev) => { ev.stopPropagation(); openDetailPanel('quote', q.id); }}>Detail</Button>
                            <Button size="sm" variant="secondary" onClick={(ev) => {
                              ev.stopPropagation();
                              const cust = data.customers.find(c => c.name === q.cust);
                              const unit = q.unitId ? data.units.find(u => u.id === q.unitId) : data.units.find(u => u.is_default);
                              const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
                              const sig = unitSig ?? data.signatories.find(s => s.is_default);
                              generateQuotePDF(q, cust, data.settings, sig, true, unit);
                            }}>PDF</Button>
                            <Button size="sm" variant="secondary" onClick={(ev) => { ev.stopPropagation(); openAttachmentModal('quote', q.id); }}>Docs</Button>
                            {q.status === 'Draft' && (
                              <Button size="sm" variant="primary" onClick={async (ev) => {
                                ev.stopPropagation();
                                const now = new Date().toISOString();
                                await updateQuote(q.id, { status: 'Sent', sent_at: now });
                                await addFollowUpLog(q.id, { ts: now, who: 'System', channel: 'Email', note: `Quote sent — ${q.id}` }, null, null, '');
                              }} className="gap-1.5">
                                <Send size={12} /> Mark Sent
                              </Button>
                            )}
                            {(q.status === 'Won' || q.status === 'Sent') && (
                              (() => {
                                const isOrdered = data.orders.some(o => o.quoteRef === q.id);
                                return isOrdered ? (
                                  <Button size="sm" variant="secondary" disabled className="bg-g100 text-g400 cursor-not-allowed">Ordered</Button>
                                ) : (
                                  <Button size="sm" variant="success" onClick={() => navigate(`/orders/new?quoteRef=${q.id}`)} className="btn-order active:scale-95 transition-transform">Order</Button>
                                );
                              })()
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-sQ/[0.02] border-b-2 border-sQ">
                          <td colSpan={10} className="p-0">
                            <div className="p-[10px_16px]">
                              <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-sQ mb-[7px]">Line Items -- {q.id}</div>
                              <table className="w-full border-collapse text-[11.5px] m-0 mb-2">
                                <thead className="bg-g100">
                                  <tr>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">#</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Description</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Material</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">HSN</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Qty</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">Unit Price</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-left border-b border-g200">GST%</th>
                                    <th className="font-mono text-[8px] tracking-[1px] uppercase text-g400 px-2.5 py-1.5 text-right border-b border-g200">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {q.items.map(i => (
                                    <tr key={i.seq}>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[10px] text-g400 w-6">{i.seq}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-medium">{i.desc}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[11px] text-g600">{i.mat}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[10px]">{i.hsn || ''}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono text-[11.5px] font-bold">{i.qty}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono">{formatINR(i.unitPrice)}</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono">{i.gst}%</td>
                                      <td className="px-2.5 py-1.5 border-b border-g100 text-blk font-mono font-bold text-right">{formatINR(i.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <div className="flex justify-end pt-2 border-t border-g200 gap-5 items-center">
                                <span className="text-[12px] text-g600">Sub-Total: <strong className="text-blk font-bold font-mono">{formatINR(subTotal)}</strong></span>
                                <span className="text-[12px] text-g600">GST: <strong className="text-blk font-bold font-mono">{formatINR(gstTotal)}</strong></span>
                                <span className="text-[13px] text-red-mrt font-bold font-mono tracking-tight">Grand: {formatINR(grandTotal)}</span>
                              </div>
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

    </div>
  );
}
