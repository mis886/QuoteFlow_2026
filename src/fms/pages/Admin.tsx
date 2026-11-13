import { Link } from 'react-router-dom';
import { Navigate, useParams } from 'react-router-dom';
import { ActionForm } from '../components/ActionForm';
import { SettingsForm } from '../components/SettingsForm';
import { UserForm } from '../components/UserForm';
import { Empty, PageHead, PageLoad } from '../components/Ui';
import { useFmsMe } from '../components/FmsLayout';
import { useFmsPage } from '../lib/api';
import { addHolidayAction, removeHolidayAction } from '../lib/actions';
import { fmtYmd, initials } from '../lib/format';
import { istDateString } from '../lib/engine';
import type { AppSettings, Holiday, UserRow } from '../lib/types';

export function AdminUsersPage() {
  const { actor } = useFmsMe();
  const { data, error, reload } = useFmsPage<{ users: UserRow[] }>('page.adminUsers');
  if (actor.role !== 'admin') return <Navigate to="/fms" replace />;
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { users } = data;
  const managers = users.filter((u) => u.active && u.role !== 'doer').map((u) => ({ id: u.id, name: u.name, empCode: u.empCode }));
  return (
    <>
      <PageHead title="People" sub="Add the people who use FMS and set who reports to whom. Each person opens FMS from EnqBoss with their own login, so use their EnqBoss login email." />
      <div className="stack">
        <div className="card">
          <div className="card-h"><h2>Add a person</h2></div>
          <div className="card-b"><UserForm user={null} managers={managers} /></div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Everyone ({users.length})</h2></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Person</th><th>Role</th><th>Reports to</th><th>Access</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'row-mute'}>
                    <td>
                      <div className="row">
                        <div className="avatar" style={{ background: 'var(--brand-50)', color: 'var(--brand)' }}>{initials(u.name)}</div>
                        <div>
                          <Link to={`/fms/admin/users/${u.id}`} className="cell-title" style={{ color: 'var(--ink)' }}>{u.name}</Link>
                          <div className="cell-sub">{u.empCode}{u.email ? ` · ${u.email}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${u.role === 'admin' ? 'brand' : ''}`}>{u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Manager' : 'Doer'}</span></td>
                    <td>{u.managerName ?? <span className="muted">–</span>}</td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        {u.isCoordinator && <span className="badge info">Coordinator</span>}
                        {u.canCreateWorkflows && <span className="badge">Creates workflows</span>}
                        {!u.active && <span className="badge bad">Inactive</span>}
                        {!u.email && <span className="badge warn">No login email</span>}
                      </div>
                    </td>
                    <td className="right"><Link className="btn sm" to={`/fms/admin/users/${u.id}`}>Manage</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export function AdminUserPage() {
  const { id = '' } = useParams();
  const { actor } = useFmsMe();
  const { data, error, reload } = useFmsPage<{ user: UserRow; managers: UserRow[] }>('page.adminUser', { id });
  if (actor.role !== 'admin') return <Navigate to="/fms" replace />;
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { user } = data;
  const managers = data.managers.map((u) => ({ id: u.id, name: u.name, empCode: u.empCode }));
  return (
    <>
      <PageHead crumbs={[{ href: '/admin/users', label: 'People' }, { label: user.name }]} title={user.name} sub={`${user.empCode}${user.email ? ` · ${user.email}` : ''}`} />
      <div className="card" style={{ maxWidth: 860 }}>
        <div className="card-h"><h2>Details and access</h2></div>
        <div className="card-b"><UserForm key={user.id} user={user} managers={managers} /></div>
      </div>
    </>
  );
}

export function AdminSettingsPage() {
  const { actor } = useFmsMe();
  const { data, error, reload } = useFmsPage<{ settings: AppSettings; holidays: Holiday[] }>('page.settings');
  if (actor.role !== 'admin') return <Navigate to="/fms" replace />;
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { settings, holidays } = data;
  const today = istDateString(Date.now());
  const upcoming = holidays.filter((h) => h.day >= today);
  const past = holidays.filter((h) => h.day < today);
  return (
    <>
      <PageHead title="Hours and holidays" sub="How task time is counted. Every workflow step’s “time allowed” runs only inside these working hours." />
      <div className="grid-main">
        <div className="card">
          <div className="card-h"><h2>Working hours</h2></div>
          <div className="card-b"><SettingsForm settings={settings} /></div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-h"><h2>Add a holiday</h2></div>
            <div className="card-b">
              <ActionForm action={addHolidayAction} submit="Add holiday" resetOnSuccess>
                <div className="stack-sm">
                  <div className="field">
                    <label htmlFor="h-day">Date</label>
                    <input id="h-day" name="day" type="date" className="input" required />
                  </div>
                  <div className="field">
                    <label htmlFor="h-name">Name</label>
                    <input id="h-name" name="name" className="input" required maxLength={80} placeholder="Diwali" />
                  </div>
                </div>
              </ActionForm>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h2>Holiday calendar</h2><span className="small muted">{upcoming.length} upcoming</span></div>
            {holidays.length === 0 ? (
              <Empty icon="calendar" title="No holidays yet">Add the days your office is closed. Task clocks skip them.</Empty>
            ) : (
              <div className="card-b flush">
                {[...upcoming, ...past.reverse()].map((h) => (
                  <div key={h.day} className="row between" style={{ padding: '10px 18px', borderTop: '1px solid var(--line)', color: h.day < today ? 'var(--muted)' : undefined }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{h.name}</div>
                      <div className="cell-sub">{fmtYmd(h.day)}</div>
                    </div>
                    <ActionForm action={removeHolidayAction} hideActions confirm={`Remove ${h.name}?`}>
                      <input type="hidden" name="day" value={h.day} />
                      <button className="btn sm ghost" type="submit">Remove</button>
                    </ActionForm>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
