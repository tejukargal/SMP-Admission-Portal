import { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

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
function IconFeeStructure() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18"/>
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
function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

// ── Nav items ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/dashboard',    label: 'Dashboard',      Icon: IconDashboard  },
  { to: '/inquiries',    label: 'Inquiries',      Icon: IconInquiries  },
  { to: '/enroll',       label: 'Enroll Student', Icon: IconEnroll     },
  { to: '/admissions',   label: 'Admissions',     Icon: IconAdmissions },
  { to: '/students',     label: 'Students',       Icon: IconStudents   },
];
const ADMIN_ITEMS = [
  { to: '/fees',           label: 'Collect Fee',    Icon: IconFee          },
  { to: '/fee-register',   label: 'Fee Register',   Icon: IconRegister     },
  { to: '/fee-structure',  label: 'Fee Structure',  Icon: IconFeeStructure },
  { to: '/fee-reports',    label: 'Fee Reports',    Icon: IconReports      },
  { to: '/messaging',      label: 'Messaging',      Icon: IconMessaging    },
  { to: '/settings',       label: 'Settings',       Icon: IconSettings     },
];
const STAFF_ONLY = [
  { to: '/fee-register',  label: 'Fee Register',  Icon: IconRegister     },
  { to: '/fee-structure', label: 'Fee Structure',  Icon: IconFeeStructure },
];

// ── Props ──────────────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [showAbout, setShowAbout] = useState(false);
  const [showTech, setShowTech] = useState(false);

  const mainItems = NAV_ITEMS;
  const adminItems = isAdmin ? ADMIN_ITEMS : STAFF_ONLY;

  // Shared NavLink class builder
  function navClass(isActive: boolean) {
    const base = `group flex items-center rounded-xl text-[13px] font-medium transition-all duration-150 overflow-hidden`;
    const layout = collapsed ? 'justify-center px-0 py-2.5 w-10 mx-auto' : 'gap-2.5 px-3 py-2 w-full';
    const color = isActive
      ? 'bg-emerald-500 text-white shadow-sm'
      : 'text-gray-500 hover:bg-emerald-50 hover:text-emerald-800';
    return `${base} ${layout} ${color}`;
  }

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
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid #d1fae5',
        boxShadow: '1px 0 12px 0 rgba(16,185,129,0.06)',
      }}
    >
      {/* ── Brand ────────────────────────────────────────────────────── */}
      <div className={`flex items-center pt-5 pb-3 ${collapsed ? 'flex-col gap-2 px-0' : 'px-4 justify-between'}`}>
        {/* Logo mark + wordmark */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md"
            style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight tracking-tight">SMP</p>
              <p className="text-[10px] font-semibold text-emerald-600 leading-tight tracking-wider uppercase">Admissions</p>
            </div>
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center justify-center rounded-lg text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors ${
            collapsed ? 'w-8 h-8' : 'w-7 h-7 shrink-0'
          }`}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-emerald-100 mb-2" />

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 pb-2 space-y-0.5 overflow-y-auto overflow-x-hidden">

        {/* Main items */}
        {mainItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) => navClass(isActive)}
          >
            {({ isActive }) => (
              <>
                <span className={iconClass(isActive)}><Icon /></span>
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}

        {/* Section divider */}
        {collapsed ? (
          <div className="my-2 mx-1 h-px bg-emerald-100" />
        ) : (
          <div className="pt-3 pb-1 px-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300">
              {isAdmin ? 'Administration' : 'Records'}
            </p>
          </div>
        )}

        {/* Admin / staff items */}
        {adminItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) => navClass(isActive)}
          >
            {({ isActive }) => (
              <>
                <span className={iconClass(isActive)}><Icon /></span>
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className={`py-2.5 border-t border-emerald-50 ${collapsed ? 'flex justify-center px-0' : 'px-3'}`}>
        <button
          onClick={() => setShowAbout(true)}
          title="About"
          className={`flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer ${collapsed ? 'justify-center' : ''}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {!collapsed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider">About</span>
          )}
        </button>
      </div>

    </aside>
  );

  return (
    <>
      {sidebar}
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
