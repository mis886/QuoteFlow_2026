// Shop Floor Settings — attendance register (v2 style) + shift config + press master.
// Workers: Finishing | Inspection | Press Operators (day/night shift).

import { useEffect, useState } from 'react';
import { Save, Users, Wrench, Factory, Plus, Trash2, X, Check, Sun, Moon, Edit2, Clock, ListChecks } from 'lucide-react';
import { useProductionData } from '../lib/useProductionData';
import {
  updateShopFloorSettings, setWorkerPresent,
  insertPress, updatePress, deletePress, insertWorker, updateWorker, deleteWorker,
  insertOption, updateOption, deleteOption,
} from '../lib/db';
import { PageHeader } from '../components/table';
import { fmtIST } from '../../lib/utils';
import type { Press, ProdOption, ProdOptionField, ShopFloorSettings, Worker } from '../lib/types';

const ROLES_FINISHING  = ['Senior Finisher', 'Finisher', 'Trainee Finisher'];
const ROLES_INSPECTION = ['Sr. Inspector', 'Inspector', 'Trainee Inspector'];
const ROLES_PRESS      = ['Sr. Press Operator', 'Press Operator', 'Trainee Press Operator'];

type ModalMode = 'add-finishing' | 'add-inspection' | 'add-press' | { edit: Worker };

export function ShopFloorSettingsPage() {
  const { settings, workers, presses, options, refresh, loading } = useProductionData();
  const [draft, setDraft]           = useState<ShopFloorSettings | null>(null);
  const [saving, setSaving]         = useState(false);
  const [busyWorker, setBusyWorker] = useState<string | null>(null);
  const [workerModal, setWorkerModal] = useState<ModalMode | null>(null);
  const [delConfirm, setDelConfirm]   = useState<Worker | null>(null);
  const [pressModal, setPressModal]   = useState<Press | 'add' | null>(null);  // edit or add press
  const [pressDelConfirm, setPressDelConfirm] = useState<Press | null>(null);

  useEffect(() => { if (settings) setDraft(settings); }, [settings]);

  const saveSettings = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await updateShopFloorSettings({
        shift_started:       draft.shift_started,
        shift_hours:         draft.shift_hours,
        shift_hours_left:    draft.shift_hours_left,
        overtime_max:        draft.overtime_max,
        planned_finishers:   draft.planned_finishers,
        planned_inspectors:  draft.planned_inspectors,
        emergency_active:    draft.emergency_active,
        active_shift:        draft.active_shift ?? 'day',
        day_shift_hours:     draft.day_shift_hours ?? 8,
        night_shift_hours:   draft.night_shift_hours ?? 8,
        day_ot_max:          draft.day_ot_max ?? 2,
        night_ot_max:        draft.night_ot_max ?? 2,
        day_shift_start:     draft.day_shift_start ?? '08:00',
        night_shift_start:   draft.night_shift_start ?? '20:00',
      });
      await refresh();
    } finally { setSaving(false); }
  };

  const togglePresent = async (id: string, present: boolean) => {
    setBusyWorker(id);
    try { await setWorkerPresent(id, present); await refresh(); }
    finally { setBusyWorker(null); }
  };

  const togglePressMaintenance = async (id: string, on: boolean) => {
    await updatePress(id, { status: on ? 'maintenance' : 'idle' });
    await refresh();
  };

  const today = fmtIST(new Date(), 'dd-MMM-yyyy');

  const deptCount = (dept: string, present?: boolean) => {
    const list = workers.filter(w => w.department === dept);
    return present === undefined ? list.length : list.filter(w => w.present === present).length;
  };

  // Press operators by shift
  // 'both' workers appear in both day and night groups
  const pressDay   = workers.filter(w => w.department === 'press' && (w.shift === 'day' || w.shift === 'both' || !w.shift));
  const pressNight = workers.filter(w => w.department === 'press' && (w.shift === 'night' || w.shift === 'both'));

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · Settings"
        title="Shop Floor"
        accent="Configuration"
        subtitle="Workforce attendance, shift management, press status."
        actions={
          <button type="button" onClick={saveSettings} disabled={saving || !draft}
            className="inline-flex items-center gap-1.5 bg-[#0A6ED1] text-white text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#085EA8] disabled:opacity-40 transition-colors">
            <Save size={13} /> {saving ? 'Saving…' : 'Save Settings'}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Attendance Register ─────────────────────────────── */}
        <section>
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden">
            <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
              <Users size={14} className="text-[#333]" />
              <div className="text-[12px] font-semibold text-[#111] flex-1">
                Attendance Register — {today}
              </div>
              <div className="text-[10px] text-[#555]">
                Tick/untick → OTD projections update instantly
              </div>
            </div>

            {/* Three-column roster */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#F3F3F3]">

              {/* FINISHING */}
              <DeptColumn
                emoji="✂" label="FINISHING" accent="text-[#0A6ED1]"
                workers={workers.filter(w => w.department === 'finishing')}
                busyWorker={busyWorker} loading={loading}
                onToggle={togglePresent}
                onEdit={w => setWorkerModal({ edit: w })}
                onDelete={w => setDelConfirm(w)}
                onAdd={() => setWorkerModal('add-finishing')}
              />

              {/* INSPECTION */}
              <DeptColumn
                emoji="🔍" label="INSPECTION" accent="text-[#107E3E]"
                workers={workers.filter(w => w.department === 'inspection')}
                busyWorker={busyWorker} loading={loading}
                onToggle={togglePresent}
                onEdit={w => setWorkerModal({ edit: w })}
                onDelete={w => setDelConfirm(w)}
                onAdd={() => setWorkerModal('add-inspection')}
              />

              {/* PRESS OPERATORS */}
              <div>
                <div className="px-3 py-2 bg-[#FAFAFA] border-b border-[#F3F3F3] flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#E9730C]">⚙ PRESS OPERATORS</span>
                  <span className="text-[10px] text-[#555]">
                    {deptCount('press', true)} present of {deptCount('press')}
                  </span>
                  <button type="button" onClick={() => setWorkerModal('add-press')}
                    className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#0A6ED1] border border-[#0A6ED1] rounded-[3px] px-2 py-0.5 hover:bg-[#E8F0FD] transition-colors">
                    <Plus size={10} /> Add
                  </button>
                </div>

                {/* Day shift */}
                <ShiftGroup
                  label="Day Shift" icon={<Sun size={10} className="text-[#E9730C]" />}
                  workers={pressDay} busyWorker={busyWorker} loading={loading}
                  onToggle={togglePresent}
                  onEdit={w => setWorkerModal({ edit: w })}
                  onDelete={w => setDelConfirm(w)}
                  presses={presses}
                />

                {/* Night shift */}
                <ShiftGroup
                  label="Night Shift" icon={<Moon size={10} className="text-[#555]" />}
                  workers={pressNight} busyWorker={busyWorker} loading={loading}
                  onToggle={togglePresent}
                  onEdit={w => setWorkerModal({ edit: w })}
                  onDelete={w => setDelConfirm(w)}
                  presses={presses}
                />
              </div>

            </div>

            {/* Bottom config strip */}
            <div className="px-3 py-2.5 border-t border-[#E4E5E6] bg-[#FAFAFA] flex flex-wrap items-center gap-3 text-[12px]">
              <span className="bg-[#E8F0FD] text-[#0A6ED1] text-[11px] font-medium px-2.5 py-1 rounded-[3px]">
                <strong>{deptCount('finishing', true)}</strong> finishers on floor
              </span>
              <span className="bg-[#E8F5E9] text-[#107E3E] text-[11px] font-medium px-2.5 py-1 rounded-[3px]">
                <strong>{deptCount('inspection', true)}</strong> inspectors on floor
              </span>
              <span className="bg-[#FFF3E0] text-[#E9730C] text-[11px] font-medium px-2.5 py-1 rounded-[3px]">
                <strong>{pressDay.filter(w => w.present).length}</strong> press ops · day
              </span>
              <span className="bg-[#F3F3F3] text-[#555] text-[11px] font-medium px-2.5 py-1 rounded-[3px]">
                <strong>{pressNight.filter(w => w.present).length}</strong> press ops · night
              </span>
              {draft && (
                <>
                  <ConfigInput label="Shift hrs left" value={draft.shift_hours_left} step={0.5} min={0} max={12}
                    onChange={v => setDraft({ ...draft, shift_hours_left: v })} />
                  <ConfigInput label="OT authorised" value={draft.overtime_max} step={0.5} min={0} max={4}
                    onChange={v => setDraft({ ...draft, overtime_max: v })} />
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Shift & LSD defaults ─────────────────────────── */}
        <section>
          <SectionTitle icon={<Wrench size={11} />} title="Shift & LSD Defaults" />
          {!draft ? <Loading /> : (
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden">
              {/* Active shift selector */}
              <div className="px-4 py-3 border-b border-[#F3F3F3] flex items-center gap-3">
                <Clock size={13} className="text-[#333]" />
                <span className="text-[11.5px] font-semibold text-[#111]">Active Shift</span>
                <div className="flex gap-2 ml-2">
                  {(['day', 'night'] as const).map(s => (
                    <button key={s} type="button"
                      onClick={() => setDraft({ ...draft, active_shift: s,
                        shift_hours: s === 'day' ? (draft.day_shift_hours ?? 8) : (draft.night_shift_hours ?? 8),
                        overtime_max: s === 'day' ? (draft.day_ot_max ?? 2) : (draft.night_ot_max ?? 2),
                      })}
                      className={`flex items-center gap-1.5 px-3 py-1 text-[11px] border rounded-[3px] transition-colors font-medium ${
                        (draft.active_shift ?? 'day') === s
                          ? s === 'day' ? 'bg-[#FFF3E0] border-[#E9730C] text-[#E9730C]' : 'bg-[#E8E8E8] border-[#555] text-[#333]'
                          : 'bg-white border-[#E4E5E6] text-[#555] hover:bg-[#FAFAFA]'
                      }`}>
                      {s === 'day' ? <Sun size={11} /> : <Moon size={11} />}
                      {s === 'day' ? 'Day Shift' : 'Night Shift'}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-[10.5px] text-[#555]">
                  Shift left: <strong className="text-[#111]">{draft.shift_hours_left}h</strong>
                  <input type="number" step={0.5} min={0} max={24} value={draft.shift_hours_left}
                    onChange={e => setDraft({ ...draft, shift_hours_left: Number(e.target.value) || 0 })}
                    className="ml-2 w-[50px] font-mono text-[11px] text-[#111] border border-[#E4E5E6] rounded-[2px] px-1 py-0.5 outline-none focus:border-[#0A6ED1] text-center bg-white"
                    title="Shift hours left" />
                  hrs
                </span>
              </div>

              {/* Day / Night shift config side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#F3F3F3]">
                {/* Day shift */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#E9730C] mb-1">
                    <Sun size={11} /> Day Shift
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Start Time">
                      <input type="time" className={inp} value={draft.day_shift_start ?? '08:00'}
                        onChange={e => setDraft({ ...draft, day_shift_start: e.target.value })}
                        title="Day shift start" />
                    </Field>
                    <Field label="Hours">
                      <input type="number" className={inp} min={1} max={12}
                        value={draft.day_shift_hours ?? 8}
                        onChange={e => setDraft({ ...draft, day_shift_hours: Number(e.target.value) || 8 })}
                        title="Day shift hours" />
                    </Field>
                    <Field label="OT Max (hrs)">
                      <input type="number" className={inp} min={0} max={4} step={0.5}
                        value={draft.day_ot_max ?? 2}
                        onChange={e => setDraft({ ...draft, day_ot_max: Number(e.target.value) || 0 })}
                        title="Day OT max" />
                    </Field>
                  </div>
                </div>
                {/* Night shift */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#555] mb-1">
                    <Moon size={11} /> Night Shift
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Start Time">
                      <input type="time" className={inp} value={draft.night_shift_start ?? '20:00'}
                        onChange={e => setDraft({ ...draft, night_shift_start: e.target.value })}
                        title="Night shift start" />
                    </Field>
                    <Field label="Hours">
                      <input type="number" className={inp} min={1} max={12}
                        value={draft.night_shift_hours ?? 8}
                        onChange={e => setDraft({ ...draft, night_shift_hours: Number(e.target.value) || 8 })}
                        title="Night shift hours" />
                    </Field>
                    <Field label="OT Max (hrs)">
                      <input type="number" className={inp} min={0} max={4} step={0.5}
                        value={draft.night_ot_max ?? 2}
                        onChange={e => setDraft({ ...draft, night_ot_max: Number(e.target.value) || 0 })}
                        title="Night OT max" />
                    </Field>
                  </div>
                </div>
              </div>

              {/* LSD config */}
              <div className="border-t border-[#F3F3F3] p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Shift Started">
                  <select className={inp} value={draft.shift_started ? 'yes' : 'no'}
                    onChange={e => setDraft({ ...draft, shift_started: e.target.value === 'yes' })}
                    title="Shift started flag">
                    <option value="no">No — pre-shift</option>
                    <option value="yes">Yes — running</option>
                  </select>
                </Field>
                <Field label="Planned Finishers (LSD calc)">
                  <input type="number" className={inp} min={1}
                    value={draft.planned_finishers}
                    onChange={e => setDraft({ ...draft, planned_finishers: Number(e.target.value) || 0 })}
                    title="Planned finishers" />
                </Field>
                <Field label="Planned Inspectors (LSD calc)">
                  <input type="number" className={inp} min={1}
                    value={draft.planned_inspectors}
                    onChange={e => setDraft({ ...draft, planned_inspectors: Number(e.target.value) || 0 })}
                    title="Planned inspectors" />
                </Field>
              </div>
            </div>
          )}
        </section>

        {/* ── Press master ─────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionTitle icon={<Factory size={11} />} title="Press Master" />
            <button type="button" onClick={() => setPressModal('add')}
              className="inline-flex items-center gap-1 text-[10px] text-[#0A6ED1] border border-[#0A6ED1] rounded-[3px] px-2 py-0.5 hover:bg-[#E8F0FD] transition-colors">
              <Plus size={10} /> Add Press
            </button>
          </div>
          <div className="bg-white border border-[#E4E5E6] rounded-[3px] divide-y divide-[#F3F3F3]">
            {presses.length === 0 && (
              <div className="px-4 py-6 text-center text-[11px] text-[#555] italic">No presses added yet.</div>
            )}
            {presses.map(p => {
              const assignedOps = workers.filter(w => w.department === 'press' && w.press_id === p.id && w.present);
              const dayOps   = assignedOps.filter(w => (w.shift ?? 'day') === 'day');
              const nightOps = assignedOps.filter(w => w.shift === 'night');
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Status dot */}
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    p.status === 'running'     ? 'bg-[#107E3E]' :
                    p.status === 'setup'       ? 'bg-[#E9730C]' :
                    p.status === 'maintenance' ? 'bg-[#BB0000]' : 'bg-[#C0C0C0]'
                  }`} />

                  {/* Press info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#111]">{p.name}</span>
                      <span className="text-[11px] text-[#555] font-mono">{p.tonnage}T</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-[2px] font-medium ${
                        p.status === 'running'     ? 'bg-[#E8F5E9] text-[#107E3E]' :
                        p.status === 'maintenance' ? 'bg-[#FFEBEE] text-[#BB0000]' :
                        p.status === 'setup'       ? 'bg-[#FFF3E0] text-[#E9730C]' :
                                                     'bg-[#F5F6F7] text-[#555]'
                      }`}>
                        {p.status === 'idle' ? 'Idle' : p.status === 'running' ? 'Running' :
                         p.status === 'setup' ? 'Setup' : 'Maintenance'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {p.active_job_id && (
                        <span className="text-[10.5px] text-[#0A6ED1] font-mono">{p.active_job_id}</span>
                      )}
                      {dayOps.length > 0 && (
                        <span className="text-[10px] text-[#E9730C] flex items-center gap-1">
                          <Sun size={9} /> {dayOps.map(w => w.name).join(', ')}
                        </span>
                      )}
                      {nightOps.length > 0 && (
                        <span className="text-[10px] text-[#555] flex items-center gap-1">
                          <Moon size={9} /> {nightOps.map(w => w.name).join(', ')}
                        </span>
                      )}
                      {assignedOps.length === 0 && (
                        <span className="text-[10px] text-[#C0C0C0] italic">No operator assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button" onClick={() => setPressModal(p)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] border border-[#E4E5E6] text-[#555] rounded-[3px] hover:bg-[#F5F6F7] transition-colors">
                      <Edit2 size={10} /> Edit
                    </button>
                    <button type="button"
                      disabled={p.status === 'running' || p.status === 'setup' || assignedOps.length > 0}
                      onClick={() => setPressDelConfirm(p)}
                      title={p.status === 'running' || p.status === 'setup'
                        ? 'Press is busy — finish first'
                        : assignedOps.length > 0 ? 'Unassign operators first' : 'Remove press'}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] border border-[#E4E5E6] text-[#555] rounded-[3px] hover:bg-[#FFF5F5] hover:text-[#BB0000] hover:border-[#BB0000]/40 disabled:opacity-30 transition-colors">
                      <Trash2 size={10} />
                    </button>
                    <button
                      type="button"
                      disabled={p.status === 'running' || p.status === 'setup'}
                      onClick={() => togglePressMaintenance(p.id, p.status !== 'maintenance')}
                      className={`px-2.5 py-1 text-[11px] rounded-[3px] border transition-colors disabled:opacity-30 ${
                        p.status === 'maintenance'
                          ? 'bg-[#FFF3E0] border-[#E9730C]/30 text-[#E9730C] hover:bg-[#FFE0B2]/60'
                          : 'bg-white border-[#CCC] text-[#555] hover:bg-[#FAFAFA]'
                      }`}
                      title={p.status === 'running' || p.status === 'setup' ? 'Press is busy — finish first' : ''}>
                      {p.status === 'maintenance' ? 'Bring Online' : 'Mark Maintenance'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Master Lists (editable dropdown options) ───────── */}
        <section>
          <SectionTitle icon={<ListChecks size={11} />} title="Master Lists — Product Dropdowns" />
          <MasterListsSection options={options} unitChoices={['Unit 1', 'Unit 2']} onChanged={refresh} />
        </section>
      </div>

      {/* ── Add / Edit Worker Modal ────────────────────────── */}
      {workerModal !== null && (
        <WorkerModal
          mode={workerModal}
          workers={workers}
          presses={presses}
          onClose={() => setWorkerModal(null)}
          onSaved={async () => { await refresh(); setWorkerModal(null); }}
        />
      )}

      {/* ── Add / Edit Press Modal ─────────────────────────── */}
      {pressModal && (
        <PressEditModal
          press={pressModal === 'add' ? null : pressModal}
          presses={presses}
          onClose={() => setPressModal(null)}
          onSaved={async () => { await refresh(); setPressModal(null); }}
        />
      )}

      {/* ── Delete Press confirmation ──────────────────────── */}
      {pressDelConfirm && (
        <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4px] w-full max-w-[360px] shadow-xl">
            <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[#111]">Remove Press</div>
              <button type="button" title="Close" aria-label="Close" onClick={() => setPressDelConfirm(null)} className="text-[#555] hover:text-[#111]"><X size={16} /></button>
            </div>
            <div className="px-4 py-4 text-[12px] text-[#333]">
              Remove <strong className="text-[#111]">{pressDelConfirm.name}</strong> ({pressDelConfirm.tonnage}T) from the press master?
              This cannot be undone.
            </div>
            <div className="px-4 py-3 border-t border-[#E4E5E6] flex justify-end gap-2">
              <button type="button" onClick={() => setPressDelConfirm(null)}
                className="px-[11px] py-[5px] text-[11px] font-medium border border-[#E4E5E6] rounded-[3px] text-[#333] bg-white hover:bg-[#F5F6F7]">
                Cancel
              </button>
              <button type="button"
                onClick={async () => {
                  try { await deletePress(pressDelConfirm.id); await refresh(); }
                  catch (e: any) { alert(e?.message || 'Delete failed.'); }
                  setPressDelConfirm(null);
                }}
                className="px-[11px] py-[5px] text-[11px] font-medium bg-[#BB0000] text-white rounded-[3px] hover:bg-[#8E0000]">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────── */}
      {delConfirm && (
        <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4px] w-full max-w-[360px] shadow-xl">
            <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[#111]">Remove Worker</div>
              <button type="button" title="Close" aria-label="Close" onClick={() => setDelConfirm(null)} className="text-[#555] hover:text-[#111]"><X size={16} /></button>
            </div>
            <div className="px-4 py-4 text-[12px] text-[#333]">
              Remove <strong className="text-[#111]">{delConfirm.name}</strong> ({delConfirm.role}) from the roster?
              This cannot be undone.
            </div>
            <div className="px-4 py-3 border-t border-[#E4E5E6] flex justify-end gap-2">
              <button type="button" onClick={() => setDelConfirm(null)}
                className="px-[11px] py-[5px] text-[11px] font-medium border border-[#E4E5E6] rounded-[3px] text-[#333] bg-white hover:bg-[#F5F6F7]">
                Cancel
              </button>
              <button type="button"
                onClick={async () => { await deleteWorker(delConfirm.id); await refresh(); setDelConfirm(null); }}
                className="px-[11px] py-[5px] text-[11px] font-medium bg-[#BB0000] text-white rounded-[3px] hover:bg-[#8E0000]">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dept Column ─────────────────────────────────────────────────────────────

function DeptColumn({ emoji, label, accent, workers, busyWorker, loading, onToggle, onEdit, onDelete, onAdd }: {
  emoji: string; label: string; accent: string;
  workers: Worker[]; busyWorker: string | null; loading: boolean;
  onToggle: (id: string, v: boolean) => void;
  onEdit: (w: Worker) => void;
  onDelete: (w: Worker) => void;
  onAdd: () => void;
}) {
  const here = workers.filter(w => w.present).length;
  const out  = workers.length - here;
  return (
    <div>
      <div className="px-3 py-2 bg-[#FAFAFA] border-b border-[#F3F3F3] flex items-center gap-2">
        <span className={`text-[11px] font-bold ${accent}`}>{emoji} {label}</span>
        <span className="text-[10px] text-[#555]">{here} present · {out} absent of {workers.length}</span>
        <button type="button" onClick={onAdd}
          className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#0A6ED1] border border-[#0A6ED1] rounded-[3px] px-2 py-0.5 hover:bg-[#E8F0FD] transition-colors">
          <Plus size={10} /> Add
        </button>
      </div>
      <div>
        {workers.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-[#555] italic">No workers added yet.</div>
        )}
        {workers.map(w => (
          <div key={w.id} className={`flex items-center gap-3 px-3 py-2 border-b border-[#F3F3F3] last:border-b-0 ${w.present ? 'bg-[#F1F8E9]' : 'bg-[#FFF5F5]'}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${w.present ? 'bg-[#107E3E]' : 'bg-[#BB0000]'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-[#111] truncate">{w.name}</div>
              <div className="text-[10px] text-[#555]">{w.role}</div>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={w.present}
                disabled={busyWorker === w.id || loading}
                onChange={() => onToggle(w.id, !w.present)}
                className="w-3.5 h-3.5 accent-[#107E3E] cursor-pointer disabled:opacity-50" />
              <span className={`text-[11px] font-medium ${w.present ? 'text-[#107E3E]' : 'text-[#BB0000]'}`}>
                {w.present ? 'Present' : 'Absent'}
              </span>
            </label>
            <button type="button" onClick={() => onEdit(w)} className="text-[10px] text-[#555] hover:text-[#0A6ED1] px-1" title="Edit">✎</button>
            <button type="button" onClick={() => onDelete(w)} className="text-[10px] text-[#555] hover:text-[#BB0000] px-1" title="Remove"><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shift Group (for Press Operators) ───────────────────────────────────────

function ShiftGroup({ label, icon, workers, busyWorker, loading, onToggle, onEdit, onDelete, presses }: {
  label: string; icon: React.ReactNode;
  workers: Worker[]; busyWorker: string | null; loading: boolean;
  presses: Press[];
  onToggle: (id: string, v: boolean) => void;
  onEdit: (w: Worker) => void;
  onDelete: (w: Worker) => void;
}) {
  const pressMap = new Map(presses.map(p => [p.id, p.name]));
  return (
    <div>
      <div className="px-3 py-1.5 bg-[#F7F7F7] border-b border-[#F3F3F3] flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555]">{label}</span>
        <span className="text-[10px] text-[#888]">· {workers.filter(w => w.present).length}/{workers.length} present</span>
      </div>
      {workers.length === 0 && (
        <div className="px-3 py-3 text-center text-[10.5px] text-[#888] italic">None assigned</div>
      )}
      {workers.map(w => (
        <div key={w.id} className={`flex items-center gap-2 px-3 py-2 border-b border-[#F3F3F3] last:border-b-0 ${w.present ? 'bg-[#FFF8F0]' : 'bg-[#FFF5F5]'}`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${w.present ? 'bg-[#107E3E]' : 'bg-[#BB0000]'}`} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-[#111] truncate">{w.name}</div>
            <div className="text-[10px] text-[#555] flex items-center gap-2">
              <span>{w.role}</span>
              {w.press_id && (
                <span className="bg-[#FFF3E0] text-[#E9730C] px-1 rounded text-[9.5px] font-medium">
                  {pressMap.get(w.press_id) ?? w.press_id}
                </span>
              )}
            </div>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={w.present}
              disabled={busyWorker === w.id || loading}
              onChange={() => onToggle(w.id, !w.present)}
              className="w-3.5 h-3.5 accent-[#107E3E] cursor-pointer disabled:opacity-50" />
            <span className={`text-[11px] font-medium ${w.present ? 'text-[#107E3E]' : 'text-[#BB0000]'}`}>
              {w.present ? 'Present' : 'Absent'}
            </span>
          </label>
          <button type="button" onClick={() => onEdit(w)} className="text-[10px] text-[#555] hover:text-[#0A6ED1] px-1" title="Edit">✎</button>
          <button type="button" onClick={() => onDelete(w)} className="text-[10px] text-[#555] hover:text-[#BB0000] px-1" title="Remove"><Trash2 size={11} /></button>
        </div>
      ))}
    </div>
  );
}

// ── Worker Add/Edit Modal ───────────────────────────────────────────────────

function WorkerModal({ mode, workers, presses, onClose, onSaved }: {
  mode: ModalMode;
  workers: Worker[];
  presses: Press[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit   = typeof mode === 'object' && 'edit' in mode;
  const editW    = isEdit ? (mode as { edit: Worker }).edit : null;
  const defaultDept = isEdit
    ? editW!.department
    : mode === 'add-finishing' ? 'finishing'
    : mode === 'add-inspection' ? 'inspection'
    : 'press';

  const [name,    setName]    = useState(editW?.name ?? '');
  const [dept,    setDept]    = useState<'finishing' | 'inspection' | 'press'>(defaultDept);
  const [role,    setRole]    = useState(editW?.role ?? defaultRoles(defaultDept)[1]);
  const [shift,   setShift]   = useState<'day' | 'night' | 'both'>(
    editW?.shift === 'night' ? 'night' : editW?.shift === 'both' ? 'both' : 'day'
  );
  const [pressId, setPressId] = useState(editW?.press_id ?? '');
  const [saving,  setSaving]  = useState(false);

  const roles = defaultRoles(dept);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && editW) {
        await updateWorker(editW.id, {
          name: name.trim(), role, department: dept,
          shift:    dept === 'press' ? shift as 'day' | 'night' | 'both' : null,
          press_id: dept === 'press' ? (pressId || null) : null,
        });
      } else {
        const prefix = dept === 'finishing' ? 'F' : dept === 'inspection' ? 'I' : 'P';
        const existing = workers.filter(w => w.id.startsWith(prefix));
        const nums = existing.map(w => parseInt(w.id.replace(prefix, ''), 10) || 0);
        const newId = `${prefix}${(Math.max(0, ...nums) + 1).toString().padStart(2, '0')}`;
        await insertWorker({
          id: newId, name: name.trim(), role, department: dept, present: true,
          shift:    dept === 'press' ? shift as 'day' | 'night' | 'both' : null,
          press_id: dept === 'press' ? (pressId || null) : null,
        });
      }
      await onSaved();
    } catch (e: any) {
      alert(e?.message || 'Save failed.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[440px] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[#111]">
            {isEdit ? 'Edit Worker' : 'Add Worker'}
          </div>
          <button type="button" title="Close" aria-label="Close" onClick={onClose} className="text-[#555] hover:text-[#111]"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <WField label="Name *">
            <input className={winp} value={name} autoFocus
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="e.g. Ramesh K." title="Worker name" />
          </WField>
          <WField label="Department">
            <select className={winp} value={dept}
              onChange={e => {
                const d = e.target.value as 'finishing' | 'inspection' | 'press';
                setDept(d);
                setRole(defaultRoles(d)[1]);
              }} title="Department">
              <option value="finishing">Finishing</option>
              <option value="inspection">Inspection</option>
              <option value="press">Press Operator</option>
            </select>
          </WField>
          <WField label="Role">
            <select className={winp} value={role} onChange={e => setRole(e.target.value)} title="Role">
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </WField>
          {dept === 'press' && (
            <>
              <WField label="Shift">
                <div className="flex gap-1.5">
                  {(['day', 'night', 'both'] as const).map(s => {
                    const isActive = shift === s;
                    const cls = isActive
                      ? s === 'day'   ? 'bg-[#FFF3E0] border-[#E9730C] text-[#E9730C] font-medium'
                      : s === 'night' ? 'bg-[#E8E8E8] border-[#555] text-[#333] font-medium'
                                      : 'bg-[#E8F0FD] border-[#0A6ED1] text-[#0A6ED1] font-medium'
                      : 'bg-white border-[#E4E5E6] text-[#555] hover:bg-[#FAFAFA]';
                    return (
                      <button key={s} type="button" onClick={() => setShift(s)}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] border rounded-[3px] transition-colors ${cls}`}>
                        {s === 'day' && <><Sun size={10} /> Day</>}
                        {s === 'night' && <><Moon size={10} /> Night</>}
                        {s === 'both' && <>☀🌙 Both</>}
                      </button>
                    );
                  })}
                </div>
              </WField>
              <WField label="Assigned Press">
                <select className={winp} value={pressId} onChange={e => setPressId(e.target.value)} title="Assigned press">
                  <option value="">— Not assigned —</option>
                  {presses.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tonnage}T)</option>)}
                </select>
              </WField>
            </>
          )}
        </div>
        <div className="px-4 py-3 border-t border-[#E4E5E6] flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-[11px] py-[5px] text-[11px] font-medium border border-[#E4E5E6] rounded-[3px] text-[#333] bg-white hover:bg-[#F5F6F7]">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!name.trim() || saving}
            className="inline-flex items-center gap-1 px-[11px] py-[5px] text-[11px] font-medium bg-[#0A6ED1] text-white rounded-[3px] hover:bg-[#085EA8] disabled:opacity-40">
            <Check size={12} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Worker'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Press Edit Modal ─────────────────────────────────────────────────────────

function PressEditModal({ press, presses, onClose, onSaved }: {
  press: Press | null;            // null = add new press
  presses: Press[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isEdit = press !== null;
  const [name,    setName]    = useState(press?.name ?? '');
  const [tonnage, setTonnage] = useState(press?.tonnage ?? '');
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    if (!name.trim() || !tonnage.trim()) return;
    setSaving(true);
    try {
      if (isEdit && press) {
        await updatePress(press.id, { name: name.trim(), tonnage: tonnage.trim() });
      } else {
        const nums = presses.map(p => parseInt(p.id.replace(/^P/i, ''), 10) || 0);
        const newId = `P${Math.max(0, ...nums) + 1}`;
        await insertPress({ id: newId, name: name.trim(), tonnage: tonnage.trim(), status: 'idle' });
      }
      await onSaved();
    } catch (e: any) {
      alert(e?.message || 'Save failed.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[380px] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[#111]">
            {isEdit ? `Edit Press — ${press!.id}` : 'Add Press'}
          </div>
          <button type="button" title="Close" aria-label="Close" onClick={onClose} className="text-[#555] hover:text-[#111]"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <WField label="Press Name *">
            <input className={winp} value={name} autoFocus
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="e.g. Press 5" title="Press name" />
          </WField>
          <WField label="Tonnage *">
            <input className={winp} value={tonnage}
              onChange={e => setTonnage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="e.g. 100T" title="Tonnage" />
          </WField>
          {isEdit && (
            <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2 text-[11px] text-[#555]">
              Status: <strong className="text-[#111]">{press!.status}</strong>
              {press!.active_job_id && <> · Active job: <strong className="text-[#0A6ED1]">{press!.active_job_id}</strong></>}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-[#E4E5E6] flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-[11px] py-[5px] text-[11px] font-medium border border-[#E4E5E6] rounded-[3px] text-[#333] bg-white hover:bg-[#F5F6F7]">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!name.trim() || !tonnage.trim() || saving}
            className="inline-flex items-center gap-1 px-[11px] py-[5px] text-[11px] font-medium bg-[#0A6ED1] text-white rounded-[3px] hover:bg-[#085EA8] disabled:opacity-40">
            <Check size={12} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Press'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Master Lists (editable dropdown options) ─────────────────────────────────

const OPTION_FIELDS: { field: ProdOptionField; label: string; hasUnit?: boolean }[] = [
  { field: 'type',          label: 'Type' },
  { field: 'moc',           label: 'MOC' },
  { field: 'item_category', label: 'Item Category', hasUnit: true },
  { field: 'make',          label: 'Make' },
  { field: 'colour_code',   label: 'Colour Code' },
];

function MasterListsSection({ options, unitChoices, onChanged }: {
  options: ProdOption[];
  unitChoices: string[];
  onChanged: () => Promise<void> | void;
}) {
  const [active, setActive] = useState<ProdOptionField>('item_category');
  const [newValue, setNewValue] = useState('');
  const [newUnit, setNewUnit]   = useState(unitChoices[0] || '');
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<ProdOption | null>(null);

  const cfg = OPTION_FIELDS.find(f => f.field === active)!;
  const rows = options.filter(o => o.field === active);

  const add = async () => {
    const v = newValue.trim();
    if (!v) return;
    setBusy(true);
    try {
      await insertOption({ field: active, value: v, meta: cfg.hasUnit ? { unit: newUnit } : null });
      setNewValue('');
      await onChanged();
    } catch (e: any) {
      alert(e?.code === '23505' ? `"${v}" already exists in ${cfg.label}.` : (e?.message || 'Add failed.'));
    } finally { setBusy(false); }
  };

  const remap = async (o: ProdOption, unit: string) => {
    await updateOption(o.id, { meta: { unit } });
    await onChanged();
  };

  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden">
      {/* Field tabs */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-[#E4E5E6] bg-[#FAFAFA]">
        {OPTION_FIELDS.map(f => (
          <button key={f.field} type="button" onClick={() => setActive(f.field)}
            className={`px-2.5 py-1 text-[11px] rounded-[3px] border transition-colors ${
              active === f.field
                ? 'bg-[#E8F0FD] border-[#0A6ED1] text-[#0A6ED1] font-medium'
                : 'bg-white border-[#E4E5E6] text-[#555] hover:bg-[#F5F6F7]'
            }`}>
            {f.label}
            <span className="ml-1.5 text-[10px] text-[#888]">{options.filter(o => o.field === f.field).length}</span>
          </button>
        ))}
      </div>

      {/* Add row */}
      <div className="flex items-end gap-2 px-3 py-2.5 border-b border-[#F3F3F3] flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">New {cfg.label}</label>
          <input className={winp} value={newValue} onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder={`Add a ${cfg.label.toLowerCase()}…`} title={`New ${cfg.label}`} />
        </div>
        {cfg.hasUnit && (
          <div className="w-[130px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">Workshop Unit</label>
            <select className={winp} value={newUnit} onChange={e => setNewUnit(e.target.value)} title="Workshop unit">
              {unitChoices.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
        <button type="button" onClick={add} disabled={!newValue.trim() || busy}
          className="inline-flex items-center gap-1 px-[11px] py-[7px] text-[11px] font-medium bg-[#0A6ED1] text-white rounded-[3px] hover:bg-[#085EA8] disabled:opacity-40">
          <Plus size={12} /> Add
        </button>
      </div>

      {/* Value list */}
      <div className="divide-y divide-[#F3F3F3] max-h-[320px] overflow-y-auto">
        {rows.length === 0 && (
          <div className="px-4 py-6 text-center text-[11px] text-[#555] italic">No {cfg.label.toLowerCase()} values yet.</div>
        )}
        {rows.map(o => (
          <div key={o.id} className="flex items-center gap-3 px-4 py-2">
            <span className="text-[12px] text-[#111] flex-1 truncate">{o.value}</span>
            {cfg.hasUnit && (
              <select
                className="font-sans text-[11px] text-[#111] bg-white border border-[#E4E5E6] rounded-[3px] px-2 py-1 outline-none focus:border-[#0A6ED1]"
                value={o.meta?.unit || ''}
                onChange={e => remap(o, e.target.value)}
                title="Workshop unit for this category"
              >
                <option value="">— No unit —</option>
                {unitChoices.map(u => <option key={u} value={u}>{u}</option>)}
                {o.meta?.unit && !unitChoices.includes(o.meta.unit) && <option value={o.meta.unit}>{o.meta.unit}</option>}
              </select>
            )}
            <button type="button" onClick={() => setDelTarget(o)} title="Remove"
              className="text-[#555] hover:text-[#BB0000] p-1 transition-colors"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      {delTarget && (
        <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={() => setDelTarget(null)}>
          <div className="bg-white rounded-[4px] w-full max-w-[360px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[#111]">Remove Option</div>
              <button type="button" title="Close" aria-label="Close" onClick={() => setDelTarget(null)} className="text-[#555] hover:text-[#111]"><X size={16} /></button>
            </div>
            <div className="px-4 py-4 text-[12px] text-[#333]">
              Remove <strong className="text-[#111]">{delTarget.value}</strong> from {cfg.label}?
              Existing products keep their value; it just won't appear in the dropdown.
            </div>
            <div className="px-4 py-3 border-t border-[#E4E5E6] flex justify-end gap-2">
              <button type="button" onClick={() => setDelTarget(null)}
                className="px-[11px] py-[5px] text-[11px] font-medium border border-[#E4E5E6] rounded-[3px] text-[#333] bg-white hover:bg-[#F5F6F7]">
                Cancel
              </button>
              <button type="button"
                onClick={async () => { try { await deleteOption(delTarget.id); await onChanged(); } catch (e: any) { alert(e?.message || 'Delete failed.'); } setDelTarget(null); }}
                className="px-[11px] py-[5px] text-[11px] font-medium bg-[#BB0000] text-white rounded-[3px] hover:bg-[#8E0000]">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultRoles(dept: string): string[] {
  if (dept === 'finishing')  return ROLES_FINISHING;
  if (dept === 'inspection') return ROLES_INSPECTION;
  return ROLES_PRESS;
}

function ConfigInput({ label, value, step, min, max, onChange }: {
  label: string; value: number; step?: number; min?: number; max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5 bg-[#F7F7F7] border border-[#E4E5E6] rounded-[3px] px-2 py-1 text-[11px] text-[#333]">
      {label}:
      <input type="number" step={step} min={min} max={max} value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-[46px] font-mono text-[11px] text-[#111] border border-[#E4E5E6] rounded-[2px] px-1 py-0.5 outline-none focus:border-[#0A6ED1] text-center bg-white"
        title={label} />
      hrs
    </span>
  );
}

const inp  = 'w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]';
const winp = 'w-full font-sans text-[12px] text-[#111] bg-white border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]';

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[#555]">{icon}</span>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#333]">{title}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#555] mb-1">{label}</label>
      {children}
    </div>
  );
}

function WField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[#555] mb-1">{label}</label>
      {children}
    </div>
  );
}

function Loading() {
  return <div className="bg-white border border-[#E4E5E6] rounded-[3px] p-8 text-center text-[12px] text-[#555]">Loading…</div>;
}
