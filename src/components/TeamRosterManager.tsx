import React, { useState } from 'react';
import { useAppStore } from '../store';
import { DOER_ROLES, type DoerRole } from '../lib/types';
import { sha256 } from '../lib/doerAuth';
import { Plus, Trash2, Pencil, Check, X, KeyRound } from 'lucide-react';

const inputCls = 'w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] px-3 py-[7px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow';

const ROLE_HELP: Record<DoerRole, string> = {
  'DEO': 'Enters enquiries + items; converts quote→order on PO',
  'Rate Entry': 'Enters rates, turns enquiry into quote, marks sent',
  'SC_1': 'Runs follow-ups per the TAT pipeline after quote sent',
  'Negotiation': 'Handles cards in the Negotiation lane',
  'PI Sender': 'Accounts; issues the Proforma Invoice (scoring coming soon)',
  'Other': 'Any other contributor',
};

export function TeamRosterManager() {
  const { data, addTeamMember, updateTeamMember, deleteTeamMember } = useAppStore();
  const roster = [...data.roster].sort((a, b) =>
    a.display_name.localeCompare(b.display_name) || a.role.localeCompare(b.role));
  const keyOf = (m: { email: string; role: DoerRole }) => `${m.email.toLowerCase()}|${m.role}`;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<DoerRole>('DEO');
  const [aliases, setAliases] = useState('');
  const [err, setErr] = useState('');

  // Edit row is keyed by (email, role); role is part of the identity so it is
  // not editable in place — to change a role, remove the row and add a new one.
  const [editKey, setEditKey] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eActive, setEActive] = useState(true);
  const [eAliases, setEAliases] = useState('');

  // Aliases entered as comma- or newline-separated free text → array.
  const parseAliases = (s: string): string[] =>
    s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);

  const add = async () => {
    setErr('');
    const e = email.trim().toLowerCase();
    if (!name.trim() || !e) { setErr('Name and email are required.'); return; }
    if (data.roster.some(m => m.email.toLowerCase() === e && m.role === role)) {
      setErr(`${e} is already assigned the ${role} role.`); return;
    }
    try {
      await addTeamMember({ email: e, display_name: name.trim(), role, active: true, aliases: parseAliases(aliases) });
      setName(''); setEmail(''); setRole('DEO'); setAliases('');
    } catch { setErr('Could not save — check your connection.'); }
  };

  const startEdit = (m: typeof roster[number]) => {
    setEditKey(keyOf(m)); setEName(m.display_name); setEActive(m.active); setEAliases((m.aliases ?? []).join(', '));
  };
  const saveEdit = async (m: typeof roster[number]) => {
    await updateTeamMember(m.email, m.role, { display_name: eName.trim(), active: eActive, aliases: parseAliases(eAliases) });
    setEditKey(null);
  };

  // Admin sets/clears a doer's identity password. Hashed client-side; the hash
  // (never the password) is stored on the roster row.
  const setPasswordFor = async (m: typeof roster[number]) => {
    const pw = window.prompt(
      `Set a password for ${m.display_name} (${m.role}).\nLeave blank and OK to REMOVE the password.`,
      '',
    );
    if (pw === null) return; // cancelled
    const password_hash = pw.trim() ? await sha256(pw.trim()) : '';
    await updateTeamMember(m.email, m.role, { password_hash });
  };

  return (
    <div className="max-w-3xl">
      <p className="text-[12.5px] text-g500 mb-4 leading-relaxed">
        Map each person to the process role they own. Scores on the <strong className="text-g700">Doer KPI</strong> page
        are attributed by matching the email <em>or</em> name below against the doer / owner recorded on each enquiry,
        quote, order, and follow-up. Inactive members are kept for history but excluded from scoring.
        <br />A login can hold <strong className="text-g700">several roles</strong> (a shared <code>accounts@</code> doing
        DEO + Rate Entry + PI Sender), and a role can be shared by several people — add one row per (person, role). To
        change a row's role, remove it and add a new one.
        <br /><strong className="text-g700">Aliases</strong>: if older records stored a different name for this login
        (e.g. a Google profile name like <code>Himalaya TerpenesRubber Technologies A</code>), list it as an alias so that history
        still attributes correctly.
      </p>

      {/* Add form */}
      <div className="bg-white border border-g200 rounded-[4px] p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1.5fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">Display name</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Disha Khurana" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">Email / login</label>
            <input className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="disha@himalayaterpene.com" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">Role</label>
            <select className={inputCls} value={role} onChange={e => setRole(e.target.value as DoerRole)}>
              {DOER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button type="button" onClick={add}
            className="h-9 inline-flex items-center gap-1.5 px-4 bg-blk text-white text-[12px] font-semibold rounded-[3px] hover:bg-g700 transition-colors">
            <Plus size={13} />Add
          </button>
        </div>
        <div className="mt-3">
          <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">Aliases <span className="text-g400 normal-case font-normal">(optional — other names/emails in old records, comma-separated)</span></label>
          <input className={inputCls} value={aliases} onChange={e => setAliases(e.target.value)} placeholder="Himalaya TerpenesRubber Technologies A, old.email@…" />
        </div>
        <p className="text-[11px] text-g400 mt-2">{ROLE_HELP[role]}</p>
        {err && <p className="text-[11px] text-red-mrt font-medium mt-1.5">{err}</p>}
      </div>

      {/* Roster table */}
      <table className="w-full text-left">
        <thead>
          <tr className="text-g500 font-mono text-[9.5px] tracking-[1px] uppercase border-b border-g200">
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Email</th>
            <th className="px-4 py-2.5">Role</th>
            <th className="px-4 py-2.5">Aliases</th>
            <th className="px-4 py-2.5">Active</th>
            <th className="px-4 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {roster.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-[12px] text-g400 italic">No team members yet — add one above.</td></tr>
          ) : roster.map(m => editKey === keyOf(m) ? (
            <tr key={keyOf(m)} className="border-b border-g100 bg-red-lt/40">
              <td className="px-4 py-2"><input className={inputCls} value={eName} onChange={e => setEName(e.target.value)} /></td>
              <td className="px-4 py-2 text-[12px] text-g500">{m.email}</td>
              <td className="px-4 py-2 text-[12px] text-g600">{m.role}</td>
              <td className="px-4 py-2"><input className={inputCls} value={eAliases} onChange={e => setEAliases(e.target.value)} placeholder="comma-separated" /></td>
              <td className="px-4 py-2">
                <input type="checkbox" checked={eActive} onChange={e => setEActive(e.target.checked)} />
              </td>
              <td className="px-4 py-2 text-right whitespace-nowrap">
                <button type="button" title="Save" onClick={() => saveEdit(m)} className="p-1.5 text-emerald-600 hover:text-emerald-700 rounded"><Check size={15} /></button>
                <button type="button" title="Cancel" onClick={() => setEditKey(null)} className="p-1.5 text-g400 hover:text-blk rounded"><X size={15} /></button>
              </td>
            </tr>
          ) : (
            <tr key={keyOf(m)} className={`border-b border-g100 ${!m.active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2.5 text-[13px] font-medium text-blk">{m.display_name}</td>
              <td className="px-4 py-2.5 text-[12px] text-g500">{m.email}</td>
              <td className="px-4 py-2.5 text-[12px] text-g600">{m.role}</td>
              <td className="px-4 py-2.5 text-[11px] text-g400">{(m.aliases ?? []).length ? (m.aliases ?? []).join(', ') : '—'}</td>
              <td className="px-4 py-2.5 text-[12px]">{m.active ? <span className="text-emerald-600 font-semibold">Yes</span> : <span className="text-g400">No</span>}</td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  title={m.password_hash ? 'Password set — click to change or clear' : 'Set login password'}
                  onClick={() => setPasswordFor(m)}
                  className={`p-1.5 rounded transition-colors ${m.password_hash ? 'text-emerald-600 hover:text-emerald-700' : 'text-g400 hover:text-blk'}`}
                ><KeyRound size={14} /></button>
                <button type="button" title="Edit" onClick={() => startEdit(m)} className="p-1.5 text-g400 hover:text-blk rounded transition-colors"><Pencil size={14} /></button>
                <button type="button" title="Remove" onClick={() => { if (confirm(`Remove ${m.display_name} (${m.role}) from the roster?`)) deleteTeamMember(m.email, m.role); }} className="p-1.5 text-g400 hover:text-red-mrt rounded transition-colors"><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
