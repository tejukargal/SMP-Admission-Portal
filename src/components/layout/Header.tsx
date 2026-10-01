import { useState, useEffect, type CSSProperties } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../hooks/useSettings';

// Soft pastel-leaning tones (same family as the revamped pages' accents), with a
// gentle slate interleaved between each course colour so it stays dominant
const COURSE_COLORS = [
  '#64748B', // soft slate
  '#E39B4A', // CE — pastel amber
  '#64748B',
  '#4FA3D9', // EC — pastel sky
  '#64748B',
  '#3FB0A9', // CS — pastel teal
  '#64748B',
  '#9D85E8', // EE — pastel violet
] as const;

// ── Fresh frosted shell tokens ───────────────────────────────────────────────
const HAIRLINE = '#E6EAF0';
const INK = '#262B35';
const MUTED = '#8A93A3';
const CORAL = '#E11D48';

const TITLE = 'SMP ADMISSIONS';
// Non-breaking space keeps the word gap the same width in the letters and the shimmer copy
const TITLE_CHARS = [...TITLE].map((ch) => (ch === ' ' ? ' ' : ch));
const TITLE_STYLE: CSSProperties = { fontSize: '28px', letterSpacing: '0.2em' };

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function LogoutIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/** White inner pill: calendar + year. */
function YearPill({ year }: { year: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-[5px] text-[16px] font-semibold leading-none tabular-nums"
      style={{ color: INK, boxShadow: '0 1px 3px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.04)' }}
    >
      <span className="text-[#64748B]"><CalendarIcon /></span>
      {year}
    </span>
  );
}

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { logout } = useAuth();
  const { settings } = useSettings();
  const [colorIdx, setColorIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setColorIdx((i) => (i + 1) % COURSE_COLORS.length), 4000);
    return () => clearInterval(id);
  }, []);

  const year = settings?.currentAcademicYear ?? '—';

  return (
    <header
      className="font-wp relative h-13 flex items-center px-3 md:px-5 shrink-0 z-20 bg-white/75 backdrop-blur-md overflow-hidden"
      style={{ borderBottom: `1px solid ${HAIRLINE}`, boxShadow: '0 1px 10px 0 rgba(15,23,42,0.05)' }}
    >
      {/* Faint aurora tint behind the content */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute -top-10 left-[8%] w-56 h-28 rounded-full blur-2xl" style={{ background: 'rgba(180,83,9,0.07)' }} />
        <span className="absolute -top-12 left-[42%] w-72 h-28 rounded-full blur-2xl" style={{ background: 'rgba(3,105,161,0.06)' }} />
        <span className="absolute -top-10 right-[10%] w-56 h-28 rounded-full blur-2xl" style={{ background: 'rgba(109,40,217,0.06)' }} />
      </span>

      {/* Faint course-colour hairline along the bottom edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 bottom-0 h-px opacity-60"
        style={{ background: 'linear-gradient(90deg, transparent 0%, #E39B4A 20%, #4FA3D9 40%, #3FB0A9 60%, #9D85E8 80%, transparent 100%)' }}
      />

      {/* Mobile row — hamburger + Academic Year + logout icon */}
      <div className="relative flex md:hidden items-center w-full gap-2">
        <button
          onClick={onMenuClick}
          className="flex items-center justify-center w-9 h-9 rounded-full border bg-white text-[#5B6371] hover:text-[#262B35] hover:bg-[#F5F7FA] transition-colors cursor-pointer shrink-0"
          style={{ borderColor: HAIRLINE }}
          aria-label="Open menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0 flex items-center">
          <span className="inline-flex items-center rounded-full p-[3px] border" style={{ background: '#F3F5F8', borderColor: HAIRLINE }}>
            <YearPill year={year} />
          </span>
        </div>
        <button
          onClick={() => { void logout(); }}
          className="flex items-center justify-center w-9 h-9 rounded-full border bg-white transition-colors cursor-pointer shrink-0 hover:bg-[#E11D48]/[0.07]"
          style={{ borderColor: `${CORAL}40`, color: '#A5173A' }}
          title="Logout"
          aria-label="Logout"
        >
          <LogoutIcon size={15} />
        </button>
      </div>

      {/* Desktop row — Academic Year / centered app name / Logout */}
      <div className="relative hidden md:flex items-center w-full">
        {/* Left — Academic Year capsule (label + year on one row) */}
        <div className="flex-1 flex items-center min-w-0">
          <span
            className="inline-flex items-center gap-2.5 rounded-full border pl-3.5 pr-[3px] py-[3px]"
            style={{ background: '#F3F5F8', borderColor: HAIRLINE }}
          >
            <span className="text-[9.5px] font-medium uppercase tracking-[1.2px] leading-none whitespace-nowrap" style={{ color: MUTED }}>
              Academic Year
            </span>
            <YearPill year={year} />
          </span>
        </div>

        {/* Centre — app name: flowing aurora gradient + a glossy sweep on every colour tick */}
        <span
          className="relative font-bold uppercase select-none pointer-events-none whitespace-nowrap leading-none"
          style={TITLE_STYLE}
          aria-label="SMP Admissions"
          role="img"
        >
          <span aria-hidden="true" className="header-aurora">
            {TITLE_CHARS.map((ch, i) => (
              <span key={i} className="inline-block">{ch}</span>
            ))}
          </span>
          {/* Shimmer sweep — same letter boxes, text-clipped light band */}
          <span key={`s${colorIdx}`} aria-hidden="true" className="header-shimmer absolute inset-0">
            {TITLE_CHARS.map((ch, i) => (
              <span key={i} className="inline-block">{ch}</span>
            ))}
          </span>
        </span>

        {/* Right — logout */}
        <div className="flex-1 flex justify-end">
          <button
            onClick={() => { void logout(); }}
            className="group inline-flex items-center gap-2 rounded-full border bg-white pl-[4px] pr-3.5 py-[4px] text-[12.5px] font-medium text-[#3F4654] transition-all cursor-pointer hover:border-[#E11D48]/40 hover:bg-[#FFF5F7] hover:text-[#A5173A] hover:shadow-[0_3px_10px_rgba(225,29,72,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]/30"
            style={{ borderColor: HAIRLINE }}
            title="Logout"
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-transform group-hover:translate-x-0.5"
              style={{ background: `linear-gradient(135deg, #F43F5E, ${CORAL})`, boxShadow: '0 2px 6px rgba(225,29,72,0.3)' }}
            >
              <LogoutIcon size={12} />
            </span>
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
