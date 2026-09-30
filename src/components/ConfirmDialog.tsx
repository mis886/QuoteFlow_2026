import React, { useEffect } from 'react';
import { Button } from './ui';

// Small in-app confirm dialog (instead of the browser's window.confirm) —
// used by the Customer Lead page (Promote) and the Lead form (rename warning).
// `tone` picks the confirm button colour: 'lead' = amber, 'success' = green,
// 'default' = the app's red primary.
export function ConfirmDialog({
  title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'default', busy = false, onConfirm, onCancel,
}: {
  title: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'lead' | 'success';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const toneCls = tone === 'lead'
    ? 'bg-lead text-white border-transparent hover:bg-lead-strong hover:shadow-none'
    : tone === 'success'
      ? 'bg-sW text-white border-transparent hover:bg-sW/90 hover:shadow-none'
      : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-[6px] shadow-2xl w-full max-w-md border border-g200 animate-in fade-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-serif text-[18px] text-blk leading-snug">{title}</h3>
          {children && <div className="text-[12.5px] text-g600 mt-2 leading-relaxed">{children}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-g200 bg-g100/40 rounded-b-[6px]">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant="primary" className={toneCls} onClick={onConfirm} disabled={busy}>{busy ? 'Saving…' : confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
