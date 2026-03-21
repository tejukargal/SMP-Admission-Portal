import { useState, useMemo, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useFeeOverrides } from '../hooks/useFeeOverrides';
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
  { id: 'statistics',   label: 'Statistics'        },
  { id: 'fee-list',     label: 'Fee List'           },
  { id: 'dues',         label: 'Dues Report'        },
  { id: 'course-year',  label: 'Course & Year Wise' },
  { id: 'consolidated', label: 'Consolidated'       },
];

function fmt(n: number): string {
  return `\u20B9${n.toLocaleString('en-IN')}`;
}

// ── Chip ──────────────────────────────────────────────────────────────────────
interface ChipProps { label: string; count: number; active: boolean; colorClass: string; onClick: () => void; }
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
      <Button variant="secondary" size="sm" onClick={onPdf}>PDF</Button>
      <Button variant="secondary" size="sm" onClick={onExcel}>Excel</Button>
    </div>
  );
}

// ── Shared: grouped 2-row header for fee detail tables ─────────────────────────
function FeeTableHead({ headerColor }: { headerColor: string }) {
  return (
    <thead className={`${headerColor} text-white text-[10px]`}>
      <tr>
        <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
        <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Name</th>
        <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Reg No</th>
        <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Course</th>
        <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Year</th>
        <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Allotted</th>
        <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Paid</th>
        <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Balance</th>
      </tr>
      <tr>
        {(['SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total'] as const).map((h, i) => (
          <th key={i} className={`px-2 py-1 text-right font-semibold ${i % 3 === 0 ? 'border-l border-white/30' : ''}`}>{h}</th>
        ))}
      </tr>
    </thead>
  );
}

// ── Shared: fee detail row cells ───────────────────────────────────────────────
function FeeDetailRow({ r, i, stripe }: { r: StudentFeeRow; i: number; stripe: boolean }) {
  return (
    <tr className={stripe ? 'bg-gray-50' : 'bg-white'}>
      <td className="px-2 py-1.5 text-center text-gray-400 text-[10px]">{i + 1}</td>
      <td className="px-2 py-1.5 font-medium text-[10px] max-w-[140px] truncate">{r.student.studentNameSSLC}</td>
      <td className="px-2 py-1.5 text-gray-500 text-[10px]">{r.student.regNumber || '—'}</td>
      <td className="px-2 py-1.5 text-center font-semibold text-[10px]">{r.student.course}</td>
      <td className="px-2 py-1.5 text-[10px]">{r.student.year}</td>
      {/* Allotted */}
      <td className="px-2 py-1.5 text-right text-[10px] border-l border-gray-100">{r.smpAllotted !== null ? fmt(r.smpAllotted) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-[10px]">{r.svkAllotted !== null ? fmt(r.svkAllotted) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-[10px] font-semibold">{r.allotted !== null ? fmt(r.allotted) : '—'}</td>
      {/* Paid */}
      <td className="px-2 py-1.5 text-right text-[10px] text-green-700 border-l border-gray-100">{r.smpPaid > 0 ? fmt(r.smpPaid) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-[10px] text-green-700">{r.svkPaid > 0 ? fmt(r.svkPaid) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-[10px] text-green-700 font-semibold">{r.paid > 0 ? fmt(r.paid) : '—'}</td>
      {/* Balance */}
      <td className={`px-2 py-1.5 text-right text-[10px] border-l border-gray-100 ${r.smpBalance !== null && r.smpBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.smpBalance !== null ? fmt(r.smpBalance) : '—'}</td>
      <td className={`px-2 py-1.5 text-right text-[10px] ${r.svkBalance !== null && r.svkBalance > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.svkBalance !== null ? fmt(r.svkBalance) : '—'}</td>
      <td className={`px-2 py-1.5 text-right text-[10px] font-semibold ${r.balance !== null && r.balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.balance !== null ? fmt(r.balance) : '—'}</td>
    </tr>
  );
}

// ── Shared: course/year breakdown data ────────────────────────────────────────
interface BreakdownEntry {
  course: string; year: string; total: number; paid: number;
  smpAllt: number; svkAllt: number; smpColl: number; svkColl: number;
}

function buildBreakdown(rows: StudentFeeRow[]): BreakdownEntry[] {
  const map = new Map<string, BreakdownEntry>();
  for (const r of rows) {
    const key = `${r.student.course}__${r.student.year}`;
    if (!map.has(key)) {
      map.set(key, { course: r.student.course, year: r.student.year, total: 0, paid: 0, smpAllt: 0, svkAllt: 0, smpColl: 0, svkColl: 0 });
    }
    const e = map.get(key)!;
    e.total++;
    if (r.paid > 0) e.paid++;
    e.smpAllt += r.smpAllotted ?? 0;
    e.svkAllt += r.svkAllotted ?? 0;
    e.smpColl += r.smpPaid;
    e.svkColl += r.svkPaid;
  }
  return Array.from(map.values()).sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    return c !== 0 ? c : a.year.localeCompare(b.year);
  });
}

// ── Shared: group summary table ───────────────────────────────────────────────
function GroupTable({ breakdown, totals, colSpanLabel = 2 }: {
  breakdown: BreakdownEntry[];
  totals: { students: number; paid: number; smpAllt: number; svkAllt: number; smpColl: number; svkColl: number };
  colSpanLabel?: number;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
      <table className="w-full text-[10px]">
        <thead className="bg-blue-700 text-white">
          <tr>
            <th className="px-2 py-1.5 text-center font-semibold" colSpan={colSpanLabel === 1 ? 1 : 2}>Course / Year</th>
            <th className="px-2 py-1.5 text-center font-semibold">Students</th>
            <th className="px-2 py-1.5 text-center font-semibold">Paid</th>
            <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Allotted</th>
            <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Collected</th>
            <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Balance</th>
          </tr>
          <tr>
            <th className="px-2 py-1 font-semibold" colSpan={colSpanLabel === 1 ? 1 : 2}></th>
            <th className="px-2 py-1 font-semibold"></th>
            <th className="px-2 py-1 font-semibold"></th>
            {(['SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total'] as const).map((h, i) => (
              <th key={i} className={`px-2 py-1 text-right font-semibold ${i % 3 === 0 ? 'border-l border-white/30' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {breakdown.map((b, i) => {
            const bAllt = b.smpAllt + b.svkAllt;
            const bColl = b.smpColl + b.svkColl;
            return (
              <tr key={`${b.course}-${b.year}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-2 py-1.5 font-semibold">{b.course}</td>
                <td className="px-2 py-1.5">{b.year}</td>
                <td className="px-2 py-1.5 text-center">{b.total}</td>
                <td className="px-2 py-1.5 text-center text-green-700">{b.paid}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100">{fmt(b.smpAllt)}</td>
                <td className="px-2 py-1.5 text-right">{fmt(b.svkAllt)}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{fmt(bAllt)}</td>
                <td className="px-2 py-1.5 text-right text-green-700 border-l border-gray-100">{fmt(b.smpColl)}</td>
                <td className="px-2 py-1.5 text-right text-green-700">{fmt(b.svkColl)}</td>
                <td className="px-2 py-1.5 text-right text-green-700 font-semibold">{fmt(bColl)}</td>
                <td className="px-2 py-1.5 text-right text-red-600 border-l border-gray-100">{fmt(b.smpAllt - b.smpColl)}</td>
                <td className="px-2 py-1.5 text-right text-red-600">{fmt(b.svkAllt - b.svkColl)}</td>
                <td className="px-2 py-1.5 text-right text-red-600 font-semibold">{fmt(bAllt - bColl)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-100 font-bold border-t border-gray-300 text-[10px]">
          <tr>
            <td className="px-2 py-2" colSpan={colSpanLabel === 1 ? 1 : 2}>Total</td>
            <td className="px-2 py-2 text-center">{totals.students}</td>
            <td className="px-2 py-2 text-center text-green-700">{totals.paid}</td>
            <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(totals.smpAllt)}</td>
            <td className="px-2 py-2 text-right">{fmt(totals.svkAllt)}</td>
            <td className="px-2 py-2 text-right">{fmt(totals.smpAllt + totals.svkAllt)}</td>
            <td className="px-2 py-2 text-right text-green-700 border-l border-gray-200">{fmt(totals.smpColl)}</td>
            <td className="px-2 py-2 text-right text-green-700">{fmt(totals.svkColl)}</td>
            <td className="px-2 py-2 text-right text-green-700">{fmt(totals.smpColl + totals.svkColl)}</td>
            <td className="px-2 py-2 text-right text-red-600 border-l border-gray-200">{fmt(totals.smpAllt - totals.smpColl)}</td>
            <td className="px-2 py-2 text-right text-red-600">{fmt(totals.svkAllt - totals.svkColl)}</td>
            <td className="px-2 py-2 text-right text-red-600">{fmt((totals.smpAllt + totals.svkAllt) - (totals.smpColl + totals.svkColl))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Tab: Statistics ──────────────────────────────────────────────────────────────
function StatisticsTab({ rows, academicYear }: { rows: StudentFeeRow[]; academicYear: string }) {
  const total       = rows.length;
  const paidCount   = rows.filter((r) => r.paid > 0).length;
  const notPaid     = total - paidCount;
  const duesCount   = rows.filter((r) => r.balance !== null && r.balance > 0).length;
  const noDuesCount = rows.filter((r) => r.balance !== null && r.balance <= 0).length;
  const totSmpAllt  = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const totSvkAllt  = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const totSmpPaid  = rows.reduce((s, r) => s + r.smpPaid, 0);
  const totSvkPaid  = rows.reduce((s, r) => s + r.svkPaid, 0);
  const breakdown   = useMemo(() => buildBreakdown(rows), [rows]);

  return (
    <div className="space-y-5">
      {/* Count cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',      value: total,       color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
          { label: 'Paid',       value: paidCount,   color: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-200'  },
          { label: 'Not Paid',   value: notPaid,     color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'    },
          { label: 'Fee Dues',   value: duesCount,   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
          { label: 'No Dues',    value: noDuesCount, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
        ].map((c) => (
          <div key={c.label} className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* SMP / SVK / Total amount table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-700 text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Metric</th>
              <th className="px-3 py-2 text-right font-semibold">SMP</th>
              <th className="px-3 py-2 text-right font-semibold">SVK</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Allotted',  smp: totSmpAllt,                   svk: totSvkAllt },
              { label: 'Collected', smp: totSmpPaid,                   svk: totSvkPaid },
              { label: 'Balance',   smp: totSmpAllt - totSmpPaid,      svk: totSvkAllt - totSvkPaid },
            ].map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 font-semibold">{row.label}</td>
                <td className="px-3 py-2 text-right">{fmt(row.smp)}</td>
                <td className="px-3 py-2 text-right">{fmt(row.svk)}</td>
                <td className="px-3 py-2 text-right font-bold">{fmt(row.smp + row.svk)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Course / Year breakdown */}
      <GroupTable
        breakdown={breakdown}
        totals={{ students: total, paid: paidCount, smpAllt: totSmpAllt, svkAllt: totSvkAllt, smpColl: totSmpPaid, svkColl: totSvkPaid }}
      />

      <div className="flex justify-end">
        <ExportBar
          onPdf={() => exportStatsPdf(rows, academicYear)}
          onExcel={() => exportStatsExcel(rows, academicYear)}
        />
      </div>
    </div>
  );
}

// ── Tab: Fee List ─────────────────────────────────────────────────────────────
function FeeListTab({ rows, academicYear }: { rows: StudentFeeRow[]; academicYear: string }) {
  const totals = useMemo(() => ({
    smpAllt: rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
    svkAllt: rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
    smpPaid: rows.reduce((s, r) => s + r.smpPaid, 0),
    svkPaid: rows.reduce((s, r) => s + r.svkPaid, 0),
  }), [rows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{rows.length} student{rows.length !== 1 ? 's' : ''}</p>
        <ExportBar onPdf={() => exportFeeListPdf(rows, academicYear)} onExcel={() => exportFeeListExcel(rows, academicYear)} />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full">
          <FeeTableHead headerColor="bg-blue-700" />
          <tbody>
            {rows.map((r, i) => <FeeDetailRow key={r.student.id} r={r} i={i} stripe={i % 2 !== 0} />)}
            {rows.length === 0 && (
              <tr><td colSpan={14} className="px-3 py-6 text-center text-xs text-gray-400">No students match the current filters.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-[10px]">
              <tr>
                <td className="px-2 py-2 text-center text-gray-400">—</td>
                <td className="px-2 py-2" colSpan={4}>Total — {rows.length} student{rows.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(totals.smpAllt)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.svkAllt)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.smpAllt + totals.svkAllt)}</td>
                <td className="px-2 py-2 text-right text-green-700 border-l border-gray-200">{fmt(totals.smpPaid)}</td>
                <td className="px-2 py-2 text-right text-green-700">{fmt(totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-green-700">{fmt(totals.smpPaid + totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600 border-l border-gray-200">{fmt(totals.smpAllt - totals.smpPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600">{fmt(totals.svkAllt - totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600">{fmt((totals.smpAllt + totals.svkAllt) - (totals.smpPaid + totals.svkPaid))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Dues Report ──────────────────────────────────────────────────────────
function DuesTab({ rows, academicYear }: { rows: StudentFeeRow[]; academicYear: string }) {
  const dueRows = useMemo(() => rows.filter((r) => r.balance !== null && r.balance > 0), [rows]);
  const totals = useMemo(() => ({
    smpAllt: dueRows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
    svkAllt: dueRows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
    smpPaid: dueRows.reduce((s, r) => s + r.smpPaid, 0),
    svkPaid: dueRows.reduce((s, r) => s + r.svkPaid, 0),
  }), [dueRows]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{dueRows.length} student{dueRows.length !== 1 ? 's' : ''} with outstanding balance</p>
        <ExportBar onPdf={() => exportDuesPdf(rows, academicYear)} onExcel={() => exportDuesExcel(rows, academicYear)} />
      </div>
      <div className="bg-white rounded-lg border border-red-200 overflow-auto">
        <table className="w-full">
          <FeeTableHead headerColor="bg-red-600" />
          <tbody>
            {dueRows.map((r, i) => <FeeDetailRow key={r.student.id} r={r} i={i} stripe={i % 2 !== 0} />)}
            {dueRows.length === 0 && (
              <tr><td colSpan={14} className="px-3 py-6 text-center text-xs text-gray-400">No students with outstanding balance.</td></tr>
            )}
          </tbody>
          {dueRows.length > 0 && (
            <tfoot className="bg-red-50 font-bold border-t-2 border-red-200 text-[10px]">
              <tr>
                <td className="px-2 py-2 text-center text-gray-400">—</td>
                <td className="px-2 py-2" colSpan={4}>Total — {dueRows.length} student{dueRows.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-right border-l border-red-200">{fmt(totals.smpAllt)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.svkAllt)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.smpAllt + totals.svkAllt)}</td>
                <td className="px-2 py-2 text-right text-green-700 border-l border-red-200">{fmt(totals.smpPaid)}</td>
                <td className="px-2 py-2 text-right text-green-700">{fmt(totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-green-700">{fmt(totals.smpPaid + totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600 border-l border-red-200">{fmt(totals.smpAllt - totals.smpPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600">{fmt(totals.svkAllt - totals.svkPaid)}</td>
                <td className="px-2 py-2 text-right text-red-600">{fmt((totals.smpAllt + totals.svkAllt) - (totals.smpPaid + totals.svkPaid))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Course & Year Wise ───────────────────────────────────────────────────
function CourseYearTab({ rows, academicYear }: { rows: StudentFeeRow[]; academicYear: string }) {
  const breakdown = useMemo(() => buildBreakdown(rows), [rows]);
  const totals = useMemo(() => ({
    students: rows.length,
    paid:     rows.filter((r) => r.paid > 0).length,
    smpAllt:  rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
    svkAllt:  rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
    smpColl:  rows.reduce((s, r) => s + r.smpPaid, 0),
    svkColl:  rows.reduce((s, r) => s + r.svkPaid, 0),
  }), [rows]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportBar onPdf={() => exportCourseYearPdf(rows, academicYear)} onExcel={() => exportCourseYearExcel(rows, academicYear)} />
      </div>
      <GroupTable breakdown={breakdown} totals={totals} />
    </div>
  );
}

// ── Tab: Consolidated ──────────────────────────────────────────────────────────
function ConsolidatedTab({ feeRecords, academicYear }: { feeRecords: FeeRecord[]; academicYear: string }) {
  const { smpTotals, smpGrandTotal, svkTotal, additionalTotal } = useMemo(() => {
    const totals = {} as Record<string, number>;
    for (const { key } of SMP_FEE_HEADS) totals[key] = 0;
    let svk = 0, add = 0;
    for (const r of feeRecords) {
      for (const { key } of SMP_FEE_HEADS) totals[key] += r.smp[key];
      svk += r.svk;
      add += r.additionalPaid.reduce((s, h) => s + h.amount, 0);
    }
    const smpTotal = SMP_FEE_HEADS.reduce((s, { key }) => s + totals[key], 0);
    return { smpTotals: totals, smpGrandTotal: smpTotal, svkTotal: svk, additionalTotal: add };
  }, [feeRecords]);

  const svkFullTotal = svkTotal + additionalTotal;
  const grandTotal   = smpGrandTotal + svkFullTotal;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{feeRecords.length} payment record{feeRecords.length !== 1 ? 's' : ''}</p>
        <ExportBar onPdf={() => exportConsolidatedPdf(feeRecords, academicYear)} onExcel={() => exportConsolidatedExcel(feeRecords, academicYear)} />
      </div>

      {/* SMP vs SVK summary */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-w-xs">
        <table className="w-full text-xs">
          <thead className="bg-blue-700 text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Category</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-blue-50">
              <td className="px-3 py-1.5 font-semibold">SMP Total</td>
              <td className="px-3 py-1.5 text-right font-semibold">{fmt(smpGrandTotal)}</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 pl-5 text-gray-500">SVK (Base)</td>
              <td className="px-3 py-1.5 text-right">{fmt(svkTotal)}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-3 py-1.5 pl-5 text-gray-500">SVK (Add-ons)</td>
              <td className="px-3 py-1.5 text-right">{fmt(additionalTotal)}</td>
            </tr>
            <tr className="bg-blue-50">
              <td className="px-3 py-1.5 font-semibold">SVK Total</td>
              <td className="px-3 py-1.5 text-right font-semibold">{fmt(svkFullTotal)}</td>
            </tr>
          </tbody>
          <tfoot className="border-t border-gray-300">
            <tr className="bg-blue-700 text-white font-bold">
              <td className="px-3 py-2">Grand Total</td>
              <td className="px-3 py-2 text-right">{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* SMP head-wise breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-w-xs">
        <table className="w-full text-xs">
          <thead className="bg-gray-600 text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">SMP Fee Head</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {SMP_FEE_HEADS.map(({ label, key }, i) => (
              <tr key={key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-1.5">{label}</td>
                <td className="px-3 py-1.5 text-right">{fmt(smpTotals[key])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-300">
            <tr className="bg-blue-50 font-bold">
              <td className="px-3 py-2">SMP Total</td>
              <td className="px-3 py-2 text-right">{fmt(smpGrandTotal)}</td>
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
  const { records: feeRecords,   loading: feeLoading       } = useFeeRecords(academicYear);
  const { overrides: feeOverrides, loading: overridesLoading } = useFeeOverrides(academicYear);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);

  useEffect(() => {
    if (!academicYear) { setFeeStructures([]); return; }
    getFeeStructuresByAcademicYear(academicYear).then(setFeeStructures).catch(() => {});
  }, [academicYear]);

  // Map: studentId → override (for O(1) lookup per student)
  const overrideByStudent = useMemo(
    () => new Map(feeOverrides.map((o) => [o.studentId, o])),
    [feeOverrides],
  );

  // ── Allotted maps (split SMP / SVK) ──────────────────────────────────────
  // smpAllottedNoFineByKey: SMP total excluding fine (fine is dynamic per student)
  // structureFineByKey: the static fine from the fee structure
  const { smpAllottedNoFineByKey, structureFineByKey, svkAllottedByKey } = useMemo(() => {
    const smpNoFineMap = new Map<string, number>();
    const fineMap      = new Map<string, number>();
    const svkMap       = new Map<string, number>();
    for (const s of feeStructures) {
      const key = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      smpNoFineMap.set(key, SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : s.smp[k]), 0));
      fineMap.set(key, s.smp.fine);
      svkMap.set(key, s.svk + s.additionalHeads.reduce((t, h) => t + h.amount, 0));
    }
    return { smpAllottedNoFineByKey: smpNoFineMap, structureFineByKey: fineMap, svkAllottedByKey: svkMap };
  }, [feeStructures]);

  // ── Paid maps (split SMP / SVK) + fine paid per student ──────────────────
  const { smpPaidByStudent, svkPaidByStudent, finePaidByStudent } = useMemo(() => {
    const smpMap  = new Map<string, number>();
    const svkMap  = new Map<string, number>();
    const fineMap = new Map<string, number>();
    for (const r of feeRecords) {
      const smpTotal = SMP_FEE_HEADS.reduce((t, { key }) => t + r.smp[key], 0);
      const svkTotal = r.svk + r.additionalPaid.reduce((t, h) => t + h.amount, 0);
      smpMap.set(r.studentId,  (smpMap.get(r.studentId)  ?? 0) + smpTotal);
      svkMap.set(r.studentId,  (svkMap.get(r.studentId)  ?? 0) + svkTotal);
      fineMap.set(r.studentId, (fineMap.get(r.studentId) ?? 0) + r.smp.fine);
    }
    return { smpPaidByStudent: smpMap, svkPaidByStudent: svkMap, finePaidByStudent: fineMap };
  }, [feeRecords]);

  // ── All students as fee rows ──────────────────────────────────────────────
  // Override takes precedence over structure per student.
  // Fine allotted: max(base fine, total fine paid) so fine payments never produce negative balance.
  const allStudentRows = useMemo((): StudentFeeRow[] =>
    allStudents.map((s) => {
      const override = overrideByStudent.get(s.id);
      const key      = `${s.course}__${s.year}__${s.admType}__${s.admCat}`;
      const finePaid = finePaidByStudent.get(s.id) ?? 0;

      let smpAllotted: number | null;
      let svkAllotted: number | null;

      if (override) {
        // Per-student override: sum all SMP heads (fine uses effective logic)
        const baseFine  = override.smp.fine;
        const effFine   = Math.max(baseFine, finePaid);
        const smpNoFine = SMP_FEE_HEADS.reduce((t, { key: k }) => t + (k === 'fine' ? 0 : override.smp[k]), 0);
        smpAllotted = smpNoFine + effFine;
        svkAllotted = override.svk + override.additionalHeads.reduce((t, h) => t + h.amount, 0);
      } else {
        const smpNoFine  = smpAllottedNoFineByKey.has(key) ? smpAllottedNoFineByKey.get(key)! : null;
        const structFine = structureFineByKey.get(key) ?? 0;
        const effFine    = Math.max(structFine, finePaid);
        smpAllotted = smpNoFine !== null ? smpNoFine + effFine : null;
        svkAllotted = svkAllottedByKey.has(key) ? svkAllottedByKey.get(key)! : null;
      }

      const allotted   = smpAllotted !== null ? (smpAllotted + (svkAllotted ?? 0)) : null;
      const smpPaid    = smpPaidByStudent.get(s.id) ?? 0;
      const svkPaid    = svkPaidByStudent.get(s.id) ?? 0;
      const paid       = smpPaid + svkPaid;
      const smpBalance = smpAllotted !== null ? smpAllotted - smpPaid : null;
      const svkBalance = svkAllotted !== null ? svkAllotted - svkPaid : null;
      const balance    = allotted    !== null ? allotted    - paid    : null;
      return { student: s, smpAllotted, svkAllotted, allotted, smpPaid, svkPaid, paid, smpBalance, svkBalance, balance };
    }),
  [allStudents, overrideByStudent, smpAllottedNoFineByKey, structureFineByKey, svkAllottedByKey, smpPaidByStudent, svkPaidByStudent, finePaidByStudent]);

  // ── Stats for chips ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total       = allStudentRows.length;
    const paidCount   = allStudentRows.filter((r) => r.paid > 0).length;
    const duesCount   = allStudentRows.filter((r) => r.balance !== null && r.balance > 0).length;
    const noDuesCount = allStudentRows.filter((r) => r.balance !== null && r.balance <= 0).length;
    return { total, paidCount, notPaid: total - paidCount, duesCount, noDuesCount };
  }, [allStudentRows]);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo((): StudentFeeRow[] => {
    let rows = allStudentRows;
    if (courseFilter)  rows = rows.filter((r) => r.student.course  === courseFilter);
    if (yearFilter)    rows = rows.filter((r) => r.student.year    === yearFilter);
    if (admTypeFilter) rows = rows.filter((r) => r.student.admType === admTypeFilter);
    if (admCatFilter)  rows = rows.filter((r) => r.student.admCat  === admCatFilter);
    if (feeStatusFilter === 'PAID')        rows = rows.filter((r) => r.paid > 0);
    if (feeStatusFilter === 'NOT_PAID')    rows = rows.filter((r) => r.paid === 0);
    if (feeStatusFilter === 'FEE_DUES')    rows = rows.filter((r) => r.balance !== null && r.balance > 0);
    if (feeStatusFilter === 'NO_FEE_DUES') rows = rows.filter((r) => r.balance !== null && r.balance <= 0);
    return rows.slice().sort((a, b) => {
      const y = (YEAR_ORDER[a.student.year] ?? 9) - (YEAR_ORDER[b.student.year] ?? 9);
      if (y !== 0) return y;
      const c = a.student.course.localeCompare(b.student.course);
      if (c !== 0) return c;
      return a.student.studentNameSSLC.localeCompare(b.student.studentNameSSLC);
    });
  }, [allStudentRows, courseFilter, yearFilter, admTypeFilter, admCatFilter, feeStatusFilter]);

  // ── Filtered fee records (Consolidated tab) ───────────────────────────────
  const filteredFeeRecords = useMemo(() => {
    if (!courseFilter && !yearFilter && !admTypeFilter && !admCatFilter && feeStatusFilter === 'ALL')
      return feeRecords;
    const ids = new Set(filteredRows.map((r) => r.student.id));
    return feeRecords.filter((r) => ids.has(r.studentId));
  }, [feeRecords, filteredRows, courseFilter, yearFilter, admTypeFilter, admCatFilter, feeStatusFilter]);

  const hasActiveFilters =
    !!courseFilter || !!yearFilter || !!admTypeFilter || !!admCatFilter || feeStatusFilter !== 'ALL';

  function clearFilters() {
    setCourseFilter(''); setYearFilter(''); setAdmTypeFilter(''); setAdmCatFilter('');
    setFeeStatusFilter('ALL');
  }

  const loading = settingsLoading || studentsLoading || feeLoading || overridesLoading;

  return (
    <div className="p-4 space-y-4" style={{ animation: 'page-enter 0.22s ease-out' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-900">
          Fee Reports {academicYear && <span className="text-gray-400 font-normal text-sm">— {academicYear}</span>}
        </h1>
      </div>

      {/* Stat chips */}
      {!loading && stats.total > 0 && (
        <div className="flex flex-wrap gap-2">
          <Chip label="Total"       count={stats.total}       active={feeStatusFilter === 'ALL'}          colorClass="border-gray-400 bg-gray-100 text-gray-700"         onClick={() => setFeeStatusFilter('ALL')} />
          <Chip label="Paid"        count={stats.paidCount}   active={feeStatusFilter === 'PAID'}         colorClass="border-green-400 bg-green-100 text-green-700"       onClick={() => setFeeStatusFilter('PAID')} />
          <Chip label="Not Paid"    count={stats.notPaid}     active={feeStatusFilter === 'NOT_PAID'}     colorClass="border-red-400 bg-red-100 text-red-700"             onClick={() => setFeeStatusFilter('NOT_PAID')} />
          <Chip label="Fee Dues"    count={stats.duesCount}   active={feeStatusFilter === 'FEE_DUES'}     colorClass="border-amber-400 bg-amber-100 text-amber-700"        onClick={() => setFeeStatusFilter('FEE_DUES')} />
          <Chip label="No Fee Dues" count={stats.noDuesCount} active={feeStatusFilter === 'NO_FEE_DUES'}  colorClass="border-emerald-400 bg-emerald-100 text-emerald-700"  onClick={() => setFeeStatusFilter('NO_FEE_DUES')} />
        </div>
      )}

      {/* Filters */}
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
        <nav className="flex -mb-px">
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
          {activeTab === 'statistics'   && <StatisticsTab  rows={filteredRows}            academicYear={academicYear} />}
          {activeTab === 'fee-list'     && <FeeListTab     rows={filteredRows}            academicYear={academicYear} />}
          {activeTab === 'dues'         && <DuesTab        rows={filteredRows}            academicYear={academicYear} />}
          {activeTab === 'course-year'  && <CourseYearTab  rows={filteredRows}            academicYear={academicYear} />}
          {activeTab === 'consolidated' && <ConsolidatedTab feeRecords={filteredFeeRecords} academicYear={academicYear} />}
        </div>
      )}
    </div>
  );
}
