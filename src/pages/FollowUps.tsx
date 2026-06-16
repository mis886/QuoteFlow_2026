import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { format, isBefore, isToday, parseISO, startOfDay, addDays, addHours, addMinutes } from 'date-fns';
import {
  Phone,
  Mail,
  MessageCircle,
  MapPin,
  Calendar,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  User,
  History,
  RotateCcw,
  FileText,
  Receipt,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Trophy,
  XCircle,
  Zap,
  Timer,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn, fmtIST, isInDateRange, getThisWeekRange } from '../lib/utils';
import { DateFilterBanner } from '../components/ui';
import type { Quote, FollowUp, FollowUpLog } from '../lib/types';
import { DEFAULT_STAGE_TAT_H } from '../lib/types';
import {
  isQuoteSentLog as isQuoteSentLogFn,
  stageTatHours as stageTatHoursFn,
  buildFullChain as buildFullChainFn,
  stepDeadline as stepDeadlineFn,
  cardOnTimeRate as cardOnTimeRateFn,
} from '../lib/kpi';
import { generateQuotePDF, generatePIPDF } from '../lib/pdfGenerator';
import PipelineBoard from '../components/PipelineBoard';

function getOffsetWeekRange(offset: number) {
  const { start: baseStart } = getThisWeekRange();
  const start = new Date(baseStart);
  start.setDate(start.getDate() + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return { start, end, days };
}

function dateKey(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const CHANNEL_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  Called:    { icon: '📞', color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  'To Call': { icon: '📲', color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-200' },
  WhatsApp:  { icon: '💬', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  Email:     { icon: '📧', color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200' },
  Meeting:   { icon: '🤝', color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
  Visit:     { icon: '📍', color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200' },
};

function formatDue(date: string | null | undefined, time?: string | null) {
  if (!date) return null;
  const label = isToday(parseISO(date)) ? 'Today' : fmtIST(parseISO(date), 'dd MMM');
  return time ? `${label} at ${time}` : label;
}

function groupLogsByDay(logs: FollowUpLog[]) {
  // newest day first, newest log within each day first
  const groups: { day: string; logs: FollowUpLog[] }[] = [];
  for (const log of [...logs].sort((a, b) => b.ts.localeCompare(a.ts))) {
    const day = log.ts.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.logs.push(log);
    } else {
      groups.push({ day, logs: [log] });
    }
  }
  return groups;
}

// ── Suggestion chip types ─────────────────────────────────────────────────────
type SuggestionVariant = 'call' | 'whatsapp' | 'email' | 'meeting' | 'visit' | 'won' | 'lost' | 'park';
interface Suggestion {
  variant: SuggestionVariant;
  label: string;
  noteTemplate: string;    // pre-fill for the note textarea
  channel: FollowUpLog['channel'] | null;  // null = outcome action (Won/Lost/Park)
  nextDaysFromNow?: number; // pre-fill next_date = today + N days
}

const VARIANT_STYLE: Record<SuggestionVariant, string> = {
  call:     'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
  whatsapp: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100',
  email:    'bg-blue-50 border-blue-200 text-blue-800 hover:bg-blue-100',
  meeting:  'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100',
  visit:    'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
  won:      'bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200',
  lost:     'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
  park:     'bg-g100 border-g300 text-g700 hover:bg-g200',
};
const VARIANT_ICON: Record<SuggestionVariant, string> = {
  call: '📞', whatsapp: '💬', email: '📧', meeting: '🤝', visit: '📍',
  won: '🏆', lost: '❌', park: '⏸',
};

function buildSuggestions(
  stage: string,
  silentDays: number,
  tatH: number,
  elapsedH: number,
  quoteId: string,
  custName: string,
  validityDate: string | undefined,
): Suggestion[] {
  const breached = elapsedH > tatH;
  const validityMs = validityDate ? new Date(validityDate).getTime() - Date.now() : null;
  const validityDaysLeft = validityMs !== null ? Math.ceil(validityMs / 86_400_000) : null;
  const chips: Suggestion[] = [];

  if (stage === 'Sent Quotation') {
    if (!breached) {
      chips.push({ variant: 'call',     label: 'Confirm Receipt',      channel: 'Called',   noteTemplate: `Called ${custName} to confirm receipt of ${quoteId} — `, nextDaysFromNow: 2 });
      chips.push({ variant: 'email',    label: 'Resend Quote PDF',     channel: 'Email',    noteTemplate: `Resent ${quoteId} PDF to ${custName} — ` });
    } else {
      chips.push({ variant: 'call',     label: 'Call — Got the quote?', channel: 'Called',   noteTemplate: `Called ${custName} — did you receive ${quoteId}? — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'whatsapp', label: 'WhatsApp Reminder',    channel: 'WhatsApp', noteTemplate: `Sent WhatsApp to ${custName} re: ${quoteId} — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'email',    label: 'Follow-up Email',      channel: 'Email',    noteTemplate: `Sent follow-up email re: ${quoteId} to ${custName} — ` });
    }
  } else if (stage === 'Offer Acknowledged') {
    if (!breached) {
      chips.push({ variant: 'call',     label: 'Check for Questions',  channel: 'Called',   noteTemplate: `Called ${custName} to check if any questions on ${quoteId} — `, nextDaysFromNow: 2 });
      chips.push({ variant: 'whatsapp', label: 'Send Spec Sheet',      channel: 'WhatsApp', noteTemplate: `Shared spec sheet with ${custName} re: ${quoteId} — ` });
    } else {
      chips.push({ variant: 'call',     label: 'Call — Any Decision?', channel: 'Called',   noteTemplate: `Called ${custName} for decision on ${quoteId} — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'whatsapp', label: 'Push for PO Date',     channel: 'WhatsApp', noteTemplate: `WhatsApp to ${custName}: when can we expect PO for ${quoteId}? — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'meeting',  label: 'Offer a Meeting',      channel: 'Meeting',  noteTemplate: `Proposed a meeting with ${custName} to discuss ${quoteId} — `, nextDaysFromNow: 3 });
    }
  } else if (stage === '1st Follow-up') {
    if (!breached) {
      chips.push({ variant: 'call',     label: 'Check Decision Status', channel: 'Called',   noteTemplate: `Called ${custName} — status on ${quoteId}? — `, nextDaysFromNow: 3 });
      chips.push({ variant: 'whatsapp', label: 'Price Negotiation?',    channel: 'WhatsApp', noteTemplate: `WhatsApp to ${custName}: open to discuss pricing on ${quoteId}? — ` });
    } else {
      chips.push({ variant: 'call',     label: 'Urgent Call',           channel: 'Called',   noteTemplate: `Urgent call to ${custName} re: ${quoteId} — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'whatsapp', label: 'Final Reminder',        channel: 'WhatsApp', noteTemplate: `Final WhatsApp reminder to ${custName} re: ${quoteId} — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'email',    label: 'Revised Offer Email',   channel: 'Email',    noteTemplate: `Sent revised offer email to ${custName} for ${quoteId} — ` });
      if (silentDays >= 5) chips.push({ variant: 'park', label: 'Park This Quote', channel: null, noteTemplate: '' });
    }
  } else if (stage === '2nd Follow-up') {
    if (!breached) {
      chips.push({ variant: 'call',     label: 'Final Check',          channel: 'Called',   noteTemplate: `Called ${custName} — final check on ${quoteId} — `, nextDaysFromNow: 4 });
      chips.push({ variant: 'whatsapp', label: 'Last WhatsApp Nudge',  channel: 'WhatsApp', noteTemplate: `Last WhatsApp nudge to ${custName} re: ${quoteId} — `, nextDaysFromNow: 2 });
    } else {
      chips.push({ variant: 'call',     label: 'Decision Call',        channel: 'Called',   noteTemplate: `Decision call with ${custName} re: ${quoteId} — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'whatsapp', label: 'Last Message',         channel: 'WhatsApp', noteTemplate: `Final message to ${custName} re: ${quoteId} — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'visit',    label: 'Visit / Meeting',      channel: 'Visit',    noteTemplate: `Visited / met ${custName} to discuss ${quoteId} — `, nextDaysFromNow: 3 });
      if (silentDays >= 7) chips.push({ variant: 'lost', label: 'Mark Lost', channel: null, noteTemplate: '' });
    }
  } else if (stage === 'Negotiation') {
    if (!breached) {
      chips.push({ variant: 'meeting',  label: 'Schedule Meeting',     channel: 'Meeting',  noteTemplate: `Scheduled meeting with ${custName} re: ${quoteId} — `, nextDaysFromNow: 3 });
      chips.push({ variant: 'call',     label: 'Discuss Terms',        channel: 'Called',   noteTemplate: `Called ${custName} to discuss terms on ${quoteId} — `, nextDaysFromNow: 2 });
      chips.push({ variant: 'email',    label: 'Send Revised Quote',   channel: 'Email',    noteTemplate: `Sent revised quote to ${custName} for ${quoteId} — ` });
    } else {
      chips.push({ variant: 'call',     label: 'Final Negotiation',    channel: 'Called',   noteTemplate: `Final negotiation call with ${custName} re: ${quoteId} — `, nextDaysFromNow: 1 });
      chips.push({ variant: 'won',      label: 'Mark Won',             channel: null,       noteTemplate: '' });
      chips.push({ variant: 'lost',     label: 'Mark Lost',            channel: null,       noteTemplate: '' });
    }
  }

  // Validity chips — appended regardless of stage
  if (validityDaysLeft !== null && validityDaysLeft <= 3 && validityDaysLeft > 0) {
    chips.push({ variant: 'email', label: `Validity expires in ${validityDaysLeft}d — extend`, channel: 'Email', noteTemplate: `Sent validity extension to ${custName} for ${quoteId} — ` });
  } else if (validityDaysLeft !== null && validityDaysLeft <= 0) {
    chips.push({ variant: 'email', label: 'Validity expired — reissue', channel: 'Email', noteTemplate: `Reissued ${quoteId} with updated validity to ${custName} — ` });
    chips.push({ variant: 'call',  label: 'Call with new validity',     channel: 'Called', noteTemplate: `Called ${custName} to share reissued ${quoteId} with new validity — `, nextDaysFromNow: 1 });
  }

  return chips.slice(0, 5);
}

// Live countdown hook — ticks every minute
function useCountdown(targetIso: string | null | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!targetIso) { setLabel(null); return; }
    const compute = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        const over = Math.abs(diff);
        const d = Math.floor(over / 86_400_000);
        const h = Math.floor((over % 86_400_000) / 3_600_000);
        const m = Math.floor((over % 3_600_000) / 60_000);
        setLabel(d > 0 ? `${d}d ${h}h overdue` : h > 0 ? `${h}h ${m}m overdue` : `${m}m overdue`);
      } else {
        const d = Math.floor(diff / 86_400_000);
        const h = Math.floor((diff % 86_400_000) / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        setLabel(d > 0 ? `Due in ${d}d ${h}h` : h > 0 ? `Due in ${h}h ${m}m` : `Due in ${m}m`);
      }
    };
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, [targetIso]);
  return label;
}

export default function FollowUps() {
  const navigate = useNavigate();
  const store = useAppStore();
  const { data, addFollowUpLog, closeFollowUp, reopenFollowUp, openAttachmentModal, user, activeDoer } = store;
  const { globalDateRange, setGlobalDateRange } = store as any;
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  // Default to the active doer's name so they only see their own queue on login.
  const [filterOwner, setFilterOwner] = useState<string>(
    () => activeDoer?.display_name ?? 'All Owners'
  );

  // When the active doer changes (e.g. switch doer), re-lock the filter.
  useEffect(() => {
    setFilterOwner(activeDoer?.display_name ?? 'All Owners');
  }, [activeDoer?.display_name]);
  const [searchQuery, setSearchQuery] = useState('');
  const [queueTab, setQueueTab] = useState<'open' | 'closed'>('open');
  const [quickFilter, setQuickFilter] = useState<'all' | 'urgent' | 'today' | 'upcoming'>('all');
  const [viewTab, setViewTab] = useState<'queue' | 'board' | 'calendar'>('queue');
  const [calWeekOffset, setCalWeekOffset] = useState(0);

  const [channel, setChannel] = useState<FollowUpLog['channel']>('Called');
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState<FollowUpLog['channel']>('To Call');
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [nextNote, setNextNote] = useState('');
  // Explicit stage the user is logging activity for — does NOT auto-advance
  const [stageOverride, setStageOverride] = useState<string>('');
  // Sibling quotes from the same customer to also log this activity for
  const [alsoLogFor, setAlsoLogFor] = useState<Set<string>>(new Set());
  // Which sibling card is expanded to show detail
  const [expandedSibling, setExpandedSibling] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const applyChip = useCallback((chip: Suggestion) => {
    if (chip.channel === null) return; // Won/Lost/Park handled via onClick
    setChannel(chip.channel as FollowUpLog['channel']);
    setNote(chip.noteTemplate);
    if (chip.nextDaysFromNow) {
      const d = new Date();
      d.setDate(d.getDate() + chip.nextDaysFromNow);
      setNextDate(d.toISOString().slice(0, 10));
    }
    setTimeout(() => {
      noteRef.current?.focus();
      const len = chip.noteTemplate.length;
      noteRef.current?.setSelectionRange(len, len);
    }, 50);
  }, []);

  const today = startOfDay(new Date());

  const followUpQueue = useMemo(() => {
    const activeQuotes = data.quotes.filter(q => {
      if (q.status === 'Lost' || q.status === 'Won') return false;
      const fu = data.followups.find(f => f.quote_id === q.id);
      // Exclude quotes closed as Won/Lost/Rejected — they're done, not pending follow-up
      if (fu?.status === 'closed' && (fu.outcome === 'Won' || fu.outcome === 'Lost' || fu.outcome === 'Rejected')) return false;
      return true;
    });

    return activeQuotes.map(quote => {
      const followUp = data.followups.find(f => f.quote_id === quote.id);

      // Days since the quote was issued — used to escalate quotes that have
      // been sent but never had a next touch scheduled.
      let daysSinceQuote = 0;
      try {
        const qDate = parseISO(quote.date);
        daysSinceQuote = Math.max(0, Math.floor((today.getTime() - startOfDay(qDate).getTime()) / 86400000));
      } catch { /* malformed date — leave at 0 */ }

      const isClosed = (followUp?.status ?? 'open') === 'closed';

      let priority: 'overdue' | 'today' | 'upcoming' | 'unscheduled' | 'none' = 'none';
      if (followUp?.next_date) {
        const d = parseISO(followUp.next_date);
        if (isBefore(d, today)) priority = 'overdue';
        else if (isToday(d)) priority = 'today';
        else priority = 'upcoming';
      } else if (!isClosed) {
        // Check if quote was sent today — if so, surface as "today" for acknowledgement
        const sentLog = followUp?.logs?.find((l: any) => l.note?.startsWith('Quote sent —'));
        if (sentLog && isToday(parseISO(sentLog.ts))) {
          priority = 'today';
        } else {
          priority = 'unscheduled';
        }
      }

      return { quote, followUp, priority, daysSinceQuote };
    }).filter(item => {
      const status = item.followUp?.status ?? 'open';
      if (status !== queueTab) return false;

      // Quick-filter from the stat cards (only meaningful on the Active tab).
      if (queueTab === 'open' && quickFilter !== 'all') {
        if (quickFilter === 'urgent') {
          if (item.priority !== 'overdue' && item.priority !== 'unscheduled') return false;
        } else if (item.priority !== quickFilter) {
          return false;
        }
      }

      const matchesSearch =
        item.quote.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.quote.cust.toLowerCase().includes(searchQuery.toLowerCase());

      const owner = item.followUp?.owner || 'Unassigned';
      const matchesOwner = filterOwner === 'All Owners' || owner === filterOwner;

      // Global date range filter by quote date — consistent with Quotes/Orders/Enquiries.
      if (globalDateRange && !isInDateRange(item.quote.date, globalDateRange)) return false;

      return matchesSearch && matchesOwner;
    }).sort((a, b) => {
      const priorityOrder = { overdue: 0, today: 1, unscheduled: 2, upcoming: 3, none: 4 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Within "unscheduled", the longest-silent quotes float to the top.
      if (a.priority === 'unscheduled' && b.priority === 'unscheduled') {
        return b.daysSinceQuote - a.daysSinceQuote;
      }
      if (a.followUp?.next_date && b.followUp?.next_date) {
        return a.followUp.next_date.localeCompare(b.followUp.next_date);
      }
      return 0;
    });
  }, [data.quotes, data.followups, searchQuery, filterOwner, queueTab, quickFilter, globalDateRange]);

  const allOpen = useMemo(() =>
    data.quotes.filter(q => {
      if (q.status === 'Lost' || q.status === 'Won') return false;
      const f = data.followups.find(fu => fu.quote_id === q.id);
      if ((f?.status ?? 'open') !== 'open') return false;
      if (f?.outcome === 'Won' || f?.outcome === 'Lost' || f?.outcome === 'Rejected') return false;
      if (globalDateRange && !isInDateRange(q.date, globalDateRange)) return false;
      return true;
    }),
    [data.quotes, data.followups, globalDateRange]
  );

  const { days: calDays } = useMemo(() => getOffsetWeekRange(calWeekOffset), [calWeekOffset]);

  const calWeekLabel = useMemo(() => {
    const s = calDays[0], e = calDays[6];
    return `${fmtIST(s, 'dd MMM')} – ${fmtIST(e, 'dd-MMM-yyyy')}`;
  }, [calDays]);

  const calEventMap = useMemo(() => {
    const allItems = data.quotes.filter(q => q.status !== 'Lost').map(quote => {
      const followUp = data.followups.find(f => f.quote_id === quote.id);
      return { quote, followUp };
    }).filter(item =>
      (item.followUp?.status ?? 'open') === 'open' &&
      (!globalDateRange || isInDateRange(item.quote.date, globalDateRange))
    );
    const map: Record<string, typeof allItems> = {};
    for (const item of allItems) {
      const d = item.followUp?.next_date;
      if (!d) continue;
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [data.quotes, data.followups, globalDateRange]);

  const todayKey = dateKey(new Date());

  const selectedItem = followUpQueue.find(item => item.quote.id === selectedQuoteId) || followUpQueue[0];
  // Reset stage override when selection changes
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedItem?.quote.id !== prevSelectedRef.current) {
      prevSelectedRef.current = selectedItem?.quote.id ?? null;
      setStageOverride('');
      setAlsoLogFor(new Set());
      setExpandedSibling(null);
    }
  }, [selectedItem?.quote.id]);

  const stats = {
    // Overdue + No Next Step merged into one urgent bucket
    urgent: allOpen.filter(q => {
      const f = data.followups.find(fu => fu.quote_id === q.id);
      if (f?.next_date) return isBefore(parseISO(f.next_date), today);
      return true; // no next_date = unscheduled
    }).length,
    // Due today by next_date, plus quotes sent today awaiting acknowledgement
    today: allOpen.filter(q => {
      const f = data.followups.find(fu => fu.quote_id === q.id);
      if (f?.next_date && isToday(parseISO(f.next_date))) return true;
      // Quote sent today (stage = Sent Quotation, sent log ts is today) → due for acknowledgement
      if (f?.stage === 'Sent Quotation' || !f) {
        const sentLog = data.followups.find(fu => fu.quote_id === q.id)?.logs?.find(
          (l: any) => l.note?.startsWith('Quote sent —')
        );
        if (sentLog && isToday(parseISO(sentLog.ts))) return true;
        // Also catch quotes marked sent today with no followup record yet
        if (!f && q.status === 'Sent' && isToday(parseISO(q.date))) return true;
      }
      return false;
    }).length,
    upcoming: allOpen.filter(q => {
      const f = data.followups.find(fu => fu.quote_id === q.id);
      return f?.next_date && !isBefore(parseISO(f.next_date), today) && !isToday(parseISO(f.next_date));
    }).length,
  };

  const owners = ['All Owners', ...Array.from(new Set(data.followups.map(f => f.owner).filter(Boolean)))];

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuoteId || !note) return;

    const newLog: FollowUpLog = {
      ts: new Date().toISOString(),
      who: store.stampName(),
      channel,
      note,
      nextDate: nextDate || undefined,
      nextTime: nextDate ? (nextTime || undefined) : undefined,
      nextChannel: nextAction,
      nextNote: nextDate ? (nextNote.trim() || undefined) : undefined,
    };

    try {
      // Log for the primary selected quote
      await addFollowUpLog(selectedQuoteId, newLog, nextDate || null, nextTime || null, '', stageOverride || null);
      // Log same activity for any ticked sibling quotes (next date/time carried over)
      for (const sibId of alsoLogFor) {
        await addFollowUpLog(sibId, newLog, nextDate || null, nextTime || null, '', null);
      }
      setNote('');
      setNextDate('');
      setNextTime('');
      setNextNote('');
      setAlsoLogFor(new Set());
      // Keep stageOverride so the next log defaults to the same stage
    } catch (err) {
      alert('Failed to log activity. Please ensure followups table exists in Supabase.');
    }
  };

  const handleClose = async () => {
    if (!selectedQuoteId) return;
    try {
      await closeFollowUp(selectedQuoteId);
      setSelectedQuoteId(null);
    } catch (err) {
      alert('Failed to close follow-up.');
    }
  };

  const handleReopen = async () => {
    if (!selectedQuoteId) return;
    try {
      await reopenFollowUp(selectedQuoteId);
      setQueueTab('open');
      setSelectedQuoteId(null);
    } catch (err) {
      alert('Failed to reopen follow-up.');
    }
  };

  const handleMarkWon = async (quoteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const quote = data.quotes.find(q => q.id === quoteId);
    const hasPO = (quote?.attachments?.length ?? 0) > 0;
    if (!hasPO) {
      const proceed = confirm(
        '⚠️ No PO attachment found for this quote.\n\nPlease upload the Purchase Order before marking as Won.\n\nClick OK to open the attachments panel, or Cancel to go back.'
      );
      if (proceed) openAttachmentModal('quote', quoteId);
      return;
    }
    if (!confirm(`Mark ${quoteId} as WON? PO attachment confirmed.`)) return;
    try { await closeFollowUp(quoteId, 'Won'); } catch { alert('Failed to mark as Won.'); }
  };

  const handleMarkLost = async (quoteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Mark this quote as LOST?')) return;
    try { await closeFollowUp(quoteId, 'Lost'); } catch { alert('Failed to mark as Lost.'); }
  };

  const handleQuotePDF = (quote: Quote) => {
    const cust = data.customers.find(c => c.name === quote.cust);
    const unit = quote.unitId ? data.units.find(u => u.id === quote.unitId) : data.units.find(u => u.is_default);
    const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
    const sig = unitSig ?? data.signatories.find(s => s.is_default);
    generateQuotePDF(quote, cust, data.settings, sig, true, unit);
  };

  const handlePIPDF = (quote: Quote) => {
    const order = data.orders.find(o => o.quoteRef === quote.id);
    if (!order) return;
    const cust = data.customers.find(c => c.name === order.cust);
    const unit = order.unitId ? data.units.find(u => u.id === order.unitId) : data.units.find(u => u.is_default);
    const bank = order.bankAccountId
      ? data.bankAccounts.find(b => b.id === order.bankAccountId)
      : data.bankAccounts.find(b => b.unit_id === unit?.id && b.is_default);
    const unitSig = unit?.signatory_id ? data.signatories.find(s => s.id === unit.signatory_id) : undefined;
    const sig = unitSig ?? data.signatories.find(s => s.is_default);
    generatePIPDF(order, quote, cust, data.settings, sig, true, unit, bank);
  };

  const isClosedTab = queueTab === 'closed';

  // On-time / TAT helpers live in lib/kpi.ts (shared with the Doer KPI page).
  // These thin wrappers bind the current settings so call sites stay unchanged.
  const isQuoteSentLog = isQuoteSentLogFn;
  const stageTatHours = (stage: string) => stageTatHoursFn(data.settings, stage);
  const buildFullChain = (quote: Quote, followUp: FollowUp | undefined) =>
    buildFullChainFn(data.settings, quote, followUp);
  const stepDeadline = (chain: FollowUpLog[], i: number) =>
    stepDeadlineFn(data.settings, chain, i);
  const cardOnTimeRate = (chain: FollowUpLog[]) => cardOnTimeRateFn(data.settings, chain);

  // TAT label for the queue card footer: shows the active stage TAT from Settings.
  function tatLabel(followUp: FollowUp | undefined) {
    const stage = followUp?.stage ?? 'Sent Quotation';
    const tatH = stageTatHours(stage === 'Closed' ? 'Sent Quotation' : stage);
    const d = Math.floor(tatH / 24);
    const h = tatH % 24;
    const formatted = [d > 0 ? `${d}d` : '', h > 0 ? `${h}h` : ''].filter(Boolean).join(' ');
    const realLogs = (followUp?.logs ?? []).filter(l => !isQuoteSentLog(l.note));
    const suffix = realLogs.length === 0 ? '(1st call)' : `(${stage})`;
    return `TAT: ${formatted} ${suffix}`;
  }


  // On-time rate across all logs (for score bar)
  const ontimeAllPct = useMemo(() => {
    let onT = 0, tot = 0;
    data.quotes
      .filter(q => q.status !== 'Lost' && q.status !== 'Won')
      .filter(q => {
        const fu = data.followups.find(f => f.quote_id === q.id);
        return !(fu?.outcome === 'Won' || fu?.outcome === 'Lost' || fu?.outcome === 'Rejected');
      })
      .filter(q => !globalDateRange || isInDateRange(q.date, globalDateRange))
      .forEach(q => {
        const fu = data.followups.find(f => f.quote_id === q.id);
        const chain = buildFullChain(q, fu);
        for (let i = 1; i < chain.length; i++) {
          tot++;
          if (new Date(chain[i].ts) <= stepDeadline(chain, i)) onT++;
        }
      });
    return tot > 0 ? Math.round(onT / tot * 100) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.quotes, data.followups, globalDateRange]);

  return (
    <div className="flex flex-col h-full bg-cream overflow-hidden">
      <DateFilterBanner globalDateRange={globalDateRange} onClear={() => setGlobalDateRange(null)} />

      {/* ── SCORE BAR ── */}
      <div className="bg-white border-b border-g200 flex items-stretch shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* Overdue + No Next Step merged */}
        <button
          type="button"
          onClick={() => { setQuickFilter(f => f === 'urgent' ? 'all' : 'urgent'); setSelectedQuoteId(null); setViewTab('queue'); }}
          className={cn(
            "flex items-center gap-3 px-5 py-4 cursor-pointer transition-colors relative border-r border-g200",
            quickFilter === 'urgent' ? "bg-red-lt" : "hover:bg-g50"
          )}
        >
          {quickFilter === 'urgent' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-red-mrt rounded-t-full" />}
          <div className="w-8 h-8 rounded-[3px] bg-red-lt flex items-center justify-center shrink-0">
            <AlertTriangle size={15} className="text-red-mrt" />
          </div>
          <div className="text-left">
            <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500 mb-0.5">Needs Attention</div>
            <div className="font-serif text-[22px] leading-none text-red-mrt">{stats.urgent}</div>
          </div>
        </button>

        {/* Due Today */}
        <button
          type="button"
          onClick={() => { setQuickFilter(f => f === 'today' ? 'all' : 'today'); setSelectedQuoteId(null); setViewTab('queue'); }}
          className={cn(
            "flex items-center gap-3 px-5 py-4 cursor-pointer transition-colors relative border-r border-g200",
            quickFilter === 'today' ? "bg-sR/5" : "hover:bg-g50"
          )}
        >
          {quickFilter === 'today' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-red-mrt rounded-t-full" />}
          <div className="w-8 h-8 rounded-[3px] bg-sR/8 flex items-center justify-center shrink-0">
            <Clock size={15} className="text-sR" />
          </div>
          <div className="text-left">
            <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500 mb-0.5">Due Today</div>
            <div className="font-serif text-[22px] leading-none text-sR">{stats.today}</div>
          </div>
        </button>

        {/* Upcoming */}
        <button
          type="button"
          onClick={() => { setQuickFilter(f => f === 'upcoming' ? 'all' : 'upcoming'); setSelectedQuoteId(null); setViewTab('queue'); }}
          className={cn(
            "flex items-center gap-3 px-5 py-4 cursor-pointer transition-colors relative border-r border-g200",
            quickFilter === 'upcoming' ? "bg-sW/5" : "hover:bg-g50"
          )}
        >
          {quickFilter === 'upcoming' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-red-mrt rounded-t-full" />}
          <div className="w-8 h-8 rounded-[3px] bg-sW/8 flex items-center justify-center shrink-0">
            <CheckCircle2 size={15} className="text-sW" />
          </div>
          <div className="text-left">
            <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500 mb-0.5">Upcoming</div>
            <div className="font-serif text-[22px] leading-none text-sW">{stats.upcoming}</div>
          </div>
        </button>

        {/* Total Active */}
        <button
          type="button"
          onClick={() => { setQuickFilter('all'); setSelectedQuoteId(null); setViewTab('queue'); }}
          className={cn(
            "flex items-center gap-3 px-5 py-4 cursor-pointer transition-colors relative border-r border-g200",
            quickFilter === 'all' ? "bg-g100" : "hover:bg-g50"
          )}
        >
          {quickFilter === 'all' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-red-mrt rounded-t-full" />}
          <div className="w-8 h-8 rounded-[3px] bg-g100 flex items-center justify-center shrink-0">
            <History size={15} className="text-g600" />
          </div>
          <div className="text-left">
            <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500 mb-0.5">Total Active</div>
            <div className="font-serif text-[22px] leading-none text-blk">{stats.urgent + stats.today + stats.upcoming}</div>
          </div>
        </button>

        {/* On-time rate — right side */}
        <div className="ml-auto flex items-center gap-4 px-6">
          {ontimeAllPct !== null && (
            <div className="flex flex-col items-end gap-1.5">
              <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500">On-Time Rate</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-20 h-1.5 bg-g150 rounded-full overflow-hidden"
                  style={{ '--progress-w': `${ontimeAllPct}%` } as React.CSSProperties}
                >
                  <div className={cn("progress-fill h-full rounded-full transition-all duration-700",
                    ontimeAllPct >= 70 ? "bg-sW" : ontimeAllPct >= 40 ? "bg-amber-500" : "bg-red-mrt"
                  )} />
                </div>
                <span className={cn(
                  "font-mono text-[11px] font-bold",
                  ontimeAllPct >= 70 ? "text-sW" : ontimeAllPct >= 40 ? "text-amber-600" : "text-red-mrt"
                )}>{ontimeAllPct}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN BODY ── */}
      <div className="flex flex-1 overflow-hidden">

      {/* Board view — full width, no left panel */}
      {viewTab === 'board' && (
        <PipelineBoard ownerFilter={filterOwner} search={searchQuery} dateRange={globalDateRange} />
      )}

      {/* Left Panel: Queue / Calendar */}
      {viewTab !== 'board' && (
      <div className="w-[340px] border-r border-g200 flex flex-col bg-white shrink-0">
        {/* Left panel header — slim */}
        <div className="px-3 py-2.5 border-b border-g150 space-y-2">
          {/* View tabs + Cal */}
          <div className="flex gap-1.5">
            <div className="flex gap-0.5 flex-1 bg-g100 rounded-[3px] p-0.5">
              {(['queue', 'board'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setViewTab(tab)}
                  className={cn(
                    "flex-1 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded-[2px] transition-colors",
                    viewTab === tab ? "bg-white text-blk shadow-sm" : "text-g500 hover:text-blk"
                  )}
                >
                  {tab === 'queue' ? 'Queue' : 'Board'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setViewTab(v => v === 'calendar' ? 'queue' : 'calendar')}
              title="Calendar view"
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded-[3px] border transition-colors shrink-0",
                viewTab === 'calendar'
                  ? "bg-red-mrt text-white border-red-mrt"
                  : "bg-g100 text-g500 border-transparent hover:text-blk hover:bg-g200"
              )}
            >
              <Calendar size={11} />
              Cal
            </button>
          </div>

          {/* Active / Closed — queue view only */}
          {viewTab === 'queue' && (
            <div className="flex gap-0.5 bg-g100 rounded-[3px] p-0.5">
              <button
                type="button"
                onClick={() => { setQueueTab('open'); setSelectedQuoteId(null); }}
                className={cn(
                  "flex-1 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-[2px] transition-colors",
                  queueTab === 'open' ? "bg-white text-blk shadow-sm" : "text-g500 hover:text-blk"
                )}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => { setQueueTab('closed'); setSelectedQuoteId(null); }}
                className={cn(
                  "flex-1 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-[2px] transition-colors",
                  queueTab === 'closed' ? "bg-white text-blk shadow-sm" : "text-g500 hover:text-blk"
                )}
              >
                Closed
              </button>
            </div>
          )}

          {/* Search + Owner */}
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-g400" size={13} />
              <input
                type="text"
                placeholder="Search quotes or customers…"
                className="w-full pl-7 pr-2 py-1.5 bg-g50 border border-g200 rounded-[3px] text-[11.5px] focus:outline-none focus:border-red-mrt/40"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1">
              {/* "My Tasks" is the first option (maps to the active doer's name);
                  no separate toggle button needed. */}
              <select
                title="Filter by owner"
                className="bg-g50 border border-g200 rounded-[3px] px-2 py-1 text-[11px] font-medium appearance-none pr-5"
                value={filterOwner}
                onChange={e => setFilterOwner(e.target.value)}
              >
                {activeDoer && (
                  <option value={activeDoer.display_name}>★ My Tasks ({activeDoer.display_name})</option>
                )}
                {owners
                  .filter(o => !activeDoer || o !== activeDoer.display_name)
                  .map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>

        {viewTab === 'calendar' ? (
          <FUCalWeekGrid
            days={calDays}
            eventMap={calEventMap}
            selectedQuoteId={selectedQuoteId}
            onSelect={id => setSelectedQuoteId(id)}
            todayKey={todayKey}
            weekLabel={calWeekLabel}
            onPrev={() => setCalWeekOffset(o => o - 1)}
            onNext={() => setCalWeekOffset(o => o + 1)}
            onToday={() => setCalWeekOffset(0)}
          />
        ) : (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {followUpQueue.map(({ quote, followUp, priority, daysSinceQuote }) => {
            const fullChain = buildFullChain(quote, followUp);
            const onTimePct = cardOnTimeRate(fullChain);
            const tat = tatLabel(followUp);
            const isSelected = selectedQuoteId === quote.id || (selectedItem && selectedItem.quote.id === quote.id);
            const custRec = data.customers.find(c => c.name === quote.cust);
            const site = custRec?.sites.find(s => s.id === quote.siteId) ?? custRec?.sites.find(s => s.isPrimary) ?? custRec?.sites[0];
            const locationLabel = [site?.city, site?.name && site.name !== quote.cust ? site.name : ''].filter(Boolean).join(' — ') || site?.state || '';
            const value = quote.items.reduce((a, i) => a + i.total, 0);
            const lastLog = followUp?.logs?.filter(l => !isQuoteSentLog(l.note)).slice(-1)[0];
            const followUpStage = followUp?.stage ?? quote.status;

            return (
            <button
              key={quote.id}
              type="button"
              onClick={() => setSelectedQuoteId(quote.id)}
              className={cn(
                "w-full text-left rounded-[6px] border-l-[3px] border border-r-0 border-t-0 border-b-0 transition-all duration-150 overflow-hidden",
                isSelected
                  ? "bg-red-lt shadow-[0_0_0_1px_rgba(212,32,39,0.15)] border-l-red-mrt"
                  : "bg-white hover:bg-g50 border-l-transparent hover:border-l-g300",
                // left border colour by priority
                !isSelected && priority === 'overdue' && "border-l-red-mrt",
                !isSelected && priority === 'today' && "border-l-sR",
                !isSelected && priority === 'unscheduled' && "border-l-orange-400",
                !isSelected && priority === 'upcoming' && "border-l-sW",
                !isSelected && isClosedTab && "border-l-emerald-400",
              )}
            >
              {/* Top row: ref + urgency badge */}
              <div className="flex items-center justify-between px-3 pt-2.5 pb-0">
                <span className="font-mono text-[10px] font-bold text-sQ tracking-wide">{quote.id}</span>
                <span className={cn(
                  "text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full",
                  isClosedTab ? "text-emerald-700 bg-emerald-100" :
                  priority === 'overdue' ? "text-red-mrt bg-red-lt" :
                  priority === 'today' ? "text-sR bg-sR/10" :
                  priority === 'unscheduled' ? "text-orange-600 bg-orange-100" :
                  priority === 'upcoming' ? "text-sW bg-sW/10" :
                  "text-g500 bg-g100"
                )}>
                  {isClosedTab ? 'Closed' : priority === 'unscheduled' ? 'No Next Step' : priority === 'none' ? 'New' : priority}
                </span>
              </div>

              {/* Customer name + location */}
              <div className="px-3 pt-1">
                <div className="text-[13px] font-bold text-blk leading-snug truncate">{quote.cust}</div>
                {locationLabel && (
                  <div className="flex items-center gap-0.5 text-[10px] text-g400 mt-0.5">
                    <MapPin size={9} className="shrink-0" />
                    <span className="truncate">{locationLabel}</span>
                  </div>
                )}
              </div>

              {/* Value + stage */}
              <div className="flex items-center gap-2 px-3 pt-1.5">
                <span className="font-mono text-[12px] font-bold text-blk">₹{value.toLocaleString('en-IN')}</span>
                {followUpStage && (
                  <span className={cn(
                    "text-[9px] font-semibold px-1.5 py-0.5 rounded-[3px]",
                    followUpStage === '1st Follow-up' || followUpStage === 'Sent Quotation' ? "bg-blue-50 text-blue-700" :
                    followUpStage === '2nd Follow-up' || followUpStage === 'Offer Acknowledged' ? "bg-orange-50 text-orange-700" :
                    followUpStage === 'Negotiation' || followUpStage?.includes('3rd') ? "bg-purple-50 text-purple-700" :
                    "bg-g100 text-g600"
                  )}>{followUpStage}</span>
                )}
              </div>

              {/* Next follow-up date */}
              <div className={cn(
                "flex items-center gap-1 px-3 pt-1 text-[11px] font-bold",
                priority === 'overdue' ? "text-red-700" :
                priority === 'today' ? "text-amber-700" :
                priority === 'unscheduled' ? "text-orange-700" : "text-slate-600"
              )}>
                {priority === 'unscheduled' ? (
                  <AlertTriangle size={11} className="shrink-0 text-orange-600" />
                ) : priority === 'overdue' ? (
                  <Clock size={11} className="shrink-0 animate-pulse" />
                ) : (
                  <Calendar size={11} className="shrink-0" />
                )}
                <span>
                  {isClosedTab ? 'Closed' :
                    priority === 'unscheduled'
                      ? (daysSinceQuote > 0 ? `Silent ${daysSinceQuote}d — set next step` : 'Set next step')
                      : formatDue(followUp?.next_date, followUp?.next_time) ?? 'No date set'}
                </span>
              </div>

              {/* Last log snippet */}
              {lastLog && (
                <div className="px-3 pt-1 pb-1">
                  <div className="flex items-start gap-1 text-[10px] text-g400 leading-snug">
                    <span className="shrink-0 mt-0.5">{CHANNEL_CONFIG[lastLog.channel]?.icon ?? '📌'}</span>
                    <span className="truncate italic">{lastLog.note.substring(0, 65)}{lastLog.note.length > 65 ? '…' : ''}</span>
                  </div>
                </div>
              )}
              {!lastLog && (
                <div className="px-3 pt-1 pb-1 text-[10px] text-g300 italic">No activity yet</div>
              )}

              {/* TAT + On-Time footer */}
              <div className="flex items-center gap-2 px-3 py-1.5 mt-0.5 border-t border-g100 bg-g50/60 text-[9.5px] font-mono">
                <span className="text-slate-600 font-bold">{tat}</span>
                {onTimePct !== null && (
                  <>
                    <span className="text-g300">·</span>
                    <span className={cn(
                      "font-bold",
                      onTimePct >= 80 ? "text-emerald-700" : onTimePct >= 60 ? "text-orange-600" : "text-red-700"
                    )}>On-Time: {onTimePct}%</span>
                  </>
                )}
              </div>
            </button>
            );
          })}
        </div>
        )}
      </div>
      )} {/* /viewTab !== 'board' left panel */}

      {/* Center Panel: Detail — hidden in board view */}
      {viewTab !== 'board' && (
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {!selectedItem ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 bg-g100 rounded-full flex items-center justify-center mb-6 animate-bounce duration-[3s]">
              <Clock className="text-g300" size={32} />
            </div>
            <h2 className="text-2xl font-serif text-blk italic mb-2">Ready to re-engage?</h2>
            <p className="text-g500 max-w-sm text-[13px]">
              Select a quotation from the queue to review activity history and log your next follow-up action.
            </p>
          </div>
        ) : (
          <>
            {/* ── DETAIL HEADER ── */}
            <div className="bg-white border-b border-g200 shrink-0">
              {/* Top row: customer name + city · ref + badges · action buttons */}
              <div className="flex items-center gap-4 px-6 pt-2.5 pb-2 border-b border-g150">
                {/* Customer identity block */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="font-serif text-[22px] text-blk italic leading-tight truncate">{selectedItem.quote.cust}</h1>
                    {(() => {
                      const custRec = data.customers.find(c => c.name === selectedItem.quote.cust);
                      if (!custRec) return null;
                      return (
                        <button type="button" title="Open customer record" onClick={() => navigate(`/customers/new?id=${custRec.id}`)}
                          className="text-g400 hover:text-red-mrt transition-colors shrink-0 p-0.5">
                          <ExternalLink size={13} />
                        </button>
                      );
                    })()}
                  </div>
                  {(() => {
                    const custRec = data.customers.find(c => c.name === selectedItem.quote.cust);
                    const site = custRec?.sites.find(s => s.id === selectedItem.quote.siteId) ?? custRec?.sites.find(s => s.isPrimary) ?? custRec?.sites[0];
                    const detailLocation = [site?.city, site?.name && site.name !== custRec?.name ? site.name : ''].filter(Boolean).join(' — ') || site?.state || '';
                    return (
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-red-mrt bg-red-lt border border-red-mrt/20 px-2 py-0.5 rounded-[3px] tracking-wide">{selectedItem.quote.id}</span>
                        {!isClosedTab && (
                          <span className={cn(
                            "font-mono text-[9px] font-bold tracking-[1.5px] uppercase px-1.5 py-0.5 rounded-[3px] border",
                            selectedItem.priority === 'overdue' ? "bg-red-lt text-red-mrt border-red-mrt/20" :
                            selectedItem.priority === 'today' ? "bg-amber-50 text-amber-700 border-amber-200" :
                            selectedItem.priority === 'unscheduled' ? "bg-orange-50 text-orange-600 border-orange-200" :
                            selectedItem.priority === 'upcoming' ? "bg-sW/8 text-sW border-sW/20" :
                            "bg-g100 text-g500 border-g200"
                          )}>
                            {selectedItem.priority === 'overdue' ? 'OVERDUE' :
                             selectedItem.priority === 'today' ? 'DUE TODAY' :
                             selectedItem.priority === 'unscheduled' ? 'NO NEXT STEP' :
                             selectedItem.priority === 'upcoming' ? 'UPCOMING' : 'SENT'}
                          </span>
                        )}
                        {isClosedTab && (
                          <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase px-1.5 py-0.5 rounded-[3px] border bg-emerald-50 text-emerald-700 border-emerald-200">CLOSED</span>
                        )}
                        {detailLocation && (
                          <span className="flex items-center gap-1 text-[11px] text-g500">
                            <MapPin size={9} className="text-g400 shrink-0" />
                            {detailLocation}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {/* Action buttons — Won / Lost / Close all live in the Log Activity
                    panel footer now; the header only offers Re-open on closed quotes. */}
                {isClosedTab && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={handleReopen}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase rounded-[3px] border border-g300 text-g600 bg-white hover:bg-g50 transition-colors">
                      <RotateCcw size={11} /> Re-open
                    </button>
                  </div>
                )}
              </div>

              {/* KPI strip — ultra-compact single inline row (label: value · …) so
                  the header is minimal and the Log Activity panel reaches the top. */}
              <div className="flex items-center flex-wrap gap-x-4 gap-y-0.5 border-t border-g150 px-6 py-1.5">
                {[
                  { label: 'Quote Value', value: `₹${selectedItem.quote.items.reduce((a, i) => a + i.total, 0).toLocaleString('en-IN')}`, mono: true },
                  { label: 'Valid Till', value: fmtIST(parseISO(selectedItem.quote.validity), 'dd-MMM-yyyy'), mono: false,
                    color: (() => { const ms = new Date(selectedItem.quote.validity).getTime() - Date.now(); return ms < 0 ? 'text-red-700 font-bold' : ms < 3 * 86_400_000 ? 'text-orange-700 font-bold' : 'text-slate-700 font-semibold'; })() },
                  { label: 'On-Time %', value: (() => { const p = cardOnTimeRate(buildFullChain(selectedItem.quote, selectedItem.followUp)); return p !== null ? `${p}%` : '—'; })(),
                    mono: true,
                    color: (() => { const p = cardOnTimeRate(buildFullChain(selectedItem.quote, selectedItem.followUp)); return p !== null ? (p >= 70 ? 'text-sW' : p >= 40 ? 'text-amber-600' : 'text-red-mrt') : undefined; })() },
                  { label: 'Next Step', value: selectedItem.followUp?.next_date
                    ? `${formatDue(selectedItem.followUp.next_date, selectedItem.followUp.next_time)} · ${selectedItem.followUp.next_date < new Date().toISOString().slice(0,10) ? '⚠ ' : ''}${selectedItem.followUp?.stage ?? ''}`
                    : 'Not scheduled',
                    mono: false,
                    color: selectedItem.priority === 'overdue' ? 'text-red-700 font-bold' : selectedItem.priority === 'today' ? 'text-amber-700 font-bold' : 'text-slate-700 font-semibold' },
                  { label: 'Owner', value: selectedItem.followUp?.owner || 'Unassigned', mono: false },
                  { label: 'Follow-Ups', value: String((selectedItem.followUp?.logs ?? []).filter(l => !isQuoteSentLog(l.note)).length), mono: true },
                ].map((kpi, i) => (
                  <div key={i} className="flex items-baseline gap-1 min-w-0">
                    <span className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase text-g400 shrink-0">{kpi.label}</span>
                    <span className={cn("text-[12px] font-semibold text-blk truncate", kpi.mono && "font-mono text-[11.5px]", kpi.color)}>{kpi.value}</span>
                  </div>
                ))}
              </div>

            </div>

            {/* Content: Timeline */}
            <div className="flex-1 overflow-hidden flex flex-col min-w-0 bg-g50">
                {/* Contacts bar — lives in the timeline column (left) so it doesn't
                    push the Log Activity panel down; panel starts right below the KPIs. */}
                {(() => {
                  const custRec = data.customers.find(c => c.name === selectedItem.quote.cust);
                  const site = custRec?.sites.find(s => s.id === selectedItem.quote.siteId) ?? custRec?.sites.find(s => s.isPrimary) ?? custRec?.sites[0];
                  const contacts = site?.contacts ?? [];
                  if (contacts.length === 0) return null;
                  return (
                    <div className="shrink-0 flex items-center gap-2 px-6 py-1.5 border-b border-g150 bg-g50 flex-wrap">
                      {contacts.map(ct => (
                        <div key={ct.id} className="flex items-center gap-2 bg-white border border-g200 rounded-[3px] px-3 py-1.5 hover:border-g300 hover:shadow-sm transition-all">
                          <div>
                            <div className="text-[11.5px] font-semibold text-blk leading-none">{ct.name}</div>
                            {ct.role && <div className="text-[9px] text-g400 uppercase tracking-wide font-bold mt-0.5">{ct.role}</div>}
                          </div>
                          {(ct.phone || ct.email) && <div className="w-px h-5 bg-g200 mx-1" />}
                          <div className="flex items-center gap-1.5">
                            {ct.phone && (
                              <a href={`tel:${ct.phone}`} title={ct.phone}
                                className="w-6 h-6 flex items-center justify-center rounded-[3px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                                <Phone size={11} />
                              </a>
                            )}
                            {ct.phone && (
                              <a href={`https://wa.me/91${ct.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp"
                                className="w-6 h-6 flex items-center justify-center rounded-[3px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                                <MessageCircle size={11} />
                              </a>
                            )}
                            {ct.email && (
                              <a href={`mailto:${ct.email}`} title={ct.email}
                                className="w-6 h-6 flex items-center justify-center rounded-[3px] bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                                <Mail size={11} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Nudge when this quote has no next step planned */}
                {!isClosedTab && selectedItem.priority === 'unscheduled' && (
                  <div className="shrink-0 flex items-center gap-2 px-6 py-2.5 bg-orange-50 border-b border-orange-200">
                    <AlertTriangle size={14} className="text-orange-500 shrink-0" />
                    <span className="text-[12px] text-orange-700 font-medium">
                      No next step planned for this quotation
                      {selectedItem.daysSinceQuote > 0 ? ` — silent ${selectedItem.daysSinceQuote} day${selectedItem.daysSinceQuote === 1 ? '' : 's'}.` : '.'}
                      {' '}Log an activity on the right and set the next follow-up date.
                    </span>
                  </div>
                )}
                {/* Chat-bubble activity log */}
                <div className="flex-1 overflow-y-auto p-3 pb-4">
                  {/* Activity History header + inline suggestion chips */}
                  {(() => {
                    if (isClosedTab) return (
                      <div className="flex items-center gap-2 mb-4">
                        <History size={16} className="text-g400" />
                        <span className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-g500">Activity History</span>
                      </div>
                    );
                    const fu = selectedItem.followUp;
                    const stage = fu?.stage ?? 'Sent Quotation';
                    const enteredAt = fu?.stage_entered_at ?? selectedItem.quote.date ?? new Date().toISOString();
                    const bl = stage as import('../lib/types').BoardLane;
                    const tatH = (() => {
                      const s = data.settings;
                      const h = s?.pipeline_tat_h?.[bl];
                      if (h != null) return h;
                      const d = s?.pipeline_tat?.[bl];
                      if (d != null) return d * 24;
                      return DEFAULT_STAGE_TAT_H[bl] ?? 48;
                    })();
                    const elapsedH = (Date.now() - new Date(enteredAt).getTime()) / 3_600_000;
                    const chips = buildSuggestions(
                      stage, selectedItem.daysSinceQuote, tatH, elapsedH,
                      selectedItem.quote.id, selectedItem.quote.cust,
                      selectedItem.quote.validity,
                    );
                    const nextDue = fu?.next_date
                      ? `${fu.next_date}T${fu.next_time ?? '09:00'}:00`
                      : null;
                    const isOverdue = selectedItem.priority === 'overdue';
                    return (
                      <SuggestionStrip
                        chips={chips}
                        nextDue={nextDue}
                        isOverdue={isOverdue}
                        quoteId={selectedItem.quote.id}
                        onChip={applyChip}
                        onMarkWon={(e: React.MouseEvent<HTMLButtonElement>) => handleMarkWon(selectedItem.quote.id, e)}
                        onMarkLost={(e: React.MouseEvent<HTMLButtonElement>) => handleMarkLost(selectedItem.quote.id, e)}
                      />
                    );
                  })()}

                  {(() => {
                    const allLogs = buildFullChain(selectedItem.quote, selectedItem.followUp);
                    return (
                    <div className="space-y-1">
                      {(() => {
                        const wasOnTime = (i: number): boolean | null => {
                          if (i === 0) return null;
                          return new Date(allLogs[i].ts) <= stepDeadline(allLogs, i);
                        };

                        return groupLogsByDay(allLogs).map(({ day, logs: dayLogs }) => (
                          <div key={day}>
                            <div className="flex items-center gap-3 my-3">
                              <div className="flex-1 h-px bg-g200" />
                              <span className="text-[10px] font-mono font-bold text-g400 bg-g50 px-2">
                                {isToday(parseISO(day)) ? 'Today' : fmtIST(parseISO(day), 'dd-MMM-yyyy')}
                              </span>
                              <div className="flex-1 h-px bg-g200" />
                            </div>

                            {dayLogs.map((log) => {
                              const globalIdx = allLogs.indexOf(log);
                              const cfg = CHANNEL_CONFIG[log.channel] ?? CHANNEL_CONFIG['Called'];
                              const isSystem = isQuoteSentLog(log.note);
                              const onTime = wasOnTime(globalIdx);
                              const onTimeFinal = isSystem ? true : onTime;
                              const isLast = globalIdx === allLogs.length - 1;

                              if (isSystem) {
                                return (
                                  <div key={globalIdx} className="flex gap-3 mb-3">
                                    <div className="flex flex-col items-center w-7 shrink-0">
                                      <div className="w-7 h-7 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center text-[12px]">📄</div>
                                      {!isLast && <div className="w-px flex-1 bg-g200 mt-1" />}
                                    </div>
                                    <div className="flex-1 pb-3">
                                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                        <span className="text-[12px] font-bold text-blk">Quote Sent</span>
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ON TIME</span>
                                        <span className="text-[9px] font-mono font-semibold text-slate-500">{fmtIST(parseISO(log.ts), 'dd MMM · hh:mm aa')}</span>
                                      </div>
                                      <p className="text-[12px] text-g600 leading-relaxed">{log.note}</p>
                                      {log.nextDate && (
                                        <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded-[4px] bg-amber-50 border border-amber-200">
                                          <Calendar size={10} className="text-amber-600 shrink-0" />
                                          <span className="text-[11px] font-bold text-amber-800">Next: {fmtIST(parseISO(log.nextDate), 'dd-MMM-yyyy')}{log.nextTime ? ` at ${log.nextTime}` : ''}{log.nextChannel ? ` · ${log.nextChannel}` : ''}</span>
                                        </div>
                                      )}
                                      <div className="text-[10px] text-g400 mt-0.5">{log.who}</div>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={globalIdx} className="flex gap-3 mb-3">
                                  <div className="flex flex-col items-center w-7 shrink-0">
                                    <div className={cn("w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[12px]", cfg.bg)}>
                                      {cfg.icon}
                                    </div>
                                    {!isLast && <div className="w-px flex-1 bg-g200 mt-1" />}
                                  </div>
                                  <div className="flex-1 pb-3">
                                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                      <span className="text-[12px] font-bold text-blk">{log.channel}</span>
                                      {onTimeFinal !== null && (
                                        <span className={cn(
                                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                          onTimeFinal ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                        )}>
                                          {onTimeFinal ? 'ON TIME' : 'LATE'}
                                        </span>
                                      )}
                                      <span className="text-[9px] font-mono font-semibold text-slate-500">{fmtIST(parseISO(log.ts), 'dd MMM · hh:mm aa')}</span>
                                    </div>
                                    <p className="text-[12px] text-g700 leading-relaxed whitespace-pre-wrap mb-1">{log.note}</p>
                                    {log.nextDate && (
                                      <div className="mb-1.5">
                                        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[4px] bg-amber-50 border border-amber-200">
                                          <Calendar size={10} className="text-amber-600 shrink-0" />
                                          <span className="text-[11px] font-bold text-amber-800">Next: {fmtIST(parseISO(log.nextDate), 'dd-MMM-yyyy')}{log.nextTime ? ` at ${log.nextTime}` : ''}{log.nextChannel ? ` · ${log.nextChannel}` : ''}</span>
                                        </div>
                                        {log.nextNote && (
                                          <div className="text-[10.5px] italic text-slate-500 pl-2 border-l-2 border-amber-200 mt-1">
                                            {log.nextNote}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div className="text-[10px] text-g400">{log.who}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                    );
                  })()}
                </div>
              </div>

          </>
        )}
      </div>
      )} {/* /viewTab !== 'board' center panel */}

      {/* Right Log Activity panel — sibling at main body level, hidden in board/closed views */}
      {viewTab !== 'board' && selectedItem && !isClosedTab && (
        <form onSubmit={handleLogActivity} className="w-[420px] shrink-0 bg-white flex flex-col h-full overflow-hidden border-l border-g200">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-1.5 border-b border-g150 shrink-0">
            <span className="font-mono text-[9.5px] font-bold tracking-[2px] uppercase text-g600">Log Activity</span>
            <span className="text-[11px] text-g400">
              {selectedItem.followUp?.logs?.filter(l => !isQuoteSentLog(l.note)).length
                ? `${selectedItem.followUp.logs.filter(l => !isQuoteSentLog(l.note)).length} entr${selectedItem.followUp.logs.filter(l => !isQuoteSentLog(l.note)).length === 1 ? 'y' : 'ies'}`
                : ''}
            </span>
          </div>

          {/* Scrollable form body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">

            {/* Also log for sibling quotes — same customer, other open quotes */}
            {(() => {
              const custName = selectedItem.quote.cust;
              const siblings = followUpQueue.filter(item =>
                item.quote.cust === custName &&
                item.quote.id !== selectedItem.quote.id
              );
              if (siblings.length === 0) return null;
              const allChecked = siblings.every(s => alsoLogFor.has(s.quote.id));
              const siblingsTotal = siblings.reduce((sum, s) => sum + s.quote.items.reduce((a, i) => a + i.total, 0), 0);
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-[3px] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-blue-700">
                        Also log for ({siblings.length} more {custName} quote{siblings.length > 1 ? 's' : ''})
                      </div>
                      <div className="font-mono text-[11px] font-bold text-blue-800 mt-0.5">
                        ₹{siblingsTotal.toLocaleString('en-IN')} open value
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAlsoLogFor(allChecked ? new Set() : new Set(siblings.map(s => s.quote.id)))}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      {allChecked ? 'None' : 'All'}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {siblings.map(sib => {
                      const value = sib.quote.items.reduce((a, i) => a + i.total, 0);
                      const checked = alsoLogFor.has(sib.quote.id);
                      const isExpanded = expandedSibling === sib.quote.id;
                      const lastLog = sib.followUp?.logs?.filter(l => !isQuoteSentLog(l.note)).slice(-1)[0];
                      return (
                        <div key={sib.quote.id} className={cn(
                          'rounded-[3px] border transition-colors overflow-hidden',
                          checked ? 'border-blue-300' : 'border-g200'
                        )}>
                          {/* Card header row */}
                          <div className={cn(
                            'flex items-center gap-2.5 px-2.5 py-2',
                            checked ? 'bg-blue-100' : 'bg-white'
                          )}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const next = new Set(alsoLogFor);
                                e.target.checked ? next.add(sib.quote.id) : next.delete(sib.quote.id);
                                setAlsoLogFor(next);
                              }}
                              className="accent-blue-600 w-3.5 h-3.5 shrink-0 cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] font-bold text-blue-700">{sib.quote.id}</span>
                                <span className={cn(
                                  'text-[9px] font-semibold px-1.5 py-0.5 rounded-[3px]',
                                  sib.priority === 'overdue' ? 'bg-red-100 text-red-700' :
                                  sib.priority === 'today' ? 'bg-amber-100 text-amber-700' :
                                  sib.priority === 'unscheduled' ? 'bg-orange-100 text-orange-700' :
                                  'bg-g100 text-g600'
                                )}>{sib.priority === 'unscheduled' ? 'No next step' : sib.priority}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[10.5px] font-bold text-blk">₹{value.toLocaleString('en-IN')}</span>
                                {sib.followUp?.stage && (
                                  <span className="text-[9px] text-g500 truncate">{sib.followUp.stage}</span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              title={isExpanded ? 'Collapse' : 'View detail'}
                              onClick={() => setExpandedSibling(isExpanded ? null : sib.quote.id)}
                              className="shrink-0 p-1 rounded hover:bg-blue-200 text-blue-500 hover:text-blue-800 transition-colors"
                            >
                              <ChevronRight size={13} className={cn('transition-transform duration-150', isExpanded && 'rotate-90')} />
                            </button>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="border-t border-blue-200 bg-white px-3 py-2.5 space-y-2">
                              {/* Line items */}
                              <div>
                                <div className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g400 mb-1">Items</div>
                                <div className="space-y-0.5">
                                  {sib.quote.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-[11px]">
                                      <span className="text-g700 truncate flex-1 pr-2">{item.desc}</span>
                                      <span className="font-mono font-bold text-blk shrink-0">₹{item.total.toLocaleString('en-IN')}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Next step */}
                              {sib.followUp?.next_date && (
                                <div className="flex items-center gap-1.5 text-[11px]">
                                  <Calendar size={10} className="text-amber-600 shrink-0" />
                                  <span className="font-bold text-amber-800">
                                    Next: {formatDue(sib.followUp.next_date, sib.followUp.next_time)}
                                    {sib.followUp.next_date < new Date().toISOString().slice(0, 10) ? ' ⚠' : ''}
                                  </span>
                                </div>
                              )}

                              {/* Last activity */}
                              {lastLog ? (
                                <div className="flex items-start gap-1.5 text-[11px] text-g500">
                                  <span className="shrink-0">{CHANNEL_CONFIG[lastLog.channel]?.icon ?? '📌'}</span>
                                  <div className="min-w-0">
                                    <span className="italic leading-snug">{lastLog.note.substring(0, 120)}{lastLog.note.length > 120 ? '…' : ''}</span>
                                    <div className="text-[9.5px] text-g400 mt-0.5">{fmtIST(parseISO(lastLog.ts), 'dd MMM · hh:mm aa')} · {lastLog.who}</div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[10.5px] text-g300 italic">No activity yet</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Follow-up Stage — explicit, no auto-advance */}
            <div className="space-y-1.5">
              <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500">Follow-up Stage</div>
              <select
                title="Which follow-up stage is this activity for?"
                className="w-full bg-cream border border-g200 rounded-[3px] px-3 py-2 text-[12.5px] outline-none focus:border-red-mrt focus:bg-white transition-colors"
                value={stageOverride || (selectedItem?.followUp?.stage ?? 'Sent Quotation')}
                onChange={e => setStageOverride(e.target.value)}
              >
                <option value="Sent Quotation">Sent Quotation</option>
                <option value="Offer Acknowledged">Offer Acknowledged</option>
                <option value="1st Follow-up">1st Follow-up</option>
                <option value="2nd Follow-up">2nd Follow-up</option>
                <option value="Negotiation">Negotiation</option>
              </select>
            </div>

            {/* Activity Done */}
            <div className="space-y-1.5">
              <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500">Activity Done</div>
              <div className="flex gap-2">
                <select
                  title="Activity channel"
                  className="flex-1 bg-cream border border-g200 rounded-[3px] px-3 py-2 text-[12.5px] outline-none focus:border-red-mrt focus:bg-white transition-colors"
                  value={channel}
                  onChange={e => setChannel(e.target.value as any)}
                >
                  <option>Called</option>
                  <option>WhatsApp</option>
                  <option>Email</option>
                  <option>Meeting</option>
                  <option>Visit</option>
                </select>
                <div className="flex-1 bg-cream border border-g200 rounded-[3px] px-3 py-2 text-[12px] text-g600 truncate flex items-center min-w-0">
                  {store.stampName()}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g500">What Happened?</div>
              <textarea
                ref={noteRef}
                required
                placeholder="What did the customer say? Any commitments made?"
                className="w-full bg-cream border border-g200 rounded-[3px] p-3 text-[12.5px] outline-none focus:border-red-mrt focus:bg-white resize-vertical transition-colors min-h-[140px]"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            {/* Next Follow-Up block */}
            <div className="bg-amber-50 border border-amber-200 rounded-[3px] p-3 space-y-2.5">
              <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-amber-700 flex items-center gap-1.5">
                <Calendar size={10} className="text-amber-600" />Next Follow-Up Planned
              </div>
              <select
                title="Next follow-up action"
                className="w-full bg-cream border border-g200 rounded-[3px] px-3 py-2 text-[12.5px] outline-none focus:border-red-mrt focus:bg-white transition-colors"
                value={nextAction}
                onChange={e => setNextAction(e.target.value as any)}
              >
                <option value="">— Action —</option>
                <option value="To Call">To Call</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Email">Email</option>
                <option value="Meeting">Meeting</option>
                <option value="Visit">Visit</option>
              </select>
              {/* Quick "remind in" chips — same-day reschedules for no-answer / out-of-coverage */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '+½ hr', hrs: 0.5 },
                  { label: '+1 hr', hrs: 1 },
                  { label: '+2 hrs', hrs: 2 },
                  { label: '+3 hrs', hrs: 3 },
                ].map(q => (
                  <button
                    key={q.label}
                    type="button"
                    title={`Remind ${q.label.toLowerCase()} from now`}
                    onClick={() => {
                      const t = q.hrs < 1
                        ? addMinutes(new Date(), Math.round(q.hrs * 60))
                        : addHours(new Date(), q.hrs);
                      setNextDate(format(t, 'yyyy-MM-dd'));
                      setNextTime(format(t, 'HH:mm'));
                      if (!nextAction) setNextAction('To Call');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-300 bg-white text-[11px] font-bold text-amber-800 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                  >
                    <Clock size={10} />{q.label}
                  </button>
                ))}
                <button
                  type="button"
                  title="Remind tomorrow morning"
                  onClick={() => {
                    setNextDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
                    setNextTime('09:30');
                    if (!nextAction) setNextAction('To Call');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-amber-300 bg-white text-[11px] font-bold text-amber-800 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                >
                  <Calendar size={10} />Tomorrow AM
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  title="Next follow-up date"
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="flex-1 bg-white border border-amber-300 rounded-[3px] px-3 py-1.5 text-[12px] font-bold text-slate-700 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-colors"
                  value={nextDate}
                  onChange={e => setNextDate(e.target.value)}
                />
                <input
                  type="time"
                  title="Next follow-up time"
                  className="w-[100px] bg-white border border-amber-300 rounded-[3px] px-3 py-1.5 text-[12px] font-bold text-slate-700 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-colors"
                  value={nextTime}
                  onChange={e => setNextTime(e.target.value)}
                />
              </div>
              {nextDate && (
                <textarea
                  value={nextNote}
                  onChange={e => setNextNote(e.target.value)}
                  placeholder="What to do on next follow-up? (optional)"
                  rows={2}
                  className="w-full bg-cream border border-g200 rounded-[3px] px-3 py-1.5 text-[11.5px] outline-none focus:border-red-mrt focus:bg-white resize-none transition-colors"
                />
              )}
              <span className="text-[10.5px] text-g400">No answer / out of coverage? Tap a chip to retry in a few hours — same day is allowed.</span>
            </div>

          </div>

          {/* Pinned footer: outcome buttons + PDF + submit */}
          <div className="shrink-0 px-5 py-4 border-t border-g150 space-y-2.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={e => handleMarkWon(selectedItem.quote.id, e)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase rounded-[3px] border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <Trophy size={11} /> Mark Won
              </button>
              <button
                type="button"
                onClick={e => handleMarkLost(selectedItem.quote.id, e)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase rounded-[3px] border border-red-mrt/30 text-red-mrt bg-red-lt hover:bg-red-mrt hover:text-white transition-colors"
              >
                <XCircle size={11} /> Mark Lost
              </button>
              <button
                type="button"
                onClick={handleClose}
                title="Close this quote without a win/loss outcome"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase rounded-[3px] border border-g300 text-g600 bg-white hover:bg-g50 transition-colors"
              >
                <CheckCircle2 size={11} /> Close
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleQuotePDF(selectedItem.quote)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10.5px] font-bold tracking-wider uppercase rounded-[3px] border border-g200 text-blk bg-white hover:bg-g50 transition-colors"
              >
                <FileText size={11} /> Quote PDF
              </button>
              {(() => {
                const hasOrder = !!data.orders.find(o => o.quoteRef === selectedItem.quote.id);
                return (
                  <button
                    type="button"
                    onClick={() => handlePIPDF(selectedItem.quote)}
                    disabled={!hasOrder}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10.5px] font-bold tracking-wider uppercase rounded-[3px] border border-g200 text-blk bg-white hover:bg-g50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Receipt size={11} /> PI PDF
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => openAttachmentModal('quote', selectedItem.quote.id)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10.5px] font-bold tracking-wider uppercase rounded-[3px] border border-g200 text-blk bg-white hover:bg-g50 transition-colors"
              >
                <Paperclip size={11} /> Docs
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-red-mrt text-white font-mono text-[10px] uppercase font-bold tracking-wider px-6 py-2.5 rounded-[3px] transition-colors hover:bg-red-h active:scale-95 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={13} />
              {alsoLogFor.size > 0 ? `Log for ${alsoLogFor.size + 1} Quotes` : 'Log Activity'}
            </button>
          </div>
        </form>
      )}
      </div>{/* /flex flex-1 overflow-hidden */}
    </div>
  );
}

// ── SuggestionStrip component ─────────────────────────────────────────────────
function SuggestionStrip({
  chips, nextDue, isOverdue, quoteId, onChip, onMarkWon, onMarkLost,
}: {
  chips: Suggestion[];
  nextDue: string | null;
  isOverdue: boolean;
  quoteId: string;
  onChip: (c: Suggestion) => void;
  onMarkWon: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMarkLost: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const countdown = useCountdown(nextDue);

  return (
    <div className={cn(
      'rounded-lg border px-3 pt-2.5 pb-2 mb-4',
      isOverdue ? 'bg-red-50 border-red-200' : 'bg-indigo-50/60 border-indigo-100',
    )}>
      {/* Merged header: Activity History label + countdown + chips */}
      <div className="flex items-center gap-2 mb-2">
        <History size={14} className="text-g400 shrink-0" />
        <span className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-g500 flex-1">Activity History</span>
        <Zap size={10} className={isOverdue ? 'text-red-mrt shrink-0' : 'text-amber-500 shrink-0'} />
        {countdown && (
          <span className={cn(
            'flex items-center gap-1 font-mono text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shrink-0 tracking-tight',
            isOverdue ? 'bg-red-100 text-red-700 animate-pulse border border-red-200' : 'bg-amber-100 text-amber-800 border border-amber-200',
          )}>
            <Timer size={10} />{countdown}
          </span>
        )}
        {!nextDue && (
          <span className="flex items-center gap-1 font-mono text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 animate-pulse shrink-0 border border-orange-200">
            <Timer size={10} />No next step
          </span>
        )}
      </div>

      {/* Chips row */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip, i) => {
          if (chip.variant === 'won') {
            return (
              <button key={i} type="button" onClick={onMarkWon}
                className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors', VARIANT_STYLE.won)}>
                <span>{VARIANT_ICON.won}</span>{chip.label}
              </button>
            );
          }
          if (chip.variant === 'lost') {
            return (
              <button key={i} type="button" onClick={onMarkLost}
                className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors', VARIANT_STYLE.lost)}>
                <span>{VARIANT_ICON.lost}</span>{chip.label}
              </button>
            );
          }
          if (chip.variant === 'park') {
            return (
              <button key={i} type="button"
                onClick={() => onChip({ ...chip, channel: 'Called', noteTemplate: `Parked ${quoteId} — revisit later. ` })}
                className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors', VARIANT_STYLE.park)}>
                <span>{VARIANT_ICON.park}</span>{chip.label}
              </button>
            );
          }
          return (
            <button key={i} type="button" onClick={() => onChip(chip)}
              className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-semibold transition-colors', VARIANT_STYLE[chip.variant])}>
              <span>{VARIANT_ICON[chip.variant]}</span>{chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface FUCalWeekGridProps {
  days: Date[];
  eventMap: Record<string, { quote: Quote; followUp: FollowUp | undefined }[]>;
  selectedQuoteId: string | null;
  onSelect: (id: string) => void;
  todayKey: string;
  weekLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

function FUCalWeekGrid({ days, eventMap, selectedQuoteId, onSelect, todayKey, weekLabel, onPrev, onNext, onToday }: FUCalWeekGridProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-g200 bg-white shrink-0">
        <button type="button" onClick={onPrev} title="Previous week" className="p-1 rounded hover:bg-g100 text-g500 hover:text-blk transition-colors">
          <ChevronLeft size={14} />
        </button>
        <div className="text-[11px] font-mono font-bold text-blk">{weekLabel}</div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onToday} className="text-[10px] font-bold text-red-mrt uppercase tracking-wide hover:underline px-2">
            Today
          </button>
          <button type="button" onClick={onNext} title="Next week" className="p-1 rounded hover:bg-g100 text-g500 hover:text-blk transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* 7-column grid */}
      <div className="grid grid-cols-7 flex-1 overflow-y-auto divide-x divide-g100 border-t border-g100">
        {days.map(day => {
          const key = dateKey(day);
          const items = eventMap[key] ?? [];
          const isTodayCol = key === todayKey;
          return (
            <div key={key} className={cn('flex flex-col min-h-[160px]', isTodayCol && 'bg-red-lt/20')}>
              {/* Day header */}
              <div className={cn(
                'px-1 py-1.5 text-center border-b border-g100 shrink-0',
                isTodayCol ? 'bg-red-mrt text-white' : 'bg-g50 text-blk'
              )}>
                <div className="text-[8px] font-bold uppercase tracking-wide opacity-70">{fmtIST(day, 'EEE')}</div>
                <div className="text-[15px] font-mono font-bold leading-none mt-0.5">{fmtIST(day, 'd')}</div>
                <div className="text-[8px] opacity-60">{fmtIST(day, 'MMM')}</div>
              </div>
              {/* Pills */}
              <div className="flex-1 p-1 space-y-1 overflow-y-auto">
                {items.map(({ quote, followUp }) => (
                  <button
                    key={quote.id}
                    type="button"
                    onClick={() => onSelect(quote.id)}
                    className={cn(
                      'w-full text-left px-1.5 py-1 rounded text-[10px] border leading-snug transition-colors',
                      'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
                      selectedQuoteId === quote.id && 'ring-1 ring-purple-500'
                    )}
                  >
                    <div className="font-bold truncate">{quote.cust}</div>
                    <div className="font-mono opacity-60 truncate text-[9px]">{quote.id}</div>
                    {followUp?.next_time && (
                      <div className="opacity-60 text-[9px] flex items-center gap-0.5 mt-0.5">
                        <Clock size={8} />{followUp.next_time}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
