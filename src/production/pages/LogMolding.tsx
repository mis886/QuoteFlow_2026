// Module 06 — Log Molding
// Append-only. Prefills from last session history or product master.
// Two-panel: form left, session log right. Multi-operator rows per entry.

import { useState, useEffect, useMemo, useRef } from 'react';
import { Save, Info, Plus, Trash2, CheckCircle2, Pencil } from 'lucide-react';
import { AttachmentUploader } from '../components/AttachmentUploader';
import { SearchableWorkerInput } from '../components/SearchableWorkerInput';
import { CorrectionModal } from '../components/CorrectionModal';
import { useProductionData } from '../lib/useProductionData';
import { listMoldingSessions, insertMoldingSession, updateMoldingSession } from '../lib/db';
import { nextMldId, calcWorkingMinutes } from '../lib/jcStats';
import { useJcParam } from '../lib/useJcParam';
import { productIdentity } from '../lib/productLabel';
import { PageHeader } from '../components/table';
import type { MoldingSession } from '../lib/types';
import { useAppStore } from '../../store';
import { fmtDate } from '../../lib/utils';

const SHIFTS = ['A', 'B', 'C'];
const OP_TYPES = ['Production', 'Trial', 'Rework'];

interface OperatorRow {
  id: number;
  operator: string;
  qtyMolded: string;
  startTime: string;
  endTime: string;
}

let _rowId = 0;
const newRow = (): OperatorRow => ({
  id: ++_rowId,
  operator: '',
  qtyMolded: '',
  startTime: '',
  endTime: '',
});

export function LogMolding() {
  const { jobs, presses, workers } = useProductionData();
  const { user } = useAppStore();

  const [allSessions, setAllSessions] = useState<MoldingSession[]>([]);
  const [saving, setSaving]           = useState(false);
  const [prefillSource, setPrefillSource] = useState<string | null>(null);
  const [savedIds, setSavedIds]       = useState<string[]>([]);   // flash banner
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [jcId, setJcId]               = useState('');
  const [date, setDate]               = useState(new Date().toISOString().slice(0, 10));
  const [shift, setShift]             = useState('A');
  const [opType, setOpType]           = useState('Production');
  const [pressNo, setPressNo]         = useState('');
  const [dieNo, setDieNo]             = useState('');
  const [tikliSize, setTikliSize]     = useState('');
  const [cureTime, setCureTime]       = useState('');
  const [cureTemp, setCureTemp]       = useState('');
  const [scorchTime, setScorchTime]   = useState('');
  const [dieChangeMin, setDieChangeMin] = useState('');
  const [doriKhatam, setDoriKhatam]   = useState('');
  const [spray, setSpray]             = useState('');
  const [wtBefore, setWtBefore]       = useState('');
  const [wtAfter, setWtAfter]         = useState('');
  const [remarks, setRemarks]         = useState('');

  // Multi-operator rows
  const [opRows, setOpRows] = useState<OperatorRow[]>([newRow()]);

  // Preselect from Job Card Board "Mold" action (?jc=…)
  useJcParam(setJcId);

  useEffect(() => {
    listMoldingSessions().then(setAllSessions);
  }, []);

  // Clean up timer on unmount
  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  const selectedJob = useMemo(() => jobs.find(j => j.id === jcId), [jobs, jcId]);

  const prevMolded = useMemo(
    () => allSessions.filter(s => s.job_card_id === jcId).reduce((a, s) => a + (s.qty_molded || 0), 0),
    [allSessions, jcId]
  );

  const jcSessions = useMemo(
    () => allSessions
      .filter(s => s.job_card_id === jcId)
      .sort((a, b) => (b.molding_date || '').localeCompare(a.molding_date || '') || (b.id || '').localeCompare(a.id || '')),
    [allSessions, jcId]
  );

  // Auto-prefill when JC is selected
  useEffect(() => {
    if (!jcId) { setPrefillSource(null); return; }
    const last = allSessions.find(s => s.job_card_id === jcId);
    if (last) {
      setPressNo(last.press_no || '');
      setDieNo(last.die_no || '');
      setTikliSize(last.tikli_size || '');
      setCureTime(last.cure_time_min ? String(last.cure_time_min) : '');
      setCureTemp(last.cure_temp_c  ? String(last.cure_temp_c)   : '');
      setSpray(last.spray || '');
      setPrefillSource('Last molding session');
    } else if (selectedJob) {
      if (selectedJob.cure_time_min) setCureTime(String(selectedJob.cure_time_min));
      if (selectedJob.mould_code)    setDieNo(selectedJob.mould_code);
      if (selectedJob.press_id)      setPressNo(selectedJob.press_id);
      setPrefillSource('Job / product defaults');
    }
  }, [jcId, allSessions, selectedJob]);

  const totalThisEntry = opRows.reduce((a, r) => a + (parseInt(r.qtyMolded, 10) || 0), 0);
  const newTotal       = prevMolded + totalThisEntry;
  const plannedQty     = selectedJob?.qty || 0;
  const totalMet       = plannedQty > 0 && newTotal >= plannedQty;

  const updateRow = (id: number, field: keyof OperatorRow, value: string) => {
    setOpRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const addRow    = () => setOpRows(rows => [...rows, newRow()]);
  const removeRow = (id: number) => setOpRows(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows);

  const showBanner = (ids: string[]) => {
    setSavedIds(ids);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setSavedIds([]), 6000);
  };

  const save = async () => {
    if (!jcId || !pressNo) {
      alert('Required: Job Card and Press No.');
      return;
    }
    const validRows = opRows.filter(r => r.operator.trim() && r.qtyMolded);
    if (validRows.length === 0) {
      alert('Add at least one operator row with Qty Molded and Operator Name.');
      return;
    }
    setSaving(true);
    try {
      // Re-fetch latest IDs to avoid collisions
      const latest = await listMoldingSessions();
      const existingIds = latest.map(s => s.id);
      const savedRowIds: string[] = [];

      for (const row of validRows) {
        const id = nextMldId(existingIds);
        existingIds.push(id);
        const workingTimeMin = (row.startTime && row.endTime)
          ? calcWorkingMinutes(row.startTime, row.endTime)
          : null;
        const record: MoldingSession = {
          id,
          job_card_id:      jcId,
          molding_date:     date,
          shift,
          operation_type:   opType,
          press_no:         pressNo.trim(),
          die_no:           dieNo.trim() || null,
          tikli_size:       tikliSize.trim() || null,
          cure_time_min:    cureTime    ? parseInt(cureTime, 10)    : null,
          cure_temp_c:      cureTemp    ? parseInt(cureTemp, 10)    : null,
          scorch_time_min:  scorchTime  ? parseInt(scorchTime, 10)  : null,
          die_change_min:   dieChangeMin ? parseInt(dieChangeMin, 10) : null,
          dori_khatam_min:  doriKhatam  ? parseInt(doriKhatam, 10)  : null,
          spray:            spray.trim() || null,
          weight_before_g:  wtBefore    ? parseFloat(wtBefore)      : null,
          weight_after_g:   wtAfter     ? parseFloat(wtAfter)       : null,
          qty_molded:       parseInt(row.qtyMolded, 10),
          planned_qty:      plannedQty || null,
          start_time:       row.startTime || null,
          end_time:         row.endTime   || null,
          working_time_min: workingTimeMin,
          operator_name:    row.operator.trim(),
          remarks:          remarks.trim() || null,
          entered_by:       user?.email || null,
          order_id:         selectedJob?.order_id || null,
          our_desc:         selectedJob?.product_desc || null,
        };
        await insertMoldingSession(record);
        savedRowIds.push(id);
        latest.unshift(record); // optimistic update
      }

      // Refresh log panel with latest from DB
      const refreshed = await listMoldingSessions();
      setAllSessions(refreshed);

      // Reset only the variable fields — keep JC, date, press, cure settings
      setOpRows([newRow()]);
      setRemarks('');
      setWtBefore('');
      setWtAfter('');

      showBanner(savedRowIds);
    } catch (e: any) {
      alert(e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // Molded qty per job across all sessions (for hide-when-complete logic)
  const moldedPerJob = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of allSessions) {
      m.set(s.job_card_id, (m.get(s.job_card_id) || 0) + (s.qty_molded || 0));
    }
    return m;
  }, [allSessions]);

  // Correction modal state
  const [correcting, setCorrecting] = useState<MoldingSession | null>(null);
  const [corrEditRow, setCorrEditRow] = useState<OperatorRow & { mldId: string } | null>(null);

  const startCorrection = (s: MoldingSession) => {
    setCorrecting(s);
    setCorrEditRow({
      id: 0,
      mldId: s.id,
      operator: s.operator_name || '',
      qtyMolded: String(s.qty_molded),
      startTime: s.start_time || '',
      endTime: s.end_time || '',
    });
  };

  const saveCorrection = async (note: string) => {
    if (!correcting || !corrEditRow) return;
    await updateMoldingSession(correcting.id, {
      operator_name: corrEditRow.operator.trim(),
      qty_molded:    parseInt(corrEditRow.qtyMolded, 10) || correcting.qty_molded,
      start_time:    corrEditRow.startTime || null,
      end_time:      corrEditRow.endTime || null,
      working_time_min: (corrEditRow.startTime && corrEditRow.endTime)
        ? calcWorkingMinutes(corrEditRow.startTime, corrEditRow.endTime) : correcting.working_time_min,
    }, user?.email, note);
    const refreshed = await listMoldingSessions();
    setAllSessions(refreshed);
    setCorrecting(null);
    setCorrEditRow(null);
  };

  const eligibleJobs = useMemo(() => jobs.filter(j => {
    if (j.stage === 'dispatched') return false;
    if (opType === 'Rework' || opType === 'Trial') {
      // Rework / Trial can target any active job regardless of stage
      return !['dispatched'].includes(j.stage);
    }
    // Production: only jobs currently in moulding/queued stage
    if (!['queued', 'moulding'].includes(j.stage)) return false;
    // Hide if planned qty is already met
    if (j.qty && (moldedPerJob.get(j.id) || 0) >= j.qty) return false;
    return true;
  }), [jobs, opType, moldedPerJob]);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · Log"
        title="Log Molding"
        subtitle="Module 06 — append-only. Each entry is permanent."
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

          <Card title="Job Card & Date">
            <Grid3>
              <Field label="Job Card *">
                <select className={inp} value={jcId} onChange={e => setJcId(e.target.value)} title="Job card">
                  <option value="">— Select Job Card —</option>
                  {eligibleJobs.map(j => (
                    <option key={j.id} value={j.id}>{j.id} · {productIdentity(j)} · {j.customer_name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Molding Date">
                <input type="date" className={inp} value={date} onChange={e => setDate(e.target.value)} title="Date" />
              </Field>
              <Field label="Shift">
                <select className={inp} value={shift} onChange={e => setShift(e.target.value)} title="Shift">
                  {SHIFTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Operation Type">
                <select className={inp} value={opType} onChange={e => setOpType(e.target.value)} title="Operation type">
                  {OP_TYPES.map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </Grid3>
          </Card>

          {selectedJob && (
            <div className="bg-[#E8F0FD] border border-[#C2D8F8] rounded-[3px] px-3 py-2.5 flex items-start gap-2">
              <Info size={14} className="text-[#0A6ED1] mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-[11px] text-[#0A6ED1]">
                <span className="font-bold">{selectedJob.id}</span>
                <span className="mx-1.5 text-[#0A6ED1]/60">·</span>
                {productIdentity(selectedJob)}
                <span className="mx-1.5 text-[#0A6ED1]/60">·</span>
                {selectedJob.customer_name}
                <span className="mx-1.5 text-[#0A6ED1]/60">·</span>
                Ordered: <strong>{selectedJob.qty} pcs</strong>
                <span className="mx-1.5 text-[#0A6ED1]/60">·</span>
                Molded so far: <strong>{prevMolded} pcs</strong>
                {prefillSource && (
                  <span className="ml-3 bg-[#0A6ED1]/10 px-1.5 py-0.5 rounded text-[10px]">
                    Prefilled from: {prefillSource}
                  </span>
                )}
              </div>
            </div>
          )}

          <Card title="Press & Die Details">
            <Grid3>
              <Field label="Press No *">
                <select className={inp} value={pressNo} onChange={e => setPressNo(e.target.value)} title="Press number">
                  <option value="">— Select Press —</option>
                  {presses.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tonnage}T)</option>)}
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="Die No (Mould Code)">
                <input className={inp} value={dieNo} onChange={e => setDieNo(e.target.value)} placeholder="M-018" title="Die number" />
              </Field>
              <Field label="Tikli Size">
                <input className={inp} value={tikliSize} onChange={e => setTikliSize(e.target.value)} placeholder="5.4*6 holes" title="Tikli size" />
              </Field>
              <Field label="Cure Time (min) *">
                <input type="number" className={inp} value={cureTime} onChange={e => setCureTime(e.target.value)} placeholder="18" title="Cure time" />
              </Field>
              <Field label="Cure Temp (°C)">
                <input type="number" className={inp} value={cureTemp} onChange={e => setCureTemp(e.target.value)} placeholder="165" title="Cure temp" />
              </Field>
              <Field label="Scorch Time (min)">
                <input type="number" className={inp} value={scorchTime} onChange={e => setScorchTime(e.target.value)} title="Scorch time" />
              </Field>
              <Field label="Die Change (min)">
                <input type="number" className={inp} value={dieChangeMin} onChange={e => setDieChangeMin(e.target.value)} title="Die change duration" />
              </Field>
              <Field label="Dori Khatam (min)">
                <input type="number" className={inp} value={doriKhatam} onChange={e => setDoriKhatam(e.target.value)} title="Dori khatam" />
              </Field>
              <Field label="Mould Release Spray">
                <input className={inp} value={spray} onChange={e => setSpray(e.target.value)} placeholder="e.g. WD-40" title="Spray" />
              </Field>
              <Field label="Weight Before (g)">
                <input type="number" step="0.01" className={inp} value={wtBefore} onChange={e => setWtBefore(e.target.value)} title="Weight before" />
              </Field>
              <Field label="Weight After (g)">
                <input type="number" step="0.01" className={inp} value={wtAfter} onChange={e => setWtAfter(e.target.value)} title="Weight after" />
              </Field>
            </Grid3>
          </Card>

          <Card
            title="Quantity & Operator"
            action={
              <button type="button" onClick={addRow}
                className="inline-flex items-center gap-1 text-[10.5px] bg-[#E8F0FD] text-[#0A6ED1] border border-[#C2D8F8] px-2 py-0.5 rounded-[3px] hover:bg-[#C2D8F8] transition-colors">
                <Plus size={10} /> Add Operator
              </button>
            }
          >
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2 mb-1.5 px-1">
              {['Operator Name *', 'Qty Molded *', 'Start Time', 'End Time', ''].map((h, i) => (
                <div key={i} className="text-[9.5px] font-semibold uppercase tracking-wider text-[#555]">{h}</div>
              ))}
            </div>

            <div className="space-y-2">
              {opRows.map(row => {
                const wt = (row.startTime && row.endTime)
                  ? calcWorkingMinutes(row.startTime, row.endTime)
                  : null;
                return (
                  <div key={row.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_32px] gap-2 items-center">
                    <SearchableWorkerInput
                      value={row.operator}
                      onChange={v => updateRow(row.id, 'operator', v)}
                      workers={workers}
                      department="press"
                      placeholder="Operator name" title="Operator name"
                    />
                    <input type="number" className={inp} value={row.qtyMolded}
                      onChange={e => updateRow(row.id, 'qtyMolded', e.target.value)}
                      placeholder="0" title="Qty molded" />
                    <input type="time" className={inp} value={row.startTime}
                      onChange={e => updateRow(row.id, 'startTime', e.target.value)}
                      title="Start time" />
                    <div className="relative">
                      <input type="time" className={inp} value={row.endTime}
                        onChange={e => updateRow(row.id, 'endTime', e.target.value)}
                        title="End time" />
                      {wt !== null && (
                        <div className="absolute -bottom-4 left-0 text-[9px] text-[#107E3E] font-medium whitespace-nowrap">
                          {wt} min
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => removeRow(row.id)}
                      className="flex items-center justify-center w-8 h-7 text-[#BB0000] hover:bg-[#FFEBEE] rounded-[3px] transition-colors"
                      title="Remove row">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>

            {jcId && totalThisEntry > 0 && (
              <div className={`mt-4 border rounded-[3px] px-3 py-2.5 text-[12px] flex items-center gap-3 ${totalMet ? 'bg-[#E8F5E9] border-[#C5E1A5]' : 'bg-[#E8F0FD] border-[#C2D8F8]'}`}>
                <span className="text-[#555]">Previously molded:</span>
                <strong>{prevMolded}</strong>
                <span className="text-[#555]">+ this entry:</span>
                <strong>{totalThisEntry}</strong>
                <span className="text-[#555]">=</span>
                <strong className={totalMet ? 'text-[#107E3E]' : 'text-[#0A6ED1]'}>{newTotal}</strong>
                <span className="text-[#555]">/ {plannedQty} planned</span>
                {totalMet && <span className="ml-auto font-semibold text-[#107E3E]">✓ Planned qty met</span>}
              </div>
            )}

            <Field label="Remarks" className="mt-3">
              <textarea className={`${inp} resize-none h-[52px]`} value={remarks} onChange={e => setRemarks(e.target.value)} title="Remarks" />
            </Field>
          </Card>

          {/* DPR attachment — per shift */}
          <Card title="DPR Attachment">
            <AttachmentUploader
              type="dpr"
              shiftDate={date}
              shift={shift === 'A' ? 'day' : shift === 'B' ? 'day' : 'night'}
              label={`DPR — ${date} · Shift ${shift}`}
            />
          </Card>

          <div className="text-[10.5px] text-[#555] border-t border-[#E4E5E6] pt-2">
            Entries are permanent · Use ✎ in the log panel to make corrections
          </div>
        </div>

        {/* RIGHT — session log for selected JC */}
        <div className="w-[340px] flex-shrink-0 flex flex-col overflow-y-auto">
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-[#E4E5E6] text-[11px] font-semibold text-[#333] uppercase tracking-wider flex items-center gap-2">
              Molding Log
              {jcId && (
                <span className="font-normal normal-case text-[10.5px] text-[#555]">
                  — {jcSessions.length} entries · {prevMolded} pcs total
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {!jcId ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">
                  Select a Job Card<br />to see its molding history
                </div>
              ) : jcSessions.length === 0 ? (
                <div className="p-4 text-[11px] text-[#888] text-center mt-6">
                  No molding entries yet
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
                          <span className="ml-2 text-[10px] text-[#555]">{fmtDate(s.molding_date)} · Shift {s.shift}</span>
                          {s.corrected_at && (
                            <span className="ml-1 text-[9px] bg-[#FFF3E0] text-[#E9730C] px-1 rounded">edited</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[11px] font-semibold text-[#111]">{s.qty_molded} pcs</span>
                          <button type="button" onClick={() => startCorrection(s)}
                            className="text-[#555] hover:text-[#0A6ED1] p-0.5 rounded hover:bg-[#E8F0FD] transition-colors"
                            title="Correct this entry">
                            <Pencil size={10} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-1 text-[10px] text-[#555] flex gap-3 flex-wrap">
                        <span>Press: <strong className="text-[#333]">{s.press_no || '—'}</strong></span>
                        {s.die_no && <span>Die: <strong className="text-[#333]">{s.die_no}</strong></span>}
                        <span>Op: <strong className="text-[#333]">{s.operator_name || '—'}</strong></span>
                        {s.operation_type && s.operation_type !== 'Production' && (
                          <span className="bg-[#FFF3E0] text-[#E9730C] px-1.5 rounded-full font-medium">{s.operation_type}</span>
                        )}
                      </div>
                      {s.correction_note && (
                        <div className="mt-0.5 text-[9.5px] text-[#E9730C] italic">✎ {s.correction_note}</div>
                      )}
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

      {/* Correction modal */}
      {correcting && corrEditRow && (
        <CorrectionModal entryId={correcting.id} onClose={() => setCorrecting(null)} onConfirm={saveCorrection}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Operator Name</label>
              <SearchableWorkerInput value={corrEditRow.operator} onChange={v => setCorrEditRow(r => r ? { ...r, operator: v } : r)}
                workers={workers} department="press" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Qty Molded</label>
              <input type="number" className={inp} value={corrEditRow.qtyMolded} title="Qty molded" placeholder="0"
                onChange={e => setCorrEditRow(r => r ? { ...r, qtyMolded: e.target.value } : r)} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Start Time</label>
              <input type="time" className={inp} value={corrEditRow.startTime} title="Start time"
                onChange={e => setCorrEditRow(r => r ? { ...r, startTime: e.target.value } : r)} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">End Time</label>
              <input type="time" className={inp} value={corrEditRow.endTime} title="End time"
                onChange={e => setCorrEditRow(r => r ? { ...r, endTime: e.target.value } : r)} />
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

function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">{label}</label>
      {children}
    </div>
  );
}
