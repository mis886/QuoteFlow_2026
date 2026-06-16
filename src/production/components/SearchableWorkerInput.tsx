// SearchableWorkerInput — combobox that filters workers by department.
// Falls back to free text entry if no match (unknown / temp worker).

import { useState, useRef, useEffect, useMemo } from 'react';
import type { Worker } from '../lib/types';

interface Props {
  value: string;
  onChange: (name: string) => void;
  workers: Worker[];
  department?: 'finishing' | 'inspection' | 'press' | undefined;  // if undefined, show all
  placeholder?: string;
  title?: string;
  className?: string;
}

const inp = 'w-full font-sans text-[12px] text-[#111] bg-white border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]';

export function SearchableWorkerInput({
  value, onChange, workers, department, placeholder = 'Worker name', title, className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync when value changes externally (e.g., form reset)
  useEffect(() => { setQuery(value); }, [value]);

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // On blur, emit current text as value (allows free text)
        if (query !== value) onChange(query);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [query, value, onChange]);

  const filtered = useMemo(() => {
    const base = department
      ? workers.filter(w => w.department === department)
      : workers;
    const q = query.trim().toLowerCase();
    if (!q) return base.slice(0, 12);
    return base
      .filter(w => w.name.toLowerCase().includes(q) || (w.role || '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [workers, department, query]);

  const select = (w: Worker) => {
    onChange(w.name);
    setQuery(w.name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        className={`${inp} ${className || ''}`}
        value={query}
        placeholder={placeholder}
        title={title}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); }
          if (e.key === 'Enter' && filtered.length > 0) { select(filtered[0]); }
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-[200] top-full left-0 right-0 mt-0.5 bg-white border border-[#E4E5E6] rounded-[3px] shadow-lg max-h-[180px] overflow-y-auto">
          {filtered.map(w => (
            <button
              key={w.id}
              type="button"
              onMouseDown={() => select(w)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[#E8F0FD] transition-colors ${
                w.name === value ? 'bg-[#F0F7FF]' : ''
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${w.present ? 'bg-[#107E3E]' : 'bg-[#BB0000]'}`} />
              <span className="flex-1 text-[12px] text-[#111] font-medium truncate">{w.name}</span>
              <span className="text-[10px] text-[#888] shrink-0">{w.role}</span>
              {!w.present && <span className="text-[9px] text-[#BB0000] shrink-0">Absent</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
