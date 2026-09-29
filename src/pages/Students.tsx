import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { updateStudentAllottedCategory, updateStudentTransferOut } from '../services/studentService';
import { getFeeRecordsByAcademicYear } from '../services/feeRecordService';
import { createStudentNotification } from '../services/studentNotificationService';
import { MultiSelectFilterDropdown } from '../components/common/MultiSelectFilterDropdown';
import { useFilters } from '../contexts/FiltersContext';
import { useAuth } from '../contexts/AuthContext';
import { exportStudentsPdf } from '../utils/studentsPdf';
import { isConfirmedActive } from '../utils/studentStatus';
import { isWPStudent } from '../utils/wpStudent';
import { ManageDocumentsModal } from '../components/documents/ManageDocumentsModal';
import { PrintProfileModal } from '../components/student/PrintProfileModal';
import { AnsLetterPreviewModal } from '../components/student/AnsLetterPreviewModal';
import { StudentDetailModal } from '../components/student/StudentDetailModal';
import { StudyCertificateModal } from '../components/common/StudyCertificateModal';
import { TransferCertificateModal } from '../components/common/TransferCertificateModal';
import { ProvisionalCertificateModal } from '../components/common/ProvisionalCertificateModal';
import { CourseCompletionCertificateModal } from '../components/common/CourseCompletionCertificateModal';
import { ManualCertificateModal } from '../components/common/ManualCertificateModal';
import { AdmissionOrderModal } from '../components/common/AdmissionOrderModal';
import { MissingDocsModal } from '../components/documents/MissingDocsModal';
import { AllottedCategoryModal } from '../components/common/AllottedCategoryModal';
import { SnqRefundModal } from '../components/common/SnqRefundModal';
import { Modal } from '../components/common/Modal';
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category } from '../types';
import { PageSpinner } from '../components/common/PageSpinner';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };


// ── Design tokens — student-portal look, ocean blue ───────────────────────────
const OCEAN = '#0B7BC0';
const OCEAN_INK = '#075E93';
const MINT = '#0FA968';
const CORAL = '#E11D48';
const AMBER = '#D97706';
const FALLBACK_COLOR = '#8A93A3';

const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};
const ADM_TYPE_COLOR: Record<string, string> = {
  REGULAR: '#1D6FD8', REPEATER: '#D97706', LATERAL: '#7C3AED', EXTERNAL: '#0F8B8D', SNQ: '#10B981',
};
const ADM_CAT_COLOR: Record<string, string> = { GM: '#5B9A2F', SNQ: '#10B981', OTHERS: '#F59E0B' };
const CATEGORY_COLOR: Record<string, string> = {
  GM: '#64748B', SC: '#0EA5E9', ST: '#14B8A6', C1: '#F59E0B', '2A': '#8B5CF6', '2B': '#EC4899', '3A': '#6366F1', '3B': '#10B981',
};
const GENDER_COLOR: Record<string, string> = { BOY: '#0EA5E9', GIRL: '#EC4899' };
const STATUS_COLOR: Record<string, string> = { CONFIRMED: MINT, CANCELLED: CORAL };

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

// Outline chip: white fill + tinted hairline and ink; solid colour when selected.
function chipStyle(color: string, selected: boolean): React.CSSProperties {
  return selected
    ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
    : { background: '#fff', borderColor: `${color}73`, color: inkOf(color) };
}

const OUTLINE_PILL_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#CFE3F2] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] hover:border-[#0B7BC0]/40 hover:bg-[#0B7BC0]/[0.06] hover:text-[#075E93] focus:outline-none focus:ring-2 focus:ring-[#0B7BC0]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const CHIP_ARROW =
  'shrink-0 w-6 h-6 rounded-full border border-[#0B7BC0]/40 bg-white text-[#075E93] flex items-center justify-center shadow-[0_1px_4px_rgba(18,20,26,0.06)] enabled:hover:bg-[#EEF6FC] enabled:cursor-pointer disabled:opacity-35 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7BC0]/30 transition-[opacity,background-color]';
// Icon-only variant of the toolbar actions, used while the filter row is open
// so the dropdowns fit on the same line (label moves to the tooltip).
const ICON_PILL_BTN =
  'shrink-0 w-[30px] h-[30px] inline-flex items-center justify-center rounded-full border border-[#CFE3F2] bg-white text-[#075E93] hover:border-[#0B7BC0]/40 hover:bg-[#0B7BC0]/[0.06] focus:outline-none focus:ring-2 focus:ring-[#0B7BC0]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const MENU_ITEM =
  'group w-full text-left px-2 py-1.5 rounded-[10px] text-[12px] font-medium text-[#5B6371] hover:bg-[#F3F9FD] hover:text-[#262B35] cursor-pointer flex items-center gap-2.5 transition-colors duration-100';
const MENU_ICON =
  'w-6 h-6 rounded-[8px] bg-[#EEF6FC] text-[#5B6371] flex items-center justify-center flex-shrink-0 transition-colors';
const MENU_SEP = <div className="my-1 h-px bg-[#E6F0F8] mx-2" />;

// Main table: sticky header band + cells. The band colours are mirrored in
// index.css (.scroll-students) for the scrollbar gutter beside the header.
const TH =
  'h-9 px-3 py-0 align-middle text-left text-[9.5px] font-medium uppercase tracking-[0.6px] whitespace-nowrap bg-[#E6F1FA] border-b border-[#C3DCEF] text-[#075E93]';
const TD = 'px-3 py-2 whitespace-nowrap';
const TD_NUM = 'px-3 py-2 whitespace-nowrap text-[11.5px] font-medium text-black tabular-nums';

/** Department ring monogram — pastel gradient in the department's hue with a thin ring. */
function RingAvatar({ name, course, size = 22 }: { name: string; course: string; size?: number }) {
  const h = DEPT_HUE[course] ?? 205;
  const ring = DEPT_DOT[course] ?? FALLBACK_COLOR;
  return (
    <span
      className="rounded-full flex items-center justify-center shrink-0 font-medium tracking-[0.3px]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.43),
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
function LinePill({ value, color, minWidth, title }: { value?: string | null; color?: string; minWidth?: number; title?: string }) {
  if (!value) return <span className="text-[#C4C8D0] text-[10px]">—</span>;
  const c = color ?? FALLBACK_COLOR;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border px-[7px] py-[4.5px] text-[10.5px] font-medium leading-none whitespace-nowrap"
      style={{ background: `${c}14`, borderColor: `${c}73`, color: inkOf(c), minWidth }}
      title={title}
    >
      {value}
    </span>
  );
}

function EmptyState({ title, tone = 'muted' }: { title: string; tone?: 'muted' | 'error' }) {
  const isError = tone === 'error';
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 text-center" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <div
        className="w-14 h-14 rounded-2xl border flex items-center justify-center"
        style={isError
          ? { borderColor: `${CORAL}40`, background: `${CORAL}0F`, color: CORAL }
          : { borderColor: '#CFE3F2', background: '#EEF6FC', color: '#8A93A3' }}
      >
        {isError ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        )}
      </div>
      <p className="text-[14px] font-medium" style={{ color: isError ? inkOf(CORAL) : '#5B6371' }}>{title}</p>
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

function LoadingGate() {
  return <PageSpinner />;
}

export function Students() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const { studentsFilters, setStudentsFilters, clearStudentsFilters } = useFilters();

  const {
    searchTerm,
    courseFilter,
    yearFilter,
    genderFilter,
    categoryFilter,
    admTypeFilter,
    admCatFilter,
    visibleCount,
  } = studentsFilters;

  function setSearchTerm(v: string) { setStudentsFilters({ searchTerm: v }); }
  function setCourseFilter(v: Course[]) { setStudentsFilters({ courseFilter: v }); }
  function setYearFilter(v: Year[]) { setStudentsFilters({ yearFilter: v }); }
  function setGenderFilter(v: Gender[]) { setStudentsFilters({ genderFilter: v }); }
  function setCategoryFilter(v: Category[]) { setStudentsFilters({ categoryFilter: v }); }
  function setAdmTypeFilter(v: AdmType[]) { setStudentsFilters({ admTypeFilter: v }); }
  function setAdmCatFilter(v: AdmCat[]) { setStudentsFilters({ admCatFilter: v }); }
  function toggleYearFilter(yr: Year) {
    setYearFilter(yearFilter.includes(yr) ? yearFilter.filter((y) => y !== yr) : [...yearFilter, yr]);
  }
  function toggleCourseFilter(c: Course) {
    setCourseFilter(courseFilter.includes(c) ? courseFilter.filter((x) => x !== c) : [...courseFilter, c]);
  }
  function setVisibleCount(updater: ((c: number) => number) | number) {
    const next = typeof updater === 'function' ? updater(visibleCount) : updater;
    setStudentsFilters({ visibleCount: next });
  }

  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [savingPdf, setSavingPdf] = useState(false);
  const [savingExcel, setSavingExcel] = useState(false);

  // Toast for post-edit success message passed via router state
  const [toastMsg, setToastMsg] = useState<string>(() => {
    const state = location.state as { updatedName?: string } | null;
    return state?.updatedName ? `${state.updatedName} updated successfully!` : '';
  });
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [docsModalStudent, setDocsModalStudent] = useState<Student | null>(null);
  const [printProfileStudent, setPrintProfileStudent] = useState<Student | null>(null);
  const [showMissingDocs, setShowMissingDocs] = useState(false);
  const [ansLetterStudent, setAnsLetterStudent] = useState<Student | null>(null);
  const [studyCertStudent, setStudyCertStudent] = useState<Student | null>(null);
  const [tcStudent, setTcStudent] = useState<Student | null>(null);
  const [pcStudent, setPcStudent] = useState<Student | null>(null);
  const [cccStudent, setCccStudent] = useState<Student | null>(null);
  const [showManualCert, setShowManualCert] = useState(false);
  const [allottedCatStudent, setAllottedCatStudent] = useState<Student | null>(null);
  const [savingAllottedCat, setSavingAllottedCat] = useState(false);
  const [admOrderStudent, setAdmOrderStudent] = useState<Student | null>(null);
  const [refundStudent, setRefundStudent] = useState<Student | null>(null);
  const [showFilters, setShowFilters] = useState(() => localStorage.getItem('smp_students_filters_visible') === 'true');
  const [sortByRecent, setSortByRecent] = useState(false);
  const [firstPaymentByStudent, setFirstPaymentByStudent] = useState<Map<string, string>>(new Map());

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

  // Single unfiltered fetch — all filtering done client-side
  const { students: allStudents, loading, error, refetch } = useStudents(academicYear);

  // WP (Working Professional / EXTERNAL) admissions are managed on /wp-students
  // and are excluded from this page and its stats.
  const nonWpStudents = useMemo(() => allStudents.filter((s) => !isWPStudent(s)), [allStudents]);

  // Marking Transfer Out captures a polytechnic name via a small modal; clearing needs no input.
  const [transferOutStudent, setTransferOutStudent] = useState<Student | null>(null);
  const [transferOutPolytechnicInput, setTransferOutPolytechnicInput] = useState('');
  const [savingTransferOut, setSavingTransferOut] = useState(false);

  async function handleClearTransferOut(student: Student) {
    setContextMenu(null);
    try {
      await updateStudentTransferOut(student.id, false);
      refetch();
    } catch (err) {
      console.error('Failed to clear transfer-out status', err);
    }
  }

  async function handleConfirmTransferOut() {
    if (!transferOutStudent) return;
    setSavingTransferOut(true);
    try {
      await updateStudentTransferOut(transferOutStudent.id, true, transferOutPolytechnicInput.trim() || undefined);
      refetch();
    } catch (err) {
      console.error('Failed to mark transfer-out status', err);
    } finally {
      setSavingTransferOut(false);
      setTransferOutStudent(null);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Fee-paid dates — fetched only when "sort by recent" is toggled on, since it's
  // an extra Firestore read not needed for the default view.
  useEffect(() => {
    if (!sortByRecent || !academicYear) return;
    let cancelled = false;
    getFeeRecordsByAcademicYear(academicYear).then((records) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const r of records) {
        const existing = map.get(r.studentId);
        if (!existing || r.date < existing) map.set(r.studentId, r.date);
      }
      setFirstPaymentByStudent(map);
    });
    return () => { cancelled = true; };
  }, [sortByRecent, academicYear]);

  const filteredStudents = useMemo(() => {
    let result = allStudents.filter((s) => isConfirmedActive(s) && !isWPStudent(s));
    if (courseFilter.length)    result = result.filter((s) => courseFilter.includes(s.course));
    if (yearFilter.length)      result = result.filter((s) => yearFilter.includes(s.year));
    if (genderFilter.length)    result = result.filter((s) => genderFilter.includes(s.gender));
    if (categoryFilter.length)  result = result.filter((s) => categoryFilter.includes(s.category));
    if (admTypeFilter.length)   result = result.filter((s) => admTypeFilter.includes(s.admType));
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
      if (sortByRecent) {
        const pa = firstPaymentByStudent.get(a.id);
        const pb = firstPaymentByStudent.get(b.id);
        if (pa && pb) return pb.localeCompare(pa);
        if (pa && !pb) return -1;
        if (!pa && pb) return 1;
      }
      const y = (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9);
      if (y !== 0) return y;
      const c = a.course.localeCompare(b.course);
      if (c !== 0) return c;
      return a.studentNameSSLC.localeCompare(b.studentNameSSLC);
    });
  }, [allStudents, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, debouncedSearch, sortByRecent, firstPaymentByStudent]);

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
    categoryFilter.length > 0 || admTypeFilter.length > 0 || admCatFilter.length > 0;

  const hasNonSearchFilters =
    courseFilter.length > 0 || yearFilter.length > 0 || genderFilter.length > 0 ||
    categoryFilter.length > 0 || admTypeFilter.length > 0 || admCatFilter.length > 0;

  useEffect(() => {
    if (hasNonSearchFilters) setShowFilters(true);
  }, [hasNonSearchFilters]);

  function clearFilters() {
    clearStudentsFilters();
    setDebouncedSearch('');
  }

  // Stats from confirmed students only
  const stats = useMemo(() => {
    const confirmed = allStudents.filter((s) => isConfirmedActive(s) && !isWPStudent(s));
    if (!confirmed.length) return null;
    const yearCount: Record<string, number> = {};
    const courseCount: Record<string, number> = {};
    for (const s of confirmed) {
      yearCount[s.year] = (yearCount[s.year] ?? 0) + 1;
      courseCount[s.course] = (courseCount[s.course] ?? 0) + 1;
    }
    return { yearCount, courseCount, total: confirmed.length };
  }, [allStudents]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const recentlyEnrolled = useMemo(() => {
    return allStudents
      .filter(s => s.admissionStatus === 'CONFIRMED' && !isWPStudent(s) && s.updatedAt.startsWith(todayStr))
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 2);
  }, [allStudents, todayStr]);

  function handleSavePdf() {
    setSavingPdf(true);
    // Defer to next tick so the button state renders before the synchronous PDF work
    setTimeout(() => {
      try {
        exportStudentsPdf(
          filteredStudents,
          {
            academicYear,
            courseFilter: courseFilter.join('/'),
            yearFilter: yearFilter.join('/'),
            genderFilter: genderFilter.join('/'),
            admTypeFilter: admTypeFilter.join('/'),
            admCatFilter: admCatFilter.join('/'),
            admStatusFilter: 'CONFIRMED',
            searchTerm: debouncedSearch,
          },
          sortByRecent ? firstPaymentByStudent : undefined,
        );
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
          'Course', 'Year', 'Adm Type', 'Adm Cat', 'Reg No',
          'Student Mobile', 'Father Mobile',
          'Address', 'Town', 'Taluk', 'District',
          'SSLC Max', 'SSLC Obtained',
          'Maths Max', 'Maths Obtained', 'Science Max', 'Science Obtained',
          'M+S Max', 'M+S Obtained',
          'PUC %', 'ITI %', 'Annual Income',
          'Merit No', 'Enrollment Date', 'Admission Status', 'Academic Year',
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
          s.regNumber || '',
          s.studentMobile || '',
          s.fatherMobile || '',
          s.address,
          s.town,
          s.taluk,
          s.district,
          s.sslcMaxTotal,
          s.sslcObtainedTotal,
          s.mathsMax,
          s.mathsObtained,
          s.scienceMax,
          s.scienceObtained,
          s.mathsScienceMaxTotal,
          s.mathsScienceObtainedTotal,
          s.pucPercentage,
          s.itiPercentage,
          s.annualIncome,
          s.meritNumber || '',
          s.enrollmentDate,
          s.admissionStatus,
          s.academicYear,
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        XLSX.writeFile(wb, `Students_${academicYear ?? 'export'}.xlsx`);
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

  // Header chip strip: single line between two always-visible arrow buttons;
  // each arrow dims when there is nothing more to see on its side.
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [chipOverflow, setChipOverflow] = useState({ left: false, right: false });
  const hasStats = !!stats;
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
  }, [hasStats, isLoading, hasActiveFilters]);

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

  if (isLoading) return <LoadingGate />;

  return (
    <>
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: 'linear-gradient(160deg, #F5FAFE 0%, #FCFEFF 45%, #F0F7FC 100%)', animation: 'page-enter 0.22s ease-out' }}
    >

      {/* Page header + stats chips */}
      <div className="flex-shrink-0 flex items-center gap-4 min-w-0 relative">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
            SMP Admissions · Students
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <h2 className="text-[22px] font-bold text-[#075E93] leading-none tracking-[-0.3px]">Students</h2>
            {academicYear && (
              <span className="rounded-full border border-[#0B7BC0]/40 bg-white text-[#075E93] px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums">
                {academicYear}
              </span>
            )}
          </div>
        </div>

        {!isLoading && stats && (
          <>
            <span className="w-px h-8 bg-[#CFE3F2] shrink-0 self-center" />
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {/* Total tile */}
              <div className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border border-[#0B7BC0]/20 bg-[#EAF3FB] px-3.5 py-1 min-w-[58px]">
                <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] text-[#4C87B3] leading-tight">Total</span>
                <span className="text-[16px] font-medium text-[#075E93] leading-tight">
                  <AnimNum value={stats.total} />
                </span>
              </div>

              {/* Filtered count */}
              {hasActiveFilters && (
                <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#0B7BC0]/40 bg-white text-[#075E93] px-3 py-[6px] text-[11px] font-medium whitespace-nowrap">
                  <span>Filtered</span>
                  <AnimNum value={filteredStudents.length} />
                </div>
              )}

              {/* Arrows stay put on both sides; the chips between them scroll */}
              <button type="button" onClick={() => scrollChips(-1)} disabled={!chipOverflow.left} className={`${CHIP_ARROW} ml-1`} aria-label="Scroll chips left">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div ref={chipScrollRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">

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
                      {!isSelected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: YEAR_COLOR[yr] }} />}
                      <span>{label}</span>
                      <AnimNum value={count} />
                    </button>
                  );
                })}

                <span className="w-1 h-1 rounded-full bg-[#BBD7EC] shrink-0 mx-0.5" />

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
                      {!isSelected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DEPT_DOT[c] }} />}
                      <span>{c}</span>
                      <AnimNum value={count} />
                    </button>
                  );
                })}

                {/* Recently Paid toggle */}
                {!isLoading && allStudents.length > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-[#BBD7EC] shrink-0 mx-0.5" />
                    <button
                      onClick={() => setSortByRecent((v) => !v)}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97]"
                      style={chipStyle(OCEAN, sortByRecent)}
                      title="Sort by most recent fee payment date"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20V4M12 4l-6 6M12 4l6 6"/>
                      </svg>
                      Recently Paid
                    </button>
                  </>
                )}
              </div>
              <button type="button" onClick={() => scrollChips(1)} disabled={!chipOverflow.right} className={CHIP_ARROW} aria-label="Scroll chips right">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          </>
        )}

        {/* Success toast — centred in the header bar */}
        {toastMsg && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap pointer-events-auto bg-white"
            style={{ animation: 'toast-in 0.2s ease-out', borderColor: `${MINT}66`, color: inkOf(MINT), boxShadow: `0 4px 14px ${MINT}26` }}
          >
            <span className="w-4 h-4 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: MINT }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
            {toastMsg}
            <button
              onClick={() => setToastMsg('')}
              className="ml-1 leading-none opacity-60 hover:opacity-100 cursor-pointer"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        <button
          onClick={() => void navigate('/enroll')}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium text-white hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7BC0]/40 focus-visible:ring-offset-2 cursor-pointer transition-[filter]"
          style={{ background: `linear-gradient(135deg, ${OCEAN}, ${OCEAN_INK})`, boxShadow: `0 3px 10px ${OCEAN}40` }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Enroll Student
        </button>
      </div>

      {/* Toolbar card — search + filters + actions */}
      <div className="flex-shrink-0 rounded-2xl border border-[#CFE3F2] bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(11,60,94,0.05)]">
        <div className="flex items-center gap-2 px-2.5 py-2">

          {/* Search */}
          <div className="relative shrink-0 w-56">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#075E93] pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name / reg / mobile…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full rounded-full border border-[#0B7BC0]/40 bg-[#F3F9FD] py-2 text-[14px] font-medium text-[#075E93] placeholder:text-[#075E93]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#0B7BC0] focus:ring-2 focus:ring-[#0B7BC0]/20 transition-all duration-150 pl-9 ${searchTerm ? 'pr-8' : 'pr-3'}`}
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

          {/* Collapsible filter selects */}
          <div className="flex-1 min-w-0">
            <div
              className="grid"
              style={{
                gridTemplateColumns: showFilters ? 'minmax(0, 1fr)' : '0fr',
                opacity: showFilters ? 1 : 0,
                transition: 'grid-template-columns 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-px py-0.5">
                  <MultiSelectFilterDropdown<Course>
                    tone="ocean"
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
                    tone="ocean"
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
                    tone="ocean"
                    value={genderFilter}
                    onChange={setGenderFilter}
                    placeholder="Gender"
                    options={[
                      { value: 'BOY', label: 'BOY' },
                      { value: 'GIRL', label: 'GIRL' },
                    ]}
                  />
                  <MultiSelectFilterDropdown<Category>
                    tone="ocean"
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
                  <MultiSelectFilterDropdown<AdmType>
                    tone="ocean"
                    value={admTypeFilter}
                    onChange={setAdmTypeFilter}
                    placeholder="Adm Type"
                    options={[
                      { value: 'REGULAR', label: 'REGULAR' },
                      { value: 'REPEATER', label: 'REPEATER' },
                      { value: 'LATERAL', label: 'LATERAL' },
                      { value: 'EXTERNAL', label: 'EXTERNAL' },
                    ]}
                  />
                  <MultiSelectFilterDropdown<AdmCat>
                    tone="ocean"
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
              <span className="w-px h-5 bg-[#CFE3F2] shrink-0" />
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
          {!isLoading && allStudents.length > 0 && (
            <button
              onClick={() => setShowMissingDocs(true)}
              className={showFilters ? ICON_PILL_BTN : OUTLINE_PILL_BTN}
              title={showFilters ? 'Doc Status' : undefined}
              aria-label="Doc Status"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              {!showFilters && 'Doc Status'}
            </button>
          )}
          <button
            onClick={() => setShowManualCert(true)}
            title={`${showFilters ? 'Manual Certificate — ' : ''}Issue a Study/Provisional Certificate for a student with no database record (Evening College / Working Professional)`}
            aria-label="Manual Certificate"
            className={showFilters ? ICON_PILL_BTN : OUTLINE_PILL_BTN}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            {!showFilters && 'Manual Certificate'}
          </button>
          {!isLoading && filteredStudents.length > 0 && (
            <>
              <button
                onClick={handleSavePdf}
                disabled={savingPdf}
                className={`${showFilters ? ICON_PILL_BTN : OUTLINE_PILL_BTN} ${savingPdf ? 'animate-pulse' : ''}`}
                title={showFilters ? (savingPdf ? 'Generating…' : 'Save PDF') : undefined}
                aria-label="Save PDF"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {!showFilters && (savingPdf ? 'Generating…' : 'Save PDF')}
              </button>
              <button
                onClick={handleSaveExcel}
                disabled={savingExcel}
                className={`${showFilters ? ICON_PILL_BTN : OUTLINE_PILL_BTN} ${savingExcel ? 'animate-pulse' : ''}`}
                title={showFilters ? (savingExcel ? 'Exporting…' : 'Export Excel') : undefined}
                aria-label="Export Excel"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11"/></svg>
                {!showFilters && (savingExcel ? 'Exporting…' : 'Export Excel')}
              </button>
            </>
          )}

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => { const next = !v; localStorage.setItem('smp_students_filters_visible', String(next)); return next; })}
            className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters || hasNonSearchFilters
                ? 'bg-[#0B7BC0]/10 border-[#0B7BC0]/30 text-[#0B7BC0]'
                : 'border-[#CFE3F2] text-[#5B6371] hover:bg-[#EEF6FC] hover:text-[#262B35]'
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

      {/* Recently Enrolled — filter-independent quick-access cards */}
      {recentlyEnrolled.length > 0 && (
        <div
          className="flex-shrink-0 rounded-2xl border border-[#CFE3F2] bg-white px-3 py-2.5"
          style={{ background: 'linear-gradient(135deg, #EEF6FC 0%, #FFFFFF 60%)', animation: 'content-enter 0.26s ease-out' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: MINT, boxShadow: `0 0 0 3px ${MINT}26` }} />
            <span className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#075E93]">Recently Enrolled</span>
            <span className="rounded-full border border-[#0B7BC0]/40 bg-white text-[#075E93] px-2 py-[2px] text-[10px] font-medium leading-none tabular-nums">
              {recentlyEnrolled.length}
            </span>
            <span className="ml-auto text-[10.5px] font-medium text-[#8A93A3] tabular-nums">Today · {todayStr}</span>
          </div>
          <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar">
            {recentlyEnrolled.map((student) => {
              const active = contextMenu?.student.id === student.id;
              return (
                <div
                  key={student.id}
                  className={`shrink-0 min-w-[260px] max-w-[340px] flex items-center gap-3 rounded-xl border bg-white px-3 py-2 cursor-context-menu transition-[box-shadow,border-color] duration-150 hover:shadow-[0_4px_14px_rgba(11,60,94,0.08)] ${
                    active ? 'border-[#0B7BC0] shadow-[0_0_0_3px_rgba(11,123,192,0.15)]' : 'border-[#CFE3F2] hover:border-[#0B7BC0]/45'
                  }`}
                  onContextMenu={(e) => handleContextMenu(e, student)}
                  title="Right-click for actions"
                >
                  <RingAvatar name={student.studentNameSSLC} course={student.course} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[12.5px] font-semibold text-[#075E93] truncate">{student.studentNameSSLC}</p>
                      <LinePill value="New" color={MINT} />
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-black tabular-nums">{student.regNumber || '—'}</span>
                      <LinePill value={student.course} color={DEPT_DOT[student.course]} />
                      <LinePill value={student.year} color={YEAR_COLOR[student.year]} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table area — the only thing that scrolls */}
      {error ? (
        <EmptyState tone="error" title={error} />
      ) : !academicYear ? (
        <EmptyState title="Please configure an academic year in Settings first." />
      ) : filteredStudents.length === 0 ? (
        <EmptyState title="No students found." />
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CFE3F2] overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(11,60,94,0.06)]">
          <div className="scroll-students flex-1 min-h-0 overflow-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${TH} w-8`}>#</th>
                <th className={TH}>Name (SSLC)</th>
                <th className={`${TH} w-24`}>Reg No</th>
                <th className={`${TH} w-14`}>Course</th>
                <th className={`${TH} w-20`}>Year</th>
                <th className={`${TH} w-14`}>Gender</th>
                <th className={`${TH} w-14`}>Category</th>
                <th className={`${TH} w-20`}>Adm Type</th>
                <th className={`${TH} w-16`}>Adm Cat</th>
                <th className={`${TH} w-20`}>Allotted Cat</th>
                <th className={`${TH} w-28`}>Mobile</th>
                <th className={`${TH} w-24`}>Status</th>
                {sortByRecent && (
                  <th className={`${TH} w-24`}>Receipt Date</th>
                )}
                {isAdmin && (
                  <th className={`${TH} w-48`}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-t-[#EAF2F9]">
              {visibleStudents.map((student, idx) => (
                <tr
                  key={`${student.id}-${debouncedSearch}`}
                  className={`transition-colors cursor-context-menu ${
                    contextMenu?.student.id === student.id
                      ? 'bg-[#0B7BC0]/[0.10]'
                      : 'hover:bg-[#F3F9FD]'
                  }`}
                  onContextMenu={(e) => handleContextMenu(e, student)}
                  style={debouncedSearch ? { animation: `content-enter 0.2s ease-out ${Math.min(idx * 0.03, 0.3)}s both` } : undefined}
                >
                  <td className="px-3 py-2 text-[11px] font-medium text-[#8A93A3] tabular-nums whitespace-nowrap">{idx + 1}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <RingAvatar name={student.studentNameSSLC} course={student.course} />
                      <span className="text-[12.5px] font-medium text-[#075E93]">{student.studentNameSSLC}</span>
                    </div>
                  </td>
                  <td className={TD_NUM}>{student.regNumber || '—'}</td>
                  <td className={TD}><LinePill value={student.course} color={DEPT_DOT[student.course]} minWidth={34} /></td>
                  <td className={TD}><LinePill value={student.year} color={YEAR_COLOR[student.year]} minWidth={66} /></td>
                  <td className={TD}><LinePill value={student.gender} color={GENDER_COLOR[student.gender]} minWidth={40} /></td>
                  <td className={TD}><LinePill value={student.category} color={CATEGORY_COLOR[student.category]} minWidth={30} /></td>
                  <td className={TD}><LinePill value={student.admType} color={ADM_TYPE_COLOR[student.admType]} minWidth={70} /></td>
                  <td className={TD}><LinePill value={student.admCat} color={ADM_CAT_COLOR[student.admCat]} minWidth={56} /></td>
                  <td className={TD}>
                    {student.allottedCategory ? (
                      <LinePill
                        value={student.allottedCategory}
                        color={student.allottedCategory !== student.category ? AMBER : FALLBACK_COLOR}
                        minWidth={30}
                        title={student.allottedCategory !== student.category ? `Claimed: ${student.category}` : undefined}
                      />
                    ) : (
                      isAdmin ? (
                        <button
                          onClick={() => setAllottedCatStudent(student)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#0B7BC0]/55 bg-white px-2 py-[3px] text-[10.5px] font-medium leading-none text-[#075E93] hover:bg-[#0B7BC0]/[0.07] cursor-pointer transition-colors"
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Set
                        </button>
                      ) : (
                        <span className="text-[#C4C8D0] text-[10px]">—</span>
                      )
                    )}
                  </td>
                  <td className={TD_NUM}>{student.studentMobile}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-1">
                      <LinePill
                        value={student.admissionStatus || '—'}
                        color={STATUS_COLOR[student.admissionStatus] ?? AMBER}
                        minWidth={80}
                      />
                      {student.transferOut && (
                        <LinePill
                          value="TRF OUT"
                          color="#0284C7"
                          title={student.transferOutPolytechnic ? `To: ${student.transferOutPolytechnic}` : undefined}
                        />
                      )}
                      {student.transferredIn && (
                        <LinePill
                          value="TRF IN"
                          color="#7C3AED"
                          title={student.transferInPolytechnic ? `From: ${student.transferInPolytechnic}` : undefined}
                        />
                      )}
                    </div>
                  </td>
                  {sortByRecent && (
                    <td className={TD_NUM}>
                      {(() => {
                        const paid = firstPaymentByStudent.get(student.id);
                        return paid
                          ? new Date(paid).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—';
                      })()}
                    </td>
                  )}
                  {isAdmin && (
                    <td className={TD}>
                      <button
                        type="button"
                        onClick={() => void navigate(`/enroll?edit=${student.id}`, { state: { student } })}
                        className="inline-flex items-center justify-center gap-1 rounded-[7px] border border-[#0B7BC0]/45 bg-white px-2.5 py-[6px] text-[11px] font-medium leading-none text-[#075E93] transition-[background-color,box-shadow] duration-150 hover:bg-[#0B7BC0]/[0.08] hover:shadow-[0_2px_8px_rgba(18,20,26,0.06)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7BC0]/30"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {hasMore && (
                <tr>
                  <td colSpan={(isAdmin ? 12 : 11) + (sortByRecent ? 1 : 0)} className="px-4 py-3 text-center">
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

          <div className="flex-shrink-0 px-4 py-2 border-t border-[#CFE3F2] bg-[#F3F9FD] text-[11px] font-medium text-[#8A93A3]">
            Showing <span className="text-[#262B35] tabular-nums">{Math.min(visibleCount, filteredStudents.length)}</span> of <span className="text-[#262B35] tabular-nums">{filteredStudents.length}</span>
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
          className="font-wp fixed z-50 bg-white border border-[#CFE3F2] rounded-2xl overflow-hidden min-w-[232px]"
          style={{ left: contextMenu.x, top: contextMenu.y, visibility: 'hidden', boxShadow: '0 12px 36px rgba(11,60,94,0.14), 0 2px 8px rgba(18,20,26,0.05)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-[#CFE3F2] bg-[#EEF6FC] flex items-center gap-3">
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
              <span className={`${MENU_ICON} group-hover:bg-[#0B7BC0]/10 group-hover:text-[#0B7BC0]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
              </span>
              View Details
            </button>
            {isAdmin && (
              <button
                className={MENU_ITEM}
                onClick={() => { setAllottedCatStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className={`${MENU_ICON} group-hover:bg-[#6366F1]/10 group-hover:text-[#6366F1]`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>
                </span>
                <span>Allotted Category</span>
                <span className="ml-auto">
                  {contextMenu.student.allottedCategory ? (
                    <LinePill value={contextMenu.student.allottedCategory} color={FALLBACK_COLOR} />
                  ) : (
                    <LinePill value="Not set" color={AMBER} />
                  )}
                </span>
              </button>
            )}
            {MENU_SEP}
            {isAdmin && (
              <button
                className={MENU_ITEM}
                onClick={() => { navigate('/fees', { state: { prefillStudent: contextMenu.student.studentNameSSLC } }); setContextMenu(null); }}
              >
                <span className={`${MENU_ICON} group-hover:bg-[#D97706]/10 group-hover:text-[#D97706]`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </span>
                Collect Fee
              </button>
            )}
            <button
              className={MENU_ITEM}
              onClick={() => { setDocsModalStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#0FA968]/10 group-hover:text-[#0FA968]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              </span>
              Manage Documents
            </button>
            <button
              className={MENU_ITEM}
              onClick={() => { setPrintProfileStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#0FA968]/10 group-hover:text-[#0FA968]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              </span>
              Print Profile
            </button>
            {MENU_SEP}
            <button
              className={MENU_ITEM}
              onClick={() => { setAnsLetterStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#0B7BC0]/10 group-hover:text-[#0B7BC0]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </span>
              ANS Letter
            </button>
            <button
              className={MENU_ITEM}
              onClick={() => { setAdmOrderStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#1D6FD8]/10 group-hover:text-[#1D6FD8]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </span>
              Admission Order
            </button>
            <button
              className={MENU_ITEM}
              onClick={() => { setStudyCertStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#0B7BC0]/10 group-hover:text-[#0B7BC0]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </span>
              Study Certificate
            </button>
            <button
              className={MENU_ITEM}
              onClick={() => { setTcStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#0B7BC0]/10 group-hover:text-[#0B7BC0]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
              Transfer Certificate
            </button>
            {contextMenu.student.year === '3RD YEAR' && (
              <button
                className={MENU_ITEM}
                onClick={() => { setPcStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className={`${MENU_ICON} group-hover:bg-[#0B7BC0]/10 group-hover:text-[#0B7BC0]`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                </span>
                Course Completion Certificate
              </button>
            )}
            {isAdmin && contextMenu.student.admCat === 'SNQ' && (
              <button
                className={MENU_ITEM}
                onClick={() => { setRefundStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className={`${MENU_ICON} group-hover:bg-[#E11D48]/10 group-hover:text-[#E11D48]`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
                </span>
                SNQ Refund
              </button>
            )}
            {isAdmin && (contextMenu.student.year === '2ND YEAR' || contextMenu.student.year === '3RD YEAR') && (
              <button
                className={MENU_ITEM}
                onClick={() => {
                  if (contextMenu.student.transferOut) {
                    void handleClearTransferOut(contextMenu.student);
                  } else {
                    setTransferOutStudent(contextMenu.student);
                    setTransferOutPolytechnicInput('');
                    setContextMenu(null);
                  }
                }}
              >
                <span className={`${MENU_ICON} group-hover:bg-[#0284C7]/10 group-hover:text-[#0284C7]`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </span>
                {contextMenu.student.transferOut ? 'Clear Transfer Out' : 'Mark Transfer Out'}
              </button>
            )}
          </div>
        </div>
      </>
    )}

    {showMissingDocs && (
      <MissingDocsModal
        students={nonWpStudents}
        onManage={(student) => setDocsModalStudent(student)}
        onClose={() => setShowMissingDocs(false)}
      />
    )}

    {detailStudent && (
      <StudentDetailModal
        student={detailStudent}
        onClose={() => setDetailStudent(null)}
      />
    )}

    {docsModalStudent && (
      <ManageDocumentsModal
        student={docsModalStudent}
        onClose={() => setDocsModalStudent(null)}
      />
    )}

    {printProfileStudent && (
      <PrintProfileModal
        student={printProfileStudent}
        onClose={() => setPrintProfileStudent(null)}
      />
    )}

    {ansLetterStudent && (
      <AnsLetterPreviewModal
        student={ansLetterStudent}
        onClose={() => setAnsLetterStudent(null)}
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

    <Modal
      open={!!transferOutStudent}
      title="Mark Transfer Out"
      message={
        <div className="space-y-3">
          <p>
            Mark <span className="font-semibold text-gray-900">{transferOutStudent?.studentNameSSLC}</span> as transferring out to another polytechnic.
          </p>
          <input
            type="text"
            value={transferOutPolytechnicInput}
            onChange={(e) => setTransferOutPolytechnicInput(e.target.value.toUpperCase())}
            placeholder="Polytechnic name (optional)"
            className="w-full rounded-xl border border-[#CFE3F2] bg-[#F3F9FD] px-3 py-2 text-sm font-medium text-[#262B35] placeholder:text-[#A9B0BB] placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#0B7BC0] focus:ring-2 focus:ring-[#0B7BC0]/20 transition-colors"
          />
        </div>
      }
      confirmLabel="Mark Transfer Out"
      variant="primary"
      loading={savingTransferOut}
      onConfirm={() => void handleConfirmTransferOut()}
      onCancel={() => setTransferOutStudent(null)}
    />

    {refundStudent && (
      <SnqRefundModal
        student={refundStudent}
        onClose={() => setRefundStudent(null)}
      />
    )}
    </>
  );
}
