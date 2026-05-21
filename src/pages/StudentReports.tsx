import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useAuth } from '../contexts/AuthContext';
import { exportStudentReportPdf } from '../utils/studentReportPdf';
import { PageSpinner } from '../components/common/PageSpinner';
import type { Student, Course, Year, Gender, Category, AdmType, AdmCat, AcademicYear } from '../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[]     = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

const fs = 'rounded-lg border border-emerald-100 px-2 py-1.5 text-xs bg-white/80 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 cursor-pointer text-gray-700';

function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    if (c !== 0) return c;
    return (b.sslcObtainedTotal ?? 0) - (a.sslcObtainedTotal ?? 0);
  });
}

export function StudentReports() {
  const { role }                              = useAuth();
  const isAdmin                               = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const { students: allStudents, loading, error } = useStudents(academicYear);
  const { records: feeRecords, loading: feeLoading } = useFeeRecords(academicYear);

  // Earliest fee payment date per student (mirrors Dashboard's dateTable logic)
  const firstPaymentDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of feeRecords) {
      if (!r.date) continue;
      const d = r.date.split('T')[0];
      const existing = map.get(r.studentId);
      if (!existing || d < existing) map.set(r.studentId, d);
    }
    return map;
  }, [feeRecords]);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [searchTerm,    setSearchTerm]    = useState('');
  const [courseFilter,  setCourseFilter]  = useState<Course | ''>('');
  const [yearFilter,    setYearFilter]    = useState<Year | ''>('');
  const [genderFilter,  setGenderFilter]  = useState<Gender | ''>('');
  const [categoryFilter,setCategoryFilter]= useState<Category | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter,  setAdmCatFilter]  = useState<AdmCat | ''>('');
  const [dateFrom,      setDateFrom]      = useState('');
  const [dateTo,        setDateTo]        = useState('');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [savingPdf,   setSavingPdf]   = useState(false);
  const [savingExcel, setSavingExcel] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ── Filtered data ────────────────────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    let result = allStudents.filter((s) => s.admissionStatus === 'CONFIRMED');
    if (courseFilter)   result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)     result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)   result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter) result = result.filter((s) => s.category === categoryFilter);
    if (admTypeFilter)  result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)   result = result.filter((s) => s.admCat === admCatFilter);
    if (dateFrom || dateTo) {
      result = result.filter((s) => {
        const paid = firstPaymentDate.get(s.id);
        if (!paid) return false;
        if (dateFrom && paid < dateFrom) return false;
        if (dateTo   && paid > dateTo)   return false;
        return true;
      });
    }
    if (debouncedSearch) {
      const q = debouncedSearch.trim().toUpperCase();
      result = result.filter((s) =>
        s.studentNameSSLC.toUpperCase().includes(q) ||
        s.studentNameAadhar?.toUpperCase().includes(q) ||
        s.regNumber?.toUpperCase().includes(q) ||
        s.fatherMobile?.includes(q) ||
        s.studentMobile?.includes(q)
      );
    }
    return sortStudents(result);
  }, [allStudents, firstPaymentDate, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, dateFrom, dateTo, debouncedSearch]);

  const hasActiveFilters =
    !!searchTerm || !!courseFilter || !!yearFilter || !!genderFilter ||
    !!categoryFilter || !!admTypeFilter || !!admCatFilter || !!dateFrom || !!dateTo;

  function clearFilters() {
    setSearchTerm(''); setDebouncedSearch('');
    setCourseFilter(''); setYearFilter('');
    setGenderFilter(''); setCategoryFilter('');
    setAdmTypeFilter(''); setAdmCatFilter('');
    setDateFrom(''); setDateTo('');
  }

  // ── Stats (from confirmed only) ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const confirmed = allStudents.filter((s) => s.admissionStatus === 'CONFIRMED');
    const byYear: Record<string, number> = {};
    const byCourse: Record<string, number> = {};
    for (const s of confirmed) {
      byYear[s.year]     = (byYear[s.year] ?? 0) + 1;
      byCourse[s.course] = (byCourse[s.course] ?? 0) + 1;
    }
    return { byYear, byCourse, total: confirmed.length };
  }, [allStudents]);

  // ── Export PDF ───────────────────────────────────────────────────────────────
  function handleExportPdf() {
    setSavingPdf(true);
    setTimeout(() => {
      try {
        exportStudentReportPdf(filteredStudents, {
          academicYear,
          courseFilter,
          yearFilter,
          genderFilter,
          categoryFilter,
          admTypeFilter,
          admCatFilter,
          searchTerm: debouncedSearch,
          dateFrom,
          dateTo,
        });
      } finally {
        setSavingPdf(false);
      }
    }, 0);
  }

  // ── Export Excel ─────────────────────────────────────────────────────────────
  function handleExportExcel() {
    setSavingExcel(true);
    setTimeout(() => {
      try {
        const headers = [
          'Sl No', 'Name (SSLC)', 'Father Name', 'Gender', 'Category',
          'Course', 'Year', 'Adm Type', 'Adm Cat',
          'Student Mobile', 'Father Mobile',
          'SSLC Max', 'SSLC Total',
          'Maths Max', 'Maths Obtained',
          'Science Max', 'Science Obtained',
          'M+S Max', 'M+S Obtained',
          'Annual Income', 'Reg No', 'Merit No', 'Enrollment Date', 'Remarks',
        ];
        const rows = filteredStudents.map((s, i) => [
          i + 1,
          s.studentNameSSLC,
          s.fatherName,
          s.gender === 'BOY' ? 'B' : 'G',
          s.category || '',
          s.course,
          s.year,
          s.admType || '',
          s.admCat || '',
          s.studentMobile || '',
          s.fatherMobile || '',
          s.sslcMaxTotal ?? '',
          s.sslcObtainedTotal ?? '',
          s.mathsMax ?? '',
          s.mathsObtained ?? '',
          s.scienceMax ?? '',
          s.scienceObtained ?? '',
          s.mathsScienceMaxTotal ?? '',
          s.mathsScienceObtainedTotal ?? '',
          s.annualIncome ?? '',
          s.regNumber || '',
          s.meritNumber || '',
          s.enrollmentDate || '',
          '',
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [
          { wch: 6 }, { wch: 26 }, { wch: 22 }, { wch: 7 }, { wch: 8 },
          { wch: 7 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
          { wch: 14 }, { wch: 14 },
          { wch: 10 }, { wch: 10 },
          { wch: 10 }, { wch: 12 },
          { wch: 11 }, { wch: 14 },
          { wch: 9 },  { wch: 12 },
          { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Student Report');
        const parts = ['student_report'];
        if (academicYear)   parts.push(academicYear.replace(/[^0-9-]/g, ''));
        if (courseFilter)   parts.push(courseFilter);
        if (yearFilter)     parts.push(yearFilter.replace(/\s+/g, ''));
        XLSX.writeFile(wb, parts.join('_') + '.xlsx');
      } finally {
        setSavingExcel(false);
      }
    }, 0);
  }

  const isLoading = settingsLoading || loading || feeLoading;
  if (isLoading) return <PageSpinner />;

  return (
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0">
        <div className="shrink-0">
          <h2 className="text-xl font-black text-gray-800 leading-tight tracking-tight">Student Reports</h2>
          {academicYear && (
            <p className="text-[10px] text-gray-400 leading-tight">{academicYear}</p>
          )}
        </div>

        {!isLoading && stats.total > 0 && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              <div className="flex items-center gap-1 bg-white/80 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-emerald-500 font-semibold">Total</span>
                <span className="font-bold tabular-nums">{stats.total}</span>
              </div>

              <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

              {YEARS.map((yr) => {
                const count  = stats.byYear[yr] ?? 0;
                const label  = yr === '1ST YEAR' ? '1st' : yr === '2ND YEAR' ? '2nd' : '3rd';
                const active = yearFilter === yr;
                return (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(active ? '' : yr)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : count === 0
                        ? 'bg-white/50 border-gray-100 text-gray-300'
                        : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className={`font-semibold ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
                    <span className={`font-bold tabular-nums ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>{count}</span>
                  </button>
                );
              })}

              <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

              {COURSES.map((c) => {
                const count  = stats.byCourse[c] ?? 0;
                const active = courseFilter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setCourseFilter(active ? '' : c)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      active
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : count === 0
                        ? 'bg-white/50 border-gray-100 text-gray-300'
                        : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className={`font-semibold ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-600'}`}>{c}</span>
                    <span className={`font-bold tabular-nums ${active ? 'text-white' : count === 0 ? 'text-gray-300' : 'text-gray-800'}`}>{count}</span>
                  </button>
                );
              })}

              {hasActiveFilters && (
                <>
                  <span className="text-emerald-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-emerald-600 font-semibold">Filtered</span>
                    <span className="font-bold tabular-nums">{filteredStudents.length}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Filters panel ──────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 bg-white/70 rounded-2xl border border-emerald-100 overflow-hidden"
        style={{ backdropFilter: 'blur(8px)', boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}
      >
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">

          {/* Search */}
          <input
            type="text"
            placeholder="Search name / reg / mobile…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-44 rounded-lg border border-emerald-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 bg-white/80 text-gray-700 placeholder:text-gray-400"
          />

          {/* Dropdowns */}
          <select className={fs} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value as Course | '')}>
            <option value="">All Courses</option>
            {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className={fs} value={yearFilter} onChange={(e) => setYearFilter(e.target.value as Year | '')}>
            <option value="">All Years</option>
            <option value="1ST YEAR">1ST YEAR</option>
            <option value="2ND YEAR">2ND YEAR</option>
            <option value="3RD YEAR">3RD YEAR</option>
          </select>

          <select className={fs} value={genderFilter} onChange={(e) => setGenderFilter(e.target.value as Gender | '')}>
            <option value="">All Genders</option>
            <option value="BOY">BOY</option>
            <option value="GIRL">GIRL</option>
          </select>

          <select className={fs} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as Category | '')}>
            <option value="">All Categories</option>
            <option value="GM">GM</option>
            <option value="SC">SC</option>
            <option value="ST">ST</option>
            <option value="C1">C1</option>
            <option value="2A">2A</option>
            <option value="2B">2B</option>
            <option value="3A">3A</option>
            <option value="3B">3B</option>
          </select>

          <select className={fs} value={admTypeFilter} onChange={(e) => setAdmTypeFilter(e.target.value as AdmType | '')}>
            <option value="">All Adm Types</option>
            <option value="REGULAR">REGULAR</option>
            <option value="REPEATER">REPEATER</option>
            <option value="LATERAL">LATERAL</option>
            <option value="EXTERNAL">EXTERNAL</option>
            <option value="SNQ">SNQ</option>
          </select>

          <select className={fs} value={admCatFilter} onChange={(e) => setAdmCatFilter(e.target.value as AdmCat | '')}>
            <option value="">All Adm Cats</option>
            <option value="GM">GM</option>
            <option value="SNQ">SNQ</option>
            <option value="OTHERS">OTHERS</option>
          </select>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Fee Paid Date</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-emerald-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 bg-white/80 text-gray-700 cursor-pointer"
            />
            <span className="text-gray-300 text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-emerald-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 bg-white/80 text-gray-700 cursor-pointer"
            />
          </div>

          {/* Action buttons */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-amber-300 px-2 py-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer transition-colors font-semibold"
            >
              Clear
            </button>
          )}

          {filteredStudents.length > 0 && (
            <>
              <button
                onClick={handleExportPdf}
                disabled={savingPdf}
                className="rounded-lg border border-yellow-300 px-2 py-1.5 text-xs text-yellow-800 bg-yellow-50 hover:bg-yellow-100 hover:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <polyline points="9 15 12 18 15 15"/>
                </svg>
                {savingPdf ? 'Generating…' : 'Export PDF'}
              </button>

              {isAdmin && (
                <button
                  onClick={handleExportExcel}
                  disabled={savingExcel}
                  className="rounded-lg border border-emerald-200 px-2 py-1.5 text-xs text-emerald-700 bg-white hover:bg-emerald-50 hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <polyline points="9 15 12 18 15 15"/>
                  </svg>
                  {savingExcel ? 'Exporting…' : 'Export Excel'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
      ) : !academicYear ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Please configure an academic year in Settings first.
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          No students found{hasActiveFilters ? ' for the selected filters.' : '.'}
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-emerald-100 overflow-auto flex flex-col"
          style={{ boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}
        >
          <table className="min-w-full divide-y divide-emerald-50 text-xs">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: 'linear-gradient(90deg, #fffbeb, #fefce8)' }}>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-9 border-b border-yellow-200">#</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-yellow-200">Name (SSLC)</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-b border-yellow-200">Father Name</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-14 border-b border-yellow-200">Gender</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-16 border-b border-yellow-200">Category</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 whitespace-nowrap w-14 border-b border-yellow-200">Course</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-yellow-200">Student Mob</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-28 border-b border-yellow-200">Father Mob</th>
                <th className="px-3 py-2 text-right font-bold text-gray-700 whitespace-nowrap w-20 border-b border-yellow-200">SSLC Total</th>
                <th className="px-3 py-2 text-right font-bold text-gray-700 whitespace-nowrap w-20 border-b border-yellow-200">Income</th>
                <th className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap w-24 border-b border-yellow-200">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50/60">
              {filteredStudents.map((s, idx) => (
                <tr
                  key={s.id}
                  className={`transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : ''} hover:bg-yellow-50/50`}
                >
                  <td className="px-3 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.studentNameSSLC}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{s.fatherName}</td>
                  <td className="px-3 py-2 text-center text-gray-700 whitespace-nowrap">
                    {s.gender === 'BOY' ? 'B' : 'G'}
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 border border-emerald-100 text-emerald-700">
                      {s.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-gray-700 font-medium whitespace-nowrap">{s.course}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{s.studentMobile || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{s.fatherMobile || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-700 font-medium whitespace-nowrap tabular-nums">
                    {s.sslcObtainedTotal ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap tabular-nums">
                    {s.annualIncome ? s.annualIncome.toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap"></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-3 py-2 border-t border-emerald-50 text-xs text-gray-500 mt-auto">
            Showing {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
            {hasActiveFilters && stats.total > 0 && filteredStudents.length < stats.total && (
              <span className="text-gray-400"> (filtered from {stats.total} total)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
