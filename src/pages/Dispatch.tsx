import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { Truck, PackageCheck, Clock, CheckCircle2 } from 'lucide-react';
import { canDeleteRecords } from '../lib/utils';
import { Order, DispatchEntry, DispatchFulfillmentType, DispatchStage } from '../lib/types';

// ── small local helpers (kept in this file — not reused elsewhere yet) ──

function StagePill({ status, overdue }: { status: DispatchStage['status']; overdue: boolean }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold bg-sW/10 text-sW whitespace-nowrap">
        <CheckCircle2 size={10} /> Done
      </span>
    );
  }
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold bg-red-mrt/10 text-red-mrt whitespace-nowrap">
        <Clock size={10} /> Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold bg-sR/10 text-sR whitespace-nowrap">
      <Clock size={10} /> Pending
    </span>
  );
}

function currentStageOf(entry: DispatchEntry): DispatchStage | null {
  return entry.stages[entry.currentStageIndex] ?? null;
}

function isEntryOverdue(entry: DispatchEntry, now: number): boolean {
  const stage = currentStageOf(entry);
  return !!stage && !!stage.planned && new Date(stage.planned).getTime() < now;
}

export function Dispatch() {
  const navigate = useNavigate();
  const { data, user, advanceDispatchStage, deleteDispatchEntry } = useAppStore();
  const now = Date.now();
  const canDelete = canDeleteRecords(user?.email);

  const [tab, setTab] = useState<'toDispatch' | 'toSend'>('toDispatch');
  const [subType, setSubType] = useState<DispatchFulfillmentType>('delivery');

  const entries = data.dispatchEntries;
  const overdueCount = entries.filter(e => isEntryOverdue(e, now)).length;
  const inProgressCount = entries.filter(e => e.currentStageIndex < e.stages.length).length;
  const completedCount = entries.filter(e => e.currentStageIndex >= e.stages.length).length;
  const selfPickupCount = entries.filter(e => e.fulfillmentType === 'self_pickup').length;
  const deliveryCount = entries.filter(e => e.fulfillmentType === 'delivery').length;

  const visibleEntries = useMemo(
    () => entries.filter(e => e.fulfillmentType === subType).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [entries, subType],
  );

  const orderFor = (entry: DispatchEntry): Order | undefined => data.orders.find(o => o.id === entry.orderId);

  const KpiCard = ({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'default' | 'warn' | 'ok' }) => (
    <div className="bg-white border border-g200 rounded-[4px] p-3.5 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-[4px] flex items-center justify-center shrink-0 ${tone === 'warn' ? 'bg-red-mrt/10 text-red-mrt' : tone === 'ok' ? 'bg-sW/10 text-sW' : 'bg-g100 text-g500'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-lg font-bold text-blk leading-none">{value}</div>
        <div className="text-[10.5px] text-g500 mt-1 truncate">{label}</div>
      </div>
    </div>
  );

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
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <Button
              onClick={() => navigate('/dispatch/new')}
              className="gap-2 bg-[#EAF8F1] border-[1.5px] border-[#A2DEBD] text-[#229A58] hover:bg-[#D5F2E1] font-bold tracking-[2.5px] px-4"
            >
              <span className="font-mono pt-[1px] font-bold">+</span> New Dispatch Entry
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="In Order → Dispatch" value={inProgressCount} icon={<Truck size={16} />} tone="default" />
        <KpiCard label="Stages Overdue" value={overdueCount} icon={<Clock size={16} />} tone="warn" />
        <KpiCard label="Ready for Dispatch → Sent" value={completedCount} icon={<PackageCheck size={16} />} tone="ok" />
        <KpiCard label="Total Entries" value={entries.length} icon={<CheckCircle2 size={16} />} tone="default" />
      </div>

      <div className="flex items-center gap-2 px-6 py-2.5 mt-3 bg-white border-b border-g200 flex-wrap">
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
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Order No.</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Customer</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Doer</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Current Stage</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Progress</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Next Action Due</th>
                  <th className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] text-left whitespace-nowrap border-b border-g200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 ? (
                  <tr><td colSpan={7} className="text-center p-8 text-g400 text-[13px]">No {subType === 'self_pickup' ? 'Self Pickup' : 'Delivery'} entries yet</td></tr>
                ) : (
                  visibleEntries.map(entry => {
                    const order = orderFor(entry);
                    const stage = currentStageOf(entry);
                    const overdue = isEntryOverdue(entry, now);
                    const doneCount = entry.stages.filter(s => s.status === 'done').length;
                    const isComplete = entry.currentStageIndex >= entry.stages.length;
                    return (
                      <tr
                        key={entry.id}
                        className="group transition-colors border-b border-g100 last:border-b-0 hover:bg-sW/5"
                      >
                        <td className="px-[13px] py-[10px] align-top"><span className="font-mono text-[10.5px] font-bold text-sW">{entry.orderId}</span></td>
                        <td className="px-[13px] py-[10px] align-top">
                          <div className="font-semibold">{order?.cust || '—'}</div>
                          <div className="text-[10.5px] text-g500 font-mono">{order?.poNo}</div>
                        </td>
                        <td className="px-[13px] py-[10px] align-top text-[11.5px] text-g600">{stage?.owner || '—'}</td>
                        <td className="px-[13px] py-[10px] align-top">
                          {isComplete ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold bg-sW/10 text-sW whitespace-nowrap"><PackageCheck size={10} /> All stages done</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[9.5px] text-g400">{stage?.code}</span>
                              <span className="text-[11.5px] text-blk">{stage?.label}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-[13px] py-[10px] align-top">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-g100 overflow-hidden">
                              <div className="h-full bg-sW rounded-full" style={{ width: `${(doneCount / entry.stages.length) * 100}%` }} />
                            </div>
                            <span className="font-mono text-[10px] text-g500">{doneCount}/{entry.stages.length}</span>
                          </div>
                        </td>
                        <td className="px-[13px] py-[10px] align-top">
                          {isComplete ? <span className="text-g400 text-[11.5px]">--</span> : <StagePill status={stage?.status || 'pending'} overdue={overdue} />}
                        </td>
                        <td className="px-[13px] py-[10px] align-top">
                          <div className="flex gap-1.5 flex-wrap">
                            <Button size="sm" variant="secondary" onClick={() => navigate(`/dispatch/new?orderRef=${entry.orderId}`)}>Edit</Button>
                            {!isComplete && (
                              <Button size="sm" variant="dark" onClick={() => advanceDispatchStage(entry.id).catch(console.error)}>Mark Done</Button>
                            )}
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

