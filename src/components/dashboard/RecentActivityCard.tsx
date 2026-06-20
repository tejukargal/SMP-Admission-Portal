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

// Matches the course dot palette used across the dashboard
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

// Grid column widths — shared between header row and every data row for perfect alignment
// type-badge | name | course | yr | reg/rpt | date
const GRID_COLS = '62px 1fr 26px 18px 68px 40px';
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

function ColHd({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider text-gray-400 ${right ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

// Card theme — sage/emerald pastel, matching the dashboard's nature palette
const CARD_BG     = '#ecfdf5'; // emerald-50
const CARD_BORDER = '#6ee7b7'; // emerald-300
const CARD_DIV    = '#a7f3d0'; // emerald-200

interface Props {
  students: Student[];
  feeRecords: FeeRecord[];
  academicYear: AcademicYear | null;
}

export function RecentActivityCard({ students, feeRecords, academicYear }: Props) {
  const events = useMemo<ActivityEvent[]>(() => {
    // ── ENROLLED: earliest fee record per confirmed student ───────────────────
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

    // ── FEE PAID: 3 most recently dated fee records (any payment) ─────────────
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

    // ── TC events: latest 3 across all students ───────────────────────────────
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

    // ── PC events: latest 3 across all students ───────────────────────────────
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

  const isEmpty = students.length === 0 && feeRecords.length === 0;

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <div className="rounded-2xl h-full flex flex-col border p-4"
        style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}>
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
              <div className="h-3 bg-emerald-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl h-full flex flex-col border"
      style={{
        backgroundColor: CARD_BG,
        borderColor: CARD_BORDER,
        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)',
      }}>

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
        {/* Legend — plain coloured text */}
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
        <ColHd right>Date</ColHd>
      </div>

      <div className="mx-3 shrink-0 border-t" style={{ borderColor: CARD_DIV }} />

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-emerald px-3 pb-2">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1 py-6">
            <p className="text-[12px] font-semibold text-emerald-400">No recent activity</p>
            <p className="text-[10px] text-emerald-300 text-center">Appears here as students enroll or receive TC / PC</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: CARD_DIV }}>
            {events.map((ev, i) => {
              const dot  = COURSE_DOT[ev.course as Course]  ?? 'bg-gray-300';
              const ctxt = COURSE_TEXT[ev.course as Course] ?? 'text-gray-500';
              const secondary = ev.kind === 'FEE_PAID' && ev.receiptNumber
                ? ev.receiptNumber
                : (ev.regNumber || '—');
              return (
                <div key={i} className="grid items-center py-1.5" style={{ gridTemplateColumns: GRID_COLS, gap: GRID_GAP }}>

                  {/* Type label — plain coloured text, no box */}
                  <span className={`text-[9px] font-semibold leading-tight truncate ${KIND_LABEL[ev.kind].cls}`}>
                    {KIND_LABEL[ev.kind].label}
                  </span>

                  {/* Name */}
                  <span className="text-[11px] font-semibold text-gray-700 truncate">
                    {ev.name}
                  </span>

                  {/* Course (dot + code) */}
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                    <span className={`text-[10px] font-bold ${ctxt}`}>{ev.course}</span>
                  </div>

                  {/* Year */}
                  <span className="text-[10px] font-semibold text-gray-400">
                    {YR_SHORT[ev.year] ?? ev.year}
                  </span>

                  {/* Reg / Receipt */}
                  <span className="text-[9px] text-gray-400 font-mono truncate">
                    {secondary}
                  </span>

                  {/* Date */}
                  <span className="text-[9px] text-gray-400 text-right">
                    {ev.displayDate}
                  </span>

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
