// Compounds list — all rubber grades, CRUD.

import { useState } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { Button } from '../../components/ui';
import {
  Table, THead, TH, TR, TD, EmptyRow, PageHeader, FilterBar,
} from '../components/table';
import { useProductionData } from '../lib/useProductionData';
import { upsertCompound, deleteCompound } from '../lib/db';
import type { Compound } from '../lib/types';

export function CompoundsList() {
  const { compounds, loading, refresh } = useProductionData();
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Compound>>({});
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setForm({ grade: 'EPDM', shore_a: 70, shelf_days: 180, colour: 'Black' });
    setEditId(null);
    setShowNew(true);
  };
  const openEdit = (c: Compound) => {
    setForm({ ...c });
    setEditId(c.id);
    setShowNew(true);
  };
  const closeForm = () => { setShowNew(false); setEditId(null); setForm({}); };

  const save = async () => {
    if (!form.code?.trim() || !form.name?.trim()) { alert('Code and Name required.'); return; }
    setSaving(true);
    try {
      await upsertCompound({
        id: editId || `CM${Date.now().toString(36).toUpperCase()}`,
        code: form.code.trim(),
        name: form.name.trim(),
        grade: form.grade || 'EPDM',
        shore_a: form.shore_a || null,
        shelf_days: form.shelf_days || null,
        colour: form.colour || 'Black',
        notes: form.notes || null,
      });
      await refresh();
      closeForm();
    } catch (e) { console.error(e); alert('Save failed.'); }
    finally { setSaving(false); }
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete compound "${name}"? This cannot be undone.`)) return;
    try { await deleteCompound(id); await refresh(); }
    catch (e: any) { alert(e?.message || 'Delete failed — compound may be in use.'); }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        module="Production · Phase 2"
        title="Compounds"
        accent="& Batch"
        subtitle="Rubber compound master — grades, Shore A, shelf life, colour."
        actions={
          <Button variant="primary" onClick={openNew} className="gap-2">
            <Plus size={14} /> New Compound
          </Button>
        }
      />

      <FilterBar>
        <div className="ml-auto font-mono text-[10px] text-[#333]">{compounds.length} compounds</div>
      </FilterBar>

      <div className="px-6 pb-7 pt-[14px] flex-1 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Grade</TH>
              <TH>Shore A</TH>
              <TH>Shelf Life</TH>
              <TH>Colour</TH>
              <TH>Actions</TH>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <EmptyRow colSpan={7} text="Loading…" />
            ) : compounds.length === 0 ? (
              <EmptyRow colSpan={7} text="No compounds yet." />
            ) : compounds.map(c => (
              <TR key={c.id}>
                <TD><span className="font-mono text-[10.5px] font-bold text-[#0A6ED1]">{c.code}</span></TD>
                <TD className="font-semibold text-[#111] text-[12.5px]">{c.name}</TD>
                <TD>
                  <span className="bg-[#FAFAFA] px-2 py-0.5 rounded-[3px] font-mono text-[10.5px] font-bold text-[#444]">
                    {c.grade}
                  </span>
                </TD>
                <TD className="font-mono text-[11.5px]">{c.shore_a != null ? `${c.shore_a}°A` : '—'}</TD>
                <TD className="font-mono text-[11px] text-[#666]">{c.shelf_days ? `${c.shelf_days} days` : '—'}</TD>
                <TD className="text-[12px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border border-[#E4E5E6] shrink-0"
                      style={{ background: c.colour === 'Brown' ? '#8B4513' : c.colour === 'White' ? '#fff' : '#222' }}
                    />
                    {c.colour || '—'}
                  </div>
                </TD>
                <TD>
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => del(c.id, c.code)}
                      className="!text-[#0A6ED1] !border-red-lt">
                      Delete
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>

      {/* Inline new/edit form */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-4" onClick={closeForm}>
          <div className="bg-white rounded-[4px] w-full max-w-[460px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[#111]">
                {editId ? 'Edit Compound' : 'New Compound'}
              </div>
              <button type="button" onClick={closeForm} title="Close" aria-label="Close" className="text-[#333] hover:text-[#111]">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <F label="Code *"><input className={inp} value={form.code || ''} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="EPDM-70" title="Code" /></F>
              <F label="Grade">
                <select className={inp} value={form.grade || ''} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} title="Grade">
                  {['EPDM','NBR','HNBR','FKM','FFKM','SBR','CR','Silicone'].map(g => <option key={g}>{g}</option>)}
                </select>
              </F>
              <F label="Name *" className="col-span-2">
                <input className={inp} value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="EPDM 70 Shore A — General" title="Name" />
              </F>
              <F label="Shore A"><input type="number" className={inp} value={form.shore_a || ''} onChange={e => setForm(f => ({ ...f, shore_a: parseInt(e.target.value) || undefined }))} title="Shore A" /></F>
              <F label="Shelf Life (days)"><input type="number" className={inp} value={form.shelf_days || ''} onChange={e => setForm(f => ({ ...f, shelf_days: parseInt(e.target.value) || undefined }))} title="Shelf days" /></F>
              <F label="Colour">
                <select className={inp} value={form.colour || 'Black'} onChange={e => setForm(f => ({ ...f, colour: e.target.value }))} title="Colour">
                  {['Black','Brown','White','Grey','Red','Green'].map(c => <option key={c}>{c}</option>)}
                </select>
              </F>
            </div>
            <div className="px-4 py-3 border-t border-[#E4E5E6] flex justify-end gap-2">
              <Button variant="secondary" onClick={closeForm}><X size={12} /> Cancel</Button>
              <Button variant="primary" onClick={save} disabled={saving} className="gap-1">
                <Check size={12} /> {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = 'w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt';
function F({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10.5px] font-mono font-bold tracking-wider uppercase text-[#333] mb-1">{label}</label>
      {children}
    </div>
  );
}
