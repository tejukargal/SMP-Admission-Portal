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

// Table column labels — rendered in the fixed header strip and again as an
// invisible zero-height sizer row inside the scrolling body table.
const TABLE_COLUMNS = [
  '#', 'Name (SSLC)', 'Reg No', 'Course', 'Year', 'Gender', 'Category',
  'Adm Cat', 'Allotted Cat', 'Mobile', 'Status', 'Certificates',
];

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

// ── Design tokens — ported from the SMP Student Portal app (light theme) ────
// Department dot colours match the portal's departments.ts.
// Inter (already loaded in index.css) — a crisp, professional UI face.
const PAGE_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
// Colour-coded accents for the thin-line table pills.
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};
const GENDER_COLOR: Record<string, string> = { BOY: '#3B82F6', GIRL: '#EC4899' };
const CATEGORY_COLOR: Record<string, string> = {
  GM: '#64748B', SC: '#F97316', ST: '#EAB308', C1: '#14B8A6',
  '2A': '#6366F1', '2B': '#A855F7', '3A': '#06B6D4', '3B': '#84CC16',
};
const ADM_CAT_COLOR: Record<string, string> = { GM: '#64748B', SNQ: '#10B981', OTHERS: '#F59E0B' };
const STATUS_COLOR: Record<string, string> = { CONFIRMED: '#0FA968', CANCELLED: '#E11D48' };
const STATUS_COLOR_DEFAULT = '#D97706';
const FALLBACK_COLOR = '#8A93A3';
const TH =
  'h-9 px-3 py-0 align-middle text-left text-[9.5px] font-medium uppercase tracking-[0.6px] text-[#4F6B3A] whitespace-nowrap';
const OUTLINE_PILL_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#DCEBCD] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] hover:border-[#5B9A2F]/40 hover:bg-[#5B9A2F]/[0.06] hover:text-[#5B9A2F] focus:outline-none focus:ring-2 focus:ring-[#5B9A2F]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const MENU_ITEM =
  'group w-full text-left px-2 py-1.5 rounded-[10px] text-[12px] font-medium text-[#5B6371] hover:bg-[#F6FAF1] hover:text-[#262B35] flex items-center gap-2.5 transition-colors duration-100';
const MENU_ICON =
  'w-6 h-6 rounded-[8px] bg-[#EEF5E6] text-[#5B6371] flex items-center justify-center flex-shrink-0 transition-colors';

// Outline chip: white fill + tinted hairline; solid colour when selected.
function chipStyle(color: string, selected: boolean): React.CSSProperties {
  return selected
    ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
    : { background: '#fff', borderColor: `${color}59`, color: '#3F4654' };
}

// Hue of each department colour — drives the pastel monogram gradient.
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };

/**
 * Department ring monogram — the student portal's PostAvatar (the department
 * logo on Home's hero cards): a pastel diagonal gradient in the department's
 * hue with deep same-hue initials, a 2px gap, then a thin ring.
 */
function RingAvatar({ name, course }: { name: string; course: string }) {
  const h = DEPT_HUE[course] ?? 210;
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

/**
 * Thin-line pill in the style of the filter chips: white fill, 1px border
 * tinted with the accent colour, a colour dot and (optionally) tinted text.
 */
function LinePill({ value, color, dot = true, tintText = false, title }: {
  value?: string;
  color?: string;
  dot?: boolean;
  tintText?: boolean;
  title?: string;
}) {
  if (!value) return <span className="text-[#C4C8D0] text-[10px]">—</span>;
  const c = color ?? FALLBACK_COLOR;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] text-[11px] font-medium tracking-[0.1px] leading-none"
      style={{ background: '#fff', borderColor: `${c}59`, color: tintText ? c : '#3F4654' }}
      title={title}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />}
      {value}
    </span>
  );
}

function EmptyState({ icon, title, tone, children }: {
  icon: React.ReactNode;
  title: string;
  tone?: 'danger';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 text-center" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <div className={`w-14 h-14 rounded-2xl border border-[#DCEBCD] bg-[#EEF5E6] flex items-center justify-center ${tone === 'danger' ? 'text-[#E11D48]' : 'text-[#8A93A3]'}`}>
        {icon}
      </div>
      <p className={`text-[14px] font-medium ${tone === 'danger' ? 'text-[#E11D48]' : 'text-[#5B6371]'}`}>{title}</p>
      {children && <p className="text-[12px] text-[#8A93A3] max-w-sm">{children}</p>}
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

  // ── Fixed table header ──────────────────────────────────────────────────
  // The header lives outside the scroll area so the vertical scrollbar starts
  // below it. Column widths are measured from the body table's invisible
  // sizer row and mirrored onto the header; horizontal scroll is synced.
  const headScrollRef = useRef<HTMLDivElement>(null);
  const sizerRowRef = useRef<HTMLTableRowElement>(null);
  const [colWidths, setColWidths] = useState<number[]>([]);
  const tableVisible = !error && !!academicYear && filteredStudents.length > 0;

  useLayoutEffect(() => {
    const row = sizerRowRef.current;
    if (!row) return;
    const measure = () => {
      const next = Array.from(row.cells).map((c) => c.getBoundingClientRect().width);
      setColWidths((prev) =>
        prev.length === next.length && prev.every((w, i) => Math.abs(w - next[i]) < 0.5) ? prev : next
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    Array.from(row.cells).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [tableVisible, isAdmin, loading, settingsLoading]);

  const isLoading = settingsLoading || loading;

  if (isLoading) return <PageSpinner />;

  return (
    <>
    <div
      className="-m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ fontFamily: PAGE_FONT, background: 'linear-gradient(160deg, #F9FCF5 0%, #FCFDFA 45%, #F6FAF0 100%)', animation: 'page-enter 0.22s ease-out' }}
    >

      {/* Page header + stat chips */}
      <div className="flex-shrink-0 flex items-center gap-4 min-w-0 relative">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
            SMP Admissions · Working Professional
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <h2 className="text-[22px] font-semibold text-[#262B35] leading-none tracking-[-0.3px]">WP Students</h2>
            {academicYear && (
              <span className="rounded-full border border-[#DCEBCD] bg-white text-[#5B6371] px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums">
                {academicYear}
              </span>
            )}
          </div>
        </div>

        {!isLoading && stats && (
          <>
            <span className="w-px h-8 bg-[#DCEBCD] shrink-0" />
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 py-1">

              {/* Total tile */}
              <div className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border border-[#5B9A2F]/20 bg-[#EEF6E6] px-3.5 py-1 min-w-[58px]">
                <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] text-[#6E8F58] leading-tight">Total</span>
                <span className="text-[16px] font-medium text-[#3F6E1F] leading-tight">
                  <AnimNum value={stats.total} />
                </span>
              </div>

              <span className="w-1 h-1 rounded-full bg-[#C9DDB6] shrink-0 mx-0.5" />

              {/* Study-year chips */}
              {YEARS.map((yr) => {
                const count = stats.yearCount[yr] ?? 0;
                const isSelected = yearFilter.includes(yr);
                const isDimmed = (yearFilter.length > 0 && !isSelected) || count === 0;
                const label = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
                return (
                  <button
                    key={yr}
                    onClick={() => toggleYearFilter(yr)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                      isDimmed && !isSelected ? 'opacity-[0.5] hover:opacity-100' : ''
                    }`}
                    style={chipStyle(YEAR_COLOR[yr], isSelected)}
                  >
                    {!isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: YEAR_COLOR[yr] }} />
                    )}
                    <span>{label}</span>
                    <span className={isSelected ? 'text-white' : 'text-[#262B35]'}>
                      <AnimNum value={count} />
                    </span>
                  </button>
                );
              })}

              <span className="w-1 h-1 rounded-full bg-[#C9DDB6] shrink-0 mx-0.5" />

              {/* Course chips */}
              {COURSES.map((c) => {
                const count = stats.courseCount[c] ?? 0;
                const isSelected = courseFilter.includes(c);
                const isDimmed = (courseFilter.length > 0 && !isSelected) || count === 0;
                return (
                  <button
                    key={c}
                    onClick={() => toggleCourseFilter(c)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                      isDimmed && !isSelected ? 'opacity-[0.5] hover:opacity-100' : ''
                    }`}
                    style={chipStyle(DEPT_DOT[c], isSelected)}
                  >
                    {!isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DEPT_DOT[c] }} />
                    )}
                    <span>{c}</span>
                    <span className={isSelected ? 'text-white' : 'text-[#262B35]'}>
                      <AnimNum value={count} />
                    </span>
                  </button>
                );
              })}

              {/* Filtered count */}
              {hasActiveFilters && (
                <>
                  <span className="w-1 h-1 rounded-full bg-[#C9DDB6] shrink-0 mx-0.5" />
                  <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#5B9A2F]/40 bg-white text-[#5B9A2F] px-3 py-[6px] text-[11px] font-medium whitespace-nowrap">
                    <span>Filtered</span>
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
            className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white border border-[#0FA968]/30 text-[#262B35] text-[11.5px] font-medium pl-1.5 pr-2.5 py-1.5 rounded-full whitespace-nowrap pointer-events-auto shadow-[0_6px_20px_rgba(18,20,26,0.08)]"
            style={{ animation: 'toast-in 0.2s ease-out' }}
          >
            <span className="w-5 h-5 rounded-full bg-[#0FA968]/10 text-[#0FA968] flex items-center justify-center leading-none">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            {toastMsg}
            <button
              onClick={() => setToastMsg('')}
              className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[#8A93A3] hover:text-[#262B35] hover:bg-[#EEF5E6] leading-none"
            >
              ×
            </button>
          </div>
        )}

        <Button
          onClick={() => void navigate('/enroll')}
          className="ml-auto shrink-0 gap-1.5 rounded-full! bg-[#5B9A2F]! hover:bg-[#4C8426]! font-medium! focus:ring-[#5B9A2F]/40! shadow-[0_2px_10px_rgba(91,154,47,0.25)]!"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Enroll Student
        </Button>
      </div>

      {/* Toolbar card — search, filters, actions */}
      <div className="flex-shrink-0 rounded-2xl border border-[#DCEBCD] bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(18,20,26,0.05)]">
        <div className="flex items-center gap-2 px-2.5 py-2">

          {/* Search — reference search bar */}
          <div className="relative shrink-0 w-60">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8A93A3] pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name / reg / mobile…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full rounded-full border border-[#DCEBCD] bg-[#F6FAF1] py-2 text-[14px] font-medium text-[#262B35] placeholder:text-[#8A93A3] placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#5B9A2F] focus:ring-2 focus:ring-[#5B9A2F]/20 transition-all duration-150 pl-9 ${searchTerm ? 'pr-8' : 'pr-3'}`}
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
                    tone="pea"
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
                    tone="pea"
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
                    tone="pea"
                    value={genderFilter}
                    onChange={setGenderFilter}
                    placeholder="Gender"
                    options={[
                      { value: 'BOY', label: 'BOY' },
                      { value: 'GIRL', label: 'GIRL' },
                    ]}
                  />
                  <MultiSelectFilterDropdown<Category>
                    tone="pea"
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
                    tone="pea"
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
              <span className="w-px h-5 bg-[#DCEBCD] shrink-0" />
              <button
                onClick={clearFilters}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#D97706]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#D97706] hover:bg-[#D97706]/[0.16] focus:outline-none focus:ring-2 focus:ring-[#D97706]/30 cursor-pointer transition-colors whitespace-nowrap"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Clear
              </button>
            </>
          )}

          {/* Action buttons */}
          <button
            onClick={() => setShowManualCert(true)}
            title="Issue a Study/Provisional Certificate for a student with no database record (Evening College / Working Professional)"
            className={OUTLINE_PILL_BTN}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
            Manual Certificate
          </button>
          {!isLoading && filteredStudents.length > 0 && (
            <>
              <button
                onClick={handleSavePdf}
                disabled={savingPdf}
                className={OUTLINE_PILL_BTN}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                {savingPdf ? 'Generating…' : 'Save PDF'}
              </button>
              <button
                onClick={handleSaveExcel}
                disabled={savingExcel}
                className={OUTLINE_PILL_BTN}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {savingExcel ? 'Exporting…' : 'Export Excel'}
              </button>
            </>
          )}

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => { const next = !v; localStorage.setItem('smp_wp_filters_visible', String(next)); return next; })}
            className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters || hasNonSearchFilters
                ? 'bg-[#5B9A2F]/10 border-[#5B9A2F]/30 text-[#5B9A2F]'
                : 'border-[#DCEBCD] text-[#5B6371] hover:bg-[#EEF5E6] hover:text-[#262B35]'
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
        <EmptyState
          tone="danger"
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
          title={error}
        />
      ) : !academicYear ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          title="Please configure an academic year in Settings first."
        />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          title="No WP students found."
        >
          {!hasActiveFilters && (
            <>
              Enroll with Adm Type <span className="font-medium text-[#5B6371]">EXTERNAL</span>, then confirm from the Admissions page.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#DCEBCD] overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(18,20,26,0.05)]">
          {/* Fixed header strip — outside the scroller, so the scrollbar starts below it */}
          <div
            ref={headScrollRef}
            className="flex-shrink-0 overflow-hidden"
            style={{ scrollbarGutter: 'stable', background: 'linear-gradient(90deg, #EAF4E0 0%, #F1F7E9 55%, #E9F5EC 100%)', boxShadow: 'inset 0 -1px 0 #D5E8C4' }}
          >
            <table className="text-xs" style={{ tableLayout: 'fixed', width: colWidths.reduce((a, w) => a + w, 0) || '100%' }}>
              <colgroup>
                {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  {TABLE_COLUMNS.map((label) => <th key={label} className={TH}>{label}</th>)}
                  {isAdmin && <th className={TH}>Actions</th>}
                </tr>
              </thead>
            </table>
          </div>

          {/* Scrolling body */}
          <div
            className="scroll-pea flex-1 min-h-0 overflow-auto"
            style={{ scrollbarGutter: 'stable' }}
            onScroll={(e) => {
              if (headScrollRef.current) headScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }}
          >
          <table className="min-w-full text-xs">
            {/* Invisible zero-height sizer row: gives the body the header labels'
                widths and is what the fixed header measures. */}
            <thead aria-hidden="true">
              <tr ref={sizerRowRef} className="invisible">
                {TABLE_COLUMNS.map((label) => (
                  <th key={label} className={`${TH} h-0! py-0! leading-[0]!`}>{label}</th>
                ))}
                {isAdmin && <th className={`${TH} h-0! py-0! leading-[0]!`}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF4E7]">
              {visibleStudents.map((student, idx) => {
                const isMenuRow = contextMenu?.student.id === student.id;
                return (
                <tr
                  key={`${student.id}-${debouncedSearch}`}
                  className={`group transition-colors cursor-context-menu ${
                    isMenuRow
                      ? 'bg-[#5B9A2F]/[0.09]'
                      : 'hover:bg-[#5B9A2F]/[0.05]'
                  }`}
                  onContextMenu={(e) => handleContextMenu(e, student)}
                  style={debouncedSearch ? { animation: `content-enter 0.2s ease-out ${Math.min(idx * 0.03, 0.3)}s both` } : undefined}
                >
                  <td className="relative px-3 py-2 text-[11px] font-medium text-[#8A93A3] tabular-nums whitespace-nowrap">
                    <span
                      className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[#5B9A2F] transition-opacity ${
                        isMenuRow ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    />
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <RingAvatar name={student.studentNameSSLC} course={student.course} />
                      <span className="text-[12.5px] font-normal text-[#262B35]">{student.studentNameSSLC}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371] tabular-nums whitespace-nowrap">{student.regNumber || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <LinePill value={student.course} color={DEPT_DOT[student.course]} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap"><LinePill value={student.year} color={YEAR_COLOR[student.year]} /></td>
                  <td className="px-3 py-2 whitespace-nowrap"><LinePill value={student.gender} color={GENDER_COLOR[student.gender]} /></td>
                  <td className="px-3 py-2 whitespace-nowrap"><LinePill value={student.category} color={CATEGORY_COLOR[student.category]} /></td>
                  <td className="px-3 py-2 whitespace-nowrap"><LinePill value={student.admCat} color={ADM_CAT_COLOR[student.admCat]} /></td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {student.allottedCategory ? (
                      student.allottedCategory !== student.category ? (
                        <LinePill
                          value={student.allottedCategory}
                          color="#D97706"
                          tintText
                          title={`Claimed: ${student.category}`}
                        />
                      ) : (
                        <LinePill value={student.allottedCategory} color={CATEGORY_COLOR[student.allottedCategory]} />
                      )
                    ) : (
                      isAdmin ? (
                        <button
                          onClick={() => setAllottedCatStudent(student)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#5B9A2F]/50 bg-white text-[#5B9A2F] hover:bg-[#5B9A2F]/[0.06] hover:border-solid px-2 py-[3px] text-[10px] font-medium leading-none cursor-pointer transition-colors"
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Set
                        </button>
                      ) : (
                        <span className="text-[#C4C8D0] text-[10px]">—</span>
                      )
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371] tabular-nums whitespace-nowrap">{student.studentMobile}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <LinePill
                        value={student.admissionStatus}
                        color={STATUS_COLOR[student.admissionStatus] ?? STATUS_COLOR_DEFAULT}
                        tintText
                      />
                      {student.transferredIn && (
                        <LinePill
                          value="TRF IN"
                          color="#7C3AED"
                          dot={false}
                          tintText
                          title={student.transferInPolytechnic ? `From: ${student.transferInPolytechnic}` : undefined}
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {(() => {
                      const { tc, pc } = certCounts(student);
                      if (!tc && !pc) return <span className="text-[#C4C8D0] text-[10px]">—</span>;
                      return (
                        <span className="flex items-center gap-1">
                          {tc > 0 && (
                            <LinePill
                              value={`TC${tc > 1 ? ` ×${tc}` : ''}`}
                              color="#4F46E5"
                              dot={false}
                              tintText
                              title={`${tc} Transfer Certificate${tc > 1 ? 's' : ''} issued`}
                            />
                          )}
                          {pc > 0 && (
                            <LinePill
                              value={`PC${pc > 1 ? ` ×${pc}` : ''}`}
                              color="#7C3AED"
                              dot={false}
                              tintText
                              title={`${pc} Provisional Certificate${pc > 1 ? 's' : ''} issued`}
                            />
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        onClick={() => void navigate(`/enroll?edit=${student.id}`, { state: { student } })}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#DCEBCD] bg-white px-2.5 py-1 text-[11px] font-medium text-[#5B6371] hover:border-[#5B9A2F]/40 hover:bg-[#5B9A2F]/[0.06] hover:text-[#5B9A2F] focus:outline-none focus:ring-2 focus:ring-[#5B9A2F]/30 cursor-pointer transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
                );
              })}

              {hasMore && (
                <tr>
                  <td colSpan={isAdmin ? 13 : 12} className="px-4 py-3 text-center">
                    <button
                      className={OUTLINE_PILL_BTN}
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredStudents.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <div className="flex-shrink-0 px-4 py-2 border-t border-[#D5E8C4] bg-[#F5FAF0] text-[11px] font-medium text-[#8A93A3]">
            Showing <span className="font-medium text-[#262B35] tabular-nums">{Math.min(visibleCount, filteredStudents.length)}</span> of <span className="font-medium text-[#262B35] tabular-nums">{filteredStudents.length}</span>
            {stats && filteredStudents.length < stats.total && (
              <span> (filtered from {stats.total} total)</span>
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
          className="fixed z-50 bg-white border border-[#DCEBCD] rounded-2xl overflow-hidden min-w-[232px]"
          style={{ fontFamily: PAGE_FONT, left: contextMenu.x, top: contextMenu.y, visibility: 'hidden', boxShadow: '0 12px 36px rgba(18,20,26,0.12), 0 2px 8px rgba(18,20,26,0.05)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-[#D5E8C4] bg-[#F1F7EA] flex items-center gap-3">
            <RingAvatar name={contextMenu.student.studentNameSSLC} course={contextMenu.student.course} />
            <div className="min-w-0">
              <p className="text-[9px] font-medium uppercase tracking-[0.8px] text-[#8A93A3] leading-none">
                {contextMenu.student.course} · {contextMenu.student.year}
              </p>
              <p className="mt-1 text-[12px] font-medium text-[#262B35] truncate leading-none">{contextMenu.student.studentNameSSLC}</p>
            </div>
          </div>
          {/* Items */}
          <div className="p-1">
            <button
              className={MENU_ITEM}
              onClick={() => { setDetailStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#4F46E5]/10 group-hover:text-[#4F46E5]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
              </span>
              View Details
            </button>
            {isAdmin && (
              <button
                className={MENU_ITEM}
                onClick={() => { setAllottedCatStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className={`${MENU_ICON} group-hover:bg-[#7C3AED]/10 group-hover:text-[#7C3AED]`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
                </span>
                <span>Allotted Category</span>
                {contextMenu.student.allottedCategory ? (
                  <span className="ml-auto">
                    <LinePill
                      value={contextMenu.student.allottedCategory}
                      color={CATEGORY_COLOR[contextMenu.student.allottedCategory]}
                    />
                  </span>
                ) : (
                  <span className="ml-auto">
                    <LinePill value="Not set" color="#D97706" dot={false} tintText />
                  </span>
                )}
              </button>
            )}
            <div className="my-1 h-px bg-[#EEF4E7] mx-2" />
            <button
              className={MENU_ITEM}
              onClick={() => { setAdmOrderStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#4F46E5]/10 group-hover:text-[#4F46E5]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </span>
              Admission Order
            </button>
            <button
              className={MENU_ITEM}
              onClick={() => { setStudyCertStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#5B9A2F]/10 group-hover:text-[#5B9A2F]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </span>
              Study Certificate
            </button>
            <button
              className={MENU_ITEM}
              onClick={() => { setTcStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#5B9A2F]/10 group-hover:text-[#5B9A2F]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
              Transfer Certificate
            </button>
            {contextMenu.student.year === '3RD YEAR' && (
              <button
                className={MENU_ITEM}
                onClick={() => { setPcStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className={`${MENU_ICON} group-hover:bg-[#5B9A2F]/10 group-hover:text-[#5B9A2F]`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                </span>
                Provisional Certificate
              </button>
            )}
            {contextMenu.student.year === '3RD YEAR' && (
              <button
                className={MENU_ITEM}
                onClick={() => { setCccStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className={`${MENU_ICON} group-hover:bg-[#7C3AED]/10 group-hover:text-[#7C3AED]`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
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
