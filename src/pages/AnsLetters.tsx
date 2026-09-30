import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useAllStudents } from '../hooks/useAllStudents';
import { isWPStudent } from '../utils/wpStudent';
import { useSettings } from '../hooks/useSettings';
import { updateAnsLetterStatus, deleteAnsLetterRecord } from '../services/ansLetterService';
import { exportAnsIssuedListPdf, exportAnsFilingSummaryPdf, type AnsRow } from '../utils/ansLetterPdf';
import { AnsLetterPreviewModal } from '../components/student/AnsLetterPreviewModal';
import { Input } from '../components/common/Input';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { ACADEMIC_YEARS } from '../types';
import type { AnsLetterStatus, Course, Student, Year } from '../types';

const DELETE_PASSKEY = 'lekhana@2015';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

const STATUS_OPTIONS: { value: AnsLetterStatus; label: string }[] = [
  { value: 'sent', label: 'Sent' },
  { value: 'visited', label: 'Parent Visited' },
  { value: 'resolved', label: 'Resolved' },
];

// ── Design tokens — student-portal look, amber / coral ──────────────────────
const AMBER = '#E08A00';
const AMBER_INK = '#9A5B00';
const CORAL = '#F97360';
const HAIRLINE = '#F6E3C4';
const FALLBACK_COLOR = '#8A93A3';
const STATUS_COLOR: Record<AnsLetterStatus, string> = {
  sent: '#E08A00',
  visited: '#0284C7',
  resolved: '#0FA968',
};
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

// Outline chip: white fill + tinted hairline and ink; solid colour when selected.
function chipStyle(color: string, selected: boolean): React.CSSProperties {
  return selected
    ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
    : { background: '#fff', borderColor: `${color}73`, color: inkOf(color) };
}

const OUTLINE_PILL_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#E08A00]/45 bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#9A5B00] hover:bg-[#E08A00]/[0.08] focus:outline-none focus:ring-2 focus:ring-[#E08A00]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const TH =
  'h-9 px-3 py-0 align-middle text-[9.5px] font-medium uppercase tracking-[0.6px] whitespace-nowrap bg-[#FDF1DC] border-b border-[#F3D9A8] text-[#9A5B00]';
const DATE_INPUT =
  'rounded-full border border-[#E08A00]/40 bg-[#FFFAF2] px-2.5 py-[5px] text-[12px] font-medium text-[#9A5B00] focus:outline-none focus:bg-white focus:border-[#E08A00] focus:ring-2 focus:ring-[#E08A00]/20 transition-all duration-150';

/** Department ring monogram — pastel gradient in the department's hue with a thin ring. */
function RingAvatar({ name, course, size = 22 }: { name: string; course: string; size?: number }) {
  const h = DEPT_HUE[course] ?? 30;
  const ring = DEPT_DOT[course] ?? FALLBACK_COLOR;
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0 font-medium tracking-[0.3px]"
      style={{
        width: size, height: size, fontSize: size * 0.43,
        background: `linear-gradient(135deg, hsl(${h - 6} 85% 88%), hsl(${h + 8} 85% 74%))`,
        color: `hsl(${h} 70% 22%)`,
        boxShadow: `0 0 0 1px #fff, 0 0 0 2px ${ring}80`,
      }}
      title={course}
    >
      {name.charAt(0)}
    </span>
  );
}

/** Compact thin-line pill: accent-tinted fill, border and ink text. */
function LinePill({ value, color, minWidth }: { value?: string | null; color?: string; minWidth?: number }) {
  if (!value) return <span className="text-[#C4C8D0] text-[10px]">—</span>;
  const c = color ?? FALLBACK_COLOR;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border px-[7px] py-[4.5px] text-[10.5px] font-medium leading-none whitespace-nowrap"
      style={{ background: `${c}14`, borderColor: `${c}73`, color: inkOf(c), minWidth }}
    >
      {value}
    </span>
  );
}

function EmptyState({ title, tone = 'muted' }: { title: React.ReactNode; tone?: 'muted' | 'warn' }) {
  const c = tone === 'warn' ? CORAL : AMBER;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-center px-6" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <div className="w-14 h-14 rounded-2xl border flex items-center justify-center" style={{ borderColor: `${c}33`, background: `${c}0D`, color: c }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"/><polyline points="22 6 12 13 2 6"/>
        </svg>
      </div>
      <p className="text-[14px] font-medium max-w-md" style={{ color: '#5B6371' }}>{title}</p>
    </div>
  );
}

function AnimNum({ value }: { value: number }) {
  return (
    <span key={value} className="font-medium tabular-nums" style={{ display: 'inline-block', animation: 'stat-pop 0.28s ease-out' }}>
      {value}
    </span>
  );
}

/** Sent → Visited → Resolved progress pill: dots fill up to the current status. */
function StatusStepper({ status }: { status: AnsLetterStatus }) {
  const idx = STATUS_OPTIONS.findIndex((o) => o.value === status);
  const c = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-[4.5px] text-[10.5px] font-medium leading-none whitespace-nowrap"
      style={{ background: `${c}14`, borderColor: `${c}73`, color: inkOf(c) }}
    >
      <span className="inline-flex items-center gap-[3px]">
        {STATUS_OPTIONS.map((o, i) => (
          <span
            key={o.value}
            className="w-[6px] h-[6px] rounded-full"
            style={i <= idx ? { background: c } : { background: 'transparent', boxShadow: `inset 0 0 0 1px ${c}80` }}
          />
        ))}
      </span>
      {STATUS_OPTIONS[idx]?.label}
    </span>
  );
}

const NEXT_STATUS: Record<AnsLetterStatus, AnsLetterStatus | null> = {
  sent: 'visited',
  visited: 'resolved',
  resolved: null,
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function AnsLetters() {
  const { students: allStudents, loading } = useAllStudents();
  const { settings } = useSettings();
  const currentAcademicYear = settings?.currentAcademicYear ?? null;
  const [tab, setTab] = useState<'generate' | 'review'>('generate');

  // ── All ANS letter rows, flattened from every student's ansHistory ─────────
  const allRows = useMemo((): AnsRow[] => {
    const rows: AnsRow[] = [];
    for (const s of allStudents) {
      for (const rec of s.ansHistory ?? []) {
        rows.push({
          studentId: s.id,
          studentName: s.studentNameSSLC,
          regNumber: s.regNumber ?? '',
          fatherName: s.fatherName,
          course: s.course,
          year: s.year,
          academicYear: s.academicYear,
          recordId: rec.id,
          issuedAt: rec.issuedAt,
          issuedBy: rec.issuedBy,
          status: rec.status,
        });
      }
    }
    return rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }, [allStudents]);

  // ── Generate tab ─────────────────────────────────────────────────────────────
  // ANS letters are strictly for CONFIRMED students of the current academic year —
  // search results only show eligible students; anything else surfaces a warning
  // instead of the print preview.
  const [genSearch, setGenSearch] = useState('');
  const [letterStudent, setLetterStudent] = useState<Student | null>(null);
  const [ineligibleWarning, setIneligibleWarning] = useState<Student | null>(null);

  function isEligibleForAns(s: Student): boolean {
    return s.admissionStatus === 'CONFIRMED' && !isWPStudent(s) && s.academicYear === currentAcademicYear;
  }

  const rawGenMatches = useMemo(() => {
    const q = genSearch.trim().toUpperCase();
    if (!q) return [];
    return allStudents.filter((s) =>
      s.studentNameSSLC?.toUpperCase().includes(q) ||
      s.regNumber?.toUpperCase().includes(q) ||
      s.studentMobile?.includes(q) ||
      s.fatherMobile?.includes(q));
  }, [allStudents, genSearch]);

  const genMatches = useMemo(
    () => rawGenMatches.filter(isEligibleForAns).slice(0, 25),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawGenMatches, currentAcademicYear],
  );

  const excludedCount = rawGenMatches.length - genMatches.length;

  function handleSelectForGenerate(s: Student) {
    if (isEligibleForAns(s)) {
      setLetterStudent(s);
    } else {
      setIneligibleWarning(s);
    }
  }

  // ── Review tab filters ───────────────────────────────────────────────────────
  const [academicYearFilter, setAcademicYearFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [summaryDate, setSummaryDate] = useState(todayKey());

  // ── Row context menu (right-click) + delete confirmation ────────────────────
  const [rowContextMenu, setRowContextMenu] = useState<{ x: number; y: number; row: AnsRow } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnsRow | null>(null);
  const [deletePasskey, setDeletePasskey] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (!rowContextMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setRowContextMenu(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowContextMenu]);

  function handleRowContextMenu(e: React.MouseEvent, row: AnsRow) {
    e.preventDefault();
    setRowContextMenu({ x: e.clientX, y: e.clientY, row });
  }

  function openDeleteConfirm(row: AnsRow) {
    setRowContextMenu(null);
    setDeleteTarget(row);
    setDeletePasskey('');
    setDeleteError('');
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    if (deletePasskey !== DELETE_PASSKEY) {
      setDeleteError('Incorrect passkey.');
      return;
    }
    setDeleting(true);
    try {
      await deleteAnsLetterRecord(deleteTarget.studentId, deleteTarget.recordId);
      setDeleteTarget(null);
    } catch {
      setDeleteError('Failed to delete. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const filteredRows = useMemo(() => {
    let rows = allRows;
    if (academicYearFilter) rows = rows.filter((r) => r.academicYear === academicYearFilter);
    if (courseFilter)       rows = rows.filter((r) => r.course === courseFilter);
    if (yearFilter)         rows = rows.filter((r) => r.year === yearFilter);
    if (statusFilter)       rows = rows.filter((r) => r.status === statusFilter);
    if (dateFrom)            rows = rows.filter((r) => r.issuedAt.slice(0, 10) >= dateFrom);
    if (dateTo)              rows = rows.filter((r) => r.issuedAt.slice(0, 10) <= dateTo);
    if (debouncedSearch) {
      const q = debouncedSearch.trim().toUpperCase();
      rows = rows.filter((r) => r.studentName.toUpperCase().includes(q) || r.regNumber.toUpperCase().includes(q));
    }
    return rows;
  }, [allRows, academicYearFilter, courseFilter, yearFilter, statusFilter, dateFrom, dateTo, debouncedSearch]);

  const stats = useMemo(() => {
    const byStatus: Record<AnsLetterStatus, number> = { sent: 0, visited: 0, resolved: 0 };
    const byCourse: Record<string, number> = {};
    for (const r of allRows) {
      byStatus[r.status]++;
      byCourse[r.course] = (byCourse[r.course] ?? 0) + 1;
    }
    return { total: allRows.length, byStatus, byCourse };
  }, [allRows]);

  async function handleAdvanceStatus(row: AnsRow) {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    setUpdatingId(row.recordId);
    try {
      await updateAnsLetterStatus(row.studentId, row.recordId, next);
    } finally {
      setUpdatingId(null);
    }
  }

  function clearFilters() {
    setAcademicYearFilter(''); setCourseFilter(''); setYearFilter('');
    setStatusFilter(''); setSearchTerm(''); setDateFrom(''); setDateTo('');
  }

  const hasActiveFilters = !!searchTerm || !!academicYearFilter || !!courseFilter || !!yearFilter || !!statusFilter || !!dateFrom || !!dateTo;

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const TAB_BTN = 'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-[7px] text-[12px] font-medium transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E08A00]/30';
  const tabStyle = (active: boolean): React.CSSProperties => active
    ? { background: `linear-gradient(135deg, ${AMBER}, ${AMBER_INK})`, borderColor: AMBER, color: '#fff', boxShadow: `0 3px 10px ${AMBER}40` }
    : { background: '#fff', borderColor: `${AMBER}66`, color: AMBER_INK };

  return (
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: 'linear-gradient(160deg, #FFFAF2 0%, #FFFDF9 45%, #FEF5E7 100%)', animation: 'page-enter 0.22s ease-out' }}
    >
      {/* ── Page header ── */}
      <div className="flex-shrink-0 flex items-center gap-4 min-w-0">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">SMP Admissions · ANS Letters</p>
          <h2 className="mt-1.5 text-[22px] font-bold leading-none tracking-[-0.3px]" style={{ color: AMBER_INK }}>ANS Letters</h2>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={() => setTab('generate')} className={TAB_BTN} style={tabStyle(tab === 'generate')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Generate
          </button>
          <button onClick={() => setTab('review')} className={TAB_BTN} style={tabStyle(tab === 'review')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            Review
            {stats.total > 0 && (
              <span className="rounded-full px-1.5 py-px text-[10px] leading-tight" style={tab === 'review' ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: '#FDF1DC', color: AMBER_INK }}>
                {stats.total}
              </span>
            )}
          </button>
        </div>
      </div>

      {tab === 'generate' ? (
        <div className="flex-1 min-h-0 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* Search card */}
          <div className="min-h-0 bg-white rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: HAIRLINE }}>
            <div className="shrink-0 px-4 pt-4 pb-3 space-y-3 border-b" style={{ borderColor: '#FBEFD9' }}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[12.5px] font-medium text-[#262B35]">Find a student to generate an ANS Intimation Letter</span>
                <span className="w-1 h-1 rounded-full bg-[#F3D9A8] mx-0.5" />
                <LinePill value="Confirmed only" color="#0FA968" />
                {currentAcademicYear && <LinePill value={currentAcademicYear} color={AMBER} />}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: AMBER_INK }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search name / reg no / mobile…"
                    value={genSearch}
                    onChange={(e) => setGenSearch(e.target.value)}
                    className="w-full rounded-full border border-[#E08A00]/40 bg-[#FFFAF2] py-2.5 text-[14px] font-medium text-[#9A5B00] placeholder:text-[#9A5B00]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#E08A00] focus:ring-2 focus:ring-[#E08A00]/20 transition-all duration-150 pl-9 pr-3"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setGenSearch('')}
                  disabled={!genSearch}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F97360]/10 px-3 py-2 text-[11.5px] font-medium text-[#E2533F] hover:bg-[#F97360]/[0.16] focus:outline-none focus:ring-2 focus:ring-[#F97360]/30 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default"
                  aria-label="Clear search"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Clear
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 flex flex-col">
              {loading ? (
                <EmptyState title="Loading students…" />
              ) : !genSearch.trim() ? (
                <EmptyState title="Start typing to search students." />
              ) : genMatches.length === 0 ? (
                <EmptyState
                  tone={excludedCount > 0 ? 'warn' : 'muted'}
                  title={excludedCount > 0 ? (
                    <>
                      {excludedCount} matching student{excludedCount !== 1 ? 's' : ''} found, but not shown — ANS letters can only be
                      generated for confirmed students of {currentAcademicYear ?? 'the current academic year'}.
                    </>
                  ) : 'No matching students.'}
                />
              ) : (
                <>
                  {genMatches.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectForGenerate(s)}
                      className="group w-full text-left rounded-xl border bg-white hover:bg-[#FFFAF2] hover:border-[#E08A00]/45 px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-colors"
                      style={{ borderColor: HAIRLINE }}
                    >
                      <RingAvatar name={s.studentNameSSLC} course={s.course} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium truncate" style={{ color: AMBER_INK }}>{s.studentNameSSLC}</span>
                        <span className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-medium text-[#8A93A3] tabular-nums">{s.regNumber || '—'}</span>
                          <LinePill value={s.course} color={DEPT_DOT[s.course]} minWidth={30} />
                          <LinePill value={s.year} color={YEAR_COLOR[s.year]} />
                          <LinePill value={s.academicYear} color={FALLBACK_COLOR} />
                        </span>
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-[7px] border border-[#E08A00]/45 bg-white group-hover:bg-[#E08A00]/[0.08] px-2.5 py-[6px] text-[11px] font-medium leading-none" style={{ color: AMBER_INK }}>
                        Generate
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      </span>
                    </button>
                  ))}
                  {excludedCount > 0 && (
                    <p className="text-[11px] font-medium rounded-lg border px-3 py-2 mt-1" style={{ color: '#B8402F', background: '#FEF1EE', borderColor: '#FBD5CD' }}>
                      {excludedCount} more matching student{excludedCount !== 1 ? 's' : ''} hidden — not confirmed or not enrolled in {currentAcademicYear ?? 'the current academic year'}.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* How it works */}
          <div className="hidden lg:flex flex-col gap-3 bg-white rounded-2xl border p-4 self-start" style={{ borderColor: HAIRLINE }}>
            <p className="text-[9.5px] font-medium uppercase tracking-[0.6px]" style={{ color: AMBER_INK }}>How it works</p>
            {[
              { n: 1, t: 'Search', d: 'Find a confirmed student by name, reg no or mobile.' },
              { n: 2, t: 'Preview & print', d: 'Check the A4 intimation letter, then print it.' },
              { n: 3, t: 'Track in Review', d: 'Every printed letter is recorded and can be moved Sent → Parent Visited → Resolved.' },
            ].map((step) => (
              <div key={step.n} className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-[11px] font-medium" style={{ background: '#FDF1DC', borderColor: `${AMBER}66`, color: AMBER_INK }}>{step.n}</span>
                <span>
                  <span className="block text-[12.5px] font-medium text-[#262B35]">{step.t}</span>
                  <span className="block text-[11.5px] text-[#8A93A3] leading-snug">{step.d}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Status tiles + course chips */}
          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter('')}
              className="flex flex-col items-start justify-center rounded-xl border px-3.5 py-1.5 min-w-[84px] cursor-pointer transition-all active:scale-[0.98]"
              style={!statusFilter ? { background: '#FDF1DC', borderColor: `${AMBER}66` } : { background: '#fff', borderColor: HAIRLINE }}
            >
              <span className="text-[9px] font-medium uppercase tracking-[0.5px] text-[#8A93A3] leading-tight">Total</span>
              <span className="text-[18px] font-medium leading-tight" style={{ color: AMBER_INK }}><AnimNum value={stats.total} /></span>
            </button>
            {STATUS_OPTIONS.map((o) => {
              const c = STATUS_COLOR[o.value];
              const selected = statusFilter === o.value;
              const dimmed = !!statusFilter && !selected;
              return (
                <button
                  key={o.value}
                  onClick={() => setStatusFilter(selected ? '' : o.value)}
                  className={`flex flex-col items-start justify-center rounded-xl border px-3.5 py-1.5 min-w-[104px] cursor-pointer transition-all active:scale-[0.98] hover:brightness-[0.97] ${dimmed ? 'opacity-55 hover:opacity-100' : ''}`}
                  style={selected ? { background: c, borderColor: c, boxShadow: `0 3px 10px ${c}40` } : { background: `${c}12`, borderColor: `${c}59` }}
                >
                  <span className="inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.5px] leading-tight" style={{ color: selected ? '#fff' : inkOf(c) }}>
                    {!selected && <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />}
                    {o.label}
                  </span>
                  <span className="text-[18px] font-medium leading-tight" style={{ color: selected ? '#fff' : inkOf(c) }}><AnimNum value={stats.byStatus[o.value]} /></span>
                </button>
              );
            })}

            <span className="w-px h-8 bg-[#F3D9A8] mx-1 self-center" />

            {COURSES.map((c) => {
              const count = stats.byCourse[c] ?? 0;
              const selected = courseFilter === c;
              const dimmed = (!!courseFilter && !selected) || count === 0;
              return (
                <button
                  key={c}
                  onClick={() => setCourseFilter(selected ? '' : c)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${dimmed && !selected ? 'opacity-[0.5] hover:opacity-100' : ''}`}
                  style={chipStyle(DEPT_DOT[c], selected)}
                >
                  {!selected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DEPT_DOT[c] }} />}
                  <span>{c}</span>
                  <AnimNum value={count} />
                </button>
              );
            })}
          </div>

          {/* Toolbar card — search, filters, exports */}
          <div className="shrink-0 rounded-2xl border bg-white overflow-hidden" style={{ borderColor: HAIRLINE }}>
            <div className="flex items-center gap-2 px-2.5 py-2 flex-wrap">
              <div className="relative shrink-0 w-48">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: AMBER_INK }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search name / reg no…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full rounded-full border border-[#E08A00]/40 bg-[#FFFAF2] py-2 text-[14px] font-medium text-[#9A5B00] placeholder:text-[#9A5B00]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#E08A00] focus:ring-2 focus:ring-[#E08A00]/20 transition-all duration-150 pl-9 pr-3`}
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                disabled={!searchTerm}
                className="shrink-0 -ml-0.5 inline-flex items-center gap-1 rounded-full bg-[#F97360]/10 px-2.5 py-1.5 text-[11px] font-medium text-[#E2533F] hover:bg-[#F97360]/[0.16] focus:outline-none focus:ring-2 focus:ring-[#F97360]/30 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default"
                aria-label="Clear search"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Clear
              </button>

              <FilterDropdown<string> color="amber" value={academicYearFilter} onChange={setAcademicYearFilter} placeholder="Academic Year"
                options={ACADEMIC_YEARS.map((y) => ({ value: y, label: y }))} />
              <FilterDropdown<string> color="amber" value={courseFilter} onChange={setCourseFilter} placeholder="Course"
                options={COURSES.map((c) => ({ value: c, label: c }))} />
              <FilterDropdown<string> color="amber" value={yearFilter} onChange={setYearFilter} placeholder="Year"
                options={YEARS.map((y) => ({ value: y, label: y }))} />
              <FilterDropdown<string> color="amber" value={statusFilter} onChange={setStatusFilter} placeholder="Status"
                options={STATUS_OPTIONS} />

              <span className="w-px h-5 bg-[#F3D9A8] shrink-0" />
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8A93A3]">
                From
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={DATE_INPUT} />
              </label>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8A93A3]">
                To
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={DATE_INPUT} />
              </label>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F97360]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#E2533F] hover:bg-[#F97360]/[0.16] focus:outline-none focus:ring-2 focus:ring-[#F97360]/30 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Clear
                </button>
              )}

              <button
                onClick={() => exportAnsIssuedListPdf(filteredRows, { academicYearFilter, courseFilter, yearFilter, statusFilter, searchTerm: debouncedSearch })}
                disabled={filteredRows.length === 0}
                className={`${OUTLINE_PILL_BTN} ml-auto`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export List PDF
              </button>
            </div>

            {/* Filing summary row */}
            <div className="flex items-center gap-2.5 flex-wrap px-3 py-2 border-t" style={{ background: '#FFF9EF', borderColor: '#FBEFD9' }}>
              <span className="text-[11.5px] font-medium" style={{ color: AMBER_INK }}>Filing Summary for</span>
              <input type="date" value={summaryDate} onChange={(e) => setSummaryDate(e.target.value)} className={DATE_INPUT} />
              <button onClick={() => exportAnsFilingSummaryPdf(filteredRows, summaryDate)} className={OUTLINE_PILL_BTN}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Filing Summary PDF
              </button>
              <span className="text-[11px] text-[#8A93A3]">
                Datewise · coursewise list with counts, for HOD &amp; Principal attestation. Honors the filters above.
              </span>
            </div>
          </div>

          {/* Table card */}
          {loading ? (
            <EmptyState title="Loading…" />
          ) : filteredRows.length === 0 ? (
            <EmptyState title="No ANS letters found." />
          ) : (
            <div className="flex-1 min-h-0 bg-white rounded-2xl border overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(154,91,0,0.06)]" style={{ borderColor: HAIRLINE }}>
              <div className="scroll-anns flex-1 min-h-0 overflow-auto">
                <table className="w-full text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className={`${TH} text-left w-10`}>Sl</th>
                      <th className={`${TH} text-left`}>Student</th>
                      <th className={`${TH} text-left`}>Course / Year</th>
                      <th className={`${TH} text-left`}>Academic Year</th>
                      <th className={`${TH} text-left`}>Reg No</th>
                      <th className={`${TH} text-left`}>Date Issued</th>
                      <th className={`${TH} text-left`}>Status</th>
                      <th className={`${TH} text-left`}>Action</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-t-[#FBEFD9]">
                    {filteredRows.map((r, i) => {
                      const next = NEXT_STATUS[r.status];
                      return (
                        <tr
                          key={r.recordId}
                          className={`hover:bg-[#FFFAF2] transition-colors ${rowContextMenu?.row.recordId === r.recordId ? 'row-ctx-active-amber' : ''}`}
                          onContextMenu={(e) => handleRowContextMenu(e, r)}
                        >
                          <td className="px-3 py-2 text-[11px] font-medium text-[#8A93A3] tabular-nums whitespace-nowrap">{i + 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <RingAvatar name={r.studentName} course={r.course} />
                              <span className="text-[12.5px] font-medium" style={{ color: AMBER_INK }}>{r.studentName}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              <LinePill value={r.course} color={DEPT_DOT[r.course]} minWidth={34} />
                              <LinePill value={r.year} color={YEAR_COLOR[r.year]} minWidth={66} />
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[11.5px] font-medium text-[#4B5068] whitespace-nowrap">{r.academicYear}</td>
                          <td className="px-3 py-2 text-[11.5px] font-medium text-black tabular-nums whitespace-nowrap">{r.regNumber || '—'}</td>
                          <td className="px-3 py-2 text-[11.5px] font-medium text-[#4B5068] whitespace-nowrap">{fmtDate(r.issuedAt)}</td>
                          <td className="px-3 py-2 whitespace-nowrap"><StatusStepper status={r.status} /></td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {next ? (
                              <button
                                disabled={updatingId === r.recordId}
                                onClick={() => void handleAdvanceStatus(r)}
                                className="inline-flex items-center justify-center gap-1 rounded-[7px] border bg-white px-2.5 py-[6px] text-[11px] font-medium leading-none transition-[background-color,box-shadow] duration-150 hover:shadow-[0_2px_8px_rgba(18,20,26,0.06)] cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E08A00]/30"
                                style={{ borderColor: `${STATUS_COLOR[next]}73`, color: inkOf(STATUS_COLOR[next]) }}
                              >
                                Mark {STATUS_OPTIONS.find((o) => o.value === next)?.label}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                              </button>
                            ) : (
                              <span className="text-[#C4C8D0] text-[11px]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex-shrink-0 px-4 py-2 border-t bg-[#FFF9EF] text-[11px] font-medium text-[#8A93A3]" style={{ borderColor: '#F3D9A8' }}>
                Showing <span className="text-[#262B35] tabular-nums">{filteredRows.length}</span> of <span className="text-[#262B35] tabular-nums">{stats.total}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {letterStudent && (
        <AnsLetterPreviewModal student={letterStudent} onClose={() => setLetterStudent(null)} />
      )}

      {/* Ineligible-student warning — ANS letters are confirmed-students-only, current academic year only */}
      {ineligibleWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center font-wp">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIneligibleWarning(null)} aria-hidden="true" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-3 border" style={{ borderColor: HAIRLINE, animation: 'modal-enter 0.22s ease-out' }}>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border shrink-0" style={{ background: '#FEF5E4', borderColor: `${AMBER}40`, color: AMBER }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </span>
              <h3 className="text-[14px] font-bold" style={{ color: AMBER_INK }}>Cannot Generate ANS Letter</h3>
            </div>
            <p className="text-[13px] text-[#4B5068]">
              You cannot generate the ANS letter for <span className="font-medium text-[#262B35]">{ineligibleWarning.studentNameSSLC}</span> as
              {ineligibleWarning.admissionStatus !== 'CONFIRMED'
                ? ' this student is not confirmed.'
                : ` he/she is not studying in ${currentAcademicYear ?? 'the current academic year'} (enrolled in ${ineligibleWarning.academicYear}).`}
            </p>
            <div className="flex justify-end pt-1">
              <button onClick={() => setIneligibleWarning(null)} className={OUTLINE_PILL_BTN}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Row right-click context menu */}
      {rowContextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setRowContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setRowContextMenu(null); }}
          />
          <div
            ref={contextMenuRef}
            className="font-wp fixed z-50 w-52 rounded-2xl border bg-white py-1.5"
            style={{ left: rowContextMenu.x, top: rowContextMenu.y, borderColor: HAIRLINE, boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="px-3 py-1.5 border-b flex items-center gap-2" style={{ borderColor: '#FBEFD9' }}>
              <RingAvatar name={rowContextMenu.row.studentName} course={rowContextMenu.row.course} size={24} />
              <span className="min-w-0">
                <span className="text-[11.5px] font-medium truncate block" style={{ color: AMBER_INK }}>{rowContextMenu.row.studentName}</span>
                <span className="text-[10px] text-[#8A93A3]">{rowContextMenu.row.course} · {rowContextMenu.row.year}</span>
              </span>
            </div>
            <button
              className="group w-full text-left px-3 py-[6px] text-[12px] font-medium text-[#E2533F] hover:bg-[#F97360]/10 flex items-center gap-2 transition-colors duration-100 cursor-pointer"
              onClick={() => openDeleteConfirm(rowContextMenu.row)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              Delete Record…
            </button>
          </div>
        </>
      )}

      {/* Delete confirmation — requires passkey */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center font-wp">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setDeleteTarget(null)} aria-hidden="true" />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4 border" style={{ borderColor: HAIRLINE, animation: 'modal-enter 0.22s ease-out' }}>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border shrink-0" style={{ background: '#FEF1EE', borderColor: `${CORAL}40`, color: '#E2533F' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </span>
              <h3 className="text-[14px] font-bold" style={{ color: AMBER_INK }}>Delete ANS Letter Record</h3>
            </div>
            <p className="text-[13px] text-[#4B5068]">
              Remove the ANS letter record for <span className="font-medium text-[#262B35]">{deleteTarget.studentName}</span> ({deleteTarget.course} · {deleteTarget.year}), issued{' '}
              {fmtDate(deleteTarget.issuedAt)}? This only clears the record — it does not undo the printed letter. This cannot be undone.
            </p>
            <Input
              type="password"
              label="Enter passkey to confirm"
              value={deletePasskey}
              onChange={(e) => { setDeletePasskey(e.target.value); setDeleteError(''); }}
              placeholder="Passkey"
              autoFocus
              error={deleteError}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className={OUTLINE_PILL_BTN}>
                Cancel
              </button>
              <button
                onClick={() => void handleConfirmDelete()}
                disabled={deleting || !deletePasskey}
                className="inline-flex items-center rounded-full px-4 py-1.5 text-[11.5px] font-medium text-white hover:brightness-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-[filter]"
                style={{ background: `linear-gradient(135deg, ${CORAL}, #E2533F)`, boxShadow: `0 3px 10px ${CORAL}40` }}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
