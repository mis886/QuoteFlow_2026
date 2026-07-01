import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';

interface Props {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export function OptionSearch({ options, value, onChange, placeholder = 'Search…' }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // tracks the last value committed via pick(), so we can revert on close-without-pick
  const committedRef = useRef(value);

  useEffect(() => {
    committedRef.current = value;
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.toLowerCase().includes(q));
  }, [query, options]);

  useEffect(() => { setActiveIdx(0); }, [filtered.length]);

  const calcPos = () => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 220) });
    }
  };

  const closeAndRevert = () => {
    setOpen(false);
    setQuery(committedRef.current);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) closeAndRevert();
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('scroll', closeAndRevert, true);
    window.addEventListener('resize', closeAndRevert);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('scroll', closeAndRevert, true);
      window.removeEventListener('resize', closeAndRevert);
    };
  }, [open]);

  const pick = (opt: string) => {
    onChange(opt);
    committedRef.current = opt;
    setQuery(opt);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key !== 'Tab') { calcPos(); setOpen(true); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) pick(filtered[activeIdx]); }
    else if (e.key === 'Escape') { closeAndRevert(); }
    else if (e.key === 'Tab') { closeAndRevert(); }
  };

  return (
    <div ref={containerRef}>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={e => {
          setQuery(e.target.value);
          // Not calling onChange — only picks from the list commit a value
          if (!open) calcPos();
          setOpen(true);
        }}
        onFocus={() => { calcPos(); setOpen(true); }}
        onKeyDown={handleKeyDown}
        className="w-full bg-transparent outline-none text-[12px] font-sans text-blk placeholder:text-g300"
      />
      {open && pos && ReactDOM.createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white border border-g200 rounded-[3px] shadow-lg max-h-52 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-g400 italic">No options match</div>
          ) : (
            filtered.map((opt, i) => (
              <div
                key={opt}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); pick(opt); }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`px-3 py-1.5 cursor-pointer text-[12px] text-blk ${i === activeIdx ? 'bg-red-lt/40' : 'hover:bg-g50'}`}
              >
                {opt}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
