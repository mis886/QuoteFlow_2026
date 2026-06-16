import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { uploadToS3, getS3SignedUrl } from '../lib/s3';
import { supabase } from '../lib/supabase';
import { fmtIST } from '../lib/utils';
import { Paperclip, Download, X, Loader2 } from 'lucide-react';

interface AttachmentModalProps {
  entityType: 'enquiry' | 'quote' | 'order';
  entityId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AttachmentModal({ entityType, entityId, isOpen, onClose }: AttachmentModalProps) {
  const { data, updateEnquiry, updateQuote, updateOrder } = useAppStore();
  const [docType, setDocType] = useState('Enquiry Doc');
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [poSubmissions, setPoSubmissions] = useState<any[]>([]);

  // Resolve the full enquiry → quote(s) → order(s) chain from any entry point
  let rootEnq: any = null;
  if (entityType === 'enquiry') {
    rootEnq = data.enquiries.find(e => e.id === entityId);
  } else if (entityType === 'quote') {
    const q = data.quotes.find(qq => qq.id === entityId) as any;
    if (q?.enqRef) rootEnq = data.enquiries.find(e => e.id === q.enqRef);
  } else if (entityType === 'order') {
    const o = data.orders.find(oo => oo.id === entityId) as any;
    if (o?.quoteRef) {
      const q = data.quotes.find(qq => qq.id === o.quoteRef) as any;
      if (q?.enqRef) rootEnq = data.enquiries.find(e => e.id === q.enqRef);
    }
    if (!rootEnq && o?.enqRef) rootEnq = data.enquiries.find(e => e.id === o.enqRef);
  }

  const chainEnqs: any[] = rootEnq ? [rootEnq] : [];
  const chainQuotes: any[] = rootEnq
    ? (data.quotes as any[]).filter(q => q.enqRef === rootEnq.id)
    : (entityType === 'quote' ? [data.quotes.find(q => q.id === entityId)].filter(Boolean) as any[] : []);
  const chainQuoteIds = new Set(chainQuotes.map(q => q.id));
  const chainOrders: any[] = (data.orders as any[]).filter(o =>
    (o.quoteRef && chainQuoteIds.has(o.quoteRef)) ||
    (rootEnq && o.enqRef === rootEnq.id) ||
    (entityType === 'order' && o.id === entityId)
  );

  // Collect every quote_id in the chain for po_submissions lookup
  const quoteIdsForPoLookup = Array.from(chainQuoteIds);

  useEffect(() => {
    if (!isOpen || quoteIdsForPoLookup.length === 0) { setPoSubmissions([]); return; }
    supabase.from('po_submissions').select('*').in('quote_id', quoteIdsForPoLookup)
      .then(({ data: rows }) => setPoSubmissions(rows ?? []));
  }, [isOpen, quoteIdsForPoLookup.join(',')]);

  if (!isOpen) return null;

  const allAttachments: any[] = [];
  for (const e of chainEnqs) {
    if (e?.attachments) allAttachments.push(...e.attachments.map((a: any) => ({ ...a, sourceEntity: e.id })));
  }
  for (const q of chainQuotes) {
    if (q?.attachments) allAttachments.push(...q.attachments.map((a: any) => ({ ...a, sourceEntity: q.id })));
  }
  for (const o of chainOrders) {
    if (o?.attachments) allAttachments.push(...o.attachments.map((a: any) => ({ ...a, sourceEntity: o.id })));
  }

  // Keep legacy refs for "current entity" upload target below
  const relatedEnq = entityType === 'enquiry' ? rootEnq : null;
  const relatedQuote = entityType === 'quote' ? data.quotes.find(q => q.id === entityId) as any : null;
  const relatedOrder = entityType === 'order' ? data.orders.find(o => o.id === entityId) as any : null;

  // Merge po_submissions (customer-uploaded POs via public link) — dedupe by storage_path
  const seenPaths = new Set(allAttachments.map((a: any) => a.storagePath));
  for (const sub of poSubmissions) {
    if (!seenPaths.has(sub.storage_path)) {
      seenPaths.add(sub.storage_path);
      allAttachments.push({
        id: 'posub-' + sub.id,
        fileName: sub.storage_path.split('/').pop()?.split('?')[0] || sub.storage_path,
        storagePath: sub.storage_path,
        docType: 'PO Doc',
        sourceEntity: sub.quote_id,
        uploadedAt: sub.created_at || new Date().toISOString(),
        isPublicUrl: true,
      });
    }
  }
  // Also show poFileName on every order in the chain if not already present
  for (const ord of chainOrders) {
    if (ord?.poFileName && !seenPaths.has(ord.poFileName)) {
      seenPaths.add(ord.poFileName);
      allAttachments.push({
        id: 'po-' + ord.id,
        fileName: ord.poFileName.split('/').pop() || ord.poFileName,
        storagePath: ord.poFileName,
        docType: 'PO Doc',
        sourceEntity: ord.id,
        uploadedAt: ord.poDate || new Date().toISOString(),
        isPublicUrl: ord.poFileName.includes('supabase'),
      });
    }
  }

  const attachments = allAttachments;

  // We still need to know the *current* entity's attachments list to append new uploads to it
  let currentEntityAttachments: any[] = [];
  if (entityType === 'enquiry') currentEntityAttachments = relatedEnq?.attachments || [];
  else if (entityType === 'quote') currentEntityAttachments = relatedQuote?.attachments || [];
  else if (entityType === 'order') currentEntityAttachments = relatedOrder?.attachments || [];

  const handleUpload = async () => {
    if (files.length === 0) return;
    setIsUploading(true);

    const newAttachments = await Promise.all(
      files.map(async (f) => {
        const id = Math.random().toString(36).substr(2, 9);
        const fileName = f.name;
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `${entityType}s/${entityId}/${id}_${safeName}`;
        const storagePath = await uploadToS3(f, path);

        return {
          id,
          fileName,
          docType,
          storagePath: storagePath || `local/${fileName}`,
          uploadedAt: new Date().toISOString()
        };
      })
    );

    const merged = [...currentEntityAttachments.filter(a => !a.id.startsWith('po-')), ...newAttachments];

    try {
      if (entityType === 'enquiry') {
        await updateEnquiry(entityId, { attachments: merged });
      } else if (entityType === 'quote') {
        await updateQuote(entityId, { attachments: merged } as any);
      } else if (entityType === 'order') {
        await updateOrder(entityId, { attachments: merged } as any);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save document reference in database');
    }

    setFiles([]);
    setIsUploading(false);
  };

  const handleDownload = async (att: any) => {
    const { storagePath: path, id, fileName: name, isPublicUrl } = att;
    if (path.startsWith('mock') || downloadingId === id) return;
    setDownloadingId(id);
    // Supabase public URLs (po_submissions) can be opened directly
    if (isPublicUrl || path.startsWith('http')) {
      setDownloadingId(null);
      window.open(path, '_blank', 'noopener');
      return;
    }
    const url = await getS3SignedUrl(path, true);
    setDownloadingId(null);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = name || '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      alert('Failed to get download URL. Ensure the file exists and is accessible.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center animate-in fade-in duration-200" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-g300">
        <div className="p-4 border-b border-g200 flex items-center justify-between bg-white">
          <div>
            <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-red-mrt mb-1">Document Manager</div>
            <div className="text-base font-semibold text-blk">Attachments — {entityId}</div>
          </div>
          <button onClick={onClose} className="p-2 text-g400 hover:text-blk bg-g100 hover:bg-g200 rounded-md transition-colors"><X size={14} strokeWidth={2.5}/></button>
        </div>

        <div className="p-5 overflow-y-auto">
          <div className="flex gap-4">
            <div className="w-1/3">
              <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Document Type</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full font-sans text-xs text-blk bg-white border border-g300 rounded-[3px] p-[8px_10px] outline-none">
                <option>Enquiry Doc</option>
                <option>Drawing</option>
                <option>PO Doc</option>
                <option>General</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-g600 tracking-[0.5px] uppercase mb-[4px]">Choose File(s)</label>
              <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} className="w-full font-sans text-xs text-blk bg-white border border-g300 rounded-[3px] p-[6px_10px] outline-none file:mr-3 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-g100 file:text-g700 hover:file:bg-g200" />
            </div>
          </div>
          
          <div className="flex justify-end mt-4">
            <button onClick={handleUpload} disabled={isUploading || files.length === 0} className="bg-red-mrt hover:bg-red-900 text-white text-xs font-semibold px-4 py-2 rounded shadow-sm disabled:opacity-50 transition-colors inline-flex items-center gap-2">
              {isUploading ? <><Loader2 size={14} className="animate-spin"/> Uploading...</> : 'Upload'}
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-g200">
            <div className="text-[11px] font-medium text-g500 mb-3 uppercase tracking-wider font-mono">Uploaded Files ({attachments.length})</div>
            {attachments.length === 0 ? (
              <div className="text-center py-6 text-g400 text-xs italic bg-g50 rounded border border-dashed border-g200">No attachments found</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {attachments.map((att: any) => (
                  <div key={att.id} className="flex items-center justify-between p-3 bg-white border border-g200 rounded-[3px] hover:border-red-mrt/50 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-red-lt flex flex-col items-center justify-center text-red-mrt">
                        <Paperclip size={14} />
                      </div>
                      <div>
                        <div className="text-[13px] font-bold text-blk leading-tight truncate max-w-[200px]">{att.fileName}</div>
                        <div className="text-[9px] text-g500 font-mono mt-0.5 uppercase flex gap-2">
                          <span className="text-red-mrt">{att.docType || (att.fileName.toLowerCase().includes('drawing') ? 'Drawing' : 'Enquiry Doc')}</span>
                          <span>•</span>
                          <span>{fmtIST(new Date(att.uploadedAt), 'dd-MMM-yyyy')}</span>
                          {att.sourceEntity && (
                            <>
                              <span>•</span>
                              <span className="text-g600">{att.sourceEntity}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownload(att); }}
                      disabled={downloadingId === att.id}
                      className="p-2 text-g400 hover:text-red-mrt transition-colors disabled:opacity-50"
                      title="Download"
                    >
                      {downloadingId === att.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
