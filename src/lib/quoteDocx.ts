import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, WidthType, AlignmentType, BorderStyle, ShadingType,
  convertInchesToTwip, HeadingLevel, UnderlineType,
} from 'docx';
import type { Quote, Order, Customer, AppSettings, CompanyUnit, BankAccount } from './types';
import { formatINR, resolveAdjustments, maxItemGstRate, fmtDate as utilFmtDate } from './utils';

// ── colour palette (mirrors PDF)
const C_DARK    = '1E1E1E';
const C_GRAY    = '505050';
const C_LGRAY   = 'A0A0A0';
const C_BLUE_H  = '6495C8';   // TRUST_BLUE header fill
const C_RED     = 'B40000';   // Regret text
const C_WHITE   = 'FFFFFF';

type SigPerson = { name: string; designation: string; phone?: string };

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtShort(iso: string) {
  return utilFmtDate(iso);
}
function fmtRate(v: number, sym: string) {
  return sym.trimEnd() + ' ' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function getCurrSym(curr: string) {
  if (curr === 'USD') return '$';
  if (curr === 'EUR') return '€';
  if (curr === 'GBP') return '£';
  return 'Rs. ';
}

// ── shared helpers ──────────────────────────────────────────────────────────
const PAGE_MARGIN = { top: convertInchesToTwip(0.5), bottom: convertInchesToTwip(0.6), left: convertInchesToTwip(0.65), right: convertInchesToTwip(0.65) };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const HEAD_FILL   = { type: ShadingType.SOLID, color: C_BLUE_H };
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

function tdCell(text: string, widthDxa: number, align: Align = AlignmentType.LEFT, opts: { bold?: boolean; color?: string } = {}) {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    borders: ALL_THIN,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: align,
      children: [r(String(text ?? '—'), { size: 17, ...opts })],
    })],
  });
}

function sectionHeading(text: string) {
  return new Paragraph({
    children: [r(text, { bold: true, size: 18 })],
    spacing: { before: 120, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' } },
  });
}

// ── QUOTE DOCX ──────────────────────────────────────────────────────────────
export async function downloadQuoteDOCX(
  quote: Quote,
  customer: Customer | undefined,
  settings: AppSettings | null,
  defaultSignatory?: SigPerson,
  unit?: CompanyUnit,
) {
  const sym = getCurrSym(quote.curr);
  const sub = quote.items.reduce((a, i) => a + i.total, 0);
  const gst = quote.items.reduce((a, i) => a + i.total * i.gst / 100, 0);
  const grand = sub + gst;

  const primarySite = (quote.siteId ? customer?.sites.find(s => s.id === quote.siteId) : undefined)
    ?? customer?.sites.find(s => s.isPrimary)
    ?? customer?.sites[0];
  const primaryContact = primarySite?.contacts.find(c => c.isPrimary) ?? primarySite?.contacts[0];

  const settingsSig: SigPerson | undefined = settings?.signatory_name
    ? { name: settings.signatory_name, designation: settings.signatory_title || 'CRM', phone: settings.signatory_phone || '' }
    : undefined;
  // Priority: app_settings → authorized_signatories is_default → per-quote authorizedPerson → hardcoded fallback
  const person: SigPerson = settingsSig
    || defaultSignatory
    || ((quote as any).authorizedPerson?.name ? (quote as any).authorizedPerson : undefined)
    || { name: 'Samata Yadav', designation: 'CRM', phone: '+918657000610' };

  const salutation = (() => {
    const raw = ((quote as any).contact || primaryContact?.name || '').trim();
    const n = raw.replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i, '').trim();
    const first = n.split(/\s+/)[0] || '';
    return first ? `Dear ${first} ji,` : 'Dear Sir/Madam,';
  })();

  // Column widths in DXA (1 inch = 1440 DXA). Usable ≈ 8640 DXA for 0.65" margins on A4
  // Proportional to PDF widths: HSN and Barrels widened to prevent 8-digit code and header wrap.
  const PAGE_W = 8640;
  const wSno = 430, wHsn = 1060, wBarrels = 1060, wPacking = 670, wTotalQty = 770, wPackType = 1110, wRate = 1200, wPerUnit = 720;
  const wProdName = PAGE_W - wSno - wHsn - wBarrels - wPacking - wTotalQty - wPackType - wRate - wPerUnit;

  const itemRows = quote.items.map((i, idx) => {
    const rateText = (i as any).rateOverride
      ? ((i as any).rateText?.trim() || 'Regret')
      : fmtRate(i.unitPrice, sym);
    const isRegret = (i as any).rateOverride;
    const _pb = ((i as any).priceBasis as string | undefined)?.trim();
    const perUnit = !_pb ? 'kg' : _pb.startsWith('Per ') ? _pb.slice(4) : _pb;
    const productName = (i as any).product_name || i.desc || '';
    const hsnCode = i.hsn || (i as any).hsn_code || '';
    const noOfBarrels = i.qty != null ? String(i.qty) : '';
    const packing = i.packing || '';
    const packingNum = parseFloat(packing) || 0;
    const totalQty = (i as any).total_qty != null
      ? String((i as any).total_qty)
      : (i.qty && packingNum ? String(i.qty * packingNum) : '');
    const packingType = i.packingType || (i as any).packing_type || '';
    const cells = [
      tdCell(String(idx + 1), wSno, AlignmentType.CENTER),
      tdCell(productName, wProdName),
      tdCell(hsnCode, wHsn, AlignmentType.CENTER),
      tdCell(noOfBarrels, wBarrels, AlignmentType.CENTER),
      tdCell(packing, wPacking, AlignmentType.CENTER),
      tdCell(totalQty, wTotalQty, AlignmentType.CENTER),
      tdCell(packingType, wPackType, AlignmentType.CENTER),
      tdCell(rateText, wRate, AlignmentType.RIGHT, { color: isRegret ? C_RED : undefined, bold: isRegret }),
      tdCell(perUnit, wPerUnit, AlignmentType.CENTER),
    ];
    return new TableRow({ children: cells });
  });

  // T&C
  let tncRows: { label: string; value: string }[] = [];
  try {
    const p = JSON.parse(quote.terms || '{}');
    tncRows = [
      { label: 'Delivery point', value: p.delivery || '' },
      { label: 'Lead time', value: p.leadTime || '' },
      { label: 'Packing & forwarding', value: p.pnf || '' },
      { label: 'Freight', value: p.freight || '' },
      { label: 'Payment', value: p.payment || '' },
      { label: 'Validity', value: p.validity || '' },
      { label: 'Taxes', value: p.taxes || '' },
    ].filter(r => r.value);
  } catch {
    tncRows = (quote.terms || '').split('\n').filter(Boolean).map((l, i) => {
      const s = l.replace(/^[•\d]+[.)]\s*/, '');
      const c = s.indexOf(':');
      return c > 0 ? { label: s.slice(0, c).trim(), value: s.slice(c + 1).trim() } : { label: String(i + 1), value: s };
    });
  }

  const pdfNotes = ((quote as any).notes ?? []).filter((n: string) => n.trim());

  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGIN } },
      children: [
        // ── Company header
        para([r('HIMALAYA TERPENES PVT. LTD.', { bold: true, size: 26 })], AlignmentType.LEFT, 10),
        para([r('GUM ROSIN, GUM TURPENTINE, DIPENTENE, PINEOIL, TERPINEOL ETC.', { size: 16, color: C_GRAY })], AlignmentType.LEFT, 10),
        para([r('201/5, Jogani Industrial Complex, V.N. Purav Marg, Sion-Chunabhatti (E), Mumbai - 400 022. CIN: U24100MH1999PTC121377', { size: 14, color: C_GRAY })], AlignmentType.LEFT, 6),
        para([r('Tel.: 91-22-35397800/01 | E Mail: mum@himalayaterpene.com | Web.: www.himalayaterpene.com', { size: 14, color: C_GRAY })], AlignmentType.LEFT, 40),
        hrPara(),

        // ── Ref + Date
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 20 },
          children: [
            r('Ref: ' + quote.id, { size: 17, bold: true }),
            r('   ' + (quote.date ? fmtDate(quote.date) : ''), { size: 17, color: C_GRAY }),
          ],
        }),

        // ── QUOTATION heading
        para([r('QUOTATION', { bold: true, size: 22, underline: true })], AlignmentType.CENTER, 60),

        // KA Contact
        ...(primaryContact?.name ? [para([r('K.A.: ' + primaryContact.name, { bold: true, size: 19 })], AlignmentType.CENTER, 60)] : []),

        // ── Customer address
        para([r(quote.cust + ',', { bold: false, size: 18 })], AlignmentType.LEFT, 20),
        ...(primarySite ? [
          ...(primarySite.name ? [para([r(primarySite.name, { size: 18 })], AlignmentType.LEFT, 0)] : []),
          ...((primarySite.fullAddress || primarySite.address)
            ? [para([r(primarySite.fullAddress || primarySite.address || '', { size: 18 })], AlignmentType.LEFT, 0)] : []),
          ...(primarySite.city ? [para([r(primarySite.city + (primarySite.state ? ', ' + primarySite.state : ''), { size: 18 })], AlignmentType.LEFT, 0)] : []),
        ] : []),

        ...((quote as any).custEnquiryDocNo ? [
          para([r('Reference No.: ' + (quote as any).custEnquiryDocNo, { size: 17 })], AlignmentType.LEFT, 40),
        ] : []),

        para([], AlignmentType.LEFT, 0),

        // ── Salutation
        para([r(salutation, { size: 18 })], AlignmentType.LEFT, 60),
        para([r('Thank you for your enquiry, we are pleased to submit our offer for the same as under. We hope this is in line with your requirement and your valued order follows soon.', { size: 17 })], AlignmentType.LEFT, 100),

        // ── Items table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                thCell('Sr No', wSno),
                thCell('Product Name', wProdName),
                thCell('HSN Code', wHsn),
                thCell('No of Barrels', wBarrels),
                thCell('Packing', wPacking),
                thCell('Total Qty', wTotalQty),
                thCell('Packing Type', wPackType),
                thCell(`Rates (${quote.curr})`, wRate, AlignmentType.RIGHT),
                thCell('Per', wPerUnit),
              ],
            }),
            ...itemRows,
          ],
        }),

        para([], AlignmentType.LEFT, 80),

        // ── Notes
        ...(pdfNotes.length > 0 ? [
          para([r('Note:', { bold: true, size: 17 })], AlignmentType.LEFT, 40),
          ...pdfNotes.map((n: string, i: number) =>
            para([r(`${i + 1}.  ${n}`, { size: 17 })], AlignmentType.LEFT, 40)
          ),
          para([], AlignmentType.LEFT, 60),
        ] : []),

        // ── T&C table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [new TableCell({
                columnSpan: 3,
                shading: HEAD_FILL,
                borders: ALL_THIN,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [para([r('Terms & Conditions:', { bold: true, size: 16, color: C_DARK })])],
              })],
            }),
            ...tncRows.map((row, idx) => new TableRow({
              children: [
                tdCell(String(idx + 1), 480, AlignmentType.CENTER),
                tdCell(row.label, 2200),
                tdCell(row.value, PAGE_W - 480 - 2200),
              ],
            })),
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
  triggerDownload(blob, quote.id + '.docx');
}

// ── PI DOCX ─────────────────────────────────────────────────────────────────
export async function downloadPIDOCX(
  order: Order,
  quote: Quote | undefined,
  customer: Customer | undefined,
  settings: AppSettings | null,
  defaultSignatory?: SigPerson,
  unit?: CompanyUnit,
  bankAccount?: BankAccount,
) {
  const sym = getCurrSym(quote?.curr || 'INR');
  const t_raw = resolveAdjustments(order.adjustments, order.items.reduce((a, i) => a + i.total, 0), order.items.reduce((a, i) => a + i.total * i.gst / 100, 0), maxItemGstRate(order.items));
  const sub = order.items.reduce((a, i) => a + i.total, 0);
  const adjLines = t_raw.lines;
  const preLines  = adjLines.filter(a => a.taxable);
  const postLines = adjLines.filter(a => !a.taxable);
  const grand = t_raw.grand;

  const primarySite = ((order as any).siteId ? customer?.sites.find(s => s.id === (order as any).siteId) : undefined)
    ?? customer?.sites.find(s => s.isPrimary)
    ?? customer?.sites[0];
  const primaryContact = primarySite?.contacts.find(c => c.isPrimary) ?? primarySite?.contacts[0];

  const piSettingsSig: SigPerson | undefined = settings?.signatory_name
    ? { name: settings.signatory_name, designation: settings.signatory_title || 'CRM', phone: settings.signatory_phone || '' }
    : undefined;
  // Priority: app_settings → authorized_signatories is_default → per-order authorizedPerson → hardcoded fallback
  const person: SigPerson = piSettingsSig
    || defaultSignatory
    || ((order as any).authorizedPerson?.name ? (order as any).authorizedPerson : undefined)
    || { name: 'Samata Yadav', designation: 'CRM', phone: '+918657000610' };

  const piSalutation = (() => {
    const raw = ((order as any).contact || primaryContact?.name || '').trim();
    const n = raw.replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i, '').trim();
    const first = n.split(/\s+/)[0] || '';
    return first ? `Dear ${first} ji,` : 'Dear Sir/Madam,';
  })();

  const PAGE_W = 8640;
  const wSno = 430, wHsn = 1060, wBarrels = 1060, wPacking = 670, wTotalQty = 770, wPackType = 1110, wRate = 1200, wPerUnit = 720;
  const wProdName = PAGE_W - wSno - wHsn - wBarrels - wPacking - wTotalQty - wPackType - wRate - wPerUnit;

  const itemRows = order.items.map((i, idx) => {
    const packing = i.packing || '';
    const packingNum = parseFloat(packing) || 0;
    const totalQty = i.qty && packingNum ? String(i.qty * packingNum) : '';
    const _pb = (i as any).priceBasis?.trim() as string | undefined;
    const perUnit = !_pb ? 'kg' : _pb.startsWith('Per ') ? _pb.slice(4) : _pb;
    return new TableRow({
      children: [
        tdCell(String(idx + 1), wSno, AlignmentType.CENTER),
        tdCell(i.desc || '', wProdName),
        tdCell(i.hsn || order.hsn || '', wHsn, AlignmentType.CENTER),
        tdCell(i.qty != null ? String(i.qty) : '', wBarrels, AlignmentType.CENTER),
        tdCell(packing, wPacking, AlignmentType.CENTER),
        tdCell(totalQty, wTotalQty, AlignmentType.CENTER),
        tdCell((i as any).packingType || '', wPackType, AlignmentType.CENTER),
        tdCell(fmtRate(i.agreedRate, sym), wRate, AlignmentType.RIGHT),
        tdCell(perUnit, wPerUnit, AlignmentType.CENTER),
      ],
    });
  });

  // Bank lines
  const bankLines: { label: string; value: string }[] = [];
  if (bankAccount) {
    if (bankAccount.beneficiary) bankLines.push({ label: 'Beneficiary', value: bankAccount.beneficiary });
    bankLines.push({ label: 'Bank', value: bankAccount.bank_name });
    if (bankAccount.branch_address) bankLines.push({ label: 'Branch', value: bankAccount.branch_address });
    bankLines.push({ label: 'A/c No.', value: bankAccount.account_no });
    bankLines.push({ label: 'IFSC', value: bankAccount.ifsc });
    if (bankAccount.swift) bankLines.push({ label: 'SWIFT', value: bankAccount.swift });
  } else {
    bankLines.push({ label: 'Bank', value: settings?.bank_name || 'ICICI BANK LTD.' });
    bankLines.push({ label: 'A/c No.', value: settings?.bank_acc || '—' });
    bankLines.push({ label: 'IFSC', value: settings?.bank_ifsc || '—' });
    if (settings?.bank_swift) bankLines.push({ label: 'SWIFT', value: settings.bank_swift });
  }

  // Terms lines
  const termsLines: string[] = order.terms
    ? order.terms.split('\n').filter(Boolean)
    : ['Payment: Balance before dispatch.', 'Delivery as per schedule.'];

  const poDateShort = order.poDate ? fmtShort(order.poDate) : '—';
  const dlvDateShort = order.dlvDate ? fmtShort(order.dlvDate) : '—';

  // Banking + T&C side-by-side table
  const halfW = Math.floor(PAGE_W / 2);
  const bankAndTermsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: halfW, type: WidthType.DXA },
            borders: ALL_THIN,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              para([r('Banking Details:', { bold: true, size: 17 })], AlignmentType.LEFT, 60),
              ...bankLines.map(ln => para([r(`${ln.label}: `, { bold: true, size: 16 }), r(ln.value, { size: 16 })], AlignmentType.LEFT, 30)),
            ],
          }),
          new TableCell({
            width: { size: halfW, type: WidthType.DXA },
            borders: ALL_THIN,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              para([r('Terms & Conditions:', { bold: true, size: 17 })], AlignmentType.LEFT, 60),
              ...termsLines.map(l => para([r('• ' + l.replace(/^•\s*/, ''), { size: 16 })], AlignmentType.LEFT, 30)),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: PAGE_MARGIN } },
      children: [
        // ── Header
        para([r('HIMALAYA TERPENES PVT. LTD.', { bold: true, size: 26 })], AlignmentType.LEFT, 10),
        para([r('GUM ROSIN, GUM TURPENTINE, DIPENTENE, PINEOIL, TERPINEOL ETC.', { size: 16, color: C_GRAY })], AlignmentType.LEFT, 10),
        para([r('201/5, Jogani Industrial Complex, V.N. Purav Marg, Sion-Chunabhatti (E), Mumbai - 400 022. CIN: U24100MH1999PTC121377', { size: 14, color: C_GRAY })], AlignmentType.LEFT, 6),
        para([r('Tel.: 91-22-35397800/01 | E Mail: mum@himalayaterpene.com | Web.: www.himalayaterpene.com', { size: 14, color: C_GRAY })], AlignmentType.LEFT, 40),
        hrPara(),

        // Ref + Date
        new Paragraph({
          spacing: { after: 20 },
          children: [
            r('Ref: ' + order.id, { bold: true, size: 17 }),
            r('   ' + (order.poDate ? fmtDate(order.poDate) : ''), { size: 17, color: C_GRAY }),
          ],
        }),

        para([r('PROFORMA INVOICE', { bold: true, size: 22, underline: true })], AlignmentType.CENTER, 60),

        // Subject
        para([
          r('Sub: ', { bold: true, size: 17 }),
          r(`Performa Invoice against your Order No. ${order.poNo || '—'} dtd. ${poDateShort}`, { size: 17 }),
        ], AlignmentType.LEFT, 60),

        // ── Salutation
        para([r(piSalutation, { size: 18 })], AlignmentType.LEFT, 60),
        para([r('We are sending here with our Performa Invoice. You are requested to kindly deposit the payment with our bank account under intimation to us so that we may be able to provide your material.', { size: 17 })], AlignmentType.LEFT, 100),

        // ── Bill To + PO details side by side
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              // Bill To
              new TableCell({
                width: { size: halfW, type: WidthType.DXA },
                borders: { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER },
                children: [
                  para([r('Bill To:', { bold: true, size: 17 })], AlignmentType.LEFT, 40),
                  para([r(order.cust, { bold: true, size: 17 })], AlignmentType.LEFT, 20),
                  ...(primarySite?.name ? [para([r(primarySite.name, { size: 17 })], AlignmentType.LEFT, 20)] : []),
                  ...(primaryContact?.name ? [para([r('Attn: ' + primaryContact.name, { size: 17 })], AlignmentType.LEFT, 20)] : []),
                  ...(primarySite?.city ? [para([r(primarySite.city + (primarySite.state ? ', ' + primarySite.state : ''), { size: 17 })], AlignmentType.LEFT, 0)] : []),
                  ...((primarySite?.gstin || customer?.gstin) ? [para([r('GSTIN: ' + (primarySite?.gstin || customer?.gstin || ''), { size: 17 })], AlignmentType.LEFT, 0)] : []),
                ],
              }),
              // PO details
              new TableCell({
                width: { size: halfW, type: WidthType.DXA },
                borders: { top: NONE_BORDER, bottom: NONE_BORDER, left: NONE_BORDER, right: NONE_BORDER },
                children: [
                  ...([
                    ['PO Number', order.poNo || '—'],
                    ['PO Date', poDateShort],
                    ['Delivery Date', dlvDateShort],
                    ['Quote Ref', order.quoteRef || '—'],
                  ] as [string, string][]).map(([k, v]) =>
                    para([r(k + ': ', { size: 16, color: C_GRAY }), r(v, { bold: true, size: 16 })], AlignmentType.RIGHT, 40)
                  ),
                ],
              }),
            ],
          })],
        }),

        para([], AlignmentType.LEFT, 80),

        // ── Items table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                thCell('Sr No', wSno),
                thCell('Product Name', wProdName),
                thCell('HSN Code', wHsn),
                thCell('No of Barrels', wBarrels),
                thCell('Packing', wPacking),
                thCell('Total Qty', wTotalQty),
                thCell('Packing Type', wPackType),
                thCell(`Rates (${quote?.curr || 'INR'})`, wRate, AlignmentType.RIGHT),
                thCell('Per', wPerUnit),
              ],
            }),
            ...itemRows,
          ],
        }),

        para([], AlignmentType.LEFT, 80),

        // ── Totals (right-aligned paragraphs)
        para([r('Sub-Total (excl. GST):  ', { size: 17, color: C_GRAY }), r(fmtRate(sub, sym), { size: 17 })], AlignmentType.RIGHT, 30),
        ...preLines.map(a => {
          const pct = a.mode === 'percent' ? ` (${a.rate}%)` : '';
          const label = `${a.label || 'Adjustment'}${pct}:  `;
          return para([r(label, { size: 17, color: C_GRAY }), r((a.amount < 0 ? '-' : '') + fmtRate(Math.abs(a.amount), sym), { size: 17 })], AlignmentType.RIGHT, 30);
        }),
        ...(preLines.length > 0 ? [para([r('Taxable Value:  ', { size: 17, color: C_GRAY }), r(fmtRate(sub + preLines.reduce((s, a) => s + a.amount, 0), sym), { size: 17 })], AlignmentType.RIGHT, 30)] : []),
        para([r('GST Amount:  ', { size: 17, color: C_GRAY }), r(fmtRate(t_raw.gstTotal, sym), { size: 17 })], AlignmentType.RIGHT, 30),
        ...postLines.map(a => {
          const pct = a.mode === 'percent' ? ` (${a.rate}%)` : '';
          return para([r(`${a.label || 'Adjustment'}${pct}:  `, { size: 17, color: C_GRAY }), r((a.amount < 0 ? '-' : '') + fmtRate(Math.abs(a.amount), sym), { size: 17 })], AlignmentType.RIGHT, 30);
        }),
        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
          alignment: AlignmentType.RIGHT,
          spacing: { before: 40, after: 60 },
          children: [r('Grand Total:  ', { bold: true, size: 20 }), r(fmtRate(grand, sym), { bold: true, size: 20 })],
        }),

        // ── Banking + T&C
        bankAndTermsTable,
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
  triggerDownload(blob, order.id + '_PI.docx');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
