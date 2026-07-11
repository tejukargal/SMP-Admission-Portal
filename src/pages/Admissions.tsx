import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useMeritListSnapshots } from '../hooks/useMeritListSnapshots';
import { updateStudentStatus, updateStudentAllottedCategory } from '../services/studentService';
import { getAllFeeRecordsByStudent } from '../services/feeRecordService';
import { SMP_FEE_HEADS } from '../types';
import { saveMeritListSnapshot, saveLateralMeritListSnapshot, deleteMeritListSnapshot } from '../services/meritListSnapshotService';
import { createStudentNotification } from '../services/studentNotificationService';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/common/Button';
import { PageSpinner } from '../components/common/PageSpinner';
import { AdmissionLetterModal } from '../components/common/AdmissionLetterModal';
import { ManageDocumentsModal } from '../components/documents/ManageDocumentsModal';
import { AllottedCategoryModal } from '../components/common/AllottedCategoryModal';
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
  ) {
    setActionLoading(student.id);
    try {
      await updateStudentStatus(student.id, newStatus);
      const msgs: Record<string, string> = {
        CONFIRMED: `${student.studentNameSSLC} confirmed. Student now appears in the Students list.`,
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
    } catch {
      setToastError(true);
      setToastMsg('Failed to update status. Please try again.');
    } finally {
      setActionLoading(null);
    }
  }

  // ── Allotted category ────────────────────────────────────────────────────
  const [allottedCatStudent, setAllottedCatStudent] = useState<Student | null>(null);
  const [savingAllottedCat, setSavingAllottedCat] = useState(false);

  async function handleConfirmClick(student: Student) {
    await handleAction(student, 'CONFIRMED');
    setAllottedCatStudent(student);
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

  return (
    <>
    <div className="h-full flex flex-col gap-1.5" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* Page header */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0 relative">
        <div className="shrink-0">
          <h2 className="text-base font-semibold text-gray-900 leading-tight">Admissions</h2>
          {academicYear && (
            <p className="text-[10px] text-gray-400 leading-tight">{academicYear}</p>
          )}
        </div>

        <span className="text-gray-200 text-sm select-none shrink-0">|</span>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
            <span className="text-yellow-600 font-medium">Pending</span>
            <span className="font-bold tabular-nums text-yellow-800">{pendingStudents.length}</span>
          </div>
          <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
            <span className="text-red-600 font-medium">Cancelled</span>
            <span className="font-bold tabular-nums text-red-800">{cancelledStudents.length}</span>
          </div>
        </div>

        <Button variant="secondary" size="sm" onClick={() => void navigate('/students')} className="ml-auto shrink-0">
          Students →
        </Button>

        {/* Toast */}
        {toastMsg && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-2 border text-xs font-medium px-3 py-1.5 rounded-full shadow-sm whitespace-nowrap pointer-events-auto ${
              toastError
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-green-50 border-green-200 text-green-800'
            }`}
            style={{ animation: 'toast-in 0.2s ease-out' }}
          >
            <span className={toastError ? 'text-red-500' : 'text-green-500'}>
              {toastError ? '✕' : '✓'}
            </span>
            {toastMsg}
            <button
              onClick={() => setToastMsg('')}
              className={`leading-none ml-1 ${toastError ? 'text-red-400 hover:text-red-600' : 'text-green-400 hover:text-green-600'}`}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Filter bar: Search · Quota · Course */}
      <div className="flex-shrink-0 flex items-center gap-3 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2 flex-wrap">
        {/* Search */}
        <div className="relative shrink-0">
          <input
            type="text"
            placeholder="Search name / father / mobile…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-52 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 pr-6"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 leading-none text-sm"
            >
              ×
            </button>
          )}
        </div>

        <span className="text-gray-200 text-sm select-none shrink-0">|</span>

        {/* Quota filter */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Quota</span>
          {(['aided', 'unaided', 'all'] as const).map((q) => (
            <button
              key={q}
              onClick={() => handleQuotaChange(q)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                quotaFilter === q
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {q === 'aided' ? 'Aided' : q === 'unaided' ? 'UnAided' : 'All'}
            </button>
          ))}
        </div>

        <span className="text-gray-200 text-sm select-none shrink-0">|</span>

        {/* Course filter */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Course</span>
          <button
            onClick={() => setCourseFilter('ALL')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              courseFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {availableCourses.map((c) => (
            <button
              key={c}
              onClick={() => setCourseFilter(c)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                courseFilter === c
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {allStudents.length > 0 && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <button
              onClick={() => setShowEnrollmentLog(true)}
              className="rounded border border-sky-200 px-2.5 py-1 text-xs text-sky-700 bg-sky-50 hover:bg-sky-100 hover:border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-400 transition-colors font-medium shrink-0"
            >
              Enrollment Log
            </button>
          </>
        )}
      </div>

      {/* Course-wise stats strip */}
      {allStudents.length > 0 && (() => {
        const isLateral      = activeTab === 'pendingLateral' || activeTab === 'meritLateral';
        const totalPending   = isLateral
          ? courseStats.reduce((s, c) => s + c.pendingLateral, 0)
          : courseStats.reduce((s, c) => s + c.pendingRegular, 0);
        const totalCancelled = courseStats.reduce((s, c) => s + c.cancelled, 0);
        const courseColors: Record<Course, string> = {
          CE: 'text-amber-600', ME: 'text-green-600', EC: 'text-sky-600', CS: 'text-teal-600', EE: 'text-violet-600',
        };
        const pendingColor = 'text-emerald-700';
        const pendingLabelColor = 'text-emerald-400';
        return (
          <div
            className="flex-shrink-0 bg-white/60 rounded-lg border border-gray-200 flex items-center px-3 py-1.5"
            style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.06)' }}
          >
            {/* Legend */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Pending</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-red-500">Cancelled</span>
              </div>
            </div>

            <span className="w-px h-5 bg-gray-200 shrink-0 mx-3" />

            {/* Per-course blocks */}
            <div className="flex items-center gap-0 flex-1 min-w-0 overflow-x-auto">
              {courseStats.map(({ course, pendingRegular, pendingLateral, cancelled }, i) => {
                const pending = isLateral ? pendingLateral : pendingRegular;
                const isEmpty = pending === 0 && cancelled === 0;
                return (
                  <div key={course} className={`flex items-center shrink-0 ${isEmpty ? 'opacity-25' : ''}`}>
                    {i > 0 && <span className="w-px h-4 bg-gray-200 mx-3 shrink-0" />}
                    <span className={`text-[10px] font-bold uppercase ${courseColors[course]} mr-2 shrink-0`}>{course}</span>
                    <div className="flex flex-col items-center">
                      <span className={`text-sm font-black tabular-nums leading-none ${pendingColor}`}>{pending}</span>
                      <span className={`text-[8px] font-semibold uppercase tracking-wide leading-none mt-px ${pendingLabelColor}`}>Pend</span>
                    </div>
                    <span className="w-px h-4 bg-gray-100 mx-1.5 shrink-0" />
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-black tabular-nums text-red-500 leading-none">{cancelled}</span>
                      <span className="text-[8px] font-semibold text-red-300 uppercase tracking-wide leading-none mt-px">Canc</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <span className="w-px h-5 bg-gray-200 shrink-0 mx-3" />
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Total</span>
              <div className="flex flex-col items-center">
                <span className={`text-sm font-black tabular-nums leading-none ${pendingColor}`}>{totalPending}</span>
                <span className={`text-[8px] font-semibold uppercase tracking-wide leading-none mt-px ${pendingLabelColor}`}>Pend</span>
              </div>
              <span className="w-px h-4 bg-gray-100 shrink-0" />
              <div className="flex flex-col items-center">
                <span className="text-sm font-black tabular-nums text-red-500 leading-none">{totalCancelled}</span>
                <span className="text-[8px] font-semibold text-red-300 uppercase tracking-wide leading-none mt-px">Canc</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center border-b border-gray-200 bg-white rounded-t-lg overflow-x-auto">
        {/* ── Normal tabs ── */}
        {([
          { id: 'pending', label: 'Pending',   count: pendingStudents.length, badge: 'bg-yellow-100 text-yellow-700' },
          { id: 'merit',   label: 'Merit List', count: meritStudents.length,  badge: 'bg-blue-100 text-blue-700' },
        ] as { id: Tab; label: string; count: number; badge: string }[]).map(({ id, label, count, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${badge}`}>
                {count}
              </span>
            )}
          </button>
        ))}

        {/* ── Separator ── */}
        <div className="flex-shrink-0 self-stretch w-px bg-gray-300 mx-1" />

        {/* ── Lateral tabs ── */}
        {([
          { id: 'pendingLateral', label: 'Pending Lateral',    count: pendingLateralStudents.length, badge: 'bg-orange-100 text-orange-700' },
          { id: 'meritLateral',   label: 'Merit List Lateral', count: meritLateralStudents.length,   badge: 'bg-teal-100 text-teal-700' },
        ] as { id: Tab; label: string; count: number; badge: string }[]).map(({ id, label, count, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${badge}`}>
                {count}
              </span>
            )}
          </button>
        ))}

        {/* ── Separator ── */}
        <div className="flex-shrink-0 self-stretch w-px bg-gray-300 mx-1" />

        {/* ── Utility tabs (Cancelled, Saved Lists) ── */}
        {([
          { id: 'saved',     label: 'Saved Lists', count: snapshots.length + lateralSnapshots.length,  badge: 'bg-purple-100 text-purple-700' },
          { id: 'cancelled', label: 'Cancelled',   count: cancelledStudents.length,                    badge: 'bg-red-100 text-red-700' },
        ] as { id: Tab; label: string; count: number; badge: string }[]).map(({ id, label, count, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${badge}`}>
                {count}
              </span>
            )}
          </button>
        ))}

        {/* Merit list export buttons — only shown when merit tab is active */}
        {activeTab === 'merit' && meritStudents.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 ml-auto pr-3">
            {isAdmin && (
              <button
                onClick={() => void handleSaveMeritList()}
                disabled={savingMeritList}
                className="rounded border border-purple-300 px-2.5 py-1 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingMeritList ? 'Saving…' : 'Save Merit List'}
              </button>
            )}
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingPdf ? 'Generating…' : 'Save PDF'}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exportingExcel}
              className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingExcel ? 'Generating…' : 'Save Excel'}
            </button>
          </div>
        )}

        {/* Lateral merit list export buttons */}
        {activeTab === 'meritLateral' && meritLateralStudents.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 ml-auto pr-3">
            {isAdmin && (
              <button
                onClick={() => void handleSaveLateralMeritList()}
                disabled={savingLateralMeritList}
                className="rounded border border-purple-300 px-2.5 py-1 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingLateralMeritList ? 'Saving…' : 'Save Merit List'}
              </button>
            )}
            <button
              onClick={handleExportLateralPdf}
              disabled={exportingLateralPdf}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingLateralPdf ? 'Generating…' : 'Save PDF'}
            </button>
            <button
              onClick={handleExportLateralExcel}
              disabled={exportingLateralExcel}
              className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exportingLateralExcel ? 'Generating…' : 'Save Excel'}
            </button>
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
              {/* Regular / Lateral toggle */}
              <div className="flex-shrink-0 flex items-center gap-1.5">
                <button
                  onClick={() => setSavedListView('regular')}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    savedListView === 'regular'
                      ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-purple-300 hover:text-purple-700'
                  }`}
                >
                  Regular {snapshots.length > 0 && <span className="ml-1 opacity-75">({snapshots.length})</span>}
                </button>
                <button
                  onClick={() => setSavedListView('lateral')}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                    savedListView === 'lateral'
                      ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-teal-300 hover:text-teal-700'
                  }`}
                >
                  Lateral {lateralSnapshots.length > 0 && <span className="ml-1 opacity-75">({lateralSnapshots.length})</span>}
                </button>
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
                    <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
                      {snapshots.map((snap) => {
                        const d = new Date(snap.savedAt);
                        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        const isSelected = snap.id === selectedSnapshotId;
                        return (
                          <button
                            key={snap.id}
                            onClick={() => setSelectedSnapshotId(snap.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                              isSelected
                                ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                                : 'bg-white border-gray-300 text-gray-600 hover:border-purple-300 hover:text-purple-700'
                            }`}
                          >
                            <span>Phase {snap.phase}</span>
                            <span className={`text-[10px] ${isSelected ? 'text-purple-200' : 'text-gray-400'}`}>{dateStr}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedSnapshot && (
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <button onClick={() => handleSnapshotExportPdf(selectedSnapshot)} disabled={snapshotExportingPdf} className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {snapshotExportingPdf ? 'Generating…' : 'Save PDF'}
                        </button>
                        <button onClick={() => handleSnapshotExportExcel(selectedSnapshot)} disabled={snapshotExportingExcel} className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {snapshotExportingExcel ? 'Generating…' : 'Save Excel'}
                        </button>
                        {isAdmin && (
                          <button onClick={() => void handleDeleteSnapshot(selectedSnapshot.id)} disabled={deletingSnapshotId !== null} className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto">
                            {deletingSnapshotId === selectedSnapshot.id ? 'Deleting…' : 'Delete Phase'}
                          </button>
                        )}
                        <span className={`text-xs text-gray-400 ${isAdmin ? '' : 'ml-auto'}`}>
                          {selectedSnapshot.students.length} student{selectedSnapshot.students.length !== 1 ? 's' : ''} · Phase {selectedSnapshot.phase}
                        </span>
                      </div>
                    )}

                    {selectedSnapshot && (
                      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-8">ಕ್ರ.ಸಂ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-14">ಮೆರಿಟ್ ನಂ.</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-12">ಲಿಂಗ</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">ತಂದೆಯ ಹೆಸರು</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-24">ಹುಟ್ಟಿದ ದಿನಾಂಕ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ಅರ್ಹ ಪ್ರವರ್ಗ</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-28">ಆದಾಯ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-24">ಗ+ವಿ ಅಂಕ</th>
                              <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ಗ+ವಿ %</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ಗರಿಷ್ಠ ಅಂಕ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ಗಳಿಸಿದ ಅಂಕ</th>
                              <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ಶೇಕಡಾ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {sortByMerit(selectedSnapshot.students).map((student, idx) => (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors">
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
                        <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
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
                    <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
                      {lateralSnapshots.map((snap) => {
                        const d = new Date(snap.savedAt);
                        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        const isSelected = snap.id === selectedLateralSnapshotId;
                        return (
                          <button
                            key={snap.id}
                            onClick={() => setSelectedLateralSnapshotId(snap.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                              isSelected
                                ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                                : 'bg-white border-gray-300 text-gray-600 hover:border-teal-300 hover:text-teal-700'
                            }`}
                          >
                            <span>Phase {snap.phase}</span>
                            <span className={`text-[10px] ${isSelected ? 'text-teal-200' : 'text-gray-400'}`}>{dateStr}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedLateralSnapshot && (
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <button onClick={() => handleLateralSnapshotExportPdf(selectedLateralSnapshot)} disabled={lateralSnapshotExportingPdf} className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {lateralSnapshotExportingPdf ? 'Generating…' : 'Save PDF'}
                        </button>
                        <button onClick={() => handleLateralSnapshotExportExcel(selectedLateralSnapshot)} disabled={lateralSnapshotExportingExcel} className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {lateralSnapshotExportingExcel ? 'Generating…' : 'Save Excel'}
                        </button>
                        {isAdmin && (
                          <button onClick={() => void handleDeleteLateralSnapshot(selectedLateralSnapshot.id)} disabled={deletingLateralSnapshotId !== null} className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto">
                            {deletingLateralSnapshotId === selectedLateralSnapshot.id ? 'Deleting…' : 'Delete Phase'}
                          </button>
                        )}
                        <span className={`text-xs text-gray-400 ${isAdmin ? '' : 'ml-auto'}`}>
                          {selectedLateralSnapshot.students.length} student{selectedLateralSnapshot.students.length !== 1 ? 's' : ''} · Phase {selectedLateralSnapshot.phase}
                        </span>
                      </div>
                    )}

                    {selectedLateralSnapshot && (
                      <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-8">ಕ್ರ.ಸಂ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-14">ಮೆರಿಟ್ ನಂ.</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-12">ಲಿಂಗ</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">ತಂದೆಯ ಹೆಸರು</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-24">ಹುಟ್ಟಿದ ದಿನಾಂಕ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ಅರ್ಹ ಪ್ರವರ್ಗ</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-28">ಆದಾಯ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-24">ಗ+ವಿ ಅಂಕ</th>
                              <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ಗ+ವಿ %</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-28">SSLC ಅಂಕ</th>
                              <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ಶೇಕಡಾ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-16">ಅರ್ಹತೆ</th>
                              <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-32">Trade/Combination</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ITI/PUC ಗರಿಷ್ಠ</th>
                              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ITI/PUC ಗಳಿಸಿದ</th>
                              <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ITI/PUC %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {sortByLateralMerit(selectedLateralSnapshot.students).map((student, idx) => {
                              const lMax = student.priorQualification === 'ITI' ? student.itiMaxTotal : student.pucMaxTotal;
                              const lObt = student.priorQualification === 'ITI' ? student.itiObtainedTotal : student.pucObtainedTotal;
                              const lPct = student.priorQualification === 'ITI' ? student.itiPercentage : student.pucPercentage;
                              return (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
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
                        <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
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
          <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-8">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name (SSLC)</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Reg No</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Course</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Year</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Gender</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-16">Prior Qual</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Adm Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-16">Adm Cat</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Mobile</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Enrolled On</th>
                  {isAdmin && (
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-44">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingLateralStudents.map((student, idx) => (
                  <tr
                    key={student.id}
                    className="hover:bg-gray-50 transition-colors cursor-context-menu"
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
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actionLoading !== null}
                            onClick={() => navigate(`/enroll?edit=${student.id}`)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            className="!bg-green-600 !hover:bg-green-700 border-transparent text-white"
                            loading={actionLoading === student.id}
                            disabled={actionLoading !== null && actionLoading !== student.id}
                            onClick={() => void handleConfirmClick(student)}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={actionLoading === student.id}
                            disabled={actionLoading !== null && actionLoading !== student.id}
                            onClick={() => void handleAction(student, 'CANCELLED')}
                          >
                            Cancel
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
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
          <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-8">ಕ್ರ.ಸಂ</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-14">ಮೆರಿಟ್ ನಂ.</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-12">ಲಿಂಗ</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">ತಂದೆಯ ಹೆಸರು</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-24">ಹುಟ್ಟಿದ ದಿನಾಂಕ</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ಅರ್ಹ ಪ್ರವರ್ಗ</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-28">ಆದಾಯ</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-28">SSLC ಅಂಕ</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ಶೇಕಡಾ</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-16">ಅರ್ಹತೆ</th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-32">Trade/Combination</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ITI/PUC ಗರಿಷ್ಠ</th>
                  <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ITI/PUC ಗಳಿಸಿದ</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ITI/PUC %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {meritLateralStudents.map((student, idx) => {
                  const lMax = student.priorQualification === 'ITI' ? student.itiMaxTotal : student.pucMaxTotal;
                  const lObt = student.priorQualification === 'ITI' ? student.itiObtainedTotal : student.pucObtainedTotal;
                  const lPct = student.priorQualification === 'ITI' ? student.itiPercentage : student.pucPercentage;
                  return (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
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
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
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
        <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-8">ಕ್ರ.ಸಂ</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-14">ಮೆರಿಟ್ ನಂ.</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">ಅಭ್ಯರ್ಥಿಯ ಹೆಸರು</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-12">ಲಿಂಗ</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">ತಂದೆಯ ಹೆಸರು</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-24">ಹುಟ್ಟಿದ ದಿನಾಂಕ</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ಅರ್ಹ ಪ್ರವರ್ಗ</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-28">ಆದಾಯ</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-24">ಗ+ವಿ ಅಂಕ</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ಗ+ವಿ %</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ಗರಿಷ್ಠ ಅಂಕ</th>
                <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-20">ಗಳಿಸಿದ ಅಂಕ</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap w-20">ಶೇಕಡಾ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meritStudents.map((student, idx) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
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
          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
            {meritStudents.length} student{meritStudents.length !== 1 ? 's' : ''} · sorted by SSLC % (highest first)
          </div>
        </div>

      ) : (
        /* ── Pending / Cancelled table ────────────────────────────────────── */
        <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-8">#</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">Name (SSLC)</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Reg No</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Course</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Year</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Gender</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Adm Type</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-16">Adm Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Mobile</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Enrolled On</th>
                {isAdmin && (
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-44">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayStudents.map((student, idx) => {
                const hasFeePaid = activeTab === 'cancelled' && (cancelledFeePaid.get(student.id) ?? 0) > 0;
                return (
                <tr
                  key={student.id}
                  className={`transition-colors cursor-context-menu ${hasFeePaid ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}
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
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={actionLoading !== null}
                              onClick={() => navigate(`/enroll?edit=${student.id}`)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              className="!bg-green-600 !hover:bg-green-700 border-transparent text-white"
                              loading={actionLoading === student.id}
                              disabled={actionLoading !== null && actionLoading !== student.id}
                              onClick={() => void handleConfirmClick(student)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              loading={actionLoading === student.id}
                              disabled={actionLoading !== null && actionLoading !== student.id}
                              onClick={() => void handleAction(student, 'CANCELLED')}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={actionLoading === student.id}
                            disabled={actionLoading !== null && actionLoading !== student.id}
                            onClick={() => void handleAction(student, 'PENDING')}
                          >
                            Restore to Pending
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
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
          className="fixed z-50 bg-white border border-gray-200/80 rounded-2xl overflow-hidden min-w-[220px]"
          style={{ left: contextMenu.x, top: contextMenu.y, boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 pt-2.5 pb-2 border-b border-gray-100 flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
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
