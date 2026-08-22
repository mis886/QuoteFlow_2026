// Module 09-B — Log PDI (Pre-Despatch Inspection)
// Append-only. Split validator: passed + failed + hold = qty_checked.
// PDI document upload per entry. Log panel on right.

import { useState, useEffect, useMemo, useRef } from 'react';
import { Save, CheckCircle2, XCircle, Plus, Trash2 } from 'lucide-react';
import { useProductionData } from '../lib/useProductionData';
import { listPdiLogs, insertPdiLog, listInspectionSessions } from '../lib/db';
import { nextPdiId } from '../lib/jcStats';
import { useJcParam } from '../lib/useJcParam';
import { productIdentity } from '../lib/productLabel';
import { PageHeader } from '../components/table';
import { AttachmentUploader } from '../components/AttachmentUploader';
import type { PdiLog, InspectionSession } from '../lib/types';
import { useAppStore } from '../../store';
import { fmtDate } from '../../lib/utils';

interface OfficerRow {
  id: number;
  officer: string;
  qtyChecked: string;
  passed: string;
  failed: string;
  hold: string;
}

let _rowId = 0;
const newRow = (): OfficerRow => ({
  id: ++_rowId,
  officer: '',
  qtyChecked: '',
  passed: '',
  failed: '',
  hold: '',
});

function validateSplit(qty: number, passed: number, failed: number, hold: number) {
  const sum = passed + failed + hold;
  if (sum === qty) return { ok: true, message: `✓ Split balances — ${qty} pcs` };
  return { ok: false, message: `Sum ${sum} ≠ Qty ${qty} (diff ${sum - qty > 0 ? '+' : ''}${sum - qty})` };
}

export function LogPDI() {
  const { jobs } = useProductionData();
  const { user } = useAppStore();

  const [allPdi, setAllPdi] = useState<PdiLog[]>([]);
  const [allIns, setAllIns] = useState<InspectionSession[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [jcId,    setJcId]    = useState('');
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState('');
  const [rows,    setRows]    = useState<OfficerRow[]>([newRow()]);

  // Preselect from Job Card Board "PDI" action (?jc=…)
  useJcParam(setJcId);

  useEffect(() => {
    Promise.all([listPdiLogs(), listInspectionSessions()])
      .then(([p, i]) => { setAllPdi(p); setAllIns(i); });
  }, []);

  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  // Jobs eligible for PDI: stage is 'pdi' OR has inspection sessions
  const jobsWithInspection = useMemo(
    () => new Set(allIns.map(i => i.job_card_id)),
    [allIns]
  );
  const eligibleJobs = useMemo(() => jobs.filter(j => {
    if (j.stage === 'dispatched') return false;
    return j.stage === 'pdi' || j.stage === 'dispatch'
      || jobsWithInspection.has(j.id);
  }), [jobs, jobsWithInspection]);

  const selectedJob = useMemo(() => jobs.find(j => j.id === jcId), [jobs, jcId]);

  const prevPdiChecked = useMemo(
    () => allPdi.filter(p => p.job_card_id === jcId).reduce((a, p) => a + (p.qty_checked || 0), 0),
    [allPdi, jcId]
  );
  const prevPassed = useMemo(
    () => allPdi.filter(p => p.job_card_id === jcId).reduce((a, p) => a + (p.passed || 0), 0),
    [allPdi, jcId]
  );

  const jcSessions = useMemo(
    () => allPdi.filter(p => p.job_card_id === jcId)
           .sort((a, b) => (b.pdi_date || '').localeCompare(a.pdi_date || '') || (b.id || '').localeCompare(a.id || '')),
    [allPdi, jcId]
  );

  const updateRow = (id: number, field: keyof OfficerRow, value: string) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const addRow    = () => setRows(rs => [...rs, newRow()]);
  const removeRow = (id: number) => setRows(rs => rs.length > 1 ? rs.filter(r => r.id !== id) : rs);

  const rowValidations = useMemo(() => {
    const n = (v: string) => parseInt(v, 10) || 0;
    return rows.map(row => {
      const qty = parseInt(row.qtyChecked, 10);
      if (!qty || isNaN(qty)) return null;
      return validateSplit(qty, n(row.passed), n(row.failed), n(row.hold));
    });
  }, [rows]);

  const allRowsOk = rows.every((r, i) => {
    if (!r.officer.trim() || !r.qtyChecked) return false;
    return rowValidations[i]?.ok === true;
  });

  const showBanner = (ids: string[]) => {
    setSavedIds(ids);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setSavedIds([]), 6000);
  };

  const save = async () => {
    if (!jcId) { alert('Select a Job Card.'); return; }
    const validRows = rows.filter(r => r.officer.trim() && r.qtyChecked);
    if (validRows.length === 0) {
      alert('Add at least one PDI officer row.');
      return;
    }
    const badIdx = validRows.findIndex((r, i) => rowValidations[rows.indexOf(r)]?.ok === false);
    if (badIdx !== -1) {
      alert(`Row ${badIdx + 1}: split does not balance.`);
      return;
    }
    setSaving(true);
    try {
      const n = (v: string) => parseInt(v, 10) || 0;
      const latest = await listPdiLogs();
      const existingIds = latest.map(p => p.id);
      const savedRowIds: string[] = [];

      for (const row of validRows) {
        const id = nextPdiId(existingIds);
        existingIds.push(id);
        const record: PdiLog = {
          id,
          job_card_id: jcId,
          pdi_date:    date,
          pdi_officer: row.officer.trim(),
          qty_checked: n(row.qtyChecked),
          passed:      n(row.passed),
          failed:      n(row.failed),
          hold:        n(row.hold),
          remarks:     remarks.trim() || null,
          entered_by:  user?.email ?? null,
          order_id:    selectedJob?.order_id ?? null,
        };
        await insertPdiLog(record);
        savedRowIds.push(id);
      }

      const refreshed = await listPdiLogs();
      setAllPdi(refreshed);
      setRows([newRow()]);
      setRemarks('');
      showBanner(savedRowIds);
    } catch (e: any) {
      alert(e?.message || 'Save failed.');
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · Log"
        title="Log PDI"
        subtitle="Module 09-B — Pre-Despatch Inspection. Append-only. Split must balance."
        actions={
          <button type="button" onClick={save}
            disabled={saving || (rows.some(r => r.qtyChecked) && !allRowsOk)}
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

          {/* Job Card + Date */}
          <Card title="PDI Entry">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Job Card *" className="md:col-span-2">
                <select className={inp} value={jcId} onChange={e => setJcId(e.target.value)} title="Job card">
                  <option value="">— Select Job Card —</option>
                  {eligibleJobs.map(j => (
                    <option key={j.id} value={j.id}>{j.id} · {productIdentity(j)} · {j.customer_name}</option>
                  ))}
                </select>
              </Field>

              {selectedJob && (
                <div className="md:col-span-2 bg-[#E8F0FD] border border-[#C2D8F8] rounded-[3px] px-3 py-2 text-[11px] text-[#0A6ED1]">
                  <strong>{selectedJob.id}</strong> · {productIdentity(selectedJob)}
                  · Ordered: <strong>{selectedJob.qty} pcs</strong>
                  · Promised: <strong>{fmtDate(selectedJob.promised_date)}</strong>
                  · PDI checked so far: <strong>{prevPdiChecked} pcs</strong>
                  · Passed: <strong>{prevPassed} pcs</strong>
                </div>
              )}

              <Field label="PDI Date">
                <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} title="Date" />
              </Field>
              <Field label="Shared Remarks">
                <input className={inp} value={remarks} onChange={e => setRemarks(e.target.value)}
                  placeholder="Remarks for all rows" title="Remarks" />
              </Field>
            </div>
          </Card>

          {/* PDI Officers + Split */}
          <Card
            title="PDI Officers & Result"
            action={
              <button type="button" onClick={addRow}
                className="inline-flex items-center gap-1 text-[10.5px] bg-[#E8F0FD] text-[#0A6ED1] border border-[#C2D8F8] px-2 py-0.5 rounded-[3px] hover:bg-[#C2D8F8] transition-colors">
                <Plus size={10} /> Add Officer
              </button>
            }
          >
            <div className="space-y-4">
              {rows.map((row, idx) => {
                const validation = rowValidations[idx];
                const n = (v: string) => parseInt(v, 10) || 0;
                const yieldPct = (validation?.ok && n(row.qtyChecked))
                  ? Math.round((n(row.passed) / n(row.qtyChecked)) * 100)
                  : null;

                return (
                  <div key={row.id} className="border border-[#E4E5E6] rounded-[3px] overflow-hidden">
                    <div className="bg-[#FAFAFA] px-3 py-1.5 border-b border-[#E4E5E6] flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wider flex-1">
                        PDI Officer {idx + 1}
                      </span>
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(row.id)}
                          className="flex items-center gap-1 text-[10px] text-[#BB0000] hover:bg-[#FFEBEE] px-1.5 py-0.5 rounded-[3px] transition-colors">
                          <Trash2 size={10} /> Remove
                        </button>
                      )}
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="PDI Officer *" className="md:col-span-2">
                          <input className={inp} value={row.officer}
                            onChange={e => updateRow(row.id, 'officer', e.target.value)}
                            placeholder="Officer name" title="PDI officer" />
                        </Field>
                        <Field label="Qty Checked *">
                          <input type="number" className={inp} value={row.qtyChecked}
                            onChange={e => updateRow(row.id, 'qtyChecked', e.target.value)}
                            placeholder="0" title="Qty checked" />
                        </Field>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="Passed ✓">
                          <input type="number" className={`${inp} border-[#107E3E] focus:border-[#107E3E]`}
                            value={row.passed} onChange={e => updateRow(row.id, 'passed', e.target.value)}
                            placeholder="0" title="Passed" />
                        </Field>
                        <Field label="Failed ✕">
                          <input type="number" className={`${inp} border-[#BB0000] focus:border-[#BB0000]`}
                            value={row.failed} onChange={e => updateRow(row.id, 'failed', e.target.value)}
                            placeholder="0" title="Failed" />
                        </Field>
                        <Field label="Hold ⏸">
                          <input type="number" className={`${inp} border-[#E9730C] focus:border-[#E9730C]`}
                            value={row.hold} onChange={e => updateRow(row.id, 'hold', e.target.value)}
                            placeholder="0" title="On hold" />
                        </Field>
                      </div>

                      {/* Split validator */}
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
                              yieldPct >= 95 ? 'bg-[#E8F5E9] text-[#107E3E]' :
                              yieldPct >= 80 ? 'bg-[#FFF3E0] text-[#E9730C]' :
                                               'bg-[#FFEBEE] text-[#BB0000]'
                            }`}>
                              Yield: {yieldPct}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* PDI Document attachment */}
          {jcId && (
            <Card title="PDI Document">
              <AttachmentUploader
                type="pdi_doc"
                shiftDate={date}
                jobCardId={jcId}
                label={`PDI Document — ${jcId} · ${fmtDate(date)}`}
              />
            </Card>
          )}

          <div className="text-[10.5px] text-[#555] border-t border-[#E4E5E6] pt-2">
            Entry is permanent · Corrections require a new entry
          </div>
        </div>

        {/* RIGHT — PDI log for selected JC */}
        <div className="w-[300px] flex-shrink-0 flex flex-col overflow-y-auto">
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-[#E4E5E6] text-[11px] font-semibold text-[#333] uppercase tracking-wider flex items-center gap-2">
              PDI Log
              {jcId && (
                <span className="font-normal normal-case text-[10.5px] text-[#555]">
                  — {jcSessions.length} entries · {prevPassed} passed
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {!jcId ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">
                  Select a Job Card<br />to see PDI history
                </div>
              ) : jcSessions.length === 0 ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">
                  No PDI entries yet
                </div>
              ) : (
                <div className="divide-y divide-[#F0F0F0]">
                  {jcSessions.map(s => {
                    const yPct = s.qty_checked
                      ? Math.round((s.passed / s.qty_checked) * 100)
                      : null;
                    return (
                      <div key={s.id}
                        className={`px-3 py-2.5 transition-colors ${savedIds.includes(s.id) ? 'bg-[#E8F5E9]' : 'hover:bg-[#FAFAFA]'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className={`font-mono text-[10px] font-bold ${savedIds.includes(s.id) ? 'text-[#107E3E]' : 'text-[#0A6ED1]'}`}>
                              {savedIds.includes(s.id) && '✓ '}{s.id}
                            </span>
                            <span className="ml-2 text-[10px] text-[#555]">{fmtDate(s.pdi_date)}</span>
                          </div>
                          {yPct !== null && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              yPct >= 95 ? 'bg-[#E8F5E9] text-[#107E3E]' :
                              yPct >= 80 ? 'bg-[#FFF3E0] text-[#E9730C]' :
                                           'bg-[#FFEBEE] text-[#BB0000]'
                            }`}>
                              {yPct}%
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[10px] text-[#555]">
                          <span>Officer: <strong className="text-[#333]">{s.pdi_officer}</strong></span>
                          <span className="ml-2">Batch: {s.qty_checked}</span>
                        </div>
                        <div className="mt-0.5 text-[9.5px] text-[#555] flex gap-2 flex-wrap">
                          <span className="text-[#107E3E]">✓ {s.passed}</span>
                          <span className="text-[#BB0000]">✕ {s.failed}</span>
                          {s.hold > 0 && <span className="text-[#E9730C]">⏸ {s.hold}</span>}
                        </div>
                        {s.remarks && (
                          <div className="mt-0.5 text-[9.5px] text-[#666] italic truncate">{s.remarks}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

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
