import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../hooks/useSettings';

// App green interleaved between each course colour so it stays dominant
const COURSE_COLORS = [
  '#065f46', // app emerald (dark)
  '#b45309', // CE — amber
  '#065f46',
  '#0369a1', // EC — sky
  '#065f46',
  '#0f766e', // CS — teal
  '#065f46',
  '#6d28d9', // EE — violet
] as const;

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { logout } = useAuth();
  const { settings } = useSettings();
  const [colorIdx, setColorIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setColorIdx((i) => (i + 1) % COURSE_COLORS.length), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-13 bg-white flex items-center px-3 md:px-5 shrink-0" style={{ borderBottom: '1px solid #d1fae5', boxShadow: '0 1px 6px 0 rgba(16,185,129,0.06)' }}>

      {/* Mobile row — hamburger + Academic Year + logout icon */}
      <div className="flex md:hidden items-center w-full gap-2">
        <button
          onClick={onMenuClick}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer shrink-0"
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <p className="text-sm font-black text-gray-800 leading-none tabular-nums flex-1 min-w-0 truncate">
          {settings?.currentAcademicYear ?? '—'}
        </p>
        <button
          onClick={() => { void logout(); }}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer shrink-0"
          title="Logout"
          aria-label="Logout"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Desktop row — Academic Year / centered app name / Logout */}
      <div className="hidden md:flex items-center w-full">
        {/* Left — Academic Year */}
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500/70 leading-none">Academic Year</p>
          <p className="text-xl font-black text-gray-800 leading-none mt-px tabular-nums">
            {settings?.currentAcademicYear ?? '—'}
          </p>
        </div>

        {/* Centre — app name */}
        <span
          className="font-black uppercase select-none pointer-events-none whitespace-nowrap"
          style={{
            fontSize: '34px',
            color: COURSE_COLORS[colorIdx],
            letterSpacing: '0.16em',
            transition: 'color 2s ease-in-out',
            animation: 'header-title-breathe 6s ease-in-out infinite',
          }}
        >
          SMP ADMISSIONS
        </span>

        {/* Right — logout */}
        <div className="flex-1 flex justify-end">
          <button
            onClick={() => { void logout(); }}
            className="flex items-center gap-1.5 group cursor-pointer"
            title="Logout"
          >
            <span className="w-1 h-3.5 rounded-full shrink-0 bg-rose-400 group-hover:bg-rose-600 transition-colors" />
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-500 group-hover:text-rose-700 transition-colors">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
