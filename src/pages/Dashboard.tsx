import { useState, useMemo, useEffect, useLayoutEffect, useRef, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllStudents } from '../hooks/useAllStudents';
import { useSettings } from '../hooks/useSettings';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { getFeeRecordsByAcademicYear } from '../services/feeRecordService';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { getFeeOverridesByYear } from '../services/feeOverrideService';
import { Button } from '../components/common/Button';
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
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category } from '../types';
import { SMP_FEE_HEADS } from '../types';
import { AISummaryCard, CompactAIInsight } from '../components/dashboard/AISummaryCard';
import type { AISummaryPayload } from '../services/aiSummaryService';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
// Labels for the course-card flip cycle (4 adm types; total is always shown separately)
const COURSE_BREAK_LABELS = ['Regular', 'Lateral', 'SNQ', 'Repeater'] as const;

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
  onLabelDoubleClick?: () => void;
  animated?: boolean;
}

function StatCard({ label, value, total, bg, border, textColor, barFill, subText, breakdown, className = '', highlightLabel = false, highlightBreakdown = false, watermark, onClick, onLabelDoubleClick, animated = true }: StatCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border ${border} ${bg} p-4 flex flex-col gap-1.5 relative overflow-hidden ${className} ${onClick ? 'cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.025]' : ''}`}
      style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}
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
        <div
          className={`flex items-center gap-2 ${onLabelDoubleClick ? 'cursor-pointer select-none' : ''}`}
          onDoubleClick={onLabelDoubleClick ? (e) => { e.stopPropagation(); onLabelDoubleClick(); } : undefined}
          title={onLabelDoubleClick ? 'Double-click to export PDF' : undefined}
        >
          <span className={`w-1 h-3.5 rounded-full shrink-0 ${barFill}`} />
          <p className={`text-[15px] font-semibold uppercase tracking-wider ${textColor}`}>{label}</p>
        </div>
      ) : (
        <p
          className={`text-[11px] font-bold uppercase tracking-widest text-gray-400/80 truncate leading-tight ${onLabelDoubleClick ? 'cursor-pointer select-none' : ''}`}
          onDoubleClick={onLabelDoubleClick ? (e) => { e.stopPropagation(); onLabelDoubleClick(); } : undefined}
          title={onLabelDoubleClick ? 'Double-click to export PDF' : undefined}
        >
          {label}
        </p>
      )}
      <p className={`text-3xl font-black leading-none ${textColor}`}>
        <AnimNum value={value} />
      </p>
      <div className="mt-auto pt-2 space-y-1">
        <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full w-full rounded-full ${barFill}`}
            style={{
              transformOrigin: 'left',
              transform: animated ? `scaleX(${pct / 100})` : 'scaleX(0)',
              transition: animated ? 'transform 800ms cubic-bezier(0.4,0,0.2,1)' : 'none',
            }}
          />
        </div>
        {breakdown ? (
          <div className="flex flex-wrap gap-y-1 pt-0.5 items-center">
            {breakdown.map((b, i) => (
              <span key={b.label} className="flex items-center text-[10px] tabular-nums whitespace-nowrap">
                {i > 0 && <span className="w-px h-3 bg-current opacity-20 mx-1.5 shrink-0" />}
                {highlightBreakdown ? (
                  <span className={`font-semibold ${textColor}`}>{b.label}</span>
                ) : (
                  <span className="text-gray-400 font-medium">{b.label}</span>
                )}
                <span className="font-bold text-gray-600 ml-1">{b.value}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">{subText ?? (total > 0 ? `${pct}% of total` : '—')}</p>
        )}
      </div>
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
            <div className="col-span-2 rounded-2xl border border-sky-400 bg-sky-50 h-24 animate-pulse" />
            <div className="rounded-2xl border border-sky-400 bg-sky-50 h-24 animate-pulse" />
            <div className="rounded-2xl border border-rose-400 bg-rose-50 h-24 animate-pulse" />
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
  const [courseModalCourse, setCourseModalCourse] = useState<Course | null>(null);
  const [yearModalYear, setYearModalYear] = useState<Year | null>(null);
  const [genderModal, setGenderModal] = useState<'BOY' | 'GIRL' | null>(null);
  const [totalModal, setTotalModal] = useState(false);
  const [intakeModal, setIntakeModal] = useState(false);

  // ── Collect Fee from dashboard search (admin only) ───────────────────────
  const [collectFeeStudent, setCollectFeeStudent] = useState<Student | null>(null);

  // ── Course card breakup flip (0=total, 1=REG, 2=LAT, 3=SNQ, 4=RPT) ──────
  const [courseBreakIdx, setCourseBreakIdx] = useState(0);
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
      for (const r of allRecords) {
        const smpSum = SMP_FEE_HEADS.reduce((t, { key }) => t + (r.smp[key] ?? 0), 0);
        const addlSum = (r.additionalPaid ?? []).reduce((t, h) => t + h.amount, 0);
        paidByStudent.set(r.studentId, (paidByStudent.get(r.studentId) ?? 0) + smpSum + r.svk + addlSum);
      }

      // Total allotted per `${academicYear}__${course}__${year}__${admType}__${admCat}` (structure fallback)
      const allottedByKey = new Map<string, number>();
      for (const fs of allStructures) {
        const structKey = `${fs.academicYear}__${fs.course}__${fs.year}__${fs.admType}__${fs.admCat}`;
        const smpSum = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (fs.smp[k] ?? 0), 0);
        const addlSum = (fs.additionalHeads ?? []).reduce((t, h) => t + h.amount, 0);
        allottedByKey.set(structKey, smpSum + fs.svk + addlSum);
      }

      // Override allotted per studentId (takes precedence over structure)
      const overrideByStudent = new Map<string, number>();
      for (const o of allOverrides) {
        const smpSum = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (o.smp[k] ?? 0), 0);
        const addlSum = (o.additionalHeads ?? []).reduce((t, h) => t + h.amount, 0);
        overrideByStudent.set(o.studentId, smpSum + o.svk + addlSum);
      }

      const statusMap = new Map<string, FeeStatus>();
      for (const s of searchResults) {
        const paid = paidByStudent.get(s.id) ?? 0;
        let allotted: number | null;
        if (overrideByStudent.has(s.id)) {
          allotted = overrideByStudent.get(s.id)!;
        } else {
          const allottedKey = `${s.academicYear}__${s.course}__${s.year}__${s.admType}__${s.admCat}`;
          allotted = allottedByKey.has(allottedKey) ? allottedByKey.get(allottedKey)! : null;
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
        let allotted: number | null;
        if (overrideByStudent.has(s.id)) {
          allotted = overrideByStudent.get(s.id)!;
        } else {
          const allottedKey = `${s.academicYear}__${s.course}__${s.year}__${s.admType}__${s.admCat}`;
          allotted = allottedByKey.has(allottedKey) ? allottedByKey.get(allottedKey)! : null;
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

    return { total, boys, girls, byCourse, byYear, byStatus, byAdmType, summaryTable, catTable, byCourseByYear, byYearByCourse, firstYearSeats, byGenderByCourseByYear, byGenderByCategory, byGenderByCatByCourseByYear };
  }, [filteredStudents, admStatusFilter]);

  const confirmedStudents = useMemo(
    () => admStatusFilter
      ? filteredStudents
      : filteredStudents.filter((s) => s.admissionStatus === 'CONFIRMED'),
    [filteredStudents, admStatusFilter],
  );

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
  }, [isSearchMode, academicYearFilter, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, admStatusFilter]);

  // Cycle course-card breakup display; reset to total whenever the view resets
  useEffect(() => {
    if (!barsReady || isSearchMode) {
      setCourseBreakIdx(0);
      return;
    }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => setCourseBreakIdx((i) => (i + 1) % COURSE_BREAK_LABELS.length), 6000);
    }, 1200);
    return () => {
      clearTimeout(delayId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [barsReady, isSearchMode]);

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

  const prevYearStats = useMemo(() => {
    if (isSearchMode || !academicYearFilter) return null;
    const idx = sortedAcademicYears.indexOf(academicYearFilter);
    if (idx === -1 || idx >= sortedAcademicYears.length - 1) return null;
    const prevYear = sortedAcademicYears[idx + 1];
    const prev = allStudents.filter(
      (s) => s.academicYear === prevYear && s.admissionStatus === 'CONFIRMED'
    );
    const byCourse: Record<string, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    for (const s of prev) { if (s.course in byCourse) byCourse[s.course]++; }
    return {
      academicYear: prevYear,
      total: prev.length,
      boys: prev.filter((s) => s.gender === 'BOY').length,
      girls: prev.filter((s) => s.gender === 'GIRL').length,
      byCourse,
    };
  }, [isSearchMode, academicYearFilter, sortedAcademicYears, allStudents]);

  // ── All-years aggregate stats (for AI overall context) ───────────────────
  const overallAIStats = useMemo(() => {
    const confirmed = allStudents.filter((s) => s.admissionStatus === 'CONFIRMED');
    const byCourse: Record<string, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    const byCategory: Record<string, number> = { GM: 0, SC: 0, ST: 0, C1: 0, '2A': 0, '2B': 0, '3A': 0, '3B': 0 };
    const byGenderByCourse: Record<string, Record<string, number>> = {
      BOY:  { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
      GIRL: { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 },
    };
    for (const s of confirmed) {
      if (s.course in byCourse) byCourse[s.course]++;
      if (s.category in byCategory) byCategory[s.category]++;
      if (s.gender in byGenderByCourse && s.course in byGenderByCourse[s.gender]) {
        byGenderByCourse[s.gender][s.course]++;
      }
    }
    return {
      total: confirmed.length,
      boys: confirmed.filter((s) => s.gender === 'BOY').length,
      girls: confirmed.filter((s) => s.gender === 'GIRL').length,
      byCourse,
      byCategory,
      byGenderByCourse,
    };
  }, [allStudents]);

  // ── Current active academic year stats ────────────────────────────────────
  const currentYearAIStats = useMemo(() => {
    const cy = settings?.currentAcademicYear;
    if (!cy) return null;
    const confirmed = allStudents.filter((s) => s.academicYear === cy && s.admissionStatus === 'CONFIRMED');
    const byCourse: Record<string, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    for (const s of confirmed) { if (s.course in byCourse) byCourse[s.course]++; }
    return {
      total: confirmed.length,
      boys: confirmed.filter((s) => s.gender === 'BOY').length,
      girls: confirmed.filter((s) => s.gender === 'GIRL').length,
      byCourse,
    };
  }, [allStudents, settings]);

  const aiPayload = useMemo<AISummaryPayload>(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const yr = isSearchMode ? '' : (academicYearFilter || settings?.currentAcademicYear || '');
    const recentEnrollmentsCount = allStudents.filter(
      (s) => (!yr || s.academicYear === yr) &&
        s.admissionStatus === 'CONFIRMED' &&
        new Date(s.createdAt).getTime() > cutoff,
    ).length;

    const byAdmCat: Record<string, number> = { GM: 0, SNQ: 0, OTHERS: 0 };
    for (const s of confirmedStudents) {
      const k = s.admCat in byAdmCat ? s.admCat : 'OTHERS';
      byAdmCat[k]++;
    }

    return {
      academicYear: yr,
      total: stats.total,
      boys: stats.boys,
      girls: stats.girls,
      byCourse: stats.byCourse as Record<string, number>,
      byYear: stats.byYear as Record<string, number>,
      byAdmType: stats.byAdmType,
      pendingTotal: admissionPendingStats?.total ?? 0,
      pendingRegular: admissionPendingStats?.totalRegular ?? 0,
      pendingLateral: admissionPendingStats?.totalLateral ?? 0,
      byCourseByYear: stats.byCourseByYear as Record<string, Record<string, number>>,
      byCategory: Object.fromEntries(
        ['SC', 'ST', 'C1', '2A', '2B', '3A', '3B', 'GM'].map((cat) => [
          cat,
          (stats.byGenderByCategory['BOY'][cat] ?? 0) + (stats.byGenderByCategory['GIRL'][cat] ?? 0),
        ]),
      ),
      byGenderByCourse: {
        BOY:  Object.fromEntries(COURSES.map((c) => [c, YEARS.reduce((a, yr2) => a + (stats.byGenderByCourseByYear['BOY'][c][yr2] ?? 0), 0)])),
        GIRL: Object.fromEntries(COURSES.map((c) => [c, YEARS.reduce((a, yr2) => a + (stats.byGenderByCourseByYear['GIRL'][c][yr2] ?? 0), 0)])),
      },
      recentEnrollmentsCount,
      byAdmCat,
      ...(prevYearStats && {
        prevAcademicYear: prevYearStats.academicYear,
        prevTotal: prevYearStats.total,
        prevBoys: prevYearStats.boys,
        prevGirls: prevYearStats.girls,
        prevByCourse: prevYearStats.byCourse,
      }),
      currentAcademicYear: settings?.currentAcademicYear ?? '',
      overallTotal: overallAIStats.total,
      overallBoys: overallAIStats.boys,
      overallGirls: overallAIStats.girls,
      overallByCourse: overallAIStats.byCourse,
      overallByCategory: overallAIStats.byCategory,
      overallByGenderByCourse: overallAIStats.byGenderByCourse,
      ...(currentYearAIStats && {
        currentYearTotal: currentYearAIStats.total,
        currentYearBoys: currentYearAIStats.boys,
        currentYearGirls: currentYearAIStats.girls,
        currentYearByCourse: currentYearAIStats.byCourse,
      }),
    };
  }, [stats, confirmedStudents, allStudents, admissionPendingStats, academicYearFilter, isSearchMode, settings, prevYearStats, overallAIStats, currentYearAIStats]);

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

  const yearConfig: Record<Year, { label: string; bg: string; border: string; textColor: string; barFill: string }> = {
    '1ST YEAR': { label: '1st Year', bg: 'bg-lime-50',     border: 'border-lime-400',     textColor: 'text-lime-700',     barFill: 'bg-lime-400'     },
    '2ND YEAR': { label: '2nd Year', bg: 'bg-emerald-50',  border: 'border-emerald-400',  textColor: 'text-emerald-700',  barFill: 'bg-emerald-400'  },
    '3RD YEAR': { label: '3rd Year', bg: 'bg-teal-50',     border: 'border-teal-400',     textColor: 'text-teal-700',     barFill: 'bg-teal-400'     },
  };


  if (loading) return <LoadingGate />;

  return (
    <>
    <div className="h-full flex flex-col gap-1.5" style={{ animation: 'page-enter 0.22s ease-out' }}>

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

      {/* ── Year chips bar ──────────────────────────────────────────────── */}
      {allStudents.length > 0 && (
        <div
          className="flex-shrink-0 bg-white/40 rounded-lg border border-emerald-100/70 flex items-center gap-1 px-1.5 py-1.5"
          style={{ boxShadow: '0 1px 3px 0 rgba(16,185,129,0.05)' }}
        >
          {/* Left arrow */}
          <button
            type="button"
            onClick={() => scrollChips('left')}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer text-xl leading-none select-none"
            aria-label="Scroll left"
          >
            ‹
          </button>

          {/* Labels — scrollable, no scrollbar */}
          <div ref={chipsScrollRef} className="chips-scroll flex items-center gap-4 flex-1">
            {/* Total label */}
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
            <span className="w-px h-3.5 rounded-full bg-emerald-200 shrink-0" />
            {/* Per-year labels */}
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

          {/* Right arrow */}
          <button
            type="button"
            onClick={() => scrollChips('right')}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer text-xl leading-none select-none"
            aria-label="Scroll right"
          >
            ›
          </button>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white/50 rounded-lg border border-emerald-100/70 overflow-hidden" style={{ backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scroll-emerald px-3 py-1">
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
            <option value="CONFIRMED">CONFIRMED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="PENDING">PENDING</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="shrink-0 rounded-lg border border-amber-300 px-2 py-1.5 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer transition-colors font-semibold whitespace-nowrap"
            >
              Clear
            </button>
          )}
          {!isSearchMode && academicYearFilter && (
            <button
              onClick={() => exportSummaryReport(allStudents.filter((s) => s.academicYear === academicYearFilter && s.admissionStatus === 'CONFIRMED'), academicYearFilter)}
              className="flex items-center gap-1.5 group cursor-pointer shrink-0 ml-auto"
              title="Export Summary PDF"
            >
              <span className="w-1 h-3.5 rounded-full shrink-0 bg-emerald-400 group-hover:bg-emerald-600 transition-colors" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 group-hover:text-emerald-800 transition-colors">Summary</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Pending Admissions strip ───────────────────────────────────── */}
      {admissionPendingStats && (
        <div
          className="flex-shrink-0 rounded-lg border flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors group"
          style={{
            background: 'linear-gradient(90deg, #f0fdf4 0%, #f0fdf8 60%, #ecfdf5 100%)',
            borderColor: '#6ee7b7',
            boxShadow: '0 2px 8px 0 rgba(16,185,129,0.10), 0 1px 3px -1px rgba(16,185,129,0.08)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(90deg, #ecfdf5 0%, #d1fae5 60%, #ecfdf5 100%)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'linear-gradient(90deg, #f0fdf4 0%, #f0fdf8 60%, #ecfdf5 100%)'; }}
          onClick={() => void navigate('/admissions')}
        >
          {/* Leaf accent dot */}
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" style={{ boxShadow: '0 0 0 2px #a7f3d0' }} />

          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/80 shrink-0 whitespace-nowrap">
            Pending Admissions
          </span>
          <span className="text-[10px] text-emerald-300 font-medium shrink-0">·</span>
          <span className="text-[10px] font-semibold text-emerald-500/70 shrink-0 whitespace-nowrap">
            {admissionPendingStats.academicYear}
          </span>

          <span className="text-emerald-200 text-xs select-none shrink-0">|</span>

          {/* Regular pending */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] font-semibold text-emerald-500 uppercase tracking-wide">Reg</span>
            <span className="text-sm font-black tabular-nums text-emerald-800">
              <AnimNum value={admissionPendingStats.totalRegular} />
            </span>
          </div>

          <span className="text-emerald-200 text-xs select-none shrink-0">|</span>

          {/* Lateral pending */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] font-semibold text-teal-500 uppercase tracking-wide">Lat</span>
            <span className="text-sm font-black tabular-nums text-teal-700">
              <AnimNum value={admissionPendingStats.totalLateral} />
            </span>
          </div>

          <span className="text-emerald-200 text-xs select-none shrink-0">·</span>

          {/* Per-course counts */}
          <div className="flex items-center gap-0 flex-wrap">
            {COURSES.map((course, i) => {
              const c = courseConfig[course];
              const reg = admissionPendingStats.byCourseRegular[course];
              const lat = admissionPendingStats.byCourseLatear[course];
              const isEmpty = reg === 0 && lat === 0;
              return (
                <div key={course} className={`flex items-center shrink-0 ${isEmpty ? 'opacity-25' : ''}`}>
                  {i > 0 && <span className="w-[1.5px] h-3.5 bg-emerald-300 mx-3 shrink-0 rounded-full" />}
                  <span className={`text-xs font-bold uppercase ${c.textColor} mr-1`}>{course}</span>
                  <span className={`text-xs font-black tabular-nums ${c.textColor}`}>
                    <AnimNum value={reg} />
                  </span>
                  <span className="w-px h-2.5 bg-emerald-200 mx-1 shrink-0" />
                  <span className="text-xs font-black tabular-nums text-teal-600">
                    <AnimNum value={lat} />
                  </span>
                </div>
              );
            })}
          </div>

          <span className="ml-auto text-[10px] text-emerald-400 group-hover:text-emerald-700 font-semibold shrink-0 transition-colors whitespace-nowrap">
            View →
          </span>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>
      ) : isSearchMode ? (

        /* ── Search results ─────────────────────────────────────────── */
        <div className="flex-1 min-h-0 overflow-auto space-y-3 scroll-y-thin">
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
                          className="hover:bg-emerald-50/50 transition-colors cursor-context-menu"
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
        <div className="flex-1 min-h-0 overflow-auto pb-4 scroll-y-thin -mx-2 px-2">
          <div className="space-y-3 min-w-0 mt-1">

            {/* Overview row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Total card */}
              <div
                onClick={() => setTotalModal(true)}
                className="rounded-2xl border border-sky-400 p-3 flex flex-col gap-1 relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.025]"
                style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)', boxShadow: '0 2px 8px 0 rgba(14,165,233,0.18)' }}
              >
                <span aria-hidden="true" className="absolute -bottom-3 -right-2 text-8xl font-black leading-none select-none pointer-events-none text-sky-600 opacity-[0.05]">
                  ALL
                </span>
                <div
                  className="flex items-center gap-2 cursor-pointer select-none"
                  onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents, displayYear, 'All Courses — Admission Type-wise Count'); }}
                  title="Double-click to export PDF"
                >
                  <span className="w-1 h-3.5 rounded-full shrink-0 bg-sky-400" />
                  <p className="text-[15px] font-semibold uppercase tracking-wider text-sky-700">Total Enrolled</p>
                </div>
                <p className="text-3xl font-black leading-none text-sky-700">
                  <AnimNum value={stats.total} />
                </p>
                <div className="mt-auto space-y-0.5">
                  <p className="text-xs text-sky-500/80 font-medium">{stats.boys} Boys · {stats.girls} Girls</p>
                  <div className="flex items-center">
                    {YEARS.map((yr, i) => {
                      const y = yearConfig[yr];
                      return (
                        <span key={yr} className="flex items-center text-xs tabular-nums whitespace-nowrap">
                          {i > 0 && <span className={`w-px h-3 ${y.barFill} opacity-30 mx-1.5 shrink-0`} />}
                          <span className={`font-semibold ${y.textColor}`}>{i + 1}Y</span>
                          <span className="font-bold text-gray-700 ml-1">{stats.byYear[yr]}</span>
                        </span>
                      );
                    })}
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
                    className="rounded-2xl border border-sky-300 px-3 pt-4 pb-2 flex flex-col relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.025]"
                    style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)', boxShadow: '0 2px 8px 0 rgba(14,165,233,0.10)' }}
                  >
                    {/* Label (left) + year breakdown (right) */}
                    <div className="flex items-center justify-between mb-1.5 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-3.5 rounded-full shrink-0 bg-sky-400" />
                        <p className="text-[15px] font-semibold uppercase tracking-wider text-sky-700 leading-none">Total</p>
                        <span className="text-[13px] font-black text-sky-700/60 tabular-nums leading-none">{overallPct}%</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        {YEARS.map((yr, i) => {
                          const yrPct = Math.round((stats.byYear[yr] / YEAR_INTAKE) * 100);
                          return (
                            <span key={yr} className="flex items-baseline gap-0.5">
                              <span className="text-[9px] font-semibold text-sky-400/70 leading-none">{i + 1}Y</span>
                              <span className="text-[11px] font-bold text-sky-500/80 tabular-nums leading-none">{yrPct}%</span>
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
                                  className="text-[10px] font-bold text-sky-600/80 tabular-nums leading-none mb-0.5"
                                  style={{
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
                                    background: 'rgba(56,189,248,0.28)',
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
                            <span className="text-[9px] font-bold text-sky-500/60 leading-none">{course}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* AI insight — full-card overlay, cycles with the bar chart */}
                    <CompactAIInsight payload={aiPayload} />
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
                    onDoubleClick={(e) => { e.stopPropagation(); exportGenderCourseYearReport(confirmedStudents.filter((s) => s.gender === 'BOY'), displayYear, 'Boys — Year & Course Breakdown'); }}
                    className="rounded-2xl border border-sky-400 bg-sky-50 p-4 flex flex-col gap-1.5 relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.025]"
                    style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}
                  >
                    <span aria-hidden="true" className="absolute -bottom-3 -right-2 text-8xl font-black leading-none select-none pointer-events-none text-sky-700 opacity-[0.07]">B</span>
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full shrink-0 bg-sky-400" />
                      <p className="text-[15px] font-semibold uppercase tracking-wider text-sky-700">Boys</p>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold leading-none text-sky-700 opacity-50">Total</span>
                        <p className="text-3xl font-black leading-none text-sky-700"><AnimNum value={boysTotal} /></p>
                      </div>
                      <div className="flex flex-col gap-0.5 items-center w-16 shrink-0 opacity-[0.42]">
                        <SlotTicker label={boysBreakCourse} value={boysBreakVal} textColor="text-sky-700" />
                      </div>
                    </div>
                    <div className="mt-auto pt-2 space-y-1">
                      <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
                        <div
                          className="h-full w-full rounded-full bg-sky-400"
                          style={{
                            transformOrigin: "left",
                            transform: barsReady ? `scaleX(${boysPct / 100})` : 'scaleX(0)',
                            transition: barsReady ? 'transform 800ms cubic-bezier(0.4,0,0.2,1)' : 'none',
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-400">{stats.total > 0 ? `${boysPct}% of total` : '—'}</p>
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
                    onDoubleClick={(e) => { e.stopPropagation(); exportGenderCourseYearReport(confirmedStudents.filter((s) => s.gender === 'GIRL'), displayYear, 'Girls — Year & Course Breakdown'); }}
                    className="rounded-2xl border border-rose-400 bg-rose-50 p-4 flex flex-col gap-1.5 relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.025]"
                    style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}
                  >
                    <span aria-hidden="true" className="absolute -bottom-3 -right-2 text-8xl font-black leading-none select-none pointer-events-none text-rose-600 opacity-[0.07]">G</span>
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-3.5 rounded-full shrink-0 bg-rose-400" />
                      <p className="text-[15px] font-semibold uppercase tracking-wider text-rose-600">Girls</p>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold leading-none text-rose-600 opacity-50">Total</span>
                        <p className="text-3xl font-black leading-none text-rose-600"><AnimNum value={girlsTotal} /></p>
                      </div>
                      <div className="flex flex-col gap-0.5 items-center w-16 shrink-0 opacity-[0.42]">
                        <SlotTicker label={girlsBreakCourse} value={girlsBreakVal} textColor="text-rose-600" />
                      </div>
                    </div>
                    <div className="mt-auto pt-2 space-y-1">
                      <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
                        <div
                          className="h-full w-full rounded-full bg-rose-400"
                          style={{
                            transformOrigin: "left",
                            transform: barsReady ? `scaleX(${girlsPct / 100})` : 'scaleX(0)',
                            transition: barsReady ? 'transform 800ms cubic-bezier(0.4,0,0.2,1)' : 'none',
                          }}
                        />
                      </div>
                      <p className="text-xs text-gray-400">{stats.total > 0 ? `${girlsPct}% of total` : '—'}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* By Course */}
            <div>
              <SectionLabel accent={{ bar: 'bg-emerald-500', text: 'text-emerald-700' }} onDoubleClick={() => exportSummaryReport(confirmedStudents, displayYear)}>By Course</SectionLabel>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {COURSES.map((course) => {
                  const c = courseConfig[course];
                  const courseTotal = stats.byCourse[course];
                  const pct = stats.total > 0 ? Math.round((courseTotal / stats.total) * 100) : 0;
                  const admTotals = courseAdmTotals[course];
                  const displayValue =
                    courseBreakIdx === 0 ? admTotals.regular
                    : courseBreakIdx === 1 ? admTotals.ltrl
                    : courseBreakIdx === 2 ? admTotals.snq
                    : admTotals.rptr;
                  const breakLabel = COURSE_BREAK_LABELS[courseBreakIdx];
                  return (
                    <div
                      key={course}
                      onClick={() => setCourseModalCourse(course)}
                      className={`rounded-2xl border ${c.border} ${c.bg} p-4 flex flex-col gap-1.5 relative overflow-hidden cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.025]`}
                      style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}
                    >
                      {/* Watermark */}
                      <span aria-hidden="true" className={`absolute -bottom-3 -right-2 text-8xl font-black leading-none select-none pointer-events-none ${c.textColor} opacity-[0.07]`}>
                        {course}
                      </span>
                      {/* Label */}
                      <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents.filter((s) => s.course === course), displayYear, `${course} — Admission Type-wise Count`); }}
                        title="Double-click to export PDF"
                      >
                        <span className={`w-1 h-3.5 rounded-full shrink-0 ${c.barFill}`} />
                        <p className={`text-[15px] font-semibold uppercase tracking-wider ${c.textColor}`}>{course}</p>
                      </div>
                      {/* Total (left, permanent) + cycling breakup (right, animated) */}
                      <div className="flex items-end justify-between">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-xs font-bold leading-none ${c.textColor} opacity-50`}>Total</span>
                          <p className={`text-3xl font-black leading-none tabular-nums ${c.textColor}`}>{courseTotal}</p>
                        </div>
                        <div className="flex flex-col gap-0.5 items-center w-16 shrink-0 opacity-[0.42]">
                          <SlotTicker label={breakLabel} value={displayValue} textColor={c.textColor} />
                        </div>
                      </div>
                      {/* Progress bar + year breakdown */}
                      <div className="mt-auto pt-2 space-y-1">
                        <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full w-full rounded-full ${c.barFill}`}
                            style={{
                              transformOrigin: 'left',
                              transform: barsReady ? `scaleX(${pct / 100})` : 'scaleX(0)',
                              transition: barsReady ? 'transform 800ms cubic-bezier(0.4,0,0.2,1)' : 'none',
                            }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-y-1 pt-0.5 items-center">
                          {YEARS.map((yr, i) => (
                            <span key={yr} className="flex items-center text-xs tabular-nums whitespace-nowrap">
                              {i > 0 && <span className={`w-px h-3 ${c.barFill} opacity-30 mx-1.5 shrink-0`} />}
                              <span className="text-gray-400 font-semibold">{i + 1}Y</span>
                              <span className="font-bold text-gray-700 ml-1">{stats.byCourseByYear[course][yr]}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Year of Study */}
            <div>
              <SectionLabel accent={{ bar: 'bg-teal-500', text: 'text-teal-700' }} onDoubleClick={() => exportSummaryReport(confirmedStudents, displayYear)}>By Year of Study</SectionLabel>
              <div className="grid grid-cols-3 gap-3">
                {YEARS.map((year) => {
                  const y = yearConfig[year];
                  const wm = year === '1ST YEAR' ? '1st' : year === '2ND YEAR' ? '2nd' : '3rd';
                  const yrShort = year === '1ST YEAR' ? '1st Yr' : year === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
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
                      highlightLabel
                      highlightBreakdown
                      watermark={wm}
                      onClick={() => setYearModalYear(year)}
                      onLabelDoubleClick={() => exportSummaryReport(confirmedStudents.filter((s) => s.year === year), displayYear, `${yrShort} — Admission Type-wise Count`)}
                      animated={barsReady}
                    />
                  );
                })}
              </div>
            </div>

            {/* 1st Year Pending Seats */}
            <div>
              <SectionLabel accent={{ bar: 'bg-amber-400', text: 'text-amber-700' }} onDoubleClick={() => exportFirstYearSeatsReport(stats.firstYearSeats, displayYear)}>1st Year — Pending Seats</SectionLabel>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {COURSES.map((course) => {
                  const c = courseConfig[course];
                  const { nonSnqConfirmed, snqConfirmed } = stats.firstYearSeats[course];
                  const snqAllotted = snqConfirmed > 0;

                  // Regular seats: first 60 slots go to non-SNQ students
                  const regularFilled    = Math.min(nonSnqConfirmed, 60);
                  const regularPending   = Math.max(0, 60 - regularFilled);
                  const overflowToSnq    = Math.max(0, nonSnqConfirmed - 60); // enrolled beyond 60
                  const regularFillPct   = Math.min(100, Math.round((regularFilled / 60) * 100));

                  // SNQ seats: if allotted use admCat count; otherwise use overflow as estimate
                  const snqFilled  = snqAllotted ? snqConfirmed : overflowToSnq;
                  const snqPending = Math.max(0, 3 - snqFilled);

                  return (
                    <div key={course} className={`rounded-2xl border ${c.border} ${c.bg} p-4 flex flex-col gap-2 relative overflow-hidden`} style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10)' }}>
                      <span aria-hidden="true" className={`absolute -bottom-3 -right-2 text-8xl font-black leading-none select-none pointer-events-none ${c.textColor} opacity-[0.07]`}>{course}</span>
                      <div className="flex items-center gap-2">
                        <span className={`w-1 h-3.5 rounded-full shrink-0 ${c.barFill}`} />
                        <p className={`text-[15px] font-semibold uppercase tracking-wider ${c.textColor}`}>{course}</p>
                      </div>

                      {/* Regular seats */}
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
                        <p className="text-[10px] text-gray-400 tabular-nums">{regularFilled} / 60 filled</p>
                      </div>

                      {/* SNQ seats */}
                      <div className="pt-1.5 border-t border-white/50 flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 font-semibold">SNQ</span>
                            {!snqAllotted && (
                              <span className="px-1 py-px rounded text-[8px] font-bold bg-amber-100 border border-amber-300 text-amber-600 leading-tight whitespace-nowrap">
                                To be allotted
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 tabular-nums">
                            {snqFilled} / 3 {snqAllotted ? 'filled' : 'pre-filled'}
                          </p>
                        </div>
                        <span className={`text-lg font-black tabular-nums shrink-0 ${snqPending === 0 ? 'text-emerald-600' : snqAllotted ? 'text-gray-600' : 'text-amber-500'}`}>
                          <AnimNum value={snqPending} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Course Strength + Adm Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Course-wise vertical bar chart — cycling modes */}
              {(() => {
                type BarSpec = { fill: string; text: string; label: string };
                type ChartMode = {
                  title: string; subtitle: string; accent: string;
                  titleClass: string; subtitleClass: string; footerLabelClass: string;
                  cardBg: string; cardBorder: string; dividerColor: string; inactiveDot: string;
                  bars: [BarSpec, BarSpec, BarSpec];
                  getValue: (course: Course, bi: number) => number;
                  footerLabel: (bi: number) => string;
                  footerTotal: (bi: number) => number;
                };
                const modes: ChartMode[] = [
                  {
                    title: 'Course Strength', subtitle: 'confirmed · all years',
                    accent: 'text-emerald-500', titleClass: 'text-emerald-800',
                    subtitleClass: 'text-emerald-500/70', footerLabelClass: 'text-emerald-500/70',
                    cardBg: '#ecfdf5', cardBorder: '#6ee7b7', dividerColor: '#a7f3d0', inactiveDot: 'bg-emerald-300',
                    bars: [
                      { fill: 'bg-lime-400',    text: 'text-lime-700',    label: '1st' },
                      { fill: 'bg-green-500',   text: 'text-green-700',   label: '2nd' },
                      { fill: 'bg-emerald-700', text: 'text-emerald-800', label: '3rd' },
                    ],
                    getValue:    (c, i) => stats.byCourseByYear[c][YEARS[i]!],
                    footerLabel: (i)    => ['1st Yr', '2nd Yr', '3rd Yr'][i],
                    footerTotal: (i)    => COURSES.reduce((s, c) => s + stats.byCourseByYear[c][YEARS[i]!], 0),
                  },
                  {
                    title: 'Boys', subtitle: 'confirmed · by course & year',
                    accent: 'text-sky-500', titleClass: 'text-sky-800',
                    subtitleClass: 'text-sky-500/70', footerLabelClass: 'text-sky-500/70',
                    cardBg: '#f0f9ff', cardBorder: '#7dd3fc', dividerColor: '#bae6fd', inactiveDot: 'bg-sky-300',
                    bars: [
                      { fill: 'bg-sky-300', text: 'text-sky-500', label: '1st' },
                      { fill: 'bg-sky-500', text: 'text-sky-700', label: '2nd' },
                      { fill: 'bg-sky-700', text: 'text-sky-800', label: '3rd' },
                    ],
                    getValue:    (c, i) => stats.byGenderByCourseByYear['BOY'][c][YEARS[i]!],
                    footerLabel: (i)    => ['1st Yr', '2nd Yr', '3rd Yr'][i],
                    footerTotal: (i)    => COURSES.reduce((s, c) => s + stats.byGenderByCourseByYear['BOY'][c][YEARS[i]!], 0),
                  },
                  {
                    title: 'Girls', subtitle: 'confirmed · by course & year',
                    accent: 'text-rose-500', titleClass: 'text-rose-800',
                    subtitleClass: 'text-rose-500/70', footerLabelClass: 'text-rose-500/70',
                    cardBg: '#fff1f2', cardBorder: '#fda4af', dividerColor: '#fecdd3', inactiveDot: 'bg-rose-300',
                    bars: [
                      { fill: 'bg-rose-300', text: 'text-rose-500', label: '1st' },
                      { fill: 'bg-rose-500', text: 'text-rose-600', label: '2nd' },
                      { fill: 'bg-rose-700', text: 'text-rose-800', label: '3rd' },
                    ],
                    getValue:    (c, i) => stats.byGenderByCourseByYear['GIRL'][c][YEARS[i]!],
                    footerLabel: (i)    => ['1st Yr', '2nd Yr', '3rd Yr'][i],
                    footerTotal: (i)    => COURSES.reduce((s, c) => s + stats.byGenderByCourseByYear['GIRL'][c][YEARS[i]!], 0),
                  },
                  {
                    title: 'Adm Type', subtitle: 'regular · lateral · snq',
                    accent: 'text-amber-600', titleClass: 'text-amber-900',
                    subtitleClass: 'text-amber-600/70', footerLabelClass: 'text-amber-600/70',
                    cardBg: '#fffbeb', cardBorder: '#fcd34d', dividerColor: '#fde68a', inactiveDot: 'bg-amber-300',
                    bars: [
                      { fill: 'bg-amber-400',  text: 'text-amber-700',  label: 'Reg' },
                      { fill: 'bg-violet-400', text: 'text-violet-700', label: 'Lat' },
                      { fill: 'bg-cyan-500',   text: 'text-cyan-700',   label: 'SNQ' },
                    ],
                    getValue:    (c, i) => ([courseAdmTotals[c].regular, courseAdmTotals[c].ltrl, courseAdmTotals[c].snq])[i] ?? 0,
                    footerLabel: (i)    => ['Regular', 'Lateral', 'SNQ'][i],
                    footerTotal: (i)    => COURSES.reduce((s, c) => s + (([courseAdmTotals[c].regular, courseAdmTotals[c].ltrl, courseAdmTotals[c].snq])[i] ?? 0), 0),
                  },
                ];

                const mode = modes[barChartMode];
                const CHART_H = 148;
                const maxBarCount = Math.max(1, ...COURSES.flatMap((c) => [0, 1, 2].map((i) => mode.getValue(c, i))));
                const BAR_COURSES: Record<Course, string> = {
                  CE: 'text-amber-600', ME: 'text-green-700', EC: 'text-sky-600', CS: 'text-teal-700', EE: 'text-violet-600',
                };

                return (
                <div
                  className="rounded-2xl p-4 flex flex-col border"
                  style={{
                    backgroundColor: mode.cardBg,
                    borderColor: mode.cardBorder,
                    boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)',
                    transition: 'background-color 700ms ease, border-color 700ms ease',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3 shrink-0">
                    <div key={barChartMode} style={{ animation: 'page-enter 0.28s ease-out' }}>
                      <div className="flex items-center gap-1.5">
                        <span className={`${mode.accent} font-black text-sm leading-none tracking-tighter select-none`}>//</span>
                        <p className={`text-xs font-semibold uppercase tracking-wider ${mode.titleClass}`}>{mode.title}</p>
                      </div>
                      <p className={`text-[10px] font-medium mt-0.5 ml-4 ${mode.subtitleClass}`}>{mode.subtitle}</p>
                    </div>
                    {/* Mode pill indicators — click to jump */}
                    <div className="flex items-center gap-1.5">
                      {modes.map((m, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setBarChartMode(i)}
                          className={`rounded-full cursor-pointer transition-all duration-300 ${
                            i === barChartMode
                              ? `w-4 h-2 ${m.bars[1].fill} opacity-90`
                              : `w-2 h-2 ${mode.inactiveDot} opacity-40 hover:opacity-70`
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Pill bars */}
                  <div className="flex gap-3 flex-1">
                    {COURSES.map((course, ci) => {
                      const courseTotal = [0, 1, 2].reduce((s, i) => s + mode.getValue(course, i), 0);
                      return (
                        <div key={course} className="flex-1 flex flex-col items-center gap-1">
                          {/* Course total above */}
                          <span
                            key={`${barChartMode}-${course}`}
                            className={`text-[11px] font-black tabular-nums leading-none ${BAR_COURSES[course]}`}
                            style={{
                              opacity: chartBarsReady ? 1 : 0,
                              transition: chartBarsReady ? `opacity 350ms ease-out ${ci * 70 + 480}ms` : 'none',
                            }}
                          >
                            {courseTotal}
                          </span>
                          {/* 3 pill bars */}
                          <div className="flex gap-1 w-full" style={{ height: CHART_H }}>
                            {([0, 1, 2] as const).map((bi) => {
                              const bar = mode.bars[bi];
                              const count = mode.getValue(course, bi);
                              const fillPct = count > 0 ? Math.max(6, Math.round((count / maxBarCount) * 100)) : 0;
                              return (
                                <div key={bi} className="flex-1 relative rounded-full overflow-hidden">
                                  <div
                                    className={`absolute bottom-0 left-0 right-0 rounded-full ${bar.fill}`}
                                    style={{
                                      height: chartBarsReady ? `${fillPct}%` : '0%',
                                      opacity: 0.88,
                                      transition: chartBarsReady
                                        ? `height 680ms cubic-bezier(0.34,1.08,0.64,1) ${(ci * 3 + bi) * 55}ms`
                                        : 'none',
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          {/* Course label */}
                          <span className={`text-[9px] font-bold leading-none ${BAR_COURSES[course]}`}>{course}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Divider */}
                  <div className="mt-3 border-t shrink-0" style={{ borderColor: mode.dividerColor, transition: 'border-color 700ms ease' }} />

                  {/* Footer totals */}
                  <div className="mt-2 grid grid-cols-3 shrink-0">
                    {([0, 1, 2] as const).map((bi) => {
                      const bar = mode.bars[bi];
                      return (
                        <div
                          key={bi}
                          className={`flex flex-row items-center justify-center gap-1 ${bi > 0 ? 'border-l' : ''}`}
                          style={{ borderColor: mode.dividerColor, transition: 'border-color 700ms ease' }}
                        >
                          <span className={`text-sm font-black tabular-nums ${bar.text}`}>{mode.footerTotal(bi)}</span>
                          <span className={`text-[9px] font-medium ${mode.footerLabelClass}`}>{mode.footerLabel(bi)}</span>
                        </div>
                      );
                    })}
                  </div>

                </div>
                );
              })()}

              {/* Dedicated AI Insights card — relative wrapper contributes 0 intrinsic height
                  so only the chart card sets the grid row height; absolute div fills the result */}
              <div className="relative">
                <div className="absolute inset-0 overflow-hidden rounded-2xl">
                  <AISummaryCard payload={aiPayload} />
                </div>
              </div>
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
                  <div className="bg-emerald-50 rounded-2xl border border-emerald-400 overflow-hidden" style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}>
                    <div
                      className="px-4 py-1.5 border-b border-emerald-100 flex items-center gap-2 cursor-pointer select-none"
                      onDoubleClick={() => exportCategoryReport(confirmedStudents, displayYear)}
                      title="Double-click to export PDF"
                    >
                      <span className="w-1 h-3.5 rounded-full shrink-0 bg-emerald-400" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Category-wise Count</p>
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
                  <div className="bg-sky-50 rounded-2xl border border-sky-400 overflow-hidden" style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}>
                    <div
                      className="px-4 py-1.5 border-b border-sky-100 flex items-center gap-2 cursor-pointer select-none"
                      onDoubleClick={() => exportSummaryReport(confirmedStudents, displayYear)}
                      title="Double-click to export PDF"
                    >
                      <span className="w-1 h-3.5 rounded-full shrink-0 bg-sky-400" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Admission Type-wise Count</p>
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

            {/* Gender stats — merged category+gender table + course-year-gender */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

              {/* Merged: Category-wise Gender Count by Year & Course */}
              {(() => {
                const CATS = ['GM','C1','2A','2B','3A','3B','SC','ST'] as const;
                type CatPair = { boys: number; girls: number };
                const tc = 'px-1.5 py-1 text-right tabular-nums text-[10px]';
                const tl = 'px-1.5 py-1 text-left text-[10px]';

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
                  <div className="bg-rose-50 rounded-2xl border border-rose-400 overflow-hidden flex flex-col h-full" style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}>
                    <div
                      className="px-4 py-1.5 border-b border-rose-100 shrink-0 flex items-center gap-2 cursor-pointer select-none"
                      onDoubleClick={() => exportGenderCategoryReport(confirmedStudents, displayYear)}
                      title="Double-click to export PDF"
                    >
                      <span className="w-1 h-3.5 rounded-full shrink-0 bg-rose-400" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Category &amp; Gender-wise Count</p>
                    </div>
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full h-full text-[10px] border-collapse">
                        <thead>
                          <tr style={{ background: 'linear-gradient(90deg, #9f1239, #be123c)' }}>
                            <th rowSpan={2} className="px-1.5 py-1.5 text-white font-semibold text-left align-middle whitespace-nowrap border-r border-rose-700">Year</th>
                            <th rowSpan={2} className="px-1.5 py-1.5 text-white font-semibold text-left align-middle whitespace-nowrap border-r border-rose-700">Course</th>
                            {CATS.map((cat) => (
                              <th key={cat} colSpan={2} className="px-1.5 py-1.5 text-white font-semibold text-center whitespace-nowrap border-l border-rose-700">{cat}</th>
                            ))}
                            <th colSpan={2} className="px-1.5 py-1.5 text-white font-semibold text-center whitespace-nowrap border-l border-rose-700">Total</th>
                          </tr>
                          <tr style={{ background: 'linear-gradient(90deg, #be123c, #e11d48)' }}>
                            {[...CATS, 'T' as const].flatMap((cat) => [
                              <th key={`${cat}-b`} className="px-1.5 py-0.5 text-[9px] text-white/80 font-medium text-right border-l border-rose-600">B</th>,
                              <th key={`${cat}-g`} className="px-1.5 py-0.5 text-[9px] text-white/80 font-medium text-right">G</th>,
                            ])}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => r.isSubtotal ? (
                            <tr key={i} className="text-white font-semibold" style={{ background: '#e11d48' }}>
                              <td className={tl}>{r.yrLabel}</td>
                              <td className={tl}>{r.course}</td>
                              {CATS.flatMap((cat) => [
                                <td key={`${cat}-b`} className={tc + ' border-l border-rose-300'}>{r.cats[cat].boys}</td>,
                                <td key={`${cat}-g`} className={tc}>{r.cats[cat].girls}</td>,
                              ])}
                              <td className={tc + ' border-l border-rose-300'}>{r.tB}</td>
                              <td className={tc}>{r.tG}</td>
                            </tr>
                          ) : (
                            <tr key={i} className="border-b border-rose-50 hover:bg-rose-50/40 transition-colors">
                              <td className={tl + ' text-gray-400'}>{r.yrLabel}</td>
                              <td className={tl + ' font-semibold text-gray-700'}>{r.course}</td>
                              {CATS.flatMap((cat) => [
                                <td key={`${cat}-b`} className={tc + ' text-gray-700 border-l border-rose-50'}>{r.cats[cat].boys}</td>,
                                <td key={`${cat}-g`} className={tc + ' text-gray-700'}>{r.cats[cat].girls}</td>,
                              ])}
                              <td className={tc + ' text-gray-800 font-semibold border-l border-rose-100'}>{r.tB}</td>
                              <td className={tc + ' text-gray-800 font-semibold'}>{r.tG}</td>
                            </tr>
                          ))}
                          <tr className="text-white font-bold" style={{ background: '#4c0519' }}>
                            <td className={tl}>GRAND TOTAL</td>
                            <td className={tl} />
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
                );
              })()}

              {/* Year & Course-wise Gender */}
              {(() => {
                const tc = 'px-2 py-1 text-right tabular-nums';
                const tl = 'px-2 py-1 text-left';
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
                  <div className="bg-teal-50 rounded-2xl border border-teal-400 overflow-hidden h-full flex flex-col" style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}>
                    <div
                      className="px-4 py-1.5 border-b border-teal-100 shrink-0 flex items-center gap-2 cursor-pointer select-none"
                      onDoubleClick={() => exportGenderCourseYearReport(confirmedStudents, displayYear)}
                      title="Double-click to export PDF"
                    >
                      <span className="w-1 h-3.5 rounded-full shrink-0 bg-teal-400" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Year &amp; Course-wise Gender</p>
                    </div>
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full h-full text-[10px] border-collapse">
                        <thead>
                          <tr style={{ background: 'linear-gradient(90deg, #134e4a, #0f766e)' }}>
                            {['Year', 'Course', 'Boys', 'Girls', 'Total'].map((h) => (
                              <th key={h} className="px-2 py-1.5 text-white font-semibold whitespace-nowrap text-right [&:nth-child(1)]:text-left [&:nth-child(2)]:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="h-full">
                          {rows.map((r, i) => {
                            const c = courseConfig[r.course as Course];
                            return r.isSubtotal ? (
                              <tr key={i} className="font-semibold" style={{ background: '#ccfbf1', height: '1%' }}>
                                <td className={tl + ' text-teal-700 font-bold'}>{r.yrLabel}</td>
                                <td className={tl + ' text-teal-600'} />
                                {[r.boys, r.girls, r.total].map((v, j) => <td key={j} className={tc + ' text-teal-800'}>{v}</td>)}
                              </tr>
                            ) : (
                              <tr key={i} className="border-b border-teal-50 hover:bg-teal-50/40 transition-colors" style={{ height: '1%' }}>
                                <td className={tl + ' text-gray-400'}>{r.yrLabel}</td>
                                <td className={tl + ` ${c.textColor} font-bold`}>{r.course}</td>
                                {[r.boys, r.girls, r.total].map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v}</td>)}
                              </tr>
                            );
                          })}
                          <tr className="text-white font-bold" style={{ background: '#042f2e', height: '1%' }}>
                            <td className={tl}>GRAND TOTAL</td>
                            <td className={tl} />
                            {[grand.boys, grand.girls, grand.total].map((v, j) => <td key={j} className={tc}>{v}</td>)}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

            </div>

            {/* Date-wise Admission Course-wise Counts — full width */}
            {(() => {
              const grandTotal = dateTable.reduce((a, r) => a + r.total, 0);
              const grandByCourse = COURSES.reduce((acc, c) => {
                acc[c] = dateTable.reduce((a, r) => a + r.byCourse[c], 0);
                return acc;
              }, {} as Record<Course, number>);
              const tc = 'px-2 py-1 text-right tabular-nums';
              const tl = 'px-2 py-1 text-left';
              function fmtDate(iso: string) {
                const [y, m, d] = iso.split('-');
                const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                return `${d} ${months[parseInt(m) - 1]} ${y}`;
              }
              return (
                <div className="bg-violet-50 rounded-2xl border border-violet-400 overflow-hidden" style={{ boxShadow: '0 2px 8px 0 rgba(0,0,0,0.10), 0 1px 3px -1px rgba(0,0,0,0.06)' }}>
                  <div
                    className="px-4 py-1.5 border-b border-violet-100 flex items-center gap-2 flex-wrap cursor-pointer select-none"
                    onDoubleClick={() => feeAcademicYear && exportDatewiseAdmissionsReport(dateTable, feeAcademicYear)}
                    title="Double-click to export PDF"
                  >
                    <span className="w-1 h-3.5 rounded-full shrink-0 bg-violet-400" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Date-wise Admissions — Course Count</p>
                    {feeAcademicYear && (
                      <span className="text-[10px] font-semibold text-violet-500/70 whitespace-nowrap">
                        {feeAcademicYear}{!academicYearFilter ? ' (current year)' : ''}
                      </span>
                    )}
                  </div>
                  {dateTable.length === 0 ? (
                    <p className="px-4 py-6 text-xs text-gray-400 text-center">No admission fee payments recorded for this selection.</p>
                  ) : (
                    <div className="overflow-x-auto overflow-y-auto no-scrollbar" style={{ maxHeight: 'calc(5 * 30px + 60px)' }}>
                      <table className="w-full text-[10px] border-collapse">
                        <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                          <tr style={{ background: 'linear-gradient(90deg, #4c1d95, #5b21b6)' }}>
                            {['Date', ...COURSES, 'Total'].map((h) => (
                              <th key={h} className="px-2 py-1.5 text-white font-semibold whitespace-nowrap text-right [&:nth-child(1)]:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dateTable.map((r, i) => (
                            <tr key={r.date} className={`border-b border-violet-50 hover:bg-violet-50/40 transition-colors ${i % 2 === 1 ? 'bg-violet-50/20' : ''}`}>
                              <td className={tl + ' font-medium text-gray-700 whitespace-nowrap'}>{fmtDate(r.date)}</td>
                              {COURSES.map((c) => (
                                <td key={c} className={tc + ' text-gray-700'}>{r.byCourse[c]}</td>
                              ))}
                              <td className={tc + ' font-semibold text-gray-800'}>{r.total}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                          <tr className="text-white font-bold" style={{ background: '#2e1065' }}>
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
              );
            })()}

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
    </>
  );
}
