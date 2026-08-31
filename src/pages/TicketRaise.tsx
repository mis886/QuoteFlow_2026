import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { Badge, Button } from '../components/ui';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { generateId, fmtIST } from '../lib/utils';
import { uploadToS3 } from '../lib/s3';
import { TicketModule, TicketPriority } from '../lib/types';

const MODULES: TicketModule[] = ['Enquiry', 'Quotation', 'Order', 'Dispatch', 'Customer', 'Sampling', 'Other'];
const PRIORITIES: TicketPriority[] = ['Low', 'Medium', 'High'];

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";

// Shared "raise a ticket" form — used both as the main panel in TicketRaise
// (everyone) and inside a modal from TicketResolver's "+ New Ticket" button
// (so admins, who otherwise only see the Resolver view, can still raise one).
export function TicketRaiseForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const { data, user, addTicket, stampName } = useAppStore();

  const [module, setModule] = useState<TicketModule>('Other');
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('Medium');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  const ticketId = useMemo(() => generateId('TKT', data.tickets.map(t => t.id)), [data.tickets]);

  const handleSubmit = async () => {
    setError('');
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      let attachmentPath: string | undefined;
      let attachmentName: string | undefined;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uploaded = await uploadToS3(file, `tickets/${ticketId}/${safeName}`);
        if (uploaded) { attachmentPath = uploaded; attachmentName = file.name; }
      }
      await addTicket({
        id: ticketId,
        raisedByEmail: user?.email || '',
        raisedByName: stampName(),
        module,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        status: 'Open',
        attachmentPath,
        attachmentName,
      });
      setSubject('');
      setDescription('');
      setPriority('Medium');
      setModule('Other');
      setFile(null);
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 3000);
      onSubmitted?.();
    } catch (e) {
      console.error(e);
      setError('Failed to submit ticket. Please try again.');
    }
    setSubmitting(false);
  };

  return (
    <div className="p-[14px_16px] space-y-3">
      <div>
        <label className={labelCls}>Module</label>
        <select value={module} onChange={e => setModule(e.target.value as TicketModule)} className={selectCls}>
          {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls}>Subject</label>
        <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Short summary of the issue" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Priority</label>
        <div className="flex gap-[1px] bg-g100 border border-g200 rounded p-[2px] w-fit">
          {PRIORITIES.map(p => (
            <div
              key={p}
              onClick={() => setPriority(p)}
              className={`px-[11px] py-1 rounded-[3px] text-[11.5px] font-medium cursor-pointer transition-colors whitespace-nowrap select-none ${priority === p ? 'bg-white text-blk font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-g600 hover:text-blk'}`}
            >
              {p}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} placeholder="What happened? Steps to reproduce, expected vs actual, etc."
          className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt resize-none" />
      </div>

      <div>
        <label className={labelCls}>Attachment (optional)</label>
        <input type="file" id="ticket-attachment" className="hidden"
          onChange={e => { if (e.target.files?.length) setFile(e.target.files[0]); }}
          accept=".pdf,.jpeg,.jpg,.png,.webp" />
        <label htmlFor="ticket-attachment"
          className="cursor-pointer flex flex-col items-center justify-center gap-1.5 border border-dashed border-g300 rounded-[3px] p-4 text-center hover:border-red-mrt/40 hover:bg-g50 transition-colors">
          <Upload size={16} className="text-g400" />
          {file
            ? <span className="text-[12px] font-medium text-blk truncate max-w-full">{file.name}</span>
            : <span className="text-[11px] text-g500">Click to attach a screenshot or file</span>}
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-red-mrt font-medium">
          <AlertCircle size={13} className="shrink-0" /> {error}
        </div>
      )}
      {justSubmitted && (
        <div className="text-[11.5px] text-sW font-medium">Ticket submitted — thank you.</div>
      )}

      <Button variant="primary" onClick={handleSubmit} disabled={submitting} className="w-full justify-center">
        {submitting ? <><Loader2 size={13} className="animate-spin" /> Submitting...</> : 'Submit Ticket'}
      </Button>
    </div>
  );
}

export function TicketRaise() {
  const { data, user } = useAppStore();

  const myTickets = useMemo(() => {
    const em = user?.email?.toLowerCase();
    return data.tickets
      .filter(t => t.raisedByEmail?.toLowerCase() === em)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [data.tickets, user]);

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="pt-5 px-6">
        <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-1">Support</div>
        <h1 className="font-serif text-2xl text-blk tracking-tight leading-tight">
          Raise a <em className="italic text-red-mrt">Ticket</em>
        </h1>
        <p className="text-xs text-g500 mt-1 font-light">Report an issue with any module — track it here until it's resolved.</p>
      </div>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 items-start">
          {/* New Ticket form */}
          <div className="bg-white border border-g200">
            <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt p-[11px_16px] border-b border-g200">New Ticket</div>
            <TicketRaiseForm />
          </div>

          {/* My Tickets */}
          <div>
            <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-g500 mb-2 flex items-center gap-2">
              My Tickets <span className="text-g400 normal-case font-sans text-[11px]">({myTickets.length})</span>
            </div>
            {myTickets.length === 0 ? (
              <div className="bg-white border border-dashed border-g200 rounded-[3px] p-8 text-center text-g400 text-[12.5px] italic">
                You haven't raised any tickets yet.
              </div>
            ) : (
              <div className="space-y-2">
                {myTickets.map(t => (
                  <div key={t.id} className="bg-white border border-g200 rounded-[3px] p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-[11px] font-bold text-red-mrt">{t.id}</span>
                      <Badge status={t.status} />
                    </div>
                    <div className="text-[13px] font-semibold text-blk mb-1">{t.subject}</div>
                    <div className="flex items-center gap-2 text-[10.5px] text-g500">
                      <span className="bg-g100 px-1.5 py-0.5 rounded-[3px] font-medium">{t.module}</span>
                      <span>{t.created_at ? fmtIST(new Date(t.created_at), 'dd MMM yyyy') : ''}</span>
                      <span className="ml-auto uppercase font-mono text-[9px] font-bold text-g400">{t.priority}</span>
                    </div>
                    {t.resolutionNote && (
                      <div className="mt-2 pt-2 border-t border-g100">
                        <div className="font-mono text-[9px] font-bold text-sW uppercase tracking-wide mb-0.5">Resolution</div>
                        <div className="text-[11.5px] text-g600">{t.resolutionNote}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
