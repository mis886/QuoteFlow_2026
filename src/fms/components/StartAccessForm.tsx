
import { useState } from 'react';
import { setStartAccessAction } from '../lib/actions';
import { ActionForm } from './ActionForm';

export function StartAccessForm({ workflowId, access: initial, starterIds, people }: { workflowId: string; access: 'admin' | 'anyone' | 'selected'; starterIds: string[]; people: Array<{ id: string; name: string; empCode: string }> }) {
  const [access, setAccess] = useState(initial);
  const [starters, setStarters] = useState(starterIds);
  return (
    <ActionForm action={setStartAccessAction} submit="Save" className="stack-sm">
      <input type="hidden" name="workflowId" value={workflowId} />
      <label className="check"><input type="radio" name="startAccess" value="admin" checked={access === 'admin'} onChange={() => setAccess('admin')} /> Admins and its creator only</label>
      <label className="check"><input type="radio" name="startAccess" value="anyone" checked={access === 'anyone'} onChange={() => setAccess('anyone')} /> Anyone who signs in</label>
      <label className="check"><input type="radio" name="startAccess" value="selected" checked={access === 'selected'} onChange={() => setAccess('selected')} /> Selected people</label>
      {access === 'selected' && (
        <div className="check-row" style={{ marginTop: 4 }}>
          {people.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" name="starterIds" value={p.id} checked={starters.includes(p.id)} onChange={(e) => setStarters((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))} />
              {p.name}
            </label>
          ))}
        </div>
      )}
    </ActionForm>
  );
}
