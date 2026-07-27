// Shared <tfoot> block for a quote line-items table: Subtotal (before tax) /
// Insurance / GST Total / Grand Total, styled exactly like NewQuote.tsx's
// Line Items table footer (dark navy Grand Total bar, gray-uppercase labels).
// Reused as-is (not re-styled) by both the real Line Items table and the
// negotiation-round item picker/display, so the two can never visually drift.
//
// Insurance is editable only when onApplyInsurance/onInsuranceChange are
// passed (the real quote form does this); omit them for a read-only display
// (e.g. a saved negotiation round) where insurance is shown but not editable.
export function QuoteTotalsFooter({
  colSpan, curr, subTotal, gstTotal, grandTotal, fmtAmt, insurance,
  onApplyInsurance, onInsuranceChange, trailingCell = false,
}: {
  colSpan: number;
  curr: string;
  subTotal: number;
  gstTotal: number;
  grandTotal: number;
  fmtAmt: (v: number) => string;
  insurance: number;
  onApplyInsurance?: () => void;
  onInsuranceChange?: (v: number) => void;
  // Extra trailing empty <td> per row (real Line Items table has a delete-
  // button column after Amount; the navy Grand Total bar needs to fill it too).
  trailingCell?: boolean;
}) {
  return (
    <tfoot>
      <tr className="border-t border-g200 bg-g50/50">
        <td colSpan={colSpan} className="px-3 py-2 text-right text-[11px] text-g500">Subtotal (before tax)</td>
        <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk">{fmtAmt(subTotal)}</td>
        {trailingCell && <td></td>}
      </tr>
      {curr === 'INR' && (
        <tr className="border-b border-g200 bg-g50/50">
          <td colSpan={colSpan} className="px-3 py-2 text-right">
            <span className="text-[11px] text-g500">Insurance</span>
            {onApplyInsurance && (
              <button
                type="button"
                onClick={onApplyInsurance}
                className="block ml-auto text-[10px] text-blue-600 hover:text-blue-800 underline underline-offset-2 leading-tight"
              >
                Apply 0.15%
              </button>
            )}
          </td>
          <td className="px-3 py-1 text-right">
            {onInsuranceChange ? (
              <input
                type="number"
                min="0"
                step="0.01"
                value={insurance === 0 ? '' : insurance}
                onChange={e => onInsuranceChange(e.target.value === '' ? 0 : Math.round(parseFloat(e.target.value) * 100) / 100)}
                placeholder="0.00"
                className="w-full text-right font-mono text-[12px] font-bold text-blk bg-transparent border-b border-g300 focus:border-blue-500 outline-none py-0.5 pr-0"
              />
            ) : (
              <span className="font-mono text-[12px] font-bold text-blk">{fmtAmt(insurance)}</span>
            )}
          </td>
          {trailingCell && <td></td>}
        </tr>
      )}
      {curr === 'INR' && (
        <tr className="border-b border-g200 bg-g50/50">
          <td colSpan={colSpan} className="px-3 py-2 text-right text-[11px] text-g500">GST Total</td>
          <td className="px-3 py-2 text-right font-mono text-[12px] font-bold text-blk">{fmtAmt(gstTotal)}</td>
          {trailingCell && <td></td>}
        </tr>
      )}
      <tr className="bg-[#1e293b]">
        <td colSpan={colSpan} className="px-3 py-2.5 text-right text-[12px] font-bold text-white">Grand Total</td>
        <td className="px-3 py-2.5 text-right font-mono text-[13px] font-bold text-white">{fmtAmt(grandTotal)}</td>
        {trailingCell && <td className="bg-[#1e293b]"></td>}
      </tr>
    </tfoot>
  );
}
