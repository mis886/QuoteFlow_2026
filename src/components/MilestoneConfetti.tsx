import { useEffect, useRef, useCallback, useState } from 'react';
import ReactConfetti from 'react-confetti';
import { useAppStore } from '../store';

interface Milestone {
  key: string;
  label: string;
  sub: string;
  emoji: string;
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
  check: (stats: MilestoneStats) => boolean;
}

interface MilestoneStats {
  totalEnquiries: number;
  sentQuotes: number;
  wonQuotes: number;
  totalQuoteValue: number;
  wonValue: number;
}

const MILESTONES: Milestone[] = [
  { key: 'enq_10',    emoji: '📬', tier: 'bronze',  label: '10 Enquiries Received',    sub: 'Your pipeline is alive — keep it flowing!',           check: s => s.totalEnquiries >= 10 },
  { key: 'enq_50',    emoji: '📬', tier: 'silver',  label: '50 Enquiries Received',    sub: 'Half a century of inbound interest. Great work!',      check: s => s.totalEnquiries >= 50 },
  { key: 'enq_100',   emoji: '🎯', tier: 'gold',    label: '100 Enquiries Received',   sub: 'A triple-digit pipeline. Himalaya Terpenesis buzzing!',          check: s => s.totalEnquiries >= 100 },
  { key: 'enq_500',   emoji: '🏆', tier: 'diamond', label: '500 Enquiries — Legend',   sub: "Five hundred strong. You're a market force!",          check: s => s.totalEnquiries >= 500 },
  { key: 'quote_10',  emoji: '📄', tier: 'bronze',  label: '10 Quotations Sent',       sub: 'Proposals flying — clients are paying attention.',     check: s => s.sentQuotes >= 10 },
  { key: 'quote_50',  emoji: '📄', tier: 'silver',  label: '50 Quotations Sent',       sub: 'Fifty offers on the table. Business is booming!',      check: s => s.sentQuotes >= 50 },
  { key: 'quote_100', emoji: '🚀', tier: 'gold',    label: '100 Quotations Sent',      sub: 'Century of quotes! Your team is unstoppable.',         check: s => s.sentQuotes >= 100 },
  { key: 'quote_250', emoji: '🔥', tier: 'diamond', label: '250 Quotations Sent',      sub: 'Quarter-thousand proposals. Elite execution!',         check: s => s.sentQuotes >= 250 },
  { key: 'won_1',     emoji: '🎉', tier: 'bronze',  label: 'First Order Won!',         sub: 'The first win is always sweetest. Many more to come!', check: s => s.wonQuotes >= 1 },
  { key: 'won_10',    emoji: '🏅', tier: 'silver',  label: '10 Orders Won',            sub: 'Ten confirmed orders. Trust is being built!',          check: s => s.wonQuotes >= 10 },
  { key: 'won_50',    emoji: '🥇', tier: 'gold',    label: '50 Orders Won',            sub: 'Fifty victories. Himalaya TerpenesRubber is on a roll!',         check: s => s.wonQuotes >= 50 },
  { key: 'qval_10L',  emoji: '💰', tier: 'bronze',  label: '₹10 Lakh in Quotes',      sub: 'Seven digits of proposals. The pipeline has value!',   check: s => s.totalQuoteValue >= 1_000_000 },
  { key: 'qval_50L',  emoji: '💰', tier: 'silver',  label: '₹50 Lakh in Quotes',      sub: 'Fifty lakh worth of opportunity. Keep closing!',       check: s => s.totalQuoteValue >= 5_000_000 },
  { key: 'qval_1cr',  emoji: '💎', tier: 'gold',    label: '₹1 Crore in Quotes',      sub: 'One crore milestone unlocked. Outstanding!',           check: s => s.totalQuoteValue >= 10_000_000 },
  { key: 'qval_5cr',  emoji: '👑', tier: 'diamond', label: '₹5 Crore in Quotes',      sub: "Five crore in proposals. You're a rubber giant!",      check: s => s.totalQuoteValue >= 50_000_000 },
  { key: 'oval_10L',  emoji: '💸', tier: 'bronze',  label: '₹10 Lakh Revenue Won',    sub: 'Lakh in the bank. The grind is paying off!',           check: s => s.wonValue >= 1_000_000 },
  { key: 'oval_50L',  emoji: '💸', tier: 'silver',  label: '₹50 Lakh Revenue Won',    sub: 'Half a crore of closed business. Phenomenal!',         check: s => s.wonValue >= 5_000_000 },
  { key: 'oval_1cr',  emoji: '🤑', tier: 'diamond', label: '₹1 Crore Revenue Won',    sub: 'Crore club! Himalaya TerpenesRubber is delivering big.',         check: s => s.wonValue >= 10_000_000 },
];

// Brand palette — MRT red, gold, dark, white, trust blue
const BRAND_COLORS = ['#D42027', '#B8181E', '#FFD700', '#FFC107', '#1E1E1E', '#ffffff', '#6495C8', '#4a7ab8'];

// Pieces & gravity per tier
const TIER_CONFIG = {
  bronze:  { pieces: 180, gravity: 0.12, duration: 5000 },
  silver:  { pieces: 250, gravity: 0.10, duration: 6000 },
  gold:    { pieces: 350, gravity: 0.08, duration: 7000 },
  diamond: { pieces: 500, gravity: 0.06, duration: 9000 },
};

const STORAGE_KEY = 'mrt_milestones_v2';
const TTL_MS = 24 * 60 * 60 * 1000;

function getShown(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function wasShownRecently(key: string): boolean {
  const s = getShown();
  return !!s[key] && Date.now() - s[key] < TTL_MS;
}
function markShown(key: string) {
  const s = getShown();
  s[key] = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function MilestoneConfetti() {
  const { data, loading } = useAppStore();
  const [active, setActive] = useState<Milestone | null>(null);
  const [recycle, setRecycle] = useState(true);
  const [toastVisible, setToastVisible] = useState(false);
  const evaluated = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = (t: ReturnType<typeof setTimeout>) => timers.current.push(t);

  const dismiss = useCallback(() => {
    setRecycle(false);
    setToastVisible(false);
    // let confetti finish falling then unmount
    clear(setTimeout(() => setActive(null), 3000));
  }, []);

  useEffect(() => {
    // Wait until data has finished loading from Supabase
    if (loading) return;
    if (evaluated.current) return;
    evaluated.current = true;

    // Mirror exactly what the Dashboard KPI cards show:
    // - sentQuotes  = all quotes ever sent (Sent + Won + Lost) — matches "Quotes Sent" KPI
    // - totalQuoteValue = sum of ALL quotes (sub + GST) — matches "Quote Value" KPI (all-time)
    // - wonQuotes   = quotes with status Won
    // - wonValue    = sum of won quote items (sub + GST)
    const qVal = (quotes: typeof data.quotes) =>
      quotes.reduce((a, q) => a + q.items.reduce((s, i) => s + i.total + (i.total * i.gst / 100), 0), 0);

    const stats: MilestoneStats = {
      totalEnquiries: data.enquiries.length,
      sentQuotes:     data.quotes.filter(q => q.status === 'Sent' || q.status === 'Won' || q.status === 'Lost').length,
      wonQuotes:      data.quotes.filter(q => q.status === 'Won').length,
      totalQuoteValue: qVal(data.quotes),
      wonValue:        qVal(data.quotes.filter(q => q.status === 'Won')),
    };

    const due = MILESTONES.filter(m => m.check(stats) && !wasShownRecently(m.key));
    if (due.length === 0) return;

    const top = due[due.length - 1];
    due.forEach(m => markShown(m.key));

    clear(setTimeout(() => {
      setActive(top);
      setRecycle(true);
      setToastVisible(true);

      // stop recycling after tier duration — pieces fall off naturally
      const cfg = TIER_CONFIG[top.tier];
      clear(setTimeout(() => setRecycle(false), cfg.duration));
      // fully unmount after pieces gone
      clear(setTimeout(() => { setActive(null); setToastVisible(false); }, cfg.duration + 3500));
    }, 1000));

    return () => timers.current.forEach(clearTimeout);
  }, [loading, data.enquiries.length, data.quotes.length]);

  if (!active) return null;

  const cfg = TIER_CONFIG[active.tier];

  return (
    <>
      {/* Full-screen confetti — pointer-events none so UI stays usable */}
      <div className="fixed inset-0 z-[9990] pointer-events-none">
        <ReactConfetti
          width={window.innerWidth}
          height={window.innerHeight}
          numberOfPieces={cfg.pieces}
          gravity={cfg.gravity}
          initialVelocityX={4}
          initialVelocityY={6}
          wind={0}
          opacity={1}
          recycle={recycle}
          colors={BRAND_COLORS}
        />
      </div>

      {/* Slim toast — bottom center, clickable to dismiss */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9991] transition-all duration-500 ${toastVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      >
        <button
          type="button"
          onClick={dismiss}
          className="flex items-center gap-3 bg-dark text-white pl-4 pr-5 py-3 rounded-xl shadow-2xl border border-white/10 hover:border-white/25 transition-colors group"
        >
          <span className="text-2xl leading-none select-none">{active.emoji}</span>
          <div className="text-left">
            <div className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-white/35 leading-none mb-1">
              Milestone · {active.tier}
            </div>
            <div className="font-semibold text-[14px] leading-tight">{active.label}</div>
            <div className="text-[11px] text-white/50 mt-0.5">{active.sub}</div>
          </div>
          <span className="ml-2 text-white/25 group-hover:text-white/50 text-[11px] font-mono transition-colors">✕</span>
        </button>
      </div>
    </>
  );
}
