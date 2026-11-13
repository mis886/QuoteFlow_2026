import { Link } from 'react-router-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { ActionForm } from '../components/ActionForm';
import { CompleteTask } from '../components/CompleteTask';
import { Reassign } from '../components/Reassign';
import { Empty, PageHead, PageLoad } from '../components/Ui';
import { useFmsMe } from '../components/FmsLayout';
import { useFmsPage } from '../lib/api';
import { cancelInstanceAction } from '../lib/actions';
import { fmtDateTime, fmtWorking } from '../lib/format';
import { overdueLabel } from '../lib/labels';
import { workingMinutesBetween } from '../lib/engine';
import type { AppSettings, InstanceDetail, InstanceListRow, Person } from '../lib/types';

const TABS = [
  { id: 'running', label: 'Running' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;

export function RunsPage() {
  const { actor } = useFmsMe();
  const [sp] = useSearchParams();
  const status = TABS.find((t) => t.id === sp.get('status'))?.id ?? 'running';
  const { data, error, reload } = useFmsPage<{ runs: InstanceListRow[] }>('page.runs', { status });
  const now = Date.now();
  return (
    <>
      <PageHead title="Workflow runs" sub={actor.role === 'admin' || actor.isCoordinator ? 'Every run across the company.' : 'Runs you started or take part in.'} />
      <div className="tabs">
        {TABS.map((t) => (
          <Link key={t.id} to={`/fms/runs?status=${t.id}`} aria-current={status === t.id ? 'page' : undefined}>{t.label}</Link>
        ))}
      </div>
      {!data ? (
        <PageLoad error={error} onRetry={reload} />
      ) : (
        <div className="card">
          {data.runs.length === 0 ? (
            <Empty icon="play" title={`No ${status} runs`}>{status === 'running' ? 'Start a workflow from the Workflows page and it will show here.' : 'Nothing to show yet.'}</Empty>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Progress</th>
                    {status === 'running' && <th>Current step</th>}
                    <th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r) => {
                    const late = r.currentDueAt !== null && r.currentDueAt < now;
                    return (
                      <tr key={r.id} className={status === 'running' && late ? 'row-bad' : ''}>
                        <td>
                          <Link className="cell-title" to={`/fms/runs/${r.id}`} style={{ color: 'var(--ink)' }}>{r.reference}</Link>
                          <div className="cell-sub">{r.workflowName}</div>
                        </td>
                        <td style={{ minWidth: 140 }}>
                          <div className="progress"><i style={{ width: `${r.totalSteps ? (r.doneSteps / r.totalSteps) * 100 : 0}%` }} /></div>
                          <div className="cell-sub">{r.doneSteps} of {r.totalSteps} steps</div>
                        </td>
                        {status === 'running' && (
                          <td>
                            <div>{r.currentTitle ?? '–'}</div>
                            <div className="cell-sub">
                              {r.currentOwner}
                              {r.currentDueAt !== null && <> · due {fmtDateTime(r.currentDueAt)} {late && <span className="badge bad" style={{ marginLeft: 4 }}>Overdue</span>}</>}
                            </div>
                          </td>
                        )}
                        <td className="nowrap">{fmtDateTime(r.startedAt)}<div className="cell-sub">{r.startedByName}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function RunPage() {
  const { id = '' } = useParams();
  const { actor } = useFmsMe();
  const { data, error, reload } = useFmsPage<{ run: InstanceDetail; settings: AppSettings; people: Person[]; reassignable: string[]; canCancel: boolean }>('page.run', { id });
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { run: inst, people, canCancel } = data;
  const work = data.settings.work;
  const reassignable = new Set(data.reassignable);
  const now = Date.now();
  const done = inst.steps.filter((s) => s.status === 'done').length;

  return (
    <>
      <PageHead
        crumbs={[{ href: '/runs', label: 'Runs' }, { label: inst.reference }]}
        title={inst.reference}
        sub={
          <span className="row wrap" style={{ gap: 8 }}>
            {inst.workflowId ? <Link to={`/fms/workflows/${inst.workflowId}`}>{inst.workflowName}</Link> : inst.workflowName}
            <span className={`badge ${inst.status === 'completed' ? 'ok' : inst.status === 'cancelled' ? '' : 'info'}`}>{inst.status === 'running' ? 'Running' : inst.status === 'completed' ? 'Completed' : 'Cancelled'}</span>
            <span className="muted">Started {fmtDateTime(inst.startedAt)} by {inst.startedByName ?? 'unknown'}</span>
          </span>
        }
      />
      <div className="grid-main">
        <div className="card">
          <div className="card-h">
            <h2>Steps</h2>
            <span className="small muted">{done} of {inst.steps.length} done</span>
          </div>
          <div className="card-b timeline">
            {inst.steps.map((s) => {
              const late = s.status === 'done' && s.completedAt! > s.dueAt!;
              const overdue = s.status === 'open' && s.dueAt! < now;
              const dot = s.status === 'done' ? (late ? 'late' : 'done') : s.status === 'open' ? (overdue ? 'late' : 'open') : s.status === 'cancelled' ? 'cancel' : '';
              return (
                <div key={s.taskId} className="tl-item">
                  <div className={`tl-dot ${dot}`}>{s.status === 'done' ? '✓' : s.seq}</div>
                  <div className="tl-body">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <Link to={`/fms/tasks/${s.taskId}`} style={{ fontWeight: 650, color: 'var(--ink)' }}>{s.title}</Link>
                      {s.status === 'done' && <span className={`badge ${late ? 'warn' : 'ok'}`}>{late ? 'Done late' : 'Done on time'}</span>}
                      {s.status === 'open' && <span className={`badge ${overdue ? 'bad' : 'info'}`}>{overdue ? 'Overdue' : 'In progress'}</span>}
                      {s.status === 'waiting' && <span className="badge">Waiting</span>}
                      {s.status === 'cancelled' && <span className="badge">Cancelled</span>}
                    </div>
                    <div className="small muted" style={{ marginTop: 2 }}>
                      {s.ownerName}
                      {s.tatMinutes !== null && ` · ${fmtWorking(s.tatMinutes, work)} allowed`}
                    </div>
                    <div className="small" style={{ marginTop: 4, color: 'var(--ink-2)' }}>
                      {s.releasedAt && <>Released {fmtDateTime(s.releasedAt)} · </>}
                      {s.dueAt && <>Due {fmtDateTime(s.dueAt)}</>}
                      {s.completedAt && <> · Completed {fmtDateTime(s.completedAt)}{late ? ` (${fmtWorking(workingMinutesBetween(s.dueAt!, s.completedAt, work), work) || 'moments'} late)` : ''}</>}
                      {overdue && <span style={{ color: 'var(--bad)', fontWeight: 600 }}> · {overdueLabel(s.dueAt!, now, work)}</span>}
                    </div>
                    {s.remarks && <div className="small" style={{ marginTop: 4 }}>“{s.remarks}”</div>}
                    {(s.status === 'open' || s.status === 'waiting') && (
                      <div className="row wrap" style={{ marginTop: 8 }}>
                        {s.status === 'open' && s.ownerId === actor.id && <CompleteTask taskId={s.taskId} compact inline />}
                        {reassignable.has(s.taskId) && <Reassign taskId={s.taskId} currentOwnerId={s.ownerId} people={people} />}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="stack">
          {inst.status === 'cancelled' && inst.cancelledReason && (
            <div className="alert warn">Cancelled: {inst.cancelledReason}</div>
          )}
          {inst.status === 'completed' && <div className="alert success">Completed {fmtDateTime(inst.completedAt)}.</div>}
          {canCancel && (
            <div className="card">
              <div className="card-h"><h2>Cancel this run</h2></div>
              <div className="card-b">
                <ActionForm action={cancelInstanceAction} submit="Cancel run" submitClass="btn danger" confirm="Cancel this run? Open and upcoming steps stop counting. This cannot be undone.">
                  <input type="hidden" name="instanceId" value={inst.id} />
                  <div className="field">
                    <label htmlFor="reason">Reason</label>
                    <input id="reason" name="reason" className="input" required maxLength={300} placeholder="Customer cancelled the order" />
                  </div>
                </ActionForm>
                <p className="hint" style={{ marginTop: 8 }}>Steps already finished keep their score.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
