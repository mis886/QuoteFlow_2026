import React, { useState } from 'react';
import { X, Send, Paperclip, Mail, Loader2 } from 'lucide-react';
import { Quote, Order, Customer, Contact, AppSettings, AuthorizedSignatory } from '../lib/types';
import { Button } from './ui';
import { formatINR } from '../lib/utils';
import { generateQuotePDF } from '../lib/pdfGenerator';
import { generatePIPDF } from '../lib/pdfGenerator';
import { sendViaGmail } from '../lib/gmail';

const SUPPORT_CC = 'support@himalayaterpene.com';

// ── helpers ──────────────────────────────────────────────────────────────────
function getSiteContacts(customer?: Customer, siteId?: string): Contact[] {
  if (!customer) return [];
  // If siteId provided, restrict to that site only
  const site = siteId
    ? customer.sites.find(s => s.id === siteId) ?? customer.sites.find(s => s.isPrimary) ?? customer.sites[0]
    : customer.sites.find(s => s.isPrimary) ?? customer.sites[0];
  return (site?.contacts ?? []).filter(c => c.email);
}

function getPrimaryContact(customer?: Customer, siteId?: string): Contact | undefined {
  const contacts = getSiteContacts(customer, siteId);
  return contacts.find(c => c.isPrimary) ?? contacts[0];
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

// ── component ─────────────────────────────────────────────────────────────────
export function SendEmailModal(props: Props) {
  const { customer, siteId, onClose, onSent } = props;

  const siteContacts = getSiteContacts(customer, siteId);
  const primaryContact = getPrimaryContact(customer, siteId);
  const primaryEmail = primaryContact?.email ?? '';

  const docId   = props.doc.id;
  const isQuote = props.mode === 'quote';
  const pdfName = isQuote ? `${docId}.pdf` : `${docId}_PI.pdf`;

  const defaultSubject = isQuote
    ? `Quotation ${docId} — Himalaya TerpenesRubber Technologies`
    : `Proforma Invoice ${docId} — Himalaya TerpenesRubber Technologies`;

  const totalValue = isQuote
    ? (props.doc as Quote).items.reduce((s, i) => s + i.total, 0)
    : (props.doc as Order).items.reduce((s, i) => s + i.total, 0);

  const sigName = props.defaultSignatory?.name ?? 'Sales Team';
  const sigDesig = props.defaultSignatory?.designation ? `\n${props.defaultSignatory.designation}` : '';

  const poSubmitLink = '';
  const poLine = '';

  const defaultBody = primaryContact
    ? `Dear ${primaryContact.name},\n\nPlease find attached our ${isQuote ? 'quotation' : 'Proforma Invoice'} ${docId} for the requirements discussed.\n\nTotal value: ${formatINR(totalValue)}${poLine}\n\nLooking forward to your favorable response.\n\nWarm regards,\n${sigName}${sigDesig}\nHimalaya TerpenesRubber Technologies`
    : `Dear Sir/Madam,\n\nPlease find attached our ${isQuote ? 'quotation' : 'Proforma Invoice'} ${docId}.${poLine}\n\nWarm regards,\n${sigName}${sigDesig}\nHimalaya TerpenesRubber Technologies`;

  const [to, setTo]           = useState(primaryEmail);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody]       = useState(defaultBody);
  const [toError, setToError] = useState('');

  // Pre-select other contacts from the same site (not the To address), plus support@ always
  const [selectedCC, setSelectedCC] = useState<Set<string>>(() => new Set(
    siteContacts.filter(c => c.email && c.email !== primaryEmail).map(c => c.email)
  ));
  const [customCC, setCustomCC] = useState('');
  const [extraCCs, setExtraCCs] = useState<string[]>([]);

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
    if (!extraCCs.includes(email) && !siteContacts.some(c => c.email === email) && email !== SUPPORT_CC) {
      setExtraCCs(prev => [...prev, email]);
      setSelectedCC(prev => new Set([...prev, email]));
    }
    setCustomCC('');
  };

  // support@ is always in CC — never togglable
  const ccString = [SUPPORT_CC, ...[...selectedCC].filter(e => e && e !== SUPPORT_CC)].filter(Boolean).join(', ');

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
        doc = generatePIPDF(props.doc as Order, op.relatedQuote, customer, props.settings, props.defaultSignatory, false);
      }

      const dataUri: string = doc.output('datauristring');
      const pdfBase64 = dataUri.split(',')[1];
      const attachments = [{ base64: pdfBase64, fileName: pdfName, mimeType: 'application/pdf' }];

      await sendViaGmail({ to: to.trim(), cc: ccString, subject, body, attachments, poLink: poSubmitLink || undefined });

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
      <div className="bg-white rounded-[4px] shadow-2xl w-full max-w-[580px] overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-g200 bg-g50">
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
          <form onSubmit={handleSend} className="p-5 flex flex-col gap-4">

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
                {/* support@ — always included, not toggleable */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border bg-red-lt border-red-mrt/30 text-red-mrt">
                  <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2.5" fill="none"><polyline points="20 6 9 17 4 12" /></svg>
                  {SUPPORT_CC}
                  <span className="text-[9px] opacity-60 font-mono">auto</span>
                </span>

                {/* Site contacts (excluding To) */}
                {siteContacts.filter(c => c.email !== to).map(c => (
                  <button key={c.email} type="button" onClick={() => toggleCC(c.email)} className={chipCls(selectedCC.has(c.email))}>
                    {selectedCC.has(c.email) && <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2.5" fill="none"><polyline points="20 6 9 17 4 12" /></svg>}
                    <span className="font-medium">{c.name}</span>
                    {c.role && <span className="opacity-60">· {c.role}</span>}
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

            {/* Error */}
            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-[3px] p-[9px_13px] text-[11.5px] text-red-mrt font-medium">
                {errorMsg}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-g200">
              <Button type="button" variant="secondary" onClick={onClose} disabled={status === 'sending'}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={status === 'sending'}>
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
