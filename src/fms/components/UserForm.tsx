
import { createUserAction, updateUserAction } from '../lib/actions';
import type { UserRow } from '../lib/types';
import { ActionForm } from './ActionForm';

export function UserForm({ user, managers }: { user: UserRow | null; managers: Array<{ id: string; name: string; empCode: string }> }) {
  return (
    <ActionForm action={user ? updateUserAction : createUserAction} submit={user ? 'Save changes' : 'Add person'} resetOnSuccess={!user} className="stack">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="u-name">Full name</label>
          <input id="u-name" name="name" className="input" required maxLength={80} defaultValue={user?.name ?? ''} />
        </div>
        <div className="field">
          <label htmlFor="u-code">Employee code</label>
          <input id="u-code" name="empCode" className="input" required maxLength={24} defaultValue={user?.empCode ?? ''} placeholder="HT-014" autoCapitalize="characters" />
          <span className="hint">Short code shown next to their name. Letters, numbers, dot, dash, underscore.</span>
        </div>
        <div className="field">
          <label htmlFor="u-email">EnqBoss login email</label>
          <input id="u-email" name="email" type="email" className="input" required maxLength={120} defaultValue={user?.email ?? ''} placeholder="name@himalayaterpene.com" />
          <span className="hint">They open FMS from EnqBoss with this login. No separate PIN.</span>
        </div>
        <div className="field">
          <label htmlFor="u-role">Role</label>
          <select id="u-role" name="role" className="select" defaultValue={user?.role ?? 'doer'}>
            <option value="doer">Doer: sees their own tasks and score</option>
            <option value="manager">Manager: also sees their team’s scores</option>
            <option value="admin">Admin: manages people, workflows and settings</option>
          </select>
        </div>
        <div className="field full">
          <label htmlFor="u-mgr">Reports to</label>
          <select id="u-mgr" name="managerId" className="select" defaultValue={user?.managerId ?? ''}>
            <option value="">No manager</option>
            {managers.filter((m) => m.id !== user?.id).map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.empCode})</option>
            ))}
          </select>
          <span className="hint">Their manager, and the managers above them, can see this person’s score.</span>
        </div>
        <div className="full check-row">
          <label className="check"><input type="checkbox" name="isCoordinator" defaultChecked={user?.isCoordinator} /> Process coordinator (sees every late and delayed task)</label>
          <label className="check"><input type="checkbox" name="canCreateWorkflows" defaultChecked={user?.canCreateWorkflows} /> May create workflows</label>
          {user && <label className="check"><input type="checkbox" name="active" defaultChecked={user.active} /> Active (can use FMS)</label>}
        </div>
      </div>
    </ActionForm>
  );
}
