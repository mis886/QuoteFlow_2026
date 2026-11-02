import { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useAppStore } from '../store';
import { supabase, uploadPublicFile, resolveCoaStorageUrl } from '../lib/supabase';
import { fetchAllRows } from '../lib/fetchAll';
import { logActivity } from '../lib/activityLog';
import { fmtDate } from '../lib/utils';
import type { StockLot } from '../lib/types';

// Stock Summary: adds the missing COA to one lot. Admins pick from the shared
// coa_document library or upload a new PDF (same picker as NewDispatchEntry.tsx);
// everyone else sees the lot read-only.
export function CoaAttachModal({ lot, onClose, onSaved }: { lot: StockLot; onClose: () => void; onSaved: () => void }) {
  const { isAdmin, user, activeDoer } = useAppStore();
  const [coaSearch, setCoaSearch] = useState('');
  const [coaSearchDebounced, setCoaSearchDebounced] = useState('');
  const [coaResults, setCoaResults] = useState<any[]>([]);
  const [coaSearchLoading, setCoaSearchLoading] = useState(false);
  const [picked, setPicked] = useState<{ url: string; name: string } | null>(null);
  const [newCoaFile, setNewCoaFile] = useState<File | null>(null);
  const [coaUploading, setCoaUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setCoaSearchDebounced(coaSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [coaSearch]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    setCoaSearchLoading(true);
    const query = () => supabase.from('coa_document').select('*').order('created_at', { ascending: false }).order('id').abortSignal(controller.signal);
    const load: PromiseLike<{ data: any[] | null; error: any }> = coaSearchDebounced
      ? fetchAllRows(() => query().or(`product_name.ilike.%${coaSearchDebounced}%,lot_no.ilike.%${coaSearchDebounced}%`))
      : query().limit(20);
    load.then(({ data: rows, error: loadError }) => {
      if (controller.signal.aborted) return;
      if (loadError) { console.error(loadError); setCoaResults([]); setCoaSearchLoading(false); return; }
      setCoaResults(rows ?? []);
      setCoaSearchLoading(false);
    });
    return () => controller.abort();
  }, [isAdmin, coaSearchDebounced]);

  const selectCoaDoc = (doc: any) => setPicked({ url: resolveCoaStorageUrl(doc.storage_path), name: doc.file_name });

  const handleUploadNewCoa = async () => {
    setError('');
    if (!newCoaFile) { setError('Choose a PDF to upload.'); return; }
    setCoaUploading(true);
    try {
      const safeProductName = lot.productName.replace(/[^a-zA-Z0-9]/g, '_');
      const path = `COA/${safeProductName}_${Date.now()}.pdf`;
      const { data: url, error: uploadError } = await uploadPublicFile('coa-gc-documents', path, newCoaFile);
      if (uploadError || !url) throw uploadError || new Error('Upload failed');

      const { data: row, error: insertError } = await supabase.from('coa_document').insert({
        product_name: lot.productName,
        lot_no: lot.whLotNo ?? null,
        doc_type: 'COA',
        file_name: newCoaFile.name,
        storage_path: url,
        file_size: newCoaFile.size,
        uploaded_by: user?.email ?? null,
        notes: `Stock lot ${lot.whLotNo || lot.id}`,
      }).select().single();
      if (insertError || !row) throw insertError || new Error('Could not save document reference');

      selectCoaDoc(row);
      setCoaResults(prev => [row, ...prev]);
      setNewCoaFile(null);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to upload document.');
    }
    setCoaUploading(false);
  };

  const save = async () => {
    if (!isAdmin || !picked) return;
    setSaving(true);
    setError('');
    const after = { coa_file: picked.name, coa_url: picked.url };
    const { data: saved, error: saveError } = await supabase.from('stock_lots').update({
      ...after,
      updated_at: new Date().toISOString(),
      updated_by: activeDoer?.email ?? user?.email ?? null,
    }).eq('id', lot.id).select('id');
    if (saveError || !saved?.length) {
      setError(saveError?.message || 'Nothing was saved. The lot may have been removed.');
      setSaving(false);
      return;
    }
    logActivity({
      module: 'stock_movements', recordId: lot.id,
      recordLabel: `COA added · Lot ${lot.whLotNo || '—'} · ${lot.productName}`,
      action: 'update', before: { coa_file: lot.coaFile ?? null, coa_url: lot.coaUrl ?? null }, after,
    });
    onSaved();
  };

  const Detail = ({ label, value }: { label: string; value?: string }) => (
    <div className="min-w-0">
      <div className="font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g400 mb-0.5">{label}</div>
      <div className="text-[12.5px] text-blk truncate" title={value}>{value || '—'}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-g300">
        <div className="p-4 border-b border-g200 flex items-center justify-between">
          <div>
            <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt mb-1">COA missing</div>
            <div className="text-base font-semibold text-blk">Lot {lot.whLotNo || '—'}</div>
          </div>
          <button type="button" title="Close" onClick={onClose} className="p-2 text-g400 hover:text-blk bg-g100 hover:bg-g200 rounded-md transition-colors"><X size={14} strokeWidth={2.5} /></button>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Detail label="Lot No" value={lot.whLotNo} />
            <Detail label="Factory Lot" value={lot.factLotNo} />
            <Detail label="Product" value={lot.productName} />
            <Detail label="Make" value={lot.make} />
            <Detail label="Inward Date" value={lot.inwardDate ? fmtDate(lot.inwardDate) : undefined} />
          </div>

          {!isAdmin ? (
            <div className="mt-5 text-[12.5px] text-g500">Only admins can add COA.</div>
          ) : (
            <div className="mt-5 pt-4 border-t border-g200">
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-g400 pointer-events-none" />
                <input
                  type="text" value={coaSearch} onChange={e => setCoaSearch(e.target.value)}
                  placeholder="Search existing COA by product or lot no."
                  className="w-full font-sans text-xs text-blk bg-white border border-g300 rounded-[3px] py-2 pl-8 pr-8 outline-none focus:border-red-mrt"
                />
                {coaSearchLoading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-g400 animate-spin" />}
              </div>
              <div className="max-h-[160px] overflow-y-auto border border-g200 rounded-[3px] divide-y divide-g100 mb-3">
                {coaResults.length === 0 ? (
                  <div className="text-center py-4 text-g400 text-xs italic">
                    {coaSearchLoading ? 'Searching…' : 'No matching COA documents found.'}
                  </div>
                ) : (
                  coaResults.map(doc => (
                    <button
                      type="button" key={doc.id} onClick={() => selectCoaDoc(doc)}
                      className={`w-full text-left flex items-center gap-3 p-2 hover:bg-g50 ${picked?.url === resolveCoaStorageUrl(doc.storage_path) ? 'bg-red-lt' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-blk truncate">{doc.product_name}{doc.lot_no ? ` — Lot ${doc.lot_no}` : ''}</div>
                        <div className="text-[10px] text-g500 truncate">{doc.file_name}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="pt-2 border-t border-g200">
                <div className="text-[10px] font-medium text-g500 mb-2 uppercase tracking-wider font-mono">Or Upload New COA</div>
                <input
                  type="file" accept=".pdf"
                  onChange={e => setNewCoaFile(e.target.files?.[0] ?? null)}
                  className="w-full font-sans text-xs text-blk bg-white border border-g300 rounded-[3px] p-[6px_10px] outline-none file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-g100 file:text-g700 hover:file:bg-g200"
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button" onClick={handleUploadNewCoa} disabled={coaUploading}
                    className="bg-blk hover:bg-g700 text-white text-xs font-semibold px-4 py-2 rounded shadow-sm disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                  >
                    {coaUploading ? <><Loader2 size={14} className="animate-spin" /> Uploading...</> : 'Upload'}
                  </button>
                </div>
              </div>
              {picked && <div className="mt-3 text-[12px] text-blk truncate">Selected: <span className="font-semibold">{picked.name}</span></div>}
              {error && <p className="mt-2 text-[11px] text-red-mrt font-medium">{error}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={onClose} disabled={saving} className="text-g500 hover:text-blk text-xs font-medium px-3 py-2">Cancel</button>
                <button
                  type="button" onClick={save} disabled={!picked || saving}
                  className="bg-red-mrt hover:bg-red-h text-white text-xs font-semibold px-4 py-2 rounded shadow-sm disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                >
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
