import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Band, Score } from '../lib/scoring';
import { formatMis } from '../lib/scoring';
import { fmtWeekRange } from '../lib/format';
import { Icon } from './Icon';
import type { TaskStatus } from '../lib/types';
import type { WeekPoint } from '../lib/types';

export function PageHead({ title, sub, actions, crumbs }: { title: string; sub?: ReactNode; actions?: ReactNode; crumbs?: Array<{ href?: string; label: string }> }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && ' / '}
                {c.href ? <Link to={c.href.startsWith("/fms") ? c.href : `/fms${c.href}`}>{c.label}</Link> : c.label}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}

export function Empty({ icon = 'inbox', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico">
        <Icon name={icon} size={22} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'ok' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{value}</div>
      {sub && <div className="kpi-s">{sub}</div>}
    </div>
  );
}

export function MisKpi({ label, score, band, sub }: { label: string; score: Score; band: Band; sub?: ReactNode }) {
  return (
    <div className={`kpi mis ${band}`}>
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{formatMis(score)}</div>
      <div className="kpi-s">{sub}</div>
    </div>
  );
}

export function MisBadge({ score, band }: { score: Score; band: Band }) {
  const tone = band === 'green' ? 'ok' : band === 'amber' ? 'warn' : band === 'red' ? 'bad' : '';
  return <span className={`badge ${tone}`}>{formatMis(score)}</span>;
}

export function StatusBadge({ status, overdue }: { status: TaskStatus; overdue?: boolean }) {
  if (status === 'done') return <span className="badge ok">Done</span>;
  if (status === 'cancelled') return <span className="badge">Cancelled</span>;
  if (status === 'waiting') return <span className="badge">Upcoming</span>;
  return overdue ? <span className="badge bad"><span className="dot" />Overdue</span> : <span className="badge info"><span className="dot" />Open</span>;
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  return <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : undefined}>{children}</div>;
}

/** Weekly MIS bars, oldest to newest. Taller bar = bigger loss, so a flat, short row is what good looks like. */
export function ScoreBars({ points, bandOf }: { points: WeekPoint[]; bandOf: (s: Score) => Band }) {
  const maxLoss = Math.max(20, ...points.map((p) => -p.score.mis));
  return (
    <div className="bars" role="img" aria-label="Weekly MIS score for the last eight weeks">
      {points.map((p, i) => {
        const band = bandOf(p.score);
        const h = p.score.noData ? 3 : Math.max(4, (-p.score.mis / maxLoss) * 88);
        const current = i === points.length - 1;
        return (
          <div key={p.weekStart} className={`bar ${current ? 'current' : ''}`} title={`${fmtWeekRange(p.weekStart, p.weekEnd)}: ${p.score.noData ? 'no tasks due' : formatMis(p.score)} (${p.score.planned} planned)`}>
            <span className="bar-v">{p.score.noData ? '–' : formatMis(p.score)}</span>
            <div className={`bar-col ${band}`} style={{ height: `${h}%` }} />
            <span className="bar-l">{current ? 'This wk' : fmtWeekRange(p.weekStart, p.weekEnd).split(' – ')[0]}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Shown while a page's data loads, or when it could not be loaded. */
export function PageLoad({ error, onRetry }: { error: { message: string; status?: number } | null; onRetry?: () => void }) {
  if (!error) {
    return (
      <div className="muted" style={{ padding: '48px 0', textAlign: 'center' }}>
        <span className="spinner" aria-hidden="true" /> Loading…
      </div>
    );
  }
  const notFound = error.status === 404 || error.status === 403;
  return (
    <Empty icon={notFound ? 'lock' : 'alert'} title={notFound ? 'Not available' : 'Could not load this page'} action={!notFound && onRetry ? <button className="btn" onClick={onRetry}>Try again</button> : <Link className="btn" to="/fms">Back to dashboard</Link>}>
      {error.message}
    </Empty>
  );
}
