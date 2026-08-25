import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { Button } from '../components/ui';
import { Search, X, Truck, PackageCheck, Clock, CheckCircle2, ChevronRight, FileCheck2, FileWarning } from 'lucide-react';
import { fmtIST, formatINR, canDeleteRecords } from '../lib/utils';
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

function FulfillmentSwatch({ type }: { type: DispatchFulfillmentType }) {
  const isSelfPickup = type === 'self_pickup';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold whitespace-nowrap ${isSelfPickup ? 'bg-[#7C3AED]/10 text-[#7C3AED]' : 'bg-sN/10 text-sN'}`}
    >
      <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${isSelfPickup ? 'bg-[#7C3AED]' : 'bg-sN'}`} />
      {isSelfPickup ? 'Self Pickup' : 'Delivery'}
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

function fmtDT(iso: string | null | undefined): string {
  if (!iso) return '--';
  try { return fmtIST(new Date(iso), 'dd-MMM-yyyy HH:mm'); } catch { return '--'; }
}

export function Dispatch() {
  const { data, user, addDispatchEntry, advanceDispatchStage, deleteDispatchEntry } = useAppStore();
  const now = Date.now();
  const canDelete = canDeleteRecords(user?.email);

  const [tab, setTab] = useState<'toDispatch' | 'toSend'>('toDispatch');
  const [subType, setSubType] = useState<DispatchFulfillmentType>('delivery');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [newEntryOpen, setNewEntryOpen] = useState(false);

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

  const selectedEntry = selectedEntryId ? entries.find(e => e.id === selectedEntryId) || null : null;
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
              onClick={() => setNewEntryOpen(true)}
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
                        className="group transition-colors cursor-pointer border-b border-g100 last:border-b-0 hover:bg-sW/5"
                        onClick={() => setSelectedEntryId(entry.id)}
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
                        <td className="px-[13px] py-[10px] align-top" onClick={ev => ev.stopPropagation()}>
                          <div className="flex gap-1.5 flex-wrap">
                            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelectedEntryId(entry.id); }}>View</Button>
                            {!isComplete && (
                              <Button size="sm" variant="dark" onClick={(e) => { e.stopPropagation(); advanceDispatchStage(entry.id).catch(console.error); }}>Mark Done</Button>
                            )}
                            {canDelete && (
                              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`Are you sure you want to delete the dispatch entry for ${entry.orderId}? This action cannot be undone.`)) return;
                                try {
                                  await deleteDispatchEntry(entry.id);
                                  if (selectedEntryId === entry.id) setSelectedEntryId(null);
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

      {selectedEntry && (
        <DispatchDrawer
          entry={selectedEntry}
          order={orderFor(selectedEntry)}
          canDelete={canDelete}
          onClose={() => setSelectedEntryId(null)}
          onAdvance={() => advanceDispatchStage(selectedEntry.id).catch(console.error)}
          onDelete={async () => {
            if (!confirm(`Are you sure you want to delete the dispatch entry for ${selectedEntry.orderId}? This action cannot be undone.`)) return;
            try {
              await deleteDispatchEntry(selectedEntry.id);
              setSelectedEntryId(null);
            } catch (err: any) {
              alert(`Delete failed: ${err?.message || JSON.stringify(err)}`);
            }
          }}
        />
      )}

      {newEntryOpen && (
        <NewDispatchEntryModal
          orders={data.orders}
          existingEntries={data.dispatchEntries}
          onClose={() => setNewEntryOpen(false)}
          onCreate={async (orderId, type, extra) => {
            await addDispatchEntry(orderId, type, extra);
            setSubType(type);
            setNewEntryOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Right-side stage-detail drawer ───────────────────────────────────────

function DispatchDrawer({
  entry, order, canDelete, onClose, onAdvance, onDelete,
}: {
  entry: DispatchEntry;
  order: Order | undefined;
  canDelete: boolean;
  onClose: () => void;
  onAdvance: () => void;
  onDelete: () => void;
}) {
  const now = Date.now();
  const isComplete = entry.currentStageIndex >= entry.stages.length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] animate-in fade-in duration-300" onClick={onClose} />
      <div className="flex flex-col h-full bg-white relative animate-in slide-in-from-right duration-300 w-full sm:w-[500px]">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-g200 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10.5px] font-bold text-sW">{entry.orderId}</span>
              <FulfillmentSwatch type={entry.fulfillmentType} />
            </div>
            <div className="font-serif text-lg text-blk mt-1 truncate">{order?.cust || '—'}</div>
            <div className="text-[11px] text-g500 font-mono mt-0.5">{order?.poNo}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canDelete && (
              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={onDelete}>Delete</Button>
            )}
            <button onClick={onClose} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-[3px] text-g400 hover:text-blk hover:bg-g100 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g400 mb-2.5">
            {entry.fulfillmentType === 'self_pickup' ? 'Self Pickup — Order → Dispatch' : 'Delivery — Order → Dispatch'}
          </div>

          <div className="flex flex-col gap-0">
            {entry.stages.map((stage, i) => {
              const isCurrent = i === entry.currentStageIndex;
              const isDone = stage.status === 'done';
              const overdue = isCurrent && !!stage.planned && new Date(stage.planned).getTime() < now;
              const isLastStage = i === entry.stages.length - 1;
              return (
                <div key={stage.code} className={`flex gap-3 pb-4 relative ${i < entry.stages.length - 1 ? 'border-l border-g200 ml-[9px] pl-[17px]' : 'ml-[9px] pl-[17px]'}`}>
                  <div className={`absolute -left-[9px] top-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 ${isDone ? 'border-sW bg-sW text-white' : isCurrent ? (overdue ? 'border-red-mrt bg-white text-red-mrt' : 'border-sR bg-white text-sR') : 'border-g300 bg-white text-g400'}`}>
                    {isDone ? <CheckCircle2 size={11} /> : <span className="font-mono text-[8px] font-bold">{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[9.5px] text-g400">{stage.code}</span>
                      <span className="text-[12.5px] font-semibold text-blk">{stage.label}</span>
                      {isDone && <StagePill status="done" overdue={false} />}
                      {isCurrent && !isDone && <StagePill status="pending" overdue={overdue} />}
                    </div>
                    <div className="text-[10.5px] text-g500 mt-0.5">{stage.owner} · {stage.how} · SLA {stage.slaHours}h</div>
                    <div className="flex items-center gap-3 text-[10.5px] text-g500 mt-1 flex-wrap">
                      <span>Planned: {fmtDT(stage.planned)}</span>
                      {isDone && <span>Actual: {fmtDT(stage.actual)}</span>}
                      {isDone && stage.delayHours !== null && (
                        <span className={stage.delayHours > 0 ? 'text-red-mrt font-semibold' : 'text-sW font-semibold'}>
                          {stage.delayHours > 0 ? `${stage.delayHours}h late` : `${Math.abs(stage.delayHours)}h early`}
                        </span>
                      )}
                    </div>

                    {isLastStage && (
                      <div className="mt-2 flex items-center gap-1.5">
                        {entry.docLinkStatus === 'attached' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[10px] font-semibold bg-sW/10 text-sW whitespace-nowrap"><FileCheck2 size={10} /> DO Link attached</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[10px] font-semibold bg-amber-500/10 text-amber-600 whitespace-nowrap"><FileWarning size={10} /> DO Link not uploaded</span>
                        )}
                      </div>
                    )}

                    {isCurrent && !isDone && (
                      <div className="mt-2.5">
                        <Button size="sm" variant="dark" onClick={onAdvance}>Mark Done <ChevronRight size={11} /></Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isComplete && (
            <div className="mt-2 p-3 rounded-[4px] bg-sW/5 border border-sW/20 text-[12px] text-sW font-medium flex items-center gap-2">
              <PackageCheck size={14} /> All Order → Dispatch stages complete. Dispatch → Sent tracking is parked for a later phase.
            </div>
          )}

          {(entry.remark || entry.transporter || entry.vehicleNumber || entry.numUnits) && (
            <div className="mt-5 pt-4 border-t border-g200">
              <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g400 mb-2">Intake Details</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px]">
                {entry.numUnits && <div><div className="text-g400 text-[10px]">Number of Drum/Bag</div><div className="text-blk">{entry.numUnits} {entry.unit}</div></div>}
                {entry.transporter && <div><div className="text-g400 text-[10px]">Transporter</div><div className="text-blk">{entry.transporter}</div></div>}
                {entry.vehicleNumber && <div><div className="text-g400 text-[10px]">Vehicle Number</div><div className="text-blk">{entry.vehicleNumber}</div></div>}
                {entry.formFilledBy && <div><div className="text-g400 text-[10px]">Form Filled By</div><div className="text-blk">{entry.formFilledBy}</div></div>}
                {entry.remark && <div className="col-span-2"><div className="text-g400 text-[10px]">Remark</div><div className="text-blk">{entry.remark}</div></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── "+ New Dispatch Entry" modal ─────────────────────────────────────────

function NewDispatchEntryModal({
  orders, existingEntries, onClose, onCreate,
}: {
  orders: Order[];
  existingEntries: DispatchEntry[];
  onClose: () => void;
  onCreate: (orderId: string, type: DispatchFulfillmentType, extra: Partial<DispatchEntry>) => Promise<void>;
}) {
  const [type, setType] = useState<DispatchFulfillmentType>('delivery');
  const [orderQuery, setOrderQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [transporter, setTransporter] = useState('');
  const [remark, setRemark] = useState('');
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState('');
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  const [saving, setSaving] = useState(false);

  const eligibleOrders = useMemo(() => {
    const takenIds = new Set(existingEntries.map(e => e.orderId));
    return orders.filter(o => o.status === 'Order Confirmed' && !takenIds.has(o.id));
  }, [orders, existingEntries]);

  const filteredOrders = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return eligibleOrders.slice(0, 20);
    return eligibleOrders.filter(o => o.cust.toLowerCase().includes(q) || o.poNo.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)).slice(0, 20);
  }, [eligibleOrders, orderQuery]);

  const selectedOrder = selectedOrderId ? orders.find(o => o.id === selectedOrderId) : null;

  const handleSubmit = async () => {
    if (!selectedOrderId || saving) return;
    setSaving(true);
    try {
      await onCreate(selectedOrderId, type, {
        transporter: transporter || undefined,
        remark: remark || undefined,
        promisedDeliveryDate: promisedDeliveryDate || undefined,
        estimatedDeliveryDate: estimatedDeliveryDate || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full bg-white border border-g200 rounded-[3px] px-2.5 h-8 text-[12.5px] text-blk outline-none focus:border-red-mrt focus:ring-2 focus:ring-red-lt transition-colors";
  const labelCls = "font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blk/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[4px] shadow-2xl w-full max-w-[880px] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-g200 shrink-0">
          <div>
            <div className="font-mono text-[8.5px] font-bold tracking-[2px] uppercase text-red-mrt">New Dispatch Entry</div>
            <div className="font-serif text-lg text-blk">{type === 'self_pickup' ? 'Self Pickup Form' : 'HTPL Delivery FMS Form'}</div>
          </div>
          <button onClick={onClose} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-[3px] text-g400 hover:text-blk hover:bg-g100 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
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
              <div className="border border-g200 rounded-[3px] max-h-[140px] overflow-y-auto">
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

          <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-g400 mb-2">Dispatch Details</div>
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
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-g200 shrink-0">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="dark" disabled={!selectedOrderId || saving} onClick={handleSubmit}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </div>
  );
}
