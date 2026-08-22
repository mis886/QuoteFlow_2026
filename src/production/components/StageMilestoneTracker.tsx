// Stage Milestone Tracker — dashboard widget.
// Each active job → planned vs actual progress for Mould/Finish/Inspect/PDI,
// RAG-coloured by today vs plan. Actuals drawn from daily append-only log tables.

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, Workflow } from 'lucide-react';
import {
  Table, THead, TH, TR, TD, EmptyRow, StatusPill,
} from './table';
import { fmtIST, fmtDate } from '../../lib/utils';
import {
  calcMilestones, stageRAG, currentStagePlan,
  type StageRAGDot,
} from '../lib/otdImpact';
import { productIdentity } from '../lib/productLabel';
import type { ProductionJob, ShopFloorSettings, MoldingSession, FinishingSession, InspectionSession } from '../lib/types';

const STAGE_SEQ = ['moulding', 'finishing', 'inspection', 'pdi'] as const;

export interface LogActuals {
  molding: MoldingSession[];
  finishing: FinishingSession[];
  inspection: InspectionSession[];
}

interface Props {
  jobs: ProductionJob[];
  settings: ShopFloorSettings | null;
  actuals?: LogActuals;
}

function jobActuals(jcId: string, actuals: LogActuals, plannedQty: number) {
  const molded  = actuals.molding.filter(s => s.job_card_id === jcId)
                    .reduce((a, s) => a + (s.qty_molded || 0), 0);
  const finished = actuals.finishing.filter(s => s.job_card_id === jcId)
                    .reduce((a, s) => a + (s.actual_qty || 0), 0);
  const passed  = actuals.inspection.filter(s => s.job_card_id === jcId)
                    .reduce((a, s) => a + (s.passed || 0), 0);

  const pct = (n: number) => plannedQty > 0 ? Math.min(100, Math.round((n / plannedQty) * 100)) : null;

  return {
    molded,  moldedPct:  pct(molded),
    finished, finishedPct: pct(finished),
    passed,  passedPct:  pct(passed),
  };
}

export function StageMilestoneTracker({ jobs, settings, actuals }: Props) {
  const plannedF = settings?.planned_finishers  ?? 6;
  const plannedI = settings?.planned_inspectors ?? 3;

  const rows = useMemo(() => {
    const active = jobs.filter(j => STAGE_SEQ.includes(j.stage as any));
    return active
      .map(j => {
        const ms  = calcMilestones(j, plannedF, plannedI);
        const cur = stageRAG(currentStagePlan(j, ms));
        const act = actuals ? jobActuals(j.id, actuals, j.qty || 0) : null;
        return { job: j, ms, cur, act };
      })
      .sort((a, b) => {
        const pri: Record<StageRAGDot, number> = { red: 0, amber: 1, green: 2, gray: 3 };
        const d = pri[a.cur.dot] - pri[b.cur.dot];
        if (d !== 0) return d;
        return (a.job.promised_date || '').localeCompare(b.job.promised_date || '');
      });
  }, [jobs, plannedF, plannedI, actuals]);

  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
      <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
        <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] flex-1">
          Stage Milestone Tracker
          <span className="ml-2 text-[#666] font-normal tracking-normal normal-case">
            {rows.length} active · sorted by urgency · 3-day dispatch buffer
          </span>
        </div>
        <Link
          to="/production/sequencer/mould"
          className="text-[11px] text-[#0A6ED1] hover:underline flex items-center gap-1"
        >
          <Workflow size={11} /> Sequencer →
        </Link>
      </div>

      <Table className="border-0">
        <THead>
          <tr>
            <TH>Job</TH>
            <TH>Product</TH>
            <TH>Stage Now</TH>
            <TH>🔵 Moulding</TH>
            <TH>🟡 Finishing</TH>
            <TH>🟣 Inspection</TH>
            <TH>🟤 PDI</TH>
            <TH>Promised</TH>
          </tr>
        </THead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={8} text="No active jobs to track." />
          ) : rows.map(({ job, ms, cur, act }) => {
            const curIdx = STAGE_SEQ.indexOf(job.stage as any);
            const stagePlans = [
              ms?.pmMouldStart,
              ms?.pmFinishStart,
              ms?.pmInspStart,
              ms?.pmPDIStart,
            ];
            // Actual progress % per stage
            const stageActualPcts = [
              act?.moldedPct ?? null,
              act?.finishedPct ?? null,
              act?.passedPct ?? null,
              null, // PDI — no separate log table yet
            ];

            return (
              <TR key={job.id}>
                <TD>
                  <div className="flex items-center gap-1.5">
                    <Dot dot={cur.dot} />
                    <Link to={`/production/jobs/${job.id}`}
                      className="font-mono text-[10.5px] font-bold text-[#0A6ED1] hover:underline">
                      {job.priority === 'emergency' && <span className="mr-1">🔴</span>}{job.id}
                    </Link>
                  </div>
                </TD>
                <TD>
                  <div className="font-semibold text-[#111] text-[12.5px] truncate max-w-[160px]">
                    {productIdentity(job)}
                  </div>
                  <div className="text-[10.5px] text-[#333] truncate max-w-[160px]">
                    {job.customer_name || '—'}
                  </div>
                </TD>
                <TD>
                  <StatusPill status={STAGE_LABEL[job.stage] || job.stage} tone="info" />
                </TD>
                {stagePlans.map((plan, idx) => (
                  <TD
                    key={idx}
                    className={idx === curIdx ? 'bg-red-mrt/5' : ''}
                  >
                    {idx < curIdx ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <Check size={13} className="text-[#107E3E]" />
                          {stageActualPcts[idx] !== null && (
                            <span className="text-[9.5px] text-[#107E3E] font-medium">{stageActualPcts[idx]}%</span>
                          )}
                        </div>
                      </div>
                    ) : plan ? (
                      <div className="flex flex-col gap-0.5">
                        <RAGCell plan={plan} />
                        {stageActualPcts[idx] !== null && (
                          <ActualBar pct={stageActualPcts[idx]!} isCurrent={idx === curIdx} />
                        )}
                      </div>
                    ) : (
                      <span className="text-[#555] text-[10.5px]">No plan</span>
                    )}
                  </TD>
                ))}
                <TD className="font-mono text-[11px] text-[#666]">
                  {fmtDate(job.promised_date)}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-[#E4E5E6] flex items-center gap-4 flex-wrap text-[10.5px] text-[#333]">
        <span className="flex items-center gap-1.5"><Dot dot="green" /> On track</span>
        <span className="flex items-center gap-1.5"><Dot dot="amber" /> Due today / tomorrow</span>
        <span className="flex items-center gap-1.5"><Dot dot="red" /> Milestone missed</span>
        <span className="ml-auto italic text-[#333]">
          Highlighted = current stage · ✓ = stage complete · bar = actual progress
        </span>
      </div>
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  moulding: 'Moulding', finishing: 'Finishing',
  inspection: 'Inspection', pdi: 'PDI',
};

function Dot({ dot }: { dot: StageRAGDot }) {
  const cls =
    dot === 'green' ? 'bg-sW' :
    dot === 'amber' ? 'bg-sP' :
    dot === 'red'   ? 'bg-red-mrt' :
                      'bg-g300';
  return <span className={`inline-block w-[8px] h-[8px] rounded-full shrink-0 ${cls}`} />;
}

function RAGCell({ plan }: { plan: string }) {
  const r = stageRAG(plan);
  const cls =
    r.dot === 'green' ? 'text-[#107E3E]' :
    r.dot === 'amber' ? 'text-[#E9730C]' :
    r.dot === 'red'   ? 'text-[#0A6ED1] font-semibold' :
                        'text-[#333]';
  return (
    <div className="inline-flex items-center gap-1.5">
      <Dot dot={r.dot} />
      <span className={`font-mono text-[11px] ${cls}`}>
        {fmtIST(new Date(plan), 'dd MMM')}
      </span>
      <span className="text-[9.5px] text-[#555]">{r.label}</span>
    </div>
  );
}

function ActualBar({ pct, isCurrent }: { pct: number; isCurrent: boolean }) {
  const barColor = pct >= 100
    ? 'bg-[#107E3E]'
    : isCurrent
      ? 'bg-[#0A6ED1]'
      : 'bg-[#C2D8F8]';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-[4px] bg-[#F0F0F0] rounded-full overflow-hidden min-w-[48px]">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-[9.5px] font-medium ${pct >= 100 ? 'text-[#107E3E]' : 'text-[#555]'}`}>{pct}%</span>
    </div>
  );
}
