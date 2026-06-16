// OTD Trend — last 30 weeks of on-time-delivery %.
// Bars are colour-graded green ≥90%, amber 80-89%, red <80%.
// Mirrors MRT v2 30-week OTD trend (lines 3609-3624).

import { useMemo } from 'react';
import type { ProductionJob } from '../lib/types';

const WEEKS = 30;
const MS_PER_WEEK = 7 * 86_400_000;

export function OTDTrend({ jobs }: { jobs: ProductionJob[] }) {
  const trend = useMemo(() => computeWeeklyOTD(jobs, WEEKS), [jobs]);
  const mtd = useMemo(() => computeMTD(jobs), [jobs]);
  const maxP = 100;
  const minP = 60;

  return (
    <div className="bg-white border border-[#E4E5E6] rounded-[3px]">
      <div className="px-3 py-2 border-b border-[#E4E5E6] flex items-center gap-2">
        <div className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[#333] flex-1">
          30-Week OTD Trend
          <span className="ml-2 text-[#666] font-normal tracking-normal normal-case">
            Target ≥ 90%
          </span>
        </div>
      </div>

      <div className="p-3">
        {/* Bars */}
        <div className="flex items-end gap-[2px] h-[64px]">
          {trend.map((w, i) => {
            if (w.pct == null) {
              return (
                <div
                  key={i}
                  className="flex-1 min-w-[6px] h-1 rounded-[2px] bg-[#EBEBEB]"
                  title={`${w.label}: no data`}
                />
              );
            }
            const h = Math.max(4, Math.round(((w.pct - minP) / (maxP - minP)) * 56));
            const color =
              w.pct >= 90 ? '#0d8b4c' :        // sW
              w.pct >= 80 ? '#FBBF24' :        // sP-ish amber
                            '#D42027';         // red-mrt
            return (
              <div
                key={i}
                className="flex-1 min-w-[6px] rounded-t-[2px]"
                style={{ height: `${h}px`, background: color }}
                title={`${w.label}: ${w.pct}%`}
              />
            );
          })}
        </div>

        {/* Labels */}
        <div className="flex gap-[2px] pt-1 text-[9px] text-[#333]">
          {trend.map((w, i) => (
            <span key={i} className="flex-1 text-center truncate">
              {i % 5 === 0 ? w.label : ''}
            </span>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#F3F3F3] text-[10.5px] text-[#333] flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-[10px] h-[10px] rounded-[1px] bg-sW shrink-0" /> ≥ 90% (On Target)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-[10px] h-[10px] rounded-[1px] bg-sP shrink-0" /> 80–89% (Watch)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-[10px] h-[10px] rounded-[1px] bg-red-mrt shrink-0" /> &lt; 80% (Action)
          </span>
          {mtd != null && (
            <span className="ml-auto font-semibold text-[#111]">
              Current MTD: {mtd}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function isoWeekLabel(d: Date) {
  // ISO week number — short label "Wn"
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  const week = 1 + Math.floor(diff / 7);
  return `W${week}`;
}

function computeWeeklyOTD(jobs: ProductionJob[], weeks: number) {
  const out: { label: string; pct: number | null }[] = [];
  const now = Date.now();
  for (let i = weeks - 1; i >= 0; i--) {
    const end   = now - i * MS_PER_WEEK;
    const start = end - MS_PER_WEEK;
    const inWk = jobs.filter(j =>
      j.dispatched_at &&
      new Date(j.dispatched_at).getTime() >= start &&
      new Date(j.dispatched_at).getTime() <  end
    );
    const label = isoWeekLabel(new Date(end));
    if (inWk.length === 0) {
      out.push({ label, pct: null });
    } else {
      const onTime = inWk.filter(j => j.otd_result === 'on-time').length;
      out.push({ label, pct: Math.round((onTime / inWk.length) * 100) });
    }
  }
  return out;
}

function computeMTD(jobs: ProductionJob[]): number | null {
  const now = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  const inMonth = jobs.filter(j => {
    if (!j.dispatched_at) return false;
    const d = new Date(j.dispatched_at);
    return d.getMonth() === month && d.getFullYear() === year;
  });
  if (inMonth.length === 0) return null;
  const onTime = inMonth.filter(j => j.otd_result === 'on-time').length;
  return Math.round((onTime / inMonth.length) * 100);
}
