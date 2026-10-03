import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../hooks/useSettings';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useCashInHand } from '../../contexts/CashInHandContext';
import { ACCENT_CYCLE, getPageAccent } from './pageAccents';

// ── Title-bar tokens ─────────────────────────────────────────────────────────
// Colours that follow the page live in the --hb-* custom properties (set on the
// <header> from pageAccents.ts and crossfaded via @property in index.css).
const ACC = 'var(--hb-acc)';
const INK_VAR = 'var(--hb-ink)';
const CORAL = '#E11D48';
const HAIRLINE = 'color-mix(in srgb, var(--hb-acc) 16%, #E6EAF0)';
const PILL_BORDER = 'color-mix(in srgb, var(--hb-acc) 28%, #E6EAF0)';
const SHIMMER_TICK_MS = 4000;
// Year text size — a touch larger than the Logout pill so the year reads at a glance
const YEAR_SIZE = 20;

const TITLE = 'SMP ADMISSIONS';
// Non-breaking space keeps the word gap the same width in the letters and the shimmer copy
const TITLE_CHARS = [...TITLE].map((ch) => (ch === ' ' ? ' ' : ch));
const TITLE_STYLE: CSSProperties = { letterSpacing: '0.2em' };

function LogoutIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/** Cash-in-hand reminder pill — amber while cash is held, red once overdue. Admin only;
 *  hidden when nothing is pending. Opens the Cash & Bank page. */
function CashBadge({ compact = false }: { compact?: boolean }) {
  const { enabled, configured, summary } = useCashInHand();
  const navigate = useNavigate();
  if (!enabled || !configured || summary.total <= 0) return null;
  const overdue = summary.isOverdue;
  const tone = overdue
    ? { border: 'rgba(225,29,72,0.45)', bg: '#FFF1F3', ink: '#A5173A', dot: '#E11D48' }
    : { border: 'rgba(217,119,6,0.45)', bg: '#FFF8EB', ink: '#9A5B00', dot: '#D97706' };
  const amount = `₹${summary.total.toLocaleString('en-IN')}`;
  const held = summary.daysHeld > 0 ? `${summary.daysHeld} day${summary.daysHeld === 1 ? '' : 's'}` : 'today';
  return (
    <button
      type="button"
      onClick={() => navigate('/cash-book')}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap cursor-pointer transition-shadow hover:shadow-[0_3px_10px_rgba(15,23,42,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
      style={{ borderColor: tone.border, background: tone.bg, color: tone.ink }}
      title={`Cash in hand not yet deposited to bank — SBI ₹${summary.byAccount.SBI.pending.toLocaleString('en-IN')}, SVK ₹${summary.byAccount.SVK.pending.toLocaleString('en-IN')}. Oldest: ${summary.oldestDate ?? '—'}. Click to record a deposit.`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${overdue ? 'animate-pulse' : ''}`} style={{ background: tone.dot }} />
      {amount}
      {/* Wording only when the bar is wide enough; the tooltip always has the full detail */}
      {!compact && (
        <span className="hidden @min-[1360px]:inline">cash in hand <span className="opacity-70">· {overdue ? `overdue ${held}` : held}</span></span>
      )}
    </button>
  );
}

// Same bands as the Dashboard's greeting eyebrow, so the two never disagree
function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Good Morning';
  if (h >= 12 && h < 17) return 'Good Afternoon';
  if (h >= 17 && h < 21) return 'Good Evening';
  return 'Good Night';
}

/** Plain accent text that cycles through `words` with the sidebar wordmark's
 *  blur-slide (sb-word-in / sb-word-out): 2.5s settle, then a new word every 3s. */
function BlurTicker({ words, width, align = 'start', title, onTick }: {
  words: ReactNode[];
  width: number;
  align?: 'start' | 'end';
  title?: string;
  onTick?: () => void;
}) {
  const [word, setWord] = useState<{ idx: number; prev: number | null }>({ idx: 0, prev: null });
  const count = words.length;
  const tickRef = useRef(onTick);
  useEffect(() => { tickRef.current = onTick; });

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => {
        setWord((w) => ({ idx: (w.idx + 1) % count, prev: w.idx }));
        tickRef.current?.();
      }, 3000);
    }, 2500);
    return () => { clearTimeout(delayId); if (intervalId) clearInterval(intervalId); };
  }, [count]);

  const slot = `absolute inset-0 flex items-center ${align === 'end' ? 'justify-end' : ''}`;
  return (
    <div className="relative h-[26px] overflow-hidden shrink-0" style={{ width }} aria-live="off" title={title}>
      {word.prev !== null && (
        <div key={`o${word.prev}-${word.idx}`} className={`sb-word-out ${slot}`}>{words[word.prev]}</div>
      )}
      <div key={`i${word.idx}`} className={`sb-word-in ${slot}`}>{words[word.idx]}</div>
    </div>
  );
}

const TICKER_TEXT = 'text-[12.5px] font-medium leading-none whitespace-nowrap';
const Divider = () => <span aria-hidden="true" className="w-px h-4 shrink-0" style={{ background: PILL_BORDER }} />;

/** Welcome note beside the page chip — greeting → welcome back → day → date. */
function WelcomeTicker() {
  const [now, setNow] = useState(() => new Date());
  const words = [
    greetingFor(now),
    'Hello, welcome back',
    now.toLocaleDateString('en-IN', { weekday: 'long' }),
    now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
  ];
  return (
    <div className="hidden @min-[1000px]:flex items-center gap-2.5 ml-2.5 min-w-0">
      <Divider />
      <BlurTicker
        width={120}
        title={`${words[0]} · ${words[2]}, ${words[3]}`}
        // keeps the greeting/day/date fresh across midnight and time-of-day changes
        onTick={() => setNow(new Date())}
        words={words.map((w) => <span key={w} className={TICKER_TEXT} style={{ color: INK_VAR }}>{w}</span>)}
      />
    </div>
  );
}

/** Academic Year in the same plain-text style — label ⇄ year. */
function YearTicker({ year }: { year: string }) {
  return (
    <div className="hidden @min-[780px]:flex items-center gap-2.5 shrink-0">
      <BlurTicker
        width={104}
        align="end"
        title={`Academic Year ${year}`}
        words={[
          <span key="l" className={TICKER_TEXT} style={{ color: 'color-mix(in srgb, var(--hb-ink) 70%, white)' }}>Academic Year</span>,
          <span key="y" className={`${TICKER_TEXT} font-semibold tabular-nums`} style={{ color: INK_VAR, fontSize: YEAR_SIZE }}>
            {year}
          </span>,
        ]}
      />
      <Divider />
    </div>
  );
}

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { logout } = useAuth();
  const { settings } = useSettings();
  const { pathname } = useLocation();
  const page = getPageAccent(pathname);
  const [tick, setTick] = useState(0);

  // Re-keys the shimmer copy so a glossy sweep crosses the title every few seconds
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), SHIMMER_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const year = settings?.currentAcademicYear ?? '—';

  // On the Dashboard the bar drifts through every page's accent, one step per shimmer tick
  const cycling = matchPath({ path: '/dashboard', end: false }, pathname) !== null;
  const tone = cycling ? ACCENT_CYCLE[tick % ACCENT_CYCLE.length] : page;
  const accentVars = {
    '--hb-acc': tone.accent,
    '--hb-ink': tone.ink,
    '--hb-from': tone.washFrom,
    '--hb-to': tone.washTo,
  } as CSSProperties;

  return (
    <header
      className={`header-accent ${cycling ? 'header-accent-cycle' : ''} font-wp @container relative h-13 flex items-center px-3 md:px-5 shrink-0 z-20 backdrop-blur-md overflow-hidden`}
      style={{
        ...accentVars,
        background: 'linear-gradient(100deg, var(--hb-from) 0%, rgba(255,255,255,0.85) 50%, var(--hb-to) 100%)',
        borderBottom: `1px solid ${HAIRLINE}`,
        boxShadow: '0 1px 10px 0 color-mix(in srgb, var(--hb-acc) 8%, transparent)',
      }}
    >
      {/* Soft accent glows — one behind the page chip, a fainter one at the far right */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span
          className="absolute -top-12 -left-6 w-72 h-28 rounded-full blur-2xl"
          style={{ background: 'color-mix(in srgb, var(--hb-acc) 10%, transparent)' }}
        />
        <span
          className="absolute -top-12 right-[6%] w-64 h-28 rounded-full blur-2xl"
          style={{ background: 'color-mix(in srgb, var(--hb-acc) 6%, transparent)' }}
        />
      </span>

      {/* Accent hairline along the bottom edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 bottom-0 h-px opacity-50"
        style={{ background: 'linear-gradient(90deg, transparent 0%, var(--hb-acc) 30%, var(--hb-acc) 70%, transparent 100%)' }}
      />

      {/* Mobile row — hamburger + Academic Year + logout icon */}
      <div className="relative flex md:hidden items-center w-full gap-2">
        <button
          onClick={onMenuClick}
          className="flex items-center justify-center w-9 h-9 rounded-full border bg-white text-[#5B6371] hover:text-[color:var(--hb-ink)] hover:bg-[color:color-mix(in_srgb,var(--hb-acc)_7%,white)] transition-colors cursor-pointer shrink-0"
          style={{ borderColor: PILL_BORDER }}
          aria-label="Open menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={`${TICKER_TEXT} pl-1 font-semibold tabular-nums`} style={{ color: INK_VAR, fontSize: YEAR_SIZE }} title={`Academic Year ${year}`}>
            {year}
          </span>
          <CashBadge compact />
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

      {/* Desktop row — current page / centered app name / Academic Year + Logout.
          Container breakpoints (header content width, so they follow the sidebar), sized
          from measured Outfit widths so neither side ever reaches the centred title:
            < 560   title hidden          · 560–779  20px title, no year
            780–879 + year                · 880–999  28px title
            1000+   + welcome, Logout label · 1360+  full cash-in-hand wording */}
      <div className="relative hidden md:flex items-center w-full">
        {/* Left — current page chip */}
        <div className="flex-1 flex items-center min-w-0">
          <span
            className="inline-flex items-center gap-2 rounded-full border bg-white/70 pl-2.5 pr-3.5 py-[7px] text-[12.5px] font-medium leading-none whitespace-nowrap max-w-full"
            style={{ borderColor: PILL_BORDER, color: INK_VAR, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: ACC, boxShadow: '0 0 0 3px color-mix(in srgb, var(--hb-acc) 18%, transparent)' }}
            />
            <span key={page.label} className="truncate" style={{ animation: 'content-enter 0.25s ease-out' }}>{page.label}</span>
          </span>
          <WelcomeTicker />
        </div>

        {/* Centre — app name + a glossy sweep on every tick. Dashboard keeps the pastel
            multi-colour aurora; every other page tints it in its own accent. */}
        <span
          className="relative hidden @min-[560px]:block text-[20px] @min-[880px]:text-[28px] font-bold uppercase select-none pointer-events-none whitespace-nowrap leading-none"
          style={TITLE_STYLE}
          aria-label="SMP Admissions"
          role="img"
        >
          <span aria-hidden="true" className={cycling ? 'header-aurora' : 'header-aurora-accent'}>
            {TITLE_CHARS.map((ch, i) => (
              <span key={i} className="inline-block">{ch}</span>
            ))}
          </span>
          {/* Shimmer sweep — same letter boxes, text-clipped light band */}
          <span key={`s${tick}`} aria-hidden="true" className="header-shimmer absolute inset-0">
            {TITLE_CHARS.map((ch, i) => (
              <span key={i} className="inline-block">{ch}</span>
            ))}
          </span>
        </span>

        {/* Right — Academic Year ticker, cash-in-hand reminder, logout */}
        <div className="flex-1 flex justify-end items-center gap-2.5 min-w-0">
          <YearTicker year={year} />
          <CashBadge />
          <button
            onClick={() => { void logout(); }}
            className="group inline-flex items-center gap-2 rounded-full border bg-white pl-[4px] pr-[4px] @min-[1000px]:pr-3.5 py-[4px] text-[12.5px] font-medium text-[#3F4654] transition-all cursor-pointer shrink-0 hover:border-[#E11D48]/40 hover:bg-[#FFF5F7] hover:text-[#A5173A] hover:shadow-[0_3px_10px_rgba(225,29,72,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]/30"
            style={{ borderColor: PILL_BORDER }}
            title="Logout"
            aria-label="Logout"
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-white transition-transform group-hover:translate-x-0.5"
              style={{ background: `linear-gradient(135deg, #F43F5E, ${CORAL})`, boxShadow: '0 2px 6px rgba(225,29,72,0.3)' }}
            >
              <LogoutIcon size={12} />
            </span>
            <span className="hidden @min-[1000px]:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
