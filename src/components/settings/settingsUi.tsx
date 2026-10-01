import type { ButtonHTMLAttributes, ReactNode } from 'react';

// ── Settings design tokens (slate-blue student-portal look) ──────────────────
export const SLATE = '#3B5BA9';
export const SLATE_INK = '#2B437F';
export const HAIRLINE = '#D9E1F2';
export const BAND = '#EEF2FA';
export const MINT = '#0FA968';
export const CORAL = '#E11D48';

export const PAGE_BG = 'linear-gradient(160deg, #F5F7FC 0%, #FCFDFF 45%, #EFF3FA 100%)';

export const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap';
export const BTN_GRAY = `${BTN_BASE} border-[#D9E1F2] bg-white text-[#262B35] hover:border-[#3B5BA9]/40 hover:bg-[#3B5BA9]/[0.06] hover:text-[#2B437F] focus:ring-[#3B5BA9]/30`;
export const BTN_SLATE = `${BTN_BASE} border-[#3B5BA9]/45 bg-[#3B5BA9]/[0.08] text-[#2B437F] hover:bg-[#3B5BA9]/[0.15] focus:ring-[#3B5BA9]/30`;
export const BTN_GREEN = `${BTN_BASE} border-[#0FA968]/45 bg-[#0FA968]/[0.08] text-[#0A7A4B] hover:bg-[#0FA968]/[0.15] focus:ring-[#0FA968]/30`;
export const BTN_RED = `${BTN_BASE} border-[#E11D48]/40 bg-[#E11D48]/[0.07] text-[#A5173A] hover:bg-[#E11D48]/[0.13] focus:ring-[#E11D48]/30`;
/** Primary call-to-action: solid slate gradient. */
export const BTN_PRIMARY = `${BTN_BASE} border-transparent text-white bg-gradient-to-br from-[#3B5BA9] to-[#2B437F] shadow-[0_3px_10px_rgba(59,91,169,0.25)] hover:brightness-95 focus:ring-[#3B5BA9]/40 focus:ring-offset-2`;

/** Text input: rounded, hairline border, slate focus ring. */
export const TEXT_INPUT =
  'block w-full rounded-xl border border-[#D9E1F2] bg-[#FAFBFE] px-3.5 py-2 text-[13px] text-[#262B35] placeholder:text-[#8A93A3] focus:outline-none focus:bg-white focus:border-[#3B5BA9] focus:ring-2 focus:ring-[#3B5BA9]/20 transition-colors';

// ── Pill button with optional loading spinner (same semantics as common/Button) ──
interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'slate' | 'gray' | 'green' | 'red';
  loading?: boolean;
}
const TONE_CLASS: Record<NonNullable<PillButtonProps['tone']>, string> = {
  primary: BTN_PRIMARY,
  slate: BTN_SLATE,
  gray: BTN_GRAY,
  green: BTN_GREEN,
  red: BTN_RED,
};
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

// ── Inline notice (success / error / info) ───────────────────────────────────
const NOTICE_TONE = {
  success: { c: MINT, ink: '#0A7A4B', icon: '✓' },
  error: { c: CORAL, ink: '#A5173A', icon: '!' },
  info: { c: SLATE, ink: SLATE_INK, icon: 'i' },
} as const;
export function Notice({ tone, children, className = '' }: { tone: keyof typeof NOTICE_TONE; children: ReactNode; className?: string }) {
  const t = NOTICE_TONE[tone];
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] ${className}`}
      style={{ borderColor: `${t.c}40`, background: `${t.c}0D`, color: t.ink, animation: 'page-enter 0.18s ease-out' }}
    >
      <span className="mt-[1px] w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold" style={{ background: t.c }}>
        {t.icon}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ── Card with a soft icon tile, title and description ─────────────────────────
export function SettingsCard({
  title, subtitle, icon, tone = SLATE, right, className = '', delay = 0, children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Accent colour of the icon tile. */
  tone?: string;
  right?: ReactNode;
  className?: string;
  delay?: number;
  children?: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border bg-white p-5 transition-shadow duration-200 hover:shadow-[0_6px_20px_rgba(43,67,127,0.07)] ${className}`}
      style={{ borderColor: HAIRLINE, animation: `page-enter 0.2s ease-out ${delay}s both` }}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <span
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: `${tone}14`, color: tone, boxShadow: `inset 0 0 0 1px ${tone}26` }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-medium leading-tight" style={{ color: SLATE_INK }}>{title}</h3>
          {subtitle && <p className="mt-1 text-[12px] leading-relaxed text-[#5B6371]">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

// ── Section side nav (shared by the Settings tab wrappers) ───────────────────
export interface SectionNavGroup<T extends string> {
  title: string;
  items: { id: T; label: string; hint: string }[];
}

export function SettingsSectionNav<T extends string>({
  groups, active, onSelect, renderBadge,
}: {
  groups: SectionNavGroup<T>[];
  active: T;
  onSelect: (id: T) => void;
  /** Optional marker rendered after the label (e.g. an "unsaved" dot). */
  renderBadge?: (id: T) => ReactNode;
}) {
  return (
    <nav
      className="w-60 flex-shrink-0 overflow-auto no-scrollbar rounded-2xl border bg-white/85 p-2.5 space-y-4"
      style={{ borderColor: HAIRLINE }}
    >
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-2.5 pt-1 mb-1.5 text-[9.5px] font-medium uppercase tracking-[1px] text-[#8A93A3]">{group.title}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={`group relative w-full text-left pl-4 pr-2.5 py-2 rounded-xl transition-colors cursor-pointer ${
                    isActive ? 'bg-[#3B5BA9]/[0.08]' : 'hover:bg-[#F5F7FC]'
                  }`}
                >
                  <span
                    className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-200 ${
                      isActive ? 'h-5 bg-[#3B5BA9]' : 'h-0 bg-transparent'
                    }`}
                  />
                  <span className={`block text-[13px] font-medium ${isActive ? 'text-[#2B437F]' : 'text-[#262B35] group-hover:text-[#2B437F]'}`}>
                    {item.label}
                    {renderBadge?.(item.id)}
                  </span>
                  <span className={`block text-[10.5px] leading-snug mt-0.5 ${isActive ? 'text-[#3B5BA9]/80' : 'text-[#8A93A3]'}`}>{item.hint}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
