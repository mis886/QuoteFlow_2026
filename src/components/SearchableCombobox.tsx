// Generic type-to-filter dropdown for a long fixed option list — a plain
// <select> is unwieldy once the list runs into the hundreds. Positions its
// dropdown via a portal (like ProductSearch.tsx) so it can't be clipped by
// any scroll container. Used across the Stock Movements forms (Product
// Name, Party Name, Transporter) so each long list has one shared UI
// pattern instead of a bespoke combobox per field.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className: string;
  placeholder?: string;
}

export function SearchableCombobox({ value, onChange, options, className, placeholder = 'Type to search…' }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(n => n.toLowerCase().includes(q)) : options;
  }, [query, options]);

  const calcPos = () => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (e: MouseEvent) => { if (!containerRef.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const pick = (name: string) => { onChange(name); setQuery(name); setOpen(false); };

  return (
    <div ref={containerRef} className="relative">
      <input
        className={className}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); if (!open) calcPos(); setOpen(true); }}
        onFocus={() => { calcPos(); setOpen(true); }}
      />
      {open && filtered.length > 0 && pos && ReactDOM.createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-g200 rounded-[3px] shadow-lg max-h-[220px] overflow-y-auto"
        >
          {filtered.map(name => (
            <div
              key={name}
              onMouseDown={e => { e.preventDefault(); pick(name); }}
              className={`px-2.5 py-1.5 cursor-pointer text-[12px] ${name === value ? 'bg-red-lt/40 text-red-mrt font-medium' : 'text-blk hover:bg-g100'}`}
            >
              {name}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
