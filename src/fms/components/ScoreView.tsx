import { Link } from 'react-router-dom';
import { fmtDateTime, fmtWeekRange, SOURCE_LABEL } from '../lib/format';
import { fmtWorking } from '../lib/format';
import { misBand, formatMis } from '../lib/scoring';
import type { ScoredTask, WeekPoint } from '../lib/types';
import type { AppSettings } from '../lib/types';
import { Empty, Kpi, MisKpi, ScoreBars } from './Ui';

const BUCKET_ORDER = { not_done: 0, late: 1, on_time: 2 } as const;

export function ScoreView({ history, settings, tasks, weekOffset, basePath }: { history: WeekPoint[]; settings: AppSettings; tasks: ScoredTask[]; weekOffset: number; basePath: string }) {
  const bandOf = (s: Parameters<typeof misBand>[0]) => misBand(s, settings.misGreenLimit, settings.misAmberLimit);
  const sel = history[history.length - 1 - weekOffset];
  const s = sel.score;
  const sorted = [...tasks].sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || a.dueAt! - b.dueAt!);
  const link = (w: number) => (w === 0 ? basePath : `${basePath}?w=${w}`);
  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="Choose a week">
        {history
          .map((p, i) => ({ p, w: history.length - 1 - i }))
          .reverse()
          .map(({ p, w }) => (
            <Link key={w} to={link(w)} aria-current={w === weekOffset ? 'page' : undefined}>
              {w === 0 ? 'This week' : w === 1 ? 'Last week' : fmtWeekRange(p.weekStart, p.weekEnd)}
            </Link>
          ))}
      </div>

      <div className="kpis">
        <MisKpi label={`MIS · ${fmtWeekRange(sel.weekStart, sel.weekEnd)}`} score={s} band={bandOf(s)} sub={s.noData ? 'No tasks were due' : `${s.planned} task${s.planned === 1 ? '' : 's'} counted`} />
        <Kpi label="Work not done (WND)" value={s.noData ? '–' : `${s.wndPct}%`} sub={`${s.notDone} not done past due`} tone={s.notDone ? 'bad' : undefined} />
        <Kpi label="Not done on time (WNDOT)" value={s.noData ? '–' : `${s.wndotPct}%`} sub={`${s.doneLate} finished late`} tone={s.doneLate ? 'warn' : undefined} />
        <Kpi label="Done on time" value={s.noData ? '–' : `${s.onTimePct}%`} sub={`${s.doneOnTime} of ${s.planned}`} tone={!s.noData && s.onTimePct === 100 ? 'ok' : undefined} />
      </div>

      <div className="grid-main">
        <div className="card">
          <div className="card-h">
            <h2>Tasks counted this week</h2>
            <span className="small muted">Due {fmtWeekRange(sel.weekStart, sel.weekEnd)}</span>
          </div>
          {sorted.length === 0 ? (
            <Empty icon="calendar" title="Nothing was due this week">Tasks appear here once their due time has passed or they are completed.</Empty>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Due</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t) => (
                    <tr key={t.id} className={t.bucket === 'not_done' ? 'row-bad' : t.bucket === 'late' ? 'row-warn' : ''}>
                      <td>
                        <Link className="cell-title" to={`/fms/tasks/${t.id}`} style={{ color: 'var(--ink)' }}>{t.title}</Link>
                        <div className="cell-sub">
                          {SOURCE_LABEL[t.source]}
                          {t.instanceRef ? ` · ${t.workflowName} · ${t.instanceRef}` : ''}
                        </div>
                      </td>
                      <td className="nowrap">{fmtDateTime(t.dueAt)}</td>
                      <td>
                        {t.bucket === 'on_time' && <span className="badge ok">On time</span>}
                        {t.bucket === 'late' && (
                          <>
                            <span className="badge warn">Done late</span>
                            <div className="cell-sub">by {fmtWorking(t.lateMinutes, settings.work) || 'a moment'} · done {fmtDateTime(t.completedAt)}</div>
                          </>
                        )}
                        {t.bucket === 'not_done' && (
                          <>
                            <span className="badge bad">Not done</span>
                            <div className="cell-sub">{fmtWorking(t.lateMinutes, settings.work) || 'Just'} past due</div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-h">
              <h2>Last 8 weeks</h2>
            </div>
            <div className="card-b">
              <ScoreBars points={history} bandOf={bandOf} />
              <p className="small muted" style={{ marginTop: 10 }}>Shorter bars are better. Green is within {settings.misGreenLimit}% lost, amber within {settings.misAmberLimit}%.</p>
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <h2>How the score works</h2>
            </div>
            <div className="card-b small stack-sm" style={{ color: 'var(--ink-2)' }}>
              <p><b>MIS = −(WND% + WNDOT%)</b>, so 0% is perfect.</p>
              <p><b>WND</b>: tasks whose due time passed and are still not done.</p>
              <p><b>WNDOT</b>: tasks finished after their due time.</p>
              <p>Both count equally. A task is in one bucket only. Tasks not yet due, upcoming workflow steps and personal to-dos are not counted. A step is not held against you until it has been released to you.</p>
              <p className="muted">Current selection: {formatMis(s)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
