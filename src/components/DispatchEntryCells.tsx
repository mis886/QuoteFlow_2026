import { Button } from './ui';
import { formatINR, fmtIST } from '../lib/utils';
import type { DispatchEntry, Order } from '../lib/types';

// One dispatch entry as a table row — the Table view's Dispatched / Email
// Sent columns. Shared with List → Delivered so both show the same values
// and formatting.

export const thBase = 'font-mono text-[8.5px] font-bold tracking-[1.5px] uppercase text-g500 px-[13px] py-[9px] whitespace-nowrap border-b border-g200';
export const thCls = `${thBase} text-left`;
export const thRightCls = `${thBase} text-right`;
// `compact`: List → Delivered — same cells, 9px side padding instead of 13px.
const thBaseCompact = thBase.replace('px-[13px]', 'px-[9px]');
export const thClsCompact = `${thBaseCompact} text-left`;
const thRightClsCompact = `${thBaseCompact} text-right`;
// `centered`: List → Delivered — every header/cell centred both ways.
export const thCenterClsCompact = `${thBaseCompact} text-center align-middle`;

// Dispatch entries bulk-imported from old "Delivered" orders (before the
// Dispatch module existed) carry created_by = 'system-import'. They're
// skipped by automatic SO numbering and show "—" in SO No. Editing one in
// the form never changes created_by (the form doesn't send it), so this
// sticks.
export const IMPORTED_CREATED_BY = 'system-import';
export const isImportedEntry = (e: DispatchEntry) => e.createdBy === IMPORTED_CREATED_BY;

// `hasOrder` false = dispatch entry with no linked order (or an imported
// entry, which never gets an SO number) → "—"; otherwise a
// missing SO is still being generated → "…".
export function SoCell({ soNumber, hasOrder }: { soNumber?: string; hasOrder: boolean }) {
  if (soNumber) return <span className="font-mono text-[10.5px] font-bold text-sW">{soNumber}</span>;
  return hasOrder ? <span className="font-mono text-[10.5px] text-g400" title="Generating SO number…">…</span> : <span className="text-g400">—</span>;
}

const dash = <span className="text-g400">—</span>;

/** SO No. … Dispatched On (+ Email Sent On) header cells; Actions not included. */
// `hideItemsAndTransporter`: List → Delivered leaves out Items and
// Transporter (the Table keeps them).
export function DispatchEntryHeadCells({ showEmailSent, compact = false, hideItemsAndTransporter = false, centered = false }: { showEmailSent: boolean; compact?: boolean; hideItemsAndTransporter?: boolean; centered?: boolean }) {
  const th = centered ? thCenterClsCompact : compact ? thClsCompact : thCls;
  const thR = centered ? thCenterClsCompact : compact ? thRightClsCompact : thRightCls;
  return (
    <>
      <th className={th}>SO No.</th>
      <th className={th}>Order Ref</th>
      <th className={th}>Customer</th>
      <th className={th}>PO No.</th>
      {!hideItemsAndTransporter && <th className={th}>Items</th>}
      <th className={thR}>Value</th>
      {!hideItemsAndTransporter && <th className={th}>Transporter</th>}
      {/* Promised/Estimated Delivery dates stay saved and visible
          in the Edit form — this list shows Invoice No. instead. */}
      <th className={th}>Invoice No.</th>
      <th className={th}>Dispatched On</th>
      {showEmailSent && <th className={th}>Email Sent On</th>}
    </>
  );
}

/**
 * SO No. … Dispatched On (+ Email Sent On) cells for one entry. With no
 * entry (List → Delivered "Marked delivered" order) only the order's own
 * fields show; the rest are "—".
 */
export function DispatchEntryCells({ entry, order, showEmailSent, compact = false, hideItemsAndTransporter = false, centered = false }: { entry?: DispatchEntry; order?: Order; showEmailSent: boolean; compact?: boolean; hideItemsAndTransporter?: boolean; centered?: boolean }) {
  const td = centered ? 'px-[9px] py-[10px] align-middle text-center'
    : compact ? 'px-[9px] py-[10px] align-top' : 'px-[13px] py-[10px] align-top';
  return (
    <>
      <td className={`${td} whitespace-nowrap`}><SoCell soNumber={order?.soNumber} hasOrder={!!order && !(entry && isImportedEntry(entry))} /></td>
      <td className={`${td} whitespace-nowrap`}><span className="font-mono text-[10px] font-bold text-sQ">{entry?.orderId || order?.id}</span></td>
      <td className={`${td} break-words`}>
        <div className="font-semibold">{order?.cust || '—'}</div>
      </td>
      <td className={`${td} font-mono text-[10.5px] break-words`}>{order?.poNo || '—'}</td>
      {!hideItemsAndTransporter && <td className={`${td} whitespace-nowrap`}>{entry ? `${entry.items?.length ?? 0} item(s)` : dash}</td>}
      <td className={`${td} ${centered ? '' : 'text-right'} font-mono text-[12px] font-bold whitespace-nowrap`}>{entry ? formatINR(Math.round(entry.value || 0)) : dash}</td>
      {!hideItemsAndTransporter && <td className={`${td} break-words`}>{entry?.transporter || '—'}</td>}
      <td className={`${td} whitespace-nowrap`}>
        {entry?.invoiceNumber
          ? <span className="block truncate font-mono text-[10.5px] font-semibold" title={entry.invoiceNumber}>{entry.invoiceNumber}</span>
          : dash}
      </td>
      <td className={`${td} whitespace-nowrap`}>{entry?.created_at ? fmtIST(new Date(entry.created_at), 'dd-MMM-yyyy') : '—'}</td>
      {showEmailSent && (
        <td className={`${td} whitespace-nowrap`}>{entry?.emailSentAt ? fmtIST(new Date(entry.emailSentAt), 'dd-MMM-yyyy hh:mm a') : '—'}</td>
      )}
    </>
  );
}

/** Edit / Delete side by side + the last doer's name under them. */
export function DispatchEntryActions({ onEdit, onDelete, doer, centered = false }: { onEdit: () => void; onDelete?: () => void; doer?: string; centered?: boolean }) {
  return (
    <div className={`flex flex-col gap-[3px] ${centered ? 'items-center' : ''}`}>
      <div className={`flex items-center gap-1.5 flex-nowrap ${centered ? 'justify-center' : ''}`}>
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
