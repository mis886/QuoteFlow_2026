import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { ArrowLeft, ArrowUp, CheckCircle2, Loader2, Plus, Search, Upload, X } from 'lucide-react';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Customer } from '../lib/types';
import { formatINR, isLead, LEAD_PROMOTE_THRESHOLD, LEAD_EXCLUDED_ORDER_STATUSES, normalizeSearchText, nameTier, canDeleteRecords } from '../lib/utils';
import { friendlyDeleteError } from '../lib/cascadeDelete';
import { CustomerPanel, InitialAvatar, TierBadge, getPrimaryContact, importCustomerCsvRows } from './Customers';

// Customer Lead — small / not-qualified buyers (mostly IndiaMART, orders
// below ₹1 lakh). Same customers table as Customer Master, customer_status
// 'lead'. A lead's order total isn't stored: it's summed live from orders
// (orders link to customers by company NAME, like the rest of the app). At
// ₹1,00,000 a lead can be promoted — same row, same id, status → 'customer'.
// Same look as Customer Master (Customers.tsx) with amber instead of red.

const COLUMNS = ['Company', 'Contact', 'Mobile', 'City / State', 'Enq / Orders', 'Order Value (Total)', 'CRM', 'Actions'];
// Long headers allowed to wrap onto two lines when space is tight (1366px),
// so the table never needs a sideways scroll bar.
const WRAPPABLE_HEADERS = new Set(['Enq / Orders', 'Order Value (Total)']);

const selectCls = 'select-filter font-sans text-xs text-blk bg-white border border-g200 rounded py-1 pl-2 pr-6 cursor-pointer outline-none appearance-none';

// orders = every order (Enq / Orders column); countedOrders + orderValue skip
// Lost orders (LEAD_EXCLUDED_ORDER_STATUSES) — they drive the ₹1L bar,
// "Ordered at least once" and "Ready to Promote".
interface LeadStats { enquiries: number; orders: number; countedOrders: number; orderValue: number; }

export function CustomerLeads() {
  const navigate = useNavigate();
  const { data, user, addCustomer, deleteLead, globalSearchQuery } = useAppStore() as any;
  // Same delete permission as Enquiries / Quotes / Orders.
  const canDelete = canDeleteRecords(user?.email);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [crmFilter, setCrmFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Customer | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Seed/sync local search from the global Topbar query, same as Customer Master.
  useEffect(() => { if (globalSearchQuery) setSearchQuery(globalSearchQuery); }, [globalSearchQuery]);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const leads: Customer[] = useMemo(() => data.customers.filter((c: Customer) => isLead(c)), [data.customers]);

  // Enquiry / order counts and total order value per company name.
  const statsByName = useMemo(() => {
    const m = new Map<string, LeadStats>();
    const get = (name: string) => {
      let s = m.get(name);
      if (!s) { s = { enquiries: 0, orders: 0, countedOrders: 0, orderValue: 0 }; m.set(name, s); }
      return s;
    };
    const leadNames = new Set(leads.map(l => l.name));
    for (const e of data.enquiries) if (leadNames.has(e.cust)) get(e.cust).enquiries++;
    for (const o of data.orders) {
      if (!leadNames.has(o.cust)) continue;
      const s = get(o.cust);
      s.orders++;
      if (LEAD_EXCLUDED_ORDER_STATUSES.includes(o.status)) continue;
      s.countedOrders++;
      s.orderValue += Number(o.value) || 0;
    }
    return m;
  }, [leads, data.enquiries, data.orders]);
  const statsFor = (c: Customer): LeadStats => statsByName.get(c.name) ?? { enquiries: 0, orders: 0, countedOrders: 0, orderValue: 0 };

  const states = Array.from(new Set(leads.map(l => l.sites?.[0]?.state?.trim()).filter(Boolean) as string[])).sort();
  const crms = Array.from(new Set(leads.map(l => l.crm).filter(Boolean) as string[])).sort();

  const filtered = leads.filter(c => {
    if (searchQuery) {
      const q = normalizeSearchText(searchQuery);
      const contact = getPrimaryContact(c);
      const phoneQ = searchQuery.replace(/\D/g, '');
      const hit = normalizeSearchText(c.name ?? '').includes(q)
        || normalizeSearchText(contact?.name ?? '').includes(q)
        || (phoneQ.length >= 3 && (contact?.phone ?? '').replace(/\D/g, '').includes(phoneQ));
      if (!hit) return false;
    }
    if (stateFilter && (c.sites?.[0]?.state?.trim() || '') !== stateFilter) return false;
    if (crmFilter && (c.crm || '') !== crmFilter) return false;
    return true;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' }));
  if (searchQuery) filtered.sort((a, b) => nameTier(a.name ?? '', searchQuery) - nameTier(b.name ?? '', searchQuery));

  const stats = {
    total: leads.length,
    ordered: leads.filter(l => statsFor(l).countedOrders > 0).length,
    ready: leads.filter(l => statsFor(l).orderValue >= LEAD_PROMOTE_THRESHOLD).length,
  };
  const hasFilters = !!(searchQuery || stateFilter || crmFilter);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { imported, skipped } = await importCustomerCsvRows(results.data as Record<string, string>[], { customers: data.customers, addCustomer, status: 'lead' });
          showToast('ok', `Import complete: ${imported} lead${imported === 1 ? '' : 's'} added, ${skipped} skipped (already exist).`);
        } catch (err) {
          showToast('err', 'Import failed: ' + (err as Error).message);
        } finally {
          setImporting(false);
          e.target.value = '';
        }
      },
    });
  };
  // Delete (admins only): deleteLead removes the row ONLY if it's still a
  // lead, throws on any failure (FK / permission / nothing deleted) and logs
  // to activity_log like a customer delete. Linked enquiries / quotes /
  // orders (matched by company name) are left as they are.
  const linkedCounts = (c: Customer) => ({
    enquiries: data.enquiries.filter((e: any) => e.cust === c.name).length,
    quotes: data.quotes.filter((q: any) => q.cust === c.name).length,
    orders: data.orders.filter((o: any) => o.cust === c.name).length,
  });
  const handleDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    const { id, name } = deleteTarget;
    setDeleting(true);
    try {
      await deleteLead(id);
      setDeleteTarget(null);
      if (selectedLead?.id === id) setSelectedLead(null);
      showToast('ok', `Lead ${name} deleted.`);
    } catch (err) {
      setDeleteTarget(null);
      showToast('err', `Delete failed: ${friendlyDeleteError(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">

      {/* Page header */}
      <div className="pt-5 px-6">
        <button type="button" onClick={() => navigate('/customers')}
          className="inline-flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g600 border border-g200 bg-white rounded-[3px] px-2.5 py-1 mb-3 hover:border-lead hover:text-lead-text transition-colors">
          <ArrowLeft size={11} /> Back to Customer Master
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-lead-text mb-1">Customer Relation Management</div>
            <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
              Customer <em className="italic text-lead-text">Lead</em>
            </h1>
            <p className="text-xs text-g500 mt-1 font-light">Small-order &amp; IndiaMART buyers (orders below ₹1 lakh) · Promote to Customer Master once they cross ₹1 lakh</p>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <Button variant="dark" className="gap-2 relative" disabled={importing}>
              <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer w-full" onChange={handleImport} title="Import CSV" />
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} className="stroke-2" />}
              Import CSV
            </Button>
            <Button variant="primary" className="gap-2 bg-lead hover:bg-lead-strong hover:shadow-none" onClick={() => navigate('/customers/leads/new')}>
              <Plus size={14} className="stroke-2" /> Add Lead
            </Button>
          </div>
        </div>

        {/* Stat boxes */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {([
            ['Total Leads', stats.total, 'text-blk'],
            ['Ordered at least once', stats.ordered, 'text-blk'],
            ['Ready to Promote (≥ ₹1L)', stats.ready, 'text-sW'],
          ] as const).map(([label, value, cls]) => (
            <div key={label} className="bg-white border border-g200 rounded-[3px] px-4 py-3">
              <div className="font-mono text-[8.5px] font-bold uppercase tracking-[1.5px] text-g400">{label}</div>
              <div className={`text-[22px] font-bold leading-tight mt-0.5 ${cls}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-2.5 bg-white border-b border-g200 flex-wrap mt-3">
        <div className="flex items-center gap-1.5 bg-white border border-g200 rounded px-2 h-7 min-w-[240px] focus-within:border-lead focus-within:ring-2 focus-within:ring-lead/20">
          <Search size={11} className="text-g400 shrink-0" />
          <input type="text" placeholder="Company, contact, mobile…" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none font-sans text-xs text-blk w-full placeholder:text-g400" />
          {searchQuery && (
            <button type="button" title="Clear search" onClick={() => setSearchQuery('')} className="text-g400 hover:text-blk transition-colors shrink-0">
              <X size={11} />
            </button>
          )}
        </div>
        <select title="Filter by state" value={stateFilter} onChange={e => setStateFilter(e.target.value)} className={selectCls}>
          <option value="">All States</option>
          {states.map(s => <option key={s}>{s}</option>)}
        </select>
        <select title="Filter by CRM" value={crmFilter} onChange={e => setCrmFilter(e.target.value)} className={selectCls}>
          <option value="">All CRM</option>
          {crms.map(s => <option key={s}>{s}</option>)}
        </select>
        {hasFilters && (
          <button type="button" onClick={() => { setSearchQuery(''); setStateFilter(''); setCrmFilter(''); }}
            className="flex items-center gap-1 font-mono text-[10px] text-g500 hover:text-lead-text border border-g200 hover:border-lead rounded px-2 h-7 transition-colors whitespace-nowrap">
            <X size={10} /> Clear filters
          </button>
        )}
        <div className="ml-auto font-mono text-[10px] text-g500">{filtered.length} records</div>
      </div>

      {/* Table — laid out like Quotes (auto column widths, same header and
          cell padding), so columns sit close to their content. Contact is
          capped and truncates; the two longest headers may wrap to a second
          line on narrow screens so nothing scrolls sideways at 1366px. */}
      <div className="px-6 pb-7 pt-[14px] flex-1 min-h-0 flex flex-col">
        <div className="bg-white border border-g200 overflow-auto flex-1 min-h-0">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="bg-g100">
              <tr>
                {COLUMNS.map(label => (
                  <th key={label} className={`sticky top-0 z-10 bg-g100 font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left border-b border-g200 shadow-[0_1px_0_0_theme(colors.g200)] ${WRAPPABLE_HEADERS.has(label) ? '' : 'whitespace-nowrap'}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="text-center p-8 text-g400 text-[13px]">{leads.length === 0 ? 'No leads yet — click "+ Add Lead" or import a CSV' : 'No leads match'}</td></tr>
              ) : filtered.map(c => {
                const contact = getPrimaryContact(c);
                const st = statsFor(c);
                const pct = Math.min(1, st.orderValue / LEAD_PROMOTE_THRESHOLD);
                const ready = st.orderValue >= LEAD_PROMOTE_THRESHOLD;
                const site = c.sites?.[0];
                return (
                  <tr key={c.id} className="transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-lead/5" onClick={() => setSelectedLead(c)}>
                    {/* Company */}
                    <td className="px-[13px] py-[10px] align-middle">
                      <div className="flex items-center gap-2.5">
                        <InitialAvatar name={c.name} />
                        <div className="min-w-0">
                          <div className="font-semibold text-blk leading-snug [overflow-wrap:anywhere]">{c.name}</div>
                          <TierBadge tier={c.tier} />
                        </div>
                      </div>
                    </td>
                    {/* Contact — capped width, long names / emails truncate */}
                    <td className="px-[13px] py-[10px] align-middle">
                      {contact?.name ? (
                        <div className="max-w-[150px]">
                          <div className="font-medium text-blk truncate" title={contact.name}>{contact.name}</div>
                          {contact.email && <div className="text-[10.5px] text-g400 font-mono truncate" title={contact.email}>{contact.email}</div>}
                        </div>
                      ) : <span className="text-g300">—</span>}
                    </td>
                    {/* Mobile */}
                    <td className="px-[13px] py-[10px] align-middle whitespace-nowrap">
                      {contact?.phone ? <span className="font-mono text-[11px] text-g600">{contact.phone}</span> : <span className="text-g300">—</span>}
                    </td>
                    {/* City / State */}
                    <td className="px-[13px] py-[10px] align-middle text-g600">
                      {[site?.city, site?.state].filter(Boolean).join(', ') || <span className="text-g300">—</span>}
                    </td>
                    {/* Enq / Orders */}
                    <td className="px-[13px] py-[10px] align-middle font-mono text-[11px] text-g600 whitespace-nowrap">
                      {st.enquiries} / {st.orders}
                    </td>
                    {/* Order Value (Total) + progress to ₹1L */}
                    <td className="px-[13px] py-[10px] align-middle">
                      <div className={`font-mono text-[11.5px] font-bold whitespace-nowrap ${ready ? 'text-sW' : 'text-blk'}`}>{formatINR(Math.round(st.orderValue))}</div>
                      <div className="h-[4px] min-w-[80px] bg-g200 rounded-full mt-1 overflow-hidden" title={`${Math.round(pct * 100)}% of ₹1,00,000`}>
                        <div className={`h-full rounded-full ${ready ? 'bg-sW' : 'bg-lead'}`} style={{ width: `${pct * 100}%` }} />
                      </div>
                    </td>
                    {/* CRM */}
                    <td className="px-[13px] py-[10px] align-middle text-g600 whitespace-nowrap">{c.crm || '—'}</td>
                    {/* Actions */}
                    <td className="px-[13px] py-[10px] align-middle" onClick={e => e.stopPropagation()}>
                      {/* One line: Promote, Profile, edit, Delete (admins) — all 26px tall. */}
                      <div className="flex items-center gap-[6px] flex-nowrap whitespace-nowrap">
                        {/* On every lead; filled green once it has crossed ₹1 lakh. Opens the
                            customer form in promote mode — nothing changes until Save & Promote. */}
                        <Button size="sm" variant="secondary"
                          className={`h-[26px] gap-1 border-sW hover:border-sW ${ready ? 'bg-sW text-white hover:bg-sW/90' : 'bg-white text-sW hover:bg-sW/10'}`}
                          title={ready ? 'Crossed ₹1 lakh — ready to promote' : 'Move to Customer Master'}
                          onClick={() => navigate(`/customers/new?id=${encodeURIComponent(c.id)}&promote=1`)}>
                          <ArrowUp size={10} className="stroke-[2.5]" /> Promote
                        </Button>
                        <Button size="sm" variant="secondary" className="h-[26px]" onClick={() => setSelectedLead(c)}>Profile</Button>
                        <Button size="sm" variant="secondary" className="h-[26px] w-[26px] px-0 justify-center" title="Edit lead" onClick={() => navigate(`/customers/leads/new?id=${c.id}`)}>
                          <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </Button>
                        {/* Same Delete as Enquiries / Quotes / Orders (canDeleteRecords). */}
                        {canDelete && (
                          <Button size="sm" variant="ghost" className="h-[26px] text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteTarget(c)}>Delete</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[10.5px] text-g400 mt-2">Progress bar = total order value vs ₹1,00,000 promotion threshold</div>
      </div>

      {/* Profile panel — the same one Customer Master uses */}
      {selectedLead && (
        <CustomerPanel
          customer={data.customers.find((c: Customer) => c.id === selectedLead.id) ?? selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      {deleteTarget && (() => {
        const n = linkedCounts(deleteTarget);
        const hasLinked = n.enquiries + n.quotes + n.orders > 0;
        return (
          <ConfirmDialog
            title={`Delete lead ${deleteTarget.name}?`}
            confirmLabel="Delete"
            busy={deleting}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
          >
            This cannot be undone.
            {hasLinked && (
              <div className="mt-2 text-[12px] text-lead-text bg-lead-bg border border-lead/50 rounded-[3px] px-2.5 py-1.5">
                This lead has {n.enquiries} enquir{n.enquiries === 1 ? 'y' : 'ies'} / {n.quotes} quote{n.quotes === 1 ? '' : 's'} / {n.orders} order{n.orders === 1 ? '' : 's'} linked. They will NOT be deleted but will no longer be linked to a lead.
              </div>
            )}
          </ConfirmDialog>
        );
      })()}


      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-[4px] shadow-lg text-[12.5px] font-medium text-white animate-in slide-in-from-bottom-2 ${toast.type === 'ok' ? 'bg-sW' : 'bg-red-mrt'}`}>
          {toast.type === 'ok' && <CheckCircle2 size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
