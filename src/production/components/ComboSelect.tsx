// Editable dropdown (combobox): pick a managed option or type a new value.
// When the typed text matches no option, an "➕ Add" row persists it via onAddNew.
// Styling/idiom mirrors the press & product-search dropdowns in the product pages.

import { useState } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';

const inp = 'w-full font-sans text-[12.5px] text-[#111] bg-white border border-[#CCC] rounded-[3px] px-2.5 py-1.5 outline-none focus:border-[#0A6ED1] focus:ring-2 focus:ring-red-lt';

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  title?: string;
  /** Called when the user adds a value not already in `options`. Persist it here. */
  onAddNew?: (v: string) => void;
  /** Optional secondary text shown after an option (e.g. its workshop unit). */
  metaFor?: (option: string) => string | undefined;
}

export function ComboSelect({ value, onChange, options, placeholder, title, onAddNew, metaFor }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // While the dropdown is open the input shows the live query; otherwise the
  // committed value. This lets the user type to filter without losing `value`.
  const display = open ? query : value;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(o => o.toLowerCase().includes(q))
    : options;
  const exact = options.some(o => o.toLowerCase() === q);
  const canAdd = !!onAddNew && q.length > 0 && !exact;

  const commit = (v: string) => {
    onChange(v);
    setQuery('');
    setOpen(false);
  };

  const addNew = () => {
    const v = query.trim();
    if (!v) return;
    onAddNew?.(v);
    commit(v);
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          className={`${inp} pr-7`}
          value={display}
          placeholder={placeholder}
          title={title}
          autoComplete="off"
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (canAdd) addNew();
              else if (filtered.length) commit(filtered[0]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] pointer-events-none" />
      </div>

      {open && (
        <div className="absolute z-[200] top-full left-0 right-0 mt-0.5 bg-white border border-[#E4E5E6] rounded-[3px] shadow-lg max-h-[220px] overflow-y-auto">
          {filtered.length === 0 && !canAdd && (
            <div className="px-3 py-2.5 text-[11px] text-[#888] italic">No matches</div>
          )}
          {filtered.map(o => {
            const selected = o === value;
            const meta = metaFor?.(o);
            return (
              <button
                key={o}
                type="button"
                onMouseDown={e => { e.preventDefault(); commit(o); }}
                className={`w-full px-2.5 py-2 text-left flex items-center gap-2 hover:bg-[#E8F0FD] transition-colors border-b border-[#F3F3F3] last:border-0 ${selected ? 'bg-[#F0F7FF]' : ''}`}
              >
                <span className="text-[12px] text-[#111] flex-1 truncate">{o}</span>
                {meta && <span className="text-[10.5px] text-[#666] font-mono">{meta}</span>}
                {selected && <Check size={11} className="text-[#0A6ED1] shrink-0" />}
              </button>
            );
          })}
          {canAdd && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); addNew(); }}
              className="w-full px-2.5 py-2 text-left flex items-center gap-1.5 hover:bg-[#E8F5E9] transition-colors text-[#107E3E] border-t border-[#F3F3F3]"
            >
              <Plus size={11} className="shrink-0" />
              <span className="text-[12px]">Add “{query.trim()}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
