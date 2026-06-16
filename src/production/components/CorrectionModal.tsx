// CorrectionModal — wraps a form to correct an existing log entry.
// The parent passes the original entry and save callback.

import { useState } from 'react';
import { X, AlertTriangle, Save } from 'lucide-react';

interface Props {
  entryId: string;
  onClose: () => void;
  onConfirm: (correctionNote: string) => Promise<void>;
  children: React.ReactNode;  // the pre-filled form fields
}

export function CorrectionModal({ entryId, onClose, onConfirm, children }: Props) {
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!note.trim()) { alert('Enter a correction note (reason for change).'); return; }
    setSaving(true);
    try { await onConfirm(note.trim()); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[4px] w-full max-w-[560px] shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#E4E5E6] flex items-center gap-2">
          <AlertTriangle size={14} className="text-[#E9730C] shrink-0" />
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-[#111]">Correct Entry — {entryId}</div>
            <div className="text-[10.5px] text-[#555]">Original data will be marked as corrected with a timestamp.</div>
          </div>
          <button type="button" title="Close" onClick={onClose} className="text-[#555] hover:text-[#111]"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Warning banner */}
          <div className="bg-[#FFF8EC] border border-[#FFE0B2] rounded-[3px] px-3 py-2 text-[11px] text-[#E9730C]">
            ⚠ Editing a production log is audited. Provide a reason below and only change values that are genuinely incorrect.
          </div>

          {/* Injected form fields */}
          {children}

          {/* Correction note (required) */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1">
              Correction Reason *
            </label>
            <textarea
              className="w-full font-sans text-[12px] text-[#111] bg-white border border-[#E9730C] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#E9730C] resize-none h-[64px]"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Wrong qty entered — was 250, should be 200"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[#E4E5E6] flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-[11px] py-[5px] text-[11px] font-medium border border-[#E4E5E6] rounded-[3px] text-[#333] bg-white hover:bg-[#F5F6F7]">
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={!note.trim() || saving}
            className="inline-flex items-center gap-1 px-[11px] py-[5px] text-[11px] font-medium bg-[#E9730C] text-white rounded-[3px] hover:bg-[#BF5D08] disabled:opacity-40">
            <Save size={12} /> {saving ? 'Saving…' : 'Save Correction'}
          </button>
        </div>
      </div>
    </div>
  );
}
