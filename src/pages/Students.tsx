import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { deleteStudent } from '../services/studentService';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { useFilters } from '../contexts/FiltersContext';
import { useAuth } from '../contexts/AuthContext';
import { exportStudentsPdf } from '../utils/studentsPdf';
import { ManageDocumentsModal } from '../components/documents/ManageDocumentsModal';
import { PrintProfileModal } from '../components/student/PrintProfileModal';
import { AnsLetterPreviewModal } from '../components/student/AnsLetterPreviewModal';
import { StudentDetailModal } from '../components/student/StudentDetailModal';
import { StudyCertificateModal } from '../components/common/StudyCertificateModal';
import { TransferCertificateModal } from '../components/common/TransferCertificateModal';
import { ProvisionalCertificateModal } from '../components/common/ProvisionalCertificateModal';
import { MissingDocsModal } from '../components/documents/MissingDocsModal';
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category } from '../types';
import { PageSpinner } from '../components/common/PageSpinner';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

const fs = 'rounded-lg border border-emerald-100 px-2 py-1.5 text-xs bg-white/80 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 cursor-pointer text-gray-700';

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
  return <PageSpinner />;
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
    visibleCount,
  } = studentsFilters;

  function setSearchTerm(v: string) { setStudentsFilters({ searchTerm: v }); }
  function setCourseFilter(v: Course | '') { setStudentsFilters({ courseFilter: v }); }
  function setYearFilter(v: Year | '') { setStudentsFilters({ yearFilter: v }); }
  function setGenderFilter(v: Gender | '') { setStudentsFilters({ genderFilter: v }); }
  function setCategoryFilter(v: Category | '') { setStudentsFilters({ categoryFilter: v }); }
  function setAdmTypeFilter(v: AdmType | '') { setStudentsFilters({ admTypeFilter: v }); }
  function setAdmCatFilter(v: AdmCat | '') { setStudentsFilters({ admCatFilter: v }); }
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

  const [deleteModal, setDeleteModal] = useState<{ open: boolean; student: Student | null }>({
    open: false,
    student: null,
  });
  const [deleting, setDeleting] = useState(false);

  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [docsModalStudent, setDocsModalStudent] = useState<Student | null>(null);
  const [printProfileStudent, setPrintProfileStudent] = useState<Student | null>(null);
  const [showMissingDocs, setShowMissingDocs] = useState(false);
  const [ansLetterStudent, setAnsLetterStudent] = useState<Student | null>(null);
  const [studyCertStudent, setStudyCertStudent] = useState<Student | null>(null);
  const [tcStudent, setTcStudent] = useState<Student | null>(null);
  const [pcStudent, setPcStudent] = useState<Student | null>(null);

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
    const MENU_H = 250;
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
    let result = allStudents.filter((s) => s.admissionStatus === 'CONFIRMED');
    if (courseFilter)    result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)      result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)    result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter)  result = result.filter((s) => s.category === categoryFilter);
    if (admTypeFilter)   result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)    result = result.filter((s) => s.admCat === admCatFilter);
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
  }, [allStudents, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, debouncedSearch]);

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
    !!categoryFilter || !!admTypeFilter || !!admCatFilter;

  function clearFilters() {
    clearStudentsFilters();
    setDebouncedSearch('');
  }

  // Stats from confirmed students only
  const stats = useMemo(() => {
    const confirmed = allStudents.filter((s) => s.admissionStatus === 'CONFIRMED');
    if (!confirmed.length) return null;
    const yearCount: Record<string, number> = {};
    const courseCount: Record<string, number> = {};
    for (const s of confirmed) {
      yearCount[s.year] = (yearCount[s.year] ?? 0) + 1;
      courseCount[s.course] = (courseCount[s.course] ?? 0) + 1;
    }
    return { yearCount, courseCount, total: confirmed.length };
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

  const isLoading = settingsLoading || loading;

  if (isLoading) return <LoadingGate />;

  return (
    <>
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* Page header + stats chips */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0 relative">
        <div className="shrink-0">
          <h2 className="text-xl font-black text-gray-800 leading-tight tracking-tight">Students</h2>
          {academicYear && (
            <p className="text-[10px] text-gray-400 leading-tight">{academicYear}</p>
          )}
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
                const isSelected = yearFilter === yr;
                const isDimmed = (!!yearFilter && !isSelected) || count === 0;
                const label = yr === '1ST YEAR' ? '1st' : yr === '2ND YEAR' ? '2nd' : '3rd';
                return (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(isSelected ? '' : yr)}
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

      {/* Filters — always visible, never scrolls */}
      <div className="flex-shrink-0 bg-white/70 rounded-2xl border border-emerald-100 overflow-hidden" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <input
            type="text"
            placeholder="Search name / reg / mobile…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-44 rounded-lg border border-emerald-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 bg-white/80 text-gray-700 placeholder:text-gray-400"
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
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-amber-300 px-2 py-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer transition-colors font-semibold"
            >
              Clear
            </button>
          )}
          {!isLoading && allStudents.length > 0 && (
            <button
              onClick={() => setShowMissingDocs(true)}
              className="rounded-lg border border-violet-200 px-2 py-1.5 text-xs text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-400 cursor-pointer transition-colors font-medium flex items-center gap-1"
            >
              Doc Status
            </button>
          )}
          {!isLoading && filteredStudents.length > 0 && (
            <>
              <button
                onClick={handleSavePdf}
                disabled={savingPdf}
                className="rounded-lg border border-emerald-200 px-2 py-1.5 text-xs text-emerald-700 bg-white hover:bg-emerald-50 hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {savingPdf ? 'Generating…' : 'Save PDF'}
              </button>
              <button
                onClick={handleSaveExcel}
                disabled={savingExcel}
                className="rounded-lg border border-emerald-200 px-2 py-1.5 text-xs text-emerald-700 bg-white hover:bg-emerald-50 hover:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                {savingExcel ? 'Exporting…' : 'Export Excel'}
              </button>
            </>
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
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-20">Adm Type</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-16">Adm Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-28">Mobile</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-24">Status</th>
                {isAdmin && (
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap w-48">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-50/60">
              {visibleStudents.map((student, idx) => (
                <tr
                  key={student.id}
                  className="hover:bg-emerald-50/40 transition-colors cursor-context-menu"
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
                          onClick={() => void navigate(`/enroll?edit=${student.id}`, { state: { student } })}
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

      <Modal
        open={deleteModal.open}
        title="Delete Student"
        message={
          <>
            Are you sure you want to delete{' '}
            <strong>{deleteModal.student?.studentNameSSLC}</strong>? This will also permanently
            delete all their fee records, fee overrides, and document tracking. This action cannot
            be undone.
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
          className="fixed z-50 bg-white border border-gray-200/80 rounded-2xl overflow-hidden min-w-[210px]"
          style={{ left: contextMenu.x, top: contextMenu.y, boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 pt-2.5 pb-2 border-b border-gray-100 flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {contextMenu.student.studentNameSSLC.charAt(0)}
            </span>
            <span className="text-[12px] font-semibold text-gray-800 truncate">{contextMenu.student.studentNameSSLC}</span>
          </div>
          {/* Items */}
          <div className="py-1.5">
            <button
              className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
              onClick={() => { setDetailStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/></svg>
              </span>
              View Details
            </button>
            <div className="my-1 h-px bg-gray-100 mx-3" />
            {isAdmin && (
              <button
                className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
                onClick={() => { navigate('/fees', { state: { prefillStudent: contextMenu.student.studentNameSSLC } }); setContextMenu(null); }}
              >
                <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-100 group-hover:text-amber-600 transition-colors">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                </span>
                Collect Fee
              </button>
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
            <button
              className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
              onClick={() => { setPrintProfileStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              </span>
              Print Profile
            </button>
            <div className="my-1 h-px bg-gray-100 mx-3" />
            <button
              className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
              onClick={() => { setAnsLetterStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </span>
              ANS Letter
            </button>
            <button
              className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
              onClick={() => { setStudyCertStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </span>
              Study Certificate
            </button>
            <button
              className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
              onClick={() => { setTcStudent(contextMenu.student); setContextMenu(null); }}
            >
              <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
              Transfer Certificate
            </button>
            {contextMenu.student.year === '3RD YEAR' && (
              <button
                className="group w-full text-left px-3 py-[7px] text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2.5 transition-colors duration-100"
                onClick={() => { setPcStudent(contextMenu.student); setContextMenu(null); }}
              >
                <span className="w-[18px] h-[18px] rounded-[5px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                </span>
                Provisional Certificate
              </button>
            )}
          </div>
        </div>
      </>
    )}

    {showMissingDocs && (
      <MissingDocsModal
        students={allStudents}
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
    </>
  );
}
