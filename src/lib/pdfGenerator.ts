import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, Quote, Order, AppSettings, CompanyUnit, BankAccount } from './types';
import { formatINR, resolveAdjustments, maxItemGstRate, fmtDate, type ResolvedAdjustment } from './utils';

export function getQuoteTotals(q: Quote) {
  const sub = q.items.reduce((a, i) => a + i.total, 0);
  const gst = q.items.reduce((a, i) => a + (i.total * i.gst / 100), 0);
  return { sub, gst, grand: sub + gst };
}

export function getOrderTotals(o: Order) {
  const sub = o.items.reduce((a, i) => a + i.total, 0);
  const itemGst = o.items.reduce((a, i) => a + (i.total * i.gst / 100), 0);
  const adj = resolveAdjustments(o.adjustments, sub, itemGst, maxItemGstRate(o.items));
  // `gst` is the combined GST (items + GST on taxable charges) so the existing
  // "GST Amount" line reflects tax on the P&F-inclusive value.
  return {
    sub,
    gst: adj.gstTotal,
    adjustmentLines: adj.lines,
    adjustmentsNet: adj.net,
    grand: adj.grand,
  };
}

function getCurrencySymbol(curr: string) {
  switch (curr) {
    case 'INR': return 'Rs. ';
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    default: return curr + ' ';
  }
}

function fmtRate(value: number, sym: string): string {
  const s = value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym.trimEnd() + ' ' + s.replace('.', '=');
}

function fmtAmount(value: number, sym: string): string {
  const s = value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym.trimEnd() + ' ' + s.replace('.', '=');
}

const TRUST_BLUE: [number, number, number] = [100, 149, 200];
const HEAD_BORDER: [number, number, number] = [60, 100, 150];

type SigPerson = { name: string; designation: string; phone?: string };

export function generateQuotePDF(
  quote: Quote,
  customer: Customer | undefined,
  settings: AppSettings | null = null,
  defaultSignatory?: SigPerson,
  download = true,
  unit?: CompanyUnit,
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = 210, ph = 297;
  // Body content matches header image width (header bleeds 10mm beyond original 25.4 margin)
  const mx = 15.4;
  const rx = pw - 15.4;
  const cw = rx - mx;
  const sym = getCurrencySymbol(quote.curr);
  const customHeader = unit?.header_url || settings?.header_url || localStorage.getItem('mrt_header_img');
  const sigImg = unit?.sig_url || settings?.sig_url || localStorage.getItem('mrt_sig_img');

// ── Header ───────────────────────────────────────────────────────────────
  const headerH = 33;
  let y: number;

  if (customHeader) {
    const hFmt = customHeader.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    try { doc.addImage(customHeader, hFmt, mx, 0, cw, headerH); } catch (e) { console.warn('Header image failed', e); }
    y = headerH;
    // GSTIN is already part of the letterhead image — don't stamp it again
  } else {
    doc.setFont('times', 'bold'); doc.setFontSize(13); doc.setTextColor(0, 0, 0);
    doc.text('Himalaya TerpenesRubber Technologies' + (unit?.name ? ' — ' + unit.name : ''), mx, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50);
    const addrLines = doc.splitTextToSize(unit?.address || '319, Shivaji Road; Vijay Nagar; Meerut (UP) – 250002; India', 95) as string[];
    addrLines.forEach((line, i) => doc.text(line, rx, 8 + i * 4, { align: 'right' }));
    doc.text('0121 – 2441966, (M) +91 9760024630', rx, 13, { align: 'right' });
    doc.text('E-mail: info@himalayaterpene.com', rx, 18, { align: 'right' });
    doc.text('Website: www.himalayaterpene.com', rx, 23, { align: 'right' });
    doc.text('GSTIN no.: ' + (unit?.gstin || '09ABMFM1195K1ZP'), rx, 28, { align: 'right' });
    y = headerH;
  }

  // ── Manufacturer tagline ─────────────────────────────────────────────────
  y += 3.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0, 0, 0);
  const mfrText =
    'Manufacturers: High Performance Kalrez, FFKM, EPDM, Viton, HNBR, Silicone, Nitrile, Neoprene, Butyl and Natural Rubber Components for Medium ' +
    'and Heavy Industries | Specialist: Manufacturers of Rubber Gaskets for PHEs and Liners for Butterfly type valves.';
  (doc.splitTextToSize(mfrText, cw) as string[]).forEach((l) => { doc.text(l, mx, y); y += 3.5; });

  // ── Ref | Date ───────────────────────────────────────────────────────────
  y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
  doc.text('Ref: ' + quote.id, mx, y);
  const dateStr = quote.date
    ? new Date(quote.date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';
  doc.text(dateStr, rx, y, { align: 'right' });



  // ── QUOTATION heading ────────────────────────────────────────────────────
  y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text('QUOTATION', pw / 2, y, { align: 'center' });
  const qw = doc.getTextWidth('QUOTATION');
  doc.setLineWidth(0.4);
  doc.line(pw / 2 - qw / 2, y + 0.8, pw / 2 + qw / 2, y + 0.8);

  // ── K.A. contact ─────────────────────────────────────────────────────────
  const primarySite =
    (((quote as any).siteId ? (customer?.sites ?? []).find((s) => s.id === (quote as any).siteId) : undefined))
    || (customer?.sites ?? []).find((s) => s.isPrimary)
    || (customer?.sites ?? [])[0];
  const primaryContact =
    (primarySite?.contacts ?? []).find((c) => c.isPrimary) || (primarySite?.contacts ?? [])[0];
  if (primaryContact?.name) {
    y += 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('K.A.: ' + primaryContact.name, pw / 2, y, { align: 'center' });
  }

  // ── Customer address ─────────────────────────────────────────────────────
  y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text(quote.cust + ',', mx, y);

  if (primarySite) {
    const addrParts: string[] = [];
    if (primarySite.name) addrParts.push(primarySite.name);
    if (primarySite.fullAddress || primarySite.address)
      addrParts.push(primarySite.fullAddress || primarySite.address || '');
    if (primarySite.city)
      addrParts.push(primarySite.city + (primarySite.state ? ', ' + primarySite.state : ''));
    addrParts.forEach((part) => {
      const lines = doc.splitTextToSize(part, cw - 30) as string[];
      lines.forEach((l) => { y += 5; doc.text(l, mx, y); });
    });
    // const quoteGstin = primarySite?.gstin || customer?.gstin;
    // if (quoteGstin) { y += 5; doc.text('GSTIN: ' + quoteGstin, mx, y); }
  }

  // ── Customer Reference (their doc no.) ──────────────────────────────────
  if (quote.custEnquiryDocNo) {
    y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text('Reference No.: ' + quote.custEnquiryDocNo, mx, y);
  }

  // ── Dear Sir + intro ─────────────────────────────────────────────────────
  y += 8;
  doc.text('Dear Sir,', mx, y);
  y += 6;
  const intro =
    'Thank you for your enquiry, we are pleased to submit our offer for the same as under. ' +
    'We hope this is in line with your requirement and your valued order follows soon.';
  (doc.splitTextToSize(intro, cw) as string[]).forEach((l) => {
    doc.text(l, mx, y);
    y += 5;
  });

  // ── Items table ──────────────────────────────────────────────────────────
  // "Rate is as per Weigh" col only prints if at least one item has a value
  const showRateWtCol = quote.items.some((i) => !!(i as any).rateAsPerWeight?.trim());
  const colRateWt = 28;
  const colParticulars = showRateWtCol
    ? cw - 15 - 22 - colRateWt - 30 - 18
    : cw - 15 - 22 - 30 - 18;
  y += 4;

  const tableHead = showRateWtCol
    ? [['S. No.', 'Quantity', 'Particulars', 'Rate is as\nper Weigh', 'Rates (' + quote.curr + ')', 'Per']]
    : [['S. No.', 'Quantity', 'Particulars', 'Rates (' + quote.curr + ')', 'Per']];

  const tableBody = quote.items.map((i) => {
    const rateCell = (i as any).rateOverride
      ? ((i as any).rateText?.trim() || 'Regret')
      : fmtRate(i.unitPrice, sym);
    const perUnit = (i as any).priceBasis?.trim() || i.uom || 'Each';
    if (showRateWtCol) {
      return [i.seq, i.qty + ' ' + (i.uom || 'nos.'), i.desc + (i.mat ? '-' + i.mat : ''), (i as any).rateAsPerWeight || '', rateCell, perUnit];
    }
    return [i.seq, i.qty + ' ' + (i.uom || 'nos.'), i.desc + (i.mat ? '-' + i.mat : ''), rateCell, perUnit];
  });

  // Column index of Rates cell depends on whether rateWt col is present
  const ratesColIdx = showRateWtCol ? 4 : 3;

  const tableColStyles: Record<number, any> = showRateWtCol
    ? {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: colParticulars },
        3: { cellWidth: colRateWt, halign: 'center' },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 18, halign: 'center' },
      }
    : {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: colParticulars },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 18, halign: 'center' },
      };

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: TRUST_BLUE,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 1.5,
      lineColor: HEAD_BORDER,
      lineWidth: 0.5,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 9,
      cellPadding: 1.5,
      textColor: [30, 30, 30],
      lineColor: [80, 80, 80],
      lineWidth: 0.35,
    },
    columnStyles: tableColStyles,
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === ratesColIdx) {
        const val = data.cell.text?.[0];
        if (val === 'Regret') {
          data.cell.styles.textColor = [180, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: mx, right: mx },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // ── Notes below item table ───────────────────────────────────────────────
  const pdfNotes = ((quote as any).notes ?? []).filter((n: string) => n.trim());
  if (pdfNotes.length > 0) {
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Note:', mx, y);
    y += 5;
    doc.setFontSize(9);
    pdfNotes.forEach((note: string, idx: number) => {
      const label = `${idx + 1}.  `;
      const maxW = cw - doc.getTextWidth(label);
      const lines = doc.splitTextToSize(note, maxW) as string[];
      lines.forEach((line: string, li: number) => {
        if (li === 0) {
          doc.setFont('helvetica', 'bold');
          doc.text(label, mx, y);
          doc.setFont('helvetica', 'normal');
          doc.text(line, mx + doc.getTextWidth(label), y);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.text(line, mx + doc.getTextWidth(label), y);
        }
        y += 4.5;
      });
    });
    y += 4;
  } else {
    y += 4;
  }

  // ── Terms & Conditions table ─────────────────────────────────────────────
  type TncRow = { label: string; value: string };
  let tncRows: TncRow[];
  try {
    const parsed = JSON.parse(quote.terms || '{}');
    tncRows = [
      { label: 'Delivery point',       value: parsed.delivery || '' },
      { label: 'Lead time',            value: parsed.leadTime || '' },
      { label: 'Packing & forwarding', value: parsed.pnf      || '' },
      { label: 'Freight',              value: parsed.freight  || '' },
      { label: 'Payment',              value: parsed.payment  || '' },
      { label: 'Validity',             value: parsed.validity || '' },
      { label: 'Taxes',                value: parsed.taxes    || '' },
    ].filter((r) => r.value);
  } catch {
    tncRows = (quote.terms || '').split('\n').filter(Boolean).map((line, i) => {
      const stripped = line.replace(/^[•\d]+[.)]\s*/, '');
      const colon = stripped.indexOf(':');
      return colon > 0
        ? { label: stripped.slice(0, colon).trim(), value: stripped.slice(colon + 1).trim() }
        : { label: String(i + 1), value: stripped };
    });
  }

  if (y > ph - 60) { doc.addPage(); y = 20; }

  const tncBody: any[] = [
    [
      {
        content: 'Terms & Conditions:',
        colSpan: 3,
        styles: {
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left',
          cellPadding: 1.5,
          fillColor: TRUST_BLUE,
          textColor: [0, 0, 0],
          lineColor: HEAD_BORDER,
          lineWidth: 0.5,
        },
      },
    ],
    ...tncRows.map((row, idx) => [
      { content: String(idx + 1), styles: { halign: 'center' } },
      { content: row.label },
      { content: row.value },
    ]),
  ];

  autoTable(doc, {
    startY: y,
    body: tncBody,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 1.5,
      textColor: [30, 30, 30],
      lineColor: [0, 0, 0],
      lineWidth: 0.35,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: cw - 12 - 55 },
    },
    margin: { left: mx, right: mx },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Sign-off ─────────────────────────────────────────────────────────────
  if (y > ph - 35) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text('Thanks & Kind Regards,', mx, y);
  y += 7;

  if (sigImg) {
    try {
      const fmt = sigImg.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(sigImg, fmt, mx, y, 40, 15);
      y += 17;
    } catch (e) { console.warn('Signature image failed', e); }
  }

  const person: SigPerson = quote.authorizedPerson?.name
    ? quote.authorizedPerson
    : defaultSignatory || { name: 'Akash Gupta', designation: 'Rubber Technologist', phone: '' };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  const boldPart = 'Himalaya TerpenesRubber Technologies';
  doc.text(boldPart, mx, y);
  const boldW = doc.getTextWidth(boldPart);
  doc.setFont('helvetica', 'normal');
  const restPart =
    ' | ' + person.name + ' | ' + person.designation + (person.phone ? ' | Tel.: ' + person.phone : '');
  doc.text(restPart, mx + boldW, y);

  // ── Page numbers — stamp "Page X of N" on every page ─────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 100, 100);
    doc.text(`Page ${p} of ${pageCount}`, rx, ph - 8, { align: 'right' });
  }

  if (download !== false) doc.save(quote.id + '.pdf');
  return doc;
}

export function generatePIPDF(
  order: Order,
  quote: Quote | undefined,
  customer: Customer | undefined,
  settings: AppSettings | null = null,
  defaultSignatory?: SigPerson,
  download = true,
  unit?: CompanyUnit,
  bankAccount?: BankAccount,
) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = 210, ph = 297;
  // Body content matches header image width (header bleeds 10mm beyond original 25.4 margin)
  const mx = 15.4;
  const rx = pw - 15.4;
  const cw = rx - mx;
  const t = getOrderTotals(order);
  const sym = getCurrencySymbol(quote?.curr || 'INR');
  const customHeader = unit?.header_url || settings?.header_url || localStorage.getItem('mrt_header_img');
  const sigImg = unit?.sig_url || settings?.sig_url || localStorage.getItem('mrt_sig_img');

  // ── Header ───────────────────────────────────────────────────────────────
  const headerH = 33;
  let y: number;

  if (customHeader) {
    const hFmt = customHeader.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    try { doc.addImage(customHeader, hFmt, mx, 0, cw, headerH); } catch (e) { console.warn('Header image failed', e); }
    y = headerH;
    // GSTIN is already part of the letterhead image — don't stamp it again
  } else {
    doc.setFont('times', 'bold'); doc.setFontSize(13); doc.setTextColor(0, 0, 0);
    doc.text('Himalaya TerpenesRubber Technologies' + (unit?.name ? ' — ' + unit.name : ''), mx, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50);
    const addrLines = doc.splitTextToSize(unit?.address || '319, Shivaji Road; Vijay Nagar; Meerut (UP) – 250002; India', 95) as string[];
    addrLines.forEach((line, i) => doc.text(line, rx, 8 + i * 4, { align: 'right' }));
    doc.text('0121 – 2441966, (M) +91 9760024630', rx, 13, { align: 'right' });
    doc.text('E-mail: info@himalayaterpene.com', rx, 18, { align: 'right' });
    doc.text('Website: www.himalayaterpene.com', rx, 23, { align: 'right' });
    doc.text('GSTIN no.: ' + (unit?.gstin || '09ABMFM1195K1ZP'), rx, 28, { align: 'right' });
    y = headerH;
  }

  // ── Manufacturer tagline ─────────────────────────────────────────────────
  y += 3.5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(0, 0, 0);
  const mfrText =
    'Manufacturers: High Performance Kalrez, FFKM, EPDM, Viton, HNBR, Silicone, Nitrile, Neoprene, Butyl and Natural Rubber Components for Medium ' +
    'and Heavy Industries | Specialist: Manufacturers of Rubber Gaskets for PHEs and Liners for Butterfly type valves.';
  (doc.splitTextToSize(mfrText, cw) as string[]).forEach((l) => { doc.text(l, mx, y); y += 3.5; });

  // ── PROFORMA INVOICE heading + details ──────────────────────────────────
  y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
  doc.text('Ref: ' + order.id, mx, y);
  const dateStr = order.poDate
    ? new Date(order.poDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';
  doc.text(dateStr, rx, y, { align: 'right' });

  y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text('PROFORMA INVOICE', pw / 2, y, { align: 'center' });
  const piw = doc.getTextWidth('PROFORMA INVOICE');
  doc.setLineWidth(0.4);
  doc.line(pw / 2 - piw / 2, y + 0.8, pw / 2 + piw / 2, y + 0.8);

  // ── Subject line ─────────────────────────────────────────────────────────
  y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
  const poDateLong = order.poDate
    ? fmtDate(order.poDate)
    : '—';
  doc.setFont('helvetica', 'bold'); doc.text('Sub: ', mx, y);
  const subLabelW = doc.getTextWidth('Sub: ');
  doc.setFont('helvetica', 'normal');
  const subText = `Performa Invoice against your Order No. ${order.poNo || '—'} dtd. ${poDateLong}`;
  const subLines = doc.splitTextToSize(subText, cw - subLabelW) as string[];
  subLines.forEach((l, i) => {
    doc.text(l, mx + (i === 0 ? subLabelW : 0), y + i * 4.5);
  });
  y += (subLines.length - 1) * 4.5;

  // ── Dear Sir letter ──────────────────────────────────────────────────────
  y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
  doc.text('Dear Sir,', mx, y);
  y += 5;
  const letterBody = 'We are sending here with our Performa Invoice. You are requested to kindly deposit the payment with our bank account under intimation to us so that we may be able to provide your material.';
  (doc.splitTextToSize(letterBody, cw) as string[]).forEach((l) => {
    doc.text(l, mx, y); y += 4.5;
  });

  // ── Customer + PO details ────────────────────────────────────────────────
  y += 4;
  const primarySite =
    (((order as any).siteId ? (customer?.sites ?? []).find((s) => s.id === (order as any).siteId) : undefined))
    || (customer?.sites ?? []).find((s) => s.isPrimary)
    || (customer?.sites ?? [])[0];
  const primaryContact = (primarySite?.contacts ?? []).find((c) => c.isPrimary) || (primarySite?.contacts ?? [])[0];

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  doc.text('Bill To:', mx, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  y += 5; doc.text(order.cust, mx, y);
  if (primarySite?.name) { y += 5; doc.text(primarySite.name, mx, y); }
  if (primaryContact?.name) { y += 5; doc.text('Attn: ' + primaryContact.name, mx, y); }
  if (primarySite?.city) { y += 5; doc.text(primarySite.city + (primarySite.state ? ', ' + primarySite.state : ''), mx, y); }
  const billGstin = primarySite?.gstin || customer?.gstin;
  if (billGstin) { y += 5; doc.text('GSTIN: ' + billGstin, mx, y); }

  // ── Ship To ──────────────────────────────────────────────────────────────
  if (order.shipToAddress) {
    y += 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    doc.text('Ship To:', mx, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    y += 5;
    const shipLines = doc.splitTextToSize(order.shipToAddress, cw / 2 - 4) as string[];
    shipLines.forEach((l) => { doc.text(l, mx, y); y += 4.5; });
  }

  // PO details on right
  let ry = y - 15;
  const piDetails: [string, string][] = [
    ['PO Number', order.poNo || '—'],
    ['PO Date', order.poDate ? fmtDate(order.poDate) : '—'],
    ['Delivery Date', order.dlvDate ? fmtDate(order.dlvDate) : '—'],
    ['Quote Ref', order.quoteRef || '—'],
  ];
  piDetails.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 100, 100);
    doc.text(k + ':', rx - 60, ry);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(v, rx, ry, { align: 'right' });
    ry += 5;
  });

  y = Math.max(y, ry) + 8;

  // ── Items table ──────────────────────────────────────────────────────────
  // Columns: # / Qty / Particulars / HSN / Rate / Per / Amount
  const wSno = 12, wQty = 24, wHsn = 24, wRate = 30, wPer = 18, wAmt = 34;
  const wPart = cw - wSno - wQty - wHsn - wRate - wPer - wAmt;
  autoTable(doc, {
    startY: y,
    head: [['S. No.', 'Quantity', 'Particulars', 'HSN', 'Rate (' + (quote?.curr || 'INR') + ')', 'Per', 'Amount']],
    body: order.items.map((i) => {
      const perUnit = (i as any).priceBasis?.trim() || i.uom || 'Each';
      const conv = Number((i as any).priceBasisConv) || 1;
      const amount = Number(i.qty) * conv * Number(i.agreedRate);
      return [
        i.seq,
        i.qty + ' ' + (i.uom || 'nos.'),
        i.desc + (i.mat ? ' - ' + i.mat : ''),
        i.hsn || order.hsn || '—',
        fmtRate(i.agreedRate, sym),
        perUnit,
        fmtAmount(amount, sym),
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: TRUST_BLUE, textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9, cellPadding: 1.5, lineColor: HEAD_BORDER, lineWidth: 0.5, halign: 'center' },
    bodyStyles: { fontSize: 9, cellPadding: 1.5, textColor: [30, 30, 30], lineColor: [80, 80, 80], lineWidth: 0.35 },
    columnStyles: {
      0: { cellWidth: wSno, halign: 'center' },
      1: { cellWidth: wQty, halign: 'center' },
      2: { cellWidth: wPart },
      3: { cellWidth: wHsn, halign: 'center' },
      4: { cellWidth: wRate, halign: 'right' },
      5: { cellWidth: wPer, halign: 'center' },
      6: { cellWidth: wAmt, halign: 'right' },
    },
    margin: { left: mx, right: mx },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Totals ───────────────────────────────────────────────────────────────
  const adjLines = t.adjustmentLines as ResolvedAdjustment[];
  const preLines  = adjLines.filter(a => a.taxable);
  const postLines = adjLines.filter(a => !a.taxable);

  const adjRow = (adj: ResolvedAdjustment) => {
    const pctNote = adj.mode === 'percent' ? ` (${adj.rate}%)` : '';
    const label = `${adj.label || 'Adjustment'}${pctNote}${adj.direction === 'deduct' ? ' (less)' : ''}`;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text(label, rx - 60, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(`${adj.amount < 0 ? '-' : ''}${fmtAmount(Math.abs(adj.amount), sym)}`, rx, y, { align: 'right' });
    y += 5.5;
  };

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
  doc.text('Sub-Total (excl. GST)', rx - 60, y); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text(fmtAmount(t.sub, sym), rx, y, { align: 'right' }); y += 5.5;

  // Taxable charges (P&F, Freight…) are added to the taxable value BEFORE GST.
  preLines.forEach(adjRow);
  if (preLines.length > 0) {
    const taxableValue = t.sub + preLines.reduce((s, a) => s + a.amount, 0);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Taxable Value', rx - 60, y); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(fmtAmount(taxableValue, sym), rx, y, { align: 'right' }); y += 5.5;
  }

  // GST is charged on the (P&F-inclusive) taxable value.
  doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text('GST Amount', rx - 60, y); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text(fmtAmount(t.gst, sym), rx, y, { align: 'right' }); y += 5.5;

  // Post-GST lines (TDS/TCS, post-tax freight) after GST.
  postLines.forEach(adjRow);

  y -= 3.5;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4); doc.line(rx - 65, y, rx, y); y += 5;
  doc.setFontSize(11); doc.setTextColor(0, 0, 0);
  doc.text('Grand Total', rx - 60, y);
   
  doc.text(fmtAmount(t.grand, sym), rx, y, { align: 'right' });
  y += 10;

  // ── Banking + Terms side by side ─────────────────────────────────────────
  const halfW = cw / 2 - 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
  const headingY = y;
  doc.text('Banking Details:', mx, headingY);
  doc.text('Terms & Conditions:', mx + halfW + 8, headingY);

  // Build list of bank lines from BankAccount, falling back to legacy settings
  type BLine = { label: string; value: string };
  const bankLines: BLine[] = [];
  if (bankAccount) {
    if (bankAccount.beneficiary) bankLines.push({ label: 'Beneficiary', value: bankAccount.beneficiary });
    bankLines.push({ label: 'Bank', value: bankAccount.bank_name });
    if (bankAccount.branch_address) bankLines.push({ label: 'Branch', value: bankAccount.branch_address });
    bankLines.push({ label: 'A/c No.', value: bankAccount.account_no });
    bankLines.push({ label: 'IFSC', value: bankAccount.ifsc });
    if (bankAccount.branch_code) bankLines.push({ label: 'Branch Code', value: bankAccount.branch_code });
    if (bankAccount.micr) bankLines.push({ label: 'MICR', value: bankAccount.micr });
    if (bankAccount.swift) bankLines.push({ label: 'SWIFT', value: bankAccount.swift });
  } else {
    const bName = settings?.bank_name || localStorage.getItem('mrt_bank_name') || 'ICICI BANK LTD.';
    const bAcc  = settings?.bank_acc  || localStorage.getItem('mrt_bank_acc')  || '0000000000';
    const bIfsc = settings?.bank_ifsc || localStorage.getItem('mrt_bank_ifsc') || 'ICIC0000000';
    const bSwift = settings?.bank_swift || localStorage.getItem('mrt_bank_swift') || '';
    bankLines.push({ label: 'Bank', value: bName });
    bankLines.push({ label: 'A/c No.', value: bAcc });
    bankLines.push({ label: 'IFSC', value: bIfsc });
    if (bSwift) bankLines.push({ label: 'SWIFT', value: bSwift });
  }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(30, 30, 30);
  let yBank = headingY + 5;
  for (const ln of bankLines) {
    const wrapped = doc.splitTextToSize(ln.label + ': ' + ln.value, halfW) as string[];
    for (const part of wrapped) {
      doc.text(part, mx, yBank);
      yBank += 4.5;
    }
  }

  let yTerms = headingY + 5;
  const termsX = mx + halfW + 8;
  if (order.terms) {
    order.terms.split('\n').filter(Boolean).forEach((st) => {
      (doc.splitTextToSize('• ' + st.trim(), halfW) as string[]).forEach((l) => {
        doc.text(l, termsX, yTerms); yTerms += 4.5;
      });
    });
  } else {
    doc.text('• Payment: Balance before dispatch.', termsX, yTerms); yTerms += 4.5;
    doc.text('• Delivery as per schedule.', termsX, yTerms); yTerms += 4.5;
  }

  // Draw a visible bordered rectangle around each side so banking/terms read as a structured box
  const boxTop = headingY - 4;
  const boxBottom = Math.max(yBank, yTerms) + 2;
  doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.35);
  doc.rect(mx - 1, boxTop, halfW + 2, boxBottom - boxTop);
  doc.rect(termsX - 1, boxTop, halfW + 2, boxBottom - boxTop);

  y = Math.max(yBank, yTerms) + 6;

  // ── Sign-off ─────────────────────────────────────────────────────────────
  if (y > ph - 35) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text('Thanks & Kind Regards,', mx, y);
  y += 7;

  if (sigImg) {
    try {
      const fmt = sigImg.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(sigImg, fmt, mx, y, 40, 15);
      y += 17;
    } catch (e) { console.warn('Signature image failed', e); }
  }

  const person: SigPerson = order.authorizedPerson?.name
    ? order.authorizedPerson
    : defaultSignatory || { name: 'Akash Gupta', designation: 'Rubber Technologist', phone: '' };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  const boldPart = 'Himalaya TerpenesRubber Technologies';
  doc.text(boldPart, mx, y);
  const boldW = doc.getTextWidth(boldPart);
  doc.setFont('helvetica', 'normal');
  doc.text(' | ' + person.name + ' | ' + person.designation + (person.phone ? ' | Tel.: ' + person.phone : ''), mx + boldW, y);

  // ── Page numbers — stamp "Page X of N" on every page ─────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 100, 100);
    doc.text(`Page ${p} of ${pageCount}`, rx, ph - 8, { align: 'right' });
  }

  if (download !== false) doc.save(order.id + '_PI.pdf');
  return doc;
}