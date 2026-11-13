
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * A button that opens a small panel. The panel is positioned with `fixed` coordinates
 * so table wrappers and scroll containers never clip it, and it closes on Escape,
 * outside click, scroll of the page, or resize.
 */
export function Popover({ trigger, className = 'btn sm', children }: { trigger: ReactNode; className?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (box.current && e.target instanceof Node && box.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const style: CSSProperties = { right: Math.max(8, window.innerWidth - r.right) };
      if (below < 330 && r.top > below) style.bottom = window.innerHeight - r.top + 8;
      else style.top = r.bottom + 8;
      setPos(style);
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button ref={btn} type="button" className={className} onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
        {trigger}
      </button>
      {open && (
        <div ref={box} className="pop" style={pos} role="dialog">
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
}
