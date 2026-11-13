
import { useState } from 'react';
import { createTaskAction } from '../lib/actions';
import { ActionForm } from './ActionForm';

export function NewTaskForm({ people, canAssign, today, defaultOwnerId }: { people: Array<{ id: string; name: string; empCode: string }>; canAssign: boolean; today: string; defaultOwnerId?: string }) {
  const [kind, setKind] = useState<'personal' | 'delegated'>(canAssign && defaultOwnerId ? 'delegated' : 'personal');
  return (
    <ActionForm action={createTaskAction} submit={kind === 'delegated' ? 'Assign task' : 'Add to my list'} pending="Saving…" className="stack">
      <input type="hidden" name="kind" value={kind} />
      {canAssign && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Who is this for?</legend>
          <div className="row wrap">
            <label className="check"><input type="radio" name="kindPick" checked={kind === 'personal'} onChange={() => setKind('personal')} /> Me (private to-do, not scored)</label>
            <label className="check"><input type="radio" name="kindPick" checked={kind === 'delegated'} onChange={() => setKind('delegated')} /> Someone in my team (scored)</label>
          </div>
        </fieldset>
      )}
      <div className="form-grid">
        {kind === 'delegated' && (
          <div className="field full">
            <label htmlFor="ownerId">Assign to</label>
            <select id="ownerId" name="ownerId" className="select" required defaultValue={defaultOwnerId ?? ''}>
              <option value="" disabled>Choose a person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.empCode})</option>
              ))}
            </select>
          </div>
        )}
        <div className="field full">
          <label htmlFor="title">{kind === 'delegated' ? 'What needs to be done' : 'Task'}</label>
          <input id="title" name="title" className="input" required maxLength={200} placeholder={kind === 'delegated' ? 'Send sample tracking details to the buyer' : 'Order packing tape'} />
        </div>
        <div className="field full">
          <label htmlFor="instructions">{kind === 'delegated' ? 'How (instructions)' : 'Notes'}</label>
          <textarea id="instructions" name="instructions" className="textarea" maxLength={2000} placeholder={kind === 'delegated' ? 'Steps, links, who to contact' : 'Optional'} />
        </div>
        <div className="field">
          <label htmlFor="dueDate">Due date</label>
          <input id="dueDate" name="dueDate" type="date" className="input" min={today} defaultValue={today} required />
        </div>
        <div className="field">
          <label htmlFor="dueTime">Due time (IST)</label>
          <input id="dueTime" name="dueTime" type="time" className="input" defaultValue="17:00" required />
        </div>
      </div>
      {kind === 'delegated' ? (
        <p className="hint">Assigned tasks count in the person’s MIS score. The clock is the exact due date and time above.</p>
      ) : (
        <p className="hint">Personal tasks are private to you and never count in your MIS score.</p>
      )}
    </ActionForm>
  );
}
