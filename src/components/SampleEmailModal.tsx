import React, { useState, useEffect } from 'react';
import { X, Send, Paperclip, Mail, Loader2 } from 'lucide-react';
import { Button } from './ui';
import { sendViaGmailAsUser, Attachment } from '../lib/gmail';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';

const DEFAULT_CCS = ['shishir@himalayaterpene.com', 'anil@himalayaterpene.com'];
const OAUTH_CONFIGURED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export interface SampleEmailModalProps {
  sampleId: string;
  customerName: string;
  productName: string;
  productGrade: string;
  quantity: string;
  unit: string;
  lotNo: string;
  sentDate: string;
  followupDue: string;
  courier: string;
  sentBy: string;
  podUrl: string | null;
  podFileName: string;
  coaUrl: string | null;
  coaFileName: string;
  onClose: () => void;
  onSent: () => void;
}

async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch attachment (HTTP ${res.status})`);
  const blob = await res.blob();
  const mimeType = blob.type || 'application/octet-stream';
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mimeType };
}

function buildBody(p: SampleEmailModalProps): string {
  const grade = p.productGrade ? ` (${p.productGrade})` : '';
  const product = `${p.productName}${grade}`;
  const dispatchDate = p.sentDate
    ? new Date(p.sentDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  const lines: (string | null)[] = [
    'Dear Sir / Madam,',
    '',
    `Greetings from Himalaya Terpenes Pvt. Ltd. We are pleased to inform you that a sample of ${product} has been dispatched to you. The details are as follows:`,
    '',
    `Product: ${product}`,
    `Lot No.: ${p.lotNo || '—'}`,
    `Quantity: ${p.quantity} ${p.unit}`,
    `Dispatch Date: ${dispatchDate}`,
    `Courier / AWB: ${p.courier || '—'}`,
    '',
    'Kindly find the attached documents (POD and COA) for your reference. We would greatly appreciate it if you could evaluate the sample at your convenience and share your valuable feedback. If possible, we would be grateful to receive your comments within the next few days, as they will help us better understand your requirements and provide any further assistance you may need.',
    '',
    'Thank you for your time and consideration. We look forward to your feedback and to the opportunity of building a long-term business relationship with you.',
    '',
    'Warm regards,',
    '',
    p.sentBy || 'Sales Team',
    'Himalaya Terpenes Pvt. Ltd.',
    'Tel.: 91-22-35397800/01',
    'E-mail: mum@himalayaterpene.com',
    'Web: www.himalayaterpene.com',
  ];

  return lines.filter(l => l !== null).join('\n');
}

export function SampleEmailModal(props: SampleEmailModalProps) {
  const { activeDoer, user } = useAppStore();
  const senderEmail = activeDoer?.email ?? user?.email ?? '';

  const [to, setTo]           = useState('');
  const [toError, setToError] = useState('');
  const [subject, setSubject] = useState(
    `Sample Dispatched — ${props.productName} — ${props.sampleId} — HIMALAYA TERPENES PVT. LTD.`
  );
  const [body, setBody]         = useState(() => buildBody(props));
  const [customCC, setCustomCC] = useState('');
  const [extraCCs, setExtraCCs] = useState<string[]>([...DEFAULT_CCS]);
  const [selectedCC, setSelectedCC] = useState<Set<string>>(() => new Set(DEFAULT_CCS));
  const [status, setStatus]     = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    supabase
      .from('customers')
      .select('primary_contact_email')
      .eq('company_name', props.customerName)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.primary_contact_email) setTo(data.primary_contact_email);
      });
  }, [props.customerName]);

  const toggleCC = (email: string) => setSelectedCC(prev => {
    const next = new Set(prev);
    next.has(email) ? next.delete(email) : next.add(email);
    return next;
  });

  const addCustomCC = () => {
    const email = customCC.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (!extraCCs.includes(email)) {
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
      const attachments: Attachment[] = [];
      if (props.podUrl) {
        const { base64, mimeType } = await urlToBase64(props.podUrl);
        attachments.push({ base64, fileName: props.podFileName || 'POD.pdf', mimeType });
      }
      if (props.coaUrl) {
        const { base64, mimeType } = await urlToBase64(props.coaUrl);
        attachments.push({ base64, fileName: props.coaFileName || 'COA.pdf', mimeType });
      }

      await sendViaGmailAsUser({ to: to.trim(), cc: ccString, subject, body, attachments }, senderEmail);
      // Record successful send — fire and forget, don't block the success UX
      supabase.from('samples').update({ email_sent_at: new Date().toISOString(), email_sent: true, client_email: to.trim() }).eq('id', props.sampleId).then(() => {});
      setStatus('sent');
      setTimeout(() => { props.onSent(); props.onClose(); }, 1500);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message || 'Failed to send. Please try again.');
    }
  };

  const chipCls = (sel: boolean) =>
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border transition-colors select-none cursor-pointer ${
      sel
        ? 'bg-[#e8f0fe] border-[#4285f4] text-[#1a56db]'
        : 'bg-g50 border-g200 text-g500 hover:border-g400'
    }`;

  const attachmentNames = [
    props.podUrl ? (props.podFileName || 'POD.pdf') : null,
    props.coaUrl ? (props.coaFileName || 'COA.pdf') : null,
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blk/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[4px] shadow-2xl w-full max-w-[580px] overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-g200 bg-g50">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-red-mrt" />
            <div>
              <h2 className="font-serif text-[16px] text-blk tracking-tight leading-tight">
                Email <em className="italic text-red-mrt">Sample Dispatch</em>
              </h2>
              <p className="text-[10.5px] text-g400 mt-[1px]">Sends via Gmail · Attaches POD / COA if uploaded</p>
            </div>
          </div>
          <button type="button" onClick={props.onClose} className="text-g400 hover:text-blk transition-colors p-1 rounded">
            <X size={18} />
          </button>
        </div>

        {status === 'sent' ? (
          <div className="p-10 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="#22c55e" strokeWidth="2.5" fill="none">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="font-semibold text-[15px] text-blk">Email sent successfully</div>
            <div className="text-[12px] text-g400">Dispatch notification delivered to {to}</div>
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
                  className={`w-full h-9 pl-8 pr-3 bg-g50 border rounded-[3px] font-mono text-[12px] text-blk focus:ring-4 outline-none ${
                    toError ? 'border-red-mrt focus:ring-red-lt' : 'border-g300 focus:border-red-mrt focus:ring-red-lt'
                  }`}
                />
              </div>
              {toError && <p className="mt-1 text-[10.5px] text-red-mrt font-medium">{toError}</p>}
            </div>

            {/* CC */}
            <div>
              <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">CC</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {extraCCs.map(email => (
                  <button key={email} type="button" onClick={() => toggleCC(email)} className={chipCls(selectedCC.has(email))}>
                    {selectedCC.has(email) && (
                      <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2.5" fill="none">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {email}
                  </button>
                ))}
              </div>
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
              <p className="mt-1.5 text-[10px] text-g400 font-mono truncate">CC: {ccString}</p>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1">Subject</label>
              <input
                type="text" title="Email subject" placeholder="Subject"
                value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full h-9 px-3 bg-g50 border border-g300 rounded-[3px] font-sans text-[13px] font-medium text-blk focus:border-red-mrt focus:ring-4 focus:ring-red-lt outline-none"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1">Message Body</label>
              <textarea
                title="Message body" placeholder="Message body"
                value={body} onChange={e => setBody(e.target.value)}
                className="w-full min-h-[260px] p-3 bg-g50 border border-g300 rounded-[3px] font-sans text-[12.5px] leading-relaxed text-blk focus:border-red-mrt focus:ring-4 focus:ring-red-lt outline-none resize-none"
              />
            </div>

            {/* Attachments */}
            {attachmentNames.length > 0 ? (
              <div className="bg-blue-50 border border-blue-100 rounded-[3px] p-[9px_13px] flex items-start gap-2.5">
                <Paperclip size={13} className="text-blue-500 shrink-0 mt-0.5" />
                <div>
                  {attachmentNames.map(n => (
                    <div key={n} className="text-[11.5px] font-semibold text-blue-900">{n}</div>
                  ))}
                  <div className="text-[10px] text-blue-500 mt-0.5">Uploaded files attached automatically</div>
                </div>
              </div>
            ) : (
              <div className="bg-g50 border border-g200 rounded-[3px] p-[9px_13px] flex items-center gap-2.5">
                <Paperclip size={13} className="text-g400 shrink-0" />
                <div className="text-[11px] text-g500">No POD or COA uploaded — email will be sent without attachment</div>
              </div>
            )}

            {!OAUTH_CONFIGURED && (
              <div className="bg-amber-50 border border-amber-200 rounded-[3px] p-[9px_13px] text-[11.5px] text-amber-800 font-medium">
                Email sending requires Google OAuth configuration. Contact your administrator to set up{' '}
                <code className="font-mono text-[10.5px] bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code>.
              </div>
            )}

            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-[3px] p-[9px_13px] text-[11.5px] text-red-mrt font-medium">
                {errorMsg}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-g200">
              <Button type="button" variant="secondary" onClick={props.onClose} disabled={status === 'sending'}>
                Cancel
              </Button>
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
