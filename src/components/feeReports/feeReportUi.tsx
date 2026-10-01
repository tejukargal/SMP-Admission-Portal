import { useState, type ReactNode } from 'react';

// ── Fee Reports design tokens (teal student-portal look, same family as Admissions) ──
export const TEAL = '#0F8B8D';
export const TEAL_INK = '#0B6567';
export const HAIRLINE = '#CDE7E7';

/** Select-pill class for the remaining native <select> filters. */
export const fs =
  'shrink-0 rounded-full border border-[#0F8B8D]/35 px-3 py-1.5 text-[11.5px] font-medium bg-white text-[#0B6567] focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/30 focus:border-[#0F8B8D] hover:border-[#0F8B8D]/60 cursor-pointer transition-colors';

/** Table header band (light teal) and its darker "total column" cell tint. */
export const THEAD = 'bg-[#F2FAFA] text-[#0B6567]';
export const THEAD_DARK = 'bg-[#E3F1F1]';
/** Sticky footer band (totals rows). */
export const TFOOT =
  'sticky bottom-0 z-10 bg-[#E6F4F4] border-t border-[#CDE7E7] font-semibold text-[11px] text-[#0B6567]';
/** Scroll container for a table card — pairs with the .scroll-fee scrollbar. */
export const TABLE_CARD = 'bg-white rounded-2xl border border-[#CDE7E7] overflow-auto scroll-fee';

export const BTN_BASE =
  'rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap';
export const BTN_GRAY = `${BTN_BASE} border-[#CDE7E7] bg-white text-[#262B35] hover:border-[#0F8B8D]/40 hover:bg-[#0F8B8D]/[0.06] hover:text-[#0B6567] focus:ring-[#0F8B8D]/30`;
export const BTN_TEAL = `${BTN_BASE} border-[#0F8B8D]/45 bg-[#0F8B8D]/[0.08] text-[#0B6567] hover:bg-[#0F8B8D]/[0.15] focus:ring-[#0F8B8D]/30`;
export const BTN_GREEN = `${BTN_BASE} border-[#0FA968]/45 bg-[#0FA968]/[0.08] text-[#0A7A4B] hover:bg-[#0FA968]/[0.15] focus:ring-[#0FA968]/30`;
export const BTN_RED = `${BTN_BASE} border-[#E11D48]/40 bg-[#E11D48]/[0.07] text-[#A5173A] hover:bg-[#E11D48]/[0.13] focus:ring-[#E11D48]/30`;
export const BTN_AMBER = `${BTN_BASE} border-[#D97706]/45 bg-[#D97706]/[0.08] text-[#9A5B00] hover:bg-[#D97706]/[0.15] focus:ring-[#D97706]/30`;
/** Primary call-to-action: solid teal. */
export const BTN_PRIMARY = `${BTN_BASE} border-transparent text-white bg-[#0F8B8D] hover:bg-[#0B6567] focus:ring-[#0F8B8D]/40`;

// ── Chip ──────────────────────────────────────────────────────────────────────
interface ChipProps { label: string; count: number; active: boolean; colorClass: string; onClick: () => void; }
export function Chip({ label, count, active, colorClass, onClick }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-[6px] rounded-full border text-[11.5px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97]
        ${active ? colorClass : 'border-[#CDE7E7] bg-white text-[#5B6371] hover:border-[#0F8B8D]/40 hover:text-[#0B6567]'}`}
    >
      <span>{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums
        ${active ? 'bg-white/60' : 'bg-[#F2FAFA] text-[#5B6371]'}`}>
        {count}
      </span>
    </button>
  );
}

// ── Export buttons ─────────────────────────────────────────────────────────────
export function ExportBar({ onPdf, onExcel }: { onPdf?: () => void; onExcel?: () => void }) {
  return (
    <div className="flex gap-1.5">
      {onPdf   && <button onClick={onPdf} className={BTN_GRAY}>PDF</button>}
      {onExcel && <button onClick={onExcel} className={BTN_GREEN}>Excel</button>}
    </div>
  );
}

// ── Clear filters button ─────────────────────────────────────────────────────
export function ClearButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-[#D97706]/10 text-[#D97706] hover:bg-[#D97706]/[0.16]'
          : 'border border-[#CDE7E7] bg-white text-[#8A93A3]'
      }`}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      Clear
    </button>
  );
}

// ── Stat chip strip ──────────────────────────────────────────────────────────
export interface StatChipEntry { label: string; value: string | number; color: string; bg: string; border: string; }
export function StatChipRow({ entries, compact = false }: { entries: StatChipEntry[]; compact?: boolean }) {
  return (
    <div className={compact ? 'shrink-0 flex gap-1.5 overflow-x-auto no-scrollbar' : 'shrink-0 flex flex-wrap gap-2'}>
      {entries.map((c) => (
        <div key={c.label} className={`flex items-center gap-1.5 rounded-full border ${c.border} ${c.bg} py-[5px] whitespace-nowrap ${compact ? 'flex-1 justify-center px-2.5' : 'px-3'}`}>
          <span className="text-[10px] font-medium text-[#5B6371] uppercase tracking-wide">{c.label}</span>
          <span className={`text-[13px] font-semibold tabular-nums ${c.color}`}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Segmented toggle ─────────────────────────────────────────────────────────
export interface SegmentedOption { value: string; label: string; }
export function SegmentedToggle({ options, value, onChange }: { options: SegmentedOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[#CDE7E7] bg-[#F2FAFA] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer ${
            value === o.value ? 'bg-[#0F8B8D] text-white' : 'text-[#5B6371] hover:text-[#0B6567]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Search box ──────────────────────────────────────────────────────────────
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative shrink-0 w-60">
      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: TEAL_INK }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-full border border-[#0F8B8D]/40 bg-[#F2FAFA] py-2 text-[13.5px] font-medium text-[#0B6567] placeholder:text-[#0B6567]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#0F8B8D] focus:ring-2 focus:ring-[#0F8B8D]/20 transition-all duration-150 pl-9 ${value ? 'pr-8' : 'pr-3'}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#D97706]/10 hover:bg-[#D97706]/20 text-[#D97706] transition-colors duration-150 shrink-0"
          aria-label="Clear search"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Collapsible filter panel (toolbar card) ──────────────────────────────────
// Always-visible top row (search / right slot / clear / toggle) with a collapsible
// row of filter controls below it. `showFilters` is local — each tab mounts one panel.
export function FilterPanel({
  search, right, hasActiveFilters, onClear, children, collapsible = true,
}: {
  search?: ReactNode;
  right?: ReactNode;
  hasActiveFilters: boolean;
  onClear: () => void;
  children: ReactNode;
  /** false → filters are always visible and the toggle button is hidden. */
  collapsible?: boolean;
}) {
  const [open, setShowFilters] = useState(false);
  const showFilters = open;
  return (
    <div
      className="shrink-0 rounded-2xl border bg-white transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(11,101,103,0.06)]"
      style={{ borderColor: HAIRLINE }}
    >
      <div className="flex items-center gap-2 px-2.5 py-2 flex-wrap">
        {search}
        {!collapsible && children}
        <div className="flex-1" />
        {right}
        {hasActiveFilters && (
          <>
            <span className="w-px h-5 shrink-0" style={{ background: HAIRLINE }} />
            <ClearButton active={hasActiveFilters} onClick={onClear} />
          </>
        )}
        {collapsible && <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
            showFilters || hasActiveFilters
              ? 'bg-[#0F8B8D]/10 border-[#0F8B8D]/30 text-[#0F8B8D]'
              : 'border-[#CDE7E7] text-[#5B6371] hover:bg-[#EFF8F8] hover:text-[#262B35]'
          }`}
          title="Toggle filters"
          aria-label="Toggle filters"
          aria-expanded={showFilters}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </button>}
      </div>

      {collapsible && <div
        className="grid"
        style={{
          gridTemplateRows: showFilters ? '1fr' : '0fr',
          opacity: showFilters ? 1 : 0,
          transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className={showFilters ? 'overflow-visible' : 'overflow-hidden'}>
          <div className="flex flex-wrap content-center items-center gap-1.5 px-2.5 py-2 border-t" style={{ borderColor: '#E3F1F1' }}>
            {children}
          </div>
        </div>
      </div>}
    </div>
  );
}

// ── Report card: slim titled header strip (title + actions) over a flex body ──
export function ReportCard({
  title, subtitle, actions, className = '', children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col min-h-0 rounded-2xl border bg-white overflow-hidden ${className}`} style={{ borderColor: HAIRLINE }}>
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b bg-[#F2FAFA]" style={{ borderColor: HAIRLINE }}>
        <div className="min-w-0">
          <h3 className="text-[12px] font-medium text-[#0B6567] truncate">{title}</h3>
          {subtitle && <p className="text-[10.5px] text-[#8A93A3] truncate">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-1.5">{actions}</div>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </section>
  );
}
