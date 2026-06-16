// Job detail — Job Card layout, stage timeline, and quick actions.
// Mirrors Job Card.pdf section ordering.

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { generateJobCardPDF } from '../lib/jobCardPdf';
import {
  PageHeader, Table, THead, TH, TR, TD, EmptyRow, StatusPill,
  toneForStage, toneForStatus,
} from '../components/table';
import type { ProductionJob, JobStageEvent, Product } from '../lib/types';
import { productIdentity } from '../lib/productLabel';
import { fmtDate } from '../../lib/utils';

const STAGE_SEQ = ['moulding', 'finishing', 'inspection', 'pdi', 'dispatch'] as const;
const STAGE_LABEL: Record<string, string> = {
  queued: 'Queued', moulding: 'Moulding', finishing: 'Finishing',
  inspection: 'Inspection', pdi: 'PDI', dispatch: 'Dispatch', dispatched: 'Dispatched',
};

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<ProductionJob | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [pressNm, setPressNm] = useState<string | null>(null);
  const [events, setEvents] = useState<JobStageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    if (!job) return;
    setPrinting(true);
    try {
      await generateJobCardPDF(job);
    } catch (e) {
      console.error('Job Card PDF failed', e);
      alert('Could not generate Job Card. See console for details.');
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) return;
      setLoading(true);
      const [j, evs] = await Promise.all([
        supabase.from('prod_jobs').select('*').eq('id', id).single(),
        supabase.from('prod_job_stage_events').select('*').eq('job_id', id).order('ts', { ascending: true }),
      ]);
      if (!alive) return;
      if (j.data) setJob(j.data as ProductionJob);
      if (evs.data) setEvents(evs.data as JobStageEvent[]);
      // Resolve press name (the job stores the press PK in press_id).
      const prId = (j.data as ProductionJob | null)?.press_id;
      if (prId) {
        const { data: pr } = await supabase.from('prod_presses').select('name').eq('id', prId).single();
        if (alive) setPressNm((pr as { name?: string } | null)?.name || prId);
      } else if (alive) {
        setPressNm(null);
      }
      const pid = (j.data as ProductionJob | null)?.product_id;
      if (pid) {
        const { data: p } = await supabase.from('prod_products').select('*').eq('id', pid).single();
        if (alive) setProduct((p as Product) || null);
      } else if (alive) {
        setProduct(null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return <div className="p-8 text-[13px] text-[#333]">Loading job…</div>;
  }
  if (!job) {
    return (
      <div className="p-8">
        <Button variant="secondary" onClick={() => navigate('/production/jobs')} className="gap-1">
          <ArrowLeft size={12} /> Back
        </Button>
        <div className="mt-4 text-[13px] text-[#333]">Job not found.</div>
      </div>
    );
  }

  const curIdx = STAGE_SEQ.indexOf(job.stage as any);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module={`Production · ${job.id}`}
        title={<>Job Card</>}
        accent={job.id}
        subtitle={`${job.customer_name || '—'} · ${productIdentity(job)}${product ? ` — ${product.name}` : ''} · ${job.qty.toLocaleString()} pcs`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/production/jobs')} className="gap-1">
              <ArrowLeft size={12} /> Back
            </Button>
            <Button variant="dark" onClick={handlePrint} disabled={printing} className="gap-1">
              {printing ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
              {printing ? 'Generating…' : 'Print Job Card'}
            </Button>
          </>
        }
      />

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto space-y-4">
        {job.priority === 'emergency' && (
          <div className="bg-[#E8F0FD] border border-[#0A6ED1]/30 rounded-[3px] px-3 py-2.5 flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#0A6ED1] shrink-0" />
            <div className="text-[12px] text-[#0A6ED1] flex-1">
              <strong>🔴 EMERGENCY PO</strong>
              {job.emergency_reason && <> — {job.emergency_reason}</>}
            </div>
          </div>
        )}

        {/* Header status row */}
        <div className="bg-white border border-[#E4E5E6] rounded-[3px] px-4 py-3 flex items-center gap-3 flex-wrap">
          <StatusPill status={`Stage: ${STAGE_LABEL[job.stage]}`} tone={toneForStage(job.stage)} />
          <StatusPill status={`Status: ${job.status}`} tone={toneForStatus(job.status)} />
          {job.otd_result === 'on-time' && <span className="text-[11px] text-[#107E3E] font-semibold">✓ OTD: On Time</span>}
          {job.otd_result === 'late'    && <span className="text-[11px] text-[#0A6ED1] font-semibold">✗ OTD: Late</span>}
          {job.order_id && (
            <Link
              to={`/orders`}
              className="ml-auto text-[11px] text-[#0A6ED1] hover:underline font-mono"
            >
              Linked CRM Order: {job.order_id}
            </Link>
          )}
        </div>

        {/* Customer & Order Info — matches Job Card.pdf row 1 */}
        <Section title="Customer & Order Information">
          <Grid4>
            <Field label="Customer ID"     value={job.customer_id || '—'} />
            <Field label="Party Name"       value={job.customer_name || '—'} />
            <Field label="Customer PO No"   value={job.order_id || '—'} />
            <Field label="Order Date"        value={job.order_start_date || '—'} />
            <Field label="Press No"         value={pressNm || job.press_id || '—'} />
            <Field label="Total Quantity"   value={job.qty.toLocaleString()} />
            <Field label="Promised Date"    value={fmtDate(job.promised_date)} accent />
            <Field label="Priority"         value={job.priority.toUpperCase()} accent={job.priority === 'emergency'} />
          </Grid4>
        </Section>

        {/* Molding Description & Material */}
        <Section title="Molding Description & Material Requirements">
          <Grid4>
            <Field label="Job Card #"       value={job.job_card_no || '—'} mono />
            <Field label="Die No. / MOC"     value={job.mould_code || '—'} mono />
            <Field label="Tikli Size"       value={job.tikli_size || '—'} />
            <Field label="Ordered Qty"      value={job.qty.toLocaleString()} />
            <Field label="Qty To Mold"      value={(job.qty_to_mould ?? job.qty).toLocaleString()} />
            <Field label="Qty Done"         value={(job.qty_done ?? 0).toLocaleString()} />
            <Field label="Compound (Type)"  value={job.compound_code || '—'} mono />
            <Field label="Cure Time (min)"  value={job.cure_time_min != null ? `${job.cure_time_min} min` : '—'} />
          </Grid4>
        </Section>

        {/* Production Planning & Control */}
        <Section title="Production Planning & Control">
          <Grid4>
            <Field label="Cavities"                value={job.cavities != null ? String(job.cavities) : '—'} />
            <Field label="Cure Temp"                value={job.cure_temp_c != null ? `${job.cure_temp_c} °C` : '—'} />
            <Field label="Batch"                    value={job.batch_code ? `${job.batch_code}${job.batch_name ? ` · ${job.batch_name}` : ''}` : '—'} />
            <Field label="LSD (Latest Start)"      value={job.lsd || '—'} accent />
            <Field label="Order Start Date"        value={job.order_start_date || '—'} />
            <Field label="Target Completion"        value={job.target_completion_date || '—'} />
            <Field label="FG Stock (at print)"     value={job.fg_stock_at_print != null ? String(job.fg_stock_at_print) : 'N/A'} />
            <Field label="WIP Stock (at print)"    value={job.wip_stock_at_print != null ? String(job.wip_stock_at_print) : 'N/A'} />
          </Grid4>
        </Section>

        {/* Operation Tracking & Timeline */}
        <Section title="Operation Tracking & Timeline">
          <Table>
            <THead>
              <tr>
                <TH>Work Station</TH>
                <TH>Operation</TH>
                <TH>Quantity</TH>
                <TH>Planned Start</TH>
                <TH>Actual Start</TH>
                <TH>Planned End</TH>
                <TH>Actual End</TH>
                <TH>Duration (Hrs)</TH>
                <TH>Status</TH>
                <TH>Notes</TH>
              </tr>
            </THead>
            <tbody>
              {STAGE_SEQ.map((s, i) => {
                const done = i < curIdx;
                const active = i === curIdx;
                const enter = events.find(e => e.to_stage === s);
                const exit  = events.find(e => e.from_stage === s);
                const dur = enter && exit
                  ? ((new Date(exit.ts).getTime() - new Date(enter.ts).getTime()) / 3_600_000).toFixed(2)
                  : '—';
                return (
                  <TR key={s}>
                    <TD className="font-mono text-[10.5px] font-bold text-[#666]">Section-{String(i + 1).padStart(2, '0')}</TD>
                    <TD className="font-semibold">{STAGE_LABEL[s]}</TD>
                    <TD className="font-mono text-[11.5px]">{job.qty.toLocaleString()}</TD>
                    <TD className="text-[#333]">—</TD>
                    <TD className="text-[11px] text-[#666]">{enter ? new Date(enter.ts).toLocaleString() : '—'}</TD>
                    <TD className="text-[#333]">—</TD>
                    <TD className="text-[11px] text-[#666]">{exit ? new Date(exit.ts).toLocaleString() : '—'}</TD>
                    <TD className="font-mono text-[11px]">{dur}</TD>
                    <TD>
                      {done    && <StatusPill status="Done"    tone="good" />}
                      {active  && <StatusPill status="Active"  tone="info" />}
                      {!done && !active && <StatusPill status="Pending" tone="neutral" />}
                    </TD>
                    <TD className="text-[11px] text-[#666]">{enter?.notes || exit?.notes || '—'}</TD>
                  </TR>
                );
              })}
              {curIdx === -1 && events.length === 0 && (
                <EmptyRow colSpan={10} text="Job hasn't started yet." />
              )}
            </tbody>
          </Table>
        </Section>

        {/* Quality Control & Sign-off */}
        <Section title="Quality Control & Sign-off">
          <Grid4>
            <Field label="Press Operator"       value={job.press_operator_name || '—'} />
            <Field label="Finishing Checked By" value={job.finishing_checked_by || '—'} />
            <Field label="Inspection Checked"   value={job.inspection_checked_by || '—'} />
            <Field label="Approved By"           value={job.approved_by || '—'} />
            <Field label="Inspector"             value={job.inspector || '—'} />
            <Field label="Inspection Result"    value={job.inspection_result || '—'} />
            <Field label="PDI Officer"           value={job.pdi_officer || '—'} />
            <Field label="PDI Timestamp"         value={job.inspection_passed_at ? new Date(job.inspection_passed_at).toLocaleString() : '—'} />
          </Grid4>
        </Section>

        {/* Dispatch */}
        {(job.stage === 'dispatch' || job.stage === 'dispatched') && (
          <Section title="Dispatch">
            <Grid4>
              <Field label="Courier"         value={job.courier || '—'} />
              <Field label="Consignment No."  value={job.consignment_no || '—'} />
              <Field label="Dispatched At"    value={job.dispatched_at ? new Date(job.dispatched_at).toLocaleString() : '—'} />
              <Field label="OTD Result"       value={job.otd_result || '—'}
                accent={job.otd_result === 'late'} />
            </Grid4>
          </Section>
        )}

        {job.notes && (
          <Section title="Notes">
            <div className="text-[12.5px] text-[#444] whitespace-pre-wrap">{job.notes}</div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function Grid4({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px] grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-[#F3F3F3]">
      {children}
    </div>
  );
}

function Field({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="px-3 py-2">
      <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[#333] mb-0.5">
        {label}
      </div>
      <div className={`text-[12.5px] ${mono ? 'font-mono' : ''} ${accent ? 'text-[#0A6ED1] font-semibold' : 'text-[#111] font-medium'}`}>
        {value}
      </div>
    </div>
  );
}
