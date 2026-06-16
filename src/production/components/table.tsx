// Shared table/layout primitives for the Production workspace.
// Styled to match MRT ERP v2 design system (SAP-style blue/grey).

import React from 'react';
import { cn } from '../../lib/utils';

// ── Table ──────────────────────────────────────────────────────

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-[#E4E5E6] rounded-[3px] overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[12px] text-[#111]">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-[#FAFAFA]">{children}</thead>;
}

export function TH({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn(
      'text-[10px] font-semibold text-[#333] uppercase tracking-[0.2px]',
      'px-[10px] py-[7px] text-left whitespace-nowrap border-b border-[#E4E5E6]',
      className
    )}>
      {children}
    </th>
  );
}

export function TR({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-[#F3F3F3] last:border-b-0',
        onClick && 'cursor-pointer hover:bg-[#EEF4FF]',
        className
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children, className, title, onClick, colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
  colSpan?: number;
}) {
  return (
    <td
      className={cn('px-[10px] py-[7px] align-middle whitespace-nowrap', className)}
      title={title}
      onClick={onClick}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-5 px-3 text-[#333] text-[12px] italic">
        {text ?? 'No records.'}
      </td>
    </tr>
  );
}

// ── Page header ────────────────────────────────────────────────

export function PageHeader({
  module, title, accent, subtitle, actions,
}: {
  module: string;
  title: React.ReactNode;
  accent?: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="h-12 bg-white border-b border-[#E4E5E6] px-4 flex items-center gap-3 flex-shrink-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-[#333] font-medium hidden sm:inline">{module} ·</span>
          <span className="text-[14px] font-semibold text-[#111] truncate">{title}</span>
          {accent && <span className="text-[12px] text-[#333]">{accent}</span>}
        </div>
        {subtitle && <div className="text-[10px] text-[#333] leading-none mt-0.5 truncate">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-[#E4E5E6] flex-wrap">
      {children}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

export function StatusPill({ status, tone = 'neutral' }: { status: string; tone?: Tone }) {
  const cls: Record<Tone, string> = {
    neutral: 'bg-[#F5F6F7] text-[#333] border border-[#E4E5E6]',
    good:    'bg-[#E8F5E9] text-[#107E3E]',
    warn:    'bg-[#FFF3E0] text-[#E9730C]',
    bad:     'bg-[#FFEBEE] text-[#BB0000]',
    info:    'bg-[#E8F0FD] text-[#0A6ED1]',
  };
  return (
    <span className={cn(
      'inline-block text-[10px] font-medium px-[7px] py-[2px] rounded-[2px] leading-[1.5] whitespace-nowrap',
      cls[tone]
    )}>
      {status}
    </span>
  );
}

export function toneForStage(stage: string): Tone {
  switch (stage) {
    case 'queued':     return 'neutral';
    case 'moulding':   return 'warn';
    case 'finishing':  return 'info';
    case 'inspection': return 'warn';
    case 'pdi':        return 'info';
    case 'dispatch':   return 'good';
    case 'dispatched': return 'good';
    default:           return 'neutral';
  }
}

export function toneForStatus(status: string): Tone {
  switch (status) {
    case 'queued':       return 'neutral';
    case 'setup':        return 'warn';
    case 'running':      return 'good';
    case 'in-progress':  return 'info';
    case 'passed':       return 'good';
    case 'pending':      return 'neutral';
    case 'ncr':          return 'bad';
    case 'awaiting':     return 'neutral';
    case 'in-review':    return 'warn';
    case 'ready':        return 'info';
    case 'dispatched':   return 'good';
    case 'late':         return 'bad';
    default:             return 'neutral';
  }
}
