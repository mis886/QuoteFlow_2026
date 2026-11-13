import { Link } from 'react-router-dom';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { ActionForm } from '../components/ActionForm';
import { Icon } from '../components/Icon';
import { StartAccessForm } from '../components/StartAccessForm';
import { WorkflowBuilder } from '../components/WorkflowBuilder';
import { Empty, PageHead, PageLoad } from '../components/Ui';
import { useFmsMe } from '../components/FmsLayout';
import { useFmsPage } from '../lib/api';
import { archiveWorkflowAction, startInstanceAction } from '../lib/actions';
import { fmtDateTime, fmtWorking } from '../lib/format';
import { dayIntervals } from '../lib/engine';
import type { AppSettings, InstanceListRow, Person, WorkflowDetail, WorkflowSummary } from '../lib/types';

const ACCESS_SHORT = { admin: 'Admins only', anyone: 'Anyone', selected: 'Selected people' } as const;
const ACCESS_LONG = { admin: 'Admins and its creator', anyone: 'Anyone', selected: 'Selected people' } as const;

export function WorkflowsPage() {
  const { actor } = useFmsMe();
  const [sp] = useSearchParams();
  const showArchived = sp.get('archived') === '1';
  const { data, error, reload } = useFmsPage<{ workflows: WorkflowSummary[]; settings: AppSettings }>('page.workflows');
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const all = data.workflows;
  const settings = data.settings;
  const list = all.filter((w) => (showArchived ? w.status === 'archived' : w.status === 'active'));
  const archivedCount = all.filter((w) => w.status === 'archived').length;
  const canCreate = actor.role === 'admin' || actor.canCreateWorkflows;
  return (
    <>
      <PageHead
        title="Workflows"
        sub="Reusable processes. Each step says what to do, how, by when, and who does it."
        actions={canCreate && <Link className="btn primary" to="/fms/workflows/new"><Icon name="plus" size={16} /> New workflow</Link>}
      />
      <div className="tabs">
        <Link to="/fms/workflows" aria-current={!showArchived ? 'page' : undefined}>Active</Link>
        <Link to="/fms/workflows?archived=1" aria-current={showArchived ? 'page' : undefined}>Archived<span className="n">{archivedCount}</span></Link>
      </div>
      <div className="card">
        {list.length === 0 ? (
          <Empty icon="workflow" title={showArchived ? 'No archived workflows' : 'No workflows yet'} action={!showArchived && canCreate ? <Link className="btn primary" to="/fms/workflows/new">Create the first workflow</Link> : undefined}>
            {showArchived ? 'Archived workflows appear here.' : canCreate ? 'Design a process as steps with an owner and a time allowed for each.' : 'Your admin has not set up any workflows yet.'}
          </Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th className="num">Steps</th>
                  <th className="num">Time allowed</th>
                  <th className="num">Running</th>
                  <th>Who can start</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link className="cell-title" to={`/fms/workflows/${w.id}`} style={{ color: 'var(--ink)' }}>{w.name}</Link>
                      <div className="cell-sub">{w.description || `Created by ${w.createdByName ?? 'unknown'}`}</div>
                    </td>
                    <td className="num">{w.stepCount}</td>
                    <td className="num nowrap">{fmtWorking(w.totalTatMinutes, settings.work)}</td>
                    <td className="num">{w.runningCount}</td>
                    <td><span className="badge">{ACCESS_SHORT[w.startAccess]}</span></td>
                    <td className="right nowrap">
                      {w.canStart && <Link className="btn sm primary" to={`/fms/workflows/${w.id}#start`}>Start</Link>} <Link className="btn sm" to={`/fms/workflows/${w.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export function WorkflowPage() {
  const { id = '' } = useParams();
  const { actor } = useFmsMe();
  const { data, error, reload } = useFmsPage<{ workflow: WorkflowDetail; settings: AppSettings; people: Person[]; runs: InstanceListRow[] }>('page.workflow', { id });
  useEffect(() => {
    if (data && window.location.hash === '#start') document.getElementById('start')?.scrollIntoView({ block: 'start' });
  }, [data]);
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { workflow: wf, settings, people, runs } = data;
  const isAdmin = actor.role === 'admin';
  const total = wf.steps.reduce((t, s) => t + s.tatMinutes, 0);
  const inactive = wf.steps.filter((s) => !s.ownerActive);

  return (
    <>
      <PageHead
        crumbs={[{ href: '/workflows', label: 'Workflows' }, { label: wf.name }]}
        title={wf.name}
        sub={wf.description || undefined}
        actions={
          <>
            {wf.status === 'archived' && <span className="badge">Archived</span>}
            {wf.canEdit && wf.status === 'active' && <Link className="btn" to={`/fms/workflows/${wf.id}/edit`}><Icon name="edit" size={16} /> Edit</Link>}
            {wf.canEdit && (
              <ActionForm action={archiveWorkflowAction} hideActions confirm={wf.status === 'active' ? 'Archive this workflow? Runs already started will continue.' : undefined} className="row">
                <input type="hidden" name="workflowId" value={wf.id} />
                <input type="hidden" name="archive" value={wf.status === 'active' ? '1' : '0'} />
                <button className="btn" type="submit">{wf.status === 'active' ? 'Archive' : 'Restore'}</button>
              </ActionForm>
            )}
          </>
        }
      />
      <div className="stack">
        {wf.canStart && wf.status === 'active' && (
          <div className="card" id="start">
            <div className="card-h"><h2>Start a new run</h2></div>
            <div className="card-b">
              {inactive.length > 0 ? (
                <div className="alert warn">Step {inactive[0].position} is owned by {inactive[0].ownerName}, who is no longer active. {wf.canEdit ? 'Edit the workflow to choose a new owner before starting.' : 'Ask the workflow owner or an admin to update it.'}</div>
              ) : (
                <ActionForm action={startInstanceAction} submit="Start workflow" pending="Starting…" className="row wrap" hideActions={false}>
                  <input type="hidden" name="workflowId" value={wf.id} />
                  <div className="field grow" style={{ minWidth: 260 }}>
                    <label htmlFor="reference">Reference (order number, customer or batch)</label>
                    <input id="reference" name="reference" className="input" required maxLength={120} placeholder="ORD-2026-812 · Pine Oil 211 × 10" />
                  </div>
                </ActionForm>
              )}
              <p className="hint" style={{ marginTop: 8 }}>Step 1 is released to {wf.steps[0]?.ownerName} immediately. Each next step is released when the one before it is marked done.</p>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-h">
            <h2>Steps</h2>
            <span className="badge brand"><Icon name="clock" size={13} /> {fmtWorking(total, settings.work)} working time in total</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>#</th>
                  <th>What</th>
                  <th>How</th>
                  <th>When (time allowed)</th>
                  <th>Who</th>
                </tr>
              </thead>
              <tbody>
                {wf.steps.map((s) => (
                  <tr key={s.id}>
                    <td><span className="badge brand">{s.position}</span></td>
                    <td className="cell-title">{s.what}</td>
                    <td style={{ whiteSpace: 'pre-line', maxWidth: 380 }}>{s.how || <span className="muted">–</span>}</td>
                    <td className="nowrap">{fmtWorking(s.tatMinutes, settings.work)}</td>
                    <td>{s.ownerName}{!s.ownerActive && <span className="badge bad" style={{ marginLeft: 6 }}>Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-f small muted">Time is counted in working hours: {`${Math.floor(settings.work.workStart / 60)}`.padStart(2, '0')}:{`${settings.work.workStart % 60}`.padStart(2, '0')} to {`${Math.floor(settings.work.workEnd / 60)}`.padStart(2, '0')}:{`${settings.work.workEnd % 60}`.padStart(2, '0')}, excluding lunch, weekly offs and holidays.</div>
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-h"><h2>Running now</h2><Link className="small" to="/fms/runs">All runs</Link></div>
            {runs.length === 0 ? (
              <div className="card-b small muted">No runs in progress.</div>
            ) : (
              <div className="card-b flush">
                {runs.map((r) => (
                  <div key={r.id} style={{ padding: '10px 18px', borderTop: '1px solid var(--line)' }}>
                    <Link to={`/fms/runs/${r.id}`} className="cell-title" style={{ color: 'var(--ink)' }}>{r.reference}</Link>
                    <div className="cell-sub">Step {r.doneSteps + 1} of {r.totalSteps}: {r.currentTitle ?? '–'}{r.currentOwner ? ` · ${r.currentOwner}` : ''}{r.currentDueAt ? ` · due ${fmtDateTime(r.currentDueAt)}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-h"><h2>Who can start it</h2></div>
            <div className="card-b">
              {isAdmin ? (
                <StartAccessForm workflowId={wf.id} access={wf.startAccess} starterIds={wf.starterIds} people={people} />
              ) : (
                <p>{ACCESS_LONG[wf.startAccess]}. Created by {wf.createdByName ?? 'unknown'}. Only an admin can change this.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function WorkflowFormPage({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams();
  const { actor } = useFmsMe();
  const { data, error, reload } = useFmsPage<{ workflow: WorkflowDetail | null; settings: AppSettings; people: Person[] }>('page.workflowForm', mode === 'edit' ? { id } : {});
  if (mode === 'new' && actor.role !== 'admin' && !actor.canCreateWorkflows) return <Navigate to="/fms/workflows" replace />;
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { workflow: wf, settings, people } = data;
  const dayMinutes = dayIntervals(settings.work).reduce((t, [a, b]) => t + (b - a), 0);
  if (mode === 'edit' && wf && (!wf.canEdit || wf.status === 'archived')) return <Navigate to={`/fms/workflows/${wf.id}`} replace />;
  if (mode === 'new' || !wf) {
    return (
      <>
        <PageHead crumbs={[{ href: '/workflows', label: 'Workflows' }, { label: 'New' }]} title="New workflow" sub="Define each step as what, when, how and who." />
        <WorkflowBuilder initial={{ id: null, name: '', description: '', steps: [], startAccess: 'admin', starterIds: [] }} people={people} isAdmin={actor.role === 'admin'} dayMinutes={dayMinutes} />
      </>
    );
  }
  return (
    <>
      <PageHead crumbs={[{ href: '/workflows', label: 'Workflows' }, { href: `/workflows/${wf.id}`, label: wf.name }, { label: 'Edit' }]} title={`Edit ${wf.name}`} sub="Changes apply to runs started from now on. Runs already in progress keep their original steps and times." />
      <WorkflowBuilder
        initial={{ id: wf.id, name: wf.name, description: wf.description ?? '', steps: wf.steps.map((s) => ({ what: s.what, how: s.how ?? '', tatMinutes: s.tatMinutes, ownerId: s.ownerId })), startAccess: wf.startAccess, starterIds: wf.starterIds }}
        people={people}
        isAdmin={actor.role === 'admin'}
        dayMinutes={dayMinutes}
      />
    </>
  );
}
