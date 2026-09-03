import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { FLOATING_SCROLLBAR_THICKNESS, SCROLLBAR_TRACK_THICKNESS } from './FloatingHorizontalScrollbar';

// How much of the container's visible height an arrow-button click jumps —
// short of a full page so a little of the previous view stays in sight.
const SCROLL_STEP_RATIO = 0.8;

// The up/down arrow buttons stay comfortably clickable even though the
// scroll track itself (SCROLLBAR_TRACK_THICKNESS, imported from
// FloatingHorizontalScrollbar so both bars are provably the same
// thickness) is kept slim.
const BUTTON_SIZE = 16;
const ICON_SIZE = 10;

interface VerticalRect {
  top: number;
  height: number;
}

// Vertical sibling of FloatingHorizontalScrollbar — mirrors a tall table's
// own overflow-y scroll container as a slim bar pinned to the right edge of
// the viewport. Same native-overflow-element trick (a real `overflow-y-auto`
// strip with a tall spacer div) so the thumb's size/drag behavior comes from
// the browser for free, and the same syncing-boolean guard against the two
// `scroll` listeners echoing each other.
//
// `horizontalContainerRef`, when given, is used only to detect whether
// FloatingHorizontalScrollbar is also showing for the same table (checking
// that container's own scrollWidth/clientWidth) so this bar can shorten
// itself by one bar's thickness and leave the bottom-right corner — where
// the horizontal bar's own arrow button sits — clear rather than overlapping
// it.
export default function FloatingVerticalScrollbar({
  containerRef,
  horizontalContainerRef,
}: {
  containerRef: { current: HTMLDivElement | null };
  horizontalContainerRef?: { current: HTMLDivElement | null };
}) {
  const floatingRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [needsHorizontalSibling, setNeedsHorizontalSibling] = useState(false);
  const [inView, setInView] = useState(false);
  const [rect, setRect] = useState<VerticalRect>({ top: 0, height: 0 });
  const [scrollHeight, setScrollHeight] = useState(0);

  // Re-measures whenever the container's own box moves/resizes (ResizeObserver
  // + window resize) or its content changes shape (MutationObserver) — a
  // filter or status-tab switch that changes row count changes what's
  // visible without necessarily resizing the container itself, so content
  // mutations need their own trigger rather than relying on resize alone.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const hContainer = horizontalContainerRef?.current ?? null;

    function measure() {
      if (!container) return;
      const r = container.getBoundingClientRect();
      setRect((prev) => (prev.top === r.top && prev.height === r.height ? prev : { top: r.top, height: r.height }));
      setScrollHeight((prev) => (prev === container.scrollHeight ? prev : container.scrollHeight));
      setNeedsScroll((prev) => {
        const next = container.scrollHeight - container.clientHeight > 1;
        return prev === next ? prev : next;
      });
      setNeedsHorizontalSibling((prev) => {
        const next = !!hContainer && hContainer.scrollWidth - hContainer.clientWidth > 1;
        return prev === next ? prev : next;
      });
    }

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    if (hContainer && hContainer !== container) resizeObserver.observe(hContainer);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(container, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, horizontalContainerRef]);

  // Only shown while some part of the table is actually on screen.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  const visible = needsScroll && inView;
  const reserveBottom = needsHorizontalSibling && inView ? FLOATING_SCROLLBAR_THICKNESS : 0;
  const barHeight = rect.height - reserveBottom;

  useEffect(() => {
    const container = containerRef.current;
    const floating = floatingRef.current;
    if (!visible || !container || !floating) return;

    // Sync the instant it mounts, otherwise it'd start at scrollTop 0 even
    // if the table itself was already scrolled down.
    floating.scrollTop = container.scrollTop;

    let syncing = false;
    function onContainerScroll() {
      if (syncing) return;
      syncing = true;
      floating!.scrollTop = container!.scrollTop;
      syncing = false;
    }
    function onFloatingScroll() {
      if (syncing) return;
      syncing = true;
      container!.scrollTop = floating!.scrollTop;
      syncing = false;
    }

    container.addEventListener('scroll', onContainerScroll, { passive: true });
    floating.addEventListener('scroll', onFloatingScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onContainerScroll);
      floating.removeEventListener('scroll', onFloatingScroll);
    };
  }, [visible, containerRef]);

  function scrollByStep(direction: 1 | -1) {
    containerRef.current?.scrollBy({ top: direction * containerRef.current.clientHeight * SCROLL_STEP_RATIO, behavior: 'smooth' });
  }

  if (!visible || barHeight <= 0) return null;

  return (
    <div
      className="fixed right-0 z-40 flex flex-col items-center gap-0.5 bg-white border-l border-g200 shadow-[-2px_0_6px_rgba(0,0,0,0.08)] px-1 py-1"
      style={{ top: rect.top, height: barHeight }}
    >
      <button
        type="button"
        onClick={() => scrollByStep(-1)}
        aria-label="Scroll table up"
        className="shrink-0 flex items-center justify-center rounded text-red-mrt hover:bg-red-lt"
        style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
      >
        <ChevronUp size={ICON_SIZE} />
      </button>
      <div ref={floatingRef} className="flex-1 overflow-y-auto overflow-x-hidden" style={{ width: SCROLLBAR_TRACK_THICKNESS }}>
        <div style={{ height: scrollHeight, width: 1 }} />
      </div>
      <button
        type="button"
        onClick={() => scrollByStep(1)}
        aria-label="Scroll table down"
        className="shrink-0 flex items-center justify-center rounded text-red-mrt hover:bg-red-lt"
        style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
      >
        <ChevronDown size={ICON_SIZE} />
      </button>
    </div>
  );
}
