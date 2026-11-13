import { useParams, useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { ScoreView } from '../components/ScoreView';
import { PageHead, PageLoad } from '../components/Ui';
import { useFmsMe } from '../components/FmsLayout';
import { useFmsPage } from '../lib/api';
import { initials } from '../lib/format';
import type { AppSettings, ScoredTask, TaskRow, UserRow, WeekPoint } from '../lib/types';

const weekOf = (v: string | null) => Math.min(7, Math.max(0, Number.parseInt(v ?? '0', 10) || 0));

export function ScorePage() {
  const [sp] = useSearchParams();
  const w = weekOf(sp.get('w'));
  const { data, error, reload } = useFmsPage<{ settings: AppSettings; history: WeekPoint[]; tasks: ScoredTask[]; weekOffset: number }>('page.score', { w });
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  return (
    <>
      <PageHead title="My score" sub="Your weekly MIS and the tasks behind it. Only you and your manager can see this." />
      <ScoreView history={data.history} settings={data.settings} tasks={data.tasks} weekOffset={data.weekOffset} basePath="/fms/score" />
    </>
  );
}

export function PersonPage() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const { actor } = useFmsMe();
  const w = weekOf(sp.get('w'));
  const { data, error, reload } = useFmsPage<{ person: UserRow; settings: AppSettings; history: WeekPoint[]; tasks: ScoredTask[]; open: TaskRow[]; weekOffset: number }>('page.person', { id, w });
  if (!data) return <PageLoad error={error} onRetry={reload} />;
  const { person } = data;
  const openNow = data.open.filter((t) => t.status === 'open').length;
  return (
    <>
      <PageHead
        crumbs={[{ href: '/team', label: 'Team scores' }, { label: person.name }]}
        title={person.name}
        sub={`${person.empCode} · ${person.role === 'doer' ? 'Doer' : person.role === 'manager' ? 'Manager' : 'Admin'}${person.managerName ? ` · reports to ${person.managerName}` : ''}`}
        actions={
          person.id !== actor.id && (
            <Link className="btn" to={`/fms/tasks/new?for=${person.id}`}>
              <Icon name="plus" size={16} /> Assign a task
            </Link>
          )
        }
      />
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="avatar lg" style={{ background: 'var(--brand-50)', color: 'var(--brand)' }}>{initials(person.name)}</div>
        <div className="small muted">{openNow} open task{openNow === 1 ? '' : 's'} right now</div>
      </div>
      <ScoreView history={data.history} settings={data.settings} tasks={data.tasks} weekOffset={data.weekOffset} basePath={`/fms/team/${person.id}`} />
    </>
  );
}
