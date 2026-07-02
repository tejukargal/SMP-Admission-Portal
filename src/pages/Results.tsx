import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResults } from '../hooks/useResults';
import { useAuth } from '../contexts/AuthContext';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { ResultColumnPickerDropdown } from '../components/common/ResultColumnPickerDropdown';
import { ResultDetailModal } from '../components/results/ResultDetailModal';
import { Button } from '../components/common/Button';
import { RESULT_COLUMNS, DEFAULT_RESULT_COLUMNS, formatResultColumnValue, type ResultColumnKey } from '../utils/resultColumns';
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

function AnimNum({ value }: { value: number }) {
  return (
    <span
      key={value}
      className="font-bold tabular-nums"
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
  const { results, loading, error } = useResults();

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
    return { courseCount, total: results.length };
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

  if (loading) return <PageSpinner />;

  return (
    <>
      <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

        {/* Page header + stats chips */}
        <div className="flex-shrink-0 flex items-center gap-3 min-w-0">
          <div className="shrink-0">
            <h2 className="text-xl font-black text-gray-800 leading-tight tracking-tight">Results</h2>
          </div>

          {stats.total > 0 && (
            <>
              <span className="text-gray-200 text-sm select-none shrink-0">|</span>
              <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">
                <div className="flex items-center gap-1 bg-white/80 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                  <span className="text-emerald-500 font-semibold">Total</span>
                  <AnimNum value={stats.total} />
                </div>
                <span className="text-emerald-200 text-xs select-none shrink-0">·</span>
                {COURSES.map((c) => {
                  const count = stats.courseCount[c] ?? 0;
                  const isSelected = courseFilter === c;
                  const isDimmed = (!!courseFilter && !isSelected) || count === 0;
                  return (
                    <button
                      key={c}
                      onClick={() => setCourseFilter(isSelected ? '' : c)}
                      className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : isDimmed
                          ? 'bg-white/50 border-gray-100'
                          : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                      }`}
                    >
                      <span className={`font-semibold ${isSelected ? 'text-white' : isDimmed ? 'text-gray-300' : 'text-gray-600'}`}>
                        {c}
                      </span>
                      <span className={`font-bold tabular-nums ${isSelected ? 'text-white' : isDimmed ? 'text-gray-300' : 'text-gray-800'}`}>
                        <AnimNum value={count} />
                      </span>
                    </button>
                  );
                })}
                {hasActiveFilters && (
                  <>
                    <span className="text-emerald-200 text-xs select-none shrink-0">·</span>
                    <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                      <span className="text-emerald-600 font-semibold">Filtered</span>
                      <AnimNum value={filteredResults.length} />
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {isAdmin && (
            <Button onClick={() => void navigate('/settings?tab=import-results')} className="ml-auto shrink-0">
              Import Results
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex-shrink-0 rounded-2xl border border-emerald-100 overflow-hidden" style={{ background: 'linear-gradient(160deg, #f4fdf9 0%, #f8fafc 45%, #f0fdf6 100%)', boxShadow: '0 1px 4px 0 rgba(16,185,129,0.08)' }}>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="relative shrink-0 w-52">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Search reg no / name…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full rounded-full border border-emerald-300 py-2 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 bg-white shadow-sm text-gray-800 placeholder:text-gray-400 placeholder:font-normal transition-all duration-150 pl-8 ${searchTerm ? 'pr-8' : 'pr-3'}`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-amber-400 hover:bg-amber-500 text-white transition-colors duration-150 shrink-0"
                  aria-label="Clear search"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-px py-0.5">
              <FilterDropdown<Course | ''>
                value={courseFilter}
                onChange={(v) => setCourseFilter(v as Course | '')}
                placeholder="Course"
                options={COURSES.map((c) => ({ value: c, label: c }))}
              />
              <FilterDropdown<Year | ''>
                value={yearFilter}
                onChange={(v) => setYearFilter(v as Year | '')}
                placeholder="Year"
                options={YEARS.map((y) => ({ value: y, label: y }))}
              />
              <FilterDropdown<string>
                value={examSessionFilter}
                onChange={setExamSessionFilter}
                placeholder="Exam Session"
                options={examSessionOptions.map((s) => ({ value: s, label: s }))}
              />
              <FilterDropdown<string>
                value={resultFilter}
                onChange={setResultFilter}
                placeholder="Result"
                options={RESULT_OPTIONS.map((r) => ({ value: r, label: r }))}
              />
            </div>

            {hasActiveFilters && (
              <>
                <span className="w-px h-5 bg-emerald-200 shrink-0" />
                <button
                  onClick={clearFilters}
                  className="shrink-0 rounded-full border border-amber-300 px-2.5 py-1 text-[12px] text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer transition-colors font-semibold whitespace-nowrap"
                >
                  Clear
                </button>
              </>
            )}

            <div className="ml-auto shrink-0">
              <ResultColumnPickerDropdown
                columns={RESULT_COLUMNS}
                selected={selectedColumns}
                onChange={setSelectedColumns}
              />
            </div>
          </div>
        </div>

        {/* Table area */}
        {error ? (
          <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
        ) : results.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            No results imported yet. Admins can import a Result Ledger PDF from Settings → Import Results.
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No results found.</div>
        ) : (
          <div className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-emerald-100 overflow-auto flex flex-col" style={{ boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}>
            <table className="min-w-full divide-y divide-emerald-50 text-xs">
              <thead className="sticky top-0 z-10" style={{ background: 'linear-gradient(90deg, #ecfdf5, #f0f9ff)' }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-8">#</th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-2 font-semibold text-gray-500 whitespace-nowrap ${ALIGN_CLASS[col.align]}`}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-20">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50/60">
                {visibleResults.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-emerald-100/70 transition-colors">
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-3 py-2 whitespace-nowrap ${ALIGN_CLASS[col.align]} ${
                          col.key === 'overallResult'
                            ? r.overallResult === 'FAILS'
                              ? 'text-red-600 font-semibold'
                              : r.overallResult === 'Distinction'
                              ? 'text-emerald-700 font-semibold'
                              : 'text-gray-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {formatResultColumnValue(col, r)}
                      </td>
                    ))}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        onClick={() => setDetailResult(r)}
                        className="text-[11px] text-blue-500 hover:text-blue-700 font-medium underline underline-offset-2 cursor-pointer"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}

                {hasMore && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-4 py-2.5 text-center">
                      <button
                        className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline font-medium"
                        onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                      >
                        Load more ({filteredResults.length - visibleCount} remaining)
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="px-3 py-2 border-t border-emerald-50 text-xs text-gray-500 mt-auto">
              Showing {Math.min(visibleCount, filteredResults.length)} of {filteredResults.length}
              {filteredResults.length < stats.total && (
                <span className="text-gray-400"> (filtered from {stats.total} total)</span>
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
