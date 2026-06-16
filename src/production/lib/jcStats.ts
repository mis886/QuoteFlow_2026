// ─────────────────────────────────────────────────────────────────────────────
// Beta append-only helpers — pure functions, no Supabase calls.
// jcStats, deriveJCStatus, readyQty, ID generators, split validator.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ProductionJob,
  MoldingSession,
  FinishingSession,
  InspectionSession,
  DispatchItem,
  JCStats,
  JCDerivedStatus,
} from './types';

// ── Aggregate stats for one Job Card ─────────────────────────────────────────

export function jcStats(
  jcId: string,
  molding:    MoldingSession[],
  finishing:  FinishingSession[],
  inspection: InspectionSession[],
  dispItems:  DispatchItem[],
  reversedDispatchIds?: Set<string>,   // items of these dispatches don't count as dispatched
): JCStats {
  const molded    = molding.filter(m => m.job_card_id === jcId)
                           .reduce((a, m) => a + (m.qty_molded || 0), 0);
  const finished  = finishing.filter(f => f.job_card_id === jcId)
                             .reduce((a, f) => a + (f.actual_qty || 0), 0);
  const insRows   = inspection.filter(i => i.job_card_id === jcId);
  const passed    = insRows.reduce((a, i) => a + (i.passed   || 0), 0);
  const rejected  = insRows.reduce((a, i) => a + (i.rejected || 0), 0);
  const rework    = insRows.reduce((a, i) => a + (i.rework   || 0), 0);
  const scrapped  = insRows.reduce((a, i) => a + (i.scrapped || 0), 0);
  const dispatched = dispItems
    .filter(d => d.job_card_id === jcId)
    .filter(d => !(reversedDispatchIds && d.dispatch_id && reversedDispatchIds.has(d.dispatch_id)))
    .reduce((a, d) => a + (d.qty_dispatched || 0), 0);
  const yieldRate = molded > 0 ? Math.round((passed / molded) * 100) : 0;
  const readyQty  = Math.max(0, passed - dispatched);
  return { molded, finished, passed, rejected, rework, scrapped, dispatched, yieldRate, readyQty };
}

// Build the set of reversed dispatch IDs from a dispatch list, for jcStats.
export function reversedDispatchIdSet(dispatches: { id: string; status?: string }[]): Set<string> {
  return new Set(dispatches.filter(d => d.status === 'Reversed').map(d => d.id));
}

// ── Derived status — never stored ────────────────────────────────────────────

export function deriveJCStatus(
  jc: ProductionJob,
  stats: JCStats,
  molding:    MoldingSession[],
  finishing:  FinishingSession[],
  inspection: InspectionSession[],
): JCDerivedStatus {
  const planned = jc.qty || 0;
  if (planned > 0 && stats.dispatched >= planned)         return 'Dispatched';
  if (stats.dispatched > 0)                               return 'Partially Dispatched';
  if (stats.passed > 0)                                   return 'Ready to Dispatch';
  if (inspection.some(i => i.job_card_id === jc.id))      return 'Inspection';
  if (finishing.some(f => f.job_card_id === jc.id))       return 'Finishing';
  if (molding.some(m => m.job_card_id === jc.id))         return 'Molding';
  return 'Pending Molding';
}

// ── Status colour (stable per stage) ─────────────────────────────────────────

export const JC_STATUS_COLOR: Record<JCDerivedStatus, {
  bg: string; text: string; border: string;
  chipCls: string;        // pre-built Tailwind classes for the status chip
  activeChipCls: string;  // when the chip is selected (filter button)
}> = {
  'Pending Molding':     { bg: '#F5F6F7', text: '#6A6D70', border: '#E4E5E6', chipCls: 'bg-[#F5F6F7] text-[#6A6D70] border-[#E4E5E6]', activeChipCls: 'bg-[#6A6D70] text-white border-[#6A6D70]' },
  'Molding':             { bg: '#FFF3E0', text: '#E9730C', border: '#FFE0B2', chipCls: 'bg-[#FFF3E0] text-[#E9730C] border-[#FFE0B2]', activeChipCls: 'bg-[#E9730C] text-white border-[#E9730C]' },
  'Finishing':           { bg: '#E8F0FD', text: '#0A6ED1', border: '#C2D8F8', chipCls: 'bg-[#E8F0FD] text-[#0A6ED1] border-[#C2D8F8]', activeChipCls: 'bg-[#0A6ED1] text-white border-[#0A6ED1]' },
  'Inspection':          { bg: '#F3E8FD', text: '#7C3AED', border: '#DDD6FE', chipCls: 'bg-[#F3E8FD] text-[#7C3AED] border-[#DDD6FE]', activeChipCls: 'bg-[#7C3AED] text-white border-[#7C3AED]' },
  'Ready to Dispatch':   { bg: '#E8F5E9', text: '#107E3E', border: '#C5E1A5', chipCls: 'bg-[#E8F5E9] text-[#107E3E] border-[#C5E1A5]', activeChipCls: 'bg-[#107E3E] text-white border-[#107E3E]' },
  'Partially Dispatched':{ bg: '#FFEBEE', text: '#BB0000', border: '#FFCDD2', chipCls: 'bg-[#FFEBEE] text-[#BB0000] border-[#FFCDD2]', activeChipCls: 'bg-[#BB0000] text-white border-[#BB0000]' },
  'Dispatched':          { bg: '#F5F6F7', text: '#6A6D70', border: '#E4E5E6', chipCls: 'bg-[#F5F6F7] text-[#6A6D70] border-[#E4E5E6]', activeChipCls: 'bg-[#6A6D70] text-white border-[#6A6D70]' },
};

// ── ID generators — scan existing records, year-prefixed ─────────────────────

function nextId(prefix: string, existing: string[]): string {
  const yr = new Date().getFullYear();
  const pat = new RegExp(`^${prefix}-${yr}-(\\d+)$`);
  const nums = existing.map(id => { const m = id.match(pat); return m ? parseInt(m[1], 10) : 0; });
  const next = (Math.max(0, ...nums) + 1).toString().padStart(5, '0');
  return `${prefix}-${yr}-${next}`;
}

export const nextMldId = (existing: string[]) => nextId('MLD', existing);
export const nextFinId = (existing: string[]) => nextId('FIN', existing);
export const nextInsId = (existing: string[]) => nextId('INS', existing);
export const nextPdiId = (existing: string[]) => nextId('PDI', existing);
export const nextDspId = (existing: string[]) => nextId('DSP', existing);

export function nextDspItemId(seq: number): string {
  return `DI-${Date.now()}-${seq.toString().padStart(2, '0')}`;
}

// ── Inspection split validator ────────────────────────────────────────────────

export interface SplitValidation {
  ok: boolean;
  diff: number;   // positive = over, negative = under
  message: string;
}

export function validateInsSplit(
  qtyToInspect: number,
  passed: number,
  rejected: number,
  rework: number,
  scrapped: number,
): SplitValidation {
  const sum = passed + rejected + rework + scrapped;
  const diff = sum - qtyToInspect;
  if (diff === 0) return { ok: true,  diff: 0,    message: '✓ Split balances' };
  if (diff >  0)  return { ok: false, diff,        message: `${diff} over — remove ${diff} from a bucket` };
  return              { ok: false, diff,            message: `${Math.abs(diff)} still unallocated` };
}

// ── Rework queue scanner ──────────────────────────────────────────────────────

export interface ReworkTask {
  jcId: string;
  inspId: string;
  qty: number;
  date: string;
  productDesc?: string;
}

export function getReworkQueue(
  inspection: InspectionSession[],
  finishing:  FinishingSession[],
  jobs: ProductionJob[],
): ReworkTask[] {
  return inspection
    .filter(i => (i.rework || 0) > 0)
    .map(i => {
      // How much rework finishing has already been logged for this inspection?
      const alreadyDone = finishing
        .filter(f => f.job_card_id === i.job_card_id && f.is_rework)
        .reduce((a, f) => a + (f.actual_qty || 0), 0);
      const remaining = (i.rework || 0) - alreadyDone;
      const job = jobs.find(j => j.id === i.job_card_id);
      return { jcId: i.job_card_id, inspId: i.id, qty: remaining, date: i.inspection_date, productDesc: job?.product_desc };
    })
    .filter(r => r.qty > 0);
}

// ── Working time calculator ───────────────────────────────────────────────────

export function calcWorkingMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // midnight wrap
  return mins;
}
