// Outward "Delivery Order" DOCX — same content as generateOutwardPDF
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
import { supabase } from './supabase';

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
const HEAD_FILL   = { type: ShadingType.SOLID, color: C_BLUE_H };
const ALL_THIN    = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

// Godown addresses this Delivery Order can be issued against, keyed off
// movement.warehouse (see WAREHOUSES in NewStockOutward.tsx — these four
// strings, case-sensitive, are the only values that occur). Must be kept in
// sync with the identical table in src/lib/pdfGenerator.ts.
const GODOWN_ADDRESSES: Record<string, string[]> = {
  Hariom: [
    'M/S. HARIOM LOGISTICS',
    'Godown No. G-9, G-10, Survey No.11/6,',
    'Ganesh Compound, Khandagale estate 3rd lane,',
    'Purna Village, Tal-Bhiwandi',
    'Dist. Thane - 421 302, Mob: 89285 91319',
  ],
  Reliable: [
    'Reliable Storage,',
    'Industrial Godown Shed No.86,87,88,89',
    'GUT NO 243 PART, BHIWANDI WADA ROAD,',
    'HOTEL MURLI MANOHAR, FOREST ROAD,',
    'KHUPARI, WADA - 421312',
  ],
  Swastik: [
    'SWASTIK ROADWAYS CO. G.NO. 08, GANA NO. 08,',
    '3RD LINE, NEAR ANAND WAREHOUSE, KHANDAGALE ESTATE,',
    'PURNA VILLAGE, BHIWANDI - 421302, Mob: 84466 69849',
  ],
  BALAJI: [
    'C/o Shri Balaji Warehouse',
    'Godown No 1240/3-4, 1020/3, Gr Floor,',
    'Dropati Chaya Compound, Old Agra Road,',
    'Purna Village, Tal. Bhiwandi,',
    'Thane - 421302, Mob: 91254 30464',
  ],
};

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

function thCell(text: string, widthDxa: number, align: Align = AlignmentType.CENTER) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    shading: HEAD_FILL,
    borders: ALL_THIN,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: align,
      children: [r(text, { bold: true, size: 16, color: C_DARK })],
    })],
  });
}

function tdCell(text: string, widthDxa: number, align: Align = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    borders: ALL_THIN,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: align,
      children: [r(String(text ?? '—'), { size: 17 })],
    })],
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
  const { data: catalogEntry } = await supabase
    .from('product_catalog')
    .select('hsn_code')
    .eq('product_name', movement.productName)
    .maybeSingle();
  const hsnCode = catalogEntry?.hsn_code || '—';

  const settingsSig: SigPerson | undefined = settings?.signatory_name
    ? { name: settings.signatory_name, designation: settings.signatory_title || 'CRM', phone: settings.signatory_phone || '' }
    : undefined;
  // Outward movements have no per-record authorizedPerson (unlike Quote/
  // Order) — priority: app_settings -> passed defaultSignatory -> hardcoded fallback.
  const person: SigPerson = settingsSig || defaultSignatory || { name: 'Samata Yadav', designation: 'CRM', phone: '+918657000610' };

  // Line-items table column widths (DXA) — same 7 columns/order as the PDF's
  // autoTable, following the multi-column line-items table pattern in
  // quoteDocx.ts.
  const PAGE_W = 8640;
  const wHsn = 1200, wBarrels = 1200, wPacking = 900, wTotalQty = 1000, wPackType = 1300, wMou = 900;
  const wProdName = PAGE_W - wHsn - wBarrels - wPacking - wTotalQty - wPackType - wMou;

  const godownAddress = GODOWN_ADDRESSES[movement.warehouse];

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

        // ── Delivery Order Number + Date
        new Paragraph({
          spacing: { after: 20 },
          children: [
            r('Delivery Order Number : ' + (movement.doNumber || '—'), { bold: true, size: 17 }),
            r('   ' + (movement.doDate ? fmtDate(movement.doDate) : ''), { size: 17, color: C_GRAY }),
          ],
        }),

        para([r('Delivery Order', { bold: true, size: 22, underline: true })], AlignmentType.CENTER, 60),

        // ── Godown address (who this DO is addressed to — see GODOWN_ADDRESSES)
        ...(godownAddress ? [
          para([r(godownAddress[0], { bold: true, size: 17 })], AlignmentType.LEFT, 0),
          ...godownAddress.slice(1).map(line => para([r(line, { size: 17 })], AlignmentType.LEFT, 0)),
          para([], AlignmentType.LEFT, 80),
        ] : []),

        // ── Delivery instruction — carries the lot no/date that used to be
        // shown in the details table below (now folded into this sentence)
        para([r(
          `Please Deliver the following material to the bearer from our stock stored at your ware house vide your lot no: ${movement.whLotNo || '—'} dated ${movement.inwardDate ? fmtShort(movement.inwardDate) : '—'}`,
          { size: 17 },
        )], AlignmentType.LEFT, 120),

        // ── Line-items table — single row, Outward only ever carries one item
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                thCell('Product Name', wProdName),
                thCell('HSN Code', wHsn),
                thCell('No of Barrels', wBarrels),
                thCell('Packing', wPacking),
                thCell('Total Qty', wTotalQty),
                thCell('Packing Type', wPackType),
                thCell('MOU', wMou),
              ],
            }),
            new TableRow({
              children: [
                tdCell(movement.productName || '—', wProdName),
                tdCell(hsnCode, wHsn, AlignmentType.CENTER),
                tdCell(movement.numArticles || '—', wBarrels, AlignmentType.CENTER),
                tdCell(movement.packing != null ? String(movement.packing) : '—', wPacking, AlignmentType.CENTER),
                tdCell(movement.totalQty != null ? movement.totalQty.toLocaleString('en-IN') : '—', wTotalQty, AlignmentType.CENTER),
                tdCell(movement.packagingType || '—', wPackType, AlignmentType.CENTER),
                tdCell(movement.weightType || '—', wMou, AlignmentType.CENTER),
              ],
            }),
          ],
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
