// The ONE Product Name box for Enquiry / Quotation / Order / Dispatch / Sampling.
//
// 2026-11-18: TYPEABLE again (user decision). The user can type any product
// name, or pick one from the master list (product_catalog, active rows).
//
// - Typing filters the suggestion list live (case-insensitive; every typed word
//   anywhere in the name; names starting with the text come first).
//   Up / Down / Enter / Escape.
// - When the typed text isn't exactly a list name, the first row is
//   `Use "<typed text>"` so Enter keeps what was typed.
// - Leaving the box keeps what was typed. If it matches a list name (any
//   capitals) it becomes that list name and its HSN fills in; otherwise the
//   typed name is kept and HSN is blank.
// - onChange(name, hsn) — hsn is '' for names not on the list.
//
// 2026-11-19: Enquiry / Quotation / Order / Dispatch pass the PRODUCTS names
// (src/lib/lineItemProducts.ts) as `names` and fill Billing Name + HSN
// themselves; Sampling still passes the product_catalog names. Matching a
// typed name to a list name ignores capitals AND extra spaces.
//
// Before 2026-11-18 (from 2026-11-14) this box was STRICT: only list names could
// be saved, typed text was thrown away on leaving the box with a "Select a product
// from the list" warning, and old names showed in amber and blocked Save.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { normName } from '../lib/lineItemProducts';

interface Props {
  value: string;
  onChange: (name: string, hsn: string) => void;
  names: string[];                 // active master-list names (suggestions)
  hsnMap: Record<string, string>;  // name → HSN ('' = none)
  error?: boolean;
  placeholder?: string;
  className?: string;
}

export const productHsn = (hsnMap: Record<string, string>, name: string) => hsnMap[name] ?? '';

export interface LineItemProblem {
  row: number;                 // 0-based row index (-1 = not about one row)
  field: 'product' | 'qty';
  message: string;
}

/** Save check shared by the 5 forms — the FIRST problem, or null.
 *  Per row, in order: no product name → "Row X: Enter a product name";
 *  with checkQty, quantity empty / 0 → "Row X: Enter a quantity greater than 0".
 *  Any typed name is allowed (the list is only suggestions). A blank HSN is
 *  never a problem. `include` limits the check to some rows (row numbers stay
 *  the on-screen ones). `names` is kept so the 5 forms don't need changing. */
export function lineItemProblem(
  rows: { desc?: string | null; qty?: number | string | null }[],
  names: string[],
  opts: { checkQty?: boolean; include?: (row: { desc?: string | null; qty?: number | string | null }) => boolean } = {},
): LineItemProblem | null {
  void names;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (opts.include && !opts.include(r)) continue;
    const d = (r.desc || '').trim();
    if (!d) return { row: i, field: 'product', message: `Row ${i + 1}: Enter a product name` };
    if (opts.checkQty && !(Number(r.qty) > 0)) return { row: i, field: 'qty', message: `Row ${i + 1}: Enter a quantity greater than 0` };
  }
  return null;
}

/** 2026-11-19: Billing Name cell of the Enquiry / Quotation / Order / Dispatch
 *  line items. Filled from the Product Name by the form; the user may type or
 *  correct it. Spaces at the ends are dropped on leaving the box. */
export function BillingNameInput({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const v = value || '';
  return (
    <input
      type="text"
      value={v}
      title="Billing Name — printed on the Quotation and PI. Filled from the Product Name; you can type or correct it."
      placeholder="—"
      onChange={e => onChange(e.target.value)}
      onBlur={() => { if (v.trim() !== v) onChange(v.trim()); }}
      className="w-full bg-transparent outline-none text-[12px] font-sans text-blk placeholder:text-g300"
    />
  );
}

export function ProductSelect({ value, onChange, names, hsnMap, error, placeholder = 'Type or search product…', className }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const typing = query !== value;
  const typed = query.trim();
  const exactName = useMemo(
    () => names.find(n => normName(n) === normName(typed)),
    [names, typed],
  );

  // Every typed word must appear somewhere in the name ("beta 98" finds
  // "Beta Pinene 98%"); names starting with the typed text come first.
  const filtered = useMemo(() => {
    const q = typing ? normName(typed) : '';
    if (!q) return names;
    const words = q.split(' ');
    const hits = names.filter(n => { const ln = normName(n); return words.every(w => ln.includes(w)); });
    const starts = (n: string) => normName(n).startsWith(q);
    return [...hits.filter(starts), ...hits.filter(n => !starts(n))];
  }, [typed, typing, names]);

  // Rows shown: an optional "Use <typed>" row first, then the list matches.
  const showUseTyped = typing && !!typed && !exactName;
  const options: { name: string; custom: boolean }[] = useMemo(
    () => [
      ...(showUseTyped ? [{ name: typed, custom: true }] : []),
      ...filtered.map(n => ({ name: n, custom: false })),
    ],
    [showUseTyped, typed, filtered],
  );

  useEffect(() => { setActiveIdx(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const calcPos = () => {
    const r = containerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 240) });
  };

  // Save a name: a list name (any capitals) becomes that list name + its HSN;
  // anything else is kept as typed with a blank HSN.
  const commit = (raw: string) => {
    const text = raw.trim();
    const listName = names.find(n => normName(n) === normName(text));
    const finalName = listName ?? text;
    setQuery(finalName);
    setOpen(false);
    if (finalName !== value) onChange(finalName, listName ? productHsn(hsnMap, listName) : '');
  };

  // Leaving the box keeps whatever was typed.
  const handleBlur = () => {
    setOpen(false);
    if (typing) commit(query);
  };

  // Closing only — leaving the box (blur) is what saves.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') return;  // blur follows and saves
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); calcPos(); setOpen(true); }
      else if (e.key === 'Enter') { e.preventDefault(); if (typing) commit(query); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[activeIdx]) commit(options[activeIdx].name);
      else commit(query);
    }
    else if (e.key === 'Escape') { e.preventDefault(); setQuery(value); setOpen(false); }
  };

  return (
    <div ref={containerRef} className={`${className || ''} ${error ? 'rounded-[2px] ring-1 ring-red-mrt bg-red-lt/40 px-1 -mx-1' : ''}`}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-invalid={error || undefined}
        onChange={e => { setQuery(e.target.value); if (!open) calcPos(); setOpen(true); }}
        onFocus={e => { e.target.select(); calcPos(); setOpen(true); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent outline-none text-[12px] font-sans text-blk ${error ? 'placeholder:text-red-300' : 'placeholder:text-g300'}`}
      />
      {open && pos && options.length > 0 && ReactDOM.createPortal(
        <div
          ref={listRef}
          role="listbox"
          onMouseDown={e => e.preventDefault()}  // keeps focus in the input (incl. the scrollbar)
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-g200 rounded-[3px] shadow-lg max-h-52 overflow-y-auto"
        >
          {options.map((opt, i) => (
            <div
              key={(opt.custom ? 'typed:' : '') + opt.name}
              data-idx={i}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); commit(opt.name); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-1.5 cursor-pointer text-[12px] flex items-center justify-between gap-2 ${i === activeIdx ? 'bg-red-lt/40' : 'hover:bg-g50'} ${opt.custom ? 'border-b border-g100' : ''}`}
            >
              {opt.custom
                ? <span className="text-blk truncate">Use “<span className="font-semibold">{opt.name}</span>”</span>
                : <span className="text-blk truncate">{opt.name}</span>}
              <span className="font-mono text-[10px] text-g400 shrink-0">{opt.custom ? 'new name' : (hsnMap[opt.name] || '')}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
