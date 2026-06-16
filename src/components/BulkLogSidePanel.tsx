import { useState } from 'react';
import { useAppStore } from '../store';
import { FollowUpLog } from '../lib/types';
import { CheckCircle2, X, Users } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  /** Quote ids to log this activity against. */
  quoteIds: string[];
  /** Short context line shown in the header (e.g. "Due Next Week · Akash Gupta"). */
  context: string;
  /** Optional preview rows so the user can see what they're logging on. */
  items?: { refId: string; cust: string; label?: string }[];
  onClose: () => void;
}

// Right-hand slide-over for logging one activity onto many quotes at once.
// Used from Doer KPI (Due Next Week / Work History) so a manager or doer can
// clear a batch of follow-ups in a single action.
export function BulkLogSidePanel({ quoteIds, context, items, onClose }: Props) {
  const { addFollowUpLogBulk, stampName } = useAppStore();
  const [channel, setChannel] = useState<FollowUpLog['channel']>('Called');
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [nextNote, setNextNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async () => {
    if (!note.trim() || quoteIds.length === 0) return;
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
      await addFollowUpLogBulk(quoteIds, log, nextDate || null, nextTime || null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to log activity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      {/* Panel */}
      <div className="relative w-[400px] max-w-[92vw] h-full bg-white shadow-xl border-l border-g200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-g150 bg-indigo-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-[5px] bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Users size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-blk leading-tight">Log Activity</div>
              <div className="text-[10.5px] text-g500 truncate">{context}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-g400 hover:text-blk transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Selected quotes preview */}
        <div className="px-5 py-3 border-b border-g100">
          <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-indigo-600 mb-1.5">
            Logging on {quoteIds.length} {quoteIds.length === 1 ? 'quote' : 'quotes'}
          </div>
          <div className="max-h-[120px] overflow-y-auto space-y-1">
            {(items ?? []).map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono font-bold text-red-mrt shrink-0">{it.refId}</span>
                <span className="text-g600 truncate">{it.cust}</span>
                {it.label && <span className="text-g400 truncate">· {it.label}</span>}
              </div>
            ))}
            {(!items || items.length === 0) && (
              <div className="text-[11px] text-g400">{quoteIds.join(', ')}</div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Channel</label>
            <select
              title="Activity channel"
              value={channel}
              onChange={e => setChannel(e.target.value as FollowUpLog['channel'])}
              className="w-full bg-white border border-g300 rounded-[4px] px-2.5 py-2 text-[12.5px] outline-none focus:border-indigo-500"
            >
              <option>Called</option>
              <option>WhatsApp</option>
              <option>Email</option>
              <option>Meeting</option>
              <option>Visit</option>
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">
              What happened?
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What did the customer say? (logged on all selected quotes)"
              rows={4}
              className="w-full bg-white border border-g300 rounded-[4px] px-2.5 py-2 text-[12.5px] outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Next Date</label>
              <input
                type="date"
                title="Next follow-up date"
                value={nextDate}
                onChange={e => setNextDate(e.target.value)}
                className="w-full bg-white border border-g300 rounded-[4px] px-2.5 py-2 text-[12px] outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Time</label>
              <input
                type="time"
                title="Next follow-up time"
                value={nextTime}
                onChange={e => setNextTime(e.target.value)}
                className="w-full bg-white border border-g300 rounded-[4px] px-2.5 py-2 text-[12px] outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {nextDate && (
            <textarea
              value={nextNote}
              onChange={e => setNextNote(e.target.value)}
              placeholder="What to do on next follow-up? (optional)"
              rows={2}
              className="w-full bg-white border border-g300 rounded-[4px] px-2.5 py-2 text-[12px] outline-none focus:border-indigo-500 resize-none"
            />
          )}

          {errorMsg && <div className="text-[11px] text-red-mrt font-medium">{errorMsg}</div>}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-g150 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-9 px-4 border border-g200 rounded-[4px] text-[11px] font-medium text-g600 hover:bg-g50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!note.trim() || saving || quoteIds.length === 0}
            className={cn(
              'h-9 inline-flex items-center gap-1.5 px-4 text-white text-[11px] font-bold tracking-wider uppercase rounded-[4px] disabled:opacity-50',
              saving ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
            )}
          >
            <CheckCircle2 size={13} />
            {saving ? `Saving ${quoteIds.length}…` : `Log on ${quoteIds.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
