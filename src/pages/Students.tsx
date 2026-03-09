import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { deleteStudent } from '../services/studentService';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { useFilters } from '../contexts/FiltersContext';
import { useAuth } from '../contexts/AuthContext';
import { exportStudentsPdf } from '../utils/studentsPdf';
import { generateAnsLetter } from '../utils/ansLetter';
import { printStudentProfile } from '../utils/printProfile';
import { ManageDocumentsModal } from '../components/documents/ManageDocumentsModal';
import { StudyCertificateModal } from '../components/common/StudyCertificateModal';
import { MissingDocsModal } from '../components/documents/MissingDocsModal';
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category } from '../types';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

const fs = 'rounded border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

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

function LoadingGate() {
  return (
    <div className="h-full flex items-center justify-center" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-12 py-10 w-96 flex flex-col items-center text-center">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Students</h2>
        <p className="text-xs text-gray-400 mb-6">Loading student records…</p>
        <p className="text-sm font-medium text-gray-700">Thejaraj R</p>
        <p className="text-[10px] text-gray-400">Developer</p>
      </div>
    </div>
  );
}

export function Students() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();
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
    admStatusFilter,
    visibleCount,
  } = studentsFilters;

  function setSearchTerm(v: string) { setStudentsFilters({ searchTerm: v }); }
  function setCourseFilter(v: Course | '') { setStudentsFilters({ courseFilter: v }); }
  function setYearFilter(v: Year | '') { setStudentsFilters({ yearFilter: v }); }
  function setGenderFilter(v: Gender | '') { setStudentsFilters({ genderFilter: v }); }
  function setCategoryFilter(v: Category | '') { setStudentsFilters({ categoryFilter: v }); }
  function setAdmTypeFilter(v: AdmType | '') { setStudentsFilters({ admTypeFilter: v }); }
  function setAdmCatFilter(v: AdmCat | '') { setStudentsFilters({ admCatFilter: v }); }
  function setAdmStatusFilter(v: string) { setStudentsFilters({ admStatusFilter: v }); }
  function setVisibleCount(updater: ((c: number) => number) | number) {
    const next = typeof updater === 'function' ? updater(visibleCount) : updater;
    setStudentsFilters({ visibleCount: next });
  }

  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [savingPdf, setSavingPdf] = useState(false);

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

  const [deleteModal, setDeleteModal] = useState<{ open: boolean; student: Student | null }>({
    open: false,
    student: null,
  });
  const [deleting, setDeleting] = useState(false);

  const [docsModalStudent, setDocsModalStudent] = useState<Student | null>(null);
  const [showMissingDocs, setShowMissingDocs] = useState(false);
  const [studyCertStudent, setStudyCertStudent] = useState<Student | null>(null);

  // ── Right-click context menu ──────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; student: Student } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setContextMenu(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  function handleContextMenu(e: React.MouseEvent, student: Student) {
    e.preventDefault();
    e.stopPropagation();
    const MENU_W = 190;
    const MENU_H = 190;
    const x = e.clientX + MENU_W > window.innerWidth ? e.clientX - MENU_W : e.clientX;
    const y = e.clientY + MENU_H > window.innerHeight ? e.clientY - MENU_H : e.clientY;
    setContextMenu({ x, y, student });
  }

  // Single unfiltered fetch — all filtering done client-side
  const { students: allStudents, loading, error, refetch } = useStudents(academicYear);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const filteredStudents = useMemo(() => {
    let result = allStudents;
    if (courseFilter)    result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)      result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)    result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter)  result = result.filter((s) => s.category === categoryFilter);
    if (admTypeFilter)   result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)    result = result.filter((s) => s.admCat === admCatFilter);
    if (admStatusFilter) result = result.filter((s) =>
      admStatusFilter === 'PENDING'
        ? !['PROVISIONAL', 'CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
        : s.admissionStatus === admStatusFilter
    );
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
  }, [allStudents, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, admStatusFilter, debouncedSearch]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredStudents]);

  const visibleStudents = useMemo(
    () => filteredStudents.slice(0, visibleCount),
    [filteredStudents, visibleCount]
  );

  const hasMore = visibleCount < filteredStudents.length;

  const hasActiveFilters =
    !!searchTerm || !!courseFilter || !!yearFilter || !!genderFilter ||
    !!categoryFilter || !!admTypeFilter || !!admCatFilter || !!admStatusFilter;

  function clearFilters() {
    clearStudentsFilters();
    setDebouncedSearch('');
  }

  // Stats from the full unfiltered dataset
  const stats = useMemo(() => {
    if (!allStudents.length) return null;
    const yearCount: Record<string, number> = {};
    const courseCount: Record<string, number> = {};
    for (const s of allStudents) {
      yearCount[s.year] = (yearCount[s.year] ?? 0) + 1;
      courseCount[s.course] = (courseCount[s.course] ?? 0) + 1;
    }
    return { yearCount, courseCount, total: allStudents.length };
  }, [allStudents]);

  function openDeleteModal(student: Student) {
    setDeleteModal({ open: true, student });
  }

  function closeDeleteModal() {
    setDeleteModal({ open: false, student: null });
  }

  async function handleDelete() {
    if (!deleteModal.student) return;
    setDeleting(true);
    try {
      await deleteStudent(deleteModal.student.id);
      closeDeleteModal();
      refetch();
    } catch {
      // keep modal open on failure
    } finally {
      setDeleting(false);
    }
  }

  function handleSavePdf() {
    setSavingPdf(true);
    // Defer to next tick so the button state renders before the synchronous PDF work
    setTimeout(() => {
      try {
        exportStudentsPdf(filteredStudents, {
          academicYear,
          courseFilter,
          yearFilter,
          genderFilter,
          admTypeFilter,
          admCatFilter,
          admStatusFilter,
          searchTerm: debouncedSearch,
        });
      } finally {
        setSavingPdf(false);
      }
    }, 0);
  }

  const isLoading = settingsLoading || loading;

  if (isLoading) return <LoadingGate />;

  return (
    <>
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* Page header + stats chips */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0 relative">
        <div className="shrink-0">
          <h2 className="text-base font-semibold text-gray-900 leading-tight">Students</h2>
          {academicYear && (
            <p className="text-[10px] text-gray-400 leading-tight">{academicYear}</p>
          )}
        </div>

        {!isLoading && stats && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              {/* Total chip */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-gray-400 font-medium">Total</span>
                <AnimNum value={stats.total} />
              </div>

              <span className="text-gray-200 text-xs select-none shrink-0">·</span>

              {/* Study-year chips */}
              {YEARS.map((yr) => {
                const count = stats.yearCount[yr] ?? 0;
                const isSelected = yearFilter === yr;
                const isDimmed = (!!yearFilter && !isSelected) || count === 0;
                const label = yr === '1ST YEAR' ? '1st' : yr === '2ND YEAR' ? '2nd' : '3rd';
                return (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(isSelected ? '' : yr)}
                    className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300'
                        : isDimmed
                        ? 'bg-white border-gray-100'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`font-medium ${isSelected ? 'text-blue-700' : isDimmed ? 'text-gray-300' : 'text-gray-500'}`}>
                      {label}
                    </span>
                    <span className={isSelected ? 'text-blue-800' : isDimmed ? 'text-gray-300' : 'text-gray-800'}>
                      <AnimNum value={count} />
                    </span>
                  </button>
                );
              })}

              <span className="text-gray-200 text-xs select-none shrink-0">·</span>

              {/* Course chips */}
              {COURSES.map((c) => {
                const count = stats.courseCount[c] ?? 0;
                const isSelected = courseFilter === c;
                const isDimmed = (!!courseFilter && !isSelected) || count === 0;
                return (
                  <button
                    key={c}
                    onClick={() => setCourseFilter(isSelected ? '' : c)}
                    className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300'
                        : isDimmed
                        ? 'bg-white border-gray-100'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`font-medium ${isSelected ? 'text-blue-700' : isDimmed ? 'text-gray-300' : 'text-gray-500'}`}>
                      {c}
                    </span>
                    <span className={isSelected ? 'text-blue-800' : isDimmed ? 'text-gray-300' : 'text-gray-800'}>
                      <AnimNum value={count} />
                    </span>
                  </button>
                );
              })}

              {/* Filtered count */}
              {hasActiveFilters && (
                <>
                  <span className="text-gray-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-blue-500 font-medium">Filtered</span>
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

      {/* Filters — always visible, never scrolls */}
      <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search name / reg / mobile…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-44 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <select className={fs} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value as Course | '')}>
            <option value="">All Courses</option>
            <option value="CE">CE</option>
            <option value="ME">ME</option>
            <option value="EC">EC</option>
            <option value="CS">CS</option>
            <option value="EE">EE</option>
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
            <option value="">All Cats</option>
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
          <select className={fs} value={admStatusFilter} onChange={(e) => setAdmStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="PROVISIONAL">PROVISIONAL</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="PENDING">PENDING</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded border border-orange-400 px-2 py-1.5 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400 cursor-pointer transition-colors font-medium"
            >
              Clear Filters
            </button>
          )}
          {!isLoading && allStudents.length > 0 && (
            <button
              onClick={() => setShowMissingDocs(true)}
              className="rounded border border-purple-300 px-2 py-1.5 text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 cursor-pointer transition-colors font-medium flex items-center gap-1"
            >
              📁 Doc Status
            </button>
          )}
          {!isLoading && filteredStudents.length > 0 && (
            <button
              onClick={handleSavePdf}
              disabled={savingPdf}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {savingPdf ? 'Generating…' : 'Save PDF'}
            </button>
          )}
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
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No students found.</div>
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
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Adm Type</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-16">Adm Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Mobile</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Status</th>
                {isAdmin && (
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-48">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleStudents.map((student, idx) => (
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
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void navigate(`/enroll?edit=${student.id}`)}
                        >
                          Edit
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => openDeleteModal(student)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {hasMore && (
                <tr>
                  <td colSpan={isAdmin ? 11 : 10} className="px-4 py-2.5 text-center">
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredStudents.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto">
            Showing {Math.min(visibleCount, filteredStudents.length)} of {filteredStudents.length}
            {filteredStudents.length < allStudents.length && (
              <span className="text-gray-400"> (filtered from {allStudents.length} total)</span>
            )}
          </div>
        </div>
      )}

      <Modal
        open={deleteModal.open}
        title="Delete Student"
        message={
          <>
            Are you sure you want to delete{' '}
            <strong>{deleteModal.student?.studentNameSSLC}</strong>? This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={closeDeleteModal}
      />
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
        {/* Menu */}
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[185px] text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 mb-1 truncate max-w-[185px]">
            {contextMenu.student.studentNameSSLC}
          </div>
          <button
            className="w-full text-left px-3 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
            onClick={() => { setDocsModalStudent(contextMenu.student); setContextMenu(null); }}
          >
            <span className="text-sm leading-none">📁</span>
            Manage Documents
          </button>
          <button
            className="w-full text-left px-3 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
            onClick={() => { printStudentProfile(contextMenu.student); setContextMenu(null); }}
          >
            <span className="text-sm leading-none">🖨️</span>
            Print Profile
          </button>
          <button
            className="w-full text-left px-3 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
            onClick={() => { generateAnsLetter(contextMenu.student); setContextMenu(null); }}
          >
            <span className="text-sm leading-none">📄</span>
            ANS Letter
          </button>
          <button
            className="w-full text-left px-3 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors flex items-center gap-2"
            onClick={() => { setStudyCertStudent(contextMenu.student); setContextMenu(null); }}
          >
            <span className="text-sm leading-none">📋</span>
            Study Certificate
          </button>
          <button
            disabled
            className="w-full text-left px-3 py-2 text-gray-300 flex items-center gap-2 cursor-not-allowed"
          >
            <span className="text-sm leading-none">📜</span>
            Transfer Certificate
            <span className="ml-auto text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Soon</span>
          </button>
        </div>
      </>
    )}

    {docsModalStudent && (
      <ManageDocumentsModal
        student={docsModalStudent}
        onClose={() => setDocsModalStudent(null)}
      />
    )}

    {showMissingDocs && (
      <MissingDocsModal
        students={allStudents}
        onManage={(student) => { setShowMissingDocs(false); setDocsModalStudent(student); }}
        onClose={() => setShowMissingDocs(false)}
      />
    )}

    {studyCertStudent && (
      <StudyCertificateModal
        student={studyCertStudent}
        onClose={() => setStudyCertStudent(null)}
      />
    )}
    </>
  );
}
