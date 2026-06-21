import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Student, FeeRecord, AcademicYear, Course } from '../../types';
import type { TCRecord } from '../../services/tcService';
import type { PCRecord } from '../../services/pcService';

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

const COURSE_DOT: Record<Course, string> = {
  CE: 'bg-amber-400', ME: 'bg-green-500', EC: 'bg-sky-400', CS: 'bg-teal-500', EE: 'bg-violet-400',
};
const COURSE_TEXT: Record<Course, string> = {
  CE: 'text-amber-700', ME: 'text-green-700', EC: 'text-sky-700', CS: 'text-teal-700', EE: 'text-violet-700',
};

const YR_SHORT: Record<string, string> = {
  '1ST YEAR': '1Y', '2ND YEAR': '2Y', '3RD YEAR': '3Y',
};

const KIND_LABEL: Record<EventKind, { label: string; cls: string }> = {
  ENROLLED: { label: 'Enrolled',  cls: 'text-emerald-600' },
  FEE_PAID: { label: 'Fee Paid',  cls: 'text-blue-600'    },
  TC:       { label: 'TC Issued', cls: 'text-amber-600'   },
  PC:       { label: 'PC Issued', cls: 'text-violet-600'  },
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
    <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
      {children}
    </span>
  );
}

const CARD_BG     = '#ecfdf5';
const CARD_BORDER = '#6ee7b7';
const CARD_DIV    = '#a7f3d0';

interface Props {
  students: Student[];
  feeRecords: FeeRecord[];
  academicYear: AcademicYear | null;
  cycleIdx: number;
}

export function RecentActivityCard({ students, feeRecords, academicYear, cycleIdx }: Props) {
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
        style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-3.5 rounded-full bg-emerald-200 shrink-0 animate-pulse" />
          <div className="h-3.5 w-28 bg-emerald-100 rounded animate-pulse" />
        </div>
        <div className="border-t mb-2" style={{ borderColor: CARD_DIV }} />
        <div className="space-y-2.5 flex-1">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="grid items-center" style={{ gridTemplateColumns: GRID_COLS, gap: GRID_GAP }}>
              <div className="h-4 bg-emerald-100 rounded-full animate-pulse" />
              <div className="h-3 bg-emerald-100 rounded animate-pulse" />
              <div className="h-3 w-5 bg-emerald-100 rounded animate-pulse" />
              <div className="h-3 w-4 bg-emerald-100 rounded animate-pulse" />
              <div className="h-3 bg-emerald-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl h-full flex flex-col border"
      style={{
        backgroundColor: CARD_BG,
        borderColor: CARD_BORDER,
        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 rounded-full bg-emerald-400 shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-gray-800 leading-tight">Recent Activity</p>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">
              {academicYear ? `${academicYear} · ` : ''}latest {PER_KIND} per type
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-semibold">
          <span className="text-emerald-600">Enrolled</span>
          <span className="text-emerald-300">·</span>
          <span className="text-blue-600">Fee</span>
          <span className="text-emerald-300">·</span>
          <span className="text-amber-600">TC</span>
          <span className="text-emerald-300">·</span>
          <span className="text-violet-600">PC</span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 shrink-0 border-t" style={{ borderColor: CARD_DIV }} />

      {/* ── Column headers ──────────────────────────────────────────────────── */}
      <div className="grid px-3 py-2 shrink-0" style={{ gridTemplateColumns: GRID_COLS, gap: GRID_GAP }}>
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
            <p className="text-[12px] font-semibold text-emerald-400">No recent activity</p>
            <p className="text-[10px] text-emerald-300 text-center">Appears here as students enroll or receive TC / PC</p>
          </div>
        ) : (
          <>
            {/* Slide — re-keyed on every cycleIdx change so page-enter fires in sync with bar chart */}
            <div
              key={cycleIdx}
              className="flex-1 min-h-0 overflow-y-auto scroll-emerald px-3"
              style={{ animation: 'page-enter 0.28s ease-out' }}
            >
              {/* Date header for this slide */}
              {activeGroup && (
                <div className="flex items-center gap-2 pt-2 pb-1.5">
                  <span className="text-[13px] font-black text-emerald-700 leading-none">
                    {activeGroup.displayDate}
                  </span>
                  <span className="w-px h-3 bg-emerald-200 shrink-0" />
                  <span className="text-[9px] text-emerald-500 font-semibold uppercase tracking-wide">
                    {activeGroup.evs.length} event{activeGroup.evs.length !== 1 ? 's' : ''}
                  </span>
                  {numGroups > 1 && (
                    <>
                      <span className="w-px h-3 bg-emerald-200 shrink-0" />
                      <span className="text-[9px] text-emerald-400 font-medium">
                        {activeIdx + 1} / {numGroups}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Event rows */}
              <div className="divide-y" style={{ borderColor: CARD_DIV }}>
                {activeGroup?.evs.map((ev, i) => {
                  const dot  = COURSE_DOT[ev.course as Course]  ?? 'bg-gray-300';
                  const ctxt = COURSE_TEXT[ev.course as Course] ?? 'text-gray-500';
                  const secondary = ev.kind === 'FEE_PAID' && ev.receiptNumber
                    ? ev.receiptNumber
                    : (ev.regNumber || '—');
                  return (
                    <div key={i} className="grid items-center py-1.5" style={{ gridTemplateColumns: GRID_COLS, gap: GRID_GAP }}>
                      <span className={`text-[9px] font-semibold leading-tight truncate ${KIND_LABEL[ev.kind].cls}`}>
                        {KIND_LABEL[ev.kind].label}
                      </span>
                      <span className="text-[11px] font-semibold text-gray-700 truncate">
                        {ev.name}
                      </span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                        <span className={`text-[10px] font-bold ${ctxt}`}>{ev.course}</span>
                      </div>
                      <span className="text-[10px] font-semibold text-gray-400">
                        {YR_SHORT[ev.year] ?? ev.year}
                      </span>
                      <span className="text-[9px] text-gray-400 font-mono truncate">
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
                    className={`rounded-full bg-emerald-400 transition-all duration-300 ${
                      i === activeIdx ? 'w-4 h-2 opacity-90' : 'w-2 h-2 opacity-30'
                    }`}
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
