
import { reassignTaskAction } from '../lib/actions';
import { ActionForm } from './ActionForm';
import { Popover } from './Popover';

export function Reassign({ taskId, currentOwnerId, people }: { taskId: string; currentOwnerId: string; people: Array<{ id: string; name: string; empCode: string }> }) {
  return (
    <Popover trigger="Reassign">
      {(close) => (
        <>
          <div style={{ fontWeight: 650, marginBottom: 2 }}>Reassign this task</div>
          <p className="small muted" style={{ marginBottom: 10 }}>The due time does not change. If it is already overdue, the late mark stays with the person it was late for.</p>
          <ActionForm action={reassignTaskAction} submit="Reassign" extra={<button type="button" className="btn ghost" onClick={close}>Cancel</button>}>
            <input type="hidden" name="taskId" value={taskId} />
            <div className="field">
              <label htmlFor={`ro-${taskId}`}>New owner</label>
              <select id={`ro-${taskId}`} name="ownerId" className="select" required defaultValue="">
                <option value="" disabled>Choose a person</option>
                {people.filter((p) => p.id !== currentOwnerId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.empCode})</option>
                ))}
              </select>
            </div>
          </ActionForm>
        </>
      )}
    </Popover>
  );
}
