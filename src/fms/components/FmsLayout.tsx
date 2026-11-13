// The /fms workspace (replaces the old Production workspace).
// Own sidebar on the left; the normal EnqBoss Topbar on top so the workspace
// switch, search and sign-out stay where people expect them.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Topbar } from '../../components/Topbar';
import { fmsRaw, FmsError } from '../lib/api';
import { setFmsNavigate } from '../lib/actions';
import { fmtDate, initials } from '../lib/format';
import type { Actor, UserRow } from '../lib/types';
import { Icon } from './Icon';
import { Nav, type NavItem } from './Nav';
import '../fms.css';

interface Me {
  user: UserRow;
  actor: Actor;
  counts: { myOverdue: number; boardOverdue: number };
  canSeeBoard: boolean;
}

const FmsCtx = createContext<{ me: Me; reloadMe: () => void } | null>(null);

export function useFmsMe(): Me {
  const c = useContext(FmsCtx);
  if (!c) throw new Error('useFmsMe outside FmsLayout');
  return c.me;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; me: Me }
  | { kind: 'unregistered'; email: string }
  | { kind: 'error'; message: string };

export function FmsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(() => {
    fmsRaw<any>('me')
      .then((r) => {
        if (!r.registered) setState({ kind: 'unregistered', email: r.email });
        else setState({ kind: 'ready', me: { user: r.user, actor: r.actor, counts: r.counts, canSeeBoard: r.canSeeBoard } });
      })
      .catch((e) => setState({ kind: 'error', message: e instanceof FmsError ? e.message : 'Could not open FMS.' }));
  }, []);

  useEffect(() => {
    setFmsNavigate((to) => navigate(to));
    return () => setFmsNavigate(null);
  }, [navigate]);

  // Re-read the sidebar badges on every page change and after any FMS change.
  useEffect(() => {
    load();
  }, [load, location.pathname]);
  useEffect(() => {
    window.addEventListener('fms:refresh', load);
    return () => window.removeEventListener('fms:refresh', load);
  }, [load]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (state.kind !== 'ready') {
    return (
      <div className="flex w-full h-screen overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar />
          <main className="fms-root flex-1 overflow-y-auto" style={{ display: 'grid', placeItems: 'center' }}>
            {state.kind === 'loading' && <div className="muted"><span className="spinner" aria-hidden="true" /> Opening FMS…</div>}
            {state.kind === 'unregistered' && (
              <div className="card" style={{ maxWidth: 460 }}>
                <div className="card-b stack-sm">
                  <h2>You are not set up in FMS yet</h2>
                  <p className="small" style={{ color: 'var(--ink-2)' }}>
                    Your login <b>{state.email}</b> has no FMS profile. Ask an FMS admin (MIS, Shishir sir or Anil) to add you under <b>People</b> with this email.
                  </p>
                  <div><Link to="/" className="btn">Back to CRM</Link></div>
                </div>
              </div>
            )}
            {state.kind === 'error' && (
              <div className="card" style={{ maxWidth: 460 }}>
                <div className="card-b stack-sm">
                  <h2>FMS could not load</h2>
                  <p className="small" style={{ color: 'var(--ink-2)' }}>{state.message}</p>
                  <div className="row">
                    <button className="btn primary" onClick={load}>Try again</button>
                    <Link to="/" className="btn">Back to CRM</Link>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  const { me } = state;
  const { actor, user, counts } = me;
  const isAdmin = actor.role === 'admin';
  const isMgr = actor.role === 'manager' || isAdmin;
  const items: NavItem[] = [
    { href: '/fms', label: 'My dashboard', icon: 'dashboard', group: 'My work', count: counts.myOverdue },
    { href: '/fms/score', label: 'My score', icon: 'trend', group: 'My work' },
    { href: '/fms/tasks/new', label: 'New task', icon: 'plus', group: 'My work' },
    { href: '/fms/workflows', label: 'Workflows', icon: 'workflow', group: 'Processes' },
    { href: '/fms/runs', label: 'Workflow runs', icon: 'play', group: 'Processes' },
  ];
  if (isMgr) items.push({ href: '/fms/recurring', label: 'Recurring tasks', icon: 'repeat', group: 'Processes' });
  if (me.canSeeBoard) items.push({ href: '/fms/coordinator', label: 'Coordinator board', icon: 'alert', group: 'Oversight', count: counts.boardOverdue });
  if (isMgr) items.push({ href: '/fms/team', label: 'Team scores', icon: 'users', group: 'Oversight' });
  if (isAdmin) {
    items.push({ href: '/fms/admin/users', label: 'People', icon: 'key', group: 'Admin' });
    items.push({ href: '/fms/admin/settings', label: 'Hours and holidays', icon: 'sliders', group: 'Admin' });
  }
  const roleLabel = actor.role === 'admin' ? 'Admin' : actor.role === 'manager' ? 'Manager' : 'Doer';

  return (
    <FmsCtx.Provider value={{ me, reloadMe: load }}>
      <div className="flex w-full h-screen overflow-hidden">
        <aside className="fms-root fms-sidebar">
          <div className="brand">
            <div className="brand-mark">F</div>
            <div>
              <div className="brand-name">Himalaya FMS</div>
              <div className="brand-sub">Flow management</div>
            </div>
          </div>
          <Nav items={items} />
          <div className="side-foot">
            <div className="me">
              <div className="avatar">{initials(user.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="me-name">{user.name}</div>
                <div className="me-role">
                  {roleLabel}
                  {actor.isCoordinator ? ' · Coordinator' : ''}
                </div>
              </div>
            </div>
            <div className="side-actions">
              <Link to="/">
                <Icon name="logout" size={14} /> Back to CRM
              </Link>
            </div>
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar />
          <main className="fms-root fms-main flex-1 overflow-y-auto">
            <div className="topbar">
              <span>{fmtDate(Date.now())}</span>
              <span>India Standard Time</span>
            </div>
            <div className="content">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </FmsCtx.Provider>
  );
}
