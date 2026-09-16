import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, Quote, Order, AppSettings, CompanyUnit, BankAccount, StockMovement } from './types';
import { formatINR, resolveAdjustments, maxItemGstRate, fmtDate, getNegotiationExportTables, type ResolvedAdjustment } from './utils';
import { supabase } from './supabase';

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
  return sym.trimEnd() + ' ' + s;
}

function fmtAmount(value: number, sym: string): string {
  const s = value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym.trimEnd() + ' ' + s;
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
  const sigImg = unit?.sig_url || settings?.sig_url || localStorage.getItem('mrt_sig_img');

  // ── Header (hardcoded text — no letterhead image) ─────────────────────
  let y = 9;
  doc.setFont('times', 'bold'); doc.setFontSize(16); doc.setTextColor(0, 0, 0);
  doc.text('HIMALAYA TERPENES PVT. LTD.', pw / 2, y, { align: 'center' }); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(40, 40, 40);
  doc.text('GUM ROSIN, GUM TURPENTINE, DIPENTENE, PINEOIL, TERPINEOL, CAMPHOR POWDER, ISOBORNEOL FLAKES ETC.', pw / 2, y, { align: 'center' }); y += 5;
  doc.setFontSize(7);
  doc.text('201/5, Jogani Industrial Complex, V.N. Purav Marg, Sion-Chunabhatti (E), Mumbai - 400 022. CIN: U24100MH1999PTC121377', pw / 2, y, { align: 'center' }); y += 4;
  doc.text('GSTIN: 27AAACH6788H1Z6', pw / 2, y, { align: 'center' }); y += 4;
  doc.text('Tel.: 91-22-35397800/01  |  E Mail: mum@himalayaterpene.com  |  Web.: www.himalayaterpene.com', pw / 2, y, { align: 'center' }); y += 5;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.4);
  doc.line(mx, y, rx, y); y += 2;

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
    addrParts.filter(p => p.trim()).forEach((part) => {
      const lines = (doc.splitTextToSize(part, cw - 30) as string[]).filter(l => l.trim());
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

  // ── Dear [Name] + intro ──────────────────────────────────────────────────
  y += 8;
  const contactFullName = (quote as any).contact || primaryContact?.name || '';
  const salutation = (() => {
    const n = contactFullName.trim().replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i, '').trim();
    const first = n.split(/\s+/)[0] || '';
    return first ? `Dear ${first} ji,` : 'Dear Sir/Madam,';
  })();
  doc.text(salutation, mx, y);
  y += 6;
  const intro =
    'Thank you for your enquiry, we are pleased to submit our offer for the same as under. ' +
    'We hope this is in line with your requirement and your valued order follows soon.';
  (doc.splitTextToSize(intro, cw) as string[]).forEach((l) => {
    doc.text(l, mx, y);
    y += 5;
  });

  // ── Items table ──────────────────────────────────────────────────────────
  // Widths chosen so every header AND 8-digit HSN data fit on one line at 8pt.
  // Verified minimums: HSN "38061090" needs ~19mm body, "No of Barrels" header needs ~22mm header.
  const wSnoP = 9, wHsnP = 22, wBarrelsP = 22, wPackingP = 14, wTotalQtyP = 16, wPackTypeP = 23, wRateP = 25, wPerP = 15;
  const wProdNameP = cw - wSnoP - wHsnP - wBarrelsP - wPackingP - wTotalQtyP - wPackTypeP - wRateP - wPerP;
  y += 4;

  const tableHead = [['Sr No', 'Product Name', 'HSN Code', 'No of Barrels', 'Packing', 'Total Qty', 'Packing Type', 'Rates (' + quote.curr + ')', 'Per']];

  const tableBody = quote.items.map((i, idx) => {
    const rateCell = (i as any).rateOverride
      ? ((i as any).rateText?.trim() || 'Regret')
      : fmtRate(i.unitPrice, sym);
    // Use TypeScript-typed fields (i.hsn, i.packing, i.packingType) — these are the actual
    // field names in QuoteItem. Fallback to snake_case variants in case items were stored via
    // older code paths.
    const productName = (i as any).product_name || i.desc || '';
    const hsnCode = i.hsn || (i as any).hsn_code || '';
    const noOfBarrels = i.qty != null ? String(i.qty) : '';
    const packing = i.packing || '';
    const packingNum = parseFloat(packing) || 0;
    const totalQty = (i as any).total_qty != null
      ? String((i as any).total_qty)
      : (i.qty && packingNum ? String(i.qty * packingNum) : '');
    const packingType = i.packingType || (i as any).packing_type || '';
    const _pb = i.priceBasis?.trim();
    const perUnit = !_pb ? 'kg' : _pb.startsWith('Per ') ? _pb.slice(4) : _pb;
    return [idx + 1, productName, hsnCode, noOfBarrels, packing, totalQty, packingType, rateCell, perUnit];
  });

  const ratesColIdx = 7;

  const tableColStyles: Record<number, any> = {
    0: { cellWidth: wSnoP, halign: 'center' },
    1: { cellWidth: wProdNameP },
    2: { cellWidth: wHsnP, halign: 'center' },
    3: { cellWidth: wBarrelsP, halign: 'center' },
    4: { cellWidth: wPackingP, halign: 'center' },
    5: { cellWidth: wTotalQtyP, halign: 'center' },
    6: { cellWidth: wPackTypeP, halign: 'center' },
    7: { cellWidth: wRateP, halign: 'right' },
    8: { cellWidth: wPerP, halign: 'center' },
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
      fontSize: 8,
      cellPadding: 1,
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

  // ── Negotiation round tables — one per round, same column set as the main
  // item table above (which stays untouched, showing the original 1st-time-
  // quoted values). No totals block — the table itself is the record; the
  // exported document intentionally does not repeat Sub-Total/Insurance/
  // GST Total/Grand Total under it. No-op when the quote has no rounds.
  for (const round of getNegotiationExportTables(quote)) {
    if (y > ph - 70) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    doc.text(`Negotiation ${round.round} — Revised Pricing (${fmtDate(round.date)})`, mx, y);
    y += 4;

    const negBody = round.items.map((i, idx) => [
      idx + 1, i.desc, i.hsn, String(i.qty), i.packing, i.totalQty, i.packingType, fmtRate(i.rate, sym), i.perUnit,
    ]);

    autoTable(doc, {
      startY: y,
      head: tableHead,
      body: negBody,
      theme: 'grid',
      headStyles: {
        fillColor: TRUST_BLUE,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 1,
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
      margin: { left: mx, right: mx },
    });

    y = (doc as any).lastAutoTable.finalY + 8;
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
  // Incoterms/delivery term — quote.inco is the single source of truth
  // (the "Incoterms" field on the Quotation form, editable there and
  // pre-filled from the customer master's own Incoterms on Attach to
  // Enquiry). This used to be hardcoded to "Ex Godown Bhiwandi" regardless
  // of quote.inco, which is why the printed/emailed "Delivery" line never
  // matched what the form actually showed.
  if (quote.inco) tncRows.push({ label: 'Delivery', value: quote.inco });

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

  const settingsSig: SigPerson | undefined = settings?.signatory_name
    ? { name: settings.signatory_name, designation: settings.signatory_title || 'CRM', phone: settings.signatory_phone || '' }
    : undefined;
  // Priority: per-quote selection → app_settings → authorized_signatories is_default → hardcoded fallback
  const person: SigPerson = (quote.authorizedPerson?.name ? (quote.authorizedPerson as SigPerson) : undefined)
    || settingsSig
    || defaultSignatory
    || { name: 'Samata Yadav', designation: 'CRM', phone: '+918657000610' };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  const boldPart = 'HIMALAYA TERPENES PVT. LTD.';
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
  const sigImg = unit?.sig_url || settings?.sig_url || localStorage.getItem('mrt_sig_img');

  // ── Header (hardcoded text — no letterhead image) ────────────────────────
  const headerH = 37;
  let y: number;

  doc.setFont('times', 'bold'); doc.setFontSize(16); doc.setTextColor(0, 0, 0);
  doc.text('HIMALAYA TERPENES PVT. LTD.', pw / 2, 10, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(40, 40, 40);
  doc.text('GUM ROSIN, GUM TURPENTINE, DIPENTENE, PINEOIL, TERPINEOL, CAMPHOR POWDER, ISOBORNEOL FLAKES ETC.', pw / 2, 16, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(40, 40, 40);
  doc.text('201/5, Jogani Industrial Complex, V.N. Purav Marg, Sion-Chunabhatti (E), Mumbai - 400 022. CIN: U24100MH1999PTC121377', pw / 2, 22, { align: 'center' });
  doc.text('GSTIN: 27AAACH6788H1Z6', pw / 2, 26, { align: 'center' });
  doc.text('Tel.: 91-22-35397800/01  |  E Mail: mum@himalayaterpene.com  |  Web.: www.himalayaterpene.com', pw / 2, 32, { align: 'center' });
  y = headerH;

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

  // ── Customer + PO details ────────────────────────────────────────────────
  const primarySite =
    (((order as any).siteId ? (customer?.sites ?? []).find((s) => s.id === (order as any).siteId) : undefined))
    || (customer?.sites ?? []).find((s) => s.isPrimary)
    || (customer?.sites ?? [])[0];
  const primaryContact = (primarySite?.contacts ?? []).find((c) => c.isPrimary) || (primarySite?.contacts ?? [])[0];

  // ── Dear [Name] letter ───────────────────────────────────────────────────
  y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30);
  const piContactName = (order as any).contact || primaryContact?.name || '';
  const piSalutation = (() => {
    const n = piContactName.trim().replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|prof\.?)\s+/i, '').trim();
    const first = n.split(/\s+/)[0] || '';
    return first ? `Dear ${first} ji,` : 'Dear Sir/Madam,';
  })();
  doc.text(piSalutation, mx, y);
  y += 5;
  const letterBody = 'We are sending here with our Performa Invoice. You are requested to kindly deposit the payment with our bank account under intimation to us so that we may be able to provide your material.';
  (doc.splitTextToSize(letterBody, cw) as string[]).forEach((l) => {
    doc.text(l, mx, y); y += 4.5;
  });

  y += 4;

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

  // ── Items table (matches Quotation PDF columns exactly) ──────────────────
  const wSnoPI = 9, wHsnPI = 22, wBarrelsPI = 22, wPackingPI = 14, wTotalQtyPI = 16, wPackTypePI = 23, wRatePI = 25, wPerPI = 15;
  const wProdNamePI = cw - wSnoPI - wHsnPI - wBarrelsPI - wPackingPI - wTotalQtyPI - wPackTypePI - wRatePI - wPerPI;
  autoTable(doc, {
    startY: y,
    head: [['Sr No', 'Product Name', 'HSN Code', 'No of Barrels', 'Packing', 'Total Qty', 'Packing Type', 'Rates (' + (quote?.curr || 'INR') + ')', 'Per']],
    body: order.items.map((i, idx) => {
      const packing = i.packing || '';
      const packingNum = parseFloat(packing) || 0;
      const totalQty = i.qty && packingNum ? String(i.qty * packingNum) : '';
      const _pb = (i as any).priceBasis?.trim();
      const perUnit = !_pb ? 'kg' : _pb.startsWith('Per ') ? _pb.slice(4) : _pb;
      return [
        idx + 1,
        i.desc || '',
        i.hsn || order.hsn || '',
        i.qty != null ? String(i.qty) : '',
        packing,
        totalQty,
        (i as any).packingType || '',
        fmtRate(i.agreedRate, sym),
        perUnit,
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: TRUST_BLUE, textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, cellPadding: 1, lineColor: HEAD_BORDER, lineWidth: 0.5, halign: 'center' },
    bodyStyles: { fontSize: 9, cellPadding: 1.5, textColor: [30, 30, 30], lineColor: [80, 80, 80], lineWidth: 0.35 },
    columnStyles: {
      0: { cellWidth: wSnoPI, halign: 'center' },
      1: { cellWidth: wProdNamePI },
      2: { cellWidth: wHsnPI, halign: 'center' },
      3: { cellWidth: wBarrelsPI, halign: 'center' },
      4: { cellWidth: wPackingPI, halign: 'center' },
      5: { cellWidth: wTotalQtyPI, halign: 'center' },
      6: { cellWidth: wPackTypePI, halign: 'center' },
      7: { cellWidth: wRatePI, halign: 'right' },
      8: { cellWidth: wPerPI, halign: 'center' },
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
  // Incoterms/delivery term — order.inco is the single source of truth
  // (the "Incoterms" field on the Order form, pre-filled from the linked
  // quote or the customer master), same bug/fix as generateQuotePDF's
  // Delivery line above — this used to be hardcoded to "Ex Godown
  // Bhiwandi" regardless of order.inco.
  if (order.inco) {
    doc.text('• Delivery: ' + order.inco, termsX, yTerms); yTerms += 4.5;
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

  const piSettingsSig: SigPerson | undefined = settings?.signatory_name
    ? { name: settings.signatory_name, designation: settings.signatory_title || 'CRM', phone: settings.signatory_phone || '' }
    : undefined;
  // Priority: per-order selection → app_settings → authorized_signatories is_default → hardcoded fallback
  const person: SigPerson = (order.authorizedPerson?.name ? (order.authorizedPerson as SigPerson) : undefined)
    || piSettingsSig
    || defaultSignatory
    || { name: 'Samata Yadav', designation: 'CRM', phone: '+918657000610' };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  const boldPart = 'HIMALAYA TERPENES PVT. LTD.';
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

/**
 * Unified async entry point for Order PI PDF generation.
 * Always fetches the default bank account directly from Supabase (is_default = true)
 * so both the download button and email attachment always show the same bank details.
 */
export async function generateOrderPDF(
  order: Order,
  quote: Quote | undefined,
  customer: Customer | undefined,
  settings: AppSettings | null,
  defaultSignatory: SigPerson | undefined,
  unit: CompanyUnit | undefined,
  download: boolean,
): Promise<jsPDF> {
  const { data: bankAccount } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('is_default', true)
    .single();
  return generatePIPDF(order, quote, customer, settings, defaultSignatory, download, unit, bankAccount ?? undefined);
}

// Godown addresses this Delivery Order can be issued against, keyed off
// movement.warehouse (see WAREHOUSES in NewStockOutward.tsx — these four
// strings, case-sensitive, are the only values that occur). Must be kept in
// sync with the identical table in src/lib/outwardDocx.ts.
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

/**
 * Outward "Delivery Order" — a plain goods-movement document, no
 * price/GST/bank data (Outward entries carry none). Header/field layout
 * mirrors a physical pre-printed Delivery Order pad (unlike every other
 * generated doc in this app, which shares generatePIPDF's letterhead).
 * Addressed to the godown holding the stock (see GODOWN_ADDRESSES above)
 * rather than the customer, with a single line-items row (Outward only ever
 * carries one) instead of a pricing table. Kept async for compatibility with
 * existing callers, though it no longer awaits anything itself — the
 * line-items table shows the form's own Product Code (no real GST HSN code
 * exists for Outward movements, unlike Quote/Order).
 *
 * Unlike every other generator in this file, the page is sized to fit this
 * document's own content (single item, fixed-height footer) instead of a
 * fixed A4 height — see drawOutwardContent's two-pass measure-then-draw
 * comment below for why. 180mm wide (narrower than standard A4's 210mm) —
 * the line-items table is 7 columns with Party Name/Transporter/Fulfilment
 * Type on their own line below it, so it doesn't need full A4 width.
 */
export async function generateOutwardPDF(
  movement: StockMovement,
  customer: Customer | undefined,
  settings: AppSettings | null,
  defaultSignatory: SigPerson | undefined,
  unit: CompanyUnit | undefined,
  download: boolean,
): Promise<jsPDF> {
  const productCode = (movement as any).productCode || '—';
  const partyNameDisplay = (movement.partyName === 'Other' ? movement.otherParty : movement.partyName) || '—';
  const transporterDisplay = (movement.transporter === 'Other' ? movement.otherTransporter : movement.transporter) || '—';
  const fulfilmentTypeDisplay = movement.fulfilmentType || '—';

  // Draws the entire Outward Delivery Order body — header through the
  // footer signature block — onto `doc` and returns the y position right
  // after it. Pulled out into a function (rather than inline) so it can run
  // twice: once on a throwaway tall doc purely to measure how tall the real
  // content is, then again on a doc sized to fit that content exactly —
  // this document has one line item and a fixed-height footer, so unlike
  // Quote/Order (which keep using standard A4 and may span multiple pages)
  // it should never need more than a single, content-sized page.
  const drawOutwardContent = (doc: jsPDF): number => {
    // Read the page's actual width back from the doc rather than assuming a
    // fixed number — jsPDF's constructor silently swaps a custom
    // [width, height] array's values when orientation 'p' is passed but
    // width > height (see the two-pass construction below for why), so the
    // real width isn't reliably knowable ahead of time from the numbers
    // passed in.
    const pw = doc.internal.pageSize.getWidth();
    const mx = 15.4;
    const rx = pw - 15.4;
    const cw = rx - mx;
    const sigImg = unit?.sig_url || settings?.sig_url || localStorage.getItem('mrt_sig_img');

    // ── Header — four centered lines matching the pre-printed Delivery Order
    // pad (no tagline/CIN/GSTIN/contact line — those don't appear on it) ────
    let y: number;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(0, 0, 0);
    doc.text('Delivery Order', pw / 2, 9, { align: 'center' });
    doc.setFont('times', 'bold'); doc.setFontSize(16); doc.setTextColor(0, 0, 0);
    doc.text('Himalaya Terpenes Pvt. Ltd.', pw / 2, 17, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(40, 40, 40);
    doc.text('Unit No. 201, Building No. 5, Jogani Industrial Complex,', pw / 2, 23, { align: 'center' });
    doc.text('V. N. Purav Marg, Sion-Chunabhatti, Mumbai - 400 022. INDIA', pw / 2, 27, { align: 'center' });
    y = 34;

    // Draws "label" + "value" as plain text, positioning the value right after
    // the label (or, for align 'right', anchoring the whole label+value pair
    // to x instead of starting from it).
    const drawField = (
      x: number, yPos: number, label: string, value: string,
      opts: { align?: 'left' | 'right'; bold?: boolean } = {},
    ) => {
      doc.setFont('helvetica', 'normal');
      const labelW = doc.getTextWidth(label);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      const valueW = doc.getTextWidth(value);
      const valueX = opts.align === 'right' ? x - valueW : x + labelW;
      const labelX = opts.align === 'right' ? valueX - labelW : x;
      doc.setFont('helvetica', 'normal');
      doc.text(label, labelX, yPos);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.text(value, valueX, yPos);
      doc.setFont('helvetica', 'normal');
    };

    // ── Delivery Order No. | Date ────────────────────────────────────────────
    y += 6;
    doc.setFontSize(9); doc.setTextColor(30, 30, 30);
    const dateStr = movement.doDate
      ? new Date(movement.doDate + 'T00:00:00').toLocaleDateString('en-GB')
      : '—';
    drawField(mx, y, 'Delivery Order No.: ', movement.doNumber || '—');
    drawField(rx, y, 'Date : ', dateStr, { align: 'right' });

    // ── Godown address (who this DO is addressed to — see GODOWN_ADDRESSES),
    // centered like the header block at the top of this function — bold name,
    // then the address (re-wrapped with splitTextToSize since it may run
    // longer than one line), then mobile (only when non-empty — Reliable has
    // none on file).
    const godown = GODOWN_ADDRESSES[movement.warehouse];
    if (godown) {
      y += 9;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
      doc.text('M/s. ' + godown.name, pw / 2, y, { align: 'center' });
      y += 5;
      doc.setFont('helvetica', 'normal');
      const addrLines = doc.splitTextToSize(godown.address, cw) as string[];
      addrLines.forEach((line) => { doc.text(line, pw / 2, y, { align: 'center' }); y += 5; });
      if (godown.mobile) {
        doc.text('Mobile : ' + godown.mobile, pw / 2, y, { align: 'center' });
        y += 5;
      }
    }

    // ── Delivery instruction — Lot No./Dated now split out into their own
    // field line below instead of being folded into this sentence ──────────
    y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    const instrLines = doc.splitTextToSize(
      'Please Deliver the following material to the bearer from our stock stored at your warehouse vide your',
      cw,
    ) as string[];
    instrLines.forEach((line) => { doc.text(line, mx, y); y += 5; });

    // ── Lot No. | Dated — same field style as Delivery Order No./Date above
    y += 3;
    doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    const lotDateText = movement.inwardDate
      ? new Date(movement.inwardDate + 'T00:00:00').toLocaleDateString('en-GB').replace(/\//g, '-')
      : '—';
    drawField(mx, y, 'Lot No.: ', movement.whLotNo || '—');
    drawField(rx, y, 'Dated: ', lotDateText, { align: 'right' });

    y += 4;

    // ── Line-items table — single row, Outward only ever carries one item.
    // Same head/body/fillColor/grid styling as the item table in
    // generateQuotePDF above, for visual consistency across generated docs.
    const tableHead = [['Product Name', 'Product Code', 'No of Barrels', 'Packing', 'Total Qty', 'Packing Type', 'MOU']];
    const tableBody = [[
      (movement as any).billingName || movement.productName || '—',
      productCode,
      movement.numArticles || '—',
      movement.packing != null ? String(movement.packing) : '—',
      movement.totalQty != null ? movement.totalQty.toLocaleString('en-IN') : '—',
      movement.packagingType || '—',
      movement.weightType || '—',
    ]];

    autoTable(doc, {
      startY: y,
      head: tableHead,
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: TRUST_BLUE,
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 1,
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
        halign: 'center',
      },
      columnStyles: { 0: { halign: 'left' } },
      margin: { left: mx, right: mx },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // ── Party Name | Transporter | Fulfilment Type — moved out of the
    // line-items table (used to be 3 of its columns) onto their own line
    // below it, so the table stays narrow. Same drawField pattern as the
    // Delivery Order No./Date and Lot No./Dated rows above.
    doc.setFontSize(9); doc.setTextColor(30, 30, 30);
    drawField(mx, y, 'Party Name: ', partyNameDisplay);
    drawField(pw / 2 - 12, y, 'Transporter: ', transporterDisplay);
    drawField(rx, y, 'Fulfilment Type: ', fulfilmentTypeDisplay, { align: 'right' });
    y += 12;

    // ── Sign-off — matches the pre-printed pad's own footer: a rubber-stamp
    // rule, then "Thanking You." + fine-print terms on the left against a
    // signature block on the right, instead of the old one-line "Thanks &
    // Kind Regards," + company/signatory line. No page-break guard here —
    // the page is sized to fit this content exactly, so it always fits on
    // the one page.
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    // A literal "●" (U+25CF) isn't in the WinAnsi encoding jsPDF's built-in
    // "helvetica" font uses, so doc.text() would render it as corrupted
    // characters instead of a dot — draw an actual filled circle shape
    // instead, which renders regardless of font/encoding support.
    doc.setFillColor(0, 0, 0);
    doc.circle(mx + 1, y - 1, 1, 'F');
    doc.text('PLEASE PUT YOUR RUBBER STAMP & SIGN', mx + 4, y);
    y += 3;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
    doc.line(mx, y, rx, y);
    y += 10;

    // Outward's footer signatory is hardcoded (unlike Quote/Order, which
    // resolve it from settings.signatory_name/defaultSignatory) — the same
    // person signs every Delivery Order regardless of warehouse or app_settings.
    const person: SigPerson = { name: 'Samata Yadav', designation: 'DISPATCH', phone: '+919987682255' };

    const colTopY = y;

    // Left column — "Thanking You." + the pad's numbered fine-print terms.
    let yLeft = colTopY;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    doc.text('Thanking You.', mx, yLeft);
    yLeft += 8;
    doc.setFontSize(8.5); doc.setTextColor(30, 30, 30);
    const termLines = [
      '1) This D.O. is valid for 4 days only',
      '2) Please weight the material before taking the delivery.',
      '3) No responsibility of leakages/shortage after leaving the material from our godown.',
    ];
    termLines.forEach((t) => {
      (doc.splitTextToSize(t, cw / 2 - 6) as string[]).forEach((l) => { doc.text(l, mx, yLeft); yLeft += 4.8; });
    });

    // Right column — signature block, right-aligned to rx. Same sigImg
    // source/try-catch as before, just relocated here; the resolved
    // person (name/designation/phone) moves to a small gray line under
    // "Authorised Signatory" instead of sharing the main sign-off line.
    let yRight = colTopY;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    doc.text('For Himalaya Terpenes Pvt. Ltd.', rx, yRight, { align: 'right' });
    yRight += 8;

    if (sigImg) {
      try {
        const fmt = sigImg.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(sigImg, fmt, rx - 40, yRight, 40, 15);
        yRight += 18;
      } catch (e) { console.warn('Signature image failed', e); }
    }

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
    doc.text('Authorised Signatory', rx, yRight, { align: 'right' });
    yRight += 6;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(0, 0, 0);
    doc.text(person.name + (person.designation ? ' | ' + person.designation : '') + (person.phone ? ' | Tel.: ' + person.phone : ''), rx, yRight, { align: 'right' });
    yRight += 4;

    return Math.max(yLeft, yRight);
  };

  // ── Pass 1: measure — draw onto a throwaway, generously tall doc purely to
  // find out how tall the real content is. Never saved/returned; jsPDF's
  // getVerticalCoordinate() bakes each draw call's y-position into the PDF
  // content stream using THIS doc's page height at draw time, so shrinking a
  // page's height after its content is already drawn would leave that
  // content positioned for the old, taller page — the page must be created
  // at its final size before anything is drawn onto it, hence measuring on
  // a separate doc first rather than resizing this one in place. Orientation
  // 'p' is safe here — 400 > 180 already satisfies portrait, so jsPDF's
  // orientation swap (see below) never triggers on this doc. 180mm wide
  // (narrower than standard A4's 210mm) since the table is back to 7
  // columns with Party Name/Transporter/Fulfilment Type on their own line
  // below it instead of extra table columns.
  const measureDoc = new jsPDF('p', 'mm', [180, 400]);
  const finalY = drawOutwardContent(measureDoc);

  // ── Pass 2: draw for real onto a doc sized to fit that content, with an
  // ~18mm bottom margin below the footer. jsPDF's constructor silently
  // swaps a custom [width, height] array's two values whenever they
  // contradict the requested orientation — passing 'p' (portrait) with
  // width(180) > height would make it swap to a doc that's actually 180mm
  // TALL and shorter than 180mm WIDE, silently clipping everything
  // positioned off the intended 180mm width (Date/Dated fields, the whole
  // right-aligned signature block). Picking 'p' vs 'l' based on which
  // dimension is actually larger avoids the swap in both directions;
  // drawOutwardContent itself reads the page's real width back from the
  // doc rather than assuming a fixed number, as a second safety net.
  const pageHeight = finalY + 18;
  const orientation = pageHeight >= 180 ? 'p' : 'l';
  const doc = new jsPDF(orientation, 'mm', [180, pageHeight]);
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const rx = pw - 15.4;
  drawOutwardContent(doc);

  // ── Page numbers — stamp "Page X of N" on every page ─────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100, 100, 100);
    doc.text(`Page ${p} of ${pageCount}`, rx, ph - 8, { align: 'right' });
  }

  if (download) doc.save((movement.doNumber || 'delivery_challan') + '_DC.pdf');
  return doc;
}