import { useState, useEffect } from 'react';
import { Quote } from '../lib/types';
import { useAppStore } from '../store';
import { addWorkingHours } from '../lib/utils';
import { Clock, CalendarClock, X, Check } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface Props {
  quote: Quote | null;
  onClose: () => void;
}

export function FollowUpSendPrompt({ quote, onClose }: Props) {
  const { addFollowUpLog, stampName } = useAppStore();
  const [mode, setMode] = useState<'choose' | 'custom'>('choose');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [nextNote, setNextNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Initialise custom-mode defaults to +2 working hours when prompt opens
  useEffect(() => {
    if (!quote) return;
    const due = addWorkingHours(new Date(), 2);
    setDate(due.date);
    setTime(due.time);
    setNextNote('');
    setMode('choose');
    setErrorMsg('');
  }, [quote?.id]);

  if (!quote) return null;

  const createLog = (nextDate: string | null, _nextTime: string | null, nextNoteVal?: string) => {
    const total = quote.items.reduce((s, i) => s + i.total, 0);
    const totalStr = `₹${total.toLocaleString('en-IN')}`;
    const itemCount = quote.items.length;
    // Build a meaningful first-line description from the items
    const firstItem = quote.items[0];
    const itemDesc = firstItem
      ? `${firstItem.desc}${itemCount > 1 ? ` — ${itemCount} items` : ''}`
      : `${itemCount} item${itemCount !== 1 ? 's' : ''}`;
    return {
      ts: new Date().toISOString(),
      who: stampName(),
      channel: 'Email' as const,
      note: `Sent ${quote.id} for ${itemDesc}. ${totalStr}.`,
      nextDate: nextDate ?? undefined,
      nextChannel: 'Called' as const,
      nextNote: nextNoteVal?.trim() || undefined,
    };
  };

  const save = async (nextDate: string, nextTime: string, nextNoteVal?: string) => {
    setSaving(true);
    setErrorMsg('');
    try {
      await addFollowUpLog(quote.id, createLog(nextDate, nextTime, nextNoteVal), nextDate, nextTime);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save reminder');
    } finally {
      setSaving(false);
    }
  };

  const handle2h = async () => {
    const due = addWorkingHours(new Date(), 2);
    await save(due.date, due.time);
  };

  const handleCustomSave = async () => {
    if (!date) { setErrorMsg('Pick a date'); return; }
    await save(date, time || '', nextNote);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-blk/40 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[92vw] bg-white rounded-[6px] shadow-2xl border border-g200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center justify-between">
          <div>
            <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-red-mrt mb-0.5">Quote Sent</div>
            <div className="text-[13px] font-semibold text-blk">Set follow-up reminder for {quote.id}?</div>
          </div>
          <button type="button" onClick={onClose} title="Close" className="text-g400 hover:text-blk p-1 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {mode === 'choose' && (
            <>
              <p className="text-[12px] text-g500">When should we remind you to follow up?</p>

              <button
                type="button"
                onClick={handle2h}
                disabled={saving}
                className="w-full inline-flex items-center gap-3 px-4 py-3 border border-g200 rounded-[4px] text-left hover:border-red-mrt hover:bg-red-lt/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Clock size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-blk">In 2 working hours</div>
                  <div className="text-[11px] text-g500">Default cadence (Mon–Sat 9 am – 6 pm)</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('custom')}
                disabled={saving}
                className="w-full inline-flex items-center gap-3 px-4 py-3 border border-g200 rounded-[4px] text-left hover:border-red-mrt hover:bg-red-lt/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <CalendarClock size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-blk">Custom date / time…</div>
                  <div className="text-[11px] text-g500">Pick a specific reminder</div>
                </div>
              </button>

              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="w-full inline-flex items-center gap-3 px-4 py-3 border border-g200 rounded-[4px] text-left hover:border-g300 hover:bg-g50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 rounded-full bg-g100 text-g500 flex items-center justify-center shrink-0">
                  <X size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-blk">Skip — no reminder</div>
                  <div className="text-[11px] text-g500">No follow-up entry will be created</div>
                </div>
              </button>
            </>
          )}

          {mode === 'custom' && (
            <>
              <button
                type="button"
                onClick={() => setMode('choose')}
                disabled={saving}
                className="text-[10px] text-g500 hover:text-blk font-mono uppercase tracking-wider"
              >
                ← Back
              </button>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1.5">Next Follow-up Date</label>
                  <input
                    type="date"
                    title="Follow-up date"
                    min={format(addDays(new Date(), 0), 'yyyy-MM-dd')}
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] px-3 py-[7px] outline-none focus:border-red-mrt"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1.5">Time (optional)</label>
                  <input
                    type="time"
                    title="Follow-up time"
                    placeholder="HH:MM"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full font-mono text-[13px] text-blk bg-white border border-g300 rounded-[3px] px-3 py-[7px] outline-none focus:border-red-mrt"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-g500 uppercase tracking-[0.5px] mb-1.5">Note for next follow-up (optional)</label>
                <textarea
                  value={nextNote}
                  onChange={e => setNextNote(e.target.value)}
                  placeholder="What to do on next follow-up? e.g. Ask about delivery commitment"
                  rows={2}
                  className="w-full font-sans text-[12px] text-blk bg-white border border-g300 rounded-[3px] px-3 py-2 outline-none focus:border-red-mrt resize-none"
                />
              </div>

              {errorMsg && <div className="text-[11px] text-red-mrt font-medium">{errorMsg}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="h-8 px-3 border border-g200 rounded-[3px] text-[11px] font-medium text-g500 hover:bg-g50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCustomSave}
                  disabled={!date || saving}
                  className="h-8 inline-flex items-center gap-1.5 px-4 bg-red-mrt text-white text-[11px] font-bold tracking-wider uppercase rounded-[3px] hover:bg-red-h disabled:opacity-50"
                >
                  <Check size={11} /> Set Reminder
                </button>
              </div>
            </>
          )}

          {errorMsg && mode === 'choose' && <div className="text-[11px] text-red-mrt font-medium">{errorMsg}</div>}
        </div>
      </div>
    </div>
  );
}
