import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function SubmitPO() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !quoteId) return;
    setStatus('uploading');
    setErrorMsg('');

    const ext = file.name.split('.').pop();
    const path = `${quoteId}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('po-uploads')
      .upload(path, file);

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }

    // Get public URL and record submission for auto-linking to order
    const { data: urlData } = supabase.storage.from('po-uploads').getPublicUrl(path);
    await supabase.from('po_submissions').insert({
      quote_id: quoteId,
      storage_path: urlData.publicUrl,
    });

    setStatus('done');
  };

  return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center p-5">
      <div className="bg-white rounded-[6px] shadow-xl w-full max-w-[460px] overflow-hidden">

        {/* Header */}
        <div className="bg-[#1a1a1a] px-7 py-5">
          <div className="font-mono text-[9px] font-bold tracking-[3px] uppercase text-red-400 mb-1">
            Himalaya TerpenesRubber Technologies
          </div>
          <h1 className="text-white font-serif text-[20px] tracking-tight leading-tight">
            Submit Purchase Order
          </h1>
          {quoteId && (
            <div className="mt-1 font-mono text-[10.5px] text-white/50">
              Reference: {quoteId}
            </div>
          )}
        </div>

        {status === 'done' ? (
          <div className="px-7 py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="26" height="26" stroke="#22c55e" strokeWidth="2.5" fill="none">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="font-bold text-[16px] text-[#1a1a1a]">PO Submitted Successfully</div>
            <div className="text-[12.5px] text-[#666] leading-relaxed max-w-[300px]">
              Thank you. We have received your Purchase Order and will begin processing shortly.
              Our team will contact you to confirm.
            </div>
            <div className="mt-2 font-mono text-[10px] text-[#999]">You may close this page.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-7 py-6 flex flex-col gap-5">
            <p className="text-[13px] text-[#555] leading-relaxed">
              Please upload your Purchase Order document below. Accepted formats: PDF, Word, or image files.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-[#555] tracking-[0.5px] uppercase mb-2">
                Purchase Order File <span className="text-red-500">*</span>
              </label>
              <div
                className={`relative border-2 border-dashed rounded-[4px] p-5 text-center cursor-pointer transition-colors ${
                  file ? 'border-green-400 bg-green-50' : 'border-[#ccc] hover:border-[#c0392b] bg-[#fafafa]'
                }`}
                onClick={() => document.getElementById('po-file-input')?.click()}
              >
                <input
                  id="po-file-input"
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <>
                    <div className="text-[13px] font-semibold text-green-700">{file.name}</div>
                    <div className="text-[11px] text-green-600 mt-0.5">{(file.size / 1024).toFixed(1)} KB — click to change</div>
                  </>
                ) : (
                  <>
                    <svg className="mx-auto mb-2 text-[#bbb]" viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" strokeWidth="1.5" fill="none">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <div className="text-[13px] text-[#888]">Click to select file</div>
                    <div className="text-[11px] text-[#bbb] mt-0.5">PDF, Word, JPG, PNG</div>
                  </>
                )}
              </div>
            </div>

            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-[4px] p-3 text-[12px] text-red-600 font-medium">
                {errorMsg || 'Upload failed. Please try again.'}
              </div>
            )}

            <button
              type="submit"
              disabled={!file || status === 'uploading'}
              className="w-full h-11 bg-[#c0392b] hover:bg-[#a93226] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[13px] tracking-[1px] rounded-[4px] transition-colors flex items-center justify-center gap-2"
            >
              {status === 'uploading' ? (
                <>
                  <svg className="animate-spin" viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2.5" fill="none">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Uploading…
                </>
              ) : 'Submit Purchase Order'}
            </button>

            <p className="text-[10.5px] text-[#aaa] text-center leading-relaxed">
              Your file is securely uploaded directly to Himalaya TerpenesRubber Technologies.
              We do not share your documents with third parties.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
