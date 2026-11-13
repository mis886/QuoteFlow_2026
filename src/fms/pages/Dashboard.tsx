import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { TaskRowView } from '../components/TaskRow';
import { Empty, Kpi, MisKpi, PageHead, PageLoad, ScoreBars } from '../components/Ui';
import { useFmsMe } from '../components/FmsLayout';
import { useFmsPage } from '../lib/api';
import { fmtDateTime, fmtWeekRange, fmtWorking } from '../lib/format';
import { istDateString } from '../lib/engine';
import { formatMis, misBand } from '../lib/scoring';
import type { Dashboard, ScoredTask } from '../lib/types';

const TABS = [
  { id: 'open', label: 'To do' },
  { id: 'upcoming', label: 'Coming up' },
  { id: 'done', label: 'Done' },
] as const;

const WEEK = 7 * 86_400_000;

export function DashboardPage() {
  const { user } = useFmsMe();
  const [sp] = useSearchParams();
  const { data: d, error, reload } = useFmsPage<Dashboard & { scored: ScoredTask[] }>('page.dashboard');
  if (!d) return <PageLoad error={error} onRetry={reload} />;
  const now = Date.now();
  const work = d.settings.work;
  const bandOf = (s: Parameters<typeof misBand>[0]) => misBand(s, d.settings.misGreenLimit, d.settings.misAmberLimit);
  const wk = { from: d.history[d.history.length - 1].weekStart, to: d.history[d.history.length - 1].weekStart + WEEK };
  const moved = d.scored.filter((t) => t.bucket !== 'on_time');

  const tabParam = sp.get('tab') ?? '';
  const tab = TABS.some((t) => t.id === tabParam) ? (tabParam as (typeof TABS)[number]['id']) : 'open';
  const todo = d.tasks.filter((t) => t.status === 'open');
  const upcoming = d.tasks.filter((t) => t.status === 'waiting');
  const done = d.tasks.filter((t) => t.status === 'done').sort((a, b) => b.completedAt! - a.completedAt!);
  const shown = tab === 'open' ? todo : tab === 'upcoming' ? upcoming : done;
  const counts = { open: todo.length, upcoming: upcoming.length, done: done.length };
  const today = istDateString(now);
  const hour = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(now));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHead
        title={`${greet}, ${user.name.split(' ')[0]}`}
        sub={d.counts.overdue ? `${d.counts.overdue} task${d.counts.overdue === 1 ? ' is' : 's are'} overdue. Clear those first.` : d.counts.dueToday ? `${d.counts.dueToday} due today.` : 'You are all caught up.'}
        actions={
          <Link to="/fms/tasks/new" className="btn">
            <Icon name="plus" size={16} /> New task
          </Link>
        }
      />

      <div className="stack">
        <div className="kpis">
          <Kpi label="Overdue" value={d.counts.overdue} sub="Past due, not done" tone={d.counts.overdue ? 'bad' : 'ok'} />
          <Kpi label="Due today" value={d.counts.dueToday} sub="Still to finish today" tone={d.counts.dueToday ? 'warn' : undefined} />
          <Kpi label="Coming up" value={d.counts.upcoming + d.counts.waiting} sub={`${d.counts.waiting} workflow step${d.counts.waiting === 1 ? '' : 's'} waiting`} />
          <MisKpi label="MIS this week" score={d.week} band={bandOf(d.week)} sub={d.week.noData ? 'No tasks due yet' : `WND ${d.week.wndPct}% · WNDOT ${d.week.wndotPct}%`} />
          <MisKpi label="MIS last week" score={d.lastWeek} band={bandOf(d.lastWeek)} sub={d.lastWeek.noData ? 'No tasks were due' : `${d.lastWeek.planned} tasks counted`} />
        </div>

        <div className="grid-main">
          <div className="card">
            <div className="card-h" style={{ paddingBottom: 0, borderBottom: 0 }}>
              <h2>My tasks</h2>
            </div>
            <div className="tabs" style={{ padding: '0 18px', marginTop: 8, marginBottom: 0 }}>
              {TABS.map((t) => (
                <Link key={t.id} to={t.id === 'open' ? '/fms' : `/fms?tab=${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
                  {t.label}
                  <span className="n">{counts[t.id]}</span>
                </Link>
              ))}
            </div>
            {shown.length === 0 ? (
              <Empty icon={tab === 'done' ? 'inbox' : 'check'} title={tab === 'open' ? 'Nothing to do right now' : tab === 'upcoming' ? 'No upcoming workflow steps' : 'Nothing finished in the last 14 days'}>
                {tab === 'open' ? 'New workflow steps and assigned tasks will appear here as soon as they are released to you.' : tab === 'upcoming' ? 'Steps that are waiting on someone else show up here.' : 'Tasks you complete will be listed here.'}
              </Empty>
            ) : (
              <div>
                {shown.map((t) => (
                  <TaskRowView key={t.id} t={t} now={now} work={work} todayYmd={today} />
                ))}
              </div>
            )}
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-h">
                <h2>Weekly MIS</h2>
                <Link to="/fms/score" className="small">Details</Link>
              </div>
              <div className="card-b">
                <ScoreBars points={d.history} bandOf={bandOf} />
              </div>
            </div>
            <div className="card">
              <div className="card-h">
                <h2>What is costing me this week</h2>
              </div>
              {moved.length === 0 ? (
                <div className="card-b small muted">Nothing so far. Every task due this week has been done on time.</div>
              ) : (
                <div className="card-b flush">
                  {moved.slice(0, 6).map((t) => (
                    <div key={t.id} style={{ padding: '10px 18px', borderTop: '1px solid var(--line)' }}>
                      <Link to={`/fms/tasks/${t.id}`} className="cell-title" style={{ color: 'var(--ink)' }}>{t.title}</Link>
                      <div className="cell-sub">
                        {t.bucket === 'not_done' ? `Not done · ${fmtWorking(t.lateMinutes, work) || 'just'} past due` : `Done late by ${fmtWorking(t.lateMinutes, work) || 'a moment'}`} · due {fmtDateTime(t.dueAt)}
                      </div>
                    </div>
                  ))}
                  {moved.length > 6 && (
                    <div className="card-f small">
                      <Link to="/fms/score">See all {moved.length}</Link>
                    </div>
                  )}
                </div>
              )}
              <div className="card-f small muted">{fmtWeekRange(wk.from, wk.to)} · {formatMis(d.week)} so far</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
