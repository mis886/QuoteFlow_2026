
import { useMemo, useState } from 'react';
import { saveWorkflowAction } from '../lib/actions';
import { ActionForm } from './ActionForm';
import { Icon } from './Icon';

interface Person {
  id: string;
  name: string;
  empCode: string;
}

interface StepState {
  key: number;
  what: string;
  how: string;
  hours: string;
  minutes: string;
  ownerId: string;
}

export interface BuilderInitial {
  id: string | null;
  name: string;
  description: string;
  steps: Array<{ what: string; how: string; tatMinutes: number; ownerId: string }>;
  startAccess: 'admin' | 'anyone' | 'selected';
  starterIds: string[];
}

let counter = 1;
const blank = (ownerId = ''): StepState => ({ key: counter++, what: '', how: '', hours: '', minutes: '', ownerId });

export function WorkflowBuilder({ initial, people, isAdmin, dayMinutes }: { initial: BuilderInitial; people: Person[]; isAdmin: boolean; dayMinutes: number }) {
  const [steps, setSteps] = useState<StepState[]>(() =>
    initial.steps.length
      ? initial.steps.map((s) => ({ key: counter++, what: s.what, how: s.how, hours: String(Math.floor(s.tatMinutes / 60)), minutes: String(s.tatMinutes % 60), ownerId: s.ownerId }))
      : [blank()],
  );
  const [access, setAccess] = useState(initial.startAccess);
  const [starters, setStarters] = useState<string[]>(initial.starterIds);

  const set = (key: number, patch: Partial<StepState>) => setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setSteps((all) => {
      const j = i + dir;
      if (j < 0 || j >= all.length) return all;
      const next = [...all];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (key: number) => setSteps((all) => (all.length > 1 ? all.filter((s) => s.key !== key) : all));

  const totalMin = steps.reduce((t, s) => t + Math.round((Number(s.hours) || 0) * 60 + (Number(s.minutes) || 0)), 0);
  const days = dayMinutes > 0 ? totalMin / dayMinutes : 0;
  const payload = useMemo(() => JSON.stringify(steps.map(({ what, how, hours, minutes, ownerId }) => ({ what, how, hours: Number(hours) || 0, minutes: Number(minutes) || 0, ownerId }))), [steps]);

  return (
    <ActionForm action={saveWorkflowAction} submit={initial.id ? 'Save changes' : 'Create workflow'} pending="Saving…" className="stack">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="steps" value={payload} />
      <div className="card">
        <div className="card-b form-grid">
          <div className="field">
            <label htmlFor="name">Workflow name</label>
            <input id="name" name="name" className="input" required maxLength={120} defaultValue={initial.name} placeholder="Export order" />
          </div>
          <div className="field">
            <label htmlFor="description">Description (optional)</label>
            <input id="description" name="description" className="input" maxLength={1000} defaultValue={initial.description} placeholder="From order confirmation to dispatch" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h2>Steps: what, when, how, who</h2>
            <p className="small muted">Steps run in order. The next step starts the moment the previous one is marked done, and its clock counts working hours only.</p>
          </div>
          <span className="badge brand" title="Sum of time allowed for every step">
            <Icon name="clock" size={13} /> {totalMin ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : '0h'} in total{days >= 1 ? ` · about ${days.toFixed(1)} working days` : ''}
          </span>
        </div>
        <div className="card-b" style={{ background: 'var(--surface-2)' }}>
          <div className="w4 w4-head" aria-hidden="true">
            <span />
            <span>What (task)</span>
            <span>How (method)</span>
            <span>When (time allowed)</span>
            <span>Who (owner)</span>
            <span />
          </div>
          {steps.map((s, i) => (
            <div key={s.key} className="w4-row w4" role="group" aria-label={`Step ${i + 1}`}>
              <div className="num">{i + 1}</div>
              <div className="field">
                <label className="sr-only" htmlFor={`what-${s.key}`}>Step {i + 1} what</label>
                <input id={`what-${s.key}`} className="input" value={s.what} onChange={(e) => set(s.key, { what: e.target.value })} maxLength={200} placeholder="Prepare export documents" />
              </div>
              <div className="field">
                <label className="sr-only" htmlFor={`how-${s.key}`}>Step {i + 1} how</label>
                <textarea id={`how-${s.key}`} className="textarea" style={{ minHeight: 38, height: 38 }} value={s.how} onChange={(e) => set(s.key, { how: e.target.value })} maxLength={2000} placeholder="Use the export checklist" />
              </div>
              <div className="field">
                <span className="sr-only">Step {i + 1} time allowed</span>
                <div className="w4-when">
                  <input className="input" type="number" min={0} max={9999} inputMode="numeric" aria-label={`Step ${i + 1} hours`} value={s.hours} onChange={(e) => set(s.key, { hours: e.target.value })} placeholder="0" />
                  <span className="small muted">h</span>
                  <input className="input" type="number" min={0} max={59} inputMode="numeric" aria-label={`Step ${i + 1} minutes`} value={s.minutes} onChange={(e) => set(s.key, { minutes: e.target.value })} placeholder="0" />
                  <span className="small muted">m</span>
                </div>
              </div>
              <div className="field">
                <label className="sr-only" htmlFor={`who-${s.key}`}>Step {i + 1} who</label>
                <select id={`who-${s.key}`} className="select" value={s.ownerId} onChange={(e) => set(s.key, { ownerId: e.target.value })}>
                  <option value="">Choose a person</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.empCode})</option>
                  ))}
                </select>
              </div>
              <div className="w4-tools">
                <button type="button" className="iconbtn" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={16} /></button>
                <button type="button" className="iconbtn" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={16} /></button>
                <button type="button" className="iconbtn del" aria-label={`Remove step ${i + 1}`} disabled={steps.length === 1} onClick={() => remove(s.key)}><Icon name="trash" size={16} /></button>
              </div>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => setSteps((all) => [...all, blank(all[all.length - 1]?.ownerId ?? '')])} disabled={steps.length >= 40}>
            <Icon name="plus" size={16} /> Add step
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <div className="card-h"><h2>Who can start this workflow</h2></div>
          <div className="card-b stack-sm">
            <label className="check"><input type="radio" name="startAccess" value="admin" checked={access === 'admin'} onChange={() => setAccess('admin')} /> Only admins and the person who created it</label>
            <label className="check"><input type="radio" name="startAccess" value="anyone" checked={access === 'anyone'} onChange={() => setAccess('anyone')} /> Anyone who signs in</label>
            <label className="check"><input type="radio" name="startAccess" value="selected" checked={access === 'selected'} onChange={() => setAccess('selected')} /> Only selected people</label>
            {access === 'selected' && (
              <div className="check-row" style={{ marginTop: 6 }}>
                {people.map((p) => (
                  <label key={p.id} className="check">
                    <input type="checkbox" name="starterIds" value={p.id} checked={starters.includes(p.id)} onChange={(e) => setStarters((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </ActionForm>
  );
}
