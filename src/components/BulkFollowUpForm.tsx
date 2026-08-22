import { useState } from 'react';
import { useAppStore } from '../store';
import { FollowUpLog } from '../lib/types';
import { CheckCircle2, X, Users } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  quoteIds: string[];
  siteName: string;
  onClose: () => void;
}

export function BulkFollowUpForm({ quoteIds, siteName, onClose }: Props) {
  const { addFollowUpLogBulk, stampName } = useAppStore();
  const [channel, setChannel] = useState<FollowUpLog['channel']>('Called');
  const [note, setNote] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [nextNote, setNextNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
      await addFollowUpLogBulk(quoteIds, log, nextDate || null, nextTime || null);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to log activity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-indigo-100 bg-indigo-50/40 px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Users size={11} className="text-indigo-500" />
          <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-indigo-600">
            Log for all {quoteIds.length} quotes — {siteName}
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-g400 hover:text-blk transition-colors">
          <X size={12} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Channel</label>
          <select
            title="Activity channel"
            value={channel}
            onChange={e => setChannel(e.target.value as FollowUpLog['channel'])}
            className="w-full bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[11.5px] outline-none focus:border-indigo-500"
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
            value={nextDate}
            onChange={e => setNextDate(e.target.value)}
            className="w-full bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[11.5px] outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-[9px] font-bold tracking-[1px] uppercase text-g500 mb-1">Time (optional)</label>
          <input
            type="time"
            title="Next follow-up time"
            value={nextTime}
            onChange={e => setNextTime(e.target.value)}
            className="w-full bg-white border border-g300 rounded-[3px] px-2 py-[5px] text-[11.5px] outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {nextDate && (
        <textarea
          value={nextNote}
          onChange={e => setNextNote(e.target.value)}
          placeholder="What to do on next follow-up? (optional)"
          rows={2}
          className="w-full bg-white border border-g300 rounded-[3px] px-2 py-1.5 text-[11.5px] outline-none focus:border-indigo-500 resize-none"
        />
      )}

      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="What happened? What did the customer say? (logged on all quotes above)"
        rows={2}
        className="w-full bg-white border border-g300 rounded-[3px] px-2 py-1.5 text-[12px] outline-none focus:border-indigo-500 resize-none"
      />

      {errorMsg && <div className="text-[10px] text-red-mrt font-medium">{errorMsg}</div>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="h-7 px-3 border border-g200 rounded-[3px] text-[10px] font-medium text-g500 hover:bg-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!note.trim() || saving}
          className={cn(
            'h-7 inline-flex items-center gap-1 px-3 text-white text-[10px] font-bold tracking-wider uppercase rounded-[3px] disabled:opacity-50',
            saving ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
          )}
        >
          <CheckCircle2 size={10} />
          {saving ? `Saving ${quoteIds.length}…` : `Log on ${quoteIds.length} quotes`}
        </button>
      </div>
    </div>
  );
}
