import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../hooks/useSettings';
import { Button } from '../common/Button';

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

export function Header() {
  const { logout } = useAuth();
  const { settings } = useSettings();
  const [colorIdx, setColorIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setColorIdx((i) => (i + 1) % COURSE_COLORS.length), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-13 bg-white flex items-center px-5 shrink-0" style={{ borderBottom: '1px solid #d1fae5', boxShadow: '0 1px 6px 0 rgba(16,185,129,0.06)' }}>

      {/* Left — app name */}
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

      {/* Right — year badge + divider + user info + logout */}
      <div className="flex items-center gap-3 ml-auto">
        <div className="text-right shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500/70 leading-none">Academic Year</p>
          <p className="text-xl font-black text-gray-800 leading-none mt-px tabular-nums">
            {settings?.currentAcademicYear ?? '—'}
          </p>
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-emerald-200 shrink-0" />

        <Button variant="secondary" size="sm" onClick={() => { void logout(); }}>
          Logout
        </Button>
      </div>
    </header>
  );
}
