import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { BILLING_HSN, BILLING_NAMES } from '../lib/products';

interface Props {
  value: string;
  // hsn defined → known product selected (auto-fill); hsn undefined → free type (don't touch hsn)
  onChange: (desc: string, hsn?: string) => void;
  error?: boolean;
}

export function ProductSearch({ value, onChange, error }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BILLING_NAMES;
    return BILLING_NAMES.filter(n => n.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => { setActiveIdx(0); }, [filtered.length]);

  const calcPos = () => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 240) });
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const outside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const pick = (name: string) => {
    onChange(name, BILLING_HSN[name]);
    setQuery(name);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key !== 'Tab') { calcPos(); setOpen(true); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) pick(filtered[activeIdx]); }
    else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Tab') { setOpen(false); }
  };

  return (
    <div ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Type to search…"
        onChange={e => {
          const v = e.target.value;
          setQuery(v);
          onChange(v);
          if (!open) calcPos();
          setOpen(true);
        }}
        onFocus={() => { calcPos(); setOpen(true); }}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent outline-none text-[12px] font-sans text-blk ${error ? 'placeholder:text-red-300' : 'placeholder:text-g300'}`}
      />
      {open && filtered.length > 0 && pos && ReactDOM.createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-g200 rounded-[3px] shadow-lg max-h-52 overflow-y-auto"
        >
          {filtered.map((name, i) => (
            <div
              key={name}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); pick(name); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-1.5 cursor-pointer text-[12px] flex items-center justify-between gap-2 ${i === activeIdx ? 'bg-red-lt/40' : 'hover:bg-g50'}`}
            >
              <span className="text-blk truncate">{name}</span>
              <span className="font-mono text-[10px] text-g400 shrink-0">{BILLING_HSN[name]}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
