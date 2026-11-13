/**
 * MIS scoring. Pure functions.
 *
 *   WND%   = tasks still not done past their due time / planned tasks
 *   WNDOT% = tasks done after their due time          / planned tasks
 *   MIS    = -(WND% + WNDOT%)            equal weights, 0% is perfect
 *
 * A task is counted in exactly one bucket, so a task that is not done and is
 * later completed late keeps the same penalty. That keeps past weeks stable.
 *
 * "Planned" for a period = counted tasks whose due time falls in the period AND
 * which have matured (due time has passed, or the task is already done). A task
 * that has not been released yet has no due time and is never counted, so a late
 * predecessor never penalises the next owner.
 */

export interface ScoreTask {
  status: 'waiting' | 'open' | 'done' | 'cancelled';
  dueAt: number | null;
  completedAt: number | null;
  countsInMis: boolean;
}

export interface Score {
  planned: number;
  doneOnTime: number;
  doneLate: number;
  notDone: number;
  wndPct: number;
  wndotPct: number;
  /** negative or zero */
  mis: number;
  onTimePct: number;
  noData: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeScore(tasks: ScoreTask[], now: number, from?: number, to?: number): Score {
  let doneOnTime = 0;
  let doneLate = 0;
  let notDone = 0;
  for (const t of tasks) {
    if (!t.countsInMis || t.status === 'cancelled' || t.status === 'waiting' || t.dueAt === null) continue;
    if (from !== undefined && t.dueAt < from) continue;
    if (to !== undefined && t.dueAt >= to) continue;
    if (t.status === 'done') {
      if (t.completedAt !== null && t.completedAt <= t.dueAt) doneOnTime++;
      else doneLate++;
    } else if (t.dueAt <= now) {
      notDone++;
    }
  }
  const planned = doneOnTime + doneLate + notDone;
  if (planned === 0) {
    return { planned: 0, doneOnTime: 0, doneLate: 0, notDone: 0, wndPct: 0, wndotPct: 0, mis: 0, onTimePct: 0, noData: true };
  }
  const wndPct = r2((notDone / planned) * 100);
  const wndotPct = r2((doneLate / planned) * 100);
  return {
    planned,
    doneOnTime,
    doneLate,
    notDone,
    wndPct,
    wndotPct,
    mis: r2(-(wndPct + wndotPct)) || 0,
    onTimePct: r2((doneOnTime / planned) * 100),
    noData: false,
  };
}

export type Band = 'green' | 'amber' | 'red' | 'none';

export function misBand(score: Score, greenLimit: number, amberLimit: number): Band {
  if (score.noData) return 'none';
  const loss = -score.mis;
  if (loss <= greenLimit) return 'green';
  if (loss <= amberLimit) return 'amber';
  return 'red';
}

export function formatMis(score: Score): string {
  if (score.noData) return '–';
  const v = score.mis;
  if (v === 0) return '0%';
  const rounded = Math.round(v * 10) / 10;
  return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 1)}%`;
}
