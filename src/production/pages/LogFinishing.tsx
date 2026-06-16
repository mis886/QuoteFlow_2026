// Module 07 — Log Finishing
// Append-only. Multi-finisher rows per entry. Log panel on right.

import { useState, useEffect, useMemo, useRef } from 'react';
import { Save, AlertTriangle, ArrowRight, Plus, Trash2, CheckCircle2, Pencil } from 'lucide-react';
import { AttachmentUploader } from '../components/AttachmentUploader';
import { SearchableWorkerInput } from '../components/SearchableWorkerInput';
import { CorrectionModal } from '../components/CorrectionModal';
import { useProductionData } from '../lib/useProductionData';
import {
  listFinishingSessions, insertFinishingSession, updateFinishingSession,
  listInspectionSessions, listMoldingSessions,
} from '../lib/db';
import { nextFinId, getReworkQueue } from '../lib/jcStats';
import { useJcParam } from '../lib/useJcParam';
import { productIdentity } from '../lib/productLabel';
import { PageHeader } from '../components/table';
import type { FinishingSession, InspectionSession, MoldingSession } from '../lib/types';
import { useAppStore } from '../../store';

interface FinisherRow {
  id: number;
  finisherName: string;
  actualQty: string;
  workingHours: string;
  isRework: boolean;
}

let _rowId = 0;
const newRow = (): FinisherRow => ({
  id: ++_rowId,
  finisherName: '',
  actualQty: '',
  workingHours: '',
  isRework: false,
});

export function LogFinishing() {
  const { jobs, workers }  = useProductionData();
  const { user }  = useAppStore();

  const [allFin,  setAllFin]  = useState<FinishingSession[]>([]);
  const [allIns,  setAllIns]  = useState<InspectionSession[]>([]);
  const [allMld,  setAllMld]  = useState<MoldingSession[]>([]);
  const [saving,  setSaving]  = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [jcId,    setJcId]    = useState('');
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [finRows, setFinRows] = useState<FinisherRow[]>([newRow()]);

  // Preselect from Job Card Board "Finish" action (?jc=…)
  useJcParam(setJcId);

  useEffect(() => {
    Promise.all([listFinishingSessions(), listInspectionSessions(), listMoldingSessions()])
      .then(([f, i, m]) => { setAllFin(f); setAllIns(i); setAllMld(m); });
  }, []);

  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  // Only show jobs where molding has actually begun (has sessions OR stage ≥ finishing)
  const jobsWithMolding = useMemo(
    () => new Set(allMld.map(m => m.job_card_id)),
    [allMld]
  );
  const eligibleJobs = useMemo(() => jobs.filter(j => {
    if (['queued', 'dispatched'].includes(j.stage)) return false;
    // Must have some molding done OR already be in finishing/inspection/pdi/dispatch
    return jobsWithMolding.has(j.id)
      || ['finishing', 'inspection', 'pdi', 'dispatch'].includes(j.stage);
  }), [jobs, jobsWithMolding]);

  const selectedJob  = useMemo(() => jobs.find(j => j.id === jcId), [jobs, jcId]);
  const prevFinished = useMemo(
    () => allFin.filter(f => f.job_card_id === jcId).reduce((a, f) => a + (f.actual_qty || 0), 0),
    [allFin, jcId]
  );
  const jcSessions   = useMemo(
    () => allFin
      .filter(f => f.job_card_id === jcId)
      .sort((a, b) => (b.finishing_date || '').localeCompare(a.finishing_date || '') || (b.id || '').localeCompare(a.id || '')),
    [allFin, jcId]
  );
  const reworkQueue  = useMemo(() => getReworkQueue(allIns, allFin, jobs), [allIns, allFin, jobs]);

  const fillRework = (task: ReturnType<typeof getReworkQueue>[0]) => {
    setJcId(task.jcId);
    setFinRows([{ ...newRow(), actualQty: String(task.qty), isRework: true }]);
  };

  const updateRow = (id: number, field: keyof FinisherRow, value: string | boolean) => {
    setFinRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const addRow    = () => setFinRows(rows => [...rows, newRow()]);
  const removeRow = (id: number) => setFinRows(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows);

  const totalThisEntry = finRows.reduce((a, r) => a + (parseInt(r.actualQty, 10) || 0), 0);
  const plannedQty     = selectedJob?.qty || 0;
  const newTotal       = prevFinished + totalThisEntry;
  const totalMet       = plannedQty > 0 && newTotal >= plannedQty;

  // Correction modal state
  const [correcting, setCorrecting] = useState<import('../lib/types').FinishingSession | null>(null);
  const [corrFields, setCorrFields] = useState<{ name: string; qty: string; hrs: string; rework: boolean }>({ name: '', qty: '', hrs: '', rework: false });

  const startCorrection = (s: import('../lib/types').FinishingSession) => {
    setCorrecting(s);
    setCorrFields({ name: s.finisher_name, qty: String(s.actual_qty), hrs: String(s.working_hours ?? ''), rework: !!s.is_rework });
  };

  const saveCorrection = async (note: string) => {
    if (!correcting) return;
    await updateFinishingSession(correcting.id, {
      finisher_name: corrFields.name.trim(),
      actual_qty:    parseInt(corrFields.qty, 10) || correcting.actual_qty,
      working_hours: corrFields.hrs ? parseFloat(corrFields.hrs) : correcting.working_hours,
      is_rework:     corrFields.rework,
    }, user?.email, note);
    const refreshed = await listFinishingSessions();
    setAllFin(refreshed);
    setCorrecting(null);
  };

  const showBanner = (ids: string[]) => {
    setSavedIds(ids);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setSavedIds([]), 6000);
  };

  const save = async () => {
    if (!jcId) { alert('Select a Job Card.'); return; }
    const validRows = finRows.filter(r => r.finisherName.trim() && r.actualQty);
    if (validRows.length === 0) {
      alert('Add at least one finisher row with Qty and Finisher Name.');
      return;
    }
    setSaving(true);
    try {
      const latest = await listFinishingSessions();
      const existingIds = latest.map(f => f.id);
      const savedRowIds: string[] = [];

      for (const row of validRows) {
        const id = nextFinId(existingIds);
        existingIds.push(id);
        const record: FinishingSession = {
          id,
          job_card_id:    jcId,
          finishing_date: date,
          actual_qty:     parseInt(row.actualQty, 10),
          planned_qty:    plannedQty || null,
          working_hours:  row.workingHours ? parseFloat(row.workingHours) : null,
          finisher_name:  row.finisherName.trim(),
          is_rework:      row.isRework,
          remarks:        remarks.trim() || null,
          entered_by:     user?.email || null,
          order_id:       selectedJob?.order_id || null,
        };
        await insertFinishingSession(record);
        savedRowIds.push(id);
      }

      const refreshed = await listFinishingSessions();
      setAllFin(refreshed);

      setFinRows([newRow()]);
      setRemarks('');
      showBanner(savedRowIds);
    } catch (e: any) {
      alert(e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · Log"
        title="Log Finishing"
        subtitle="Module 07 — append-only. Each entry is permanent."
        actions={
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 bg-[#0A6ED1] text-white text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#085EA8] disabled:opacity-40 transition-colors">
            <Save size={13} /> {saving ? 'Saving…' : 'Save Entry'}
          </button>
        }
      />

      {/* Success banner */}
      {savedIds.length > 0 && (
        <div className="mx-4 mt-3 bg-[#E8F5E9] border border-[#C5E1A5] rounded-[3px] px-3 py-2.5 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
          <CheckCircle2 size={14} className="text-[#107E3E] shrink-0" />
          <div className="flex-1 text-[11.5px] text-[#107E3E]">
            <strong>{savedIds.length === 1 ? 'Entry saved' : `${savedIds.length} entries saved`}:</strong>{' '}
            {savedIds.map((id, i) => (
              <span key={id} className="font-mono font-bold">{id}{i < savedIds.length - 1 ? ', ' : ''}</span>
            ))}
            <span className="ml-2 text-[#107E3E]/70 text-[10.5px]">— visible in the log panel →</span>
          </div>
          <button type="button" onClick={() => setSavedIds([])}
            className="text-[#107E3E]/60 hover:text-[#107E3E] text-[14px] leading-none px-1">×</button>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 overflow-hidden flex gap-3 p-4">

        {/* LEFT — form */}
        <div className="flex-1 overflow-y-auto space-y-3 min-w-0">

          {reworkQueue.length > 0 && (
            <div className="bg-[#FFF8EC] border border-[#FFE0B2] rounded-[3px] overflow-hidden">
              <div className="px-3 py-2 flex items-center gap-2 border-b border-[#FFE0B2]">
                <AlertTriangle size={13} className="text-[#E9730C]" />
                <span className="text-[11.5px] font-semibold text-[#E9730C]">
                  Rework Queue — {reworkQueue.length} item{reworkQueue.length > 1 ? 's' : ''} need re-finishing
                </span>
              </div>
              <div className="divide-y divide-[#FFE0B2]">
                {reworkQueue.map(task => (
                  <div key={task.inspId} className="px-3 py-2 flex items-center gap-3">
                    <div className="flex-1">
                      <span className="text-[11.5px] font-semibold text-[#111]">{task.jcId}</span>
                      {task.productDesc && <span className="text-[11px] text-[#555] ml-1.5">· {task.productDesc}</span>}
                      <span className="text-[11px] text-[#E9730C] ml-1.5">
                        · Rework from {task.inspId} · <strong>{task.qty} pcs</strong>
                      </span>
                    </div>
                    <button type="button" onClick={() => fillRework(task)}
                      className="inline-flex items-center gap-1 text-[10.5px] bg-[#E9730C] text-white px-2 py-1 rounded-[3px] hover:bg-[#BF5D08] transition-colors">
                      <ArrowRight size={10} /> Fill
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Card title="Finishing Entry">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Job Card *" className="md:col-span-2">
                <select className={inp} value={jcId} onChange={e => setJcId(e.target.value)} title="Job card">
                  <option value="">— Select Job Card —</option>
                  {eligibleJobs.map(j => (
                    <option key={j.id} value={j.id}>{j.id} · {productIdentity(j)}</option>
                  ))}
                </select>
              </Field>

              {selectedJob && (
                <div className="md:col-span-2 bg-[#E8F0FD] border border-[#C2D8F8] rounded-[3px] px-3 py-2 text-[11px] text-[#0A6ED1]">
                  <strong>{selectedJob.id}</strong> · {productIdentity(selectedJob)} · {selectedJob.customer_name}
                  · Ordered: <strong>{selectedJob.qty} pcs</strong>
                  · Finished so far: <strong>{prevFinished} pcs</strong>
                </div>
              )}

              <Field label="Finishing Date">
                <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} title="Date" />
              </Field>
              <Field label="Shared Remarks">
                <input className={inp} value={remarks} onChange={e => setRemarks(e.target.value)}
                  placeholder="Remarks for all rows" title="Remarks" />
              </Field>
            </div>
          </Card>

          <Card
            title="Finishers"
            action={
              <button type="button" onClick={addRow}
                className="inline-flex items-center gap-1 text-[10.5px] bg-[#E8F0FD] text-[#0A6ED1] border border-[#C2D8F8] px-2 py-0.5 rounded-[3px] hover:bg-[#C2D8F8] transition-colors">
                <Plus size={10} /> Add Finisher
              </button>
            }
          >
            <div className="grid grid-cols-[2fr_1fr_1fr_80px_32px] gap-2 mb-1.5 px-1">
              {['Finisher Name *', 'Qty Finished *', 'Working Hours', 'Rework?', ''].map((h, i) => (
                <div key={i} className="text-[9.5px] font-semibold uppercase tracking-wider text-[#555]">{h}</div>
              ))}
            </div>

            <div className="space-y-2">
              {finRows.map(row => (
                <div key={row.id} className="grid grid-cols-[2fr_1fr_1fr_80px_32px] gap-2 items-center">
                  <SearchableWorkerInput value={row.finisherName}
                    onChange={v => updateRow(row.id, 'finisherName', v as any)}
                    workers={workers} department="finishing"
                    placeholder="Finisher name" title="Finisher name" />
                  <input type="number" className={inp} value={row.actualQty}
                    onChange={e => updateRow(row.id, 'actualQty', e.target.value)}
                    placeholder="0" title="Qty finished" />
                  <input type="number" step="0.25" className={inp} value={row.workingHours}
                    onChange={e => updateRow(row.id, 'workingHours', e.target.value)}
                    placeholder="2.5" title="Working hours" />
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={row.isRework}
                      onChange={e => updateRow(row.id, 'isRework', e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#E9730C]" />
                    <span className="text-[11px] text-[#333]">Rework</span>
                  </label>
                  <button type="button" onClick={() => removeRow(row.id)}
                    className="flex items-center justify-center w-8 h-7 text-[#BB0000] hover:bg-[#FFEBEE] rounded-[3px] transition-colors"
                    title="Remove row">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            {jcId && totalThisEntry > 0 && (
              <div className={`mt-4 border rounded-[3px] px-3 py-2.5 text-[12px] flex items-center gap-3 ${totalMet ? 'bg-[#E8F5E9] border-[#C5E1A5]' : 'bg-[#E8F0FD] border-[#C2D8F8]'}`}>
                <span className="text-[#555]">Previously finished:</span>
                <strong>{prevFinished}</strong>
                <span className="text-[#555]">+ this entry:</span>
                <strong>{totalThisEntry}</strong>
                <span className="text-[#555]">=</span>
                <strong className={totalMet ? 'text-[#107E3E]' : 'text-[#0A6ED1]'}>{newTotal}</strong>
                <span className="text-[#555]">/ {plannedQty} planned</span>
                {totalMet && <span className="ml-auto font-semibold text-[#107E3E]">✓ Planned qty met</span>}
              </div>
            )}
          </Card>

          {/* DPR attachment */}
          <Card title="DPR Attachment">
            <AttachmentUploader
              type="dpr"
              shiftDate={date}
              label={`DPR — ${date} · Finishing`}
            />
          </Card>

          <div className="text-[10.5px] text-[#555] border-t border-[#E4E5E6] pt-2">
            Entries are permanent · Use ✎ in the log panel to make corrections
          </div>
        </div>

        {/* RIGHT — finishing log */}
        <div className="w-[300px] flex-shrink-0 flex flex-col overflow-y-auto">
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-[#E4E5E6] text-[11px] font-semibold text-[#333] uppercase tracking-wider flex items-center gap-2">
              Finishing Log
              {jcId && (
                <span className="font-normal normal-case text-[10.5px] text-[#555]">
                  — {jcSessions.length} entries · {prevFinished} pcs
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {!jcId ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">
                  Select a Job Card<br />to see finishing history
                </div>
              ) : jcSessions.length === 0 ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">
                  No finishing entries yet
                </div>
              ) : (
                <div className="divide-y divide-[#F0F0F0]">
                  {jcSessions.map(s => (
                    <div key={s.id}
                      className={`px-3 py-2.5 transition-colors ${savedIds.includes(s.id) ? 'bg-[#E8F5E9]' : 'hover:bg-[#FAFAFA]'}`}>
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <span className={`font-mono text-[10px] font-bold ${savedIds.includes(s.id) ? 'text-[#107E3E]' : 'text-[#0A6ED1]'}`}>
                            {savedIds.includes(s.id) && '✓ '}{s.id}
                          </span>
                          <span className="ml-2 text-[10px] text-[#555]">{s.finishing_date}</span>
                          {s.corrected_at && <span className="ml-1 text-[9px] bg-[#FFF3E0] text-[#E9730C] px-1 rounded">edited</span>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[11px] font-semibold text-[#111]">{s.actual_qty} pcs</span>
                          <button type="button" onClick={() => startCorrection(s)} title="Correct this entry"
                            className="text-[#555] hover:text-[#0A6ED1] p-0.5 rounded hover:bg-[#E8F0FD] transition-colors">
                            <Pencil size={10} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-[10px] text-[#555] flex gap-3 flex-wrap">
                        <span>Finisher: <strong className="text-[#333]">{s.finisher_name || '—'}</strong></span>
                        {s.working_hours && <span>{s.working_hours}h</span>}
                        {s.is_rework && (
                          <span className="bg-[#FFF3E0] text-[#E9730C] px-1.5 rounded-full font-medium text-[9.5px]">Rework</span>
                        )}
                      </div>
                      {s.remarks && (
                        <div className="mt-0.5 text-[9.5px] text-[#666] italic truncate">{s.remarks}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
      {correcting && (
        <CorrectionModal entryId={correcting.id} onClose={() => setCorrecting(null)} onConfirm={saveCorrection}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Finisher Name</label>
              <SearchableWorkerInput value={corrFields.name} onChange={v => setCorrFields(f => ({ ...f, name: v }))}
                workers={workers} department="finishing" placeholder="Finisher name" title="Finisher name" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Actual Qty</label>
              <input type="number" className={inp} value={corrFields.qty} title="Qty finished" placeholder="0"
                onChange={e => setCorrFields(f => ({ ...f, qty: e.target.value }))} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Working Hours</label>
              <input type="number" step="0.25" className={inp} value={corrFields.hrs} title="Working hours" placeholder="2.5"
                onChange={e => setCorrFields(f => ({ ...f, hrs: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={corrFields.rework} title="Is rework"
                onChange={e => setCorrFields(f => ({ ...f, rework: e.target.checked }))}
                className="w-3.5 h-3.5 accent-[#E9730C]" />
              <span className="text-[12px] text-[#333]">Rework</span>
            </div>
          </div>
        </CorrectionModal>
      )}
    </div>
  );
}

const inp = 'w-full font-sans text-[12px] text-[#111] bg-white border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]';

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
      <div className="px-3 py-2 border-b border-[#E4E5E6] text-[11px] font-semibold text-[#333] uppercase tracking-wider flex items-center gap-2">
        <span className="flex-1">{title}</span>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">{label}</label>
      {children}
    </div>
  );
}
