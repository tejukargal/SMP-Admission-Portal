import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useMeritListSnapshots } from '../hooks/useMeritListSnapshots';
import { updateStudentStatus } from '../services/studentService';
import { saveMeritListSnapshot, deleteMeritListSnapshot } from '../services/meritListSnapshotService';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/common/Button';
import { PageSpinner } from '../components/common/PageSpinner';
import { AdmissionLetterModal } from '../components/common/AdmissionLetterModal';
import { ManageDocumentsModal } from '../components/documents/ManageDocumentsModal';
import { exportMeritListPdf, exportMeritListExcel, sortByMerit, sslcPct, fmtDOB, fmtGender } from '../utils/meritListExport';
import type { Student, AcademicYear, Course, MeritListSnapshot } from '../types';

type Tab = 'pending' | 'cancelled' | 'merit' | 'saved';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];

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
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const { students: allStudents, loading, error } = useStudents(academicYear);

  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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

  // Pending = anything that is not CONFIRMED or CANCELLED (includes PENDING, empty, legacy values)
  const pendingStudents = useMemo(() => {
    let list = allStudents.filter((s) =>
      !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
    );
    if (debouncedSearch.trim()) list = list.filter((s) => matchesSearch(s, debouncedSearch.trim()));
    return sortStudents(list);
  }, [allStudents, debouncedSearch]);

  const cancelledStudents = useMemo(() => {
    let list = allStudents.filter((s) => s.admissionStatus?.trim() === 'CANCELLED');
    if (debouncedSearch.trim()) list = list.filter((s) => matchesSearch(s, debouncedSearch.trim()));
    return sortStudents(list);
  }, [allStudents, debouncedSearch]);

  // Merit list = pending students sorted by SSLC % desc (search applies too)
  const meritStudents = useMemo(() => {
    let list = allStudents.filter((s) =>
      !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
    );
    if (debouncedSearch.trim()) list = list.filter((s) => matchesSearch(s, debouncedSearch.trim()));
    return sortByMerit(list);
  }, [allStudents, debouncedSearch]);

  const courseStats = useMemo(() =>
    COURSES.map((course) => ({
      course,
      pending:   allStudents.filter((s) => s.course === course && !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')).length,
      cancelled: allStudents.filter((s) => s.course === course && s.admissionStatus?.trim() === 'CANCELLED').length,
    }))
  , [allStudents]);

  // ── Saved merit list snapshots ────────────────────────────────────────────
  const {
    snapshots,
    loading: snapshotsLoading,
    error: snapshotsError,
    refetch: refetchSnapshots,
  } = useMeritListSnapshots(academicYear);

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [savingMeritList, setSavingMeritList] = useState(false);
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null);
  const [snapshotExportingPdf, setSnapshotExportingPdf] = useState(false);
  const [snapshotExportingExcel, setSnapshotExportingExcel] = useState(false);

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

  const selectedSnapshot: MeritListSnapshot | undefined =
    snapshots.find((s) => s.id === selectedSnapshotId);

  async function handleSaveMeritList() {
    if (!academicYear) return;
    setSavingMeritList(true);
    try {
      const allPending = allStudents.filter(
        (s) => !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
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
    setTimeout(() => {
      try { exportMeritListExcel(snap.students, snap.academicYear); }
      finally { setSnapshotExportingExcel(false); }
    }, 0);
  }

  // ── Context menu ─────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; student: Student } | null>(null);
  const [admLetterModal, setAdmLetterModal] = useState<{ student: Student; lang: 'en' | 'kn' } | null>(null);
  const [docsModalStudent, setDocsModalStudent] = useState<Student | null>(null);

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
    const MENU_H = 175;
    const x = e.clientX + MENU_W > window.innerWidth ? e.clientX - MENU_W : e.clientX;
    const y = e.clientY + MENU_H > window.innerHeight ? e.clientY - MENU_H : e.clientY;
    setContextMenu({ x, y, student });
  }

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  function handleExportPdf() {
    setExportingPdf(true);
    setTimeout(() => {
      try { exportMeritListPdf(meritStudents, academicYear); }
      finally { setExportingPdf(false); }
    }, 0);
  }

  function handleExportExcel() {
    setExportingExcel(true);
    setTimeout(() => {
      try { exportMeritListExcel(meritStudents, academicYear); }
      finally { setExportingExcel(false); }
    }, 0);
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
      setToastError(false);
      setToastMsg(msgs[newStatus] ?? 'Updated.');
    } catch {
      setToastError(true);
      setToastMsg('Failed to update status. Please try again.');
    } finally {
      setActionLoading(null);
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
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

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

      {/* Course-wise stats strip */}
      {allStudents.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-0 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2 overflow-x-auto">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-3 shrink-0">Course</span>
          {courseStats.map(({ course, pending, cancelled }, i) => {
            const isEmpty = pending === 0 && cancelled === 0;
            return (
              <div key={course} className={`flex items-center gap-1.5 shrink-0 ${isEmpty ? 'opacity-35' : ''}`}>
                <span className="text-xs font-bold text-gray-700 w-7">{course}</span>
                <span className="inline-flex items-center gap-0.5 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5 text-[10px] tabular-nums whitespace-nowrap">
                  <span className="text-yellow-600 font-medium">P</span>
                  <span className="font-bold text-yellow-800">{pending}</span>
                </span>
                <span className="inline-flex items-center gap-0.5 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 text-[10px] tabular-nums whitespace-nowrap">
                  <span className="text-red-600 font-medium">C</span>
                  <span className="font-bold text-red-800">{cancelled}</span>
                </span>
                {i < courseStats.length - 1 && (
                  <span className="text-gray-200 text-xs select-none mx-1.5">|</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex-shrink-0 flex items-center border-b border-gray-200 bg-white rounded-t-lg">
        {([
          { id: 'pending',   label: 'Pending',    count: pendingStudents.length,    badge: 'bg-yellow-100 text-yellow-700' },
          { id: 'cancelled', label: 'Cancelled',  count: cancelledStudents.length,  badge: 'bg-red-100 text-red-700' },
          { id: 'merit',     label: 'Merit List', count: meritStudents.length,      badge: 'bg-blue-100 text-blue-700' },
          { id: 'saved',     label: 'Saved Lists', count: snapshots.length,          badge: 'bg-purple-100 text-purple-700' },
        ] as { id: Tab; label: string; count: number; badge: string }[]).map(({ id, label, count, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
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
          <div className="flex items-center gap-2 ml-auto pr-3">
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
          ) : snapshots.length === 0 ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-2">
              <p className="text-sm text-gray-400">No merit lists saved yet.</p>
              <p className="text-xs text-gray-300">Go to the Merit List tab and click "Save Merit List" to create a snapshot.</p>
            </div>
          ) : (
            <>
              {/* Phase selector pills */}
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

              {/* Action buttons for selected snapshot */}
              {selectedSnapshot && (
                <div className="flex-shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => handleSnapshotExportPdf(selectedSnapshot)}
                    disabled={snapshotExportingPdf}
                    className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {snapshotExportingPdf ? 'Generating…' : 'Save PDF'}
                  </button>
                  <button
                    onClick={() => handleSnapshotExportExcel(selectedSnapshot)}
                    disabled={snapshotExportingExcel}
                    className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 bg-green-50 hover:bg-green-100 hover:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {snapshotExportingExcel ? 'Generating…' : 'Save Excel'}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => void handleDeleteSnapshot(selectedSnapshot.id)}
                      disabled={deletingSnapshotId !== null}
                      className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                    >
                      {deletingSnapshotId === selectedSnapshot.id ? 'Deleting…' : 'Delete Phase'}
                    </button>
                  )}
                  <span className={`text-xs text-gray-400 ${isAdmin ? '' : 'ml-auto'}`}>
                    {selectedSnapshot.students.length} student{selectedSnapshot.students.length !== 1 ? 's' : ''} · Phase {selectedSnapshot.phase}
                  </span>
                </div>
              )}

              {/* Snapshot student table */}
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
                          <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap font-medium">{student.meritNumber || idx + 1}</td>
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
          )}
        </div>

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
                  <td className="px-2 py-2 text-center text-gray-700 whitespace-nowrap font-medium">{student.meritNumber || idx + 1}</td>
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
              {displayStudents.map((student, idx) => (
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
                              onClick={() => void handleAction(student, 'CONFIRMED')}
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
              ))}
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
    </>
  );
}
