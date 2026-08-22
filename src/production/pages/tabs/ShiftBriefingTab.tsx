// Shift Briefing — worker attendance + live OTD impact table.
// Ports MRT_ERP_Phase1_2_v2.html renderShiftBriefing() (line 3877+).

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sunrise, Users, CheckCircle2, XCircle, AlertTriangle, Sun, Moon } from 'lucide-react';
import type { ProductionData } from '../../lib/useProductionData';
import { getOTDImpactSummary, getJobImpact } from '../../lib/otdImpact';
import { toggleWorkerPresence } from '../../lib/actions';
import { updateShopFloorSettings } from '../../lib/db';
import { productIdentity } from '../../lib/productLabel';
import { fmtIST, fmtDate } from '../../../lib/utils';

export function ShiftBriefingTab({ data }: { data: ProductionData }) {
  const { workers, jobs, settings, refresh } = data;
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingHrs, setSavingHrs] = useState(false);

  // Local state for editable shift config — seeds from DB settings
  const [shiftLeft, setShiftLeft] = useState<string>(
    settings ? String(settings.shift_hours_left ?? 8) : '8'
  );
  const [otBudget, setOtBudget] = useState<string>(
    settings ? String(settings.overtime_max ?? 2) : '2'
  );

  const present = {
    finishing:  workers.filter(w => w.department === 'finishing'  && w.present).length,
    inspection: workers.filter(w => w.department === 'inspection' && w.present).length,
    pressDay:   workers.filter(w => w.department === 'press' && (w.shift === 'day' || w.shift === 'both' || !w.shift) && w.present).length,
    pressNight: workers.filter(w => w.department === 'press' && (w.shift === 'night' || w.shift === 'both') && w.present).length,
  };
  const totalF = workers.filter(w => w.department === 'finishing').length;
  const totalI = workers.filter(w => w.department === 'inspection').length;
  const totalPressDay   = workers.filter(w => w.department === 'press' && (w.shift === 'day' || w.shift === 'both' || !w.shift)).length;
  const totalPressNight = workers.filter(w => w.department === 'press' && (w.shift === 'night' || w.shift === 'both')).length;

  const hc = {
    finishers:  Math.max(1, present.finishing),
    inspectors: Math.max(1, present.inspection),
  };

  const { safe, atrisk, breach } = getOTDImpactSummary(jobs, hc);

  // Full per-job impact list for the OTD table
  const impactRows = useMemo(() => {
    return jobs
      .filter(j => ['moulding', 'finishing', 'inspection', 'pdi'].includes(j.stage))
      .map(j => ({ job: j, impact: getJobImpact(j, hc) }))
      .sort((a, b) => {
        // breach → atrisk → safe, then by promised date
        const r = { breach: 0, atrisk: 1, safe: 2 } as const;
        const rd = r[a.impact.risk] - r[b.impact.risk];
        if (rd !== 0) return rd;
        return (a.job.promised_date || '').localeCompare(b.job.promised_date || '');
      });
  }, [jobs, hc.finishers, hc.inspectors]);

  const toggle = async (id: string, next: boolean) => {
    setBusyId(id);
    try { await toggleWorkerPresence(id, next); await refresh(); }
    finally { setBusyId(null); }
  };

  const saveSettings = async () => {
    setSavingHrs(true);
    try {
      await updateShopFloorSettings({
        shift_hours_left: parseFloat(shiftLeft) || 8,
        overtime_max: parseFloat(otBudget) || 2,
      });
      await refresh();
    } finally { setSavingHrs(false); }
  };

  const today = fmtIST(new Date(), 'dd-MMM-yyyy');

  return (
    <div className="space-y-3">
      {/* Header banner */}
      <div className="bg-[#FFF8EC] border border-[#FFE0B2] rounded-[3px] p-3 flex items-center gap-3">
        <Sunrise size={18} className="text-[#E9730C] flex-shrink-0" />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-[#111]">Shift Briefing — start of day</div>
          <div className="text-[11px] text-[#333]">Toggle worker attendance. OTD projections update instantly.</div>
        </div>
        <div className="text-[11px] text-[#111] font-mono text-right">
          {today}
        </div>
      </div>

      {/* 6 summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
        <SummaryCard value={present.finishing}  label="Finishers"
          sub={present.finishing === totalF ? '✓ Full strength' : `${totalF - present.finishing} absent`}
          accentClass="border-t-[#0A6ED1]" subClass={present.finishing === totalF ? 'text-[#107E3E]' : 'text-[#E9730C]'} />
        <SummaryCard value={present.inspection} label="Inspectors"
          sub={present.inspection === totalI ? '✓ Full strength' : `${totalI - present.inspection} absent`}
          accentClass="border-t-[#107E3E]" subClass={present.inspection === totalI ? 'text-[#107E3E]' : 'text-[#E9730C]'} />
        <SummaryCard value={present.pressDay}   label="Press Ops · Day"
          sub={present.pressDay === totalPressDay ? '✓ Full strength' : `${totalPressDay - present.pressDay} absent`}
          accentClass="border-t-[#E9730C]" subClass={present.pressDay === totalPressDay ? 'text-[#107E3E]' : 'text-[#E9730C]'}
          icon={<Sun size={12} className="text-[#E9730C]" />} />
        <SummaryCard value={present.pressNight} label="Press Ops · Night"
          sub={present.pressNight === totalPressNight ? '✓ Full strength' : `${totalPressNight - present.pressNight} absent`}
          accentClass="border-t-[#555]" subClass={present.pressNight === totalPressNight ? 'text-[#107E3E]' : 'text-[#E9730C]'}
          icon={<Moon size={12} className="text-[#555]" />} />
        <SummaryCard value={safe}           label="Jobs On Track"
          sub="Will meet promised date" accentClass="border-t-[#107E3E]" subClass="text-[#107E3E]" />
        <SummaryCard value={atrisk + breach} label="At Risk / Breach"
          sub={breach > 0 ? `${breach} breach · ${atrisk} at risk` : atrisk > 0 ? `${atrisk} at risk` : 'All on track'}
          accentClass={breach > 0 ? 'border-t-[#BB0000]' : atrisk > 0 ? 'border-t-[#E9730C]' : 'border-t-[#107E3E]'}
          subClass={breach > 0 ? 'text-[#BB0000]' : atrisk > 0 ? 'text-[#E9730C]' : 'text-[#107E3E]'}
          icon={atrisk + breach > 0 ? <AlertTriangle size={13} /> : undefined} />
      </div>

      {/* Worker rosters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Roster dept="finishing"  label="✂ Finishing"      accentColor="border-t-[#0A6ED1]" workers={workers} busyId={busyId} onToggle={toggle} />
        <Roster dept="inspection" label="🔍 Inspection"     accentColor="border-t-[#107E3E]" workers={workers} busyId={busyId} onToggle={toggle} />
        <PressRoster workers={workers} busyId={busyId} onToggle={toggle} />
      </div>

      {/* Shift config row */}
      <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2.5 flex flex-wrap items-center gap-4 text-[12px] text-[#111]">
        <span className="text-[#333]"><strong className="text-[#111]">{present.finishing}</strong> finishers on floor</span>
        <span className="text-[#333]"><strong className="text-[#111]">{present.inspection}</strong> inspectors on floor</span>
        <span className="flex items-center gap-1.5 text-[#333]">
          Shift hrs left:
          <input
            type="number" step="0.5" min="0" max="12"
            value={shiftLeft}
            onChange={e => setShiftLeft(e.target.value)}
            onBlur={saveSettings}
            className="w-[52px] font-mono text-[11px] text-[#111] border border-[#E4E5E6] rounded-[3px] px-1.5 py-0.5 outline-none focus:border-[#0A6ED1] text-center"
            title="Shift hours left"
          />
          <span>hrs</span>
        </span>
        <span className="flex items-center gap-1.5 text-[#333]">
          OT authorised:
          <input
            type="number" step="0.5" min="0" max="4"
            value={otBudget}
            onChange={e => setOtBudget(e.target.value)}
            onBlur={saveSettings}
            className="w-[52px] font-mono text-[11px] text-[#111] border border-[#E4E5E6] rounded-[3px] px-1.5 py-0.5 outline-none focus:border-[#0A6ED1] text-center"
            title="OT authorised (hours)"
          />
          <span>hrs</span>
        </span>
        {savingHrs && <span className="text-[10px] text-[#333]">Saving…</span>}
      </div>

      {/* OTD Impact table */}
      <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden">
        <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
          <div className="text-[12px] font-semibold text-[#111] flex-1">OTD Impact — Today's WIP</div>
          <div className="text-[10px] text-[#333]">Recalculates when attendance or hours change · click row to jump to that stage</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px] text-[#111]">
            <thead className="bg-[#FAFAFA]">
              <tr>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Job</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Product</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Customer</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Stage</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Qty</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Rem. TAT</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Proj. End</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Promised</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Buffer</th>
                <th className="text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px] px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]">Risk &amp; Action</th>
              </tr>
            </thead>
            <tbody>
              {impactRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-5 text-[#333] italic">No active jobs.</td>
                </tr>
              ) : impactRows.map(({ job, impact }) => {
                const stageTab = job.stage === 'moulding' ? 'mould' : job.stage === 'finishing' ? 'finish' : job.stage === 'inspection' ? 'insp' : job.stage === 'pdi' ? 'pdi' : 'mould';
                const bufferOk = impact.bufferHrs >= 0;
                const otBudgetNum = parseFloat(otBudget) || 2;
                const riskLabel = impact.risk === 'breach'
                  ? `🔴 OTD Breach`
                  : impact.risk === 'atrisk'
                  ? '🟡 At Risk'
                  : '✓ Safe';
                const actionNote = impact.risk !== 'safe'
                  ? (impact.otHrs > otBudgetNum
                    ? `✗ Needs +${impact.otHrs.toFixed(1)}h OT — exceeds ${otBudgetNum}h budget. Escalate.`
                    : `⚠ Needs +${impact.otHrs.toFixed(1)}h OT — within budget.`)
                  : null;

                return (
                  <tr
                    key={job.id}
                    onClick={() => navigate(`/production/sequencer/${stageTab}`)}
                    className="border-b border-[#F3F3F3] last:border-b-0 cursor-pointer hover:bg-[#EEF4FF]"
                  >
                    <td className="px-[10px] py-[7px] whitespace-nowrap">
                      <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">
                        {job.priority === 'emergency' && <span className="text-[#BB0000] mr-0.5">🔴 EMERGENCY</span>}
                        {job.id}
                      </span>
                    </td>
                    <td className="px-[10px] py-[7px] font-semibold text-[#111] whitespace-nowrap">{productIdentity(job)}</td>
                    <td className="px-[10px] py-[7px] text-[#333] whitespace-nowrap">{job.customer_name || '—'}</td>
                    <td className="px-[10px] py-[7px] whitespace-nowrap">
                      <span className={[
                        'inline-block text-[10px] font-medium px-[7px] py-[2px] rounded-[2px] capitalize',
                        job.stage === 'moulding'   ? 'bg-[#FFF3E0] text-[#E9730C]' :
                        job.stage === 'finishing'  ? 'bg-[#E8F0FD] text-[#0A6ED1]' :
                        job.stage === 'inspection' ? 'bg-[#FFF3E0] text-[#E9730C]' :
                        job.stage === 'pdi'        ? 'bg-[#E8F0FD] text-[#0A6ED1]' :
                        'bg-[#F5F6F7] text-[#333]'
                      ].join(' ')}>
                        {job.stage}
                      </span>
                    </td>
                    <td className="px-[10px] py-[7px] font-mono text-[11px] whitespace-nowrap">
                      {job.qty.toLocaleString()} pcs · {(job.qty_done || 0)} done
                    </td>
                    <td className="px-[10px] py-[7px] font-mono text-[11px] whitespace-nowrap">{fmtHrs(impact.remHrs)}</td>
                    <td className="px-[10px] py-[7px] font-mono text-[11px] whitespace-nowrap text-[#333]">
                      {fmtIST(impact.projEnd, 'hh:mm aa, dd MMM')}
                    </td>
                    <td className="px-[10px] py-[7px] font-mono text-[11px] whitespace-nowrap text-[#333]">
                      {fmtDate(job.promised_date)}
                    </td>
                    <td className={[
                      'px-[10px] py-[7px] font-mono text-[11px] font-semibold whitespace-nowrap',
                      bufferOk ? 'text-[#107E3E]' : 'text-[#BB0000]',
                    ].join(' ')}>
                      {bufferOk ? '+' : ''}{impact.bufferHrs.toFixed(1)}h {bufferOk ? 'buffer' : 'overrun'}
                    </td>
                    <td className="px-[10px] py-[7px] whitespace-nowrap">
                      <div className={[
                        'text-[11px] font-semibold',
                        impact.risk === 'breach' ? 'text-[#BB0000]' :
                        impact.risk === 'atrisk' ? 'text-[#E9730C]' : 'text-[#107E3E]',
                      ].join(' ')}>
                        {riskLabel}
                      </div>
                      {actionNote && (
                        <div className="text-[10px] text-[#333] mt-0.5">{actionNote}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({ value, label, sub, accentClass, subClass, icon }: {
  value: number; label: string; sub: string;
  accentClass: string; subClass: string; icon?: React.ReactNode;
}) {
  return (
    <div className={`bg-white border border-[#E4E5E6] border-t-[3px] rounded-[3px] px-[14px] py-3 ${accentClass}`}>
      <div className="text-[26px] font-light leading-none text-[#111] flex items-center gap-1.5">
        {icon}{value}
      </div>
      <div className="text-[10px] text-[#333] mt-[3px]">{label}</div>
      <div className={`text-[10px] mt-[5px] ${subClass}`}>{sub}</div>
    </div>
  );
}

function Roster({
  dept, label, accentColor, workers, busyId, onToggle,
}: {
  dept: 'finishing' | 'inspection';
  label: string;
  accentColor: string;
  workers: ProductionData['workers'];
  busyId: string | null;
  onToggle: (id: string, next: boolean) => void;
}) {
  const list = workers.filter(w => w.department === dept);
  const here = list.filter(w => w.present).length;
  const out  = list.length - here;
  return (
    <div className={`bg-white border border-[#E4E5E6] border-t-[3px] rounded-[3px] ${accentColor}`}>
      <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
        <Users size={13} className="text-[#333]" />
        <div className="text-[12px] font-semibold text-[#111] flex-1">
          {label}
          <span className="ml-2 text-[10px] font-normal text-[#333]">
            {here} present · {out} absent of {list.length}
          </span>
        </div>
        <span className="text-[10.5px] text-[#107E3E] flex items-center gap-0.5">
          <CheckCircle2 size={10} />{here}
        </span>
        <span className="text-[10.5px] text-[#BB0000] flex items-center gap-0.5 ml-1">
          <XCircle size={10} />{out}
        </span>
      </div>
      <div className="divide-y divide-[#F3F3F3]">
        {list.map(w => (
          <div key={w.id} className={`px-3 py-2 flex items-center gap-3 ${!w.present ? 'bg-[#FFF1F0]' : ''}`}>
            <div className="flex-1">
              <div className="text-[12px] font-medium text-[#111]">{w.name}</div>
              <div className="text-[10px] text-[#333]">{w.role}</div>
            </div>
            <button
              type="button"
              disabled={busyId === w.id}
              onClick={() => onToggle(w.id, !w.present)}
              className={[
                'px-[9px] py-[3px] text-[11px] rounded-[3px] border transition-colors disabled:opacity-50',
                w.present
                  ? 'bg-[#E8F5E9] border-[#107E3E]/40 text-[#107E3E] hover:bg-[#C5E1A5]/40'
                  : 'bg-[#F5F6F7] border-[#E4E5E6] text-[#333] hover:bg-[#EBEBEB]',
              ].join(' ')}
            >
              {w.present ? 'Present ✓' : 'Absent'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PressRoster({ workers, busyId, onToggle }: {
  workers: ProductionData['workers'];
  busyId: string | null;
  onToggle: (id: string, next: boolean) => void;
}) {
  const dayList   = workers.filter(w => w.department === 'press' && (w.shift === 'day' || w.shift === 'both' || !w.shift));
  const nightList = workers.filter(w => w.department === 'press' && (w.shift === 'night' || w.shift === 'both'));
  const hereDay   = dayList.filter(w => w.present).length;
  const hereNight = nightList.filter(w => w.present).length;

  const renderList = (list: typeof workers, shift: 'day' | 'night') => (
    <>
      <div className="px-3 py-1 bg-[#F7F7F7] border-b border-[#F3F3F3] flex items-center gap-1.5">
        {shift === 'day'
          ? <><Sun size={9} className="text-[#E9730C]" /><span className="text-[9.5px] font-semibold uppercase tracking-wider text-[#555]">Day</span></>
          : <><Moon size={9} className="text-[#555]" /><span className="text-[9.5px] font-semibold uppercase tracking-wider text-[#555]">Night</span></>}
        <span className="text-[9.5px] text-[#888] ml-1">· {list.filter(w => w.present).length}/{list.length}</span>
      </div>
      {list.map(w => (
        <div key={w.id} className={`px-3 py-2 flex items-center gap-3 border-b border-[#F3F3F3] last:border-b-0 ${!w.present ? 'bg-[#FFF1F0]' : ''}`}>
          <div className="flex-1">
            <div className="text-[12px] font-medium text-[#111]">{w.name}</div>
            <div className="text-[10px] text-[#333]">
              {w.role}{w.press_id && <span className="ml-1 text-[#E9730C]">· {w.press_id}</span>}
            </div>
          </div>
          <button type="button" disabled={busyId === w.id}
            onClick={() => onToggle(w.id, !w.present)}
            className={['px-[9px] py-[3px] text-[11px] rounded-[3px] border transition-colors disabled:opacity-50',
              w.present
                ? 'bg-[#E8F5E9] border-[#107E3E]/40 text-[#107E3E] hover:bg-[#C5E1A5]/40'
                : 'bg-[#F5F6F7] border-[#E4E5E6] text-[#333] hover:bg-[#EBEBEB]',
            ].join(' ')}>
            {w.present ? 'Present ✓' : 'Absent'}
          </button>
        </div>
      ))}
    </>
  );

  return (
    <div className="bg-white border border-[#E4E5E6] border-t-[3px] border-t-[#E9730C] rounded-[3px]">
      <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
        <Users size={13} className="text-[#333]" />
        <div className="text-[12px] font-semibold text-[#111] flex-1">
          ⚙ Press Operators
          <span className="ml-2 text-[10px] font-normal text-[#333]">
            {hereDay + hereNight} of {dayList.length + nightList.length} present
          </span>
        </div>
      </div>
      <div className="divide-y divide-[#F3F3F3]">
        {dayList.length > 0 && renderList(dayList, 'day')}
        {nightList.length > 0 && renderList(nightList, 'night')}
        {dayList.length === 0 && nightList.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-[#888] text-center italic">No press operators added.</div>
        )}
      </div>
    </div>
  );
}

function fmtHrs(h: number) {
  if (!isFinite(h)) return '—';
  const abs = Math.abs(h);
  if (abs >= 24) return `${(h / 24).toFixed(1)}d`;
  return `${h.toFixed(1)} hrs`;
}
