import React, { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from './ui';
import { formatINR } from '../lib/utils';
import { friendlyDeleteError } from '../lib/cascadeDelete';

export interface DownstreamRecord {
  id: string;
  type: 'quote' | 'order' | 'followup';
  status: string;
  grandTotal?: number;
}

const TYPE_LABEL: Record<DownstreamRecord['type'], string> = {
  quote: 'Quotation',
  order: 'Order',
  followup: 'Follow-up on',
};

interface Props {
  recordId: string;
  recordType: 'enquiry' | 'quote';
  downstream: DownstreamRecord[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function CascadeDeleteModal({ recordId, recordType, downstream, onConfirm, onCancel }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const typeLabel = recordType === 'enquiry' ? 'Enquiry' : 'Quotation';

  const handleConfirm = async () => {
    setDeleting(true);
    setError('');
    try {
      await onConfirm();
    } catch (err: any) {
      setError(err ? friendlyDeleteError(err) : 'Delete failed. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blk/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[4px] shadow-2xl w-full max-w-[480px] overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-g200 bg-red-50">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-mrt shrink-0" />
            <h2 className="font-serif text-[16px] text-blk tracking-tight leading-tight">
              Confirm <em className="italic text-red-mrt">Cascading Delete</em>
            </h2>
          </div>
          <button type="button" onClick={onCancel} disabled={deleting}
            className="text-g400 hover:text-blk transition-colors p-1 rounded disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Description */}
          <p className="text-[13px] text-blk leading-snug">
            Deleting <span className="font-mono font-bold">{typeLabel} {recordId}</span> will also{' '}
            <strong className="text-red-mrt">permanently delete</strong>:
          </p>

          {/* Downstream list */}
          <ul className="flex flex-col gap-1.5">
            {downstream.map(r => (
              <li key={r.id}
                className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-[3px] text-[12.5px]">
                <span className="w-1.5 h-1.5 rounded-full bg-red-mrt shrink-0" />
                <span>
                  <span className="font-mono font-bold">{TYPE_LABEL[r.type]} {r.id}</span>
                  {(r.status || r.grandTotal != null) && (
                    <span className="text-g500 ml-1.5">
                      ({[r.status, r.grandTotal != null ? formatINR(Math.round(r.grandTotal)) : null]
                        .filter(Boolean).join(' · ')})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-[11.5px] text-g500 font-medium">
            This cannot be undone.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-[3px] p-[9px_13px] text-[11.5px] text-red-mrt font-medium">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-1 border-t border-g200">
            <Button type="button" variant="secondary" onClick={onCancel} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleConfirm} disabled={deleting}
              className="bg-red-700 border-red-700 hover:bg-red-900">
              {deleting
                ? <><Loader2 size={12} className="animate-spin mr-1.5" />Deleting…</>
                : 'Delete All'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
