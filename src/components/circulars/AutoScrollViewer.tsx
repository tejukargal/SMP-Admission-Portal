import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface AutoScrollViewerProps {
  children: ReactNode;
  /** Tailwind height class for the compact preview frame. */
  height?: string;
}

/** Compact auto-scrolling preview frame — slowly ping-pongs top↔bottom while
 *  playing, pauses on manual scroll/touch for a few seconds, and toggles
 *  play/pause on click. Used for PDF/image/CSV attachment previews. */
export function AutoScrollViewer({ children, height = 'h-56' }: AutoScrollViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [scrollable, setScrollable] = useState(false);
  const manualRef = useRef(false);
  const manualTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const directionRef = useRef(1);

  // Detect whether content overflows the frame — re-checks as async content
  // (images loading, PDF pages rendering) changes the content height.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => setScrollable(el.scrollHeight > el.clientHeight + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !scrollable) return;
    const el = containerRef.current;
    if (!el) return;
    let last = performance.now();
    function step(now: number) {
      if (!el) return;
      const dt = now - last;
      last = now;
      if (!manualRef.current) {
        el.scrollTop += directionRef.current * dt * 0.02; // slow, ~20px/sec
        const max = el.scrollHeight - el.clientHeight;
        if (el.scrollTop >= max - 1) directionRef.current = -1;
        else if (el.scrollTop <= 1) directionRef.current = 1;
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, scrollable]);

  useEffect(() => () => { if (manualTimeoutRef.current) clearTimeout(manualTimeoutRef.current); }, []);

  function handleManualScroll() {
    manualRef.current = true;
    if (manualTimeoutRef.current) clearTimeout(manualTimeoutRef.current);
    manualTimeoutRef.current = window.setTimeout(() => { manualRef.current = false; }, 3000);
  }

  return (
    <div className={`relative ${height} rounded-lg border border-gray-200 bg-gray-50 overflow-hidden`}>
      <div
        ref={containerRef}
        onClick={() => scrollable && setPlaying((p) => !p)}
        onWheel={handleManualScroll}
        onScroll={handleManualScroll}
        onTouchMove={handleManualScroll}
        className={`h-full overflow-y-auto select-none ${scrollable ? 'cursor-pointer' : ''}`}
        title={scrollable ? (playing ? 'Click to pause' : 'Click to play') : undefined}
      >
        {children}
      </div>
      {scrollable && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-gray-50 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-gray-50 to-transparent" />
          <div className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/50 text-white p-1.5">
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </div>
        </>
      )}
    </div>
  );
}
