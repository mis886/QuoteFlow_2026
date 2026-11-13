import { Link } from 'react-router-dom';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ActionForm } from '../components/ActionForm';
import { RecurringForm } from '../components/RecurringForm';
import { Empty, Kpi, MisBadge, PageHead, PageLoad } from '../components/Ui';
import { useFmsMe } from '../components/FmsLayout';
import { useFmsPage } from '../lib/api';
import { toggleRecurringAction } from '../lib/actions';
import { initials, WEEKDAYS } from '../lib/format';
import { formatHHMM } from '../lib/engine';
import { misBand } from '../lib/scoring';
import type { AppSettings, Person, RecurringRow, TeamRow } from '../lib/types';

export function TeamPage() {
  const { actor } = useFmsMe();
  const { data, error, reload } = useFmsPage<{ team: TeamRow[]; settings: AppSettings }>('page.team');
  if (actor.role === 'doer') return <Navigate to="/fms" replace />;
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { team: rows, settings } = data;
  const band = (s: Parameters<typeof misBand>[0]) => misBand(s, settings.misGreenLimit, settings.misAmberLimit);
  const tally = { green: 0, amber: 0, red: 0 };
  for (const r of rows) {
    const b = band(r.week);
    if (b === 'green' || b === 'amber' || b === 'red') tally[b]++;
  }
  return (
    <>
      <PageHead title="Team scores" sub={actor.role === 'admin' ? 'Everyone in the company. Worst scores first.' : 'People who report to you, directly or through other managers. Worst scores first.'} />
      <div className="stack">
        <div className="kpis">
          <Kpi label="People" value={rows.length} />
          <Kpi label="On track this week" value={tally.green} sub={`within ${settings.misGreenLimit}% lost`} tone="ok" />
          <Kpi label="Watch" value={tally.amber} sub={`within ${settings.misAmberLimit}% lost`} tone={tally.amber ? 'warn' : undefined} />
          <Kpi label="Needs attention" value={tally.red} sub="beyond that" tone={tally.red ? 'bad' : undefined} />
        </div>
        <div className="card">
          {rows.length === 0 ? (
            <Empty icon="users" title="No one reports to you yet">Ask an admin to set the reporting manager for your team members.</Empty>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="num">MIS this week</th>
                    <th className="num">MIS last week</th>
                    <th className="num">Open</th>
                    <th className="num">Overdue</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td>
                        <div className="row">
                          <div className="avatar" style={{ background: 'var(--brand-50)', color: 'var(--brand)' }}>{initials(r.name)}</div>
                          <div>
                            <Link className="cell-title" to={`/fms/team/${r.userId}`} style={{ color: 'var(--ink)' }}>{r.name}</Link>
                            <div className="cell-sub">{r.empCode} · {r.role === 'doer' ? 'Doer' : r.role === 'manager' ? 'Manager' : 'Admin'}{r.managerName ? ` · reports to ${r.managerName}` : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num"><MisBadge score={r.week} band={band(r.week)} /></td>
                      <td className="num"><MisBadge score={r.lastWeek} band={band(r.lastWeek)} /></td>
                      <td className="num">{r.open}</td>
                      <td className="num">{r.overdue ? <span className="badge bad">{r.overdue}</span> : 0}</td>
                      <td className="right"><Link className="btn sm" to={`/fms/team/${r.userId}`}>View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function RecurringPage() {
  const { actor } = useFmsMe();
  const [sp] = useSearchParams();
  const { data, error, reload } = useFmsPage<{ items: RecurringRow[]; people: Person[] }>('page.recurring');
  if (actor.role === 'doer') return <Navigate to="/fms" replace />;
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { items: list, people } = data;
  const editing = list.find((r) => r.id === sp.get('edit'));
  return (
    <>
      <PageHead title="Recurring tasks" sub="Duties that repeat on set days, such as daily registers or weekly reports. A task appears on the person’s dashboard each morning." />
      <div className="grid-main">
        <div className="card">
          {list.length === 0 ? (
            <Empty icon="repeat" title="No recurring tasks yet">Add one on the right and it starts appearing from the next working day.</Empty>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Task</th><th>Who</th><th>Repeats</th><th>Due</th><th /></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className={r.active ? '' : 'row-mute'}>
                      <td><span className="cell-title">{r.title}</span>{!r.active && <span className="badge" style={{ marginLeft: 8 }}>Paused</span>}</td>
                      <td>{r.ownerName}</td>
                      <td className="nowrap">{[1, 2, 3, 4, 5, 6, 0].filter((d) => r.weekdays.includes(d)).map((d) => WEEKDAYS[d]).join(', ')}</td>
                      <td className="nowrap">{formatHHMM(r.dueMinute)}</td>
                      <td className="right nowrap">
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <Link className="btn sm" to={`/fms/recurring?edit=${r.id}`}>Edit</Link>
                          <ActionForm action={toggleRecurringAction} hideActions>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="active" value={r.active ? '0' : '1'} />
                            <button className="btn sm" type="submit">{r.active ? 'Pause' : 'Resume'}</button>
                          </ActionForm>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-h">
            <h2>{editing ? 'Edit recurring task' : 'Add recurring task'}</h2>
            {editing && <Link className="small" to="/fms/recurring">Cancel</Link>}
          </div>
          <div className="card-b">
            <RecurringForm
              key={editing?.id ?? 'new'}
              initial={editing ? { id: editing.id, title: editing.title, instructions: editing.instructions ?? '', ownerId: editing.ownerId, weekdays: editing.weekdays, dueMinute: editing.dueMinute } : { id: null, title: '', instructions: '', ownerId: '', weekdays: [1, 2, 3, 4, 5, 6], dueMinute: 17 * 60 }}
              people={people}
            />
          </div>
        </div>
      </div>
    </>
  );
}
