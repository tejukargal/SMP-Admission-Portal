import { useState, useMemo, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { deleteFeeRecord } from '../services/feeRecordService';
import { FeeEditModal } from '../components/fee/FeeEditModal';
import type { AcademicYear, Course, Year, FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS, ACADEMIC_YEARS } from '../types';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS: Year[] = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];

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

function sortRecords(records: FeeRecord[]): FeeRecord[] {
  return [...records].sort((a, b) => {
    // Sort by payment date ascending (oldest first)
    return a.date.localeCompare(b.date);
  });
}

export function FeeRegister() {
  const { settings, loading: settingsLoading } = useSettings();
  const [selectedYear, setSelectedYear] = useState<AcademicYear | ''>('');
  const [courseFilter, setCourseFilter] = useState<Course | ''>('');
  const [yearFilter, setYearFilter] = useState<Year | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editRecord, setEditRecord] = useState<FeeRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  return (
    <div className="h-full flex flex-col gap-3">

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
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Loading fee records…
        </div>
      ) : !selectedYear ? (
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
                <th className="px-3 py-1 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
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
                <th className="px-2 py-1.5 text-center font-semibold text-gray-500 whitespace-nowrap w-20">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredRecords.map((record, idx) => {
                const smpTotal = calcSMPTotal(record);
                const svkTotal = calcSVKTotal(record);
                const total = smpTotal + svkTotal;
                return (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
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
                  </tr>
                );
              })}
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
                <td />
              </tr>
            </tfoot>
          </table>
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

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { if (!deleting) setDeleteTarget(null); }}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
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
