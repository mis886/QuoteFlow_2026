// Production Dashboard — v2 design system (SAP blue/grey).

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus, Workflow, Factory, Clock, ArrowRight } from 'lucide-react';
import { useProductionData } from '../lib/useProductionData';
import { PressBoard } from '../components/PressBoard';
import { AssignPressModal } from '../components/AssignPressModal';
import { StageMilestoneTracker, type LogActuals } from '../components/StageMilestoneTracker';
import { TodaysDispatchTargets } from '../components/TodaysDispatchTargets';
import { OTDTrend } from '../components/OTDTrend';
import { SequencerBody, type SequencerTab } from '../components/SequencerBody';
import { assignJobsToPress, markPressDone } from '../lib/actions';
import { productIdentity } from '../lib/productLabel';
import {
  listMoldingSessions, listFinishingSessions, listInspectionSessions,
} from '../lib/db';
import { supabase } from '../../lib/supabase';
import type { MoldingSession, FinishingSession, InspectionSession, JobStageEvent } from '../lib/types';
import { fmtIST } from '../../lib/utils';

const STAGE_LABEL: Record<string, string> = {
  queued: 'Queued', moulding: 'Moulding', finishing: 'Finishing',
  inspection: 'Inspection', pdi: 'PDI', dispatch: 'Dispatch', dispatched: 'Dispatched',
};

const STAGE_COLOR: Record<string, string> = {
  queued:     'bg-[#E4E5E6] text-[#555]',
  moulding:   'bg-[#E8F0FD] text-[#0A6ED1]',
  finishing:  'bg-[#FFF3E0] text-[#E9730C]',
  inspection: 'bg-[#EDE7F6] text-[#6200EA]',
  pdi:        'bg-[#E8F5E9] text-[#107E3E]',
  dispatch:   'bg-[#E8F5E9] text-[#107E3E]',
  dispatched: 'bg-[#F0F0F0] text-[#555]',
};

export function ProductionDashboard() {
  const data = useProductionData();
  const { presses, jobs, products, settings, loading, refresh } = data;
  const [assigning, setAssigning] = useState<{ pressId: string | null } | null>(null);
  const [seqTab, setSeqTab] = useState<SequencerTab>('mould');

  // Log actuals for StageMilestoneTracker
  const [actuals, setActuals] = useState<LogActuals>({ molding: [], finishing: [], inspection: [] });

  // Stage events for Operation Tracking timeline
  const [stageEvents, setStageEvents] = useState<JobStageEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listMoldingSessions(),
      listFinishingSessions(),
      listInspectionSessions(),
      supabase
        .from('prod_job_stage_events')
        .select('*')
        .order('ts', { ascending: false })
        .limit(120),
    ]).then(([mld, fin, ins, evRes]) => {
      setActuals({ molding: mld, finishing: fin, inspection: ins });
      setStageEvents((evRes.data as JobStageEvent[]) || []);
      setEventsLoading(false);
    });
  }, []);

  const openJobs      = jobs.filter(j => j.stage !== 'dispatched');
  const today         = new Date().toISOString().slice(0, 10);
  const overdue       = openJobs.filter(j => j.promised_date && j.promised_date < today && j.stage !== 'dispatch');
  const emergencyJobs = openJobs.filter(j => j.priority === 'emergency');
  const runningCount  = presses.filter(p => p.status === 'running').length;
  const pressUtil     = presses.length ? Math.round((runningCount / presses.length) * 100) : 0;
  const dispatched    = jobs.filter(j => j.stage === 'dispatched');
  const dispatchedOn  = dispatched.filter(j => j.otd_result === 'on-time').length;
  const otdPct        = dispatched.length ? Math.round((dispatchedOn / dispatched.length) * 100) : null;
  const queuedNoPress = jobs.filter(j => j.stage === 'moulding' && !j.press_id);

  // Group events by job for Operation Tracking
  const recentEventsByJob = useMemo(() => {
    const jobMap = new Map<string, JobStageEvent[]>();
    for (const ev of stageEvents) {
      if (!jobMap.has(ev.job_id)) jobMap.set(ev.job_id, []);
      jobMap.get(ev.job_id)!.push(ev);
    }
    // Return sorted job entries: most recent event first (events already desc)
    return Array.from(jobMap.entries()).slice(0, 12);
  }, [stageEvents]);

  const handleConfirmAssign = async (jobIds: string[], pressId: string) => {
    await assignJobsToPress(jobIds, pressId); await refresh();
  };
  const handleMarkDone = async (pressId: string) => {
    await markPressDone(pressId); await refresh();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="h-12 bg-white border-b border-[#E4E5E6] px-4 flex items-center gap-3 flex-shrink-0">
        <Factory size={15} className="text-[#333]" />
        <div className="flex-1">
          <span className="text-[14px] font-semibold text-[#111]">Production Dashboard</span>
          <span className="ml-2 text-[11px] text-[#333] hidden sm:inline">Shop-floor at a glance</span>
        </div>
        <Link
          to="/production/jobs/new"
          className="inline-flex items-center gap-1 bg-[#0A6ED1] text-white text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#085EA8] transition-colors"
        >
          <Plus size={12} /> New Job
        </Link>
        <Link
          to="/production/sequencer/mould"
          className="inline-flex items-center gap-1 bg-white text-[#0A6ED1] border border-[#0A6ED1] text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#E8F0FD] transition-colors"
        >
          <Workflow size={12} /> Sequencer
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Emergency banner */}
        {emergencyJobs.length > 0 && (
          <div className="bg-[#FFF1F0] border border-[#FFCDD2] rounded-[3px] px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#BB0000] shrink-0" />
            <div className="flex-1 text-[12px] text-[#BB0000]">
              <strong>🔴 EMERGENCY PO ACTIVE:</strong>{' '}
              {emergencyJobs.slice(0, 2).map(j => (
                <span key={j.id} className="mr-3">
                  <strong>{j.id}</strong> — {productIdentity(j)} · {j.customer_name}
                </span>
              ))}
              {emergencyJobs.length > 2 && (
                <span className="text-[#333]">+{emergencyJobs.length - 2} more</span>
              )}
              <span className="text-[#333] ml-1">· Ambulance corridor active</span>
            </div>
            <Link
              to="/production/sequencer/mould"
              className="bg-[#BB0000] text-white text-[11px] font-medium px-[10px] py-[3px] rounded-[3px] hover:bg-[#8E0000] whitespace-nowrap transition-colors"
            >
              View in Sequencer
            </Link>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <KPI
            value={otdPct !== null ? `${otdPct}%` : '—'}
            label="On-Time Delivery (MTD)"
            accentClass="border-t-[#0A6ED1]"
            sub={dispatched.length ? `${dispatchedOn} of ${dispatched.length} dispatched` : 'No dispatches yet'}
            subClass="text-[#107E3E]"
          />
          <KPI
            value={openJobs.length}
            label="WIP Jobs in Pipeline"
            accentClass="border-t-[#E9730C]"
            sub={emergencyJobs.length ? `${emergencyJobs.length} emergency` : 'All normal'}
            subClass={emergencyJobs.length ? 'text-[#BB0000]' : 'text-[#333]'}
          />
          <KPI
            value={overdue.length}
            label="Overdue / At Risk"
            accentClass="border-t-[#BB0000]"
            sub="Needs action"
            subClass={overdue.length ? 'text-[#BB0000]' : 'text-[#333]'}
          />
          <KPI
            value={`${pressUtil}%`}
            label="Press Utilisation"
            accentClass="border-t-[#107E3E]"
            sub={`${runningCount} of ${presses.length} running`}
            subClass="text-[#107E3E]"
          />
        </div>

        {/* Live press board */}
        <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
          <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#111] flex-1">Live Press Board</span>
            {settings && (
              <span className="text-[10px] text-[#333]">
                Shift: {settings.shift_hours_left}h left · OT {settings.overtime_max}h
              </span>
            )}
            <Link to="/production/presses" className="text-[11px] text-[#0A6ED1] hover:underline">
              Full Board →
            </Link>
          </div>
          <div className="p-2.5">
            {loading
              ? <div className="text-center py-6 text-[12px] text-[#333]">Loading…</div>
              : <PressBoard presses={presses} jobs={jobs} onAssign={pid => setAssigning({ pressId: pid })} onMarkDone={handleMarkDone} />
            }
          </div>
        </div>

        {/* Unassigned alert */}
        {queuedNoPress.length > 0 && (
          <div className="bg-[#FFF8EC] border border-[#FFE0B2] rounded-[3px] px-3 py-2 flex items-center gap-2 text-[12px] text-[#E9730C]">
            <AlertTriangle size={13} className="shrink-0" />
            <div className="flex-1">
              <strong>{queuedNoPress.length}</strong> job{queuedNoPress.length === 1 ? '' : 's'} in Moulding without a press.
            </div>
            <button type="button" onClick={() => setAssigning({ pressId: null })}
              className="bg-[#E9730C] text-white text-[11px] font-medium px-[10px] py-[3px] rounded-[3px] hover:bg-[#BF5D08] border-none cursor-pointer whitespace-nowrap transition-colors">
              Assign Now
            </button>
          </div>
        )}

        {/* Stage Milestone Tracker — now with log actuals */}
        <StageMilestoneTracker jobs={jobs} settings={settings} actuals={actuals} />

        {/* Operation Tracking & Timeline */}
        <OperationTimeline
          events={stageEvents}
          recentEventsByJob={recentEventsByJob}
          jobs={jobs}
          actuals={actuals}
          loading={eventsLoading}
        />

        {/* Today's Dispatch Targets */}
        <TodaysDispatchTargets jobs={jobs} />

        {/* 30-week OTD trend */}
        <OTDTrend jobs={jobs} />

        {/* Embedded Sequencer */}
        <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden">
          <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
            <Workflow size={13} className="text-[#333]" />
            <span className="text-[12px] font-semibold text-[#111] flex-1">
              Sequencer
              <span className="ml-2 text-[11px] text-[#333] font-normal">In-line view</span>
            </span>
            <Link to={`/production/sequencer/${seqTab}`} className="text-[11px] text-[#0A6ED1] hover:underline">
              Open Full →
            </Link>
          </div>
          <SequencerBody data={data} activeTab={seqTab} onTabChange={setSeqTab} />
        </div>
      </div>

      <AssignPressModal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        jobs={queuedNoPress}
        presses={presses}
        products={products}
        preselectPressId={assigning?.pressId || null}
        onConfirm={handleConfirmAssign}
      />
    </div>
  );
}

// ── Operation Tracking & Timeline ──────────────────────────────────

interface OpTimelineProps {
  events: JobStageEvent[];
  recentEventsByJob: [string, JobStageEvent[]][];
  jobs: import('../lib/types').ProductionJob[];
  actuals: LogActuals;
  loading: boolean;
}

function OperationTimeline({ events, recentEventsByJob, jobs, actuals, loading }: OpTimelineProps) {
  const jobMap = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);

  // Log entry counts per job
  const logCounts = useMemo(() => {
    const m = new Map<string, { mld: number; fin: number; ins: number }>();
    for (const j of jobs) {
      m.set(j.id, { mld: 0, fin: 0, ins: 0 });
    }
    for (const s of actuals.molding)    { const e = m.get(s.job_card_id); if (e) e.mld++; }
    for (const s of actuals.finishing)  { const e = m.get(s.job_card_id); if (e) e.fin++; }
    for (const s of actuals.inspection) { const e = m.get(s.job_card_id); if (e) e.ins++; }
    return m;
  }, [jobs, actuals]);

  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
      <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
        <Clock size={13} className="text-[#333]" />
        <span className="text-[12px] font-semibold text-[#111] flex-1">
          Operation Tracking &amp; Timeline
          <span className="ml-2 text-[11px] text-[#333] font-normal">Stage transitions · {events.length} events</span>
        </span>
      </div>

      {loading ? (
        <div className="p-4 text-[12px] text-[#555] text-center">Loading events…</div>
      ) : recentEventsByJob.length === 0 ? (
        <div className="p-4 text-[12px] text-[#555] text-center">No stage events recorded yet.</div>
      ) : (
        <div className="divide-y divide-[#F0F0F0]">
          {recentEventsByJob.map(([jcId, evList]) => {
            const job = jobMap.get(jcId);
            const counts = logCounts.get(jcId);
            // evList already desc by ts (newest first)
            const latestEv = evList[0];
            const allEvAsc = [...evList].reverse();

            return (
              <div key={jcId} className="px-3 py-3">
                {/* Job header */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/production/jobs/${jcId}`}
                        className="font-mono text-[11px] font-bold text-[#0A6ED1] hover:underline">
                        {jcId}
                      </Link>
                      {job && (
                        <>
                          <span className="text-[11px] text-[#333] truncate max-w-[200px]">{productIdentity(job)}</span>
                          <span className={`text-[9.5px] font-medium px-1.5 py-0.5 rounded-full ${STAGE_COLOR[job.stage] || 'bg-[#F0F0F0] text-[#555]'}`}>
                            {STAGE_LABEL[job.stage] || job.stage}
                          </span>
                        </>
                      )}
                    </div>
                    {/* Log entry badges */}
                    {counts && (counts.mld > 0 || counts.fin > 0 || counts.ins > 0) && (
                      <div className="flex items-center gap-2 mt-1">
                        {counts.mld > 0 && (
                          <Link to="/production/log-molding"
                            className="inline-flex items-center gap-1 text-[9.5px] bg-[#E8F0FD] text-[#0A6ED1] px-1.5 py-0.5 rounded-full hover:bg-[#C2D8F8] transition-colors">
                            🔵 {counts.mld} mold {counts.mld === 1 ? 'entry' : 'entries'}
                          </Link>
                        )}
                        {counts.fin > 0 && (
                          <Link to="/production/log-finishing"
                            className="inline-flex items-center gap-1 text-[9.5px] bg-[#FFF3E0] text-[#E9730C] px-1.5 py-0.5 rounded-full hover:bg-[#FFE0B2] transition-colors">
                            🟡 {counts.fin} finish {counts.fin === 1 ? 'entry' : 'entries'}
                          </Link>
                        )}
                        {counts.ins > 0 && (
                          <Link to="/production/log-inspection"
                            className="inline-flex items-center gap-1 text-[9.5px] bg-[#EDE7F6] text-[#6200EA] px-1.5 py-0.5 rounded-full hover:bg-[#D1C4E9] transition-colors">
                            🟣 {counts.ins} inspect {counts.ins === 1 ? 'entry' : 'entries'}
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                  {latestEv && (
                    <div className="text-[9.5px] text-[#888] whitespace-nowrap flex-shrink-0">
                      {fmtIST(new Date(latestEv.ts), 'dd MMM HH:mm')}
                    </div>
                  )}
                </div>

                {/* Stage pipeline dots */}
                <div className="flex items-center gap-0 overflow-x-auto">
                  {allEvAsc.map((ev, i) => (
                    <React.Fragment key={ev.id ?? i}>
                      {i > 0 && (
                        <div className="w-4 h-[1px] bg-[#C2D8F8] flex-shrink-0" />
                      )}
                      <div className="flex-shrink-0 group relative">
                        <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[8px] font-bold border-2 ${stageNodeStyle(ev.to_stage)}`}
                          title={`${STAGE_LABEL[ev.to_stage] || ev.to_stage} — ${fmtIST(new Date(ev.ts), 'dd MMM HH:mm')}${ev.actor ? ` by ${ev.actor}` : ''}`}>
                          {stageInitial(ev.to_stage)}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                  {/* Current stage arrow indicator */}
                  {job && !['dispatched'].includes(job.stage) && (
                    <>
                      <div className="w-4 h-[1px] bg-[#E4E5E6] flex-shrink-0" />
                      <ArrowRight size={11} className="text-[#C0C0C0] flex-shrink-0" />
                    </>
                  )}
                </div>

                {/* Latest event note */}
                {latestEv?.notes && (
                  <div className="mt-1.5 text-[10px] text-[#555] italic">{latestEv.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function stageNodeStyle(stage: string): string {
  switch (stage) {
    case 'moulding':   return 'bg-[#E8F0FD] border-[#0A6ED1] text-[#0A6ED1]';
    case 'finishing':  return 'bg-[#FFF3E0] border-[#E9730C] text-[#E9730C]';
    case 'inspection': return 'bg-[#EDE7F6] border-[#6200EA] text-[#6200EA]';
    case 'pdi':        return 'bg-[#E8F5E9] border-[#107E3E] text-[#107E3E]';
    case 'dispatch':   return 'bg-[#E8F5E9] border-[#107E3E] text-[#107E3E]';
    case 'dispatched': return 'bg-[#F0F0F0] border-[#555] text-[#555]';
    default:           return 'bg-[#F0F0F0] border-[#C0C0C0] text-[#555]';
  }
}

function stageInitial(stage: string): string {
  switch (stage) {
    case 'moulding':   return 'M';
    case 'finishing':  return 'F';
    case 'inspection': return 'I';
    case 'pdi':        return 'P';
    case 'dispatch':   return 'D';
    case 'dispatched': return '✓';
    default:           return stage[0]?.toUpperCase() || '?';
  }
}

// ── KPI card ────────────────────────────────────────────────────────

function KPI({
  value, label, accentClass, sub, subClass,
}: {
  value: React.ReactNode;
  label: string;
  accentClass: string;
  sub?: string;
  subClass?: string;
}) {
  return (
    <div className={`bg-white border border-[#E4E5E6] border-t-[3px] rounded-[3px] px-[14px] py-3 ${accentClass}`}>
      <div className="text-[26px] font-light leading-none text-[#111]">{value}</div>
      <div className="text-[10px] text-[#333] mt-[3px]">{label}</div>
      {sub && <div className={`text-[10px] mt-[5px] ${subClass ?? 'text-[#333]'}`}>{sub}</div>}
    </div>
  );
}
