import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { Button } from '../components/common/Button';
import { FeeCollectionModal } from '../components/fee/FeeCollectionModal';
import { FeeHistoryModal } from '../components/fee/FeeHistoryModal';
import type {
  Student,
  Course,
  Year,
  Gender,
  AcademicYear,
  AdmType,
  AdmCat,
  FeeRecord,
  FeeStructure,
} from '../types';
import { SMP_FEE_HEADS } from '../types';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

const fs =
  'rounded border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

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


export function CollectFee() {

  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [genderFilter, setGenderFilter] = useState<Gender | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter, setAdmCatFilter] = useState<AdmCat | ''>('');
  const [admStatusFilter, setAdmStatusFilter] = useState('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<'ALL' | 'PAID' | 'NOT_PAID' | 'FEE_DUES' | 'NO_FEE_DUES'>('ALL');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [feeHistoryStudent, setFeeHistoryStudent] = useState<Student | null>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; student: Student; hasFeeRecord: boolean; isFullyPaid: boolean;
  } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const closeCtx = useCallback(() => setCtxMenu(null), []);

  useEffect(() => {
    if (!ctxMenu) return;
    function onDown(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) closeCtx();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeCtx(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu, closeCtx]);

  const { students: allStudents, loading: studentsLoading } = useStudents(academicYear);
  const { records: feeRecords, loading: feeLoading, refetch: refetchFees } =
    useFeeRecords(academicYear);

  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!academicYear) { setFeeStructures([]); return; }
    getFeeStructuresByAcademicYear(academicYear).then(setFeeStructures).catch(() => {});
  }, [academicYear]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Map: "${course}__${year}__${admType}__${admCat}" → allotted grand total
  const allottedByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of feeStructures) {
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + s.smp[key], 0);
      const svkTotal = s.svk + s.additionalHeads.reduce((t, h) => t + h.amount, 0);
      map.set(`${s.course}__${s.year}__${s.admType}__${s.admCat}`, smpTotal + svkTotal);
    }
    return map;
  }, [feeStructures]);

  // Aggregate: per-student whether they have payments + total paid amount
  const { paidStudents, totalPaidByStudent } = useMemo(() => {
    const paid = new Set<string>();
    const totals = new Map<string, number>();
    for (const r of feeRecords) {
      paid.add(r.studentId);
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
      const svkTotal = r.svk + r.additionalPaid.reduce((t, h) => t + h.amount, 0);
      totals.set(r.studentId, (totals.get(r.studentId) ?? 0) + smpTotal + svkTotal);
    }
    return { paidStudents: paid, totalPaidByStudent: totals };
  }, [feeRecords]);

  const filteredStudents = useMemo(() => {
    let result = allStudents;
    if (courseFilter)    result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)      result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)    result = result.filter((s) => s.gender === genderFilter);
    if (admTypeFilter)   result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)    result = result.filter((s) => s.admCat === admCatFilter);
    if (admStatusFilter) result = result.filter((s) => s.admissionStatus === admStatusFilter);
    if (feeStatusFilter === 'PAID')
      result = result.filter((s) => paidStudents.has(s.id));
    if (feeStatusFilter === 'NOT_PAID')
      result = result.filter((s) => !paidStudents.has(s.id));
    if (feeStatusFilter === 'FEE_DUES') {
      result = result.filter((s) => {
        const allotted = allottedByKey.get(`${s.course}__${s.year}__${s.admType}__${s.admCat}`) ?? null;
        const paid = totalPaidByStudent.get(s.id) ?? 0;
        return allotted !== null && paid < allotted;
      });
    }
    if (feeStatusFilter === 'NO_FEE_DUES') {
      result = result.filter((s) => {
        const allotted = allottedByKey.get(`${s.course}__${s.year}__${s.admType}__${s.admCat}`) ?? null;
        const paid = totalPaidByStudent.get(s.id) ?? 0;
        return allotted !== null && paid >= allotted;
      });
    }
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
    // Sort: Year → Course → Name (same as Students page)
    return result.slice().sort((a, b) => {
      const y = (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9);
      if (y !== 0) return y;
      const c = a.course.localeCompare(b.course);
      if (c !== 0) return c;
      return a.studentNameSSLC.localeCompare(b.studentNameSSLC);
    });
  }, [
    allStudents, allottedByKey, totalPaidByStudent,
    courseFilter, yearFilter, genderFilter, admTypeFilter, admCatFilter,
    admStatusFilter, feeStatusFilter, debouncedSearch, paidStudents,
  ]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filteredStudents]);

  const visibleStudents = useMemo(
    () => filteredStudents.slice(0, visibleCount),
    [filteredStudents, visibleCount]
  );

  const hasMore = visibleCount < filteredStudents.length;

  const hasActiveFilters =
    !!searchTerm || !!courseFilter || !!yearFilter || !!genderFilter ||
    !!admTypeFilter || !!admCatFilter || !!admStatusFilter || feeStatusFilter !== 'ALL';

  function clearFilters() {
    setSearchTerm('');
    setCourseFilter('');
    setYearFilter('');
    setGenderFilter('');
    setAdmTypeFilter('');
    setAdmCatFilter('');
    setAdmStatusFilter('');
    setFeeStatusFilter('ALL');
  }

  const stats = useMemo(() => {
    if (!allStudents.length) return null;
    const yearCount: Record<string, number> = {};
    const courseCount: Record<string, number> = {};
    for (const s of allStudents) {
      yearCount[s.year] = (yearCount[s.year] ?? 0) + 1;
      courseCount[s.course] = (courseCount[s.course] ?? 0) + 1;
    }
    const paidCount = allStudents.filter((s) => feeRecords.some((r: FeeRecord) => r.studentId === s.id)).length;
    const unpaidCount = allStudents.length - paidCount;
    const duesCount = allStudents.filter((s) => {
      const allotted = allottedByKey.get(`${s.course}__${s.year}__${s.admType}__${s.admCat}`) ?? null;
      const paid = totalPaidByStudent.get(s.id) ?? 0;
      return allotted !== null && paid < allotted;
    }).length;
    const noDuesCount = allStudents.filter((s) => {
      const allotted = allottedByKey.get(`${s.course}__${s.year}__${s.admType}__${s.admCat}`) ?? null;
      const paid = totalPaidByStudent.get(s.id) ?? 0;
      return allotted !== null && paid >= allotted;
    }).length;
    return { yearCount, courseCount, total: allStudents.length, paidCount, unpaidCount, duesCount, noDuesCount };
  }, [allStudents, feeRecords, allottedByKey, totalPaidByStudent]);

  const isLoading = settingsLoading || studentsLoading || feeLoading;

  return (
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* Header + stats chips */}
      <div className="flex-shrink-0 flex items-center gap-3 min-w-0">
        <div className="shrink-0">
          <h2 className="text-base font-semibold text-gray-900 leading-tight">Collect Fee</h2>
          {academicYear && (
            <p className="text-[10px] text-gray-400 leading-tight">{academicYear}</p>
          )}
        </div>

        {!isLoading && stats && (
          <>
            <span className="text-gray-200 text-sm select-none shrink-0">|</span>
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">

              {/* Total */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                <span className="text-gray-400 font-medium">Total</span>
                <AnimNum value={stats.total} />
              </div>

              {/* Filtered count — right after Total so it's always visible */}
              {hasActiveFilters && (
                <>
                  <span className="text-gray-200 text-xs select-none shrink-0">·</span>
                  <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
                    <span className="text-blue-500 font-medium">Filtered</span>
                    <AnimNum value={filteredStudents.length} />
                  </div>
                </>
              )}

              <span className="text-gray-200 text-xs select-none shrink-0">·</span>

              {/* Fee status chips */}
              <button
                onClick={() => setFeeStatusFilter(feeStatusFilter === 'PAID' ? 'ALL' : 'PAID')}
                className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                  feeStatusFilter === 'PAID'
                    ? 'bg-green-50 border-green-300'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className={`font-medium ${feeStatusFilter === 'PAID' ? 'text-green-700' : 'text-gray-500'}`}>
                  Paid
                </span>
                <AnimNum value={stats.paidCount} />
              </button>
              <button
                onClick={() =>
                  setFeeStatusFilter(feeStatusFilter === 'NOT_PAID' ? 'ALL' : 'NOT_PAID')
                }
                className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                  feeStatusFilter === 'NOT_PAID'
                    ? 'bg-red-50 border-red-300'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <span
                  className={`font-medium ${
                    feeStatusFilter === 'NOT_PAID' ? 'text-red-700' : 'text-gray-500'
                  }`}
                >
                  Not Paid
                </span>
                <AnimNum value={stats.unpaidCount} />
              </button>
              <button
                onClick={() =>
                  setFeeStatusFilter(feeStatusFilter === 'FEE_DUES' ? 'ALL' : 'FEE_DUES')
                }
                className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                  feeStatusFilter === 'FEE_DUES'
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className={`font-medium ${feeStatusFilter === 'FEE_DUES' ? 'text-amber-700' : 'text-gray-500'}`}>
                  Fee Dues
                </span>
                <AnimNum value={stats.duesCount} />
              </button>
              <button
                onClick={() =>
                  setFeeStatusFilter(feeStatusFilter === 'NO_FEE_DUES' ? 'ALL' : 'NO_FEE_DUES')
                }
                className={`flex items-center gap-1 border rounded px-2 py-1 text-xs shadow-sm whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer ${
                  feeStatusFilter === 'NO_FEE_DUES'
                    ? 'bg-green-50 border-green-300'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className={`font-medium ${feeStatusFilter === 'NO_FEE_DUES' ? 'text-green-700' : 'text-gray-500'}`}>
                  No Fee Dues
                </span>
                <AnimNum value={stats.noDuesCount} />
              </button>

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

            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2.5">
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto">
          <input
            type="text"
            placeholder="Search name / mobile…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-40 shrink-0 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <select className={`${fs} w-[72px] shrink-0`} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value as Course | '')}>
            <option value="">Course</option>
            {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={`${fs} w-[80px] shrink-0`} value={yearFilter} onChange={(e) => setYearFilter(e.target.value as Year | '')}>
            <option value="">Study Yr</option>
            <option value="1ST YEAR">1ST YEAR</option>
            <option value="2ND YEAR">2ND YEAR</option>
            <option value="3RD YEAR">3RD YEAR</option>
          </select>
          <select className={`${fs} w-[74px] shrink-0`} value={genderFilter} onChange={(e) => setGenderFilter(e.target.value as Gender | '')}>
            <option value="">Gender</option>
            <option value="BOY">BOY</option>
            <option value="GIRL">GIRL</option>
          </select>
          <select className={`${fs} w-[84px] shrink-0`} value={admTypeFilter} onChange={(e) => setAdmTypeFilter(e.target.value as AdmType | '')}>
            <option value="">Adm Type</option>
            <option value="REGULAR">REGULAR</option>
            <option value="REPEATER">REPEATER</option>
            <option value="LATERAL">LATERAL</option>
            <option value="EXTERNAL">EXTERNAL</option>
            <option value="SNQ">SNQ</option>
          </select>
          <select className={`${fs} w-[74px] shrink-0`} value={admCatFilter} onChange={(e) => setAdmCatFilter(e.target.value as AdmCat | '')}>
            <option value="">Adm Cat</option>
            <option value="GM">GM</option>
            <option value="SNQ">SNQ</option>
            <option value="OTHERS">OTHERS</option>
          </select>
          <select className={`${fs} w-[80px] shrink-0`} value={admStatusFilter} onChange={(e) => setAdmStatusFilter(e.target.value)}>
            <option value="">Status</option>
            <option value="PROVISIONAL">PROVISIONAL</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          <select
            className={`${fs} w-[90px] shrink-0`}
            value={feeStatusFilter}
            onChange={(e) => setFeeStatusFilter(e.target.value as 'ALL' | 'PAID' | 'NOT_PAID' | 'FEE_DUES' | 'NO_FEE_DUES')}
          >
            <option value="ALL">Fee Status</option>
            <option value="PAID">Fee Paid</option>
            <option value="NOT_PAID">Not Paid</option>
            <option value="FEE_DUES">Has Dues</option>
            <option value="NO_FEE_DUES">No Dues</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="shrink-0 rounded border border-orange-400 px-2 py-1.5 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400 cursor-pointer transition-colors font-medium whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Loading students…
        </div>
      ) : !academicYear ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Please configure an academic year in Settings first.
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          No students found.
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
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Adm Type</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-16">Adm Cat</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Adm Status</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-28">Fee Details</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleStudents.map((student, idx) => {
                const hasFeeRecord = paidStudents.has(student.id);
                const totalPaid = totalPaidByStudent.get(student.id) ?? 0;
                const allotted = allottedByKey.get(
                  `${student.course}__${student.year}__${student.admType}__${student.admCat}`
                ) ?? null;
                const isFullyPaid = allotted !== null && totalPaid >= allotted;
                return (
                  <tr
                    key={student.id}
                    className="hover:bg-gray-50 transition-colors cursor-context-menu"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, student, hasFeeRecord, isFullyPaid });
                    }}
                  >
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                      {student.studentNameSSLC}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {student.regNumber || '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.course}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{student.year}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {student.admType || '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {student.admCat || '—'}
                    </td>
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
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setFeeHistoryStudent(student)}
                      >
                        Fee Details
                      </Button>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isFullyPaid ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled
                          className="bg-green-50 text-green-700 border-green-200 disabled:opacity-100"
                        >
                          No Dues
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setSelectedStudent(student)}
                          className={hasFeeRecord ? 'bg-amber-500 hover:bg-amber-600 border-transparent' : ''}
                        >
                          {hasFeeRecord ? 'Collect Dues' : 'Collect Fee'}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {hasMore && (
                <tr>
                  <td colSpan={10} className="px-4 py-2.5 text-center">
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
              <span className="text-gray-400">
                {' '}(filtered from {allStudents.length} total)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Fee collection modal */}
      {selectedStudent && academicYear && (
        <FeeCollectionModal
          student={selectedStudent}
          academicYear={academicYear}
          onClose={() => setSelectedStudent(null)}
          onSaved={() => { refetchFees(); setSelectedStudent(null); }}
        />
      )}

      {/* Fee history modal */}
      {feeHistoryStudent && (
        <FeeHistoryModal
          student={feeHistoryStudent}
          onClose={() => setFeeHistoryStudent(null)}
        />
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[170px]"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <div className="px-3 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100 mb-1 truncate max-w-[200px]">
            {ctxMenu.student.studentNameSSLC}
          </div>
          <button
            disabled={ctxMenu.isFullyPaid}
            className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer enabled:text-gray-700 enabled:hover:bg-blue-50 enabled:hover:text-blue-700"
            onClick={() => { setSelectedStudent(ctxMenu.student); closeCtx(); }}
          >
            <span className={`font-bold text-[10px] border rounded px-1 py-0.5 ${ctxMenu.hasFeeRecord ? 'text-amber-500 border-amber-300' : 'text-blue-500 border-blue-300'}`}>
              {ctxMenu.isFullyPaid ? '✓' : '₹'}
            </span>
            {ctxMenu.isFullyPaid ? 'No Dues' : ctxMenu.hasFeeRecord ? 'Collect Dues' : 'Collect Fee'}
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 hover:text-gray-900 flex items-center gap-2 cursor-pointer"
            onClick={() => { setFeeHistoryStudent(ctxMenu.student); closeCtx(); }}
          >
            <span className="text-gray-400 font-bold text-[10px] border border-gray-300 rounded px-1 py-0.5">≡</span>
            Fee Details
          </button>
        </div>
      )}
    </div>
  );
}
