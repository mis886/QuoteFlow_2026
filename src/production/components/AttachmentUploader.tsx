// AttachmentUploader — reusable DPR / PDI document uploader.
// Uploads to Supabase Storage bucket 'prod-docs' and inserts a record
// in prod_attachments. Shows existing attachments for the given context.

import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, ExternalLink, Loader2, Paperclip } from 'lucide-react';
import {
  listAttachments, uploadAttachment, deleteAttachment, getAttachmentSignedUrl,
} from '../lib/db';
import type { ProdAttachment } from '../lib/types';
import { useAppStore } from '../../store';

interface Props {
  type: 'dpr' | 'pdi_doc' | 'other';
  shiftDate: string;           // YYYY-MM-DD
  shift?: 'day' | 'night';
  jobCardId?: string;          // for pdi_doc
  logEntryId?: string;         // optional backlink e.g. MLD-2026-00001
  label?: string;              // section label shown in UI
  accept?: string;             // e.g. ".pdf,.jpg,.png"
  onUploaded?: () => void;     // called after each successful upload
}

export function AttachmentUploader({
  type, shiftDate, shift, jobCardId, logEntryId, label, accept = '.pdf,.jpg,.jpeg,.png', onUploaded,
}: Props) {
  const { user } = useAppStore();
  const [attachments, setAttachments] = useState<ProdAttachment[]>([]);
  const [uploading, setUploading]     = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const list = await listAttachments({ type, shift_date: shiftDate, job_card_id: jobCardId });
    // Further filter by shift if provided
    setAttachments(shift ? list.filter(a => !a.shift || a.shift === shift) : list);
  };

  useEffect(() => { load(); }, [type, shiftDate, shift, jobCardId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          setError(`${file.name} exceeds 10 MB limit.`);
          continue;
        }
        await uploadAttachment(file, {
          type,
          shift_date:   shiftDate,
          shift:        shift ?? null,
          job_card_id:  jobCardId ?? null,
          log_entry_id: logEntryId ?? null,
          uploaded_by:  user?.email ?? null,
        });
      }
      await load();
      onUploaded?.();
    } catch (e: any) {
      setError(e?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const openFile = async (a: ProdAttachment) => {
    const url = await getAttachmentSignedUrl(a.file_path);
    if (url) window.open(url, '_blank');
  };

  const remove = async (a: ProdAttachment) => {
    if (!a.id) return;
    if (!confirm(`Remove ${a.file_name}?`)) return;
    await deleteAttachment(a.id, a.file_path);
    await load();
  };

  const displayLabel = label ?? (type === 'dpr' ? 'DPR Attachment' : type === 'pdi_doc' ? 'PDI Document' : 'Attachment');

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Paperclip size={12} className="text-[#555]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555]">{displayLabel}</span>
        <span className="text-[9.5px] text-[#888]">(PDF, JPG, PNG · max 10 MB)</span>
      </div>

      {/* Existing attachments */}
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map(a => (
            <div key={a.id} className="flex items-center gap-2 bg-[#F5F6F7] border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5">
              <FileText size={12} className="text-[#0A6ED1] shrink-0" />
              <span className="flex-1 text-[11px] text-[#111] truncate">{a.file_name}</span>
              {a.file_size && (
                <span className="text-[9.5px] text-[#888] whitespace-nowrap">{fmtBytes(a.file_size)}</span>
              )}
              <button type="button" onClick={() => openFile(a)} title="Open"
                className="text-[#0A6ED1] hover:text-[#085EA8] p-0.5">
                <ExternalLink size={11} />
              </button>
              <button type="button" onClick={() => remove(a)} title="Remove"
                className="text-[#BB0000] hover:text-[#8E0000] p-0.5">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / upload button */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-[3px] px-3 py-3 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-[#0A6ED1] bg-[#E8F0FD]'
            : 'border-[#C0C0C0] hover:border-[#0A6ED1] hover:bg-[#FAFAFA]'
        }`}
        onClick={() => inputRef.current?.click()}
      >
        {uploading
          ? <div className="flex items-center justify-center gap-2 text-[11px] text-[#555]"><Loader2 size={13} className="animate-spin" /> Uploading…</div>
          : <div className="flex items-center justify-center gap-2 text-[11px] text-[#555]">
              <Upload size={12} />
              <span>Drop file here or <span className="text-[#0A6ED1] underline">browse</span></span>
            </div>
        }
        <input ref={inputRef} type="file" accept={accept} multiple className="hidden"
          title="Upload attachment" onChange={e => handleFiles(e.target.files)} />
      </div>

      {error && <div className="text-[10.5px] text-[#BB0000]">{error}</div>}
    </div>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
