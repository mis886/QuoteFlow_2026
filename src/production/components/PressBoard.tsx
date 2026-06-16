// Live Press Board — 4 cards, one per press.
// Styled to match MRT ERP v2 (.pc / .pb / .dt / .pg spec).

import { cn } from '../../lib/utils';
import { productIdentity } from '../lib/productLabel';
import type { Press, ProductionJob } from '../lib/types';

interface Props {
  presses: Press[];
  jobs: ProductionJob[];
  onAssign?: (pressId: string) => void;
  onMarkDone?: (pressId: string) => void;
}

const DOT: Record<Press['status'], string> = {
  idle:        'bg-[#C0C0C0]',
  setup:       'bg-[#E9730C]',
  running:     'bg-[#107E3E]',
  maintenance: 'bg-[#6A6D70]',
};

const BAR: Record<Press['status'], string> = {
  idle:        'bg-[#C0C0C0]',
  setup:       'bg-[#E9730C]',
  running:     'bg-[#107E3E]',
  maintenance: 'bg-[#C0C0C0]',
};

const STATUS_LABEL: Record<Press['status'], string> = {
  idle:        'IDLE',
  setup:       'SETUP',
  running:     'RUNNING',
  maintenance: 'MAINTENANCE',
};

// CSS-variable-driven progress fill — avoids inline style prop
function ProgressFill({ pct, status }: { pct: number; status: Press['status'] }) {
  return (
    <div
      className={cn('h-full rounded-[2px] press-bar-fill', BAR[status])}
      ref={el => { if (el) el.style.width = `${pct}%`; }}
    />
  );
}

export function PressBoard({ presses, jobs, onAssign, onMarkDone }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {presses.map(p => {
        const job = jobs.find(j => j.id === p.active_job_id);
        const emergency = job?.priority === 'emergency';
        return (
          <div
            key={p.id}
            className={cn(
              'bg-white border border-[#E4E5E6] rounded-[3px] p-[10px_12px]',
              emergency && 'border-[#FFCDD2] border-l-[3px] border-l-[#BB0000]'
            )}
          >
            {/* Header: press name + status dot */}
            <div className="flex items-center justify-between mb-[5px]">
              <span className="text-[9px] font-bold text-[#333] uppercase tracking-[0.5px]">
                {p.name} · {p.tonnage}T
              </span>
              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', DOT[p.status])} />
            </div>

            {/* Job info */}
            {job ? (
              <>
                <div className="text-[12px] font-semibold text-[#111] mb-[2px]">
                  {emergency && <span className="text-[#BB0000] mr-0.5">🔴</span>}
                  {job.id}
                </div>
                <div className="text-[10px] text-[#333] leading-snug mb-[6px]">
                  {productIdentity(job)}<br />{job.customer_name}
                </div>
              </>
            ) : (
              <>
                <div className="text-[12px] font-semibold text-[#333] mb-[2px]">
                  {STATUS_LABEL[p.status]}
                </div>
                <div className="text-[10px] text-[#555] mb-[6px]">
                  {p.eta_text || 'Awaiting job'}
                </div>
              </>
            )}

            {/* Progress bar */}
            <div className="h-1 bg-[#EBEBEB] rounded-[2px] overflow-hidden">
              <ProgressFill pct={p.pct_done || 0} status={p.status} />
            </div>
            <div className="text-[9px] text-[#333] mt-1">
              {p.pct_done ? `${p.pct_done}% · ${p.eta_text || ''}` : p.eta_text || '—'}
            </div>

            {/* Actions */}
            {p.status === 'idle' && onAssign && (
              <button
                type="button"
                onClick={() => onAssign(p.id)}
                className="mt-2 w-full text-[10.5px] font-medium text-[#0A6ED1] border border-[#0A6ED1] rounded-[3px] px-2 py-1 bg-white hover:bg-[#E8F0FD] transition-colors"
              >
                + Assign Job
              </button>
            )}
            {p.status === 'setup' && onMarkDone && (
              <button
                type="button"
                onClick={() => onMarkDone(p.id)}
                className="mt-2 w-full text-[10.5px] font-medium text-[#E9730C] border border-[#E9730C] rounded-[3px] px-2 py-1 bg-white hover:bg-[#FFF3E0] transition-colors"
              >
                ✓ Mark Running
              </button>
            )}
            {p.status === 'running' && onMarkDone && (
              <button
                type="button"
                onClick={() => onMarkDone(p.id)}
                className="mt-2 w-full text-[10.5px] font-medium text-[#107E3E] border border-[#107E3E] rounded-[3px] px-2 py-1 bg-white hover:bg-[#E8F5E9] transition-colors"
              >
                ✓ Mark Done
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
