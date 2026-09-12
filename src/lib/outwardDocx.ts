// Outward "Delivery Challan" DOCX — same content as generateOutwardPDF
// (src/lib/pdfGenerator.ts), built with the `docx` library the same way
// downloadPIDOCX in src/lib/quoteDocx.ts is built. Kept as its own file
// rather than folded into quoteDocx.ts since this isn't a quote/order
// document — no pricing anywhere, Outward entries carry none.

import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, AlignmentType, BorderStyle, ShadingType,
  convertInchesToTwip, UnderlineType,
} from 'docx';
import type { StockMovement, Customer, AppSettings, CompanyUnit } from './types';
import { fmtDate as utilFmtDate } from './utils';

type SigPerson = { name: string; designation: string; phone?: string };

// ── colour palette (mirrors quoteDocx.ts / the PDF) ─────────────────────────
const C_DARK   = '1E1E1E';
const C_GRAY   = '505050';
const C_BLUE_H = '6495C8';

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtShort(iso: string) {
  return utilFmtDate(iso);
}

const PAGE_MARGIN = { top: convertInchesToTwip(0.5), bottom: convertInchesToTwip(0.6), left: convertInchesToTwip(0.65), right: convertInchesToTwip(0.65) };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const HEAD_FILL   = { type: ShadingType.SOLID, color: 'F0F0F0' };
const ALL_THIN    = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

function r(text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean; underline?: boolean } = {}) {
  return new TextRun({
    text,
    bold: opts.bold,
    size: opts.size ?? 18,
    color: opts.color ?? C_DARK,
    italics: opts.italics,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    font: 'Times New Roman',
  });
}

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

function para(runs: TextRun[], align: Align = AlignmentType.LEFT, spacingAfter = 0) {
  return new Paragraph({ alignment: align, spacing: { after: spacingAfter }, children: runs });
}

function hrPara() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } },
    children: [],
    spacing: { after: 80 },
  });
}

function labelCell(text: string, widthDxa: number) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    shading: HEAD_FILL,
    borders: ALL_THIN,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [para([r(text, { bold: true, size: 17 })])],
  });
}

function valueCell(text: string, widthDxa: number) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    borders: ALL_THIN,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [para([r(String(text ?? '—'), { size: 17 })])],
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadOutwardDOCX(
  movement: StockMovement,
  customer: Customer | undefined,
  settings: AppSettings | null,
  defaultSignatory?: SigPerson,
  unit?: CompanyUnit,
) {
  const settingsSig: SigPerson | undefined = settings?.signatory_name
    ? { name: settings.signatory_name, designation: settings.signatory_title || 'CRM', phone: settings.signatory_phone || '' }
    : undefined;
  // Outward movements have no per-record authorizedPerson (unlike Quote/
  // Order) — priority: app_settings -> passed defaultSignatory -> hardcoded fallback.
  const person: SigPerson = settingsSig || defaultSignatory || { name: 'Samata Yadav', designation: 'CRM', phone: '+918657000610' };

  const partyDisplay = movement.partyName === 'Other' ? (movement.otherParty || 'Other') : (movement.partyName || '—');
  const transporterDisplay = movement.transporter === 'Other' ? (movement.otherTransporter || 'Other') : (movement.transporter || '—');

  const PAGE_W = 8640;
  const wLabel = 2400;
  const wValue = PAGE_W - wLabel;

  const detailRows: [string, string][] = [
    ['Lot No', movement.whLotNo || '—'],
    ['Lot Date', movement.inwardDate ? fmtShort(movement.inwardDate) : '—'],
    ['Product Name', movement.productName || '—'],
    ['Product Code', (movement as any).productCode || '—'],
    ['Warehouse', movement.warehouse || '—'],
    ['Party Name', partyDisplay],
    ['Transporter', transporterDisplay],
    ['No of Barrels', movement.numArticles || '—'],
    ['Packing', movement.packing != null ? String(movement.packing) : '—'],
    ['MOU', movement.weightType || '—'],
    ['Packing Type', movement.packagingType || '—'],
    ['Total Quantity', movement.totalQty != null ? movement.totalQty.toLocaleString('en-IN') : '—'],
    ['Note', movement.note || '—'],
  ];

  const primarySite = (customer?.sites ?? []).find(s => s.isPrimary) ?? customer?.sites?.[0];

  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGIN } },
      children: [
        // ── Company header (copied from quoteDocx.ts, same as the PDF's letterhead)
        para([r('HIMALAYA TERPENES PVT. LTD.', { bold: true, size: 26 })], AlignmentType.LEFT, 10),
        para([r('GUM ROSIN, GUM TURPENTINE, DIPENTENE, PINEOIL, TERPINEOL, CAMPHOR POWDER, ISOBORNEOL FLAKES ETC.', { size: 16, color: C_GRAY })], AlignmentType.LEFT, 10),
        para([r('201/5, Jogani Industrial Complex, V.N. Purav Marg, Sion-Chunabhatti (E), Mumbai - 400 022. CIN: U24100MH1999PTC121377', { size: 14, color: C_GRAY })], AlignmentType.LEFT, 6),
        para([r('GSTIN: 27AAACH6788H1Z6', { size: 14, color: C_GRAY })], AlignmentType.LEFT, 6),
        para([r('Tel.: 91-22-35397800/01 | E Mail: mum@himalayaterpene.com | Web.: www.himalayaterpene.com', { size: 14, color: C_GRAY })], AlignmentType.LEFT, 40),
        hrPara(),

        // ── Ref + Date
        new Paragraph({
          spacing: { after: 20 },
          children: [
            r('Ref: ' + (movement.doNumber || '—'), { bold: true, size: 17 }),
            r('   ' + (movement.doDate ? fmtDate(movement.doDate) : ''), { size: 17, color: C_GRAY }),
          ],
        }),

        para([r('DELIVERY CHALLAN', { bold: true, size: 22, underline: true })], AlignmentType.CENTER, 60),

        // ── Consignee (customer resolved from Party Name, if it matched one)
        ...(customer ? [
          para([r('Consignee:', { bold: true, size: 17 })], AlignmentType.LEFT, 20),
          para([r(customer.name, { size: 17 })], AlignmentType.LEFT, 0),
          ...(primarySite?.city ? [para([r(primarySite.city + (primarySite.state ? ', ' + primarySite.state : ''), { size: 17 })], AlignmentType.LEFT, 0)] : []),
          para([], AlignmentType.LEFT, 80),
        ] : []),

        // ── Details table — no pricing anywhere, Outward entries carry none
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: detailRows.map(([label, value]) => new TableRow({
            children: [labelCell(label, wLabel), valueCell(value, wValue)],
          })),
        }),

        para([], AlignmentType.LEFT, 120),

        // ── Sign-off
        para([r('Thanks & Kind Regards,', { size: 18 })], AlignmentType.LEFT, 120),
        para([
          r('HIMALAYA TERPENES PVT. LTD.', { bold: true, size: 18 }),
          r(` | ${person.name} | ${person.designation}${person.phone ? ' | Tel.: ' + person.phone : ''}`, { size: 18 }),
        ], AlignmentType.LEFT, 0),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, (movement.doNumber || 'delivery_challan') + '_DC.docx');
}
