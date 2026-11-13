/**
 * Working-hours engine. Pure functions, no I/O.
 *
 * All calendar logic is in India Standard Time (UTC+05:30, no daylight saving),
 * so a local wall-clock time is simply UTC + 330 minutes. Instants are
 * epoch milliseconds (UTC), exactly what a Postgres timestamptz maps to.
 *
 * Rule of thumb from the spec: a 3 hour task released at 5:00 PM with close of
 * business at 6:00 PM gets 1 hour that day and the remaining 2 hours from the
 * next working start, so it is due 11:30 AM the next working day.
 */

export const IST_OFFSET_MIN = 330;
const MIN = 60_000;
const DAY = 86_400_000;

export interface WorkSettings {
  /** minutes after midnight IST */
  workStart: number;
  workEnd: number;
  /** null when there is no lunch break */
  lunchStart: number | null;
  lunchEnd: number | null;
  /** 0 = Sunday ... 6 = Saturday */
  weeklyOffs: number[];
  /** 'YYYY-MM-DD' (IST calendar dates) */
  holidays: string[];
}

export const DEFAULT_SETTINGS: WorkSettings = {
  workStart: 9 * 60 + 30,
  workEnd: 18 * 60,
  lunchStart: 13 * 60,
  lunchEnd: 13 * 60 + 30,
  weeklyOffs: [0],
  holidays: [],
};

/** Validates settings; returns a list of problems (empty = OK). */
export function validateSettings(s: WorkSettings): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(s.workStart) || !Number.isInteger(s.workEnd)) errs.push('Working hours must be whole minutes.');
  if (s.workStart < 0 || s.workEnd > 1440 || s.workStart >= s.workEnd) errs.push('Opening time must be before closing time.');
  if ((s.lunchStart === null) !== (s.lunchEnd === null)) errs.push('Set both lunch start and end, or neither.');
  if (s.lunchStart !== null && s.lunchEnd !== null) {
    if (s.lunchStart >= s.lunchEnd) errs.push('Lunch must end after it starts.');
    if (s.lunchStart < s.workStart || s.lunchEnd > s.workEnd) errs.push('Lunch must fall inside working hours.');
  }
  const offs = new Set(s.weeklyOffs);
  if (s.weeklyOffs.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errs.push('Weekly off days must be 0 to 6.');
  if (offs.size >= 7) errs.push('At least one day of the week must be a working day.');
  return errs;
}

// ------------------------------------------------------------------ calendar

/** Epoch ms -> "IST wall clock as if it were UTC". */
function toLocal(ms: number): number {
  return ms + IST_OFFSET_MIN * MIN;
}
function fromLocal(localMs: number): number {
  return localMs - IST_OFFSET_MIN * MIN;
}

/** Start (00:00 IST) of the IST calendar day containing `ms`, as an instant. */
export function startOfDayIST(ms: number): number {
  const l = toLocal(ms);
  return fromLocal(l - (((l % DAY) + DAY) % DAY));
}

/** 'YYYY-MM-DD' of the IST date containing `ms`. */
export function istDateString(ms: number): string {
  return new Date(toLocal(ms)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday, in IST. */
export function istWeekday(ms: number): number {
  return new Date(toLocal(ms)).getUTCDay();
}

/** Minutes after midnight IST. */
export function istMinuteOfDay(ms: number): number {
  const l = toLocal(ms);
  return Math.floor((((l % DAY) + DAY) % DAY) / MIN);
}

/** Instant for a given IST date ('YYYY-MM-DD') and minute-of-day. */
export function istInstant(date: string, minuteOfDay = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Bad date: ${date}`);
  return fromLocal(Date.UTC(y, m - 1, d) + minuteOfDay * MIN);
}

/** Monday 00:00 IST of the week containing `ms` (weeks run Mon to Sun). */
export function startOfWeekIST(ms: number): number {
  const day0 = startOfDayIST(ms);
  const wd = istWeekday(ms); // 0 Sun
  const sinceMonday = (wd + 6) % 7;
  return istInstant(istDateString(day0 - sinceMonday * DAY + 12 * 3600_000), 0);
}

export function addDaysIST(ms: number, days: number): number {
  return istInstant(istDateString(ms + days * DAY + 12 * 3600_000), istMinuteOfDay(ms));
}

export function isWorkingDay(dayStartMs: number, s: WorkSettings, holidaySet?: Set<string>): boolean {
  const hs = holidaySet ?? new Set(s.holidays);
  if (s.weeklyOffs.includes(istWeekday(dayStartMs))) return false;
  if (hs.has(istDateString(dayStartMs))) return false;
  return true;
}

/** Working intervals of a single day as [startMin, endMin) minutes-of-day. */
export function dayIntervals(s: WorkSettings): Array<[number, number]> {
  if (s.lunchStart !== null && s.lunchEnd !== null) {
    return [
      [s.workStart, s.lunchStart],
      [s.lunchEnd, s.workEnd],
    ];
  }
  return [[s.workStart, s.workEnd]];
}

const MAX_DAYS_SCAN = 800; // guards against a calendar with no working day (e.g. everything a holiday)

interface Cursor {
  /** current instant */
  at: number;
  /** end instant of the working interval `at` sits in */
  intervalEnd: number;
}

/**
 * Earliest working moment at or after `ms`. Returns the instant and the end of
 * the interval it falls in. Intervals are half-open: [start, end).
 */
function seekWorking(ms: number, s: WorkSettings, hs: Set<string>): Cursor {
  const ivs = dayIntervals(s);
  let dayStart = startOfDayIST(ms);
  for (let i = 0; i < MAX_DAYS_SCAN; i++) {
    if (isWorkingDay(dayStart, s, hs)) {
      for (const [a, b] of ivs) {
        const aMs = dayStart + a * MIN;
        const bMs = dayStart + b * MIN;
        if (ms < bMs) {
          return { at: Math.max(ms, aMs), intervalEnd: bMs };
        }
      }
    }
    dayStart = istInstant(istDateString(dayStart + DAY + 12 * 3600_000), 0);
    ms = dayStart; // moving to a later day: earliest possible moment is its midnight
  }
  throw new Error('No working time found: check weekly offs and holidays.');
}

/** Earliest instant >= ms that lies inside working time. */
export function nextWorkingMoment(ms: number, s: WorkSettings): number {
  return seekWorking(ms, s, new Set(s.holidays)).at;
}

/**
 * Adds `minutes` of working time to `startMs`. If `startMs` is outside working
 * time it first rolls forward to the next opening. A task that ends exactly at
 * an interval end is due at that end (e.g. 18:00), not at the next opening.
 */
export function addWorkingMinutes(startMs: number, minutes: number, s: WorkSettings): number {
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error('Minutes must be zero or more.');
  const hs = new Set(s.holidays);
  let cur = seekWorking(startMs, s, hs);
  let remaining = minutes * MIN;
  if (remaining === 0) return cur.at;
  for (let guard = 0; guard < 1_000_000; guard++) {
    const avail = cur.intervalEnd - cur.at;
    if (remaining <= avail) return cur.at + remaining;
    remaining -= avail;
    cur = seekWorking(cur.intervalEnd, s, hs);
  }
  throw new Error('Working time calculation did not converge.');
}

/** Working minutes between two instants (0 if b <= a). */
export function workingMinutesBetween(aMs: number, bMs: number, s: WorkSettings): number {
  if (bMs <= aMs) return 0;
  const hs = new Set(s.holidays);
  const ivs = dayIntervals(s);
  let total = 0;
  let dayStart = startOfDayIST(aMs);
  for (let i = 0; i < 100_000 && dayStart < bMs; i++) {
    if (isWorkingDay(dayStart, s, hs)) {
      for (const [x, y] of ivs) {
        const lo = Math.max(dayStart + x * MIN, aMs);
        const hi = Math.min(dayStart + y * MIN, bMs);
        if (hi > lo) total += hi - lo;
      }
    }
    dayStart = istInstant(istDateString(dayStart + DAY + 12 * 3600_000), 0);
  }
  return Math.round(total / MIN);
}

/** "2h 30m", "45m", "1d 2h" style label (a working day = the day's working minutes). */
export function formatDuration(minutes: number, s?: WorkSettings): string {
  const m = Math.max(0, Math.round(minutes));
  if (m === 0) return '0m';
  let perDay = 0;
  if (s) perDay = dayIntervals(s).reduce((t, [a, b]) => t + (b - a), 0);
  const parts: string[] = [];
  let rest = m;
  if (perDay > 0 && rest >= perDay) {
    parts.push(`${Math.floor(rest / perDay)}d`);
    rest %= perDay;
  }
  const h = Math.floor(rest / 60);
  const mm = rest % 60;
  if (h) parts.push(`${h}h`);
  if (mm) parts.push(`${mm}m`);
  return parts.join(' ');
}

/** Convert an "HH:MM" string to minutes after midnight. Returns null if invalid. */
export function parseHHMM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
}

export function formatHHMM(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
