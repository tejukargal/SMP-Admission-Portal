import { useState, useMemo, useEffect, useLayoutEffect, useRef, useTransition } from 'react';
import { CashInHandAlert } from '../components/cashBook/CashInHandAlert';
import { useNavigate } from 'react-router-dom';
import { useAllStudents } from '../hooks/useAllStudents';
import { useSettings } from '../hooks/useSettings';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { getFeeRecordsByAcademicYear } from '../services/feeRecordService';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { getFeeOverridesByYear } from '../services/feeOverrideService';
import { getRefundRecordsByAcademicYear, isFeeNettingRefund } from '../services/refundService';
import type { RefundRecord } from '../services/refundService';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { useFilters } from '../contexts/FiltersContext';
import { useAuth } from '../contexts/AuthContext';
import { StudentDetailModal } from '../components/student/StudentDetailModal';
import { FeeCollectionModal } from '../components/fee/FeeCollectionModal';
import { StudyCertificateModal } from '../components/common/StudyCertificateModal';
import { TransferCertificateModal } from '../components/common/TransferCertificateModal';
import { ProvisionalCertificateModal } from '../components/common/ProvisionalCertificateModal';
import { CourseCompletionCertificateModal } from '../components/common/CourseCompletionCertificateModal';
import { AdmissionOrderModal } from '../components/common/AdmissionOrderModal';
import { generateTCApplication } from '../utils/tcApplicationPdf';
import { isConfirmedActive } from '../utils/studentStatus';
import { isWPStudent } from '../utils/wpStudent';
import type { ThemeName } from '../utils/dashboardReportPdf';
import type { Student, Course, Year, Gender, AcademicYear, AdmType, AdmCat, Category, FeeStructure, StudentFeeOverride, FeeRecord } from '../types';
import { SMP_FEE_HEADS } from '../types';
import { RecentActivityCard } from '../components/dashboard/RecentActivityCard';
import { InsightsButton, type DashboardInsights } from '../components/dashboard/InsightsPanel';
import { useInquiries } from '../hooks/useInquiries';
import { SummaryModal } from '../components/dashboard/SummaryModal';
import { previousAcademicYear, type SummaryInput } from '../utils/summaryReport';
import { useCashInHand } from '../contexts/CashInHandContext';
import { todayIST } from '../utils/formatDates';
import { dayKey, receiptAccountSplit } from '../utils/cashLedger';
import { DtekNewsCard } from '../components/dashboard/DtekNewsCard';
import { SideCardToggle, type SideCard } from '../components/dashboard/SideCardToggle';
import { DtekCircularModal } from '../components/dashboard/DtekCircularModal';
import { SearchResults, type StudentGroup, type FeeStatus, type NextEnroll } from '../components/dashboard/SearchResults';
import type { DtekCircular } from '../services/dtekNewsService';
import { useAccentOverride } from '../components/layout/AccentOverrideContext';
import { SEARCH_ACCENT } from '../components/layout/pageAccents';
import {
  PAGE_BG, CARD, OUTLINE_PILL_BTN, ICON_PILL_BTN, EYEBROW, PERI, PERI_INK, PERI_BORDER, PERI_DIVIDER,
  FAINT, AMBER, accentVars, V, mix, pastel, inkOf, TILE, tileStyle, wellStyle, SEARCH_PAGE_SIZE,
  COURSE_HEX, YEAR_HEX, ADM_HEX, BOY_HEX, GIRL_HEX,
} from '../components/dashboard/dashTokens';

// PDF reports fetch jsPDF on demand (first export click) — keeps ~420 KB out of
// the landing page's chunk.
type DashPdf = typeof import('../utils/dashboardReportPdf');
const dashPdf = () => import('../utils/dashboardReportPdf');
const exportSummaryReport = (...a: Parameters<DashPdf['exportSummaryReport']>) => void dashPdf().then((m) => m.exportSummaryReport(...a));
const exportGenderCourseYearReport = (...a: Parameters<DashPdf['exportGenderCourseYearReport']>) => void dashPdf().then((m) => m.exportGenderCourseYearReport(...a));
const exportFirstYearSeatsReport = (...a: Parameters<DashPdf['exportFirstYearSeatsReport']>) => void dashPdf().then((m) => m.exportFirstYearSeatsReport(...a));

// Per-year fee data behind the search result fee pills. Fetched once and reused
// across keystrokes (each year is three full-collection reads), refreshed after
// 2 minutes or when a fee is collected from the results.
type YearFeeData = [FeeRecord[], FeeStructure[], StudentFeeOverride[]];
const FEE_DATA_TTL = 2 * 60 * 1000;
const yearFeeCache = new Map<string, { at: number; data: Promise<YearFeeData>; ready: boolean }>();
function loadYearFeeData(year: AcademicYear): Promise<YearFeeData> {
  const hit = yearFeeCache.get(year);
  if (hit && Date.now() - hit.at < FEE_DATA_TTL) return hit.data;
  const entry = {
    at: Date.now(),
    ready: false,
    data: Promise.all([
      getFeeRecordsByAcademicYear(year),
      getFeeStructuresByAcademicYear(year),
      getFeeOverridesByYear(year),
    ]),
  };
  entry.data.then(() => { entry.ready = true; }, () => { yearFeeCache.delete(year); });
  yearFeeCache.set(year, entry);
  return entry.data;
}
const isYearFeeDataReady = (year: string) => {
  const hit = yearFeeCache.get(year);
  return !!hit && hit.ready && Date.now() - hit.at < FEE_DATA_TTL;
};

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const REGULAR_INTAKE = 60;
const LATERAL_BASE_PCT = 0.10;
const YEAR_INTAKE = 63 * COURSES.length; // 315 — total intake capacity per year across all courses

/** Shift a YYYY-MM-DD date by whole days (UTC, so it never drifts). */
function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// PDF export accent themes — mirror each course/year card's own accent colour so an
// exported report visually matches the modal/card it was triggered from.
const COURSE_PDF_THEME: Record<Course, ThemeName> = { CE: 'amber', ME: 'green', EC: 'sky', CS: 'teal', EE: 'violet' };
const YEAR_PDF_THEME: Record<Year, ThemeName> = { '1ST YEAR': 'lime', '2ND YEAR': 'emerald', '3RD YEAR': 'teal' };

// Hex equivalents of each course's accent color (courseConfig.barFill), needed for SVG ring strokes
const COURSE_RING_HEX: Record<Course, string> = {
  CE: '#fbbf24', ME: '#4ade80', EC: '#38bdf8', CS: '#2dd4bf', EE: '#a78bfa',
};

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
          <span className={`text-[10px] font-medium leading-none ${textColor}`}>{state.prev.label}</span>
          <p className={`text-[20px] font-medium leading-none tabular-nums ${textColor}`}>{state.prev.value}</p>
        </div>
      )}
      <div
        className="flex flex-col items-center gap-0.5 w-full"
        style={{ animation: state.prev ? 'slot-enter 0.38s ease-out 0.38s both' : 'none' }}
      >
        <span className={`text-[10px] font-medium leading-none ${textColor}`}>{state.cur.label}</span>
        <p className={`text-[20px] font-medium leading-none tabular-nums ${textColor}`}>{state.cur.value}</p>
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(107,124,246,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: ready ? 'stroke-dashoffset 800ms cubic-bezier(0.4,0,0.2,1)' : 'none' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[8.5px] font-medium tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Section label — small eyebrow with a hairline rule ─────────────────────
function SectionLabel({ children, onDoubleClick }: { children: React.ReactNode; onDoubleClick?: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <p
        className={`${EYEBROW} ${onDoubleClick ? 'cursor-pointer select-none' : ''}`}
        onDoubleClick={onDoubleClick}
        title={onDoubleClick ? 'Double-click to export PDF' : undefined}
      >
        {children}
      </p>
      <span className="h-px flex-1" style={{ background: PERI_DIVIDER }} />
    </div>
  );
}

// ─── Loading gate ────────────────────────────────────────────────────────────
function LoadingGate() {
  return (
    <div className="font-wp -m-4 p-4 min-h-[calc(100%+2rem)] flex flex-col gap-3 overflow-hidden" style={{ background: PAGE_BG, animation: 'page-enter 0.22s ease-out' }}>
      <div className="flex-shrink-0 flex items-center justify-between gap-4">
        <div className="h-10 w-56 bg-white/70 rounded-2xl border border-[#DADFFA] animate-pulse" />
        <div className="w-40 h-9 bg-white/70 rounded-full border border-[#DADFFA] animate-pulse" />
      </div>
      <div className="flex-shrink-0 h-14 bg-white/70 rounded-2xl border border-[#DADFFA] animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
        <div className="col-span-2 lg:col-span-5 rounded-2xl border border-[#DADFFA] h-52 bg-white/70 animate-pulse" />
        <div className="col-span-2 lg:col-span-4 rounded-2xl border border-[#DADFFA] h-52 bg-white/70 animate-pulse" />
        <div className="col-span-2 lg:col-span-3 grid grid-cols-2 lg:grid-cols-1 gap-3">
          <div className="rounded-2xl border border-[#DADFFA] h-24 bg-white/70 animate-pulse" />
          <div className="rounded-2xl border border-[#DADFFA] h-24 bg-white/70 animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-[#DADFFA] bg-white/70 h-28 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-[#DADFFA] bg-white/70 h-32 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export function Dashboard() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { students: rawStudents, loading, error } = useAllStudents();
  // WP (Working Professional / EXTERNAL) admissions are managed on /wp-students
  // and are kept out of every dashboard count and drill-down. Search alone uses
  // rawStudents so WP students can still be found and issued certificates.
  const allStudents = useMemo(() => rawStudents.filter((s) => !isWPStudent(s)), [rawStudents]);
  const { settings } = useSettings();
  const cashInHand = useCashInHand();
  const { dashboardFilters, setDashboardFilters } = useFilters();
  const [feeHistoryStudent, setFeeHistoryStudent] = useState<Student | null>(null);
  const [dtekCircular, setDtekCircular] = useState<DtekCircular | null>(null);
  const [resultsStudent, setResultsStudent] = useState<Student | null>(null);
  const [courseModalCourse, setCourseModalCourse] = useState<Course | null>(null);
  const [yearModalYear, setYearModalYear] = useState<Year | null>(null);
  const [genderModal, setGenderModal] = useState<'BOY' | 'GIRL' | null>(null);
  const [totalModal, setTotalModal] = useState(false);
  const [summaryModal, setSummaryModal] = useState(false);
  const [intakeModal, setIntakeModal] = useState(false);
  // Stats-pill shortcut: open the Summary on this tab (undefined = last-used tab)
  const [summaryTab, setSummaryTab] = useState<string | undefined>(undefined);
  const [admTypeDetailModal, setAdmTypeDetailModal] = useState<'LATERAL' | 'REPEATER' | 'SNQ' | null>(null);

  // ── Collect Fee from dashboard search (admin only) ───────────────────────
  const [collectFeeStudent, setCollectFeeStudent] = useState<Student | null>(null);

  // ── Course card breakup flip (0=total, 1=REG, 2=LAT, 3=SNQ, 4=RPT) ──────
  // ── Gender card breakup flip (cycles through COURSES: CE,ME,EC,CS,EE) ───
  const [genderBreakIdx, setGenderBreakIdx] = useState(0);
  // ── Bar chart mode flip (Total → Boys → Girls → Adm Type) ───────────────
  const [barChartMode, setBarChartMode] = useState(0);
  const [chartBarsReady, setChartBarsReady] = useState(false);

  // ── Fee status for search result rows ────────────────────────────────────
  const [searchFeeStatus, setSearchFeeStatus] = useState<Map<string, FeeStatus>>(new Map());
  const [searchFeeLoading, setSearchFeeLoading] = useState(false);
  // Bumped after a fee is collected from the results so the pills re-read fresh data.
  const [feeDataVersion, setFeeDataVersion] = useState(0);
  // ── Total due per student group (keyed by group.key = regNumber or name|dob) ─
  const [searchGroupDue, setSearchGroupDue] = useState<Map<string, number | null | 'unavailable'>>(new Map());
  // ── Outstanding balance per enrollment (only where a fee structure/override exists) ─
  const [searchStudentDue, setSearchStudentDue] = useState<Map<string, number>>(new Map());

  // ── Filter / chips / stats pills panel visibility ────────────────────────
  const [showFilters,    setShowFilters]    = useState(false);
  const [showChips,      setShowChips]      = useState(() => localStorage.getItem('smp_chips_visible') !== 'false');
  const [showStatsPills, setShowStatsPills] = useState(() => localStorage.getItem('smp_statspills_visible') === 'true');
  // Insights side slot: DTEK News by default; the last choice is remembered.
  const [sideCard, setSideCard] = useState<SideCard>(() => localStorage.getItem('smp_insights_side') === 'activity' ? 'activity' : 'dtek');
  const changeSideCard = (next: SideCard) => { setSideCard(next); localStorage.setItem('smp_insights_side', next); };

  // ── Certificate context menu (search results) ────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; student: Student } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [studyCertStudent, setStudyCertStudent] = useState<Student | null>(null);
  const [tcStudent, setTcStudent] = useState<Student | null>(null);
  const [pcStudent, setPcStudent] = useState<Student | null>(null);
  const [cccStudent, setCccStudent] = useState<Student | null>(null);
  const [admOrderStudent, setAdmOrderStudent] = useState<Student | null>(null);

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

  // Search mode repaints the title bar in the Student Messages cyan (this page's own
  // chrome follows via the --dk-* vars on the root). Cleared on exit / unmount.
  const { setOverride } = useAccentOverride();
  useEffect(() => {
    setOverride(isSearchMode ? SEARCH_ACCENT : null);
  }, [isSearchMode, setOverride]);
  useEffect(() => () => setOverride(null), [setOverride]);

  // Sticky toolbar: true once it has pinned to the top of the scroller (top: -1rem).
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarStuck, setToolbarStuck] = useState(false);
  useEffect(() => {
    const el = toolbarRef.current;
    const scroller = el?.closest('main');
    if (!el || !scroller) return;
    const check = () => {
      const offset = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      setToolbarStuck(offset <= -15);
    };
    check();
    scroller.addEventListener('scroll', check, { passive: true });
    return () => scroller.removeEventListener('scroll', check);
  }, [loading]);

  // Search results paging + keyboard cursor — both reset whenever the query changes.
  const [visibleCount, setVisibleCount] = useState(SEARCH_PAGE_SIZE);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [lastSearchTerm, setLastSearchTerm] = useState(searchTerm);
  if (lastSearchTerm !== searchTerm) {
    setLastSearchTerm(searchTerm);
    setVisibleCount(SEARCH_PAGE_SIZE);
    setActiveIdx(-1);
  }

  const sortedAcademicYears = useMemo(() => {
    const years = new Set(allStudents.map((s) => s.academicYear));
    return Array.from(years).sort().reverse();
  }, [allStudents]);

  const searchIndex = useMemo(() =>
    rawStudents.map((s) => ({
      s,
      searchStr: [s.studentNameSSLC, s.studentNameAadhar, s.regNumber, s.fatherMobile, s.studentMobile]
        .filter(Boolean).join('|').toUpperCase(),
    })),
    [rawStudents]
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

  // Groups that can be enrolled into their next year in the current academic year:
  // highest year reached isn't 3RD YEAR and there's no enrollment this year yet.
  // Shared by the result card's "Enroll" pill and the row context menu.
  const nextEnrollByGroup = useMemo(() => {
    const out = new Map<string, NextEnroll>();
    const current = settings?.currentAcademicYear;
    if (!current) return out;
    const YEAR_ORDER: Record<Year, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };
    const NEXT_YEAR: Record<Year, Year | null> = { '1ST YEAR': '2ND YEAR', '2ND YEAR': '3RD YEAR', '3RD YEAR': null };
    for (const g of studentGroups) {
      if (g.records.length === 0 || g.records.some((r) => r.academicYear === current)) continue;
      const record = g.records.reduce((best, r) => (YEAR_ORDER[r.year] > YEAR_ORDER[best.year] ? r : best), g.records[0]);
      const targetYear = NEXT_YEAR[record.year];
      if (targetYear) out.set(g.key, { record, targetYear, targetAcademicYear: current });
    }
    return out;
  }, [studentGroups, settings?.currentAcademicYear]);

  function startReEnroll(next: NextEnroll) {
    void navigate('/enroll?from=dashboard', {
      state: { reEnrollStudent: next.record, targetYear: next.targetYear, targetAcademicYear: next.targetAcademicYear },
    });
  }

  // ↑/↓ move between result cards (paging in more when stepping past the last one),
  // Enter opens the active student's latest enrollment, Esc clears the search.
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // The input keeps focus while a modal/menu opened from the results is up, so its
    // keys must yield: the first Esc closes the overlay (its own handler), and only
    // the next Esc — with nothing open — clears the search.
    const overlayOpen = !!(feeHistoryStudent || collectFeeStudent || ctxMenu
      || studyCertStudent || tcStudent || pcStudent || cccStudent || admOrderStudent);
    if (overlayOpen) return;
    if (e.key === 'Escape') {
      if (inputValue) { e.preventDefault(); setInputValue(''); }
      return;
    }
    if (!isSearchMode || studentGroups.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(activeIdx + 1, studentGroups.length - 1);
      if (next >= visibleCount) setVisibleCount((c) => c + SEARCH_PAGE_SIZE);
      setActiveIdx(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const group = studentGroups[activeIdx < 0 ? 0 : activeIdx];
      const latest = group?.records[group.records.length - 1];
      if (latest) { e.preventDefault(); setFeeHistoryStudent(latest); }
    }
  }

  useEffect(() => {
    // WP fee lives in manual counts (Fee Reports → WP Fee Distribution), not feeRecords,
    // so WP enrollments get no fee status or group due — the results show a WP badge.
    const feeTargets = searchResults.filter((s) => !isWPStudent(s));
    if (!isSearchMode || feeTargets.length === 0) {
      setSearchFeeStatus(new Map());
      setSearchGroupDue(new Map());
      setSearchStudentDue(new Map());
      setSearchFeeLoading(false);
      return;
    }
    let cancelled = false;
    const uniqueYears = [...new Set(feeTargets.map((s) => s.academicYear))] as AcademicYear[];
    // Only show the loading shimmer when a year actually has to be fetched — cached
    // years resolve immediately, so the pills update in place while typing.
    if (!uniqueYears.every(isYearFeeDataReady)) setSearchFeeLoading(true);

    async function loadFeeStatus() {
      const perYear = await Promise.all(uniqueYears.map(loadYearFeeData));
      const allRecords    = perYear.flatMap(([r]) => r);
      const allStructures = perYear.flatMap(([, st]) => st);
      const allOverrides  = perYear.flatMap(([, , o]) => o);

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
      const studentDueMap = new Map<string, number>();
      for (const s of feeTargets) {
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
        // Same 2021-22 cut-off as the group total below, so row amounts add up to it.
        if (allotted !== null && allotted > paid && s.academicYear >= '2021-22') studentDueMap.set(s.id, allotted - paid);
      }

      // Compute total due per student group (only 2021-22 and later — prior data unavailable)
      const groupDueMap = new Map<string, number | null | 'unavailable'>();
      // Pre-seed every group as unavailable; upgraded below for 2021-22+ enrollments
      for (const s of feeTargets) {
        const groupKey = s.regNumber ? s.regNumber.toUpperCase() : `${s.studentNameSSLC}|${s.dateOfBirth}`;
        if (!groupDueMap.has(groupKey)) groupDueMap.set(groupKey, 'unavailable');
      }
      for (const s of feeTargets) {
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
        setSearchStudentDue(studentDueMap);
        setSearchFeeLoading(false);
      }
    }

    loadFeeStatus().catch(() => { if (!cancelled) setSearchFeeLoading(false); });
    return () => { cancelled = true; };
  }, [isSearchMode, searchResults, feeDataVersion]);

  // ── Metrics ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const confirmed = admStatusFilter
      ? filteredStudents
      : filteredStudents.filter(isConfirmedActive);

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
      : filteredStudents.filter(isConfirmedActive),
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
        isConfirmedActive(s) &&
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
      if (isConfirmedActive(s)) {
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
    () => activeSource.filter(isConfirmedActive).length,
    [activeSource]
  );
  const confirmedTotalCount = useMemo(
    () => allStudents.filter(isConfirmedActive).length,
    [allStudents]
  );

  // Fee records for the date-wise admission table — scoped to the selected (or current) academic year
  const feeAcademicYear = (academicYearFilter || settings?.currentAcademicYear || null) as import('../types').AcademicYear | null;
  const { records: feeRecords } = useFeeRecords(feeAcademicYear);

  const dateTable = useMemo(() => {
    if (!feeRecords.length) return [];
    // Only count students visible under current filters (confirmed by default)
    const confirmedIds = new Set(
      (admStatusFilter ? filteredStudents : filteredStudents.filter(isConfirmedActive))
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

  // Summary modal input — scoped to the Dashboard filters exactly like the old
  // stats tables (confirmed = confirmedStudents); built only while it's open.
  const summaryInput = useMemo<SummaryInput | null>(() => {
    if (!summaryModal) return null;
    const matchesNonStatus = (s: Student) =>
      (!courseFilter || s.course === courseFilter) &&
      (!yearFilter || s.year === yearFilter) &&
      (!genderFilter || s.gender === genderFilter) &&
      (!categoryFilter || s.category === categoryFilter) &&
      (!admTypeFilter || s.admType === admTypeFilter) &&
      (!admCatFilter || s.admCat === admCatFilter);
    const year = academicYearFilter || null;
    const prevYear = year ? previousAcademicYear(year) : null;
    return {
      year,
      confirmed: confirmedStudents,
      pipeline: allStudents.filter((s) => (!year || s.academicYear === year) && matchesNonStatus(s)),
      prevConfirmed: prevYear ? allStudents.filter((s) => s.academicYear === prevYear && isConfirmedActive(s) && matchesNonStatus(s)) : [],
      dateRows: dateTable,
    };
  }, [summaryModal, academicYearFilter, confirmedStudents, allStudents, dateTable, courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter]);
  const summaryFilterLabel = [courseFilter, yearFilter, genderFilter, categoryFilter, admTypeFilter, admCatFilter, admStatusFilter && `Status ${admStatusFilter}`]
    .filter(Boolean).join(' · ');
  function openSummary(tab?: string) {
    setSummaryTab(tab);
    setSummaryModal(true);
  }

  // Fee-status ticker day slides: today (IST) + the 2 most recent earlier days with any
  // collection. Whole college — ignores dashboard filters so the numbers always match
  // Cash & Bank. Admissions = confirmed students whose first receipt fell on that day;
  // Cash/UPI cover every head (SMP + SVK + additional) via receiptAccountSplit, so
  // Cash + UPI = total.
  const cyclingDateStats = useMemo(() => {
    const todayIso = todayIST();
    const confirmedIds = new Set(allStudents.filter(isConfirmedActive).map((s) => s.id));
    const firstPaymentDay = new Map<string, string>();
    const collectionDays = new Set<string>();
    for (const r of feeRecords) {
      if (!r.date) continue;
      const day = dayKey(r.date);
      collectionDays.add(day);
      const prev = firstPaymentDay.get(r.studentId);
      if (!prev || day < prev) firstPaymentDay.set(r.studentId, day);
    }
    const priorDays = [...collectionDays].filter((d) => d < todayIso).sort().reverse().slice(0, 2);
    const dates = [todayIso, ...priorDays];

    const days = dates.map((date) => {
      let admissionCount = 0;
      for (const [id, day] of firstPaymentDay) if (day === date && confirmedIds.has(id)) admissionCount++;
      let totalCollection = 0;
      let cash = 0;
      let upi = 0;
      for (const r of feeRecords) {
        if (!r.date || dayKey(r.date) !== date) continue;
        const split = receiptAccountSplit(r);
        cash += split.SBI.cash + split.SVK.cash;
        upi += split.SBI.upi + split.SVK.upi;
      }
      totalCollection = cash + upi;
      return { date, isToday: date === todayIso, admissionCount, totalCollection, cash, upi };
    });
    return { days, todayIso, firstPaymentDay, confirmedIds };
  }, [allStudents, feeRecords]);

  // Fee structures, per-student overrides, and fee-netting refunds for the current academic
  // year — needed to compute SMP/SVK Allotted/Paid totals for the cycling label using the
  // exact same logic as FeeReportsPage's allStudentRows / "Statistics" tab.
  const [cycleFeeStructures, setCycleFeeStructures] = useState<FeeStructure[]>([]);
  const [cycleFeeOverrides, setCycleFeeOverrides] = useState<StudentFeeOverride[]>([]);
  const [cycleRefunds, setCycleRefunds] = useState<RefundRecord[]>([]);
  useEffect(() => {
    if (!feeAcademicYear) { setCycleFeeStructures([]); setCycleFeeOverrides([]); setCycleRefunds([]); return; }
    let cancelled = false;
    Promise.all([
      getFeeStructuresByAcademicYear(feeAcademicYear),
      getFeeOverridesByYear(feeAcademicYear),
      getRefundRecordsByAcademicYear(feeAcademicYear),
    ]).then(([structs, overrides, refunds]) => {
      if (!cancelled) { setCycleFeeStructures(structs); setCycleFeeOverrides(overrides); setCycleRefunds(refunds); }
    }).catch(() => { /* leave previous values on error */ });
    return () => { cancelled = true; };
  }, [feeAcademicYear]);

  // SMP/SVK Allotted vs Paid vs Dues for the current academic year — mirrors
  // FeeReportsPage.tsx's allStudentRows construction + StatisticsTab's totals exactly:
  // override → else structure for allotted (SVK allotted includes additional heads like
  // Red Cross), fine allotted = max(structure/override fine, fine actually paid) so a fine
  // payment never creates an artificial negative balance, SMP paid nets SNQ-category
  // refunds, and only students with admissionStatus === 'CONFIRMED' are counted (matching
  // "Only CONFIRMED students appear in student-based tabs" there — transferred-out
  // students are still included, same as the Fee Reports Statistics tab).
  const smpSvkFeeTotals = useMemo(() => {
    if (!feeAcademicYear) return null;
    const cohort = allStudents.filter((s) => s.academicYear === feeAcademicYear && s.admissionStatus?.trim() === 'CONFIRMED');
    if (cohort.length === 0) return null;

    const smpAllottedNoFineByKey = new Map<string, number>();
    const structureFineByKey = new Map<string, number>();
    const svkAllottedByKey = new Map<string, number>();
    for (const fs of cycleFeeStructures) {
      const key = `${fs.course}__${fs.year}__${fs.admType}__${fs.admCat}`;
      const additionalSum = fs.additionalHeads.reduce((t, h) => t + h.amount, 0);
      smpAllottedNoFineByKey.set(key, SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : fs.smp[k]), 0));
      structureFineByKey.set(key, fs.smp.fine);
      svkAllottedByKey.set(key, fs.svk + additionalSum);
    }
    const overrideByStudent = new Map(cycleFeeOverrides.map((o) => [o.studentId, o]));

    const smpPaidByStudent = new Map<string, number>();
    const svkPaidByStudent = new Map<string, number>();
    const finePaidByStudent = new Map<string, number>();
    for (const r of feeRecords) {
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
      const svkTotal = r.svk + r.additionalPaid.reduce((t, h) => t + h.amount, 0);
      smpPaidByStudent.set(r.studentId, (smpPaidByStudent.get(r.studentId) ?? 0) + smpTotal);
      svkPaidByStudent.set(r.studentId, (svkPaidByStudent.get(r.studentId) ?? 0) + svkTotal);
      finePaidByStudent.set(r.studentId, (finePaidByStudent.get(r.studentId) ?? 0) + r.smp.fine);
    }

    const refundedByStudent = new Map<string, number>();
    for (const r of cycleRefunds.filter(isFeeNettingRefund)) {
      refundedByStudent.set(r.studentId, (refundedByStudent.get(r.studentId) ?? 0) + r.refundAmount);
    }

    let smpAllotted = 0, smpPaid = 0, svkAllotted = 0, svkPaid = 0;
    let studentsWithDues = 0, duesOutstanding = 0;
    for (const s of cohort) {
      const key = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      const override = overrideByStudent.get(s.id);
      const finePaid = finePaidByStudent.get(s.id) ?? 0;

      let smpA: number;
      let svkA: number;
      if (override) {
        const baseFine  = override.smp.fine;
        const effFine   = Math.max(baseFine, finePaid);
        const smpNoFine = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : override.smp[k]), 0);
        smpA = smpNoFine + effFine;
        svkA = override.svk + override.additionalHeads.reduce((t, h) => t + h.amount, 0);
      } else {
        const smpNoFine  = smpAllottedNoFineByKey.get(key) ?? 0;
        const structFine = structureFineByKey.get(key) ?? 0;
        const effFine    = Math.max(structFine, finePaid);
        smpA = smpAllottedNoFineByKey.has(key) ? smpNoFine + effFine : 0;
        svkA = svkAllottedByKey.get(key) ?? 0;
      }

      const refunded = refundedByStudent.get(s.id) ?? 0;
      const smpP = Math.max(0, (smpPaidByStudent.get(s.id) ?? 0) - refunded);
      const svkP = svkPaidByStudent.get(s.id) ?? 0;
      smpAllotted += smpA;
      svkAllotted += svkA;
      smpPaid += smpP;
      svkPaid += svkP;
      const due = (smpA - smpP) + (svkA - svkP);
      if (due > 0) { studentsWithDues++; duesOutstanding += due; }
    }
    return {
      smpAllotted, smpPaid, smpDues: smpAllotted - smpPaid, svkAllotted, svkPaid, svkDues: svkAllotted - svkPaid,
      studentsWithDues, duesOutstanding, cohortSize: cohort.length,
    };
  }, [feeAcademicYear, allStudents, cycleFeeStructures, cycleFeeOverrides, cycleRefunds, feeRecords]);

  // Insights panel (toolbar button): whole-college fee + admission insights for the
  // selected (or current) academic year — ignores dashboard filters; WP excluded.
  const { inquiries } = useInquiries(feeAcademicYear);
  const insights = useMemo<DashboardInsights>(() => {
    const { days, todayIso, firstPaymentDay, confirmedIds } = cyclingDateStats;
    const ratio = (paid: number, allotted: number) => (allotted > 0 ? paid / allotted : 0);
    const fee = (allotted: number, paid: number) => ({ allotted, paid, dues: allotted - paid, pct: ratio(paid, allotted) });
    const t = smpSvkFeeTotals;

    const yearStudents = feeAcademicYear ? allStudents.filter((s) => s.academicYear === feeAcademicYear) : [];
    const confirmed = yearStudents.filter(isConfirmedActive);
    const prevYear = feeAcademicYear ? previousAcademicYear(feeAcademicYear) : null;
    const prevConfirmed = prevYear ? allStudents.filter((s) => s.academicYear === prevYear && isConfirmedActive(s)).length : 0;

    // 1st-year seats: 63 per course (60 regular + 3 SNQ)
    const firstYearByCourse: Record<Course, number> = { CE: 0, ME: 0, EC: 0, CS: 0, EE: 0 };
    for (const s of confirmed) if (s.year === '1ST YEAR' && s.course in firstYearByCourse) firstYearByCourse[s.course as Course]++;
    const seatsPerCourse = YEAR_INTAKE / COURSES.length;
    const filled = COURSES.reduce((sum, c) => sum + Math.min(firstYearByCourse[c], seatsPerCourse), 0);
    const vacant = COURSES
      .map((course) => ({ course, count: Math.max(0, seatsPerCourse - firstYearByCourse[course]) }))
      .filter((v) => v.count > 0)
      .sort((x, y) => y.count - x.count)
      .slice(0, 2);

    // Admissions this week vs the previous 7 days (first receipt date of confirmed students)
    const weekStart = shiftIsoDate(todayIso, -6);
    const prevStart = shiftIsoDate(todayIso, -13);
    let last7 = 0, prev7 = 0;
    for (const [id, day] of firstPaymentDay) {
      if (!confirmedIds.has(id)) continue;
      if (day >= weekStart && day <= todayIso) last7++;
      else if (day >= prevStart && day < weekStart) prev7++;
    }

    const isBlank = (v: string | undefined) => !v || !v.trim();
    let gapTotal = 0, gapMobile = 0, gapAadhar = 0, gapDob = 0;
    for (const s of confirmed) {
      const noMobile = isBlank(s.fatherMobile) && isBlank(s.studentMobile);
      const noAadhar = isBlank(s.aadharNumber);
      const noDob = isBlank(s.dateOfBirth);
      if (noMobile) gapMobile++;
      if (noAadhar) gapAadhar++;
      if (noDob) gapDob++;
      if (noMobile || noAadhar || noDob) gapTotal++;
    }

    return {
      days: days.map((d) => ({ date: d.date, isToday: d.isToday, admissions: d.admissionCount, total: d.totalCollection, cash: d.cash, upi: d.upi })),
      fees: t ? {
        smp: fee(t.smpAllotted, t.smpPaid),
        svk: fee(t.svkAllotted, t.svkPaid),
        overall: fee(t.smpAllotted + t.svkAllotted, t.smpPaid + t.svkPaid),
      } : null,
      dues: t && t.studentsWithDues > 0 ? { students: t.studentsWithDues, cohort: t.cohortSize, amount: t.duesOutstanding } : null,
      cash: cashInHand.enabled && cashInHand.configured && !cashInHand.loading && cashInHand.summary.total > 0
        ? { amount: cashInHand.summary.total, daysHeld: cashInHand.summary.daysHeld, overdue: cashInHand.summary.isOverdue }
        : null,
      confirmed: { current: confirmed.length, prevYear, prev: prevConfirmed },
      seats: { filled, total: YEAR_INTAKE, vacant },
      week: { last7, prev7 },
      gender: {
        boys: confirmed.filter((s) => s.gender === 'BOY').length,
        girls: confirmed.filter((s) => s.gender === 'GIRL').length,
      },
      pending: yearStudents.filter((s) => !['CONFIRMED', 'CANCELLED'].includes(s.admissionStatus?.trim() ?? '')).length,
      transfers: {
        in: yearStudents.filter((s) => s.transferredIn).length,
        out: yearStudents.filter((s) => s.transferOut).length,
      },
      inquiries: {
        active: inquiries.filter((q) => q.status === 'active').length,
        converted: inquiries.filter((q) => q.status === 'converted').length,
        total: inquiries.length,
      },
      gaps: { total: gapTotal, mobile: gapMobile, aadhar: gapAadhar, dob: gapDob },
    };
  }, [cyclingDateStats, smpSvkFeeTotals, feeAcademicYear, allStudents, cashInHand, inquiries]);

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

  // Transfer Students — current-year students flagged transferOut or transferredIn
  const transferStats = useMemo(() => {
    const currentYear = settings?.currentAcademicYear;
    if (!currentYear) return null;
    let transferIn = 0, transferOut = 0;
    for (const s of allStudents) {
      if (s.academicYear !== currentYear) continue;
      if (s.transferredIn) transferIn++;
      if (s.transferOut) transferOut++;
    }
    const total = transferIn + transferOut;
    if (total === 0) return null;
    return { transferIn, transferOut, total };
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
  const CHIP_PALETTE = ['#10B981', '#0EA5E9', '#8B5CF6', '#F59E0B', '#EC4899'] as const;

  // ── Nature palette colour map ────────────────────────────────────────────
  const courseConfig: Record<Course, { bg: string; border: string; textColor: string; barFill: string }> = {
    CE: { bg: 'bg-[#FEF8EE]',   border: 'border-[#FAD391]',   textColor: 'text-[#AC6F08]',   barFill: 'bg-[#F6AD30]'   },
    ME: { bg: 'bg-[#F0FBF4]',   border: 'border-[#9CE5B7]',   textColor: 'text-[#188A42]',   barFill: 'bg-[#43CE76]'   },
    EC: { bg: 'bg-[#EEF9FD]',     border: 'border-[#93D6F5]',     textColor: 'text-[#0A73A3]',     barFill: 'bg-[#32B2EC]'     },
    CS: { bg: 'bg-[#EFFAF9]',    border: 'border-[#95DFD7]',    textColor: 'text-[#0E8174]',    barFill: 'bg-[#37C3B3]'    },
    EE: { bg: 'bg-[#F7F4FE]',  border: 'border-[#CBB6FB]',  textColor: 'text-[#6140AC]',  barFill: 'bg-[#9C74F7]'  },
  };

  // Hero-style theme for the dedicated Lateral / Repeater / SNQ admission-type cards — modeled on
  // the "Total Enrolled" tile (solid dark header strip + light body) so the trio reads as a
  // distinct, higher-emphasis set inside the otherwise compact "By Year of Study" / "By Course" rows.
  const admTypeCardTheme: Record<'LATERAL' | 'REPEATER' | 'SNQ', { bodyBg: string; headerBg: string; headerText: string; numColor: string; trackColor: string; barColor: string }> = {
    LATERAL:  { bodyBg: '#FBF7FD', headerBg: '#ECEFFD', headerText: '#7A3F8C', numColor: '#7A3F8C', trackColor: '#EBDDF1', barColor: '#A66BB8' },
    REPEATER: { bodyBg: '#F9FAFB', headerBg: '#ECEFFD', headerText: '#4B4F5C', numColor: '#4B4F5C', trackColor: '#E3E5E9', barColor: '#7B7F8C' },
    SNQ:      { bodyBg: '#F7F8FF', headerBg: '#ECEFFD', headerText: '#3F4BB8', numColor: '#3F4BB8', trackColor: '#DADFFA', barColor: '#6B7CF6' },
  };

  // Shared adm-type key/label maps for the hero tiles + their detail modal (LATERAL/REPEATER match
  // on admType; SNQ matches on admCat — see courseAdmTotals / stats.summaryTable classification).
  const ADM_TYPE_ADM_KEY: Record<'LATERAL' | 'REPEATER' | 'SNQ', 'ltrl' | 'rptr' | 'snq'> = { LATERAL: 'ltrl', REPEATER: 'rptr', SNQ: 'snq' };
  const ADM_TYPE_LABEL: Record<'LATERAL' | 'REPEATER' | 'SNQ', string> = { LATERAL: 'Lateral', REPEATER: 'Repeater', SNQ: 'SNQ' };

  const yearConfig: Record<Year, { label: string; bg: string; border: string; textColor: string; barFill: string }> = {
    '1ST YEAR': { label: '1st Year', bg: 'bg-[#F6FBEF]',     border: 'border-[#C8E896]',     textColor: 'text-[#5C8F0F]',     barFill: 'bg-[#96D439]'     },
    '2ND YEAR': { label: '2nd Year', bg: 'bg-[#EEFAF6]',  border: 'border-[#93E0C6]',  textColor: 'text-[#0B825A]',  barFill: 'bg-[#34C494]'  },
    '3RD YEAR': { label: '3rd Year', bg: 'bg-[#EFFAF9]',     border: 'border-[#95DFD7]',     textColor: 'text-[#0E8174]',     barFill: 'bg-[#37C3B3]'     },
  };


  if (loading) return <LoadingGate />;

  return (
    <>
    <div
      className="dash-accent font-wp relative isolate -m-4 p-4 min-h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{
        ...accentVars(isSearchMode ? 'search' : 'peri'),
        background: 'linear-gradient(160deg,var(--dk-bg-from) 0%,#FCFCFF 45%,var(--dk-bg-to) 100%)',
        animation: 'page-enter 0.22s ease-out',
      }}
    >
      {/* "Bulb" glow — blooms from the search box when search starts, fades on clear. */}
      <span
        aria-hidden
        className={`dash-bloom pointer-events-none absolute inset-0 -z-10 ${isSearchMode ? 'on' : ''}`}
        style={{ background: `radial-gradient(900px 420px at 140px 90px, ${mix(V.acc, 22)} 0%, ${mix(V.acc, 8)} 45%, transparent 75%)` }}
      />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <p className={EYEBROW}>SMP Admissions · {greeting}</p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <h2 className="text-[22px] font-bold leading-none tracking-[-0.3px]" style={{ color: V.ink }}>Dashboard</h2>
              {settings?.currentAcademicYear && (
                <span
                  className="rounded-full border bg-white px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums"
                  style={{ borderColor: mix(V.acc, 40), color: V.ink }}
                >
                  {settings.currentAcademicYear}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="rounded-[10px] border px-3.5 py-1 flex flex-col items-center min-w-[92px]" style={{ borderColor: mix(V.acc, 20), background: V.tile }}>
            <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] leading-tight" style={{ color: `color-mix(in srgb, ${V.ink} 65%, white)` }}>{clockDate}</span>
            <span className="text-[16px] font-medium leading-tight tabular-nums" style={{ color: V.ink }}>{clockTime}</span>
          </div>
          <button
            onClick={() => void navigate('/enroll')}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium text-white transition-[filter] hover:brightness-95 cursor-pointer"
            style={{ background: `linear-gradient(135deg,${V.acc},${V.ink})`, boxShadow: `0 3px 10px ${mix(V.acc, 25)}` }}
            title="Enroll Student"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Enroll
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div ref={toolbarRef} className="sticky -top-4 z-20 -mx-4 -mt-3 px-4 pt-6 pb-1">
       {/* Backdrop that hides content scrolling under the toolbar — only once it's stuck.
           At rest it stays clear so the page gradient and search glow run on unbroken. */}
       <span
         aria-hidden
         className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-200"
         style={{ opacity: toolbarStuck ? 1 : 0, background: `linear-gradient(180deg,${V.tint} 0%,${V.tint} 80%,${mix(V.tint, 0)} 100%)` }}
       />
       <div className={`${CARD} px-2.5 py-2`}>
        {/* Single row: search + inline filters + actions */}
        <div className="flex items-center gap-2">
          <div className="relative shrink-0 w-60">
            {/* Search icon */}
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: V.ink }} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name, reg no, mobile"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => { const y = settings?.currentAcademicYear; if (y) void loadYearFeeData(y).catch(() => {}); }}
              className={`w-full rounded-full border border-(--dk-acc)/40 bg-(--dk-tint) py-2 text-[14px] font-medium text-(--dk-ink) placeholder:text-(--dk-ink)/55 placeholder:font-normal placeholder:text-[12.5px] focus:outline-none focus:bg-white focus:border-(--dk-acc) focus:ring-2 focus:ring-(--dk-acc)/20 transition-all duration-150 pl-9 ${inputValue ? 'pr-8' : 'pr-3'}`}
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => setInputValue('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#D97706]/10 hover:bg-[#D97706]/20 text-[#D97706] transition-colors duration-150 shrink-0"
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
              <span className="w-px h-5 shrink-0" style={{ background: V.border }} />
              <button
                onClick={clearFilters}
                className="shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-medium focus:outline-none focus:ring-2 focus:ring-[#D97706]/30 cursor-pointer transition-colors whitespace-nowrap hover:brightness-95"
                style={pastel(AMBER)}
              >
                Clear
              </button>
            </>
          )}

          <InsightsButton insights={insights} year={feeAcademicYear} isAdmin={isAdmin} compact={showFilters} />

          {/* Inline collapsible filter selects — expand between search and right actions */}
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
                  <FilterDropdown<Course | ''>
                    color={isSearchMode ? 'cyan' : 'periwinkle'}
                    value={courseFilter}
                    onChange={(v) => setCourseFilter(v as Course | '')}
                    placeholder="Course"
                    options={COURSES.map((c) => ({ value: c, label: c }))}
                  />
                  <FilterDropdown<Year | ''>
                    color={isSearchMode ? 'cyan' : 'periwinkle'}
                    value={yearFilter}
                    onChange={(v) => setYearFilter(v as Year | '')}
                    placeholder="Study Yr"
                    options={YEARS.map((yr) => ({ value: yr, label: yr }))}
                  />
                  <FilterDropdown<Gender | ''>
                    color={isSearchMode ? 'cyan' : 'periwinkle'}
                    value={genderFilter}
                    onChange={(v) => setGenderFilter(v as Gender | '')}
                    placeholder="Gender"
                    options={[
                      { value: 'BOY', label: 'BOY' },
                      { value: 'GIRL', label: 'GIRL' },
                    ]}
                  />
                  <FilterDropdown<Category | ''>
                    color={isSearchMode ? 'cyan' : 'periwinkle'}
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
                    color={isSearchMode ? 'cyan' : 'periwinkle'}
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
                    color={isSearchMode ? 'cyan' : 'periwinkle'}
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
                    color={isSearchMode ? 'cyan' : 'periwinkle'}
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

          {!isSearchMode && (
            <button
              onClick={() => openSummary()}
              className={`${showFilters ? ICON_PILL_BTN : OUTLINE_PILL_BTN} flex items-center gap-1.5 cursor-pointer shrink-0`}
              title="View Summary"
              aria-label="View Summary"
            >
              {showFilters ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              ) : 'Summary'}
            </button>
          )}

          {/* Pending Admissions label */}
          {admissionPendingStats && (
            <button
              onClick={() => void navigate('/admissions')}
              className={`flex items-center gap-1.5 cursor-pointer shrink-0 rounded-full border ${showFilters ? 'px-2.5' : 'px-3'} py-1.5 text-[11.5px] font-medium transition-all hover:brightness-95 active:scale-[0.97]`}
              style={pastel(AMBER)}
              title="View Pending Admissions"
              aria-label="View Pending Admissions"
            >
              {!showFilters && <span>Pending</span>}
              <span className="tabular-nums">
                <AnimNum value={admissionPendingStats.totalRegular + admissionPendingStats.totalLateral} />
              </span>
            </button>
          )}

          {/* Transfer Students label */}
          {transferStats && (
            <button
              onClick={() => void navigate('/student-reports?report=transfer-students')}
              className={`flex items-center gap-1.5 cursor-pointer shrink-0 rounded-full border ${showFilters ? 'px-2.5' : 'px-3'} py-1.5 text-[11.5px] font-medium transition-all hover:brightness-95 active:scale-[0.97]`}
              style={pastel('#0EA5E9')}
              title="View Transfer Students"
              aria-label="View Transfer Students"
            >
              {!showFilters && <span>Transfers</span>}
              <span className="tabular-nums">
                <AnimNum value={transferStats.total} />
              </span>
            </button>
          )}

          {/* Chips toggle */}
          {allStudents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowChips((v) => { const next = !v; localStorage.setItem('smp_chips_visible', String(next)); return next; })}
              className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
                showChips
                  ? 'bg-(--dk-acc)/10 border-(--dk-acc)/50 text-(--dk-ink)'
                  : 'border-(--dk-border) bg-white text-(--dk-ink)/70 hover:bg-(--dk-acc)/[0.06] hover:text-(--dk-ink)'
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
              className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
                showStatsPills
                  ? 'bg-(--dk-acc)/10 border-(--dk-acc)/50 text-(--dk-ink)'
                  : 'border-(--dk-border) bg-white text-(--dk-ink)/70 hover:bg-(--dk-acc)/[0.06] hover:text-(--dk-ink)'
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
            className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters || hasNonSearchFilters
                ? 'bg-(--dk-acc)/10 border-(--dk-acc)/50 text-(--dk-ink)'
                : 'border-(--dk-border) bg-white text-(--dk-ink)/70 hover:bg-(--dk-acc)/[0.06] hover:text-(--dk-ink)'
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
                  <span className={EYEBROW}>Total</span>
                  <span className="text-[14px] font-medium tabular-nums" style={{ color: V.ink }}>
                    <AnimNum value={confirmedActiveCount} />
                  </span>
                  {confirmedActiveCount < confirmedTotalCount && (
                    <span className="text-[12px] font-medium tabular-nums" style={{ color: FAINT }}>/{confirmedTotalCount}</span>
                  )}
                </div>

                {/* Arrow controls */}
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => scrollChips('left')}
                    className="w-6 h-6 flex items-center justify-center rounded-full border border-(--dk-acc)/40 bg-white text-(--dk-ink) hover:bg-(--dk-tint) transition-colors cursor-pointer text-base leading-none select-none mx-0.5 disabled:opacity-35"
                    aria-label="Scroll left"
                  >‹</button>
                  <button
                    type="button"
                    onClick={() => scrollChips('right')}
                    className="w-6 h-6 flex items-center justify-center rounded-full border border-(--dk-acc)/40 bg-white text-(--dk-ink) hover:bg-(--dk-tint) transition-colors cursor-pointer text-base leading-none select-none mx-0.5 disabled:opacity-35"
                    aria-label="Scroll right"
                  >›</button>
                </div>

                <span className="w-px h-4 shrink-0" style={{ background: V.border }} />

                {/* Per-year chips — scrollable */}
                <div ref={chipsScrollRef} className="chips-scroll flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar">
                  {activeStats.map(({ year, count }, idx) => {
                    const isSelected = !isSearchMode && academicYearFilter === year;
                    const isDimmed = count === 0;
                    const c = CHIP_PALETTE[idx % CHIP_PALETTE.length];
                    return (
                      <button
                        key={year}
                        type="button"
                        disabled={isSearchMode}
                        onClick={() => setAcademicYearFilter(isSelected ? '' : year as AcademicYear)}
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-full border px-3 py-[6px] text-[11px] font-medium transition-all ${
                          isSearchMode ? 'cursor-default' : 'cursor-pointer active:scale-[0.97] hover:brightness-[0.97]'
                        } ${isDimmed ? 'opacity-[0.5] hover:opacity-100' : ''}`}
                        style={isSelected
                          ? { background: c, borderColor: c, color: '#fff', boxShadow: `0 2px 8px ${c}40` }
                          : { background: '#fff', borderColor: `${c}73`, color: `color-mix(in srgb, ${c} 72%, #000)` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isSelected ? '#fff' : c }} />
                        <span className="tabular-nums">{year}</span>
                        <span className="tabular-nums" style={{ opacity: isSelected ? 0.9 : 0.75 }}>
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
                  { label: 'Category-wise',  c: '#10B981', fn: () => openSummary('category')   },
                  { label: 'Adm Type-wise',  c: '#0EA5E9', fn: () => openSummary('admtype')    },
                  { label: 'Cat & Gender',   c: '#EC4899', fn: () => openSummary('catgender')  },
                  { label: 'Year & Gender',  c: '#14B8A6', fn: () => openSummary('yeargender') },
                  { label: 'Date-wise Adm',  c: PERI,      fn: () => openSummary('datewise')   },
                ] as const).map(({ label, c, fn }) => (
                  <button
                    key={label}
                    onClick={fn}
                    style={pastel(c)}
                    className="group inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium cursor-pointer transition-all hover:brightness-95 active:scale-[0.97]"
                  >
                    <span>{label}</span>
                    <svg className="w-2.5 h-2.5 opacity-50 group-hover:opacity-90 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M7 17L17 7M7 7h10v10"/>
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
       </div>{/* end toolbar card */}
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex items-center justify-center h-32 text-sm text-red-500">{error}</div>
      ) : isSearchMode ? (

        /* ── Search results ─────────────────────────────────────────── */
        <SearchResults
          groups={studentGroups}
          query={searchTerm}
          feeStatus={searchFeeStatus}
          groupDue={searchGroupDue}
          studentDue={searchStudentDue}
          feeLoading={searchFeeLoading}
          isAdmin={isAdmin}
          currentAcademicYear={settings?.currentAcademicYear ?? ''}
          nextEnroll={nextEnrollByGroup}
          onReEnroll={startReEnroll}
          activeIdx={activeIdx}
          visibleCount={visibleCount}
          ctxStudentId={ctxMenu?.student.id ?? null}
          onShowMore={() => setVisibleCount((c) => c + SEARCH_PAGE_SIZE)}
          onClear={() => setInputValue('')}
          onView={setFeeHistoryStudent}
          onEdit={(s) => void navigate(`/enroll?edit=${s.id}&from=dashboard`)}
          onCollect={setCollectFeeStudent}
          onRowContextMenu={(pos, s) => setCtxMenu({ ...pos, student: s })}
        />

      ) : (

        /* ── Metric cards (bento) ───────────────────────────────────── */
        <div className="pb-4">
          <div className="space-y-4 min-w-0">

            {/* Cash-in-hand reminder (admin only; renders nothing for staff) */}
            {isAdmin && <CashInHandAlert variant="card" />}

            {/* Overview bento — Total (largest) · Course intake · Boys / Girls */}
            <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
              {/* Total card */}
              <div
                onClick={() => setTotalModal(true)}
                className={`${TILE} col-span-2 lg:col-span-5 lg:row-span-2 flex flex-col`}
                style={tileStyle(PERI)}
              >
                <div
                  className="flex items-center justify-between gap-2 px-4 pt-3.5 select-none"
                  onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents, displayYear, 'All Courses — Admission Type-wise Count'); }}
                  title="Double-click to export PDF"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PERI }} />
                    <p className="text-[10.5px] font-medium uppercase tracking-[0.8px]" style={{ color: PERI_INK }}>Total Enrolled</p>
                  </div>
                  <span className="rounded-full border bg-white px-2 py-[3px] text-[10px] font-medium leading-none tabular-nums" style={{ borderColor: `${PERI}55`, color: PERI_INK }}>{displayYear}</span>
                </div>

                <div className="flex-1 flex flex-col justify-center px-4 py-3">
                  <p className="text-[56px] font-medium leading-none tabular-nums" style={{ color: PERI_INK }}>
                    <AnimNum value={stats.total} />
                  </p>
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.6px] mt-1.5" style={{ color: FAINT }}>Confirmed</p>
                </div>

                <div className="grid grid-cols-5 gap-2 px-4 pb-4">
                  {[
                    { label: 'Boys',   value: stats.boys,                 c: BOY_HEX },
                    { label: 'Girls',  value: stats.girls,                c: GIRL_HEX },
                    { label: '1st Yr', value: stats.byYear['1ST YEAR'],   c: YEAR_HEX['1ST YEAR'] },
                    { label: '2nd Yr', value: stats.byYear['2ND YEAR'],   c: YEAR_HEX['2ND YEAR'] },
                    { label: '3rd Yr', value: stats.byYear['3RD YEAR'],   c: YEAR_HEX['3RD YEAR'] },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[10px] border flex flex-col items-center gap-0.5 px-1 py-2 min-w-0" style={wellStyle(item.c)}>
                      <span className="text-[8.5px] font-medium uppercase tracking-[0.4px]" style={{ color: FAINT }}>{item.label}</span>
                      <span className="text-[18px] font-medium leading-none tabular-nums" style={{ color: inkOf(item.c) }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Course bar chart — intake-based */}
              {(() => {
                const INTAKE = 63;
                const YEAR_INTAKE = INTAKE * COURSES.length;           // 315 per year
                const TOTAL_INTAKE = YEAR_INTAKE * YEARS.length;       // 945 overall
                const overallPct = Math.round((stats.total / TOTAL_INTAKE) * 100);
                const BAR_H = 92; // px — usable bar area
                const BAR_AREA = 108;
                return (
                  <div
                    onClick={() => setIntakeModal(true)}
                    className={`${TILE} col-span-2 lg:col-span-4 lg:row-span-2 px-4 pt-3.5 pb-3 flex flex-col bg-white`}
                    style={{ borderColor: PERI_BORDER }}
                  >
                    {/* Label (left) + year breakdown (right) */}
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[10.5px] font-medium uppercase tracking-[0.8px] leading-none" style={{ color: PERI_INK }}>Intake</p>
                        <span className="text-[14px] font-medium tabular-nums leading-none" style={{ color: PERI_INK }}>{overallPct}%</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        {YEARS.map((yr, i) => {
                          const yrPct = Math.round((stats.byYear[yr] / YEAR_INTAKE) * 100);
                          return (
                            <span key={yr} className="flex items-baseline gap-0.5">
                              <span className="text-[9px] font-medium leading-none" style={{ color: FAINT }}>{i + 1}Y</span>
                              <span className="text-[11px] font-medium tabular-nums leading-none" style={{ color: PERI_INK }}>{yrPct}%</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    {/* Bars + count labels */}
                    {(() => {
                      const maxCourseCount = Math.max(1, ...COURSES.map((c) => stats.byCourse[c]));
                      return (
                        <div className="flex items-end gap-2 flex-1" style={{ minHeight: BAR_AREA }}>
                          {COURSES.map((course, i) => {
                            const count = stats.byCourse[course];
                            const barH = count > 0 ? Math.max(3, Math.round((count / maxCourseCount) * BAR_H)) : 0;
                            return (
                              <div key={course} className="flex-1 flex flex-col justify-end items-center" style={{ height: BAR_AREA }}>
                                <span
                                  className="text-[11px] font-medium tabular-nums leading-none mb-1"
                                  style={{
                                    color: PERI_INK,
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
                                    background: `linear-gradient(180deg,${PERI},${PERI}99)`,
                                    borderRadius: '6px 6px 2px 2px',
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
                    {/* Course label */}
                    <div className="flex gap-2 pt-2 shrink-0 border-t mt-1.5" style={{ borderColor: '#EBEEFB' }}>
                      {COURSES.map((course) => (
                        <div key={course} className="flex-1 flex flex-col items-center">
                          <span className="text-[9.5px] font-medium leading-none" style={{ color: FAINT }}>{course}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Boys / Girls cards */}
              {([
                { gender: 'BOY' as const,  label: 'Boys',  c: BOY_HEX,  total: stats.boys,  pdfTitle: 'Boys — Year & Course Breakdown',  pdfTheme: 'sky' as const },
                { gender: 'GIRL' as const, label: 'Girls', c: GIRL_HEX, total: stats.girls, pdfTitle: 'Girls — Year & Course Breakdown', pdfTheme: 'rose' as const },
              ]).map(({ gender, label, c, total, pdfTitle, pdfTheme }) => {
                const pct = stats.total > 0 ? Math.round((total / stats.total) * 100) : 0;
                const breakCourse = COURSES[genderBreakIdx];
                const breakVal = genderCourseTotals[gender][breakCourse];
                return (
                  <div
                    key={gender}
                    onClick={() => setGenderModal(gender)}
                    onDoubleClick={(e) => { e.stopPropagation(); exportGenderCourseYearReport(confirmedStudents.filter((s) => s.gender === gender), displayYear, pdfTitle, pdfTheme); }}
                    className={`${TILE} col-span-1 lg:col-span-3 p-3.5 flex flex-col gap-1`}
                    style={tileStyle(c)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
                      <p className="text-[10.5px] font-medium uppercase tracking-[0.8px]" style={{ color: inkOf(c) }}>{label}</p>
                    </div>
                    <div className="flex items-end justify-between">
                      <p className="text-[32px] font-medium leading-none tabular-nums" style={{ color: inkOf(c) }}><AnimNum value={total} /></p>
                      <div className="flex flex-col gap-0.5 items-center w-14 shrink-0 opacity-[0.5]">
                        <SlotTicker label={breakCourse} value={breakVal} textColor="text-[#3F4BB8]" />
                      </div>
                    </div>
                    <div className="mt-auto pt-1.5 space-y-1">
                      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: `${c}22` }}>
                        <div
                          className="h-full w-full rounded-full"
                          style={{
                            background: c,
                            transformOrigin: 'left',
                            transform: barsReady ? `scaleX(${pct / 100})` : 'scaleX(0)',
                            transition: barsReady ? 'transform 800ms cubic-bezier(0.4,0,0.2,1)' : 'none',
                          }}
                        />
                      </div>
                      <p className="text-[10.5px] font-medium tabular-nums" style={{ color: FAINT }}>{stats.total > 0 ? `${pct}% of total` : '—'}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* By Course */}
            <div>
              <SectionLabel onDoubleClick={() => exportSummaryReport(confirmedStudents, displayYear)}>By Course</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {COURSES.map((course) => {
                  const courseTotal = stats.byCourse[course];
                  const c = COURSE_HEX[course];
                  return (
                    <div
                      key={course}
                      onClick={() => setCourseModalCourse(course)}
                      className={`${TILE} flex flex-col`}
                      style={tileStyle(c)}
                    >
                      <div className="flex items-center justify-between px-3.5 pt-3">
                        <div
                          className="rounded-full border px-2.5 py-[5px] text-[11px] font-medium uppercase tracking-wide leading-none select-none"
                          style={pastel(c)}
                          onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents.filter((s) => s.course === course), displayYear, `${course} — Admission Type-wise Count`, COURSE_PDF_THEME[course]); }}
                          title="Double-click to export PDF"
                        >
                          {course}
                        </div>
                        <p className="text-[26px] font-medium leading-none tabular-nums" style={{ color: inkOf(c) }}><AnimNum value={courseTotal} /></p>
                      </div>

                      <div className="flex-1 px-3.5 pt-2.5 pb-3 flex flex-col">
                        <div className="mt-auto flex flex-col">
                          {YEARS.map((yr, i) => (
                            <div key={yr} className={`flex items-center justify-between gap-1 ${i > 0 ? 'pt-1.5 mt-1.5 border-t' : ''}`} style={{ borderColor: `${c}25` }}>
                              <span className="text-[9.5px] font-medium uppercase tracking-wide" style={{ color: FAINT }}>{i + 1}Y</span>
                              <span className="text-[16px] font-medium leading-none tabular-nums" style={{ color: inkOf(c) }}>{stats.byCourseByYear[course][yr]}</span>
                            </div>
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
              <SectionLabel onDoubleClick={() => exportSummaryReport(confirmedStudents, displayYear)}>By Year of Study</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {YEARS.map((year) => {
                  const c = YEAR_HEX[year];
                  const yearTotal = stats.byYear[year];
                  const yearPct = Math.round((yearTotal / YEAR_INTAKE) * 100);
                  const yrShort = year === '1ST YEAR' ? '1st Yr' : year === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
                  const maxCourseCount = Math.max(1, ...COURSES.map((co) => stats.byYearByCourse[year][co]));
                  return (
                    <div
                      key={year}
                      onClick={() => setYearModalYear(year)}
                      onDoubleClick={(e) => { e.stopPropagation(); exportSummaryReport(confirmedStudents.filter((s) => s.year === year), displayYear, `${yrShort} — Admission Type-wise Count`, YEAR_PDF_THEME[year]); }}
                      className={`${TILE} p-3.5 flex flex-col gap-2.5`}
                      style={tileStyle(c)}
                      title="Double-click to export PDF"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
                        <p className="text-[10.5px] font-medium uppercase tracking-[0.8px]" style={{ color: inkOf(c) }}>{yrShort}</p>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[32px] font-medium leading-none tabular-nums" style={{ color: inkOf(c) }}><AnimNum value={yearTotal} /></p>
                        <SeatRing pct={yearPct} color={c} ready={barsReady} size={44} stroke={4} />
                      </div>

                      {/* Course-wise mini bar chart */}
                      <div className="mt-auto pt-1 flex items-end gap-1.5" style={{ height: 50 }}>
                        {COURSES.map((course, i) => {
                          const count = stats.byYearByCourse[year][course];
                          const barH = count > 0 ? Math.max(3, Math.round((count / maxCourseCount) * 30)) : 0;
                          return (
                            <div key={course} className="flex-1 flex flex-col items-center justify-end gap-0.5" style={{ height: 50 }}>
                              <span className="text-[9.5px] font-medium tabular-nums leading-none" style={{ color: inkOf(c) }}>{count}</span>
                              <div
                                className="w-full rounded-t-[4px]"
                                style={{
                                  height: barH,
                                  background: c,
                                  opacity: 0.75,
                                  transformOrigin: 'bottom',
                                  transform: barsReady ? 'scaleY(1)' : 'scaleY(0)',
                                  transition: barsReady ? `transform 600ms cubic-bezier(0.34,1.56,0.64,1) ${i * 60}ms` : 'none',
                                }}
                              />
                              <span className="text-[8.5px] font-medium leading-none" style={{ color: FAINT }}>{course}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Admission Type — SNQ / Lateral / Repeater (year & course-wise) */}
            <div>
              <SectionLabel>By Admission Type</SectionLabel>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {(['SNQ', 'LATERAL', 'REPEATER'] as const).map((key) => {
                  const admKey = ADM_TYPE_ADM_KEY[key];
                  const label = ADM_TYPE_LABEL[key];
                  const c = ADM_HEX[key];
                  const total = key === 'SNQ'
                    ? COURSES.reduce((a, co) => a + courseAdmTotals[co][admKey], 0)
                    : (stats.byAdmType[key] ?? 0);
                  const pct = stats.total > 0 ? Math.round((total / stats.total) * 100) : 0;
                  return (
                    <div
                      key={key}
                      onClick={() => setAdmTypeDetailModal(key)}
                      className={`${TILE} flex flex-col`}
                      style={tileStyle(c)}
                    >
                      <div
                        className="flex items-center justify-between gap-2 px-4 pt-3.5 select-none"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          exportSummaryReport(
                            confirmedStudents.filter((s) => (key === 'SNQ' ? s.admCat === 'SNQ' : s.admType === key)),
                            displayYear,
                            `${label} — Year & Course-wise Count`,
                          );
                        }}
                        title="Double-click to export PDF"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
                          <p className="text-[10.5px] font-medium uppercase tracking-[0.8px]" style={{ color: inkOf(c) }}>{label}</p>
                        </div>
                        <span className="text-[10px] font-medium tabular-nums whitespace-nowrap" style={{ color: FAINT }}>{pct}% of total</span>
                      </div>

                      <div className="flex-1 flex items-stretch px-4 py-3 gap-3.5">
                        <div className="flex flex-col justify-center shrink-0">
                          <p className="text-[40px] font-medium leading-none tabular-nums" style={{ color: inkOf(c) }}><AnimNum value={total} /></p>
                          <p className="text-[9.5px] font-medium uppercase tracking-[0.5px] mt-1" style={{ color: FAINT }}>Total</p>
                        </div>
                        <div className="w-px shrink-0" style={{ background: `${c}30` }} />
                        <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
                          <div className="grid items-center gap-x-1" style={{ gridTemplateColumns: '24px repeat(5, 1fr)' }}>
                            <span />
                            {COURSES.map((course) => (
                              <span key={course} className="text-[9px] font-medium uppercase tracking-wide text-center" style={{ color: FAINT }}>{course}</span>
                            ))}
                          </div>
                          {YEARS.map((yr, i) => (
                            <div key={yr} className="grid items-center gap-x-1" style={{ gridTemplateColumns: '24px repeat(5, 1fr)' }}>
                              <span className="text-[9px] font-medium" style={{ color: FAINT }}>{i + 1}Y</span>
                              {COURSES.map((course) => {
                                const v = stats.summaryTable[yr]?.[course]?.[admKey] ?? 0;
                                return (
                                  <span key={course} className="text-[12px] font-medium tabular-nums text-center" style={{ color: v === 0 ? '#C4C8D0' : inkOf(c) }}>
                                    {v === 0 ? '·' : v}
                                  </span>
                                );
                              })}
                            </div>
                          ))}
                          <div className="grid items-center gap-x-1 pt-1 mt-0.5 border-t" style={{ gridTemplateColumns: '24px repeat(5, 1fr)', borderColor: `${c}30` }}>
                            <span className="text-[9px] font-medium" style={{ color: FAINT }}>Σ</span>
                            {COURSES.map((course) => {
                              const v = courseAdmTotals[course][admKey];
                              return (
                                <span key={course} className="text-[12px] font-medium tabular-nums text-center" style={{ color: v === 0 ? '#C4C8D0' : inkOf(c) }}>
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
              <SectionLabel onDoubleClick={() => exportFirstYearSeatsReport(stats.firstYearSeats, displayYear)}>{lateralAllotments !== null ? 'Pending Seats — 1st Yr & Lateral 2nd Yr' : '1st Year — Pending Seats'}</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {COURSES.map((course) => {
                  const c = COURSE_HEX[course];
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
                    <div key={course} className="rounded-2xl border flex flex-col relative overflow-hidden" style={tileStyle(c)}>
                      <div className="flex items-center px-3.5 pt-3">
                        <div className="rounded-full border px-2.5 py-[5px] text-[11px] font-medium uppercase tracking-wide leading-none" style={pastel(c)}>{course}</div>
                      </div>

                      {/* Body — one row per seat type, each with its own fill ring */}
                      <div className="px-3.5 pt-2.5 pb-3 flex flex-col">
                        {rows.map((row, i) => {
                          const pct = row.total > 0 ? Math.min(100, Math.round((row.filled / row.total) * 100)) : 0;
                          return (
                            <div key={row.label} className={`flex items-center gap-2 ${i > 0 ? 'pt-1.5 mt-1.5 border-t' : ''}`} style={{ borderColor: `${c}25` }}>
                              <div className="w-9 flex items-center justify-center shrink-0">
                                {row.badge ? (
                                  <div className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center" style={{ borderColor: 'rgba(0,0,0,0.15)' }}>
                                    <span className="text-[7px] font-medium leading-none" style={{ color: AMBER }}>N/A</span>
                                  </div>
                                ) : (
                                  <SeatRing pct={pct} color={row.ring} ready={barsReady} size={32} stroke={3.5} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[9.5px] font-medium uppercase tracking-wide" style={{ color: FAINT }}>{row.label}</span>
                                  <span className="text-[16px] font-medium leading-none tabular-nums" style={{ color: inkOf(c) }}>
                                    <AnimNum value={row.pending} />
                                  </span>
                                </div>
                                {row.badge ? (
                                  <span className="mt-1 inline-block px-1.5 py-px rounded-full border text-[8px] font-medium leading-tight" style={pastel(AMBER)}>{row.badge}</span>
                                ) : (
                                  <p className="text-[9.5px] font-medium tabular-nums mt-0.5" style={{ color: FAINT }}>{row.filled}/{row.total} filled</p>
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
              <SectionLabel>Insights · Activity & DTEK News</SectionLabel>
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

                // Periwinkle tri-tone ramp, reused across every cycling mode for a cohesive look
                const GREEN_TONES = ['#C5CCFB', '#8C99F8', '#4A57C7'];
                const DARK_GREEN = '#3F4BB8';

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
                  className={`${CARD} flex flex-col overflow-hidden`}
                >
                  {/* Header — soft band, separated by a hairline */}
                  <div className="flex items-start justify-between gap-2 px-4 py-3 border-b" style={{ background: '#ECEFFD', borderColor: '#CDD4F7' }}>
                    <div key={barChartMode} style={{ animation: 'page-enter 0.28s ease-out' }}>
                      <p className="text-[13px] font-medium leading-tight" style={{ color: DARK_GREEN }}>{mode.title}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: FAINT }}>{mode.subtitle}</p>
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
                            background: i === barChartMode ? PERI : `${PERI}40`,
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
                        <span className="text-[9.5px] font-medium" style={{ color: FAINT }}>{mode.footerLabel(bi)}</span>
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
                              className="text-[10.5px] font-medium tabular-nums leading-none"
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
                            style={{ bottom: `${(t / niceMax) * 100}%`, borderColor: t === 0 ? 'rgba(63,75,184,0.18)' : 'rgba(63,75,184,0.08)' }}
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
                      <div className="border-t shrink-0" style={{ borderColor: 'rgba(63,75,184,0.18)' }} />

                      {/* Course name labels */}
                      <div className="flex gap-3 mt-1.5 shrink-0">
                        {COURSES.map((course) => (
                          <div key={course} className="flex-1 flex justify-center">
                            <span className="text-[9.5px] font-medium leading-none" style={{ color: DARK_GREEN }}>{course}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* Side slot — Recent Activity / DTEK News, switched by the header toggle.
                  Absolute fill so the bar chart card sets the row height. Both cards stay mounted
                  (the inactive one is hidden) so DTEK fetches once and Activity keeps cycling in sync. */}
              {(() => {
                const sideToggle = <SideCardToggle value={sideCard} onChange={changeSideCard} />;
                return (
                  <div className="relative min-h-[300px]">
                    <div className={`absolute inset-0 overflow-hidden rounded-2xl ${sideCard === 'activity' ? '' : 'hidden'}`}>
                      <RecentActivityCard
                        students={allStudents}
                        feeRecords={feeRecords}
                        academicYear={feeAcademicYear}
                        cycleIdx={barChartMode}
                        headerExtra={sideToggle}
                      />
                    </div>
                    <div className={`absolute inset-0 overflow-hidden rounded-2xl ${sideCard === 'dtek' ? '' : 'hidden'}`}>
                      <DtekNewsCard onOpen={setDtekCircular} isAdmin={role === 'admin'} headerExtra={sideToggle} />
                    </div>
                  </div>
                );
              })()}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>

    {dtekCircular && (
      <DtekCircularModal circular={dtekCircular} onClose={() => setDtekCircular(null)} />
    )}

    {feeHistoryStudent && (
      <StudentDetailModal
        theme="periwinkle"
        student={feeHistoryStudent}
        onClose={() => setFeeHistoryStudent(null)}
        defaultTab="fee"
      />
    )}

    {resultsStudent && (
      <StudentDetailModal
        theme="periwinkle"
        student={resultsStudent}
        onClose={() => setResultsStudent(null)}
        defaultTab="results"
      />
    )}

    {/* ── Collect Fee modal (admin, from dashboard search) ─────────────── */}
    {collectFeeStudent && (
      <FeeCollectionModal
        theme="periwinkle"
        student={collectFeeStudent}
        academicYear={collectFeeStudent.academicYear}
        receiptCounterYear={settings?.currentAcademicYear ?? collectFeeStudent.academicYear}
        onClose={() => setCollectFeeStudent(null)}
        onSaved={() => {
          yearFeeCache.delete(collectFeeStudent.academicYear);
          setFeeDataVersion((v) => v + 1);
          setCollectFeeStudent(null);
        }}
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
          className="font-wp fixed z-50 bg-white border border-(--dk-border) rounded-2xl overflow-hidden min-w-[220px]"
          style={{ ...accentVars(isSearchMode ? 'search' : 'peri'), left: ctxMenu.x, top: ctxMenu.y, visibility: 'hidden', boxShadow: '0 12px 36px rgba(63,75,184,0.14), 0 2px 8px rgba(18,20,26,0.05)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-(--dk-border) bg-(--dk-tint)">
            <p className="text-[11.5px] font-medium text-(--dk-ink) truncate">{ctxMenu.student.studentNameSSLC}</p>
            <p className="text-[9.5px] text-[#8A93A3] mt-0.5">
              {ctxMenu.student.course} · {ctxMenu.student.year} · {ctxMenu.student.academicYear}
              {isWPStudent(ctxMenu.student) && <span className="font-semibold text-[#5B9A2F]"> · WP</span>}
            </p>
          </div>
          {/* Items */}
          <div className="py-1">
            {/* ── Navigation actions ── */}
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setFeeHistoryStudent(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </span>
              View Details
            </button>
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setResultsStudent(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"/><path d="M6 5h12v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M9 13l2 2 4-4"/></svg>
              </span>
              View Results
            </button>
            {isAdmin && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
                onClick={() => { void navigate(`/enroll?edit=${ctxMenu.student.id}&from=dashboard`); setCtxMenu(null); }}
              >
                <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </span>
                Edit
              </button>
            )}
            {isAdmin && (() => {
              const YEAR_LABEL: Record<Year, string> = { '1ST YEAR': '1st Year', '2ND YEAR': '2nd Year', '3RD YEAR': '3rd Year' };
              const activeGroup = studentGroups.find((g) => g.records.some((r) => r.id === ctxMenu.student.id));
              const next = activeGroup && nextEnrollByGroup.get(activeGroup.key);
              if (!next) return null;
              return (
                <button
                  className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-(--dk-ink) hover:bg-(--dk-tint) flex items-center gap-2 transition-colors duration-100"
                  onClick={() => { startReEnroll(next); setCtxMenu(null); }}
                >
                  <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-acc)/15 text-(--dk-ink) flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-acc)/25 transition-colors">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
                  </span>
                  {`Enroll for ${YEAR_LABEL[next.targetYear]} in ${next.targetAcademicYear}`}
                </button>
              );
            })()}
            {/* WP fee is kept as manual counts — collecting here would double-count it. */}
            {isAdmin && !isWPStudent(ctxMenu.student) && (() => {
              const feeStatus = searchFeeLoading ? null : (searchFeeStatus.get(ctxMenu.student.id) ?? 'collect');
              if (feeStatus === 'no-dues') {
                return (
                  <div className="flex items-center gap-2 px-3 py-[5px] text-[12px] font-medium text-[#8A93A3] cursor-default">
                    <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#8A93A3] flex items-center justify-center flex-shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    No Dues
                  </div>
                );
              }
              return (
                <button
                  className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
                  onClick={() => { setCollectFeeStudent(ctxMenu.student); setCtxMenu(null); }}
                >
                  <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  </span>
                  {feeStatus === 'dues' ? 'Collect Dues' : 'Collect Fee'}
                </button>
              );
            })()}
            {/* ── Divider ── */}
            <div className="my-1 mx-2 h-px bg-(--dk-divider)" />
            {/* ── Certificate actions ── */}
            {isWPStudent(ctxMenu.student) && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
                onClick={() => { setAdmOrderStudent(ctxMenu.student); setCtxMenu(null); }}
              >
                <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                </span>
                Admission Order
              </button>
            )}
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setStudyCertStudent(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              </span>
              Study Certificate
            </button>
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
              onClick={() => { setTcStudent(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </span>
              Transfer Certificate
            </button>
            <button
              className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
              onClick={() => { generateTCApplication(ctxMenu.student); setCtxMenu(null); }}
            >
              <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
              </span>
              TC Application
            </button>
            {ctxMenu.student.year === '3RD YEAR' && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
                onClick={() => { setPcStudent(ctxMenu.student); setCtxMenu(null); }}
              >
                <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                </span>
                Provisional Certificate
              </button>
            )}
            {ctxMenu.student.year === '3RD YEAR' && (
              <button
                className="group w-full text-left px-3 py-[5px] text-[12px] font-medium text-[#5B6371] hover:bg-(--dk-tint) hover:text-(--dk-ink) flex items-center gap-2 transition-colors duration-100"
                onClick={() => { setCccStudent(ctxMenu.student); setCtxMenu(null); }}
              >
                <span className="w-[20px] h-[20px] rounded-[6px] bg-(--dk-tile) text-[#5B6371] flex items-center justify-center flex-shrink-0 group-hover:bg-(--dk-band) group-hover:text-(--dk-ink) transition-colors">
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
    {admOrderStudent && (
      <AdmissionOrderModal
        student={admOrderStudent}
        onClose={() => setAdmOrderStudent(null)}
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
        <div className="font-wp fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-[#1E2340]/30" onClick={() => setCourseModalCourse(null)} aria-hidden="true" />
          <div className={`relative rounded-2xl border ${c.border} ${c.bg} shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-md mx-4 overflow-hidden`} style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className={`px-5 py-3.5 flex items-center justify-between border-b ${c.border} relative overflow-hidden`}>
              <span aria-hidden="true" className={`absolute -bottom-4 -right-2 text-8xl font-medium leading-none select-none pointer-events-none ${c.textColor} opacity-[0.07]`}>
                {courseModalCourse}
              </span>
              <div className="flex items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-md text-sm font-medium uppercase tracking-widest border ${c.border} bg-white/70 ${c.textColor}`}>
                  {courseModalCourse}
                </span>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Admission Type-wise</p>
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
                    <th className={`px-3 py-2 text-left font-medium ${c.textColor} border-b ${c.border}`}>Year</th>
                    {cols.map(({ key, label }) => (
                      <th key={key} className={`px-3 py-2 text-right font-medium ${key === 'total' ? c.textColor : 'text-gray-500'} border-b ${c.border} ${key === 'total' ? 'border-l' : ''}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.yrLabel} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className={`px-3 py-2.5 font-medium text-gray-700 border-b ${c.border}`}>{row.yrLabel}</td>
                      {cols.map(({ key }) => (
                        <td key={key} className={`px-3 py-2.5 text-right tabular-nums border-b ${c.border} ${key === 'total' ? `font-medium ${c.textColor} border-l ${c.border}` : 'text-gray-700'}`}>
                          {row[key] > 0 ? row[key] : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`${c.bg} border-t ${c.border}`}>
                    <td className={`px-3 py-2.5 font-medium ${c.textColor} text-xs uppercase tracking-wide`}>Total</td>
                    {cols.map(({ key }) => (
                      <td key={key} className={`px-3 py-2.5 text-right tabular-nums font-medium ${c.textColor} text-sm ${key === 'total' ? `border-l ${c.border}` : ''}`}>
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
        <div className="font-wp fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-[#1E2340]/30" onClick={() => setTotalModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border border-[#93D6F5] bg-[#EEF9FD] shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-lg mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            {/* Header */}
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#93D6F5] relative overflow-hidden">
              <span aria-hidden="true" className="absolute -bottom-4 -right-2 text-8xl font-medium leading-none select-none pointer-events-none text-[#0C8CC6] opacity-[0.07]">ALL</span>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-md text-sm font-medium uppercase tracking-widest border border-[#93D6F5] bg-white/70 text-[#0A73A3]">Total</span>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Year &amp; Course-wise</p>
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
                  <tr className="bg-[#EEF9FD]">
                    <th className="px-3 py-2 text-left font-medium text-[#0A73A3] border-b border-[#93D6F5]">Year</th>
                    {COURSES.map((c) => (
                      <th key={c} className="px-3 py-2 text-right font-medium text-gray-500 border-b border-[#93D6F5]">{c}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium text-[#0A73A3] border-b border-l border-[#93D6F5]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.yr} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className="px-3 py-2.5 font-medium text-gray-700 border-b border-[#93D6F5]/40">{YEAR_LABELS[row.yr]}</td>
                      {row.cells.map((v, ci) => (
                        <td key={ci} className="px-3 py-2.5 text-right tabular-nums text-gray-700 border-b border-[#93D6F5]/40">
                          {v > 0 ? v : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#0A73A3] border-b border-l border-[#93D6F5]/40">
                        {row.total > 0 ? row.total : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#EEF9FD] border-t border-[#93D6F5]">
                    <td className="px-3 py-2.5 font-medium text-[#0A73A3] text-xs uppercase tracking-wide">Total</td>
                    {grandCols.map((v, ci) => (
                      <td key={ci} className="px-3 py-2.5 text-right tabular-nums font-medium text-[#0A73A3] text-sm">{v}</td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#0A73A3] text-sm border-l border-[#93D6F5]">{grandTotal}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Summary — tabbed report incl. the stats-pill tables (Category, Adm Type, Cat & Gender, Year & Gender, Date-wise) */}
    {summaryModal && summaryInput && (
      <SummaryModal input={summaryInput} filterLabel={summaryFilterLabel} initialTab={summaryTab} onClose={() => setSummaryModal(false)} />
    )}

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
        <div className="font-wp fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-[#1E2340]/30" onClick={() => setIntakeModal(false)} aria-hidden="true" />
          <div className="relative rounded-2xl border border-[#93D6F5] bg-[#EEF9FD] shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-xl mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            {/* Header */}
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-[#93D6F5] relative overflow-hidden">
              <span aria-hidden="true" className="absolute -bottom-4 -right-2 text-8xl font-medium leading-none select-none pointer-events-none text-[#0C8CC6] opacity-[0.07]">%</span>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-md text-sm font-medium uppercase tracking-widest border border-[#93D6F5] bg-white/70 text-[#0A73A3]">Intake %</span>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Year &amp; Course-wise · 63 seats</p>
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
                  <tr className="bg-[#EEF9FD]">
                    <th className="px-3 py-2 text-left font-medium text-[#0A73A3] border-b border-[#93D6F5]">Year</th>
                    {COURSES.map((c) => (
                      <th key={c} className="px-3 py-2 text-right font-medium text-gray-500 border-b border-[#93D6F5]">{c}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium text-[#0A73A3] border-b border-l border-[#93D6F5]">Total</th>
                    <th className="px-3 py-2 text-right font-medium text-[#0A73A3] border-b border-[#93D6F5]">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.yr} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className="px-3 py-2.5 font-medium text-gray-700 border-b border-[#93D6F5]/40">{YEAR_LABELS[row.yr]}</td>
                      {row.cells.map((v, ci) => {
                        const cellPct = Math.round((v / INTAKE) * 100);
                        return (
                          <td key={ci} className={`${tc} border-b border-[#93D6F5]/40`}>
                            <div className="flex flex-col items-end gap-px">
                              <span className="text-gray-700">{v > 0 ? v : <span className="text-gray-300">—</span>}</span>
                              {v > 0 && <span className="text-[9px] text-[#4ABCEE]/80 font-medium">{cellPct}%</span>}
                            </div>
                          </td>
                        );
                      })}
                      <td className={`${tc} font-medium text-[#0A73A3] border-b border-l border-[#93D6F5]/40`}>
                        {row.total > 0 ? row.total : <span className="text-gray-300">—</span>}
                      </td>
                      <td className={`${tc} font-medium text-[#0C8CC6] border-b border-[#93D6F5]/40`}>
                        {row.rowPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#EEF9FD] border-t border-[#93D6F5]">
                    <td className="px-3 py-2.5 font-medium text-[#0A73A3] text-xs uppercase tracking-wide">Total</td>
                    {grandCols.map((v, ci) => {
                      const colPct = Math.round((v / (INTAKE * YEARS.length)) * 100);
                      return (
                        <td key={ci} className={`${tc}`}>
                          <div className="flex flex-col items-end gap-px">
                            <span className="font-medium text-[#0A73A3] text-sm">{v}</span>
                            <span className="text-[9px] text-[#4ABCEE]/80 font-medium">{colPct}%</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#0A73A3] text-sm border-l border-[#93D6F5]">{grandTotal}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#0C8CC6] text-sm">
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
      const bg      = isBoy ? 'bg-[#EEF9FD]'      : 'bg-[#FEF2F8]';
      const brd     = isBoy ? 'border-[#93D6F5]' : 'border-[#F6ADD1]';
      const textCol = isBoy ? 'text-[#0A73A3]'   : 'text-[#C93D82]';
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
        <div className="font-wp fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-[#1E2340]/30" onClick={() => setGenderModal(null)} aria-hidden="true" />
          <div className={`relative rounded-2xl border ${brd} ${bg} shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-md mx-4 overflow-hidden`} style={{ animation: 'modal-enter 0.25s ease-out' }}>
            {/* Header */}
            <div className={`px-5 py-3.5 flex items-center justify-between border-b ${brd} relative overflow-hidden`}>
              <span aria-hidden="true" className={`absolute -bottom-4 -right-2 text-8xl font-medium leading-none select-none pointer-events-none ${textCol} opacity-[0.07]`}>
                {wm}
              </span>
              <div className="flex items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-md text-sm font-medium uppercase tracking-widest border ${brd} bg-white/70 ${textCol}`}>
                  {label}
                </span>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Course &amp; Year-wise</p>
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
                    <th className={`px-3 py-2 text-left font-medium ${textCol} border-b ${brd}`}>Course</th>
                    {(['1ST YEAR', '2ND YEAR', '3RD YEAR'] as Year[]).map((yr) => (
                      <th key={yr} className={`px-3 py-2 text-right font-medium text-gray-500 border-b ${brd}`}>{YEAR_LABELS[yr]}</th>
                    ))}
                    <th className={`px-3 py-2 text-right font-medium ${textCol} border-b border-l ${brd}`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.course} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className={`px-3 py-2.5 font-medium text-gray-700 border-b ${brd}`}>{row.course}</td>
                      {[row.yr1, row.yr2, row.yr3].map((v, j) => (
                        <td key={j} className={`px-3 py-2.5 text-right tabular-nums border-b ${brd} text-gray-700`}>
                          {v > 0 ? v : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                      <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${textCol} border-b border-l ${brd}`}>
                        {row.total > 0 ? row.total : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`${bg} border-t ${brd}`}>
                    <td className={`px-3 py-2.5 font-medium ${textCol} text-xs uppercase tracking-wide`}>Total</td>
                    {[grand.yr1, grand.yr2, grand.yr3].map((v, j) => (
                      <td key={j} className={`px-3 py-2.5 text-right tabular-nums font-medium ${textCol} text-sm`}>{v}</td>
                    ))}
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${textCol} text-sm border-l ${brd}`}>{grand.total}</td>
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
        <div className="font-wp fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-[#1E2340]/30" onClick={() => setYearModalYear(null)} aria-hidden="true" />
          <div className={`relative rounded-2xl border ${y.border} ${y.bg} shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-md mx-4 overflow-hidden`} style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className={`px-5 py-3.5 flex items-center justify-between border-b ${y.border} relative overflow-hidden`}>
              <span aria-hidden="true" className={`absolute -bottom-4 -right-2 text-8xl font-medium leading-none select-none pointer-events-none ${y.textColor} opacity-[0.07]`}>
                {wm}
              </span>
              <div className="flex items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-md text-sm font-medium uppercase tracking-widest border ${y.border} bg-white/70 ${y.textColor}`}>
                  {y.label}
                </span>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Admission Type-wise</p>
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
                    <th className={`px-3 py-2 text-left font-medium ${y.textColor} border-b ${y.border}`}>Course</th>
                    {cols.map(({ key, label }) => (
                      <th key={key} className={`px-3 py-2 text-right font-medium ${key === 'total' ? y.textColor : 'text-gray-500'} border-b ${y.border} ${key === 'total' ? `border-l ${y.border}` : ''}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.course} className={`${i % 2 === 0 ? 'bg-white/60' : 'bg-white/30'} hover:bg-white/80 transition-colors`}>
                      <td className={`px-3 py-2.5 font-medium text-gray-700 border-b ${y.border}`}>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${y.border} bg-white/70 ${y.textColor}`}>
                          {row.course}
                        </span>
                      </td>
                      {cols.map(({ key }) => (
                        <td key={key} className={`px-3 py-2.5 text-right tabular-nums border-b ${y.border} ${key === 'total' ? `font-medium ${y.textColor} border-l ${y.border}` : 'text-gray-700'}`}>
                          {row[key] > 0 ? row[key] : <span className="text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`${y.bg} border-t ${y.border}`}>
                    <td className={`px-3 py-2.5 font-medium ${y.textColor} text-xs uppercase tracking-wide`}>Total</td>
                    {cols.map(({ key }) => (
                      <td key={key} className={`px-3 py-2.5 text-right tabular-nums font-medium ${y.textColor} text-sm ${key === 'total' ? `border-l ${y.border}` : ''}`}>
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
        <div className="font-wp fixed inset-0 z-50 flex items-center justify-center" style={{ animation: 'backdrop-enter 0.2s ease-out' }}>
          <div className="absolute inset-0 bg-[#1E2340]/30" onClick={() => setAdmTypeDetailModal(null)} aria-hidden="true" />
          <div className="relative rounded-2xl border shadow-[0_24px_60px_rgba(63,75,184,0.18)] w-full max-w-3xl mx-4 overflow-hidden flex flex-col h-[480px]" style={{ borderColor: theme.trackColor, background: theme.bodyBg, animation: 'modal-enter 0.25s ease-out' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b shrink-0" style={{ borderColor: theme.trackColor }}>
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full shrink-0" style={{ background: theme.barColor }} />
                <p className="text-xs font-medium uppercase tracking-widest" style={{ color: theme.numColor }}>{label} — Year & Course-wise Count</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => exportSummaryReport(typeStudents, displayYear, `${label} — Year & Course-wise Count`)}
                  className="text-[10px] font-medium transition-colors cursor-pointer uppercase tracking-wide hover:opacity-70"
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
                    <tr className="border-b" style={{ borderColor: theme.trackColor }}>
                      <th className="px-1 py-1.5 font-medium text-left text-[9px] uppercase tracking-wide" style={{ color: theme.numColor }}>Yr</th>
                      {COURSES.map((c) => (
                        <th key={c} className="px-1 py-1.5 font-medium text-right text-[9px] uppercase tracking-wide" style={{ color: theme.numColor }}>{c}</th>
                      ))}
                      <th className="px-1 py-1.5 font-medium text-right text-[9px] uppercase tracking-wide" style={{ color: theme.numColor }}>Σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className={tl + ' text-gray-600 font-medium'}>{YEARS[i] === '1ST YEAR' ? '1Y' : YEARS[i] === '2ND YEAR' ? '2Y' : '3Y'}</td>
                        {r.byCourse.map((v, j) => <td key={j} className={tc + ' text-gray-700'}>{v === 0 ? '·' : v}</td>)}
                        <td className={tc + ' font-medium text-gray-800'}>{r.total === 0 ? '·' : r.total}</td>
                      </tr>
                    ))}
                    <tr className="font-medium border-t border-[#CDD4F7]" style={{ background: '#ECEFFD', color: '#3F4BB8' }}>
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
                <p className="px-1 pb-1 text-[9px] font-medium uppercase tracking-widest shrink-0" style={{ color: theme.numColor }}>
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
                      <tr className="border-b" style={{ borderColor: theme.trackColor }}>
                        {['Yr', 'Crs', 'Name', 'Cat', 'Mobile'].map((h) => (
                          <th key={h} className="px-1 py-1.5 font-medium whitespace-nowrap text-left text-[9px] uppercase tracking-wide" style={{ color: theme.numColor }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {typeStudents.length === 0 ? (
                        <tr><td colSpan={5} className="px-1 py-6 text-center text-[10px] text-gray-400">No {label.toLowerCase()} students</td></tr>
                      ) : typeStudents.map((s) => (
                        <tr key={s.id} className="border-b border-gray-100">
                          <td className="px-1 py-1.5 text-[10px] text-gray-500">{s.year === '1ST YEAR' ? '1Y' : s.year === '2ND YEAR' ? '2Y' : '3Y'}</td>
                          <td className="px-1 py-1.5 text-[10px] font-medium text-gray-700">{s.course}</td>
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

    </>
  );
}
