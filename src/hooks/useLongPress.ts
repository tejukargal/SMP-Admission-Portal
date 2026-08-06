import { useRef } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

/** Touch-and-hold handler for opening context menus on devices without right-click. */
export function useLongPress(onLongPress: (point: { x: number; y: number }) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    const point = { x: touch.clientX, y: touch.clientY };
    startRef.current = point;
    timerRef.current = setTimeout(() => onLongPress(point), LONG_PRESS_MS);
  }

  function onTouchMove(e: React.TouchEvent) {
    const touch = e.touches[0];
    const start = startRef.current;
    if (!touch || !start) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clear();
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: clear,
    onTouchCancel: clear,
  };
}
