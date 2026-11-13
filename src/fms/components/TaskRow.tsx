import { Link } from 'react-router-dom';
import { CompleteTask } from './CompleteTask';
import { StatusBadge } from './Ui';
import { fmtDateTime, SOURCE_LABEL } from '../lib/format';
import { overdueLabel } from '../lib/labels';
import type { WorkSettings } from '../lib/engine';
import type { TaskRow as Task } from '../lib/types';
import { Icon } from './Icon';

export function TaskRowView({ t, now, work, todayYmd }: { t: Task; now: number; work: WorkSettings; todayYmd: string }) {
  const open = t.status === 'open';
  const overdue = open && t.dueAt! < now;
  const dueToday = open && !overdue && t.dueAt !== null && new Date(t.dueAt + 330 * 60_000).toISOString().slice(0, 10) === todayYmd;
  const cls = overdue ? 'overdue' : dueToday ? 'today' : t.status === 'done' ? 'mute' : '';
  return (
    <div className={`task-row ${cls}`}>
      <div style={{ minWidth: 0 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link to={`/fms/tasks/${t.id}`} className="task-title" style={{ color: 'var(--ink)' }}>
            {t.title}
          </Link>
          <StatusBadge status={t.status} overdue={overdue} />
          {t.source !== 'workflow' && <span className="badge brand">{SOURCE_LABEL[t.source]}</span>}
          {!t.countsInMis && t.status !== 'done' && <span className="badge" title="Personal tasks are not part of your MIS score">Not scored</span>}
        </div>
        <div className="task-meta">
          {t.instanceId && (
            <span>
              <Link to={`/fms/runs/${t.instanceId}`}>{t.workflowName} · {t.instanceRef}</Link> · Step {t.seq} of {t.totalSteps}
            </span>
          )}
          {t.status === 'open' && (
            <span style={{ color: overdue ? 'var(--bad)' : undefined, fontWeight: overdue ? 600 : undefined }}>
              <Icon name="clock" size={13} /> Due {fmtDateTime(t.dueAt)}
              {overdue ? ` · ${overdueLabel(t.dueAt!, now, work)}` : ''}
            </span>
          )}
          {t.status === 'waiting' && (
            <span>
              Waiting for “{t.prevTitle}”{t.prevOwnerName ? ` (${t.prevOwnerName})` : ''}
              {t.tatMinutes !== null ? ` · you get ${Math.floor(t.tatMinutes / 60)}h${t.tatMinutes % 60 ? ` ${t.tatMinutes % 60}m` : ''} once it is released` : ''}
            </span>
          )}
          {t.status === 'done' && <span>Done {fmtDateTime(t.completedAt)}{t.completedAt! > t.dueAt! ? ' · late' : ' · on time'}</span>}
          {t.assignedByName && t.source === 'delegated' && <span>From {t.assignedByName}</span>}
        </div>
        {t.instructions && t.status === 'open' && (
          <div className="small muted" style={{ marginTop: 6, maxWidth: 680, whiteSpace: 'pre-line' }}>
            {t.instructions.length > 160 ? `${t.instructions.slice(0, 160)}…` : t.instructions}
          </div>
        )}
      </div>
      <div className="task-side">{open && <CompleteTask taskId={t.id} compact />}</div>
    </div>
  );
}
