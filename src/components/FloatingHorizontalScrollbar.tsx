import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// How much of the container's visible width an arrow-button click jumps —
// short of a full page so a little of the previous view stays in sight.
const SCROLL_STEP_RATIO = 0.8;

interface HorizontalRect {
  left: number;
  width: number;
}

// Mirrors a wide table's own overflow-x scroll container as a slim bar
// pinned to the bottom of the viewport, so it's reachable without first
// scrolling the page down to the table's native scrollbar. Renders a real
// `overflow-x-auto` element rather than a hand-rolled draggable thumb —
// that gets native mouse/trackpad/touch scrolling for free. Two `scroll`
// listeners keep it and the real table in sync; a plain boolean guard (not
// React state) stops them echoing each other.
//
// Opt-in per page: pass the ref of the table's own overflow-x container.
// Nothing renders (and no observers attach) unless that container's
// content is actually wider than itself and currently on screen.
export default function FloatingHorizontalScrollbar({
  containerRef,
}: {
  containerRef: { current: HTMLDivElement | null };
}) {
  const floatingRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [inView, setInView] = useState(false);
  const [rect, setRect] = useState<HorizontalRect>({ left: 0, width: 0 });
  const [scrollWidth, setScrollWidth] = useState(0);

  // Re-measures whenever the container's own box moves/resizes (ResizeObserver
  // + window resize) or its content changes shape (MutationObserver) — a
  // status-tab switch that changes row count changes what's visible without
  // necessarily resizing the container itself, so content mutations need
  // their own trigger rather than relying on resize alone.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      if (!container) return;
      const r = container.getBoundingClientRect();
      setRect((prev) => (prev.left === r.left && prev.width === r.width ? prev : { left: r.left, width: r.width }));
      setScrollWidth((prev) => (prev === container.scrollWidth ? prev : container.scrollWidth));
      setNeedsScroll((prev) => {
        const next = container.scrollWidth - container.clientWidth > 1;
        return prev === next ? prev : next;
      });
    }

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(container, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef]);

  // Only shown while some part of the table is actually on screen.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  const visible = needsScroll && inView;

  useEffect(() => {
    const container = containerRef.current;
    const floating = floatingRef.current;
    if (!visible || !container || !floating) return;

    // Sync the instant it mounts, otherwise it'd start at scrollLeft 0 even
    // if the table itself was already scrolled right.
    floating.scrollLeft = container.scrollLeft;

    let syncing = false;
    function onContainerScroll() {
      if (syncing) return;
      syncing = true;
      floating!.scrollLeft = container!.scrollLeft;
      syncing = false;
    }
    function onFloatingScroll() {
      if (syncing) return;
      syncing = true;
      container!.scrollLeft = floating!.scrollLeft;
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
    containerRef.current?.scrollBy({ left: direction * containerRef.current.clientWidth * SCROLL_STEP_RATIO, behavior: 'smooth' });
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 z-40 flex items-center gap-0.5 bg-white border-t border-g200 shadow-[0_-2px_6px_rgba(0,0,0,0.08)] px-1 py-1"
      style={{ left: rect.left, width: rect.width }}
    >
      <button
        type="button"
        onClick={() => scrollByStep(-1)}
        aria-label="Scroll table left"
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-red-mrt hover:bg-red-lt"
      >
        <ChevronLeft size={14} />
      </button>
      <div ref={floatingRef} className="flex-1 overflow-x-auto overflow-y-hidden" style={{ height: 14 }}>
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
      <button
        type="button"
        onClick={() => scrollByStep(1)}
        aria-label="Scroll table right"
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-red-mrt hover:bg-red-lt"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
