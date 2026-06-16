import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { useAppStore } from '../store';
import { resolveDateRange } from '../lib/utils';
import type { GlobalDateRange } from '../store';

type Preset = GlobalDateRange['preset'];

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today',         label: 'Today'         },
  { key: 'yesterday',     label: 'Yesterday'     },
  { key: 'last-7-days',   label: 'Last 7 Days'   },
  { key: 'this-week',     label: 'This Week'     },
  { key: 'this-month',    label: 'This Month'    },
  { key: 'this-quarter',  label: 'This Quarter'  },
  { key: 'this-year',     label: 'This Year'     },
];

function fmtDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m, 10) - 1]}`;
}

export function GlobalDateRangePicker() {
  const { globalDateRange, setGlobalDateRange } = useAppStore() as any;
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync custom inputs when panel opens
  useEffect(() => {
    if (open && globalDateRange?.preset === 'custom') {
      setCustomStart(globalDateRange.startDate || '');
      setCustomEnd(globalDateRange.endDate || '');
    } else if (open) {
      setCustomStart('');
      setCustomEnd('');
    }
  }, [open]);

  const selectPreset = (key: Preset) => {
    const { startDate, endDate } = resolveDateRange(key);
    setGlobalDateRange({ startDate, endDate, preset: key });
    setOpen(false);
  };

  const applyCustom = () => {
    if (!customStart && !customEnd) return;
    setGlobalDateRange({ startDate: customStart, endDate: customEnd, preset: 'custom' });
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGlobalDateRange(null);
    setCustomStart('');
    setCustomEnd('');
  };

  const isActive = !!globalDateRange;
  const activePreset = PRESETS.find(p => p.key === globalDateRange?.preset);

  const label = (() => {
    if (!globalDateRange) return 'All Time';
    if (globalDateRange.preset !== 'custom') return activePreset?.label ?? 'Custom';
    const s = fmtDate(globalDateRange.startDate);
    const e = fmtDate(globalDateRange.endDate);
    if (s && e) return `${s} – ${e}`;
    if (s) return `From ${s}`;
    if (e) return `To ${e}`;
    return 'Custom';
  })();

  return (
    <div ref={ref} className="relative">
      {/* Trigger pill */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`h-[30px] flex items-center gap-1.5 px-2.5 rounded-[5px] border text-[11px] font-medium transition-colors focus:outline-none ${
          isActive
            ? 'bg-red-50 border-red-200 text-red-mrt'
            : 'bg-g100 border-g200 text-g500 hover:bg-white hover:border-g400'
        }`}
      >
        <Calendar size={12} className={isActive ? 'text-red-mrt' : 'text-g400'} />
        <span className="font-mono font-bold tracking-[0.5px]">{label}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {isActive && (
          <span
            role="button"
            onClick={clear}
            className="ml-0.5 text-g400 hover:text-red-mrt transition-colors cursor-pointer"
            title="Clear filter"
          >
            <X size={11} />
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-[34px] z-50 w-[220px] bg-white border border-g200 rounded-[8px] shadow-lg overflow-hidden">
          {/* Preset list */}
          <div className="p-1.5 border-b border-g100">
            {PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => selectPreset(p.key)}
                className={`w-full text-left px-3 py-1.5 rounded-[5px] text-[12px] font-medium transition-colors flex items-center justify-between group ${
                  globalDateRange?.preset === p.key
                    ? 'bg-red-50 text-red-mrt font-semibold'
                    : 'text-blk hover:bg-g50'
                }`}
              >
                {p.label}
                {globalDateRange?.preset === p.key && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-mrt" />
                )}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div className="p-2.5">
            <div className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-g400 mb-2">Custom Range</div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label className="font-mono text-[9px] text-g400 w-8 shrink-0">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  title="Start Date"
                  className="flex-1 text-[11px] font-mono text-blk border border-g200 rounded-[4px] px-2 py-1 outline-none focus:border-red-mrt bg-g50"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="font-mono text-[9px] text-g400 w-8 shrink-0">To</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  title="End Date"
                  className="flex-1 text-[11px] font-mono text-blk border border-g200 rounded-[4px] px-2 py-1 outline-none focus:border-red-mrt bg-g50"
                />
              </div>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customStart && !customEnd}
                className="mt-1 w-full py-1.5 rounded-[4px] bg-red-mrt text-white font-mono text-[10px] font-bold tracking-[1px] uppercase disabled:opacity-40 hover:bg-red-700 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
