// Finishing tab — qty-done editor + live OTD-impact risk columns.
// Styled to match MRT ERP v2 design system.

import { useState, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  Table, THead, TH, TR, TD, EmptyRow, StatusPill,
} from '../../components/table';
import type { ProductionJob, Worker, ShopFloorSettings } from '../../lib/types';
import { productIdentity } from '../../lib/productLabel';
import { fmtDate } from '../../../lib/utils';
import { setJobQtyDone } from '../../lib/actions';
import { getJobImpact } from '../../lib/otdImpact';

interface Props {
  jobs: ProductionJob[];
  workers: Worker[];
  settings: ShopFloorSettings | null;
  onQtyDoneChange: () => void | Promise<void>;
  onAdvance: (jobId: string) => void | Promise<void>;
}

export function FinishingTab({ jobs, workers, settings, onQtyDoneChange, onAdvance }: Props) {
  const finishers  = workers.filter(w => w.department === 'finishing'  && w.present).length;
  const inspectors = workers.filter(w => w.department === 'inspection' && w.present).length;
  const hc = { finishers: Math.max(1, finishers), inspectors: Math.max(1, inspectors) };

  const impacts = useMemo(() =>
    jobs.map(j => ({ job: j, impact: getJobImpact(j, hc) }))
        .sort((a, b) => {
          const r = { breach: 0, atrisk: 1, safe: 2 } as const;
          return r[a.impact.risk] - r[b.impact.risk];
        }),
    [jobs, hc.finishers, hc.inspectors]
  );

  const atRiskCount = impacts.filter(i => i.impact.risk !== 'safe').length;

  return (
    <div className="space-y-3">
      {/* Capacity row */}
      <div className="bg-[#FAFAFA] border border-[#E4E5E6] rounded-[3px] px-3 py-2 flex flex-wrap items-center gap-3 text-[12px] text-[#111]">
        <span><strong>{finishers}</strong> <span className="text-[#333]">finishers present</span></span>
        <span className="text-[#C0C0C0]">·</span>
        <span><strong>{inspectors}</strong> <span className="text-[#333]">inspectors present</span></span>
        {settings && (
          <>
            <span className="text-[#C0C0C0]">·</span>
            <span className="text-[#333]">Shift left: <strong className="text-[#111]">{settings.shift_hours_left}h</strong></span>
            <span className="text-[#C0C0C0]">·</span>
            <span className="text-[#333]">OT: <strong className="text-[#111]">{settings.overtime_max}h</strong></span>
          </>
        )}
        <span className="ml-auto text-[10px] text-[#333]">
          {jobs.length} job{jobs.length === 1 ? '' : 's'} in queue
        </span>
      </div>

      {atRiskCount > 0 && (
        <div className="bg-[#FFF8EC] border border-[#FFE0B2] rounded-[3px] px-3 py-2 text-[12px] text-[#E9730C]">
          <strong>{atRiskCount}</strong> of {impacts.length} jobs projected to miss promised date.
          Adjust headcount on Shift Briefing or authorise OT.
        </div>
      )}

      <Table>
        <THead>
          <tr>
            <TH>Job ID</TH>
            <TH>Product</TH>
            <TH>Customer</TH>
            <TH>Qty</TH>
            <TH>Pcs Done</TH>
            <TH>Rem. TAT</TH>
            <TH>Buffer</TH>
            <TH>Risk</TH>
            <TH>LSD</TH>
            <TH>Promised</TH>
            <TH>Action</TH>
          </tr>
        </THead>
        <tbody>
          {jobs.length === 0 ? (
            <EmptyRow colSpan={11} text="No jobs in Finishing." />
          ) : impacts.map(({ job, impact }) => (
            <FinishingRow
              key={job.id}
              job={job}
              remHrs={impact.remHrs}
              bufferHrs={impact.bufferHrs}
              risk={impact.risk}
              onQtyDoneSaved={onQtyDoneChange}
              onAdvance={() => onAdvance(job.id)}
            />
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function FinishingRow({
  job, remHrs, bufferHrs, risk, onQtyDoneSaved, onAdvance,
}: {
  job: ProductionJob;
  remHrs: number;
  bufferHrs: number;
  risk: 'safe' | 'atrisk' | 'breach';
  onQtyDoneSaved: () => void | Promise<void>;
  onAdvance: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<string>(String(job.qty_done || 0));
  const [saving, setSaving]   = useState(false);

  const commit = async () => {
    const n = Math.max(0, Math.min(job.qty, Math.floor(Number(draft) || 0)));
    setSaving(true);
    try { await setJobQtyDone(job.id, n); await onQtyDoneSaved(); }
    finally { setSaving(false); setEditing(false); }
  };

  return (
    <TR>
      <TD>
        <span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">
          {job.priority === 'emergency' && <span className="mr-1">🔴</span>}{job.id}
        </span>
      </TD>
      <TD className="font-semibold text-[#111]">{productIdentity(job)}</TD>
      <TD className="text-[12px]">{job.customer_name || '—'}</TD>
      <TD className="font-mono text-[11px]">{job.qty.toLocaleString()}</TD>
      <TD>
        {editing ? (
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              autoFocus
              value={draft}
              min={0}
              max={job.qty}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
              className="w-[80px] font-mono text-[11px] border border-[#E4E5E6] rounded-[3px] px-2 py-0.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-[#0A6ED1]/10"
              title="Pieces done"
            />
            {saving && <span className="text-[10px] text-[#333]">…</span>}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setDraft(String(job.qty_done || 0)); setEditing(true); }}
            className="font-mono text-[11px] text-[#111] hover:bg-[#F5F6F7] border border-dashed border-[#E4E5E6] rounded-[3px] px-2 py-0.5"
            title="Click to edit"
          >
            {(job.qty_done || 0).toLocaleString()} <span className="text-[#333]">✎</span>
          </button>
        )}
      </TD>
      <TD className="font-mono text-[11px]">{fmtHrs(remHrs)}</TD>
      <TD className={`font-mono text-[11px] font-semibold ${bufferHrs < 0 ? 'text-[#BB0000]' : 'text-[#107E3E]'}`}>
        {bufferHrs >= 0 ? '+' : ''}{fmtHrs(bufferHrs)}
      </TD>
      <TD>
        <StatusPill
          status={risk.toUpperCase()}
          tone={risk === 'breach' ? 'bad' : risk === 'atrisk' ? 'warn' : 'good'}
        />
      </TD>
      <TD className="font-mono text-[11px] text-[#333]">{job.lsd || '—'}</TD>
      <TD className="font-mono text-[11px] text-[#333]">{fmtDate(job.promised_date)}</TD>
      <TD>
        <button
          type="button"
          onClick={onAdvance}
          className="inline-flex items-center gap-1 bg-[#107E3E] text-white text-[10.5px] font-medium px-[8px] py-[3px] rounded-[3px] hover:bg-[#0B5C2A] transition-colors"
        >
          <ArrowRight size={11} /> Inspection
        </button>
      </TD>
    </TR>
  );
}

function fmtHrs(h: number) {
  if (!isFinite(h)) return '—';
  const abs = Math.abs(h);
  if (abs >= 24) return `${(h / 24).toFixed(1)}d`;
  return `${h.toFixed(1)}h`;
}
