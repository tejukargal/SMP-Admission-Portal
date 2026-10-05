import { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import { NavLink, matchPath, useLocation } from 'react-router-dom';
import { preloadRoute } from '../../routePreload';
import { useAuth } from '../../contexts/AuthContext';
import {
  SquaresFour, ChatCircleText, UserPlus, Stamp, UsersThree, Briefcase, ChartPieSlice, Exam,
  EnvelopeSimpleOpen, HandCoins, Receipt, ChartBar, Bank, PaperPlaneTilt, GearSix,
  Info, CaretLeft, ShieldCheck, IdentificationBadge, Certificate,
} from '@phosphor-icons/react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { INSTITUTE_LOGO_B64 } from '../../utils/instituteLogo';

interface TooltipState { label: string; y: number; x: number; accent?: string }

// ── Nav groups ─────────────────────────────────────────────────────────────
// Each item carries its page's accent (icon tint, hover wash, active pill) and a
// deeper ink for the active label. adminOnly items are hidden from staff, which
// leaves staff with exactly the main pages + Fee Register, as before.
interface NavItem {
  to: string;
  label: string;
  Icon: PhosphorIcon;
  accent: string;
  ink: string;
  adminOnly?: boolean;
}
interface NavGroup { title: string | null; items: NavItem[] }

const TEAL = { accent: '#0D9488', ink: '#0F766E' };
const OCEAN = { accent: '#0B7BC0', ink: '#075E93' };

const NAV_GROUPS: NavGroup[] = [
  { title: null, items: [
    { to: '/dashboard',       label: 'Dashboard',       Icon: SquaresFour,        accent: '#6366F1', ink: '#4338CA' },
  ] },
  { title: 'Admissions', items: [
    { to: '/inquiries',       label: 'Inquiries',       Icon: ChatCircleText,     accent: '#D97706', ink: '#B45309' },
    { to: '/enroll',          label: 'Enroll Student',  Icon: UserPlus,           accent: '#059669', ink: '#047857' },
    { to: '/admissions',      label: 'Admissions',      Icon: Stamp,              accent: '#E11D48', ink: '#BE123C' },
  ] },
  { title: 'Students', items: [
    { to: '/students',        label: 'Students',        Icon: UsersThree,         ...OCEAN },
    { to: '/wp-students',     label: 'WP Students',     Icon: Briefcase,          ...OCEAN },
    { to: '/student-reports', label: 'Student Reports', Icon: ChartPieSlice,      accent: '#4F46E5', ink: '#3730A3' },
    { to: '/results',         label: 'Results',         Icon: Exam,               accent: '#9333EA', ink: '#6B21A8' },
    { to: '/ans-letters',     label: 'ANS Letters',     Icon: EnvelopeSimpleOpen, accent: '#C2410C', ink: '#9A3412' },
    { to: '/exam-certificates', label: 'Exam Duty Certs', Icon: Certificate,      accent: '#BE185D', ink: '#9D174D' },
  ] },
  { title: 'Finance', items: [
    { to: '/fees',            label: 'Collect Fee',     Icon: HandCoins,          ...TEAL, adminOnly: true },
    { to: '/fee-register',    label: 'Fee Register',    Icon: Receipt,            ...TEAL },
    { to: '/fee-reports',     label: 'Fee Reports',     Icon: ChartBar,           ...TEAL, adminOnly: true },
    { to: '/cash-book',       label: 'Cash & Bank',     Icon: Bank,               accent: '#65A30D', ink: '#4D7C0F', adminOnly: true },
  ] },
  { title: 'System', items: [
    // 'Messaging' (Bulk SMS) is temporarily off the sidebar while unfinished —
    // reachable from Settings → Messaging tab in the meantime. Restore this
    // entry when asked.
    { to: '/student-messages', label: 'Student Messages', Icon: PaperPlaneTilt,     accent: '#0891B2', ink: '#0E6A85', adminOnly: true },
    { to: '/settings',        label: 'Settings',        Icon: GearSix,            accent: '#3B5BA9', ink: '#2B437F', adminOnly: true },
  ] },
];

// ── Shell tokens (shared with the frosted Header) ──────────────────────────
const HAIRLINE = '#E6EAF0';
const INK = '#262B35';
const MUTED = '#8A93A3';
const EXPANDED_W = 216;
const COLLAPSED_W = 64;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const WIDTH_MS = 340;

// The crest PNG is 300×314 with lopsided white padding; the gear itself spans
// x 17–275, y 14–275 (~262px). Over-scale and offset the image so that box maps
// exactly onto the badge disc. Re-measure if the logo file is ever replaced.
const CREST_BOX = { imgW: 300, imgH: 314, left: 17, top: 14, size: 262 };
const CREST_STYLE: React.CSSProperties = {
  position: 'absolute',
  maxWidth: 'none',
  width: `${(CREST_BOX.imgW / CREST_BOX.size) * 100}%`,
  height: `${(CREST_BOX.imgH / CREST_BOX.size) * 100}%`,
  left: `${(-CREST_BOX.left / CREST_BOX.size) * 100}%`,
  top: `${(-CREST_BOX.top / CREST_BOX.size) * 100}%`,
};

const WORDS = ['', 'SANJAY', 'MEMORIAL', 'POLYTECHNIC', 'SAGAR'];

function initialsOf(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0];
  const parts = local.split(/[._\-\d]+/).filter(Boolean);
  const raw = parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return (raw || '?').toUpperCase();
}

// ── Props ──────────────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const { pathname } = useLocation();
  const [showAbout, setShowAbout] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const showTooltip = useCallback((label: string, e: React.MouseEvent, accent?: string) => {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, accent, y: rect.top + rect.height / 2, x: rect.right + 12 });
  }, [collapsed]);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  // ── Logo: leaf ⇄ college logo every 8s, the badge pops on each swap ──
  const [logo, setLogo] = useState({ face: 0, swaps: 0 });
  const [surging, setSurging] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setLogo((l) => ({ face: l.face === 0 ? 1 : 0, swaps: l.swaps + 1 }));
      setSurging(true);
    }, 8000);
    return () => clearInterval(id);
  }, []);
  const faceClass = (f: number) =>
    logo.face === f ? (logo.swaps > 0 ? 'sb-face-in' : '') : (logo.swaps > 0 ? 'sb-face-out' : 'opacity-0');

  // ── Wordmark: SMP/Admissions → SANJAY → MEMORIAL → POLYTECHNIC → SAGAR ──
  const TITLE_COUNT = 5;
  const [title, setTitle] = useState<{ idx: number; prev: number | null }>({ idx: 0, prev: null });
  useEffect(() => {
    if (collapsed) { setTitle({ idx: 0, prev: null }); return; }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => setTitle((t) => ({ idx: (t.idx + 1) % TITLE_COUNT, prev: t.idx })), 3000);
    }, 2500);
    return () => { clearTimeout(delayId); if (intervalId) clearInterval(intervalId); };
  }, [collapsed]);

  function renderWord(i: number) {
    return i === 0 ? (
      <>
        <p className="sb-aurora text-[15px] font-bold leading-none tracking-[0.12em]">SMP</p>
        <p className="mt-[3px] text-[9px] font-medium leading-none tracking-[0.22em] uppercase" style={{ color: MUTED }}>Admissions</p>
      </>
    ) : (
      <p
        className="sb-aurora font-bold leading-none uppercase"
        style={WORDS[i].length > 8 ? { fontSize: 12.5, letterSpacing: '0.05em' } : { fontSize: 15, letterSpacing: '0.1em' }}
      >
        {WORDS[i]}
      </p>
    );
  }

  // ── Visible groups for this role ──
  const groups = useMemo(
    () => NAV_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((it) => isAdmin || !it.adminOnly) }))
      .filter((g) => g.items.length > 0),
    [isAdmin],
  );
  const activeItem = useMemo(
    () => groups.flatMap((g) => g.items).find((it) => matchPath({ path: it.to, end: false }, pathname)) ?? null,
    [groups, pathname],
  );

  // ── Sliding active indicator ──
  const listRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef(new Map<string, HTMLElement>());
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [indicatorReady, setIndicatorReady] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = activeItem ? linkRefs.current.get(activeItem.to) : undefined;
      setIndicator(el ? { top: el.offsetTop, height: el.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [activeItem, groups]);

  // First placement snaps into position; only later moves glide.
  useEffect(() => {
    if (!indicator || indicatorReady) return;
    const id = requestAnimationFrame(() => setIndicatorReady(true));
    return () => cancelAnimationFrame(id);
  }, [indicator, indicatorReady]);

  // ── Label motion: staggered fade/slide in on expand, quick fade out on collapse ──
  const labelStyle = (order: number): React.CSSProperties => ({
    opacity: collapsed ? 0 : 1,
    transform: collapsed ? 'translateX(-6px)' : 'translateX(0)',
    filter: collapsed ? 'blur(2px)' : 'blur(0)',
    whiteSpace: 'nowrap',
    transition: collapsed
      ? 'opacity 120ms ease, transform 160ms ease, filter 120ms ease'
      : `opacity 260ms ease ${80 + Math.min(order, 14) * 18}ms, transform 420ms ${EASE} ${80 + Math.min(order, 14) * 18}ms, filter 260ms ease ${80 + Math.min(order, 14) * 18}ms`,
  });

  let order = 0;
  const avatarInitials = initialsOf(user?.email);

  const sidebar = (
    <aside
      className="font-wp relative shrink-0 h-full flex flex-col overflow-hidden bg-white/80 backdrop-blur-md sb-motion"
      style={{
        width: collapsed ? COLLAPSED_W : EXPANDED_W,
        transition: `width ${WIDTH_MS}ms ${EASE}`,
        borderRight: `1px solid ${HAIRLINE}`,
        boxShadow: '1px 0 10px 0 rgba(15,23,42,0.05)',
      }}
    >
      {/* Faint pastel hairline down the right edge — echoes the Header's bottom hairline */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 bottom-0 right-0 w-px opacity-50"
        style={{ background: 'linear-gradient(180deg, transparent 0%, #E39B4A 18%, #4FA3D9 40%, #3FB0A9 62%, #9D85E8 84%, transparent 100%)' }}
      />

      {/* ── Brand ────────────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        className="group relative flex items-center gap-3 w-full cursor-pointer h-13 shrink-0 transition-colors hover:bg-[#F5F7FA]/70"
        style={{ paddingLeft: 12, paddingRight: 12, borderBottom: `1px solid ${HAIRLINE}` }}
      >
        {/* Logo badge — leaf ⇄ college logo with a blur-morph */}
        <div
          className={`relative w-10 h-10 shrink-0 rounded-full bg-white overflow-hidden border-2 border-white ${surging ? 'sb-logo-pop' : ''}`}
          style={{ boxShadow: '0 2px 8px rgba(15,23,42,0.14), 0 0 0 1px rgba(15,23,42,0.04)' }}
          onAnimationEnd={(e) => { if (e.target === e.currentTarget) setSurging(false); }}
        >
          <div className="absolute inset-0 rounded-full">
            <div
              className={`absolute inset-0 rounded-full flex items-center justify-center ${faceClass(0)}`}
              style={{ background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)' }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
                <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
              </svg>
            </div>
            <div className={`absolute inset-0 rounded-full overflow-hidden bg-white ${faceClass(1)}`}>
              {/* Framed by the crest's own content box (not the padded PNG) so the gear fills the disc like the leaf */}
              <img src={INSTITUTE_LOGO_B64} alt="College Logo" style={CREST_STYLE} />
            </div>
          </div>
        </div>

        {/* Wordmark — blur-slide word cycle in the aurora gradient */}
        <div className="relative flex-1 min-w-0 h-[30px] overflow-hidden text-left" style={labelStyle(0)}>
          {title.prev !== null && (
            <div key={`o${title.prev}-${title.idx}`} className="sb-word-out absolute inset-0 flex flex-col justify-center">
              {renderWord(title.prev)}
            </div>
          )}
          <div key={`i${title.idx}`} className="sb-word-in absolute inset-0 flex flex-col justify-center">
            {renderWord(title.idx)}
          </div>
        </div>

        {/* Collapse chip */}
        <span
          className="flex items-center justify-center w-6 h-6 rounded-full border bg-white shrink-0 transition-colors group-hover:text-[#262B35] group-hover:border-[#D5DBE5]"
          style={{
            ...labelStyle(0),
            borderColor: HAIRLINE,
            color: MUTED,
          }}
        >
          <span className="flex sb-motion" style={{ transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: `transform ${WIDTH_MS}ms ${EASE}` }}>
            <CaretLeft size={13} weight="bold" />
          </span>
        </span>
      </button>

      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 pt-2 pb-2 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        <div ref={listRef} className="relative">
          {/* Sliding active pill */}
          {indicator && activeItem && (
            <span
              aria-hidden="true"
              className="absolute left-0 right-0 top-0 rounded-xl pointer-events-none sb-motion"
              style={{
                height: indicator.height,
                transform: `translateY(${indicator.top}px)`,
                background: `${activeItem.accent}0F`,
                boxShadow: `inset 0 0 0 1px ${activeItem.accent}1F`,
                transition: indicatorReady
                  ? `transform 420ms ${EASE}, height 420ms ${EASE}, background-color 300ms ease, box-shadow 300ms ease`
                  : 'none',
              }}
            >
              <span
                className="absolute left-[3px] top-1/2 -translate-y-1/2 w-[3px] h-3.5 rounded-full"
                style={{ background: activeItem.accent, boxShadow: `0 0 5px ${activeItem.accent}59`, transition: 'background-color 300ms ease, box-shadow 300ms ease' }}
              />
            </span>
          )}

          {groups.map((group, gi) => (
            <div key={group.title ?? 'top'}>
              {group.title && (
                <div className="relative h-[22px]">
                  <p
                    className="absolute left-2 bottom-[5px] text-[9.5px] font-medium uppercase tracking-[1.2px] leading-none"
                    style={{ ...labelStyle(order++), color: MUTED }}
                  >
                    {group.title}
                  </p>
                  {gi > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-3 right-3 top-1/2 h-px sb-motion"
                      style={{
                        background: HAIRLINE,
                        opacity: collapsed ? 1 : 0,
                        transform: collapsed ? 'scaleX(1)' : 'scaleX(0.3)',
                        transition: collapsed
                          ? `opacity 220ms ease 120ms, transform ${WIDTH_MS}ms ${EASE} 80ms`
                          : 'opacity 120ms ease, transform 160ms ease',
                      }}
                    />
                  )}
                </div>
              )}

              <div className="space-y-px">
                {group.items.map(({ to, label, Icon, accent, ink }) => {
                  const isActive = activeItem?.to === to;
                  const rowOrder = order++;
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      ref={(el) => { if (el) linkRefs.current.set(to, el); else linkRefs.current.delete(to); }}
                      className={`group relative flex items-center gap-2.5 w-full h-[32px] rounded-xl overflow-hidden text-[13px] font-medium transition-colors duration-150 ${
                        isActive ? 'text-[color:var(--ink)]' : 'text-[#5B6371] hover:bg-[color:color-mix(in_srgb,var(--acc)_6%,transparent)] hover:text-[color:var(--ink)]'
                      }`}
                      style={{
                        '--acc': accent,
                        '--ink': ink,
                        paddingLeft: 15,
                        paddingRight: 10,
                      } as React.CSSProperties}
                      onMouseEnter={(e) => { preloadRoute(to); showTooltip(label, e, accent); }}
                      onFocus={() => preloadRoute(to)}
                      onMouseLeave={hideTooltip}
                      onClick={onNavigate}
                    >
                      <span
                        className={`shrink-0 flex transition-[opacity,transform] duration-200 ${isActive ? 'opacity-100' : 'opacity-75 group-hover:opacity-100 group-hover:scale-[1.08]'}`}
                        style={{ color: accent }}
                      >
                        <Icon size={17} weight="bold" />
                      </span>
                      <span className={isActive ? 'font-semibold' : ''} style={labelStyle(rowOrder)}>{label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* ── Footer: user card ────────────────────────────────────────── */}
      <div className="shrink-0 px-2 pt-2 pb-2.5" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
        <div
          className="flex items-center gap-2.5 rounded-2xl border bg-white/70 py-[6px] pl-[7px] pr-[6px] overflow-hidden"
          style={{ borderColor: HAIRLINE }}
        >
          <div
            className="relative w-8 h-8 shrink-0"
            onMouseEnter={(e) => showTooltip(role ? `${user?.email ?? 'Account'} · ${role === 'admin' ? 'Admin' : 'Staff'}` : (user?.email ?? 'Account'), e)}
            onMouseLeave={hideTooltip}
          >
            <span
              className="absolute inset-0 rounded-full flex items-center justify-center text-[11px] font-semibold text-white border-2 border-white"
              style={{ background: 'linear-gradient(135deg, #4FA3D9 0%, #7C63D6 100%)', boxShadow: '0 2px 6px rgba(15,23,42,0.16)' }}
            >
              {avatarInitials}
            </span>
            {/* Role badge — shield for Admin, ID badge for Staff */}
            {role && (
              <span
                className="absolute -right-0.5 -bottom-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                style={role === 'admin'
                  ? { background: '#3B5BA9', border: '1.5px solid #fff', boxShadow: '0 1px 4px rgba(59,91,169,0.45)' }
                  : { background: '#D97706', border: '1.5px solid #fff', boxShadow: '0 1px 4px rgba(217,119,6,0.45)' }}
                title={role === 'admin' ? 'Admin' : 'Staff'}
                aria-label={role === 'admin' ? 'Admin' : 'Staff'}
              >
                {role === 'admin' ? <ShieldCheck size={10} weight="fill" /> : <IdentificationBadge size={10} weight="fill" />}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1" style={labelStyle(order)}>
            <p className="text-[11.5px] font-medium truncate leading-tight" style={{ color: INK }} title={user?.email ?? undefined}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={() => setShowAbout(true)}
            className="flex items-center justify-center w-7 h-7 rounded-full shrink-0 cursor-pointer transition-colors hover:bg-[#EEF3FA] hover:text-[#0B7BC0]"
            style={{ ...labelStyle(order), color: MUTED }}
            title="About"
            tabIndex={collapsed ? -1 : 0}
          >
            <Info size={16} weight="duotone" />
          </button>
        </div>

        {/* Collapsed-only About button — folds open beneath the avatar */}
        <div
          className="grid sb-motion"
          style={{
            gridTemplateRows: collapsed ? '1fr' : '0fr',
            transition: `grid-template-rows ${WIDTH_MS}ms ${EASE}`,
          }}
        >
          <div className="overflow-hidden">
            <button
              onClick={() => setShowAbout(true)}
              className="mt-1.5 flex items-center justify-center w-12 h-8 rounded-xl cursor-pointer transition-colors hover:bg-[#EEF3FA] hover:text-[#0B7BC0]"
              style={{ color: MUTED, opacity: collapsed ? 1 : 0, transition: 'opacity 200ms ease, background-color 150ms, color 150ms' }}
              onMouseEnter={(e) => showTooltip('About', e)}
              onMouseLeave={hideTooltip}
              tabIndex={collapsed ? 0 : -1}
              aria-label="About"
            >
              <Info size={17} weight="duotone" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {sidebar}

      {/* ── Collapsed tooltip bubble ──────────────────────────────────── */}
      {collapsed && tooltip && createPortal(
        <div
          className="font-wp"
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            pointerEvents: 'none',
            animation: 'tooltip-pop 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div
            className="relative inline-flex items-center gap-2 rounded-full border bg-white/95 backdrop-blur-md px-3 py-[5px] text-[12px] font-medium whitespace-nowrap"
            style={{ borderColor: HAIRLINE, color: INK, boxShadow: '0 6px 18px rgba(15,23,42,0.12)' }}
          >
            {/* Little pointer back towards the icon */}
            <span
              aria-hidden="true"
              className="absolute -left-[4px] top-1/2 w-2 h-2 bg-white border-l border-b"
              style={{ borderColor: HAIRLINE, transform: 'translateY(-50%) rotate(45deg)' }}
            />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: tooltip.accent ?? MUTED, boxShadow: `0 0 6px ${tooltip.accent ?? MUTED}` }} />
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
            className="font-wp relative bg-white rounded-2xl shadow-2xl w-full max-w-[360px] overflow-hidden flex flex-col"
            style={{ animation: 'modal-enter 0.25s ease-out', height: '420px' }}
          >
            {/* Header */}
            <div className="px-5 py-2.5 bg-gradient-to-r from-[#0B7BC0] to-[#075E93] flex items-center justify-between shrink-0">
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
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4FA3D9] to-[#0B7BC0] flex items-center justify-center shrink-0">
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
                  <span key={f} className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[#EEF5FB] text-[#075E93] border border-[#CFE3F3]">
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
              <p className="text-[10px] text-[#075E93] bg-[#EEF5FB] border border-[#CFE3F3] rounded-lg px-3 py-2 leading-relaxed">
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
