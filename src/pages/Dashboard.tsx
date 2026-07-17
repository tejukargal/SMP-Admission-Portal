import { useState, useMemo, useEffect, useLayoutEffect, useRef, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllStudents } from '../hooks/useAllStudents';
import { useSettings } from '../hooks/useSettings';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { getFeeRecordsByAcademicYear } from '../services/feeRecordService';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { getFeeOverridesByYear } from '../services/feeOverrideService';
import { Button } from '../components/common/Button';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { useFilters } from '../contexts/FiltersContext';
import { useAuth } from '../contexts/AuthContext';
import { StudentDetailModal } from '../components/student/StudentDetailModal';
import { FeeCollectionModal } from '../components/fee/FeeCollectionModal';
import { StudyCertificateModal } from '../components/common/StudyCertificateModal';
import { TransferCertificateModal } from '../components/common/TransferCertificateModal';
import { ProvisionalCertificateModal } from '../components/common/ProvisionalCertificateModal';
import { CourseCompletionCertificateModal } from '../components/common/CourseCompletionCertificateModal';
import { generateTCApplication } from '../utils/tcApplicationPdf';
import {
  exportSummaryReport, exportCategoryReport,
  exportGenderCourseYearReport, exportGenderCategoryReport,
  exportDatewiseAdmissionsReport, exportFirstYearSeatsReport,
} from '../utils/dashboardReportPdf';
import type { ThemeName } from '../utils/dashboardReportPdf';
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category } from '../types';
import { SMP_FEE_HEADS } from '../types';
import { RecentActivityCard } from '../components/dashboard/RecentActivityCard';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const REGULAR_INTAKE = 60;
const LATERAL_BASE_PCT = 0.10;
const YEAR_INTAKE = 63 * COURSES.length; // 315 — total intake capacity per year across all courses

// PDF export accent themes — mirror each course/year card's own accent colour so an
// exported report visually matches the modal/card it was triggered from.
const COURSE_PDF_THEME: Record<Course, ThemeName> = { CE: 'amber', ME: 'green', EC: 'sky', CS: 'teal', EE: 'violet' };
const YEAR_PDF_THEME: Record<Year, ThemeName> = { '1ST YEAR': 'lime', '2ND YEAR': 'emerald', '3RD YEAR': 'teal' };

// Hex equivalents of each course's accent color (courseConfig.barFill), needed for SVG ring strokes
const COURSE_RING_HEX: Record<Course, string> = {
  CE: '#fbbf24', ME: '#4ade80', EC: '#38bdf8', CS: '#2dd4bf', EE: '#a78bfa',
};

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

// ─── Slot ticker (label + value that cycles via slot-machine animation) ───────
function SlotTicker({ label, value, textColor }: { label: string; value: string | number; textColor: string }) {
  type Entry = { label: string; value: string | number };
  const [state, setState] = useState<{ prev: Entry | null; cur: Entry }>({
    prev: null,
    cur: { label, value },
  });

  useEffect(() => {
    setState((s) => {
      if (s.cur.label === label && s.cur.value === value) return s;
      return { prev: s.cur, cur: { label, value } };
    });
  }, [label, value]);

  useEffect(() => {
    if (!state.prev) return;
    const t = setTimeout(() => setState((s) => ({ ...s, prev: null })), 820);
    return () => clearTimeout(t);
  }, [state.prev]);

  return (
    <div className="relative overflow-hidden w-full flex flex-col items-center gap-0.5">
      {state.prev && (
        <div
          className="absolute top-0 left-0 right-0 flex flex-col items-center gap-0.5"
          style={{ animation: 'slot-exit 0.38s ease-in forwards' }}
        >
          <span className={`text-xs font-bold leading-none ${textColor}`}>{state.prev.label}</span>
          <p className={`text-3xl font-black leading-none tabular-nums ${textColor}`}>{state.prev.value}</p>
        </div>
      )}
      <div
        className="flex flex-col items-center gap-0.5 w-full"
        style={{ animation: state.prev ? 'slot-enter 0.38s ease-out 0.38s both' : 'none' }}
      >
        <span className={`text-xs font-bold leading-none ${textColor}`}>{state.cur.label}</span>
        <p className={`text-3xl font-black leading-none tabular-nums ${textColor}`}>{state.cur.value}</p>
      </div>
    </div>
  );
}

// ─── Circular fill ring (donut-style progress, replaces the linear seat bars) ─
function SeatRing({ pct, color, ready, size = 36, stroke = 4 }: { pct: number; color: string; ready: boolean; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - (ready ? pct : 0) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: ready ? 'stroke-dashoffset 800ms cubic-bezier(0.4,0,0.2,1)' : 'none' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Section label ───────────────────────────────────────────────────────────
function SectionLabel({ children, accent, onDoubleClick }: { children: React.ReactNode; accent?: { bar: string; text: string }; onDoubleClick?: () => void }) {
  if (accent) {
    return (
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className={`w-1 h-4 rounded-full shrink-0 ${accent.bar}`} />
        <p
          className={`text-xs font-semibold uppercase tracking-wider ${accent.text} ${onDoubleClick ? 'cursor-pointer select-none' : ''}`}
          onDoubleClick={onDoubleClick}
          title={onDoubleClick ? 'Double-click to export PDF' : undefined}
        >
          {children}
        </p>
      </div>
    );
  }
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-wider text-gray-400/70 mb-1.5 ${onDoubleClick ? 'cursor-pointer select-none' : ''}`}
      onDoubleClick={onDoubleClick}
      title={onDoubleClick ? 'Double-click to export PDF' : undefined}
    >
      {children}
    </p>
  );
}

// ─── Loading gate ────────────────────────────────────────────────────────────
function LoadingGate() {
  return (
    <div className="h-full flex flex-col gap-1.5 overflow-hidden" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="flex-shrink-0 flex items-center justify-between gap-4">
        <div className="flex-1 h-10 bg-white/60 rounded-2xl border border-emerald-300 animate-pulse" />
        <div className="w-28 h-8 bg-white/60 rounded-xl border border-emerald-300 animate-pulse" />
      </div>
      <div className="flex-shrink-0 flex gap-2">
        {[80, 96, 80, 80, 80].map((w, i) => (
          <div key={i} className="h-7 bg-white/60 rounded-lg border border-emerald-300 animate-pulse" style={{ width: w }} />
        ))}
      </div>
      <div className="flex-shrink-0 h-9 bg-white/60 rounded-xl border border-emerald-300 animate-pulse" />
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-2xl border border-violet-200 h-24 animate-pulse" style={{ background: '#ede9fb' }} />
            <div className="rounded-2xl border border-green-200 h-24 animate-pulse" style={{ background: '#dcfce7' }} />
            <div className="rounded-2xl border border-sky-200 h-24 animate-pulse" style={{ background: '#e0f2fe' }} />
            <div className="rounded-2xl border border-rose-200 h-24 animate-pulse" style={{ background: '#ffe4e6' }} />
          </div>
          <div className="space-y-2.5">
            <div className="h-3.5 w-20 bg-white/60 rounded animate-pulse" />
            <div className="grid grid-cols-5 gap-3">
              {['amber','green','sky','teal','violet'].map((c) => (
                <div key={c} className={`rounded-2xl border border-${c}-400 bg-${c}-50 h-20 animate-pulse`} />
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="h-3.5 w-28 bg-white/60 rounded animate-pulse" />
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-lime-400 bg-lime-50 h-20 animate-pulse" />
              <div className="rounded-2xl border border-emerald-400 bg-emerald-50 h-20 animate-pulse" />
              <div className="rounded-2xl border border-teal-400 bg-teal-50 h-20 animate-pulse" />
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
  const [resultsStudent, setResultsStudent] = useState<Student | null>(null);
  const [courseModalCourse, setCourseModalCourse] = useState<Course | null>(null);
  const [yearModalYear, setYearModalYear] = useState<Year | null>(null);
  const [genderModal, setGenderModal] = useState<'BOY' | 'GIRL' | null>(null);
  const [totalModal, setTotalModal] = useState(false);
  const [summaryModal, setSummaryModal] = useState(false);
  const [intakeModal, setIntakeModal] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [admTypeModal, setAdmTypeModal] = useState(false);
  const [admTypeDetailModal, setAdmTypeDetailModal] = useState<'LATERAL' | 'REPEATER' | 'SNQ' | null>(null);
  const [catGenderModal, setCatGenderModal] = useState(false);
  const [yearGenderModal, setYearGenderModal] = useState(false);
  const [dateWiseModal, setDateWiseModal] = useState(false);

  // ── Collect Fee from dashboard search (admin only) ───────────────────────
  const [collectFeeStudent, setCollectFeeStudent] = useState<Student | null>(null);

  // ── Course card breakup flip (0=total, 1=REG, 2=LAT, 3=SNQ, 4=RPT) ──────
  // ── Gender card breakup flip (cycles through COURSES: CE,ME,EC,CS,EE) ───
  const [genderBreakIdx, setGenderBreakIdx] = useState(0);
  // ── Bar chart mode flip (Total → Boys → Girls → Adm Type) ───────────────
  const [barChartMode, setBarChartMode] = useState(0);
  const [chartBarsReady, setChartBarsReady] = useState(false);

  // ── Fee status for search result rows ────────────────────────────────────
  type FeeStatus = 'collect' | 'dues' | 'no-dues';
  const [searchFeeStatus, setSearchFeeStatus] = useState<Map<string, FeeStatus>>(new Map());
  const [searchFeeLoading, setSearchFeeLoading] = useState(false);
  // ── Total due per student group (keyed by group.key = regNumber or name|dob) ─
  const [searchGroupDue, setSearchGroupDue] = useState<Map<string, number | null | 'unavailable'>>(new Map());

  // ── Filter / chips / stats pills panel visibility ────────────────────────
  const [showFilters,    setShowFilters]    = useState(false);
  const [showChips,      setShowChips]      = useState(() => localStorage.getItem('smp_chips_visible') !== 'false');
  const [showStatsPills, setShowStatsPills] = useState(() => localStorage.getItem('smp_statspills_visible') === 'true');

  // ── Certificate context menu (search results) ────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; student: Student } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [studyCertStudent, setStudyCertStudent] = useState<Student | null>(null);
  const [tcStudent, setTcStudent] = useState<Student | null>(null);
  const [pcStudent, setPcStudent] = useState<Student | null>(null);
  const [cccStudent, setCccStudent] = useState<Student | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setCtxMenu(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);

  useLayoutEffect(() => {
    const el = ctxMenuRef.current;
    if (!el || !ctxMenu) return;
    const GAP = 6;
    const { offsetWidth: w, offsetHeight: h } = el;
    let x = ctxMenu.x;
    let y = ctxMenu.y;
    if (x + w > window.innerWidth  - GAP) x = window.innerWidth  - w - GAP;
    if (y + h > window.innerHeight - GAP) y = window.innerHeight - h - GAP;
    if (x < GAP) x = GAP;
    if (y < GAP) y = GAP;
    el.style.left       = `${x}px`;
    el.style.top        = `${y}px`;
    el.style.visibility = 'visible';
  }, [ctxMenu]);

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
    startTransition(() => setDashboardFilters({ searchTerm: inputValue }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const chipsScrollRef = useRef<HTMLDivElement>(null);
  function scrollChips(dir: 'left' | 'right') {
    chipsScrollRef.current?.scrollBy({ left: dir === 'left' ? -140 : 140, behavior: 'smooth' });
  }

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
    if (admStatusFilter) result = result.filter((s) =>
      admStatusFilter === 'PENDING'
        ? !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
        : s.admissionStatus?.trim() === admStatusFilter
    );
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
    if (admStatusFilter) result = result.filter((s) =>
      admStatusFilter === 'PENDING'
        ? !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
        : s.admissionStatus?.trim() === admStatusFilter
    );
    return result;
  }, [isSearchMode, searchTerm, searchIndex, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, admStatusFilter]);

  interface StudentGroup {
    key: string;
    nameSSLC: string;
    nameAadhar: string;
    fatherName: string;
    dob: string;
    gender: Gender;
    records: Student[];
  }

  const studentGroups = useMemo((): StudentGroup[] => {
    const map = new Map<string, StudentGroup>();
    for (const s of searchResults) {
      const key = s.regNumber ? s.regNumber.toUpperCase() : `${s.studentNameSSLC}|${s.dateOfBirth}`;
      if (!map.has(key)) {
        map.set(key, { key, nameSSLC: s.studentNameSSLC, nameAadhar: s.studentNameAadhar, fatherName: s.fatherName, dob: s.dateOfBirth, gender: s.gender, records: [] });
      }
      map.get(key)!.records.push(s);
    }
    for (const group of map.values()) {
      group.records.sort((a, b) => a.academicYear.localeCompare(b.academicYear));
      if (!group.dob) {
        const withDob = group.records.find((r) => r.dateOfBirth);
        if (withDob) group.dob = withDob.dateOfBirth;
      }
      if (!group.fatherName) {
        const withFather = group.records.find((r) => r.fatherName);
        if (withFather) group.fatherName = withFather.fatherName;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nameSSLC.localeCompare(b.nameSSLC));
  }, [searchResults]);

  useEffect(() => {
    if (!isSearchMode || searchResults.length === 0) {
      setSearchFeeStatus(new Map());
      setSearchGroupDue(new Map());
      return;
    }
    let cancelled = false;
    setSearchFeeLoading(true);

    async function loadFeeStatus() {
      const uniqueYears = [...new Set(searchResults.map((s) => s.academicYear))] as AcademicYear[];

      const [allRecords, allStructures, allOverrides] = await Promise.all([
        Promise.all(uniqueYears.map((y) => getFeeRecordsByAcademicYear(y))).then((arrs) => arrs.flat()),
        Promise.all(uniqueYears.map((y) => getFeeStructuresByAcademicYear(y))).then((arrs) => arrs.flat()),
        Promise.all(uniqueYears.map((y) => getFeeOverridesByYear(y))).then((arrs) => arrs.flat()),
      ]);

      if (cancelled) return;

      // Total paid per studentId (SMP + SVK + Additional)
      const paidByStudent = new Map<string, number>();
      const finePaidByStudent = new Map<string, number>();
      for (const r of allRecords) {
        const smpSum = SMP_FEE_HEADS.reduce((t, { key }) => t + (r.smp[key] ?? 0), 0);
        const addlSum = (r.additionalPaid ?? []).reduce((t, h) => t + h.amount, 0);
        paidByStudent.set(r.studentId, (paidByStudent.get(r.studentId) ?? 0) + smpSum + r.svk + addlSum);
        finePaidByStudent.set(r.studentId, (finePaidByStudent.get(r.studentId) ?? 0) + (r.smp.fine ?? 0));
      }

      // Total allotted per `${academicYear}__${course}__${year}__${admType}__${admCat}` (structure fallback)
      const allottedByKey = new Map<string, number>();
      const fineAllottedByKey = new Map<string, number>();
      for (const fs of allStructures) {
        const structKey = `${fs.academicYear}__${fs.course}__${fs.year}__${fs.admType}__${fs.admCat}`;
        const smpSum = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (fs.smp[k] ?? 0), 0);
        const addlSum = (fs.additionalHeads ?? []).reduce((t, h) => t + h.amount, 0);
        allottedByKey.set(structKey, smpSum + fs.svk + addlSum);
        fineAllottedByKey.set(structKey, fs.smp.fine ?? 0);
      }

      // Override allotted per studentId (takes precedence over structure)
      const overrideByStudent = new Map<string, number>();
      const fineOverrideByStudent = new Map<string, number>();
      for (const o of allOverrides) {
        const smpSum = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (o.smp[k] ?? 0), 0);
        const addlSum = (o.additionalHeads ?? []).reduce((t, h) => t + h.amount, 0);
        overrideByStudent.set(o.studentId, smpSum + o.svk + addlSum);
        fineOverrideByStudent.set(o.studentId, o.smp.fine ?? 0);
      }

      // Returns allotted adjusted for effectiveFine — mirrors FeeHistoryModal/StudentDetailModal logic.
      // When fine paid > fine allotted, clamps fine contribution to 0 (prevents overpaid fine reducing other dues).
      function effectiveAllotted(studentId: string, allottedKey: string, rawAllotted: number): number {
        const fineAllotted = overrideByStudent.has(studentId)
          ? (fineOverrideByStudent.get(studentId) ?? 0)
          : (fineAllottedByKey.get(allottedKey) ?? 0);
        const finePaid = finePaidByStudent.get(studentId) ?? 0;
        return rawAllotted + Math.max(0, finePaid - fineAllotted);
      }

      const statusMap = new Map<string, FeeStatus>();
      for (const s of searchResults) {
        const paid = paidByStudent.get(s.id) ?? 0;
        const allottedKey = `${s.academicYear}__${s.course}__${s.year}__${s.admType}__${s.admCat}`;
        let allotted: number | null;
        if (overrideByStudent.has(s.id)) {
          allotted = effectiveAllotted(s.id, allottedKey, overrideByStudent.get(s.id)!);
        } else {
          allotted = allottedByKey.has(allottedKey)
            ? effectiveAllotted(s.id, allottedKey, allottedByKey.get(allottedKey)!)
            : null;
        }
        let status: FeeStatus;
        if (allotted !== null && paid >= allotted) {
          status = 'no-dues';
        } else if (paid > 0) {
          status = 'dues';
        } else {
          status = 'collect';
        }
        statusMap.set(s.id, status);
      }

      // Compute total due per student group (only 2021-22 and later — prior data unavailable)
      const groupDueMap = new Map<string, number | null | 'unavailable'>();
      // Pre-seed every group as unavailable; upgraded below for 2021-22+ enrollments
      for (const s of searchResults) {
        const groupKey = s.regNumber ? s.regNumber.toUpperCase() : `${s.studentNameSSLC}|${s.dateOfBirth}`;
        if (!groupDueMap.has(groupKey)) groupDueMap.set(groupKey, 'unavailable');
      }
      for (const s of searchResults) {
        if (s.academicYear < '2021-22') continue;
        const groupKey = s.regNumber ? s.regNumber.toUpperCase() : `${s.studentNameSSLC}|${s.dateOfBirth}`;
        const paid = paidByStudent.get(s.id) ?? 0;
        const allottedKey = `${s.academicYear}__${s.course}__${s.year}__${s.admType}__${s.admCat}`;
        let allotted: number | null;
        if (overrideByStudent.has(s.id)) {
          allotted = effectiveAllotted(s.id, allottedKey, overrideByStudent.get(s.id)!);
        } else {
          allotted = allottedByKey.has(allottedKey)
            ? effectiveAllotted(s.id, allottedKey, allottedByKey.get(allottedKey)!)
            : null;
        }
        const prev = groupDueMap.get(groupKey);
        if (allotted !== null) {
          const prevNum = typeof prev === 'number' ? prev : 0;
          groupDueMap.set(groupKey, prevNum + (allotted - paid));
        } else if (prev === 'unavailable') {
          groupDueMap.set(groupKey, null); // has 2021-22+ enrollment but no structure configured
        }
        // if prev is already a number and this enrollment has no structure, keep the running total
      }

      if (!cancelled) {
        setSearchFeeStatus(statusMap);
        setSearchGroupDue(groupDueMap);
        setSearchFeeLoading(false);
      }
    }

    loadFeeStatus().catch(() => { if (!cancelled) setSearchFeeLoading(false); });
    return () => { cancelled = true; };
  }, [isSearchMode, searchResults]);

  // ── Metrics ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const confirmed = admStatusFilter
      ? filteredStudents
      : filteredStudents.filter((s) => s.admissionStatus === 'CONFIRMED');

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

    const firstYearSeats: Record<Course, { nonSnqConfirmed: number; snqConfirmed: number }> = {
      CE: { nonSnqConfirmed: 0, snqConfirmed: 0 },
      ME: { nonSnqConfirmed: 0, snqConfirmed: 0 },
      EC: { nonSnqConfirmed: 0, snqConfirmed: 0 },
      CS: { nonSnqConfirmed: 0, snqConfirmed: 0 },
      EE: { nonSnqConfirmed: 0, snqConfirmed: 0 },
    };
    const lateralSecondYearSeats: Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    const byYearByCourse: Record<Year, Record<Course, number>> = {
      '1ST YEAR': { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
      '2ND YEAR': { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
      '3RD YEAR': { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
    };
    const emptyCourseyear = (): Record<Course, Record<Year, number>> => ({
      CE: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
      ME: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
      EC: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
      CS: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
      EE: { '1ST YEAR': 0, '2ND YEAR': 0, '3RD YEAR': 0 },
    });
    const byGenderByCourseByYear: Record<string, Record<Course, Record<Year, number>>> = {
      BOY:  emptyCourseyear(),
      GIRL: emptyCourseyear(),
    };
    const byGenderByCategory: Record<string, Record<string, number>> = {
      BOY:  { GM: 0, C1: 0, '2A': 0, '2B': 0, '3A': 0, '3B': 0, SC: 0, ST: 0 },
      GIRL: { GM: 0, C1: 0, '2A': 0, '2B': 0, '3A': 0, '3B': 0, SC: 0, ST: 0 },
    };
    const emptyGenderCatPair = (): Record<Course, Record<Year, { boys: number; girls: number }>> => ({
      CE: { '1ST YEAR': { boys: 0, girls: 0 }, '2ND YEAR': { boys: 0, girls: 0 }, '3RD YEAR': { boys: 0, girls: 0 } },
      ME: { '1ST YEAR': { boys: 0, girls: 0 }, '2ND YEAR': { boys: 0, girls: 0 }, '3RD YEAR': { boys: 0, girls: 0 } },
      EC: { '1ST YEAR': { boys: 0, girls: 0 }, '2ND YEAR': { boys: 0, girls: 0 }, '3RD YEAR': { boys: 0, girls: 0 } },
      CS: { '1ST YEAR': { boys: 0, girls: 0 }, '2ND YEAR': { boys: 0, girls: 0 }, '3RD YEAR': { boys: 0, girls: 0 } },
      EE: { '1ST YEAR': { boys: 0, girls: 0 }, '2ND YEAR': { boys: 0, girls: 0 }, '3RD YEAR': { boys: 0, girls: 0 } },
    });
    const byGenderByCatByCourseByYear: Record<string, Record<Course, Record<Year, { boys: number; girls: number }>>> = {
      GM: emptyGenderCatPair(), C1: emptyGenderCatPair(), '2A': emptyGenderCatPair(), '2B': emptyGenderCatPair(),
      '3A': emptyGenderCatPair(), '3B': emptyGenderCatPair(), SC: emptyGenderCatPair(), ST: emptyGenderCatPair(),
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
      if (s.gender in byGenderByCourseByYear) byGenderByCourseByYear[s.gender][s.course as Course][s.year as Year]++;
      if (s.gender in byGenderByCategory && s.category in byGenderByCategory[s.gender]) byGenderByCategory[s.gender][s.category]++;
      if (s.category in byGenderByCatByCourseByYear) {
        const pair = byGenderByCatByCourseByYear[s.category][s.course as Course]?.[s.year as Year];
        if (pair) { if (s.gender === 'BOY') pair.boys++; else if (s.gender === 'GIRL') pair.girls++; }
      }

      if (s.year === '1ST YEAR' && s.course in firstYearSeats) {
        if (s.admCat === 'SNQ') {
          firstYearSeats[s.course as Course].snqConfirmed++;
        } else {
          firstYearSeats[s.course as Course].nonSnqConfirmed++;
        }
      }
      if (s.year === '2ND YEAR' && s.admType === 'LATERAL' && s.course in lateralSecondYearSeats) {
        lateralSecondYearSeats[s.course as Course]++;
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

    return { total, boys, girls, byCourse, byYear, byStatus, byAdmType, summaryTable, catTable, byCourseByYear, byYearByCourse, firstYearSeats, lateralSecondYearSeats, byGenderByCourseByYear, byGenderByCategory, byGenderByCatByCourseByYear };
  }, [filteredStudents, admStatusFilter]);

  const confirmedStudents = useMemo(
    () => admStatusFilter
      ? filteredStudents
      : filteredStudents.filter((s) => s.admissionStatus === 'CONFIRMED'),
    [filteredStudents, admStatusFilter],
  );

  // Lateral allotments: 10% of intake + carryover from previous year's 1st-year pending
  const lateralAllotments = useMemo((): Record<Course, number> | null => {
    if (!academicYearFilter || isSearchMode) return null;
    const match = academicYearFilter.match(/^(\d{4})-\d{2}$/);
    if (!match) return null;
    const prevStart = parseInt(match[1]!) - 1;
    const prevAcYear = `${prevStart}-${String(prevStart + 1).slice(-2)}`;

    const prevConfirmed: Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    for (const s of allStudents) {
      if (
        s.academicYear === prevAcYear &&
        s.year === '1ST YEAR' &&
        s.admissionStatus === 'CONFIRMED' &&
        s.admCat !== 'SNQ' &&
        s.admType !== 'REPEATER' &&
        s.course in prevConfirmed
      ) {
        prevConfirmed[s.course as Course]++;
      }
    }

    const base = Math.ceil(LATERAL_BASE_PCT * REGULAR_INTAKE);
    const allotments: Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    for (const course of COURSES) {
      const carryover = Math.max(0, REGULAR_INTAKE - prevConfirmed[course]);
      allotments[course] = base + carryover;
    }
    return allotments;
  }, [allStudents, academicYearFilter, isSearchMode]);

  // Course totals per gender (summed across all years) for the flip display
  const genderCourseTotals = useMemo(() => {
    const result: Record<'BOY' | 'GIRL', Record<Course, number>> = {
      BOY:  { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
      GIRL: { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
    };
    for (const g of ['BOY', 'GIRL'] as const) {
      for (const course of COURSES) {
        result[g][course] = YEARS.reduce((sum, yr) => sum + (stats.byGenderByCourseByYear[g][course][yr] ?? 0), 0);
      }
    }
    return result;
  }, [stats.byGenderByCourseByYear]);

  // Adm-type totals per course (summed across all years) for the flip display
  const courseAdmTotals = useMemo(() => {
    const result = {} as Record<Course, { regular: number; ltrl: number; snq: number; rptr: number }>;
    for (const course of COURSES) {
      let regular = 0, ltrl = 0, snq = 0, rptr = 0;
      for (const yr of YEARS) {
        const cell = stats.summaryTable[yr]?.[course] ?? { regular: 0, ltrl: 0, snq: 0, rptr: 0 };
        regular += cell.regular; ltrl += cell.ltrl; snq += cell.snq; rptr += cell.rptr;
      }
      result[course] = { regular, ltrl, snq, rptr };
    }
    return result;
  }, [stats.summaryTable]);

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

const [barsReady, setBarsReady] = useState(false);
  useEffect(() => {
    setBarsReady(false);
    let r1: number, r2: number;
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setBarsReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [loading, isSearchMode, academicYearFilter, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, admStatusFilter]);

  // Cycle gender-card breakup display through courses
  useEffect(() => {
    if (!barsReady || isSearchMode) {
      setGenderBreakIdx(0);
      return;
    }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => setGenderBreakIdx((i) => (i + 1) % COURSES.length), 6000);
    }, 1200);
    return () => {
      clearTimeout(delayId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [barsReady, isSearchMode]);

  // Cycle bar chart through modes — depends only on isSearchMode so filter changes
  // don't reset the 10 s interval; barsReady is handled separately in chartBarsReady
  useEffect(() => {
    if (isSearchMode) { setBarChartMode(0); return; }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => setBarChartMode((m) => (m + 1) % 4), 10000);
    }, 1600);
    return () => { clearTimeout(delayId); if (intervalId !== null) clearInterval(intervalId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchMode]);

  // Re-animate bars whenever the chart mode changes or barsReady triggers
  useEffect(() => {
    setChartBarsReady(false);
    if (!barsReady) return;
    let r1: number, r2: number;
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setChartBarsReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [barsReady, barChartMode]);

  const confirmedActiveCount = useMemo(
    () => activeSource.filter((s) => s.admissionStatus === 'CONFIRMED').length,
    [activeSource]
  );
  const confirmedTotalCount = useMemo(
    () => allStudents.filter((s) => s.admissionStatus === 'CONFIRMED').length,
    [allStudents]
  );

  // Fee records for the date-wise admission table — scoped to the selected (or current) academic year
  const feeAcademicYear = (academicYearFilter || settings?.currentAcademicYear || null) as import('../types').AcademicYear | null;
  const { records: feeRecords } = useFeeRecords(feeAcademicYear);

  const dateTable = useMemo(() => {
    if (!feeRecords.length) return [];
    // Only count students visible under current filters (confirmed by default)
    const confirmedIds = new Set(
      (admStatusFilter ? filteredStudents : filteredStudents.filter((s) => s.admissionStatus === 'CONFIRMED'))
        .map((s) => s.id)
    );
    // Per student: keep only the earliest payment date (first installment)
    const firstPayment = new Map<string, { date: string; course: Course }>();
    for (const r of feeRecords) {
      if (!confirmedIds.has(r.studentId) || !r.date) continue;
      const existing = firstPayment.get(r.studentId);
      if (!existing || r.date < existing.date) {
        firstPayment.set(r.studentId, { date: r.date.split('T')[0], course: r.course });
      }
    }
    // Group by date → count per course
    const dateMap = new Map<string, Record<Course, number>>();
    for (const { date, course } of firstPayment.values()) {
      if (!dateMap.has(date)) dateMap.set(date, { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 });
      const row = dateMap.get(date)!;
      if (course in row) row[course as Course]++;
    }
    return Array.from(dateMap.entries())
      .map(([date, byCourse]) => ({
        date,
        byCourse,
        total: (Object.values(byCourse) as number[]).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [feeRecords, filteredStudents, admStatusFilter]);

  const admissionPendingStats = useMemo(() => {
    const currentYear = settings?.currentAcademicYear;
    if (!currentYear) return null;
    const pending = allStudents.filter((s) =>
      s.academicYear === currentYear &&
      !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')
    );
    const isLat = (s: Student) => s.priorQualification === 'ITI' || s.priorQualification === 'PUC';
    const byCourseRegular: Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    const byCourseLatear:  Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    for (const s of pending) {
      if (!(s.course in byCourseRegular)) continue;
      if (isLat(s)) byCourseLatear[s.course]++;
      else          byCourseRegular[s.course]++;
    }
    return {
      total:         pending.length,
      totalRegular:  pending.filter((s) => !isLat(s)).length,
      totalLateral:  pending.filter(isLat).length,
      byCourseRegular,
      byCourseLatear,
      academicYear: currentYear,
    };
  }, [allStudents, settings]);


  const hasNonSearchFilters =
    !!courseFilter || !!yearFilter || !!genderFilter ||
    !!categoryFilter || !!admTypeFilter || !!admCatFilter || !!admStatusFilter;

  const hasActiveFilters =
    !!inputValue || !!academicYearFilter || hasNonSearchFilters;

  useEffect(() => {
    if (hasNonSearchFilters) setShowFilters(true);
  }, [hasNonSearchFilters]);

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

  const greeting = (() => {
    const h = new Date().getHours();
    if (h >= 5  && h < 12) return 'Good Morning';
    if (h >= 12 && h < 17) return 'Good Afternoon';
    if (h >= 17 && h < 21) return 'Good Evening';
    return 'Good Night';
  })();

  // ── Live clock ───────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const clockDate = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const clockTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

  // ── Year chip palette (cycles if more than 5 academic years) ────────────
  const CHIP_PALETTE = [
    { dot: 'bg-emerald-400', selDot: 'bg-emerald-600', text: 'text-emerald-600', selText: 'text-emerald-800' },
    { dot: 'bg-sky-400',     selDot: 'bg-sky-600',     text: 'text-sky-600',     selText: 'text-sky-800'     },
    { dot: 'bg-violet-400',  selDot: 'bg-violet-600',  text: 'text-violet-600',  selText: 'text-violet-800'  },
    { dot: 'bg-amber-400',   selDot: 'bg-amber-600',   text: 'text-amber-600',   selText: 'text-amber-800'   },
    { dot: 'bg-rose-400',    selDot: 'bg-rose-600',    text: 'text-rose-600',    selText: 'text-rose-800'    },
  ] as const;

  // ── Nature palette colour map ────────────────────────────────────────────
  const courseConfig: Record<Course, { bg: string; border: string; textColor: string; barFill: string }> = {
    CE: { bg: 'bg-amber-50',   border: 'border-amber-400',   textColor: 'text-amber-700',   barFill: 'bg-amber-400'   },
    ME: { bg: 'bg-green-50',   border: 'border-green-400',   textColor: 'text-green-700',   barFill: 'bg-green-400'   },
    EC: { bg: 'bg-sky-50',     border: 'border-sky-400',     textColor: 'text-sky-700',     barFill: 'bg-sky-400'     },
    CS: { bg: 'bg-teal-50',    border: 'border-teal-400',    textColor: 'text-teal-700',    barFill: 'bg-teal-400'    },
    EE: { bg: 'bg-violet-50',  border: 'border-violet-400',  textColor: 'text-violet-700',  barFill: 'bg-violet-400'  },
  };

  // Subtle pastel card theme for the "By Course" tiles — light body, slightly darker header strip,
  // and a deep shade of the same hue for text (instead of plain black) so each card reads as one family.
  const courseCardTheme: Record<Course, { cardBg: string; headerBg: string; track: string; text: string; textMuted: string }> = {
    CE: { cardBg: 'bg-amber-100',  headerBg: 'bg-amber-200/80',  track: 'bg-amber-900/10',  text: 'text-amber-950',  textMuted: 'text-amber-950/50'  },
    ME: { cardBg: 'bg-green-100',  headerBg: 'bg-green-200/80',  track: 'bg-green-900/10',  text: 'text-green-950',  textMuted: 'text-green-950/50'  },
    EC: { cardBg: 'bg-sky-100',    headerBg: 'bg-sky-200/80',    track: 'bg-sky-900/10',    text: 'text-sky-950',    textMuted: 'text-sky-950/50'    },
    CS: { cardBg: 'bg-teal-100',   headerBg: 'bg-teal-200/80',   track: 'bg-teal-900/10',   text: 'text-teal-950',   textMuted: 'text-teal-950/50'   },
    EE: { cardBg: 'bg-violet-100', headerBg: 'bg-violet-200/80', track: 'bg-violet-900/10', text: 'text-violet-950', textMuted: 'text-violet-950/50' },
  };

  // Hero-style theme for the dedicated Lateral / Repeater / SNQ admission-type cards — modeled on
  // the "Total Enrolled" tile (solid dark header strip + light body) so the trio reads as a
  // distinct, higher-emphasis set inside the otherwise compact "By Year of Study" / "By Course" rows.
  const admTypeCardTheme: Record<'LATERAL' | 'REPEATER' | 'SNQ', { bodyBg: string; headerBg: string; headerText: string; numColor: string; trackColor: string; barColor: string }> = {
    LATERAL:  { bodyBg: '#D8BFD8', headerBg: '#563C5C', headerText: '#D8BFD8', numColor: '#563C5C', trackColor: '#C7A8C7', barColor: '#8C5F8C' },
    REPEATER: { bodyBg: '#F8F4EF', headerBg: '#40434E', headerText: '#F8F4EF', numColor: '#40434E', trackColor: '#ECE5D8', barColor: '#7B7F8C' },
    SNQ:      { bodyBg: '#FBEEDC', headerBg: '#8A5A22', headerText: '#FBEEDC', numColor: '#8A5A22', trackColor: '#F0DDBB', barColor: '#B9812E' },
  };

  // Shared adm-type key/label maps for the hero tiles + their detail modal (LATERAL/REPEATER match
  // on admType; SNQ matches on admCat — see courseAdmTotals / stats.summaryTable classification).
  const ADM_TYPE_ADM_KEY: Record<'LATERAL' | 'REPEATER' | 'SNQ', 'ltrl' | 'rptr' | 'snq'> = { LATERAL: 'ltrl', REPEATER: 'rptr', SNQ: 'snq' };
  const ADM_TYPE_LABEL: Record<'LATERAL' | 'REPEATER' | 'SNQ', string> = { LATERAL: 'Lateral', REPEATER: 'Repeater', SNQ: 'SNQ' };

  const yearConfig: Record<Year, { label: string; bg: string; border: string; textColor: string; barFill: string }> = {
    '1ST YEAR': { label: '1st Year', bg: 'bg-lime-50',     border: 'border-lime-400',     textColor: 'text-lime-700',     barFill: 'bg-lime-400'     },
    '2ND YEAR': { label: '2nd Year', bg: 'bg-emerald-50',  border: 'border-emerald-400',  textColor: 'text-emerald-700',  barFill: 'bg-emerald-400'  },
    '3RD YEAR': { label: '3rd Year', bg: 'bg-teal-50',     border: 'border-teal-400',     textColor: 'text-teal-700',     barFill: 'bg-teal-400'     },
  };

  // Card palette for "By Year of Study" tiles — styled like the Boys/Girls cards
  // (pale tint background, light border, saturated bar accent, deep text colour),
  // one distinct palette per year sourced from the requested colour swatches.
  const yearCardTheme: Record<Year, { bg: string; border: string; bar: string; text: string; totalLabel: string; subText: string; track: string }> = {
    '1ST YEAR': { bg: '#FDF3F6', border: '#F2C4CE', bar: '#E17FA0', text: '#062045', totalLabel: '#7C6B85', subText: '#8B7A94', track: '#F8DEE5' },
    '2ND YEAR': { bg: '#F8F4FF', border: '#E1D2FF', bar: '#B79CE0', text: '#5E4075', totalLabel: '#8B76A3', subText: '#93839F', track: '#EDE1FF' },
    '3RD YEAR': { bg: '#FFF9F2', border: '#FFDDAF', bar: '#FFA657', text: '#B05F1D', totalLabel: '#C08A52', subText: '#C79A6B', track: '#FFE9CC' },
  };


  if (loading) return <LoadingGate />;

  return (
    <>
    <div className="flex flex-col gap-1.5" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* ── Top panel: header → year chips (uniform bg, merges into search toolbar below) ── */}
      <div className="-mx-4 -mt-4 px-4 pt-4 pb-2 flex flex-col gap-1.5" style={{ background: 'linear-gradient(160deg, #f4fdf9 0%, #f8fafc 45%, #f0fdf6 100%)', borderBottom: '1px solid rgba(16,185,129,0.10)' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4">
        {/* Left: accent bar + greeting/title */}
        <div className="flex items-center gap-2.5">
          <div className="w-[3px] h-7 rounded-full bg-emerald-400 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500/70 leading-none">{greeting}</p>
            <h2 className="text-xl font-black text-gray-800 leading-none tracking-tight mt-px">Dashboard</h2>
          </div>
        </div>

        {/* Right: enroll button + separator + date/time */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => void navigate('/enroll')}
            className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            style={{ boxShadow: '0 2px 8px 0 rgba(16,185,129,0.35)' }}
            title="Enroll Student"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <div className="h-7 w-px bg-emerald-200 shrink-0" />
          <div className="shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-500/70 leading-none">{clockDate}</p>
            <p className="text-xl font-black text-gray-800 leading-none mt-px tabular-nums">{clockTime}</p>
          </div>
        </div>
      </div>

      </div>{/* end top panel */}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="sticky -top-4 z-20 -mx-4 -mt-1.5 px-4 pt-1.5 pb-1.5" style={{ background: 'linear-gradient(160deg, #f4fdf9 0%, #f8fafc 45%, #f0fdf6 100%)', boxShadow: '0 4px 10px -2px rgba(16,185,129,0.09)' }}>
        {/* Single row: search + inline filters + actions */}
        <div className="flex items-center gap-2">
          <div className="relative shrink-0 w-52">
            {/* Search icon */}
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              className={`w-full rounded-full border border-emerald-300 py-2 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 bg-white shadow-sm text-gray-800 placeholder:text-gray-400 placeholder:font-normal transition-all duration-150 pl-8 ${inputValue ? 'pr-8' : 'pr-3'}`}
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => setInputValue('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-amber-400 hover:bg-amber-500 text-white transition-colors duration-150 shrink-0"
                aria-label="Clear search"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <>
              <span className="w-px h-5 bg-emerald-200 shrink-0" />
              <button
                onClick={clearFilters}
                className="shrink-0 rounded-full border border-amber-300 px-2.5 py-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer transition-colors font-semibold whitespace-nowrap"
              >
                Clear
              </button>
            </>
          )}

          {/* Inline collapsible filter selects — expand between search and right actions */}
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
                  <FilterDropdown<Course | ''>
                    value={courseFilter}
                    onChange={(v) => setCourseFilter(v as Course | '')}
                    placeholder="Course"
                    options={COURSES.map((c) => ({ value: c, label: c }))}
                  />
                  <FilterDropdown<Year | ''>
                    value={yearFilter}
                    onChange={(v) => setYearFilter(v as Year | '')}
                    placeholder="Study Yr"
                    options={YEARS.map((yr) => ({ value: yr, label: yr }))}
                  />
                  <FilterDropdown<Gender | ''>
                    value={genderFilter}
                    onChange={(v) => setGenderFilter(v as Gender | '')}
                    placeholder="Gender"
                    options={[
                      { value: 'BOY', label: 'BOY' },
                      { value: 'GIRL', label: 'GIRL' },
                    ]}
                  />
                  <FilterDropdown<Category | ''>
                    value={categoryFilter}
                    onChange={(v) => setCategoryFilter(v as Category | '')}
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
                  <FilterDropdown<AdmType | ''>
                    value={admTypeFilter}
                    onChange={(v) => setAdmTypeFilter(v as AdmType | '')}
                    placeholder="Adm Type"
                    options={[
                      { value: 'REGULAR', label: 'REGULAR' },
                      { value: 'REPEATER', label: 'REPEATER' },
                      { value: 'LATERAL', label: 'LATERAL' },
                      { value: 'EXTERNAL', label: 'EXTERNAL' },
                    ]}
                  />
                  <FilterDropdown<AdmCat | ''>
                    value={admCatFilter}
                    onChange={(v) => setAdmCatFilter(v as AdmCat | '')}
                    placeholder="Adm Cat"
                    options={[
                      { value: 'GM', label: 'GM' },
                      { value: 'SNQ', label: 'SNQ' },
                      { value: 'OTHERS', label: 'OTHERS' },
                    ]}
                  />
                  <FilterDropdown<'' | 'CONFIRMED' | 'CANCELLED' | 'PENDING'>
                    value={admStatusFilter as '' | 'CONFIRMED' | 'CANCELLED' | 'PENDING'}
                    onChange={(v) => setAdmStatusFilter(v)}
                    placeholder="Status"
                    options={[
                      { value: 'CONFIRMED', label: 'CONFIRMED' },
                      { value: 'CANCELLED', label: 'CANCELLED' },
                      { value: 'PENDING', label: 'PENDING' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>

          {!isSearchMode && academicYearFilter && (
            <button
              onClick={() => setSummaryModal(true)}
              className="flex items-center gap-1.5 group cursor-pointer shrink-0"
              title="View Summary"
            >
              <span className="w-1 h-3.5 rounded-full shrink-0 bg-emerald-400 group-hover:bg-emerald-600 transition-colors" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 group-hover:text-emerald-800 transition-colors">Summary</span>
            </button>
          )}

          {/* Pending Admissions label */}
          {admissionPendingStats && (
            <button
              onClick={() => void navigate('/admissions')}
              className="flex items-center gap-1.5 group cursor-pointer shrink-0"
              title="View Pending Admissions"
            >
              <span className="w-1 h-3.5 rounded-full shrink-0 bg-amber-400 group-hover:bg-amber-600 transition-colors" />
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 group-hover:text-amber-800 transition-colors">Pending</span>
              <span className="text-xs font-black tabular-nums text-amber-700">
                <AnimNum value={admissionPendingStats.totalRegular + admissionPendingStats.totalLateral} />
              </span>
            </button>
          )}

          {/* Chips toggle */}
          {allStudents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowChips((v) => { const next = !v; localStorage.setItem('smp_chips_visible', String(next)); return next; })}
              className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
                showChips
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-600'
                  : 'border-emerald-200 text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600'
              }`}
              title="Toggle year chips"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>
          )}

          {/* Stats pills toggle */}
          {!isSearchMode && (
            <button
              type="button"
              onClick={() => setShowStatsPills((v) => { const next = !v; localStorage.setItem('smp_statspills_visible', String(next)); return next; })}
              className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
                showStatsPills
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-600'
                  : 'border-emerald-200 text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600'
              }`}
              title="Toggle stats tables"
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
            onClick={() => setShowFilters((v) => !v)}
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters || hasNonSearchFilters
                ? 'bg-emerald-100 border-emerald-300 text-emerald-600'
                : 'border-emerald-200 text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Collapsible year chips row ──────────────────────────────── */}
        {allStudents.length > 0 && (
          <div
            className="grid"
            style={{
              gridTemplateRows: showChips ? '1fr' : '0fr',
              opacity: showChips ? 1 : 0,
              transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 pt-1.5 pb-0.5 px-px">
                {/* Total */}
                <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  <span className="w-1 h-3.5 rounded-full shrink-0 bg-emerald-400" />
                  <span className="text-[13px] font-semibold uppercase tracking-wider text-emerald-700">Total</span>
                  <span className="text-[13px] font-bold tabular-nums text-emerald-800">
                    <AnimNum value={confirmedActiveCount} />
                  </span>
                  {confirmedActiveCount < confirmedTotalCount && (
                    <span className="text-[13px] text-emerald-500/60 font-medium">/{confirmedTotalCount}</span>
                  )}
                </div>

                {/* Arrow controls */}
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => scrollChips('left')}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer text-lg leading-none select-none"
                    aria-label="Scroll left"
                  >‹</button>
                  <button
                    type="button"
                    onClick={() => scrollChips('right')}
                    className="w-6 h-6 flex items-center justify-center rounded-full text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer text-lg leading-none select-none"
                    aria-label="Scroll right"
                  >›</button>
                </div>

                <span className="w-px h-3.5 rounded-full bg-emerald-200 shrink-0" />

                {/* Per-year chips — scrollable */}
                <div ref={chipsScrollRef} className="chips-scroll flex items-center gap-4 flex-1 overflow-x-auto no-scrollbar">
                  {activeStats.map(({ year, count }, idx) => {
                    const isSelected = !isSearchMode && academicYearFilter === year;
                    const isDimmed = count === 0;
                    const p = CHIP_PALETTE[idx % CHIP_PALETTE.length];
                    return (
                      <button
                        key={year}
                        type="button"
                        disabled={isSearchMode}
                        onClick={() => setAcademicYearFilter(isSelected ? '' : year as AcademicYear)}
                        className={`flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-opacity ${
                          isSearchMode ? 'cursor-default' : 'cursor-pointer'
                        } ${isDimmed ? 'opacity-30' : ''}`}
                      >
                        <span className={`w-1 h-3.5 rounded-full shrink-0 transition-colors ${isDimmed ? 'bg-gray-300' : isSelected ? p.selDot : p.dot}`} />
                        <span className={`text-[13px] font-semibold uppercase tracking-wider transition-colors ${isDimmed ? 'text-gray-400' : isSelected ? p.selText : p.text}`}>{year}</span>
                        <span className={`text-[13px] font-bold tabular-nums transition-colors ${isDimmed ? 'text-gray-300' : isSelected ? p.selText : 'text-gray-500'}`}>
                          <AnimNum value={count} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Collapsible stats pills row ─────────────────────────────── */}
        {!isSearchMode && (
          <div
            className="grid"
            style={{
              gridTemplateRows: showStatsPills ? '1fr' : '0fr',
              opacity: showStatsPills ? 1 : 0,
              transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div className="overflow-hidden">
              <div className="flex items-center gap-2 pt-1.5 pb-0.5 px-px flex-wrap">
                {([
                  { label: 'Category-wise',  border: 'border-emerald-300', bg: 'bg-emerald-50', text: 'text-emerald-700', fn: () => setCatModal(true)      },
                  { label: 'Adm Type-wise',  border: 'border-sky-300',     bg: 'bg-sky-50',     text: 'text-sky-700',     fn: () => setAdmTypeModal(true)  },
                  { label: 'Cat & Gender',   border: 'border-rose-300',    bg: 'bg-rose-50',    text: 'text-rose-600',    fn: () => setCatGenderModal(true) },
                  { label: 'Year & Gender',  border: 'border-teal-300',    bg: 'bg-teal-50',    text: 'text-teal-700',    fn: () => setYearGenderModal(true)},
                  { label: 'Date-wise Adm',  border: 'border-violet-300',  bg: 'bg-violet-50',  text: 'text-violet-700',  fn: () => setDateWiseModal(true) },
                ] as const).map(({ label, border, bg, text, fn }) => (
                  <button
                    key={label}
                    onClick={fn}
                    className={`group flex items-center gap-1.5 rounded-full border ${border} ${bg} px-3 py-1 cursor-pointer hover:bg-white/80 transition-colors`}
                  >
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${text}`}>{label}</span>
                    <svg className={`w-2.5 h-2.5 ${text} opacity-40 group-hover:opacity-80 transition-opacity`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M7 17L17 7M7 7h10v10"/>
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex items-center justify-center h-32 text-sm text-red-500">{error}</div>
      ) : isSearchMode ? (

        /* ── Search results ─────────────────────────────────────────── */
        <div className="space-y-3 pb-4">
          {studentGroups.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              No students found.
            </div>
          ) : (
            <>
            {studentGroups.length > 10 && (
              <p className="text-xs text-gray-400 px-1">
                Showing first 10 of {studentGroups.length} matches — refine your search to narrow results.
              </p>
            )}
            {studentGroups.slice(0, 10).map((group, idx) => (
              <div key={group.key} className="bg-white/90 rounded-2xl border border-emerald-200 overflow-hidden" style={{ boxShadow: '0 2px 6px 0 rgba(0,0,0,0.07)', animation: `content-enter 0.2s ease-out ${Math.min(idx * 0.03, 0.3)}s both` }}>
                <div className="px-4 py-3 border-b border-emerald-100 flex items-baseline gap-3 flex-wrap" style={{ background: 'linear-gradient(90deg, #ecfdf5, #f8fafc)' }}>
                  <span className="font-bold text-gray-900 text-base">
                    {group.nameSSLC}
                    {group.fatherName && (
                      <span className="font-normal text-gray-500 text-sm"> {group.gender === 'BOY' ? 'S/o' : 'D/o'} {group.fatherName}</span>
                    )}
                  </span>
                  {group.nameAadhar && group.nameAadhar !== group.nameSSLC && (
                    <span className="text-sm text-gray-500">({group.nameAadhar})</span>
                  )}
                  <span className="text-sm text-gray-500">DOB: {group.dob || '—'}</span>
                  <div className="ml-auto flex items-center gap-3 shrink-0">
                    {!searchFeeLoading && (() => {
                      const due = searchGroupDue.get(group.key);
                      if (due === undefined) return null;
                      if (due === 'unavailable') return (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-400">
                          Fee records unavailable
                        </span>
                      );
                      if (due === null) return (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-400">
                          Fee structure not set
                        </span>
                      );
                      return due > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-bold text-red-600 tabular-nums">
                          Due ₹{due.toLocaleString()}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                          ✓ No Dues
                        </span>
                      );
                    })()}
                    <span className="text-sm text-emerald-600 font-semibold">
                      {group.records.length} enrollment{group.records.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm divide-y divide-emerald-100">
                    <thead className="bg-emerald-50/70">
                      <tr>
                        {['Acad Year', 'Study Year', 'Course', 'Reg No', 'Cat', 'Adm Type', 'Adm Cat', 'Status', 'Mobile', 'Actions'].map((h) => (
                          <th key={h} className={`px-3 py-2.5 text-xs font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap ${h === 'Actions' ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100">
                      {group.records.map((s) => (
                        <tr
                          key={s.id}
                          className={`transition-colors cursor-context-menu ${ctxMenu?.student.id === s.id ? 'row-ctx-active' : 'hover:bg-emerald-50/50'}`}
                          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, student: s }); }}
                        >
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{s.academicYear}</td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{s.year}</td>
                          <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{s.course}</td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{s.regNumber || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{s.category || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{s.admType || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{s.admCat || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass(s.admissionStatus)}`}>
                              {s.admissionStatus || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{s.studentMobile || s.fatherMobile || '—'}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-right">
                            <div className="flex gap-1.5 justify-end">
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
                              {isAdmin && (() => {
                                const feeStatus = searchFeeLoading ? null : (searchFeeStatus.get(s.id) ?? 'collect');
                                const baseClass = 'inline-flex items-center justify-center w-[98px] py-1 rounded-lg text-xs font-semibold border transition-colors shadow-sm';
                                if (feeStatus === 'no-dues') {
                                  return (
                                    <span className={`${baseClass} text-emerald-700 bg-emerald-50 border-emerald-200 cursor-default`}>
                                      No Dues
                                    </span>
                                  );
                                }
                                return (
                                  <button
                                    onClick={() => setCollectFeeStudent(s)}
                                    className={`${baseClass} text-white border-transparent ${
                                      feeStatus === 'dues'
                                        ? 'bg-amber-500 hover:bg-amber-600'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                                  >
                                    {feeStatus === 'dues' ? 'Collect Dues' : 'Collect Fee'}
                                  </button>
                                );
                              })()}
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
        <div className="pb-4 -mx-2 px-2">
          <div className="space-y-3 min-w-0 mt-1">

            {/* Overview row — hero tiles (Total / Course chart) span wider than the secondary Boys/Girls tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Total card */}
              <div
                onClick={() => setTotalModal(true)}
                className="col-span-2 rounded-2xl border border-black/10 flex flex-col relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]"
                style={{ background: '#E1F9F4', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
              >
                {/* Elegant header — solid teal, separated by a hairline */}
                <div
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-black/10 cursor-pointer select-none"
                  style={{ background: '#018081' }}
                  onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents, displayYear, 'All Courses — Admission Type-wise Count'); }}
                  title="Double-click to export PDF"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#E1F9F4' }} />
                    <p className="text-[13px] font-bold uppercase tracking-wider" style={{ color: '#E1F9F4' }}>Total Enrolled</p>
                  </div>
                  <span className="text-[10px] font-bold tabular-nums whitespace-nowrap" style={{ color: '#E1F9F4', opacity: 0.7 }}>{displayYear}</span>
                </div>

                {/* Body — big total on the left, compact gender/year breakdown filling the rest */}
                <div className="flex-1 flex items-stretch px-3.5 py-3 gap-3.5">
                  <div className="flex flex-col justify-center shrink-0">
                    <p className="text-4xl font-black leading-none tabular-nums" style={{ color: '#018081' }}>
                      <AnimNum value={stats.total} />
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: '#018081', opacity: 0.7 }}>Confirmed</p>
                  </div>

                  <div className="w-px bg-black/15 shrink-0" />

                  <div className="flex-1 flex items-center justify-between gap-1 min-w-0">
                    {[
                      { label: 'Boys',   value: stats.boys },
                      { label: 'Girls',  value: stats.girls },
                      { label: '1st Yr', value: stats.byYear['1ST YEAR'] },
                      { label: '2nd Yr', value: stats.byYear['2ND YEAR'] },
                      { label: '3rd Yr', value: stats.byYear['3RD YEAR'] },
                    ].map((item) => (
                      <div key={item.label} className="flex flex-col items-center gap-0.5 min-w-0">
                        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: '#018081', opacity: 0.7 }}>{item.label}</span>
                        <span className="text-lg font-black leading-none tabular-nums" style={{ color: '#018081' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Course bar chart — intake-based */}
              {(() => {
                const INTAKE = 63;
                const YEAR_INTAKE = INTAKE * COURSES.length;           // 315 per year
                const TOTAL_INTAKE = YEAR_INTAKE * YEARS.length;       // 945 overall
                const overallPct = Math.round((stats.total / TOTAL_INTAKE) * 100);
                const BAR_H = 44; // px — usable bar area
                return (
                  <div
                    onClick={() => setIntakeModal(true)}
                    className="col-span-2 rounded-2xl border px-3.5 pt-3.5 pb-2 flex flex-col relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]"
                    style={{ background: '#F5F3EC', borderColor: '#DCE3CB', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                  >
                    {/* Label (left) + year breakdown (right) */}
                    <div className="flex items-center justify-between mb-1.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-3.5 rounded-full shrink-0" style={{ background: '#A8C686' }} />
                        <p className="text-[13px] font-semibold uppercase tracking-wider leading-none" style={{ color: '#5D7042' }}>Total</p>
                        <span className="text-[13px] font-black tabular-nums leading-none" style={{ color: '#5D7042' }}>{overallPct}%</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        {YEARS.map((yr, i) => {
                          const yrPct = Math.round((stats.byYear[yr] / YEAR_INTAKE) * 100);
                          return (
                            <span key={yr} className="flex items-baseline gap-0.5">
                              <span className="text-[9px] font-semibold leading-none" style={{ color: '#9CAF88' }}>{i + 1}Y</span>
                              <span className="text-[11px] font-bold tabular-nums leading-none" style={{ color: '#5D7042' }}>{yrPct}%</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    {/* Bars + count labels */}
                    {(() => {
                      const maxCourseCount = Math.max(1, ...COURSES.map((c) => stats.byCourse[c]));
                      return (
                        <div className="flex items-end gap-1 flex-1" style={{ height: 58 }}>
                          {COURSES.map((course, i) => {
                            const count = stats.byCourse[course];
                            const barH = count > 0 ? Math.max(3, Math.round((count / maxCourseCount) * BAR_H)) : 0;
                            return (
                              <div key={course} className="flex-1 flex flex-col justify-end items-center" style={{ height: 58 }}>
                                <span
                                  className="text-[10px] font-bold tabular-nums leading-none mb-0.5"
                                  style={{
                                    color: '#5D7042',
                                    opacity: barsReady ? 1 : 0,
                                    transition: barsReady ? `opacity 400ms ease-out ${i * 80 + 450}ms` : 'none',
                                  }}
                                >
                                  {count}
                                </span>
                                <div
                                  style={{
                                    height: barH,
                                    width: '100%',
                                    background: '#A8C686',
                                    borderRadius: '3px 3px 0 0',
                                    transformOrigin: 'bottom',
                                    transform: barsReady ? 'scaleY(1)' : 'scaleY(0)',
                                    transition: barsReady ? `transform 700ms cubic-bezier(0.34,1.56,0.64,1)` : 'none',
                                    transitionDelay: barsReady ? `${i * 80}ms` : '0ms',
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {/* Course label + intake % */}
                    <div className="flex gap-1 pt-1.5 shrink-0">
                      {COURSES.map((course) => {
                        return (
                          <div key={course} className="flex-1 flex flex-col items-center">
                            <span className="text-[9px] font-bold leading-none" style={{ color: '#9CAF88' }}>{course}</span>
                          </div>
                        );
                      })}
                    </div>


                  </div>
                );
              })()}
              {/* Boys card */}
              {(() => {
                const boysTotal = stats.boys;
                const boysPct = stats.total > 0 ? Math.round((boysTotal / stats.total) * 100) : 0;
                const boysBreakCourse = COURSES[genderBreakIdx];
                const boysBreakVal = genderCourseTotals['BOY'][boysBreakCourse];
                return (
                  <div
                    onClick={() => setGenderModal('BOY')}
                    onDoubleClick={(e) => { e.stopPropagation(); exportGenderCourseYearReport(confirmedStudents.filter((s) => s.gender === 'BOY'), displayYear, 'Boys — Year & Course Breakdown', 'sky'); }}
                    className="rounded-2xl border p-3.5 flex flex-col gap-1 relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]"
                    style={{ background: '#F1FAFE', borderColor: '#BEE3F2', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full shrink-0" style={{ background: '#0096C7' }} />
                      <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: '#026C8C' }}>Boys</p>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold leading-none" style={{ color: '#4C93AC' }}>Total</span>
                        <p className="text-3xl font-black leading-none" style={{ color: '#026C8C' }}><AnimNum value={boysTotal} /></p>
                      </div>
                      <div className="flex flex-col gap-0.5 items-center w-16 shrink-0 opacity-[0.42]">
                        <SlotTicker label={boysBreakCourse} value={boysBreakVal} textColor="text-[#026C8C]" />
                      </div>
                    </div>
                    <div className="mt-auto pt-1.5 space-y-1">
                      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#D7EEF7' }}>
                        <div
                          className="h-full w-full rounded-full"
                          style={{
                            background: '#0096C7',
                            transformOrigin: "left",
                            transform: barsReady ? `scaleX(${boysPct / 100})` : 'scaleX(0)',
                            transition: barsReady ? 'transform 800ms cubic-bezier(0.4,0,0.2,1)' : 'none',
                          }}
                        />
                      </div>
                      <p className="text-xs" style={{ color: '#6FA6BC' }}>{stats.total > 0 ? `${boysPct}% of total` : '—'}</p>
                    </div>
                  </div>
                );
              })()}
              {/* Girls card */}
              {(() => {
                const girlsTotal = stats.girls;
                const girlsPct = stats.total > 0 ? Math.round((girlsTotal / stats.total) * 100) : 0;
                const girlsBreakCourse = COURSES[genderBreakIdx];
                const girlsBreakVal = genderCourseTotals['GIRL'][girlsBreakCourse];
                return (
                  <div
                    onClick={() => setGenderModal('GIRL')}
                    onDoubleClick={(e) => { e.stopPropagation(); exportGenderCourseYearReport(confirmedStudents.filter((s) => s.gender === 'GIRL'), displayYear, 'Girls — Year & Course Breakdown', 'rose'); }}
                    className="rounded-2xl border p-3.5 flex flex-col gap-1 relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]"
                    style={{ background: '#FFFDF7', borderColor: '#EFDCFF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full shrink-0" style={{ background: '#E3B5FF' }} />
                      <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: '#9B4FD9' }}>Girls</p>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold leading-none" style={{ color: '#C08CE8' }}>Total</span>
                        <p className="text-3xl font-black leading-none" style={{ color: '#9B4FD9' }}><AnimNum value={girlsTotal} /></p>
                      </div>
                      <div className="flex flex-col gap-0.5 items-center w-16 shrink-0 opacity-[0.42]">
                        <SlotTicker label={girlsBreakCourse} value={girlsBreakVal} textColor="text-[#9B4FD9]" />
                      </div>
                    </div>
                    <div className="mt-auto pt-1.5 space-y-1">
                      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#F3E4FF' }}>
                        <div
                          className="h-full w-full rounded-full"
                          style={{
                            background: '#E3B5FF',
                            transformOrigin: "left",
                            transform: barsReady ? `scaleX(${girlsPct / 100})` : 'scaleX(0)',
                            transition: barsReady ? 'transform 800ms cubic-bezier(0.4,0,0.2,1)' : 'none',
                          }}
                        />
                      </div>
                      <p className="text-xs" style={{ color: '#C9A6E6' }}>{stats.total > 0 ? `${girlsPct}% of total` : '—'}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* By Course */}
            <div>
              <SectionLabel accent={{ bar: 'bg-emerald-500', text: 'text-emerald-700' }} onDoubleClick={() => exportSummaryReport(confirmedStudents, displayYear)}>By Course</SectionLabel>
              <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
                {COURSES.map((course) => {
                  const courseTotal = stats.byCourse[course];
                  const theme = courseCardTheme[course];
                  return (
                    <div
                      key={course}
                      onClick={() => setCourseModalCourse(course)}
                      className={`rounded-2xl border border-black/10 ${theme.cardBg} flex flex-col relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]`}
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                    >
                      {/* Course badge — rounded label circle, top-left corner + total count */}
                      <div className="flex items-center justify-between px-3.5 pt-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center border border-black/10 ${theme.headerBg} cursor-pointer select-none shrink-0`}
                          onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents.filter((s) => s.course === course), displayYear, `${course} — Admission Type-wise Count`, COURSE_PDF_THEME[course]); }}
                          title="Double-click to export PDF"
                        >
                          <span className={`text-sm font-black uppercase tracking-wide ${theme.text}`}>{course}</span>
                        </div>
                        <p className={`text-2xl font-black leading-none tabular-nums ${theme.text}`}><AnimNum value={courseTotal} /></p>
                      </div>

                      {/* Body — year-wise counts, plain rows like the Pending Seats cards (no rings) */}
                      <div className="flex-1 px-3.5 pt-2 pb-2.5 flex flex-col relative z-10">
                        <div className="mt-auto flex flex-col">
                          {YEARS.map((yr, i) => (
                            <div key={yr} className={`flex items-center justify-between gap-1 ${i > 0 ? 'pt-1.5 mt-1.5 border-t border-black/10' : ''}`}>
                              <span className={`text-[10px] font-bold uppercase tracking-wide ${theme.textMuted}`}>{i + 1}Y</span>
                              <span className={`text-lg font-black leading-none tabular-nums ${theme.text}`}>{stats.byCourseByYear[course][yr]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* SNQ — hero-style tile (year & course-wise), modeled on the Lateral / Repeater tiles */}
                {(() => {
                  const key = 'SNQ' as const;
                  const admKey = ADM_TYPE_ADM_KEY[key];
                  const label = ADM_TYPE_LABEL[key];
                  const theme = admTypeCardTheme[key];
                  const total = COURSES.reduce((a, c) => a + courseAdmTotals[c][admKey], 0);
                  const pct = stats.total > 0 ? Math.round((total / stats.total) * 100) : 0;
                  return (
                    <div
                      key={key}
                      onClick={() => setAdmTypeDetailModal(key)}
                      className="col-span-2 rounded-2xl border border-black/10 flex flex-col relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]"
                      style={{ background: theme.bodyBg, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                    >
                      {/* Solid header strip — mirrors the Total Enrolled tile */}
                      <div
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-black/10 cursor-pointer select-none"
                        style={{ background: theme.headerBg }}
                        onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents.filter((s) => s.admCat === 'SNQ'), displayYear, `${label} — Year & Course-wise Count`); }}
                        title="Double-click to export PDF"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: theme.headerText }} />
                          <p className="text-[13px] font-bold uppercase tracking-wider" style={{ color: theme.headerText }}>{label}</p>
                        </div>
                        <span className="text-[10px] font-bold tabular-nums whitespace-nowrap" style={{ color: theme.headerText, opacity: 0.7 }}>{pct}% of total</span>
                      </div>

                      {/* Body — total on the left, year × course table filling the rest */}
                      <div className="flex-1 flex items-stretch px-3.5 py-3 gap-3">
                        <div className="flex flex-col justify-center shrink-0">
                          <p className="text-4xl font-black leading-none tabular-nums" style={{ color: theme.numColor }}><AnimNum value={total} /></p>
                          <p className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: theme.numColor, opacity: 0.7 }}>Total</p>
                        </div>
                        <div className="w-px bg-black/15 shrink-0" />
                        <div className="flex-1 flex flex-col justify-end gap-1 min-w-0">
                          {/* Course header row */}
                          <div className="grid items-center gap-x-1" style={{ gridTemplateColumns: '24px repeat(5, 1fr)' }}>
                            <span />
                            {COURSES.map((course) => (
                              <span key={course} className="text-[9px] font-bold uppercase tracking-wide text-center" style={{ color: theme.numColor, opacity: 0.55 }}>{course}</span>
                            ))}
                          </div>
                          {/* Year rows */}
                          {YEARS.map((yr, i) => (
                            <div key={yr} className="grid items-center gap-x-1" style={{ gridTemplateColumns: '24px repeat(5, 1fr)' }}>
                              <span className="text-[9px] font-semibold" style={{ color: theme.numColor, opacity: 0.55 }}>{i + 1}Y</span>
                              {COURSES.map((course) => {
                                const v = stats.summaryTable[yr]?.[course]?.[admKey] ?? 0;
                                return (
                                  <span key={course} className="text-[12px] font-bold tabular-nums text-center" style={{ color: theme.numColor }}>
                                    {v === 0 ? '·' : v}
                                  </span>
                                );
                              })}
                            </div>
                          ))}
                          {/* Total row */}
                          <div className="grid items-center gap-x-1 pt-1 mt-0.5 border-t" style={{ gridTemplateColumns: '24px repeat(5, 1fr)', borderColor: theme.trackColor }}>
                            <span className="text-[9px] font-bold" style={{ color: theme.numColor, opacity: 0.7 }}>Σ</span>
                            {COURSES.map((course) => {
                              const v = courseAdmTotals[course][admKey];
                              return (
                                <span key={course} className="text-[12px] font-black tabular-nums text-center" style={{ color: theme.numColor }}>
                                  {v === 0 ? '·' : v}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* By Year of Study */}
            <div>
              <SectionLabel accent={{ bar: 'bg-teal-500', text: 'text-teal-700' }} onDoubleClick={() => exportSummaryReport(confirmedStudents, displayYear)}>By Year of Study</SectionLabel>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                {YEARS.map((year) => {
                  const theme = yearCardTheme[year];
                  const yearTotal = stats.byYear[year];
                  const yearPct = Math.round((yearTotal / YEAR_INTAKE) * 100);
                  const yrShort = year === '1ST YEAR' ? '1st Yr' : year === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
                  const maxCourseCount = Math.max(1, ...COURSES.map((c) => stats.byYearByCourse[year][c]));
                  return (
                    <div
                      key={year}
                      onClick={() => setYearModalYear(year)}
                      onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents.filter((s) => s.year === year), displayYear, `${yrShort} — Admission Type-wise Count`, YEAR_PDF_THEME[year]); }}
                      className="rounded-2xl border p-3.5 flex flex-col gap-2.5 relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]"
                      style={{ background: theme.bg, borderColor: theme.border, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                      title="Double-click to export PDF"
                    >
                      {/* Label */}
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-3.5 rounded-full shrink-0" style={{ background: theme.bar }} />
                        <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: theme.text }}>{yrShort}</p>
                      </div>

                      {/* Total + share ring */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold leading-none" style={{ color: theme.totalLabel }}>Total</span>
                          <p className="text-3xl font-black leading-none" style={{ color: theme.text }}><AnimNum value={yearTotal} /></p>
                        </div>
                        <SeatRing pct={yearPct} color={theme.bar} ready={barsReady} size={44} stroke={4} />
                      </div>

                      {/* Course-wise mini bar chart — fills the remaining space */}
                      <div className="mt-auto pt-1 flex items-end gap-1.5" style={{ height: 46 }}>
                        {COURSES.map((course, i) => {
                          const count = stats.byYearByCourse[year][course];
                          const barH = count > 0 ? Math.max(3, Math.round((count / maxCourseCount) * 30)) : 0;
                          return (
                            <div key={course} className="flex-1 flex flex-col items-center justify-end gap-0.5" style={{ height: 46 }}>
                              <span className="text-[9px] font-bold tabular-nums leading-none" style={{ color: theme.text }}>{count}</span>
                              <div
                                className="w-full rounded-t-[3px]"
                                style={{
                                  height: barH,
                                  background: theme.bar,
                                  transformOrigin: 'bottom',
                                  transform: barsReady ? 'scaleY(1)' : 'scaleY(0)',
                                  transition: barsReady ? `transform 600ms cubic-bezier(0.34,1.56,0.64,1) ${i * 60}ms` : 'none',
                                }}
                              />
                              <span className="text-[8px] font-semibold leading-none" style={{ color: theme.subText }}>{course}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Lateral / Repeater — hero-style tiles (year & course-wise), modeled on the Total Enrolled tile */}
                {([
                  { key: 'LATERAL' as const, admKey: 'ltrl' as const, label: 'Lateral' },
                  { key: 'REPEATER' as const, admKey: 'rptr' as const, label: 'Repeater' },
                ]).map(({ key, admKey, label }) => {
                  const theme = admTypeCardTheme[key];
                  const total = stats.byAdmType[key] ?? 0;
                  const pct = stats.total > 0 ? Math.round((total / stats.total) * 100) : 0;
                  return (
                    <div
                      key={key}
                      onClick={() => setAdmTypeDetailModal(key)}
                      className="col-span-2 rounded-2xl border border-black/10 flex flex-col relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]"
                      style={{ background: theme.bodyBg, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                    >
                      {/* Solid header strip — mirrors the Total Enrolled tile */}
                      <div
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-black/10 cursor-pointer select-none"
                        style={{ background: theme.headerBg }}
                        onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents.filter((s) => s.admType === key), displayYear, `${label} — Year & Course-wise Count`); }}
                        title="Double-click to export PDF"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: theme.headerText }} />
                          <p className="text-[13px] font-bold uppercase tracking-wider" style={{ color: theme.headerText }}>{label}</p>
                        </div>
                        <span className="text-[10px] font-bold tabular-nums whitespace-nowrap" style={{ color: theme.headerText, opacity: 0.7 }}>{pct}% of total</span>
                      </div>

                      {/* Body — total on the left, year × course table filling the rest */}
                      <div className="flex-1 flex items-stretch px-3.5 py-3 gap-3">
                        <div className="flex flex-col justify-center shrink-0">
                          <p className="text-4xl font-black leading-none tabular-nums" style={{ color: theme.numColor }}><AnimNum value={total} /></p>
                          <p className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: theme.numColor, opacity: 0.7 }}>Total</p>
                        </div>
                        <div className="w-px bg-black/15 shrink-0" />
                        <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
                          {/* Course header row */}
                          <div className="grid items-center gap-x-1" style={{ gridTemplateColumns: '24px repeat(5, 1fr)' }}>
                            <span />
                            {COURSES.map((course) => (
                              <span key={course} className="text-[9px] font-bold uppercase tracking-wide text-center" style={{ color: theme.numColor, opacity: 0.55 }}>{course}</span>
                            ))}
                          </div>
                          {/* Year rows */}
                          {YEARS.map((yr, i) => (
                            <div key={yr} className="grid items-center gap-x-1" style={{ gridTemplateColumns: '24px repeat(5, 1fr)' }}>
                              <span className="text-[9px] font-semibold" style={{ color: theme.numColor, opacity: 0.55 }}>{i + 1}Y</span>
                              {COURSES.map((course) => {
                                const v = stats.summaryTable[yr]?.[course]?.[admKey] ?? 0;
                                return (
                                  <span key={course} className="text-[12px] font-bold tabular-nums text-center" style={{ color: theme.numColor }}>
                                    {v === 0 ? '·' : v}
                                  </span>
                                );
                              })}
                            </div>
                          ))}
                          {/* Total row */}
                          <div className="grid items-center gap-x-1 pt-1 mt-0.5 border-t" style={{ gridTemplateColumns: '24px repeat(5, 1fr)', borderColor: theme.trackColor }}>
                            <span className="text-[9px] font-bold" style={{ color: theme.numColor, opacity: 0.7 }}>Σ</span>
                            {COURSES.map((course) => {
                              const v = courseAdmTotals[course][admKey];
                              return (
                                <span key={course} className="text-[12px] font-black tabular-nums text-center" style={{ color: theme.numColor }}>
                                  {v === 0 ? '·' : v}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending Seats */}
            <div>
              <SectionLabel accent={{ bar: 'bg-amber-400', text: 'text-amber-700' }} onDoubleClick={() => exportFirstYearSeatsReport(stats.firstYearSeats, displayYear)}>{lateralAllotments !== null ? 'Pending Seats — 1st Yr & Lateral 2nd Yr' : '1st Year — Pending Seats'}</SectionLabel>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {COURSES.map((course) => {
                  const theme = courseCardTheme[course];
                  const { nonSnqConfirmed, snqConfirmed } = stats.firstYearSeats[course];
                  const snqAllotted = snqConfirmed > 0;

                  // Regular seats: first 60 slots go to non-SNQ students
                  const regularFilled  = Math.min(nonSnqConfirmed, 60);
                  const regularPending = Math.max(0, 60 - regularFilled);
                  const overflowToSnq  = Math.max(0, nonSnqConfirmed - 60);

                  // SNQ seats: if allotted use admCat count; otherwise use overflow as estimate
                  const snqFilled  = snqAllotted ? snqConfirmed : overflowToSnq;
                  const snqPending = Math.max(0, 3 - snqFilled);

                  // Lateral seats (2nd Year only) — dynamic: 10% of intake + prev year carryover
                  const showLateral     = lateralAllotments !== null;
                  const lateralFilled   = stats.lateralSecondYearSeats[course];
                  const lateralAllotted = lateralAllotments?.[course] ?? 0;
                  const lateralPending  = showLateral ? Math.max(0, lateralAllotted - lateralFilled) : 0;

                  const rows: { label: string; badge?: string; pending: number; filled: number; total: number; ring: string }[] = [
                    { label: 'Regular', pending: regularPending, filled: regularFilled, total: REGULAR_INTAKE, ring: COURSE_RING_HEX[course] },
                    { label: 'SNQ', badge: snqAllotted ? undefined : 'To be allotted', pending: snqPending, filled: snqFilled, total: 3, ring: '#f59e0b' },
                    ...(showLateral ? [{ label: 'Lateral', pending: lateralPending, filled: lateralFilled, total: lateralAllotted, ring: '#0ea5e9' }] : []),
                  ];

                  return (
                    <div key={course} className={`rounded-2xl border border-black/10 ${theme.cardBg} flex flex-col relative overflow-hidden`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>

                      {/* Header section — retains the strip, course badge matches By Course dimensions */}
                      <div className={`flex items-center px-3.5 py-1.5 border-b border-black/10 ${theme.headerBg}`}>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border border-black/10 ${theme.cardBg} shrink-0`}>
                          <span className={`text-sm font-black uppercase tracking-wide ${theme.text}`}>{course}</span>
                        </div>
                      </div>

                      {/* Body — one row per seat type, each with its own fill ring */}
                      <div className="px-3.5 pt-2 pb-2.5 flex flex-col">
                        {rows.map((row, i) => {
                          const pct = row.total > 0 ? Math.min(100, Math.round((row.filled / row.total) * 100)) : 0;
                          return (
                            <div key={row.label} className={`flex items-center gap-2 ${i > 0 ? 'pt-1.5 mt-1.5 border-t border-black/10' : ''}`}>
                              <div className="w-9 flex items-center justify-center shrink-0">
                                {row.badge ? (
                                  <div className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center" style={{ borderColor: 'rgba(0,0,0,0.15)' }}>
                                    <span className="text-[7px] font-bold text-amber-600 leading-none">N/A</span>
                                  </div>
                                ) : (
                                  <SeatRing pct={pct} color={row.ring} ready={barsReady} size={32} stroke={3.5} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`text-[10px] font-bold uppercase tracking-wide ${theme.textMuted}`}>{row.label}</span>
                                  <span className={`text-lg font-black leading-none tabular-nums ${theme.text}`}>
                                    <AnimNum value={row.pending} />
                                  </span>
                                </div>
                                {row.badge ? (
                                  <span className="mt-1 inline-block px-1 py-px rounded text-[8px] font-bold bg-amber-50 border border-amber-200 text-amber-600 leading-tight">{row.badge}</span>
                                ) : (
                                  <p className={`text-[9px] tabular-nums mt-0.5 ${theme.textMuted}`}>{row.filled}/{row.total} filled</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Course Strength + Adm Type */}
            <div>
              <SectionLabel accent={{ bar: 'bg-indigo-500', text: 'text-indigo-700' }}>Insights & Recent Activity</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Course-wise vertical bar chart — cycling modes, mint/ivory palette */}
              {(() => {
                type ChartMode = {
                  title: string; subtitle: string;
                  getValue: (course: Course, bi: number) => number;
                  footerLabel: (bi: number) => string;
                };
                const modes: ChartMode[] = [
                  {
                    title: 'Course Strength', subtitle: 'confirmed · all years',
                    getValue:    (c, i) => stats.byCourseByYear[c][YEARS[i]!],
                    footerLabel: (i)    => ['1st Yr', '2nd Yr', '3rd Yr'][i],
                  },
                  {
                    title: 'Boys', subtitle: 'confirmed · by course & year',
                    getValue:    (c, i) => stats.byGenderByCourseByYear['BOY'][c][YEARS[i]!],
                    footerLabel: (i)    => ['1st Yr', '2nd Yr', '3rd Yr'][i],
                  },
                  {
                    title: 'Girls', subtitle: 'confirmed · by course & year',
                    getValue:    (c, i) => stats.byGenderByCourseByYear['GIRL'][c][YEARS[i]!],
                    footerLabel: (i)    => ['1st Yr', '2nd Yr', '3rd Yr'][i],
                  },
                  {
                    title: 'Adm Type', subtitle: 'regular · lateral · snq',
                    getValue:    (c, i) => ([courseAdmTotals[c].regular, courseAdmTotals[c].ltrl, courseAdmTotals[c].snq])[i] ?? 0,
                    footerLabel: (i)    => ['Regular', 'Lateral', 'SNQ'][i],
                  },
                ];

                // Mint → dark-green tri-tone ramp, reused across every cycling mode for a cohesive look
                const GREEN_TONES = ['#98E2C3', '#4F9D7C', '#1B4332'];
                const DARK_GREEN = '#1B4332';

                const mode = modes[barChartMode];
                const CHART_H = 148;
                const maxBarCount = Math.max(1, ...COURSES.flatMap((c) => [0, 1, 2].map((i) => mode.getValue(c, i))));

                // Y-axis scale: round up to a "nice" ceiling
                const niceMax = (() => {
                  if (maxBarCount <= 5)  return 5;
                  if (maxBarCount <= 10) return 10;
                  if (maxBarCount <= 15) return 15;
                  if (maxBarCount <= 20) return 20;
                  if (maxBarCount <= 30) return 30;
                  const step = maxBarCount <= 60 ? 10 : 20;
                  return Math.ceil(maxBarCount / step) * step;
                })();
                const yTicks = [niceMax, Math.round(niceMax * 0.75), Math.round(niceMax * 0.5), Math.round(niceMax * 0.25), 0];

                return (
                <div
                  className="rounded-2xl flex flex-col border border-black/10 overflow-hidden"
                  style={{ background: '#F5FBEA', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                >
                  {/* Header — solid mint strip, separated by a dark hairline */}
                  <div className="flex items-start justify-between gap-2 px-3.5 py-2.5 border-b border-black/10" style={{ background: '#98E2C3' }}>
                    <div key={barChartMode} style={{ animation: 'page-enter 0.28s ease-out' }}>
                      <p className="text-sm font-bold leading-tight" style={{ color: DARK_GREEN }}>{mode.title}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: DARK_GREEN, opacity: 0.65 }}>{mode.subtitle}</p>
                    </div>
                    {/* Mode nav dots */}
                    <div className="flex items-center gap-1.5 mt-1 shrink-0">
                      {modes.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setBarChartMode(i)}
                          className="rounded-full cursor-pointer transition-all duration-300"
                          style={{
                            width: i === barChartMode ? 16 : 8,
                            height: 8,
                            background: i === barChartMode ? DARK_GREEN : 'rgba(27,67,50,0.25)',
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-3 px-3.5 pt-2.5 shrink-0">
                    {([0, 1, 2] as const).map((bi) => (
                      <div key={bi} className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: GREEN_TONES[bi] }} />
                        <span className="text-[9px] font-medium" style={{ color: DARK_GREEN, opacity: 0.6 }}>{mode.footerLabel(bi)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Chart: Y-axis + bars */}
                  <div className="flex flex-1 gap-1.5 px-3.5 pt-2 pb-3">
                    {/* Y-axis labels — spacer (14px) aligns labels with bar area below course totals */}
                    <div className="flex flex-col shrink-0" style={{ width: 20 }}>
                      <div style={{ height: 14 }} />
                      <div className="flex flex-col justify-between items-end" style={{ height: CHART_H }}>
                        {yTicks.map((t) => (
                          <span key={t} className="text-[8px] tabular-nums leading-none" style={{ color: DARK_GREEN, opacity: 0.35 }}>{t}</span>
                        ))}
                      </div>
                    </div>

                    {/* Plot column */}
                    <div className="flex-1 flex flex-col min-w-0">
                      {/* Course totals row */}
                      <div className="flex gap-3 shrink-0" style={{ height: 14 }}>
                        {COURSES.map((course, ci) => (
                          <div key={course} className="flex-1 flex justify-center">
                            <span
                              key={`${barChartMode}-${course}`}
                              className="text-[10px] font-black tabular-nums leading-none"
                              style={{
                                color: DARK_GREEN,
                                opacity: chartBarsReady ? 1 : 0,
                                transition: chartBarsReady ? `opacity 350ms ease-out ${ci * 70 + 480}ms` : 'none',
                              }}
                            >
                              {[0, 1, 2].reduce((s, i) => s + mode.getValue(course, i), 0)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Bar area with gridlines */}
                      <div className="relative shrink-0" style={{ height: CHART_H }}>
                        {/* Horizontal gridlines */}
                        {yTicks.map((t) => (
                          <div
                            key={t}
                            className="absolute left-0 right-0 border-t"
                            style={{ bottom: `${(t / niceMax) * 100}%`, borderColor: t === 0 ? 'rgba(27,67,50,0.18)' : 'rgba(27,67,50,0.08)' }}
                          />
                        ))}
                        {/* Bar groups */}
                        <div className="absolute inset-0 flex gap-3">
                          {COURSES.map((course, ci) => (
                            <div key={course} className="flex-1 flex items-end gap-0.5 h-full">
                              {([0, 1, 2] as const).map((bi) => {
                                const count = mode.getValue(course, bi);
                                const fillPct = count > 0 ? Math.max(3, Math.round((count / niceMax) * 100)) : 0;
                                return (
                                  <div
                                    key={bi}
                                    className="flex-1"
                                    style={{
                                      background: GREEN_TONES[bi],
                                      borderRadius: '4px 4px 0 0',
                                      height: chartBarsReady ? `${fillPct}%` : '0%',
                                      transition: chartBarsReady
                                        ? `height 680ms cubic-bezier(0.34,1.08,0.64,1) ${(ci * 3 + bi) * 55}ms`
                                        : 'none',
                                    }}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Baseline */}
                      <div className="border-t shrink-0" style={{ borderColor: 'rgba(27,67,50,0.18)' }} />

                      {/* Course name labels */}
                      <div className="flex gap-3 mt-1.5 shrink-0">
                        {COURSES.map((course) => (
                          <div key={course} className="flex-1 flex justify-center">
                            <span className="text-[9px] font-bold leading-none" style={{ color: DARK_GREEN }}>{course}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* Recent activity card — absolute fill so bar chart card sets the row height */}
              <div className="relative">
                <div className="absolute inset-0 overflow-hidden rounded-2xl">
                  <RecentActivityCard
                    students={allStudents}
                    feeRecords={feeRecords}
                    academicYear={feeAcademicYear}
                    cycleIdx={barChartMode}
                  />
                </div>
              </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>

    {feeHistoryStudent && (
      <StudentDetailModal
        student={feeHistoryStudent}
        onClose={() => setFeeHistoryStudent(null)}
        defaultTab="fee"
      />
    )}

    {resultsStudent && (
      <StudentDetailModal
        student={resultsStudent}
        onClose={() => setResultsStudent(null)}
        defaultTab="results"
      />
    )}

    {/* ── Collect Fee modal (admin, from dashboard search) ─────────────── */}
    {collectFeeStudent && (
      <FeeCollectionModal
        student={collectFeeStudent}
        academicYear={collectFeeStudent.academicYear}
        receiptCounterYear={settings?.currentAcademicYear ?? collectFeeStudent.academicYear}
        onClose={() => setCollectFeeStudent(null)}
        onSaved={() => setCollectFeeStudent(null)}
      />
    )}

    {/* ── Certificate context menu ──────────────────────────────────────── */}
    {ctxMenu && (
      <>
        <div
          className="fixed inset-0 z-40"
          onClick={() => setCtxMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}
        />
        <div
          ref={ctxMenuRef}
          className="fixed z-50 bg-white border border-gray-200/80 rounded-2xl overflow-hidden min-w-[200px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y, visibility: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 pt-2 pb-1.5 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-800 truncate">{ctxMenu.student.studentNameSSLC}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{ctxMenu.student.course} · {ctxMenu.student.year} · {ctxMenu.student.academicYear}</p>
          </div>
          {/* Items */}
          <div className="py-1">
            {/* ── Navigation actions ── */}
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-emerald-50 hover:text-emerald-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setFeeHistoryStudent(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </span>
              View Details
            </button>
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-sky-50 hover:text-sky-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setResultsStudent(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-sky-100 group-hover:text-sky-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"/><path d="M6 5h12v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9 13l2 2 4-4"/></svg>
              </span>
              View Results
            </button>
            {isAdmin && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-blue-50 hover:text-blue-900 flex items-center gap-2 transition-colors duration-100"
                onClick={() => { void navigate(`/enroll?edit=${ctxMenu.student.id}&from=dashboard`); setCtxMenu(null); }}
              >
                <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </span>
                Edit
              </button>
            )}
            {isAdmin && (() => {
              const YEAR_ORDER: Record<Year, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };
              const NEXT_YEAR: Record<Year, Year | null> = { '1ST YEAR': '2ND YEAR', '2ND YEAR': '3RD YEAR', '3RD YEAR': null };
              const YEAR_LABEL: Record<Year, string> = { '1ST YEAR': '1st Year', '2ND YEAR': '2nd Year', '3RD YEAR': '3rd Year' };
              const activeGroup = studentGroups.find((g) => g.records.some((r) => r.id === ctxMenu.student.id));
              const maxYearRecord = activeGroup?.records.reduce((best, r) =>
                YEAR_ORDER[r.year] > YEAR_ORDER[best.year] ? r : best
              , activeGroup.records[0]) ?? ctxMenu.student;
              const nextEnrollYear = NEXT_YEAR[maxYearRecord.year];
              const alreadyEnrolledCurrentYear = activeGroup?.records.some(
                (r) => r.academicYear === settings?.currentAcademicYear
              ) ?? false;
              if (!nextEnrollYear || alreadyEnrolledCurrentYear) return null;
              return (
                <button
                  className="group w-full text-left px-3 py-[5px] text-[12px] text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900 flex items-center gap-2 transition-colors duration-100 font-semibold"
                  onClick={() => {
                    void navigate('/enroll?from=dashboard', {
                      state: {
                        reEnrollStudent: maxYearRecord,
                        targetYear: nextEnrollYear,
                        targetAcademicYear: settings?.currentAcademicYear,
                      },
                    });
                    setCtxMenu(null);
                  }}
                >
                  <span className="w-[16px] h-[16px] rounded-[4px] bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
                  </span>
                  {`Enroll for ${YEAR_LABEL[nextEnrollYear]} in ${settings?.currentAcademicYear ?? ''}`}
                </button>
              );
            })()}
            {isAdmin && (() => {
              const feeStatus = searchFeeLoading ? null : (searchFeeStatus.get(ctxMenu.student.id) ?? 'collect');
              if (feeStatus === 'no-dues') {
                return (
                  <div className="flex items-center gap-2 px-3 py-[5px] text-[12px] text-gray-400 cursor-default">
                    <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    No Dues
                  </div>
                );
              }
              return (
                <button
                  className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-2 transition-colors duration-100"
                  onClick={() => { setCollectFeeStudent(ctxMenu.student); setCtxMenu(null); }}
                >
                  <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-100 group-hover:text-amber-600 transition-colors">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  </span>
                  {feeStatus === 'dues' ? 'Collect Dues' : 'Collect Fee'}
                </button>
              );
            })()}
            {/* ── Divider ── */}
            <div className="my-1 border-t border-gray-100" />
            {/* ── Certificate actions ── */}
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-emerald-50 hover:text-emerald-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setStudyCertStudent(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </span>
              Study Certificate
            </button>
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-emerald-50 hover:text-emerald-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setTcStudent(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
              Transfer Certificate
            </button>
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-orange-50 hover:text-orange-900 flex items-center gap-2 transition-colors duration-100"
              onClick={() => { generateTCApplication(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
              </span>
              TC Application
            </button>
            {ctxMenu.student.year === '3RD YEAR' && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-emerald-50 hover:text-emerald-900 flex items-center gap-2 transition-colors duration-100"
                onClick={() => { setPcStudent(ctxMenu.student); setCtxMenu(null); }}
              >
                <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                </span>
                Provisional Certificate
              </button>
            )}
            {ctxMenu.student.year === '3RD YEAR' && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] text-gray-600 hover:bg-violet-50 hover:text-violet-900 flex items-center gap-2 transition-colors duration-100"
                onClick={() => { setCccStudent(ctxMenu.student); setCtxMenu(null); }}
              >
                <span className="w-[16px] h-[16px] rounded-[4px] bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-100 group-hover:text-violet-600 transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
                </span>
                Course Completion Certificate
              </button>
            )}
          </div>
        </div>
      </>
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

    {/* Total enrolled — year × course modal */}
    {totalModal && (() => {
      const YEAR_LABELS: Record<Year, string> = { '1ST YEAR': '1st Year', '2ND YEAR': '2nd Year', '3RD YEAR': '3rd Year' };
      const rows = YEARS.map((yr) => {
        const cells = COURSES.map((c) => stats.byYearByCourse[yr][c]);
        const total = cells.reduce((a, v) => a + v, 0);
        return { yr, cells, total };
      });
      const grandCols = COURSES.map((_, ci) => rows.reduce((a, r) => a + r.cells[ci], 0));
      const grandTotal = rows.reduce((a, r) => a + r.total, 0);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setTotalModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 border-sky-400 bg-sky-50 shadow-2xl w-full max-w-lg mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            {/* Header */}
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-sky-400 relative overflow-hidden">
              <span aria-hidden="true" className="absolute -bottom-4 -right-2 text-8xl font-black leading-none select-none pointer-events-none text-sky-600 opacity-[0.07]">ALL</span>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-md text-sm font-black uppercase tracking-widest border border-sky-400 bg-white/70 text-sky-700">Total</span>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Year &amp; Course-wise</p>
              </div>
              <button
                onClick={() => setTotalModal(false)}
                className="relative z-10 rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer"
                aria-label="Close"
              >×</button>
            </div>
            {/* Table */}
            <div className="p-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-sky-50">
                    <th className="px-3 py-2 text-left font-semibold text-sky-700 border-b-2 border-sky-400">Year</th>
                    {COURSES.map((c) => (
                      <th key={c} className="px-3 py-2 text-right font-semibold text-gray-500 border-b-2 border-sky-400">{c}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-sky-700 border-b-2 border-l-2 border-sky-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.yr} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className="px-3 py-2.5 font-semibold text-gray-700 border-b border-sky-400/40">{YEAR_LABELS[row.yr]}</td>
                      {row.cells.map((v, ci) => (
                        <td key={ci} className="px-3 py-2.5 text-right tabular-nums text-gray-700 border-b border-sky-400/40">
                          {v > 0 ? v : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sky-700 border-b border-l-2 border-sky-400/40">
                        {row.total > 0 ? row.total : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-sky-50 border-t-2 border-sky-400">
                    <td className="px-3 py-2.5 font-bold text-sky-700 text-xs uppercase tracking-wide">Total</td>
                    {grandCols.map((v, ci) => (
                      <td key={ci} className="px-3 py-2.5 text-right tabular-nums font-bold text-sky-700 text-sm">{v}</td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sky-700 text-sm border-l-2 border-sky-400">{grandTotal}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Summary modal — Year, Course & Admission Type-wise breakdown (mirrors Admission Type-wise Count modal) */}
    {summaryModal && (() => {
      const summaryStudents = allStudents.filter((s) => s.academicYear === academicYearFilter && s.admissionStatus === 'CONFIRMED');

      const sumRows = YEARS.flatMap((yr) => {
        const yrLabel = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
        const yrSt = summaryStudents.filter((s) => s.year === yr);
        const sub = { regular: 0, ltrl: 0, snq: 0, rptr: 0, total: 0 };
        const courseRows = COURSES.map((course) => {
          const ss = yrSt.filter((s) => s.course === course);
          let regular = 0, ltrl = 0, snq = 0, rptr = 0;
          for (const s of ss) {
            if (s.admCat === 'SNQ')            snq++;
            else if (s.admType === 'LATERAL')  ltrl++;
            else if (s.admType === 'REPEATER') rptr++;
            else                               regular++;
          }
          const total = ss.length;
          sub.regular += regular; sub.ltrl += ltrl; sub.snq += snq; sub.rptr += rptr; sub.total += total;
          return { yrLabel, course, regular, ltrl, snq, rptr, total, isSubtotal: false };
        });
        return [...courseRows, { yrLabel: `${yrLabel} SUBTOTAL`, course: 'All Courses', ...sub, isSubtotal: true }];
      });
      const grand = sumRows.filter((r) => r.isSubtotal).reduce(
        (acc, r) => ({ regular: acc.regular + r.regular, ltrl: acc.ltrl + r.ltrl, snq: acc.snq + r.snq, rptr: acc.rptr + r.rptr, total: acc.total + r.total }),
        { regular: 0, ltrl: 0, snq: 0, rptr: 0, total: 0 }
      );
      const tc = 'px-2.5 py-0.5 text-right tabular-nums text-sm';
      const tl = 'px-2.5 py-0.5 text-left text-xs';
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSummaryModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 border-emerald-400 bg-emerald-50 shadow-2xl w-full max-w-3xl mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b border-emerald-300">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full shrink-0 bg-emerald-400" />
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Summary — Year, Course &amp; Adm Type-wise Count</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => exportSummaryReport(summaryStudents, academicYearFilter, undefined, 'emerald')} className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer uppercase tracking-wide">Export PDF</button>
                <button onClick={() => setSummaryModal(false)} className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer" aria-label="Close">×</button>
              </div>
            </div>
            <div className="p-3 bg-white">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-emerald-300">
                    {['Year','Course','Regular','LTRL','SNQ','RPTR','Total'].map((h, hi) => (
                      <th key={h} className={`px-2.5 py-1.5 text-emerald-800 font-bold whitespace-nowrap text-right uppercase tracking-wide [&:nth-child(1)]:text-left [&:nth-child(2)]:text-left ${hi >= 2 ? 'text-xs' : 'text-[11px]'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sumRows.map((r, i) => r.isSubtotal ? (
                    <tr key={i} className="font-semibold text-emerald-800 bg-emerald-50/80 border-y border-emerald-200">
                      <td className={tl}>{r.yrLabel}</td><td className={tl}>{r.course}</td>
                      {[r.regular, r.ltrl, r.snq, r.rptr, r.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                    </tr>
                  ) : (
                    <tr key={i} className="border-b border-gray-100 hover:bg-emerald-50/40 transition-colors">
                      <td className={tl + ' text-gray-400'}>{r.yrLabel}</td><td className={tl + ' font-semibold text-gray-700'}>{r.course}</td>
                      {[r.regular, r.ltrl, r.snq, r.rptr, r.total].map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v}</td>)}
                    </tr>
                  ))}
                  <tr className="text-white font-bold" style={{ background: '#065f46' }}>
                    <td className={tl}>GRAND TOTAL</td><td className={tl} />
                    {[grand.regular, grand.ltrl, grand.snq, grand.rptr, grand.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Intake % modal — year × course breakdown */}
    {intakeModal && (() => {
      const INTAKE = 63;
      const YEAR_INTAKE = INTAKE * COURSES.length;   // 315 per year
      const OVERALL_INTAKE = YEAR_INTAKE * YEARS.length; // 945
      const YEAR_LABELS: Record<Year, string> = { '1ST YEAR': '1st Year', '2ND YEAR': '2nd Year', '3RD YEAR': '3rd Year' };
      const rows = YEARS.map((yr) => {
        const cells = COURSES.map((c) => stats.byYearByCourse[yr][c]);
        const total = cells.reduce((a, v) => a + v, 0);
        const rowPct = Math.round((total / YEAR_INTAKE) * 100);
        return { yr, cells, total, rowPct };
      });
      const grandCols = COURSES.map((_, ci) => rows.reduce((a, r) => a + r.cells[ci], 0));
      const grandTotal = rows.reduce((a, r) => a + r.total, 0);
      const tc = 'px-3 py-2.5 text-right tabular-nums';
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIntakeModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 border-sky-400 bg-sky-50 shadow-2xl w-full max-w-xl mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            {/* Header */}
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-sky-400 relative overflow-hidden">
              <span aria-hidden="true" className="absolute -bottom-4 -right-2 text-8xl font-black leading-none select-none pointer-events-none text-sky-600 opacity-[0.07]">%</span>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-md text-sm font-black uppercase tracking-widest border border-sky-400 bg-white/70 text-sky-700">Intake %</span>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Year &amp; Course-wise · 63 seats</p>
              </div>
              <button
                onClick={() => setIntakeModal(false)}
                className="relative z-10 rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer"
                aria-label="Close"
              >×</button>
            </div>
            {/* Table */}
            <div className="p-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-sky-50">
                    <th className="px-3 py-2 text-left font-semibold text-sky-700 border-b-2 border-sky-400">Year</th>
                    {COURSES.map((c) => (
                      <th key={c} className="px-3 py-2 text-right font-semibold text-gray-500 border-b-2 border-sky-400">{c}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold text-sky-700 border-b-2 border-l-2 border-sky-400">Total</th>
                    <th className="px-3 py-2 text-right font-semibold text-sky-700 border-b-2 border-sky-400">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.yr} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className="px-3 py-2.5 font-semibold text-gray-700 border-b border-sky-400/40">{YEAR_LABELS[row.yr]}</td>
                      {row.cells.map((v, ci) => {
                        const cellPct = Math.round((v / INTAKE) * 100);
                        return (
                          <td key={ci} className={`${tc} border-b border-sky-400/40`}>
                            <div className="flex flex-col items-end gap-px">
                              <span className="text-gray-700">{v > 0 ? v : <span className="text-gray-300">—</span>}</span>
                              {v > 0 && <span className="text-[9px] text-sky-400/80 font-semibold">{cellPct}%</span>}
                            </div>
                          </td>
                        );
                      })}
                      <td className={`${tc} font-bold text-sky-700 border-b border-l-2 border-sky-400/40`}>
                        {row.total > 0 ? row.total : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`${tc} font-bold text-sky-600 border-b border-sky-400/40`}>
                        {row.rowPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-sky-50 border-t-2 border-sky-400">
                    <td className="px-3 py-2.5 font-bold text-sky-700 text-xs uppercase tracking-wide">Total</td>
                    {grandCols.map((v, ci) => {
                      const colPct = Math.round((v / (INTAKE * YEARS.length)) * 100);
                      return (
                        <td key={ci} className={`${tc}`}>
                          <div className="flex flex-col items-end gap-px">
                            <span className="font-bold text-sky-700 text-sm">{v}</span>
                            <span className="text-[9px] text-sky-400/80 font-semibold">{colPct}%</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sky-700 text-sm border-l-2 border-sky-400">{grandTotal}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-sky-600 text-sm">
                      {Math.round((grandTotal / OVERALL_INTAKE) * 100)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Gender distribution modal */}
    {genderModal && (() => {
      const isBoy   = genderModal === 'BOY';
      const label   = isBoy ? 'Boys' : 'Girls';
      const wm      = isBoy ? 'B' : 'G';
      const bg      = isBoy ? 'bg-sky-50'      : 'bg-rose-50';
      const brd     = isBoy ? 'border-sky-400' : 'border-rose-400';
      const textCol = isBoy ? 'text-sky-700'   : 'text-rose-600';
      const data    = stats.byGenderByCourseByYear[genderModal];
      const YEAR_LABELS: Record<Year, string> = { '1ST YEAR': '1st Year', '2ND YEAR': '2nd Year', '3RD YEAR': '3rd Year' };
      const rows = COURSES.map((course) => {
        const yr1 = data[course]['1ST YEAR'];
        const yr2 = data[course]['2ND YEAR'];
        const yr3 = data[course]['3RD YEAR'];
        return { course, yr1, yr2, yr3, total: yr1 + yr2 + yr3 };
      });
      const grand = rows.reduce((a, r) => ({ yr1: a.yr1 + r.yr1, yr2: a.yr2 + r.yr2, yr3: a.yr3 + r.yr3, total: a.total + r.total }), { yr1: 0, yr2: 0, yr3: 0, total: 0 });
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setGenderModal(null)} aria-hidden="true" />
          <div className={`relative rounded-2xl border-2 ${brd} ${bg} shadow-2xl w-full max-w-md mx-4 overflow-hidden`} style={{ animation: 'modal-enter 0.25s ease-out' }}>
            {/* Header */}
            <div className={`px-5 py-3.5 flex items-center justify-between border-b ${brd} relative overflow-hidden`}>
              <span aria-hidden="true" className={`absolute -bottom-4 -right-2 text-8xl font-black leading-none select-none pointer-events-none ${textCol} opacity-[0.07]`}>
                {wm}
              </span>
              <div className="flex items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-md text-sm font-black uppercase tracking-widest border ${brd} bg-white/70 ${textCol}`}>
                  {label}
                </span>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Course &amp; Year-wise</p>
              </div>
              <button
                onClick={() => setGenderModal(null)}
                className="relative z-10 rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer"
                aria-label="Close"
              >×</button>
            </div>
            {/* Table */}
            <div className="p-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className={bg}>
                    <th className={`px-3 py-2 text-left font-semibold ${textCol} border-b-2 ${brd}`}>Course</th>
                    {(['1ST YEAR', '2ND YEAR', '3RD YEAR'] as Year[]).map((yr) => (
                      <th key={yr} className={`px-3 py-2 text-right font-semibold text-gray-500 border-b-2 ${brd}`}>{YEAR_LABELS[yr]}</th>
                    ))}
                    <th className={`px-3 py-2 text-right font-semibold ${textCol} border-b-2 border-l-2 ${brd}`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.course} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className={`px-3 py-2.5 font-semibold text-gray-700 border-b ${brd}/40`}>{row.course}</td>
                      {[row.yr1, row.yr2, row.yr3].map((v, j) => (
                        <td key={j} className={`px-3 py-2.5 text-right tabular-nums border-b ${brd}/40 text-gray-700`}>
                          {v > 0 ? v : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${textCol} border-b border-l-2 ${brd}/40`}>
                        {row.total > 0 ? row.total : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`${bg} border-t-2 ${brd}`}>
                    <td className={`px-3 py-2.5 font-bold ${textCol} text-xs uppercase tracking-wide`}>Total</td>
                    {[grand.yr1, grand.yr2, grand.yr3].map((v, j) => (
                      <td key={j} className={`px-3 py-2.5 text-right tabular-nums font-bold ${textCol} text-sm`}>{v}</td>
                    ))}
                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${textCol} text-sm border-l-2 ${brd}`}>{grand.total}</td>
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

    {/* ── Category-wise Count modal ─────────────────────────────────────── */}
    {catModal && (() => {
      const catRows = YEARS.flatMap((yr) => {
        const yrLabel = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
        const sub = { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0, total: 0 };
        const courseRows = COURSES.map((course) => {
          const c = stats.catTable[yr]?.[course] ?? { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0 };
          const total = c.gm + c.c1 + c.twoA + c.twoB + c.threeA + c.threeB + c.sc + c.st;
          sub.gm += c.gm; sub.c1 += c.c1; sub.twoA += c.twoA; sub.twoB += c.twoB;
          sub.threeA += c.threeA; sub.threeB += c.threeB; sub.sc += c.sc; sub.st += c.st; sub.total += total;
          return { yrLabel, course, ...c, total, isSubtotal: false };
        });
        return [...courseRows, { yrLabel: `${yrLabel} SUBTOTAL`, course: 'All Courses', ...sub, isSubtotal: true }];
      });
      const grand = catRows.filter((r) => r.isSubtotal).reduce(
        (acc, r) => ({ gm: acc.gm + r.gm, c1: acc.c1 + r.c1, twoA: acc.twoA + r.twoA, twoB: acc.twoB + r.twoB,
          threeA: acc.threeA + r.threeA, threeB: acc.threeB + r.threeB, sc: acc.sc + r.sc, st: acc.st + r.st, total: acc.total + r.total }),
        { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0, total: 0 }
      );
      const tc = 'px-2.5 py-1 text-right tabular-nums text-xs';
      const tl = 'px-2.5 py-1 text-left text-xs';
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCatModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 border-emerald-400 bg-emerald-50 shadow-2xl w-full max-w-3xl mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b border-emerald-300">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full shrink-0 bg-emerald-400" />
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Category-wise Count</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => exportCategoryReport(confirmedStudents, displayYear)} className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer uppercase tracking-wide">Export PDF</button>
                <button onClick={() => setCatModal(false)} className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer" aria-label="Close">×</button>
              </div>
            </div>
            <div className="p-3 bg-white">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-emerald-300">
                    {['Year','Course','GM','C1','2A','2B','3A','3B','SC','ST','Total'].map((h) => (
                      <th key={h} className="px-2.5 py-1.5 text-emerald-800 font-bold whitespace-nowrap text-right text-[11px] uppercase tracking-wide [&:nth-child(1)]:text-left [&:nth-child(2)]:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catRows.map((r, i) => r.isSubtotal ? (
                    <tr key={i} className="font-semibold text-emerald-800 bg-emerald-50/80 border-y border-emerald-200">
                      <td className={tl}>{r.yrLabel}</td><td className={tl}>{r.course}</td>
                      {[r.gm, r.c1, r.twoA, r.twoB, r.threeA, r.threeB, r.sc, r.st, r.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                    </tr>
                  ) : (
                    <tr key={i} className="border-b border-gray-100 hover:bg-emerald-50/40 transition-colors">
                      <td className={tl + ' text-gray-400'}>{r.yrLabel}</td><td className={tl + ' font-semibold text-gray-700'}>{r.course}</td>
                      {[r.gm, r.c1, r.twoA, r.twoB, r.threeA, r.threeB, r.sc, r.st, r.total].map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v}</td>)}
                    </tr>
                  ))}
                  <tr className="text-white font-bold" style={{ background: '#047857' }}>
                    <td className={tl}>GRAND TOTAL</td><td className={tl} />
                    {[grand.gm, grand.c1, grand.twoA, grand.twoB, grand.threeA, grand.threeB, grand.sc, grand.st, grand.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Admission Type-wise Count modal ──────────────────────────────────── */}
    {admTypeModal && (() => {
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
      const tc = 'px-2.5 py-1 text-right tabular-nums text-xs';
      const tl = 'px-2.5 py-1 text-left text-xs';
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAdmTypeModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 border-sky-400 bg-sky-50 shadow-2xl w-full max-w-3xl mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b border-sky-300">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full shrink-0 bg-sky-400" />
                <p className="text-xs font-bold uppercase tracking-widest text-sky-700">Admission Type-wise Count</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => exportSummaryReport(confirmedStudents, displayYear)} className="text-[10px] font-semibold text-sky-600 hover:text-sky-800 transition-colors cursor-pointer uppercase tracking-wide">Export PDF</button>
                <button onClick={() => setAdmTypeModal(false)} className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer" aria-label="Close">×</button>
              </div>
            </div>
            <div className="p-3 bg-white">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-sky-300">
                    {['Year','Course','Regular','LTRL','SNQ','RPTR','Total'].map((h) => (
                      <th key={h} className="px-2.5 py-1.5 text-sky-800 font-bold whitespace-nowrap text-right text-[11px] uppercase tracking-wide [&:nth-child(1)]:text-left [&:nth-child(2)]:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sumRows.map((r, i) => r.isSubtotal ? (
                    <tr key={i} className="font-semibold text-sky-800 bg-sky-50/80 border-y border-sky-200">
                      <td className={tl}>{r.yrLabel}</td><td className={tl}>{r.course}</td>
                      {[r.regular, r.ltrl, r.snq, r.rptr, r.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                    </tr>
                  ) : (
                    <tr key={i} className="border-b border-gray-100 hover:bg-sky-50/40 transition-colors">
                      <td className={tl + ' text-gray-400'}>{r.yrLabel}</td><td className={tl + ' font-semibold text-gray-700'}>{r.course}</td>
                      {[r.regular, r.ltrl, r.snq, r.rptr, r.total].map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v}</td>)}
                    </tr>
                  ))}
                  <tr className="text-white font-bold" style={{ background: '#0369a1' }}>
                    <td className={tl}>GRAND TOTAL</td><td className={tl} />
                    {[grand.regular, grand.ltrl, grand.snq, grand.rptr, grand.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Lateral / Repeater detail modal — breakdown + student list for one adm type ── */}
    {admTypeDetailModal && (() => {
      const key = admTypeDetailModal;
      const admKey = ADM_TYPE_ADM_KEY[key];
      const label = ADM_TYPE_LABEL[key];
      const theme = admTypeCardTheme[key];
      const typeStudents = confirmedStudents
        .filter((s) => (key === 'SNQ' ? s.admCat === 'SNQ' : s.admType === key))
        .sort((a, b) => a.year.localeCompare(b.year) || a.course.localeCompare(b.course) || a.studentNameSSLC.localeCompare(b.studentNameSSLC));

      const rows = YEARS.map((yr) => {
        const yrLabel = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
        const byCourse = COURSES.map((course) => stats.summaryTable[yr]?.[course]?.[admKey] ?? 0);
        return { yrLabel, byCourse, total: byCourse.reduce((a, v) => a + v, 0) };
      });
      const grandByCourse = COURSES.map((course) => courseAdmTotals[course][admKey]);
      const grandTotal = grandByCourse.reduce((a, v) => a + v, 0);

      const tc = 'px-1 py-1.5 text-right tabular-nums text-[10px]';
      const tl = 'px-1 py-1.5 text-left text-[10px]';

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAdmTypeDetailModal(null)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col h-[480px]" style={{ borderColor: theme.barColor, background: theme.bodyBg, animation: 'modal-enter 0.25s ease-out' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b shrink-0" style={{ borderColor: theme.trackColor }}>
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full shrink-0" style={{ background: theme.barColor }} />
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: theme.numColor }}>{label} — Year & Course-wise Count</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => exportSummaryReport(typeStudents, displayYear, `${label} — Year & Course-wise Count`)}
                  className="text-[10px] font-semibold transition-colors cursor-pointer uppercase tracking-wide hover:opacity-70"
                  style={{ color: theme.numColor }}
                >
                  Export PDF
                </button>
                <button onClick={() => setAdmTypeDetailModal(null)} className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer" aria-label="Close">×</button>
              </div>
            </div>

            <div className="flex-1 min-h-0 flex gap-2.5 p-2.5 bg-white">
              {/* Breakdown table */}
              <div className="shrink-0" style={{ width: '196px' }}>
                <table className="w-full border-collapse table-fixed">
                  <thead>
                    <tr className="border-b-2" style={{ borderColor: theme.trackColor }}>
                      <th className="px-1 py-1.5 font-bold text-left text-[9px] uppercase tracking-wide" style={{ color: theme.numColor }}>Yr</th>
                      {COURSES.map((c) => (
                        <th key={c} className="px-1 py-1.5 font-bold text-right text-[9px] uppercase tracking-wide" style={{ color: theme.numColor }}>{c}</th>
                      ))}
                      <th className="px-1 py-1.5 font-bold text-right text-[9px] uppercase tracking-wide" style={{ color: theme.numColor }}>Σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className={tl + ' text-gray-600 font-semibold'}>{YEARS[i] === '1ST YEAR' ? '1Y' : YEARS[i] === '2ND YEAR' ? '2Y' : '3Y'}</td>
                        {r.byCourse.map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v === 0 ? '·' : v}</td>)}
                        <td className={tc + ' font-bold text-gray-800'}>{r.total === 0 ? '·' : r.total}</td>
                      </tr>
                    ))}
                    <tr className="text-white font-bold" style={{ background: theme.headerBg }}>
                      <td className={tl}>Σ</td>
                      {grandByCourse.map((v, j) => <td key={j} className={tc}>{v}</td>)}
                      <td className={tc}>{grandTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="w-px shrink-0" style={{ background: theme.trackColor }} />

              {/* Student list */}
              <div className="flex-1 min-w-0 flex flex-col">
                <p className="px-1 pb-1 text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: theme.numColor }}>
                  Students ({typeStudents.length})
                </p>
                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                  <table className="w-full border-collapse table-fixed">
                    <colgroup>
                      <col style={{ width: '30px' }} />
                      <col style={{ width: '34px' }} />
                      <col />
                      <col style={{ width: '40px' }} />
                      <col style={{ width: '68px' }} />
                    </colgroup>
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b-2" style={{ borderColor: theme.trackColor }}>
                        {['Yr', 'Crs', 'Name', 'Cat', 'Mobile'].map((h) => (
                          <th key={h} className="px-1 py-1.5 font-bold whitespace-nowrap text-left text-[9px] uppercase tracking-wide" style={{ color: theme.numColor }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {typeStudents.length === 0 ? (
                        <tr><td colSpan={5} className="px-1 py-6 text-center text-[10px] text-gray-400">No {label.toLowerCase()} students</td></tr>
                      ) : typeStudents.map((s) => (
                        <tr key={s.id} className="border-b border-gray-100">
                          <td className="px-1 py-1.5 text-[10px] text-gray-500">{s.year === '1ST YEAR' ? '1Y' : s.year === '2ND YEAR' ? '2Y' : '3Y'}</td>
                          <td className="px-1 py-1.5 text-[10px] font-semibold text-gray-700">{s.course}</td>
                          <td className="px-1 py-1.5 text-[10px] text-gray-800 truncate" title={s.studentNameSSLC}>{s.studentNameSSLC}</td>
                          <td className="px-1 py-1.5 text-[10px] text-gray-600">{s.category || '—'}</td>
                          <td className="px-1 py-1.5 text-[10px] text-gray-600 truncate">{s.studentMobile || s.fatherMobile || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Category & Gender-wise Count modal ───────────────────────────────── */}
    {catGenderModal && (() => {
      const CATS = ['GM','C1','2A','2B','3A','3B','SC','ST'] as const;
      type CatPair = { boys: number; girls: number };
      const tc = 'px-1.5 py-1 text-right tabular-nums text-[10px]';
      const tl = 'px-2 py-1 text-left text-[10px]';
      const rows = YEARS.flatMap((yr) => {
        const yrLabel = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
        const sub: Record<string, CatPair> = Object.fromEntries(CATS.map((c) => [c, { boys: 0, girls: 0 }]));
        let subB = 0, subG = 0;
        const courseRows = COURSES.map((course) => {
          const cats: Record<string, CatPair> = {};
          let tB = 0, tG = 0;
          for (const cat of CATS) {
            const p = stats.byGenderByCatByCourseByYear[cat][course as Course][yr as Year];
            cats[cat] = p; tB += p.boys; tG += p.girls;
            sub[cat].boys += p.boys; sub[cat].girls += p.girls;
          }
          subB += tB; subG += tG;
          return { yrLabel, course, cats, tB, tG, isSubtotal: false };
        });
        return [...courseRows, { yrLabel: `${yrLabel} SUB`, course: 'All', cats: sub, tB: subB, tG: subG, isSubtotal: true }];
      });
      const grand = { cats: Object.fromEntries(CATS.map((c) => [c, { boys: 0, girls: 0 }])) as Record<string, CatPair>, tB: 0, tG: 0 };
      for (const r of rows.filter((r) => r.isSubtotal)) {
        for (const cat of CATS) { grand.cats[cat].boys += r.cats[cat].boys; grand.cats[cat].girls += r.cats[cat].girls; }
        grand.tB += r.tB; grand.tG += r.tG;
      }
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCatGenderModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 border-rose-400 bg-rose-50 shadow-2xl w-full max-w-5xl mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b border-rose-300">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full shrink-0 bg-rose-400" />
                <p className="text-xs font-bold uppercase tracking-widest text-rose-700">Category &amp; Gender-wise Count</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => exportGenderCategoryReport(confirmedStudents, displayYear)} className="text-[10px] font-semibold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer uppercase tracking-wide">Export PDF</button>
                <button onClick={() => setCatGenderModal(false)} className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer" aria-label="Close">×</button>
              </div>
            </div>
            <div className="p-3 bg-white">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-rose-50">
                    <th rowSpan={2} className="px-2 py-1.5 text-rose-800 font-bold text-left align-middle whitespace-nowrap text-[11px] uppercase tracking-wide border-r border-rose-200">Year</th>
                    <th rowSpan={2} className="px-2 py-1.5 text-rose-800 font-bold text-left align-middle whitespace-nowrap text-[11px] uppercase tracking-wide border-r border-rose-200">Course</th>
                    {CATS.map((cat) => (
                      <th key={cat} colSpan={2} className="px-1 py-1 text-rose-800 font-bold text-center whitespace-nowrap text-[11px] uppercase tracking-wide border-l border-rose-200">{cat}</th>
                    ))}
                    <th colSpan={2} className="px-1 py-1 text-rose-800 font-bold text-center whitespace-nowrap text-[11px] uppercase tracking-wide border-l border-rose-200">Total</th>
                  </tr>
                  <tr className="bg-rose-50 border-b-2 border-rose-300">
                    {[...CATS, 'T' as const].flatMap((cat) => [
                      <th key={`${cat}-b`} className="px-1 py-1 text-[9px] text-rose-500 font-semibold text-right border-l border-rose-200">B</th>,
                      <th key={`${cat}-g`} className="px-1 py-1 text-[9px] text-rose-500 font-semibold text-right">G</th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => r.isSubtotal ? (
                    <tr key={i} className="font-semibold text-rose-800 bg-rose-50/80 border-y border-rose-200">
                      <td className={tl}>{r.yrLabel}</td><td className={tl}>{r.course}</td>
                      {CATS.flatMap((cat) => [
                        <td key={`${cat}-b`} className={tc + ' border-l border-rose-200'}>{r.cats[cat].boys}</td>,
                        <td key={`${cat}-g`} className={tc}>{r.cats[cat].girls}</td>,
                      ])}
                      <td className={tc + ' border-l border-rose-200'}>{r.tB}</td>
                      <td className={tc}>{r.tG}</td>
                    </tr>
                  ) : (
                    <tr key={i} className="border-b border-gray-100 hover:bg-rose-50/40 transition-colors">
                      <td className={tl + ' text-gray-400'}>{r.yrLabel}</td><td className={tl + ' font-semibold text-gray-700'}>{r.course}</td>
                      {CATS.flatMap((cat) => [
                        <td key={`${cat}-b`} className={tc + ' text-gray-700 border-l border-gray-50'}>{r.cats[cat].boys}</td>,
                        <td key={`${cat}-g`} className={tc + ' text-gray-700'}>{r.cats[cat].girls}</td>,
                      ])}
                      <td className={tc + ' text-gray-800 font-semibold border-l border-rose-100'}>{r.tB}</td>
                      <td className={tc + ' text-gray-800 font-semibold'}>{r.tG}</td>
                    </tr>
                  ))}
                  <tr className="text-white font-bold" style={{ background: '#be123c' }}>
                    <td className={tl}>GRAND TOTAL</td><td className={tl} />
                    {CATS.flatMap((cat) => [
                      <td key={`${cat}-b`} className={tc + ' border-l border-rose-900'}>{grand.cats[cat].boys}</td>,
                      <td key={`${cat}-g`} className={tc}>{grand.cats[cat].girls}</td>,
                    ])}
                    <td className={tc + ' border-l border-rose-900'}>{grand.tB}</td>
                    <td className={tc}>{grand.tG}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Year & Course-wise Gender modal ──────────────────────────────────── */}
    {yearGenderModal && (() => {
      const tc = 'px-2.5 py-1 text-right tabular-nums text-xs';
      const tl = 'px-2.5 py-1 text-left text-xs';
      const rows = YEARS.flatMap((yr) => {
        const yrLabel = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
        const sub = { boys: 0, girls: 0, total: 0 };
        const courseRows = COURSES.map((course) => {
          const boys  = stats.byGenderByCourseByYear['BOY'][course][yr];
          const girls = stats.byGenderByCourseByYear['GIRL'][course][yr];
          const total = boys + girls;
          sub.boys += boys; sub.girls += girls; sub.total += total;
          return { yrLabel, course, boys, girls, total, isSubtotal: false };
        });
        return [...courseRows, { yrLabel: `${yrLabel} SUB`, course: 'All', ...sub, isSubtotal: true }];
      });
      const grand = rows.filter((r) => r.isSubtotal).reduce(
        (acc, r) => ({ boys: acc.boys + r.boys, girls: acc.girls + r.girls, total: acc.total + r.total }),
        { boys: 0, girls: 0, total: 0 }
      );
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setYearGenderModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 border-teal-400 bg-teal-50 shadow-2xl w-full max-w-3xl mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b border-teal-300">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full shrink-0 bg-teal-400" />
                <p className="text-xs font-bold uppercase tracking-widest text-teal-700">Year &amp; Course-wise Gender</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => exportGenderCourseYearReport(confirmedStudents, displayYear)} className="text-[10px] font-semibold text-teal-600 hover:text-teal-800 transition-colors cursor-pointer uppercase tracking-wide">Export PDF</button>
                <button onClick={() => setYearGenderModal(false)} className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer" aria-label="Close">×</button>
              </div>
            </div>
            <div className="p-3 bg-white">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-teal-300">
                    {['Year', 'Course', 'Boys', 'Girls', 'Total'].map((h) => (
                      <th key={h} className="px-2.5 py-1.5 text-teal-800 font-bold whitespace-nowrap text-right text-[11px] uppercase tracking-wide [&:nth-child(1)]:text-left [&:nth-child(2)]:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const c = courseConfig[r.course as Course];
                    return r.isSubtotal ? (
                      <tr key={i} className="font-semibold text-teal-800 bg-teal-50/80 border-y border-teal-200">
                        <td className={tl + ' font-bold'}>{r.yrLabel}</td>
                        <td className={tl} />
                        {[r.boys, r.girls, r.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                      </tr>
                    ) : (
                      <tr key={i} className="border-b border-gray-100 hover:bg-teal-50/40 transition-colors">
                        <td className={tl + ' text-gray-400'}>{r.yrLabel}</td>
                        <td className={tl + ` ${c?.textColor ?? 'text-gray-700'} font-bold`}>{r.course}</td>
                        {[r.boys, r.girls, r.total].map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v}</td>)}
                      </tr>
                    );
                  })}
                  <tr className="text-white font-bold" style={{ background: '#0f766e' }}>
                    <td className={tl}>GRAND TOTAL</td><td className={tl} />
                    {[grand.boys, grand.girls, grand.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── Date-wise Admissions — Course Count modal ────────────────────────── */}
    {dateWiseModal && (() => {
      const grandTotal = dateTable.reduce((a, r) => a + r.total, 0);
      const grandByCourse = COURSES.reduce((acc, c) => {
        acc[c] = dateTable.reduce((a, r) => a + r.byCourse[c], 0);
        return acc;
      }, {} as Record<Course, number>);
      const tc = 'px-2.5 py-1 text-right tabular-nums text-xs';
      const tl = 'px-2.5 py-1 text-left text-xs';
      function fmtDate(iso: string) {
        const [y, m, d] = iso.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${d} ${months[parseInt(m) - 1]} ${y}`;
      }
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDateWiseModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border-2 border-violet-400 bg-violet-50 shadow-2xl w-full max-w-3xl mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b border-violet-300">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full shrink-0 bg-violet-400" />
                <p className="text-xs font-bold uppercase tracking-widest text-violet-700">Date-wise Admissions — Course Count</p>
                {feeAcademicYear && (
                  <span className="text-[10px] font-semibold text-violet-500/70 whitespace-nowrap">
                    {feeAcademicYear}{!academicYearFilter ? ' (current year)' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => feeAcademicYear && exportDatewiseAdmissionsReport(dateTable, feeAcademicYear)} className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 transition-colors cursor-pointer uppercase tracking-wide">Export PDF</button>
                <button onClick={() => setDateWiseModal(false)} className="rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors text-sm leading-none cursor-pointer" aria-label="Close">×</button>
              </div>
            </div>
            <div className="p-3 bg-white">
              {dateTable.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-400 text-center">No admission fee payments recorded for this selection.</p>
              ) : (
                <div className="overflow-x-auto overflow-y-auto no-scrollbar max-h-[60vh]">
                  <table className="w-full border-collapse">
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr className="bg-violet-50 border-b-2 border-violet-300">
                        {['Date', ...COURSES, 'Total'].map((h) => (
                          <th key={h} className="px-2.5 py-1.5 text-violet-800 font-bold whitespace-nowrap text-right text-[11px] uppercase tracking-wide [&:nth-child(1)]:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dateTable.map((r, i) => (
                        <tr key={r.date} className={`border-b border-gray-100 hover:bg-violet-50/40 transition-colors ${i % 2 === 1 ? 'bg-violet-50/20' : ''}`}>
                          <td className={tl + ' font-medium text-gray-700 whitespace-nowrap'}>{fmtDate(r.date)}</td>
                          {COURSES.map((c) => (
                            <td key={c} className={tc + ' text-gray-700'}>{r.byCourse[c]}</td>
                          ))}
                          <td className={tc + ' font-semibold text-gray-800'}>{r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                      <tr className="text-white font-bold" style={{ background: '#5b21b6' }}>
                        <td className={tl}>GRAND TOTAL</td>
                        {COURSES.map((c) => (
                          <td key={c} className={tc}>{grandByCourse[c]}</td>
                        ))}
                        <td className={tc}>{grandTotal}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
