import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResults } from '../hooks/useResults';
import { useAuth } from '../contexts/AuthContext';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { ResultColumnPickerDropdown } from '../components/common/ResultColumnPickerDropdown';
import { ResultDetailModal } from '../components/results/ResultDetailModal';
import { RESULT_COLUMNS, DEFAULT_RESULT_COLUMNS, formatResultColumnValue, type ResultColumnKey } from '../utils/resultColumns';
import { mergeStudentResults } from '../utils/resultMerge';
import { PageSpinner } from '../components/common/PageSpinner';
import type { ExamResult, Course, Year } from '../types';

const PAGE_SIZE = 100;
const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const RESULT_OPTIONS = ['First Class', 'Second Class', 'Distinction', 'FAILS'];
const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

// ── Design tokens — student-portal look, plum / berry ───────────────────────
const PLUM = '#9333EA';
const PLUM_INK = '#6B21A8';
const FALLBACK_COLOR = '#8A93A3';
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};
/** Outcome colour for an overall result (used by chips, pills and the detail modal). */
function resultOutcomeColor(result: string): string {
  if (result === 'Distinction') return '#0FA968';
  if (result === 'First Class') return '#0284C7';
  if (result === 'Second Class') return '#D97706';
  if (result === 'FAILS' || result === 'FAIL') return '#E11D48';
  if (result === 'AB') return '#D97706';
  return FALLBACK_COLOR;
}
// Outcome chips in the header (label shown → the Result filter value it sets).
const OUTCOME_CHIPS: { value: string; label: string }[] = [
  { value: 'Distinction', label: 'Distinction' },
  { value: 'First Class', label: 'First Class' },
  { value: 'Second Class', label: 'Second Class' },
  { value: 'FAILS', label: 'Fails' },
];
// Columns rendered as black tabular figures.
const NUMERIC_KEYS = new Set<string>(['regNumber', 'cgpa', 'percentageConversion', 'creditsEarnedCumulative', 'collegeCode']);

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

// Outline chip: white fill + tinted hairline and ink; solid colour when selected.
function chipStyle(color: string, selected: boolean): React.CSSProperties {
  return selected
    ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
    : { background: '#fff', borderColor: `${color}73`, color: inkOf(color) };
}

const OUTLINE_PILL_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#E9D8F7] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] hover:border-[#9333EA]/40 hover:bg-[#9333EA]/[0.06] hover:text-[#6B21A8] focus:outline-none focus:ring-2 focus:ring-[#9333EA]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const CHIP_ARROW =
  'shrink-0 w-6 h-6 rounded-full border border-[#9333EA]/40 bg-white text-[#6B21A8] flex items-center justify-center shadow-[0_1px_4px_rgba(18,20,26,0.06)] enabled:hover:bg-[#F6EEFD] enabled:cursor-pointer disabled:opacity-35 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9333EA]/30 transition-[opacity,background-color]';
// Header band colours are mirrored in index.css (.scroll-results) for the scrollbar gutter.
const TH =
  'h-9 px-3 py-0 align-middle text-[9.5px] font-medium uppercase tracking-[0.6px] whitespace-nowrap bg-[#F2E8FC] border-b border-[#DDC7F3] text-[#6B21A8]';

/** Department ring monogram — pastel gradient in the department's hue with a thin ring. */
function RingAvatar({ name, course }: { name: string; course: string }) {
  const h = DEPT_HUE[course] ?? 275;
  const ring = DEPT_DOT[course] ?? FALLBACK_COLOR;
  return (
    <span
      className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 text-[9.5px] font-medium tracking-[0.3px]"
      style={{
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

function EmptyState({ title, tone = 'muted' }: { title: string; tone?: 'muted' | 'error' }) {
  const isError = tone === 'error';
  const c = isError ? '#E11D48' : PLUM;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 text-center px-6" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <div className="w-14 h-14 rounded-2xl border flex items-center justify-center" style={{ borderColor: `${c}33`, background: `${c}0D`, color: c }}>
        {isError ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13.5L17 22l-5-3-5 3 1.5-8.5"/></svg>
        )}
      </div>
      <p className="text-[14px] font-medium max-w-md" style={{ color: isError ? inkOf(c) : '#5B6371' }}>{title}</p>
    </div>
  );
}

function AnimNum({ value }: { value: number }) {
  return (
    <span
      key={value}
      className="font-medium tabular-nums"
      style={{ display: 'inline-block', animation: 'stat-pop 0.28s ease-out' }}
    >
      {value}
    </span>
  );
}

export function Results() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { results: rawResults, loading, error } = useResults();
  const results = useMemo(() => mergeStudentResults(rawResults), [rawResults]);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [examSessionFilter, setExamSessionFilter] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedColumns, setSelectedColumns] = useState<Set<ResultColumnKey>>(
    new Set(DEFAULT_RESULT_COLUMNS)
  );
  const [detailResult, setDetailResult] = useState<ExamResult | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const examSessionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) if (r.examSession) set.add(r.examSession);
    return Array.from(set).sort();
  }, [results]);

  const filteredResults = useMemo(() => {
    let out = results;
    if (courseFilter) out = out.filter((r) => r.course === courseFilter);
    if (yearFilter) out = out.filter((r) => r.year === yearFilter);
    if (examSessionFilter) out = out.filter((r) => r.examSession === examSessionFilter);
    if (resultFilter) out = out.filter((r) => r.overallResult === resultFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.trim().toUpperCase();
      out = out.filter(
        (r) => r.regNumber.toUpperCase().includes(q) || r.studentName.toUpperCase().includes(q)
      );
    }
    return out.slice().sort((a, b) => (
      a.course.localeCompare(b.course) ||
      a.year.localeCompare(b.year) ||
      a.studentName.localeCompare(b.studentName)
    ));
  }, [results, courseFilter, yearFilter, examSessionFilter, resultFilter, debouncedSearch]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredResults]);

  const visibleResults = useMemo(
    () => filteredResults.slice(0, visibleCount),
    [filteredResults, visibleCount]
  );
  const hasMore = visibleCount < filteredResults.length;

  const stats = useMemo(() => {
    const courseCount: Record<string, number> = {};
    for (const r of results) courseCount[r.course] = (courseCount[r.course] ?? 0) + 1;
    // Outcome counts for the header result chips.
    const resultCount: Record<string, number> = {};
    for (const r of results) resultCount[r.overallResult] = (resultCount[r.overallResult] ?? 0) + 1;
    return { courseCount, resultCount, total: results.length };
  }, [results]);

  const hasActiveFilters = !!searchTerm || !!courseFilter || !!yearFilter || !!examSessionFilter || !!resultFilter;

  function clearFilters() {
    setSearchTerm('');
    setDebouncedSearch('');
    setCourseFilter('');
    setYearFilter('');
    setExamSessionFilter('');
    setResultFilter('');
  }

  const columns = RESULT_COLUMNS.filter((c) => selectedColumns.has(c.key));

  // Header chip strip: single line between two always-visible arrow buttons;
  // each arrow dims when there is nothing more to see on its side.
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [chipOverflow, setChipOverflow] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const el = chipScrollRef.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setChipOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [loading, stats.total, hasActiveFilters]);

  // Animated by hand rather than scrollBy({ behavior: 'smooth' }), which some
  // browser setups ignore.
  const chipAnimRef = useRef(0);
  function scrollChips(dir: -1 | 1) {
    const el = chipScrollRef.current;
    if (!el) return;
    cancelAnimationFrame(chipAnimRef.current);
    const from = el.scrollLeft;
    const to = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, from + dir * Math.max(160, el.clientWidth * 0.6)));
    const start = performance.now();
    const DURATION = 260;
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / DURATION));
      el.scrollLeft = from + (to - from) * (1 - Math.pow(1 - t, 3));
      if (t < 1) chipAnimRef.current = requestAnimationFrame(step);
    };
    chipAnimRef.current = requestAnimationFrame(step);
  }

  if (loading) return <PageSpinner />;

  return (
    <>
      <div
        className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
        style={{ background: 'linear-gradient(160deg, #FAF6FE 0%, #FDFCFF 45%, #F6F0FD 100%)', animation: 'page-enter 0.22s ease-out' }}
      >

        {/* Page header + stats chips */}
        <div className="flex-shrink-0 flex items-center gap-4 min-w-0">
          <div className="shrink-0">
            <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
              SMP Admissions · Results
            </p>
            <h2 className="mt-1.5 text-[22px] font-bold text-[#6B21A8] leading-none tracking-[-0.3px]">Results</h2>
          </div>

          {stats.total > 0 && (
            <>
              <span className="w-px h-8 bg-[#E9D8F7] shrink-0 self-center" />
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {/* Total tile */}
                <div className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border border-[#9333EA]/20 bg-[#F4ECFD] px-3.5 py-1 min-w-[58px]">
                  <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] text-[#8E5BC0] leading-tight">Total</span>
                  <span className="text-[16px] font-medium text-[#6B21A8] leading-tight">
                    <AnimNum value={stats.total} />
                  </span>
                </div>

                {hasActiveFilters && (
                  <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#9333EA]/40 bg-white text-[#6B21A8] px-3 py-[6px] text-[11px] font-medium whitespace-nowrap">
                    <span>Filtered</span>
                    <AnimNum value={filteredResults.length} />
                  </div>
                )}

                <button type="button" onClick={() => scrollChips(-1)} disabled={!chipOverflow.left} className={`${CHIP_ARROW} ml-1`} aria-label="Scroll chips left">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div ref={chipScrollRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">
                  {/* Outcome chips — set the same Result filter as the dropdown */}
                  {OUTCOME_CHIPS.map(({ value, label }) => {
                    const count = stats.resultCount[value] ?? 0;
                    const isSelected = resultFilter === value;
                    const isDimmed = (!!resultFilter && !isSelected) || count === 0;
                    const color = resultOutcomeColor(value);
                    return (
                      <button
                        key={value}
                        onClick={() => setResultFilter(isSelected ? '' : value)}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                          isDimmed && !isSelected ? 'opacity-[0.5] hover:opacity-100' : ''
                        }`}
                        style={chipStyle(color, isSelected)}
                      >
                        {!isSelected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
                        <span>{label}</span>
                        <AnimNum value={count} />
                      </button>
                    );
                  })}

                  <span className="w-1 h-1 rounded-full bg-[#DCC4F2] shrink-0 mx-0.5" />

                  {/* Course chips */}
                  {COURSES.map((c) => {
                    const count = stats.courseCount[c] ?? 0;
                    const isSelected = courseFilter === c;
                    const isDimmed = (!!courseFilter && !isSelected) || count === 0;
                    return (
                      <button
                        key={c}
                        onClick={() => setCourseFilter(isSelected ? '' : c)}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                          isDimmed && !isSelected ? 'opacity-[0.5] hover:opacity-100' : ''
                        }`}
                        style={chipStyle(DEPT_DOT[c], isSelected)}
                      >
                        {!isSelected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DEPT_DOT[c] }} />}
                        <span>{c}</span>
                        <AnimNum value={count} />
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => scrollChips(1)} disabled={!chipOverflow.right} className={CHIP_ARROW} aria-label="Scroll chips right">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </>
          )}

          {isAdmin && (
            <button
              onClick={() => void navigate('/settings?tab=import-results')}
              className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium text-white hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9333EA]/40 focus-visible:ring-offset-2 cursor-pointer transition-[filter]"
              style={{ background: `linear-gradient(135deg, ${PLUM}, ${PLUM_INK})`, boxShadow: `0 3px 10px ${PLUM}40` }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import Results
            </button>
          )}
        </div>

        {/* Toolbar card — search + filters */}
        <div className="flex-shrink-0 rounded-2xl border border-[#E9D8F7] bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(59,7,100,0.05)]">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <div className="relative shrink-0 w-56">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6B21A8] pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Search reg no / name…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full rounded-full border border-[#9333EA]/40 bg-[#FAF5FE] py-2 text-[14px] font-medium text-[#6B21A8] placeholder:text-[#6B21A8]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#9333EA] focus:ring-2 focus:ring-[#9333EA]/20 transition-all duration-150 pl-9 ${searchTerm ? 'pr-8' : 'pr-3'}`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#D97706]/10 hover:bg-[#D97706]/20 text-[#D97706] transition-colors duration-150 shrink-0"
                  aria-label="Clear search"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-px py-0.5 min-w-0">
              <FilterDropdown<Course | ''>
                color="plum"
                value={courseFilter}
                onChange={(v) => setCourseFilter(v as Course | '')}
                placeholder="Course"
                options={COURSES.map((c) => ({ value: c, label: c }))}
              />
              <FilterDropdown<Year | ''>
                color="plum"
                value={yearFilter}
                onChange={(v) => setYearFilter(v as Year | '')}
                placeholder="Year"
                options={YEARS.map((y) => ({ value: y, label: y }))}
              />
              <FilterDropdown<string>
                color="plum"
                value={examSessionFilter}
                onChange={setExamSessionFilter}
                placeholder="Exam Session"
                options={examSessionOptions.map((s) => ({ value: s, label: s }))}
              />
              <FilterDropdown<string>
                color="plum"
                value={resultFilter}
                onChange={setResultFilter}
                placeholder="Result"
                options={RESULT_OPTIONS.map((r) => ({ value: r, label: r }))}
              />
            </div>

            {hasActiveFilters && (
              <>
                <span className="w-px h-5 bg-[#E9D8F7] shrink-0" />
                <button
                  onClick={clearFilters}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#D97706]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#D97706] hover:bg-[#D97706]/[0.16] focus:outline-none focus:ring-2 focus:ring-[#D97706]/30 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  Clear
                </button>
              </>
            )}

            <div className="ml-auto shrink-0">
              <ResultColumnPickerDropdown
                color="plum"
                columns={RESULT_COLUMNS}
                selected={selectedColumns}
                onChange={setSelectedColumns}
              />
            </div>
          </div>
        </div>

        {/* Table area */}
        {error ? (
          <EmptyState tone="error" title={error} />
        ) : results.length === 0 ? (
          <EmptyState title="No results imported yet. Admins can import a Result Ledger PDF from Settings → Import Results." />
        ) : filteredResults.length === 0 ? (
          <EmptyState title="No results found." />
        ) : (
          <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#E9D8F7] overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(59,7,100,0.06)]">
            <div className="scroll-results flex-1 min-h-0 overflow-auto">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={`${TH} text-left w-8`}>#</th>
                  {columns.map((col) => (
                    <th key={col.key} className={`${TH} ${ALIGN_CLASS[col.align]}`}>
                      {col.label}
                    </th>
                  ))}
                  <th className={`${TH} text-left w-20`}>Details</th>
                </tr>
              </thead>
              <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-t-[#F1E8FA]">
                {visibleResults.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-[#FAF5FE] transition-colors">
                    <td className="px-3 py-2 text-[11px] font-medium text-[#8A93A3] tabular-nums whitespace-nowrap">{idx + 1}</td>
                    {columns.map((col) => {
                      const value = formatResultColumnValue(col, r);
                      let content: React.ReactNode;
                      let cls = 'text-[11.5px] font-medium text-[#4B5068]';
                      if (col.key === 'studentName') {
                        content = (
                          <div className={`flex items-center gap-2.5 min-w-0 ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''}`}>
                            <RingAvatar name={r.studentName} course={r.course} />
                            <span className="text-[12.5px] font-medium text-[#6B21A8]">{value}</span>
                            {r.semesterCount > 1 && <LinePill value={`${r.semesterCount} sems`} color={PLUM} />}
                          </div>
                        );
                        cls = '';
                      } else if (col.key === 'course') {
                        content = <LinePill value={value} color={DEPT_DOT[r.course]} minWidth={34} />;
                      } else if (col.key === 'year') {
                        content = <LinePill value={value} color={YEAR_COLOR[r.year]} minWidth={66} />;
                      } else if (col.key === 'overallResult') {
                        content = <LinePill value={value} color={resultOutcomeColor(r.overallResult)} minWidth={80} />;
                      } else {
                        content = value;
                        if (NUMERIC_KEYS.has(col.key)) cls = 'text-[11.5px] font-medium text-black tabular-nums';
                      }
                      return (
                        <td key={col.key} className={`px-3 py-2 whitespace-nowrap ${ALIGN_CLASS[col.align]} ${cls}`}>
                          {content}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        onClick={() => setDetailResult(r)}
                        className="inline-flex items-center justify-center gap-1 rounded-[7px] border border-[#9333EA]/45 bg-white px-2.5 py-[6px] text-[11px] font-medium leading-none text-[#6B21A8] transition-[background-color,box-shadow] duration-150 hover:bg-[#9333EA]/[0.08] hover:shadow-[0_2px_8px_rgba(18,20,26,0.06)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9333EA]/30"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        View
                      </button>
                    </td>
                  </tr>
                ))}

                {hasMore && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-4 py-3 text-center">
                      <button
                        className={OUTLINE_PILL_BTN}
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      >
                        Load more ({filteredResults.length - visibleCount} remaining)
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>

            <div className="flex-shrink-0 px-4 py-2 border-t border-[#E9D8F7] bg-[#FAF6FE] text-[11px] font-medium text-[#8A93A3]">
              Showing <span className="text-[#262B35] tabular-nums">{Math.min(visibleCount, filteredResults.length)}</span> of <span className="text-[#262B35] tabular-nums">{filteredResults.length}</span>
              {filteredResults.length < stats.total && (
                <span> (filtered from {stats.total} total)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {detailResult && (
        <ResultDetailModal result={detailResult} onClose={() => setDetailResult(null)} />
      )}
    </>
  );
}
