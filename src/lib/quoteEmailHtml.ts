// 2026-11-04: the quotation INSIDE the email body (SendEmailModal, mode
// 'quote') — no PDF attached any more. Layout = the design management
// approved ("Claude outputs/quotation_email_test_HTP-2026-1023.html"):
// email-safe HTML only (tables, inline styles, bgcolor, max-width 650px).
// Every value comes from the same helpers generateQuotePDF prints from
// (pdfGenerator.ts: quoteSalutation, quoteDateLabel, quoteAddressLines,
// quoteItemRows, quoteNotes, quoteNegotiationTables, quoteTermsRows), so the
// email and the PDF always show the same data.
import type { Customer, Quote } from './types';
import {
  quoteAddressLines, quoteDateLabel, quoteItemRows, quoteNegotiationTables, quoteNotes, quoteSalutation,
  quoteTableHead, quoteTermsRows,
} from './pdfGenerator';

/** The signature under "Warm regards," — SendEmailModal's sigBlock values. */
export interface QuoteEmailSignatory { name: string; designation?: string; phone?: string }

export const QUOTE_EMAIL_INTRO =
  'Thank you for your enquiry. We are pleased to submit our offer for the same as under. ' +
  'We hope this is in line with your requirement and your valued order follows soon.';
const COMPANY = 'HIMALAYA TERPENES PVT. LTD.';
const TEL = '91-22-35397800/01';
const EMAIL = 'mum@himalayaterpene.com';
const WEB = 'www.himalayaterpene.com';

/** Escapes text for HTML (element content and attribute values). */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// "+918657000610" → "+91 86570 00610" (as in the approved design); anything else as typed.
const fmtMobile = (p: string) => {
  const m = p.replace(/[\s-]/g, '').match(/^(?:\+?91)?(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : p.trim();
};
const escLines = (s: string) => escapeHtml(s).replace(/\r?\n/g, '<br>');

const FONT = 'font-family:Arial,Helvetica,sans-serif;';
const TEXT = `${FONT}font-size:13px;color:#111111;`;
const row = (style: string, inner: string) => `  <tr><td style="${style}">${inner}</td></tr>`;
const BLUE = '#5b8fd0';
const CELL = 'border:1px solid #111111;';
// Item table columns: Sr No, Product Name, HSN, Barrels, Packing, Total Qty, Packing Type, Rate, Per.
const ALIGN = ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'right', 'center'];

function itemTable(head: string[], rows: (string | number)[][]): string {
  const th = head.map(h => `        <th bgcolor="${BLUE}" style="background:${BLUE};${CELL}font-size:10px;">${escapeHtml(h)}</th>`).join('\n');
  const trs = rows.map(r => {
    const tds = r.map((v, c) => {
      const regret = c === 7 && v === 'Regret';   // the PDF shows Regret in red, bold
      const style = `${CELL}${c === 7 ? 'white-space:nowrap;' : ''}${regret ? 'color:#b40000;font-weight:bold;' : ''}`;
      return `        <td align="${ALIGN[c]}" style="${style}">${escapeHtml(v)}</td>`;
    }).join('\n');
    return `      <tr>\n${tds}\n      </tr>`;
  }).join('\n');
  return `    <table width="100%" cellpadding="5" cellspacing="0" border="1" style="border-collapse:collapse;border:1px solid #111111;${FONT}font-size:11px;color:#111111;">
      <tr>
${th}
      </tr>
${trs}
    </table>`;
}

/**
 * The quotation email: `html` (the approved design) and `text` (the same
 * content for mail apps that can't show HTML). `extraMessage` = the modal's
 * optional "Additional message" — its own paragraph after the intro.
 */
export function buildQuoteEmailHtml(
  quote: Quote,
  customer: Customer | undefined,
  signatory: QuoteEmailSignatory,
  extraMessage = '',
): { html: string; text: string } {
  const salutation = quoteSalutation(quote, customer);
  const dateStr = quoteDateLabel(quote);
  const addr = quoteAddressLines(customer);
  const head = quoteTableHead(quote);
  const items = quoteItemRows(quote);
  const notes = quoteNotes(quote);
  const negotiations = quoteNegotiationTables(quote);
  const terms = quoteTermsRows(quote);
  const extra = extraMessage.trim();
  const sigLines = [
    signatory.name,
    signatory.designation || '',
    COMPANY,
    `Tel.: ${TEL}${signatory.phone?.trim() ? `  |  Mob.: ${fmtMobile(signatory.phone)}` : ''}`,
    `E-mail: ${EMAIL}`,
    `Web: ${WEB}`,
  ].filter(Boolean);

  // ── HTML ────────────────────────────────────────────────────────────────
  const h: string[] = [];
  h.push(row(`padding:0 0 12px 0;${TEXT}`, escapeHtml(salutation)));
  h.push(row(`padding:0 0 18px 0;${TEXT}`, escapeHtml(QUOTE_EMAIL_INTRO)));
  if (extra) h.push(row(`padding:0 0 18px 0;${TEXT}`, escLines(extra)));
  h.push(row("border-top:1px solid #999999;padding:14px 0 14px 0;border-bottom:1px solid #999999;text-align:center;font-family:'Times New Roman',Times,serif;font-size:20px;font-weight:bold;color:#111111;", COMPANY));
  h.push(`  <tr><td style="padding:14px 0 0 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td align="left" style="${TEXT}">Ref: ${escapeHtml(quote.id)}</td>
        <td align="right" style="${TEXT}">${escapeHtml(dateStr)}</td>
      </tr>
    </table>
  </td></tr>`);
  h.push(`  <tr><td align="center" style="padding:14px 0;${FONT}font-size:14px;font-weight:bold;text-decoration:underline;color:#111111;">QUOTATION</td></tr>`);
  h.push(row(`padding:0 0 16px 0;${TEXT}`, [`${escapeHtml(quote.cust)},`, ...addr.map(escapeHtml)].join('<br>')));
  if (quote.custEnquiryDocNo) h.push(row(`padding:0 0 16px 0;${TEXT}`, `Reference No.: ${escapeHtml(quote.custEnquiryDocNo)}`));
  h.push(`  <tr><td style="padding:0 0 18px 0;">\n${itemTable(head, items)}\n  </td></tr>`);
  if (notes.length) {
    h.push(row(`padding:0 0 18px 0;${TEXT}`,
      `<b>Note:</b><br>${notes.map((n, i) => `<b>${i + 1}.</b>&nbsp;&nbsp;${escLines(n)}`).join('<br>')}`));
  }
  for (const t of negotiations) {
    h.push(row(`padding:0 0 6px 0;${TEXT}font-weight:bold;`, escapeHtml(t.title)));
    h.push(`  <tr><td style="padding:0 0 18px 0;">\n${itemTable(head, t.rows)}\n  </td></tr>`);
  }
  if (terms.length) {
    const trs = terms.map((r, i) => i === 0
      ? `      <tr><td width="35" align="center" style="${CELL}">1</td><td width="170" style="${CELL}">${escapeHtml(r.label)}</td><td style="${CELL}">${escapeHtml(r.value)}</td></tr>`
      : `      <tr><td align="center" style="${CELL}">${i + 1}</td><td style="${CELL}">${escapeHtml(r.label)}</td><td style="${CELL}">${escapeHtml(r.value)}</td></tr>`).join('\n');
    h.push(`  <tr><td style="padding:0 0 20px 0;">
    <table width="100%" cellpadding="5" cellspacing="0" border="1" style="border-collapse:collapse;border:1px solid #111111;${FONT}font-size:12px;color:#111111;">
      <tr><td colspan="3" bgcolor="${BLUE}" style="background:${BLUE};${CELL}font-weight:bold;">Terms &amp; Conditions:</td></tr>
${trs}
    </table>
  </td></tr>`);
  }
  h.push(row(`padding:0 0 12px 0;${TEXT}`, 'For any clarifications, please feel free to contact us.'));
  h.push(row(`padding:0 0 12px 0;${TEXT}`, 'Warm regards,'));
  const sigHtml = sigLines.map(l => {
    if (l.startsWith('E-mail: ')) return `E-mail: <a href="mailto:${EMAIL}" style="color:#1a73e8;">${EMAIL}</a>`;
    if (l.startsWith('Web: ')) return `Web: <a href="https://${WEB}" style="color:#1a73e8;">${WEB}</a>`;
    return escapeHtml(l).replace('  |  ', ' &nbsp;|&nbsp; ');
  }).join('<br>');
  h.push(row(`padding:0;${FONT}font-size:13px;line-height:1.6;color:#111111;`, sigHtml));

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td align="left" style="padding:0;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:650px;border-collapse:collapse;${FONT}font-size:13px;line-height:1.5;color:#111111;">
${h.join('\n')}
</table>

</td></tr>
</table>
</body>
</html>`;

  // ── Plain text ──────────────────────────────────────────────────────────
  const t: string[] = [salutation, '', QUOTE_EMAIL_INTRO, ''];
  if (extra) t.push(extra, '');
  t.push(COMPANY, '', `Ref: ${quote.id}${dateStr ? `    ${dateStr}` : ''}`, '', 'QUOTATION', '', `${quote.cust},`, ...addr, '');
  if (quote.custEnquiryDocNo) t.push(`Reference No.: ${quote.custEnquiryDocNo}`, '');
  const textRows = (rows: (string | number)[][]) => rows.forEach(r => {
    t.push(`${r[0]}. ${r[1]}`);
    t.push(`   ${head[2]}: ${r[2] || '-'} | ${head[3]}: ${r[3] || '-'} | ${head[4]}: ${r[4] || '-'} | ${head[5]}: ${r[5] || '-'} | ${head[6]}: ${r[6] || '-'}`);
    t.push(`   ${head[7]}: ${r[7]} ${head[8]} ${r[8]}`);
  });
  textRows(items);
  t.push('');
  if (notes.length) { t.push('Note:', ...notes.map((n, i) => `${i + 1}. ${n}`), ''); }
  for (const n of negotiations) { t.push(n.title); textRows(n.rows); t.push(''); }
  if (terms.length) { t.push('Terms & Conditions:', ...terms.map((r, i) => `${i + 1}. ${/^\d+$/.test(r.label) ? '' : `${r.label}: `}${r.value}`), ''); }
  t.push('For any clarifications, please feel free to contact us.', '', 'Warm regards,', ...sigLines);

  return { html, text: t.join('\n') };
}
