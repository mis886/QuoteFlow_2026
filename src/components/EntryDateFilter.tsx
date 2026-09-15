import React from 'react';
import { Calendar, X } from 'lucide-react';

export function EntryDateFilter({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const active = !!value;
  return (
    <div
      className={`flex items-center gap-1.5 h-7 px-2 rounded border font-mono text-xs transition-colors ${
        active ? 'border-red-mrt text-red-mrt bg-red-lt-solid' : 'border-g200 bg-white text-g500'
      }`}
    >
      <Calendar size={11} className={active ? 'text-red-mrt' : 'text-g400'} />
      <input
        type="date"
        title="Filter by entry date"
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="bg-transparent border-none outline-none font-mono text-xs w-[112px]"
      />
      {active && (
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Clear entry date filter"
          className="text-red-mrt/60 hover:text-red-mrt transition-colors shrink-0"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
