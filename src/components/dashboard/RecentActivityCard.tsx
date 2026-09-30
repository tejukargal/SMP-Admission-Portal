import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Student, FeeRecord, AcademicYear, Course } from '../../types';
import type { TCRecord } from '../../services/tcService';
import type { PCRecord } from '../../services/pcService';
import { PERI, PERI_INK, PERI_BORDER, PERI_BAND, PERI_BAND_BORDER, PERI_DIVIDER, INK, FAINT, COURSE_HEX, inkOf } from './dashTokens';

type StudentWithHistory = Student & { tcHistory?: TCRecord[]; pcHistory?: PCRecord[] };
type EventKind = 'ENROLLED' | 'FEE_PAID' | 'TC' | 'PC';

interface ActivityEvent {
  kind: EventKind;
  name: string;
  course: string;
  year: string;
  regNumber: string;
  receiptNumber?: string;
  isoDate: string;
  displayDate: string;
}

const YR_SHORT: Record<string, string> = {
  '1ST YEAR': '1Y', '2ND YEAR': '2Y', '3RD YEAR': '3Y',
};

const KIND_LABEL: Record<EventKind, { label: string; color: string }> = {
  ENROLLED: { label: 'Enrolled',  color: '#3F4BB8' },
  FEE_PAID: { label: 'Fee Paid',  color: '#0B8A57' },
  TC:       { label: 'TC Issued', color: '#B45309' },
  PC:       { label: 'PC Issued', color: '#6D28D9' },
};

const PER_KIND = 3;

// Date column removed — date shown as slide header instead
const GRID_COLS = '62px 1fr 26px 18px 68px';
const GRID_GAP = '0 10px';

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function byDateDesc(a: ActivityEvent, b: ActivityEvent): number {
  return b.isoDate.localeCompare(a.isoDate);
}

function ColHd({ children }: { children: ReactNode }) {
  return (
    <span className="text-[9px] font-medium uppercase tracking-[0.6px]" style={{ color: FAINT }}>
      {children}
    </span>
  );
}

const MATCHA      = PERI;
const DARK_OLIVE  = INK;
const CARD_BG     = '#FFFFFF';
const CARD_BORDER = PERI_BORDER;
const CARD_DIV    = PERI_DIVIDER;
const SKELETON    = 'rgba(107,124,246,0.10)';

interface Props {
  students: Student[];
  feeRecords: FeeRecord[];
  academicYear: AcademicYear | null;
  cycleIdx: number;
  /** Optional control rendered at the right end of the header (e.g. the Activity / DTEK toggle). */
  headerExtra?: ReactNode;
}

export function RecentActivityCard({ students, feeRecords, academicYear, cycleIdx, headerExtra }: Props) {
  const events = useMemo<ActivityEvent[]>(() => {
    const confirmedIds = new Set(
      students.filter((s) => s.admissionStatus === 'CONFIRMED').map((s) => s.id),
    );
    const firstPayment = new Map<string, FeeRecord>();
    for (const r of feeRecords) {
      if (!confirmedIds.has(r.studentId)) continue;
      const existing = firstPayment.get(r.studentId);
      if (!existing || r.date < existing.date) firstPayment.set(r.studentId, r);
    }
    const enrolledEvents: ActivityEvent[] = [...firstPayment.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, PER_KIND)
      .map((r) => ({
        kind: 'ENROLLED',
        name: r.studentName,
        course: r.course,
        year: r.year,
        regNumber: r.regNumber,
        isoDate: r.date,
        displayDate: fmtDate(r.date),
      }));

    const feePaidEvents: ActivityEvent[] = [...feeRecords]
      .filter((r) => !!r.date)
      .sort((a, b) => {
        const dc = b.date.localeCompare(a.date);
        return dc !== 0 ? dc : (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      })
      .slice(0, PER_KIND)
      .map((r) => ({
        kind: 'FEE_PAID' as const,
        name: r.studentName,
        course: r.course,
        year: r.year,
        regNumber: r.regNumber,
        receiptNumber: r.receiptNumber || undefined,
        isoDate: r.date,
        displayDate: fmtDate(r.date),
      }));

    const tcEvents: ActivityEvent[] = [];
    for (const s of students as StudentWithHistory[]) {
      for (const tc of s.tcHistory ?? []) {
        tcEvents.push({
          kind: 'TC',
          name: s.studentNameSSLC,
          course: tc.course || s.course,
          year: s.year,
          regNumber: s.regNumber,
          isoDate: tc.issuedAt,
          displayDate: fmtDate(tc.issuedAt),
        });
      }
    }
    const recentTc = tcEvents.sort(byDateDesc).slice(0, PER_KIND);

    const pcEvents: ActivityEvent[] = [];
    for (const s of students as StudentWithHistory[]) {
      for (const pc of s.pcHistory ?? []) {
        pcEvents.push({
          kind: 'PC',
          name: s.studentNameSSLC,
          course: s.course,
          year: s.year,
          regNumber: pc.regNumber || s.regNumber,
          isoDate: pc.issuedAt,
          displayDate: fmtDate(pc.issuedAt),
        });
      }
    }
    const recentPc = pcEvents.sort(byDateDesc).slice(0, PER_KIND);

    return [...enrolledEvents, ...feePaidEvents, ...recentTc, ...recentPc].sort(byDateDesc);
  }, [students, feeRecords]);

  // Group events by calendar date (ISO date prefix), most recent first
  const dateGroups = useMemo(() => {
    if (events.length === 0) return [];
    const map = new Map<string, ActivityEvent[]>();
    for (const ev of events) {
      if (!ev.isoDate) continue;
      const key = ev.isoDate.split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries())
      .map(([isoDate, evs]) => ({
        isoDate,
        displayDate: evs[0].displayDate,
        evs: evs.sort(byDateDesc),
      }))
      .sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  }, [events]);

  const numGroups = dateGroups.length;
  const activeIdx = numGroups > 0 ? cycleIdx % numGroups : 0;
  const activeGroup = numGroups > 0 ? dateGroups[activeIdx] : null;

  const isEmpty = students.length === 0 && feeRecords.length === 0;

  if (isEmpty) {
    return (
      <div
        className="rounded-2xl h-full flex flex-col border p-4"
        style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-3.5 rounded-full shrink-0 animate-pulse" style={{ background: MATCHA }} />
            <div className="h-3.5 w-28 rounded animate-pulse" style={{ background: SKELETON }} />
          </div>
          {headerExtra}
        </div>
        <div className="border-t mb-2" style={{ borderColor: CARD_DIV }} />
        <div className="space-y-2.5 flex-1">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="grid items-center" style={{ gridTemplateColumns: GRID_COLS, gap: GRID_GAP }}>
              <div className="h-4 rounded-full animate-pulse" style={{ background: SKELETON }} />
              <div className="h-3 rounded animate-pulse" style={{ background: SKELETON }} />
              <div className="h-3 w-5 rounded animate-pulse" style={{ background: SKELETON }} />
              <div className="h-3 w-4 rounded animate-pulse" style={{ background: SKELETON }} />
              <div className="h-3 rounded animate-pulse" style={{ background: SKELETON }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl h-full flex flex-col border overflow-hidden"
      style={{
        backgroundColor: CARD_BG,
        borderColor: CARD_BORDER,
      }}
    >
      {/* ── Header — soft band, separated by a hairline ─────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ background: PERI_BAND, borderColor: PERI_BAND_BORDER }}>
        <div>
          <p className="text-[13px] font-medium leading-tight" style={{ color: PERI_INK }}>Recent Activity</p>
          <p className="text-[10px] font-medium mt-0.5" style={{ color: FAINT }}>
            {academicYear ? `${academicYear} · ` : ''}latest {PER_KIND} per type
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-[9.5px] font-medium" style={{ color: FAINT }}>
            <span>Enrolled</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Fee</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>TC</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>PC</span>
          </div>
          {headerExtra}
        </div>
      </div>

      {/* ── Column headers ──────────────────────────────────────────────────── */}
      <div className="grid px-3 pt-2.5 pb-2 shrink-0" style={{ gridTemplateColumns: GRID_COLS, gap: GRID_GAP }}>
        <ColHd>Type</ColHd>
        <ColHd>Student</ColHd>
        <ColHd>Crs</ColHd>
        <ColHd>Yr</ColHd>
        <ColHd>Reg / Rpt</ColHd>
      </div>

      <div className="mx-3 shrink-0 border-t" style={{ borderColor: CARD_DIV }} />

      {/* ── Cycling content ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {events.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 py-6">
            <p className="text-[12px] font-medium" style={{ color: FAINT }}>No recent activity</p>
            <p className="text-[10px] text-center" style={{ color: FAINT }}>Appears here as students enroll or receive TC / PC</p>
          </div>
        ) : (
          <>
            {/* Slide — re-keyed on every cycleIdx change so page-enter fires in sync with bar chart */}
            <div
              key={cycleIdx}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar px-3"
              style={{ animation: 'page-enter 0.28s ease-out' }}
            >
              {/* Date header for this slide */}
              {activeGroup && (
                <div className="flex items-center gap-2 pt-2 pb-1.5">
                  <span className="text-[13px] font-medium leading-none tabular-nums" style={{ color: PERI_INK }}>
                    {activeGroup.displayDate}
                  </span>
                  <span className="w-px h-3 shrink-0" style={{ background: CARD_DIV }} />
                  <span className="text-[9.5px] font-medium uppercase tracking-wide" style={{ color: FAINT }}>
                    {activeGroup.evs.length} event{activeGroup.evs.length !== 1 ? 's' : ''}
                  </span>
                  {numGroups > 1 && (
                    <>
                      <span className="w-px h-3 shrink-0" style={{ background: CARD_DIV }} />
                      <span className="text-[9.5px] font-medium tabular-nums" style={{ color: FAINT }}>
                        {activeIdx + 1} / {numGroups}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Event rows */}
              <div className="divide-y" style={{ borderColor: CARD_DIV }}>
                {activeGroup?.evs.map((ev, i) => {
                  const hex = COURSE_HEX[ev.course as Course] ?? '#9CA3AF';
                  const secondary = ev.kind === 'FEE_PAID' && ev.receiptNumber
                    ? ev.receiptNumber
                    : (ev.regNumber || '—');
                  return (
                    <div key={i} className="grid items-center py-1.5" style={{ gridTemplateColumns: GRID_COLS, gap: GRID_GAP }}>
                      <span className="text-[9.5px] font-medium leading-tight truncate" style={{ color: KIND_LABEL[ev.kind].color }}>
                        {KIND_LABEL[ev.kind].label}
                      </span>
                      <span className="text-[11.5px] font-medium truncate" style={{ color: DARK_OLIVE }}>
                        {ev.name}
                      </span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: hex }} />
                        <span className="text-[10.5px] font-medium" style={{ color: inkOf(hex) }}>{ev.course}</span>
                      </div>
                      <span className="text-[10.5px] font-medium" style={{ color: FAINT }}>
                        {YR_SHORT[ev.year] ?? ev.year}
                      </span>
                      <span className="text-[9.5px] font-medium tabular-nums truncate" style={{ color: FAINT }}>
                        {secondary}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Navigation dots — same style as bar chart mode dots */}
            {numGroups > 1 && (
              <div className="flex items-center justify-center gap-1.5 py-2 shrink-0">
                {dateGroups.map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full transition-all duration-300"
                    style={{
                      background: MATCHA,
                      width: i === activeIdx ? 16 : 8,
                      height: 8,
                      opacity: i === activeIdx ? 0.9 : 0.35,
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
