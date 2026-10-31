import type React from 'react';
import { Button } from './ui';
import { formatINR, fmtIST } from '../lib/utils';
import type { DispatchEntry, Order } from '../lib/types';

// One dispatch entry as a table row — List → Delivered's columns, every
// header/cell centred both ways.

export const thCenterClsCompact = 'font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[9px] py-[9px] whitespace-nowrap border-b border-g200 text-center align-middle';

const dash = <span className="text-g400">—</span>;

/** Order … Email Sent On header cells; Actions not included. */
export function DispatchEntryHeadCells() {
  const th = thCenterClsCompact;
  return (
    <>
      <th className={th}>Order</th>
      <th className={th}>Customer</th>
      <th className={th}>PO No.</th>
      <th className={th}>Value</th>
      {/* Promised/Estimated Delivery dates stay saved and visible
          in the Edit form — this list shows Invoice No. instead. */}
      <th className={th}>Invoice No.</th>
      <th className={th}>Dispatched On</th>
      <th className={th}>Email Sent On</th>
    </>
  );
}

/**
 * Order … Email Sent On cells for one entry; `orderCell` is the Order column
 * (SO No. over Order Ref). With no entry ("Marked delivered" order) only the
 * order's own fields show; the rest are "—".
 */
export function DispatchEntryCells({ entry, order, orderCell }: { entry?: DispatchEntry; order?: Order; orderCell: React.ReactNode }) {
  const td = 'px-[9px] py-[10px] align-middle text-center';
  return (
    <>
      <td className={td}>{orderCell}</td>
      <td className={`${td} break-words`}>
        <div className="font-semibold">{order?.cust || '—'}</div>
      </td>
      <td className={`${td} font-mono text-[10.5px] break-words`}>{order?.poNo || '—'}</td>
      <td className={`${td} font-mono text-[12px] font-bold whitespace-nowrap`}>{entry ? formatINR(Math.round(entry.value || 0)) : dash}</td>
      <td className={`${td} whitespace-nowrap`}>
        {entry?.invoiceNumber
          ? <span className="block truncate font-mono text-[10.5px] font-semibold" title={entry.invoiceNumber}>{entry.invoiceNumber}</span>
          : dash}
      </td>
      <td className={`${td} whitespace-nowrap`}>{entry?.created_at ? fmtIST(new Date(entry.created_at), 'dd MMM hh:mm a') : '--'}</td>
      <td className={`${td} whitespace-nowrap`}>{entry?.emailSentAt ? fmtIST(new Date(entry.emailSentAt), 'dd-MMM-yyyy hh:mm a') : '—'}</td>
    </>
  );
}

/** Edit / Delete side by side + the last doer's name under them. */
export function DispatchEntryActions({ onEdit, onDelete, doer }: { onEdit: () => void; onDelete?: () => void; doer?: string }) {
  return (
    <div className="flex flex-col gap-[3px] items-center">
      <div className="flex items-center gap-1.5 flex-nowrap justify-center">
        <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>
        {onDelete && (
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={onDelete}>Delete</Button>
        )}
      </div>
      {/* 2026-09-21: shows just the name of whoever made the most
          recent change — updatedBy if the entry's been edited since
          it was created, else createdBy — resolved through the team
          roster to a display name (falls back to the raw email if
          no roster match), single line, no "Created:"/"Updated:"
          label, positioned under the action buttons. */}
      {doer && <span className="text-[10px] font-mono text-g400 whitespace-nowrap" title={doer}>{doer}</span>}
    </div>
  );
}
