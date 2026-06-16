import { useState } from 'react';
import { useAppStore } from '../store';
import { Quote, FollowUpLog } from '../lib/types';
import { parseISO, isBefore, isToday, startOfDay } from 'date-fns';
import { Phone, ChevronRight, CheckCircle2, Plus, X, ChevronDown, MessageCircle, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn, fmtIST } from '../lib/utils';

export function FollowUpSummary({ quote }: { quote: Quote }) {
  const { data, addFollowUpLog, stampName } = useAppStore();
  const followUp = data.followups.find(f => f.quote_id === quote.id);
  const today = startOfDay(new Date());
  const lastLog = followUp?.logs?.[0];
  const status = followUp?.status ?? 'open';

  const [showForm, setShowForm] = useState(false);
  const [showContact, setShowContact] = useState(false);

  const custRec = data.customers.find(c => c.name === quote.cust);
  const site = custRec?.sites.find(s => s.isPrimary) ?? custRec?.sites[0];
  const allContacts = site?.contacts ?? [];
  const [channel, setChannel] = useState<FollowUpLog['channel']>('Called');
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [nextNote, setNextNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  let dueLabel = 'Not scheduled';
  let dueColor = 'text-g400';
  if (status === 'closed') {
    dueLabel = 'Closed';
    dueColor = 'text-emerald-600';
  } else if (followUp?.next_date) {
    const d = parseISO(followUp.next_date);
    const datePart = isToday(d) ? 'Today' : fmtIST(d, 'dd MMM');
    const timePart = followUp.next_time ? ` at ${followUp.next_time}` : '';
    dueLabel = `${datePart}${timePart}`;
    if (isBefore(d, today)) dueColor = 'text-red-mrt';
    else if (isToday(d)) dueColor = 'text-sR';
    else dueColor = 'text-sW';
  }

  const resetForm = () => {
    setChannel('Called');
    setNote('');
    setNextDate('');
    setNextTime('');
    setNextNote('');
    setErrorMsg('');
  };

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const log: FollowUpLog = {
        ts: new Date().toISOString(),
        who: stampName(),
        channel,
        note: note.trim(),
        nextDate: nextDate || undefined,
        nextChannel: nextDate ? channel : undefined,
        nextNote: nextDate ? (nextNote.trim() || undefined) : undefined,
      };
      await addFollowUpLog(quote.id, log, nextDate || null, nextTime || null);
      resetForm();
      setShowForm(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to log activity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="mb-[12px] pb-[7px] border-b border-g200 mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowContact(v => !v)}
          className="inline-flex items-center gap-1.5 font-mono text-[8.5px] font-bold tracking-[2.5px] uppercase text-red-mrt hover:opacity-70 transition-opacity focus:outline-none"
        >
          Follow-Up · {followUp?.logs?.length ?? 0} log{(followUp?.logs?.length ?? 0) === 1 ? '' : 's'}
          {allContacts.length > 0 && (
            <ChevronDown size={10} className={cn('transition-transform duration-200', showContact && 'rotate-180')} />
          )}
        </button>
        <div className="flex items-center gap-2">
          {showForm ? (
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm(false); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-[4px] border border-g200 text-g500 bg-white hover:bg-g50 hover:text-blk transition-colors"
            >
              <X size={12} /> Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-[4px] border border-red-mrt bg-red-mrt text-white hover:bg-red-h transition-colors shadow-sm"
            >
              <Plus size={12} /> Log Activity
            </button>
          )}
          <Link
            to="/followups"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-[4px] border border-g300 text-blk bg-white hover:bg-g50 hover:border-blk transition-colors"
          >
            Open <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {showContact && allContacts.length > 0 && (
        <div className="mb-3 border border-g200 rounded-[4px] divide-y divide-g100 overflow-hidden">
          {allContacts.map(ct => (
            <div key={ct.id} className="px-3 py-2.5 bg-g50 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-blk">{ct.name}</span>
                {ct.role && (
                  <span className="px-1.5 py-0.5 bg-g200 rounded text-[8.5px] font-bold uppercase text-g600 tracking-wide">
                    {ct.role}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {ct.phone && (
                  <a href={`tel:${ct.phone}`} className="inline-flex items-center gap-1 text-[11px] text-blk hover:text-red-mrt transition-colors">
                    <Phone size={10} className="text-g400 shrink-0" />
                    {ct.phone}
                  </a>
                )}
                {ct.phone && (
                  <a href={`https://wa.me/91${ct.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 transition-colors">
                    <MessageCircle size={10} className="shrink-0" />
                    {ct.phone}
                  </a>
                )}
                {ct.email && (
                  <a href={`mailto:${ct.email}`} className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors">
                    <Mail size={10} className="shrink-0" />
                    {ct.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-g50 border border-g200 rounded-[4px] px-3 py-2.5">
          <div className="text-[9px] font-bold tracking-[1px] uppercase text-g400 mb-1">Owner</div>
          <div className="text-[12px] font-semibold text-blk truncate">{followUp?.owner || 'Unassigned'}</div>
        </div>
        <div className="bg-g50 border border-g200 rounded-[4px] px-3 py-2.5">
          <div className="text-[9px] font-bold tracking-[1px] uppercase text-g400 mb-1">Next Due</div>
          <div className={cn('text-[12px] font-semibold truncate flex items-center gap-1', dueColor)}>
            {status === 'closed' ? <CheckCircle2 size={11} /> : <Phone size={11} />}
            {dueLabel}
          </div>
        </div>
        <div className="bg-g50 border border-g200 rounded-[4px] px-3 py-2.5">
          <div className="text-[9px] font-bold tracking-[1px] uppercase text-g400 mb-1">Last Activity</div>
          <div className="text-[12px] font-semibold text-blk truncate">
            {lastLog ? `${lastLog.channel} · ${fmtIST(parseISO(lastLog.ts), 'dd MMM')}` : '—'}
          </div>
        </div>
      </div>

      {/* Inline Log Activity form */}
      {showForm && (
        <div className="mt-3 px-3 py-3 bg-red-lt/30 border border-red-mrt/20 rounded-[4px] space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Channel</label>
              <select
                title="Activity channel"
                value={channel}
                onChange={e => setChannel(e.target.value as FollowUpLog['channel'])}
                className="w-full bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[11.5px] outline-none focus:border-red-mrt"
              >
                <option>Called</option>
                <option>WhatsApp</option>
                <option>Email</option>
                <option>Meeting</option>
                <option>Visit</option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Next Date (optional)</label>
              <input
                type="date"
                title="Next follow-up date"
                placeholder="yyyy-mm-dd"
                value={nextDate}
                onChange={e => setNextDate(e.target.value)}
                className="w-full bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[11.5px] outline-none focus:border-red-mrt"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Time (optional)</label>
              <input
                type="time"
                title="Next follow-up time"
                placeholder="HH:MM"
                value={nextTime}
                onChange={e => setNextTime(e.target.value)}
                className="w-full bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[11.5px] outline-none focus:border-red-mrt"
              />
            </div>
          </div>

          {nextDate && (
            <textarea
              value={nextNote}
              onChange={e => setNextNote(e.target.value)}
              placeholder="What to do on next follow-up? (optional)"
              rows={2}
              className="w-full bg-white border border-g300 rounded-[3px] px-2 py-1.5 text-[11.5px] outline-none focus:border-red-mrt resize-none"
            />
          )}

          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What happened? What did the customer say?"
            rows={2}
            className="w-full bg-white border border-g300 rounded-[3px] px-2 py-1.5 text-[12px] outline-none focus:border-red-mrt resize-none"
          />

          {errorMsg && <div className="text-[10px] text-red-mrt font-medium">{errorMsg}</div>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm(false); }}
              disabled={saving}
              className="h-7 px-3 border border-g200 rounded-[3px] text-[10px] font-medium text-g500 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!note.trim() || saving}
              className="h-7 inline-flex items-center gap-1 px-3 bg-red-mrt text-white text-[10px] font-bold tracking-wider uppercase rounded-[3px] hover:bg-red-h disabled:opacity-50"
            >
              <CheckCircle2 size={10} /> Save
            </button>
          </div>
        </div>
      )}

      {lastLog && !showForm && (
        <div className="mt-3 px-3 py-2 bg-white border border-g200 rounded-[4px]">
          <div className="text-[10px] text-g400 mb-1">
            <span className="font-semibold text-g500">{lastLog.who}</span>
            {' · '}
            {fmtIST(parseISO(lastLog.ts), 'dd MMM, HH:mm')}
          </div>
          <div className="text-[12px] text-g600 leading-relaxed whitespace-pre-wrap line-clamp-3">{lastLog.note}</div>
        </div>
      )}
    </section>
  );
}
