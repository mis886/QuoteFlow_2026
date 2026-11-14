// 2026-11-14: the ONE Product Name picker for Enquiry / Quotation / Order /
// Dispatch / Sampling. STRICT: only a product from the master list
// (product_catalog, active rows) can be chosen. No free text, no "add new".
//
// - Typing filters the list live (case-insensitive, anywhere in the name;
//   names starting with the text come first). Up / Down / Enter / Escape work.
// - onChange fires ONLY on a real pick, with that product's HSN ('' when it
//   has none). So the HSN can never be left over from the previous product.
// - Leaving the box with text that isn't a list item puts back the last valid
//   pick and shows "Select a product from the list". (Typing the exact name
//   in any capitals counts as picking it.)
// - An old record's name that isn't on the list still shows, flagged, until
//   the user picks a list product for that row.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';

interface Props {
  value: string;
  onChange: (name: string, hsn: string) => void;
  names: string[];                 // active master-list names
  hsnMap: Record<string, string>;  // name → HSN ('' = none)
  error?: boolean;
  placeholder?: string;
  className?: string;
}

export const productHsn = (hsnMap: Record<string, string>, name: string) => hsnMap[name] ?? '';

/** Save check shared by the 5 forms: '' when every row's product is an
 *  active master-list product, else the message to show. A blank HSN is
 *  never a problem. An old record's off-list name must be re-picked. */
export function productListProblem(rows: { desc?: string | null }[], names: string[]): string {
  if (!names.length) return 'The product list is still loading — try Save again in a moment.';
  const valid = new Set(names);
  const bad = rows.map((r, i) => ({ i, d: (r.desc || '').trim() })).filter(r => r.d && !valid.has(r.d));
  if (!bad.length) return '';
  const first = bad[0];
  return `Row ${first.i + 1}: "${first.d}" is not in the product list — select a product from the list${bad.length > 1 ? ` (${bad.length} rows)` : ''}.`;
}

export function ProductSelect({ value, onChange, names, hsnMap, error, placeholder = 'Search product…', className }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [warn, setWarn] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => () => { if (warnTimer.current) clearTimeout(warnTimer.current); }, []);

  const typing = query !== value;
  const filtered = useMemo(() => {
    const q = (typing ? query : '').trim().toLowerCase();
    if (!q) return names;
    const hits = names.filter(n => n.toLowerCase().includes(q));
    return [...hits.filter(n => n.toLowerCase().startsWith(q)), ...hits.filter(n => !n.toLowerCase().startsWith(q))];
  }, [query, typing, names]);

  useEffect(() => { setActiveIdx(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const calcPos = () => {
    const r = containerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 240) });
  };

  const showWarn = () => {
    setWarn(true);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => setWarn(false), 4000);
  };

  const pick = (name: string) => {
    setWarn(false);
    setQuery(name);
    setOpen(false);
    if (name !== value) onChange(name, productHsn(hsnMap, name));
  };

  // Leaving the box: an exact name (any capitals) is a pick; anything else
  // goes back to the last valid pick.
  const commitOrRevert = () => {
    setOpen(false);
    if (!typing) return;
    const exact = names.find(n => n.toLowerCase() === query.trim().toLowerCase());
    if (exact) { pick(exact); return; }
    setQuery(value);
    if (query.trim()) showWarn();
  };

  // Closing only — leaving the box (blur) is what commits or reverts.
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
    if (e.key === 'Tab') return;  // blur follows
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') { e.preventDefault(); calcPos(); setOpen(true); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) pick(filtered[activeIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); setQuery(value); setOpen(false); }
  };

  const notOnList = !!value && !typing && !names.includes(value);

  return (
    <div ref={containerRef} className={className}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-invalid={error || notOnList || undefined}
        title={notOnList ? `"${value}" is not in the product list — pick a product from the list` : undefined}
        onChange={e => { setQuery(e.target.value); setWarn(false); if (!open) calcPos(); setOpen(true); }}
        onFocus={e => { e.target.select(); calcPos(); setOpen(true); }}
        onBlur={commitOrRevert}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent outline-none text-[12px] font-sans ${notOnList ? 'text-amber-700' : 'text-blk'} ${error ? 'placeholder:text-red-300' : 'placeholder:text-g300'}`}
      />
      {warn && <div className="text-[10px] text-red-mrt mt-[2px] leading-tight">Select a product from the list</div>}
      {notOnList && !warn && <div className="text-[10px] text-amber-700 mt-[2px] leading-tight">Old name — pick from the list</div>}
      {open && pos && ReactDOM.createPortal(
        <div
          ref={listRef}
          role="listbox"
          onMouseDown={e => e.preventDefault()}  // keeps focus in the input (incl. the scrollbar)
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-g200 rounded-[3px] shadow-lg max-h-52 overflow-y-auto"
        >
          {filtered.length === 0 && <div className="px-3 py-1.5 text-[12px] text-g400">No product matches — select from the list</div>}
          {filtered.map((name, i) => (
            <div
              key={name}
              data-idx={i}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); pick(name); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-1.5 cursor-pointer text-[12px] flex items-center justify-between gap-2 ${i === activeIdx ? 'bg-red-lt/40' : 'hover:bg-g50'}`}
            >
              <span className="text-blk truncate">{name}</span>
              <span className="font-mono text-[10px] text-g400 shrink-0">{hsnMap[name] || ''}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
