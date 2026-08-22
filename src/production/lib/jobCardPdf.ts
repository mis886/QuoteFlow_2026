// Job Card PDF generator — matches Job Card.pdf layout (six section bands).
// Uses the same jsPDF + autoTable toolchain as src/lib/pdfGenerator.ts.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProductionJob, JobStageEvent } from './types';
import { supabase } from '../../lib/supabase';

// Layout constants
const TITLE_BAND: [number, number, number] = [53, 74, 94];     // SAP-blue band
const BAND_TEXT: [number, number, number] = [255, 255, 255];
const CELL_LABEL: [number, number, number] = [110, 110, 115];
const CELL_TEXT: [number, number, number]  = [30, 30, 30];
const HAIRLINE: [number, number, number]    = [200, 200, 205];
const STATUS_AMBER_BG: [number, number, number] = [255, 240, 215];
const STATUS_AMBER_TX: [number, number, number] = [180, 110, 0];
const STATUS_GREEN_BG: [number, number, number] = [225, 245, 230];
const STATUS_GREEN_TX: [number, number, number] = [30, 110, 60];
const STATUS_RED_BG:   [number, number, number] = [255, 230, 230];
const STATUS_RED_TX:   [number, number, number] = [180, 30, 30];

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${String(h).padStart(2, '0')}:${min} ${ap}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} 12:00 AM`;
}

function fmtDur(hours: number): string {
  if (!isFinite(hours) || hours <= 0) return '0:00:00';
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

const STAGE_LABEL: Record<string, string> = {
  moulding: 'Molding', finishing: 'Finishing',
  inspection: 'Inspection', dispatch: 'Dispatch',
};

interface PrintSettings {
  header_url?: string | null;
}

// Fetch the company header image once (reused from CRM app_settings).
async function fetchHeader(): Promise<string | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('header_url')
    .eq('id', 'config')
    .single();
  return (data as PrintSettings | null)?.header_url || null;
}

async function fetchStageEvents(jobId: string): Promise<JobStageEvent[]> {
  const { data } = await supabase
    .from('prod_job_stage_events')
    .select('*')
    .eq('job_id', jobId)
    .order('ts', { ascending: true });
  return (data || []) as JobStageEvent[];
}

export async function generateJobCardPDF(job: ProductionJob, download = true): Promise<jsPDF> {
  const [headerUrl, events] = await Promise.all([
    fetchHeader(),
    fetchStageEvents(job.id),
  ]);

  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = 210;
  const mx = 12;
  const rx = pw - mx;
  const cw = rx - mx;
  let y = 0;

  // ── Letterhead ──────────────────────────────────────────────────────────
  const headerH = 30;
  if (headerUrl) {
    const fmt = headerUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    try { doc.addImage(headerUrl, fmt, mx, 6, cw, headerH); }
    catch (e) { console.warn('Job Card header failed', e); }
    y = 6 + headerH;
  } else {
    doc.setFont('times', 'bold'); doc.setFontSize(20); doc.setTextColor(30, 30, 30);
    doc.text('MANGLA', pw / 2, 14, { align: 'center' });
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('Excellence Since 1981', pw / 2, 19, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
    doc.text('Himalaya TerpenesRubber Technologies', pw / 2, 25, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
    doc.text('Manufacturing Excellence • Quality Assured • Customer Focused', pw / 2, 29, { align: 'center' });
    y = 34;
  }

  // Thin separator
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(mx, y, rx, y);
  y += 3;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const sectionBand = (label: string) => {
    doc.setFillColor(...TITLE_BAND);
    doc.rect(mx, y, cw, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.setTextColor(...BAND_TEXT);
    doc.text(label, pw / 2, y + 4, { align: 'center' });
    y += 6;
  };

  type Cell = {
    label: string;
    value: string;
    statusBg?: [number, number, number];
    statusTx?: [number, number, number];
  };

  // Render a row of N cells with label-on-top, value-below layout.
  const cellRow = (cells: Cell[], rowH = 14) => {
    const colW = cw / cells.length;
    cells.forEach((c, i) => {
      const cx = mx + i * colW;
      // Cell border (hairline)
      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.2);
      doc.rect(cx, y, colW, rowH);

      // Label
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.setTextColor(...CELL_LABEL);
      doc.text(c.label, cx + 1.6, y + 3);

      // Value — bold, large, wraps within column
      const valY = y + 8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.setTextColor(...CELL_TEXT);
      const wrapped = doc.splitTextToSize(c.value || '—', colW - 3) as string[];
      wrapped.slice(0, 2).forEach((line, k) =>
        doc.text(line, cx + 1.6, valY + k * 3.5)
      );

      // Optional status pill (for priority/status cells)
      if (c.statusBg && c.statusTx) {
        const pillX = cx + 1.6;
        const pillY = valY - 3;
        const pillW = doc.getTextWidth(c.value || '—') + 4;
        doc.setFillColor(...c.statusBg);
        doc.roundedRect(pillX, pillY, pillW, 4.5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
        doc.setTextColor(...c.statusTx);
        doc.text(c.value || '—', pillX + 2, pillY + 3.2);
      }
    });
    y += rowH;
  };

  // ── Section 1: Customer & Order Information ─────────────────────────────
  sectionBand('CUSTOMER & ORDER INFORMATION');

  const partyName = job.customer_id
    ? `${job.customer_id}: ${job.customer_name || ''}`
    : (job.customer_name || '—');

  cellRow([
    { label: 'Customer ID',  value: job.job_card_no || job.id },
    { label: 'Party Name',    value: partyName },
    { label: 'Customer PO No', value: job.order_id || '—' },
    { label: 'Order Date',    value: fmtDate(job.order_start_date || job.created_at) },
  ], 14);

  // Product identity — Type_Model_MOC (falls back to description for legacy jobs)
  cellRow([
    { label: 'Item (Type·Model·MOC)', value: job.family_code || job.product_desc || '—' },
  ], 10);

  // Priority pill colour
  const isEmergency = job.priority === 'emergency';
  const moldingTAT = (() => {
    // qty / (cavities * (60/cure_time)) hours, mostly informational
    const cav = job.cavities || 1;
    const ct  = job.cure_time_min || 18;
    const rate = (60 / ct) * cav;       // pcs/hr
    const qty = job.qty || 0;
    const hrs = rate > 0 ? qty / rate : 0;
    return fmtDur(hrs);
  })();

  cellRow([
    { label: 'Press No',         value: job.press_id || '—' },
    { label: 'Total Quantity',   value: (job.qty || 0).toFixed(2) },
    { label: 'Molding TAT',      value: `${moldingTAT} hours` },
    {
      label: 'Priority Status',
      value: (job.priority || 'normal').toUpperCase(),
      statusBg: isEmergency ? STATUS_RED_BG : STATUS_AMBER_BG,
      statusTx: isEmergency ? STATUS_RED_TX : STATUS_AMBER_TX,
    },
  ], 14);

  y += 2;

  // ── Section 2: Molding Description & Material Requirements ──────────────
  sectionBand('MOLDING DESCRIPTION & MATERIAL REQUIREMENTS');

  cellRow([
    { label: 'Job Card Linked', value: job.job_card_no || job.id },
    { label: 'Die No./MOC',      value: job.mould_code || '—' },
    { label: 'Tikli Size',        value: job.tikli_size || '—' },
    { label: 'FG Stock',          value: (job.fg_stock_at_print ?? 0).toFixed(2) },
    { label: 'Ordered Qty',       value: (job.qty || 0).toFixed(2) },
    { label: 'Qty To Mold',       value: (job.qty_to_mould ?? job.qty ?? 0).toFixed(2) },
    { label: 'Type',              value: job.compound_code || '—' },
    { label: 'Cure Time (min)',   value: job.cure_time_min != null ? String(job.cure_time_min) : '—' },
  ], 14);

  y += 2;

  // ── Section 3: Production Planning & Control ────────────────────────────
  sectionBand('PRODUCTION PLANNING & CONTROL');

  cellRow([
    { label: 'Usable FG Stock', value: job.fg_stock_at_print != null ? String(job.fg_stock_at_print) : 'N/A' },
    { label: 'WIP Stock',        value: job.wip_stock_at_print != null ? String(job.wip_stock_at_print) : 'N/A' },
    { label: 'Total Quantity To Mold', value: (job.qty_to_mould ?? job.qty ?? 0).toFixed(2) },
    { label: 'Order Start Date', value: fmtDate(job.order_start_date || job.lsd) },
  ], 14);

  const statusUpper = (job.status || '').toUpperCase().replace('-', ' ');
  const statusColour: { bg: [number, number, number]; tx: [number, number, number] } =
    job.stage === 'dispatched' || job.status === 'passed' || job.status === 'ready'
      ? { bg: STATUS_GREEN_BG, tx: STATUS_GREEN_TX }
      : job.status === 'ncr' || job.status === 'late'
      ? { bg: STATUS_RED_BG,   tx: STATUS_RED_TX }
      : { bg: STATUS_AMBER_BG, tx: STATUS_AMBER_TX };

  cellRow([
    { label: 'Order End Date',         value: fmtDate(job.order_start_date || job.lsd) },
    { label: 'Target Completion Date', value: fmtDate(job.target_completion_date || job.promised_date) },
    {
      label: 'Production Status',
      value: statusUpper || 'QUEUED',
      statusBg: statusColour.bg,
      statusTx: statusColour.tx,
    },
    { label: '', value: '' },
  ], 14);

  y += 2;

  // ── Section 4: Operation Tracking & Timeline (table) ────────────────────
  sectionBand('OPERATION TRACKING & TIMELINE');

  type Row = [string, string, string, string, string, string, string];
  const stagesOrdered = ['moulding', 'finishing', 'inspection', 'dispatch'] as const;
  const rows: Row[] = stagesOrdered.map((stage, idx) => {
    const enter = events.find(e => e.to_stage === stage);
    const exit  = events.find(e => e.from_stage === stage);
    const startISO = enter?.ts || null;
    const endISO   = exit?.ts || null;
    const durHrs = startISO && endISO
      ? (new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000
      : 0;
    return [
      `Section-${String(idx + 1).padStart(2, '0')}`,
      STAGE_LABEL[stage],
      (job.qty || 0).toFixed(2),
      startISO ? fmtDateTime(startISO) : '',
      endISO   ? fmtDateTime(endISO)   : '',
      fmtDur(durHrs),
      '',  // Target Achievement — operator fills in by hand
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: mx, right: mx },
    head: [['Work Station No.', 'Operation Sequence', 'Quantity', 'Start Date & Time', 'End Date & Time', 'Duration (Hours)', 'Target Achievement']],
    body: rows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: HAIRLINE,
      lineWidth: 0.2,
      textColor: CELL_TEXT,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [245, 246, 248],
      textColor: CELL_LABEL,
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 23, fontStyle: 'bold' },
      2: { cellWidth: 20 },
      3: { cellWidth: 32 },
      4: { cellWidth: 32 },
      5: { cellWidth: 28 },
      6: { cellWidth: 'auto' },
    },
    didDrawPage: (d) => { y = d.cursor?.y ?? y; },
  });
  y = (doc as any).lastAutoTable.finalY + 2;

  // ── Section 5: Quality Control & Special Instructions ───────────────────
  sectionBand('QUALITY CONTROL & SPECIAL INSTRUCTIONS');

  // Notes area
  const notes = job.notes || '';
  if (notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(...CELL_TEXT);
    const notesLines = doc.splitTextToSize(notes, cw - 6) as string[];
    let ny = y + 4;
    notesLines.slice(0, 6).forEach((line, i) => {
      doc.text(line, mx + 3, ny + i * 4);
    });
    y = ny + Math.min(notesLines.length, 6) * 4 + 4;
  } else {
    // Reserve empty whitespace box so operator can write notes
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.2);
    doc.rect(mx, y + 2, cw, 28);
    y += 32;
  }

  // ── Section 6: Sign-off row ─────────────────────────────────────────────
  // Push to bottom of page if there's room.
  const pageH = 297;
  const sigBlockH = 20;
  const sigY = Math.max(y + 8, pageH - 18);
  const cols = ['Press Operator Sign. & Date', 'Finishing Checked By', 'Inspection Checked By', 'Approved By'];
  const colW = cw / cols.length;
  cols.forEach((label, i) => {
    const cx = mx + i * colW;
    // signature line
    doc.setDrawColor(150, 150, 155);
    doc.setLineWidth(0.4);
    doc.line(cx + 4, sigY, cx + colW - 4, sigY);
    // pre-filled value if we have one
    const filled =
      i === 0 ? job.press_operator_name :
      i === 1 ? job.finishing_checked_by :
      i === 2 ? job.inspection_checked_by :
      job.approved_by;
    if (filled) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.setTextColor(...CELL_TEXT);
      doc.text(filled, cx + colW / 2, sigY - 1.5, { align: 'center' });
    }
    // label
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.setTextColor(...CELL_TEXT);
    doc.text(label, cx + colW / 2, sigY + 4, { align: 'center' });
  });
  // Suppress unused warning
  void sigBlockH;

  const fileName = `JobCard-${job.id}.pdf`;
  if (download) doc.save(fileName);
  return doc;
}
