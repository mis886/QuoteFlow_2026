
import { saveRecurringAction } from '../lib/actions';
import { WEEKDAYS } from '../lib/format';
import { formatHHMM } from '../lib/engine';
import { ActionForm } from './ActionForm';

export interface RecurringInitial {
  id: string | null;
  title: string;
  instructions: string;
  ownerId: string;
  weekdays: number[];
  dueMinute: number;
}

export function RecurringForm({ initial, people }: { initial: RecurringInitial; people: Array<{ id: string; name: string; empCode: string }> }) {
  return (
    <ActionForm action={saveRecurringAction} submit={initial.id ? 'Save changes' : 'Add recurring task'} className="stack" resetOnSuccess={!initial.id}>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="rt-title">Task</label>
          <input id="rt-title" name="title" className="input" required maxLength={200} defaultValue={initial.title} placeholder="Update stock register" />
        </div>
        <div className="field full">
          <label htmlFor="rt-how">How (instructions)</label>
          <textarea id="rt-how" name="instructions" className="textarea" maxLength={2000} defaultValue={initial.instructions} style={{ minHeight: 60 }} />
        </div>
        <div className="field">
          <label htmlFor="rt-owner">Who</label>
          <select id="rt-owner" name="ownerId" className="select" required defaultValue={initial.ownerId}>
            <option value="" disabled>Choose a person</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.empCode})</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="rt-time">Due time each day (IST)</label>
          <input id="rt-time" name="dueTime" type="time" className="input" required defaultValue={formatHHMM(initial.dueMinute)} />
        </div>
        <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Repeats on</legend>
          <div className="row wrap" style={{ gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label key={d} className="pillcheck">
                <input type="checkbox" name="weekdays" value={d} defaultChecked={initial.weekdays.includes(d)} />
                <span>{WEEKDAYS[d]}</span>
              </label>
            ))}
          </div>
          <span className="hint">Nothing is created on weekly offs or holidays. Each occurrence counts in the person’s MIS.</span>
        </fieldset>
      </div>
    </ActionForm>
  );
}
