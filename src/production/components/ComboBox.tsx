// History-aware combo input: pick from past values or type a brand-new one.
// Options are derived by the caller (e.g. distinct customers / PO numbers /
// couriers seen in prior records) — there's no options table. Typing a value
// not in the list is allowed (add-new); it'll appear in history next time.

import { useState, useRef, useMemo } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';

const inp = 'w-full font-sans text-[12px] text-[#111] bg-white border border-[#E4E5E6] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1]';

export function ComboBox({
  value, onChange, options, placeholder, title, disabled, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const seen = new Set<string>();
    const uniq = options.filter(o => {
      const k = o.trim();
      if (!k || seen.has(k.toLowerCase())) return false;
      seen.add(k.toLowerCase());
      return true;
    });
    const t = value.trim().toLowerCase();
    if (!t) return uniq.slice(0, 50);
    return uniq.filter(o => o.toLowerCase().includes(t)).slice(0, 50);
  }, [options, value]);

  // Whether the typed value is new (not an exact match of any option).
  const isNew = value.trim().length > 0
    && !options.some(o => o.trim().toLowerCase() === value.trim().toLowerCase());

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          className={`${inp} pr-7`}
          value={value}
          placeholder={placeholder}
          title={title}
          disabled={disabled}
          autoComplete="off"
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        />
        <ChevronDown
          size={13}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] pointer-events-none"
        />
      </div>

      {open && !disabled && (filtered.length > 0 || isNew) && (
        <div
          className="absolute z-[200] top-full left-0 right-0 mt-0.5 bg-white border border-[#E4E5E6] rounded-[3px] shadow-lg max-h-[220px] overflow-y-auto"
          onMouseDown={e => e.preventDefault()}   // keep focus so onChange fires before blur
        >
          {isNew && (
            <div className="px-2.5 py-2 text-[11px] text-[#107E3E] flex items-center gap-1.5 border-b border-[#F3F3F3] bg-[#F6FBF7]">
              <Plus size={11} /> Add new: <strong className="font-semibold">{value.trim()}</strong>
            </div>
          )}
          {filtered.map(o => {
            const selected = o.trim().toLowerCase() === value.trim().toLowerCase();
            return (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className={`w-full px-2.5 py-1.5 text-left text-[12px] flex items-center gap-2 hover:bg-[#E8F0FD] transition-colors border-b border-[#F3F3F3] last:border-0 ${selected ? 'bg-[#F0F7FF]' : ''}`}
              >
                {selected
                  ? <Check size={11} className="text-[#0A6ED1] shrink-0" />
                  : <span className="w-[11px] shrink-0" />}
                <span className="truncate text-[#111]">{o}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
