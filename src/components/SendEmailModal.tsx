import React, { useState } from 'react';
import { X, Send, Paperclip, Mail, Loader2 } from 'lucide-react';
import { Quote, Order, Customer, AppSettings, AuthorizedSignatory } from '../lib/types';
import { Button } from './ui';
import { generateQuotePDF, generateOrderPDF } from '../lib/pdfGenerator';
import { sendViaGmailAsUser } from '../lib/gmail';
import { resolveCoaStorageUrl } from '../lib/supabase';
import { useAppStore } from '../store';

const SHISHIR = 'shishir@himalayaterpene.com';

// ── helpers ──────────────────────────────────────────────────────────────────
interface CCCandidate { name: string; role?: string; email: string; isPrimary?: boolean; }

// One entry per email address, not per contact — a contact's main email
// (Contact.email) and each of its extraEmails (see commit 209c9aa) all
// become separate CC candidates pointing back to the same name/role. The
// main email is always pushed first and is the only one that can carry
// isPrimary: true, so getPrimaryContact below still resolves to exactly the
// contact's main email, never an extra.
function getSiteContacts(customer?: Customer, siteId?: string): CCCandidate[] {
  if (!customer) return [];
  // If siteId provided, restrict to that site only
  const site = siteId
    ? customer.sites.find(s => s.id === siteId) ?? customer.sites.find(s => s.isPrimary) ?? customer.sites[0]
    : customer.sites.find(s => s.isPrimary) ?? customer.sites[0];
  const out: CCCandidate[] = [];
  for (const c of site?.contacts ?? []) {
    if (c.email) out.push({ name: c.name, role: c.role, email: c.email, isPrimary: c.isPrimary });
    for (const extra of c.extraEmails ?? []) {
      if (extra) out.push({ name: c.name, role: c.role, email: extra, isPrimary: false });
    }
  }
  return out;
}

function getPrimaryContact(customer?: Customer, siteId?: string): CCCandidate | undefined {
  const contacts = getSiteContacts(customer, siteId);
  return contacts.find(c => c.isPrimary) ?? contacts[0];
}

// Mirrors SampleEmailModal.tsx's urlToBase64 exactly — that one isn't
// exported, so duplicated here rather than importing it.
async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch attachment (HTTP ${res.status})`);
  const blob = await res.blob();
  const mimeType = blob.type || 'application/octet-stream';
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Guard against a misrouted fetch silently succeeding with the wrong
  // content — e.g. a bare/misresolved storage path resolving against this
  // app's own origin and landing on the SPA's catch-all route, which
  // returns index.html with a 200 status instead of a 404. That response
  // looks like a normal successful fetch otherwise, so without this check
  // a corrupted HTML "attachment" would get emailed out silently. HTML
  // always starts with '<' (a real PDF/JPG/PNG attachment never does),
  // which covers every attachment type this modal sends without hardcoding
  // one specific expected MIME type.
  if (mimeType.includes('html') || bytes[0] === 0x3c /* '<' */) {
    throw new Error('Attachment fetch returned an HTML page instead of the real file (likely a misresolved storage URL) — refusing to send it.');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mimeType };
}

// ── types ─────────────────────────────────────────────────────────────────────
interface BaseProps {
  customer?: Customer;
  siteId?: string;
  settings: AppSettings | null;
  defaultSignatory?: AuthorizedSignatory;
  onClose: () => void;
  onSent?: () => void;
}
interface QuoteProps extends BaseProps { mode: 'quote'; doc: Quote; }
interface OrderProps extends BaseProps { mode: 'order'; doc: Order; relatedQuote?: Quote; }
type Props = QuoteProps | OrderProps;

const OAUTH_CONFIGURED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

// ── component ─────────────────────────────────────────────────────────────────
export function SendEmailModal(props: Props) {
  const { customer, siteId, onClose, onSent } = props;
  const { activeDoer, user, data } = useAppStore();
  const senderEmail = activeDoer?.email ?? user?.email ?? '';
  const defaultCCs = [
    ...((user?.email ?? '').toLowerCase() === SHISHIR
      ? ['sales@himalayaterpene.com', 'anil@himalayaterpene.com']
      : [SHISHIR, 'anil@himalayaterpene.com']),
    ...(props.mode === 'order' ? ['accounts@himalayaterpene.com', 'mum@himalayaterpene.com'] : []),
  ];

  const siteContacts = getSiteContacts(customer, siteId);
  const primaryContact = getPrimaryContact(customer, siteId);
  const primaryEmail = primaryContact?.email ?? '';

  const docId   = props.doc.id;
  const isQuote = props.mode === 'quote';
  const pdfName = isQuote ? `${docId}.pdf` : `${docId}_PI.pdf`;

  // Orders don't have a DB `attachments` column yet, so this is quote-only —
  // (props.doc as any).attachments is simply undefined for orders.
  const coaGcDocs = isQuote ? ((props.doc as any).attachments ?? []).filter((a: any) => a.docType === 'COA') : [];

  const defaultSubject = isQuote
    ? `Quotation ${docId} — HIMALAYA TERPENES PVT. LTD.`
    : `Proforma Invoice ${docId} — HIMALAYA TERPENES PVT. LTD.`;

  // Signatory: prefer doc's saved authorizedPerson → app_settings → passed defaultSignatory
  const docAuthPerson = (props.doc as any).authorizedPerson;
  const settingsSig = props.settings?.signatory_name
    ? { name: props.settings.signatory_name, designation: props.settings.signatory_title || '' }
    : undefined;
  const sigName = docAuthPerson?.name || settingsSig?.name || props.defaultSignatory?.name || 'Sales Team';
  const sigDesig = (docAuthPerson?.designation || settingsSig?.designation || props.defaultSignatory?.designation)
    ? `\n${docAuthPerson?.designation || settingsSig?.designation || props.defaultSignatory?.designation}`
    : '';

  const poSubmitLink = '';

  const sigBlock = `${sigName}${sigDesig}\nHIMALAYA TERPENES PVT. LTD.\nTel.: 91-22-35397800/01\nE-mail: mum@himalayaterpene.com\nWeb: www.himalayaterpene.com`;
  const greeting = (() => {
    const name = (primaryContact?.name || '').trim();
    if (!name) return 'Dear Sir/Madam,';
    const stripped = name.replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i, '').trim();
    const firstName = stripped.split(/\s+/)[0] || '';
    return firstName ? `Dear ${firstName} ji,` : 'Dear Sir/Madam,';
  })();

  const defaultBody = isQuote
    ? `${greeting}\n\nThank you for your enquiry. Please find attached our quotation ${docId} for your requirements.\n\nWe hope this offer is in line with your expectations and look forward to receiving your valued order.\n\nFor any clarifications, please feel free to contact us.\n\nWarm regards,\n\n${sigBlock}`
    : `${greeting}\n\nPlease find attached our Proforma Invoice ${docId} for the requirements discussed.\n\nKindly arrange for the Purchase Order at your earliest convenience.\n\nFor any clarifications, please feel free to contact us.\n\nWarm regards,\n\n${sigBlock}`;

  const [to, setTo]           = useState(primaryEmail);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody]       = useState(defaultBody);
  const [toError, setToError] = useState('');

  // COA docs already on this quote — pre-checked by default (opt-out),
  // matching how CC defaults already work in this file.
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(() => new Set(coaGcDocs.map((d: any) => d.id)));

  // Pre-select other site contacts + default CCs + customer contact email (all removable).
  const docContactEmail = (props.doc as any).email ?? '';
  const initialExtraCCs = [
    ...defaultCCs,
    ...(docContactEmail && !defaultCCs.includes(docContactEmail) && docContactEmail !== primaryEmail ? [docContactEmail] : []),
  ];
  const [selectedCC, setSelectedCC] = useState<Set<string>>(() => new Set([
    ...siteContacts.filter(c => c.email && c.email !== primaryEmail).map(c => c.email),
    ...initialExtraCCs,
  ]));
  const [customCC, setCustomCC] = useState('');
  const [extraCCs, setExtraCCs] = useState<string[]>(initialExtraCCs);

  const [status, setStatus]   = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const toggleCC = (email: string) => setSelectedCC(prev => {
    const next = new Set(prev);
    next.has(email) ? next.delete(email) : next.add(email);
    return next;
  });

  const addCustomCC = () => {
    const email = customCC.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (!extraCCs.includes(email) && !siteContacts.some(c => c.email === email)) {
      setExtraCCs(prev => [...prev, email]);
      setSelectedCC(prev => new Set([...prev, email]));
    }
    setCustomCC('');
  };

  const ccString = [...selectedCC].filter(Boolean).join(', ');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim()) { setToError('Recipient email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) { setToError('Enter a valid email address.'); return; }
    setToError('');
    setStatus('sending');
    setErrorMsg('');

    try {
      let doc: any;
      if (isQuote) {
        doc = generateQuotePDF(props.doc as Quote, customer, props.settings, props.defaultSignatory, false);
      } else {
        const op = props as OrderProps;
        const orderDoc = props.doc as Order;
        const orderUnit = orderDoc.unitId
          ? data.units.find(u => u.id === orderDoc.unitId)
          : data.units.find(u => u.is_default);
        doc = await generateOrderPDF(orderDoc, op.relatedQuote, customer, props.settings, props.defaultSignatory, orderUnit, false);
      }

      const dataUri: string = doc.output('datauristring');
      const pdfBase64 = dataUri.split(',')[1];
      const attachments = [{ base64: pdfBase64, fileName: pdfName, mimeType: 'application/pdf' }];

      for (const d of coaGcDocs.filter((d: any) => selectedDocs.has(d.id))) {
        // Re-resolve at send time (not just at attach time) so a quote
        // whose COA was attached before this fix — storing a bare
        // bucket-relative path rather than a full URL — still gets a
        // correct, fetchable URL here instead of one that resolves against
        // this app's own origin. See resolveCoaStorageUrl.
        const { base64, mimeType } = await urlToBase64(resolveCoaStorageUrl(d.storagePath));
        attachments.push({ base64, fileName: d.fileName, mimeType });
      }

      await sendViaGmailAsUser({ to: to.trim(), cc: ccString, subject, body, attachments, poLink: poSubmitLink || undefined }, senderEmail);

      setStatus('sent');
      setTimeout(() => { onSent?.(); onClose(); }, 1500);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message || 'Failed to send. Please try again.');
    }
  };

  const chipCls = (sel: boolean) =>
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border transition-colors select-none cursor-pointer ${
      sel ? 'bg-[#e8f0fe] border-[#4285f4] text-[#1a56db]' : 'bg-g50 border-g200 text-g500 hover:border-g400'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blk/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[4px] shadow-2xl w-full max-w-[580px] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-g200 bg-g50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-red-mrt" />
            <div>
              <h2 className="font-serif text-[16px] text-blk tracking-tight leading-tight">
                Email <em className="italic text-red-mrt">{isQuote ? 'Quotation' : 'Proforma Invoice'}</em>
              </h2>
              <p className="text-[10.5px] text-g400 mt-[1px]">Generates PDF · Sends via Gmail · {isQuote ? 'Marks quote Sent' : 'Confirms delivery'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-g400 hover:text-blk transition-colors p-1 rounded">
            <X size={18} />
          </button>
        </div>

        {status === 'sent' ? (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="#22c55e" strokeWidth="2.5" fill="none"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div className="font-semibold text-[15px] text-blk">Email sent successfully</div>
            <div className="text-[12px] text-g400">PDF attached and delivered to {to}</div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex flex-col flex-1 min-h-0">

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-4 email-modal-body">

            {/* To */}
            <div>
              <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1">
                To <span className="text-red-mrt">*</span>
              </label>
              <div className="relative">
                <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-g400 pointer-events-none" />
                <input
                  type="text" value={to}
                  onChange={e => { setTo(e.target.value); setToError(''); }}
                  placeholder="customer@company.com"
                  className={`w-full h-9 pl-8 pr-3 bg-g50 border rounded-[3px] font-mono text-[12px] text-blk focus:ring-4 outline-none ${toError ? 'border-red-mrt focus:ring-red-lt' : 'border-g300 focus:border-red-mrt focus:ring-red-lt'}`}
                />
              </div>
              {toError && <p className="mt-1 text-[10.5px] text-red-mrt font-medium">{toError}</p>}
            </div>

            {/* CC */}
            <div>
              <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">CC</label>

              <div className="flex flex-wrap gap-1.5 mb-2">

                {/* Site contacts (excluding To and any email already shown as an extra CC chip) */}
                {siteContacts.filter(c => c.email !== to && !extraCCs.includes(c.email)).map(c => (
                  <button key={c.email} type="button" onClick={() => toggleCC(c.email)} className={chipCls(selectedCC.has(c.email))}>
                    {selectedCC.has(c.email) && <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2.5" fill="none"><polyline points="20 6 9 17 4 12" /></svg>}
                    <span className="font-medium">{c.name || c.email}</span>
                    {/* One contact can now produce several chips (main email +
                        each extraEmail) sharing the same name — show the
                        actual address on every chip so they stay
                        distinguishable, not just when name is missing. */}
                    {c.name && <span className="opacity-60 text-[9px]">{c.email}</span>}
                    {c.role && !c.name && <span className="opacity-60">· {c.role}</span>}
                  </button>
                ))}

                {/* Extra manually-added CCs */}
                {extraCCs.map(email => (
                  <button key={email} type="button" onClick={() => toggleCC(email)} className={chipCls(selectedCC.has(email))}>
                    {selectedCC.has(email) && <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2.5" fill="none"><polyline points="20 6 9 17 4 12" /></svg>}
                    {email}
                  </button>
                ))}
              </div>

              {/* Custom CC input */}
              <div className="flex gap-2 items-center">
                <input
                  type="text" value={customCC}
                  onChange={e => setCustomCC(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { addCustomCC(); e.preventDefault(); } }}
                  placeholder="Add custom CC email…"
                  className="flex-1 h-8 px-3 bg-g50 border border-g300 rounded-[3px] font-mono text-[11.5px] text-blk focus:border-red-mrt focus:ring-4 focus:ring-red-lt outline-none"
                />
                <Button type="button" size="sm" variant="secondary" onClick={addCustomCC}>+ Add</Button>
              </div>

              {/* Summary line */}
              <p className="mt-1.5 text-[10px] text-g400 font-mono truncate">CC: {ccString}</p>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1">Subject</label>
              <input type="text" title="Email subject" placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full h-9 px-3 bg-g50 border border-g300 rounded-[3px] font-sans text-[13px] font-medium text-blk focus:border-red-mrt focus:ring-4 focus:ring-red-lt outline-none" />
            </div>

            {/* Body */}
            <div>
              <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1">Message Body</label>
              <textarea title="Message body" placeholder="Message body" value={body} onChange={e => setBody(e.target.value)}
                className="w-full min-h-[110px] p-3 bg-g50 border border-g300 rounded-[3px] font-sans text-[12.5px] leading-relaxed text-blk focus:border-red-mrt focus:ring-4 focus:ring-red-lt outline-none resize-none" />
            </div>

            {/* Attachment */}
            <div className="bg-blue-50 border border-blue-100 rounded-[3px] p-[9px_13px] flex items-center gap-2.5">
              <Paperclip size={13} className="text-blue-500 shrink-0" />
              <div>
                <div className="text-[11.5px] font-semibold text-blue-900">{pdfName}</div>
                <div className="text-[10px] text-blue-500">PDF generated and attached automatically</div>
              </div>
            </div>

            {/* COA attachments already on this quote — togglable, pre-checked */}
            {coaGcDocs.length > 0 && (
              <div>
                <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">COA Attachments</label>
                <div className="flex flex-col gap-1.5">
                  {coaGcDocs.map((d: any) => (
                    <label key={d.id} className="flex items-center gap-2.5 bg-g50 border border-g200 rounded-[3px] p-[8px_12px] cursor-pointer hover:border-g400 transition-colors">
                      <input
                        type="checkbox" checked={selectedDocs.has(d.id)}
                        onChange={() => setSelectedDocs(prev => {
                          const next = new Set(prev);
                          next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                          return next;
                        })}
                        className="w-3.5 h-3.5 accent-red-mrt shrink-0"
                      />
                      <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${d.docType === 'COA' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{d.docType}</span>
                      <span className="text-[11.5px] font-medium text-blk truncate">{d.fileName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* OAuth not configured notice */}
            {!OAUTH_CONFIGURED && (
              <div className="bg-amber-50 border border-amber-200 rounded-[3px] p-[9px_13px] text-[11.5px] text-amber-800 font-medium">
                Email sending requires Google OAuth configuration. Contact your administrator to set up <code className="font-mono text-[10.5px] bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> in Cloudflare Pages environment variables.
              </div>
            )}

            {/* Error */}
            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-[3px] p-[9px_13px] text-[11.5px] text-red-mrt font-medium">
                {errorMsg}
              </div>
            )}

            </div>{/* end scrollable body */}

            {/* Sticky footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3.5 border-t border-g200 flex-shrink-0">
              <Button type="button" variant="secondary" onClick={onClose} disabled={status === 'sending'}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={status === 'sending' || !OAUTH_CONFIGURED}>
                {status === 'sending'
                  ? <><Loader2 size={13} className="animate-spin mr-1.5" />Sending…</>
                  : <><Send size={13} className="stroke-[2.5px] mr-1.5" />Send Email</>}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
