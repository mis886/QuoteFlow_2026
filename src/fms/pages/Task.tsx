import { Link } from 'react-router-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { CompleteTask } from '../components/CompleteTask';
import { NewTaskForm } from '../components/NewTaskForm';
import { Reassign } from '../components/Reassign';
import { PageHead, PageLoad, StatusBadge } from '../components/Ui';
import { useFmsMe } from '../components/FmsLayout';
import { useFmsPage } from '../lib/api';
import { fmtDateTime, fmtWorking, SOURCE_LABEL } from '../lib/format';
import { overdueLabel } from '../lib/labels';
import { istDateString, workingMinutesBetween, type WorkSettings } from '../lib/engine';
import type { InstanceDetail, Person, TaskRow } from '../lib/types';

export function TaskPage() {
  const { id = '' } = useParams();
  const { actor } = useFmsMe();
  const { data, error, reload } = useFmsPage<{ task: TaskRow; work: WorkSettings; instance: InstanceDetail | null; people: Person[] | null }>('page.taskById', { id });
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { task, work, instance: inst, people } = data;
  const now = Date.now();
  const mine = task.ownerId === actor.id;
  const overdue = task.status === 'open' && task.dueAt! < now;
  const lateBy = task.status === 'done' && task.completedAt! > task.dueAt! ? workingMinutesBetween(task.dueAt!, task.completedAt!, work) : 0;

  return (
    <>
      <PageHead
        crumbs={[{ href: '/fms', label: 'Dashboard' }, { label: 'Task' }]}
        title={task.title}
        sub={
          <span className="row wrap" style={{ gap: 8 }}>
            <StatusBadge status={task.status} overdue={overdue} />
            <span className="badge brand">{SOURCE_LABEL[task.source]}</span>
            {!task.countsInMis && <span className="badge">Not scored</span>}
            {task.status === 'done' && task.completedAt! > task.dueAt! && <span className="badge warn">Done late</span>}
          </span>
        }
        actions={
          <>
            {people && <Reassign taskId={task.id} currentOwnerId={task.ownerId} people={people} />}
            {mine && task.status === 'open' && <CompleteTask taskId={task.id} inline />}
          </>
        }
      />
      <div className="grid-main">
        <div className="stack">
          <div className="card">
            <div className="card-h"><h2>How to do it</h2></div>
            <div className="card-b" style={{ whiteSpace: 'pre-line' }}>
              {task.instructions ? task.instructions : <span className="muted">No instructions were added for this task.</span>}
            </div>
          </div>
          {task.remarks && (
            <div className="card">
              <div className="card-h"><h2>Remarks when completed</h2></div>
              <div className="card-b" style={{ whiteSpace: 'pre-line' }}>{task.remarks}</div>
            </div>
          )}
          {inst && (
            <div className="card">
              <div className="card-h">
                <h2>Workflow progress</h2>
                <Link to={`/fms/runs/${inst.id}`} className="small">{inst.workflowName} · {inst.reference}</Link>
              </div>
              <div className="card-b timeline">
                {inst.steps.map((s) => {
                  const late = s.status === 'done' && s.completedAt! > s.dueAt!;
                  return (
                    <div key={s.taskId} className="tl-item">
                      <div className={`tl-dot ${s.status === 'done' ? (late ? 'late' : 'done') : s.status === 'open' ? 'open' : s.status === 'cancelled' ? 'cancel' : ''}`}>{s.seq}</div>
                      <div className="tl-body">
                        <div style={{ fontWeight: s.taskId === task.id ? 700 : 600 }}>{s.title}{s.taskId === task.id ? ' (this task)' : ''}</div>
                        <div className="small muted">
                          {s.ownerName}
                          {s.status === 'done' ? ` · done ${fmtDateTime(s.completedAt)}${late ? ' (late)' : ''}` : s.status === 'open' ? ` · due ${fmtDateTime(s.dueAt)}` : s.status === 'waiting' ? ' · waiting' : ' · cancelled'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-h"><h2>Details</h2></div>
          <div className="card-b">
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px' }} className="small">
              <dt className="muted">Owner</dt><dd style={{ margin: 0 }}>{task.ownerName}</dd>
              {task.assignedByName && <><dt className="muted">Assigned by</dt><dd style={{ margin: 0 }}>{task.assignedByName}</dd></>}
              {task.tatMinutes !== null && <><dt className="muted">Time allowed</dt><dd style={{ margin: 0 }}>{fmtWorking(task.tatMinutes, work)} working time</dd></>}
              <dt className="muted">Released</dt><dd style={{ margin: 0 }}>{fmtDateTime(task.releasedAt)}</dd>
              <dt className="muted">Due</dt>
              <dd style={{ margin: 0, color: overdue ? 'var(--bad)' : undefined, fontWeight: overdue ? 600 : undefined }}>
                {fmtDateTime(task.dueAt)}
                {overdue && <div>{overdueLabel(task.dueAt!, now, work)}</div>}
              </dd>
              {task.status === 'done' && (
                <>
                  <dt className="muted">Completed</dt>
                  <dd style={{ margin: 0 }}>{fmtDateTime(task.completedAt)}{lateBy ? <div className="muted">{fmtWorking(lateBy, work)} late</div> : null}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}

export function NewTaskPage() {
  const { actor } = useFmsMe();
  const [sp] = useSearchParams();
  const forId = sp.get('for') ?? undefined;
  const { data, error, reload } = useFmsPage<{ people: Person[] }>('page.newTask');
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const defaultOwnerId = data.people.some((p) => p.id === forId) ? forId : undefined;
  return (
    <>
      <PageHead title="New task" sub={actor.role === 'doer' ? 'Add a private to-do to your list.' : 'Add a to-do for yourself, or assign a one-off task to someone in your team.'} />
      <div className="card" style={{ maxWidth: 760 }}>
        <div className="card-b">
          <NewTaskForm people={data.people} canAssign={actor.role !== 'doer'} today={istDateString(Date.now())} defaultOwnerId={defaultOwnerId} />
        </div>
      </div>
    </>
  );
}
