import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import { dmy, parseDmy } from '../../utils/examDutyCertificate';

// Shared form pieces for the exam certificate modals (Attendance, and
// Setting & Conducting).

// Page accent — wine
export const WINE = '#BE185D';
export const WINE_INK = '#9D174D';
export const WINE_HAIR = '#F3D3E1';
export const WINE_BAND = '#FDF0F5';

// A4 at 96 dpi
export const A4_W = 794;
export const A4_H = 1123;
export const HALF_A4_H = 561;

export const FIELD =
  'block w-full rounded-lg border border-[#E7E3E8] bg-white px-3 py-2 text-[13.5px] text-[#262B35] placeholder:text-[#A9A2AC] ' +
  'focus:outline-none focus:border-[#BE185D]/60 focus:ring-2 focus:ring-[#BE185D]/15 transition-colors';

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="flex items-baseline justify-between gap-2 mb-1">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.6px] text-[#7A6F7D]">{children}</span>
      {hint && <span className="text-[10.5px] text-[#A9A2AC]">{hint}</span>}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[#E7E3E8] bg-[#FBF9FB] p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors cursor-pointer ${on ? 'text-white' : 'text-[#6B6170] hover:text-[#9D174D]'}`}
            style={on ? { background: WINE } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-medium text-white" style={{ background: WINE }}>{n}</span>
      <span className="text-[12.5px] font-medium text-[#9D174D]">{children}</span>
      <span className="flex-1 h-px" style={{ background: WINE_HAIR }} />
    </div>
  );
}

/** Typed date field in dd/mm/yyyy. `value` / `onChange` use 'YYYY-MM-DD' ('' while incomplete or invalid). */
export function DmyDateInput({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(() => (value ? dmy(value) : ''));
  const [blurred, setBlurred] = useState(false);
  // Follow outside changes (e.g. To pushed forward by From) without fighting the user's typing.
  useEffect(() => {
    if (parseDmy(text) !== value) setText(value ? dmy(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const invalid = blurred && text.trim() !== '' && !parseDmy(text);
  return (
    <input
      className={`${FIELD} tabular-nums ${invalid ? '!border-[#B4232F] !ring-[#B4232F]/15' : ''}`}
      inputMode="numeric"
      placeholder="dd/mm/yyyy"
      maxLength={10}
      value={text}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d/.-]/g, '');
        setText(v);
        setBlurred(false);
        onChange(parseDmy(v));
      }}
      onBlur={() => {
        setBlurred(true);
        const iso = parseDmy(text);
        if (iso) setText(dmy(iso));
      }}
    />
  );
}

/** Certificate document rendered at print size in an iframe, scaled to the column width. */
export function ScaledPreview({ html, width = A4_W, height }: { html: string; width?: number; height: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // Rounded so sub-pixel width jitter (fractional display scaling) can't
    // keep re-triggering the observer.
    const update = () => setScale(Math.min(1, Math.floor((el.clientWidth / width) * 1000) / 1000));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={boxRef} className="w-full">
      <div
        className="relative overflow-hidden rounded-md bg-white shadow-[0_6px_24px_rgba(80,10,40,0.10)] ring-1 ring-black/5"
        style={{ height: height * scale }}
      >
        <iframe
          title="Certificate preview"
          srcDoc={html}
          sandbox="allow-scripts"
          className="absolute left-0 top-0 border-0 origin-top-left pointer-events-none"
          style={{ width, height, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}
