import { useState, useEffect, useCallback } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { INSTITUTE_LOGO_B64 } from '../../utils/instituteLogo';

interface TooltipState { label: string; y: number; x: number }

// ── Icons ──────────────────────────────────────────────────────────────────
function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}
function IconInquiries() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function IconEnroll() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>
    </svg>
  );
}
function IconAdmissions() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/>
      <polyline points="12 12 15 15 12 18"/>
    </svg>
  );
}
function IconStudents() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconStudentReports() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="12" y2="17"/>
    </svg>
  );
}
function IconResults() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"/>
      <path d="M6 5h12v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/>
      <path d="M9 13l2 2 4-4"/>
    </svg>
  );
}
function IconFee() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  );
}
function IconRegister() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  );
}
function IconReports() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  );
}
function IconMessaging() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
function IconChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

// ── Nav items ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/dashboard',    label: 'Dashboard',      Icon: IconDashboard  },
  { to: '/inquiries',    label: 'Inquiries',      Icon: IconInquiries  },
  { to: '/enroll',       label: 'Enroll Student', Icon: IconEnroll     },
  { to: '/admissions',   label: 'Admissions',     Icon: IconAdmissions },
  { to: '/students',        label: 'Students',        Icon: IconStudents        },
  { to: '/student-reports', label: 'Student Reports', Icon: IconStudentReports  },
  { to: '/results',         label: 'Results',         Icon: IconResults         },
];
const ADMIN_ITEMS = [
  { to: '/fees',           label: 'Collect Fee',    Icon: IconFee          },
  { to: '/fee-register',   label: 'Fee Register',   Icon: IconRegister     },
  { to: '/fee-reports',    label: 'Fee Reports',    Icon: IconReports      },
  { to: '/messaging',      label: 'Messaging',      Icon: IconMessaging    },
  { to: '/settings',       label: 'Settings',       Icon: IconSettings     },
];
const STAFF_ONLY = [
  { to: '/fee-register',  label: 'Fee Register',  Icon: IconRegister     },
];


// ── Props ──────────────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const [showAbout, setShowAbout] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const showTooltip = useCallback((label: string, e: React.MouseEvent) => {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, y: rect.top + rect.height / 2, x: rect.right + 10 });
  }, [collapsed]);

  const hideTooltip = useCallback(() => setTooltip(null), []);
  const [logoFace, setLogoFace] = useState(0); // 0 = leaf, 1 = college logo
  const [titleIdx, setTitleIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setLogoFace((f) => (f === 0 ? 1 : 0)), 10000);
    return () => clearInterval(id);
  }, []);

  // 0 = SMP/Admissions, 1-4 = SANJAY / MEMORIAL / POLYTECHNIC / SAGAR
  const TITLE_COUNT = 5;
  useEffect(() => {
    if (collapsed) { setTitleIdx(0); return; }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => setTitleIdx((i) => (i + 1) % TITLE_COUNT), 3000);
    }, 2500);
    return () => { clearTimeout(delayId); if (intervalId) clearInterval(intervalId); };
  }, [collapsed]);

  const mainItems = NAV_ITEMS;
  const adminItems = isAdmin ? ADMIN_ITEMS : STAFF_ONLY;

  const textStyle = (extraDelay = 0): React.CSSProperties => ({
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    maxWidth: collapsed ? 0 : '160px',
    opacity: collapsed ? 0 : 1,
    transition: collapsed
      ? `opacity 120ms ease ${extraDelay}ms, max-width 220ms cubic-bezier(0.4,0,0.2,1) ${extraDelay}ms`
      : `max-width 220ms cubic-bezier(0.4,0,0.2,1) ${extraDelay}ms, opacity 180ms ease ${extraDelay + 60}ms`,
  });

  function navClass(isActive: boolean) {
    const color = isActive
      ? 'bg-emerald-500 text-white shadow-sm'
      : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-800';
    return `group flex items-center gap-2.5 w-full rounded-full text-[13px] font-medium transition-colors duration-150 ${color}`;
  }

  // Fixed padding — icon never shifts. Only paddingRight collapses so the pill narrows
  // into an oval; rounded-full makes it look circular at 44×32px with no height change.
  const navItemStyle: React.CSSProperties = {
    paddingTop:    8,
    paddingBottom: 8,
    paddingLeft:   14,
    paddingRight:  collapsed ? 0 : 12,
    transition: 'padding-right 220ms cubic-bezier(0.4,0,0.2,1)',
  };

  function iconClass(isActive: boolean) {
    return `shrink-0 transition-colors ${
      isActive ? 'text-white' : 'text-gray-400 group-hover:text-emerald-600'
    }`;
  }

  const sidebar = (
    <aside
      className="shrink-0 h-full flex flex-col overflow-hidden"
      style={{
        width: collapsed ? 60 : 208,
        transition: 'width 220ms cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'width',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid #d1fae5',
        boxShadow: '1px 0 12px 0 rgba(16,185,129,0.06)',
      }}
    >
      {/* ── Brand ────────────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="group flex items-center gap-3 w-full cursor-pointer hover:bg-emerald-50/50 transition-colors h-13 shrink-0"
        style={{ paddingLeft: 14, paddingRight: 12 }}
      >
        {/* Flip-card logo — front: leaf, back: college logo, auto-cycles every 5s */}
        <div className="relative w-9 h-9 shrink-0" style={{ perspective: '400px' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transformStyle: 'preserve-3d',
              transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
              transform: logoFace === 1 ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* Front face: leaf logo */}
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center shadow-md"
              style={{
                background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
                <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
              </svg>
            </div>
            {/* Back face: college logo */}
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center overflow-hidden"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <img
                src={INSTITUTE_LOGO_B64}
                alt="College Logo"
                style={{ width: '105%', height: '105%', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>

        {/* Wordmark — fades with sidebar, flips through SMP then each college name word */}
        <div className="min-w-0 flex-1 text-left overflow-hidden" style={textStyle()}>
          <div
            key={titleIdx}
            style={{ animation: 'flip-num-in 0.75s cubic-bezier(0.25,0.46,0.45,0.94)', whiteSpace: 'normal' }}
          >
            {titleIdx === 0 ? (
              <>
                <p className="text-sm font-bold text-gray-900 leading-tight tracking-tight">SMP</p>
                <p className="text-[10px] font-semibold text-emerald-600 leading-tight tracking-wider uppercase">Admissions</p>
              </>
            ) : (
              <p className={`text-[15px] font-black leading-none tracking-wide uppercase ${titleIdx === 4 ? 'text-emerald-600' : 'text-gray-900'}`}>
                {['', 'SANJAY', 'MEMORIAL', 'POLYTECHNIC', 'SAGAR'][titleIdx]}
              </p>
            )}
          </div>
        </div>

        {/* Collapse arrow — fades with sidebar */}
        <span
          className="flex items-center justify-center text-gray-400 group-hover:text-emerald-600 transition-colors shrink-0"
          style={textStyle()}
        >
          <IconChevronLeft />
        </span>
      </button>

      {/* Divider */}
      <div className="mx-3 h-px bg-emerald-100 mb-2" />

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 pb-2 space-y-0.5 overflow-y-auto overflow-x-hidden">

        {/* Main items */}
        {mainItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => navClass(isActive)}
            style={navItemStyle}
            onMouseEnter={(e) => showTooltip(label, e)}
            onMouseLeave={hideTooltip}
          >
            {({ isActive }) => (
              <>
                <span className={iconClass(isActive)}><Icon /></span>
                <span style={textStyle()}>{label}</span>
                {isActive && !collapsed && (
                  <span className="w-1 h-4 rounded-full bg-emerald-300 glow-emerald shrink-0 ml-auto" />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Section divider */}
        <div className="pt-3 pb-1 px-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300" style={textStyle()}>
            {isAdmin ? 'Administration' : 'Records'}
          </p>
          <div
            className="h-px bg-emerald-100"
            style={{
              maxWidth: collapsed ? '100%' : 0,
              opacity: collapsed ? 1 : 0,
              transition: collapsed
                ? 'max-width 220ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease 60ms'
                : 'max-width 220ms cubic-bezier(0.4,0,0.2,1), opacity 100ms ease',
            }}
          />
        </div>

        {/* Admin / staff items */}
        {adminItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => navClass(isActive)}
            style={navItemStyle}
            onMouseEnter={(e) => showTooltip(label, e)}
            onMouseLeave={hideTooltip}
          >
            {({ isActive }) => (
              <>
                <span className={iconClass(isActive)}><Icon /></span>
                <span style={textStyle()}>{label}</span>
                {isActive && !collapsed && (
                  <span className="w-1 h-4 rounded-full bg-emerald-300 glow-emerald shrink-0 ml-auto" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="border-t border-emerald-50 px-2 pt-2.5 pb-2 space-y-0.5">

        {/* User info */}
        <div
          className="flex items-center gap-2.5 w-full rounded-xl px-3 py-1.5"
          onMouseEnter={(e) => showTooltip(user?.email ?? 'Account', e)}
          onMouseLeave={hideTooltip}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <div className="min-w-0 flex-1 overflow-hidden flex items-center gap-1.5" style={textStyle()}>
            <p className="text-[11px] font-semibold text-gray-500 truncate leading-tight min-w-0 flex-1">
              {user?.email}
            </p>
            {role === 'staff' && (
              <span className="shrink-0 inline-flex items-center px-1.5 py-px rounded-full text-[9px] font-bold uppercase tracking-wider" style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>
                Staff
              </span>
            )}
          </div>
        </div>

        {/* About */}
        <button
          onClick={() => setShowAbout(true)}
          className="flex items-center gap-2 w-full rounded-lg px-3 py-1.5 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
          onMouseEnter={(e) => showTooltip('About', e)}
          onMouseLeave={hideTooltip}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={textStyle()}>About</span>
        </button>
      </div>

    </aside>
  );

  return (
    <>
      {sidebar}

      {/* ── Collapsed tooltip bubble ──────────────────────────────────── */}
      {collapsed && tooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            animation: 'tooltip-pop 0.15s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Left arrow pointing back to the icon */}
          <div style={{
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderRight: '5px solid #059669',
          }} />
          <div style={{
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: 'white',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.01em',
            padding: '5px 12px',
            borderRadius: '20px',
            boxShadow: '0 4px 14px rgba(5,150,105,0.35)',
            whiteSpace: 'nowrap',
          }}>
            {tooltip.label}
          </div>
        </div>,
        document.body
      )}

      {showAbout && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setShowAbout(false); setShowTech(false); }}
            aria-hidden="true"
            style={{ animation: 'backdrop-enter 0.2s ease-out' }}
          />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[360px] overflow-hidden flex flex-col"
            style={{ animation: 'modal-enter 0.25s ease-out', height: '420px' }}
          >
            {/* Header */}
            <div className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/20 shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </span>
                <h3 className="text-sm font-bold text-white">About</h3>
              </div>
              <button
                onClick={() => { setShowAbout(false); setShowTech(false); }}
                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 text-white text-lg leading-none transition-colors cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Student info-bar style — app identity */}
            <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 leading-tight">SMP Admissions</p>
                <p className="text-[10px] text-gray-500">Sanjay Memorial Polytechnic, Sagar</p>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3.5 space-y-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              {/* Description */}
              <p className="text-[11px] text-gray-600 leading-relaxed">
                SMP Admissions is a purpose-built web application designed to streamline the complete administrative workflow of Sanjay Memorial Polytechnic, Sagar. It covers student enrollment, academic records, structured fee collection with itemised receipts, document management, and the issuance of Transfer &amp; Provisional Certificates — all from a single, unified interface.
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-1.5">
                {['Admissions', 'Fee Records', 'Receipts', 'Documents', 'Certificates', 'Reports'].map((f) => (
                  <span key={f} className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    {f}
                  </span>
                ))}
              </div>

              <div className="h-px bg-gray-100" />

              {/* Developer */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2">Developer</p>
                <div
                  className="flex items-center gap-2.5 cursor-default select-none"
                  onDoubleClick={() => setShowTech((v) => !v)}
                  title="Double-click to reveal tech details"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-white">TR</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Thejaraj R</p>
                    <p className="text-[10px] text-gray-500">FDA · Sanjay Memorial Polytechnic, Sagar</p>
                  </div>
                </div>
                {showTech && (
                  <div className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 space-y-1" style={{ animation: 'content-enter 0.2s ease-out' }}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Technology &amp; Security</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Built with <span className="font-semibold text-slate-700">React 19</span>, <span className="font-semibold text-slate-700">TypeScript</span>, and <span className="font-semibold text-slate-700">Tailwind CSS 4</span>, backed by <span className="font-semibold text-slate-700">Google Firebase</span> (Firestore &amp; Auth). Secured with role-based access control — admins have full access while staff are restricted to permitted operations. Data is cloud-hosted with persistent offline caching.
                    </p>
                  </div>
                )}
              </div>

              <div className="h-px bg-gray-100" />

              {/* Contact */}
              <p className="text-[10px] text-gray-500 leading-relaxed">
                For any queries or suggestions regarding this application, feel free to contact the developer.
              </p>

              {/* Acknowledgement */}
              <p className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 leading-relaxed">
                Special thanks to the college Principal and staff for their invaluable support in developing this software.
              </p>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-5 py-2.5 flex justify-end bg-gray-50/60">
              <button
                onClick={() => { setShowAbout(false); setShowTech(false); }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
