import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PERI, PERI_INK, PERI_BORDER, PERI_DIVIDER, PERI_TINT, FAINT, MUTED, CORAL, AMBER, MINT,
  OUTLINE_PILL_BTN, ICON_PILL_BTN, BOY_HEX, GIRL_HEX,
} from './dashTokens';
import { formatIsoDate } from '../../utils/formatDates';
import type { Course } from '../../types';

// ─── Dashboard Insights — toolbar button + panel ─────────────────────────────
// One button beside the search opens a compact panel with tabs (INSIGHT_TABS):
// Fees (collections, fee position), Admissions (year-on-year, seats, momentum,
// gender mix) and Follow-ups (cash in hand, dues, pending, inquiries, transfers,
// profile gaps). The panel is height-capped and sized to the space below the
// button so it never runs off the screen; the last tab is remembered.

export interface DayStat { date: string; isToday: boolean; admissions: number; total: number; cash: number; upi: number }
export interface FeeStat { allotted: number; paid: number; dues: number; pct: number }

export interface DashboardInsights {
  days: DayStat[];
  fees: { smp: FeeStat; svk: FeeStat; overall: FeeStat } | null;
  dues: { students: number; cohort: number; amount: number } | null;
  cash: { amount: number; daysHeld: number; overdue: boolean } | null;
  confirmed: { current: number; prevYear: string | null; prev: number };
  seats: { filled: number; total: number; vacant: { course: Course; count: number }[] };
  week: { last7: number; prev7: number };
  gender: { boys: number; girls: number };
  pending: number;
  transfers: { in: number; out: number };
  inquiries: { active: number; converted: number; total: number };
  gaps: { total: number; mobile: number; aadhar: number; dob: number };
}

const GAP = 16;
const PANEL_W = 400;
const PANEL_MAX_H = 460;
const TAB_KEY = 'smp_insights_tab';

// Insight groups shown as tabs — add an entry here (and its body in the panel) to add a group.
const INSIGHT_TABS = [
  { id: 'fees', label: 'Fees' },
  { id: 'admissions', label: 'Admissions' },
  { id: 'follow', label: 'Follow-ups' },
] as const;
type InsightTab = (typeof INSIGHT_TABS)[number]['id'];

function readTab(): InsightTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (INSIGHT_TABS.some((t) => t.id === v)) return v as InsightTab;
  } catch { /* storage unavailable */ }
  return 'fees';
}

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pctText = (p: number) => `${Math.round(p * 100)}%`;
const plural = (n: number, word: string) => `${n.toLocaleString('en-IN')} ${word}${n === 1 ? '' : 's'}`;

function Bar({ pct, color = PERI }: { pct: number; color?: string }) {
  return (
    <div className="h-1 rounded-full overflow-hidden" style={{ background: PERI_DIVIDER }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%`, background: color }} />
    </div>
  );
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (prev <= 0) return null;
  const d = (cur - prev) / prev;
  const up = d >= 0;
  return (
    <span className="ml-1.5 text-[10.5px] font-semibold tabular-nums" style={{ color: up ? '#0A7A4B' : '#A5173A' }}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(d * 100))}%
    </span>
  );
}

/** One insight row. Clickable when `to` is given. */
function Row({ dot = PERI, title, value, valueColor, sub, to, onGo }: {
  dot?: string; title: ReactNode; value: ReactNode; valueColor?: string; sub?: ReactNode; to?: string; onGo: (to: string) => void;
}) {
  const body = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="w-1.5 h-1.5 rounded-full shrink-0 self-center" style={{ background: dot }} />
        <span className="text-[12px] font-medium min-w-0 truncate" style={{ color: PERI_INK }}>{title}</span>
        <span className="ml-auto text-[12.5px] font-semibold tabular-nums whitespace-nowrap" style={{ color: valueColor ?? PERI_INK }}>{value}</span>
      </div>
      {sub && <div className="pl-3.5 mt-0.5 text-[11px] tabular-nums" style={{ color: FAINT }}>{sub}</div>}
    </>
  );
  return to ? (
    <button type="button" onClick={() => onGo(to)} className="block w-full text-left rounded-xl px-3 py-2 transition-colors hover:bg-[#F5F6FF] cursor-pointer">
      {body}
    </button>
  ) : (
    <div className="rounded-xl px-3 py-2">{body}</div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pt-1">
      <p className="px-3 pt-1 pb-0.5 text-[9.5px] font-medium uppercase tracking-[0.8px]" style={{ color: FAINT }}>{label}</p>
      {children}
    </div>
  );
}

function ChartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 6-6" />
    </svg>
  );
}

export function InsightsButton({ insights, year, isAdmin, compact }: {
  insights: DashboardInsights; year: string | null; isAdmin: boolean; compact: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<InsightTab>(readTab);
  function pickTab(t: InsightTab) {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* storage unavailable */ }
  }
  const [box, setBox] = useState<{ left: number; width: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Fit the panel into the space below the button: cap its height at the viewport
  // bottom and slide it left when it would cross the right edge.
  function measure() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(PANEL_W, window.innerWidth - GAP * 2);
    const overflowRight = r.left + width - (window.innerWidth - GAP);
    const left = overflowRight > 0 ? -Math.min(overflowRight, r.left - GAP) : 0;
    const maxHeight = Math.min(PANEL_MAX_H, Math.max(160, window.innerHeight - r.bottom - 8 - GAP));
    setBox({ left, width, maxHeight });
  }
  const measureRef = useRef(measure);
  useLayoutEffect(() => { measureRef.current = measure; });

  useEffect(() => {
    if (!open) return;
    const onChange = () => measureRef.current();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => { window.removeEventListener('resize', onChange); window.removeEventListener('scroll', onChange, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  function go(to: string) {
    setOpen(false);
    void navigate(to);
  }

  const i = insights;
  const feeLink = isAdmin ? '/fee-reports' : '/fee-register';
  const attention: string | null = i.cash?.overdue ? CORAL : (i.pending > 0 || (i.cash?.amount ?? 0) > 0) ? AMBER : null;
  const genderTotal = i.gender.boys + i.gender.girls;
  const followCount = [
    !!i.cash, !!i.dues, i.pending > 0, i.inquiries.total > 0, i.transfers.in + i.transfers.out > 0, i.gaps.total > 0,
  ].filter(Boolean).length;
  const gapParts = [
    i.gaps.mobile > 0 && `${i.gaps.mobile} mobile`,
    i.gaps.aadhar > 0 && `${i.gaps.aadhar} Aadhar`,
    i.gaps.dob > 0 && `${i.gaps.dob} DOB`,
  ].filter(Boolean).join(' · ');

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (!open) measure(); setOpen(!open); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Insights"
        aria-label="Insights"
        className={`${compact ? ICON_PILL_BTN : OUTLINE_PILL_BTN} relative inline-flex items-center gap-1.5 cursor-pointer`}
        style={open ? { borderColor: PERI, background: PERI_TINT, color: PERI_INK } : undefined}
      >
        <span style={{ color: PERI_INK }}><ChartIcon /></span>
        {!compact && 'Insights'}
        {attention && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white" style={{ background: attention }} />
        )}
      </button>

      {open && box && (
        <div
          role="dialog"
          aria-label="Insights"
          className="absolute top-full mt-2 z-30 flex flex-col rounded-2xl border bg-white"
          style={{
            left: box.left, width: box.width, maxHeight: box.maxHeight,
            borderColor: PERI_BORDER,
            boxShadow: '0 12px 32px rgba(63,75,184,0.14), 0 2px 8px rgba(63,75,184,0.06)',
            animation: 'ctx-menu-enter 0.14s cubic-bezier(0.2,0,0,1)',
          }}
        >
          <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-3 pb-2 border-b" style={{ borderColor: PERI_DIVIDER }}>
            <span style={{ color: PERI_INK }}><ChartIcon /></span>
            <p className="text-[11px] font-medium uppercase tracking-[0.8px]" style={{ color: PERI_INK }}>Insights</p>
            {year && (
              <span className="rounded-full border px-2 py-[2px] text-[10px] font-medium tabular-nums" style={{ borderColor: `${PERI}55`, color: PERI_INK }}>{year}</span>
            )}
            <span className="text-[10.5px]" style={{ color: FAINT }}>Whole college</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="ml-auto w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#F5F6FF] cursor-pointer"
              style={{ color: FAINT }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Tab switch — one compact pill per INSIGHT_TABS entry */}
          <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: PERI_DIVIDER }} role="tablist">
            {INSIGHT_TABS.map((t) => {
              const active = t.id === tab;
              const badge = t.id === 'follow' ? followCount : 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => pickTab(t.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-[5px] text-[11.5px] font-medium transition-colors cursor-pointer hover:bg-[#F5F6FF]"
                  style={active ? { borderColor: PERI, background: PERI_TINT, color: PERI_INK } : { borderColor: 'transparent', color: MUTED }}
                >
                  {t.label}
                  {badge > 0 && (
                    <span className="min-w-[16px] h-4 px-1 rounded-full text-[9.5px] font-semibold leading-4 text-center tabular-nums text-white" style={{ background: attention ?? PERI }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div key={tab} className="min-h-0 overflow-y-auto overscroll-contain p-1.5" style={{ animation: 'content-enter 0.18s ease-out' }}>
            {/* ── Fees ── */}
            {tab === 'fees' && (<>
              <Group label="Collections">
                {i.days.map((d) => (
                  <Row
                    key={d.date}
                    onGo={go}
                    to={isAdmin ? '/cash-book' : '/fee-register'}
                    title={d.isToday ? 'Today' : formatIsoDate(d.date)}
                    value={rupee(d.total)}
                    sub={<>{plural(d.admissions, 'admission')} · Cash {rupee(d.cash)} · UPI {rupee(d.upi)}</>}
                  />
                ))}
              </Group>

              {i.fees && (
                <Group label="Fee position">
                  {(['smp', 'svk', 'overall'] as const).map((k) => {
                    const f = i.fees![k];
                    return (
                      <Row
                        key={k}
                        onGo={go}
                        to={feeLink}
                        dot={k === 'overall' ? PERI_INK : PERI}
                        title={k === 'smp' ? 'SMP fee' : k === 'svk' ? 'SVK fee' : 'Overall'}
                        value={pctText(f.pct)}
                        sub={
                          <div className="mt-1 space-y-1">
                            <Bar pct={f.pct} color={k === 'overall' ? PERI_INK : PERI} />
                            <p>Paid {rupee(f.paid)} of {rupee(f.allotted)} · Dues {rupee(f.dues)}</p>
                          </div>
                        }
                      />
                    );
                  })}
                </Group>
              )}

            </>)}

            {/* ── Admissions ── */}
            {tab === 'admissions' && (
              <Group label="This year">
                <Row
                  onGo={go}
                  to="/students"
                  title="Confirmed students"
                  value={<>{i.confirmed.current.toLocaleString('en-IN')}<Delta cur={i.confirmed.current} prev={i.confirmed.prev} /></>}
                  sub={i.confirmed.prevYear && i.confirmed.prev > 0 ? `${i.confirmed.prevYear}: ${i.confirmed.prev.toLocaleString('en-IN')}` : undefined}
                />
                <Row
                  onGo={go}
                  to="/admissions"
                  title="1st-year seats filled"
                  value={`${i.seats.filled} / ${i.seats.total}`}
                  sub={
                    <div className="mt-1 space-y-1">
                      <Bar pct={i.seats.total > 0 ? i.seats.filled / i.seats.total : 0} />
                      <p>{i.seats.vacant.length > 0
                        ? <>Most vacant: {i.seats.vacant.map((v) => `${v.course} ${v.count}`).join(' · ')}</>
                        : 'All seats filled'}</p>
                    </div>
                  }
                />
                <Row
                  onGo={go}
                  title="Admitted this week"
                  value={<>{i.week.last7}<Delta cur={i.week.last7} prev={i.week.prev7} /></>}
                  sub={`Previous 7 days: ${i.week.prev7}`}
                />
                {genderTotal > 0 && (
                  <Row
                    onGo={go}
                    dot={GIRL_HEX}
                    title="Gender mix"
                    value={`${pctText(i.gender.girls / genderTotal)} girls`}
                    sub={
                      <div className="mt-1 space-y-1">
                        <div className="flex h-1 rounded-full overflow-hidden">
                          <div style={{ width: `${(i.gender.boys / genderTotal) * 100}%`, background: BOY_HEX }} />
                          <div className="flex-1" style={{ background: GIRL_HEX }} />
                        </div>
                        <p>{plural(i.gender.boys, 'boy')} · {plural(i.gender.girls, 'girl')}</p>
                      </div>
                    }
                  />
                )}
              </Group>
            )}

            {/* ── Follow-ups ── */}
            {tab === 'follow' && (followCount === 0 ? (
              <p className="px-3 py-6 text-center text-[12px]" style={{ color: FAINT }}>Nothing needs attention right now.</p>
            ) : (
                <Group label="Needs attention">
                  {i.cash && (
                    <Row
                      onGo={go}
                      to="/cash-book"
                      dot={i.cash.overdue ? CORAL : MINT}
                      title="Cash in hand"
                      value={rupee(i.cash.amount)}
                      valueColor={i.cash.overdue ? '#A5173A' : undefined}
                      sub={i.cash.overdue
                        ? `Overdue — held ${plural(i.cash.daysHeld, 'day')}, deposit to bank`
                        : i.cash.daysHeld > 0 ? `Held ${plural(i.cash.daysHeld, 'day')}` : 'Collected today'}
                    />
                  )}
                  {i.dues && (
                    <Row
                      onGo={go}
                      to={feeLink}
                      dot={AMBER}
                      title="Students with dues"
                      value={`${i.dues.students.toLocaleString('en-IN')} / ${i.dues.cohort.toLocaleString('en-IN')}`}
                      sub={<>{rupee(i.dues.amount)} outstanding</>}
                    />
                  )}
                  {i.pending > 0 && (
                    <Row onGo={go} to="/admissions" dot={AMBER} title="Admissions pending" value={i.pending} sub="Not yet confirmed or cancelled" />
                  )}
                  {i.inquiries.total > 0 && (
                    <Row
                      onGo={go}
                      to="/inquiries"
                      title="Inquiries"
                      value={`${i.inquiries.active} active`}
                      sub={`${i.inquiries.converted} of ${i.inquiries.total} converted (${pctText(i.inquiries.converted / i.inquiries.total)})`}
                    />
                  )}
                  {i.transfers.in + i.transfers.out > 0 && (
                    <Row onGo={go} to="/students" dot={MUTED} title="Transfers" value={`${i.transfers.in} in · ${i.transfers.out} out`} />
                  )}
                  {i.gaps.total > 0 && (
                    <Row
                      onGo={go}
                      to={isAdmin ? '/settings?tab=backup&section=data-repair' : undefined}
                      dot={AMBER}
                      title="Incomplete profiles"
                      value={i.gaps.total}
                      sub={<>Missing {gapParts}{isAdmin ? ' · open Data Health to fix' : ''}</>}
                    />
                  )}
                </Group>
            ))}
          </div>

          <div className="flex-shrink-0 flex items-center gap-3 border-t px-4 py-2.5" style={{ borderColor: PERI_DIVIDER }}>
            {isAdmin ? (
              <>
                <button type="button" onClick={() => go('/fee-reports')} className="text-[11.5px] font-semibold cursor-pointer hover:underline" style={{ color: PERI_INK }}>Fee Reports →</button>
                <button type="button" onClick={() => go('/cash-book')} className="text-[11.5px] font-semibold cursor-pointer hover:underline" style={{ color: PERI_INK }}>Cash &amp; Bank →</button>
              </>
            ) : (
              <button type="button" onClick={() => go('/fee-register')} className="text-[11.5px] font-semibold cursor-pointer hover:underline" style={{ color: PERI_INK }}>Fee Register →</button>
            )}
            <button type="button" onClick={() => go('/admissions')} className="ml-auto text-[11.5px] font-semibold cursor-pointer hover:underline" style={{ color: PERI_INK }}>Admissions →</button>
          </div>
        </div>
      )}
    </div>
  );
}
