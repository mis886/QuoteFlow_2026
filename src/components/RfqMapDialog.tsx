import React, { useState, useMemo, useCallback } from 'react';
import { X, Check, ArrowUp } from 'lucide-react';
import type { LineItem } from '../lib/types';

type FieldKey = 'seq' | 'desc' | 'mat' | 'qty' | 'uom' | 'drwg' | 'ignore';

const FIELD_OPTIONS: { key: FieldKey; label: string; required: boolean; color: string }[] = [
  { key: 'desc',   label: 'Description', required: true,  color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { key: 'qty',    label: 'Qty',         required: true,  color: 'bg-green-100 text-green-700 border-green-300' },
  { key: 'uom',    label: 'UOM',         required: false, color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { key: 'seq',    label: 'S.No',        required: false, color: 'bg-gray-100 text-gray-600 border-gray-300' },
  { key: 'mat',    label: 'Mat Code',    required: false, color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { key: 'drwg',   label: 'Drawing No',  required: false, color: 'bg-pink-100 text-pink-700 border-pink-300' },
  { key: 'ignore', label: 'Ignore',      required: false, color: 'bg-g100 text-g400 border-g200' },
];

const UOM_SET = new Set([
  'nos','no','ea','each','kg','pcs','pc','set','sets','mtr','m',
  'ltr','l','sht','sheet','roll','pair','nos.','no.','pcs.',
]);

function guessField(header: string): FieldKey {
  const h = header.toLowerCase().trim();
  if (/s\.?no|sr\.?no|item\s*no|line\s*no|sl\.?no|^#$|^no\.$/.test(h)) return 'seq';
  if (/desc|particular|goods|detail|product|item\s*desc/.test(h)) return 'desc';
  if (/mat.*code|item\s*code|part\s*no|sap\s*code|material\s*no/.test(h)) return 'mat';
  if (/^qty|quantity|req.*qty|order.*qty/.test(h)) return 'qty';
  if (/^uom|^unit$|u\/m|base\s*unit/.test(h)) return 'uom';
  if (/draw|drwg|dwg/.test(h)) return 'drwg';
  if (/hsn|price|rate|amount|make|brand|remark/.test(h)) return 'ignore';
  return 'ignore';
}

function cleanNum(s: string): number | null {
  const m = s.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function normaliseUom(raw: string): string {
  const u = raw.trim().toUpperCase();
  const map: Record<string, string> = { 'NOS.': 'NOS', 'NO.': 'NOS', 'PCS.': 'PCS', 'KGS': 'KG' };
  return map[u] ?? u;
}

interface Props {
  headers: string[];
  rows: string[][];
  onApply: (items: LineItem[]) => void;
  onClose: () => void;
}

export function RfqMapDialog({ headers, rows, onApply, onClose }: Props) {
  // col index → field assignment
  const [mapping, setMapping] = useState<Record<number, FieldKey>>(() => {
    const m: Record<number, FieldKey> = {};
    if (headers.length === 1) { m[0] = 'desc'; return m; }
    headers.forEach((h, i) => { m[i] = guessField(h); });
    return m;
  });

  // 0-based inclusive range — user can pick where data starts and ends
  const [startRow, setStartRow] = useState(0);
  const [endRow, setEndRow] = useState(rows.length - 1);

  // Editable local copy of rows — user can merge continuation rows into the row above
  const [localRows, setLocalRows] = useState<string[][]>(() => rows.map(r => [...r]));

  // Merge row at index ri into the row above — concatenates desc-column cells, removes ri
  const mergeUp = useCallback((ri: number) => {
    setLocalRows(prev => {
      if (ri <= 0) return prev;
      const next = prev.map(r => [...r]);
      // Append every non-empty cell from ri into the same column of ri-1
      next[ri - 1] = next[ri - 1].map((cell, ci) => {
        const below = (next[ri][ci] ?? '').trim();
        return below ? (cell.trim() ? cell.trim() + ' ' + below : below) : cell;
      });
      next.splice(ri, 1);
      return next;
    });
    // Keep endRow in bounds after splice
    setEndRow(prev => Math.min(prev, rows.length - 2));
  }, [rows.length]);

  const isSingleCol = headers.length === 1;

  // Validate: only desc is required; qty is optional (defaults to 0 if not mapped)
  const hasDesc = Object.values(mapping).includes('desc');
  const canApply = hasDesc;

  // Returns all column indices (sorted ascending) assigned to a given key
  const colsOf = (key: FieldKey): number[] =>
    Object.entries(mapping)
      .filter(([, v]) => v === key)
      .map(([k]) => +k)
      .sort((a, b) => a - b);

  // Preview first 5 rows mapped to LineItems
  const preview = useMemo<LineItem[]>(() => {
    const descCols = colsOf('desc');
    const qtyCols  = colsOf('qty');
    const uomCols  = colsOf('uom');
    const matCols  = colsOf('mat');
    const seqCols  = colsOf('seq');
    const drwgCols = colsOf('drwg');

    return localRows.slice(startRow, Math.min(endRow + 1, startRow + 5)).flatMap((row, ri) => {
      let desc = descCols.map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
      let qty: number | null = null;
      let uom = 'NOS';

      if (isSingleCol) {
        const line = row[0] ?? '';
        const m = line.match(/(\d+(?:\.\d+)?)\s*(nos?|pcs?|ea|each|kg|mtr?s?|m|no|sets?)\s*$/i);
        if (m) {
          qty = parseFloat(m[1]);
          uom = normaliseUom(m[2]);
          desc = line.slice(0, line.lastIndexOf(m[0])).trim();
        } else {
          return [];
        }
      } else {
        const qtyRaw = qtyCols.map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
        const uomRaw = uomCols.map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
        qty = cleanNum(qtyRaw);
        uom = uomRaw ? normaliseUom(uomRaw) : 'NOS';
      }

      if (!desc) return [];

      const seqRaw  = seqCols.map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
      const matRaw  = matCols.map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
      const drwgRaw = drwgCols.map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');

      return [{
        seq:  cleanNum(seqRaw) ?? ri + 1,
        desc: desc.replace(/\s+/g, ' '),
        mat:  matRaw.replace(/^0+/, '').trim(),
        qty: qty ?? 0,
        uom,
        drwg: drwgRaw.replace(/^[-–]$/, '').trim(),
      }] as LineItem[];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, localRows, isSingleCol, startRow, endRow]);

  const handleApply = () => {
    const items: LineItem[] = [];
    localRows.slice(startRow, endRow + 1).forEach((_row) => {
      const row = _row;
      let desc = colsOf('desc').map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
      let qty: number | null = null;
      let uom = 'NOS';

      if (isSingleCol) {
        const line = row[0] ?? '';
        const m = line.match(/(\d+(?:\.\d+)?)\s*(nos?|pcs?|ea|each|kg|mtr?s?|m|no|sets?)\s*$/i);
        if (m) {
          qty = parseFloat(m[1]);
          uom = normaliseUom(m[2]);
          desc = line.slice(0, line.lastIndexOf(m[0])).trim();
        }
      } else {
        const qtyRaw  = colsOf('qty').map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
        const uomRaw  = colsOf('uom').map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
        qty = cleanNum(qtyRaw);
        uom = uomRaw ? normaliseUom(uomRaw) : 'NOS';
      }

      if (!desc) return;

      const seqRaw  = colsOf('seq').map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
      const matRaw  = colsOf('mat').map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');
      const drwgRaw = colsOf('drwg').map(ci => (row[ci] ?? '').trim()).filter(Boolean).join(' ');

      items.push({
        seq:  cleanNum(seqRaw) ?? items.length + 1,
        desc: desc.replace(/\s+/g, ' '),
        mat:  matRaw.replace(/^0+/, '').trim(),
        qty: qty ?? 0,
        uom,
        drwg: drwgRaw.replace(/^[-–]$/, '').trim(),
      });
    });

    onApply(items.map((it, i) => ({ ...it, seq: i + 1 })));
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[4px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-g200">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-g200 flex items-center justify-between shrink-0">
          <div>
            <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-amber-600 mb-0.5">Beta — Manual Column Mapping</div>
            <div className="text-[14px] font-semibold text-blk">Map PDF Columns to Item Fields</div>
          </div>
          <button type="button" title="Close" onClick={onClose} className="p-1.5 text-g400 hover:text-blk bg-g100 hover:bg-g200 rounded transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Column assignment */}
          {!isSingleCol && (
            <div>
              <div className="text-[10px] font-bold text-g500 uppercase tracking-wider mb-3">
                Assign each column to a field — <span className="text-red-mrt">Description</span> is required
              </div>
              <div className="flex flex-wrap gap-2">
                {headers.map((h, ci) => (
                  <div key={ci} className="flex flex-col gap-1 min-w-[100px]">
                    <div className="text-[9px] font-mono text-g500 truncate max-w-[120px]" title={h}>{h || `Col ${ci + 1}`}</div>
                    <select
                      value={mapping[ci] ?? 'ignore'}
                      onChange={e => setMapping(prev => ({ ...prev, [ci]: e.target.value as FieldKey }))}
                      title={`Map column: ${h || `Col ${ci + 1}`}`}
                      className={`text-[11px] font-semibold border rounded-[3px] px-2 py-1 outline-none cursor-pointer ${
                        FIELD_OPTIONS.find(f => f.key === (mapping[ci] ?? 'ignore'))?.color ?? 'bg-g100 text-g500'
                      }`}
                    >
                      {FIELD_OPTIONS.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                    {/* Sample value from first data row */}
                    {rows[0]?.[ci] && (
                      <div className="text-[9px] text-g400 truncate max-w-[120px]" title={rows[0][ci]}>{rows[0][ci]}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isSingleCol && (
            <div className="bg-amber-50 border border-amber-200 rounded-[3px] px-4 py-3 text-[11px] text-amber-800">
              Free-text format detected — qty and UOM will be extracted from the end of each line automatically.
            </div>
          )}

          {/* Raw data preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold text-g500 uppercase tracking-wider">
                Raw Data — click to set start <span className="text-g300 font-normal normal-case">/</span> shift-click to set end
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-blue-600 font-semibold">→ Start</span>
                  <input
                    type="number"
                    min={1}
                    max={endRow + 1}
                    title="Start from row"
                    aria-label="Start from row"
                    value={startRow + 1}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setStartRow(Math.max(0, Math.min(endRow, v - 1)));
                    }}
                    className="w-12 text-center text-[11px] font-mono font-semibold border border-blue-300 rounded-[3px] px-1 py-0.5 outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-red-500 font-semibold">End ←</span>
                  <input
                    type="number"
                    min={startRow + 1}
                    max={rows.length}
                    title="End at row"
                    aria-label="End at row"
                    value={endRow + 1}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setEndRow(Math.max(startRow, Math.min(rows.length - 1, v - 1)));
                    }}
                    className="w-12 text-center text-[11px] font-mono font-semibold border border-red-300 rounded-[3px] px-1 py-0.5 outline-none focus:border-red-400"
                  />
                  <button
                    type="button"
                    title="Set to last row"
                    onClick={() => setEndRow(rows.length - 1)}
                    className="text-[9px] text-red-400 hover:text-red-600 font-semibold underline underline-offset-2 whitespace-nowrap"
                  >last</button>
                </div>
                <span className="text-[10px] text-g400">of {rows.length}</span>
              </div>
            </div>
            <div className="overflow-auto max-h-64 border border-g200 rounded-[3px]">
              <table className="w-full text-left">
                <thead className="bg-g50 border-b border-g200 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-[9px] font-bold text-g300 w-7">#</th>
                    {headers.map((h, ci) => (
                      <th key={ci} className="px-3 py-2 text-[9px] font-bold uppercase text-g400 tracking-wider whitespace-nowrap">
                        <div>{h || `Col ${ci + 1}`}</div>
                        {!isSingleCol && (
                          <div className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                            FIELD_OPTIONS.find(f => f.key === (mapping[ci] ?? 'ignore'))?.color ?? ''
                          }`}>
                            {FIELD_OPTIONS.find(f => f.key === (mapping[ci] ?? 'ignore'))?.label}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-g100">
                  {localRows.map((row, ri) => {
                    const isStart = ri === startRow;
                    const isEnd   = ri === endRow;
                    const isAbove = ri < startRow;
                    const isBelow = ri > endRow;
                    const inRange = !isAbove && !isBelow;
                    // Row has no qty value — candidate for merging up
                    const qtyCols = colsOf('qty');
                    const hasNoQty = !isSingleCol && ri > 0 &&
                      qtyCols.length > 0 &&
                      qtyCols.every(ci => !(row[ci] ?? '').trim());
                    return (
                      <tr
                        key={ri}
                        onClick={e => {
                          if (e.shiftKey) {
                            setEndRow(Math.max(startRow, ri));
                          } else {
                            setStartRow(ri);
                            setEndRow(prev => Math.max(ri, prev));
                          }
                        }}
                        title={`Click: start from row ${ri + 1} · Shift-click: end at row ${ri + 1}`}
                        className={`cursor-pointer transition-colors ${
                          isStart ? 'bg-blue-50' :
                          isEnd   ? 'bg-red-50'  :
                          isAbove || isBelow ? 'opacity-30 hover:opacity-55 hover:bg-g50' :
                          'hover:bg-g50'
                        }`}
                      >
                        <td className="px-2 py-2 text-[9px] font-mono w-7 select-none">
                          {isStart ? <span className="text-blue-500 font-bold">→</span>
                          : isEnd  ? <span className="text-red-400 font-bold">←</span>
                          : <span className={inRange ? 'text-g400' : 'text-g200'}>{ri + 1}</span>}
                        </td>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            title={cell}
                            className={`px-3 py-2 text-[11px] max-w-[200px] truncate ${
                              isStart ? 'text-blue-800 font-medium' :
                              isEnd   ? 'text-red-700 font-medium'  :
                              inRange ? 'text-blk' : 'text-g300'
                            }`}
                          >{cell}</td>
                        ))}
                        {/* Merge-up button — shown on rows with no qty value */}
                        <td className="px-1 py-1 w-6" onClick={e => e.stopPropagation()}>
                          {hasNoQty && (
                            <button
                              type="button"
                              title="Merge into row above"
                              onClick={() => mergeUp(ri)}
                              className="p-0.5 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                            >
                              <ArrowUp size={11} strokeWidth={2.5} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mapped preview */}
          {preview.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-g500 uppercase tracking-wider mb-2">
                Preview — {preview.length} item{preview.length !== 1 ? 's' : ''} from first 5 rows
              </div>
              <div className="border border-g200 rounded-[3px] divide-y divide-g100">
                {preview.map((it, i) => (
                  <div key={i} className="px-3 py-2 flex items-start gap-3 text-[11px]">
                    <span className="font-mono text-g400 shrink-0 w-5">{it.seq}.</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-blk">{it.desc}</span>
                      {it.mat && <span className="ml-2 text-g400 font-mono text-[9px]">[{it.mat}]</span>}
                    </div>
                    <span className="shrink-0 font-mono text-g600">{it.qty} {it.uom}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!canApply && (
            <p className="text-[10.5px] text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              Assign at least one column as Description.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-g200 flex items-center justify-between shrink-0 bg-g50">
          <span className="text-[10px] text-g400">
            Rows <span className="font-semibold text-blue-600">{startRow + 1}</span>–<span className="font-semibold text-red-500">{endRow + 1}</span> selected &nbsp;·&nbsp; {localRows.length} total
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-g300 text-[11px] text-g600 font-semibold rounded-[3px] hover:bg-g100 transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="px-4 py-2 bg-blk text-white text-[11px] font-bold rounded-[3px] hover:bg-g700 disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              <Check size={12} strokeWidth={3} /> Apply {preview.length > 0 ? `(${localRows.slice(startRow, endRow + 1).filter(r => r.some(c => c.trim())).length} rows)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
