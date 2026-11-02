// How long an active stock lot has been waiting for its COA (Stock Summary's
// "COA missing" cards). A lot's age runs from its inward date, in IST.
import type { StockLot } from './types';
import { fmtIST } from './utils';

export type CoaBucket = 'lt3' | '3to7' | '7to14' | '14to30' | 'over30';

export const COA_BUCKETS: { key: CoaBucket; label: string; range: string; card: string; pill: string }[] = [
  { key: 'lt3',    label: '< 3 days',        range: '0–2 days',   card: 'bg-[#E8F5E9] text-[#0B5C2A]', pill: 'bg-[#E8F5E9] text-[#0B5C2A] border-[#0B5C2A]/30' },
  { key: '3to7',   label: '3–7 days',        range: '3–6 days',   card: 'bg-amber-50 text-amber-700',  pill: 'bg-amber-50 text-amber-700 border-amber-300' },
  { key: '7to14',  label: '7–14 days',       range: '7–13 days',  card: 'bg-orange-50 text-orange-700', pill: 'bg-orange-50 text-orange-700 border-orange-300' },
  { key: '14to30', label: '14 days–1 month', range: '14–29 days', card: 'bg-[#FFEBEE] text-[#C62828]', pill: 'bg-[#FFEBEE] text-[#C62828] border-[#C62828]/30' },
  { key: 'over30', label: 'Over 1 month',    range: '30+ days',   card: 'bg-[#7F1D1D] text-white',     pill: 'bg-[#7F1D1D] text-white border-[#7F1D1D]' },
];

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return y && m && d ? Date.UTC(y, m - 1, d) / 86400000 : NaN;
};

export const isCoaMissing = (lot: Pick<StockLot, 'coaFile' | 'coaUrl'>): boolean =>
  !lot.coaFile?.trim() && !lot.coaUrl?.trim();

/** Whole days since the inward date, null if the lot has no usable one. */
export function coaAgeDays(lot: Pick<StockLot, 'inwardDate'>, today = fmtIST(new Date(), 'yyyy-MM-dd')): number | null {
  const days = dayNumber(today) - dayNumber(lot.inwardDate ?? '');
  return Number.isNaN(days) ? null : Math.max(0, days);
}

export function coaAgeBucket(lot: Pick<StockLot, 'inwardDate'>, today?: string): CoaBucket {
  const days = coaAgeDays(lot, today);
  if (days === null || days >= 30) return 'over30';
  return days < 3 ? 'lt3' : days < 7 ? '3to7' : days < 14 ? '7to14' : '14to30';
}
