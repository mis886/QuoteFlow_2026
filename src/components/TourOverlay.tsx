import { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';

interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string | null;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to EnqBoss',
    description: "Let's take a 60-second tour of the key features. Click Next to begin.",
    targetSelector: null,
  },
  {
    id: 'enquiries',
    title: 'Enquiries',
    description: 'Log every customer RFQ here. Track status, urgency, and line items from receipt to quotation.',
    targetSelector: '[data-tour="nav-enquiries"]',
  },
  {
    id: 'quotations',
    title: 'Quotations',
    description: 'Create branded PDF quotations, set pricing and terms, and send them by email in one click.',
    targetSelector: '[data-tour="nav-quotations"]',
  },
  {
    id: 'orders',
    title: 'Orders',
    description: 'Convert won quotes to orders, attach customer POs, and generate Proforma Invoices.',
    targetSelector: '[data-tour="nav-orders"]',
  },
  {
    id: 'followups',
    title: 'Follow-Ups',
    description: 'CRM command centre — log calls, WhatsApp messages, and schedule next actions for every open quote.',
    targetSelector: '[data-tour="nav-followups"]',
  },
  {
    id: 'customers',
    title: 'Customers',
    description: 'Master database of all customers with tier ratings, site contacts, and full activity history.',
    targetSelector: '[data-tour="nav-customers"]',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    description: 'E2Q intelligence — conversion funnel, SLA compliance, win rate, and open pipeline value.',
    targetSelector: '[data-tour="nav-analytics"]',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: "Your daily overview — KPI cards, pipeline health, and enquiries needing attention. You're all set!",
    targetSelector: '[data-tour="nav-dashboard"]',
  },
];

const PAD = 8;
const TOOLTIP_W = 320;
const TOOLTIP_H_EST = 200;
const TOOLTIP_GAP = 20;

interface Props {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

export function TourOverlay({ step, onNext, onSkip }: Props) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [vpW, setVpW] = useState(window.innerWidth);
  const [vpH, setVpH] = useState(window.innerHeight);

  const recalc = useCallback(() => {
    setVpW(window.innerWidth);
    setVpH(window.innerHeight);
    const sel = TOUR_STEPS[step].targetSelector;
    if (sel) {
      const el = document.querySelector(sel);
      if (el) setTargetRect(el.getBoundingClientRect());
      else setTargetRect(null);
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    recalc();
  }, [recalc]);

  useEffect(() => {
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [recalc]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      if (e.key === 'ArrowRight' || e.key === 'Enter') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onSkip]);

  const isLast = step === TOUR_STEPS.length - 1;
  const { title, description } = TOUR_STEPS[step];

  // Spotlight rect with padding
  const rx = targetRect ? targetRect.x - PAD : 0;
  const ry = targetRect ? targetRect.y - PAD : 0;
  const rw = targetRect ? targetRect.width + PAD * 2 : 0;
  const rh = targetRect ? targetRect.height + PAD * 2 : 0;

  // SVG path: full viewport rect + inner cutout (even-odd fills the hole)
  const svgPath = targetRect
    ? `M 0 0 H ${vpW} V ${vpH} H 0 Z M ${rx} ${ry} H ${rx + rw} V ${ry + rh} H ${rx} Z`
    : `M 0 0 H ${vpW} V ${vpH} H 0 Z`;

  // Tooltip position
  let tooltipStyle: React.CSSProperties;
  if (!targetRect) {
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: TOOLTIP_W,
      zIndex: 9999,
    };
  } else {
    const left = rx + rw + TOOLTIP_GAP;
    const rawTop = ry + rh / 2 - TOOLTIP_H_EST / 2;
    const top = Math.min(Math.max(rawTop, 12), vpH - TOOLTIP_H_EST - 12);
    tooltipStyle = { position: 'fixed', left, top, width: TOOLTIP_W, zIndex: 9999 };
  }

  return ReactDOM.createPortal(
    <>
      {/* Dark overlay with spotlight cutout */}
      <svg
        style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}
        width={vpW}
        height={vpH}
      >
        <path d={svgPath} fill="rgba(0,0,0,0.68)" fillRule="evenodd" />
        {targetRect && (
          <rect
            x={rx} y={ry} width={rw} height={rh} rx={5} ry={5}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Backdrop to block pointer events on dark area (not on spotlight) */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9997 }} />

      {/* Tooltip */}
      <div style={tooltipStyle}>
        <div
          key={step}
          className="bg-white rounded-lg shadow-2xl p-5 relative animate-in fade-in duration-200"
        >
          {/* Left-pointing arrow for sidebar steps */}
          {targetRect && (
            <div style={{
              position: 'absolute',
              left: -8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 0,
              height: 0,
              borderTop: '8px solid transparent',
              borderBottom: '8px solid transparent',
              borderRight: '8px solid white',
            }} />
          )}

          {/* Step counter */}
          <div className="font-mono text-[10px] font-bold tracking-[2px] uppercase text-g400 mb-2">
            {step + 1} / {TOUR_STEPS.length}
          </div>

          {/* Progress dots */}
          <div className="flex gap-1 mb-3">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-[3px] rounded-full transition-all duration-300 ${
                  i === step ? 'w-5 bg-red-mrt' : i < step ? 'w-3 bg-g300' : 'w-3 bg-g100'
                }`}
              />
            ))}
          </div>

          {/* Title */}
          <h2 className="font-serif text-[18px] text-blk leading-tight mb-2">{title}</h2>

          {/* Description */}
          <p className="text-[13px] text-g500 leading-relaxed mb-5">{description}</p>

          {/* Buttons */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onSkip}
              className="text-[10.5px] font-mono font-bold tracking-[1.5px] uppercase text-g400 hover:text-blk transition-colors"
            >
              Skip Tour
            </button>
            <button
              type="button"
              onClick={onNext}
              className="h-8 px-4 bg-red-mrt text-white text-[10.5px] font-mono font-bold tracking-[1.5px] uppercase rounded-[3px] hover:opacity-90 transition-opacity"
            >
              {isLast ? 'Get Started' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}