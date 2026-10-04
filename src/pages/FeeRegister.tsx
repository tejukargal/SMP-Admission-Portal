import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { deleteFeeRecord } from '../services/feeRecordService';
import { FeeEditModal } from '../components/fee/FeeEditModal';
import { FeeHistoryModal } from '../components/fee/FeeHistoryModal';
import { useAuth } from '../contexts/AuthContext';
import type { AcademicYear, Course, Year, FeeRecord, SMPFeeHead, AdmType, AdmCat, PaymentMode } from '../types';
import { SMP_FEE_HEADS, ACADEMIC_YEARS } from '../types';
import { generateSMPReceipt, generateSVKReceipt, generateAdditionalReceipt } from '../utils/feeReceipts';
import { PageSpinner } from '../components/common/PageSpinner';
import { FilterDropdown } from '../components/common/FilterDropdown';
import { FeeReceiptDetailModal } from '../components/fee/FeeReceiptDetailModal';
import { invalidateCollectPrefetch } from '../components/fee/feeModalPrefetch';
import { receiptAccountSplit } from '../utils/cashLedger';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const AIDED_COURSES: Course[] = ['CE', 'ME', 'EC', 'CS'];
const UNAIDED_COURSES: Course[] = ['EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL'];
const ADM_CATS: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];
const PAYMENT_MODES: PaymentMode[] = ['CASH', 'UPI', 'SPLIT'];
const PAGE_SIZE = 100;

const YEAR_LABELS: Record<string, string> = {
  '1ST YEAR': 'Y1',
  '2ND YEAR': 'Y2',
  '3RD YEAR': 'Y3',
};

// ── Design tokens — Collect Fee revamp look (student-portal, teal) ─────────
const TEAL = '#0F8B8D';
const DEPT_DOT: Record<string, string> = {
  CE: '#3B82F6', ME: '#10B981', CS: '#8B5CF6', EC: '#F97316', EE: '#EF4444',
};
const DEPT_HUE: Record<string, number> = { CE: 217, ME: 160, EC: 25, CS: 258, EE: 0 };
const YEAR_COLOR: Record<string, string> = {
  '1ST YEAR': '#0EA5E9', '2ND YEAR': '#F59E0B', '3RD YEAR': '#8B5CF6',
};
const ADM_TYPE_COLOR: Record<string, string> = {
  REGULAR: '#1D6FD8', REPEATER: '#D97706', LATERAL: '#7C3AED', EXTERNAL: TEAL, SNQ: '#10B981',
};
const ADM_CAT_COLOR: Record<string, string> = { GM: '#5B9A2F', SNQ: '#10B981', OTHERS: '#F59E0B' };
const MODE_COLOR: Record<string, string> = { CASH: '#0FA968', UPI: '#1D6FD8', SPLIT: '#7C3AED' };
const ACTION_COLOR_DUES = '#D97706';
const FALLBACK_COLOR = '#8A93A3';
// Per-column pill widths (px) — sized to each column's longest value.
const PILL_W = { course: 34, year: 30, admType: 70, admCat: 56, mode: 52 };

// Fixed column widths (px). The header, body and footer are separate tables sharing
// these widths, so the header/footer sit outside the scroller (the scrollbar starts
// below the header, as on Collect Fee) and columns never shift.
const COL_W = {
  idx: 44, name: 220, father: 220, year: 64, course: 72, reg: 112, cat: 76, admType: 100,
  date: 96, smpRpt: 80, svkRpt: 84, mode: 80, remarks: 140, due: 92, head: 72, subTotal: 92, total: 108,
};

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
      className="inline-flex items-center justify-center rounded-full border px-[7px] py-[4.5px] text-[10.5px] font-medium leading-none whitespace-nowrap"
      style={{ background: `${c}14`, borderColor: `${c}73`, color: inkOf(c), minWidth }}
    >
      {value}
    </span>
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

function calcSMPTotal(record: FeeRecord): number {
  return (SMP_FEE_HEADS as { key: SMPFeeHead }[]).reduce((s, { key }) => s + record.smp[key], 0);
}

function calcSVKTotal(record: FeeRecord): number {
  return record.svk + record.additionalPaid.reduce((s, h) => s + h.amount, 0);
}

function calcTotal(record: FeeRecord): number {
  return calcSMPTotal(record) + calcSVKTotal(record);
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseReceiptNum(r: string): number {
  const n = parseInt(r, 10);
  return isNaN(n) ? Infinity : n;
}

function sortRecords(records: FeeRecord[]): FeeRecord[] {
  return [...records].sort((a, b) => {
    // 1. Date ascending (oldest first)
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;

    // 2. CE/ME/EC/CS share one receipt series; EE has its own — keep them grouped
    //    within the same date (non-EE first, EE after)
    const aIsEE = a.course === 'EE' ? 1 : 0;
    const bIsEE = b.course === 'EE' ? 1 : 0;
    if (aIsEE !== bIsEE) return aIsEE - bIsEE;

    // 3. Receipt number ascending (numeric) within the same date + group
    return parseReceiptNum(a.receiptNumber) - parseReceiptNum(b.receiptNumber);
  });
}

async function exportRegisterExcel(records: FeeRecord[], additionalHeadLabels: string[], academicYear: string, dueFeeIds: Set<string>): Promise<void> {
  const smpHeaders = SMP_FEE_HEADS.map(({ label }) => label);
  const headers = [
    '#', 'Name', 'Father Name', 'Year', 'Course', 'Reg No',
    'Adm Cat', 'Adm Type', 'Date', 'SMP Rpt', 'SVK Rpt', 'Mode', 'Remarks', 'Due Fee',
    ...smpHeaders, 'SMP Total',
    'SVK', ...additionalHeadLabels, 'SVK Total',
    'Grand Total',
  ];

  const dataRows = records.map((r, idx) => {
    const smpTotal = calcSMPTotal(r);
    const svkTotal = calcSVKTotal(r);
    return [
      idx + 1,
      r.studentName,
      r.fatherName,
      r.year,
      r.course,
      r.regNumber || '',
      r.admCat,
      r.admType,
      formatDate(r.date),
      r.receiptNumber || '',
      r.svkReceiptNumber || '',
      r.paymentMode,
      r.remarks || '',
      (r.isDueFee ?? (dueFeeIds.has(r.id) || r.academicYear !== academicYear)) ? 'Due Fee' : '',
      ...(SMP_FEE_HEADS as { key: SMPFeeHead }[]).map(({ key }) => r.smp[key] || 0),
      smpTotal,
      r.svk || 0,
      ...additionalHeadLabels.map((label) => r.additionalPaid.find((h) => h.label === label)?.amount ?? 0),
      svkTotal,
      smpTotal + svkTotal,
    ];
  });

  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Register');
  XLSX.writeFile(wb, `Fee_Register_${academicYear}.xlsx`);
}

// ── Day-close summary ──────────────────────────────────────────────────────────
// For the selected day: cash / UPI / total (split-aware, same maths as Cash Book)
// and, per receipt series, the range of receipt numbers used — flagging numbers
// skipped inside that range (a spoiled or missed book leaf) and numbers used twice.

const SVK_PREFIX = 'SVK DVP ';
const MAX_LISTED = 6;

interface SeriesSummary { label: string; first: number; last: number; count: number; gaps: number[]; dupes: number[] }

function summariseSeries(label: string, raw: string[]): SeriesSummary | null {
  const nums = raw.map((r) => parseInt(r, 10)).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const n of nums) { if (seen.has(n)) dupes.add(n); seen.add(n); }
  const first = nums[0];
  const last = nums[nums.length - 1];
  const gaps: number[] = [];
  // Bounded so a mistyped huge number can't spin through millions of values.
  if (last - first <= 2000) {
    for (let n = first + 1; n < last; n++) if (!seen.has(n)) gaps.push(n);
  }
  return { label, first, last, count: nums.length, gaps, dupes: [...dupes] };
}

function listNums(nums: number[]): string {
  const shown = nums.slice(0, MAX_LISTED).join(', ');
  return nums.length > MAX_LISTED ? `${shown} +${nums.length - MAX_LISTED} more` : shown;
}

function DayCloseStrip({ records, date }: { records: FeeRecord[]; date: string }) {
  const summary = useMemo(() => {
    let cash = 0, upi = 0;
    for (const r of records) {
      const split = receiptAccountSplit(r);
      cash += split.SBI.cash + split.SVK.cash;
      upi  += split.SBI.upi  + split.SVK.upi;
    }
    const series = [
      summariseSeries('SMP Aided',   records.filter((r) => AIDED_COURSES.includes(r.course)).map((r) => r.receiptNumber).filter(Boolean)),
      summariseSeries('SMP Unaided', records.filter((r) => UNAIDED_COURSES.includes(r.course)).map((r) => r.receiptNumber).filter(Boolean)),
      summariseSeries('SVK',  records.map((r) => r.svkReceiptNumber).filter(Boolean).map((r) => r.startsWith(SVK_PREFIX) ? r.slice(SVK_PREFIX.length) : r)),
      summariseSeries('Addl', records.map((r) => r.additionalReceiptNumber).filter(Boolean)),
    ].filter((x): x is SeriesSummary => x !== null);
    return { cash, upi, series };
  }, [records]);

  if (records.length === 0) return null;
  const issues = summary.series.filter((x) => x.gaps.length > 0 || x.dupes.length > 0);

  return (
    <div
      className="flex-shrink-0 rounded-2xl border border-[#CDE6E6] bg-white px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5"
      style={{ animation: 'content-enter 0.22s ease-out' }}
    >
      <span className="text-[9.5px] font-medium uppercase tracking-[0.6px] text-[#8A93A3] whitespace-nowrap">
        Day close · {formatDate(date)}
      </span>
      <span className="text-[12px] text-[#5B6371] whitespace-nowrap">
        Cash <span className="font-semibold text-[#0B7A4D] tabular-nums">₹{summary.cash.toLocaleString('en-IN')}</span>
      </span>
      <span className="text-[12px] text-[#5B6371] whitespace-nowrap">
        UPI <span className="font-semibold text-[#1D6FD8] tabular-nums">₹{summary.upi.toLocaleString('en-IN')}</span>
      </span>
      <span className="text-[12px] text-[#5B6371] whitespace-nowrap">
        Total <span className="font-semibold text-[#0B6567] tabular-nums">₹{(summary.cash + summary.upi).toLocaleString('en-IN')}</span>
      </span>
      <span className="w-px h-4 bg-[#CDE6E6] shrink-0" />
      {summary.series.map((x) => (
        <span key={x.label} className="text-[11.5px] text-[#5B6371] whitespace-nowrap" title={`${x.count} receipt${x.count === 1 ? '' : 's'}`}>
          {x.label} <span className="font-medium text-[#262B35] tabular-nums">{x.first === x.last ? x.first : `${x.first}–${x.last}`}</span>
          <span className="text-[#8A93A3]"> ({x.count})</span>
        </span>
      ))}
      {issues.length > 0 ? (
        <div className="basis-full flex flex-wrap gap-1.5">
          {issues.map((x) => (
            <span key={x.label} className="rounded-full border border-[#D97706]/40 bg-[#D97706]/[0.07] px-2.5 py-[3px] text-[11px] font-medium text-[#9A5405]">
              {x.label}:
              {x.gaps.length > 0 && ` skipped ${listNums(x.gaps)}`}
              {x.gaps.length > 0 && x.dupes.length > 0 && ' ·'}
              {x.dupes.length > 0 && ` used twice ${listNums(x.dupes)}`}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-[11px] font-medium text-[#0B7A4D] whitespace-nowrap">✓ No gaps or duplicates</span>
      )}
    </div>
  );
}

function LoadingGate() {
  return <PageSpinner />;
}

export function FeeRegister() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [aidedFilter, setAidedFilter] = useState<'AIDED' | 'UNAIDED' | ''>('');
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter, setAdmCatFilter] = useState<AdmCat | ''>('');
  const [paymentModeFilter, setPaymentModeFilter] = useState<PaymentMode | ''>('');
  // null = follow the latest date that has records (moves to today as soon as a
  // collection lands); '' = All dates; 'YYYY-MM-DD' = a date the user picked.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editRecord, setEditRecord] = useState<FeeRecord | null>(null);
  const [historyRecord, setHistoryRecord] = useState<FeeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<FeeRecord | null>(null);

  // Column visibility (hidden by default)
  const [showFatherName, setShowFatherName] = useState(false);
  const [showSVKRpt, setShowSVKRpt] = useState(false);
  const [showRemarks, setShowRemarks] = useState(false);
  const [showSMPDetails, setShowSMPDetails] = useState(false);
  const [showSVKDetails, setShowSVKDetails] = useState(false);

  // Filter panel collapse
  const [showFilters, setShowFilters] = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; record: FeeRecord } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // One scroller with a sticky header + totals row (native sticky, so columns never
  // lag or wobble while scrolling). The header rows (28 + 36px) and totals row (36px)
  // have fixed heights, and the vertical scrollbar track is inset by exactly those
  // amounts in index.css (.scroll-teal-wide) so it starts below the header. A spacer row keeps the
  // totals row pinned to the bottom when there are only a few rows.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLTableRowElement>(null);

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

  // After every render where the menu is present, clamp it to the viewport
  // using direct DOM mutation to avoid a state-update re-render loop.
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

  // Default to current academic year once settings load. Done during render (not in an
  // effect) so there is no intermediate frame showing an empty register.
  if (settings?.currentAcademicYear && !selectedYear) {
    setSelectedYear(settings.currentAcademicYear);
  }

  // Changing the academic year goes back to following the latest date.
  const [dateFilterYear, setDateFilterYear] = useState(selectedYear);
  if (dateFilterYear !== selectedYear) {
    setDateFilterYear(selectedYear);
    setPickedDate(null);
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const academicYear = selectedYear || null;
  // Shared live listener — collections made anywhere (Dashboard search, Collect Fee)
  // are already in it when this page opens.
  const { records: rawRecords, loading: recordsLoading } = useFeeRecords(academicYear as AcademicYear | null, { mode: 'by-date' });

  // Sort: oldest date first, then by receipt number
  const sortedRecords = useMemo(() => sortRecords(rawRecords), [rawRecords]);

  // Unique dates for date filter dropdown (descending)
  const uniqueDates = useMemo(() => {
    const dates = new Set<string>();
    for (const r of sortedRecords) if (r.date) dates.add(r.date.slice(0, 10));
    return [...dates].sort((a, b) => b.localeCompare(a));
  }, [sortedRecords]);

  const dateFilter = pickedDate ?? uniqueDates[0] ?? '';
  const setDateFilter = setPickedDate;

  // uniqueDates is sorted newest-first, so "prev" (chronologically earlier)
  // is the next array index and "next" (later) is the previous index.
  const dateIdx  = dateFilter ? uniqueDates.indexOf(dateFilter) : -1;
  const prevDate = dateIdx !== -1 && dateIdx < uniqueDates.length - 1 ? uniqueDates[dateIdx + 1] : null;
  const nextDate = dateIdx > 0 ? uniqueDates[dateIdx - 1] : null;

  const dayRecords = useMemo(
    () => (dateFilter ? sortedRecords.filter((r) => r.date.slice(0, 10) === dateFilter) : []),
    [sortedRecords, dateFilter],
  );

  // Collect all unique additional head labels across all records (for dynamic columns)
  const additionalHeadLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const r of sortedRecords) {
      for (const h of r.additionalPaid) {
        if (h.label) labels.add(h.label);
      }
    }
    return [...labels];
  }, [sortedRecords]);

  // Derive due-fee record IDs for backward compat with records saved before isDueFee field was added.
  // A record is considered a due-fee collection if the student already had an earlier record for the
  // same academicYear in this dataset (sorted oldest-first, so the first seen per student is the initial payment).
  const dueFeeIds = useMemo(() => {
    const seen = new Set<string>(); // studentId__academicYear keys already encountered
    const ids = new Set<string>();
    for (const r of sortedRecords) {
      const key = `${r.studentId}__${r.academicYear}`;
      if (seen.has(key)) {
        ids.add(r.id);
      } else {
        seen.add(key);
      }
    }
    return ids;
  }, [sortedRecords]);

  // Apply filters
  const filteredRecords = useMemo(() => {
    let result = sortedRecords;
    if (aidedFilter === 'AIDED')    result = result.filter((r) => (AIDED_COURSES as Course[]).includes(r.course));
    if (aidedFilter === 'UNAIDED')  result = result.filter((r) => (UNAIDED_COURSES as Course[]).includes(r.course));
    if (courseFilter)       result = result.filter((r) => r.course       === courseFilter);
    if (yearFilter)         result = result.filter((r) => r.year         === yearFilter);
    if (admTypeFilter)      result = result.filter((r) => r.admType      === admTypeFilter);
    if (admCatFilter)       result = result.filter((r) => r.admCat       === admCatFilter);
    if (paymentModeFilter)  result = result.filter((r) => r.paymentMode  === paymentModeFilter);
    if (dateFilter && !debouncedSearch) result = result.filter((r) => r.date.slice(0, 10) === dateFilter);
    if (debouncedSearch) {
      const raw = debouncedSearch.trim();
      const q = raw.toUpperCase();
      result = result.filter(
        (r) =>
          r.studentName.toUpperCase().includes(q) ||
          r.fatherName.toUpperCase().includes(q) ||
          r.regNumber?.toUpperCase().includes(q) ||
          r.receiptNumber?.includes(q) ||
          formatDate(r.date).includes(raw)
      );
    }
    return result;
  }, [sortedRecords, aidedFilter, courseFilter, yearFilter, admTypeFilter, admCatFilter, paymentModeFilter, dateFilter, debouncedSearch]);

  // Reset visible window whenever filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredRecords]);

  const visibleRecords = useMemo(
    () => filteredRecords.slice(0, visibleCount),
    [filteredRecords, visibleCount]
  );

  const hasMore = visibleCount < filteredRecords.length;

  const hasActiveFilters = !!searchTerm || !!aidedFilter || !!courseFilter || !!yearFilter || !!admTypeFilter || !!admCatFilter || !!paymentModeFilter || pickedDate !== null;

  function clearFilters() {
    setSearchTerm('');
    setAidedFilter('');
    setCourseFilter('');
    setYearFilter('');
    setAdmTypeFilter('');
    setAdmCatFilter('');
    setPaymentModeFilter('');
    setPickedDate(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteFeeRecord(deleteTarget);
      // The freed receipt number may be suggested again — drop any prefetched "next number".
      invalidateCollectPrefetch();
      setDeleteTarget(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete record');
    } finally {
      setDeleting(false);
    }
  }

  // Column totals
  const totals = useMemo(() => {
    const smp: Record<SMPFeeHead, number> = {
      adm: 0, tuition: 0, lib: 0, rr: 0, sports: 0, lab: 0,
      dvp: 0, mag: 0, idCard: 0, ass: 0, swf: 0, twf: 0, nss: 0, fine: 0,
    };
    let svk = 0;
    const additional: Record<string, number> = {};
    let grandTotal = 0;

    for (const r of filteredRecords) {
      for (const { key } of SMP_FEE_HEADS) smp[key] += r.smp[key];
      svk += r.svk;
      for (const h of r.additionalPaid) {
        additional[h.label] = (additional[h.label] ?? 0) + h.amount;
      }
      grandTotal += calcTotal(r);
    }
    return { smp, svk, additional, grandTotal };
  }, [filteredRecords]);


  const isLoading = settingsLoading || !selectedYear || recordsLoading;
  const hasTable = !isLoading && filteredRecords.length > 0;

  useLayoutEffect(() => {
    const sc = tableScrollRef.current;
    const table = sc?.querySelector('table');
    if (!hasTable || !sc || !table) return;
    const sync = () => {
      const spacer = spacerRef.current;
      if (spacer) {
        const current = spacer.offsetHeight;
        const need = Math.max(0, sc.clientHeight - (table.offsetHeight - current));
        if (need !== current) spacer.style.height = `${need}px`;
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(sc);
    ro.observe(table);
    return () => ro.disconnect();
  }, [hasTable]);

  if (isLoading) return <LoadingGate />;

  const infoCols = 11 + (showFatherName ? 1 : 0) + (showSVKRpt ? 1 : 0) + (showRemarks ? 1 : 0);

  const colWidths: number[] = [
    COL_W.idx, COL_W.name,
    ...(showFatherName ? [COL_W.father] : []),
    COL_W.year, COL_W.course, COL_W.reg, COL_W.cat, COL_W.admType, COL_W.date, COL_W.smpRpt,
    ...(showSVKRpt ? [COL_W.svkRpt] : []),
    COL_W.mode,
    ...(showRemarks ? [COL_W.remarks] : []),
    COL_W.due,
    ...(showSMPDetails ? SMP_FEE_HEADS.map(() => COL_W.head) : []),
    COL_W.subTotal,
    ...(showSVKDetails ? [COL_W.head, ...additionalHeadLabels.map((l) => Math.max(COL_W.head, l.length * 7 + 28))] : []),
    COL_W.subTotal,
    COL_W.total,
  ];
  const tableStyle: React.CSSProperties = { tableLayout: 'fixed', minWidth: colWidths.reduce((a, w) => a + w, 0) };
  const colgroup = (
    <colgroup>
      {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
    </colgroup>
  );

  return (
    <>
    <div
      className="font-wp -m-4 p-4 h-[calc(100%+2rem)] flex flex-col gap-3"
      style={{ background: 'linear-gradient(160deg, #F6FBFB 0%, #FCFDFD 45%, #F2F9F9 100%)', animation: 'page-enter 0.22s ease-out' }}
    >

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-4 min-w-0">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[1px] text-[#8A93A3] leading-none">
            SMP Admissions · Fee Register
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <h2 className="text-[22px] font-bold text-[#0B6567] leading-none tracking-[-0.3px]">Fee Register</h2>
            {selectedYear && (
              <span className="rounded-full border border-[#0F8B8D]/45 bg-white text-[#0B6567] px-2.5 py-[4px] text-[10.5px] font-medium leading-none tabular-nums">
                {selectedYear}
              </span>
            )}
          </div>
        </div>

        {!isLoading && sortedRecords.length > 0 && (
          <>
            <span className="w-px h-8 bg-[#CDE6E6] shrink-0 self-center" />
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border border-[#0F8B8D]/20 bg-[#EAF5F5] px-3.5 py-1 min-w-[72px]">
                <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] text-[#4F8C8D] leading-tight">Records</span>
                <span className="text-[16px] font-medium text-[#0B6567] leading-tight tabular-nums whitespace-nowrap">
                  {filteredRecords.length}
                  {hasActiveFilters && filteredRecords.length !== sortedRecords.length && (
                    <span className="text-[11px] text-[#4F8C8D] font-normal"> / {sortedRecords.length}</span>
                  )}
                </span>
              </div>
              <div className="shrink-0 flex flex-col items-center justify-center rounded-[10px] border border-[#0FA968]/25 bg-[#E9F8F1] px-3.5 py-1 min-w-[96px]">
                <span className="text-[8.5px] font-medium uppercase tracking-[0.4px] text-[#3E8F6C] leading-tight">Collected</span>
                <span className="text-[16px] font-medium text-[#0B7A4D] leading-tight tabular-nums whitespace-nowrap">₹{totals.grandTotal.toLocaleString()}</span>
              </div>
              <div className="flex-1" />
              <button
                onClick={() => exportRegisterExcel(filteredRecords, additionalHeadLabels, selectedYear, dueFeeIds)}
                disabled={filteredRecords.length === 0}
                className={OUTLINE_PILL_BTN}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
                </svg>
                Export Excel
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 rounded-2xl border border-[#CDE6E6] bg-white overflow-hidden transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(18,20,26,0.05)]">
        <div className="flex items-center gap-2 px-2.5 py-2">

          {/* Search */}
          <div className="relative shrink-0 w-60">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#0B6567] pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              type="text"
              placeholder="Search name / reg / rpt / dd/mm/yyyy…"
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

          {debouncedSearch && dateFilter && (
            <span className="shrink-0 rounded-full bg-[#EAF5F5] text-[#0B6567] text-[10px] font-medium px-2.5 py-1 border border-[#0F8B8D]/25 whitespace-nowrap">
              Searching all dates
            </span>
          )}

          {/* Date navigator — prev/next arrows walk chronologically through dates with records */}
          <div
            className={`flex items-center gap-1.5 shrink-0 ${debouncedSearch ? 'opacity-40 pointer-events-none' : ''}`}
            title={debouncedSearch ? 'Clear search to use the day selector' : undefined}
          >
            <button
              type="button"
              disabled={!prevDate}
              onClick={() => prevDate && setDateFilter(prevDate)}
              className={CHIP_ARROW}
              aria-label="Previous date"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="shrink-0 rounded-full border border-[#0F8B8D]/35 bg-white px-3 py-1 text-[12px] font-medium text-[#0B6567] hover:border-[#0F8B8D]/60 focus:outline-none focus:ring-2 focus:ring-[#0F8B8D]/30 focus:border-[#0F8B8D] cursor-pointer transition-colors"
            />
            <button
              type="button"
              disabled={!nextDate}
              onClick={() => nextDate && setDateFilter(nextDate)}
              className={CHIP_ARROW}
              aria-label="Next date"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button
              type="button"
              onClick={() => setPickedDate(dateFilter ? '' : null)}
              className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                dateFilter
                  ? 'border-[#CDE6E6] bg-white text-[#5B6371] hover:bg-[#EFF8F8] hover:text-[#262B35]'
                  : 'border-[#0F8B8D] bg-[#0F8B8D] text-white shadow-[0_2px_8px_#0F8B8D40]'
              }`}
              title={dateFilter ? 'Show all dates' : 'Jump back to the latest date'}
            >All</button>
          </div>

          {/* Aided / Unaided filter */}
          <FilterDropdown<'AIDED' | 'UNAIDED'>
            color="teal"
            value={aidedFilter}
            onChange={(v) => setAidedFilter(v as 'AIDED' | 'UNAIDED' | '')}
            placeholder="Aided & Unaided"
            options={[
              { value: 'AIDED', label: 'Aided (CE, ME, EC, CS)' },
              { value: 'UNAIDED', label: 'Unaided (EE)' },
            ]}
          />

          <div className="flex-1" />

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
            onClick={() => setShowFilters((v) => !v)}
            className={`shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full border transition-colors cursor-pointer ${
              showFilters
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

        {/* Collapsible compact filter row — expands below the search bar */}
        <div
          className="grid"
          style={{
            gridTemplateRows: showFilters ? '1fr' : '0fr',
            opacity: showFilters ? 1 : 0,
            transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap content-center items-center gap-1.5 px-2.5 py-2 border-t border-[#EAF3F3]">
              <FilterDropdown<AcademicYear>
                color="teal"
                value={selectedYear}
                onChange={(v) => setSelectedYear(v as AcademicYear | '')}
                placeholder="Select Year"
                options={[...ACADEMIC_YEARS].reverse().map((y) => ({ value: y, label: y }))}
              />

              <span className="w-px h-5 bg-[#CDE6E6] shrink-0 mx-0.5" />

              <FilterDropdown<Course>
                color="teal"
                value={courseFilter}
                onChange={(v) => setCourseFilter(v as Course | '')}
                placeholder="All Courses"
                options={COURSES.map((c) => ({ value: c, label: c }))}
              />
              <FilterDropdown<Year>
                color="teal"
                value={yearFilter}
                onChange={(v) => setYearFilter(v as Year | '')}
                placeholder="All Years"
                options={YEARS.map((y) => ({ value: y, label: y }))}
              />
              <FilterDropdown<AdmType>
                color="teal"
                value={admTypeFilter}
                onChange={(v) => setAdmTypeFilter(v as AdmType | '')}
                placeholder="All Adm Types"
                options={ADM_TYPES.map((t) => ({ value: t, label: t }))}
              />
              <FilterDropdown<AdmCat>
                color="teal"
                value={admCatFilter}
                onChange={(v) => setAdmCatFilter(v as AdmCat | '')}
                placeholder="All Adm Cats"
                options={ADM_CATS.map((c) => ({ value: c, label: c }))}
              />
              <FilterDropdown<PaymentMode>
                color="teal"
                value={paymentModeFilter}
                onChange={(v) => setPaymentModeFilter(v as PaymentMode | '')}
                placeholder="All Modes"
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
              />

              <span className="w-px h-5 bg-[#CDE6E6] shrink-0 mx-0.5" />

              <span className="text-[9.5px] text-[#8A93A3] font-medium uppercase tracking-[0.6px] select-none shrink-0">Cols</span>
              {(
                [
                  { label: 'Father Name', active: showFatherName, toggle: () => setShowFatherName((v) => !v) },
                  { label: 'SVK Rpt', active: showSVKRpt, toggle: () => setShowSVKRpt((v) => !v) },
                  { label: 'Remarks', active: showRemarks, toggle: () => setShowRemarks((v) => !v) },
                  { label: 'Fee Breakdown', active: showSMPDetails, toggle: () => setShowSMPDetails((v) => !v) },
                  { label: 'SVK Details', active: showSVKDetails, toggle: () => setShowSVKDetails((v) => !v) },
                ] as { label: string; active: boolean; toggle: () => void }[]
              ).map(({ label, active, toggle }) => (
                <button
                  key={label}
                  onClick={toggle}
                  className={`shrink-0 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'border-[#0F8B8D] bg-[#0F8B8D] text-white shadow-[0_2px_8px_#0F8B8D40]'
                      : 'border-[#0F8B8D]/35 bg-white text-[#0B6567] hover:bg-[#F4FAFA] hover:border-[#0F8B8D]/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {dateFilter && !debouncedSearch && <DayCloseStrip records={dayRecords} date={dateFilter} />}

      {/* ── Table / empty states ─────────────────────────────────────────── */}
      {!selectedYear ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          title="Select an academic year to view the fee register."
        />
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="22" height="13" rx="2"/><path d="M1 10h22"/></svg>}
          title={
            sortedRecords.length === 0
              ? 'No fee records found for this academic year.'
              : 'No records match the current filters.'
          }
        />
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#CDE6E6] overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(18,20,26,0.05)]">
          <div
            ref={tableScrollRef}
            className="scroll-teal scroll-teal-wide flex-1 min-h-0 overflow-auto"
          >
          <table className="w-full text-xs border-separate border-spacing-0" style={tableStyle}>
            {colgroup}
            <thead className="sticky top-0 z-10 [&>tr:first-child>th]:h-7 [&>tr:first-child>th]:py-0 [&>tr:last-child>th]:border-b [&>tr:last-child>th]:border-b-[#C7E2E2]">
              {/* Group header */}
              <tr>
                <th
                  colSpan={infoCols}
                  className="px-3 py-1.5 text-left text-[9px] font-medium text-[#4F8C8D] uppercase tracking-[0.8px] border-r border-b border-[#C7E2E2] bg-[#DDEEEE]"
                >
                  Student Info
                </th>
                <th
                  colSpan={showSMPDetails ? SMP_FEE_HEADS.length + 1 : 1}
                  className="px-3 py-1.5 text-center text-[9px] font-medium text-[#0A5F8E] uppercase tracking-[0.8px] border-r border-b border-[#C7E2E2] bg-[#D6ECFA]"
                >
                  SMP Fee — Government
                </th>
                <th
                  colSpan={showSVKDetails ? 1 + additionalHeadLabels.length + 1 : 1}
                  className="px-3 py-1.5 text-center text-[9px] font-medium text-[#5B3FB5] uppercase tracking-[0.8px] border-r border-b border-[#C7E2E2] bg-[#E7E1FA]"
                >
                  SVK Fee — Management
                </th>
                <th className="px-3 py-1.5 text-center text-[9px] font-medium text-[#0B6567] uppercase tracking-[0.8px] border-b border-[#C7E2E2] bg-[#CBE7E7]">
                  Grand Total
                </th>
              </tr>

              {/* Column header */}
              <tr>
                <th className={`${TH} sticky left-0 z-20 bg-[#E6F3F3] border-r border-[#C7E2E2]`}>#</th>
                <th className={`${TH} sticky left-[44px] z-20 bg-[#E6F3F3] border-r border-[#C7E2E2]`}>Name</th>
                {showFatherName && <th className={`${TH} bg-[#E6F3F3]`}>Father Name</th>}
                <th className={`${TH} bg-[#E6F3F3]`}>Year</th>
                <th className={`${TH} bg-[#E6F3F3]`}>Course</th>
                <th className={`${TH} bg-[#E6F3F3]`}>Reg No</th>
                <th className={`${TH} bg-[#E6F3F3]`}>Cat</th>
                <th className={`${TH} bg-[#E6F3F3]`}>Adm Type</th>
                <th className={`${TH} bg-[#E6F3F3] !font-bold`}>Date</th>
                <th className={`${TH} bg-[#E6F3F3] !font-bold`}>SMP Rpt</th>
                {showSVKRpt && <th className={`${TH} bg-[#E6F3F3]`}>SVK Rpt</th>}
                <th className={`${TH} bg-[#E6F3F3]`}>Mode</th>
                {showRemarks && <th className={`${TH} bg-[#E6F3F3]`}>Remarks</th>}
                <th className={`${TH} !text-center bg-[#E6F3F3] border-r border-[#C7E2E2]`}>Due Fee</th>

                {showSMPDetails && SMP_FEE_HEADS.map(({ key, label }) => (
                  <th key={key} className={`${TH} !text-right bg-[#E9F5FC] !text-[#0A5F8E]/80`}>
                    {label}
                  </th>
                ))}
                <th className={`${TH} !text-right bg-[#D6ECFA] !text-[#0A5F8E] border-r border-[#C7E2E2]`}>
                  SMP Total
                </th>

                {showSVKDetails && (
                  <th className={`${TH} !text-right bg-[#F1EEFC] !text-[#5B3FB5]/80`}>SVK</th>
                )}
                {showSVKDetails && additionalHeadLabels.map((label) => (
                  <th key={label} className={`${TH} !text-right bg-[#F1EEFC] !text-[#5B3FB5]/80`}>{label}</th>
                ))}
                <th className={`${TH} !text-right bg-[#E7E1FA] !text-[#5B3FB5] border-r border-[#C7E2E2]`}>
                  SVK Total
                </th>

                <th className={`${TH} !text-right bg-[#CBE7E7] !text-[#0B6567] !font-bold`}>
                  Total
                </th>
              </tr>
            </thead>

            <tbody className="[&>tr:not(:first-child)>td]:border-t [&>tr:not(:first-child)>td]:border-t-[#EAF3F3]">
              {visibleRecords.map((record, idx) => {
                const smpTotal = calcSMPTotal(record);
                const svkTotal = calcSVKTotal(record);
                const total = smpTotal + svkTotal;
                const isDue = record.isDueFee ?? (dueFeeIds.has(record.id) || record.academicYear !== selectedYear);
                return (
                  <tr
                    key={record.id}
                    className="group hover:bg-[#F4FAFA] transition-colors cursor-context-menu"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, record });
                    }}
                  >
                    <td className="px-3 py-2 text-[11px] font-medium text-black tabular-nums whitespace-nowrap sticky left-0 z-[1] bg-white group-hover:bg-[#F4FAFA] transition-colors">{idx + 1}</td>
                    <td
                      className="px-3 py-2 whitespace-nowrap overflow-hidden sticky left-[44px] z-[1] bg-white group-hover:bg-[#F4FAFA] transition-colors border-r border-[#EAF3F3] cursor-pointer select-none"
                      onDoubleClick={() => setDetailRecord(record)}
                      title="Double-click to view fee details"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <RingAvatar name={record.studentName} course={record.course} />
                        <span className="text-[12.5px] font-medium text-[#0B6567] truncate min-w-0">{record.studentName}</span>
                        {record.academicYear !== selectedYear && (
                          <LinePill value={`PY ${record.academicYear}`} color={TEAL} />
                        )}
                      </div>
                    </td>
                    {showFatherName && <td className="px-3 py-2 text-[12px] text-[#5B6371] whitespace-nowrap truncate" title={record.fatherName}>{record.fatherName}</td>}
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.year} value={YEAR_LABELS[record.year] ?? record.year} color={YEAR_COLOR[record.year]} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.course} value={record.course} color={DEPT_DOT[record.course]} /></td>
                    <td className="px-3 py-2 text-[11.5px] font-medium text-black tabular-nums whitespace-nowrap">{record.regNumber || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.admCat} value={record.admCat} color={ADM_CAT_COLOR[record.admCat]} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.admType} value={record.admType} color={ADM_TYPE_COLOR[record.admType]} /></td>
                    <td className="px-3 py-2 text-[11.5px] text-[#0B6567] font-bold whitespace-nowrap tabular-nums">{formatDate(record.date)}</td>
                    <td className="px-3 py-2 text-[11.5px] text-[#0B6567] font-bold whitespace-nowrap tabular-nums">{record.receiptNumber || '—'}</td>
                    {showSVKRpt && <td className="px-3 py-2 text-[11.5px] font-medium text-[#5B6371] whitespace-nowrap tabular-nums">{record.svkReceiptNumber || '—'}</td>}
                    <td className="px-3 py-2 whitespace-nowrap"><LinePill minWidth={PILL_W.mode} value={record.paymentMode} color={MODE_COLOR[record.paymentMode]} /></td>
                    {showRemarks && (
                      <td className="px-3 py-2 text-[12px] text-[#5B6371] whitespace-nowrap truncate" title={record.remarks}>
                        {record.remarks || <span className="text-[#C4C8D0]">—</span>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-center whitespace-nowrap border-r border-[#EAF3F3]">
                      {isDue && <LinePill value="Due Fee" color={ACTION_COLOR_DUES} />}
                    </td>

                    {/* SMP heads */}
                    {showSMPDetails && SMP_FEE_HEADS.map(({ key }) => (
                      <td key={key} className="px-3 py-2 text-right text-[11.5px] text-[#5B6371] whitespace-nowrap tabular-nums bg-[#F4FAFE] group-hover:bg-[#E9F5FC]">
                        {record.smp[key] > 0 ? record.smp[key].toLocaleString() : <span className="text-[#C4C8D0]">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-[12px] font-medium text-[#0A5F8E] whitespace-nowrap tabular-nums border-r border-[#EAF3F3] bg-[#E9F5FC] group-hover:bg-[#DCEEFA]">
                      {smpTotal.toLocaleString()}
                    </td>

                    {/* SVK */}
                    {showSVKDetails && (
                      <td className="px-3 py-2 text-right text-[11.5px] text-[#5B6371] whitespace-nowrap tabular-nums bg-[#F8F6FE] group-hover:bg-[#F1EEFC]">
                        {record.svk > 0 ? record.svk.toLocaleString() : <span className="text-[#C4C8D0]">—</span>}
                      </td>
                    )}
                    {showSVKDetails && additionalHeadLabels.map((label) => {
                      const val = record.additionalPaid.find((h) => h.label === label)?.amount ?? 0;
                      return (
                        <td key={label} className="px-3 py-2 text-right text-[11.5px] text-[#5B6371] whitespace-nowrap tabular-nums bg-[#F8F6FE] group-hover:bg-[#F1EEFC]">
                          {val > 0 ? val.toLocaleString() : <span className="text-[#C4C8D0]">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right text-[12px] font-medium text-[#5B3FB5] whitespace-nowrap tabular-nums border-r border-[#EAF3F3] bg-[#F1EEFC] group-hover:bg-[#E9E4FA]">
                      {svkTotal.toLocaleString()}
                    </td>

                    {/* Grand total */}
                    <td className="px-3 py-2 text-right text-[12.5px] font-bold text-[#0B6567] whitespace-nowrap tabular-nums bg-[#E6F3F3] group-hover:bg-[#D9EDED]">
                      ₹{total.toLocaleString()}
                    </td>
                  </tr>
                );
              })}

              {hasMore && (
                <tr>
                  <td
                    colSpan={
                      11 + (showFatherName ? 1 : 0) + (showSVKRpt ? 1 : 0) + (showRemarks ? 1 : 0) +
                      (showSMPDetails ? SMP_FEE_HEADS.length : 0) + 1 +
                      (showSVKDetails ? 1 + additionalHeadLabels.length : 0) + 1 +
                      1
                    }
                    className="px-4 py-3 text-center"
                  >
                    <button
                      className={OUTLINE_PILL_BTN}
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load {Math.min(PAGE_SIZE, filteredRecords.length - visibleCount)} more ({filteredRecords.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Spacer — sized in useLayoutEffect so the totals row sits at the bottom */}
            <tbody aria-hidden="true">
              <tr ref={spacerRef}><td colSpan={colWidths.length} className="p-0" /></tr>
            </tbody>

            {/* Totals footer */}
            <tfoot className="sticky bottom-0 z-10 [&_td]:h-9 [&_td]:py-0 [&_td]:border-t [&_td]:border-t-[#C7E2E2]">
              <tr className="bg-[#E6F3F3] font-medium">
                <td className="px-3 py-2 text-[#0B6567] text-[10px] uppercase tracking-[0.6px] sticky left-0 z-20 bg-[#E6F3F3]" colSpan={2}>
                  Totals · {filteredRecords.length} records
                </td>
                <td colSpan={9 + (showFatherName ? 1 : 0) + (showSVKRpt ? 1 : 0) + (showRemarks ? 1 : 0)} className="bg-[#E6F3F3] border-r border-[#C7E2E2]" />

                {showSMPDetails && SMP_FEE_HEADS.map(({ key }) => (
                  <td key={key} className="px-3 py-2 text-right text-[#0A5F8E] whitespace-nowrap tabular-nums text-xs bg-[#E1F0FA]">
                    {totals.smp[key] > 0 ? totals.smp[key].toLocaleString() : <span className="text-[#0A5F8E]/30">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-[#0A5F8E] whitespace-nowrap tabular-nums font-bold border-r border-[#C7E2E2] bg-[#D6ECFA]">
                  {(Object.values(totals.smp) as number[]).reduce((s, v) => s + v, 0).toLocaleString()}
                </td>

                {showSVKDetails && (
                  <td className="px-3 py-2 text-right text-[#5B3FB5] whitespace-nowrap tabular-nums bg-[#ECE8FB]">
                    {totals.svk > 0 ? totals.svk.toLocaleString() : <span className="text-[#5B3FB5]/30">—</span>}
                  </td>
                )}
                {showSVKDetails && additionalHeadLabels.map((label) => (
                  <td key={label} className="px-3 py-2 text-right text-[#5B3FB5] whitespace-nowrap tabular-nums bg-[#ECE8FB]">
                    {(totals.additional[label] ?? 0) > 0
                      ? (totals.additional[label] ?? 0).toLocaleString()
                      : <span className="text-[#5B3FB5]/30">—</span>}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-[#5B3FB5] whitespace-nowrap tabular-nums font-bold border-r border-[#C7E2E2] bg-[#E7E1FA]">
                  {(totals.svk + additionalHeadLabels.reduce((s, l) => s + (totals.additional[l] ?? 0), 0)).toLocaleString()}
                </td>

                <td className="px-3 py-2 text-right text-white whitespace-nowrap tabular-nums font-bold text-sm bg-[#0F8B8D]">
                  ₹{totals.grandTotal.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>

          <div className="mt-auto flex-shrink-0 px-4 py-2 border-t border-[#C7E2E2] bg-[#F2F9F9] text-[11px] font-medium text-[#8A93A3]">
            Showing <span className="font-medium text-[#262B35] tabular-nums">{Math.min(visibleCount, filteredRecords.length)}</span> of <span className="font-medium text-[#262B35] tabular-nums">{filteredRecords.length}</span>
            {filteredRecords.length < sortedRecords.length && (
              <span> (filtered from {sortedRecords.length} total)</span>
            )}
          </div>
        </div>
      )}

      {/* Fee receipt detail modal (double-click on name) */}
      {detailRecord && (
        <FeeReceiptDetailModal
          record={detailRecord}
          isAdmin={isAdmin}
          onClose={() => setDetailRecord(null)}
          onEdit={() => { setEditRecord(detailRecord); setDetailRecord(null); }}
          onDelete={() => { setDeleteTarget(detailRecord); setDeleteError(null); setDetailRecord(null); }}
          onFeeDetails={() => { setHistoryRecord(detailRecord); setDetailRecord(null); }}
        />
      )}

      {/* Edit modal */}
      {editRecord && (
        <FeeEditModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => setEditRecord(null)}
        />
      )}

      {/* Fee history modal */}
      {historyRecord && (
        <FeeHistoryModal
          student={{
            id: historyRecord.studentId,
            regNumber: historyRecord.regNumber,
            studentNameSSLC: historyRecord.studentName,
            fatherName: historyRecord.fatherName,
            course: historyRecord.course,
            year: historyRecord.year,
            admType: historyRecord.admType,
            admCat: historyRecord.admCat,
          }}
          onClose={() => setHistoryRecord(null)}
        />
      )}
    </div>

    {/* ── Context menu — rendered outside the animated div to avoid the transform containing-block bug ── */}
    {ctxMenu && (() => {
      const smp = calcSMPTotal(ctxMenu.record);
      const svk = ctxMenu.record.svk;
      const addl = ctxMenu.record.additionalPaid.reduce((s, h) => s + h.amount, 0);
      return (
        <div
          ref={ctxRef}
          className="font-wp fixed z-50 bg-white border border-[#CDE6E6] rounded-2xl overflow-hidden min-w-[220px]"
          style={{ top: ctxMenu.y, left: ctxMenu.x, visibility: 'hidden', boxShadow: '0 12px 36px rgba(18,20,26,0.12), 0 2px 8px rgba(18,20,26,0.05)', animation: 'ctx-menu-enter 0.12s cubic-bezier(0.2,0,0,1)' }}
        >
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-[#C7E2E2] bg-[#EEF7F7] flex items-center gap-3">
            <RingAvatar name={ctxMenu.record.studentName} course={ctxMenu.record.course} />
            <div className="min-w-0">
              <p className="text-[9px] font-medium uppercase tracking-[0.8px] text-[#8A93A3] leading-none">
                {ctxMenu.record.course} · {ctxMenu.record.year}
              </p>
              <p className="mt-1 text-[12px] font-medium text-[#262B35] truncate leading-none">{ctxMenu.record.studentName}</p>
            </div>
          </div>
          {/* Items */}
          <div className="p-1">
            <button
              disabled={smp === 0}
              className={MENU_ITEM}
              onClick={() => { generateSMPReceipt(ctxMenu.record); closeCtx(); }}
            >
              <span className={`${MENU_ICON} text-[8.5px] font-bold`} style={{ background: '#0EA5E91A', color: '#0A5F8E' }}>SMP</span>
              SMP Receipt
            </button>
            <button
              disabled={svk === 0}
              className={MENU_ITEM}
              onClick={() => { generateSVKReceipt(ctxMenu.record); closeCtx(); }}
            >
              <span className={`${MENU_ICON} text-[8.5px] font-bold`} style={{ background: '#8B5CF61A', color: '#5B3FB5' }}>SVK</span>
              SVK Receipt
            </button>
            <button
              disabled={addl === 0}
              className={MENU_ITEM}
              onClick={() => { generateAdditionalReceipt(ctxMenu.record); closeCtx(); }}
            >
              <span className={`${MENU_ICON} text-[13px] font-bold`} style={{ background: '#0FA9681A', color: '#0B7A4D' }}>+</span>
              Additional Receipt
            </button>
            <div className="my-1 h-px bg-[#EAF3F3] mx-2" />
            <button
              className={MENU_ITEM}
              onClick={() => { setHistoryRecord(ctxMenu.record); closeCtx(); }}
            >
              <span className={`${MENU_ICON} group-hover:bg-[#0F8B8D]/10 group-hover:text-[#0F8B8D]`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </span>
              Fee Details
            </button>
          </div>
        </div>
      );
    })()}

    {/* Delete confirmation */}
    {deleteTarget && (
      <div className="font-wp fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => { if (!deleting) setDeleteTarget(null); }}
          aria-hidden="true"
          style={{ animation: 'backdrop-enter 0.2s ease-out' }}
        />
        <div className="relative bg-white rounded-2xl border border-[#CDE6E6] shadow-2xl max-w-sm w-full mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
          <div className="bg-[#FFF1F2] border-b border-[#FECDD3] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E11D48]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-[#E11D48]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-[14px] font-medium text-[#9F1239]">Delete Fee Record?</h3>
                <p className="text-[11.5px] text-[#E11D48] mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-[12px] text-[#5B6371] mb-1">
              <span className="font-medium text-[#262B35]">{deleteTarget.studentName}</span>
              <span className="text-[#8A93A3]"> · {formatDate(deleteTarget.date)}</span>
              {deleteTarget.receiptNumber && (
                <span className="ml-1 text-[#8A93A3]">· Rpt {deleteTarget.receiptNumber}</span>
              )}
            </p>
            {deleteError && (
              <p className="text-[12px] text-[#E11D48] bg-[#FFF1F2] border border-[#FECDD3] rounded-lg px-3 py-2 mt-3">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className={OUTLINE_PILL_BTN}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="shrink-0 inline-flex items-center rounded-full border border-transparent px-4 py-1.5 text-[11.5px] font-medium text-white bg-[#E11D48] hover:bg-[#BE123C] focus:outline-none focus:ring-2 focus:ring-[#E11D48]/30 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
