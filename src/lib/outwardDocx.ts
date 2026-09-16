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

type SigPerson = { name: string; designation: string; phone?: string };

// ── colour palette (mirrors quoteDocx.ts / the PDF) ─────────────────────────
const C_DARK   = '1E1E1E';
const C_GRAY   = '505050';
const C_BLUE_H = '6495C8';

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB');
}
function fmtShort(iso: string) {
  return utilFmtDate(iso);
}

const PAGE_MARGIN = { top: convertInchesToTwip(0.5), bottom: convertInchesToTwip(0.6), left: convertInchesToTwip(0.65), right: convertInchesToTwip(0.65) };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const HEAD_FILL   = { type: ShadingType.SOLID, color: C_BLUE_H };
const ALL_THIN    = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
const NO_BORDER   = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const ALL_NONE    = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

// Godown addresses this Delivery Order can be issued against, keyed off
// movement.warehouse (see WAREHOUSES in NewStockOutward.tsx — these four
// strings, case-sensitive, are the only values that occur). Must be kept in
// sync with the identical table in src/lib/pdfGenerator.ts.
const GODOWN_ADDRESSES: Record<string, { name: string; address: string; mobile: string }> = {
  Hariom: {
    name: 'HARIOM LOGISTICS',
    address: 'Godown No. G-9, G-10, Survey No.11/6, Ganesh Compound, Khandagale\nestate 3rd lane, Purna Village, Tal-Bhiwandi, Dist. Thane - 421 302',
    mobile: '82918 87543, 78753 29222',
  },
  Reliable: {
    name: 'RELIABLE WAREHOUSE',
    address: 'Industrial Godown Shed No.86,87,88,89, GUT NO 243 PART, BHIWANDI WADA\nROAD, HOTEL MURLI MANOHAR, FOREST ROAD, KHUPARI, WADA - 421312',
    mobile: '90825 15434',
  },
  Swastik: {
    name: 'SWASTIK ROADWAYS CORPORATION',
    address: '2nd Lane, Khandagle Estate, Purna Village, Bhiwandi - 421302',
    mobile: '82918 87543, 78753 29222',
  },
  BALAJI: {
    name: 'C/o SHRI BALAJI WAREHOUSE',
    address: 'Godown No 1240/3-4, 1020/3, Gr Floor, Dropati Chaya Compound,\nOld Agra Road, Purna Village, Tal. Bhiwandi, Thane - 421302',
    mobile: '82918 87543, 78753 29222',
  },
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
  const productCode = (movement as any).productCode || '—';

  // Outward's footer signatory is hardcoded (unlike Quote/Order, which
  // resolve it from settings.signatory_name/defaultSignatory) — the same
  // person signs every Delivery Order regardless of warehouse or app_settings.
  const person: SigPerson = { name: 'Samata Yadav', designation: 'DISPATCH', phone: '+919987682255' };

  // Line-items table column widths (DXA) — same 7 columns/order as the PDF's
  // autoTable, following the multi-column line-items table pattern in
  // quoteDocx.ts.
  const PAGE_W = 8640;
  const wHsn = 1200, wBarrels = 1200, wPacking = 900, wTotalQty = 1000, wPackType = 1300, wMou = 900;
  const wProdName = PAGE_W - wHsn - wBarrels - wPacking - wTotalQty - wPackType - wMou;

  const godown = GODOWN_ADDRESSES[movement.warehouse];

  const dateStr = movement.doDate ? fmtDate(movement.doDate) : '—';
  const lotDateText = movement.inwardDate
    ? new Date(movement.inwardDate + 'T00:00:00').toLocaleDateString('en-GB').replace(/\//g, '-')
    : '—';

  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGIN } },
      children: [
        // ── Header — four centered lines matching the pre-printed Delivery
        // Order pad (no tagline/CIN/GSTIN/contact line — those don't appear
        // on it). Must stay in sync with the equivalent block in
        // generateOutwardPDF, pdfGenerator.ts.
        para([r('Delivery Order', { size: 18, bold: true, color: '000000' })], AlignmentType.CENTER, 6),
        para([r('Himalaya Terpenes Pvt. Ltd.', { bold: true, size: 26 })], AlignmentType.CENTER, 6),
        para([r('Unit No. 201, Building No. 5, Jogani Industrial Complex,', { size: 15, color: C_GRAY })], AlignmentType.CENTER, 2),
        para([r('V. N. Purav Marg, Sion-Chunabhatti, Mumbai - 400 022. INDIA', { size: 15, color: C_GRAY })], AlignmentType.CENTER, 40),
        hrPara(),

        // ── Delivery Order No. | Date
        new Paragraph({
          spacing: { after: 20 },
          children: [
            r('Delivery Order No.: ', { size: 17 }),
            r(movement.doNumber || '—', { size: 17 }),
            r('     ', { size: 17 }),
            r('Date : ', { size: 17 }),
            r(dateStr, { size: 17, color: C_GRAY }),
          ],
        }),

        // ── Godown address (who this DO is addressed to — see
        // GODOWN_ADDRESSES), centered — bold name, address, then mobile
        // (only when non-empty — Reliable has none on file).
        ...(godown ? [
          para([r('M/s. ' + godown.name, { bold: true, size: 17 })], AlignmentType.CENTER, 0),
          ...godown.address.split('\n').map(line => para([r(line, { size: 17 })], AlignmentType.CENTER, 0)),
          ...(godown.mobile ? [para([r('Mobile : ' + godown.mobile, { size: 17 })], AlignmentType.CENTER, 0)] : []),
          para([], AlignmentType.LEFT, 80),
        ] : []),

        // ── Delivery instruction — Lot No./Dated now split out into their
        // own field line below instead of being folded into this sentence
        para([r(
          'Please Deliver the following material to the bearer from our stock stored at your warehouse vide your',
          { size: 17 },
        )], AlignmentType.LEFT, 40),

        // ── Lot No. | Dated — same field style as Delivery Order No./Date above
        new Paragraph({
          spacing: { after: 120 },
          children: [
            r('Lot No.: ', { size: 17 }),
            r(movement.whLotNo || '—', { size: 17 }),
            r('     ', { size: 17 }),
            r('Dated: ', { size: 17 }),
            r(lotDateText, { size: 17 }),
          ],
        }),

        // ── Line-items table — single row, Outward only ever carries one item
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                thCell('Product Name', wProdName),
                thCell('Product Code', wHsn),
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
                tdCell(productCode, wHsn, AlignmentType.CENTER),
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

        // ── Sign-off — rubber-stamp rule, then a two-column "Thanking
        // You." + fine-print terms (left) vs signature block (right),
        // matching the pre-printed pad's own footer. No signature image
        // here — this generator has never wired one in, unlike the PDF.
        para([r('● PLEASE PUT YOUR RUBBER STAMP & SIGN', { bold: true, size: 17 })], AlignmentType.LEFT, 0),
        hrPara(),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              new TableCell({
                width: { size: Math.floor(PAGE_W / 2), type: WidthType.DXA },
                borders: ALL_NONE,
                margins: { top: 0, bottom: 0, left: 0, right: 120 },
                children: [
                  para([r('Thanking You.', { size: 17 })], AlignmentType.LEFT, 60),
                  para([r('1) This D.O. is valid for 4 days only', { size: 14 })], AlignmentType.LEFT, 20),
                  para([r('2) Please weight the material before taking the delivery.', { size: 14 })], AlignmentType.LEFT, 20),
                  para([r('3) No responsibility of leakages/shortage after leaving the material from our godown.', { size: 14 })], AlignmentType.LEFT, 0),
                ],
              }),
              new TableCell({
                width: { size: Math.floor(PAGE_W / 2), type: WidthType.DXA },
                borders: ALL_NONE,
                margins: { top: 0, bottom: 0, left: 120, right: 0 },
                children: [
                  para([r('For Himalaya Terpenes Pvt. Ltd.', { size: 17 })], AlignmentType.RIGHT, 300),
                  para([r('Authorised Signatory', { size: 17 })], AlignmentType.RIGHT, 40),
                  para([r(`${person.name}${person.designation ? ' | ' + person.designation : ''}${person.phone ? ' | Tel.: ' + person.phone : ''}`, { size: 14, color: '000000' })], AlignmentType.RIGHT, 0),
                ],
              }),
            ],
          })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, (movement.doNumber || 'delivery_challan') + '_DC.docx');
}
