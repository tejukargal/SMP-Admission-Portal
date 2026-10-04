import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useMeritListSnapshots } from '../hooks/useMeritListSnapshots';
import { updateStudentStatus, updateStudentAllottedCategory } from '../services/studentService';
import { isWPStudent } from '../utils/wpStudent';
import { getAllFeeRecordsByStudent } from '../services/feeRecordService';
import { SMP_FEE_HEADS } from '../types';
import { saveMeritListSnapshot, saveLateralMeritListSnapshot, deleteMeritListSnapshot } from '../services/meritListSnapshotService';
import { createStudentNotification } from '../services/studentNotificationService';
import { useAuth } from '../contexts/AuthContext';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { MINT, CORAL, AMBER, inkOf, pastel, COURSE_HEX } from '../components/dashboard/dashTokens';
import { PageSpinner } from '../components/common/PageSpinner';
import { AdmissionLetterModal } from '../components/common/AdmissionLetterModal';
import { ManageDocumentsModal } from '../components/documents/ManageDocumentsModal';
import { AllottedCategoryModal } from '../components/common/AllottedCategoryModal';
import { Modal } from '../components/common/Modal';
import { SeatCancellationRefundModal } from '../components/common/SeatCancellationRefundModal';
import { StudentDetailModal } from '../components/student/StudentDetailModal';
import { EnrollmentBreakdownModal } from '../components/student/EnrollmentBreakdownModal';
import { exportMeritListPdf, exportMeritListExcel, sortByMerit, sslcPct, fmtDOB, fmtGender, sortByLateralMerit, exportLateralMeritListPdf, exportLateralMeritListExcel } from '../utils/meritListExport';
import type { Student, AcademicYear, Course, MeritListSnapshot } from '../types';

type Tab = 'pending' | 'cancelled' | 'merit' | 'saved' | 'pendingLateral' | 'meritLateral';
type QuotaFilter = 'aided' | 'unaided' | 'all';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const AIDED_COURSES: Course[] = ['CE', 'ME', 'EC', 'CS'];
const UNAIDED_COURSES: Course[] = ['EE'];

const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

const TEAL = '#0F8B8D';
const TEAL_INK = '#0B6567';
const HAIRLINE = '#CDE7E7';

const OUTLINE_PILL_BTN =
  'rounded-full border border-[#CDE7E7] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] transition-colors hover:border-[#0F8B8D]/40 hover:bg-[#0F8B8D]/[0.06] hover:text-[#0B6567] focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/30';
const ICON_PILL_BTN =
  'w-[30px] h-[30px] rounded-full border border-[#CDE7E7] bg-white inline-flex items-center justify-center text-[#0B6567] transition-colors hover:border-[#0F8B8D]/40 hover:bg-[#0F8B8D]/[0.06] focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/30';

const BTN_BASE = 'rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap';
const BTN_GRAY = `${BTN_BASE} border-[#CDE7E7] bg-white text-[#262B35] hover:border-[#0F8B8D]/40 hover:bg-[#0F8B8D]/[0.06] hover:text-[#0B6567] focus:ring-[#0F8B8D]/30`;
const BTN_GREEN = `${BTN_BASE} border-[#0FA968]/45 bg-[#0FA968]/[0.08] text-[#0A7A4B] hover:bg-[#0FA968]/[0.15] focus:ring-[#0FA968]/30`;
const BTN_RED = `${BTN_BASE} border-[#E11D48]/40 bg-[#E11D48]/[0.07] text-[#A5173A] hover:bg-[#E11D48]/[0.13] focus:ring-[#E11D48]/30`;
const BTN_PURPLE = `${BTN_BASE} border-[#8B5CF6]/45 bg-[#8B5CF6]/[0.08] text-[#6A44B8] hover:bg-[#8B5CF6]/[0.15] focus:ring-[#8B5CF6]/30`;
const BTN_AMBER = `${BTN_BASE} border-[#D97706]/45 bg-[#D97706]/[0.08] text-[#9A5B00] hover:bg-[#D97706]/[0.15] focus:ring-[#D97706]/30`;

/** Compact pill action button for table rows (pastel tone). */
function ActionBtn({ tone = 'neutral', loading, disabled, onClick, children }: {
  tone?: 'neutral' | 'mint' | 'coral' | 'amber';
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const cls = tone === 'mint' ? BTN_GREEN : tone === 'coral' ? BTN_RED : tone === 'amber' ? BTN_AMBER : BTN_GRAY;
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={`${cls} !py-1 !text-[11px]`}>
      {loading ? '…' : children}
    </button>
  );
}

function sortStudents(list: Student[]): Student[] {
  return list.slice().sort((a, b) => {
    const y = (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9);
    if (y !== 0) return y;
    const c = a.course.localeCompare(b.course);
    if (c !== 0) return c;
    return a.studentNameSSLC.localeCompare(b.studentNameSSLC);
  });
}

export function Admissions() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const { students: allStudents, loading, error } = useStudents(academicYear);

  const VALID_TABS: Tab[] = ['pending', 'merit', 'pendingLateral', 'meritLateral', 'saved', 'cancelled'];
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = sessionStorage.getItem('admissions_activeTab');
    return (saved && VALID_TABS.includes(saved as Tab) ? saved : 'pending') as Tab;
  });

  useEffect(() => {
    sessionStorage.setItem('admissions_activeTab', activeTab);
  }, [activeTab]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [quotaFilter, setQuotaFilter] = useState<QuotaFilter>('all');
  const [courseFilter, setCourseFilter] = useState<Course | 'ALL'>('ALL');
  const [showFilters, setShowFilters] = useState(() => {
    try { return localStorage.getItem('smp_admissions_filters_visible') === 'true'; } catch { return false; }
  });
  const [showStats, setShowStats] = useState(() => {
    try { return localStorage.getItem('smp_admissions_stats_visible') !== 'false'; } catch { return true; }
  });
  const hasNonSearchFilters = quotaFilter !== 'all' || courseFilter !== 'ALL';
  const hasActiveFilters = !!searchTerm || hasNonSearchFilters;
  useEffect(() => { if (hasNonSearchFilters) setShowFilters(true); }, [hasNonSearchFilters]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [toastError, setToastError] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 3500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  function matchesSearch(s: Student, q: string): boolean {
    const upper = q.toUpperCase();
    return (
      s.studentNameSSLC.toUpperCase().includes(upper) ||
      s.studentNameAadhar.toUpperCase().includes(upper) ||
      (s.fatherName?.toUpperCase().includes(upper) ?? false) ||
      (s.fatherMobile?.includes(q) ?? false) ||
      (s.studentMobile?.includes(q) ?? false)
    );
  }

  function matchesQuotaCourse(s: Student): boolean {
    if (quotaFilter === 'aided' && !AIDED_COURSES.includes(s.course)) return false;
    if (quotaFilter === 'unaided' && !UNAIDED_COURSES.includes(s.course)) return false;
    if (courseFilter !== 'ALL' && s.course !== courseFilter) return false;
    return true;
  }

  function handleQuotaChange(q: QuotaFilter) {
    setQuotaFilter(q);
    setCourseFilter('ALL');
  }

  // Pending = anything that is not CONFIRMED or CANCELLED, excluding lateral (ITI/PUC) students
  const pendingStudents = useMemo(() => {
    let list = allStudents.filter((s) =>
      !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '') &&
      s.priorQualification !== 'ITI' && s.priorQualification !== 'PUC' &&
      matchesQuotaCourse(s)
    );
    if (debouncedSearch.trim()) list = list.filter((s) => matchesSearch(s, debouncedSearch.trim()));
    return sortStudents(list);
  }, [allStudents, debouncedSearch, quotaFilter, courseFilter]);

  const cancelledStudents = useMemo(() => {
    let list = allStudents.filter((s) =>
      s.admissionStatus?.trim() === 'CANCELLED' && matchesQuotaCourse(s)
    );
    if (debouncedSearch.trim()) list = list.filter((s) => matchesSearch(s, debouncedSearch.trim()));
    return sortStudents(list);
  }, [allStudents, debouncedSearch, quotaFilter, courseFilter]);

  // ── Cancelled students who already have fee payments recorded (confirmed → later cancelled) ──
  // Drives both the row highlight and the "Fee Refund" context-menu gate on the Cancelled tab.
  const [cancelledFeePaid, setCancelledFeePaid] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (activeTab !== 'cancelled' || cancelledStudents.length === 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        cancelledStudents.map(async (s) => {
          try {
            const records = await getAllFeeRecordsByStudent(s.id);
            const total = records.reduce((sum, r) => {
              const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
              const additionalTotal = r.additionalPaid.reduce((t, h) => t + h.amount, 0);
              return sum + smpTotal + r.svk + additionalTotal;
            }, 0);
            return [s.id, total] as const;
          } catch {
            return [s.id, 0] as const;
          }
        }),
      );
      if (!cancelled) setCancelledFeePaid(new Map(entries));
    })();
    return () => { cancelled = true; };
  }, [activeTab, cancelledStudents]);

  // Merit list = pending non-lateral students sorted by SSLC % desc (search + quota/course apply)
  const meritStudents = useMemo(() => {
    let list = allStudents.filter((s) =>
      !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '') &&
      s.priorQualification !== 'ITI' && s.priorQualification !== 'PUC' &&
      matchesQuotaCourse(s)
    );
    if (debouncedSearch.trim()) list = list.filter((s) => matchesSearch(s, debouncedSearch.trim()));
    return sortByMerit(list);
  }, [allStudents, debouncedSearch, quotaFilter, courseFilter]);

  // Lateral = pending students with ITI or PUC prior qualification
  const pendingLateralStudents = useMemo(() => {
    let list = allStudents.filter((s) =>
      !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '') &&
      (s.priorQualification === 'ITI' || s.priorQualification === 'PUC') &&
      matchesQuotaCourse(s)
    );
    if (debouncedSearch.trim()) list = list.filter((s) => matchesSearch(s, debouncedSearch.trim()));
    return sortStudents(list);
  }, [allStudents, debouncedSearch, quotaFilter, courseFilter]);

  const meritLateralStudents = useMemo(() => {
    let list = allStudents.filter((s) =>
      !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '') &&
      (s.priorQualification === 'ITI' || s.priorQualification === 'PUC') &&
      matchesQuotaCourse(s)
    );
    if (debouncedSearch.trim()) list = list.filter((s) => matchesSearch(s, debouncedSearch.trim()));
    return sortByLateralMerit(list);
  }, [allStudents, debouncedSearch, quotaFilter, courseFilter]);

  const availableCourses: Course[] =
    quotaFilter === 'aided' ? AIDED_COURSES :
    quotaFilter === 'unaided' ? UNAIDED_COURSES :
    COURSES;

  const courseStats = useMemo(() =>
    COURSES.map((course) => {
      const coursePending = allStudents.filter(
        (s) => s.course === course && !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
      );
      return {
        course,
        pendingRegular:  coursePending.filter((s) => s.priorQualification !== 'ITI' && s.priorQualification !== 'PUC').length,
        pendingLateral:  coursePending.filter((s) => s.priorQualification === 'ITI' || s.priorQualification === 'PUC').length,
        cancelled:       allStudents.filter((s) => s.course === course && s.admissionStatus?.trim() === 'CANCELLED').length,
      };
    })
  , [allStudents]);

  // ── Saved merit list snapshots ────────────────────────────────────────────
  const {
    snapshots,
    lateralSnapshots,
    loading: snapshotsLoading,
    error: snapshotsError,
    refetch: refetchSnapshots,
  } = useMeritListSnapshots(academicYear);

  const [savedListView, setSavedListView] = useState<'regular' | 'lateral'>('regular');

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [savingMeritList, setSavingMeritList] = useState(false);
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null);
  const [snapshotExportingPdf, setSnapshotExportingPdf] = useState(false);
  const [snapshotExportingExcel, setSnapshotExportingExcel] = useState(false);

  const [selectedLateralSnapshotId, setSelectedLateralSnapshotId] = useState<string | null>(null);
  const [savingLateralMeritList, setSavingLateralMeritList] = useState(false);
  const [deletingLateralSnapshotId, setDeletingLateralSnapshotId] = useState<string | null>(null);
  const [lateralSnapshotExportingPdf, setLateralSnapshotExportingPdf] = useState(false);
  const [lateralSnapshotExportingExcel, setLateralSnapshotExportingExcel] = useState(false);

  // Auto-select the most recent snapshot when snapshots load or change
  useEffect(() => {
    if (snapshots.length > 0) {
      setSelectedSnapshotId((prev) =>
        prev && snapshots.find((s) => s.id === prev) ? prev : snapshots[snapshots.length - 1].id
      );
    } else {
      setSelectedSnapshotId(null);
    }
  }, [snapshots]);

  useEffect(() => {
    if (lateralSnapshots.length > 0) {
      setSelectedLateralSnapshotId((prev) =>
        prev && lateralSnapshots.find((s) => s.id === prev) ? prev : lateralSnapshots[lateralSnapshots.length - 1].id
      );
    } else {
      setSelectedLateralSnapshotId(null);
    }
  }, [lateralSnapshots]);

  const selectedSnapshot: MeritListSnapshot | undefined =
    snapshots.find((s) => s.id === selectedSnapshotId);

  const selectedLateralSnapshot: MeritListSnapshot | undefined =
    lateralSnapshots.find((s) => s.id === selectedLateralSnapshotId);

  async function handleSaveMeritList() {
    if (!academicYear) return;
    setSavingMeritList(true);
    try {
      const allPending = allStudents.filter(
        (s) => !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '') &&
          s.priorQualification !== 'ITI' && s.priorQualification !== 'PUC'
      );
      const sorted = sortByMerit(allPending);
      await saveMeritListSnapshot(academicYear, sorted as Student[], snapshots.length);
      refetchSnapshots();
      setActiveTab('saved');
      setToastError(false);
      setToastMsg(`Merit List Phase ${snapshots.length + 1} saved successfully.`);
    } catch {
      setToastError(true);
      setToastMsg('Failed to save merit list. Please try again.');
    } finally {
      setSavingMeritList(false);
    }
  }

  async function handleSaveLateralMeritList() {
    if (!academicYear) return;
    setSavingLateralMeritList(true);
    try {
      const allLateralPending = allStudents.filter(
        (s) => !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '') &&
          (s.priorQualification === 'ITI' || s.priorQualification === 'PUC')
      );
      const sorted = sortByLateralMerit(allLateralPending);
      await saveLateralMeritListSnapshot(academicYear, sorted as Student[], lateralSnapshots.length);
      refetchSnapshots();
      setActiveTab('saved');
      setSavedListView('lateral');
      setToastError(false);
      setToastMsg(`Lateral Merit List Phase ${lateralSnapshots.length + 1} saved successfully.`);
    } catch {
      setToastError(true);
      setToastMsg('Failed to save lateral merit list. Please try again.');
    } finally {
      setSavingLateralMeritList(false);
    }
  }

  async function handleDeleteSnapshot(id: string) {
    setDeletingSnapshotId(id);
    try {
      await deleteMeritListSnapshot(id);
      refetchSnapshots();
      setToastError(false);
      setToastMsg('Snapshot deleted.');
    } catch {
      setToastError(true);
      setToastMsg('Failed to delete. Please try again.');
    } finally {
      setDeletingSnapshotId(null);
    }
  }

  async function handleDeleteLateralSnapshot(id: string) {
    setDeletingLateralSnapshotId(id);
    try {
      await deleteMeritListSnapshot(id);
      refetchSnapshots();
      setToastError(false);
      setToastMsg('Lateral snapshot deleted.');
    } catch {
      setToastError(true);
      setToastMsg('Failed to delete. Please try again.');
    } finally {
      setDeletingLateralSnapshotId(null);
    }
  }

  function handleSnapshotExportPdf(snap: MeritListSnapshot) {
    setSnapshotExportingPdf(true);
    setTimeout(() => {
      try {
        exportMeritListPdf(snap.students, snap.academicYear, {
          savedAt: snap.savedAt,
          phaseLabel: `ಅರ್ಹ ಅಭ್ಯರ್ಥಿಗಳ ಮೆರಿಟ್ ಪಟ್ಟಿ ನಂ. ${snap.phase}`,
        });
      } finally { setSnapshotExportingPdf(false); }
    }, 0);
  }

  function handleSnapshotExportExcel(snap: MeritListSnapshot) {
    setSnapshotExportingExcel(true);
    exportMeritListExcel(snap.students, snap.academicYear)
      .catch(() => {})
      .finally(() => setSnapshotExportingExcel(false));
  }

  function handleLateralSnapshotExportPdf(snap: MeritListSnapshot) {
    setLateralSnapshotExportingPdf(true);
    setTimeout(() => {
      try {
        exportLateralMeritListPdf(snap.students, snap.academicYear, {
          savedAt: snap.savedAt,
          phaseLabel: `ಅರ್ಹ ಅಭ್ಯರ್ಥಿಗಳ ಲ್ಯಾಟರಲ್ ಮೆರಿಟ್ ಪಟ್ಟಿ ನಂ. ${snap.phase}`,
        });
      } finally { setLateralSnapshotExportingPdf(false); }
    }, 0);
  }

  function handleLateralSnapshotExportExcel(snap: MeritListSnapshot) {
    setLateralSnapshotExportingExcel(true);
    exportLateralMeritListExcel(snap.students, snap.academicYear)
      .catch(() => {})
      .finally(() => setLateralSnapshotExportingExcel(false));
  }

  // ── Context menu ─────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; student: Student } | null>(null);
  const [admLetterModal, setAdmLetterModal] = useState<{ student: Student; lang: 'en' | 'kn' } | null>(null);
  const [docsModalStudent, setDocsModalStudent] = useState<Student | null>(null);
  const [feeRefundStudent, setFeeRefundStudent] = useState<Student | null>(null);
  const [refundHistoryStudent, setRefundHistoryStudent] = useState<Student | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setContextMenu(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  function handleContextMenu(e: React.MouseEvent, student: Student) {
    e.preventDefault();
    e.stopPropagation();
    const MENU_W = 215;
    const MENU_H = 210;
    const x = e.clientX + MENU_W > window.innerWidth ? e.clientX - MENU_W : e.clientX;
    const y = e.clientY + MENU_H > window.innerHeight ? e.clientY - MENU_H : e.clientY;
    setContextMenu({ x, y, student });
  }

  const [showEnrollmentLog, setShowEnrollmentLog] = useState(false);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingLateralPdf, setExportingLateralPdf] = useState(false);
  const [exportingLateralExcel, setExportingLateralExcel] = useState(false);

  function handleExportPdf() {
    setExportingPdf(true);
    setTimeout(() => {
      try { exportMeritListPdf(meritStudents, academicYear); }
      finally { setExportingPdf(false); }
    }, 0);
  }

  function handleExportExcel() {
    setExportingExcel(true);
    exportMeritListExcel(meritStudents, academicYear)
      .catch(() => {})
      .finally(() => setExportingExcel(false));
  }

  function handleExportLateralPdf() {
    setExportingLateralPdf(true);
    setTimeout(() => {
      try { exportLateralMeritListPdf(meritLateralStudents, academicYear); }
      finally { setExportingLateralPdf(false); }
    }, 0);
  }

  function handleExportLateralExcel() {
    setExportingLateralExcel(true);
    exportLateralMeritListExcel(meritLateralStudents, academicYear)
      .catch(() => {})
      .finally(() => setExportingLateralExcel(false));
  }

  async function handleAction(
    student: Student,
    newStatus: 'CONFIRMED' | 'CANCELLED' | 'PENDING'
  ): Promise<boolean> {
    setActionLoading(student.id);
    try {
      await updateStudentStatus(student.id, newStatus);
      const msgs: Record<string, string> = {
        CONFIRMED: `${student.studentNameSSLC} confirmed. Student now appears in the ${isWPStudent(student) ? 'WP Students' : 'Students'} list.`,
        CANCELLED: `${student.studentNameSSLC} moved to Cancelled.`,
        PENDING: `${student.studentNameSSLC} restored to Pending.`,
      };
      if (user && student.regNumber) {
        void createStudentNotification({
          studentId: student.id,
          regNumber: student.regNumber,
          type: 'status-changed',
          title: 'Admission Status Updated',
          message: `Your admission status was changed to ${newStatus}.`,
          createdBy: user.uid,
        });
      }
      setToastError(false);
      setToastMsg(msgs[newStatus] ?? 'Updated.');
      return true;
    } catch {
      setToastError(true);
      setToastMsg('Failed to update status. Please try again.');
      return false;
    } finally {
      setActionLoading(null);
    }
  }

  // ── Allotted category ────────────────────────────────────────────────────
  const [allottedCatStudent, setAllottedCatStudent] = useState<Student | null>(null);
  const [savingAllottedCat, setSavingAllottedCat] = useState(false);

  // Confirm is a two-step flow: a summary prompt first, then (only on success)
  // the Allotted Category modal.
  const [confirmTarget, setConfirmTarget] = useState<Student | null>(null);

  async function handleConfirmClick(student: Student) {
    const ok = await handleAction(student, 'CONFIRMED');
    setConfirmTarget(null);
    if (ok) setAllottedCatStudent(student);
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
      setAllottedCatStudent(null);
      setToastError(false);
      setToastMsg(`Allotted category saved for ${allottedCatStudent.studentNameSSLC}.`);
    } catch {
      setToastError(true);
      setToastMsg('Failed to save allotted category. Please try again.');
    } finally {
      setSavingAllottedCat(false);
    }
  }

  const isLoading = settingsLoading || loading;
  if (isLoading) return <PageSpinner />;

  const displayStudents =
    activeTab === 'pending' ? pendingStudents :
    activeTab === 'cancelled' ? cancelledStudents :
    meritStudents;

  const isLateralTab = activeTab === 'pendingLateral' || activeTab === 'meritLateral';
  const totalPending = courseStats.reduce((s, c) => s + (isLateralTab ? c.pendingLateral : c.pendingRegular), 0);
  const totalCancelled = courseStats.reduce((s, c) => s + c.cancelled, 0);

  function handleCourseChipClick(c: Course) {
    if (courseFilter === c) { setCourseFilter('ALL'); return; }
    if (!availableCourses.includes(c)) setQuotaFilter('all');
    setCourseFilter(c);
  }

  function clearAllFilters() {
    setSearchTerm('');
    setQuotaFilter('all');
    setCourseFilter('ALL');
  }

  // Saved Lists: the active (regular / lateral) view drives one shared control bar
  const isLatView = savedListView === 'lateral';
  const activeSnaps = isLatView ? lateralSnapshots : snapshots;
  const activeSnap = isLatView ? selectedLateralSnapshot : selectedSnapshot;
  const activeExportingPdf = isLatView ? lateralSnapshotExportingPdf : snapshotExportingPdf;
  const activeExportingExcel = isLatView ? lateralSnapshotExportingExcel : snapshotExportingExcel;
  const activeDeletingId = isLatView ? deletingLateralSnapshotId : deletingSnapshotId;

  function snapshotRowVisible(s: MeritListSnapshot['students'][number]): boolean {
    const st = s as unknown as Student;
    if (!matchesQuotaCourse(st)) return false;
    return !debouncedSearch.trim() || matchesSearch(st, debouncedSearch.trim());
  }

  function fmtSnapDate(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  const tabGroups: { id: Tab; label: string; count: number; color: string }[][] = [
    [
      { id: 'pending', label: 'Pending', count: pendingStudents.length, color: AMBER },
      { id: 'merit', label: 'Merit List', count: meritStudents.length, color: TEAL },
    ],
    [
      { id: 'pendingLateral', label: 'Pending Lateral', count: pendingLateralStudents.length, color: '#F97316' },
      { id: 'meritLateral', label: 'Merit List Lateral', count: meritLateralStudents.length, color: '#0EA5E9' },
    ],
    [
      { id: 'saved', label: 'Saved Lists', count: snapshots.length + lateralSnapshots.length, color: '#8B5CF6' },
      { id: 'cancelled', label: 'Cancelled', count: cancelledStudents.length, color: CORAL },
    ],
  ];

  return (
    <>
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: 'linear-gradient(160deg, #F4FBFB 0%, #FCFEFE 45%, #EFF8F8 100%)', animation: 'page-enter 0.32s ease-out' }}
    >

      {/* Page header */}
      <div className="flex-shrink-0 flex items-center gap-4 min-w-0 relative">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
            SMP Admissions · Admissions
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <h2 className="text-[22px] font-bold leading-none tracking-[-0.3px]" style={{ color: TEAL_INK }}>Admissions</h2>
            {academicYear && (
              <span className="rounded-full border bg-white px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums" style={{ borderColor: `${TEAL}66`, color: TEAL_INK }}>
                {academicYear}
              </span>
            )}
          </div>
        </div>

        {/* Toast */}
        {toastMsg && (() => {
          const c = toastError ? CORAL : MINT;
          return (
            <div
              className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap pointer-events-auto bg-white"
              style={{ animation: 'toast-in 0.2s ease-out', borderColor: `${c}66`, color: inkOf(c), boxShadow: `0 4px 14px ${c}26` }}
            >
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-white shrink-0 text-[9px] font-bold" style={{ background: c }}>
                {toastError ? '✕' : '✓'}
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
          );
        })()}

        <button
          onClick={() => void navigate('/students')}
          className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium text-white hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/40 focus-visible:ring-offset-2 cursor-pointer transition-[filter]"
          style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_INK})`, boxShadow: `0 3px 10px ${TEAL}40` }}
        >
          Students
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>

      {/* Toolbar card — search + status totals + collapsible filters/course stats + actions */}
      <div className="flex-shrink-0 rounded-2xl border bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(11,101,103,0.06)]" style={{ borderColor: HAIRLINE }}>
        <div className="flex items-center gap-2 px-2.5 py-2">

          {/* Search */}
          <div className="relative shrink-0 w-56">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: TEAL_INK }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name / father / mobile…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full rounded-full border border-[#0F8B8D]/40 bg-[#F2FAFA] py-2 text-[14px] font-medium text-[#0B6567] placeholder:text-[#0B6567]/55 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#0F8B8D] focus:ring-2 focus:ring-[#0F8B8D]/20 transition-all duration-150 pl-9 ${searchTerm ? 'pr-8' : 'pr-3'}`}
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

          {/* Collapsible inline filter selects */}
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
                  <FilterDropdown<'aided' | 'unaided'>
                    color="teal"
                    value={quotaFilter === 'all' ? '' : quotaFilter}
                    onChange={(v) => handleQuotaChange(v || 'all')}
                    placeholder="Quota"
                    options={[{ value: 'aided', label: 'Aided' }, { value: 'unaided', label: 'UnAided' }]}
                  />
                  <FilterDropdown<Course>
                    color="teal"
                    value={courseFilter === 'ALL' ? '' : courseFilter}
                    onChange={(v) => setCourseFilter(v || 'ALL')}
                    placeholder="Course"
                    options={availableCourses.map((c) => ({ value: c, label: c }))}
                  />

                </div>
              </div>
            </div>
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <>
              <span className="w-px h-5 shrink-0 ml-auto" style={{ background: HAIRLINE }} />
              <button
                type="button"
                onClick={clearAllFilters}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#D97706]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#D97706] hover:bg-[#D97706]/[0.16] transition-colors cursor-pointer"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                Clear
              </button>
            </>
          )}

          {/* Enrollment Log: labelled when collapsed, icon-only when expanded */}
          {allStudents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEnrollmentLog(true)}
              className={`${showFilters ? ICON_PILL_BTN : OUTLINE_PILL_BTN} shrink-0 inline-flex items-center gap-1.5 cursor-pointer ${hasActiveFilters ? '' : 'ml-auto'}`}
              title={showFilters ? 'Enrollment Log' : undefined}
              aria-label="Enrollment Log"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="20" x2="6" y2="11"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="14"/></svg>
              {!showFilters && 'Enrollment Log'}
            </button>
          )}

          {/* Stats chips toggle */}
          {allStudents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowStats((v) => {
                const n = !v;
                try { localStorage.setItem('smp_admissions_stats_visible', String(n)); } catch { /* ignore */ }
                return n;
              })}
              className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
                showStats
                  ? 'bg-[#0F8B8D]/10 border-[#0F8B8D]/50 text-[#0B6567]'
                  : 'border-[#CDE7E7] bg-white text-[#0B6567]/70 hover:bg-[#0F8B8D]/[0.06] hover:text-[#0B6567]'
              }`}
              title="Toggle pending / cancelled stats"
              aria-label="Toggle pending / cancelled stats"
              aria-expanded={showStats}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
          )}

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => {
              const n = !v;
              try { localStorage.setItem('smp_admissions_filters_visible', String(n)); } catch { /* ignore */ }
              return n;
            })}
            className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters || hasNonSearchFilters
                ? 'bg-[#0F8B8D]/10 border-[#0F8B8D]/30 text-[#0F8B8D]'
                : 'border-[#CDE7E7] text-[#5B6371] hover:bg-[#EFF8F8] hover:text-[#262B35]'
            }`}
            title="Toggle filters"
            aria-label="Toggle filters"
            aria-expanded={showFilters}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Collapsible stats row: totals + course-wise Pending · Cancelled chips */}
        {allStudents.length > 0 && (
          <div
            className="grid"
            style={{
              gridTemplateRows: showStats ? '1fr' : '0fr',
              opacity: showStats ? 1 : 0,
              transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 px-3 pt-0.5 pb-2.5">
                <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap" style={pastel(AMBER)} title={isLateralTab ? 'Pending lateral admissions' : 'Pending admissions'}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: AMBER }} />
                  Pending
                  <span className="tabular-nums font-semibold">{totalPending}</span>
                </div>
                <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap" style={pastel(CORAL)} title="Cancelled admissions">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CORAL }} />
                  Cancelled
                  <span className="tabular-nums font-semibold">{totalCancelled}</span>
                </div>

                <span className="w-px h-4 shrink-0" style={{ background: HAIRLINE }} />

                <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar px-px py-0.5">
                  {courseStats.map(({ course, pendingRegular, pendingLateral, cancelled }) => {
                    const pending = isLateralTab ? pendingLateral : pendingRegular;
                    const selected = courseFilter === course;
                    const empty = pending === 0 && cancelled === 0;
                    const c = COURSE_HEX[course];
                    return (
                      <button
                        key={course}
                        type="button"
                        onClick={() => handleCourseChipClick(course)}
                        title={`${course} — ${pending} pending · ${cancelled} cancelled`}
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                          empty && !selected ? 'opacity-50 hover:opacity-100' : ''
                        }`}
                        style={selected
                          ? { background: c, borderColor: c, color: '#fff' }
                          : { background: '#fff', borderColor: `${c}73`, color: inkOf(c) }}
                      >
                        {!selected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />}
                        <span>{course}</span>
                        <span className="tabular-nums font-semibold" style={selected ? undefined : { color: inkOf(AMBER) }}>{pending}</span>
                        <span className={selected ? 'opacity-60' : 'text-[#C5CBD6]'}>·</span>
                        <span className="tabular-nums font-semibold" style={selected ? undefined : { color: inkOf(CORAL) }}>{cancelled}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {tabGroups.map((group, gi) => (
          <div key={gi} className="flex-shrink-0 flex items-center gap-1.5">
            {gi > 0 && <span className="w-px h-5 mx-1 shrink-0" style={{ background: HAIRLINE }} />}
            {group.map(({ id, label, count, color }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-[6px] text-[12px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97]"
                  style={selected
                    ? { background: color, borderColor: color, color: '#fff' }
                    : { background: '#fff', borderColor: `${color}73`, color: inkOf(color) }}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold tabular-nums"
                      style={selected ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : pastel(color)}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Merit list actions — only on merit tabs */}
        {activeTab === 'merit' && meritStudents.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 ml-auto pl-2">
            {isAdmin && (
              <button onClick={() => void handleSaveMeritList()} disabled={savingMeritList} className={BTN_PURPLE}>
                {savingMeritList ? 'Saving…' : 'Save Merit List'}
              </button>
            )}
            <button onClick={handleExportPdf} disabled={exportingPdf} className={BTN_GRAY}>
              {exportingPdf ? 'Generating…' : 'Save PDF'}
            </button>
            <button onClick={handleExportExcel} disabled={exportingExcel} className={BTN_GREEN}>
              {exportingExcel ? 'Generating…' : 'Save Excel'}
            </button>
          </div>
        )}

        {activeTab === 'meritLateral' && meritLateralStudents.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 ml-auto pl-2">
            {isAdmin && (
              <button onClick={() => void handleSaveLateralMeritList()} disabled={savingLateralMeritList} className={BTN_PURPLE}>
                {savingLateralMeritList ? 'Saving…' : 'Save Merit List'}
              </button>
            )}
            <button onClick={handleExportLateralPdf} disabled={exportingLateralPdf} className={BTN_GRAY}>
              {exportingLateralPdf ? 'Generating…' : 'Save PDF'}
            </button>
            <button onClick={handleExportLateralExcel} disabled={exportingLateralExcel} className={BTN_GREEN}>
              {exportingLateralExcel ? 'Generating…' : 'Save Excel'}
            </button>
          </div>
        )}

        {/* Saved list actions — export / delete the selected phase */}
        {activeTab === 'saved' && activeSnap && (
          <div className="flex-shrink-0 flex items-center gap-2 ml-auto pl-2">
            <button
              onClick={() => (isLatView ? handleLateralSnapshotExportPdf(activeSnap) : handleSnapshotExportPdf(activeSnap))}
              disabled={activeExportingPdf}
              className={BTN_GRAY}
            >
              {activeExportingPdf ? 'Generating…' : 'Save PDF'}
            </button>
            <button
              onClick={() => (isLatView ? handleLateralSnapshotExportExcel(activeSnap) : handleSnapshotExportExcel(activeSnap))}
              disabled={activeExportingExcel}
              className={BTN_GREEN}
            >
              {activeExportingExcel ? 'Generating…' : 'Save Excel'}
            </button>
            {isAdmin && (
              <button
                onClick={() => void (isLatView ? handleDeleteLateralSnapshot(activeSnap.id) : handleDeleteSnapshot(activeSnap.id))}
                disabled={activeDeletingId !== null}
                className={BTN_RED}
              >
                {activeDeletingId === activeSnap.id ? 'Deleting…' : 'Delete Phase'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
      ) : !academicYear ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Please configure an academic year in Settings first.
        </div>
      ) : activeTab === 'saved' ? (
        /* ── Saved merit list snapshots ─────────────────────────────────────── */
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {snapshotsLoading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading saved lists…</div>
          ) : snapshotsError ? (
            <div className="flex-1 flex items-center justify-center text-sm text-red-500">{snapshotsError}</div>
          ) : (
            <>
              {/* Sub-bar: view switch · phase pills · meta (actions live in the tabs row) */}
              <div className="flex-shrink-0 flex items-center gap-2.5 min-w-0">
                <div className="shrink-0 inline-flex items-center rounded-full border border-[#CDE7E7] bg-[#F2FAFA] p-0.5">
                  <button
                    onClick={() => setSavedListView('regular')}
                    className={`px-3 py-1 text-[12px] font-medium rounded-full transition-colors cursor-pointer ${
                      savedListView === 'regular' ? 'bg-[#8B5CF6] text-white' : 'text-[#5B6371] hover:text-[#6A44B8]'
                    }`}
                  >
                    Regular {snapshots.length > 0 && <span className="ml-0.5 opacity-75">({snapshots.length})</span>}
                  </button>
                  <button
                    onClick={() => setSavedListView('lateral')}
                    className={`px-3 py-1 text-[12px] font-medium rounded-full transition-colors cursor-pointer ${
                      savedListView === 'lateral' ? 'bg-[#0F8B8D] text-white' : 'text-[#5B6371] hover:text-[#0B6567]'
                    }`}
                  >
                    Lateral {lateralSnapshots.length > 0 && <span className="ml-0.5 opacity-75">({lateralSnapshots.length})</span>}
                  </button>
                </div>

                {activeSnaps.length > 0 && (
                  <>
                    <span className="w-px h-5 shrink-0" style={{ background: HAIRLINE }} />
                    <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar py-0.5">
                      {activeSnaps.map((snap) => {
                        const isSelected = snap.id === (isLatView ? selectedLateralSnapshotId : selectedSnapshotId);
                        return (
                          <button
                            key={snap.id}
                            onClick={() => (isLatView ? setSelectedLateralSnapshotId(snap.id) : setSelectedSnapshotId(snap.id))}
                            title={`Saved ${fmtSnapDate(snap.savedAt)}`}
                            className={`shrink-0 px-3 py-1 rounded-full border text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                              isSelected
                                ? (isLatView ? 'bg-[#0F8B8D] border-[#0F8B8D] text-white' : 'bg-[#8B5CF6] border-[#8B5CF6] text-white')
                                : (isLatView
                                    ? 'bg-white border-[#CDE7E7] text-[#5B6371] hover:border-[#0F8B8D]/50 hover:text-[#0B6567]'
                                    : 'bg-white border-[#CDE7E7] text-[#5B6371] hover:border-[#8B5CF6]/50 hover:text-[#6A44B8]')
                            }`}
                          >
                            Phase {snap.phase}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {activeSnap && (
                  <span className="shrink-0 ml-auto text-[11.5px] text-[#5B6371] whitespace-nowrap tabular-nums">
                    {activeSnap.students.length} student{activeSnap.students.length !== 1 ? 's' : ''} · saved {fmtSnapDate(activeSnap.savedAt)}
                  </span>
                )}
              </div>

              {/* ── Regular snapshots ── */}
              {savedListView === 'regular' && (
                snapshots.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center flex-col gap-2">
                    <p className="text-sm text-gray-400">No regular merit lists saved yet.</p>
                    <p className="text-xs text-gray-300">Go to the Merit List tab and click "Save Merit List" to create a snapshot.</p>
                  </div>
                ) : (
                  <>
                    {selectedSnapshot && (
                      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CDE7E7] overflow-auto flex flex-col scroll-adm">
                        <table className="min-w-full divide-y divide-[#E3F1F1] text-xs">
                          <thead className="bg-[#F2FAFA] sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-8">ಕ್ರ.ಸಂ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-14">ಮೆರಿಟ್ ನಂ.</th>
                              <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-12">ಲಿಂಗ</th>
                              <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">ತಂದೆಯ ಹೆಸರು</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-24">ಹುಟ್ಟಿದ ದಿನಾಂಕ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ಅರ್ಹ ಪ್ರವರ್ಗ</th>
                              <th className="px-3 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-28">ಆದಾಯ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-24">ಗ+ವಿ ಅಂಕ</th>
                              <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ಗ+ವಿ %</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ಗರಿಷ್ಠ ಅಂಕ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ಗಳಿಸಿದ ಅಂಕ</th>
                              <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ಶೇಕಡಾ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EEF6F6]">
                            {sortByMerit(selectedSnapshot.students).map((student, idx) => ({ student, idx })).filter(({ student }) => snapshotRowVisible(student)).map(({ student, idx }) => (
                              <tr key={idx} className="hover:bg-[#F6FBFB] transition-colors">
                                <td className="px-2 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                                <td className="px-2 py-2 text-center text-gray-900 whitespace-nowrap font-bold text-sm">{idx + 1}</td>
                                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{student.studentNameSSLC}</td>
                                <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap">{fmtGender(student.gender)}</td>
                                <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.fatherName || '—'}</td>
                                <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{fmtDOB(student.dateOfBirth)}</td>
                                <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap">{student.category}</td>
                                <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                                  {student.annualIncome ? student.annualIncome.toLocaleString('en-IN') : '—'}
                                </td>
                                <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">
                                  {student.mathsScienceObtainedTotal}/{student.mathsScienceMaxTotal}
                                </td>
                                <td className="px-2 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                                  {student.mathsScienceMaxTotal
                                    ? ((student.mathsScienceObtainedTotal / student.mathsScienceMaxTotal) * 100).toFixed(2) + '%'
                                    : '—'}
                                </td>
                                <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{student.sslcMaxTotal}</td>
                                <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{student.sslcObtainedTotal}</td>
                                <td className="px-2 py-2 text-right font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                                  {sslcPct(student).toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="px-3 py-2 border-t border-[#E3F1F1] text-[11.5px] text-[#5B6371] mt-auto">
                          Phase {selectedSnapshot.phase} · {selectedSnapshot.students.length} student{selectedSnapshot.students.length !== 1 ? 's' : ''} · saved {new Date(selectedSnapshot.savedAt).toLocaleString('en-IN')} · sorted by SSLC % (highest first)
                        </div>
                      </div>
                    )}
                  </>
                )
              )}

              {/* ── Lateral snapshots ── */}
              {savedListView === 'lateral' && (
                lateralSnapshots.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center flex-col gap-2">
                    <p className="text-sm text-gray-400">No lateral merit lists saved yet.</p>
                    <p className="text-xs text-gray-300">Go to the Merit List Lateral tab and click "Save Merit List" to create a snapshot.</p>
                  </div>
                ) : (
                  <>
                    {selectedLateralSnapshot && (
                      <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CDE7E7] overflow-auto flex flex-col scroll-adm">
                        <table className="min-w-full divide-y divide-[#E3F1F1] text-xs">
                          <thead className="bg-[#F2FAFA] sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-8">ಕ್ರ.ಸಂ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-14">ಮೆರಿಟ್ ನಂ.</th>
                              <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-12">ಲಿಂಗ</th>
                              <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">ತಂದೆಯ ಹೆಸರು</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-24">ಹುಟ್ಟಿದ ದಿನಾಂಕ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ಅರ್ಹ ಪ್ರವರ್ಗ</th>
                              <th className="px-3 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-28">ಆದಾಯ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-24">ಗ+ವಿ ಅಂಕ</th>
                              <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ಗ+ವಿ %</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-28">SSLC ಅಂಕ</th>
                              <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ಶೇಕಡಾ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-16">ಅರ್ಹತೆ</th>
                              <th className="px-2 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-32">Trade/Combination</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ITI/PUC ಗರಿಷ್ಠ</th>
                              <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ITI/PUC ಗಳಿಸಿದ</th>
                              <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ITI/PUC %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#EEF6F6]">
                            {sortByLateralMerit(selectedLateralSnapshot.students).map((student, idx) => ({ student, idx })).filter(({ student }) => snapshotRowVisible(student)).map(({ student, idx }) => {
                              const lMax = student.priorQualification === 'ITI' ? student.itiMaxTotal : student.pucMaxTotal;
                              const lObt = student.priorQualification === 'ITI' ? student.itiObtainedTotal : student.pucObtainedTotal;
                              const lPct = student.priorQualification === 'ITI' ? student.itiPercentage : student.pucPercentage;
                              return (
                                <tr key={idx} className="hover:bg-[#F6FBFB] transition-colors">
                                  <td className="px-2 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                                  <td className="px-2 py-2 text-center text-gray-900 whitespace-nowrap font-bold text-sm">{idx + 1}</td>
                                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{student.studentNameSSLC}</td>
                                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap">{fmtGender(student.gender)}</td>
                                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.fatherName || '—'}</td>
                                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{fmtDOB(student.dateOfBirth)}</td>
                                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap">{student.category}</td>
                                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                                    {student.annualIncome ? student.annualIncome.toLocaleString('en-IN') : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">
                                    {student.mathsScienceObtainedTotal}/{student.mathsScienceMaxTotal}
                                  </td>
                                  <td className="px-2 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                                    {student.mathsScienceMaxTotal
                                      ? ((student.mathsScienceObtainedTotal / student.mathsScienceMaxTotal) * 100).toFixed(2) + '%'
                                      : '—'}
                                  </td>
                                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{student.sslcObtainedTotal}/{student.sslcMaxTotal}</td>
                                  <td className="px-2 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                                    {sslcPct(student).toFixed(2)}%
                                  </td>
                                  <td className="px-2 py-2 text-center font-semibold text-orange-700 whitespace-nowrap">{student.priorQualification || '—'}</td>
                                  <td className="px-2 py-2 text-left text-gray-700 whitespace-nowrap">{student.itiPucCombination || '—'}</td>
                                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{lMax || '—'}</td>
                                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{lObt || '—'}</td>
                                  <td className="px-2 py-2 text-right font-semibold text-teal-700 whitespace-nowrap tabular-nums">
                                    {lPct ? lPct.toFixed(2) + '%' : '—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div className="px-3 py-2 border-t border-[#E3F1F1] text-[11.5px] text-[#5B6371] mt-auto">
                          Phase {selectedLateralSnapshot.phase} · {selectedLateralSnapshot.students.length} student{selectedLateralSnapshot.students.length !== 1 ? 's' : ''} · saved {new Date(selectedLateralSnapshot.savedAt).toLocaleString('en-IN')} · sorted by ITI/PUC % (highest first)
                        </div>
                      </div>
                    )}
                  </>
                )
              )}
            </>
          )}
        </div>

      ) : activeTab === 'pendingLateral' ? (
        /* ── Pending Lateral table ────────────────────────────────────────── */
        pendingLateralStudents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-2">
            <p className="text-sm text-gray-400">
              {debouncedSearch.trim()
                ? `No results for "${debouncedSearch.trim()}".`
                : `No lateral pending admissions for ${academicYear}.`}
            </p>
            <p className="text-xs text-gray-300">Students enrolled with ITI or PUC prior qualification appear here.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CDE7E7] overflow-auto flex flex-col scroll-adm">
            <table className="min-w-full divide-y divide-[#E3F1F1] text-xs">
              <thead className="bg-[#F2FAFA] sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-8">#</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">Name (SSLC)</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-24">Reg No</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-14">Course</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-20">Year</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-14">Gender</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-16">Prior Qual</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-20">Adm Type</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-16">Adm Cat</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-28">Mobile</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-28">Enrolled On</th>
                  {isAdmin && (
                    <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-44">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF6F6]">
                {pendingLateralStudents.map((student, idx) => (
                  <tr
                    key={student.id}
                   
                    className="hover:bg-[#F6FBFB] transition-colors cursor-context-menu"
                    onContextMenu={(e) => handleContextMenu(e, student)}
                  >
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{student.studentNameSSLC}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.regNumber || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.course}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.year}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.gender}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-medium text-orange-700">{student.priorQualification}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.admType || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.admCat || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.studentMobile}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.enrollmentDate || '—'}</td>
                    {isAdmin && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          <ActionBtn disabled={actionLoading !== null} onClick={() => navigate(`/enroll?edit=${student.id}`)}>Edit</ActionBtn>
                          <ActionBtn tone="mint" loading={actionLoading === student.id} disabled={actionLoading !== null && actionLoading !== student.id} onClick={() => setConfirmTarget(student)}>Confirm</ActionBtn>
                          <ActionBtn tone="coral" loading={actionLoading === student.id} disabled={actionLoading !== null && actionLoading !== student.id} onClick={() => void handleAction(student, 'CANCELLED')}>Cancel</ActionBtn>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-[#E3F1F1] text-[11.5px] text-[#5B6371] mt-auto">
              {pendingLateralStudents.length} student{pendingLateralStudents.length !== 1 ? 's' : ''} · lateral entry (ITI/PUC)
            </div>
          </div>
        )

      ) : activeTab === 'meritLateral' ? (
        /* ── Lateral Merit list table ─────────────────────────────────────── */
        meritLateralStudents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center flex-col gap-2">
            <p className="text-sm text-gray-400">
              {debouncedSearch.trim()
                ? `No results for "${debouncedSearch.trim()}".`
                : `No lateral students to build a merit list for ${academicYear}.`}
            </p>
            <p className="text-xs text-gray-300">Students enrolled with ITI or PUC prior qualification appear here.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CDE7E7] overflow-auto flex flex-col scroll-adm">
            <table className="min-w-full divide-y divide-[#E3F1F1] text-xs">
              <thead className="bg-[#F2FAFA] sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-8">ಕ್ರ.ಸಂ</th>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-14">ಮೆರಿಟ್ ನಂ.</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-12">ಲಿಂಗ</th>
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">ತಂದೆಯ ಹೆಸರು</th>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-24">ಹುಟ್ಟಿದ ದಿನಾಂಕ</th>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ಅರ್ಹ ಪ್ರವರ್ಗ</th>
                  <th className="px-3 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-28">ಆದಾಯ</th>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-28">SSLC ಅಂಕ</th>
                  <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ಶೇಕಡಾ</th>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-16">ಅರ್ಹತೆ</th>
                  <th className="px-2 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-32">Trade/Combination</th>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ITI/PUC ಗರಿಷ್ಠ</th>
                  <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ITI/PUC ಗಳಿಸಿದ</th>
                  <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ITI/PUC %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF6F6]">
                {meritLateralStudents.map((student, idx) => {
                  const lMax = student.priorQualification === 'ITI' ? student.itiMaxTotal : student.pucMaxTotal;
                  const lObt = student.priorQualification === 'ITI' ? student.itiObtainedTotal : student.pucObtainedTotal;
                  const lPct = student.priorQualification === 'ITI' ? student.itiPercentage : student.pucPercentage;
                  return (
                    <tr key={student.id} className="hover:bg-[#F6FBFB] transition-colors">
                      <td className="px-2 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                      <td className="px-2 py-2 text-center text-gray-900 whitespace-nowrap font-bold text-sm">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{student.studentNameSSLC}</td>
                      <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap">{fmtGender(student.gender)}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.fatherName || '—'}</td>
                      <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{fmtDOB(student.dateOfBirth)}</td>
                      <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap">{student.category}</td>
                      <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                        {student.annualIncome ? student.annualIncome.toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{student.sslcObtainedTotal}/{student.sslcMaxTotal}</td>
                      <td className="px-2 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                        {sslcPct(student).toFixed(2)}%
                      </td>
                      <td className="px-2 py-2 text-center font-semibold text-orange-700 whitespace-nowrap">{student.priorQualification}</td>
                      <td className="px-2 py-2 text-left text-gray-700 whitespace-nowrap">{student.itiPucCombination || '—'}</td>
                      <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{lMax || '—'}</td>
                      <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{lObt || '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold text-teal-700 whitespace-nowrap tabular-nums">
                        {lPct ? lPct.toFixed(2) + '%' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-[#E3F1F1] text-[11.5px] text-[#5B6371] mt-auto">
              {meritLateralStudents.length} student{meritLateralStudents.length !== 1 ? 's' : ''} · sorted by ITI/PUC % (highest first)
            </div>
          </div>
        )

      ) : displayStudents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-2">
          <p className="text-sm text-gray-400">
            {debouncedSearch.trim()
              ? `No results for "${debouncedSearch.trim()}".`
              : activeTab === 'pending'
              ? `No pending admissions for ${academicYear}.`
              : activeTab === 'cancelled'
              ? `No cancelled admissions for ${academicYear}.`
              : `No pending students to build a merit list for ${academicYear}.`}
          </p>
          {activeTab === 'pending' && !debouncedSearch.trim() && (
            <p className="text-xs text-gray-300">New enrollments will appear here automatically.</p>
          )}
        </div>

      ) : activeTab === 'merit' ? (
        /* ── Merit list table ─────────────────────────────────────────────── */
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CDE7E7] overflow-auto flex flex-col scroll-adm">
          <table className="min-w-full divide-y divide-[#E3F1F1] text-xs">
            <thead className="bg-[#F2FAFA] sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-8">ಕ್ರ.ಸಂ</th>
                <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-14">ಮೆರಿಟ್ ನಂ.</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
                <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-12">ಲಿಂಗ</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">ತಂದೆಯ ಹೆಸರು</th>
                <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-24">ಹುಟ್ಟಿದ ದಿನಾಂಕ</th>
                <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ಅರ್ಹ ಪ್ರವರ್ಗ</th>
                <th className="px-3 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-28">ಆದಾಯ</th>
                <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-24">ಗ+ವಿ ಅಂಕ</th>
                <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ಗ+ವಿ %</th>
                <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ಗರಿಷ್ಠ ಅಂಕ</th>
                <th className="px-2 py-2 text-center font-medium text-[#0B6567] whitespace-nowrap w-20">ಗಳಿಸಿದ ಅಂಕ</th>
                <th className="px-2 py-2 text-right font-medium text-[#0B6567] whitespace-nowrap w-20">ಶೇಕಡಾ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF6F6]">
              {meritStudents.map((student, idx) => (
                <tr key={student.id} className="hover:bg-[#F6FBFB] transition-colors">
                  <td className="px-2 py-2 text-center text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-2 py-2 text-center text-gray-900 whitespace-nowrap font-bold text-sm">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{student.studentNameSSLC}</td>
                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap">{fmtGender(student.gender)}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.fatherName || '—'}</td>
                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{fmtDOB(student.dateOfBirth)}</td>
                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap">{student.category}</td>
                  <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                    {student.annualIncome ? student.annualIncome.toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">
                    {student.mathsScienceObtainedTotal}/{student.mathsScienceMaxTotal}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-700 whitespace-nowrap tabular-nums">
                    {student.mathsScienceMaxTotal
                      ? ((student.mathsScienceObtainedTotal / student.mathsScienceMaxTotal) * 100).toFixed(2) + '%'
                      : '—'}
                  </td>
                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{student.sslcMaxTotal}</td>
                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap tabular-nums">{student.sslcObtainedTotal}</td>
                  <td className="px-2 py-2 text-right font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                    {sslcPct(student).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-[#E3F1F1] text-[11.5px] text-[#5B6371] mt-auto">
            {meritStudents.length} student{meritStudents.length !== 1 ? 's' : ''} · sorted by SSLC % (highest first)
          </div>
        </div>

      ) : (
        /* ── Pending / Cancelled table ────────────────────────────────────── */
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CDE7E7] overflow-auto flex flex-col scroll-adm">
          <table className="min-w-full divide-y divide-[#E3F1F1] text-xs">
            <thead className="bg-[#F2FAFA] sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-8">#</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap">Name (SSLC)</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-24">Reg No</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-14">Course</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-20">Year</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-14">Gender</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-20">Adm Type</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-16">Adm Cat</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-28">Mobile</th>
                <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-28">Enrolled On</th>
                {isAdmin && (
                  <th className="px-3 py-2 text-left font-medium text-[#0B6567] whitespace-nowrap w-44">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF6F6]">
              {displayStudents.map((student, idx) => {
                const hasFeePaid = activeTab === 'cancelled' && (cancelledFeePaid.get(student.id) ?? 0) > 0;
                return (
                <tr
                  key={student.id}
                 
                  className={`transition-colors cursor-context-menu ${hasFeePaid ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-[#F6FBFB]'}`}
                  onContextMenu={(e) => handleContextMenu(e, student)}
                  title={hasFeePaid ? 'Fee was paid before this seat was cancelled — refund available via right-click menu' : undefined}
                >
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                    {student.studentNameSSLC}
                    {hasFeePaid && (
                      <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-200 text-amber-800 align-middle">
                        Fee Paid
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.regNumber || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.course}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.year}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.gender}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.admType || '—'}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.admCat || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.studentMobile}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{student.enrollmentDate || '—'}</td>
                  {isAdmin && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        {activeTab === 'pending' ? (
                          <>
                            <ActionBtn disabled={actionLoading !== null} onClick={() => navigate(`/enroll?edit=${student.id}`)}>Edit</ActionBtn>
                            <ActionBtn tone="mint" loading={actionLoading === student.id} disabled={actionLoading !== null && actionLoading !== student.id} onClick={() => setConfirmTarget(student)}>Confirm</ActionBtn>
                            <ActionBtn tone="coral" loading={actionLoading === student.id} disabled={actionLoading !== null && actionLoading !== student.id} onClick={() => void handleAction(student, 'CANCELLED')}>Cancel</ActionBtn>
                          </>
                        ) : (
                          <ActionBtn tone="amber" loading={actionLoading === student.id} disabled={actionLoading !== null && actionLoading !== student.id} onClick={() => void handleAction(student, 'PENDING')}>Restore to Pending</ActionBtn>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-[#E3F1F1] text-[11.5px] text-[#5B6371] mt-auto">
            {displayStudents.length} student{displayStudents.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>

    {/* ── Context menu for pending / cancelled rows ── */}
    {contextMenu && (
      <>
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        />
        <div
          className="font-wp fixed z-50 bg-white border border-[#CDE7E7] rounded-2xl overflow-hidden min-w-[220px]"
          style={{ left: contextMenu.x, top: contextMenu.y, boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 pt-2.5 pb-2 border-b border-gray-100 flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-[#0F8B8D]/10 text-[#0B6567] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {contextMenu.student.studentNameSSLC.charAt(0)}
            </span>
            <span className="text-[12px] font-semibold text-gray-800 truncate">{contextMenu.student.studentNameSSLC}</span>
          </div>
          {/* Items */}
          <div className="py-1.5">
            {contextMenu.student.admissionStatus === 'PENDING' && (
              <>
                <button
                  className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-violet-50/70 hover:text-violet-800 flex items-center gap-2.5 transition-colors duration-100"
                  onClick={() => { navigate(`/enroll?edit=${contextMenu.student.id}`); setContextMenu(null); }}
                >
                  <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-100 group-hover:text-violet-600 transition-colors">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </span>
                  Edit Enrollment
                </button>
                <div className="my-1 h-px bg-gray-100 mx-3" />
              </>
            )}
            <button
              className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
              onClick={() => { setDocsModalStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
              </span>
              Manage Documents
            </button>
            <div className="my-1 h-px bg-gray-100 mx-3" />
            <button
              className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-blue-50/70 hover:text-blue-800 flex items-center gap-2.5 transition-colors duration-100"
              onClick={() => { setAdmLetterModal({ student: contextMenu.student, lang: 'en' }); setContextMenu(null); }}
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>
              </span>
              Seat Allotment Letter
            </button>
            <button
              className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-orange-50/70 hover:text-orange-800 flex items-center gap-2.5 transition-colors duration-100"
              onClick={() => { setAdmLetterModal({ student: contextMenu.student, lang: 'kn' }); setContextMenu(null); }}
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>
              </span>
              <span>Seat Allotment Letter</span>
              <span className="ml-auto text-[10px] font-semibold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">ಕನ್ನಡ</span>
            </button>
            {isAdmin && contextMenu.student.admissionStatus === 'CANCELLED' && (cancelledFeePaid.get(contextMenu.student.id) ?? 0) > 0 && (
              <>
                <div className="my-1 h-px bg-gray-100 mx-3" />
                <button
                  className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-red-50/70 hover:text-red-800 flex items-center gap-2.5 transition-colors duration-100"
                  onClick={() => { setFeeRefundStudent(contextMenu.student); setContextMenu(null); }}
                >
                  <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 group-hover:text-red-600 transition-colors">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  </span>
                  Fee Refund
                </button>
                <button
                  className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
                  onClick={() => { setRefundHistoryStudent(contextMenu.student); setContextMenu(null); }}
                >
                  <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
                  </span>
                  Refund History
                </button>
              </>
            )}
          </div>
        </div>
      </>
    )}

    {admLetterModal && (
      <AdmissionLetterModal
        student={admLetterModal.student}
        lang={admLetterModal.lang}
        onClose={() => setAdmLetterModal(null)}
      />
    )}

    {docsModalStudent && (
      <ManageDocumentsModal
        student={docsModalStudent}
        onClose={() => setDocsModalStudent(null)}
      />
    )}

    {feeRefundStudent && (
      <SeatCancellationRefundModal
        student={feeRefundStudent}
        onClose={() => setFeeRefundStudent(null)}
      />
    )}

    {refundHistoryStudent && (
      <StudentDetailModal
        student={refundHistoryStudent}
        defaultTab="refund"
        onClose={() => setRefundHistoryStudent(null)}
      />
    )}

    <Modal
      open={!!confirmTarget}
      title="Confirm Admission?"
      variant="primary"
      confirmLabel="Yes, Confirm"
      loading={!!confirmTarget && actionLoading === confirmTarget.id}
      onConfirm={() => { if (confirmTarget) void handleConfirmClick(confirmTarget); }}
      onCancel={() => { if (actionLoading === null) setConfirmTarget(null); }}
      message={confirmTarget && (
        <div className="space-y-3">
          <div className="rounded-xl border border-[#0FA968]/30 bg-[#0FA968]/[0.06] px-4 py-3">
            <p className="text-[15px] font-semibold text-gray-900">{confirmTarget.studentNameSSLC}</p>
            <p className="mt-0.5 text-xs text-gray-600">
              {[confirmTarget.course, confirmTarget.year, confirmTarget.category, confirmTarget.admType, confirmTarget.admCat]
                .filter(Boolean).join(' · ')}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {confirmTarget.meritNumber && (<><dt className="text-gray-500">Merit No.</dt><dd className="font-medium text-gray-800">{confirmTarget.meritNumber}</dd></>)}
              {confirmTarget.regNumber && (<><dt className="text-gray-500">Reg No.</dt><dd className="font-medium text-gray-800">{confirmTarget.regNumber}</dd></>)}
              {confirmTarget.fatherName && (<><dt className="text-gray-500">Father</dt><dd className="font-medium text-gray-800">{confirmTarget.fatherName}</dd></>)}
              {(confirmTarget.studentMobile || confirmTarget.fatherMobile) && (<><dt className="text-gray-500">Mobile</dt><dd className="font-medium text-gray-800">{confirmTarget.studentMobile || confirmTarget.fatherMobile}</dd></>)}
            </dl>
          </div>
          <p>
            This student will move to the <span className="font-semibold text-gray-900">{isWPStudent(confirmTarget) ? 'WP Students' : 'Students'}</span> list
            {confirmTarget.regNumber ? ' and receive an admission status update' : ''}. You will then be asked for the allotted category.
          </p>
        </div>
      )}
    />

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

    {showEnrollmentLog && (
      <EnrollmentBreakdownModal
        students={allStudents}
        academicYear={academicYear}
        onClose={() => setShowEnrollmentLog(false)}
      />
    )}
    </>
  );
}
