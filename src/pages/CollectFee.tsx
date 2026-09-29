import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useFeeOverrides } from '../hooks/useFeeOverrides';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { getRefundRecordsByAcademicYear, isFeeNettingRefund } from '../services/refundService';
import type { RefundRecord } from '../services/refundService';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { FeeCollectionModal } from '../components/fee/FeeCollectionModal';
import { FeeHistoryModal } from '../components/fee/FeeHistoryModal';
import { prefetchCollectFee, prefetchFeeHistory, invalidateFeePrefetch } from '../components/fee/feeModalPrefetch';
import type {
  Student,
  Course,
  Year,
  Gender,
  AcademicYear,
  AdmType,
  AdmCat,
  FeeStructure,
  StudentFeeOverride,
  FeeRecord,
} from '../types';
import { SMP_FEE_HEADS } from '../types';
import { PageSpinner } from '../components/common/PageSpinner';
import { effectiveValues, calcAllotted } from '../utils/feeCalc';
import type { YearData } from '../utils/feeCalc';

const PAGE_SIZE = 100;

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

// Table columns with fixed widths (px). Both the header strip and the body
// table use table-layout: fixed with these widths, so columns never shift
// when filters change the rows on screen. Spare width is shared proportionally.
const TABLE_COLUMNS: { label: string; width: number }[] = [
  { label: '#', width: 52 },
  { label: 'Name (SSLC)', width: 300 },
  { label: 'Reg No', width: 112 },
  { label: 'Course', width: 76 },
  { label: 'Year', width: 96 },
  { label: 'Adm Type', width: 104 },
  { label: 'Adm Cat', width: 86 },
  { label: 'Adm Status', width: 110 },
  { label: 'Fee Details', width: 124 },
  { label: 'Actions', width: 122 },
];
const TABLE_MIN_WIDTH = TABLE_COLUMNS.reduce((a, c) => a + c.width, 0);
const TABLE_COLGROUP = (
  <colgroup>
    {TABLE_COLUMNS.map((c) => <col key={c.label} style={{ width: c.width }} />)}
  </colgroup>
);
// Uniform width for the row action buttons (fits "Collect Dues" + icon).
const ACTION_W = 98;

// ── Design tokens — WP Students revamp look, re-tinted to teal ─────────────
const TEAL = '#0F8B8D';
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
// Colour-coded accents for the stat chips and the thin-line table pills.
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};
const ADM_TYPE_COLOR: Record<string, string> = {
  REGULAR: '#1D6FD8', REPEATER: '#D97706', LATERAL: '#7C3AED', EXTERNAL: TEAL, SNQ: '#10B981',
};
const ADM_CAT_COLOR: Record<string, string> = { GM: '#5B9A2F', SNQ: '#10B981', OTHERS: '#F59E0B' };
const STATUS_COLOR: Record<string, string> = { CONFIRMED: '#0FA968', CANCELLED: '#E11D48' };
const STATUS_COLOR_DEFAULT = '#D97706';
const FEE_STATUS_COLOR = { PAID: '#0FA968', NOT_PAID: '#E11D48', FEE_DUES: '#D97706', NO_FEE_DUES: TEAL };
// Row actions: Collect Fee / Collect Dues / No Dues.
const ACTION_COLOR = { collect: '#1D6FD8', dues: '#D97706', noDues: '#0FA968' };
const FALLBACK_COLOR = '#8A93A3';
// Per-column pill widths (px) — sized to each column's longest value.
const PILL_W = { course: 34, year: 66, admType: 70, admCat: 56, status: 80 };

const TH =
  'h-9 px-3 py-0 align-middle text-left text-[9.5px] font-medium uppercase tracking-[0.6px] text-[#0B6567] whitespace-nowrap';
const OUTLINE_PILL_BTN =
  'shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#CDE6E6] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#262B35] hover:border-[#0F8B8D]/40 hover:bg-[#0F8B8D]/[0.06] hover:text-[#0B6567] focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';
const CHIP_ARROW =
  'shrink-0 w-6 h-6 rounded-full border border-[#0F8B8D]/45 bg-white text-[#0B6567] flex items-center justify-center shadow-[0_1px_4px_rgba(18,20,26,0.06)] enabled:hover:bg-[#EFF8F8] enabled:cursor-pointer disabled:opacity-35 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F8B8D]/30 transition-[opacity,background-color]';
const MENU_ITEM =
  'group w-full text-left px-2 py-1.5 rounded-[10px] text-[12px] font-medium text-[#5B6371] enabled:hover:bg-[#F4FAFA] enabled:hover:text-[#262B35] enabled:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors duration-100';
const MENU_ICON =
  'w-6 h-6 rounded-[8px] bg-[#EAF4F4] text-[#5B6371] flex items-center justify-center flex-shrink-0 transition-colors';

/** Accent colour deepened for use as text on a light background. */
const inkOf = (c: string) => `color-mix(in srgb, ${c} 72%, #000)`;

// Outline chip: white fill + tinted hairline and ink; solid colour when selected.
function chipStyle(color: string, selected: boolean): React.CSSProperties {
  return selected
    ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 2px 8px ${color}40` }
    : { background: '#fff', borderColor: `${color}73`, color: inkOf(color) };
}

/** Department ring monogram — pastel gradient in the department's hue with a thin ring. */
function RingAvatar({ name, course }: { name: string; course: string }) {
  const h = DEPT_HUE[course] ?? 210;
  const ring = DEPT_DOT[course] ?? FALLBACK_COLOR;
  return (
    <span
      className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 text-[9.5px] font-medium tracking-[0.3px]"
      style={{
        background: `linear-gradient(135deg, hsl(${h - 6} 85% 88%), hsl(${h + 8} 85% 74%))`,
        color: `hsl(${h} 70% 22%)`,
        boxShadow: `0 0 0 1px #fff, 0 0 0 2px ${ring}80`,
      }}
      title={course}
    >
      {name.charAt(0)}
    </span>
  );
}

/** Compact thin-line pill: accent-tinted fill, border and ink text; fixed min width per column. */
function LinePill({ value, color, minWidth }: { value?: string; color?: string; minWidth?: number }) {
  if (!value) return <span className="text-[#C4C8D0] text-[10px]">—</span>;
  const c = color ?? FALLBACK_COLOR;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border px-[7px] py-[4.5px] text-[10.5px] font-medium leading-none"
      style={{ background: `${c}14`, borderColor: `${c}73`, color: inkOf(c), minWidth }}
    >
      {value}
    </span>
  );
}

/** Compact boxy outline button for row actions (Collect Fee / Collect Dues / No Dues / Fee Details). */
function ActionPill({ color, onClick, onIntent, disabled, width, children }: {
  color: string;
  onClick?: () => void;
  /** Fired when the pointer reaches the button or it gains focus — used to prefetch the modal's data. */
  onIntent?: () => void;
  disabled?: boolean;
  /** Fixed width (px) so every button in a column lines up; otherwise fits content. */
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={disabled ? undefined : onIntent}
      onFocus={disabled ? undefined : onIntent}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1 rounded-[7px] border bg-white px-2 py-[7px] whitespace-nowrap text-[11px] font-medium leading-none transition-[background-color,box-shadow] duration-150 enabled:cursor-pointer enabled:hover:bg-[var(--tint)] enabled:hover:shadow-[0_2px_8px_rgba(18,20,26,0.06)] disabled:bg-[var(--tint)] disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      style={{ '--tint': `${color}14`, '--ring': `${color}40`, borderColor: `${color}73`, color: inkOf(color), width } as React.CSSProperties}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 text-center" style={{ animation: 'content-enter 0.26s ease-out' }}>
      <div className="w-14 h-14 rounded-2xl border border-[#CDE6E6] bg-[#EFF8F8] flex items-center justify-center text-[#8A93A3]">
        {icon}
      </div>
      <p className="text-[14px] font-medium text-[#5B6371]">{title}</p>
    </div>
  );
}

function AnimNum({ value }: { value: number }) {
  return (
    <span
      key={value}
      className="font-medium tabular-nums"
      style={{ display: 'inline-block', animation: 'stat-pop 0.28s ease-out' }}
    >
      {value}
    </span>
  );
}

function LoadingGate() {
  return <PageSpinner />;
}

const DOT_SEP = <span className="w-1 h-1 rounded-full bg-[#BFDDDD] shrink-0 mx-0.5" />;

export function CollectFee() {

  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Pre-fill search when navigated here from another page (e.g. Students right-click → Collect Fee)
  useEffect(() => {
    const prefill = (location.state as { prefillStudent?: string } | null)?.prefillStudent;
    if (prefill) {
      setSearchTerm(prefill);
      setDebouncedSearch(prefill);
      // Clear all filters so the student surfaces at the top unobstructed
      setCourseFilter('');
      setYearFilter('');
      setGenderFilter('');
      setAdmTypeFilter('');
      setAdmCatFilter('');
      setFeeStatusFilter('ALL');
      setVisibleCount(PAGE_SIZE);
      // Clear state so back-navigation doesn't re-apply the prefill
      window.history.replaceState({}, '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [genderFilter, setGenderFilter] = useState<Gender | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter, setAdmCatFilter] = useState<AdmCat | ''>('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<'ALL' | 'PAID' | 'NOT_PAID' | 'FEE_DUES' | 'NO_FEE_DUES'>('ALL');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [feeHistoryStudent, setFeeHistoryStudent] = useState<{ student: Student; noDues: boolean } | null>(null);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; student: Student; hasFeeRecord: boolean; isFullyPaid: boolean;
  } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const closeCtx = useCallback(() => setCtxMenu(null), []);

  // Outside clicks are caught by an invisible backdrop; Escape closes too.
  useEffect(() => {
    if (!ctxMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeCtx(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ctxMenu, closeCtx]);

  // Measure the menu and clamp it to the viewport — direct DOM mutation avoids
  // a state-update re-render loop.
  useLayoutEffect(() => {
    const el = ctxRef.current;
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

  const { students: allStudents, loading: studentsLoading } = useStudents(academicYear);
  const { records: feeRecords, loading: feeLoading, refetch: refetchFees } =
    useFeeRecords(academicYear);
  const { overrides: feeOverrides } = useFeeOverrides(academicYear);

  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!academicYear) { setFeeStructures([]); return; }
    getFeeStructuresByAcademicYear(academicYear).then(setFeeStructures).catch(() => {});
  }, [academicYear]);

  const [refundRecords, setRefundRecords] = useState<RefundRecord[]>([]);

  useEffect(() => {
    if (!academicYear) { setRefundRecords([]); return; }
    getRefundRecordsByAcademicYear(academicYear).then(setRefundRecords).catch(() => {});
  }, [academicYear]);

  // Map: studentId → total refunded (e.g. SNQ tuition concession refunds) — refunds are
  // recorded separately from feeRecords, so paid totals must be netted by this before
  // comparing against the allotted structure, matching FeeHistoryModal's logic.
  const refundedByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of refundRecords.filter(isFeeNettingRefund)) {
      map.set(r.studentId, (map.get(r.studentId) ?? 0) + r.refundAmount);
    }
    return map;
  }, [refundRecords]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Map: "${course}__${year}__${admType}__${admCat}" → fee structure (structure fallback)
  const structureByKey = useMemo(() => {
    const map = new Map<string, FeeStructure>();
    for (const s of feeStructures) {
      map.set(`${s.course}__${s.year}__${s.admType}__${s.admCat}`, s);
    }
    return map;
  }, [feeStructures]);

  // Map: studentId → override (takes precedence over structure)
  const overrideByStudent = useMemo(() => {
    const map = new Map<string, StudentFeeOverride>();
    for (const o of feeOverrides) map.set(o.studentId, o);
    return map;
  }, [feeOverrides]);

  // Map: studentId → this year's fee records (needed to compute the effective fine)
  const recordsByStudent = useMemo(() => {
    const map = new Map<string, FeeRecord[]>();
    for (const r of feeRecords) {
      const arr = map.get(r.studentId);
      if (arr) arr.push(r);
      else map.set(r.studentId, [r]);
    }
    return map;
  }, [feeRecords]);

  /**
   * Returns the effective allotted total for a student (override > structure), with the SMP
   * fine head bumped up to match any fine actually paid — mirrors FeeHistoryModal/feeCalc so
   * the list badge never disagrees with the Fee Details modal once fines are collected.
   */
  const getAllotted = useCallback(
    (s: { id: string; course: string; year: string; admType: string; admCat: string }): number | null => {
      if (!academicYear) return null;
      const override = overrideByStudent.get(s.id) ?? null;
      const structure = override
        ? null
        : structureByKey.get(`${s.course}__${s.year}__${s.admType}__${s.admCat}`) ?? null;
      const records = recordsByStudent.get(s.id) ?? [];
      const yd: YearData = { academicYear, records, structure, override };
      const ev = effectiveValues(yd);
      if (!ev) return null;
      return calcAllotted(ev.smp, ev.svk, ev.additional, records);
    },
    [overrideByStudent, structureByKey, recordsByStudent, academicYear],
  );

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
    for (const [studentId, refunded] of refundedByStudent) {
      totals.set(studentId, (totals.get(studentId) ?? 0) - refunded);
    }
    return { paidStudents: paid, totalPaidByStudent: totals };
  }, [feeRecords, refundedByStudent]);

  const filteredStudents = useMemo(() => {
    let result = allStudents.filter((s) => s.admissionStatus === 'CONFIRMED');
    if (courseFilter)    result = result.filter((s) => s.course === courseFilter);
    if (yearFilter)      result = result.filter((s) => s.year === yearFilter);
    if (genderFilter)    result = result.filter((s) => s.gender === genderFilter);
    if (admTypeFilter)   result = result.filter((s) => s.admType === admTypeFilter);
    if (admCatFilter)    result = result.filter((s) => s.admCat === admCatFilter);
    if (feeStatusFilter === 'PAID')
      result = result.filter((s) => paidStudents.has(s.id));
    if (feeStatusFilter === 'NOT_PAID')
      result = result.filter((s) => !paidStudents.has(s.id));
    if (feeStatusFilter === 'FEE_DUES') {
      result = result.filter((s) => {
        const allotted = getAllotted(s);
        const paid = totalPaidByStudent.get(s.id) ?? 0;
        return allotted !== null && paid < allotted;
      });
    }
    if (feeStatusFilter === 'NO_FEE_DUES') {
      result = result.filter((s) => {
        const allotted = getAllotted(s);
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
        const matchReg = !!s.regNumber?.toUpperCase().includes(search);
        return matchName || matchMobile || matchReg;
      });
    }
    // Sort: newest enrollment first (createdAt DESC), then Year → Course → Name
    return result.slice().sort((a, b) => {
      const tDiff = (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      if (tDiff !== 0) return tDiff;
      const y = (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9);
      if (y !== 0) return y;
      const c = a.course.localeCompare(b.course);
      if (c !== 0) return c;
      return a.studentNameSSLC.localeCompare(b.studentNameSSLC);
    });
  }, [
    allStudents, structureByKey, overrideByStudent, recordsByStudent, totalPaidByStudent,
    courseFilter, yearFilter, genderFilter, admTypeFilter, admCatFilter,
    feeStatusFilter, debouncedSearch, paidStudents, getAllotted,
  ]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filteredStudents]);

  const visibleStudents = useMemo(
    () => filteredStudents.slice(0, visibleCount),
    [filteredStudents, visibleCount]
  );

  const hasMore = visibleCount < filteredStudents.length;

  const [showFilters, setShowFilters] = useState(() => localStorage.getItem('smp_collectfee_filters_visible') === 'true');

  const hasActiveFilters =
    !!searchTerm || !!courseFilter || !!yearFilter || !!genderFilter ||
    !!admTypeFilter || !!admCatFilter || feeStatusFilter !== 'ALL';

  const hasNonSearchFilters =
    !!courseFilter || !!yearFilter || !!genderFilter ||
    !!admTypeFilter || !!admCatFilter || feeStatusFilter !== 'ALL';

  useEffect(() => {
    if (hasNonSearchFilters) setShowFilters(true);
  }, [hasNonSearchFilters]);

  function clearFilters() {
    setSearchTerm('');
    setDebouncedSearch(''); // skip the debounce so the list re-animates once, not twice
    setCourseFilter('');
    setYearFilter('');
    setGenderFilter('');
    setAdmTypeFilter('');
    setAdmCatFilter('');
    setFeeStatusFilter('ALL');
  }

  const confirmedStudents = useMemo(
    () => allStudents.filter((s) => s.admissionStatus === 'CONFIRMED'),
    [allStudents],
  );

  const stats = useMemo(() => {
    if (!confirmedStudents.length) return null;
    const yearCount: Record<string, number> = {};
    const courseCount: Record<string, number> = {};
    for (const s of confirmedStudents) {
      yearCount[s.year] = (yearCount[s.year] ?? 0) + 1;
      courseCount[s.course] = (courseCount[s.course] ?? 0) + 1;
    }
    const paidCount = confirmedStudents.filter((s) => paidStudents.has(s.id)).length;
    const unpaidCount = confirmedStudents.length - paidCount;
    const duesCount = confirmedStudents.filter((s) => {
      const allotted = getAllotted(s);
      const paid = totalPaidByStudent.get(s.id) ?? 0;
      return allotted !== null && paid < allotted;
    }).length;
    const noDuesCount = confirmedStudents.filter((s) => {
      const allotted = getAllotted(s);
      const paid = totalPaidByStudent.get(s.id) ?? 0;
      return allotted !== null && paid >= allotted;
    }).length;
    return { yearCount, courseCount, total: confirmedStudents.length, paidCount, unpaidCount, duesCount, noDuesCount };
  }, [confirmedStudents, feeRecords, getAllotted, totalPaidByStudent]);

  // ── Fixed table header ────────────────────────────────────────────────────
  // The header lives outside the scroll container so the scrollbar starts
  // below it; both tables share TABLE_COLUMNS widths, horizontal scroll is synced.
  const headScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);

  const isLoading = settingsLoading || studentsLoading || feeLoading;

  // Changes whenever the result set is re-filtered — keys the rows so they
  // replay a subtle staggered entrance, and scrolls the list back to the top.
  const filterSig = [
    debouncedSearch, courseFilter, yearFilter, genderFilter, admTypeFilter, admCatFilter, feeStatusFilter,
  ].join('|');
  // Animate from the first filter change onward — including Clear, which
  // returns to the initial signature — but not on the initial page load.
  const [initialSig] = useState(filterSig);
  const [animateRows, setAnimateRows] = useState(false);
  if (!animateRows && filterSig !== initialSig) setAnimateRows(true);
  useEffect(() => {
    if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = 0;
  }, [filterSig]);

  // Header chip strip: single line between two always-visible arrow buttons;
  // each arrow dims when there is nothing more to see on its side.
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [chipOverflow, setChipOverflow] = useState({ left: false, right: false });
  const hasStats = !!stats;

  useLayoutEffect(() => {
    const el = chipScrollRef.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setChipOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [hasStats, isLoading, hasActiveFilters]);

  // Animated by hand rather than scrollBy({ behavior: 'smooth' }), which some
  // browser setups ignore, leaving the arrows apparently dead.
  const chipAnimRef = useRef(0);
  function scrollChips(dir: -1 | 1) {
    const el = chipScrollRef.current;
    if (!el) return;
    cancelAnimationFrame(chipAnimRef.current);
    const from = el.scrollLeft;
    const to = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, from + dir * Math.max(160, el.clientWidth * 0.6)));
    const start = performance.now();
    const DURATION = 260;
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / DURATION));
      el.scrollLeft = from + (to - from) * (1 - Math.pow(1 - t, 3));
      if (t < 1) chipAnimRef.current = requestAnimationFrame(step);
    };
    chipAnimRef.current = requestAnimationFrame(step);
  }

  if (isLoading) return <LoadingGate />;

  const feeStatusChips = stats ? [
    { key: 'PAID' as const,        label: 'Paid',     count: stats.paidCount },
    { key: 'NOT_PAID' as const,    label: 'Not Paid', count: stats.unpaidCount },
    { key: 'FEE_DUES' as const,    label: 'Fee Dues', count: stats.duesCount },
    { key: 'NO_FEE_DUES' as const, label: 'No Dues',  count: stats.noDuesCount },
  ] : [];

  return (
    <>
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: 'linear-gradient(160deg, #F6FBFB 0%, #FCFDFD 45%, #F2F9F9 100%)', animation: 'page-enter 0.22s ease-out' }}
    >

      {/* Page header + stat chips */}
      <div className="flex-shrink-0 flex items-center gap-4 min-w-0">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
            SMP Admissions · Fee Collection
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <h2 className="text-[22px] font-bold text-[#0B6567] leading-none tracking-[-0.3px]">Collect Fee</h2>
            {academicYear && (
              <span className="rounded-full border border-[#0F8B8D]/45 bg-white text-[#0B6567] px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums">
                {academicYear}
              </span>
            )}
          </div>
        </div>

        {stats && (
          <>
            <span className="w-px h-8 bg-[#CDE6E6] shrink-0 self-center" />
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {/* Total tile */}
            <div className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border border-[#0F8B8D]/20 bg-[#EAF5F5] px-3.5 py-1 min-w-[58px]">
              <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] text-[#4F8C8D] leading-tight">Total</span>
              <span className="text-[16px] font-medium text-[#0B6567] leading-tight">
                <AnimNum value={stats.total} />
              </span>
            </div>

            {/* Filtered count */}
            {hasActiveFilters && (
              <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[#0F8B8D]/45 bg-white text-[#0B6567] px-3 py-[6px] text-[11px] font-medium whitespace-nowrap">
                <span>Filtered</span>
                <AnimNum value={filteredStudents.length} />
              </div>
            )}

            {/* Arrows stay put on both sides; the chips between them scroll */}
            <button type="button" onClick={() => scrollChips(-1)} disabled={!chipOverflow.left} className={`${CHIP_ARROW} ml-1`} aria-label="Scroll chips left">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div ref={chipScrollRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1 py-1">

              {/* Fee status chips */}
              {feeStatusChips.map(({ key, label, count }) => {
                const isSelected = feeStatusFilter === key;
                const color = FEE_STATUS_COLOR[key];
                return (
                  <button
                    key={key}
                    onClick={() => setFeeStatusFilter(isSelected ? 'ALL' : key)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97]"
                    style={chipStyle(color, isSelected)}
                  >
                    {!isSelected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}
                    <span>{label}</span>
                    <AnimNum value={count} />
                  </button>
                );
              })}

              {DOT_SEP}

              {/* Study-year chips */}
              {YEARS.map((yr) => {
                const count = stats.yearCount[yr] ?? 0;
                const isSelected = yearFilter === yr;
                const isDimmed = (!!yearFilter && !isSelected) || count === 0;
                const label = yr === '1ST YEAR' ? '1st Yr' : yr === '2ND YEAR' ? '2nd Yr' : '3rd Yr';
                return (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(isSelected ? '' : yr)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                      isDimmed && !isSelected ? 'opacity-[0.5] hover:opacity-100' : ''
                    }`}
                    style={chipStyle(YEAR_COLOR[yr], isSelected)}
                  >
                    {!isSelected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: YEAR_COLOR[yr] }} />}
                    <span>{label}</span>
                    <AnimNum value={count} />
                  </button>
                );
              })}

              {DOT_SEP}

              {/* Course chips */}
              {COURSES.map((c) => {
                const count = stats.courseCount[c] ?? 0;
                const isSelected = courseFilter === c;
                const isDimmed = (!!courseFilter && !isSelected) || count === 0;
                return (
                  <button
                    key={c}
                    onClick={() => setCourseFilter(isSelected ? '' : c)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[11px] font-medium whitespace-nowrap transition-all duration-150 cursor-pointer active:scale-[0.97] hover:brightness-[0.97] ${
                      isDimmed && !isSelected ? 'opacity-[0.5] hover:opacity-100' : ''
                    }`}
                    style={chipStyle(DEPT_DOT[c], isSelected)}
                  >
                    {!isSelected && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DEPT_DOT[c] }} />}
                    <span>{c}</span>
                    <AnimNum value={count} />
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => scrollChips(1)} disabled={!chipOverflow.right} className={CHIP_ARROW} aria-label="Scroll chips right">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            </div>
          </>
        )}
      </div>

      {/* Toolbar card — search + filters */}
      <div className="flex-shrink-0 rounded-2xl border border-[#CDE6E6] bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(18,20,26,0.05)]">
        <div className="flex items-center gap-2 px-2.5 py-2">

          {/* Search */}
          <div className="relative shrink-0 w-60">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#0B6567] pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name / reg / mobile…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full rounded-full border border-[#0F8B8D]/45 bg-[#F4FAFA] py-2 text-[14px] font-medium text-[#0B6567] placeholder:text-[#0B6567]/60 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#0F8B8D] focus:ring-2 focus:ring-[#0F8B8D]/20 transition-all duration-150 pl-9 ${searchTerm ? 'pr-8' : 'pr-3'}`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-[#D97706]/10 hover:bg-[#D97706]/20 text-[#D97706] transition-colors duration-150 shrink-0"
                aria-label="Clear search"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* Collapsible filter selects */}
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
                    color="teal"
                    value={courseFilter}
                    onChange={(v) => setCourseFilter(v as Course | '')}
                    placeholder="Course"
                    options={COURSES.map((c) => ({ value: c, label: c }))}
                  />
                  <FilterDropdown<Year | ''>
                    color="teal"
                    value={yearFilter}
                    onChange={(v) => setYearFilter(v as Year | '')}
                    placeholder="Study Yr"
                    options={[
                      { value: '1ST YEAR', label: '1ST YEAR' },
                      { value: '2ND YEAR', label: '2ND YEAR' },
                      { value: '3RD YEAR', label: '3RD YEAR' },
                    ]}
                  />
                  <FilterDropdown<Gender | ''>
                    color="teal"
                    value={genderFilter}
                    onChange={(v) => setGenderFilter(v as Gender | '')}
                    placeholder="Gender"
                    options={[
                      { value: 'BOY', label: 'BOY' },
                      { value: 'GIRL', label: 'GIRL' },
                    ]}
                  />
                  <FilterDropdown<AdmType | ''>
                    color="teal"
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
                    color="teal"
                    value={admCatFilter}
                    onChange={(v) => setAdmCatFilter(v as AdmCat | '')}
                    placeholder="Adm Cat"
                    options={[
                      { value: 'GM', label: 'GM' },
                      { value: 'SNQ', label: 'SNQ' },
                      { value: 'OTHERS', label: 'OTHERS' },
                    ]}
                  />
                  <FilterDropdown<'ALL' | 'PAID' | 'NOT_PAID' | 'FEE_DUES' | 'NO_FEE_DUES'>
                    color="teal"
                    value={feeStatusFilter === 'ALL' ? '' : feeStatusFilter}
                    onChange={(v) => setFeeStatusFilter((v || 'ALL') as 'ALL' | 'PAID' | 'NOT_PAID' | 'FEE_DUES' | 'NO_FEE_DUES')}
                    placeholder="Fee Status"
                    options={[
                      { value: 'PAID', label: 'Fee Paid' },
                      { value: 'NOT_PAID', label: 'Not Paid' },
                      { value: 'FEE_DUES', label: 'Has Dues' },
                      { value: 'NO_FEE_DUES', label: 'No Dues' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Clear — only when filters active */}
          {hasActiveFilters && (
            <>
              <span className="w-px h-5 bg-[#CDE6E6] shrink-0" />
              <button
                onClick={clearFilters}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#D97706]/10 px-3 py-1.5 text-[11.5px] font-medium text-[#D97706] hover:bg-[#D97706]/[0.16] focus:outline-none focus:ring-2 focus:ring-[#D97706]/30 cursor-pointer transition-colors whitespace-nowrap"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Clear
              </button>
            </>
          )}

          {/* Filter toggle */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => { const next = !v; localStorage.setItem('smp_collectfee_filters_visible', String(next)); return next; })}
            className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters || hasNonSearchFilters
                ? 'bg-[#0F8B8D]/10 border-[#0F8B8D]/30 text-[#0F8B8D]'
                : 'border-[#CDE6E6] text-[#5B6371] hover:bg-[#EFF8F8] hover:text-[#262B35]'
            }`}
            title="Toggle filters"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
          </button>

        </div>
      </div>

      {/* Table area — the only thing that scrolls */}
      {!academicYear ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          title="Please configure an academic year in Settings first."
        />
      ) : filteredStudents.length === 0 ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="22" height="13" rx="2"/><path d="M1 10h22"/></svg>}
          title="No students found."
        />
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CDE6E6] overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(18,20,26,0.05)]">
          {/* Fixed header strip — outside the scroller, so the scrollbar starts below it */}
          <div
            ref={headScrollRef}
            className="flex-shrink-0 overflow-hidden"
            style={{ scrollbarGutter: 'stable', background: 'linear-gradient(90deg, #E3F2F2 0%, #EDF7F7 55%, #E6F3F1 100%)', boxShadow: 'inset 0 -1px 0 #C7E2E2' }}
          >
            <table className="w-full text-xs" style={{ tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH }}>
              {TABLE_COLGROUP}
              <thead>
                <tr>
                  {TABLE_COLUMNS.map((c) => <th key={c.label} className={TH}>{c.label}</th>)}
                </tr>
              </thead>
            </table>
          </div>

          {/* Scrolling body */}
          <div
            ref={bodyScrollRef}
            className="scroll-teal flex-1 min-h-0 overflow-auto"
            style={{ scrollbarGutter: 'stable' }}
            onScroll={(e) => {
              if (headScrollRef.current) headScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }}
          >
          <table className="w-full text-xs" style={{ tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH }}>
            {TABLE_COLGROUP}
            <tbody className="divide-y divide-[#EAF3F3]">
              {visibleStudents.map((student, idx) => {
                const hasFeeRecord = paidStudents.has(student.id);
                const totalPaid = totalPaidByStudent.get(student.id) ?? 0;
                const allotted = getAllotted(student);
                const isFullyPaid = allotted !== null && totalPaid >= allotted;
                return (
                  <tr
                    key={`${student.id}-${filterSig}`}
                    className="cursor-context-menu"
                    style={animateRows ? { animation: `content-enter 0.24s ease-out ${Math.min(idx * 0.025, 0.3)}s both` } : undefined}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, student, hasFeeRecord, isFullyPaid });
                      // The menu's two actions open these modals — start loading their data now.
                      if (academicYear && !isFullyPaid) prefetchCollectFee(student, academicYear, academicYear);
                      prefetchFeeHistory(student);
                    }}
                  >
                    <td className="px-3 py-2 text-[11px] font-medium text-black tabular-nums whitespace-nowrap">{idx + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <RingAvatar name={student.studentNameSSLC} course={student.course} />
                        <span className="text-[12.5px] font-medium text-[#0B6567] truncate" title={student.studentNameSSLC}>{student.studentNameSSLC}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-black tabular-nums whitespace-nowrap">{student.regNumber || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.course} value={student.course} color={DEPT_DOT[student.course]} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.year} value={student.year} color={YEAR_COLOR[student.year]} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.admType} value={student.admType} color={ADM_TYPE_COLOR[student.admType]} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.admCat} value={student.admCat} color={ADM_CAT_COLOR[student.admCat]} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <LinePill
                        minWidth={PILL_W.status}
                        value={student.admissionStatus}
                        color={STATUS_COLOR[student.admissionStatus] ?? STATUS_COLOR_DEFAULT}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <ActionPill
                        color={TEAL}
                        onIntent={() => prefetchFeeHistory(student)}
                        onClick={() => setFeeHistoryStudent({ student, noDues: isFullyPaid })}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        Fee Details
                      </ActionPill>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isFullyPaid ? (
                        <ActionPill color={ACTION_COLOR.noDues} width={ACTION_W} disabled>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          No Dues
                        </ActionPill>
                      ) : (
                        <ActionPill
                          width={ACTION_W}
                          color={hasFeeRecord ? ACTION_COLOR.dues : ACTION_COLOR.collect}
                          onIntent={() => academicYear && prefetchCollectFee(student, academicYear, academicYear)}
                          onClick={() => setSelectedStudent(student)}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="22" height="13" rx="2"/><path d="M1 10h22"/></svg>
                          {hasFeeRecord ? 'Collect Dues' : 'Collect Fee'}
                        </ActionPill>
                      )}
                    </td>
                  </tr>
                );
              })}

              {hasMore && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-3 text-center">
                    <button
                      className={OUTLINE_PILL_BTN}
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredStudents.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <div className="flex-shrink-0 px-4 py-2 border-t border-[#C7E2E2] bg-[#F2F9F9] text-[11px] font-medium text-[#8A93A3]">
            Showing <span className="font-medium text-[#262B35] tabular-nums">{Math.min(visibleCount, filteredStudents.length)}</span> of <span className="font-medium text-[#262B35] tabular-nums">{filteredStudents.length}</span>
            {stats && filteredStudents.length < stats.total && (
              <span> (filtered from {stats.total} total)</span>
            )}
          </div>
        </div>
      )}

      {/* Fee collection modal */}
      {selectedStudent && academicYear && (
        <FeeCollectionModal
          student={selectedStudent}
          academicYear={academicYear}
          onClose={() => { invalidateFeePrefetch(selectedStudent.id); setSelectedStudent(null); }}
          onSaved={() => { invalidateFeePrefetch(selectedStudent.id); refetchFees(); setSelectedStudent(null); }}
        />
      )}

      {/* Fee history modal */}
      {feeHistoryStudent && (
        <FeeHistoryModal
          student={feeHistoryStudent.student}
          initialNoDues={feeHistoryStudent.noDues}
          onClose={() => { invalidateFeePrefetch(feeHistoryStudent.student.id); setFeeHistoryStudent(null); }}
        />
      )}
    </div>

    {/* ── Context menu — rendered outside the animated div to avoid the transform containing-block bug ── */}
    {ctxMenu && (() => {
      const actionColor = ctxMenu.isFullyPaid ? ACTION_COLOR.noDues : ctxMenu.hasFeeRecord ? ACTION_COLOR.dues : ACTION_COLOR.collect;
      return (
      <>
        {/* Invisible backdrop — catches all clicks/right-clicks outside the menu */}
        <div
          className="fixed inset-0 z-40"
          onClick={closeCtx}
          onContextMenu={(e) => { e.preventDefault(); closeCtx(); }}
        />
        {/* Menu — initially hidden; useLayoutEffect repositions then reveals */}
        <div
          ref={ctxRef}
          className="font-wp fixed z-50 bg-white border border-[#CDE6E6] rounded-2xl overflow-hidden min-w-[220px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y, visibility: 'hidden', boxShadow: '0 12px 36px rgba(18,20,26,0.12), 0 2px 8px rgba(18,20,26,0.05)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-[#C7E2E2] bg-[#EEF7F7] flex items-center gap-3">
            <RingAvatar name={ctxMenu.student.studentNameSSLC} course={ctxMenu.student.course} />
            <div className="min-w-0">
              <p className="text-[9px] font-medium uppercase tracking-[0.8px] text-[#8A93A3] leading-none">
                {ctxMenu.student.course} · {ctxMenu.student.year}
              </p>
              <p className="mt-1 text-[12px] font-medium text-[#262B35] truncate leading-none">{ctxMenu.student.studentNameSSLC}</p>
            </div>
          </div>
          {/* Items */}
          <div className="p-1">
            <button
              disabled={ctxMenu.isFullyPaid}
              className={MENU_ITEM}
              onClick={() => { setSelectedStudent(ctxMenu.student); closeCtx(); }}
            >
              <span className={MENU_ICON} style={{ background: `${actionColor}1A`, color: actionColor }}>
                {ctxMenu.isFullyPaid
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="22" height="13" rx="2"/><path d="M1 10h22"/></svg>
                }
              </span>
              {ctxMenu.isFullyPaid ? 'No Dues' : ctxMenu.hasFeeRecord ? 'Collect Dues' : 'Collect Fee'}
            </button>
            <button
              className={MENU_ITEM}
              onClick={() => { setFeeHistoryStudent({ student: ctxMenu.student, noDues: ctxMenu.isFullyPaid }); closeCtx(); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#0F8B8D]/10 group-hover:text-[#0F8B8D]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </span>
              Fee Details
            </button>
          </div>
        </div>
      </>
      );
    })()}
    </>
  );
}
