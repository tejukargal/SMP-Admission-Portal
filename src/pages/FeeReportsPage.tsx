import { useState, useMemo, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { Button } from '../components/common/Button';
import {
  exportStatsPdf, exportFeeListPdf, exportDuesPdf,
  exportCourseYearPdf, exportConsolidatedPdf,
} from '../utils/feeReportPdf';
import type { StudentFeeRow } from '../utils/feeReportPdf';
import {
  exportStatsExcel, exportFeeListExcel, exportDuesExcel,
  exportCourseYearExcel, exportConsolidatedExcel,
} from '../utils/feeReportExcel';
import type { Course, Year, AdmType, AdmCat, AcademicYear, FeeStructure, FeeRecord } from '../types';
import { SMP_FEE_HEADS } from '../types';

type TabId = 'statistics' | 'fee-list' | 'dues' | 'course-year' | 'consolidated';
type FeeStatus = 'ALL' | 'PAID' | 'NOT_PAID' | 'FEE_DUES' | 'NO_FEE_DUES';

const COURSES: Course[] = ['CE', 'ME', 'EC', 'CS', 'EE'];
const YEARS:   Year[]   = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL', 'SNQ'];
const ADM_CATS:  AdmCat[]  = ['GM', 'SNQ', 'OTHERS'];

const fs =
  'rounded border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

const TABS: { id: TabId; label: string }[] = [
  { id: 'statistics',  label: 'Statistics'       },
  { id: 'fee-list',    label: 'Fee List'          },
  { id: 'dues',        label: 'Dues Report'       },
  { id: 'course-year', label: 'Course & Year Wise'},
  { id: 'consolidated',label: 'Consolidated'     },
];

function fmt(n: number): string {
  return `\u20B9${n.toLocaleString('en-IN')}`;
}

// ── Chip ─────────────────────────────────────────────────────────────────────
interface ChipProps {
  label: string;
  count: number;
  active: boolean;
  colorClass: string;
  onClick: () => void;
}
function Chip({ label, count, active, colorClass, onClick }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors
        ${active ? colorClass : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
    >
      <span>{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold
        ${active ? 'bg-white/40' : 'bg-gray-100 text-gray-500'}`}>
        {count}
      </span>
    </button>
  );
}

// ── Export buttons ─────────────────────────────────────────────────────────────
function ExportBar({ onPdf, onExcel }: { onPdf: () => void; onExcel: () => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={onPdf}>
        PDF
      </Button>
      <Button variant="secondary" size="sm" onClick={onExcel}>
        Excel
      </Button>
    </div>
  );
}

// ── Course/Year breakdown table (shared) ───────────────────────────────────────
interface BreakdownEntry {
  course: string; year: string; total: number; paid: number; allotted: number; collected: number;
}

function buildBreakdown(rows: StudentFeeRow[]): BreakdownEntry[] {
  const map = new Map<string, BreakdownEntry>();
  for (const r of rows) {
    const key = `${r.student.course}__${r.student.year}`;
    if (!map.has(key)) {
      map.set(key, { course: r.student.course, year: r.student.year, total: 0, paid: 0, allotted: 0, collected: 0 });
    }
    const e = map.get(key)!;
    e.total++;
    if (r.paid > 0) e.paid++;
    e.allotted  += r.allotted ?? 0;
    e.collected += r.paid;
  }
  return Array.from(map.values()).sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    return c !== 0 ? c : a.year.localeCompare(b.year);
  });
}

// ── Tab: Statistics ─────────────────────────────────────────────────────────────
function StatisticsTab({ rows, academicYear }: {
  rows: StudentFeeRow[]; academicYear: string;
}) {
  const total       = rows.length;
  const paidCount   = rows.filter((r) => r.paid > 0).length;
  const notPaid     = total - paidCount;
  const duesCount   = rows.filter((r) => r.balance !== null && r.balance > 0).length;
  const noDuesCount = rows.filter((r) => r.balance !== null && r.balance <= 0).length;
  const totAllotted = rows.reduce((s, r) => s + (r.allotted ?? 0), 0);
  const totPaid     = rows.reduce((s, r) => s + r.paid, 0);
  const totBalance  = rows.reduce((s, r) => s + (r.balance ?? 0), 0);
  const breakdown   = useMemo(() => buildBreakdown(rows), [rows]);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Students', value: total,       color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'  },
          { label: 'Paid',           value: paidCount,   color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
          { label: 'Not Paid',       value: notPaid,     color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'   },
          { label: 'Fee Dues',       value: duesCount,   color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
          { label: 'No Fee Dues',    value: noDuesCount, color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200'},
          { label: 'Total Allotted', value: null, formatted: fmt(totAllotted), color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' },
          { label: 'Total Collected',value: null, formatted: fmt(totPaid),     color: 'text-green-700',bg: 'bg-green-50',border: 'border-green-200'},
          { label: 'Balance',        value: null, formatted: fmt(totBalance),  color: 'text-red-700',  bg: 'bg-red-50',  border: 'border-red-200'  },
        ].map((c) => (
          <div key={c.label} className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>
              {'formatted' in c ? c.formatted : c.value}
            </p>
          </div>
        ))}
      </div>

      {/* Course/Year breakdown table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-700 text-white">
            <tr>
              {['Course', 'Year', 'Students', 'Paid', 'Not Paid', 'Allotted', 'Collected', 'Balance'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b, i) => (
              <tr key={`${b.course}-${b.year}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-1.5 font-semibold">{b.course}</td>
                <td className="px-3 py-1.5">{b.year}</td>
                <td className="px-3 py-1.5 text-center">{b.total}</td>
                <td className="px-3 py-1.5 text-center text-green-700">{b.paid}</td>
                <td className="px-3 py-1.5 text-center text-red-600">{b.total - b.paid}</td>
                <td className="px-3 py-1.5 text-right">{fmt(b.allotted)}</td>
                <td className="px-3 py-1.5 text-right text-green-700">{fmt(b.collected)}</td>
                <td className="px-3 py-1.5 text-right text-red-600">{fmt(b.allotted - b.collected)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-100 font-bold border-t border-gray-300">
            <tr>
              <td className="px-3 py-2" colSpan={2}>Total</td>
              <td className="px-3 py-2 text-center">{total}</td>
              <td className="px-3 py-2 text-center text-green-700">{paidCount}</td>
              <td className="px-3 py-2 text-center text-red-600">{notPaid}</td>
              <td className="px-3 py-2 text-right">{fmt(totAllotted)}</td>
              <td className="px-3 py-2 text-right text-green-700">{fmt(totPaid)}</td>
              <td className="px-3 py-2 text-right text-red-600">{fmt(totBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <ExportBar
          onPdf={() => exportStatsPdf(rows, academicYear)}
          onExcel={() => exportStatsExcel(rows, academicYear)}
        />
      </div>
    </div>
  );
}

// ── Tab: Fee List ───────────────────────────────────────────────────────────────
function FeeListTab({ rows, academicYear }: { rows: StudentFeeRow[]; academicYear: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{rows.length} student{rows.length !== 1 ? 's' : ''}</p>
        <ExportBar
          onPdf={() => exportFeeListPdf(rows, academicYear)}
          onExcel={() => exportFeeListExcel(rows, academicYear)}
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-700 text-white">
            <tr>
              {['Sl', 'Name', 'Reg No', 'Course', 'Year', 'Allotted', 'Paid', 'Balance'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.student.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-1.5 text-center text-gray-400">{i + 1}</td>
                <td className="px-3 py-1.5 font-medium max-w-[160px] truncate">{r.student.studentNameSSLC}</td>
                <td className="px-3 py-1.5 text-gray-500">{r.student.regNumber || '—'}</td>
                <td className="px-3 py-1.5 font-semibold">{r.student.course}</td>
                <td className="px-3 py-1.5">{r.student.year}</td>
                <td className="px-3 py-1.5 text-right">{r.allotted !== null ? fmt(r.allotted) : '—'}</td>
                <td className="px-3 py-1.5 text-right text-green-700">{r.paid > 0 ? fmt(r.paid) : '—'}</td>
                <td className={`px-3 py-1.5 text-right ${r.balance !== null && r.balance > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                  {r.balance !== null ? fmt(r.balance) : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No students match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Dues Report ─────────────────────────────────────────────────────────────
function DuesTab({ rows, academicYear }: { rows: StudentFeeRow[]; academicYear: string }) {
  const dueRows = useMemo(() => rows.filter((r) => r.balance !== null && r.balance > 0), [rows]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{dueRows.length} student{dueRows.length !== 1 ? 's' : ''} with outstanding balance</p>
        <ExportBar
          onPdf={() => exportDuesPdf(rows, academicYear)}
          onExcel={() => exportDuesExcel(rows, academicYear)}
        />
      </div>
      <div className="bg-white rounded-lg border border-red-200 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-red-600 text-white">
            <tr>
              {['Sl', 'Name', 'Reg No', 'Course', 'Year', 'Allotted', 'Paid', 'Balance'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dueRows.map((r, i) => (
              <tr key={r.student.id} className={i % 2 === 0 ? 'bg-white' : 'bg-red-50'}>
                <td className="px-3 py-1.5 text-center text-gray-400">{i + 1}</td>
                <td className="px-3 py-1.5 font-medium max-w-[160px] truncate">{r.student.studentNameSSLC}</td>
                <td className="px-3 py-1.5 text-gray-500">{r.student.regNumber || '—'}</td>
                <td className="px-3 py-1.5 font-semibold">{r.student.course}</td>
                <td className="px-3 py-1.5">{r.student.year}</td>
                <td className="px-3 py-1.5 text-right">{r.allotted !== null ? fmt(r.allotted) : '—'}</td>
                <td className="px-3 py-1.5 text-right text-green-700">{r.paid > 0 ? fmt(r.paid) : '—'}</td>
                <td className="px-3 py-1.5 text-right text-red-600 font-semibold">
                  {r.balance !== null ? fmt(r.balance) : '—'}
                </td>
              </tr>
            ))}
            {dueRows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No students with outstanding balance.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Course & Year Wise ───────────────────────────────────────────────────
function CourseYearTab({ rows, academicYear }: { rows: StudentFeeRow[]; academicYear: string }) {
  const breakdown = useMemo(() => buildBreakdown(rows), [rows]);
  const grandAllotted  = rows.reduce((s, r) => s + (r.allotted ?? 0), 0);
  const grandCollected = rows.reduce((s, r) => s + r.paid, 0);
  const grandBalance   = grandAllotted - grandCollected;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportBar
          onPdf={() => exportCourseYearPdf(rows, academicYear)}
          onExcel={() => exportCourseYearExcel(rows, academicYear)}
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-700 text-white">
            <tr>
              {['Course', 'Year', 'Students', 'Paid', 'Not Paid', 'Allotted', 'Collected', 'Balance'].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {breakdown.map((b, i) => (
              <tr key={`${b.course}-${b.year}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-1.5 font-semibold">{b.course}</td>
                <td className="px-3 py-1.5">{b.year}</td>
                <td className="px-3 py-1.5 text-center">{b.total}</td>
                <td className="px-3 py-1.5 text-center text-green-700">{b.paid}</td>
                <td className="px-3 py-1.5 text-center text-red-600">{b.total - b.paid}</td>
                <td className="px-3 py-1.5 text-right">{fmt(b.allotted)}</td>
                <td className="px-3 py-1.5 text-right text-green-700">{fmt(b.collected)}</td>
                <td className="px-3 py-1.5 text-right text-red-600">{fmt(b.allotted - b.collected)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-100 font-bold border-t border-gray-300">
            <tr>
              <td className="px-3 py-2" colSpan={2}>Total</td>
              <td className="px-3 py-2 text-center">{rows.length}</td>
              <td className="px-3 py-2 text-center text-green-700">{rows.filter((r) => r.paid > 0).length}</td>
              <td className="px-3 py-2 text-center text-red-600">{rows.filter((r) => r.paid === 0).length}</td>
              <td className="px-3 py-2 text-right">{fmt(grandAllotted)}</td>
              <td className="px-3 py-2 text-right text-green-700">{fmt(grandCollected)}</td>
              <td className="px-3 py-2 text-right text-red-600">{fmt(grandBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Consolidated ──────────────────────────────────────────────────────────
function ConsolidatedTab({ feeRecords, academicYear }: { feeRecords: FeeRecord[]; academicYear: string }) {
  const { smpTotals, smpGrandTotal, svkTotal, additionalTotal, grandTotal } = useMemo(() => {
    const totals = {} as Record<string, number>;
    for (const { key } of SMP_FEE_HEADS) totals[key] = 0;
    let svk = 0, add = 0;
    for (const r of feeRecords) {
      for (const { key } of SMP_FEE_HEADS) totals[key] += r.smp[key];
      svk += r.svk;
      add += r.additionalPaid.reduce((s, h) => s + h.amount, 0);
    }
    const smpTotal = SMP_FEE_HEADS.reduce((s, { key }) => s + totals[key], 0);
    return { smpTotals: totals, smpGrandTotal: smpTotal, svkTotal: svk, additionalTotal: add, grandTotal: smpTotal + svk + add };
  }, [feeRecords]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{feeRecords.length} payment record{feeRecords.length !== 1 ? 's' : ''}</p>
        <ExportBar
          onPdf={() => exportConsolidatedPdf(feeRecords, academicYear)}
          onExcel={() => exportConsolidatedExcel(feeRecords, academicYear)}
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-w-sm">
        <table className="w-full text-xs">
          <thead className="bg-blue-700 text-white">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Fee Head</th>
              <th className="px-4 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {SMP_FEE_HEADS.map(({ label, key }, i) => (
              <tr key={key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-1.5">{label}</td>
                <td className="px-4 py-1.5 text-right">{fmt(smpTotals[key])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-300">
            <tr className="bg-blue-50 font-semibold">
              <td className="px-4 py-2">SMP Total</td>
              <td className="px-4 py-2 text-right">{fmt(smpGrandTotal)}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-4 py-1.5">SVK</td>
              <td className="px-4 py-1.5 text-right">{fmt(svkTotal)}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-4 py-1.5">Additional</td>
              <td className="px-4 py-1.5 text-right">{fmt(additionalTotal)}</td>
            </tr>
            <tr className="bg-blue-700 text-white font-bold">
              <td className="px-4 py-2">Grand Total</td>
              <td className="px-4 py-2 text-right">{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function FeeReportsPage() {
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const [courseFilter,    setCourseFilter]    = useState<Course | ''>('');
  const [yearFilter,      setYearFilter]      = useState<Year | ''>('');
  const [admTypeFilter,   setAdmTypeFilter]   = useState<AdmType | ''>('');
  const [admCatFilter,    setAdmCatFilter]    = useState<AdmCat | ''>('');
  const [feeStatusFilter, setFeeStatusFilter] = useState<FeeStatus>('ALL');
  const [activeTab,       setActiveTab]       = useState<TabId>('statistics');

  const { students: allStudents, loading: studentsLoading } = useStudents(academicYear);
  const { records: feeRecords,  loading: feeLoading        } = useFeeRecords(academicYear);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!academicYear) { setFeeStructures([]); return; }
    getFeeStructuresByAcademicYear(academicYear).then(setFeeStructures).catch(() => {});
  }, [academicYear]);

  // ── Derived maps ─────────────────────────────────────────────────────────────
  const allottedByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of feeStructures) {
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + s.smp[key], 0);
      const svkTotal = s.svk + s.additionalHeads.reduce((t, h) => t + h.amount, 0);
      map.set(`${s.course}__${s.year}__${s.admType}__${s.admCat}`, smpTotal + svkTotal);
    }
    return map;
  }, [feeStructures]);

  const totalPaidByStudent = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of feeRecords) {
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
      const svkTotal = r.svk + r.additionalPaid.reduce((t, h) => t + h.amount, 0);
      totals.set(r.studentId, (totals.get(r.studentId) ?? 0) + smpTotal + svkTotal);
    }
    return totals;
  }, [feeRecords]);

  // ── All students as fee rows (unfiltered for stats) ───────────────────────
  const allStudentRows = useMemo((): StudentFeeRow[] =>
    allStudents.map((s) => {
      const allotted = allottedByKey.get(`${s.course}__${s.year}__${s.admType}__${s.admCat}`) ?? null;
      const paid     = totalPaidByStudent.get(s.id) ?? 0;
      const balance  = allotted !== null ? allotted - paid : null;
      return { student: s, allotted, paid, balance };
    }),
  [allStudents, allottedByKey, totalPaidByStudent]);

  // ── Stats (unfiltered counts for chips) ──────────────────────────────────
  const stats = useMemo(() => {
    const total       = allStudentRows.length;
    const paidCount   = allStudentRows.filter((r) => r.paid > 0).length;
    const notPaid     = total - paidCount;
    const duesCount   = allStudentRows.filter((r) => r.balance !== null && r.balance > 0).length;
    const noDuesCount = allStudentRows.filter((r) => r.balance !== null && r.balance <= 0).length;
    return { total, paidCount, notPaid, duesCount, noDuesCount };
  }, [allStudentRows]);

  // ── Filtered fee rows (for all tabs except Consolidated) ─────────────────
  const filteredRows = useMemo((): StudentFeeRow[] => {
    let rows = allStudentRows;
    if (courseFilter)  rows = rows.filter((r) => r.student.course  === courseFilter);
    if (yearFilter)    rows = rows.filter((r) => r.student.year    === yearFilter);
    if (admTypeFilter) rows = rows.filter((r) => r.student.admType === admTypeFilter);
    if (admCatFilter)  rows = rows.filter((r) => r.student.admCat  === admCatFilter);
    if (feeStatusFilter === 'PAID')     rows = rows.filter((r) => r.paid > 0);
    if (feeStatusFilter === 'NOT_PAID') rows = rows.filter((r) => r.paid === 0);
    if (feeStatusFilter === 'FEE_DUES') rows = rows.filter((r) => r.balance !== null && r.balance > 0);
    if (feeStatusFilter === 'NO_FEE_DUES') rows = rows.filter((r) => r.balance !== null && r.balance <= 0);
    return rows.slice().sort((a, b) => {
      const y = (YEAR_ORDER[a.student.year] ?? 9) - (YEAR_ORDER[b.student.year] ?? 9);
      if (y !== 0) return y;
      const c = a.student.course.localeCompare(b.student.course);
      if (c !== 0) return c;
      return a.student.studentNameSSLC.localeCompare(b.student.studentNameSSLC);
    });
  }, [allStudentRows, courseFilter, yearFilter, admTypeFilter, admCatFilter, feeStatusFilter]);

  // ── Filtered fee records (for Consolidated tab) ───────────────────────────
  const filteredFeeRecords = useMemo(() => {
    if (!courseFilter && !yearFilter && !admTypeFilter && !admCatFilter && feeStatusFilter === 'ALL') {
      return feeRecords;
    }
    const filteredStudentIds = new Set(filteredRows.map((r) => r.student.id));
    return feeRecords.filter((r) => filteredStudentIds.has(r.studentId));
  }, [feeRecords, filteredRows, courseFilter, yearFilter, admTypeFilter, admCatFilter, feeStatusFilter]);

  const hasActiveFilters =
    !!courseFilter || !!yearFilter || !!admTypeFilter || !!admCatFilter || feeStatusFilter !== 'ALL';

  function clearFilters() {
    setCourseFilter('');
    setYearFilter('');
    setAdmTypeFilter('');
    setAdmCatFilter('');
    setFeeStatusFilter('ALL');
  }

  const loading = settingsLoading || studentsLoading || feeLoading;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-900">
          Fee Reports {academicYear && <span className="text-gray-400 font-normal text-sm">— {academicYear}</span>}
        </h1>
      </div>

      {/* Stat chips */}
      {!loading && stats.total > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip label="Total"      count={stats.total}       active={feeStatusFilter === 'ALL'}      colorClass="border-gray-400 bg-gray-100 text-gray-700"   onClick={() => setFeeStatusFilter('ALL')} />
          <Chip label="Paid"       count={stats.paidCount}   active={feeStatusFilter === 'PAID'}     colorClass="border-green-400 bg-green-100 text-green-700" onClick={() => setFeeStatusFilter('PAID')} />
          <Chip label="Not Paid"   count={stats.notPaid}     active={feeStatusFilter === 'NOT_PAID'} colorClass="border-red-400 bg-red-100 text-red-700"       onClick={() => setFeeStatusFilter('NOT_PAID')} />
          <Chip label="Fee Dues"   count={stats.duesCount}   active={feeStatusFilter === 'FEE_DUES'} colorClass="border-amber-400 bg-amber-100 text-amber-700"  onClick={() => setFeeStatusFilter('FEE_DUES')} />
          <Chip label="No Fee Dues" count={stats.noDuesCount} active={feeStatusFilter === 'NO_FEE_DUES'} colorClass="border-emerald-400 bg-emerald-100 text-emerald-700" onClick={() => setFeeStatusFilter('NO_FEE_DUES')} />
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={courseFilter}    onChange={(e) => setCourseFilter(e.target.value as Course | '')}    className={fs}>
          <option value="">All Courses</option>
          {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={yearFilter}      onChange={(e) => setYearFilter(e.target.value as Year | '')}        className={fs}>
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={admTypeFilter}   onChange={(e) => setAdmTypeFilter(e.target.value as AdmType | '')} className={fs}>
          <option value="">All Adm Types</option>
          {ADM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={admCatFilter}    onChange={(e) => setAdmCatFilter(e.target.value as AdmCat | '')}   className={fs}>
          <option value="">All Adm Cats</option>
          {ADM_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={feeStatusFilter} onChange={(e) => setFeeStatusFilter(e.target.value as FeeStatus)}  className={fs}>
          <option value="ALL">All Fee Status</option>
          <option value="PAID">Paid</option>
          <option value="NOT_PAID">Not Paid</option>
          <option value="FEE_DUES">Fee Dues</option>
          <option value="NO_FEE_DUES">No Fee Dues</option>
        </select>
        <button
          onClick={clearFilters}
          className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
            hasActiveFilters
              ? 'border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100'
              : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
          }`}
        >
          Clear Filters
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : !academicYear ? (
        <p className="text-sm text-gray-400 py-8 text-center">No academic year configured.</p>
      ) : (
        <div>
          {activeTab === 'statistics'   && <StatisticsTab  rows={filteredRows} academicYear={academicYear} />}
          {activeTab === 'fee-list'     && <FeeListTab     rows={filteredRows} academicYear={academicYear} />}
          {activeTab === 'dues'         && <DuesTab        rows={filteredRows} academicYear={academicYear} />}
          {activeTab === 'course-year'  && <CourseYearTab  rows={filteredRows} academicYear={academicYear} />}
          {activeTab === 'consolidated' && <ConsolidatedTab feeRecords={filteredFeeRecords} academicYear={academicYear} />}
        </div>
      )}
    </div>
  );
}
