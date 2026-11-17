import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { Badge, Button } from '../components/ui';
import { Upload, Loader2, AlertCircle, Paperclip, Pencil, X } from 'lucide-react';
import { generateId, fmtIST } from '../lib/utils';
import { uploadToS3, getS3SignedUrl } from '../lib/s3';
import { Ticket, TicketModule, TicketPriority } from '../lib/types';

const MODULES: TicketModule[] = ['Enquiry', 'Quotation', 'Order', 'Dispatch', 'Customer', 'Sampling', 'Other'];
const PRIORITIES: TicketPriority[] = ['Low', 'Medium', 'High'];

const inputCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const selectCls = "w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'10\\' height=\\'6\\'%3E%3Cpath d=\\'M1 1l4 4 4-4\\' stroke=\\'%23888\\' stroke-width=\\'1.5\\' fill=\\'none\\' stroke-linecap=\\'round\\'/%3E%3C/svg%3E')] bg-no-repeat bg-[right_9px_center] pr-[26px] cursor-pointer focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt";
const labelCls = "block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]";

const isImageFileName = (name?: string | null): boolean => !!name && /\.(png|jpe?g|webp|gif)$/i.test(name);

// Edit is allowed only for the person who raised it, and only while it isn't
// Resolved / Closed (the DB enforces the same — 20261117140000_tickets_owner_edit.sql).
export const canEditTicket = (t: Ticket, email?: string | null) =>
  !!email && (t.raisedByEmail || '').toLowerCase() === email.toLowerCase() && t.status !== 'Resolved' && t.status !== 'Closed';

// Shared "raise a ticket" form — used both as the main panel in TicketRaise
// (everyone) and inside a modal from TicketResolver's "+ New Ticket" button
// (so admins, who otherwise only see the Resolver view, can still raise one).
// With `editing`, the same form edits that ticket (Edit on "My Tickets").
export function TicketRaiseForm({ onSubmitted, editing, onCancel }: { onSubmitted?: () => void; editing?: Ticket; onCancel?: () => void }) {
  const { data, user, addTicket, editTicket, stampName, canSeeEnqQuote } = useAppStore();

  const [module, setModule] = useState<TicketModule>(editing?.module ?? 'Other');
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [priority, setPriority] = useState<TicketPriority>(editing?.priority ?? 'Medium');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [file, setFile] = useState<File | null>(null);
  // Edit mode: true = the current attachment is removed (and not replaced).
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [openingAttachment, setOpeningAttachment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  const ticketId = useMemo(() => editing?.id ?? generateId('TKT', data.tickets.map(t => t.id)), [data.tickets, editing?.id]);
  const fileInputId = editing ? `ticket-attachment-edit-${editing.id}` : 'ticket-attachment';
  const hasCurrentAttachment = !!editing?.attachmentPath && !removeAttachment && !file;

  const openCurrentAttachment = async () => {
    if (!editing?.attachmentPath) return;
    setOpeningAttachment(true);
    try {
      const url = await getS3SignedUrl(editing.attachmentPath);
      if (url) window.open(url, '_blank', 'noopener');
    } finally {
      setOpeningAttachment(false);
    }
  };

  const uploadFile = async (f: File) => {
    const safeName = f.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    return await uploadToS3(f, `tickets/${ticketId}/${safeName}`);
  };

  const handleSave = async () => {
    if (!editing) return;
    setError('');
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      let attachmentPath = removeAttachment ? undefined : editing.attachmentPath;
      let attachmentName = removeAttachment ? undefined : editing.attachmentName;
      if (file) {
        const uploaded = await uploadFile(file);
        if (!uploaded) throw new Error('The new attachment could not be uploaded.');
        attachmentPath = uploaded;
        attachmentName = file.name;
      }
      await editTicket(editing.id, { module, subject: subject.trim(), priority, description: description.trim(), attachmentPath, attachmentName });
      onSubmitted?.();
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to save the ticket. Please try again.');
    }
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (editing) return handleSave();
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
        const uploaded = await uploadFile(file);
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
          {MODULES.filter(m => canSeeEnqQuote || (m !== 'Enquiry' && m !== 'Quotation') || m === editing?.module).map(m => <option key={m} value={m}>{m}</option>)}
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
        {hasCurrentAttachment && (
          <div className="flex items-center gap-2 mb-2 p-2 border border-g200 rounded-[3px] bg-g50">
            <Paperclip size={13} className="text-g500 shrink-0" />
            <button type="button" onClick={openCurrentAttachment} disabled={openingAttachment}
              className="text-[12px] font-medium text-blk truncate hover:text-red-mrt hover:underline text-left disabled:opacity-50"
              title={isImageFileName(editing?.attachmentName || editing?.attachmentPath) ? 'Open image' : 'Open file'}>
              {editing?.attachmentName || 'Current attachment'}
            </button>
            {openingAttachment && <Loader2 size={12} className="animate-spin text-g400" />}
            <button type="button" onClick={() => setRemoveAttachment(true)}
              className="ml-auto inline-flex items-center gap-1 text-[11px] text-red-mrt hover:underline shrink-0">
              <X size={12} /> Remove
            </button>
          </div>
        )}
        {editing && removeAttachment && !file && (
          <div className="flex items-center gap-2 mb-2 text-[11px] text-g500">
            Attachment will be removed.
            <button type="button" onClick={() => setRemoveAttachment(false)} className="text-red-mrt hover:underline">Undo</button>
          </div>
        )}
        <input type="file" id={fileInputId} className="hidden"
          onChange={e => { if (e.target.files?.length) setFile(e.target.files[0]); e.target.value = ''; }}
          accept=".pdf,.jpeg,.jpg,.png,.webp" />
        <label htmlFor={fileInputId}
          className="cursor-pointer flex flex-col items-center justify-center gap-1.5 border border-dashed border-g300 rounded-[3px] p-4 text-center hover:border-red-mrt/40 hover:bg-g50 transition-colors">
          <Upload size={16} className="text-g400" />
          {file
            ? <span className="text-[12px] font-medium text-blk truncate max-w-full">{file.name}{editing?.attachmentPath ? ' (replaces the current attachment)' : ''}</span>
            : <span className="text-[11px] text-g500">{hasCurrentAttachment ? 'Click to replace the attachment' : 'Click to attach a screenshot or file'}</span>}
        </label>
        {file && (
          <button type="button" onClick={() => setFile(null)} className="mt-1 text-[11px] text-g500 hover:text-red-mrt hover:underline">
            Don't use {file.name}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[11.5px] text-red-mrt font-medium">
          <AlertCircle size={13} className="shrink-0" /> {error}
        </div>
      )}
      {justSubmitted && (
        <div className="text-[11.5px] text-sW font-medium">Ticket submitted — thank you.</div>
      )}

      {editing ? (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={submitting} className="flex-1 justify-center">Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting} className="flex-1 justify-center">
            {submitting ? <><Loader2 size={13} className="animate-spin" /> Saving...</> : 'Save Changes'}
          </Button>
        </div>
      ) : (
        <Button variant="primary" onClick={handleSubmit} disabled={submitting} className="w-full justify-center">
          {submitting ? <><Loader2 size={13} className="animate-spin" /> Submitting...</> : 'Submit Ticket'}
        </Button>
      )}
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

  // The ticket being edited in the left panel (null = "New Ticket" form).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState('');
  const editing = editingId ? myTickets.find(t => t.id === editingId) : undefined;
  // Resolved while the form was open → back to the New Ticket form.
  useEffect(() => {
    if (editingId && (!editing || !canEditTicket(editing, user?.email))) setEditingId(null);
  }, [editingId, editing, user?.email]);

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
          {/* New Ticket form — or the same form editing one of My Tickets */}
          <div className={`bg-white border ${editing ? 'border-red-mrt/50' : 'border-g200'}`}>
            <div className="font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt p-[11px_16px] border-b border-g200">
              {editing ? `Edit Ticket ${editing.id}` : 'New Ticket'}
            </div>
            {editing ? (
              <TicketRaiseForm
                key={editing.id}
                editing={editing}
                onCancel={() => setEditingId(null)}
                onSubmitted={() => {
                  setSavedMsg(`${editing.id} updated.`);
                  setTimeout(() => setSavedMsg(''), 3000);
                  setEditingId(null);
                }}
              />
            ) : (
              <>
                {savedMsg && <div className="px-4 pt-3 text-[11.5px] text-sW font-medium">{savedMsg}</div>}
                <TicketRaiseForm key="new" />
              </>
            )}
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
                {myTickets.map(t => {
                  const isMine = (t.raisedByEmail || '').toLowerCase() === (user?.email || '').toLowerCase();
                  const editable = canEditTicket(t, user?.email);
                  return (
                  <div key={t.id} className={`bg-white border rounded-[3px] p-3 ${editingId === t.id ? 'border-red-mrt/60 ring-2 ring-red-lt' : 'border-g200'}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-[11px] font-bold text-red-mrt">{t.id}</span>
                      <div className="flex items-center gap-2">
                        {isMine && (
                          <span title={editable ? 'Edit this ticket' : "Resolved tickets can't be edited"}>
                            <Button size="sm" variant="ghost" disabled={!editable || editingId === t.id}
                              onClick={() => { setSavedMsg(''); setEditingId(t.id); }}>
                              <Pencil size={11} /> Edit
                            </Button>
                          </span>
                        )}
                        <Badge status={t.status} />
                      </div>
                    </div>
                    <div className="text-[13px] font-semibold text-blk mb-1">{t.subject}</div>
                    <div className="flex items-center gap-2 text-[10.5px] text-g500">
                      <span className="bg-g100 px-1.5 py-0.5 rounded-[3px] font-medium">{t.module}</span>
                      <span>{t.created_at ? fmtIST(new Date(t.created_at), 'dd MMM yyyy') : ''}</span>
                      {t.editedAt && (
                        <span className="italic text-g400" title={fmtIST(new Date(t.editedAt), 'dd MMM yyyy, hh:mm a')}>
                          Edited {fmtIST(new Date(t.editedAt), 'dd MMM, hh:mm a')}
                        </span>
                      )}
                      <span className="ml-auto uppercase font-mono text-[9px] font-bold text-g400">{t.priority}</span>
                    </div>
                    {t.resolutionNote && (
                      <div className="mt-2 pt-2 border-t border-g100">
                        <div className="font-mono text-[9px] font-bold text-sW uppercase tracking-wide mb-0.5">Resolution</div>
                        <div className="text-[11.5px] text-g600">{t.resolutionNote}</div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
