// Module — Docs Gallery
// Central document browser for all prod_attachments.
// Filterable by type, date range, and job card ID.

import { useState, useEffect, useMemo } from 'react';
import { FileText, ExternalLink, Trash2, Loader2, FolderOpen, Search } from 'lucide-react';
import { listAttachments, deleteAttachment, getAttachmentSignedUrl } from '../lib/db';
import { AttachmentUploader } from '../components/AttachmentUploader';
import { PageHeader } from '../components/table';
import type { ProdAttachment } from '../lib/types';
import { useAppStore } from '../../store';

const TYPE_LABELS: Record<string, string> = {
  dpr:     'DPR (Daily Production Report)',
  pdi_doc: 'PDI Document',
  other:   'Other',
};

const today = new Date().toISOString().slice(0, 10);

export function DocsGallery() {
  const { user } = useAppStore();
  const [attachments, setAttachments] = useState<ProdAttachment[]>([]);
  const [loading, setLoading]         = useState(true);

  // Filters
  const [filterType, setFilterType]   = useState<string>('');
  const [filterFrom, setFilterFrom]   = useState<string>('');
  const [filterTo,   setFilterTo]     = useState<string>('');
  const [filterJob,  setFilterJob]    = useState<string>('');

  // Upload panel toggle
  const [showUpload, setShowUpload]   = useState(false);
  const [uploadDate, setUploadDate]   = useState(today);
  const [uploadType, setUploadType]   = useState<'dpr' | 'pdi_doc' | 'other'>('other');
  const [uploadJob,  setUploadJob]    = useState('');

  const load = async () => {
    setLoading(true);
    const data = await listAttachments();
    setAttachments(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return attachments.filter(a => {
      if (filterType && a.type !== filterType) return false;
      if (filterFrom && a.shift_date < filterFrom)  return false;
      if (filterTo   && a.shift_date > filterTo)    return false;
      if (filterJob) {
        const q = filterJob.trim().toLowerCase();
        if (!(a.job_card_id || '').toLowerCase().includes(q) &&
            !(a.log_entry_id || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [attachments, filterType, filterFrom, filterTo, filterJob]);

  const openFile = async (a: ProdAttachment) => {
    const url = await getAttachmentSignedUrl(a.file_path);
    if (url) window.open(url, '_blank');
  };

  const remove = async (a: ProdAttachment) => {
    if (!a.id) return;
    if (!confirm(`Delete "${a.file_name}"? This cannot be undone.`)) return;
    await deleteAttachment(a.id, a.file_path);
    await load();
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        module="Production · Docs"
        title="Document Gallery"
        subtitle="All uploaded attachments — DPRs, PDI docs, and other files."
        actions={
          <button
            type="button"
            onClick={() => setShowUpload(v => !v)}
            className="inline-flex items-center gap-1.5 bg-[#0A6ED1] text-white text-[11px] font-medium px-[11px] py-[5px] rounded-[3px] hover:bg-[#085EA8] transition-colors"
          >
            <FolderOpen size={13} /> {showUpload ? 'Hide Upload' : 'Upload File'}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Upload panel ── */}
        {showUpload && (
          <section className="bg-white border border-[#E4E5E6] rounded-[3px] p-4 space-y-3">
            <span className="text-[11px] font-semibold text-[#111]">Upload a Document</span>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-[#555] mb-1">Type</label>
                <select
                  value={uploadType}
                  onChange={e => setUploadType(e.target.value as typeof uploadType)}
                  title="Document type"
                  className="w-full border border-[#C0C0C0] rounded-[3px] px-2 py-1 text-[11px]"
                >
                  <option value="dpr">DPR</option>
                  <option value="pdi_doc">PDI Document</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[#555] mb-1">Date</label>
                <input
                  type="date"
                  value={uploadDate}
                  onChange={e => setUploadDate(e.target.value)}
                  title="Document date"
                  className="w-full border border-[#C0C0C0] rounded-[3px] px-2 py-1 text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#555] mb-1">Job Card ID (optional)</label>
                <input
                  type="text"
                  value={uploadJob}
                  onChange={e => setUploadJob(e.target.value)}
                  placeholder="e.g. JC-2026-0042"
                  className="w-full border border-[#C0C0C0] rounded-[3px] px-2 py-1 text-[11px]"
                />
              </div>
            </div>
            <AttachmentUploader
              type={uploadType}
              shiftDate={uploadDate}
              jobCardId={uploadJob || undefined}
              label="Drop or browse files"
              onUploaded={load}
            />
          </section>
        )}

        {/* ── Filters ── */}
        <section className="bg-white border border-[#E4E5E6] rounded-[3px] px-3 py-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <Search size={12} className="text-[#888] shrink-0" />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              title="Filter by type"
              className="border border-[#D0D0D0] rounded-[3px] px-2 py-1 text-[11px] text-[#111]"
            >
              <option value="">All Types</option>
              <option value="dpr">DPR</option>
              <option value="pdi_doc">PDI Document</option>
              <option value="other">Other</option>
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#555]">From</span>
              <input
                type="date"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
                title="Filter from date"
                className="border border-[#D0D0D0] rounded-[3px] px-2 py-1 text-[11px]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#555]">To</span>
              <input
                type="date"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
                title="Filter to date"
                className="border border-[#D0D0D0] rounded-[3px] px-2 py-1 text-[11px]"
              />
            </div>
            <input
              type="text"
              value={filterJob}
              onChange={e => setFilterJob(e.target.value)}
              placeholder="Job / Log ID…"
              className="border border-[#D0D0D0] rounded-[3px] px-2 py-1 text-[11px] w-36"
            />
            {(filterType || filterFrom || filterTo || filterJob) && (
              <button
                type="button"
                onClick={() => { setFilterType(''); setFilterFrom(''); setFilterTo(''); setFilterJob(''); }}
                className="text-[10.5px] text-[#0A6ED1] hover:underline"
              >
                Clear
              </button>
            )}
            <span className="ml-auto text-[10px] text-[#888]">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </section>

        {/* ── File list ── */}
        <section>
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-[12px] text-[#555]">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] p-8 text-center text-[12px] text-[#555] italic">
              No documents found.
            </div>
          ) : (
            <div className="bg-white border border-[#E4E5E6] rounded-[3px] overflow-hidden">
              <table className="w-full border-collapse text-[11.5px]">
                <thead className="bg-[#FAFAFA]">
                  <tr>
                    {['File', 'Type', 'Date', 'Shift', 'Job / Log', 'Size', 'Uploaded By', ''].map(h => (
                      <th key={h} className="text-left text-[9.5px] font-semibold uppercase tracking-wider text-[#555] px-3 py-2 border-b border-[#E4E5E6] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id} className="border-b border-[#F3F3F3] hover:bg-[#F5F8FF]">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileText size={12} className="text-[#0A6ED1] shrink-0" />
                          <span className="text-[#111] font-medium truncate max-w-[220px]" title={a.file_name}>
                            {a.file_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-[9.5px] font-medium px-1.5 py-0.5 rounded ${
                          a.type === 'dpr'     ? 'bg-[#E8F5E9] text-[#107E3E]' :
                          a.type === 'pdi_doc' ? 'bg-[#E8F0FD] text-[#0A6ED1]' :
                                                 'bg-[#FFF3E0] text-[#E9730C]'
                        }`}>
                          {a.type === 'dpr' ? 'DPR' : a.type === 'pdi_doc' ? 'PDI' : 'Other'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10.5px] text-[#555] whitespace-nowrap">{a.shift_date}</td>
                      <td className="px-3 py-2 text-[10.5px] text-[#555] capitalize">{a.shift || '—'}</td>
                      <td className="px-3 py-2 font-mono text-[10.5px]">
                        {a.job_card_id
                          ? <span className="text-[#0A6ED1] font-semibold">{a.job_card_id}</span>
                          : a.log_entry_id
                          ? <span className="text-[#555]">{a.log_entry_id}</span>
                          : <span className="text-[#9E9E9E]">—</span>}
                      </td>
                      <td className="px-3 py-2 text-[10.5px] text-[#888] whitespace-nowrap">
                        {a.file_size ? fmtBytes(a.file_size) : '—'}
                      </td>
                      <td className="px-3 py-2 text-[10.5px] text-[#555] max-w-[140px] truncate" title={a.uploaded_by || ''}>
                        {a.uploaded_by || '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => openFile(a)}
                            title="Open file"
                            className="text-[#0A6ED1] hover:text-[#085EA8] p-0.5"
                          >
                            <ExternalLink size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(a)}
                            title="Delete"
                            className="text-[#BB0000] hover:text-[#8E0000] p-0.5"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
