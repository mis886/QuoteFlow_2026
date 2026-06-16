import React, { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../lib/supabase';
import { useAppStore } from '../store';
import { hasActiveToken } from '../lib/gmail';
import { RefreshCw, Save, Plus, Trash2, Check, Landmark, Mail, Star, Lock, Puzzle, RotateCcw, Pencil, X, GitBranch, Users } from 'lucide-react';
import { UnitsManager } from '../components/UnitsManager';
import { TeamRosterManager } from '../components/TeamRosterManager';
import { PinGate } from '../components/PinGate';
import { BOARD_LANES, DEFAULT_STAGE_TAT_H, DEFAULT_STAGE_ROLE, DOER_ROLES, type BoardLane, type DoerRole } from '../lib/types';

type Tab = 'signatories' | 'units' | 'gmail' | 'intel' | 'integrations' | 'pipeline' | 'roster';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] px-3 py-[7px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow';

export function Settings() {
  const { data, refreshData, syncGmailEnquiries, addSignatory, updateSignatory, deleteSignatory } = useAppStore();
  const [tab, setTab] = useState<Tab>('signatories');
  // Admin PIN gate for sensitive tabs (roster / pipeline / integrations).
  // Reuses intelligence_pin; one unlock covers all three for the session.
  const adminPin = data.settings?.intelligence_pin ?? '';
  const [adminUnlocked, setAdminUnlocked] = useState(() =>
    !adminPin || sessionStorage.getItem('admin_unlocked') === '1'
  );
  const handleAdminUnlock = () => { sessionStorage.setItem('admin_unlocked', '1'); setAdminUnlocked(true); };
  const GATED_TABS: Tab[] = ['roster', 'pipeline', 'integrations'];
  const tabLocked = GATED_TABS.includes(tab) && !!adminPin && !adminUnlocked;
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Bank
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [swift, setSwift] = useState('');

  // Intel
  const [intelPin, setIntelPin] = useState('');

  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetsDriveFolderId, setSheetsDriveFolderId] = useState('');

  // Pipeline TAT (total HOURS per lane; edited as days + hours)
  const [pipelineTatH, setPipelineTatH] = useState<Record<BoardLane, number>>({ ...DEFAULT_STAGE_TAT_H });
  const [pipelineRoles, setPipelineRoles] = useState<Record<BoardLane, DoerRole>>({ ...DEFAULT_STAGE_ROLE });

  // Gmail
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [gmailLabels, setGmailLabels] = useState('');
  const [gmailFreq, setGmailFreq] = useState(15);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [tokenActive, setTokenActive] = useState(false);

  // Signatory form
  const [showSigForm, setShowSigForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDes, setNewDes] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Signatory edit
  const [editSigId, setEditSigId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDes, setEditDes] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const startEditSig = (sig: { id: string; name: string; designation: string; phone?: string }) => {
    setEditSigId(sig.id);
    setEditName(sig.name);
    setEditDes(sig.designation);
    setEditPhone(sig.phone || '');
    setShowSigForm(false);
  };

  const saveEditSig = async () => {
    if (!editSigId || !editName.trim() || !editDes.trim()) return;
    await updateSignatory(editSigId, { name: editName.trim(), designation: editDes.trim(), phone: editPhone.trim() });
    setEditSigId(null);
  };

  useEffect(() => { setTokenActive(hasActiveToken()); }, []);

  useEffect(() => {
    getSettings().then(s => {
      if (!s) return;
      setBankName(s.bank_name ?? '');
      setAccountNo(s.bank_acc ?? '');
      setIfsc(s.bank_ifsc ?? '');
      setSwift(s.bank_swift ?? '');
      setGmailEnabled(s.gmail_enabled ?? false);
      setGmailLabels((s.gmail_labels ?? []).join(', '));
      setGmailFreq(s.gmail_sync_freq ?? 15);
      setIntelPin(s.intelligence_pin ?? '');
      setSheetsUrl(s.sheets_webhook_url ?? '');
      setSheetsDriveFolderId(s.sheets_drive_folder_id ?? '');
      // Prefer hour-precise config; fall back to legacy days (×24), then defaults.
      const fromDays = s.pipeline_tat
        ? Object.fromEntries(Object.entries(s.pipeline_tat).map(([k, v]) => [k, (v as number) * 24]))
        : {};
      setPipelineTatH({ ...DEFAULT_STAGE_TAT_H, ...fromDays, ...(s.pipeline_tat_h ?? {}) });
      setPipelineRoles({ ...DEFAULT_STAGE_ROLE, ...(s.pipeline_roles ?? {}) });
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg('');
    try {
      const { error } = await updateSettings({
        bank_name: bankName,
        bank_acc: accountNo,
        bank_ifsc: ifsc,
        bank_swift: swift,
        gmail_enabled: gmailEnabled,
        gmail_labels: gmailLabels.split(',').map(l => l.trim()).filter(Boolean),
        gmail_sync_freq: gmailFreq,
        intelligence_pin: intelPin.trim() || undefined,
        sheets_webhook_url: sheetsUrl.trim() || undefined,
        sheets_drive_folder_id: sheetsDriveFolderId.trim() || undefined,
        pipeline_tat_h: pipelineTatH,
        pipeline_roles: pipelineRoles,
      });
      if (error) throw error;
      await refreshData();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const addSig = async () => {
    if (!newName.trim() || !newDes.trim()) return;
    await addSignatory({ id: 'sig-' + Date.now(), name: newName.trim(), designation: newDes.trim(), phone: newPhone.trim(), is_default: data.signatories.length === 0 });
    setNewName(''); setNewDes(''); setNewPhone('');
    setShowSigForm(false);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'units',       label: 'Units & Bank',  icon: <Landmark size={13} /> },
    { id: 'signatories', label: 'Signatories',   icon: <Star size={13} /> },
    { id: 'pipeline', label: 'Pipeline TAT',    icon: <GitBranch size={13} /> },
    { id: 'roster', label: 'Team Roster',       icon: <Users size={13} /> },
    { id: 'gmail', label: 'Gmail Integration',  icon: <Mail size={13} /> },
    { id: 'intel', label: 'Intelligence',       icon: <Lock size={13} /> },
    { id: 'integrations', label: 'Integrations', icon: <Puzzle size={13} /> },
  ];

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">

      {/* Page header */}
      <div className="px-6 pt-5 pb-4 border-b border-g200 bg-white flex items-center justify-between shrink-0">
        <div>
          <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-mrt mb-0.5">Configuration</div>
          <h1 className="font-serif text-[22px] text-blk tracking-tight leading-tight">System <em className="italic text-red-mrt">Settings</em></h1>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="h-9 inline-flex items-center gap-2 px-4 bg-blk text-white text-[12px] font-semibold rounded-[3px] hover:bg-g700 disabled:opacity-50 transition-colors"
        >
          {saved ? <><Check size={13} />Saved</> : isSaving ? <><RefreshCw size={13} className="animate-spin" />Saving…</> : <><Save size={13} />Save Settings</>}
        </button>
      </div>

      {errorMsg && (
        <div className="mx-6 mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-[3px] text-[12px] text-red-mrt font-medium">{errorMsg}</div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-g200 bg-white px-6 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-[12px] font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-red-mrt text-red-mrt'
                : 'border-transparent text-g500 hover:text-blk hover:border-g300'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">

        {/* Admin PIN gate for sensitive tabs */}
        {tabLocked ? (
          <PinGate
            correctPin={adminPin}
            onUnlock={handleAdminUnlock}
            title="Admin settings"
            subtitle="Enter the PIN to manage this section"
          />
        ) : (
        <>
        {/* ── App Tour (always visible) ── */}
        <div className="max-w-3xl mb-6">
          <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
            <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center gap-2">
              <RotateCcw size={12} className="text-g400" />
              <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-g600">App Tour</span>
            </div>
            <div className="p-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-[13px] font-semibold text-blk">Replay Onboarding Tour</div>
                <p className="text-[12px] text-g500 mt-0.5">Re-run the guided feature walkthrough from the beginning.</p>
              </div>
              <button
                type="button"
                onClick={() => { localStorage.removeItem('enqboss_tour_done'); window.location.reload(); }}
                className="shrink-0 h-8 inline-flex items-center gap-1.5 px-3 border border-g200 bg-white text-blk text-[11px] font-mono font-bold tracking-[1.5px] uppercase rounded-[3px] hover:bg-g100 transition-colors"
              >
                <RotateCcw size={11} /> Replay
              </button>
            </div>
          </div>
        </div>

        {/* ── Signatories ── */}
        {tab === 'signatories' && (
          <div className="max-w-3xl space-y-6">

            <p className="text-[12px] text-g500">
              Letterhead and signature images are now uploaded per company unit. Manage them under the <strong className="text-g700">Units & Bank</strong> tab.
            </p>

            {/* Signatories */}
            <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star size={12} className="text-g400" />
                  <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Authorized Signatories</span>
                </div>
                <button type="button" onClick={() => setShowSigForm(v => !v)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-mrt hover:underline">
                  <Plus size={11} />{showSigForm ? 'Cancel' : 'Add'}
                </button>
              </div>

              {showSigForm && (
                <div className="px-5 py-4 border-b border-g200 bg-blue-50/40 grid grid-cols-3 gap-3">
                  <Field label="Name *">
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Harshit Kumar" className={inputCls} />
                  </Field>
                  <Field label="Designation *">
                    <input value={newDes} onChange={e => setNewDes(e.target.value)} placeholder="Director" className={inputCls} />
                  </Field>
                  <Field label="Phone">
                    <div className="flex gap-2">
                      <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+91 9000000000" className={inputCls} />
                      <button type="button" onClick={addSig} className="px-3 bg-blk text-white text-[11px] font-bold rounded-[3px] hover:bg-g700 shrink-0">Add</button>
                    </div>
                  </Field>
                </div>
              )}

              <table className="w-full text-left">
                <thead className="bg-g50 border-b border-g200">
                  <tr>
                    {['Name', 'Designation', 'Phone', 'Default', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase text-g400 tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-g100">
                  {data.signatories.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-[12px] text-g400 italic">No signatories yet — add one above.</td></tr>
                  ) : data.signatories.map(sig => (
                    editSigId === sig.id ? (
                      <tr key={sig.id} className="bg-blue-50/40">
                        <td className="px-3 py-2">
                          <input value={editName} onChange={e => setEditName(e.target.value)} className={inputCls} placeholder="Name" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={editDes} onChange={e => setEditDes(e.target.value)} className={inputCls} placeholder="Designation" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className={inputCls} placeholder="+91 9000000000" />
                        </td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={saveEditSig} className="px-3 py-1.5 bg-blk text-white text-[11px] font-bold rounded-[3px] hover:bg-g700">Save</button>
                            <button type="button" title="Cancel edit" onClick={() => setEditSigId(null)} className="p-1.5 text-g400 hover:text-blk rounded transition-colors"><X size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                    <tr key={sig.id} className="hover:bg-g50 transition-colors">
                      <td className="px-4 py-3 text-[13px] font-semibold text-blk">{sig.name}</td>
                      <td className="px-4 py-3 text-[12.5px] text-g600">{sig.designation}</td>
                      <td className="px-4 py-3 text-[12.5px] text-g500 font-mono">{sig.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          title="Set as default"
                          onClick={async () => {
                            for (const s of data.signatories) if (s.is_default) await updateSignatory(s.id, { is_default: false });
                            await updateSignatory(sig.id, { is_default: true });
                          }}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${sig.is_default ? 'border-red-mrt bg-red-mrt' : 'border-g300 hover:border-red-mrt'}`}
                        >
                          {sig.is_default && <Check size={10} className="text-white" strokeWidth={3} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" title="Edit signatory" onClick={() => startEditSig(sig)} className="p-1.5 text-g400 hover:text-blk rounded transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button type="button" title="Delete signatory" onClick={() => deleteSignatory(sig.id)} className="p-1.5 text-g400 hover:text-red-mrt rounded transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Units & Bank Accounts ── */}
        {tab === 'units' && <UnitsManager />}

        {tab === 'roster' && <TeamRosterManager />}

        {/* ── Pipeline TAT ── */}
        {tab === 'pipeline' && (
          <div className="max-w-xl space-y-5">
            <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center gap-2">
                <GitBranch size={12} className="text-g400" />
                <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Stage Turnaround Times (TAT)</span>
              </div>
              <div className="p-5">
                <p className="text-[12px] text-g500 mb-4">
                  How long a card may sit in each pipeline stage before it's flagged — set in
                  <span className="font-semibold text-blk"> days and hours</span>.
                  Cards turn <span className="font-semibold text-amber-600">amber at 80%</span> of the TAT and
                  <span className="font-semibold text-red-mrt"> red once breached</span>. The pre-quote lanes use
                  the enquiry's urgency SLA, so the value below is only a fallback.
                </p>
                <div className="space-y-2">
                  {/* Column labels */}
                  <div className="flex items-center justify-between gap-3 pb-1 text-[9px] font-bold uppercase tracking-wider text-g400">
                    <span>Stage</span>
                    <div className="flex items-center gap-2">
                      <span className="w-[110px] text-center">Owner role</span>
                      <span className="w-16 text-center">Days</span>
                      <span className="w-16 text-center">Hours</span>
                      <span className="w-14 text-right">= Total</span>
                    </div>
                  </div>
                  {BOARD_LANES.filter(l => l !== 'Closed').map(lane => {
                    const totalH = pipelineTatH[lane] ?? 0;
                    const days = Math.floor(totalH / 24);
                    const hrs = totalH % 24;
                    const setLane = (d: number, h: number) =>
                      setPipelineTatH(prev => ({ ...prev, [lane]: Math.max(0, d) * 24 + Math.max(0, h) }));
                    return (
                      <div key={lane} className="flex items-center justify-between gap-3 py-1.5 border-b border-g100 last:border-0">
                        <span className="text-[13px] text-blk font-medium">{lane}</span>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`${lane} owner role`}
                            className="w-[110px] font-sans text-[12px] bg-white border border-g300 rounded-[3px] px-2 py-[6px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt"
                            value={pipelineRoles[lane] ?? DEFAULT_STAGE_ROLE[lane]}
                            onChange={e => setPipelineRoles(prev => ({ ...prev, [lane]: e.target.value as DoerRole }))}
                          >
                            {DOER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <input
                            type="number" min={0} step={1}
                            aria-label={`${lane} TAT days`}
                            className="w-16 font-mono text-[13px] text-right bg-white border border-g300 rounded-[3px] px-2 py-[6px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt"
                            value={days}
                            onChange={e => setLane(Number(e.target.value) || 0, hrs)}
                          />
                          <input
                            type="number" min={0} max={23} step={1}
                            aria-label={`${lane} TAT hours`}
                            className="w-16 font-mono text-[13px] text-right bg-white border border-g300 rounded-[3px] px-2 py-[6px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt"
                            value={hrs}
                            onChange={e => setLane(days, Number(e.target.value) || 0)}
                          />
                          <span className="w-14 text-right font-mono text-[11px] text-g500">{totalH}h</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setPipelineTatH({ ...DEFAULT_STAGE_TAT_H }); setPipelineRoles({ ...DEFAULT_STAGE_ROLE }); }}
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold tracking-wider uppercase text-g500 hover:text-blk transition-colors"
                  >
                    <RotateCcw size={11} /> Reset to defaults
                  </button>
                  <span className="text-[10px] text-g400">Closed lane has no TAT.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Gmail Integration ── */}
        {tab === 'gmail' && (
          <div className="max-w-lg space-y-5">

            {/* Status card */}
            <div className={`rounded-[4px] border p-4 flex items-center gap-3 ${tokenActive ? 'bg-green-50 border-green-200' : 'bg-g50 border-g200'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tokenActive ? 'bg-green-100' : 'bg-g100'}`}>
                <Mail size={14} className={tokenActive ? 'text-green-600' : 'text-g400'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[12.5px] font-semibold ${tokenActive ? 'text-green-800' : 'text-g600'}`}>
                  {tokenActive ? 'Connected to Gmail' : 'Not authorized — click Sync Now to connect'}
                </div>
                <div className="text-[11px] text-g400 font-mono mt-0.5">info@himalayaterpene.com · Google Workspace</div>
              </div>
              {data.settings?.gmail_last_sync && (
                <div className="text-right shrink-0">
                  <div className="text-[9px] text-g400 uppercase tracking-wide">Last sync</div>
                  <div className="text-[11px] font-mono text-g600">{new Date(data.settings.gmail_last_sync).toLocaleString()}</div>
                </div>
              )}
            </div>

            <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center gap-2">
                <Mail size={12} className="text-g400" />
                <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Sync Configuration</span>
              </div>
              <div className="p-5 space-y-5">

                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-semibold text-blk">Auto-sync enquiry emails</div>
                    <div className="text-[11.5px] text-g500 mt-0.5">Emails from monitored labels are imported as New enquiries</div>
                  </div>
                  <button
                    type="button"
                    title="Toggle Gmail sync"
                    aria-label="Toggle Gmail sync"
                    onClick={() => setGmailEnabled(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${gmailEnabled ? 'bg-red-mrt' : 'bg-g300'}`}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${gmailEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <Field label="Gmail Labels to Monitor">
                  <input
                    value={gmailLabels}
                    onChange={e => setGmailLabels(e.target.value)}
                    placeholder="Indiamart Enquiry, Enquiries, Sales Leads"
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11px] text-g400">Comma-separated, exactly as they appear in Gmail.</p>
                </Field>

                <Field label="Sync Frequency">
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={gmailFreq}
                      aria-label="Sync frequency in minutes"
                      onChange={e => setGmailFreq(Number(e.target.value))}
                      className={`${inputCls} w-24`}
                    />
                    <span className="text-[12.5px] text-g500">minutes</span>
                  </div>
                </Field>

                {/* Sync now */}
                <div className="pt-1 border-t border-g100">
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={async () => {
                      setIsSyncing(true);
                      setSyncError('');
                      try {
                        await syncGmailEnquiries();
                        setTokenActive(hasActiveToken());
                      } catch (err: any) {
                        setSyncError(err?.message || 'Sync failed. Please try again.');
                        setTokenActive(hasActiveToken());
                      }
                      setIsSyncing(false);
                    }}
                    className="inline-flex items-center gap-2 h-9 px-4 bg-blk text-white text-[12px] font-semibold rounded-[3px] hover:bg-g700 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                  {syncError ? (
                    <p className="mt-2 text-[11.5px] text-red-mrt font-medium">{syncError}</p>
                  ) : (
                    <p className="mt-2 text-[11px] text-g400">Google OAuth consent will appear on first sync per browser session.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Intelligence ── */}
        {tab === 'intel' && (
          <div className="max-w-lg space-y-5">
            <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center gap-2">
                <Lock size={12} className="text-g400" />
                <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Customer Intel Board Access</span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-[12px] text-g500 leading-relaxed">
                  Set a PIN to restrict access to the Customer Intel page. Only users who enter the correct PIN can view customer analytics, win rates, and revenue data.
                  Leave blank to allow all logged-in users.
                  <br /><span className="text-g600 font-medium">This same PIN also guards the Team Roster, Pipeline TAT, and Integrations tabs.</span>
                </p>
                <Field label="Access PIN">
                  <input
                    type="password"
                    value={intelPin}
                    onChange={e => setIntelPin(e.target.value)}
                    placeholder="Leave blank to disable lock"
                    maxLength={12}
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11px] text-g400">4–12 characters. Anyone with app access can attempt the PIN, so pick something non-obvious.</p>
                </Field>
                {intelPin.trim() && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-[3px]">
                    <Lock size={11} className="text-amber-600 shrink-0" />
                    <span className="text-[11.5px] text-amber-800">PIN protection active — save settings to apply.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Integrations ── */}
        {tab === 'integrations' && (
          <div className="max-w-lg space-y-5">
            <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
              <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center gap-2">
                <Puzzle size={12} className="text-g400" />
                <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Google Sheets</span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-[12px] text-g500 leading-relaxed">
                  Connect to a Google Sheet via an Apps Script Web App to export orders directly from the Orders page.
                  No Google login required — just a published Web App URL.
                </p>
                <Field label="Apps Script Web App URL">
                  <input
                    type="text"
                    value={sheetsUrl}
                    onChange={e => setSheetsUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11px] text-g400">
                    In your Google Sheet: Extensions → Apps Script → Deploy → New deployment → Web App (Execute as: Me, Access: Anyone). Paste the URL here.
                  </p>
                </Field>
                <Field label="Google Drive Folder ID">
                  <input
                    type="text"
                    value={sheetsDriveFolderId}
                    onChange={e => setSheetsDriveFolderId(e.target.value)}
                    placeholder="e.g. 1Fh5Z1OyINNQWFkmuFO9EGW0yA0C-KQHKZNw6qbzvnFU"
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11px] text-g400">
                    Open the Drive folder → copy the ID from the URL (the long string after /folders/). PO files and drawing attachments will be saved here.
                  </p>
                </Field>
                {sheetsUrl.trim() && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-[3px]">
                    <Puzzle size={11} className="text-green-600 shrink-0" />
                    <span className="text-[11.5px] text-green-800">Sheets export active — 'Export to Sheets' button will appear on Orders.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
