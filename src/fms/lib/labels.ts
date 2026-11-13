import { workingMinutesBetween, formatDuration, type WorkSettings } from './engine';
import { fmtDateTime } from './format';

/** "Overdue by 2h 30m" (working time). Falls back gracefully when it only just went overdue outside hours. */
export function overdueLabel(dueAt: number, now: number, work: WorkSettings): string {
  const mins = workingMinutesBetween(dueAt, now, work);
  return mins > 0 ? `Overdue by ${formatDuration(mins, work)}` : 'Overdue';
}

export function dueLabel(dueAt: number | null, now: number): string {
  return dueAt == null ? '–' : fmtDateTime(dueAt);
}
