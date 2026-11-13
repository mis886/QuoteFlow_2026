
import { useState } from 'react';
import { updateSettingsAction } from '../lib/actions';
import { formatHHMM } from '../lib/engine';
import { WEEKDAYS } from '../lib/format';
import type { AppSettings } from '../lib/types';
import { ActionForm } from './ActionForm';

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const w = settings.work;
  const [lunch, setLunch] = useState(w.lunchStart !== null);
  return (
    <ActionForm action={updateSettingsAction} submit="Save settings" className="stack">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="s-start">Opening time</label>
          <input id="s-start" name="workStart" type="time" className="input" required defaultValue={formatHHMM(w.workStart)} />
        </div>
        <div className="field">
          <label htmlFor="s-end">Close of business</label>
          <input id="s-end" name="workEnd" type="time" className="input" required defaultValue={formatHHMM(w.workEnd)} />
        </div>
        <div className="full">
          <label className="check"><input type="checkbox" name="hasLunch" checked={lunch} onChange={(e) => setLunch(e.target.checked)} /> There is a lunch break (not counted as working time)</label>
        </div>
        {lunch && (
          <>
            <div className="field">
              <label htmlFor="s-ls">Lunch starts</label>
              <input id="s-ls" name="lunchStart" type="time" className="input" required defaultValue={formatHHMM(w.lunchStart ?? 780)} />
            </div>
            <div className="field">
              <label htmlFor="s-le">Lunch ends</label>
              <input id="s-le" name="lunchEnd" type="time" className="input" required defaultValue={formatHHMM(w.lunchEnd ?? 810)} />
            </div>
          </>
        )}
        <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Working days</legend>
          <div className="row wrap" style={{ gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <label key={d} className="pillcheck">
                <input type="checkbox" name="workingDays" value={d} defaultChecked={!w.weeklyOffs.includes(d)} />
                <span>{WEEKDAYS[d]}</span>
              </label>
            ))}
          </div>
          <span className="hint">Unticked days are weekly offs. Task clocks do not run on them.</span>
        </fieldset>
        <div className="field">
          <label htmlFor="s-g">MIS is green up to (% lost)</label>
          <input id="s-g" name="misGreen" type="number" min={0} max={100} step="0.5" className="input" required defaultValue={settings.misGreenLimit} />
        </div>
        <div className="field">
          <label htmlFor="s-a">MIS is amber up to (% lost)</label>
          <input id="s-a" name="misAmber" type="number" min={0} max={100} step="0.5" className="input" required defaultValue={settings.misAmberLimit} />
          <span className="hint">Beyond this the score shows red. Only colours change, never the score itself.</span>
        </div>
      </div>
      <div className="alert info">Changing hours or days recalculates the due time of every workflow step that is open right now. Tasks already finished keep their result.</div>
    </ActionForm>
  );
}
