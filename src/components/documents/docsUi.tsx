/* Small presentational pieces for the Manage Documents area —
   thin outline pills, medium weight (Outfit via .font-wp). */
import type { ReactNode } from 'react';
import { DOC_TONE } from './docsTokens';

export function OutlinePill({ children, color, wash, title }: { children: ReactNode; color: string; wash?: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] font-medium leading-[18px] whitespace-nowrap"
      style={{ borderColor: `${color}66`, color, background: wash ?? 'transparent' }}
    >
      {children}
    </span>
  );
}

export function Spinner({ color = DOC_TONE.accent, size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke={`${color}33`} strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Progress ring with a centred "received / required" count. */
export function ProgressRing({ value, total, size = 58 }: { value: number; total: number; size?: number }) {
  const stroke = size < 50 ? 4 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(1, value / total) : 1;
  const done = total > 0 && value >= total;
  const color = done ? DOC_TONE.emerald : value === 0 ? DOC_TONE.coral : DOC_TONE.amber;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`${color}22`} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 0.5s ease-out, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`${size < 50 ? 'text-[12.5px]' : 'text-[15px]'} font-semibold tabular-nums`} style={{ color: DOC_TONE.text }}>
          {value}<span className={`${size < 50 ? 'text-[9.5px]' : 'text-[11px]'} font-medium`} style={{ color: DOC_TONE.muted }}>/{total}</span>
        </span>
      </div>
    </div>
  );
}

export function Svg({ children, size = 14, strokeWidth = 2 }: { children: ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
