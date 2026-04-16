import { useState, useMemo, useEffect, useRef, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllStudents } from '../hooks/useAllStudents';
import { useSettings } from '../hooks/useSettings';
import { Button } from '../components/common/Button';
import { useFilters } from '../contexts/FiltersContext';
import { useAuth } from '../contexts/AuthContext';
import { StudentDetailModal } from '../components/student/StudentDetailModal';
import { exportSummaryReport, exportCategoryReport } from '../utils/dashboardReportPdf';
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category } from '../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

const fs =
  'rounded-lg border border-emerald-100 px-2 py-1.5 text-xs bg-white/80 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 cursor-pointer text-gray-700';

function statusBadgeClass(status: string): string {
  if (status === 'CONFIRMED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'CANCELLED') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

// ─── Animated number ────────────────────────────────────────────────────────
function AnimNum({ value }: { value: number }) {
  return (
    <span
      key={value}
      className="tabular-nums"
      style={{ display: 'inline-block', animation: 'stat-pop 0.28s ease-out' }}
    >
      {value}
    </span>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number;
  total: number;
  bg: string;
  border: string;
  textColor: string;
  barFill: string;
  subText?: string;
  breakdown?: { label: string; value: number }[];
  className?: string;
  highlightLabel?: boolean;
  highlightBreakdown?: boolean;
  watermark?: string;
  onClick?: () => void;
}

function StatCard({ label, value, total, bg, border, textColor, barFill, subText, breakdown, className = '', highlightLabel = false, highlightBreakdown = false, watermark, onClick }: StatCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border ${border} ${bg} p-4 flex flex-col gap-1.5 relative overflow-hidden ${className} ${onClick ? 'cursor-pointer hover:shadow-md transition-all duration-150 hover:-translate-y-0.5' : ''}`}
      style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.04)' }}
    >
      {watermark && (
        <span
          aria-hidden="true"
          className={`absolute -bottom-3 -right-2 text-8xl font-black leading-none select-none pointer-events-none ${textColor} opacity-[0.07]`}
        >
          {watermark}
        </span>
      )}
      {highlightLabel ? (
        <span className={`self-start px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border ${border} bg-white/70 ${textColor}`}>
          {label}
        </span>
      ) : (
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400/80 truncate leading-tight">
          {label}
        </p>
      )}
      <p className={`text-3xl font-black leading-none ${textColor}`}>
        <AnimNum value={value} />
      </p>
      {total > 0 ? (
        <div className="mt-auto pt-2 space-y-1">
          <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${barFill} transition-all duration-700 ease-out`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {breakdown ? (
            <div className="flex flex-wrap gap-x-2 gap-y-1 pt-0.5">
              {breakdown.map((b) => (
                <span key={b.label} className="flex items-center gap-1 text-[10px] tabular-nums whitespace-nowrap">
                  {highlightBreakdown ? (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${border} bg-white/70 ${textColor}`}>
                      {b.label}
                    </span>
                  ) : (
                    <span className="text-gray-400 font-medium">{b.label}</span>
                  )}
                  <span className="font-bold text-gray-600">{b.value}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">{subText ?? `${pct}% of total`}</p>
          )}
        </div>
      ) : (
        subText && <p className="text-xs text-gray-400 mt-auto">{subText}</p>
      )}
    </div>
  );
}

// ─── Breakdown panel ─────────────────────────────────────────────────────────
interface BreakdownItem {
  label: string;
  value: number;
  dotClass: string;
  barClass: string;
}

function BreakdownPanel({ title, items, total }: { title: string; items: BreakdownItem[]; total: number }) {
  return (
    <div className="bg-white/80 rounded-2xl border border-emerald-100 p-5" style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)' }}>
      <h4 className="text-[11px] font-bold uppercase tracking-widest text-gray-400/80 mb-4">{title}</h4>
      <div className="space-y-3.5">
        {items.map((item) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={item.label} className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.dotClass}`} />
              <span className="text-xs text-gray-600 w-24 truncate shrink-0">{item.label}</span>
              <span className="text-sm font-bold text-gray-800 w-7 tabular-nums text-right shrink-0">
                <AnimNum value={item.value} />
              </span>
              <div className="flex-1 h-1.5 bg-emerald-50 rounded-full overflow-hidden">
                <div
                  className={`h-full ${item.barClass} rounded-full transition-all duration-700 ease-out`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 w-8 tabular-nums text-right shrink-0">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Section label ───────────────────────────────────────────────────────────
function SectionLabel({ children, accent }: { children: React.ReactNode; accent?: { bar: string; text: string } }) {
  if (accent) {
    return (
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className={`w-1 h-5 rounded-full shrink-0 ${accent.bar}`} />
        <p className={`text-sm font-extrabold uppercase tracking-widest ${accent.text}`}>
          {children}
        </p>
      </div>
    );
  }
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400/80 mb-2.5">
      {children}
    </p>
  );
}

// ─── Loading gate ────────────────────────────────────────────────────────────
function LoadingGate() {
  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="flex-shrink-0 flex items-center justify-between gap-4">
        <div className="flex-1 h-10 bg-white/60 rounded-2xl border border-emerald-100 animate-pulse" />
        <div className="w-28 h-8 bg-white/60 rounded-xl border border-emerald-100 animate-pulse" />
      </div>
      <div className="flex-shrink-0 flex gap-2">
        {[80, 96, 80, 80, 80].map((w, i) => (
          <div key={i} className="h-7 bg-white/60 rounded-lg border border-emerald-100 animate-pulse" style={{ width: w }} />
        ))}
      </div>
      <div className="flex-shrink-0 h-9 bg-white/60 rounded-xl border border-emerald-100 animate-pulse" />
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2 rounded-2xl border border-sky-200 bg-sky-50 h-24 animate-pulse" />
            <div className="rounded-2xl border border-sky-200 bg-sky-50 h-24 animate-pulse" />
            <div className="rounded-2xl border border-rose-200 bg-rose-50 h-24 animate-pulse" />
          </div>
          <div className="space-y-2.5">
            <div className="h-3.5 w-20 bg-white/60 rounded animate-pulse" />
            <div className="grid grid-cols-5 gap-3">
              {['amber','green','sky','teal','violet'].map((c) => (
                <div key={c} className={`rounded-2xl border border-${c}-200 bg-${c}-50 h-20 animate-pulse`} />
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="h-3.5 w-28 bg-white/60 rounded animate-pulse" />
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-lime-200 bg-lime-50 h-20 animate-pulse" />
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 h-20 animate-pulse" />
              <div className="rounded-2xl border border-teal-200 bg-teal-50 h-20 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export function Dashboard() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { students: allStudents, loading, error } = useAllStudents();
  const { settings } = useSettings();
  const { dashboardFilters, setDashboardFilters } = useFilters();
  const [feeHistoryStudent, setFeeHistoryStudent] = useState<Student | null>(null);
  const [courseModalCourse, setCourseModalCourse] = useState<Course | null>(null);
  const [yearModalYear, setYearModalYear] = useState<Year | null>(null);

  const {
    searchTerm,
    academicYearFilter,
    courseFilter,
    yearFilter,
    genderFilter,
    categoryFilter,
    admTypeFilter,
    admCatFilter,
    admStatusFilter,
  } = dashboardFilters;

  function setAcademicYearFilter(v: AcademicYear | '') { setDashboardFilters({ academicYearFilter: v }); }
  function setCourseFilter(v: Course | '') { setDashboardFilters({ courseFilter: v }); }
  function setYearFilter(v: Year | '') { setDashboardFilters({ yearFilter: v }); }
  function setGenderFilter(v: Gender | '') { setDashboardFilters({ genderFilter: v }); }
  function setCategoryFilter(v: Category | '') { setDashboardFilters({ categoryFilter: v }); }
  function setAdmTypeFilter(v: AdmType | '') { setDashboardFilters({ admTypeFilter: v }); }
  function setAdmCatFilter(v: AdmCat | '') { setDashboardFilters({ admCatFilter: v }); }
  function setAdmStatusFilter(v: string) { setDashboardFilters({ admStatusFilter: v }); }

  const [, startTransition] = useTransition();

  const [inputValue, setInputValue] = useState(searchTerm);
  useEffect(() => {
    const t = setTimeout(() => {
      startTransition(() => setDashboardFilters({ searchTerm: inputValue }));
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const didAutoSet = useRef(false);
  useEffect(() => {
    if (!didAutoSet.current && settings?.currentAcademicYear && !academicYearFilter) {
      setAcademicYearFilter(settings.currentAcademicYear);
      didAutoSet.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.currentAcademicYear]);

  const isSearchMode = searchTerm.trim().length > 0;

  const sortedAcademicYears = useMemo(() => {
    const years = new Set(allStudents.map((s) => s.academicYear));
    return Array.from(years).sort().reverse();
  }, [allStudents]);

  const searchIndex = useMemo(() =>
    allStudents.map((s) => ({
      s,
      searchStr: [s.studentNameSSLC, s.studentNameAadhar, s.regNumber, s.fatherMobile, s.studentMobile]
        .filter(Boolean).join('|').toUpperCase(),
    })),
    [allStudents]
  );

  const filteredStudents = useMemo(() => {
    let result = allStudents;
    if (!isSearchMode && academicYearFilter) result = result.filter((s) => s.academicYear === academicYearFilter);
    if (courseFilter)    result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)      result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)    result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter)  result = result.filter((s) => s.category === categoryFilter);
    if (admTypeFilter)   result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)    result = result.filter((s) => s.admCat === admCatFilter);
    if (admStatusFilter) result = result.filter((s) => s.admissionStatus === admStatusFilter);
    return result;
  }, [allStudents, isSearchMode, academicYearFilter, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, admStatusFilter]);

  const searchResults = useMemo(() => {
    if (!isSearchMode) return [];
    const q = searchTerm.trim().toUpperCase();
    let result = searchIndex
      .filter(({ searchStr }) => searchStr.includes(q))
      .map(({ s }) => s);
    if (courseFilter)    result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)      result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)    result = result.filter((s) => s.gender === genderFilter);
    if (categoryFilter)  result = result.filter((s) => s.category === categoryFilter);
    if (admTypeFilter)   result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)    result = result.filter((s) => s.admCat === admCatFilter);
    if (admStatusFilter) result = result.filter((s) => s.admissionStatus === admStatusFilter);
    return result;
  }, [isSearchMode, searchTerm, searchIndex, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, admStatusFilter]);

  interface StudentGroup {
    key: string;
    nameSSLC: string;
    nameAadhar: string;
    dob: string;
    gender: Gender;
    records: Student[];
  }

  const studentGroups = useMemo((): StudentGroup[] => {
    const map = new Map<string, StudentGroup>();
    for (const s of searchResults) {
      const key = s.regNumber ? s.regNumber.toUpperCase() : `${s.studentNameSSLC}|${s.dateOfBirth}`;
      if (!map.has(key)) {
        map.set(key, { key, nameSSLC: s.studentNameSSLC, nameAadhar: s.studentNameAadhar, dob: s.dateOfBirth, gender: s.gender, records: [] });
      }
      map.get(key)!.records.push(s);
    }
    for (const group of map.values()) {
      group.records.sort((a, b) => a.academicYear.localeCompare(b.academicYear));
    }
    return Array.from(map.values()).sort((a, b) => a.nameSSLC.localeCompare(b.nameSSLC));
  }, [searchResults]);

  // ── Metrics ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const confirmed = filteredStudents.filter((s) => s.admissionStatus === 'CONFIRMED');

    const total = confirmed.length;
    const boys  = confirmed.filter((s) => s.gender === 'BOY').length;
    const girls = confirmed.filter((s) => s.gender === 'GIRL').length;

    const byCourse: Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    const byYear:   Record<Year,   number> = { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 };
    const byStatus: Record<string, number> = { PROVISIONAL: 0, CONFIRMED: 0, CANCELLED: 0, PENDING: 0 };
    const byAdmType: Record<string, number> = { REGULAR: 0, REPEATER: 0, LATERAL: 0, EXTERNAL: 0, SNQ: 0 };

    const byCourseByYear: Record<Course, Record<Year, number>> = {
      CE: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
      ME: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
      EC: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
      CS: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
      EE: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
    };

    const firstYearSeats: Record<Course, { regularConfirmed: number; snqConfirmed: number }> = {
      CE: { regularConfirmed: 0, snqConfirmed: 0 },
      ME: { regularConfirmed: 0, snqConfirmed: 0 },
      EC: { regularConfirmed: 0, snqConfirmed: 0 },
      CS: { regularConfirmed: 0, snqConfirmed: 0 },
      EE: { regularConfirmed: 0, snqConfirmed: 0 },
    };
    const byYearByCourse: Record<Year, Record<Course, number>> = {
      '1ST YEAR': { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
      '2ND YEAR': { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
      '3RD YEAR': { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
    };

    for (const s of filteredStudents) {
      const status = s.admissionStatus?.trim() || 'PENDING';
      if (status in byStatus) byStatus[status]++;
      else byStatus['PENDING']++;
    }

    type SCell = { regular: number; ltrl: number; snq: number; rptr: number };
    type CCell = { gm: number; c1: number; twoA: number; twoB: number; threeA: number; threeB: number; sc: number; st: number };
    const summaryTable: Record<string, Record<string, SCell>> = {};
    const catTable:     Record<string, Record<string, CCell>> = {};
    for (const yr of ['1ST YEAR', '2ND YEAR', '3RD YEAR']) {
      summaryTable[yr] = {};
      catTable[yr] = {};
      for (const c of ['CE', 'ME', 'EC', 'CS', 'EE']) {
        summaryTable[yr][c] = { regular: 0, ltrl: 0, snq: 0, rptr: 0 };
        catTable[yr][c]     = { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0 };
      }
    }

    for (const s of confirmed) {
      if (s.course in byCourse) byCourse[s.course]++;
      if (s.year   in byYear)   byYear[s.year]++;
      if (s.admType in byAdmType) byAdmType[s.admType]++;
      if (s.course in byCourseByYear && s.year in byCourseByYear[s.course]) byCourseByYear[s.course][s.year]++;
      if (s.year in byYearByCourse && s.course in byYearByCourse[s.year]) byYearByCourse[s.year][s.course]++;

      if (s.year === '1ST YEAR' && s.course in firstYearSeats) {
        if (s.admType === 'REGULAR' && s.admCat === 'GM') {
          firstYearSeats[s.course as Course].regularConfirmed++;
        } else if (s.admCat === 'SNQ') {
          firstYearSeats[s.course as Course].snqConfirmed++;
        }
      }

      if (s.year in summaryTable && s.course in summaryTable[s.year]) {
        const sc = summaryTable[s.year][s.course];
        if (s.admCat === 'SNQ')            sc.snq++;
        else if (s.admType === 'LATERAL')  sc.ltrl++;
        else if (s.admType === 'REPEATER') sc.rptr++;
        else                               sc.regular++;
      }
      if (s.year in catTable && s.course in catTable[s.year]) {
        const cc = catTable[s.year][s.course];
        switch (s.category) {
          case 'GM':  cc.gm++; break;
          case 'C1':  cc.c1++; break;
          case '2A': cc.twoA++; break;
          case '2B': cc.twoB++; break;
          case '3A': cc.threeA++; break;
          case '3B': cc.threeB++; break;
          case 'SC': cc.sc++; break;
          case 'ST': cc.st++; break;
        }
      }
    }

    return { total, boys, girls, byCourse, byYear, byStatus, byAdmType, summaryTable, catTable, byCourseByYear, byYearByCourse, firstYearSeats };
  }, [filteredStudents]);

  const activeSource = useMemo(
    () => (isSearchMode ? searchResults : filteredStudents),
    [isSearchMode, searchResults, filteredStudents]
  );
  const activeStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of activeSource) {
      if (s.admissionStatus === 'CONFIRMED') {
        map[s.academicYear] = (map[s.academicYear] ?? 0) + 1;
      }
    }
    return sortedAcademicYears.map((ay) => ({ year: ay, count: map[ay] ?? 0 }));
  }, [activeSource, sortedAcademicYears]);

  const confirmedActiveCount = useMemo(
    () => activeSource.filter((s) => s.admissionStatus === 'CONFIRMED').length,
    [activeSource]
  );
  const confirmedTotalCount = useMemo(
    () => allStudents.filter((s) => s.admissionStatus === 'CONFIRMED').length,
    [allStudents]
  );

  const hasActiveFilters =
    !!inputValue || !!academicYearFilter || !!courseFilter || !!yearFilter ||
    !!genderFilter || !!categoryFilter || !!admTypeFilter || !!admCatFilter || !!admStatusFilter;

  function clearFilters() {
    setInputValue('');
    startTransition(() => setDashboardFilters({
      searchTerm: '',
      academicYearFilter: settings?.currentAcademicYear ?? '',
      courseFilter: '',
      yearFilter: '',
      genderFilter: '',
      categoryFilter: '',
      admTypeFilter: '',
      admCatFilter: '',
      admStatusFilter: '',
    }));
  }

  const displayYear = isSearchMode
    ? 'All Years'
    : (academicYearFilter || 'All Years');

  // ── Nature palette colour map ────────────────────────────────────────────
  const courseConfig: Record<Course, { bg: string; border: string; textColor: string; barFill: string }> = {
    CE: { bg: 'bg-amber-50',   border: 'border-amber-200',   textColor: 'text-amber-700',   barFill: 'bg-amber-400'   },
    ME: { bg: 'bg-green-50',   border: 'border-green-200',   textColor: 'text-green-700',   barFill: 'bg-green-400'   },
    EC: { bg: 'bg-sky-50',     border: 'border-sky-200',     textColor: 'text-sky-700',     barFill: 'bg-sky-400'     },
    CS: { bg: 'bg-teal-50',    border: 'border-teal-200',    textColor: 'text-teal-700',    barFill: 'bg-teal-400'    },
    EE: { bg: 'bg-violet-50',  border: 'border-violet-200',  textColor: 'text-violet-700',  barFill: 'bg-violet-400'  },
  };

  const yearConfig: Record<Year, { label: string; bg: string; border: string; textColor: string; barFill: string }> = {
    '1ST YEAR': { label: '1st Year', bg: 'bg-lime-50',     border: 'border-lime-200',     textColor: 'text-lime-700',     barFill: 'bg-lime-400'     },
    '2ND YEAR': { label: '2nd Year', bg: 'bg-emerald-50',  border: 'border-emerald-200',  textColor: 'text-emerald-700',  barFill: 'bg-emerald-400'  },
    '3RD YEAR': { label: '3rd Year', bg: 'bg-teal-50',     border: 'border-teal-200',     textColor: 'text-teal-700',     barFill: 'bg-teal-400'     },
  };

  if (loading) return <LoadingGate />;

  return (
    <>
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-xl font-black text-gray-800 leading-tight tracking-tight">Dashboard</h2>
            <span
              className={`text-2xl font-black tracking-tight leading-tight transition-colors duration-200 ${
                !isSearchMode && academicYearFilter ? 'text-emerald-600' : 'text-gray-300'
              }`}
            >
              {displayYear}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5 font-medium">
            {`${filteredStudents.length} student${filteredStudents.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isSearchMode && academicYearFilter && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportSummaryReport(allStudents.filter((s) => s.academicYear === academicYearFilter), academicYearFilter)}
              >
                Summary PDF
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportCategoryReport(allStudents.filter((s) => s.academicYear === academicYearFilter), academicYearFilter)}
              >
                Category PDF
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => void navigate('/enroll')}>
            + Enroll Student
          </Button>
        </div>
      </div>

      {/* ── Year chips bar ──────────────────────────────────────────────── */}
      {allStudents.length > 0 && (
        <div
          className="flex-shrink-0 bg-white/60 rounded-xl border border-emerald-100 px-3 py-2"
          style={{ boxShadow: '0 1px 3px 0 rgba(16,185,129,0.05)' }}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto scroll-emerald pb-0.5">
            {/* Total chip */}
            <div className="flex items-center gap-1.5 bg-emerald-500 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap shrink-0">
              <span className="text-emerald-100 font-medium text-[11px]">Total</span>
              <span className="font-bold tabular-nums text-white">
                <AnimNum value={confirmedActiveCount} />
              </span>
              {confirmedActiveCount < confirmedTotalCount && (
                <span className="text-emerald-200 text-[10px]">/{confirmedTotalCount}</span>
              )}
            </div>
            <span className="text-emerald-200 text-xs select-none shrink-0">·</span>
            {/* Per-year chips */}
            {activeStats.map(({ year, count }) => {
              const isSelected = !isSearchMode && academicYearFilter === year;
              const isDimmed = count === 0;
              return (
                <button
                  key={year}
                  type="button"
                  disabled={isSearchMode}
                  onClick={() => setAcademicYearFilter(isSelected ? '' : year as AcademicYear)}
                  className={`flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs whitespace-nowrap shrink-0 transition-all duration-150 ${
                    isSearchMode ? 'cursor-default' : 'cursor-pointer'
                  } ${
                    isSelected
                      ? 'bg-emerald-50 border-emerald-300'
                      : isDimmed
                      ? 'bg-transparent border-gray-100'
                      : 'bg-white/80 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50'
                  }`}
                >
                  <span className={`font-medium text-[11px] ${isSelected ? 'text-emerald-700' : isDimmed ? 'text-gray-300' : 'text-gray-500'}`}>
                    {year}
                  </span>
                  <span className={`font-bold tabular-nums ${isSelected ? 'text-emerald-800' : isDimmed ? 'text-gray-300' : 'text-gray-700'}`}>
                    <AnimNum value={count} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white/70 rounded-2xl border border-emerald-100 overflow-hidden" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 1px 4px 0 rgba(16,185,129,0.06)' }}>
        <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scroll-emerald px-3 py-2.5">
          <input
            type="text"
            placeholder="Search name / reg / mobile…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-40 shrink-0 rounded-lg border border-emerald-100 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 bg-white/80 text-gray-700 placeholder:text-gray-400"
          />
          <select
            className={`${fs} w-[90px] shrink-0 ${isSearchMode ? 'opacity-40 cursor-not-allowed' : ''}`}
            value={academicYearFilter}
            onChange={(e) => setAcademicYearFilter(e.target.value as AcademicYear | '')}
            disabled={isSearchMode}
          >
            <option value="">Acad Yr</option>
            {sortedAcademicYears.map((ay) => (
              <option key={ay} value={ay}>{ay}</option>
            ))}
          </select>
          <select className={`${fs} w-[72px] shrink-0`} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value as Course | '')}>
            <option value="">Course</option>
            {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={`${fs} w-[80px] shrink-0`} value={yearFilter} onChange={(e) => setYearFilter(e.target.value as Year | '')}>
            <option value="">Study Yr</option>
            {YEARS.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
          </select>
          <select className={`${fs} w-[74px] shrink-0`} value={genderFilter} onChange={(e) => setGenderFilter(e.target.value as Gender | '')}>
            <option value="">Gender</option>
            <option value="BOY">BOY</option>
            <option value="GIRL">GIRL</option>
          </select>
          <select className={`${fs} w-[66px] shrink-0`} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as Category | '')}>
            <option value="">Cat</option>
            <option value="GM">GM</option>
            <option value="SC">SC</option>
            <option value="ST">ST</option>
            <option value="C1">C1</option>
            <option value="2A">2A</option>
            <option value="2B">2B</option>
            <option value="3A">3A</option>
            <option value="3B">3B</option>
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
          <select className={`${fs} w-[86px] shrink-0`} value={admStatusFilter} onChange={(e) => setAdmStatusFilter(e.target.value)}>
            <option value="">Status</option>
            <option value="PROVISIONAL">PROVISIONAL</option>
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="shrink-0 rounded-lg border border-amber-300 px-2 py-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer transition-colors font-semibold whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
      ) : isSearchMode ? (

        /* ── Search results ─────────────────────────────────────────── */
        <div className="flex-1 min-h-0 overflow-auto space-y-3">
          {studentGroups.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              No students found.
            </div>
          ) : (
            <>
            {studentGroups.length > 100 && (
              <p className="text-xs text-gray-400 px-1">
                Showing first 100 of {studentGroups.length} matches — refine your search to narrow results.
              </p>
            )}
            {studentGroups.slice(0, 100).map((group) => (
              <div key={group.key} className="bg-white/80 rounded-2xl border border-emerald-100 overflow-hidden" style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)' }}>
                <div className="px-4 py-2.5 border-b border-emerald-50 flex items-baseline gap-3 flex-wrap" style={{ background: 'linear-gradient(90deg, #f0fdf8, #f8fafc)' }}>
                  <span className="font-bold text-gray-900 text-sm">{group.nameSSLC}</span>
                  {group.nameAadhar && group.nameAadhar !== group.nameSSLC && (
                    <span className="text-xs text-gray-500">({group.nameAadhar})</span>
                  )}
                  <span className="text-xs text-gray-500">DOB: {group.dob || '—'}</span>
                  <span className="text-xs text-gray-500">{group.gender}</span>
                  <span className="text-xs text-emerald-600 font-semibold ml-auto">
                    {group.records.length} enrollment{group.records.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs divide-y divide-emerald-50">
                    <thead className="bg-white/50">
                      <tr>
                        {['Acad Year', 'Study Year', 'Course', 'Reg No', 'Adm Type', 'Adm Cat', 'Status', 'Mobile', ''].map((h) => (
                          <th key={h} className="px-3 py-1.5 text-left font-semibold text-gray-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-50/50">
                      {group.records.map((s) => (
                        <tr key={s.id} className="hover:bg-emerald-50/40 transition-colors">
                          <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{s.academicYear}</td>
                          <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{s.year}</td>
                          <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{s.course}</td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{s.regNumber || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{s.admType || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{s.admCat || '—'}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass(s.admissionStatus)}`}>
                              {s.admissionStatus || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{s.studentMobile}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            <div className="flex gap-1.5">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setFeeHistoryStudent(s)}
                              >
                                View Details
                              </Button>
                              {isAdmin && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void navigate(`/enroll?edit=${s.id}&from=dashboard`)}
                                >
                                  Edit
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            </>
          )}
        </div>

      ) : (

        /* ── Metric cards ───────────────────────────────────────────── */
        <div className="flex-1 min-h-0 overflow-auto pb-4">
          <div className="space-y-5 min-w-0">

            {/* Overview row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Total card — hero with subtle gradient */}
              <div
                className="col-span-2 rounded-2xl border border-sky-200 p-4 flex flex-col gap-1.5 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)', boxShadow: '0 1px 3px 0 rgba(14,165,233,0.08)' }}
              >
                <span aria-hidden="true" className="absolute -bottom-3 -right-2 text-8xl font-black leading-none select-none pointer-events-none text-sky-600 opacity-[0.05]">
                  ALL
                </span>
                <p className="text-[11px] font-bold uppercase tracking-widest text-sky-600/70">Total Enrolled</p>
                <p className="text-4xl font-black leading-none text-sky-700">
                  <AnimNum value={stats.total} />
                </p>
                <p className="text-xs text-sky-500/80 mt-auto font-medium">{stats.boys} Boys · {stats.girls} Girls</p>
              </div>
              <StatCard
                label="Boys"
                value={stats.boys}
                total={stats.total}
                bg="bg-sky-50"
                border="border-sky-200"
                textColor="text-sky-700"
                barFill="bg-sky-400"
              />
              <StatCard
                label="Girls"
                value={stats.girls}
                total={stats.total}
                bg="bg-rose-50"
                border="border-rose-200"
                textColor="text-rose-600"
                barFill="bg-rose-400"
              />
            </div>

            {/* By Course */}
            <div>
              <SectionLabel accent={{ bar: 'bg-emerald-500', text: 'text-emerald-700' }}>By Course</SectionLabel>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {COURSES.map((course) => {
                  const c = courseConfig[course];
                  return (
                    <StatCard
                      key={course}
                      label={course}
                      value={stats.byCourse[course]}
                      total={stats.total}
                      bg={c.bg}
                      border={c.border}
                      textColor={c.textColor}
                      barFill={c.barFill}
                      breakdown={YEARS.map((yr, i) => ({ label: `${i + 1}Y`, value: stats.byCourseByYear[course][yr] }))}
                      highlightLabel
                      watermark={course}
                      onClick={() => setCourseModalCourse(course)}
                    />
                  );
                })}
              </div>
            </div>

            {/* By Year of Study */}
            <div>
              <SectionLabel accent={{ bar: 'bg-teal-500', text: 'text-teal-700' }}>By Year of Study</SectionLabel>
              <div className="grid grid-cols-3 gap-3">
                {YEARS.map((year) => {
                  const y = yearConfig[year];
                  const wm = year === '1ST YEAR' ? '1st' : year === '2ND YEAR' ? '2nd' : '3rd';
                  return (
                    <StatCard
                      key={year}
                      label={y.label}
                      value={stats.byYear[year]}
                      total={stats.total}
                      bg={y.bg}
                      border={y.border}
                      textColor={y.textColor}
                      barFill={y.barFill}
                      breakdown={COURSES.map((course) => ({ label: course, value: stats.byYearByCourse[year][course] }))}
                      highlightBreakdown
                      watermark={wm}
                      onClick={() => setYearModalYear(year)}
                    />
                  );
                })}
              </div>
            </div>

            {/* 1st Year Pending Seats */}
            <div>
              <SectionLabel accent={{ bar: 'bg-amber-400', text: 'text-amber-700' }}>1st Year — Pending Seats</SectionLabel>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {COURSES.map((course) => {
                  const c = courseConfig[course];
                  const { regularConfirmed, snqConfirmed } = stats.firstYearSeats[course];
                  const regularPending = Math.max(0, 60 - regularConfirmed);
                  const snqPending = Math.max(0, 3 - snqConfirmed);
                  const regularFillPct = Math.min(100, Math.round((regularConfirmed / 60) * 100));
                  return (
                    <div key={course} className={`rounded-2xl border ${c.border} ${c.bg} p-4 flex flex-col gap-2 relative overflow-hidden`} style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)' }}>
                      <span aria-hidden="true" className={`absolute -bottom-3 -right-2 text-8xl font-black leading-none select-none pointer-events-none ${c.textColor} opacity-[0.07]`}>{course}</span>
                      <span className={`self-start px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border ${c.border} bg-white/70 ${c.textColor}`}>{course}</span>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-end justify-between">
                          <span className="text-[10px] text-gray-400 font-semibold">Regular</span>
                          <span className={`text-2xl font-black leading-none tabular-nums ${regularPending === 0 ? 'text-emerald-600' : c.textColor}`}>
                            <AnimNum value={regularPending} />
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.barFill} transition-all duration-700 ease-out`}
                            style={{ width: `${regularFillPct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 tabular-nums">{regularConfirmed} / 60 filled</p>
                      </div>
                      <div className="pt-1.5 border-t border-white/50 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-gray-400 font-semibold">SNQ</span>
                          <p className="text-[10px] text-gray-400 tabular-nums">{snqConfirmed} / 3 filled</p>
                        </div>
                        <span className={`text-lg font-black tabular-nums ${snqPending === 0 ? 'text-emerald-600' : 'text-gray-600'}`}>
                          <AnimNum value={snqPending} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Admission Status + Adm Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BreakdownPanel
                title="Admission Status"
                total={stats.total}
                items={[
                  { label: 'Provisional', value: stats.byStatus['PROVISIONAL'], dotClass: 'bg-amber-400',    barClass: 'bg-amber-400'    },
                  { label: 'Confirmed',   value: stats.byStatus['CONFIRMED'],   dotClass: 'bg-emerald-400', barClass: 'bg-emerald-400' },
                  { label: 'Cancelled',   value: stats.byStatus['CANCELLED'],   dotClass: 'bg-red-400',     barClass: 'bg-red-400'     },
                  { label: 'Pending',     value: stats.byStatus['PENDING'],     dotClass: 'bg-gray-300',    barClass: 'bg-gray-300'    },
                ]}
              />
              <BreakdownPanel
                title="Admission Type"
                total={stats.total}
                items={[
                  { label: 'Regular',  value: stats.byAdmType['REGULAR'],  dotClass: 'bg-teal-400',    barClass: 'bg-teal-400'    },
                  { label: 'Repeater', value: stats.byAdmType['REPEATER'], dotClass: 'bg-amber-400',   barClass: 'bg-amber-400'   },
                  { label: 'Lateral',  value: stats.byAdmType['LATERAL'],  dotClass: 'bg-sky-400',     barClass: 'bg-sky-400'     },
                  { label: 'External', value: stats.byAdmType['EXTERNAL'], dotClass: 'bg-violet-400',  barClass: 'bg-violet-400'  },
                  { label: 'SNQ',      value: stats.byAdmType['SNQ'],      dotClass: 'bg-gray-400',    barClass: 'bg-gray-400'    },
                ]}
              />
            </div>

            {/* Report tables */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              {/* Category Report */}
              {(() => {
                const catRows = YEARS.flatMap((yr) => {
                  const yrLabel = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
                  const sub = { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0, total: 0 };
                  const courseRows = COURSES.map((course) => {
                    const c = stats.catTable[yr]?.[course] ?? { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0 };
                    const total = c.gm + c.c1 + c.twoA + c.twoB + c.threeA + c.threeB + c.sc + c.st;
                    sub.gm += c.gm; sub.c1 += c.c1; sub.twoA += c.twoA; sub.twoB += c.twoB; sub.threeA += c.threeA;
                    sub.threeB += c.threeB; sub.sc += c.sc; sub.st += c.st; sub.total += total;
                    return { yrLabel, course, ...c, total, isSubtotal: false };
                  });
                  return [...courseRows, { yrLabel: `${yrLabel} SUBTOTAL`, course: 'All Courses', ...sub, isSubtotal: true }];
                });
                const grand = catRows.filter((r) => r.isSubtotal).reduce(
                  (acc, r) => ({ gm: acc.gm + r.gm, c1: acc.c1 + r.c1, twoA: acc.twoA + r.twoA, twoB: acc.twoB + r.twoB,
                    threeA: acc.threeA + r.threeA, threeB: acc.threeB + r.threeB, sc: acc.sc + r.sc, st: acc.st + r.st, total: acc.total + r.total }),
                  { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0, total: 0 }
                );
                const tc = 'px-2 py-1 text-right tabular-nums';
                const tl = 'px-2 py-1 text-left';
                return (
                  <div className="bg-white/80 rounded-2xl border border-emerald-100 overflow-hidden" style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)' }}>
                    <div className="px-4 py-2.5 border-b border-emerald-50">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400/80">Category-wise Count</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] border-collapse">
                        <thead>
                          <tr style={{ background: 'linear-gradient(90deg, #065f46, #047857)' }}>
                            {['Year','Course','GM','C1','2A','2B','3A','3B','SC','ST','Total'].map((h) => (
                              <th key={h} className="px-2 py-1.5 text-white font-semibold whitespace-nowrap text-right [&:nth-child(1)]:text-left [&:nth-child(2)]:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {catRows.map((r, i) => r.isSubtotal ? (
                            <tr key={i} className="text-white font-semibold" style={{ background: '#059669' }}>
                              <td className={tl}>{r.yrLabel}</td>
                              <td className={tl}>{r.course}</td>
                              {[r.gm, r.c1, r.twoA, r.twoB, r.threeA, r.threeB, r.sc, r.st, r.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                            </tr>
                          ) : (
                            <tr key={i} className="border-b border-emerald-50 hover:bg-emerald-50/40 transition-colors">
                              <td className={tl + ' text-gray-400'}>{r.yrLabel}</td>
                              <td className={tl + ' font-semibold text-gray-700'}>{r.course}</td>
                              {[r.gm, r.c1, r.twoA, r.twoB, r.threeA, r.threeB, r.sc, r.st, r.total].map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v}</td>)}
                            </tr>
                          ))}
                          <tr className="text-white font-bold" style={{ background: '#064e3b' }}>
                            <td className={tl}>GRAND TOTAL</td>
                            <td className={tl}></td>
                            {[grand.gm, grand.c1, grand.twoA, grand.twoB, grand.threeA, grand.threeB, grand.sc, grand.st, grand.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Summary Report */}
              {(() => {
                const sumRows = YEARS.flatMap((yr) => {
                  const yrLabel = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
                  const sub = { regular: 0, ltrl: 0, snq: 0, rptr: 0, total: 0 };
                  const courseRows = COURSES.map((course) => {
                    const c = stats.summaryTable[yr]?.[course] ?? { regular: 0, ltrl: 0, snq: 0, rptr: 0 };
                    const total = c.regular + c.ltrl + c.snq + c.rptr;
                    sub.regular += c.regular; sub.ltrl += c.ltrl; sub.snq += c.snq; sub.rptr += c.rptr; sub.total += total;
                    return { yrLabel, course, ...c, total, isSubtotal: false };
                  });
                  return [...courseRows, { yrLabel: `${yrLabel} SUBTOTAL`, course: 'All Courses', ...sub, isSubtotal: true }];
                });
                const grand = sumRows.filter((r) => r.isSubtotal).reduce(
                  (acc, r) => ({ regular: acc.regular + r.regular, ltrl: acc.ltrl + r.ltrl, snq: acc.snq + r.snq, rptr: acc.rptr + r.rptr, total: acc.total + r.total }),
                  { regular: 0, ltrl: 0, snq: 0, rptr: 0, total: 0 }
                );
                const tc = 'px-2 py-1 text-right tabular-nums';
                const tl = 'px-2 py-1 text-left';
                return (
                  <div className="bg-white/80 rounded-2xl border border-sky-100 overflow-hidden" style={{ boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)' }}>
                    <div className="px-4 py-2.5 border-b border-sky-50">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400/80">Admission Type-wise Count</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] border-collapse">
                        <thead>
                          <tr style={{ background: 'linear-gradient(90deg, #0c4a6e, #075985)' }}>
                            {['Year','Course','Regular','LTRL','SNQ','RPTR','Total'].map((h) => (
                              <th key={h} className="px-2 py-1.5 text-white font-semibold whitespace-nowrap text-right [&:nth-child(1)]:text-left [&:nth-child(2)]:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sumRows.map((r, i) => r.isSubtotal ? (
                            <tr key={i} className="text-white font-semibold" style={{ background: '#0284c7' }}>
                              <td className={tl}>{r.yrLabel}</td>
                              <td className={tl}>{r.course}</td>
                              {[r.regular, r.ltrl, r.snq, r.rptr, r.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                            </tr>
                          ) : (
                            <tr key={i} className="border-b border-sky-50 hover:bg-sky-50/40 transition-colors">
                              <td className={tl + ' text-gray-400'}>{r.yrLabel}</td>
                              <td className={tl + ' font-semibold text-gray-700'}>{r.course}</td>
                              {[r.regular, r.ltrl, r.snq, r.rptr, r.total].map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v}</td>)}
                            </tr>
                          ))}
                          <tr className="text-white font-bold" style={{ background: '#082f49' }}>
                            <td className={tl}>GRAND TOTAL</td>
                            <td className={tl}></td>
                            {[grand.regular, grand.ltrl, grand.snq, grand.rptr, grand.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

            </div>

          </div>
        </div>
      )}

    </div>

    {feeHistoryStudent && (
      <StudentDetailModal
        student={feeHistoryStudent}
        onClose={() => setFeeHistoryStudent(null)}
      />
    )}

    {/* Course modal */}
    {courseModalCourse && (() => {
      const c = courseConfig[courseModalCourse];
      const rows = YEARS.map((yr) => {
        const cell = stats.summaryTable[yr]?.[courseModalCourse] ?? { regular: 0, ltrl: 0, snq: 0, rptr: 0 };
        const total = cell.regular + cell.ltrl + cell.snq + cell.rptr;
        const yrLabel = yr === '1ST YEAR' ? '1st Year' : yr === '2ND YEAR' ? '2nd Year' : '3rd Year';
        return { yrLabel, ...cell, total };
      });
      const grand = rows.reduce(
        (acc, r) => ({ regular: acc.regular + r.regular, ltrl: acc.ltrl + r.ltrl, snq: acc.snq + r.snq, rptr: acc.rptr + r.rptr, total: acc.total + r.total }),
        { regular: 0, ltrl: 0, snq: 0, rptr: 0, total: 0 }
      );
      const cols: { key: keyof typeof grand; label: string }[] = [
        { key: 'regular', label: 'Regular' },
        { key: 'ltrl',    label: 'Lateral' },
        { key: 'snq',     label: 'SNQ'     },
        { key: 'rptr',    label: 'Repeater'},
        { key: 'total',   label: 'Total'   },
      ];
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCourseModalCourse(null)} aria-hidden="true" />
          <div className={`relative rounded-2xl border-2 ${c.border} ${c.bg} shadow-2xl w-full max-w-md mx-4 overflow-hidden`} style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className={`px-5 py-3.5 flex items-center justify-between border-b ${c.border} relative overflow-hidden`}>
              <span aria-hidden="true" className={`absolute -bottom-4 -right-2 text-8xl font-black leading-none select-none pointer-events-none ${c.textColor} opacity-[0.07]`}>
                {courseModalCourse}
              </span>
              <div className="flex items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-md text-sm font-black uppercase tracking-widest border ${c.border} bg-white/70 ${c.textColor}`}>
                  {courseModalCourse}
                </span>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Admission Type-wise</p>
              </div>
              <button
                onClick={() => setCourseModalCourse(null)}
                className="relative z-10 rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className={`${c.bg}`}>
                    <th className={`px-3 py-2 text-left font-semibold ${c.textColor} border-b-2 ${c.border}`}>Year</th>
                    {cols.map(({ key, label }) => (
                      <th key={key} className={`px-3 py-2 text-right font-semibold ${key === 'total' ? c.textColor : 'text-gray-500'} border-b-2 ${c.border} ${key === 'total' ? 'border-l-2' : ''}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.yrLabel} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className={`px-3 py-2.5 font-semibold text-gray-700 border-b ${c.border}/40`}>{row.yrLabel}</td>
                      {cols.map(({ key }) => (
                        <td key={key} className={`px-3 py-2.5 text-right tabular-nums border-b ${c.border}/40 ${key === 'total' ? `font-bold ${c.textColor} border-l-2 ${c.border}` : 'text-gray-700'}`}>
                          {row[key] > 0 ? row[key] : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`${c.bg} border-t-2 ${c.border}`}>
                    <td className={`px-3 py-2.5 font-bold ${c.textColor} text-xs uppercase tracking-wide`}>Total</td>
                    {cols.map(({ key }) => (
                      <td key={key} className={`px-3 py-2.5 text-right tabular-nums font-bold ${c.textColor} text-sm ${key === 'total' ? `border-l-2 ${c.border}` : ''}`}>
                        {grand[key]}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Year modal */}
    {yearModalYear && (() => {
      const y = yearConfig[yearModalYear];
      const wm = yearModalYear === '1ST YEAR' ? '1st' : yearModalYear === '2ND YEAR' ? '2nd' : '3rd';
      const rows = COURSES.map((course) => {
        const cell = stats.summaryTable[yearModalYear]?.[course] ?? { regular: 0, ltrl: 0, snq: 0, rptr: 0 };
        const total = cell.regular + cell.ltrl + cell.snq + cell.rptr;
        return { course, ...cell, total };
      });
      const grand = rows.reduce(
        (acc, r) => ({ regular: acc.regular + r.regular, ltrl: acc.ltrl + r.ltrl, snq: acc.snq + r.snq, rptr: acc.rptr + r.rptr, total: acc.total + r.total }),
        { regular: 0, ltrl: 0, snq: 0, rptr: 0, total: 0 }
      );
      const cols: { key: keyof typeof grand; label: string }[] = [
        { key: 'regular', label: 'Regular'  },
        { key: 'ltrl',    label: 'Lateral'  },
        { key: 'snq',     label: 'SNQ'      },
        { key: 'rptr',    label: 'Repeater' },
        { key: 'total',   label: 'Total'    },
      ];
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setYearModalYear(null)} aria-hidden="true" />
          <div className={`relative rounded-2xl border-2 ${y.border} ${y.bg} shadow-2xl w-full max-w-md mx-4 overflow-hidden`} style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className={`px-5 py-3.5 flex items-center justify-between border-b ${y.border} relative overflow-hidden`}>
              <span aria-hidden="true" className={`absolute -bottom-4 -right-2 text-8xl font-black leading-none select-none pointer-events-none ${y.textColor} opacity-[0.07]`}>
                {wm}
              </span>
              <div className="flex items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-md text-sm font-black uppercase tracking-widest border ${y.border} bg-white/70 ${y.textColor}`}>
                  {y.label}
                </span>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Admission Type-wise</p>
              </div>
              <button
                onClick={() => setYearModalYear(null)}
                className="relative z-10 rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className={`px-3 py-2 text-left font-semibold ${y.textColor} border-b-2 ${y.border}`}>Course</th>
                    {cols.map(({ key, label }) => (
                      <th key={key} className={`px-3 py-2 text-right font-semibold ${key === 'total' ? y.textColor : 'text-gray-500'} border-b-2 ${y.border} ${key === 'total' ? `border-l-2 ${y.border}` : ''}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.course} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className={`px-3 py-2.5 font-semibold text-gray-700 border-b ${y.border}/40`}>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${y.border} bg-white/70 ${y.textColor}`}>
                          {row.course}
                        </span>
                      </td>
                      {cols.map(({ key }) => (
                        <td key={key} className={`px-3 py-2.5 text-right tabular-nums border-b ${y.border}/40 ${key === 'total' ? `font-bold ${y.textColor} border-l-2 ${y.border}` : 'text-gray-700'}`}>
                          {row[key] > 0 ? row[key] : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`${y.bg} border-t-2 ${y.border}`}>
                    <td className={`px-3 py-2.5 font-bold ${y.textColor} text-xs uppercase tracking-wide`}>Total</td>
                    {cols.map(({ key }) => (
                      <td key={key} className={`px-3 py-2.5 text-right tabular-nums font-bold ${y.textColor} text-sm ${key === 'total' ? `border-l-2 ${y.border}` : ''}`}>
                        {grand[key]}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
