import { Link } from 'react-router-dom';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Reassign } from '../components/Reassign';
import { Empty, Kpi, PageHead, PageLoad } from '../components/Ui';
import { useFmsMe } from '../components/FmsLayout';
import { useFmsPage } from '../lib/api';
import { fmtDateTime, fmtWorking, SOURCE_LABEL } from '../lib/format';
import type { CoordinatorBoard, Person, TaskRow, WorkflowSummary } from '../lib/types';

const VIEWS = ['overdue', 'blocked', 'late'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Where({ t }: { t: TaskRow }) {
  return t.instanceId ? (
    <>
      <Link to={`/fms/runs/${t.instanceId}`}>{t.workflowName} · {t.instanceRef}</Link>
      <div className="cell-sub">Step {t.seq} of {t.totalSteps}</div>
    </>
  ) : (
    <span className="muted">{SOURCE_LABEL[t.source]}</span>
  );
}

export function CoordinatorPage() {
  const me = useFmsMe();
  const [sp, setSp] = useSearchParams();
  const view = (VIEWS as readonly string[]).includes(sp.get('view') ?? '') ? (sp.get('view') as (typeof VIEWS)[number]) : 'overdue';
  const wfParam = sp.get('workflow') ?? '';
  const ownerParam = sp.get('owner') ?? '';
  const workflowId = UUID.test(wfParam) ? wfParam : undefined;
  const ownerId = UUID.test(ownerParam) ? ownerParam : undefined;
  const days = [7, 30, 90].includes(Number(sp.get('days'))) ? Number(sp.get('days')) : 7;
  const { data, error, reload } = useFmsPage<{ board: CoordinatorBoard; workflows: WorkflowSummary[]; people: Person[] }>('page.coordinator', { workflowId, ownerId, days });
  if (!me.canSeeBoard) return <Navigate to="/fms" replace />;
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { board, workflows, people } = data;
  const work = board.settings.work;
  const qs = (v: string) => {
    const p = new URLSearchParams();
    p.set('view', v);
    if (workflowId) p.set('workflow', workflowId);
    if (ownerId) p.set('owner', ownerId);
    if (days !== 7) p.set('days', String(days));
    return `/fms/coordinator?${p.toString()}`;
  };
  const isFiltered = Boolean(workflowId || ownerId);

  return (
    <>
      <PageHead title="Coordinator board" sub="Every late and delayed task across all workflows, assigned work and recurring tasks. Personal to-dos never appear here." />
      <div className="stack">
        <div className="kpis">
          <Kpi label="Overdue now" value={board.overdue.length} sub="Open and past due" tone={board.overdue.length ? 'bad' : 'ok'} />
          <Kpi label="Delayed downstream" value={board.blocked.length} sub="Waiting behind an overdue step" tone={board.blocked.length ? 'warn' : undefined} />
          <Kpi label={`Finished late (${days}d)`} value={board.lateDone.length} sub="Completed after due time" />
          <Kpi label="Runs in progress" value={board.runningRuns} sub="Across all workflows" />
        </div>

        <form
          className="card"
          key={`${workflowId ?? ''}|${ownerId ?? ''}|${days}`}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const p = new URLSearchParams();
            p.set('view', view);
            for (const k of ['workflow', 'owner', 'days']) {
              const v = String(fd.get(k) ?? '');
              if (v && !(k === 'days' && v === '7')) p.set(k, v);
            }
            setSp(p);
          }}
        >
          <div className="card-b filters">
            <div className="field">
              <label htmlFor="f-workflow">Workflow</label>
              <select id="f-workflow" name="workflow" className="select" defaultValue={workflowId ?? ''}>
                <option value="">All workflows</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}{w.status === 'archived' ? ' (archived)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-owner">Owner</label>
              <select id="f-owner" name="owner" className="select" defaultValue={ownerId ?? ''}>
                <option value="">Everyone</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-days">Finished late in the last</label>
              <select id="f-days" name="days" className="select" defaultValue={String(days)}>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </div>
            <button className="btn primary" type="submit">Apply</button>
            {isFiltered && <Link className="btn ghost" to="/fms/coordinator">Clear filters</Link>}
          </div>
        </form>

        {board.truncated && <div className="alert warn">Showing the first 300 rows of a list. Use the filters to narrow it down.</div>}

        <div className="grid-main">
          <div>
            <div className="tabs">
              <Link to={qs('overdue')} aria-current={view === 'overdue' ? 'page' : undefined}>Overdue<span className="n">{board.overdue.length}</span></Link>
              <Link to={qs('blocked')} aria-current={view === 'blocked' ? 'page' : undefined}>Delayed downstream<span className="n">{board.blocked.length}</span></Link>
              <Link to={qs('late')} aria-current={view === 'late' ? 'page' : undefined}>Finished late<span className="n">{board.lateDone.length}</span></Link>
            </div>
            <div className="card">
              {view === 'overdue' &&
                (board.overdue.length === 0 ? (
                  <Empty icon="check" title="Nothing is overdue">{isFiltered ? 'No overdue tasks match these filters.' : 'Every open task is within its time.'}</Empty>
                ) : (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Task</th><th>Where</th><th>Owner</th><th>Due</th><th>Late by</th><th /></tr></thead>
                      <tbody>
                        {board.overdue.map((t) => (
                          <tr key={t.id} className="row-bad">
                            <td>
                              <Link className="cell-title" to={`/fms/tasks/${t.id}`} style={{ color: 'var(--ink)' }}>{t.title}</Link>
                              {t.downstreamWaiting > 0 && <div className="cell-sub"><span className="badge warn">{t.downstreamWaiting} step{t.downstreamWaiting === 1 ? '' : 's'} waiting behind it</span></div>}
                            </td>
                            <td><Where t={t} /></td>
                            <td>{t.ownerName}</td>
                            <td className="nowrap">{fmtDateTime(t.dueAt)}</td>
                            <td className="nowrap"><b style={{ color: 'var(--bad)' }}>{fmtWorking(t.lateMinutes, work) || '< 1m'}</b></td>
                            <td className="right"><Reassign taskId={t.id} currentOwnerId={t.ownerId} people={people} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              {view === 'blocked' &&
                (board.blocked.length === 0 ? (
                  <Empty icon="check" title="No delayed downstream steps">No step is waiting behind an overdue step.</Empty>
                ) : (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Waiting step</th><th>Where</th><th>Owner</th><th>Held up by</th></tr></thead>
                      <tbody>
                        {board.blocked.map((t) => (
                          <tr key={t.id} className="row-warn">
                            <td><Link className="cell-title" to={`/fms/tasks/${t.id}`} style={{ color: 'var(--ink)' }}>{t.title}</Link></td>
                            <td><Where t={t} /></td>
                            <td>{t.ownerName}</td>
                            <td>
                              <div>{t.blockerTitle}</div>
                              <div className="cell-sub">{t.blockerOwner} · <b style={{ color: 'var(--bad)' }}>{fmtWorking(t.blockerLateMinutes, work) || '< 1m'} late</b></div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              {view === 'late' &&
                (board.lateDone.length === 0 ? (
                  <Empty icon="check" title="Nothing finished late">No task in this period was completed after its due time.</Empty>
                ) : (
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Task</th><th>Where</th><th>Owner</th><th>Due</th><th>Done</th><th>Late by</th></tr></thead>
                      <tbody>
                        {board.lateDone.map((t) => (
                          <tr key={t.id}>
                            <td><Link className="cell-title" to={`/fms/tasks/${t.id}`} style={{ color: 'var(--ink)' }}>{t.title}</Link></td>
                            <td><Where t={t} /></td>
                            <td>{t.ownerName}</td>
                            <td className="nowrap">{fmtDateTime(t.dueAt)}</td>
                            <td className="nowrap">{fmtDateTime(t.completedAt)}</td>
                            <td className="nowrap"><b>{fmtWorking(t.lateMinutes, work) || '< 1m'}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <div className="card-h"><h2>By workflow</h2></div>
              {board.byWorkflow.length === 0 ? (
                <div className="card-b small muted">No late work to group.</div>
              ) : (
                <table className="tbl">
                  <thead><tr><th>Workflow</th><th className="num">Overdue</th><th className="num">Delayed</th><th className="num">Late</th></tr></thead>
                  <tbody>
                    {board.byWorkflow.map((r) => (
                      <tr key={r.name}><td>{r.name}</td><td className="num">{r.overdue}</td><td className="num">{r.blocked}</td><td className="num">{r.lateDone}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <div className="card-h"><h2>By owner</h2></div>
              {board.byOwner.length === 0 ? (
                <div className="card-b small muted">No late work to group.</div>
              ) : (
                <table className="tbl">
                  <thead><tr><th>Owner</th><th className="num">Overdue</th><th className="num">Late</th></tr></thead>
                  <tbody>
                    {board.byOwner.map((r) => (
                      <tr key={r.name}><td>{r.name}</td><td className="num">{r.overdue}</td><td className="num">{r.lateDone}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
