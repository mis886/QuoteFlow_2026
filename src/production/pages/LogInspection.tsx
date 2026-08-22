// Module 08 — Log Inspection
// Append-only. Multi-inspector rows with split validator per row. Log panel on right.

import { useState, useEffect, useMemo, useRef } from 'react';
import { Save, CheckCircle2, XCircle, Plus, Trash2, Pencil } from 'lucide-react';
import { SearchableWorkerInput } from '../components/SearchableWorkerInput';
import { CorrectionModal } from '../components/CorrectionModal';
import { useProductionData } from '../lib/useProductionData';
import {
  listInspectionSessions, insertInspectionSession, updateInspectionSession,
  listFinishingSessions,
} from '../lib/db';
import { nextInsId, validateInsSplit, calcWorkingMinutes } from '../lib/jcStats';
import { useJcParam } from '../lib/useJcParam';
import { productIdentity } from '../lib/productLabel';
import { PageHeader } from '../components/table';
import type { InspectionSession, FinishingSession } from '../lib/types';
import { useAppStore } from '../../store';

const REJECTION_OPTIONS = ['Flash', 'Unfill', 'Blow', 'Dimension', 'Damage', 'Surface Defect', 'Other'];

interface InspectorRow {
  id: number;
  inspector: string;
  qtyToInspect: string;
  passed: string;
  rejected: string;
  rework: string;
  scrapped: string;
  startTime: string;
  endTime: string;
  rejReasons: string;
}

let _rowId = 0;
const newRow = (): InspectorRow => ({
  id: ++_rowId,
  inspector: '',
  qtyToInspect: '',
  passed: '',
  rejected: '',
  rework: '',
  scrapped: '',
  startTime: '',
  endTime: '',
  rejReasons: '',
});

export function LogInspection() {
  const { jobs, workers } = useProductionData();
  const { user } = useAppStore();

  const [allIns, setAllIns] = useState<InspectionSession[]>([]);
  const [allFin, setAllFin] = useState<FinishingSession[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [jcId,    setJcId]    = useState('');
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [insRows, setInsRows] = useState<InspectorRow[]>([newRow()]);

  // Preselect from Job Card Board "Inspect" action (?jc=…)
  useJcParam(setJcId);

  useEffect(() => {
    Promise.all([listInspectionSessions(), listFinishingSessions()])
      .then(([i, f]) => { setAllIns(i); setAllFin(f); });
  }, []);

  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  const selectedJob = useMemo(() => jobs.find(j => j.id === jcId), [jobs, jcId]);
  // Total inspected so far = passed + rejected + rework + scrapped (everything
  // that has already been through inspection), so "remaining to inspect" is
  // what finishing produced but inspection hasn't covered yet.
  const prevInspected = useMemo(
    () => allIns.filter(i => i.job_card_id === jcId)
      .reduce((a, i) => a + (i.passed || 0) + (i.rejected || 0) + (i.rework || 0) + (i.scrapped || 0), 0),
    [allIns, jcId]
  );
  const prevPassed = useMemo(
    () => allIns.filter(i => i.job_card_id === jcId).reduce((a, i) => a + (i.passed || 0), 0),
    [allIns, jcId]
  );
  const prevFinished = useMemo(
    () => allFin.filter(f => f.job_card_id === jcId).reduce((a, f) => a + (f.actual_qty || 0), 0),
    [allFin, jcId]
  );
  const remainingToInspect = Math.max(0, prevFinished - prevInspected);

  // When a JC is selected, prefill the first inspector row's "Qty to Inspect"
  // with the remaining un-inspected finished qty (only if still untouched).
  useEffect(() => {
    if (!jcId) return;
    setInsRows(rows => {
      if (rows.length !== 1) return rows;        // don't clobber multi-row edits
      const r = rows[0];
      if (r.qtyToInspect || r.passed || r.rejected || r.rework || r.scrapped) return rows;
      return [{ ...r, qtyToInspect: remainingToInspect > 0 ? String(remainingToInspect) : '' }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jcId, remainingToInspect]);

  const jcSessions  = useMemo(
    () => allIns
      .filter(i => i.job_card_id === jcId)
      .sort((a, b) => (b.inspection_date || '').localeCompare(a.inspection_date || '') || (b.id || '').localeCompare(a.id || '')),
    [allIns, jcId]
  );
  // Only show jobs where finishing has actually begun (has sessions OR stage ≥ inspection)
  const jobsWithFinishing = useMemo(
    () => new Set(allFin.map(f => f.job_card_id)),
    [allFin]
  );
  const eligibleJobs = useMemo(() => jobs.filter(j => {
    if (['queued', 'moulding', 'dispatched'].includes(j.stage)) return false;
    return jobsWithFinishing.has(j.id)
      || ['inspection', 'pdi', 'dispatch'].includes(j.stage);
  }), [jobs, jobsWithFinishing]);

  const updateRow    = (id: number, field: keyof InspectorRow, value: string) => {
    setInsRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const addRow       = () => setInsRows(rows => [...rows, newRow()]);
  const removeRow    = (id: number) => setInsRows(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows);
  const appendReason = (rowId: number, reason: string) => {
    setInsRows(rows => rows.map(r => {
      if (r.id !== rowId) return r;
      const prev = r.rejReasons.trim();
      return { ...r, rejReasons: prev ? `${prev}, ${reason}` : reason };
    }));
  };

  const rowValidations = useMemo(() => {
    const n = (v: string) => parseInt(v, 10) || 0;
    return insRows.map(row => {
      const qty = parseInt(row.qtyToInspect, 10);
      if (!qty || isNaN(qty)) return null;
      return validateInsSplit(qty, n(row.passed), n(row.rejected), n(row.rework), n(row.scrapped));
    });
  }, [insRows]);

  const allRowsOk = insRows.every((r, i) => {
    if (!r.inspector.trim() || !r.qtyToInspect) return false;
    return rowValidations[i]?.ok === true;
  });

  const [correcting, setCorrecting] = useState<import('../lib/types').InspectionSession | null>(null);
  const [corrFields, setCorrFields] = useState<{ inspector: string; passed: string; rejected: string; rework: string; scrapped: string }>({ inspector: '', passed: '', rejected: '', rework: '', scrapped: '' });

  const startCorr = (s: import('../lib/types').InspectionSession) => {
    setCorrecting(s);
    setCorrFields({ inspector: s.inspector_name, passed: String(s.passed), rejected: String(s.rejected), rework: String(s.rework), scrapped: String(s.scrapped) });
  };

  const saveCorrection = async (note: string) => {
    if (!correcting) return;
    const n = (v: string) => parseInt(v, 10) || 0;
    await updateInspectionSession(correcting.id, {
      inspector_name: corrFields.inspector.trim(),
      passed:   n(corrFields.passed),
      rejected: n(corrFields.rejected),
      rework:   n(corrFields.rework),
      scrapped: n(corrFields.scrapped),
    }, user?.email, note);
    const refreshed = await listInspectionSessions();
    setAllIns(refreshed);
    setCorrecting(null);
  };

  const showBanner = (ids: string[]) => {
    setSavedIds(ids);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setSavedIds([]), 6000);
  };

  const save = async () => {
    if (!jcId) { alert('Select a Job Card.'); return; }
    const validRows = insRows.filter(r => r.inspector.trim() && r.qtyToInspect);
    if (validRows.length === 0) {
      alert('Add at least one inspector row with Qty and Inspector Name.');
      return;
    }
    const badIdx = validRows.findIndex(r => {
      const idx = insRows.indexOf(r);
      return rowValidations[idx]?.ok === false;
    });
    if (badIdx !== -1) {
      alert(`Inspector ${badIdx + 1}: split does not balance. Fix before saving.`);
      return;
    }
    setSaving(true);
    try {
      const n = (v: string) => parseInt(v, 10) || 0;
      const latest = await listInspectionSessions();
      const existingIds = latest.map(i => i.id);
      const savedRowIds: string[] = [];

      for (const row of validRows) {
        const id  = nextInsId(existingIds);
        existingIds.push(id);
        const qty = parseInt(row.qtyToInspect, 10);
        const workingHrs = (row.startTime && row.endTime)
          ? +(calcWorkingMinutes(row.startTime, row.endTime) / 60).toFixed(2)
          : null;
        const record: InspectionSession = {
          id,
          job_card_id:       jcId,
          inspection_date:   date,
          qty_to_inspect:    qty,
          qty_inspected:     qty,
          passed:            n(row.passed),
          rejected:          n(row.rejected),
          rework:            n(row.rework),
          scrapped:          n(row.scrapped),
          inspector_name:    row.inspector.trim(),
          start_time:        row.startTime || null,
          end_time:          row.endTime   || null,
          working_hours:     workingHrs,
          rejection_reasons: row.rejReasons.trim() || null,
          remarks:           remarks.trim() || null,
          entered_by:        user?.email || null,
          order_id:          selectedJob?.order_id || null,
        };
        await insertInspectionSession(record);
        savedRowIds.push(id);
      }

      const refreshed = await listInspectionSessions();
      setAllIns(refreshed);

      setInsRows([newRow()]);
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
        title="Log Inspection"
        subtitle="Module 08 — append-only. Split must balance before saving."
        actions={
          <button type="button" onClick={save} disabled={saving || (insRows.some(r => r.qtyToInspect) && !allRowsOk)}
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

          <Card title="Inspection Entry">
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
                <div className="md:col-span-2 bg-[#E8F0FD] border border-[#C2D8F8] rounded-[3px] px-3 py-2 text-[11px] text-[#0A6ED1] flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong>{selectedJob.id}</strong>
                  <span className="text-[#0A6ED1]/60">·</span>
                  {productIdentity(selectedJob)}
                  <span className="text-[#0A6ED1]/60">·</span>
                  Ordered: <strong>{selectedJob.qty}</strong>
                  <span className="text-[#0A6ED1]/60">·</span>
                  Finished: <strong>{prevFinished}</strong>
                  <span className="text-[#0A6ED1]/60">·</span>
                  Inspected: <strong>{prevInspected}</strong>
                  <span className="ml-auto bg-white/70 border border-[#C2D8F8] rounded px-2 py-0.5">
                    Remaining to inspect: <strong className={remainingToInspect > 0 ? 'text-[#107E3E]' : 'text-[#888]'}>{remainingToInspect} pcs</strong>
                  </span>
                </div>
              )}

              <Field label="Inspection Date">
                <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} title="Date" />
              </Field>
              <Field label="Shared Remarks">
                <input className={inp} value={remarks} onChange={e => setRemarks(e.target.value)}
                  placeholder="Remarks for all rows" title="Remarks" />
              </Field>
            </div>
          </Card>

          <Card
            title="Inspectors & Split"
            action={
              <button type="button" onClick={addRow}
                className="inline-flex items-center gap-1 text-[10.5px] bg-[#E8F0FD] text-[#0A6ED1] border border-[#C2D8F8] px-2 py-0.5 rounded-[3px] hover:bg-[#C2D8F8] transition-colors">
                <Plus size={10} /> Add Inspector
              </button>
            }
          >
            <div className="space-y-4">
              {insRows.map((row, idx) => {
                const validation = rowValidations[idx];
                const n = (v: string) => parseInt(v, 10) || 0;
                const yieldPct = (validation?.ok && n(row.qtyToInspect))
                  ? Math.round((n(row.passed) / n(row.qtyToInspect)) * 100)
                  : null;
                const workingHrs = (row.startTime && row.endTime)
                  ? +(calcWorkingMinutes(row.startTime, row.endTime) / 60).toFixed(2)
                  : null;

                return (
                  <div key={row.id} className="border border-[#E4E5E6] rounded-[3px] overflow-hidden">
                    <div className="bg-[#FAFAFA] px-3 py-1.5 border-b border-[#E4E5E6] flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider flex-1">
                        Inspector {idx + 1}
                      </span>
                      {insRows.length > 1 && (
                        <button type="button" onClick={() => removeRow(row.id)}
                          className="flex items-center gap-1 text-[10px] text-[#BB0000] hover:bg-[#FFEBEE] px-1.5 py-0.5 rounded-[3px] transition-colors">
                          <Trash2 size={10} /> Remove
                        </button>
                      )}
                    </div>

                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="Inspector Name *" className="md:col-span-2">
                          <SearchableWorkerInput value={row.inspector}
                            onChange={v => updateRow(row.id, 'inspector', v)}
                            workers={workers} department="inspection"
                            placeholder="Inspector name" title="Inspector name" />
                        </Field>
                        <Field label="Qty to Inspect *">
                          <input type="number" className={inp} value={row.qtyToInspect}
                            onChange={e => updateRow(row.id, 'qtyToInspect', e.target.value)}
                            placeholder="0" title="Batch size" />
                        </Field>
                        <div className="text-[10px] text-[#555]">
                          <div className="font-semibold uppercase tracking-wider mb-1">Working Hrs</div>
                          <div className="h-[30px] flex items-center text-[12px] text-[#333] font-medium">
                            {workingHrs !== null ? `${workingHrs} hrs` : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="Passed ✓">
                          <input type="number" className={`${inp} border-[#107E3E] focus:border-[#107E3E]`}
                            value={row.passed} onChange={e => updateRow(row.id, 'passed', e.target.value)}
                            placeholder="0" title="Passed" />
                        </Field>
                        <Field label="Rejected ✕">
                          <input type="number" className={`${inp} border-[#BB0000] focus:border-[#BB0000]`}
                            value={row.rejected} onChange={e => updateRow(row.id, 'rejected', e.target.value)}
                            placeholder="0" title="Rejected" />
                        </Field>
                        <Field label="Rework ↺">
                          <input type="number" className={`${inp} border-[#E9730C] focus:border-[#E9730C]`}
                            value={row.rework} onChange={e => updateRow(row.id, 'rework', e.target.value)}
                            placeholder="0" title="Rework" />
                        </Field>
                        <Field label="Scrapped 🗑">
                          <input type="number" className={`${inp} border-[#6A6D70] focus:border-[#6A6D70]`}
                            value={row.scrapped} onChange={e => updateRow(row.id, 'scrapped', e.target.value)}
                            placeholder="0" title="Scrapped" />
                        </Field>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="Start Time">
                          <input type="time" className={inp} value={row.startTime}
                            onChange={e => updateRow(row.id, 'startTime', e.target.value)} title="Start" />
                        </Field>
                        <Field label="End Time">
                          <input type="time" className={inp} value={row.endTime}
                            onChange={e => updateRow(row.id, 'endTime', e.target.value)} title="End" />
                        </Field>
                        <Field label="Rejection Reasons" className="md:col-span-2">
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {REJECTION_OPTIONS.map(r => (
                              <button key={r} type="button"
                                onClick={() => appendReason(row.id, r)}
                                className="text-[9.5px] px-1.5 py-0.5 border border-[#E4E5E6] rounded-full hover:bg-[#E8F0FD] hover:border-[#0A6ED1] hover:text-[#0A6ED1] transition-colors text-[#555]">
                                {r}
                              </button>
                            ))}
                          </div>
                          <input className={inp} value={row.rejReasons}
                            onChange={e => updateRow(row.id, 'rejReasons', e.target.value)}
                            placeholder="Flash, Unfill…" title="Rejection reasons" />
                        </Field>
                      </div>

                      {validation !== null && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-[3px] border text-[12px] font-semibold ${
                          validation.ok
                            ? 'bg-[#E8F5E9] border-[#C5E1A5] text-[#107E3E]'
                            : 'bg-[#FFEBEE] border-[#FFCDD2] text-[#BB0000]'
                        }`}>
                          {validation.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          {validation.message}
                          {yieldPct !== null && (
                            <span className={`ml-3 text-[11px] font-medium px-2 py-0.5 rounded-[3px] ${
                              yieldPct >= 90 ? 'bg-[#E8F5E9] text-[#107E3E]' :
                              yieldPct >= 70 ? 'bg-[#FFF3E0] text-[#E9730C]' :
                                               'bg-[#FFEBEE] text-[#BB0000]'
                            }`}>
                              Yield: {yieldPct}%
                            </span>
                          )}
                        </div>
                      )}

                      {(parseInt(row.rework, 10) || 0) > 0 && (
                        <div className="bg-[#FFF8EC] border border-[#FFE0B2] rounded-[3px] px-3 py-1.5 text-[11px] text-[#E9730C]">
                          ⚠ {row.rework} pcs rework will auto-queue to Finishing (Module 07).
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="text-[10.5px] text-[#555] border-t border-[#E4E5E6] pt-2">
            Entry is permanent · Corrections require a new entry
          </div>
        </div>

        {/* RIGHT — inspection log */}
        <div className="w-[300px] flex-shrink-0 flex flex-col overflow-y-auto">
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-[#E4E5E6] text-[11px] font-semibold text-[#333] uppercase tracking-wider flex items-center gap-2">
              Inspection Log
              {jcId && (
                <span className="font-normal normal-case text-[10.5px] text-[#555]">
                  — {jcSessions.length} entries · {prevPassed} passed
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {!jcId ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">
                  Select a Job Card<br />to see inspection history
                </div>
              ) : jcSessions.length === 0 ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">
                  No inspection entries yet
                </div>
              ) : (
                <div className="divide-y divide-[#F0F0F0]">
                  {jcSessions.map(s => {
                    const yPct = s.qty_to_inspect
                      ? Math.round(((s.passed || 0) / s.qty_to_inspect) * 100)
                      : null;
                    return (
                      <div key={s.id}
                        className={`px-3 py-2.5 transition-colors ${savedIds.includes(s.id) ? 'bg-[#E8F5E9]' : 'hover:bg-[#FAFAFA]'}`}>
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <span className={`font-mono text-[10px] font-bold ${savedIds.includes(s.id) ? 'text-[#107E3E]' : 'text-[#0A6ED1]'}`}>
                              {savedIds.includes(s.id) && '✓ '}{s.id}
                            </span>
                            <span className="ml-2 text-[10px] text-[#555]">{s.inspection_date}</span>
                            {s.corrected_at && <span className="ml-1 text-[9px] bg-[#FFF3E0] text-[#E9730C] px-1 rounded">edited</span>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                          {yPct !== null && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              yPct >= 90 ? 'bg-[#E8F5E9] text-[#107E3E]' :
                              yPct >= 70 ? 'bg-[#FFF3E0] text-[#E9730C]' :
                                           'bg-[#FFEBEE] text-[#BB0000]'
                            }`}>
                              {yPct}%
                            </span>
                          )}
                          <button type="button" onClick={() => startCorr(s)} title="Correct this entry"
                            className="text-[#555] hover:text-[#0A6ED1] p-0.5 rounded hover:bg-[#E8F0FD] transition-colors">
                            <Pencil size={10} />
                          </button>
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] text-[#555]">
                          <span>Inspector: <strong className="text-[#333]">{s.inspector_name || '—'}</strong></span>
                          <span className="ml-2">Batch: {s.qty_to_inspect}</span>
                        </div>
                        <div className="mt-0.5 text-[9.5px] text-[#555] flex gap-2 flex-wrap">
                          <span className="text-[#107E3E]">✓ {s.passed ?? 0}</span>
                          <span className="text-[#BB0000]">✕ {s.rejected ?? 0}</span>
                          {(s.rework ?? 0) > 0 && <span className="text-[#E9730C]">↺ {s.rework}</span>}
                          {(s.scrapped ?? 0) > 0 && <span className="text-[#6A6D70]">🗑 {s.scrapped}</span>}
                        </div>
                        {s.rejection_reasons && (
                          <div className="mt-0.5 text-[9.5px] text-[#666] italic truncate">{s.rejection_reasons}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

      {correcting && (
        <CorrectionModal entryId={correcting.id} onClose={() => setCorrecting(null)} onConfirm={saveCorrection}>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Inspector Name</label>
              <SearchableWorkerInput value={corrFields.inspector} onChange={v => setCorrFields(f => ({ ...f, inspector: v }))}
                workers={workers} department="inspection" placeholder="Inspector name" title="Inspector name" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              {(['passed', 'rejected', 'rework', 'scrapped'] as const).map(field => (
                <div key={field}>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">{field}</label>
                  <input type="number" className={inp} value={corrFields[field]} title={field} placeholder="0"
                    onChange={e => setCorrFields(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
        </CorrectionModal>
      )}
      </div>
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
