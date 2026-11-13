
import { completeTaskAction } from '../lib/actions';
import { ActionForm } from './ActionForm';
import { Icon } from './Icon';
import { Popover } from './Popover';

/** "Mark done" needs a second click, because a completion cannot be undone and it starts the next step's clock. */
export function CompleteTask({ taskId, compact = false }: { taskId: string; compact?: boolean; inline?: boolean }) {
  return (
    <Popover className={`btn primary ${compact ? 'sm' : ''}`} trigger={<><Icon name="check" size={16} /> Mark done</>}>
      {(close) => (
        <>
          <div style={{ fontWeight: 650, marginBottom: 2 }}>Mark this task as done?</div>
          <p className="small muted" style={{ marginBottom: 10 }}>This cannot be undone. If it is a workflow step, the next step starts now.</p>
          <ActionForm action={completeTaskAction} submit="Confirm done" pending="Saving…" extra={<button type="button" className="btn ghost" onClick={close}>Cancel</button>}>
            <input type="hidden" name="taskId" value={taskId} />
            <div className="field">
              <label htmlFor={`rem-${taskId}`}>Remarks (optional)</label>
              <textarea id={`rem-${taskId}`} name="remarks" className="textarea" maxLength={1000} placeholder="Anything the next person should know" autoFocus style={{ minHeight: 64 }} />
            </div>
          </ActionForm>
        </>
      )}
    </Popover>
  );
}
