import { useState } from 'react';
import { useAppStore } from '../store';
import type { CompanyUnit, BankAccount } from '../lib/types';
import { Landmark, Plus, Trash2, Star, Building2, ChevronDown, ChevronRight } from 'lucide-react';

const inputCls = 'w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] px-3 py-[7px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow';
const labelCls = 'block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>;
}

function UnitImageField({ label, hint, value, onChange }: { label: string; hint: string; value: string | null; onChange: (url: string | null) => void }) {
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target?.result as string);
    reader.readAsDataURL(f);
  };
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="text-[10px] text-g400 mb-2">{hint}</div>
      {value ? (
        <div className="border border-g200 rounded-[3px] p-2 bg-g50">
          <img src={value} alt={label} className="max-w-full max-h-[60px] block mx-auto mb-2" />
          <div className="flex items-center justify-center gap-3">
            <label className="cursor-pointer text-[11px] font-semibold text-blue-600 hover:underline">
              Replace
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPick} className="hidden" />
            </label>
            <span className="text-g300">·</span>
            <button type="button" onClick={() => onChange(null)} className="text-[11px] font-semibold text-red-mrt hover:underline">Remove</button>
          </div>
        </div>
      ) : (
        <label className="cursor-pointer block border border-dashed border-g300 rounded-[3px] p-3 text-center text-[11px] text-g500 hover:border-red-mrt hover:bg-red-lt/30 transition-colors">
          Click to upload image
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPick} className="hidden" />
        </label>
      )}
    </div>
  );
}

export function UnitsManager() {
  const { data, addUnit, updateUnit, deleteUnit, addBankAccount, updateBankAccount, deleteBankAccount } = useAppStore();
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnit, setNewUnit] = useState<Partial<CompanyUnit>>({ name: '', gstin: '', address: '', signatory_id: '' });
  const [addBankFor, setAddBankFor] = useState<string | null>(null);
  const [newBank, setNewBank] = useState<Partial<BankAccount>>({ beneficiary: '', bank_name: '', branch_address: '', account_no: '', ifsc: '', branch_code: '', micr: '', swift: '' });
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleAddUnit = async () => {
    setErrorMsg('');
    if (!newUnit.name?.trim()) return;
    const id = 'unit-' + Date.now();
    try {
      await addUnit({
        id,
        name: newUnit.name.trim(),
        gstin: newUnit.gstin?.trim() || undefined,
        address: newUnit.address?.trim() || undefined,
        signatory_id: newUnit.signatory_id || undefined,
        is_default: data.units.length === 0,
      });
      setNewUnit({ name: '', gstin: '', address: '', signatory_id: '' });
      setShowAddUnit(false);
      setExpandedUnit(id);
    } catch (err: any) {
      const msg = err?.message || 'Failed to add unit';
      setErrorMsg(
        msg.includes('relation') || msg.includes('does not exist')
          ? 'Database tables not set up yet. Run the SQL migration for company_units + bank_accounts in Supabase.'
          : msg
      );
    }
  };

  const handleSetDefaultUnit = async (id: string) => {
    for (const u of data.units) {
      if (u.is_default && u.id !== id) await updateUnit(u.id, { is_default: false });
    }
    await updateUnit(id, { is_default: true });
  };

  const handleDeleteUnit = async (id: string) => {
    if (!confirm('Delete this unit? All linked bank accounts will also be deleted.')) return;
    await deleteUnit(id);
  };

  const handleAddBank = async (unitId: string) => {
    if (!newBank.bank_name?.trim() || !newBank.account_no?.trim() || !newBank.ifsc?.trim() || !newBank.beneficiary?.trim()) return;
    const id = 'bank-' + Date.now();
    const unitBanks = data.bankAccounts.filter(b => b.unit_id === unitId);
    await addBankAccount({
      id,
      unit_id: unitId,
      beneficiary: newBank.beneficiary.trim(),
      bank_name: newBank.bank_name.trim(),
      branch_address: newBank.branch_address?.trim() || undefined,
      account_no: newBank.account_no.trim(),
      ifsc: newBank.ifsc.trim().toUpperCase(),
      branch_code: newBank.branch_code?.trim() || undefined,
      micr: newBank.micr?.trim() || undefined,
      swift: newBank.swift?.trim().toUpperCase() || undefined,
      is_default: unitBanks.length === 0,
    });
    setNewBank({ beneficiary: '', bank_name: '', branch_address: '', account_no: '', ifsc: '', branch_code: '', micr: '', swift: '' });
    setAddBankFor(null);
  };

  const handleSetDefaultBank = async (unitId: string, bankId: string) => {
    const unitBanks = data.bankAccounts.filter(b => b.unit_id === unitId);
    for (const b of unitBanks) {
      if (b.is_default && b.id !== bankId) await updateBankAccount(b.id, { is_default: false });
    }
    await updateBankAccount(bankId, { is_default: true });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-[12px] text-g500">
        Manage your company units (e.g. Unit 1, Unit 2). Each unit can have its own GSTIN, address,
        default signatory, letterhead, and multiple bank accounts. The selected unit + bank account appears on the Quotation and Proforma Invoice.
      </p>

      {errorMsg && (
        <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-[3px] text-[12px] text-red-mrt font-medium">{errorMsg}</div>
      )}

      {/* Add Unit Card */}
      {showAddUnit ? (
        <div className="bg-white border border-red-mrt/30 rounded-[4px] p-5 space-y-4">
          <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-g600">New Company Unit</div>
          <Field label="Unit Name">
            <input value={newUnit.name} onChange={e => setNewUnit({ ...newUnit, name: e.target.value })} placeholder="Unit 1 — Meerut Plant" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="GSTIN (optional)">
              <input value={newUnit.gstin} onChange={e => setNewUnit({ ...newUnit, gstin: e.target.value.toUpperCase() })} placeholder="09ABMFM1195K1ZP" className={`${inputCls} font-mono uppercase`} />
            </Field>
            <Field label="Default Signatory">
              <select value={newUnit.signatory_id} onChange={e => setNewUnit({ ...newUnit, signatory_id: e.target.value })} className={inputCls}>
                <option value="">— None —</option>
                {data.signatories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Address (optional, overrides PI header address)">
            <textarea value={newUnit.address} onChange={e => setNewUnit({ ...newUnit, address: e.target.value })} placeholder="319, Shivaji Road; Vijay Nagar; Meerut (UP) – 250002; India" rows={2} className={`${inputCls} resize-none`} />
          </Field>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowAddUnit(false); setNewUnit({ name: '', gstin: '', address: '', signatory_id: '' }); }} className="h-8 px-3 border border-g200 rounded-[3px] text-[11px] font-medium text-g500 hover:bg-g50">Cancel</button>
            <button type="button" onClick={handleAddUnit} disabled={!newUnit.name?.trim()} className="h-8 inline-flex items-center gap-1.5 px-4 bg-red-mrt text-white text-[11px] font-bold tracking-wider uppercase rounded-[3px] hover:bg-red-h disabled:opacity-50">
              <Plus size={11} /> Add Unit
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowAddUnit(true)} className="w-full py-3 border border-dashed border-red-mrt/30 text-red-mrt text-[12px] font-bold uppercase tracking-wider rounded-[3px] hover:bg-red-lt transition-colors inline-flex items-center justify-center gap-2">
          <Plus size={13} /> Add Company Unit
        </button>
      )}

      {/* Existing units */}
      {data.units.length === 0 && !showAddUnit && (
        <div className="bg-g50 border border-g200 rounded-[4px] p-6 text-center">
          <Building2 className="mx-auto text-g300 mb-2" size={28} />
          <div className="text-[12px] font-semibold text-g500">No units configured yet</div>
          <div className="text-[11px] text-g400 mt-0.5">Add your first company unit to begin linking bank accounts.</div>
        </div>
      )}

      {data.units.map(unit => {
        const isExpanded = expandedUnit === unit.id;
        const unitBanks = data.bankAccounts.filter(b => b.unit_id === unit.id);
        const sig = data.signatories.find(s => s.id === unit.signatory_id);
        return (
          <div key={unit.id} className="bg-white border border-g200 rounded-[4px] overflow-hidden">
            {/* Unit header */}
            <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center gap-3">
              <button type="button" onClick={() => setExpandedUnit(isExpanded ? null : unit.id)} className="text-g400 hover:text-blk">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <Building2 size={13} className="text-g500" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-blk">{unit.name}</span>
                  {unit.is_default && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase tracking-wider"><Star size={8} className="fill-amber-500 stroke-amber-500" />Default</span>}
                </div>
                <div className="text-[10px] text-g400 mt-0.5 font-mono truncate">
                  {unit.gstin || '—'} · {unitBanks.length} bank{unitBanks.length === 1 ? '' : 's'}{sig ? ` · ${sig.name}` : ''}
                </div>
              </div>
              {!unit.is_default && (
                <button type="button" onClick={() => handleSetDefaultUnit(unit.id)} title="Set as default" className="text-[10px] text-g500 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 transition-colors font-medium">Set default</button>
              )}
              <button type="button" onClick={() => handleDeleteUnit(unit.id)} title="Delete unit" className="text-g400 hover:text-red-mrt p-1 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>

            {/* Expanded body */}
            {isExpanded && (
              <div className="p-5 space-y-5">
                {/* Unit edit form */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Unit Name">
                      <input value={unit.name} onChange={e => updateUnit(unit.id, { name: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="GSTIN">
                      <input value={unit.gstin ?? ''} onChange={e => updateUnit(unit.id, { gstin: e.target.value.toUpperCase() })} placeholder="09ABMFM1195K1ZP" className={`${inputCls} font-mono uppercase`} />
                    </Field>
                  </div>
                  <Field label="Default Signatory">
                    <select value={unit.signatory_id ?? ''} onChange={e => updateUnit(unit.id, { signatory_id: e.target.value || undefined })} className={inputCls}>
                      <option value="">— None (use default signatory) —</option>
                      {data.signatories.map(s => <option key={s.id} value={s.id}>{s.name} · {s.designation}</option>)}
                    </select>
                  </Field>
                  <Field label="Address">
                    <textarea value={unit.address ?? ''} onChange={e => updateUnit(unit.id, { address: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
                  </Field>
                </div>

                {/* Letterhead + Signature uploads */}
                <div className="border-t border-g200 pt-4">
                  <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-g500 mb-3">PDF Letterhead & Signature</div>
                  <div className="grid grid-cols-2 gap-4">
                    <UnitImageField
                      label="Letterhead (header strip)"
                      hint="Wide landscape image (~2000×300 px) printed at top of Quote/PI"
                      value={unit.header_url ?? null}
                      onChange={url => updateUnit(unit.id, { header_url: url })}
                    />
                    <UnitImageField
                      label="Authorized Signature"
                      hint="Small PNG with transparent background (~400×150 px)"
                      value={unit.sig_url ?? null}
                      onChange={url => updateUnit(unit.id, { sig_url: url })}
                    />
                  </div>
                </div>

                {/* Bank accounts list */}
                <div className="border-t border-g200 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-g500 flex items-center gap-1.5">
                      <Landmark size={11} /> Bank Accounts ({unitBanks.length})
                    </div>
                    {addBankFor !== unit.id && (
                      <button type="button" onClick={() => setAddBankFor(unit.id)} className="text-[10px] font-bold tracking-wider uppercase text-red-mrt hover:bg-red-lt px-2 py-1 rounded inline-flex items-center gap-1">
                        <Plus size={10} /> Add Account
                      </button>
                    )}
                  </div>

                  {/* Add bank form */}
                  {addBankFor === unit.id && (
                    <div className="bg-red-lt/30 border border-red-mrt/20 rounded-[3px] p-4 mb-3 space-y-3">
                      <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-red-mrt">New Bank Account</div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Beneficiary / Account Holder">
                          <input value={newBank.beneficiary} onChange={e => setNewBank({ ...newBank, beneficiary: e.target.value })} placeholder="Himalaya TerpenesRubber Technologies" className={inputCls} />
                        </Field>
                        <Field label="Bank Name">
                          <input value={newBank.bank_name} onChange={e => setNewBank({ ...newBank, bank_name: e.target.value })} placeholder="ICICI Bank Ltd." className={inputCls} />
                        </Field>
                      </div>
                      <Field label="Branch Address">
                        <input value={newBank.branch_address} onChange={e => setNewBank({ ...newBank, branch_address: e.target.value })} placeholder="Meerut Cantt Branch, 123 Main Road" className={inputCls} />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="A/c Number">
                          <input value={newBank.account_no} onChange={e => setNewBank({ ...newBank, account_no: e.target.value })} placeholder="000000000000" className={`${inputCls} font-mono`} />
                        </Field>
                        <Field label="IFSC Code">
                          <input value={newBank.ifsc} onChange={e => setNewBank({ ...newBank, ifsc: e.target.value.toUpperCase() })} placeholder="ICIC0000000" className={`${inputCls} font-mono uppercase`} />
                        </Field>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="Branch Code">
                          <input value={newBank.branch_code} onChange={e => setNewBank({ ...newBank, branch_code: e.target.value })} className={`${inputCls} font-mono`} />
                        </Field>
                        <Field label="MICR Code">
                          <input value={newBank.micr} onChange={e => setNewBank({ ...newBank, micr: e.target.value })} className={`${inputCls} font-mono`} />
                        </Field>
                        <Field label="SWIFT (optional)">
                          <input value={newBank.swift} onChange={e => setNewBank({ ...newBank, swift: e.target.value.toUpperCase() })} className={`${inputCls} font-mono uppercase`} />
                        </Field>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => { setAddBankFor(null); setNewBank({ beneficiary: '', bank_name: '', branch_address: '', account_no: '', ifsc: '', branch_code: '', micr: '', swift: '' }); }} className="h-8 px-3 border border-g200 rounded-[3px] text-[11px] font-medium text-g500 hover:bg-g50">Cancel</button>
                        <button type="button" onClick={() => handleAddBank(unit.id)} disabled={!newBank.bank_name?.trim() || !newBank.account_no?.trim() || !newBank.ifsc?.trim() || !newBank.beneficiary?.trim()} className="h-8 inline-flex items-center gap-1.5 px-4 bg-red-mrt text-white text-[11px] font-bold tracking-wider uppercase rounded-[3px] hover:bg-red-h disabled:opacity-50">
                          <Plus size={11} /> Add Account
                        </button>
                      </div>
                    </div>
                  )}

                  {unitBanks.length === 0 && addBankFor !== unit.id && (
                    <div className="text-[11px] text-g400 italic text-center py-3 border border-dashed border-g200 rounded-[3px]">No bank accounts yet</div>
                  )}

                  <div className="space-y-2">
                    {unitBanks.map(bank => (
                      <div key={bank.id} className="border border-g200 rounded-[3px] p-3 hover:border-g300 transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-[12px] font-bold text-blk truncate">{bank.bank_name}</span>
                            {bank.is_default && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full uppercase"><Star size={8} className="fill-amber-500 stroke-amber-500" />Default</span>}
                          </div>
                          {!bank.is_default && (
                            <button type="button" onClick={() => handleSetDefaultBank(unit.id, bank.id)} className="text-[10px] text-g500 hover:text-amber-700 px-2 py-0.5 rounded hover:bg-amber-50 font-medium">Set default</button>
                          )}
                          <button type="button" onClick={() => { if (confirm('Delete this bank account?')) deleteBankAccount(bank.id); }} className="text-g400 hover:text-red-mrt p-0.5">
                            <Trash2 size={11} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          <div><span className="text-g400 uppercase tracking-wide text-[9px]">Beneficiary:</span> <span className="font-medium text-blk">{bank.beneficiary}</span></div>
                          <div><span className="text-g400 uppercase tracking-wide text-[9px]">A/c:</span> <span className="font-mono font-semibold text-blk">{bank.account_no}</span></div>
                          <div><span className="text-g400 uppercase tracking-wide text-[9px]">IFSC:</span> <span className="font-mono font-semibold text-blk">{bank.ifsc}</span></div>
                          {bank.swift && <div><span className="text-g400 uppercase tracking-wide text-[9px]">SWIFT:</span> <span className="font-mono font-semibold text-blk">{bank.swift}</span></div>}
                          {bank.branch_code && <div><span className="text-g400 uppercase tracking-wide text-[9px]">Branch Code:</span> <span className="font-mono text-blk">{bank.branch_code}</span></div>}
                          {bank.micr && <div><span className="text-g400 uppercase tracking-wide text-[9px]">MICR:</span> <span className="font-mono text-blk">{bank.micr}</span></div>}
                          {bank.branch_address && <div className="col-span-2"><span className="text-g400 uppercase tracking-wide text-[9px]">Branch:</span> <span className="text-blk">{bank.branch_address}</span></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}