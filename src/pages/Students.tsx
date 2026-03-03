import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { deleteStudent } from '../services/studentService';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { useFilters } from '../contexts/FiltersContext';
import { exportStudentsPdf } from '../utils/studentsPdf';
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat } from '../types';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

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

export function Students() {
  const navigate = useNavigate();
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const { studentsFilters, setStudentsFilters, clearStudentsFilters } = useFilters();

  const {
    searchTerm,
    courseFilter,
    yearFilter,
    genderFilter,
    admTypeFilter,
    admCatFilter,
    admStatusFilter,
    visibleCount,
  } = studentsFilters;

  function setSearchTerm(v: string) { setStudentsFilters({ searchTerm: v }); }
  function setCourseFilter(v: Course | '') { setStudentsFilters({ courseFilter: v }); }
  function setYearFilter(v: Year | '') { setStudentsFilters({ yearFilter: v }); }
  function setGenderFilter(v: Gender | '') { setStudentsFilters({ genderFilter: v }); }
  function setAdmTypeFilter(v: AdmType | '') { setStudentsFilters({ admTypeFilter: v }); }
  function setAdmCatFilter(v: AdmCat | '') { setStudentsFilters({ admCatFilter: v }); }
  function setAdmStatusFilter(v: string) { setStudentsFilters({ admStatusFilter: v }); }
  function setVisibleCount(updater: ((c: number) => number) | number) {
    const next = typeof updater === 'function' ? updater(visibleCount) : updater;
    setStudentsFilters({ visibleCount: next });
  }

  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  const [savingPdf, setSavingPdf] = useState(false);

  const [deleteModal, setDeleteModal] = useState<{ open: boolean; student: Student | null }>({
    open: false,
    student: null,
  });
  const [deleting, setDeleting] = useState(false);

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
    if (admTypeFilter)   result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)    result = result.filter((s) => s.admCat === admCatFilter);
    if (admStatusFilter) result = result.filter((s) => s.admissionStatus === admStatusFilter);
    if (debouncedSearch) {
      const search = debouncedSearch.trim().toUpperCase();
      result = result.filter((s) => {
        const matchName =
          s.studentNameSSLC.toUpperCase().includes(search) ||
          s.studentNameAadhar.toUpperCase().includes(search);
        const matchMobile =
          s.fatherMobile?.includes(search) || s.studentMobile?.includes(search);
        return matchName || matchMobile;
      });
    }
    return result;
  }, [allStudents, courseFilter, yearFilter, genderFilter, admTypeFilter, admCatFilter, admStatusFilter, debouncedSearch]);

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
    !!admTypeFilter || !!admCatFilter || !!admStatusFilter;

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

  return (
    <div className="h-full flex flex-col gap-3">

      {/* Page header + stats chips */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0">
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

        <Button onClick={() => void navigate('/enroll')} className="ml-auto shrink-0">Enroll Student</Button>
      </div>

      {/* Filters — always visible, never scrolls */}
      <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search name / mobile…"
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
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors"
            >
              Clear Filters
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
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Loading students…</div>
      ) : error ? (
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
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleStudents.map((student, idx) => (
                <tr key={student.id} className="hover:bg-gray-50 transition-colors">
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
                </tr>
              ))}

              {hasMore && (
                <tr>
                  <td colSpan={11} className="px-4 py-2.5 text-center">
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
  );
}
