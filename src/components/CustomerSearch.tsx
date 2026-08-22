import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Customer } from '../lib/types';
import { Search, X } from 'lucide-react';

interface Props {
  customers: Customer[];
  value: string;           // the selected customer name
  onChange: (name: string) => void;
  error?: boolean;
  placeholder?: string;
}

function matchesQuery(c: Customer, q: string): boolean {
  const lq = q.toLowerCase();
  if (c.name?.toLowerCase().includes(lq)) return true;
  if (c.code?.toLowerCase().includes(lq)) return true;
  if (c.seg?.toLowerCase().includes(lq)) return true;
  if (c.gstin?.toLowerCase().includes(lq)) return true;
  if (c.sites.some(s =>
    s.city?.toLowerCase().includes(lq) ||
    s.state?.toLowerCase().includes(lq) ||
    s.gstin?.toLowerCase().includes(lq) ||
    s.name?.toLowerCase().includes(lq)
  )) return true;
  return false;
}

export function CustomerSearch({ customers, value, onChange, error, placeholder = 'Search customer…' }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep display text in sync when parent resets value (e.g. form pre-fill on edit)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return customers.slice(0, 50);
    return customers.filter(c => matchesQuery(c, q)).slice(0, 50);
  }, [query, customers]);

  // Reset active index when filtered list changes
  useEffect(() => { setActiveIdx(0); }, [filtered.length]);

  // Close when focus leaves the container entirely (doesn't swallow the next element's click)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) {
        setOpen(false);
        setQuery(value);
      }
    };
    el.addEventListener('focusout', handler);
    return () => el.removeEventListener('focusout', handler);
  }, [value]);

  const pick = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key !== 'Tab') setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) pick(filtered[activeIdx].name); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(value); }
    else if (e.key === 'Tab') setOpen(false);
  };

  const borderCls = error ? 'border-red-mrt' : 'border-g300 focus-within:border-red-mrt';

  return (
    <div ref={containerRef} className="relative">
      <div className={`flex items-center bg-white border ${borderCls} rounded-[3px] transition-all focus-within:ring-[3px] focus-within:ring-red-lt`}>
        <Search size={13} className="ml-[10px] shrink-0 text-g400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 font-sans text-[13px] text-blk bg-transparent px-2 py-[8px] outline-none placeholder:text-g400"
        />
        {query && (
          <button type="button" onClick={clear} className="mr-[6px] text-g400 hover:text-blk transition-colors" title="Clear">
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-g200 rounded-[3px] shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-g400">No customers match "{query}"</div>
          ) : (
            filtered.map((c, idx) => {
              const siteGstins = c.sites.filter(s => s.gstin?.trim());
              const gstin = c.gstin?.trim() || siteGstins[0]?.gstin;
              const city = c.sites[0]?.city;
              return (
                <div
                  key={c.id}
                  onMouseDown={() => pick(c.name)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-3 ${idx === activeIdx ? 'bg-red-lt/40' : 'hover:bg-g50'}`}
                >
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-blk truncate">{c.name}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="font-mono text-[10px] text-g500">{c.code}</span>
                      {city && <span className="text-[10px] text-g400">{city}</span>}
                      {gstin && <span className="font-mono text-[10px] text-g400">{gstin}</span>}
                    </div>
                  </div>
                  {c.seg && (
                    <span className="shrink-0 px-1.5 py-0.5 bg-g100 rounded text-[8.5px] font-bold uppercase text-g500 tracking-wide">
                      {c.seg}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
