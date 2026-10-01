import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ── Student Messages design tokens (sky / cyan student-portal look) ──────────
export const CYAN = '#0891B2';
export const CYAN_INK = '#0E6A85';
export const HAIRLINE = '#CBE8F0';
export const BAND = '#ECF7FA';
export const MINT = '#0FA968';
export const CORAL = '#E11D48';
export const AMBER = '#D97706';
export const VIOLET = '#7C5CC4';
export const MUTED = '#8A93A3';

export const PAGE_BG = 'linear-gradient(160deg, #F2FAFC 0%, #FCFEFF 45%, #EDF7FA 100%)';

/** Darker ink for a pastel accent (text on a tinted pill). */
function inkFor(c: string): string {
  switch (c) {
    case MINT: return '#0A7A4B';
    case CORAL: return '#A5173A';
    case AMBER: return '#9A5B00';
    case VIOLET: return '#5B3FA0';
    case CYAN: return CYAN_INK;
    default: return '#5B6371';
  }
}

export const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap';
export const BTN_GRAY = `${BTN_BASE} border-[#CBE8F0] bg-white text-[#262B35] hover:border-[#0891B2]/40 hover:bg-[#0891B2]/[0.06] hover:text-[#0E6A85] focus:ring-[#0891B2]/30`;
export const BTN_CYAN = `${BTN_BASE} border-[#0891B2]/45 bg-[#0891B2]/[0.08] text-[#0E6A85] hover:bg-[#0891B2]/[0.15] focus:ring-[#0891B2]/30`;
export const BTN_GREEN = `${BTN_BASE} border-[#0FA968]/45 bg-[#0FA968]/[0.08] text-[#0A7A4B] hover:bg-[#0FA968]/[0.15] focus:ring-[#0FA968]/30`;
export const BTN_RED = `${BTN_BASE} border-[#E11D48]/40 bg-[#E11D48]/[0.07] text-[#A5173A] hover:bg-[#E11D48]/[0.13] focus:ring-[#E11D48]/30`;
/** Primary call-to-action: solid cyan gradient. */
export const BTN_PRIMARY = `${BTN_BASE} border-transparent text-white bg-gradient-to-br from-[#0891B2] to-[#0E6A85] shadow-[0_3px_10px_rgba(8,145,178,0.28)] hover:brightness-95 focus:ring-[#0891B2]/40 focus:ring-offset-1`;
/** Destructive confirm: solid coral. */
export const BTN_DANGER = `${BTN_BASE} border-transparent text-white bg-[#E11D48] hover:bg-[#BE123C] shadow-[0_3px_10px_rgba(225,29,72,0.25)] focus:ring-[#E11D48]/40 focus:ring-offset-1`;

/** Text input / textarea. */
export const TEXT_INPUT =
  'block w-full rounded-xl border border-[#CBE8F0] bg-[#FAFDFE] px-3.5 py-2 text-[13px] text-[#262B35] placeholder:text-[#8A93A3] focus:outline-none focus:bg-white focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-colors';
/** Overrides for the shared Input / Select so they match TEXT_INPUT. */
export const FIELD_OVERRIDE =
  '!rounded-xl !border-[#CBE8F0] !bg-[#FAFDFE] !text-[13px] focus:!bg-white focus:!border-[#0891B2] focus:!ring-[#0891B2]/20';
/** Small native <select> as an outline pill. */
export const SELECT_PILL =
  'rounded-full border border-[#0891B2]/35 bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#0E6A85] hover:border-[#0891B2]/60 focus:outline-none focus:ring-2 focus:ring-[#0891B2]/25 cursor-pointer transition-colors';

// ── Pill button with optional spinner (same semantics as common/Button) ──────
type Tone = 'primary' | 'cyan' | 'gray' | 'green' | 'red' | 'danger';
const TONE_CLASS: Record<Tone, string> = {
  primary: BTN_PRIMARY, cyan: BTN_CYAN, gray: BTN_GRAY, green: BTN_GREEN, red: BTN_RED, danger: BTN_DANGER,
};
interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  loading?: boolean;
}
export function PillButton({ tone = 'primary', loading = false, disabled, className = '', children, ...props }: PillButtonProps) {
  return (
    <button disabled={disabled || loading} className={`${TONE_CLASS[tone]} ${className}`} {...props}>
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

// ── Field label ──────────────────────────────────────────────────────────────
export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block mb-1.5 text-[11.5px] font-medium text-[#5B6371]">
      {children}
      {hint && <span className="ml-1 font-normal text-[#8A93A3]">{hint}</span>}
    </label>
  );
}

// ── Thin-outline status pill ─────────────────────────────────────────────────
export function StatusPill({ color, children, dot = true, className = '' }: { color: string; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border bg-white/90 px-2 py-[2px] text-[10px] font-medium leading-tight whitespace-nowrap ${className}`}
      style={{ borderColor: `${color}55`, color: inkFor(color) }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
      {children}
    </span>
  );
}

// ── Count chip (inside tabs / segmented toggles) ─────────────────────────────
export function CountChip({ active, children, alert = false }: { active: boolean; children: ReactNode; alert?: boolean }) {
  return (
    <span
      className={`rounded-full px-1.5 min-w-[18px] text-center text-[10px] font-semibold tabular-nums leading-[16px] ${
        alert ? 'bg-[#E11D48] text-white' : active ? 'bg-white/25 text-white' : 'bg-[#ECF7FA] text-[#0E6A85]'
      }`}
    >
      {children}
    </span>
  );
}

// ── Search pill ──────────────────────────────────────────────────────────────
export function SearchPill({ value, onChange, placeholder, className = 'w-full sm:w-56' }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string;
}) {
  return (
    <div className={`relative shrink-0 ${className}`}>
      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: CYAN_INK }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-full border border-[#0891B2]/40 bg-[#F2FAFC] py-2 text-[13px] font-medium text-[#0E6A85] placeholder:text-[#0E6A85]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#0891B2] focus:ring-2 focus:ring-[#0891B2]/20 transition-all duration-150 pl-9 ${value ? 'pr-8' : 'pr-3'}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#D97706]/10 hover:bg-[#D97706]/20 text-[#D97706] transition-colors duration-150 shrink-0 cursor-pointer"
          aria-label="Clear search"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  );
}

// ── Segmented toggle ─────────────────────────────────────────────────────────
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border p-0.5 bg-[#F2FAFC] shrink-0" style={{ borderColor: HAIRLINE }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer ${
              active ? 'bg-[#0891B2] text-white shadow-[0_2px_6px_rgba(8,145,178,0.25)]' : 'text-[#5B6371] hover:text-[#0E6A85]'
            }`}
          >
            {o.label}
            {o.count !== undefined && <CountChip active={active}>{o.count}</CountChip>}
          </button>
        );
      })}
    </div>
  );
}

// ── Kebab (⋮) options button ─────────────────────────────────────────────────
export function KebabButton({ onOpen, className = '' }: { onOpen: (x: number, y: number) => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Options"
      className={`z-10 w-6 h-6 flex items-center justify-center rounded-full text-[#8A93A3] hover:text-[#0E6A85] hover:bg-[#0891B2]/10 transition-colors cursor-pointer ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onOpen(rect.right, rect.bottom + 4);
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
      </svg>
    </button>
  );
}

// ── Empty / loading state ────────────────────────────────────────────────────
export function EmptyState({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-[12.5px] text-[#8A93A3]">
      {loading ? (
        <span className="w-5 h-5 rounded-full border-2 border-[#CBE8F0] border-t-[#0891B2] animate-spin" />
      ) : (
        <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: BAND, color: CYAN }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        </span>
      )}
      <span className="max-w-sm">{children}</span>
    </div>
  );
}

// ── Modal shell ──────────────────────────────────────────────────────────────
const SIZE: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl',
};
export function MsgModal({
  title, subtitle, icon, tone = CYAN, onClose, footer, size = 'lg', portal = false, bodyClassName = 'px-5 py-4 space-y-3.5', children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  tone?: string;
  /** Backdrop click and the × button. */
  onClose: () => void;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Render into document.body (for modals that were portalled before). */
  portal?: boolean;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  const node = (
    <div className="font-wp fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-[#0B2530]/40" style={{ animation: 'backdrop-enter 0.18s ease-out' }} onClick={onClose} aria-hidden="true" />
      <div
        className={`relative bg-white rounded-2xl w-full ${SIZE[size]} max-h-[90vh] flex flex-col overflow-hidden border`}
        style={{ borderColor: HAIRLINE, boxShadow: '0 24px 60px -12px rgba(14,106,133,0.35)', animation: 'modal-enter 0.22s ease-out' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b" style={{ borderColor: BAND, background: 'linear-gradient(180deg, #F5FBFD 0%, #FFFFFF 100%)' }}>
          {icon && (
            <span className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${tone}14`, color: tone, boxShadow: `inset 0 0 0 1px ${tone}26` }}>
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[14.5px] font-medium leading-tight truncate" style={{ color: CYAN_INK }}>{title}</h3>
            {subtitle && <div className="mt-0.5 text-[11.5px] text-[#5B6371]">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[#8A93A3] hover:bg-[#0891B2]/10 hover:text-[#0E6A85] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t bg-[#FAFDFE]" style={{ borderColor: BAND }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
  return portal ? createPortal(node, document.body) : node;
}

// ── Icons ────────────────────────────────────────────────────────────────────
export function Ico({ children, size = 14, strokeWidth = 2 }: { children: ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const ICONS = {
  megaphone: (s = 14) => <Ico size={s}><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></Ico>,
  pen: (s = 14) => <Ico size={s}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Ico>,
  send: (s = 14) => <Ico size={s}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Ico>,
  inbox: (s = 14) => <Ico size={s}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></Ico>,
  users: (s = 14) => <Ico size={s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Ico>,
  sparkle: (s = 14) => <Ico size={s}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Ico>,
  plus: (s = 14) => <Ico size={s} strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Ico>,
  trash: (s = 14) => <Ico size={s}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></Ico>,
  image: (s = 14) => <Ico size={s}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></Ico>,
  check: (s = 14) => <Ico size={s} strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></Ico>,
  clip: (s = 12) => <Ico size={s}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></Ico>,
  pin: (s = 9) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M16 3c-.6 0-1 .4-1 1v6.2l-2.5 2.5V6a1 1 0 0 0-2 0v6.7L8 15.2V17h8v-1.8l-2.5-2.5V6.9L16 4.7V13a1 1 0 0 0 2 0V4c0-.6-.4-1-1-1z" /><path d="M11 17v4a1 1 0 0 0 2 0v-4z" /></svg>,
};

export type MsgIconName = keyof typeof ICONS;
export function MsgIcon({ name, size }: { name: MsgIconName; size?: number }) {
  return ICONS[name](size);
}
