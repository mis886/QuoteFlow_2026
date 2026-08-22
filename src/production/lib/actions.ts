// Production workflow actions. Each one writes to `prod_*` tables only.

import {
  updateJob, updatePress, logStageEvent, listPresses, listJobs,
  insertNCR, setWorkerPresent,
} from './db';
import type { JobStage, ProductionJob } from './types';

// ── Queue ordering helpers ────────────────────────────────────────
// Jobs queued on a press are ordered by queue_seq (lower = next). Jobs without
// a seq sort after those with one, by LSD/promised then id as a stable tiebreak.

export function pressQueueJobs(jobs: ProductionJob[], pressId: string): ProductionJob[] {
  return jobs
    .filter(j => j.press_id === pressId && j.stage === 'moulding' && j.status === 'queued')
    .sort(compareQueue);
}

function compareQueue(a: ProductionJob, b: ProductionJob): number {
  const sa = a.queue_seq, sb = b.queue_seq;
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  if (sa != null && sb == null) return -1;
  if (sa == null && sb != null) return 1;
  return (a.lsd || a.promised_date || '').localeCompare(b.lsd || b.promised_date || '') || a.id.localeCompare(b.id);
}

// ── Press / Moulding ──────────────────────────────────────────────

export async function assignJobsToPress(jobIds: string[], pressId: string) {
  if (jobIds.length === 0) return;
  const [presses, jobs] = await Promise.all([listPresses(), listJobs()]);
  const press = presses.find(p => p.id === pressId);
  if (!press) throw new Error('Press not found');
  if (press.status !== 'idle') throw new Error(`${press.name} is ${press.status}`);

  // Update every selected job: stage→moulding, status→queued, press_id assigned.
  // Only the FIRST job becomes active on the press card (status='setup'); the
  // rest remain status='queued' so the operator works through them.
  const [firstId, ...restIds] = jobIds;
  const firstJob = jobs.find(j => j.id === firstId);
  if (!firstJob) throw new Error('First job not found');

  // Append behind any jobs already queued on this press. Within this batch,
  // emergencies are queued ahead of normal jobs.
  let seq = Math.max(0, ...pressQueueJobs(jobs, pressId).map(j => j.queue_seq ?? 0)) + 1;
  const orderedRest = restIds
    .map(id => jobs.find(j => j.id === id))
    .filter((j): j is ProductionJob => !!j)
    .sort((a, b) =>
      (a.priority === 'emergency' ? 0 : 1) - (b.priority === 'emergency' ? 0 : 1));

  await updateJob(firstId, {
    press_id: pressId, stage: 'moulding', status: 'setup', queue_seq: null,
  });
  for (const j of orderedRest) {
    await updateJob(j.id, {
      press_id: pressId, stage: 'moulding', status: 'queued', queue_seq: seq++,
    });
  }

  await updatePress(pressId, {
    active_job_id: firstId,
    status: 'setup',
    pct_done: 5,
    eta_text: jobIds.length > 1
      ? `Setting up ${firstJob.mould_code || 'mould'} · +${restIds.length} queued`
      : `Setting up ${firstJob.mould_code || 'mould'}`,
  });

  await logStageEvent(firstId, 'moulding', firstJob.stage as JobStage, null,
    jobIds.length > 1 ? `Assigned to ${press.name} (batch of ${jobIds.length})` : `Assigned to ${press.name}`);
  for (const id of restIds) {
    await logStageEvent(id, 'moulding', null, null, `Queued on ${press.name} after ${firstId}`);
  }
}

// Kept as a thin wrapper for single-job press assignment.
export async function assignJobToPress(jobId: string, pressId: string) {
  return assignJobsToPress([jobId], pressId);
}

export async function markPressDone(pressId: string) {
  const [presses, jobs] = await Promise.all([listPresses(), listJobs()]);
  const press = presses.find(p => p.id === pressId);
  if (!press || !press.active_job_id) throw new Error('No active job on press');
  const job = jobs.find(j => j.id === press.active_job_id);
  if (!job) throw new Error('Job not found');

  // Setup → Running is a soft toggle; otherwise advance to Finishing.
  if (press.status === 'setup') {
    await updatePress(pressId, {
      status: 'running', pct_done: 10, eta_text: '~35 min',
    });
    await updateJob(job.id, { status: 'running' });
    return;
  }

  // Press currently running → moulding complete on the active job.
  // Promote the FIRST queued job on this press by queue order (emergency /
  // manually-raised jobs sit at the front).
  const nextOnPress = pressQueueJobs(jobs, pressId).find(j => j.id !== job.id);

  await updateJob(job.id, {
    stage: 'finishing',
    status: 'in-progress',
    press_id: null,
  });
  await logStageEvent(job.id, 'finishing', 'moulding', null, 'Moulding complete');

  if (nextOnPress) {
    await updateJob(nextOnPress.id, { status: 'setup', queue_seq: null });
    await updatePress(pressId, {
      active_job_id: nextOnPress.id,
      status: 'setup',
      pct_done: 5,
      eta_text: `Setting up ${nextOnPress.mould_code || 'mould'}`,
    });
  } else {
    await updatePress(pressId, {
      active_job_id: null,
      status: 'idle',
      pct_done: 0,
      eta_text: 'Awaiting next job',
    });
  }
}

// ── Queue reordering ──────────────────────────────────────────────

// Renumber a press's queue 1..n in the given order so seqs stay compact and
// gap-free after any move.
async function renumberQueue(ordered: ProductionJob[]) {
  for (let i = 0; i < ordered.length; i++) {
    const want = i + 1;
    if (ordered[i].queue_seq !== want) await updateJob(ordered[i].id, { queue_seq: want });
  }
}

// Move a queued job one slot up (sooner) or down (later) in its press queue.
export async function moveQueueJob(jobId: string, dir: 'up' | 'down') {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job || !job.press_id) throw new Error('Job is not in a press queue');
  const queue = pressQueueJobs(jobs, job.press_id);
  const idx = queue.findIndex(j => j.id === jobId);
  const swapWith = dir === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= queue.length) return; // already at edge
  [queue[idx], queue[swapWith]] = [queue[swapWith], queue[idx]];
  await renumberQueue(queue);
}

// Jump a queued job to the front of its press queue (e.g. an emergency).
export async function moveQueueJobToFront(jobId: string) {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job || !job.press_id) throw new Error('Job is not in a press queue');
  const queue = pressQueueJobs(jobs, job.press_id);
  const idx = queue.findIndex(j => j.id === jobId);
  if (idx <= 0) return; // not found, or already first
  const [picked] = queue.splice(idx, 1);
  queue.unshift(picked);
  await renumberQueue(queue);
}

// Preempt the job currently on the press: bump it back to the FRONT of the
// queue (status→queued) and immediately load `jobId` (e.g. an emergency) into
// setup as the new active job. Use sparingly — interrupting a curing job has a
// process cost; intended for genuine emergencies.
export async function preemptActiveJob(jobId: string) {
  const [presses, jobs] = await Promise.all([listPresses(), listJobs()]);
  const job = jobs.find(j => j.id === jobId);
  if (!job || !job.press_id) throw new Error('Job is not in a press queue');
  const pressId = job.press_id;
  const press = presses.find(p => p.id === pressId);
  if (!press) throw new Error('Press not found');

  const active = press.active_job_id ? jobs.find(j => j.id === press.active_job_id) : null;

  // Rebuild the queue without the incoming job; the bumped active job goes to
  // the front, then the rest.
  const rest = pressQueueJobs(jobs, pressId).filter(j => j.id !== jobId);
  if (active) {
    await updateJob(active.id, { status: 'queued' });
    await logStageEvent(active.id, 'moulding', 'moulding', null,
      `Paused on ${press.name} — preempted by ${job.id}`);
    await renumberQueue([active, ...rest]);
  } else {
    await renumberQueue(rest);
  }

  // Load the emergency as the new active job.
  await updateJob(jobId, { status: 'setup', queue_seq: null });
  await updatePress(pressId, {
    active_job_id: jobId,
    status: 'setup',
    pct_done: 5,
    eta_text: `🔴 Setting up ${job.mould_code || 'mould'}${active ? ` · paused ${active.id}` : ''}`,
  });
  await logStageEvent(jobId, 'moulding', job.stage as JobStage, null,
    `Emergency loaded on ${press.name} (preempt)`);
}

// Advance a specific job to the next stage (used by tables, not press card).
export async function advanceJob(jobId: string, toStage: JobStage) {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) throw new Error('Job not found');
  const status =
    toStage === 'dispatch'   ? 'ready' :
    toStage === 'finishing'  ? 'in-progress' :
    toStage === 'inspection' ? 'pending' :
    toStage === 'pdi'        ? 'awaiting' :
    toStage === 'dispatched' ? 'dispatched' :
    'in-progress';
  await updateJob(jobId, { stage: toStage, status });
  await logStageEvent(jobId, toStage, job.stage as JobStage, null, null);
}

// ── Finishing ─────────────────────────────────────────────────────

export async function setJobQtyDone(jobId: string, qtyDone: number) {
  await updateJob(jobId, { qty_done: Math.max(0, Math.floor(qtyDone)) });
}

// ── Inspection ────────────────────────────────────────────────────

export async function passInspection(jobId: string, inspector?: string) {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) throw new Error('Job not found');
  await updateJob(jobId, {
    status: 'passed',
    inspection_result: 'passed',
    inspector: inspector ?? job.inspector ?? null,
    inspection_passed_at: new Date().toISOString(),
  });
  await logStageEvent(jobId, 'inspection', 'inspection', inspector || null, 'Inspection passed');
  await advanceJob(jobId, 'pdi');
}

export async function raiseNCR(
  jobId: string,
  payload: {
    defect_desc: string;
    defect_code: string;
    responsible_stage: string;
    action: 'rework' | 'reject';
  }
) {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) throw new Error('Job not found');
  const ncrId = `NCR-${Date.now()}`;
  await insertNCR({
    id: ncrId,
    job_id: jobId,
    defect_desc: payload.defect_desc,
    defect_code: payload.defect_code,
    responsible_stage: payload.responsible_stage,
    action: payload.action,
  });
  await updateJob(jobId, {
    status: 'ncr',
    inspection_result: 'ncr',
  });
  await logStageEvent(jobId, 'inspection', 'inspection', null,
    `NCR: ${payload.defect_code} → ${payload.action}`);
}

export async function reworkFromNCR(jobId: string) {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) throw new Error('Job not found');
  await updateJob(jobId, {
    stage: 'finishing',
    status: 'queued',
    qty_done: 0,
  });
  await logStageEvent(jobId, 'finishing', 'inspection', null, 'Re-routed to Finishing for rework');
}

// ── PDI ───────────────────────────────────────────────────────────

export async function approvePDI(jobId: string, officer: string) {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) throw new Error('Job not found');
  await updateJob(jobId, {
    pdi_officer: officer,
    status: 'ready',
    stage: 'dispatch',
  });
  await logStageEvent(jobId, 'dispatch', 'pdi', officer, 'PDI approved');
}

// ── Dispatch ──────────────────────────────────────────────────────

export async function confirmDispatch(
  jobId: string,
  payload: { courier: string; consignment_no: string }
) {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) throw new Error('Job not found');

  const promised = job.promised_date ? new Date(job.promised_date + 'T17:00:00') : null;
  const now = new Date();
  const onTime = promised ? now.getTime() <= promised.getTime() : true;

  await updateJob(jobId, {
    courier: payload.courier,
    consignment_no: payload.consignment_no,
    stage: 'dispatched',
    status: onTime ? 'dispatched' : 'late',
    otd_result: onTime ? 'on-time' : 'late',
    dispatched_at: now.toISOString(),
  });
  await logStageEvent(jobId, 'dispatched', 'dispatch', null,
    `Dispatched via ${payload.courier} · ${onTime ? 'On Time' : 'LATE'}`);
}

// Revert a fat-fingered dispatch back to Ready, but only within a short
// undo window. After that the dispatch is considered final — the
// courier has left, OTD has been counted, and tampering would be a
// record-keeping hazard.
export const UNDO_DISPATCH_WINDOW_MIN = 30;

export function canUndoDispatch(job: { stage?: string; dispatched_at?: string | null }): boolean {
  if (job.stage !== 'dispatched' || !job.dispatched_at) return false;
  const age = Date.now() - new Date(job.dispatched_at).getTime();
  return age <= UNDO_DISPATCH_WINDOW_MIN * 60_000;
}

export async function undoDispatch(jobId: string, reason: string) {
  const jobs = await listJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) throw new Error('Job not found');
  if (!canUndoDispatch(job)) {
    throw new Error(
      `Undo window (${UNDO_DISPATCH_WINDOW_MIN} min) has expired. Raise an NCR instead.`
    );
  }
  await updateJob(jobId, {
    stage: 'dispatch',
    status: 'ready',
    otd_result: null,
    courier: null,
    consignment_no: null,
    dispatched_at: null,
  });
  await logStageEvent(jobId, 'dispatch', 'dispatched', null,
    `Dispatch undone${reason ? ` — ${reason}` : ''}`);
}

// ── Shift Briefing ────────────────────────────────────────────────

export async function toggleWorkerPresence(id: string, present: boolean) {
  await setWorkerPresent(id, present);
}
