import { formatDuration, type WorkSettings } from './engine';

const TZ = 'Asia/Kolkata';
const dt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const d = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dShort = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' });
const tm = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });

const tidy = (s: string) => s.replace(/\s?(am|pm)/i, (_m, p) => ` ${p.toUpperCase()}`).replace('Sept', 'Sep');

export const fmtDateTime = (ms: number | null | undefined) => (ms == null ? '–' : tidy(dt.format(new Date(ms))));
export const fmtDate = (ms: number | null | undefined) => (ms == null ? '–' : tidy(d.format(new Date(ms))));
export const fmtDayMonth = (ms: number) => tidy(dShort.format(new Date(ms)));
export const fmtTime = (ms: number | null | undefined) => (ms == null ? '–' : tidy(tm.format(new Date(ms))));

/** 'YYYY-MM-DD' -> 'Mon 5 Oct 2026' */
export function fmtYmd(ymd: string): string {
  return tidy(d.format(new Date(`${ymd}T12:00:00+05:30`)));
}

export function fmtWeekRange(from: number, to: number): string {
  return `${fmtDayMonth(from)} – ${fmtDayMonth(to - 1)}`;
}

/** Working-time duration such as "3h 30m" (or "1d 2h" using the working day length). */
export const fmtWorking = (minutes: number, work?: WorkSettings) => formatDuration(minutes, work);

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export const SOURCE_LABEL: Record<string, string> = {
  workflow: 'Workflow',
  delegated: 'Assigned',
  recurring: 'Recurring',
  personal: 'Personal',
};

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
