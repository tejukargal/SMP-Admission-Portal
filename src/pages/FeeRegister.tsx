import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
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

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL', 'SNQ'];
const ADM_CATS: AdmCat[] = ['GM', 'SNQ', 'OTHERS'];
const PAYMENT_MODES: PaymentMode[] = ['CASH', 'UPI'];
const PAGE_SIZE = 100;

const fs =
  'rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 cursor-pointer transition-colors';

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

function exportRegisterExcel(records: FeeRecord[], additionalHeadLabels: string[], academicYear: string): void {
  const smpHeaders = SMP_FEE_HEADS.map(({ label }) => label);
  const headers = [
    '#', 'Name', 'Father Name', 'Year', 'Course', 'Reg No',
    'Adm Cat', 'Adm Type', 'Date', 'SMP Rpt', 'SVK Rpt', 'Mode', 'Remarks',
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
      ...(SMP_FEE_HEADS as { key: SMPFeeHead }[]).map(({ key }) => r.smp[key] || 0),
      smpTotal,
      r.svk || 0,
      ...additionalHeadLabels.map((label) => r.additionalPaid.find((h) => h.label === label)?.amount ?? 0),
      svkTotal,
      smpTotal + svkTotal,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Register');
  XLSX.writeFile(wb, `Fee_Register_${academicYear}.xlsx`);
}

function LoadingGate() {
  return <PageSpinner />;
}

export function FeeRegister() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [admTypeFilter, setAdmTypeFilter] = useState<AdmType | ''>('');
  const [admCatFilter, setAdmCatFilter] = useState<AdmCat | ''>('');
  const [paymentModeFilter, setPaymentModeFilter] = useState<PaymentMode | ''>('');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editRecord, setEditRecord] = useState<FeeRecord | null>(null);
  const [historyRecord, setHistoryRecord] = useState<FeeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Column visibility (hidden by default)
  const [showFatherName, setShowFatherName] = useState(false);
  const [showSMPDetails, setShowSMPDetails] = useState(false);
  const [showSVKDetails, setShowSVKDetails] = useState(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; record: FeeRecord } | null>(null);
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

  // Default to current academic year once settings load
  useEffect(() => {
    if (settings?.currentAcademicYear && !selectedYear) {
      setSelectedYear(settings.currentAcademicYear);
    }
  }, [settings, selectedYear]);

  // Reset date filter when academic year changes
  useEffect(() => {
    setDateFilter('');
  }, [selectedYear]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const academicYear = selectedYear || null;
  const { records: rawRecords, loading: recordsLoading, refetch } = useFeeRecords(academicYear as AcademicYear | null, { mode: 'by-date' });

  // Sort: oldest date first, then by receipt number
  const sortedRecords = useMemo(() => sortRecords(rawRecords), [rawRecords]);

  // Unique dates for date filter dropdown (descending)
  const uniqueDates = useMemo(() => {
    const dates = new Set<string>();
    for (const r of sortedRecords) if (r.date) dates.add(r.date.slice(0, 10));
    return [...dates].sort((a, b) => b.localeCompare(a));
  }, [sortedRecords]);

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

  // Apply filters
  const filteredRecords = useMemo(() => {
    let result = sortedRecords;
    if (courseFilter)       result = result.filter((r) => r.course       === courseFilter);
    if (yearFilter)         result = result.filter((r) => r.year         === yearFilter);
    if (admTypeFilter)      result = result.filter((r) => r.admType      === admTypeFilter);
    if (admCatFilter)       result = result.filter((r) => r.admCat       === admCatFilter);
    if (paymentModeFilter)  result = result.filter((r) => r.paymentMode  === paymentModeFilter);
    if (dateFilter)         result = result.filter((r) => r.date.slice(0, 10) === dateFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.trim().toUpperCase();
      result = result.filter(
        (r) =>
          r.studentName.toUpperCase().includes(q) ||
          r.fatherName.toUpperCase().includes(q) ||
          r.regNumber?.toUpperCase().includes(q) ||
          r.receiptNumber?.includes(q)
      );
    }
    return result;
  }, [sortedRecords, courseFilter, yearFilter, admTypeFilter, admCatFilter, paymentModeFilter, dateFilter, debouncedSearch]);

  // Reset visible window whenever filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredRecords]);

  const visibleRecords = useMemo(
    () => filteredRecords.slice(0, visibleCount),
    [filteredRecords, visibleCount]
  );

  const hasMore = visibleCount < filteredRecords.length;

  const hasActiveFilters = !!searchTerm || !!courseFilter || !!yearFilter || !!admTypeFilter || !!admCatFilter || !!paymentModeFilter || !!dateFilter;

  function clearFilters() {
    setSearchTerm('');
    setCourseFilter('');
    setYearFilter('');
    setAdmTypeFilter('');
    setAdmCatFilter('');
    setPaymentModeFilter('');
    setDateFilter('');
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteFeeRecord(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
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

  const isLoading = settingsLoading || recordsLoading;

  if (isLoading) return <LoadingGate />;

  return (
    <div className="h-full flex flex-col gap-3" style={{ animation: 'page-enter 0.22s ease-out' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-tight tracking-tight">Fee Register</h2>
          {selectedYear && (
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{selectedYear}</p>
          )}
        </div>

        {!isLoading && sortedRecords.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              <span className="text-gray-500 font-medium">Records</span>
              <span className="font-bold tabular-nums text-gray-900">
                {filteredRecords.length}
                {hasActiveFilters && filteredRecords.length !== sortedRecords.length && (
                  <span className="text-gray-400 font-normal"> / {sortedRecords.length}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-xs shadow-sm whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              <span className="text-emerald-700 font-medium">Collected</span>
              <span className="font-bold tabular-nums text-emerald-900">₹{totals.grandTotal.toLocaleString()}</span>
            </div>
            <button
              onClick={() => exportRegisterExcel(filteredRecords, additionalHeadLabels, selectedYear)}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shadow-sm"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
              </svg>
              Export Excel
            </button>
          </div>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={fs}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value as AcademicYear | '')}
          >
            <option value="">Select Year</option>
            {[...ACADEMIC_YEARS].reverse().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <span className="text-gray-200 text-sm select-none">|</span>

          <input
            type="text"
            placeholder="Search name / reg / rpt…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-44 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 bg-white text-gray-700 placeholder:text-gray-400"
          />
          <select className={fs} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value as Course | '')}>
            <option value="">All Courses</option>
            {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={fs} value={yearFilter} onChange={(e) => setYearFilter(e.target.value as Year | '')}>
            <option value="">All Years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className={fs} value={admTypeFilter} onChange={(e) => setAdmTypeFilter(e.target.value as AdmType | '')}>
            <option value="">All Adm Types</option>
            {ADM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={fs} value={admCatFilter} onChange={(e) => setAdmCatFilter(e.target.value as AdmCat | '')}>
            <option value="">All Adm Cats</option>
            {ADM_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={fs} value={paymentModeFilter} onChange={(e) => setPaymentModeFilter(e.target.value as PaymentMode | '')}>
            <option value="">All Modes</option>
            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={fs} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="">All Dates</option>
            {uniqueDates.map((d) => (
              <option key={d} value={d}>{formatDate(d)}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded-full border border-orange-300 px-3 py-1.5 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-400 focus:outline-none cursor-pointer transition-colors font-medium"
            >
              ✕ Clear
            </button>
          )}

          <span className="text-gray-200 text-sm select-none">|</span>

          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide select-none">Cols:</span>
          {(
            [
              { label: 'Father Name', active: showFatherName, toggle: () => setShowFatherName((v) => !v) },
              { label: 'Fee Breakdown', active: showSMPDetails, toggle: () => setShowSMPDetails((v) => !v) },
              { label: 'SVK Details', active: showSVKDetails, toggle: () => setShowSVKDetails((v) => !v) },
            ] as { label: string; active: boolean; toggle: () => void }[]
          ).map(({ label, active, toggle }) => (
            <button
              key={label}
              onClick={toggle}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table / empty states ─────────────────────────────────────────── */}
      {!selectedYear ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
          <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 4h10M3 11h18M3 15h10m-7 4h4" />
          </svg>
          <span className="text-sm">Select an academic year to view the fee register.</span>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
          <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">
            {sortedRecords.length === 0
              ? 'No fee records found for this academic year.'
              : 'No records match the current filters.'}
          </span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto flex flex-col">
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              {/* Group header */}
              <tr className="border-b border-gray-200">
                <th
                  colSpan={showFatherName ? 13 : 12}
                  className="px-3 py-1.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-r border-gray-200 bg-slate-50"
                >
                  Student Info
                </th>
                <th
                  colSpan={showSMPDetails ? SMP_FEE_HEADS.length + 1 : 1}
                  className="px-3 py-1.5 text-center text-[10px] font-bold text-blue-600 uppercase tracking-wider border-r border-gray-200 bg-blue-50"
                >
                  SMP Fee — Government
                </th>
                <th
                  colSpan={showSVKDetails ? 1 + additionalHeadLabels.length + 1 : 1}
                  className="px-3 py-1.5 text-center text-[10px] font-bold text-violet-600 uppercase tracking-wider border-r border-gray-200 bg-violet-50"
                >
                  SVK Fee — Management
                </th>
                <th className="px-3 py-1.5 text-center text-[10px] font-bold text-emerald-700 uppercase tracking-wider border-r border-gray-200 bg-emerald-50">
                  Grand Total
                </th>
                {isAdmin && (
                  <th className="px-3 py-1.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-slate-50">
                    Actions
                  </th>
                )}
              </tr>

              {/* Column header */}
              <tr className="border-b-2 border-gray-200 bg-slate-50">
                <th className="px-2 py-1.5 text-left font-semibold text-slate-500 whitespace-nowrap w-8 sticky left-0 z-20 bg-slate-50">#</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap sticky left-8 z-20 bg-slate-50 border-r border-gray-200">Name</th>
                {showFatherName && <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">Father Name</th>}
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-16">Year</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-12">Course</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-24">Reg No</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-14">Cat</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-20">Adm Type</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-20">Date</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-12">SMP Rpt</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-24">SVK Rpt</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-14">Mode</th>
                <th className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap w-28 border-r border-gray-200">Remarks</th>

                {showSMPDetails && SMP_FEE_HEADS.map(({ key, label }) => (
                  <th key={key} className="px-2 py-1.5 text-right font-semibold text-blue-600 whitespace-nowrap w-14">
                    {label}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-bold text-blue-700 whitespace-nowrap w-16 border-r border-gray-200">
                  SMP Total
                </th>

                {showSVKDetails && (
                  <th className="px-2 py-1.5 text-right font-semibold text-violet-600 whitespace-nowrap w-14">SVK</th>
                )}
                {showSVKDetails && additionalHeadLabels.map((label) => (
                  <th key={label} className="px-2 py-1.5 text-right font-semibold text-violet-600 whitespace-nowrap w-20">{label}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-bold text-violet-700 whitespace-nowrap w-16 border-r border-gray-200">
                  SVK Total
                </th>

                <th className="px-2 py-1.5 text-right font-bold text-emerald-700 whitespace-nowrap w-20 border-r border-gray-200">
                  Total
                </th>
                {isAdmin && (
                  <th className="px-2 py-1.5 text-center font-semibold text-slate-500 whitespace-nowrap w-20">
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {visibleRecords.map((record, idx) => {
                const smpTotal = calcSMPTotal(record);
                const svkTotal = calcSVKTotal(record);
                const total = smpTotal + svkTotal;
                return (
                  <tr
                    key={record.id}
                    className="group hover:bg-slate-50/80 transition-colors cursor-context-menu"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, record });
                    }}
                  >
                    <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap sticky left-0 z-[1] bg-white group-hover:bg-slate-50/80 transition-colors">{idx + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap sticky left-8 z-[1] bg-white group-hover:bg-slate-50/80 transition-colors border-r border-gray-100">
                      {record.studentName}
                      {record.academicYear !== selectedYear && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 align-middle">
                          PY {record.academicYear}
                        </span>
                      )}
                    </td>
                    {showFatherName && <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{record.fatherName}</td>}
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{record.year}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-medium">{record.course}</td>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap font-mono">{record.regNumber || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{record.admCat}</td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{record.admType}</td>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{formatDate(record.date)}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono text-[11px]">{record.receiptNumber || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono text-[11px]">{record.svkReceiptNumber || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          record.paymentMode === 'UPI'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {record.paymentMode}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap border-r border-gray-100 max-w-[7rem] truncate" title={record.remarks}>
                      {record.remarks || <span className="text-gray-200">—</span>}
                    </td>

                    {/* SMP heads */}
                    {showSMPDetails && SMP_FEE_HEADS.map(({ key }) => (
                      <td key={key} className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap tabular-nums bg-blue-50/30">
                        {record.smp[key] > 0 ? record.smp[key].toLocaleString() : <span className="text-gray-200">—</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold text-blue-800 whitespace-nowrap tabular-nums border-r border-gray-100 bg-blue-50/50">
                      {smpTotal.toLocaleString()}
                    </td>

                    {/* SVK */}
                    {showSVKDetails && (
                      <td className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap tabular-nums bg-violet-50/30">
                        {record.svk > 0 ? record.svk.toLocaleString() : <span className="text-gray-200">—</span>}
                      </td>
                    )}
                    {showSVKDetails && additionalHeadLabels.map((label) => {
                      const val = record.additionalPaid.find((h) => h.label === label)?.amount ?? 0;
                      return (
                        <td key={label} className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap tabular-nums bg-violet-50/30">
                          {val > 0 ? val.toLocaleString() : <span className="text-gray-200">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-bold text-violet-800 whitespace-nowrap tabular-nums border-r border-gray-100 bg-violet-50/50">
                      {svkTotal.toLocaleString()}
                    </td>

                    {/* Grand total */}
                    <td className="px-2 py-1.5 text-right font-bold text-emerald-700 whitespace-nowrap tabular-nums border-r border-gray-100 bg-emerald-50/50">
                      ₹{total.toLocaleString()}
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditRecord(record)}
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 hover:border-blue-300 transition-colors cursor-pointer"
                            title="Edit record"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(record); setDeleteError(null); }}
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 border border-red-200 hover:border-red-300 transition-colors cursor-pointer"
                            title="Delete record"
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}

              {hasMore && (
                <tr>
                  <td
                    colSpan={
                      (showFatherName ? 13 : 12) +
                      (showSMPDetails ? SMP_FEE_HEADS.length : 0) + 1 +
                      (showSVKDetails ? 1 + additionalHeadLabels.length : 0) + 1 +
                      1 + (isAdmin ? 1 : 0)
                    }
                    className="px-4 py-3 text-center"
                  >
                    <button
                      className="rounded-full border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300 px-4 py-1 text-xs font-medium transition-colors cursor-pointer"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load {Math.min(PAGE_SIZE, filteredRecords.length - visibleCount)} more ({filteredRecords.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totals footer */}
            <tfoot className="sticky bottom-0 z-10">
              <tr className="bg-slate-700 border-t-2 border-slate-600 font-semibold text-white">
                <td className="px-2 py-2 text-slate-300 text-[10px] uppercase tracking-wide sticky left-0 z-20 bg-slate-700" colSpan={2}>
                  Totals · {filteredRecords.length} records
                </td>
                <td colSpan={showFatherName ? 11 : 10} className="bg-slate-700 border-r border-slate-600" />

                {showSMPDetails && SMP_FEE_HEADS.map(({ key }) => (
                  <td key={key} className="px-2 py-2 text-right text-blue-200 whitespace-nowrap tabular-nums text-xs">
                    {totals.smp[key] > 0 ? totals.smp[key].toLocaleString() : <span className="text-slate-500">—</span>}
                  </td>
                ))}
                <td className="px-2 py-2 text-right text-blue-100 whitespace-nowrap tabular-nums font-bold border-r border-slate-600">
                  {(Object.values(totals.smp) as number[]).reduce((s, v) => s + v, 0).toLocaleString()}
                </td>

                {showSVKDetails && (
                  <td className="px-2 py-2 text-right text-violet-200 whitespace-nowrap tabular-nums">
                    {totals.svk > 0 ? totals.svk.toLocaleString() : <span className="text-slate-500">—</span>}
                  </td>
                )}
                {showSVKDetails && additionalHeadLabels.map((label) => (
                  <td key={label} className="px-2 py-2 text-right text-violet-200 whitespace-nowrap tabular-nums">
                    {(totals.additional[label] ?? 0) > 0
                      ? (totals.additional[label] ?? 0).toLocaleString()
                      : <span className="text-slate-500">—</span>}
                  </td>
                ))}
                <td className="px-2 py-2 text-right text-violet-100 whitespace-nowrap tabular-nums font-bold border-r border-slate-600">
                  {(totals.svk + additionalHeadLabels.reduce((s, l) => s + (totals.additional[l] ?? 0), 0)).toLocaleString()}
                </td>

                <td className="px-2 py-2 text-right text-emerald-300 whitespace-nowrap tabular-nums font-bold text-sm border-r border-slate-600">
                  ₹{totals.grandTotal.toLocaleString()}
                </td>
                {isAdmin && <td className="bg-slate-700" />}
              </tr>
            </tfoot>
          </table>

          <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 mt-auto shrink-0 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-gray-300 inline-block" />
            Showing {Math.min(visibleCount, filteredRecords.length)} of {filteredRecords.length}
            {filteredRecords.length < sortedRecords.length && (
              <span className="text-gray-300"> (filtered from {sortedRecords.length} total)</span>
            )}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRecord && (
        <FeeEditModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => { refetch(); setEditRecord(null); }}
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

      {/* Context menu */}
      {ctxMenu && (() => {
        const smp = calcSMPTotal(ctxMenu.record);
        const svk = ctxMenu.record.svk;
        const addl = ctxMenu.record.additionalPaid.reduce((s, h) => s + h.amount, 0);
        return (
          <div
            ref={ctxRef}
            className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-2xl py-1.5 min-w-[180px] overflow-hidden"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
          >
            <div className="px-3 py-1.5 text-[10px] text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100 mb-1 truncate max-w-[220px]">
              {ctxMenu.record.studentName}
            </div>
            <button
              disabled={smp === 0}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed enabled:text-gray-700 enabled:hover:bg-blue-50 enabled:hover:text-blue-700 enabled:cursor-pointer transition-colors"
              onClick={() => { generateSMPReceipt(ctxMenu.record); closeCtx(); }}
            >
              <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0">SMP</span>
              SMP Receipt
            </button>
            <button
              disabled={svk === 0}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed enabled:text-gray-700 enabled:hover:bg-violet-50 enabled:hover:text-violet-700 enabled:cursor-pointer transition-colors"
              onClick={() => { generateSVKReceipt(ctxMenu.record); closeCtx(); }}
            >
              <span className="w-5 h-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0">SVK</span>
              SVK Receipt
            </button>
            <button
              disabled={addl === 0}
              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed enabled:text-gray-700 enabled:hover:bg-emerald-50 enabled:hover:text-emerald-700 enabled:cursor-pointer transition-colors"
              onClick={() => { generateAdditionalReceipt(ctxMenu.record); closeCtx(); }}
            >
              <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0">+</span>
              Additional Receipt
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-slate-50 hover:text-gray-900 flex items-center gap-2.5 cursor-pointer transition-colors"
              onClick={() => { setHistoryRecord(ctxMenu.record); closeCtx(); }}
            >
              <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">≡</span>
              Fee Details
            </button>
          </div>
        );
      })()}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => { if (!deleting) setDeleteTarget(null); }}
            aria-hidden="true"
            style={{ animation: 'backdrop-enter 0.2s ease-out' }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <div className="bg-red-50 border-b border-red-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-red-900">Delete Fee Record?</h3>
                  <p className="text-xs text-red-600 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-600 mb-1">
                <span className="font-semibold text-gray-800">{deleteTarget.studentName}</span>
                <span className="text-gray-400"> · {formatDate(deleteTarget.date)}</span>
                {deleteTarget.receiptNumber && (
                  <span className="ml-1 text-gray-400">· Rpt {deleteTarget.receiptNumber}</span>
                )}
              </p>
              {deleteError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                  {deleteError}
                </p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="rounded-full border border-transparent px-4 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
