import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { updateStudentAllottedCategory } from '../services/studentService';
import { createStudentNotification } from '../services/studentNotificationService';
import { Button } from '../components/common/Button';
import { MultiSelectFilterDropdown } from '../components/common/MultiSelectFilterDropdown';
import { useFilters } from '../contexts/FiltersContext';
import { useAuth } from '../contexts/AuthContext';
import { exportStudentsPdf } from '../utils/studentsPdf';
import { isConfirmedActive } from '../utils/studentStatus';
import { isWPStudent } from '../utils/wpStudent';
import { StudentDetailModal } from '../components/student/StudentDetailModal';
import { StudyCertificateModal } from '../components/common/StudyCertificateModal';
import { TransferCertificateModal } from '../components/common/TransferCertificateModal';
import { ProvisionalCertificateModal } from '../components/common/ProvisionalCertificateModal';
import { CourseCompletionCertificateModal } from '../components/common/CourseCompletionCertificateModal';
import { ManualCertificateModal } from '../components/common/ManualCertificateModal';
import { AdmissionOrderModal } from '../components/common/AdmissionOrderModal';
import { AllottedCategoryModal } from '../components/common/AllottedCategoryModal';
import type { Student, Course, Year, Gender, AcademicYear, AdmCat, Category } from '../types';
import { PageSpinner } from '../components/common/PageSpinner';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

// tcHistory / pcHistory live on the student doc but aren't on the Student type —
// same local-cast pattern as StudentReports.tsx.
type CertStudent = Student & { tcHistory?: unknown[]; pcHistory?: unknown[] };
function certCounts(s: Student): { tc: number; pc: number } {
  const c = s as CertStudent;
  return { tc: c.tcHistory?.length ?? 0, pc: c.pcHistory?.length ?? 0 };
}

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

/**
 * WP (Working Professional / evening college) students — every confirmed
 * admission with Adm Type EXTERNAL for the current academic year.
 *
 * They are enrolled and confirmed through the normal flow (/enroll →
 * Admissions → Confirm) but are managed here instead of on /students, and are
 * excluded from every day-college count. The page exists to issue Study /
 * Transfer / Provisional / Course Completion certificates and the Admission
 * Order — fee is out of scope (WP fee is tracked as manual counts in
 * Fee Reports → WP Fee Distribution).
 */
export function WPStudents() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const { wpFilters, setWpFilters, clearWpFilters } = useFilters();

  const {
    searchTerm,
    courseFilter,
    yearFilter,
    genderFilter,
    categoryFilter,
    admCatFilter,
    visibleCount,
  } = wpFilters;

  function setSearchTerm(v: string) { setWpFilters({ searchTerm: v }); }
  function setCourseFilter(v: Course[]) { setWpFilters({ courseFilter: v }); }
  function setYearFilter(v: Year[]) { setWpFilters({ yearFilter: v }); }
  function setGenderFilter(v: Gender[]) { setWpFilters({ genderFilter: v }); }
  function setCategoryFilter(v: Category[]) { setWpFilters({ categoryFilter: v }); }
  function setAdmCatFilter(v: AdmCat[]) { setWpFilters({ admCatFilter: v }); }
  function toggleYearFilter(yr: Year) {
    setYearFilter(yearFilter.includes(yr) ? yearFilter.filter((y) => y !== yr) : [...yearFilter, yr]);
  }
  function toggleCourseFilter(c: Course) {
    setCourseFilter(courseFilter.includes(c) ? courseFilter.filter((x) => x !== c) : [...courseFilter, c]);
  }
  function setVisibleCount(updater: ((c: number) => number) | number) {
    const next = typeof updater === 'function' ? updater(visibleCount) : updater;
    setWpFilters({ visibleCount: next });
  }

  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [savingPdf, setSavingPdf] = useState(false);
  const [savingExcel, setSavingExcel] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [studyCertStudent, setStudyCertStudent] = useState<Student | null>(null);
  const [tcStudent, setTcStudent] = useState<Student | null>(null);
  const [pcStudent, setPcStudent] = useState<Student | null>(null);
  const [cccStudent, setCccStudent] = useState<Student | null>(null);
  const [showManualCert, setShowManualCert] = useState(false);
  const [allottedCatStudent, setAllottedCatStudent] = useState<Student | null>(null);
  const [savingAllottedCat, setSavingAllottedCat] = useState(false);
  const [admOrderStudent, setAdmOrderStudent] = useState<Student | null>(null);
  const [showFilters, setShowFilters] = useState(() => localStorage.getItem('smp_wp_filters_visible') === 'true');

  // ── Right-click context menu ──────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; student: Student } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setContextMenu(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  // After every render where the menu is present, measure its real size and
  // clamp to viewport — direct DOM mutation avoids a state-update re-render loop.
  useLayoutEffect(() => {
    const el = contextMenuRef.current;
    if (!el || !contextMenu) return;
    const GAP = 6;
    const { offsetWidth: w, offsetHeight: h } = el;
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (x + w > window.innerWidth  - GAP) x = window.innerWidth  - w - GAP;
    if (y + h > window.innerHeight - GAP) y = window.innerHeight - h - GAP;
    if (x < GAP) x = GAP;
    if (y < GAP) y = GAP;
    el.style.left       = `${x}px`;
    el.style.top        = `${y}px`;
    el.style.visibility = 'visible';
  }, [contextMenu]);

  function handleContextMenu(e: React.MouseEvent, student: Student) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, student });
  }

  // Single unfiltered fetch — shares the useStudents module cache with the
  // Students page, so opening this page costs no extra Firestore reads.
  const { students: allStudents, loading, error, refetch } = useStudents(academicYear);

  const wpStudents = useMemo(
    () => allStudents.filter((s) => isWPStudent(s) && isConfirmedActive(s)),
    [allStudents]
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const filteredStudents = useMemo(() => {
    let result = wpStudents;
    if (courseFilter.length)    result = result.filter((s) => courseFilter.includes(s.course));
    if (yearFilter.length)      result = result.filter((s) => yearFilter.includes(s.year));
    if (genderFilter.length)    result = result.filter((s) => genderFilter.includes(s.gender));
    if (categoryFilter.length)  result = result.filter((s) => categoryFilter.includes(s.category));
    if (admCatFilter.length)    result = result.filter((s) => admCatFilter.includes(s.admCat));
    if (debouncedSearch) {
      const search = debouncedSearch.trim().toUpperCase();
      result = result.filter((s) => {
        const matchName =
          s.studentNameSSLC.toUpperCase().includes(search) ||
          s.studentNameAadhar.toUpperCase().includes(search);
        const matchMobile =
          s.fatherMobile?.includes(search) || s.studentMobile?.includes(search);
        const matchReg = s.regNumber?.toUpperCase().includes(search);
        return matchName || matchMobile || matchReg;
      });
    }
    return result.slice().sort((a, b) => {
      const y = (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9);
      if (y !== 0) return y;
      const c = a.course.localeCompare(b.course);
      if (c !== 0) return c;
      return a.studentNameSSLC.localeCompare(b.studentNameSSLC);
    });
  }, [wpStudents, courseFilter, yearFilter, genderFilter, categoryFilter, admCatFilter, debouncedSearch]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredStudents]);

  const visibleStudents = useMemo(
    () => filteredStudents.slice(0, visibleCount),
    [filteredStudents, visibleCount]
  );

  const hasMore = visibleCount < filteredStudents.length;

  const hasActiveFilters =
    !!searchTerm || courseFilter.length > 0 || yearFilter.length > 0 || genderFilter.length > 0 ||
    categoryFilter.length > 0 || admCatFilter.length > 0;

  const hasNonSearchFilters =
    courseFilter.length > 0 || yearFilter.length > 0 || genderFilter.length > 0 ||
    categoryFilter.length > 0 || admCatFilter.length > 0;

  useEffect(() => {
    if (hasNonSearchFilters) setShowFilters(true);
  }, [hasNonSearchFilters]);

  function clearFilters() {
    clearWpFilters();
    setDebouncedSearch('');
  }

  const stats = useMemo(() => {
    if (!wpStudents.length) return null;
    const yearCount: Record<string, number> = {};
    const courseCount: Record<string, number> = {};
    for (const s of wpStudents) {
      yearCount[s.year] = (yearCount[s.year] ?? 0) + 1;
      courseCount[s.course] = (courseCount[s.course] ?? 0) + 1;
    }
    return { yearCount, courseCount, total: wpStudents.length };
  }, [wpStudents]);

  function handleSavePdf() {
    setSavingPdf(true);
    // Defer to next tick so the button state renders before the synchronous PDF work
    setTimeout(() => {
      try {
        exportStudentsPdf(filteredStudents, {
          academicYear,
          courseFilter: courseFilter.join('/'),
          yearFilter: yearFilter.join('/'),
          genderFilter: genderFilter.join('/'),
          admTypeFilter: 'EXTERNAL',
          admCatFilter: admCatFilter.join('/'),
          admStatusFilter: 'CONFIRMED',
          searchTerm: debouncedSearch,
        });
      } finally {
        setSavingPdf(false);
      }
    }, 0);
  }

  function handleSaveExcel() {
    setSavingExcel(true);
    setTimeout(() => {
      try {
        const headers = [
          '#', 'Name (SSLC)', 'Name (Aadhar)', 'Father Name', 'Mother Name',
          'Date of Birth', 'Gender', 'Religion', 'Caste', 'Category',
          'Course', 'Year', 'Adm Type', 'Adm Cat', 'Allotted Cat', 'Reg No',
          'Student Mobile', 'Father Mobile',
          'Address', 'Town', 'Taluk', 'District',
          'Enrollment Date', 'Admission Status', 'Academic Year',
        ];
        const rows = filteredStudents.map((s, i) => [
          i + 1,
          s.studentNameSSLC,
          s.studentNameAadhar,
          s.fatherName,
          s.motherName,
          s.dateOfBirth,
          s.gender,
          s.religion,
          s.caste,
          s.category,
          s.course,
          s.year,
          s.admType,
          s.admCat,
          s.allottedCategory || '',
          s.regNumber || '',
          s.studentMobile || '',
          s.fatherMobile || '',
          s.address,
          s.town,
          s.taluk,
          s.district,
          s.enrollmentDate,
          s.admissionStatus,
          s.academicYear,
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'WP Students');
        XLSX.writeFile(wb, `WP_Students_${academicYear ?? 'export'}.xlsx`);
      } finally {
        setSavingExcel(false);
      }
    }, 0);
  }

  async function handleSaveAllottedCat(allottedCategory: string) {
    if (!allottedCatStudent) return;
    setSavingAllottedCat(true);
    try {
      await updateStudentAllottedCategory(allottedCatStudent.id, allottedCategory);
      if (user && allottedCatStudent.regNumber) {
        void createStudentNotification({
          studentId: allottedCatStudent.id,
          regNumber: allottedCatStudent.regNumber,
          type: 'allotted-category',
          title: 'Allotted Category Set',
          message: `Your allotted category was set to ${allottedCategory}.`,
          createdBy: user.uid,
        });
      }
      refetch();
      setAllottedCatStudent(null);
      setToastMsg(`Allotted category saved for ${allottedCatStudent.studentNameSSLC}.`);
    } catch {
      // keep modal open on error
    } finally {
      setSavingAllottedCat(false);
    }
  }

  const isLoading = settingsLoading || loading;

  if (isLoading) return <PageSpinner />;

  return (
    <>
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* Page header + stats chips */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0 relative">
        <div className="shrink-0">
          <h2 className="text-xl font-black text-gray-800 leading-tight tracking-tight">WP Students</h2>
          <p className="text-[10px] text-gray-400 leading-tight">
            Working Professional{academicYear ? ` · ${academicYear}` : ''}
          </p>
        </div>

        {!isLoading && stats && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              {/* Total chip */}
              <div className="flex items-center gap-1 bg-white/80 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-emerald-500 font-semibold">Total</span>
                <AnimNum value={stats.total} />
              </div>

              <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

              {/* Study-year chips */}
              {YEARS.map((yr) => {
                const count = stats.yearCount[yr] ?? 0;
                const isSelected = yearFilter.includes(yr);
                const isDimmed = (yearFilter.length > 0 && !isSelected) || count === 0;
                const label = yr === '1ST YEAR' ? '1st' : yr === '2ND YEAR' ? '2nd' : '3rd';
                return (
                  <button
                    key={yr}
                    onClick={() => toggleYearFilter(yr)}
                    className={`flex items-center gap-1 border rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : isDimmed
                        ? 'bg-white/50 border-gray-100'
                        : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className={`font-semibold ${isSelected ? 'text-white' : isDimmed ? 'text-gray-300' : 'text-gray-600'}`}>
                      {label}
                    </span>
                    <span className={`font-bold tabular-nums ${isSelected ? 'text-white' : isDimmed ? 'text-gray-300' : 'text-gray-800'}`}>
                      <AnimNum value={count} />
                    </span>
                  </button>
                );
              })}

              <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

              {/* Course chips */}
              {COURSES.map((c) => {
                const count = stats.courseCount[c] ?? 0;
                const isSelected = courseFilter.includes(c);
                const isDimmed = (courseFilter.length > 0 && !isSelected) || count === 0;
                return (
                  <button
                    key={c}
                    onClick={() => toggleCourseFilter(c)}
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

              {/* Filtered count */}
              {hasActiveFilters && (
                <>
                  <span className="text-emerald-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-emerald-600 font-semibold">Filtered</span>
                    <AnimNum value={filteredStudents.length} />
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* Success toast — centred in the header bar */}
        {toastMsg && (
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm whitespace-nowrap pointer-events-auto"
            style={{ animation: 'toast-in 0.2s ease-out' }}
          >
            <span className="text-green-500 leading-none">✓</span>
            {toastMsg}
            <button
              onClick={() => setToastMsg('')}
              className="text-green-400 hover:text-green-600 leading-none ml-1"
            >
              ×
            </button>
          </div>
        )}

        <Button onClick={() => void navigate('/enroll')} className="ml-auto shrink-0">Enroll Student</Button>
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 rounded-2xl border border-emerald-100 overflow-hidden" style={{ background: 'linear-gradient(160deg, #f4fdf9 0%, #f8fafc 45%, #f0fdf6 100%)', boxShadow: '0 1px 4px 0 rgba(16,185,129,0.08)' }}>
        <div className="flex items-center gap-2 px-3 py-2">

          {/* Search — rounded-full with icon + amber clear */}
          <div className="relative shrink-0 w-52">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name / reg / mobile…"
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

          {/* Collapsible filter selects — no Adm Type: every WP row is EXTERNAL */}
          <div className="flex-1 min-w-0">
            <div
              className="grid"
              style={{
                gridTemplateColumns: showFilters ? '1fr' : '0fr',
                opacity: showFilters ? 1 : 0,
                transition: 'grid-template-columns 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-px py-0.5">
                  <MultiSelectFilterDropdown<Course>
                    value={courseFilter}
                    onChange={setCourseFilter}
                    placeholder="Course"
                    options={[
                      { value: 'CE', label: 'CE' },
                      { value: 'ME', label: 'ME' },
                      { value: 'EC', label: 'EC' },
                      { value: 'CS', label: 'CS' },
                      { value: 'EE', label: 'EE' },
                    ]}
                  />
                  <MultiSelectFilterDropdown<Year>
                    value={yearFilter}
                    onChange={setYearFilter}
                    placeholder="Study Yr"
                    options={[
                      { value: '1ST YEAR', label: '1ST YEAR' },
                      { value: '2ND YEAR', label: '2ND YEAR' },
                      { value: '3RD YEAR', label: '3RD YEAR' },
                    ]}
                  />
                  <MultiSelectFilterDropdown<Gender>
                    value={genderFilter}
                    onChange={setGenderFilter}
                    placeholder="Gender"
                    options={[
                      { value: 'BOY', label: 'BOY' },
                      { value: 'GIRL', label: 'GIRL' },
                    ]}
                  />
                  <MultiSelectFilterDropdown<Category>
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    placeholder="Cat"
                    options={[
                      { value: 'GM', label: 'GM' },
                      { value: 'SC', label: 'SC' },
                      { value: 'ST', label: 'ST' },
                      { value: 'C1', label: 'C1' },
                      { value: '2A', label: '2A' },
                      { value: '2B', label: '2B' },
                      { value: '3A', label: '3A' },
                      { value: '3B', label: '3B' },
                    ]}
                  />
                  <MultiSelectFilterDropdown<AdmCat>
                    value={admCatFilter}
                    onChange={setAdmCatFilter}
                    placeholder="Adm Cat"
                    options={[
                      { value: 'GM', label: 'GM' },
                      { value: 'SNQ', label: 'SNQ' },
                      { value: 'OTHERS', label: 'OTHERS' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Clear — only when filters active */}
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

          {/* Action buttons */}
          <button
            onClick={() => setShowManualCert(true)}
            title="Issue a Study/Provisional Certificate for a student with no database record (Evening College / Working Professional)"
            className="shrink-0 rounded-full border border-indigo-200 px-2.5 py-1 text-[12px] text-indigo-700 bg-white hover:bg-indigo-50 hover:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer transition-colors font-medium whitespace-nowrap"
          >
            Manual Certificate
          </button>
          {!isLoading && filteredStudents.length > 0 && (
            <>
              <button
                onClick={handleSavePdf}
                disabled={savingPdf}
                className="shrink-0 rounded-full border border-emerald-200 px-2.5 py-1 text-[12px] text-emerald-700 bg-white hover:bg-emerald-50 hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {savingPdf ? 'Generating…' : 'Save PDF'}
              </button>
              <button
                onClick={handleSaveExcel}
                disabled={savingExcel}
                className="shrink-0 rounded-full border border-emerald-200 px-2.5 py-1 text-[12px] text-emerald-700 bg-white hover:bg-emerald-50 hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {savingExcel ? 'Exporting…' : 'Export Excel'}
              </button>
            </>
          )}

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => { const next = !v; localStorage.setItem('smp_wp_filters_visible', String(next)); return next; })}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters || hasNonSearchFilters
                ? 'bg-emerald-100 border-emerald-300 text-emerald-600'
                : 'border-emerald-200 text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600'
            }`}
            title="Toggle filters"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
          </button>

        </div>
      </div>

      {/* Table area — the only thing that scrolls */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
      ) : !academicYear ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Please configure an academic year in Settings first.
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 text-sm text-gray-400">
          <span>No WP students found.</span>
          {!hasActiveFilters && (
            <span className="text-xs text-gray-400">
              Enroll with Adm Type <span className="font-semibold text-gray-500">EXTERNAL</span>, then confirm from the Admissions page.
            </span>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-white/80 rounded-2xl border border-emerald-100 overflow-auto flex flex-col" style={{ boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}>
          <table className="min-w-full divide-y divide-emerald-50 text-xs">
            <thead className="sticky top-0 z-10" style={{ background: 'linear-gradient(90deg, #ecfdf5, #f0f9ff)' }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-8">#</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">Name (SSLC)</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-24">Reg No</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-14">Course</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-20">Year</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-14">Gender</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-14">Category</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-16">Adm Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-20">Allotted Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-28">Mobile</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-24">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-20">Certificates</th>
                {isAdmin && (
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-48">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50/60">
              {visibleStudents.map((student, idx) => (
                <tr
                  key={`${student.id}-${debouncedSearch}`}
                  className={`transition-colors cursor-context-menu ${
                    contextMenu?.student.id === student.id
                      ? 'bg-emerald-200/80'
                      : 'hover:bg-emerald-200/60'
                  }`}
                  onContextMenu={(e) => handleContextMenu(e, student)}
                  style={debouncedSearch ? { animation: `content-enter 0.2s ease-out ${Math.min(idx * 0.03, 0.3)}s both` } : undefined}
                >
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{student.studentNameSSLC}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.regNumber || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.course}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.year}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.gender}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.category || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.admCat || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {student.allottedCategory ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                          student.allottedCategory !== student.category
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-gray-50 border-gray-200 text-gray-600'
                        }`}
                        title={student.allottedCategory !== student.category ? `Claimed: ${student.category}` : undefined}
                      >
                        {student.allottedCategory}
                      </span>
                    ) : (
                      isAdmin ? (
                        <button
                          onClick={() => setAllottedCatStudent(student)}
                          className="text-[10px] text-blue-500 hover:text-blue-700 font-medium underline underline-offset-2 cursor-pointer"
                        >
                          Set
                        </button>
                      ) : (
                        <span className="text-gray-300 text-[10px]">—</span>
                      )
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.studentMobile}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        student.admissionStatus === 'CONFIRMED'
                          ? 'bg-green-100 text-green-700'
                          : student.admissionStatus === 'CANCELLED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {student.admissionStatus || '—'}
                    </span>
                    {student.transferredIn && (
                      <span
                        className="ml-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200"
                        title={student.transferInPolytechnic ? `From: ${student.transferInPolytechnic}` : undefined}
                      >
                        TRF IN
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {(() => {
                      const { tc, pc } = certCounts(student);
                      if (!tc && !pc) return <span className="text-gray-300 text-[10px]">—</span>;
                      return (
                        <span className="flex items-center gap-1">
                          {tc > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 border border-sky-200 text-sky-700 leading-none" title={`${tc} Transfer Certificate${tc > 1 ? 's' : ''} issued`}>
                              TC{tc > 1 ? ` ×${tc}` : ''}
                            </span>
                          )}
                          {pc > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-50 border border-violet-200 text-violet-700 leading-none" title={`${pc} Provisional Certificate${pc > 1 ? 's' : ''} issued`}>
                              PC{pc > 1 ? ` ×${pc}` : ''}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void navigate(`/enroll?edit=${student.id}`, { state: { student } })}
                      >
                        Edit
                      </Button>
                    </td>
                  )}
                </tr>
              ))}

              {hasMore && (
                <tr>
                  <td colSpan={isAdmin ? 13 : 12} className="px-4 py-2.5 text-center">
                    <button
                      className="text-xs text-emerald-600 hover:text-emerald-800 hover:underline font-medium"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredStudents.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="px-3 py-2 border-t border-emerald-50 text-xs text-gray-500 mt-auto">
            Showing {Math.min(visibleCount, filteredStudents.length)} of {filteredStudents.length}
            {stats && filteredStudents.length < stats.total && (
              <span className="text-gray-400"> (filtered from {stats.total} total)</span>
            )}
          </div>
        </div>
      )}

    </div>

    {/* ── Context menu — rendered outside animated div to avoid transform containing-block bug ── */}
    {contextMenu && (
      <>
        {/* Invisible backdrop — catches all clicks/right-clicks outside the menu */}
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        />
        {/* Menu — initially hidden; useLayoutEffect repositions then reveals */}
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white border border-gray-200/80 rounded-2xl overflow-hidden min-w-[205px]"
          style={{ left: contextMenu.x, top: contextMenu.y, visibility: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 pt-2 pb-1.5 border-b border-gray-100 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
              {contextMenu.student.studentNameSSLC.charAt(0)}
            </span>
            <span className="text-[11px] font-semibold text-gray-800 truncate">{contextMenu.student.studentNameSSLC}</span>
          </div>
          {/* Items */}
          <div className="py-1">
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setDetailStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
              </span>
              View Details
            </button>
            {isAdmin && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2 transition-colors duration-100"
                onClick={() => { setAllottedCatStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
                </span>
                <span>Allotted Category</span>
                {contextMenu.student.allottedCategory ? (
                  <span className="ml-auto text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {contextMenu.student.allottedCategory}
                  </span>
                ) : (
                  <span className="ml-auto text-[10px] font-semibold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">
                    Not set
                  </span>
                )}
              </button>
            )}
            <div className="my-0.5 h-px bg-gray-100 mx-2.5" />
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setAdmOrderStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </span>
              Admission Order
            </button>
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setStudyCertStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </span>
              Study Certificate
            </button>
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setTcStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
              Transfer Certificate
            </button>
            {contextMenu.student.year === '3RD YEAR' && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2 transition-colors duration-100"
                onClick={() => { setPcStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                </span>
                Provisional Certificate
              </button>
            )}
            {contextMenu.student.year === '3RD YEAR' && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2 transition-colors duration-100"
                onClick={() => { setCccStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-100 group-hover:text-violet-600 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                </span>
                Course Completion Certificate
              </button>
            )}
          </div>
        </div>
      </>
    )}

    {detailStudent && (
      <StudentDetailModal
        student={detailStudent}
        onClose={() => setDetailStudent(null)}
      />
    )}

    {studyCertStudent && (
      <StudyCertificateModal
        student={studyCertStudent}
        onClose={() => setStudyCertStudent(null)}
      />
    )}

    {tcStudent && (
      <TransferCertificateModal
        student={tcStudent}
        onClose={() => setTcStudent(null)}
      />
    )}

    {pcStudent && (
      <ProvisionalCertificateModal
        student={pcStudent}
        onClose={() => setPcStudent(null)}
      />
    )}

    {cccStudent && (
      <CourseCompletionCertificateModal
        student={cccStudent}
        onClose={() => setCccStudent(null)}
      />
    )}

    {showManualCert && (
      <ManualCertificateModal onClose={() => setShowManualCert(false)} />
    )}

    {allottedCatStudent && (
      <AllottedCategoryModal
        student={allottedCatStudent}
        saving={savingAllottedCat}
        onSave={(cat) => void handleSaveAllottedCat(cat)}
        onSkip={() => setAllottedCatStudent(null)}
        suggestions={[...new Set(
          allStudents
            .map((s) => s.allottedCategory?.trim() ?? '')
            .filter(Boolean)
        )]}
      />
    )}

    {admOrderStudent && (
      <AdmissionOrderModal
        student={admOrderStudent}
        onClose={() => setAdmOrderStudent(null)}
      />
    )}
    </>
  );
}
