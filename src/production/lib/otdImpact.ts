// ─────────────────────────────────────────────────────────────────
// OTD Impact engine — pure functions, no Supabase calls.
// Ports v2 mock (MRT_ERP_Phase1_2_v2.html lines 1484-1545).
// ─────────────────────────────────────────────────────────────────

import type { ProductionJob, JobStage } from './types';

export interface Headcount { finishers: number; inspectors: number; }
export type Risk = 'safe' | 'atrisk' | 'breach';

export interface JobRatesHint {
  setupTime?: number;   // hrs
  finishRate?: number;  // pcs/finisher/hr
  inspRate?: number;    // pcs/inspector/hr
  pdiTime?: number;     // hrs/job
  cureTime?: number;    // min
  cavities?: number;
}

const DEFAULTS: Required<JobRatesHint> = {
  setupTime: 0.5, finishRate: 10, inspRate: 20, pdiTime: 0.25,
  cureTime: 18, cavities: 2,
};

export function calcMouldRate(rates: JobRatesHint = {}): number {
  const cureTime = rates.cureTime ?? DEFAULTS.cureTime;
  const cavities = rates.cavities ?? DEFAULTS.cavities;
  return (60 / cureTime) * cavities;
}

export function calcJobRemainingTAT(
  job: ProductionJob,
  hc: Headcount,
  rates: JobRatesHint = {}
): number {
  // Pull rates from the job's own cure/cavity columns where available,
  // otherwise fall back to the hints/defaults. Phase 3 will source rates
  // from the product master.
  const r: Required<JobRatesHint> = {
    setupTime: rates.setupTime ?? DEFAULTS.setupTime,
    finishRate: rates.finishRate ?? DEFAULTS.finishRate,
    inspRate: rates.inspRate ?? DEFAULTS.inspRate,
    pdiTime: rates.pdiTime ?? DEFAULTS.pdiTime,
    cureTime: job.cure_time_min ?? rates.cureTime ?? DEFAULTS.cureTime,
    cavities: job.cavities ?? rates.cavities ?? DEFAULTS.cavities,
  };
  const stages: JobStage[] = ['moulding', 'finishing', 'inspection', 'pdi'];
  const curIdx = stages.indexOf(job.stage);
  if (curIdx === -1) return 0; // queued or already past pdi

  const qtyRem = Math.max(0, job.qty - (job.qty_done || 0));
  let hrs = 0;
  stages.forEach((s, i) => {
    if (i < curIdx) return;
    const q = i === curIdx ? qtyRem : job.qty;
    if (s === 'moulding')   hrs += q / calcMouldRate(r) + r.setupTime;
    if (s === 'finishing')  hrs += q / Math.max(1, r.finishRate * hc.finishers);
    if (s === 'inspection') hrs += q / Math.max(1, r.inspRate   * hc.inspectors);
    if (s === 'pdi')        hrs += r.pdiTime;
  });
  return hrs;
}

export interface JobImpact {
  job: ProductionJob;
  remHrs: number;
  projEnd: Date;
  promised: Date | null;
  bufferHrs: number;
  risk: Risk;
  otHrs: number;
  extraWorkers: number;
}

export function getJobImpact(
  job: ProductionJob,
  hc: Headcount,
  now: Date = new Date()
): JobImpact {
  const remHrs   = calcJobRemainingTAT(job, hc);
  const projEnd  = new Date(now.getTime() + remHrs * 3_600_000);
  const promised = job.promised_date
    ? new Date(job.promised_date + 'T17:00:00')
    : null;
  const bufferHrs = promised ? (promised.getTime() - projEnd.getTime()) / 3_600_000 : 0;
  let risk: Risk = 'safe';
  if (promised) {
    if (bufferHrs < 0) risk = bufferHrs < -8 ? 'breach' : 'atrisk';
  }
  const otHrs = risk !== 'safe' ? Math.ceil(Math.abs(bufferHrs) * 10) / 10 : 0;
  return { job, remHrs, projEnd, promised, bufferHrs, risk, otHrs, extraWorkers: 0 };
}

// ─────────────────────────────────────────────────────────────────
// Stage Milestone planner — ports v2 calcMilestones() (line 3354).
// Given a job's promised date + cure/cavity + planned headcount,
// returns planned start/end dates for each stage, working backward
// from a "ready by" date that's 3 days before delivery.
// ─────────────────────────────────────────────────────────────────

export interface JobMilestones {
  pmReadyDate:   string;  // 3 days before promised — when goods must be ready
  pmPDIEnd:      string;
  pmPDIStart:    string;
  pmInspEnd:     string;
  pmInspStart:   string;
  pmFinishEnd:   string;
  pmFinishStart: string;
  pmMouldEnd:    string;
  pmMouldStart:  string;  // = LSD (latest start date)
}

function subDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function calcMilestones(
  job: ProductionJob,
  plannedFinishers: number,
  plannedInspectors: number,
  refQty = 200,
  bufferDays = 3,
): JobMilestones | null {
  if (!job.promised_date) return null;
  const r: Required<JobRatesHint> = {
    setupTime: DEFAULTS.setupTime,
    finishRate: DEFAULTS.finishRate,
    inspRate: DEFAULTS.inspRate,
    pdiTime: DEFAULTS.pdiTime,
    cureTime: job.cure_time_min ?? DEFAULTS.cureTime,
    cavities: job.cavities ?? DEFAULTS.cavities,
  };
  const mR = (60 / r.cureTime) * r.cavities;                    // pcs/hr from press
  const SHIFT_HRS = 8;
  const mDays   = Math.max(1, Math.ceil((refQty / mR + r.setupTime) / SHIFT_HRS));
  const fDays   = Math.max(1, Math.ceil(refQty / (r.finishRate * Math.max(1, plannedFinishers))  / SHIFT_HRS));
  const iDays   = Math.max(1, Math.ceil(refQty / (r.inspRate   * Math.max(1, plannedInspectors)) / SHIFT_HRS));
  const pdiDays = Math.max(1, Math.ceil(r.pdiTime));

  const pmReadyDate   = subDays(job.promised_date, bufferDays);
  const pmPDIEnd      = pmReadyDate;
  const pmPDIStart    = subDays(pmPDIEnd, pdiDays);
  const pmInspEnd     = pmPDIStart;
  const pmInspStart   = subDays(pmInspEnd, iDays);
  const pmFinishEnd   = pmInspStart;
  const pmFinishStart = subDays(pmFinishEnd, fDays);
  const pmMouldEnd    = pmFinishStart;
  const pmMouldStart  = subDays(pmMouldEnd, mDays);

  return {
    pmReadyDate, pmPDIEnd, pmPDIStart,
    pmInspEnd, pmInspStart,
    pmFinishEnd, pmFinishStart,
    pmMouldEnd, pmMouldStart,
  };
}

export type StageRAGDot = 'green' | 'amber' | 'red' | 'gray';

export interface StageRAG {
  dot: StageRAGDot;
  label: string;
  diff: number;     // days from today (negative = missed)
}

export function stageRAG(planDate: string | null, today: Date = new Date()): StageRAG {
  if (!planDate) return { dot: 'gray', label: '—', diff: 0 };
  const todayStr = today.toISOString().slice(0, 10);
  const t = new Date(todayStr + 'T00:00:00').getTime();
  const p = new Date(planDate + 'T00:00:00').getTime();
  const diff = Math.floor((p - t) / 86_400_000);
  if (diff <  0) return { dot: 'red',   label: `Missed ${Math.abs(diff)}d ago`, diff };
  if (diff === 0) return { dot: 'amber', label: 'Due today',    diff };
  if (diff === 1) return { dot: 'amber', label: 'Due tomorrow', diff };
  return                  { dot: 'green', label: `+${diff}d`,     diff };
}

// Plan date for the job's *current* stage — used to sort the milestone tracker.
export function currentStagePlan(job: ProductionJob, ms: JobMilestones | null): string | null {
  if (!ms) return null;
  switch (job.stage) {
    case 'moulding':   return ms.pmMouldStart;
    case 'finishing':  return ms.pmFinishStart;
    case 'inspection': return ms.pmInspStart;
    case 'pdi':        return ms.pmPDIStart;
    default:           return null;
  }
}

export function getOTDImpactSummary(jobs: ProductionJob[], hc: Headcount) {
  const impacts = jobs
    .filter(j => ['moulding', 'finishing', 'inspection', 'pdi'].includes(j.stage))
    .map(j => getJobImpact(j, hc));
  return {
    safe:   impacts.filter(i => i.risk === 'safe').length,
    atrisk: impacts.filter(i => i.risk === 'atrisk').length,
    breach: impacts.filter(i => i.risk === 'breach').length,
    impacts,
  };
}
