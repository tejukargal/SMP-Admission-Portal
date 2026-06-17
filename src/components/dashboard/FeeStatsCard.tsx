import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Course, Year } from '../../types';

export interface FeeStatsBucket {
  allotted: number;
  collected: number;
  dues: number;
  pending: number;
  total: number;
}

export interface FeeStatsData {
  totalAllotted: number;
  totalCollected: number;
  totalDues: number;
  totalPending: number;
  totalStudents: number;
  byCourse: Record<Course, FeeStatsBucket>;
  byYear: Record<Year, FeeStatsBucket>;
  academicYear: string;
}

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[]     = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YR_SHORT: Record<Year, string> = { '1ST YEAR': '1st Year', '2ND YEAR': '2nd Year', '3RD YEAR': '3rd Year' };

const COURSE_DOT: Record<Course, string> = {
  CE: 'bg-amber-400', ME: 'bg-green-500', EC: 'bg-sky-400', CS: 'bg-teal-500', EE: 'bg-violet-400',
};
const YEAR_DOT = ['bg-lime-400', 'bg-emerald-500', 'bg-teal-500'];

function fmt(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return n === 0 ? '—' : `₹${n}`;
}

function StatusBadge({ dues, allotted, collected }: { dues: number; allotted: number; collected: number }) {
  if (allotted === 0) return <span className="text-[10px] font-semibold text-gray-300 px-2 py-0.5 rounded-full border border-gray-200">N/A</span>;
  if (dues === 0)     return <span className="text-[10px] font-semibold text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50">Cleared</span>;
  if (collected > 0)  return <span className="text-[10px] font-semibold text-amber-600  px-2 py-0.5 rounded-full border border-amber-200  bg-amber-50" >Partial</span>;
  return               <span className="text-[10px] font-semibold text-rose-600   px-2 py-0.5 rounded-full border border-rose-200   bg-rose-50"  >Dues</span>;
}

const MODES = ['Course-wise', 'Year-wise', 'Pending'] as const;
type Mode = typeof MODES[number];

const MODE_THEME: Record<Mode, { cardBg: string; cardBorder: string; divider: string; track: string }> = {
  'Course-wise': { cardBg: '#eff6ff', cardBorder: '#93c5fd', divider: '#bfdbfe', track: 'rgba(59,130,246,0.08)' },
  'Year-wise':   { cardBg: '#ecfdf5', cardBorder: '#6ee7b7', divider: '#a7f3d0', track: 'rgba(16,185,129,0.08)' },
  'Pending':     { cardBg: '#fff1f2', cardBorder: '#fda4af', divider: '#fecdd3', track: 'rgba(244,63,94,0.08)'  },
};

// Column header label cell
function ColHd({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider text-gray-400 ${right ? 'text-right' : ''}`}>
      {children}
    </span>
  );
}

interface Props { data: FeeStatsData | null; loading?: boolean }

export function FeeStatsCard({ data, loading }: Props) {
  const [mode, setMode] = useState<Mode>('Course-wise');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);
        setVisible(true);
      }, 180);
    }, 8000);
    return () => clearInterval(id);
  }, [data]);

  function switchMode(m: Mode) {
    if (m === mode) return;
    setVisible(false);
    setTimeout(() => { setMode(m); setVisible(true); }, 150);
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading || !data) {
    return (
      <div className="rounded-2xl h-full flex flex-col bg-white border border-gray-100 p-4"
        style={{ boxShadow: '0 1px 6px 0 rgba(0,0,0,0.07)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-6 w-40 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="border-t border-gray-100 mb-2" />
        <div className="space-y-3 flex-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-100 animate-pulse shrink-0" />
              <div className="flex-1 h-3 bg-gray-100 rounded animate-pulse" />
              <div className="w-12 h-3 bg-gray-100 rounded animate-pulse" />
              <div className="w-12 h-3 bg-gray-100 rounded animate-pulse" />
              <div className="w-14 h-5 bg-gray-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const collPct = data.totalAllotted > 0 ? Math.round((data.totalCollected / data.totalAllotted) * 100) : 0;

  const theme = MODE_THEME[mode];

  return (
    <div className="rounded-2xl h-full flex flex-col border"
      style={{
        backgroundColor: theme.cardBg,
        borderColor: theme.cardBorder,
        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)',
        transition: 'background-color 700ms ease, border-color 700ms ease',
      }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-3 shrink-0">
        <div>
          <p className="text-[13px] font-bold text-gray-800 leading-tight">Fee Statistics</p>
          <p className="text-[10px] text-gray-400 font-medium mt-0.5">{data.academicYear} · confirmed</p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: theme.divider, transition: 'background-color 700ms ease' }}>
          {MODES.map((m) => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className={`text-[9px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer transition-all duration-200 whitespace-nowrap ${
                m === mode ? 'bg-white text-gray-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >{m}</button>
          ))}
        </div>
      </div>

      <div className="mx-4 shrink-0 border-t" style={{ borderColor: theme.divider, transition: 'border-color 700ms ease' }} />

      {/* Content — flex-1 + min-h-0 so it never overflows the card */}
      <div className="flex-1 min-h-0 flex flex-col px-4 pb-3 overflow-hidden"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 180ms ease' }}>

        {/* ── Course-wise ─────────────────────────────────────── */}
        {mode === 'Course-wise' && (
          <div className="flex flex-col min-h-0 flex-1">
            {/* Col headers */}
            <div className="grid py-2 shrink-0" style={{ gridTemplateColumns: '1fr auto auto auto auto', gap: '0 12px' }}>
              <ColHd>Course</ColHd>
              <ColHd right>Allotted</ColHd>
              <ColHd right>Collected</ColHd>
              <ColHd right>Dues</ColHd>
              <ColHd right>Status</ColHd>
            </div>

            {/* Rows — overflow-hidden clips if somehow too tall */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col divide-y divide-gray-100">
              {COURSES.map((c) => {
                const b = data.byCourse[c];
                return (
                  <div key={c} className="flex-1 grid items-center" style={{ gridTemplateColumns: '1fr auto auto auto auto', gap: '0 12px' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${COURSE_DOT[c]}`} />
                      <span className="text-[13px] font-bold text-gray-700">{c}</span>
                      {b.pending > 0 && <span className="text-[10px] text-gray-400">{b.pending} due</span>}
                    </div>
                    <span className="text-[11px] tabular-nums text-gray-500 text-right">{fmt(b.allotted)}</span>
                    <span className="text-[11px] tabular-nums font-semibold text-emerald-600 text-right">{fmt(b.collected)}</span>
                    <span className="text-[11px] tabular-nums text-rose-500 text-right">{fmt(b.dues)}</span>
                    <div className="flex justify-end">
                      <StatusBadge dues={b.dues} allotted={b.allotted} collected={b.collected} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="border-t shrink-0 pt-2" style={{ borderColor: theme.cardBorder, transition: 'border-color 700ms ease' }}>
              <div className="grid items-center" style={{ gridTemplateColumns: '1fr auto auto auto auto', gap: '0 12px' }}>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Total</span>
                <span className="text-[11px] tabular-nums font-bold text-gray-600 text-right">{fmt(data.totalAllotted)}</span>
                <span className="text-[11px] tabular-nums font-bold text-emerald-600 text-right">{fmt(data.totalCollected)}</span>
                <span className="text-[11px] tabular-nums font-bold text-rose-500 text-right">{fmt(data.totalDues)}</span>
                <div />
              </div>
            </div>
          </div>
        )}

        {/* ── Year-wise ───────────────────────────────────────── */}
        {mode === 'Year-wise' && (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="grid py-2 shrink-0" style={{ gridTemplateColumns: '1fr auto auto auto auto', gap: '0 12px' }}>
              <ColHd>Year</ColHd>
              <ColHd right>Allotted</ColHd>
              <ColHd right>Collected</ColHd>
              <ColHd right>Pending</ColHd>
              <ColHd right>Status</ColHd>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col divide-y divide-gray-100">
              {YEARS.map((y, i) => {
                const b = data.byYear[y];
                return (
                  <div key={y} className="flex-1 grid items-center" style={{ gridTemplateColumns: '1fr auto auto auto auto', gap: '0 12px' }}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${YEAR_DOT[i]}`} />
                      <span className="text-[13px] font-bold text-gray-700">{YR_SHORT[y]}</span>
                    </div>
                    <span className="text-[11px] tabular-nums text-gray-500 text-right">{fmt(b.allotted)}</span>
                    <span className="text-[11px] tabular-nums font-semibold text-emerald-600 text-right">{fmt(b.collected)}</span>
                    <span className={`text-[11px] tabular-nums font-semibold text-right ${b.pending > 0 ? 'text-rose-500' : 'text-gray-300'}`}>{b.pending}</span>
                    <div className="flex justify-end">
                      <StatusBadge dues={b.dues} allotted={b.allotted} collected={b.collected} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Collection rate bar */}
            <div className="border-t pt-2.5 shrink-0" style={{ borderColor: theme.cardBorder, transition: 'border-color 700ms ease' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Collection rate</span>
                <span className="text-[11px] font-black text-emerald-600">{collPct}%</span>
              </div>
              <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: theme.track, transition: 'background 700ms ease' }}>
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${collPct}%` }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-gray-400">{data.totalStudents} students · {data.totalPending} pending</span>
                <span className="text-[10px] text-gray-400">{fmt(data.totalCollected)} / {fmt(data.totalAllotted)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Pending ─────────────────────────────────────────── */}
        {mode === 'Pending' && (
          <div className="flex flex-col min-h-0 flex-1">
            {/* Hero row */}
            <div className="flex items-center justify-between py-3 shrink-0">
              <div>
                <p className="text-3xl font-black text-rose-600 tabular-nums leading-none">{data.totalPending}</p>
                <p className="text-[10px] text-gray-400 mt-1">of {data.totalStudents} students with dues</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-rose-500 tabular-nums">{fmt(data.totalDues)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">outstanding</p>
              </div>
            </div>

            <div className="border-t shrink-0" style={{ borderColor: theme.divider, transition: 'border-color 700ms ease' }} />

            {/* By course */}
            <div className="shrink-0 pt-2.5 pb-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2">By Course</p>
              <div className="space-y-2.5">
                {COURSES.map((c) => {
                  const b = data.byCourse[c];
                  const p = b.total > 0 ? Math.round((b.pending / b.total) * 100) : 0;
                  return (
                    <div key={c} className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 w-10 shrink-0">
                        <span className={`w-2 h-2 rounded-full ${COURSE_DOT[c]}`} />
                        <span className="text-[10px] font-bold text-gray-600">{c}</span>
                      </div>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: theme.track, transition: 'background 700ms ease' }}>
                        <div className="h-full rounded-full bg-rose-400" style={{ width: `${p}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-rose-600 tabular-nums w-5 text-right">{b.pending}</span>
                      <span className="text-[10px] text-gray-400 w-10 text-right">{fmt(b.dues)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t shrink-0" style={{ borderColor: theme.divider, transition: 'border-color 700ms ease' }} />

            {/* By year */}
            <div className="flex-1 min-h-0 pt-2.5 overflow-hidden">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2">By Year</p>
              <div className="grid grid-cols-3 gap-2">
                {YEARS.map((y, i) => {
                  const b = data.byYear[y];
                  const label = ['text-lime-600', 'text-emerald-600', 'text-teal-600'];
                  const bg    = ['bg-lime-50 border-lime-100', 'bg-emerald-50 border-emerald-100', 'bg-teal-50 border-teal-100'];
                  return (
                    <div key={y} className={`rounded-xl border p-2.5 text-center ${bg[i]}`}>
                      <p className={`text-[9px] font-bold mb-1 ${label[i]}`}>{YR_SHORT[y]}</p>
                      <p className="text-[17px] font-black text-rose-600 tabular-nums leading-none">{b.pending}</p>
                      <p className="text-[9px] text-gray-400 mt-1">{fmt(b.dues)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
