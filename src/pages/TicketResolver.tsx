import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { Badge, Button } from '../components/ui';
import { Search, Plus, ChevronsUpDown, ChevronUp, ChevronDown, X } from 'lucide-react';
import { fmtIST, normalizeSearchText } from '../lib/utils';
import { TicketStatus } from '../lib/types';
import { TicketRaiseForm } from './TicketRaise';

export function TicketResolver() {
  const { data, openDetailPanel } = useAppStore();
  const [tab, setTab] = useState<'All' | TicketStatus>('All');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showNewTicket, setShowNewTicket] = useState(false);

  const statusCounts = {
    All: data.tickets.length,
    Open: data.tickets.filter(t => t.status === 'Open').length,
    'In Progress': data.tickets.filter(t => t.status === 'In Progress').length,
    Resolved: data.tickets.filter(t => t.status === 'Resolved').length,
    Closed: data.tickets.filter(t => t.status === 'Closed').length,
  };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = data.tickets.filter(t => {
      if (tab !== 'All' && t.status !== tab) return false;
      if (q) {
        const hay = `${t.id} ${t.raisedByName} ${t.raisedByEmail} ${t.subject} ${t.module}`.toLowerCase();
        if (!normalizeSearchText(hay).includes(normalizeSearchText(q))) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let av: any, bv: any;
      if (sortCol === 'id') { av = a.id; bv = b.id; }
      else if (sortCol === 'raisedByName') { av = a.raisedByName?.toLowerCase() || ''; bv = b.raisedByName?.toLowerCase() || ''; }
      else if (sortCol === 'module') { av = a.module; bv = b.module; }
      else if (sortCol === 'subject') { av = a.subject?.toLowerCase() || ''; bv = b.subject?.toLowerCase() || ''; }
      else if (sortCol === 'priority') { const o = ['Low', 'Medium', 'High']; av = o.indexOf(a.priority); bv = o.indexOf(b.priority); }
      else if (sortCol === 'status') { av = a.status; bv = b.status; }
      else { av = a.created_at || ''; bv = b.created_at || ''; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [data.tickets, tab, search, sortCol, sortDir]);

  const SortTh = ({ col, label }: { col: string; label: string }) => (
    <th onClick={() => toggleSort(col)}
      className={`font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase px-[13px] py-[9px] whitespace-nowrap border-b border-g200 cursor-pointer select-none hover:bg-g200 transition-colors text-left ${sortCol === col ? 'text-red-mrt bg-red-lt/40' : 'text-g500'}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortCol === col ? (sortDir === 'asc' ? <ChevronUp size={9} /> : <ChevronDown size={9} />) : <ChevronsUpDown size={9} className="text-g300" />}
      </span>
    </th>
  );

  const TabSelect = ({ current, label, count }: { current: 'All' | TicketStatus, label: string, count: number }) => (
    <div
      onClick={() => setTab(current)}
      className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${tab === current ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
    >
      {label} ({count})
    </div>
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Support</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Ticket <em className="italic text-red-mrt">Resolver</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">Every ticket raised across the team.</p>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <Button onClick={() => setShowNewTicket(true)} variant="primary" className="gap-2">
              <Plus size={14} className="stroke-2" /> New Ticket
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-4">
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px]">
          <TabSelect current="All" label="All" count={statusCounts.All} />
          <TabSelect current="Open" label="Open" count={statusCounts.Open} />
          <TabSelect current="In Progress" label="In Progress" count={statusCounts['In Progress']} />
          <TabSelect current="Resolved" label="Resolved" count={statusCounts.Resolved} />
          <TabSelect current="Closed" label="Closed" count={statusCounts.Closed} />
        </div>

        <div className="w-px h-[18px] bg-g200 shrink-0 mx-1"></div>

        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[200px] transition-colors focus-within:border-red-mrt focus-within:ring-2 focus-within:ring-red-lt">
          <Search size={11} className="text-g400 shrink-0" />
          <input
            type="text"
            placeholder="Ticket, raised by, subject, module..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400"
          />
        </div>

        <div className="ml-auto font-mono text-[10px] text-g500">{filtered.length} tickets</div>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="bg-white border border-g200 overflow-x-auto m-0">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-g100">
              <tr>
                <SortTh col="id" label="Ticket" />
                <SortTh col="raisedByName" label="Raised By" />
                <SortTh col="module" label="Module" />
                <SortTh col="subject" label="Subject" />
                <SortTh col="priority" label="Priority" />
                <SortTh col="status" label="Status" />
                <SortTh col="created_at" label="Date" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-8 text-g400 text-[13px]">No tickets match this filter</td></tr>
              ) : (
                filtered.map(t => (
                  <tr key={t.id} onClick={() => openDetailPanel('ticket', t.id)}
                    className="group transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-red-mrt/5">
                    <td className="px-[13px] py-[10px] align-top"><span className="font-mono text-[10.5px] font-bold text-red-mrt">{t.id}</span></td>
                    <td className="px-[13px] py-[10px] align-top">
                      <div className="font-semibold text-blk">{t.raisedByName}</div>
                      <div className="text-[10.5px] text-g500">{t.raisedByEmail}</div>
                    </td>
                    <td className="px-[13px] py-[10px] align-top">
                      <span className="inline-flex items-center text-[11px] text-g600 bg-g100 px-2 py-0.5 rounded-[3px] font-medium">{t.module}</span>
                    </td>
                    <td className="px-[13px] py-[10px] align-top max-w-[280px] truncate">{t.subject}</td>
                    <td className="px-[13px] py-[10px] align-top font-mono text-[10.5px] font-bold text-g600">{t.priority}</td>
                    <td className="px-[13px] py-[10px] align-top"><Badge status={t.status} /></td>
                    <td className="px-[13px] py-[10px] align-top text-[11.5px] text-g600 whitespace-nowrap">
                      {t.created_at ? fmtIST(new Date(t.created_at), 'dd MMM HH:mm') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNewTicket && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) setShowNewTicket(false); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] border border-g300">
            <div className="p-4 border-b border-g200 flex items-center justify-between bg-white">
              <div>
                <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt mb-1">Support</div>
                <div className="text-base font-semibold text-blk">New Ticket</div>
              </div>
              <button onClick={() => setShowNewTicket(false)} className="p-2 text-g400 hover:text-blk bg-g100 hover:bg-g200 rounded-md transition-colors"><X size={14} strokeWidth={2.5} /></button>
            </div>
            <div className="overflow-y-auto">
              <TicketRaiseForm onSubmitted={() => setShowNewTicket(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
