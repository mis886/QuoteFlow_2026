import React, { useState, useEffect } from 'react';
import { Package, Plus, Pencil, Trash2, Check, X, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store';
import { ProductCatalogEntry } from '../hooks/useProductCatalog';

const inputCls = 'w-full font-sans text-[13px] text-blk bg-white border border-g300 rounded-[3px] px-3 py-[7px] outline-none focus:border-red-mrt focus:ring-[3px] focus:ring-red-lt transition-shadow';

export function ProductCatalogManager() {
  const { user } = useAppStore();
  const [entries, setEntries] = useState<ProductCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHsn, setNewHsn] = useState('');
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editHsn, setEditHsn] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('product_catalog')
      .select('id, product_name, hsn_code, created_by, updated_by')
      .order('product_name');
    if (!error && data) setEntries(data as ProductCatalogEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) { setAddError('Product name is required.'); return; }
    setAddSaving(true);
    setAddError('');
    const { error } = await supabase
      .from('product_catalog')
      .insert({ product_name: newName.trim(), hsn_code: newHsn.trim() || null, created_by: user?.email ?? null });
    if (error) {
      setAddError(error.code === '23505' ? 'A product with this name already exists.' : error.message);
    } else {
      setNewName(''); setNewHsn('');
      setShowAddForm(false);
      await load();
    }
    setAddSaving(false);
  };

  const startEdit = (entry: ProductCatalogEntry) => {
    setEditId(entry.id);
    setEditName(entry.product_name);
    setEditHsn(entry.hsn_code ?? '');
    setEditError('');
  };

  const cancelEdit = () => { setEditId(null); setEditError(''); };

  const handleSaveEdit = async () => {
    if (!editName.trim()) { setEditError('Product name is required.'); return; }
    setEditSaving(true);
    setEditError('');
    const { error } = await supabase
      .from('product_catalog')
      .update({ product_name: editName.trim(), hsn_code: editHsn.trim() || null, updated_at: new Date().toISOString(), updated_by: user?.email ?? null })
      .eq('id', editId!);
    if (error) {
      setEditError(error.code === '23505' ? 'A product with this name already exists.' : error.message);
    } else {
      setEditId(null);
      await load();
    }
    setEditSaving(false);
  };

  const handleDelete = async (entry: ProductCatalogEntry) => {
    if (!window.confirm(`Delete "${entry.product_name}" from the product catalog?`)) return;
    await supabase.from('product_catalog').delete().eq('id', entry.id);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-[12px] text-g500">
        Manage the list of products shown in the line-item dropdown across Enquiries, Quotes, and Orders.
        HSN codes are auto-filled when a product is selected from this catalog.
      </p>

      <div className="bg-white border border-g200 rounded-[4px] overflow-hidden">
        <div className="px-5 py-3 border-b border-g200 bg-g50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={12} className="text-g400" />
            <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-g600">Product Catalog</span>
            {!loading && (
              <span className="text-[10px] text-g400 font-mono">({entries.length})</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setShowAddForm(v => !v); setAddError(''); setNewName(''); setNewHsn(''); }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-mrt hover:underline"
          >
            <Plus size={11} />{showAddForm ? 'Cancel' : 'Add Product'}
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="px-5 py-4 border-b border-g200 bg-blue-50/40">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">
                  Product Name <span className="text-red-mrt">*</span>
                </label>
                <input
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setAddError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="e.g. Alpha Pinene"
                  className={inputCls}
                />
              </div>
              <div className="w-36">
                <label className="block text-[10px] font-bold text-g500 tracking-[0.5px] uppercase mb-1.5">HSN Code</label>
                <input
                  value={newHsn}
                  onChange={e => setNewHsn(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="e.g. 29021900"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <button
                type="button"
                onClick={handleAdd}
                disabled={addSaving}
                className="shrink-0 h-[38px] px-4 bg-blk text-white text-[11px] font-bold rounded-[3px] hover:bg-g700 disabled:opacity-50 transition-colors"
              >
                {addSaving ? <RefreshCw size={12} className="animate-spin" /> : 'Add'}
              </button>
            </div>
            {addError && <p className="mt-1.5 text-[11px] text-red-mrt font-medium">{addError}</p>}
          </div>
        )}

        {/* Table */}
        <table className="w-full text-left">
          <thead className="bg-g50 border-b border-g200">
            <tr>
              {['Product Name', 'HSN Code', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-[10px] font-bold uppercase text-g400 tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-g100">
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-[12px] text-g400">Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-[12px] text-g400 italic">No products yet — add one above.</td></tr>
            ) : entries.map(entry => (
              editId === entry.id ? (
                <tr key={entry.id} className="bg-blue-50/40">
                  <td className="px-4 py-2">
                    <input
                      value={editName}
                      onChange={e => { setEditName(e.target.value); setEditError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); else if (e.key === 'Escape') cancelEdit(); }}
                      className={`${inputCls} py-[5px] text-[12px]`}
                      autoFocus
                    />
                    {editError && <p className="mt-1 text-[10.5px] text-red-mrt font-medium">{editError}</p>}
                  </td>
                  <td className="px-4 py-2 w-36">
                    <input
                      value={editHsn}
                      onChange={e => setEditHsn(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); else if (e.key === 'Escape') cancelEdit(); }}
                      className={`${inputCls} py-[5px] text-[12px] font-mono`}
                    />
                  </td>
                  <td className="px-4 py-2 w-20">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={editSaving}
                        className="p-1.5 rounded text-green-600 hover:bg-green-50 disabled:opacity-50"
                        title="Save"
                      >
                        {editSaving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button type="button" onClick={cancelEdit} className="p-1.5 rounded text-g400 hover:bg-g100" title="Cancel">
                        <X size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={entry.id} className="hover:bg-g50/50">
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] text-blk">{entry.product_name}</div>
                    {(entry.created_by || entry.updated_by) && (
                      <div className="text-[10px] text-g400 font-mono mt-0.5">
                        {entry.updated_by
                          ? <>Edited by {entry.updated_by}</>
                          : <>Added by {entry.created_by}</>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-g500">{entry.hsn_code || '—'}</td>
                  <td className="px-4 py-2.5 w-20">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        className="p-1.5 rounded text-g400 hover:text-blk hover:bg-g100 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry)}
                        className="p-1.5 rounded text-g400 hover:text-red-mrt hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={12} />
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
  );
}
