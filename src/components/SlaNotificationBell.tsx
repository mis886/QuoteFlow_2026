import React, { useEffect, useRef, useState } from 'react';
import { Bell, AlertTriangle, Clock, ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isBefore, isToday, parseISO } from 'date-fns';
import { useAppStore } from '../store';
import { cn, fmtIST, siteLabel } from '../lib/utils';
import { Highlighter } from './ui/highlighter';

type AlertItem = {
  quoteId: string;
  cust: string;
  siteId?: string | null;
  owner: string;
  nextDate: string;
  nextTime?: string | null;
  priority: 'overdue' | 'today';
  daysOverdue: number;
};

const SLA_EMAIL = 'support@himalayaterpene.com';

export function SlaNotificationBell() {
  const { data, user } = useAppStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Only active for support@ account
  const isSupportAccount = user?.email === SLA_EMAIL;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const alerts: AlertItem[] = React.useMemo(() => {
    if (!isSupportAccount) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return data.quotes
      .filter(q => q.status !== 'Lost')
      .flatMap(q => {
        const fu = data.followups.find(f => f.quote_id === q.id);
        if (!fu || (fu.status ?? 'open') !== 'open' || !fu.next_date) return [];
        const d = parseISO(fu.next_date);
        let priority: 'overdue' | 'today' | null = null;
        if (isBefore(d, today)) priority = 'overdue';
        else if (isToday(d)) priority = 'today';
        if (!priority) return [];
        const daysOverdue = priority === 'overdue'
          ? Math.round((today.getTime() - d.getTime()) / 86400000)
          : 0;
        return [{
          quoteId: q.id,
          cust: q.cust,
          siteId: q.siteId,
          owner: fu.owner || 'Unassigned',
          nextDate: fu.next_date,
          nextTime: fu.next_time,
          priority,
          daysOverdue,
        } satisfies AlertItem];
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === 'overdue' ? -1 : 1;
        return b.daysOverdue - a.daysOverdue;
      });
  }, [data.quotes, data.followups, isSupportAccount]);

  const overdueCount = alerts.filter(a => a.priority === 'overdue').length;
  const todayCount = alerts.filter(a => a.priority === 'today').length;
  const total = alerts.length;

  if (!isSupportAccount) {
    // Render the original static bell for other users
    return (
      <button
        type="button"
        title="Notifications"
        className="w-[30px] h-[30px] rounded-[5px] border border-g200 bg-transparent flex items-center justify-center cursor-pointer transition-colors hover:bg-g100 relative"
      >
        <Bell size={14} className="text-g500" />
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={`${total} SLA alerts`}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-[30px] h-[30px] rounded-[5px] border flex items-center justify-center cursor-pointer transition-colors relative",
          open ? "bg-red-lt border-red-mrt/30" : "border-g200 bg-transparent hover:bg-g100"
        )}
      >
        <Bell size={14} className={total > 0 ? "text-red-mrt" : "text-g500"} />
        {total > 0 && (
          <span className="absolute -top-[4px] -right-[4px] min-w-[16px] h-[16px] px-[3px] rounded-full bg-red-mrt border-2 border-white flex items-center justify-center font-mono text-[9px] font-bold text-white leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-[380px] bg-white border border-g200 rounded-[6px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] z-[200] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-g150 bg-g50">
            <div>
              <div className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-g500">SLA Alerts</div>
              <div className="flex items-center gap-3 mt-0.5">
                {overdueCount > 0 && (
                  <span className="text-[11px] font-bold text-red-mrt flex items-center gap-1">
                    <AlertTriangle size={10} />
                    <Highlighter action="highlight" color="#ef4444">
                      {overdueCount} overdue
                    </Highlighter>
                  </span>
                )}
                {todayCount > 0 && (
                  <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                    <Clock size={10} />
                    <Highlighter action="highlight" color="#f59e0b">
                      {todayCount} due today
                    </Highlighter>
                  </span>
                )}
                {total === 0 && (
                  <span className="text-[11px] text-g500">All follow-ups on track</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-g400 hover:text-blk transition-colors p-1 rounded hover:bg-g100"
            >
              <X size={13} />
            </button>
          </div>

          {/* Alert list */}
          {total === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <Bell size={16} className="text-emerald-600" />
              </div>
              <div className="text-[12px] font-semibold text-g600">All clear</div>
              <div className="text-[11px] text-g400 mt-0.5">No overdue or due-today follow-ups</div>
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto divide-y divide-g100">
              {alerts.map(a => (
                <button
                  key={a.quoteId}
                  type="button"
                  onClick={() => { navigate('/followups'); setOpen(false); }}
                  className="w-full text-left px-4 py-3 hover:bg-g50 transition-colors flex items-start gap-3"
                >
                  {/* Priority indicator */}
                  <div className={cn(
                    "w-7 h-7 rounded-[3px] flex items-center justify-center shrink-0 mt-0.5",
                    a.priority === 'overdue' ? "bg-red-lt" : "bg-amber-50"
                  )}>
                    {a.priority === 'overdue'
                      ? <AlertTriangle size={13} className="text-red-mrt" />
                      : <Clock size={13} className="text-amber-600" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[10px] font-bold text-red-mrt">{a.quoteId}</span>
                      <span className={cn(
                        "font-mono text-[8.5px] font-bold tracking-[1px] uppercase px-1.5 py-0.5 rounded-[2px]",
                        a.priority === 'overdue'
                          ? "bg-red-lt text-red-mrt"
                          : "bg-amber-50 text-amber-700"
                      )}>
                        {a.priority === 'overdue'
                          ? a.daysOverdue === 1 ? '1d overdue' : `${a.daysOverdue}d overdue`
                          : 'Due today'}
                      </span>
                    </div>
                    <div className="text-[12px] font-semibold text-blk truncate">
                      <Highlighter action="underline" color={a.priority === 'overdue' ? '#ef4444' : '#f59e0b'}>
                        {a.cust}
                      </Highlighter>
                      {(() => { const sl = siteLabel(data.customers.find(c => c.name === a.cust), a.siteId); return sl ? <span className="font-normal text-g400"> — {sl}</span> : null; })()}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-g500">
                        {a.priority === 'overdue' ? (
                          <>Was due <Highlighter action="highlight" color="#ef4444" className="text-[10px] font-bold text-red-mrt">{fmtIST(parseISO(a.nextDate), 'dd MMM')}</Highlighter></>
                        ) : (
                          <>Due <Highlighter action="highlight" color="#f59e0b" className="text-[10px] font-bold text-amber-700">today{a.nextTime ? ` at ${a.nextTime}` : ''}</Highlighter></>
                        )}
                      </span>
                      <span className="text-g300">·</span>
                      <span className="text-[10px] text-g500">{a.owner}</span>
                    </div>
                  </div>

                  <ChevronRight size={12} className="text-g300 shrink-0 mt-2" />
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          {total > 0 && (
            <div className="border-t border-g150 px-4 py-2.5">
              <button
                type="button"
                onClick={() => { navigate('/followups'); setOpen(false); }}
                className="w-full text-center text-[11px] font-bold text-red-mrt hover:underline"
              >
                Open Follow-Up Command Centre →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
