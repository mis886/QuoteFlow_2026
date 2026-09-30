import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Pause } from 'lucide-react';
import { fmtIST } from '../lib/utils';
import {
  DISPATCH_STEPS, DISPATCH_DOER_NAME, BoardCard, ColumnNo, StepDef, fmtDuration, TimeState,
} from '../lib/dispatchFlow';

// Kanban "Board view" of the Dispatch module: a step strip + one 268px column
// per step (1–10, Done). Cards are built by buildBoard() in dispatchFlow.ts;
// this file only draws them. Red buttons open the existing Dispatch screens
// (NewDispatchEntry.tsx) — they never change anything by themselves.

const fmtClock = (iso: string, now: number) => {
  const d = new Date(iso);
  const sameDay = fmtIST(d, 'yyyy-MM-dd') === fmtIST(new Date(now), 'yyyy-MM-dd');
  const time = fmtIST(d, 'hh:mm a').replace(/^0/, '');
  return sameDay ? time : `${fmtIST(d, 'dd MMM')}, ${time}`;
};

const TIME_BAR_CLS: Record<TimeState, string> = {
  on_time: 'bg-[#E8F5E9] text-[#0B5C2A]',
  due_soon: 'bg-[#FFF3E0] text-[#8A4500]',
  late: 'bg-[#FFEBEE] text-[#9A0000]',
  hold: 'bg-[#EFEDEA] text-[#333]',
  done: 'bg-[#E8F5E9] text-[#0B5C2A]',
  none: 'bg-g100 text-g500',
};
const TIME_DOT_CLS: Partial<Record<TimeState, string>> = {
  on_time: 'bg-[#107E3E]',
  due_soon: 'bg-[#E9730C]',
  late: 'bg-[#BB0000]',
  done: 'bg-[#107E3E]',
};

export function TimeBar({ card, now }: { card: BoardCard; now: number }) {
  const state = card.state;
  const plannedAt = card.position.plannedAt;
  let text: string;
  if (state === 'hold' && card.kind === 'order') text = `On hold · ${card.position.hold?.reason || ''}`;
  else if (state === 'done' && card.kind === 'entry') text = `Email sent ${card.entry.emailSentAt ? fmtClock(card.entry.emailSentAt, now) : ''}`;
  else if (!plannedAt) text = 'No start time';
  else if (state === 'late') text = `Late by ${fmtDuration(now - new Date(plannedAt).getTime())}`;
  else if (state === 'due_soon') text = `Due in ${fmtDuration(new Date(plannedAt).getTime() - now)}`;
  else text = `Due ${fmtClock(plannedAt, now)}`;
  return (
    <div className={`flex items-center gap-1.5 rounded-[4px] px-2 py-[4px] text-[11px] font-medium ${TIME_BAR_CLS[state]}`}>
      {state === 'hold'
        ? <Pause size={10} className="shrink-0" />
        : <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${TIME_DOT_CLS[state] || 'bg-g400'}`} />}
      <span className="truncate">{text}</span>
    </div>
  );
}

export const TypeDot = ({ type }: { type: string }) => type === 'self_pickup'
  ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-[7px] h-[7px] rounded-full bg-[#7C3AED]" />Self Pickup</span>
  : type === 'delivery'
    ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-[7px] h-[7px] rounded-full bg-[#2563EB]" />Delivery</span>
    : <span className="text-g400 whitespace-nowrap">Not set</span>;

export const AutoTag = () => (
  <span className="font-mono text-[8.5px] font-bold tracking-[1px] uppercase bg-[#E8F0FD] text-[#1D4ED8] rounded-[3px] px-[5px] py-[1px]">Auto</span>
);

const RedButton = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    className="w-full bg-red-mrt hover:bg-red-h text-white text-[11.5px] font-semibold rounded-[4px] px-2.5 py-[6px] transition-colors">
    {children}
  </button>
);

const itemSummary = (lines: { desc: string; qty: number }[]) => {
  if (!lines.length) return '—';
  const first = `${(lines[0].desc || 'Item').trim()} × ${lines[0].qty}`;
  return lines.length > 1 ? `${first} +${lines.length - 1} more` : first;
};

const stepLabel = (no: ColumnNo) => no === 11 ? 'DONE' : `STEP ${String(no).padStart(2, '0')}`;

function Card({ card, now, onOpen, renderActions }: {
  card: BoardCard; now: number;
  onOpen?: (card: BoardCard) => void;
  renderActions?: (card: BoardCard) => React.ReactNode;
}) {
  const navigate = useNavigate();
  const order = card.order;
  const soNumber = order?.soNumber;
  const orderId = card.kind === 'order' ? card.order.id : card.entry.orderId;
  const lines = card.kind === 'order'
    ? card.remaining
    : (card.entry.items || []).filter(i => Number(i.qty) > 0).map(i => ({ desc: i.desc, qty: Number(i.qty) }));

  return (
    <div className="bg-white border border-[#E2DFDA] rounded-[6px] p-[10px_11px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col gap-[6px]">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onOpen?.(card)} disabled={!onOpen}
          className="font-mono text-[11.5px] font-bold text-red-mrt hover:underline disabled:no-underline disabled:cursor-default text-left truncate">
          {soNumber || '—'}
        </button>
        <span className="font-mono text-[10px] text-g500 shrink-0">{orderId}</span>
      </div>
      <div className="text-[13.5px] font-semibold text-blk leading-tight truncate" title={order?.cust}>{order?.cust || '—'}</div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-g600">
        <span className="truncate" title={lines.map(l => `${l.desc} × ${l.qty}`).join(', ')}>{itemSummary(lines)}</span>
        <span className="text-[11px] text-g700 shrink-0"><TypeDot type={card.fulfillment} /></span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="bg-g100 text-g700 text-[10.5px] rounded-[3px] px-2 py-[1px] truncate">{order?.pay || 'No terms'}</span>
        {card.kind === 'order' ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-g700 shrink-0">
            <span className="w-[18px] h-[18px] rounded-full bg-blk text-white text-[9.5px] font-bold inline-flex items-center justify-center">{DISPATCH_DOER_NAME[0]}</span>
            {DISPATCH_DOER_NAME}
          </span>
        ) : (
          <span className="font-mono text-[10px] font-bold bg-[#F3EEFF] text-[#5B21B6] rounded-[3px] px-1.5 py-[1px] shrink-0 truncate max-w-[130px]">
            INV {card.entry.invoiceNumber || '—'}
          </span>
        )}
      </div>
      <TimeBar card={card} now={now} />
      {card.kind === 'order' && card.position.skipped.length > 0 && (
        <div className="text-[10.5px] text-g500">Skipped: step {card.position.skipped.join(', ')}</div>
      )}
      {card.kind === 'entry' && card.position.invoiceMissing && (
        <div className="text-[11px] font-semibold text-[#9A0000]">Invoice no. missing</div>
      )}
      {renderActions?.(card)}
      {card.kind === 'order' && card.column === 8 && (
        <RedButton onClick={() => navigate(`/dispatch/new?orderRef=${card.order.id}&toSent=1`)}>Create Dispatch Entry →</RedButton>
      )}
      {card.kind === 'entry' && card.column === 8 && (
        <RedButton onClick={() => navigate(`/dispatch/new?entryId=${card.entry.id}`)}>Open entry →</RedButton>
      )}
      {card.kind === 'entry' && card.column === 9 && (
        <RedButton onClick={() => navigate(`/dispatch/new?entryId=${card.entry.id}`)}>Upload LR →</RedButton>
      )}
      {card.kind === 'entry' && card.column === 10 && (
        <RedButton onClick={() => navigate(`/dispatch/new?entryId=${card.entry.id}`)}>Email to Client →</RedButton>
      )}
    </div>
  );
}

function ColumnHeader({ step, count }: { step: StepDef; count: number }) {
  return (
    <div className="p-[10px_11px_9px] border-b border-g200 flex flex-col gap-[3px]">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] font-bold tracking-[1.5px] text-red-mrt shrink-0">{stepLabel(step.no)}</span>
        <span className="text-[13px] font-bold text-blk truncate">{step.title}</span>
        <span className="ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-white border border-g200 text-[11px] font-bold text-g700 inline-flex items-center justify-center shrink-0">{count}</span>
      </div>
      <div className="text-[11px] text-g500">{step.subtitle}</div>
      {step.how && (
        <div className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.5px] text-g500">
          <span className="truncate">{step.how}</span>
          <span>·</span>
          <Clock size={10} className="shrink-0" />
          <span className="shrink-0">{step.tatHours}h</span>
          {step.auto && <span className="ml-auto shrink-0"><AutoTag /></span>}
        </div>
      )}
      {step.rule && <div className="text-[10.5px] text-[#5B21B6] leading-snug">{step.rule}</div>}
      {step.autoRule && <div className="text-[10.5px] text-[#1D4ED8] leading-snug">{step.autoRule}</div>}
    </div>
  );
}

export function DispatchBoard({ cards, now, onOpen, renderActions }: {
  cards: BoardCard[];
  now: number;
  onOpen?: (card: BoardCard) => void;
  renderActions?: (card: BoardCard) => React.ReactNode;
}) {
  const byColumn = new Map<ColumnNo, BoardCard[]>();
  for (const c of cards) {
    const list = byColumn.get(c.column) || [];
    list.push(c);
    byColumn.set(c.column, list);
  }
  // Most urgent first: latest-planned last; Done newest email first.
  for (const [col, list] of byColumn) {
    list.sort((a, b) => col === 11
      ? ((b.kind === 'entry' && b.entry.emailSentAt) || '').localeCompare((a.kind === 'entry' && a.entry.emailSentAt) || '')
      : (a.position.plannedAt || '').localeCompare(b.position.plannedAt || ''));
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col px-6 pb-5 pt-[14px] gap-3">
      {/* Step strip */}
      <div className="grid grid-cols-11 gap-[6px] shrink-0">
        {DISPATCH_STEPS.map(step => {
          const list = byColumn.get(step.no) || [];
          const delayed = list.filter(c => c.state === 'late').length;
          return (
            <div key={step.no} className="bg-white border border-g200 rounded-[6px] p-[7px_8px] min-w-0">
              <div className="flex items-start justify-between gap-1">
                <span className="font-mono text-[8.5px] font-bold tracking-[1px] text-red-mrt">{stepLabel(step.no)}</span>
                <span className="text-[15px] font-bold text-blk leading-none">{list.length}</span>
              </div>
              <div className="text-[11px] text-g700 truncate mt-[3px]" title={step.title}>{step.title}</div>
              <div className={`text-[10px] mt-[1px] ${delayed ? 'text-[#9A0000] font-semibold' : 'text-g400'}`}>{delayed ? `${delayed} delayed` : '—'}</div>
            </div>
          );
        })}
      </div>

      {/* Columns */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 h-full w-max">
          {DISPATCH_STEPS.map(step => {
            const list = byColumn.get(step.no) || [];
            return (
              <div key={step.no} className="w-[268px] shrink-0 h-full flex flex-col bg-g100 border border-g200 rounded-[6px] min-h-0">
                <ColumnHeader step={step} count={list.length} />
                <div className="flex-1 min-h-0 overflow-y-auto p-[8px] flex flex-col gap-[8px]">
                  {list.length === 0 ? (
                    <div className="border border-dashed border-g300 rounded-[6px] text-center text-[11.5px] text-g400 py-6">No orders at this step</div>
                  ) : list.map(card => (
                    <Card key={card.key} card={card} now={now} onOpen={onOpen} renderActions={renderActions} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
