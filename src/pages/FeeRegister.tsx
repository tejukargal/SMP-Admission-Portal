import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { deleteFeeRecord } from '../services/feeRecordService';
import { FeeEditModal } from '../components/fee/FeeEditModal';
import { useAuth } from '../contexts/AuthContext';
import type { AcademicYear, Course, Year, FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS, ACADEMIC_YEARS } from '../types';
import { generateSMPReceipt, generateSVKReceipt } from '../utils/feeReceipts';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const PAGE_SIZE = 100;

const fs =
  'rounded border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

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

function LoadingGate() {
  return (
    <div className="h-full flex items-center justify-center" style={{ animation: 'page-enter 0.22s ease-out' }}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-12 py-10 w-96 flex flex-col items-center text-center">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Fee Register</h2>
        <p className="text-xs text-gray-400 mb-6">Loading fee records…</p>
        <p className="text-sm font-medium text-gray-700">Thejaraj R</p>
        <p className="text-[10px] text-gray-400">Developer</p>
      </div>
    </div>
  );
}

export function FeeRegister() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { settings, loading: settingsLoading } = useSettings();
  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editRecord, setEditRecord] = useState<FeeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const academicYear = selectedYear || null;
  const { records: rawRecords, loading: recordsLoading, refetch } = useFeeRecords(academicYear as AcademicYear | null);

  // Sort: oldest date first, then by receipt number
  const sortedRecords = useMemo(() => sortRecords(rawRecords), [rawRecords]);

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
    if (courseFilter) result = result.filter((r) => r.course === courseFilter);
    if (yearFilter)   result = result.filter((r) => r.year === yearFilter);
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
  }, [sortedRecords, courseFilter, yearFilter, debouncedSearch]);

  // Reset visible window whenever filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredRecords]);

  const visibleRecords = useMemo(
    () => filteredRecords.slice(0, visibleCount),
    [filteredRecords, visibleCount]
  );

  const hasMore = visibleCount < filteredRecords.length;

  const hasActiveFilters = !!searchTerm || !!courseFilter || !!yearFilter;

  function clearFilters() {
    setSearchTerm('');
    setCourseFilter('');
    setYearFilter('');
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

      {/* Header row */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 leading-tight">Fee Register</h2>
          {selectedYear && (
            <p className="text-[10px] text-gray-400 leading-tight">{selectedYear}</p>
          )}
        </div>

        {/* Summary chips */}
        {!isLoading && sortedRecords.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2.5 py-1 text-xs shadow-sm whitespace-nowrap">
              <span className="text-gray-400 font-medium">Records</span>
              <span className="font-bold tabular-nums text-gray-900">
                {filteredRecords.length}
                {hasActiveFilters && filteredRecords.length !== sortedRecords.length && (
                  <span className="text-gray-400 font-normal"> / {sortedRecords.length}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded px-2.5 py-1 text-xs shadow-sm whitespace-nowrap">
              <span className="text-green-600 font-medium">Total Collected</span>
              <span className="font-bold tabular-nums text-green-800">
                ₹{totals.grandTotal.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Academic year selector */}
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
            className="w-44 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            className={fs}
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value as Course | '')}
          >
            <option value="">All Courses</option>
            {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className={fs}
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value as Year | '')}
          >
            <option value="">All Years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded border border-orange-400 px-2 py-1.5 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400 cursor-pointer transition-colors font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {!selectedYear ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Select an academic year to view the fee register.
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          {sortedRecords.length === 0
            ? 'No fee records found for this academic year.'
            : 'No records match the current filters.'}
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-auto flex flex-col">
          <table className="min-w-full text-xs border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              {/* Group header */}
              <tr className="border-b border-gray-200">
                <th
                  colSpan={13}
                  className="px-3 py-1 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-200"
                >
                  Student Info
                </th>
                <th
                  colSpan={SMP_FEE_HEADS.length + 1}
                  className="px-3 py-1 text-center text-[10px] font-semibold text-blue-500 uppercase tracking-wider border-r border-gray-200"
                >
                  SMP Fee (Government)
                </th>
                <th
                  colSpan={1 + additionalHeadLabels.length + 1}
                  className="px-3 py-1 text-center text-[10px] font-semibold text-purple-500 uppercase tracking-wider border-r border-gray-200"
                >
                  SVK Fee (Management)
                </th>
                <th className="px-3 py-1 text-center text-[10px] font-semibold text-green-600 uppercase tracking-wider border-r border-gray-200">
                  Grand Total
                </th>
                {isAdmin && (
                  <th className="px-3 py-1 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
              {/* Column header */}
              <tr className="border-b border-gray-200">
                {/* Student Info */}
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-8">#</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">Name</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap">Father Name</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-16">Year</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-12">Course</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-24">Reg No</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Cat</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Adm Type</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-20">Date</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-12">SMP Rpt</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-24">SVK Rpt</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-14">Mode</th>
                <th className="px-2 py-1.5 text-left font-semibold text-gray-600 whitespace-nowrap w-28 border-r border-gray-200">Remarks</th>

                {/* SMP heads */}
                {SMP_FEE_HEADS.map(({ key, label }) => (
                  <th key={key} className="px-2 py-1.5 text-right font-semibold text-blue-700 whitespace-nowrap w-14">
                    {label}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-semibold text-blue-800 whitespace-nowrap w-16 border-r border-gray-200">
                  SMP Total
                </th>

                {/* SVK heads */}
                <th className="px-2 py-1.5 text-right font-semibold text-purple-700 whitespace-nowrap w-14">
                  SVK
                </th>
                {additionalHeadLabels.map((label) => (
                  <th key={label} className="px-2 py-1.5 text-right font-semibold text-purple-600 whitespace-nowrap w-20">
                    {label}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-semibold text-purple-800 whitespace-nowrap w-16 border-r border-gray-200">
                  SVK Total
                </th>

                {/* Grand total */}
                <th className="px-2 py-1.5 text-right font-semibold text-green-700 whitespace-nowrap w-20 border-r border-gray-200">
                  Total
                </th>
                {isAdmin && (
                  <th className="px-2 py-1.5 text-center font-semibold text-gray-500 whitespace-nowrap w-20">
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
                    className="hover:bg-gray-50 transition-colors cursor-context-menu"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, record });
                    }}
                  >
                    <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">{idx + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-gray-900 whitespace-nowrap">{record.studentName}</td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{record.fatherName}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{record.year}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{record.course}</td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{record.regNumber || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{record.admCat}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{record.admType}</td>
                    <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{formatDate(record.date)}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono">{record.receiptNumber || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap font-mono">{record.svkReceiptNumber || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          record.paymentMode === 'UPI'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {record.paymentMode}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap border-r border-gray-100 max-w-[7rem] truncate" title={record.remarks}>
                      {record.remarks || '—'}
                    </td>

                    {/* SMP heads */}
                    {SMP_FEE_HEADS.map(({ key }) => (
                      <td key={key} className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap tabular-nums">
                        {record.smp[key] > 0 ? record.smp[key].toLocaleString() : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold text-blue-800 whitespace-nowrap tabular-nums border-r border-gray-100">
                      {smpTotal.toLocaleString()}
                    </td>

                    {/* SVK */}
                    <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap tabular-nums">
                      {record.svk > 0 ? record.svk.toLocaleString() : <span className="text-gray-300">—</span>}
                    </td>
                    {additionalHeadLabels.map((label) => {
                      const val = record.additionalPaid.find((h) => h.label === label)?.amount ?? 0;
                      return (
                        <td key={label} className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap tabular-nums">
                          {val > 0 ? val.toLocaleString() : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-semibold text-purple-800 whitespace-nowrap tabular-nums border-r border-gray-100">
                      {svkTotal.toLocaleString()}
                    </td>

                    {/* Grand total */}
                    <td className="px-2 py-1.5 text-right font-bold text-green-700 whitespace-nowrap tabular-nums border-r border-gray-100">
                      {total.toLocaleString()}
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditRecord(record)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 hover:border-blue-300 transition-colors cursor-pointer"
                            title="Edit record"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(record); setDeleteError(null); }}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50 border border-red-200 hover:border-red-300 transition-colors cursor-pointer"
                            title="Delete record"
                          >
                            Delete
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
                    colSpan={13 + SMP_FEE_HEADS.length + 3 + additionalHeadLabels.length + (isAdmin ? 2 : 1)}
                    className="px-4 py-2.5 text-center"
                  >
                    <button
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({filteredRecords.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Totals footer */}
            <tfoot className="sticky bottom-0 z-10">
              <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold text-gray-800">
                <td className="px-2 py-1.5 text-gray-500 text-[10px] uppercase tracking-wide" colSpan={13}>
                  Totals ({filteredRecords.length} records)
                </td>

                {/* SMP totals */}
                {SMP_FEE_HEADS.map(({ key }) => (
                  <td key={key} className="px-2 py-1.5 text-right text-blue-800 whitespace-nowrap tabular-nums text-xs">
                    {totals.smp[key] > 0 ? totals.smp[key].toLocaleString() : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right text-blue-900 whitespace-nowrap tabular-nums border-r border-gray-300">
                  {(Object.values(totals.smp) as number[]).reduce((s, v) => s + v, 0).toLocaleString()}
                </td>

                {/* SVK totals */}
                <td className="px-2 py-1.5 text-right text-purple-800 whitespace-nowrap tabular-nums">
                  {totals.svk > 0 ? totals.svk.toLocaleString() : <span className="text-gray-300">—</span>}
                </td>
                {additionalHeadLabels.map((label) => (
                  <td key={label} className="px-2 py-1.5 text-right text-purple-700 whitespace-nowrap tabular-nums">
                    {(totals.additional[label] ?? 0) > 0
                      ? (totals.additional[label] ?? 0).toLocaleString()
                      : <span className="text-gray-300">—</span>}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right text-purple-900 whitespace-nowrap tabular-nums border-r border-gray-300">
                  {(totals.svk + additionalHeadLabels.reduce((s, l) => s + (totals.additional[l] ?? 0), 0)).toLocaleString()}
                </td>

                {/* Grand total */}
                <td className="px-2 py-1.5 text-right text-green-800 whitespace-nowrap tabular-nums font-bold border-r border-gray-300">
                  ₹{totals.grandTotal.toLocaleString()}
                </td>
                {isAdmin && <td />}
              </tr>
            </tfoot>
          </table>

          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500 mt-auto shrink-0">
            Showing {Math.min(visibleCount, filteredRecords.length)} of {filteredRecords.length}
            {filteredRecords.length < sortedRecords.length && (
              <span className="text-gray-400"> (filtered from {sortedRecords.length} total)</span>
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

      {/* Context menu */}
      {ctxMenu && (() => {
        const smp = calcSMPTotal(ctxMenu.record);
        const svk = calcSVKTotal(ctxMenu.record);
        return (
          <div
            ref={ctxRef}
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[170px]"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
          >
            <div className="px-3 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wider border-b border-gray-100 mb-1 truncate max-w-[200px]">
              {ctxMenu.record.studentName}
            </div>
            <button
              disabled={smp === 0}
              className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed enabled:text-gray-700 enabled:hover:bg-blue-50 enabled:hover:text-blue-700 enabled:cursor-pointer"
              onClick={() => { generateSMPReceipt(ctxMenu.record); closeCtx(); }}
            >
              <span className="text-blue-500 font-bold text-[10px] border border-blue-300 rounded px-1 py-0.5">SMP</span>
              SMP Receipt
            </button>
            <button
              disabled={svk === 0}
              className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed enabled:text-gray-700 enabled:hover:bg-purple-50 enabled:hover:text-purple-700 enabled:cursor-pointer"
              onClick={() => { generateSVKReceipt(ctxMenu.record); closeCtx(); }}
            >
              <span className="text-purple-500 font-bold text-[10px] border border-purple-300 rounded px-1 py-0.5">SVK</span>
              SVK Receipt
            </button>
          </div>
        );
      })()}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (!deleting) setDeleteTarget(null); }}
            aria-hidden="true"
            style={{ animation: 'backdrop-enter 0.2s ease-out' }}
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6" style={{ animation: 'modal-enter 0.25s ease-out' }}>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete Fee Record?</h3>
            <p className="text-xs text-gray-600 mb-1">
              <span className="font-medium">{deleteTarget.studentName}</span>
              {' '}· {deleteTarget.date}
              {deleteTarget.receiptNumber && (
                <span className="ml-1 text-gray-500">· Rpt {deleteTarget.receiptNumber}</span>
              )}
            </p>
            <p className="text-xs text-red-600 mb-4">This action cannot be undone.</p>
            {deleteError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
                {deleteError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded border border-transparent px-3 py-1.5 text-xs text-white bg-red-600 hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
