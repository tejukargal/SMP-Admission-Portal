import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../hooks/useSettings';
import { Button } from '../common/Button';

export function Header() {
  const { logout, user, role } = useAuth();
  const { settings } = useSettings();

  // Derive initials from email
  const initials = user?.email
    ? user.email.split('@')[0].slice(0, 2).toUpperCase()
    : '??';

  return (
    <header className="h-13 bg-white flex items-center justify-between px-5 shrink-0" style={{ borderBottom: '1px solid #d1fae5', boxShadow: '0 1px 6px 0 rgba(16,185,129,0.06)' }}>

      {/* Left — academic year badge */}
      <div className="flex items-center gap-2.5">
        {settings?.currentAcademicYear ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', color: '#065f46', border: '1px solid #a7f3d0' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>{settings.currentAcademicYear}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">No academic year set</span>
        )}
      </div>

      {/* Right — user info + logout */}
      <div className="flex items-center gap-3">
        {role === 'staff' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>
            Staff
          </span>
        )}
        {user?.email && (
          <div className="flex items-center gap-2">
            {/* Avatar circle */}
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              {initials}
            </div>
            <span className="text-xs text-gray-500 hidden sm:block max-w-[160px] truncate">{user.email}</span>
          </div>
        )}
        <Button variant="secondary" size="sm" onClick={() => { void logout(); }}>
          Logout
        </Button>
      </div>
    </header>
  );
}
