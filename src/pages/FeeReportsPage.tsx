import { useState, useMemo, useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useStudents } from '../hooks/useStudents';
import { useFeeRecords } from '../hooks/useFeeRecords';
import { useFeeOverrides } from '../hooks/useFeeOverrides';
import { getFeeStructuresByAcademicYear } from '../services/feeStructureService';
import { Button } from '../components/common/Button';
import * as XLSX from 'xlsx';
import {
  exportStatsPdf, exportFeeListPdf, exportDuesPdf,
  exportCourseYearPdf, exportConsolidatedPdf,
  buildDatewiseHeadwise, exportDatewiseHeadwisePdf,
} from '../utils/feeReportPdf';
import type { StudentFeeRow, DatewiseHeadwiseEntry } from '../utils/feeReportPdf';
import {
  exportStatsExcel, exportFeeListExcel, exportDuesExcel,
  exportCourseYearExcel, exportConsolidatedExcel,
  exportDatewiseHeadwiseExcel,
} from '../utils/feeReportExcel';
import type { Course, Year, AdmType, AdmCat, AcademicYear, FeeStructure, FeeRecord, Student, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';

type TabId = 'statistics' | 'fee-list' | 'dues' | 'course-year' | 'consolidated' | 'daily-collections' | 'day-summary' | 'datewise-headwise' | 'bank-remittance' | 'fee-distribution';
type FeeStatus = 'ALL' | 'PAID' | 'NOT_PAID' | 'FEE_DUES' | 'NO_FEE_DUES';

const COURSES: Course[]         = ['CE', 'ME', 'EC', 'CS', 'EE'];
const AIDED_COURSES: Course[]   = ['CE', 'ME', 'EC', 'CS'];
const UNAIDED_COURSES: Course[] = ['EE'];
const YEARS:   Year[]   = ['1ST YEAR', '2ND YEAR', '3RD YEAR'];
const YEAR_ORDER: Record<string, number> = { '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };
const ADM_TYPES: AdmType[] = ['REGULAR', 'REPEATER', 'LATERAL', 'EXTERNAL', 'SNQ'];
const ADM_CATS:  AdmCat[]  = ['GM', 'SNQ', 'OTHERS'];

const fs =
  'rounded border border-gray-300 px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer';

const TABS: { id: TabId; label: string }[] = [
  { id: 'statistics',         label: 'Statistics'          },
  { id: 'fee-list',           label: 'Fee List'             },
  { id: 'dues',               label: 'Dues Report'          },
  { id: 'course-year',        label: 'Course & Year Wise'   },
  { id: 'daily-collections',  label: 'Daily Collections'    },
  { id: 'day-summary',        label: 'Day Summary'          },
  { id: 'datewise-headwise',  label: 'Datewise Headwise'    },
  { id: 'bank-remittance',    label: 'Bank Remittance'       },
  { id: 'fee-distribution',   label: 'Fee Distribution'     },
  { id: 'consolidated',       label: 'Consolidated'         },
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
function StatisticsTab({ rows, academicYear, fp }: { rows: StudentFeeRow[]; academicYear: string; fp: CommonFilterProps }) {
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
      <CommonFilters fp={fp} />
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
function FeeListTab({ rows, academicYear, fp }: { rows: StudentFeeRow[]; academicYear: string; fp: CommonFilterProps }) {
  const totals = useMemo(() => ({
    smpAllt: rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
    svkAllt: rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
    smpPaid: rows.reduce((s, r) => s + r.smpPaid, 0),
    svkPaid: rows.reduce((s, r) => s + r.svkPaid, 0),
  }), [rows]);

  return (
    <div className="space-y-3">
      <CommonFilters fp={fp} />
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
function DuesTab({ rows, academicYear, fp }: { rows: StudentFeeRow[]; academicYear: string; fp: CommonFilterProps }) {
  const dueRows = useMemo(() => rows.filter((r) => r.balance !== null && r.balance > 0), [rows]);
  const totals = useMemo(() => ({
    smpAllt: dueRows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
    svkAllt: dueRows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
    smpPaid: dueRows.reduce((s, r) => s + r.smpPaid, 0),
    svkPaid: dueRows.reduce((s, r) => s + r.svkPaid, 0),
  }), [dueRows]);

  return (
    <div className="space-y-3">
      <CommonFilters fp={fp} />
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
function CourseYearTab({ rows, academicYear, fp }: { rows: StudentFeeRow[]; academicYear: string; fp: CommonFilterProps }) {
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
      <CommonFilters fp={fp} />
      <div className="flex justify-end">
        <ExportBar onPdf={() => exportCourseYearPdf(rows, academicYear)} onExcel={() => exportCourseYearExcel(rows, academicYear)} />
      </div>
      <GroupTable breakdown={breakdown} totals={totals} />
    </div>
  );
}

// ── Tab: Consolidated ──────────────────────────────────────────────────────────
function ConsolidatedTab({ feeRecords, academicYear, fp }: { feeRecords: FeeRecord[]; academicYear: string; fp: CommonFilterProps }) {
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
      <CommonFilters fp={fp} />
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

// ── Tab: Daily Collections ────────────────────────────────────────────────────
interface DayEntry {
  dateKey: string;
  dateLabel: string;
  receiptCount: number;
  studentCount: number;
  smpCash: number; svkCash: number; addCash: number; cashTotal: number;
  smpUpi: number;  svkUpi: number;  addUpi: number;  upiTotal: number;
  dayTotal: number;
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

function buildDailyCollections(records: FeeRecord[]): DayEntry[] {
  const map = new Map<string, DayEntry>();
  const studentSets = new Map<string, Set<string>>();
  for (const r of records) {
    const dateKey = r.date.slice(0, 10);
    if (!map.has(dateKey)) {
      map.set(dateKey, {
        dateKey,
        dateLabel: formatDayLabel(dateKey),
        receiptCount: 0,
        studentCount: 0,
        smpCash: 0, svkCash: 0, addCash: 0, cashTotal: 0,
        smpUpi: 0,  svkUpi: 0,  addUpi: 0,  upiTotal: 0,
        dayTotal: 0,
      });
      studentSets.set(dateKey, new Set());
    }
    const e = map.get(dateKey)!;
    e.receiptCount++;
    studentSets.get(dateKey)!.add(r.studentId);

    const smpAmt = SMP_FEE_HEADS.reduce((s, { key }) => s + r.smp[key], 0);
    const svkAmt = r.svk;
    const addAmt = r.additionalPaid.reduce((s, h) => s + h.amount, 0);

    const smpMode = r.smpPaymentMode ?? r.paymentMode;
    const svkMode = r.svkPaymentMode ?? r.paymentMode;
    const addMode = r.additionalPaymentMode ?? r.paymentMode;

    if (smpMode === 'CASH')  { e.smpCash += smpAmt; }
    else if (smpMode === 'SPLIT') { e.smpCash += r.smpSplit?.cash ?? 0; e.smpUpi += r.smpSplit?.upi ?? 0; }
    else                     { e.smpUpi  += smpAmt; }

    if (svkMode === 'CASH')  { e.svkCash += svkAmt; }
    else if (svkMode === 'SPLIT') { e.svkCash += r.svkSplit?.cash ?? 0; e.svkUpi += r.svkSplit?.upi ?? 0; }
    else                     { e.svkUpi  += svkAmt; }

    if (addMode === 'CASH')  { e.addCash += addAmt; }
    else if (addMode === 'SPLIT') { e.addCash += r.additionalSplit?.cash ?? 0; e.addUpi += r.additionalSplit?.upi ?? 0; }
    else                     { e.addUpi  += addAmt; }

    e.cashTotal = e.smpCash + e.svkCash + e.addCash;
    e.upiTotal  = e.smpUpi  + e.svkUpi  + e.addUpi;
    e.dayTotal  = e.cashTotal + e.upiTotal;
  }
  for (const [dateKey, e] of map) {
    e.studentCount = studentSets.get(dateKey)!.size;
  }
  return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function exportDailyCollectionsExcel(entries: DayEntry[], academicYear: string): void {
  const header = [
    'Date', 'Receipts', 'Students',
    'SMP (Cash)', 'SVK (Cash)', 'Additional (Cash)', 'Total Cash',
    'SMP (UPI)',  'SVK (UPI)',  'Additional (UPI)',  'Total UPI',
    'Day Total',
  ];
  const dataRows = entries.map((e) => [
    e.dateLabel, e.receiptCount, e.studentCount,
    e.smpCash || null, e.svkCash || null, e.addCash || null, e.cashTotal || null,
    e.smpUpi  || null, e.svkUpi  || null, e.addUpi  || null, e.upiTotal  || null,
    e.dayTotal,
  ]);
  const tot = entries.reduce(
    (a, e) => ({
      receiptCount: a.receiptCount + e.receiptCount,
      smpCash: a.smpCash + e.smpCash, svkCash: a.svkCash + e.svkCash, addCash: a.addCash + e.addCash,
      cashTotal: a.cashTotal + e.cashTotal,
      smpUpi: a.smpUpi + e.smpUpi,   svkUpi: a.svkUpi + e.svkUpi,   addUpi: a.addUpi + e.addUpi,
      upiTotal: a.upiTotal + e.upiTotal,
      dayTotal: a.dayTotal + e.dayTotal,
    }),
    { receiptCount: 0, smpCash: 0, svkCash: 0, addCash: 0, cashTotal: 0, smpUpi: 0, svkUpi: 0, addUpi: 0, upiTotal: 0, dayTotal: 0 },
  );
  const totRow = [
    'TOTAL', tot.receiptCount, '',
    tot.smpCash || null, tot.svkCash || null, tot.addCash || null, tot.cashTotal,
    tot.smpUpi  || null, tot.svkUpi  || null, tot.addUpi  || null, tot.upiTotal,
    tot.dayTotal,
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Collections');
  XLSX.writeFile(wb, `Daily_Collections_${academicYear}.xlsx`);
}

// ── Day Breakdown Excel export ────────────────────────────────────────────────
function exportDayBreakdownExcel(day: DayEntry, cashRecs: FeeRecord[], upiRecs: FeeRecord[]): void {
  const header = ['Sl', 'Student Name', 'Reg No', 'Course', 'Year', 'SMP Rpt', 'SVK Rpt', 'Add Rpt', 'SMP', 'SVK', 'Additional', 'Total'];

  const makeRows = (recs: FeeRecord[], isCash: boolean) =>
    recs.map((r, i) => {
      const s      = getRecordSplit(r);
      const smpAmt = isCash ? s.smpCash : s.smpUpi;
      const svkAmt = isCash ? s.svkCash : s.svkUpi;
      const addAmt = isCash ? s.addCash : s.addUpi;
      return [i + 1, r.studentName, r.regNumber || '', r.course, r.year,
        r.receiptNumber || '', r.svkReceiptNumber || '', r.additionalReceiptNumber || '',
        smpAmt || null, svkAmt || null, addAmt || null, smpAmt + svkAmt + addAmt];
    });

  const makeTotRow = (recs: FeeRecord[], isCash: boolean) => {
    const t = recs.reduce((a, r) => {
      const s = getRecordSplit(r);
      return { smp: a.smp + (isCash ? s.smpCash : s.smpUpi), svk: a.svk + (isCash ? s.svkCash : s.svkUpi), add: a.add + (isCash ? s.addCash : s.addUpi) };
    }, { smp: 0, svk: 0, add: 0 });
    return ['TOTAL', '', '', '', '', '', '', '', t.smp || null, t.svk || null, t.add || null, t.smp + t.svk + t.add];
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...makeRows(cashRecs, true),  makeTotRow(cashRecs, true)]),  'Cash Payments');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...makeRows(upiRecs,  false), makeTotRow(upiRecs,  false)]), 'UPI Payments');
  XLSX.writeFile(wb, `Collections_${day.dateKey}_${day.dateLabel.replace(/ /g, '_')}.xlsx`);
}

// ── Day Breakdown Modal ────────────────────────────────────────────────────────
function getRecordSplit(r: FeeRecord) {
  const smpAmt = SMP_FEE_HEADS.reduce((s, { key }) => s + r.smp[key], 0);
  const svkAmt = r.svk;
  const addAmt = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
  const smpMode = r.smpPaymentMode ?? r.paymentMode;
  const svkMode = r.svkPaymentMode ?? r.paymentMode;
  const addMode = r.additionalPaymentMode ?? r.paymentMode;
  return {
    smpCash: smpMode === 'CASH' ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.cash ?? 0) : 0,
    smpUpi:  smpMode === 'UPI'  ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.upi  ?? 0) : 0,
    svkCash: svkMode === 'CASH' ? svkAmt : svkMode === 'SPLIT' ? (r.svkSplit?.cash ?? 0) : 0,
    svkUpi:  svkMode === 'UPI'  ? svkAmt : svkMode === 'SPLIT' ? (r.svkSplit?.upi  ?? 0) : 0,
    addCash: addMode === 'CASH' ? addAmt : addMode === 'SPLIT' ? (r.additionalSplit?.cash ?? 0) : 0,
    addUpi:  addMode === 'UPI'  ? addAmt : addMode === 'SPLIT' ? (r.additionalSplit?.upi  ?? 0) : 0,
  };
}

function DayBreakdownModal({ day, records, onClose }: { day: DayEntry; records: FeeRecord[]; onClose: () => void }) {
  const dayRecords = useMemo(
    () =>
      records
        .filter((r) => r.date.slice(0, 10) === day.dateKey)
        .sort((a, b) => (parseInt(a.receiptNumber, 10) || 0) - (parseInt(b.receiptNumber, 10) || 0)),
    [records, day.dateKey],
  );

  const cashRecords = useMemo(
    () => dayRecords.filter((r) => { const s = getRecordSplit(r); return (s.smpCash + s.svkCash + s.addCash) > 0; }),
    [dayRecords],
  );
  const upiRecords = useMemo(
    () => dayRecords.filter((r) => { const s = getRecordSplit(r); return (s.smpUpi + s.svkUpi + s.addUpi) > 0; }),
    [dayRecords],
  );

  const cashTot = useMemo(() => cashRecords.reduce(
    (a, r) => { const s = getRecordSplit(r); return { smp: a.smp + s.smpCash, svk: a.svk + s.svkCash, add: a.add + s.addCash }; },
    { smp: 0, svk: 0, add: 0 },
  ), [cashRecords]);

  const upiTot = useMemo(() => upiRecords.reduce(
    (a, r) => { const s = getRecordSplit(r); return { smp: a.smp + s.smpUpi, svk: a.svk + s.svkUpi, add: a.add + s.addUpi }; },
    { smp: 0, svk: 0, add: 0 },
  ), [upiRecords]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function PaymentSection({
    sectionRecords,
    mode,
    totals,
  }: {
    sectionRecords: FeeRecord[];
    mode: 'CASH' | 'UPI';
    totals: { smp: number; svk: number; add: number };
  }) {
    const isCash  = mode === 'CASH';
    const hdrCls  = isCash ? 'bg-emerald-700' : 'bg-blue-700';
    const totBg   = isCash ? 'bg-emerald-50'  : 'bg-blue-50';
    const totClr  = isCash ? 'text-green-700' : 'text-blue-700';
    const grand   = totals.smp + totals.svk + totals.add;
    const cell    = 'px-2 py-1.5 text-right text-[10px]';
    const hCell   = 'px-2 py-1.5 text-right font-semibold';

    if (sectionRecords.length === 0) {
      return (
        <div className={`rounded border px-4 py-3 text-xs text-gray-400 ${isCash ? 'border-emerald-200 bg-emerald-50/30' : 'border-blue-200 bg-blue-50/30'}`}>
          No {mode} payments on this day.
        </div>
      );
    }

    return (
      <div className="overflow-auto max-h-[186px] rounded-lg border border-gray-200">
        <table className="w-full text-[10px]">
          <thead className={`sticky top-0 z-10 ${hdrCls} text-white`}>
            <tr>
              <th className="px-2 py-1.5 text-center font-semibold">Sl</th>
              <th className="px-2 py-1.5 text-left font-semibold min-w-[130px]">Student Name</th>
              <th className="px-2 py-1.5 text-left font-semibold">Reg No</th>
              <th className="px-2 py-1.5 text-center font-semibold">Yr / Course</th>
              <th className="px-2 py-1.5 text-left font-semibold border-l border-white/30">SMP Rpt</th>
              <th className="px-2 py-1.5 text-left font-semibold">SVK Rpt</th>
              <th className="px-2 py-1.5 text-left font-semibold">Add Rpt</th>
              <th className={`${hCell} border-l border-white/30`}>SMP</th>
              <th className={hCell}>SVK</th>
              <th className={hCell}>Add</th>
              <th className={`${hCell} border-l border-white/30`}>{isCash ? 'Cash Total' : 'UPI Total'}</th>
            </tr>
          </thead>
          <tbody>
            {sectionRecords.map((r, i) => {
              const s       = getRecordSplit(r);
              const smpAmt  = isCash ? s.smpCash : s.smpUpi;
              const svkAmt  = isCash ? s.svkCash : s.svkUpi;
              const addAmt  = isCash ? s.addCash : s.addUpi;
              const rowTot  = smpAmt + svkAmt + addAmt;
              const yShort  = r.year.split(' ')[0];
              return (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                  <td className="px-2 py-1.5 font-medium truncate max-w-[160px]">{r.studentName}</td>
                  <td className="px-2 py-1.5 text-gray-500">{r.regNumber || '—'}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{yShort} / {r.course}</td>
                  <td className="px-2 py-1.5 border-l border-gray-100 font-mono">{r.receiptNumber || '—'}</td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono">{r.svkReceiptNumber || '—'}</td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono">{r.additionalReceiptNumber || '—'}</td>
                  <td className={`${cell} border-l border-gray-100`}>{smpAmt > 0 ? fmt(smpAmt) : '—'}</td>
                  <td className={cell}>{svkAmt > 0 ? fmt(svkAmt) : '—'}</td>
                  <td className={cell}>{addAmt > 0 ? fmt(addAmt) : '—'}</td>
                  <td className={`${cell} font-bold border-l border-gray-100`}>{fmt(rowTot)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className={`sticky bottom-0 z-10 ${totBg} font-bold border-t-2 border-gray-300 text-[10px]`}>
            <tr>
              <td className="px-2 py-2 text-center text-gray-400">—</td>
              <td className="px-2 py-2" colSpan={6}>
                {sectionRecords.length} payment{sectionRecords.length !== 1 ? 's' : ''}
              </td>
              <td className={`px-2 py-2 text-right ${totClr} border-l border-gray-200`}>{fmt(totals.smp)}</td>
              <td className={`px-2 py-2 text-right ${totClr}`}>{fmt(totals.svk)}</td>
              <td className={`px-2 py-2 text-right ${totClr}`}>{fmt(totals.add)}</td>
              <td className={`px-2 py-2 text-right ${totClr} border-l border-gray-200`}>{fmt(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Daily Collections — {day.dateLabel}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
              <span>{day.receiptCount} receipt{day.receiptCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>{day.studentCount} student{day.studentCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span className="text-green-700 font-semibold">Cash: {fmt(day.cashTotal)}</span>
              <span>·</span>
              <span className="text-blue-700 font-semibold">UPI: {fmt(day.upiTotal)}</span>
              <span>·</span>
              <span className="font-semibold">Total: {fmt(day.dayTotal)}</span>
            </p>
          </div>
          <div className="ml-4 flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => exportDayBreakdownExcel(day, cashRecords, upiRecords)}
              className="px-3 py-1.5 rounded border border-gray-300 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Excel
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-base font-bold leading-none transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Cash Payments
              </span>
              <span className="text-[10px] text-gray-400">
                {cashRecords.length} receipt{cashRecords.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
                {fmt(cashTot.smp + cashTot.svk + cashTot.add)} total
              </span>
            </div>
            <PaymentSection sectionRecords={cashRecords} mode="CASH" totals={cashTot} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                UPI Payments
              </span>
              <span className="text-[10px] text-gray-400">
                {upiRecords.length} receipt{upiRecords.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
                {fmt(upiTot.smp + upiTot.svk + upiTot.add)} total
              </span>
            </div>
            <PaymentSection sectionRecords={upiRecords} mode="UPI" totals={upiTot} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyCollectionsTab({ feeRecords, academicYear }: { feeRecords: FeeRecord[]; academicYear: string }) {
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [modeFilter,  setModeFilter]  = useState<'ALL' | 'CASH' | 'UPI'>('ALL');
  const [selectedDay, setSelectedDay] = useState<DayEntry | null>(null);

  const allDays = useMemo(() => buildDailyCollections(feeRecords), [feeRecords]);

  const filteredDays = useMemo(() => {
    let days = allDays;
    if (dateFrom)              days = days.filter((e) => e.dateKey >= dateFrom);
    if (dateTo)                days = days.filter((e) => e.dateKey <= dateTo);
    if (modeFilter === 'CASH') days = days.filter((e) => e.cashTotal > 0);
    if (modeFilter === 'UPI')  days = days.filter((e) => e.upiTotal  > 0);
    return days;
  }, [allDays, dateFrom, dateTo, modeFilter]);

  const totals = useMemo(
    () =>
      filteredDays.reduce(
        (a, e) => ({
          receiptCount: a.receiptCount + e.receiptCount,
          studentCount: a.studentCount + e.studentCount,
          cashTotal:    a.cashTotal    + e.cashTotal,
          upiTotal:     a.upiTotal     + e.upiTotal,
          dayTotal:     a.dayTotal     + e.dayTotal,
        }),
        { receiptCount: 0, studentCount: 0, cashTotal: 0, upiTotal: 0, dayTotal: 0 },
      ),
    [filteredDays],
  );

  const hasFilter = !!dateFrom || !!dateTo || modeFilter !== 'ALL';

  return (
    <div className="space-y-4">
      {selectedDay && (
        <DayBreakdownModal
          day={selectedDay}
          records={feeRecords}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Cash',  value: fmt(totals.cashTotal),    color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200',  sub: 'To deposit in bank'  },
          { label: 'Total UPI',   value: fmt(totals.upiTotal),     color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   sub: 'To verify with bank' },
          { label: 'Grand Total', value: fmt(totals.dayTotal),     color: 'text-gray-900',   bg: 'bg-gray-50',   border: 'border-gray-200',   sub: 'Cash + UPI'          },
          { label: 'Receipts',    value: totals.receiptCount,      color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', sub: 'Payments in range'   },
        ].map((c) => (
          <div key={c.label} className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 font-medium">From</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fs} />
        <span className="text-xs text-gray-500 font-medium">To</span>
        <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   className={fs} />
        <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as 'ALL' | 'CASH' | 'UPI')} className={fs}>
          <option value="ALL">All Modes</option>
          <option value="CASH">Cash Only</option>
          <option value="UPI">UPI Only</option>
        </select>
        {hasFilter && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setModeFilter('ALL'); }}
            className="px-3 py-1.5 rounded border text-xs font-medium border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
          >
            Clear
          </button>
        )}
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={() => exportDailyCollectionsExcel(filteredDays, academicYear)}>
            Excel
          </Button>
        </div>
      </div>

      {/* Hint */}
      {filteredDays.length > 0 && (
        <p className="text-[10px] text-gray-400">Click any row to view a detailed breakup of that day's collections.</p>
      )}

      {/* Day-wise summary table — 13 columns */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-[10px]">
          <thead className="bg-emerald-700 text-white">
            <tr>
              <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
              <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Date</th>
              <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Receipts</th>
              <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Students</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={4}>Cash</th>
              <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={4}>UPI</th>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30" rowSpan={2}>Day Total</th>
            </tr>
            <tr>
              <th className="px-2 py-1 text-right font-semibold border-l border-white/30">SMP</th>
              <th className="px-2 py-1 text-right font-semibold">SVK</th>
              <th className="px-2 py-1 text-right font-semibold">Add</th>
              <th className="px-2 py-1 text-right font-semibold bg-emerald-600">Total</th>
              <th className="px-2 py-1 text-right font-semibold border-l border-white/30">SMP</th>
              <th className="px-2 py-1 text-right font-semibold">SVK</th>
              <th className="px-2 py-1 text-right font-semibold">Add</th>
              <th className="px-2 py-1 text-right font-semibold bg-blue-600">Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredDays.map((e, i) => (
              <tr
                key={e.dateKey}
                onClick={() => setSelectedDay(e)}
                className={`cursor-pointer transition-colors hover:bg-emerald-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
              >
                <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium text-emerald-700 underline-offset-2 hover:underline">{e.dateLabel}</td>
                <td className="px-2 py-1.5 text-center text-gray-600">{e.receiptCount}</td>
                <td className="px-2 py-1.5 text-center text-gray-600">{e.studentCount}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-green-800">{e.smpCash > 0 ? fmt(e.smpCash) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-green-800">{e.svkCash > 0 ? fmt(e.svkCash) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-green-800">{e.addCash > 0 ? fmt(e.addCash) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-green-700 bg-green-50">{e.cashTotal > 0 ? fmt(e.cashTotal) : '—'}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-blue-800">{e.smpUpi > 0 ? fmt(e.smpUpi) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-blue-800">{e.svkUpi > 0 ? fmt(e.svkUpi) : '—'}</td>
                <td className="px-2 py-1.5 text-right text-blue-800">{e.addUpi > 0 ? fmt(e.addUpi) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-blue-700 bg-blue-50">{e.upiTotal > 0 ? fmt(e.upiTotal) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-bold border-l border-gray-100">{fmt(e.dayTotal)}</td>
              </tr>
            ))}
            {filteredDays.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-xs text-gray-400">
                  No collections found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
          {filteredDays.length > 0 && (
            <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-[10px]">
              <tr>
                <td className="px-2 py-2 text-center text-gray-400">—</td>
                <td className="px-2 py-2">Total — {filteredDays.length} day{filteredDays.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-center">{totals.receiptCount}</td>
                <td className="px-2 py-2 text-center">{totals.studentCount}</td>
                <td className="px-2 py-2 border-l border-gray-200"></td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2 text-right font-bold text-green-700">{fmt(totals.cashTotal)}</td>
                <td className="px-2 py-2 border-l border-gray-200"></td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2 text-right font-bold text-blue-700">{fmt(totals.upiTotal)}</td>
                <td className="px-2 py-2 text-right font-bold border-l border-gray-200">{fmt(totals.dayTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Day Summary ──────────────────────────────────────────────────────────
function exportDaySummaryExcel(entries: DayEntry[], academicYear: string): void {
  const header = [
    'Date', 'Students',
    'SMP Cash', 'SMP UPI',
    'SVK Cash', 'SVK UPI',
    'Add Cash', 'Add UPI',
    'Day Total',
  ];
  const dataRows = entries.map((e) => [
    e.dateLabel, e.studentCount,
    e.smpCash || null, e.smpUpi || null,
    e.svkCash || null, e.svkUpi || null,
    e.addCash || null, e.addUpi || null,
    e.dayTotal,
  ]);
  const tot = entries.reduce(
    (a, e) => ({
      studentCount: a.studentCount + e.studentCount,
      smpCash: a.smpCash + e.smpCash, smpUpi: a.smpUpi + e.smpUpi,
      svkCash: a.svkCash + e.svkCash, svkUpi: a.svkUpi + e.svkUpi,
      addCash: a.addCash + e.addCash, addUpi: a.addUpi + e.addUpi,
      dayTotal: a.dayTotal + e.dayTotal,
    }),
    { studentCount: 0, smpCash: 0, smpUpi: 0, svkCash: 0, svkUpi: 0, addCash: 0, addUpi: 0, dayTotal: 0 },
  );
  const totRow = [
    'TOTAL', tot.studentCount,
    tot.smpCash || null, tot.smpUpi || null,
    tot.svkCash || null, tot.svkUpi || null,
    tot.addCash || null, tot.addUpi || null,
    tot.dayTotal,
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Day Summary');
  XLSX.writeFile(wb, `Day_Summary_${academicYear}.xlsx`);
}

function DaySummaryTab({ feeRecords, academicYear }: { feeRecords: FeeRecord[]; academicYear: string }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const allDays = useMemo(() => buildDailyCollections(feeRecords), [feeRecords]);

  const filteredDays = useMemo(() => {
    let days = allDays;
    if (dateFrom) days = days.filter((e) => e.dateKey >= dateFrom);
    if (dateTo)   days = days.filter((e) => e.dateKey <= dateTo);
    return days;
  }, [allDays, dateFrom, dateTo]);

  const totals = useMemo(
    () =>
      filteredDays.reduce(
        (a, e) => ({
          studentCount: a.studentCount + e.studentCount,
          smpCash:  a.smpCash  + e.smpCash,  smpUpi:  a.smpUpi  + e.smpUpi,
          svkCash:  a.svkCash  + e.svkCash,  svkUpi:  a.svkUpi  + e.svkUpi,
          addCash:  a.addCash  + e.addCash,  addUpi:  a.addUpi  + e.addUpi,
          dayTotal: a.dayTotal + e.dayTotal,
        }),
        { studentCount: 0, smpCash: 0, smpUpi: 0, svkCash: 0, svkUpi: 0, addCash: 0, addUpi: 0, dayTotal: 0 },
      ),
    [filteredDays],
  );

  const hasFilter = !!dateFrom || !!dateTo;

  const n = (v: number) => (v > 0 ? fmt(v) : '—');

  return (
    <div className="space-y-4">
      {/* Filters + export */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 font-medium">From</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fs} />
        <span className="text-xs text-gray-500 font-medium">To</span>
        <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   className={fs} />
        {hasFilter && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            className="px-3 py-1.5 rounded border text-xs font-medium border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
          >
            Clear
          </button>
        )}
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={() => exportDaySummaryExcel(filteredDays, academicYear)}>
            Excel
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Cash',   value: fmt(totals.smpCash + totals.svkCash + totals.addCash), color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', sub: 'SMP + SVK + Add (cash)' },
          { label: 'Total UPI',    value: fmt(totals.smpUpi  + totals.svkUpi  + totals.addUpi),  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    sub: 'SMP + SVK + Add (UPI)'  },
          { label: 'Grand Total',  value: fmt(totals.dayTotal),                                   color: 'text-gray-900',    bg: 'bg-gray-50',    border: 'border-gray-200',    sub: 'Cash + UPI'             },
          { label: 'Days Shown',   value: filteredDays.length,                                    color: 'text-purple-700',  bg: 'bg-purple-50',  border: 'border-purple-200',  sub: `of ${allDays.length} total days` },
        ].map((c) => (
          <div key={c.label} className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-[10px] whitespace-nowrap">
          <thead className="bg-slate-700 text-white">
            <tr>
              <th className="px-3 py-2 text-left font-semibold" rowSpan={2}>Date</th>
              <th className="px-2 py-2 text-center font-semibold" rowSpan={2}>Students</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-white/30" colSpan={2}>SMP</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-white/30" colSpan={2}>SVK</th>
              <th className="px-2 py-2 text-center font-semibold border-l border-white/30" colSpan={2}>Additional</th>
              <th className="px-2 py-2 text-right font-semibold border-l border-white/30" rowSpan={2}>Day Total</th>
            </tr>
            <tr>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30 bg-emerald-700/80">Cash</th>
              <th className="px-2 py-1.5 text-right font-semibold bg-blue-700/80">UPI</th>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30 bg-emerald-700/80">Cash</th>
              <th className="px-2 py-1.5 text-right font-semibold bg-blue-700/80">UPI</th>
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30 bg-emerald-700/80">Cash</th>
              <th className="px-2 py-1.5 text-right font-semibold bg-blue-700/80">UPI</th>
            </tr>
          </thead>
          <tbody>
            {filteredDays.map((e, i) => (
              <tr key={e.dateKey} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-1.5 font-medium text-slate-700">{e.dateLabel}</td>
                <td className="px-2 py-1.5 text-center text-gray-600">{e.studentCount}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-emerald-700">{n(e.smpCash)}</td>
                <td className="px-2 py-1.5 text-right text-blue-700">{n(e.smpUpi)}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-emerald-700">{n(e.svkCash)}</td>
                <td className="px-2 py-1.5 text-right text-blue-700">{n(e.svkUpi)}</td>
                <td className="px-2 py-1.5 text-right border-l border-gray-100 text-emerald-700">{n(e.addCash)}</td>
                <td className="px-2 py-1.5 text-right text-blue-700">{n(e.addUpi)}</td>
                <td className="px-2 py-1.5 text-right font-bold border-l border-gray-100">{fmt(e.dayTotal)}</td>
              </tr>
            ))}
            {filteredDays.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-xs text-gray-400">
                  No collections found{hasFilter ? ' for the selected date range' : ''}.
                </td>
              </tr>
            )}
          </tbody>
          {filteredDays.length > 0 && (
            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-[10px]">
              <tr>
                <td className="px-3 py-2 text-slate-700">Total — {filteredDays.length} day{filteredDays.length !== 1 ? 's' : ''}</td>
                <td className="px-2 py-2 text-center text-slate-700">{totals.studentCount}</td>
                <td className="px-2 py-2 text-right border-l border-slate-200 text-emerald-700">{n(totals.smpCash)}</td>
                <td className="px-2 py-2 text-right text-blue-700">{n(totals.smpUpi)}</td>
                <td className="px-2 py-2 text-right border-l border-slate-200 text-emerald-700">{n(totals.svkCash)}</td>
                <td className="px-2 py-2 text-right text-blue-700">{n(totals.svkUpi)}</td>
                <td className="px-2 py-2 text-right border-l border-slate-200 text-emerald-700">{n(totals.addCash)}</td>
                <td className="px-2 py-2 text-right text-blue-700">{n(totals.addUpi)}</td>
                <td className="px-2 py-2 text-right border-l border-slate-200 text-slate-900">{fmt(totals.dayTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Datewise Consolidated Headwise ───────────────────────────────────────
function DatewiseHeadwiseTab({ feeRecords, academicYear, fp }: { feeRecords: FeeRecord[]; academicYear: string; fp: CommonFilterProps }) {
  const entries: DatewiseHeadwiseEntry[] = useMemo(() => buildDatewiseHeadwise(feeRecords), [feeRecords]);

  const grandHeads = useMemo(() => {
    const totals = {} as Record<string, number>;
    for (const { key } of SMP_FEE_HEADS) totals[key] = 0;
    for (const e of entries) {
      for (const { key } of SMP_FEE_HEADS) totals[key] += e.heads[key];
    }
    return totals;
  }, [entries]);

  const grandTotal = useMemo(
    () => SMP_FEE_HEADS.reduce((s, { key }) => s + grandHeads[key], 0),
    [grandHeads],
  );

  return (
    <div className="space-y-3">
      <CommonFilters fp={fp} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">{entries.length} day{entries.length !== 1 ? 's' : ''}</p>
          {grandTotal > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-teal-300 bg-teal-50 text-xs font-semibold text-teal-700">
              Total: {fmt(grandTotal)}
            </span>
          )}
        </div>
        <ExportBar
          onPdf={() => exportDatewiseHeadwisePdf(entries, academicYear)}
          onExcel={() => exportDatewiseHeadwiseExcel(entries, academicYear)}
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-[10px] whitespace-nowrap">
          <thead className="bg-teal-700 text-white">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Date</th>
              {SMP_FEE_HEADS.map(({ key, label }) => (
                <th key={key} className="px-2 py-1.5 text-right font-semibold">{label}</th>
              ))}
              <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30">Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.dateKey} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-2 py-1.5 font-medium text-teal-700">{e.dateLabel}</td>
                {SMP_FEE_HEADS.map(({ key }) => (
                  <td key={key} className="px-2 py-1.5 text-right">
                    {e.heads[key] > 0 ? fmt(e.heads[key]) : '—'}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-bold border-l border-gray-100">{fmt(e.total)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={SMP_FEE_HEADS.length + 2} className="px-3 py-6 text-center text-xs text-gray-400">
                  No fee records found.
                </td>
              </tr>
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-[10px]">
              <tr>
                <td className="px-2 py-2">Total</td>
                {SMP_FEE_HEADS.map(({ key }) => (
                  <td key={key} className="px-2 py-2 text-right">{fmt(grandHeads[key])}</td>
                ))}
                <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Bank Remittance ──────────────────────────────────────────────────────

const AIDED_COURSES_SET = new Set<Course>(['CE', 'ME', 'EC', 'CS']);
const SBI_ACCOUNT    = '64049891981';
const CANARA_ACCOUNT = '19032200004180';

type ChallanId = 'sbi-aided' | 'sbi-unaided' | 'canara-aided' | 'canara-unaided';

interface ChallanConfig {
  id: ChallanId;
  bank: string;
  aidedType: 'Aided' | 'Unaided';
  accountNo: string;
  feeLabel: string;
  courses: string;
  hdrBg: string; accentBg: string; accentBorder: string; accentText: string; totalBg: string;
}
const CHALLAN_CONFIGS: ChallanConfig[] = [
  { id: 'sbi-aided',      bank: 'SBI',    aidedType: 'Aided',   accountNo: SBI_ACCOUNT,    feeLabel: 'SMP Fee + Additional', courses: 'CE · ME · EC · CS', hdrBg: 'bg-blue-700',   accentBg: 'bg-blue-50',   accentBorder: 'border-blue-200',   accentText: 'text-blue-700',   totalBg: 'bg-blue-100'   },
  { id: 'sbi-unaided',    bank: 'SBI',    aidedType: 'Unaided', accountNo: SBI_ACCOUNT,    feeLabel: 'SMP Fee + Additional', courses: 'EE',               hdrBg: 'bg-indigo-700', accentBg: 'bg-indigo-50', accentBorder: 'border-indigo-200', accentText: 'text-indigo-700', totalBg: 'bg-indigo-100' },
  { id: 'canara-aided',   bank: 'Canara', aidedType: 'Aided',   accountNo: CANARA_ACCOUNT, feeLabel: 'SVK Fee',              courses: 'CE · ME · EC · CS', hdrBg: 'bg-emerald-700',accentBg: 'bg-emerald-50',accentBorder: 'border-emerald-200',accentText: 'text-emerald-700',totalBg: 'bg-emerald-100'},
  { id: 'canara-unaided', bank: 'Canara', aidedType: 'Unaided', accountNo: CANARA_ACCOUNT, feeLabel: 'SVK Fee',              courses: 'EE',               hdrBg: 'bg-teal-700',   accentBg: 'bg-teal-50',   accentBorder: 'border-teal-200',   accentText: 'text-teal-700',   totalBg: 'bg-teal-100'   },
];

interface ChallanRow {
  id: string;
  studentName: string;
  regNumber: string;
  course: string;
  year: string;
  receiptNos: string;
  cashAmt: number;
  upiAmt: number;
}
type ChallanMap = Record<ChallanId, ChallanRow[]>;

function buildDayChallans(records: FeeRecord[], dateKey: string): ChallanMap {
  const map: ChallanMap = { 'sbi-aided': [], 'sbi-unaided': [], 'canara-aided': [], 'canara-unaided': [] };
  for (const r of records) {
    if (r.date.slice(0, 10) !== dateKey) continue;
    const isAided  = AIDED_COURSES_SET.has(r.course);
    const smpAmt   = SMP_FEE_HEADS.reduce((s, { key }) => s + r.smp[key], 0);
    const addAmt   = r.additionalPaid.reduce((s, h) => s + h.amount, 0);
    const svkAmt   = r.svk;
    const smpMode  = r.smpPaymentMode  ?? r.paymentMode;
    const addMode  = r.additionalPaymentMode ?? r.paymentMode;
    const svkMode  = r.svkPaymentMode  ?? r.paymentMode;

    const sbiId:    ChallanId = isAided ? 'sbi-aided'    : 'sbi-unaided';
    const canaraId: ChallanId = isAided ? 'canara-aided' : 'canara-unaided';

    // SBI: SMP + Additional (modes tracked independently, split aware)
    const smpCash = smpMode === 'CASH' ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.cash ?? 0) : 0;
    const smpUpi  = smpMode === 'UPI'  ? smpAmt : smpMode === 'SPLIT' ? (r.smpSplit?.upi  ?? 0) : 0;
    const addCash = addMode === 'CASH' ? addAmt : addMode === 'SPLIT' ? (r.additionalSplit?.cash ?? 0) : 0;
    const addUpi  = addMode === 'UPI'  ? addAmt : addMode === 'SPLIT' ? (r.additionalSplit?.upi  ?? 0) : 0;
    const sbiCash = smpCash + addCash;
    const sbiUpi  = smpUpi  + addUpi;
    if (sbiCash + sbiUpi > 0) {
      const rpts = [r.receiptNumber, r.additionalReceiptNumber].filter(Boolean).join(' / ');
      map[sbiId].push({ id: r.id + '_sbi', studentName: r.studentName, regNumber: r.regNumber ?? '', course: r.course, year: r.year, receiptNos: rpts || '—', cashAmt: sbiCash, upiAmt: sbiUpi });
    }

    // Canara: SVK only (split aware)
    if (svkAmt > 0) {
      const canaraCash = svkMode === 'CASH' ? svkAmt : svkMode === 'SPLIT' ? (r.svkSplit?.cash ?? 0) : 0;
      const canaraUpi  = svkMode === 'UPI'  ? svkAmt : svkMode === 'SPLIT' ? (r.svkSplit?.upi  ?? 0) : 0;
      map[canaraId].push({ id: r.id + '_canara', studentName: r.studentName, regNumber: r.regNumber ?? '', course: r.course, year: r.year, receiptNos: r.svkReceiptNumber || '—', cashAmt: canaraCash, upiAmt: canaraUpi });
    }
  }
  return map;
}

interface RemittancePeriodRow {
  dateKey: string; dateLabel: string;
  totals: Record<ChallanId, { cash: number; upi: number; total: number }>;
  dayTotal: number;
}
function buildPeriodRemittance(records: FeeRecord[], dateFrom: string, dateTo: string): RemittancePeriodRow[] {
  const dateKeys = [...new Set(records.map((r) => r.date.slice(0, 10)))]
    .filter((d) => (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo))
    .sort();
  return dateKeys.map((dateKey) => {
    const challans = buildDayChallans(records, dateKey);
    let dayTotal = 0;
    const totals = {} as Record<ChallanId, { cash: number; upi: number; total: number }>;
    for (const cfg of CHALLAN_CONFIGS) {
      const cash = challans[cfg.id].reduce((s, r) => s + r.cashAmt, 0);
      const upi  = challans[cfg.id].reduce((s, r) => s + r.upiAmt, 0);
      totals[cfg.id] = { cash, upi, total: cash + upi };
      dayTotal += cash + upi;
    }
    return { dateKey, dateLabel: formatDayLabel(dateKey), totals, dayTotal };
  });
}

function exportRemittanceExcel(rows: RemittancePeriodRow[], academicYear: string): void {
  const hdr = [
    'Date',
    'SBI Aided Cash', 'SBI Aided UPI', 'SBI Aided Total',
    'SBI Unaided Cash', 'SBI Unaided UPI', 'SBI Unaided Total',
    'Canara Aided Cash', 'Canara Aided UPI', 'Canara Aided Total',
    'Canara Unaided Cash', 'Canara Unaided UPI', 'Canara Unaided Total',
    'Day Total',
  ];
  const data = rows.map((r) => [
    r.dateLabel,
    r.totals['sbi-aided'].cash    || null, r.totals['sbi-aided'].upi    || null, r.totals['sbi-aided'].total    || null,
    r.totals['sbi-unaided'].cash  || null, r.totals['sbi-unaided'].upi  || null, r.totals['sbi-unaided'].total  || null,
    r.totals['canara-aided'].cash || null, r.totals['canara-aided'].upi || null, r.totals['canara-aided'].total || null,
    r.totals['canara-unaided'].cash || null, r.totals['canara-unaided'].upi || null, r.totals['canara-unaided'].total || null,
    r.dayTotal || null,
  ]);
  const grand = rows.reduce((a, r) => {
    for (const cfg of CHALLAN_CONFIGS) { a[cfg.id] = { cash: (a[cfg.id]?.cash ?? 0) + r.totals[cfg.id].cash, upi: (a[cfg.id]?.upi ?? 0) + r.totals[cfg.id].upi, total: (a[cfg.id]?.total ?? 0) + r.totals[cfg.id].total }; }
    a.dayTotal = (a.dayTotal ?? 0) + r.dayTotal;
    return a;
  }, {} as Record<string, { cash: number; upi: number; total: number }> & { dayTotal?: number });
  const totRow = [
    'TOTAL',
    grand['sbi-aided']?.cash || null,    grand['sbi-aided']?.upi || null,    grand['sbi-aided']?.total || null,
    grand['sbi-unaided']?.cash || null,  grand['sbi-unaided']?.upi || null,  grand['sbi-unaided']?.total || null,
    grand['canara-aided']?.cash || null, grand['canara-aided']?.upi || null, grand['canara-aided']?.total || null,
    grand['canara-unaided']?.cash || null, grand['canara-unaided']?.upi || null, grand['canara-unaided']?.total || null,
    grand.dayTotal || null,
  ];
  const ws = XLSX.utils.aoa_to_sheet([hdr, ...data, totRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bank Remittance');
  XLSX.writeFile(wb, `Bank_Remittance_${academicYear}.xlsx`);
}

function ChallanPanel({ cfg, rows }: { cfg: ChallanConfig; rows: ChallanRow[] }) {
  const cashTotal = rows.reduce((s, r) => s + r.cashAmt, 0);
  const upiTotal  = rows.reduce((s, r) => s + r.upiAmt, 0);
  const grandTotal = cashTotal + upiTotal;
  const cell = 'px-2 py-1.5 text-[10px]';

  return (
    <div className={`rounded-xl border ${cfg.accentBorder} overflow-hidden flex flex-col`}>
      {/* Challan header */}
      <div className={`${cfg.hdrBg} px-3 py-2.5 flex items-start justify-between`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-xs">{cfg.bank} Bank</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.aidedType === 'Aided' ? 'bg-white/25 text-white' : 'bg-white/15 text-white/80'}`}>
              {cfg.aidedType}
            </span>
          </div>
          <p className="text-white/70 text-[9px] mt-0.5 font-mono">Acct: {cfg.accountNo}</p>
          <p className="text-white/60 text-[9px]">{cfg.feeLabel} · {cfg.courses}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-white font-bold text-sm">{fmt(grandTotal)}</p>
          <p className="text-white/60 text-[9px]">{rows.length} payment{rows.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Cash / UPI summary chips */}
      <div className={`flex gap-3 px-3 py-2 ${cfg.accentBg} border-b ${cfg.accentBorder}`}>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-[10px] font-semibold text-gray-600">Cash (challan):</span>
          <span className={`text-[10px] font-bold ${cashTotal > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{cashTotal > 0 ? fmt(cashTotal) : '—'}</span>
        </div>
        <div className="w-px bg-gray-200" />
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          <span className="text-[10px] font-semibold text-gray-600">UPI (auto-remitted):</span>
          <span className={`text-[10px] font-bold ${upiTotal > 0 ? 'text-blue-700' : 'text-gray-400'}`}>{upiTotal > 0 ? fmt(upiTotal) : '—'}</span>
        </div>
      </div>

      {/* Student rows */}
      <div className="overflow-auto flex-1" style={{ maxHeight: '220px' }}>
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-[10px] text-gray-400 text-center">No remittance for this date.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead className={`sticky top-0 z-10 ${cfg.hdrBg} text-white`}>
              <tr>
                <th className="px-2 py-1.5 text-center font-semibold w-7">Sl</th>
                <th className="px-2 py-1.5 text-left font-semibold min-w-[120px]">Name</th>
                <th className="px-2 py-1.5 text-left font-semibold">Reg No</th>
                <th className="px-2 py-1.5 text-center font-semibold">Yr/Crs</th>
                <th className="px-2 py-1.5 text-left font-semibold border-l border-white/30">Receipt</th>
                <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30">Cash</th>
                <th className="px-2 py-1.5 text-right font-semibold">UPI</th>
                <th className="px-2 py-1.5 text-right font-semibold border-l border-white/30">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : `${cfg.accentBg}`}>
                  <td className={`${cell} text-center text-gray-400`}>{i + 1}</td>
                  <td className={`${cell} font-medium truncate max-w-[140px]`}>{r.studentName}</td>
                  <td className={`${cell} text-gray-500 font-mono`}>{r.regNumber || '—'}</td>
                  <td className={`${cell} text-center text-gray-600`}>{r.year.split(' ')[0]}/{r.course}</td>
                  <td className={`${cell} font-mono border-l border-gray-100`}>{r.receiptNos}</td>
                  <td className={`${cell} text-right font-medium border-l border-gray-100 ${r.cashAmt > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{r.cashAmt > 0 ? fmt(r.cashAmt) : '—'}</td>
                  <td className={`${cell} text-right font-medium ${r.upiAmt > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{r.upiAmt > 0 ? fmt(r.upiAmt) : '—'}</td>
                  <td className={`${cell} text-right font-bold border-l border-gray-100`}>{fmt(r.cashAmt + r.upiAmt)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className={`sticky bottom-0 z-10 ${cfg.totalBg} border-t-2 ${cfg.accentBorder} font-bold text-[10px]`}>
              <tr>
                <td className="px-2 py-1.5 text-center text-gray-400">—</td>
                <td className="px-2 py-1.5" colSpan={4}>{rows.length} payment{rows.length !== 1 ? 's' : ''}</td>
                <td className={`px-2 py-1.5 text-right border-l border-gray-200 ${cfg.accentText}`}>{cashTotal > 0 ? fmt(cashTotal) : '—'}</td>
                <td className={`px-2 py-1.5 text-right ${cfg.accentText}`}>{upiTotal > 0 ? fmt(upiTotal) : '—'}</td>
                <td className={`px-2 py-1.5 text-right border-l border-gray-200 ${cfg.accentText}`}>{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function BankRemittanceTab({ feeRecords, academicYear }: { feeRecords: FeeRecord[]; academicYear: string }) {
  const availableDates = useMemo(
    () => [...new Set(feeRecords.map((r) => r.date.slice(0, 10)))].sort(),
    [feeRecords],
  );

  const [viewMode,     setViewMode]     = useState<'daily' | 'period'>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(() => availableDates[availableDates.length - 1] ?? new Date().toISOString().slice(0, 10));
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  // Keep selectedDate valid when feeRecords loads
  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[availableDates.length - 1]);
    }
  }, [availableDates, selectedDate]);

  const dayChallans = useMemo(() => buildDayChallans(feeRecords, selectedDate), [feeRecords, selectedDate]);

  const periodRows = useMemo(
    () => viewMode === 'period' ? buildPeriodRemittance(feeRecords, dateFrom, dateTo) : [],
    [feeRecords, viewMode, dateFrom, dateTo],
  );

  const dateIdx  = availableDates.indexOf(selectedDate);
  const prevDate = dateIdx > 0 ? availableDates[dateIdx - 1] : null;
  const nextDate = dateIdx !== -1 && dateIdx < availableDates.length - 1 ? availableDates[dateIdx + 1] : null;

  const dayTotal = useMemo(
    () => CHALLAN_CONFIGS.reduce((s, cfg) => s + dayChallans[cfg.id].reduce((t, r) => t + r.cashAmt + r.upiAmt, 0), 0),
    [dayChallans],
  );
  const dayCash = useMemo(
    () => CHALLAN_CONFIGS.reduce((s, cfg) => s + dayChallans[cfg.id].reduce((t, r) => t + r.cashAmt, 0), 0),
    [dayChallans],
  );
  const dayUpi = dayTotal - dayCash;

  const periodGrand = useMemo(
    () => periodRows.reduce((s, r) => s + r.dayTotal, 0),
    [periodRows],
  );

  const tabCls = (active: boolean) =>
    `px-4 py-1.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
      active ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
    }`;

  return (
    <div className="space-y-4">

      {/* Top bar: view toggle + date navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          <button className={tabCls(viewMode === 'daily')}  onClick={() => setViewMode('daily')}>Daily Challan</button>
          <button className={tabCls(viewMode === 'period')} onClick={() => setViewMode('period')}>Period Summary</button>
        </div>

        {viewMode === 'daily' && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Summary badges */}
            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">Cash: {fmt(dayCash)}</span>
            <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">UPI: {fmt(dayUpi)}</span>
            <span className="text-[10px] text-gray-700 font-bold bg-gray-100 border border-gray-200 rounded-full px-2.5 py-0.5">Total: {fmt(dayTotal)}</span>
            <div className="w-px h-4 bg-gray-300" />
            {/* Date navigation */}
            <button
              disabled={!prevDate}
              onClick={() => prevDate && setSelectedDate(prevDate)}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >‹</button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={fs}
            />
            <button
              disabled={!nextDate}
              onClick={() => nextDate && setSelectedDate(nextDate)}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >›</button>
          </div>
        )}

        {viewMode === 'period' && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-xs text-gray-500 font-medium">From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fs} />
            <span className="text-xs text-gray-500 font-medium">To</span>
            <input type="date" value={dateTo}   onChange={(e) => setDateTo(e.target.value)}   className={fs} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="px-3 py-1.5 rounded border text-xs font-medium border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors">Clear</button>
            )}
            <Button variant="secondary" size="sm" onClick={() => exportRemittanceExcel(periodRows, academicYear)}>Excel</Button>
          </div>
        )}
      </div>

      {/* Bank account info bar */}
      <div className="flex flex-wrap gap-3">
        {[
          { bank: 'SBI Bank', acct: SBI_ACCOUNT,    note: 'SMP + Additional · All Courses',    bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800'    },
          { bank: 'Canara Bank', acct: CANARA_ACCOUNT, note: 'SVK Fee · All Courses',           bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800' },
        ].map((b) => (
          <div key={b.bank} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${b.border} ${b.bg}`}>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wide ${b.text}`}>{b.bank}</p>
              <p className="text-[10px] font-mono text-gray-600">Acct: {b.acct}</p>
            </div>
            <div className="w-px h-7 bg-gray-200" />
            <p className={`text-[10px] ${b.text} opacity-70`}>{b.note}</p>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-400 self-center">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Cash = Challan deposit
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block ml-2" /> UPI = Auto-remitted
        </div>
      </div>

      {/* ── Daily Challan View ── */}
      {viewMode === 'daily' && (
        <>
          {availableDates.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No fee records found.</p>
          ) : (
            <>
              {/* 2×2 challan panels */}
              <div className="grid grid-cols-2 gap-4">
                {CHALLAN_CONFIGS.map((cfg) => (
                  <ChallanPanel key={cfg.id} cfg={cfg} rows={dayChallans[cfg.id]} />
                ))}
              </div>

              {/* Breakup Summary */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-100/80 border-b border-gray-200 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full bg-gray-500 shrink-0" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Breakup Summary — {formatDayLabel(selectedDate)}</span>
                </div>
                <table className="w-full text-[10px]">
                  <thead className="bg-gray-700 text-white">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-semibold">Bank</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Challan Type</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Fee</th>
                      <th className="px-3 py-1.5 text-center font-semibold">Courses</th>
                      <th className="px-3 py-1.5 text-center font-semibold">Payments</th>
                      <th className="px-3 py-1.5 text-right font-semibold border-l border-white/20">Cash (Challan)</th>
                      <th className="px-3 py-1.5 text-right font-semibold">UPI (Remitted)</th>
                      <th className="px-3 py-1.5 text-right font-semibold border-l border-white/20">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(() => {
                      // Build rows with bank subtotals
                      const banks = [
                        { bank: 'SBI', ids: ['sbi-aided', 'sbi-unaided'] as ChallanId[] },
                        { bank: 'Canara', ids: ['canara-aided', 'canara-unaided'] as ChallanId[] },
                      ];
                      const elements: React.ReactNode[] = [];
                      let grandCash = 0, grandUpi = 0;

                      for (const { bank, ids } of banks) {
                        let bankCash = 0, bankUpi = 0;
                        for (const id of ids) {
                          const cfg = CHALLAN_CONFIGS.find((c) => c.id === id)!;
                          const rows = dayChallans[id];
                          const cash = rows.reduce((s, r) => s + r.cashAmt, 0);
                          const upi  = rows.reduce((s, r) => s + r.upiAmt, 0);
                          const total = cash + upi;
                          bankCash += cash; bankUpi += upi;
                          elements.push(
                            <tr key={id} className={`${cfg.accentBg} hover:brightness-95 transition-colors`}>
                              <td className={`px-3 py-2 font-bold ${cfg.accentText}`}>{cfg.bank}</td>
                              <td className="px-3 py-2 font-semibold text-gray-700">{cfg.aidedType}</td>
                              <td className="px-3 py-2 text-gray-500">{cfg.feeLabel}</td>
                              <td className="px-3 py-2 text-center text-gray-500">{cfg.courses}</td>
                              <td className="px-3 py-2 text-center text-gray-600">{rows.length}</td>
                              <td className={`px-3 py-2 text-right font-semibold border-l border-gray-100 ${cash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{cash > 0 ? fmt(cash) : '—'}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${upi > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{upi > 0 ? fmt(upi) : '—'}</td>
                              <td className={`px-3 py-2 text-right font-bold border-l border-gray-100 ${cfg.accentText}`}>{total > 0 ? fmt(total) : '—'}</td>
                            </tr>
                          );
                        }
                        // Bank subtotal row
                        const bankTotal = bankCash + bankUpi;
                        grandCash += bankCash; grandUpi += bankUpi;
                        elements.push(
                          <tr key={bank + '_sub'} className="bg-gray-100 border-t border-gray-300">
                            <td className="px-3 py-1.5 font-bold text-gray-700" colSpan={4}>{bank} Bank Sub-total</td>
                            <td className="px-3 py-1.5 text-center font-bold text-gray-600">
                              {ids.reduce((s, id) => s + dayChallans[id].length, 0)}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-bold border-l border-gray-200 ${bankCash > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{bankCash > 0 ? fmt(bankCash) : '—'}</td>
                            <td className={`px-3 py-1.5 text-right font-bold ${bankUpi > 0 ? 'text-blue-700' : 'text-gray-400'}`}>{bankUpi > 0 ? fmt(bankUpi) : '—'}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-gray-800 border-l border-gray-200">{bankTotal > 0 ? fmt(bankTotal) : '—'}</td>
                          </tr>
                        );
                      }

                      // Grand total row (appended after loop)
                      elements.push(
                        <tr key="grand" className="bg-gray-800">
                          <td className="px-3 py-2 font-bold text-white" colSpan={4}>Grand Total</td>
                          <td className="px-3 py-2 text-center font-bold text-white">
                            {CHALLAN_CONFIGS.reduce((s, cfg) => s + dayChallans[cfg.id].length, 0)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-300 border-l border-white/10">{grandCash > 0 ? fmt(grandCash) : '—'}</td>
                          <td className="px-3 py-2 text-right font-bold text-blue-300">{grandUpi > 0 ? fmt(grandUpi) : '—'}</td>
                          <td className="px-3 py-2 text-right font-bold text-white border-l border-white/10">{fmt(grandCash + grandUpi)}</td>
                        </tr>
                      );

                      return elements;
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Period Summary View ── */}
      {viewMode === 'period' && (
        <>
          {periodRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No remittance records in the selected range.</p>
          ) : (
            <div className="space-y-3">
              {/* Grand total summary chips */}
              <div className="flex flex-wrap gap-2">
                {CHALLAN_CONFIGS.map((cfg) => {
                  const t = periodRows.reduce((a, r) => ({ cash: a.cash + r.totals[cfg.id].cash, upi: a.upi + r.totals[cfg.id].upi }), { cash: 0, upi: 0 });
                  return (
                    <div key={cfg.id} className={`rounded-lg border ${cfg.accentBorder} ${cfg.accentBg} px-3 py-2 min-w-[160px]`}>
                      <p className={`text-[9px] font-bold uppercase tracking-wide ${cfg.accentText} mb-0.5`}>{cfg.bank} {cfg.aidedType}</p>
                      <p className={`text-sm font-bold ${cfg.accentText}`}>{fmt(t.cash + t.upi)}</p>
                      <p className="text-[9px] text-gray-500">Cash: {fmt(t.cash)} · UPI: {fmt(t.upi)}</p>
                    </div>
                  );
                })}
                <div className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 min-w-[140px]">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500 mb-0.5">Grand Total</p>
                  <p className="text-sm font-bold text-gray-800">{fmt(periodGrand)}</p>
                  <p className="text-[9px] text-gray-500">{periodRows.length} day{periodRows.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Period table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
                <table className="w-full text-[10px] whitespace-nowrap">
                  <thead className="bg-gray-700 text-white">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold" rowSpan={2}>Date</th>
                      {CHALLAN_CONFIGS.map((cfg) => (
                        <th key={cfg.id} className="px-2 py-1.5 text-center font-semibold border-l border-white/20" colSpan={3}>{cfg.bank} {cfg.aidedType}</th>
                      ))}
                      <th className="px-2 py-1.5 text-right font-semibold border-l border-white/20" rowSpan={2}>Day Total</th>
                    </tr>
                    <tr>
                      {CHALLAN_CONFIGS.map((cfg) => (
                        <>{['Cash', 'UPI', 'Total'].map((h, i) => (
                          <th key={cfg.id + h} className={`px-2 py-1 text-right font-semibold ${i === 0 ? 'border-l border-white/20' : ''} ${i === 2 ? 'bg-white/10' : ''}`}>{h}</th>
                        ))}</>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periodRows.map((row, i) => (
                      <tr key={row.dateKey} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-2 py-1.5 font-medium text-gray-700">{row.dateLabel}</td>
                        {CHALLAN_CONFIGS.map((cfg) => {
                          const t = row.totals[cfg.id];
                          return (
                            <>
                              <td key={cfg.id+'c'} className={`px-2 py-1.5 text-right border-l border-gray-100 ${t.cash > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>{t.cash > 0 ? fmt(t.cash) : '—'}</td>
                              <td key={cfg.id+'u'} className={`px-2 py-1.5 text-right ${t.upi > 0 ? 'text-blue-700' : 'text-gray-300'}`}>{t.upi > 0 ? fmt(t.upi) : '—'}</td>
                              <td key={cfg.id+'t'} className={`px-2 py-1.5 text-right font-semibold bg-gray-50/80 ${cfg.accentText}`}>{t.total > 0 ? fmt(t.total) : '—'}</td>
                            </>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right font-bold border-l border-gray-100">{fmt(row.dayTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-[10px]">
                    <tr>
                      <td className="px-2 py-2">Total — {periodRows.length} day{periodRows.length !== 1 ? 's' : ''}</td>
                      {CHALLAN_CONFIGS.map((cfg) => {
                        const t = periodRows.reduce((a, r) => ({ cash: a.cash + r.totals[cfg.id].cash, upi: a.upi + r.totals[cfg.id].upi, total: a.total + r.totals[cfg.id].total }), { cash: 0, upi: 0, total: 0 });
                        return (
                          <>
                            <td key={cfg.id+'c'} className="px-2 py-2 text-right text-emerald-700 border-l border-gray-200">{t.cash > 0 ? fmt(t.cash) : '—'}</td>
                            <td key={cfg.id+'u'} className="px-2 py-2 text-right text-blue-700">{t.upi > 0 ? fmt(t.upi) : '—'}</td>
                            <td key={cfg.id+'t'} className={`px-2 py-2 text-right ${cfg.accentText}`}>{t.total > 0 ? fmt(t.total) : '—'}</td>
                          </>
                        );
                      })}
                      <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(periodGrand)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab: Fee Distribution ─────────────────────────────────────────────────────

interface FeeDistRow {
  slNo: number;
  feeType: string;
  studentCount: number;
  feeAmountPerStudent: number;
  totalCollected: number;
  toGov: number;
  toSVK: number;
  toSMP: number;
}

function calcDistribution(
  ss: Student[],
  isAided: boolean,
  structMap: Map<string, FeeStructure>,
  finePaidMap: Map<string, number>,
): FeeDistRow[] {
  // Look up the saved fee structure for each student using normalized group keys,
  // matching the SMP Students Statistics Summary groupings (Regular/Lateral/SNQ per year).
  // Only admType is normalised (REPEATER/EXTERNAL/etc. → REGULAR; LATERAL stays LATERAL).
  // admCat is kept as-is so OTHERS students still find their OTHERS structure; GM is the fallback.
  const headMap = new Map<string, Record<SMPFeeHead, number>>();
  for (const s of ss) {
    const normAdmType = s.admType === 'LATERAL' ? 'LATERAL' : 'REGULAR';
    const st = structMap.get(`${s.course}__${s.year}__${normAdmType}__${s.admCat}`)
            ?? structMap.get(`${s.course}__${s.year}__${normAdmType}__GM`);
    if (st) headMap.set(s.id, st.smp);
  }

  function amt(s: Student, k: SMPFeeHead): number {
    return headMap.get(s.id)?.[k] ?? 0;
  }

  const rows: FeeDistRow[] = [];
  let n = 1;

  // ── Tuition fees by year group ──
  // 1st Yr: 1ST YEAR non-SNQ + LATERAL 2ND YEAR non-SNQ (both pay 1st yr tuition rate)
  const t1 = ss.filter(s =>
    (s.year === '1ST YEAR' && s.admCat !== 'SNQ') ||
    (s.year === '2ND YEAR' && s.admType === 'LATERAL' && s.admCat !== 'SNQ'),
  );
  const t1tot = t1.reduce((a, s) => a + amt(s, 'tuition'), 0);
  if (t1.length > 0 && t1tot > 0) {
    rows.push({
      slNo: n++, feeType: 'Tuition Fee 1st Yr',
      studentCount: t1.length, feeAmountPerStudent: Math.round(t1tot / t1.length),
      totalCollected: t1tot,
      toGov: isAided ? t1tot / 2 : 0,
      toSVK: isAided ? t1tot / 2 : t1tot,
      toSMP: 0,
    });
  }

  // 2nd Yr: 2ND YEAR non-LATERAL non-SNQ
  const t2 = ss.filter(s => s.year === '2ND YEAR' && s.admType !== 'LATERAL' && s.admCat !== 'SNQ');
  const t2tot = t2.reduce((a, s) => a + amt(s, 'tuition'), 0);
  if (t2.length > 0 && t2tot > 0) {
    rows.push({
      slNo: n++, feeType: 'Tuition Fee 2nd Yr',
      studentCount: t2.length, feeAmountPerStudent: Math.round(t2tot / t2.length),
      totalCollected: t2tot,
      toGov: isAided ? t2tot / 2 : 0,
      toSVK: isAided ? t2tot / 2 : t2tot,
      toSMP: 0,
    });
  }

  // 3rd Yr: 3RD YEAR non-SNQ (includes LATERAL 3rd yr counted as regular)
  const t3 = ss.filter(s => s.year === '3RD YEAR' && s.admCat !== 'SNQ');
  const t3tot = t3.reduce((a, s) => a + amt(s, 'tuition'), 0);
  if (t3.length > 0 && t3tot > 0) {
    rows.push({
      slNo: n++, feeType: 'Tuition Fee 3rd Yr',
      studentCount: t3.length, feeAmountPerStudent: Math.round(t3tot / t3.length),
      totalCollected: t3tot,
      toGov: isAided ? t3tot / 2 : 0,
      toSVK: isAided ? t3tot / 2 : t3tot,
      toSMP: 0,
    });
  }

  // ── Other SMP fee heads ──
  // Order matches reference HTML: dvp, adm, lab, rr, mag, idCard, sports, ass, lib, swf, twf, nss
  const otherHeads: { key: SMPFeeHead; label: string; libOnly?: true }[] = [
    { key: 'dvp',    label: 'DVP' },
    { key: 'adm',    label: 'ADMISSION' },
    { key: 'lab',    label: 'LAB' },
    { key: 'rr',     label: 'RR' },
    { key: 'mag',    label: 'MAGAZINE' },
    { key: 'idCard', label: 'ID CARD' },
    { key: 'sports', label: 'SPORTS' },
    { key: 'ass',    label: 'ASSOCIATION' },
    { key: 'lib',    label: 'LIBRARY', libOnly: true },
    { key: 'swf',    label: 'SWF' },
    { key: 'twf',    label: 'TWF' },
    { key: 'nss',    label: 'NSS' },
  ];

  for (const h of otherHeads) {
    // Library: only 1ST YEAR + LATERAL 2ND YEAR (all admCats)
    const eligible = h.libOnly
      ? ss.filter(s => s.year === '1ST YEAR' || (s.year === '2ND YEAR' && s.admType === 'LATERAL'))
      : ss;
    const tot = eligible.reduce((a, s) => a + amt(s, h.key), 0);
    if (eligible.length > 0 && tot > 0) {
      let toGov = 0, toSVK = 0, toSMP = 0;
      if (isAided) {
        if (h.key === 'dvp' || h.key === 'adm') {
          toGov = tot / 2; toSVK = tot / 2;
        } else if (h.key === 'lab' || h.key === 'rr' || h.key === 'mag' || h.key === 'idCard') {
          toGov = tot / 2; toSMP = tot / 2;
        } else {
          toSMP = tot;
        }
      } else {
        if (h.key === 'dvp' || h.key === 'adm') toSVK = tot;
        else toSMP = tot;
      }
      rows.push({
        slNo: n++, feeType: h.label,
        studentCount: eligible.length, feeAmountPerStudent: Math.round(tot / eligible.length),
        totalCollected: tot, toGov, toSVK, toSMP,
      });
    }
  }

  // ── Fine — from paid fee records, 100% to Government ──
  let fineCount = 0, fineTot = 0;
  for (const s of ss) {
    const f = finePaidMap.get(s.id) ?? 0;
    if (f > 0) { fineCount++; fineTot += f; }
  }
  if (fineTot > 0) {
    rows.push({
      slNo: n++, feeType: 'FINE',
      studentCount: fineCount, feeAmountPerStudent: Math.round(fineTot / fineCount),
      totalCollected: fineTot, toGov: fineTot, toSVK: 0, toSMP: 0,
    });
  }

  return rows;
}

function RemittanceTable({ dist, headerColor }: { dist: FeeDistRow[]; headerColor: string }) {
  const totals = dist.reduce(
    (a, r) => ({ tot: a.tot + r.totalCollected, gov: a.gov + r.toGov, svk: a.svk + r.toSVK, smp: a.smp + r.toSMP }),
    { tot: 0, gov: 0, svk: 0, smp: 0 },
  );
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
      <table className="w-full text-[10px]">
        <thead className={`${headerColor} text-white`}>
          <tr>
            <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
            <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Fee Type</th>
            <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Students</th>
            <th className="px-2 py-1.5 text-right font-semibold" rowSpan={2}>Fee Amt (₹)</th>
            <th className="px-2 py-1.5 text-right font-semibold" rowSpan={2}>Total Allotted</th>
            <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Fee Remittance (₹)</th>
          </tr>
          <tr>
            <th className="px-2 py-1 text-right font-semibold border-l border-white/30">To Govt.</th>
            <th className="px-2 py-1 text-right font-semibold">To SVK</th>
            <th className="px-2 py-1 text-right font-semibold">To SMP</th>
          </tr>
        </thead>
        <tbody>
          {dist.map((r, i) => (
            <tr key={r.slNo} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-2 py-1.5 text-center text-gray-400">{r.slNo}</td>
              <td className="px-2 py-1.5 font-medium">{r.feeType}</td>
              <td className="px-2 py-1.5 text-center">{r.studentCount}</td>
              <td className="px-2 py-1.5 text-right">{fmt(r.feeAmountPerStudent)}</td>
              <td className="px-2 py-1.5 text-right font-semibold">{fmt(r.totalCollected)}</td>
              <td className="px-2 py-1.5 text-right border-l border-gray-100">{r.toGov > 0 ? fmt(r.toGov) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{r.toSVK > 0 ? fmt(r.toSVK) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{r.toSMP > 0 ? fmt(r.toSMP) : '—'}</td>
            </tr>
          ))}
          {dist.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No data for the selected filters.</td></tr>
          )}
        </tbody>
        {dist.length > 0 && (
          <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-[10px]">
            <tr>
              <td className="px-2 py-2" colSpan={4}>GRAND TOTAL</td>
              <td className="px-2 py-2 text-right">{fmt(totals.tot)}</td>
              <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(totals.gov)}</td>
              <td className="px-2 py-2 text-right">{fmt(totals.svk)}</td>
              <td className="px-2 py-2 text-right">{fmt(totals.smp)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function FeeDistributionTab({
  students,
  feeStructures,
  feeRecords,
  academicYear: _academicYear,
}: {
  students: Student[];
  feeStructures: FeeStructure[];
  feeRecords: FeeRecord[];
  academicYear: string;
}) {
  type DistCourseType = '' | 'Aided' | 'Unaided';
  type TableView = 'all' | 'studentstats' | 'summary' | 'aided' | 'unaided' | 'combined';

  const [courseTypeFilter, setCourseTypeFilter] = useState<DistCourseType>('');
  const [yearFilter2,      setYearFilter2]      = useState<Year | ''>('');
  const [courseFilter2,    setCourseFilter2]    = useState<Course | ''>('');
  const [admTypeFilter2,   setAdmTypeFilter2]   = useState<'' | 'REGULAR' | 'LATERAL' | 'REPEATER' | 'SNQ'>('');
  const [tableView,        setTableView]        = useState<TableView>('all');

  // ── Look-up maps ──
  const structMap = useMemo(() => {
    const m = new Map<string, FeeStructure>();
    for (const s of feeStructures) {
      m.set(`${s.course}__${s.year}__${s.admType}__${s.admCat}`, s);
    }
    return m;
  }, [feeStructures]);

  const finePaidMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of feeRecords) m.set(r.studentId, (m.get(r.studentId) ?? 0) + r.smp.fine);
    return m;
  }, [feeRecords]);

  // ── CONFIRMED students only ──
  const confirmedStudents = useMemo(
    () => students.filter(s => s.admissionStatus?.trim() === 'CONFIRMED'),
    [students],
  );

  // ── Apply own filters ──
  const filteredStudents = useMemo(() => {
    let ss = confirmedStudents;
    if (courseTypeFilter === 'Aided')   ss = ss.filter(s => (AIDED_COURSES as Course[]).includes(s.course));
    if (courseTypeFilter === 'Unaided') ss = ss.filter(s => (UNAIDED_COURSES as Course[]).includes(s.course));
    if (yearFilter2)    ss = ss.filter(s => s.year   === yearFilter2);
    if (courseFilter2)  ss = ss.filter(s => s.course === courseFilter2);
    if (admTypeFilter2) {
      ss = ss.filter(s => {
        if (admTypeFilter2 === 'SNQ')      return s.admCat === 'SNQ';
        if (admTypeFilter2 === 'LATERAL')  return s.admType === 'LATERAL'  && s.admCat !== 'SNQ';
        if (admTypeFilter2 === 'REPEATER') return s.admType === 'REPEATER' && s.admCat !== 'SNQ';
        // REGULAR: REGULAR + EXTERNAL + SNQ-admType rows that aren't lateral/repeater
        return s.admCat !== 'SNQ' && s.admType !== 'LATERAL' && s.admType !== 'REPEATER';
      });
    }
    return ss;
  }, [confirmedStudents, courseTypeFilter, yearFilter2, courseFilter2, admTypeFilter2]);

  const aidedFiltered   = useMemo(() => filteredStudents.filter(s => (AIDED_COURSES as Course[]).includes(s.course)),   [filteredStudents]);
  const unaidedFiltered = useMemo(() => filteredStudents.filter(s => (UNAIDED_COURSES as Course[]).includes(s.course)), [filteredStudents]);

  // ── Distribution calculations ──
  const aidedDist   = useMemo(() => calcDistribution(aidedFiltered,   true,  structMap, finePaidMap), [aidedFiltered,   structMap, finePaidMap]);
  const unaidedDist = useMemo(() => calcDistribution(unaidedFiltered, false, structMap, finePaidMap), [unaidedFiltered, structMap, finePaidMap]);

  const aidedTotals   = useMemo(() => aidedDist.reduce(  (a, r) => ({ tot: a.tot + r.totalCollected, gov: a.gov + r.toGov, svk: a.svk + r.toSVK, smp: a.smp + r.toSMP }), { tot: 0, gov: 0, svk: 0, smp: 0 }), [aidedDist]);
  const unaidedTotals = useMemo(() => unaidedDist.reduce((a, r) => ({ tot: a.tot + r.totalCollected, gov: a.gov + r.toGov, svk: a.svk + r.toSVK, smp: a.smp + r.toSMP }), { tot: 0, gov: 0, svk: 0, smp: 0 }), [unaidedDist]);
  const grandTotals   = useMemo(() => ({
    tot: aidedTotals.tot + unaidedTotals.tot,
    gov: aidedTotals.gov + unaidedTotals.gov,
    svk: aidedTotals.svk + unaidedTotals.svk,
    smp: aidedTotals.smp + unaidedTotals.smp,
  }), [aidedTotals, unaidedTotals]);

  // ── Student statistics for summary table ──
  const studentStats = useMemo(() => {
    const allCourses = COURSES;
    type YrStat = { reg: number; lat: number; snq: number; total: number };
    const stats: Record<Course, { yr1: YrStat; yr2: YrStat; yr3: YrStat; grand: number }> = {} as never;
    for (const c of allCourses) {
      stats[c] = {
        yr1: { reg: 0, lat: 0, snq: 0, total: 0 },
        yr2: { reg: 0, lat: 0, snq: 0, total: 0 },
        yr3: { reg: 0, lat: 0, snq: 0, total: 0 },
        grand: 0,
      };
    }
    for (const s of filteredStudents) {
      if (!stats[s.course]) continue;
      const yr = s.year === '1ST YEAR' ? 'yr1' : s.year === '2ND YEAR' ? 'yr2' : 'yr3';
      const yrStat = stats[s.course][yr];
      if (s.admCat === 'SNQ') {
        yrStat.snq++;
      } else if (s.admType === 'LATERAL' && s.year !== '3RD YEAR') {
        yrStat.lat++;
      } else {
        yrStat.reg++;
      }
      yrStat.total++;
      stats[s.course].grand++;
    }
    return stats;
  }, [filteredStudents]);

  const grandStatTotals = useMemo(() => {
    const gt = { yr1: { reg: 0, snq: 0, total: 0 }, yr2: { reg: 0, lat: 0, snq: 0, total: 0 }, yr3: { reg: 0, snq: 0, total: 0 }, grand: 0 };
    for (const c of COURSES) {
      gt.yr1.reg   += studentStats[c].yr1.reg;
      gt.yr1.snq   += studentStats[c].yr1.snq;
      gt.yr1.total += studentStats[c].yr1.total;
      gt.yr2.reg   += studentStats[c].yr2.reg;
      gt.yr2.lat   += studentStats[c].yr2.lat;
      gt.yr2.snq   += studentStats[c].yr2.snq;
      gt.yr2.total += studentStats[c].yr2.total;
      gt.yr3.reg   += studentStats[c].yr3.reg;
      gt.yr3.snq   += studentStats[c].yr3.snq;
      gt.yr3.total += studentStats[c].yr3.total;
      gt.grand     += studentStats[c].grand;
    }
    return gt;
  }, [studentStats]);

  function clearFilters() {
    setCourseTypeFilter('');
    setYearFilter2('');
    setCourseFilter2('');
    setAdmTypeFilter2('');
    setTableView('all');
  }

  // ── Excel export ──
  function exportDistExcel() {
    const wb = XLSX.utils.book_new();

    // Student Statistics sheet
    const statsRows: (string | number)[][] = [
      ['Sl No', 'Course', '1st Yr Regular', '1st Yr SNQ', '1st Yr Total', '2nd Yr Regular', '2nd Yr Lateral', '2nd Yr SNQ', '2nd Yr Total', '3rd Yr Regular', '3rd Yr SNQ', '3rd Yr Total', 'Grand Total'],
    ];
    COURSES.forEach((c, i) => {
      const st = studentStats[c];
      const courseType = (AIDED_COURSES as Course[]).includes(c) ? 'Aided' : 'Unaided';
      statsRows.push([i + 1, `${c} (${courseType})`, st.yr1.reg, st.yr1.snq, st.yr1.total, st.yr2.reg, st.yr2.lat, st.yr2.snq, st.yr2.total, st.yr3.reg, st.yr3.snq, st.yr3.total, st.grand]);
    });
    statsRows.push(['', 'GRAND TOTAL', grandStatTotals.yr1.reg, grandStatTotals.yr1.snq, grandStatTotals.yr1.total, grandStatTotals.yr2.reg, grandStatTotals.yr2.lat, grandStatTotals.yr2.snq, grandStatTotals.yr2.total, grandStatTotals.yr3.reg, grandStatTotals.yr3.snq, grandStatTotals.yr3.total, grandStatTotals.grand]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(statsRows), 'Student Statistics');

    // Summary sheet
    const sumRows: (string | number)[][] = [
      ['Course Type', 'Total Students', 'Total Fee Allotted', 'To Government', 'To SVK Management', 'To SMP'],
      ['Aided Courses (CE, ME, EC, CS)', aidedFiltered.length, aidedTotals.tot, aidedTotals.gov, aidedTotals.svk, aidedTotals.smp],
      ['Unaided Course (EE)', unaidedFiltered.length, unaidedTotals.tot, unaidedTotals.gov, unaidedTotals.svk, unaidedTotals.smp],
      ['GRAND TOTAL', filteredStudents.length, grandTotals.tot, grandTotals.gov, grandTotals.svk, grandTotals.smp],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Distribution Summary');

    // Aided sheet
    const aidedRows: (string | number)[][] = [['Sl No', 'Fee Type', 'Students', 'Fee Amount', 'Total Allotted', 'To Govt', 'To SVK', 'To SMP']];
    aidedDist.forEach(r => aidedRows.push([r.slNo, r.feeType, r.studentCount, r.feeAmountPerStudent, r.totalCollected, r.toGov, r.toSVK, r.toSMP]));
    aidedRows.push(['', 'GRAND TOTAL', '', '', aidedTotals.tot, aidedTotals.gov, aidedTotals.svk, aidedTotals.smp]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aidedRows), 'Aided Courses');

    // Unaided sheet
    const unaidedRows: (string | number)[][] = [['Sl No', 'Fee Type', 'Students', 'Fee Amount', 'Total Allotted', 'To Govt', 'To SVK', 'To SMP']];
    unaidedDist.forEach(r => unaidedRows.push([r.slNo, r.feeType, r.studentCount, r.feeAmountPerStudent, r.totalCollected, r.toGov, r.toSVK, r.toSMP]));
    unaidedRows.push(['', 'GRAND TOTAL', '', '', unaidedTotals.tot, unaidedTotals.gov, unaidedTotals.svk, unaidedTotals.smp]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(unaidedRows), 'Unaided Course');

    // Combined sheet
    const combinedRows: (string | number)[][] = [['Sl No', 'Course Type', 'Fee Type', 'Students', 'Fee Amount', 'Total Allotted', 'To Govt', 'To SVK', 'To SMP']];
    let cn = 1;
    aidedDist.forEach(r => combinedRows.push([cn++, 'Aided', r.feeType, r.studentCount, r.feeAmountPerStudent, r.totalCollected, r.toGov, r.toSVK, r.toSMP]));
    unaidedDist.forEach(r => combinedRows.push([cn++, 'Unaided', r.feeType, r.studentCount, r.feeAmountPerStudent, r.totalCollected, r.toGov, r.toSVK, r.toSMP]));
    combinedRows.push(['', '', 'GRAND TOTAL', '', '', grandTotals.tot, grandTotals.gov, grandTotals.svk, grandTotals.smp]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(combinedRows), 'Combined');

    XLSX.writeFile(wb, `SMP_Fee_Distribution_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  const show = (v: TableView) => tableView === 'all' || tableView === v;

  return (
    <div className="space-y-5">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Students',    value: filteredStudents.length.toString(),    color: 'text-blue-700',  bg: 'bg-blue-50',  border: 'border-blue-200'  },
          { label: 'Total Fee Allotted', value: fmt(grandTotals.tot),                 color: 'text-gray-700',  bg: 'bg-gray-50',  border: 'border-gray-200'  },
          { label: 'To Government',     value: fmt(grandTotals.gov),                  color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200'   },
          { label: 'To SVK Management', value: fmt(grandTotals.svk),                  color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
          { label: 'To SMP',            value: fmt(grandTotals.smp),                  color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200'  },
          { label: 'Aided Students',    value: aidedFiltered.length.toString(),        color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
          { label: 'Unaided Students',  value: unaidedFiltered.length.toString(),      color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200' },
        ].map(c => (
          <div key={c.label} className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={courseTypeFilter} onChange={e => setCourseTypeFilter(e.target.value as DistCourseType)} className={fs}>
          <option value="">All Courses</option>
          <option value="Aided">Aided (CE, ME, EC, CS)</option>
          <option value="Unaided">Unaided (EE)</option>
        </select>
        <select value={yearFilter2} onChange={e => setYearFilter2(e.target.value as Year | '')} className={fs}>
          <option value="">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={courseFilter2} onChange={e => setCourseFilter2(e.target.value as Course | '')} className={fs}>
          <option value="">All Courses</option>
          {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={admTypeFilter2} onChange={e => setAdmTypeFilter2(e.target.value as typeof admTypeFilter2)} className={fs}>
          <option value="">All Adm Types</option>
          <option value="REGULAR">Regular</option>
          <option value="LATERAL">Lateral</option>
          <option value="REPEATER">Repeater</option>
          <option value="SNQ">SNQ</option>
        </select>
        <select value={tableView} onChange={e => setTableView(e.target.value as TableView)} className={fs}>
          <option value="all">All Tables</option>
          <option value="studentstats">Student Statistics Only</option>
          <option value="summary">Summary Only</option>
          <option value="aided">Aided Distribution Only</option>
          <option value="unaided">Unaided Distribution Only</option>
          <option value="combined">Combined Distribution Only</option>
        </select>
        <button
          onClick={clearFilters}
          className="px-3 py-1.5 rounded border text-xs font-medium transition-colors border-gray-200 bg-white text-gray-400 hover:border-gray-300"
        >
          Clear Filters
        </button>
        <div className="flex gap-2 ml-auto">
          <Button variant="secondary" size="sm" onClick={exportDistExcel}>Excel</Button>
        </div>
      </div>

      {/* ── Student Statistics Summary ── */}
      {show('studentstats') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">SMP Students Statistics Summary</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
                  <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Course</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>1st Year</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={4}>2nd Year</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>3rd Year</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" rowSpan={2}>Grand Total</th>
                </tr>
                <tr>
                  <th className="px-2 py-1 font-semibold border-l border-white/30">Regular</th>
                  <th className="px-2 py-1 font-semibold">SNQ</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                  <th className="px-2 py-1 font-semibold border-l border-white/30">Regular</th>
                  <th className="px-2 py-1 font-semibold">Lateral</th>
                  <th className="px-2 py-1 font-semibold">SNQ</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                  <th className="px-2 py-1 font-semibold border-l border-white/30">Regular</th>
                  <th className="px-2 py-1 font-semibold">SNQ</th>
                  <th className="px-2 py-1 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {COURSES.map((c, i) => {
                  const st = studentStats[c];
                  const courseType = (AIDED_COURSES as Course[]).includes(c) ? 'Aided' : 'Unaided';
                  return (
                    <tr key={c} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                      <td className="px-2 py-1.5 font-semibold">{c} <span className="text-gray-400 font-normal">({courseType})</span></td>
                      <td className="px-2 py-1.5 text-center border-l border-gray-100">{st.yr1.reg || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{st.yr1.snq || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{st.yr1.total || '—'}</td>
                      <td className="px-2 py-1.5 text-center border-l border-gray-100">{st.yr2.reg || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{st.yr2.lat || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{st.yr2.snq || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{st.yr2.total || '—'}</td>
                      <td className="px-2 py-1.5 text-center border-l border-gray-100">{st.yr3.reg || '—'}</td>
                      <td className="px-2 py-1.5 text-center">{st.yr3.snq || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{st.yr3.total || '—'}</td>
                      <td className="px-2 py-1.5 text-center font-bold border-l border-gray-100">{st.grand || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-[10px]">
                <tr>
                  <td className="px-2 py-2" colSpan={2}>GRAND TOTAL</td>
                  <td className="px-2 py-2 text-center border-l border-gray-200">{grandStatTotals.yr1.reg}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr1.snq}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr1.total}</td>
                  <td className="px-2 py-2 text-center border-l border-gray-200">{grandStatTotals.yr2.reg}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr2.lat}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr2.snq}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr2.total}</td>
                  <td className="px-2 py-2 text-center border-l border-gray-200">{grandStatTotals.yr3.reg}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr3.snq}</td>
                  <td className="px-2 py-2 text-center">{grandStatTotals.yr3.total}</td>
                  <td className="px-2 py-2 text-center border-l border-gray-200">{grandStatTotals.grand}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Fee Distribution Summary ── */}
      {show('summary') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Fee Distribution Summary</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Course Type</th>
                  <th className="px-2 py-1.5 text-center font-semibold">Students</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Total Fee Allotted</th>
                  <th className="px-2 py-1.5 text-right font-semibold">To Government</th>
                  <th className="px-2 py-1.5 text-right font-semibold">To SVK Management</th>
                  <th className="px-2 py-1.5 text-right font-semibold">To SMP</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-indigo-50">
                  <td className="px-2 py-1.5 font-semibold">Aided Courses (CE, ME, EC, CS)</td>
                  <td className="px-2 py-1.5 text-center">{aidedFiltered.length}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(aidedTotals.tot)}</td>
                  <td className="px-2 py-1.5 text-right text-red-700">{fmt(aidedTotals.gov)}</td>
                  <td className="px-2 py-1.5 text-right text-violet-700">{fmt(aidedTotals.svk)}</td>
                  <td className="px-2 py-1.5 text-right text-green-700">{fmt(aidedTotals.smp)}</td>
                </tr>
                <tr className="bg-amber-50">
                  <td className="px-2 py-1.5 font-semibold">Unaided Course (EE)</td>
                  <td className="px-2 py-1.5 text-center">{unaidedFiltered.length}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(unaidedTotals.tot)}</td>
                  <td className="px-2 py-1.5 text-right text-red-700">{fmt(unaidedTotals.gov)}</td>
                  <td className="px-2 py-1.5 text-right text-violet-700">{fmt(unaidedTotals.svk)}</td>
                  <td className="px-2 py-1.5 text-right text-green-700">{fmt(unaidedTotals.smp)}</td>
                </tr>
              </tbody>
              <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-[10px]">
                <tr>
                  <td className="px-2 py-2">GRAND TOTAL</td>
                  <td className="px-2 py-2 text-center">{filteredStudents.length}</td>
                  <td className="px-2 py-2 text-right">{fmt(grandTotals.tot)}</td>
                  <td className="px-2 py-2 text-right text-red-700">{fmt(grandTotals.gov)}</td>
                  <td className="px-2 py-2 text-right text-violet-700">{fmt(grandTotals.svk)}</td>
                  <td className="px-2 py-2 text-right text-green-700">{fmt(grandTotals.smp)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Aided Courses Fee Remittance Abstract ── */}
      {show('aided') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Fee Remittance Abstract — Aided Courses (CE, ME, EC, CS)</h2>
          <RemittanceTable dist={aidedDist} headerColor="bg-indigo-600" />
        </div>
      )}

      {/* ── Unaided Course Fee Remittance Abstract ── */}
      {show('unaided') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Fee Remittance Abstract — Unaided Course (EE)</h2>
          <RemittanceTable dist={unaidedDist} headerColor="bg-amber-600" />
        </div>
      )}

      {/* ── Combined Fee Remittance Abstract ── */}
      {show('combined') && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Combined Fee Remittance Abstract (Aided &amp; Unaided)</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-gray-700 text-white">
                <tr>
                  <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Sl</th>
                  <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Course Type</th>
                  <th className="px-2 py-1.5 font-semibold" rowSpan={2}>Fee Type</th>
                  <th className="px-2 py-1.5 text-center font-semibold" rowSpan={2}>Students</th>
                  <th className="px-2 py-1.5 text-right font-semibold" rowSpan={2}>Fee Amt (₹)</th>
                  <th className="px-2 py-1.5 text-right font-semibold" rowSpan={2}>Total Allotted</th>
                  <th className="px-2 py-1.5 text-center font-semibold border-l border-white/30" colSpan={3}>Fee Remittance (₹)</th>
                </tr>
                <tr>
                  <th className="px-2 py-1 text-right font-semibold border-l border-white/30">To Govt.</th>
                  <th className="px-2 py-1 text-right font-semibold">To SVK</th>
                  <th className="px-2 py-1 text-right font-semibold">To SMP</th>
                </tr>
              </thead>
              <tbody>
                {aidedDist.map((r, i) => (
                  <tr key={`a-${r.slNo}`} className={i % 2 === 0 ? 'bg-indigo-50/40' : 'bg-white'}>
                    <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-indigo-700">Aided</td>
                    <td className="px-2 py-1.5 font-medium">{r.feeType}</td>
                    <td className="px-2 py-1.5 text-center">{r.studentCount}</td>
                    <td className="px-2 py-1.5 text-right">{fmt(r.feeAmountPerStudent)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{fmt(r.totalCollected)}</td>
                    <td className="px-2 py-1.5 text-right border-l border-gray-100">{r.toGov > 0 ? fmt(r.toGov) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.toSVK > 0 ? fmt(r.toSVK) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.toSMP > 0 ? fmt(r.toSMP) : '—'}</td>
                  </tr>
                ))}
                {unaidedDist.map((r, i) => (
                  <tr key={`u-${r.slNo}`} className={i % 2 === 0 ? 'bg-amber-50/40' : 'bg-white'}>
                    <td className="px-2 py-1.5 text-center text-gray-400">{aidedDist.length + i + 1}</td>
                    <td className="px-2 py-1.5 font-medium text-amber-700">Unaided</td>
                    <td className="px-2 py-1.5 font-medium">{r.feeType}</td>
                    <td className="px-2 py-1.5 text-center">{r.studentCount}</td>
                    <td className="px-2 py-1.5 text-right">{fmt(r.feeAmountPerStudent)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{fmt(r.totalCollected)}</td>
                    <td className="px-2 py-1.5 text-right border-l border-gray-100">{r.toGov > 0 ? fmt(r.toGov) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.toSVK > 0 ? fmt(r.toSVK) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{r.toSMP > 0 ? fmt(r.toSMP) : '—'}</td>
                  </tr>
                ))}
                {aidedDist.length === 0 && unaidedDist.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">No data for the selected filters.</td></tr>
                )}
              </tbody>
              {(aidedDist.length > 0 || unaidedDist.length > 0) && (
                <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-[10px]">
                  <tr>
                    <td className="px-2 py-2" colSpan={5}>GRAND TOTAL</td>
                    <td className="px-2 py-2 text-right">{fmt(grandTotals.tot)}</td>
                    <td className="px-2 py-2 text-right border-l border-gray-200">{fmt(grandTotals.gov)}</td>
                    <td className="px-2 py-2 text-right">{fmt(grandTotals.svk)}</td>
                    <td className="px-2 py-2 text-right">{fmt(grandTotals.smp)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Distribution Rules legend */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-[10px] text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600 text-xs mb-1">Distribution Rules</p>
        <p><span className="font-medium text-indigo-700">Aided (CE, ME, EC, CS):</span> Tuition / DVP / Admission → 50% Govt + 50% SVK | Lab / RR / Magazine / ID Card → 50% Govt + 50% SMP | Sports / Association / Library / SWF / TWF / NSS → 100% SMP | Fine → 100% Govt</p>
        <p><span className="font-medium text-amber-700">Unaided (EE):</span> Tuition / DVP / Admission → 100% SVK | All other fees → 100% SMP | Fine → 100% Govt</p>
        <p className="text-gray-400">Library fee applies only to 1st Year students and Lateral entry 2nd Year students. Fine is based on actual paid amounts from fee records.</p>
      </div>
    </div>
  );
}

// ── Shared filter props + component ───────────────────────────────────────────
interface CommonFilterProps {
  aidedFilter: 'AIDED' | 'UNAIDED' | '';
  setAidedFilter: (v: 'AIDED' | 'UNAIDED' | '') => void;
  courseFilter: Course | '';
  setCourseFilter: (v: Course | '') => void;
  yearFilter: Year | '';
  setYearFilter: (v: Year | '') => void;
  admTypeFilter: AdmType | '';
  setAdmTypeFilter: (v: AdmType | '') => void;
  admCatFilter: AdmCat | '';
  setAdmCatFilter: (v: AdmCat | '') => void;
  feeStatusFilter: FeeStatus;
  setFeeStatusFilter: (v: FeeStatus) => void;
  stats: { total: number; paidCount: number; notPaid: number; duesCount: number; noDuesCount: number };
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

function CommonFilters({ fp }: { fp: CommonFilterProps }) {
  return (
    <div className="space-y-2 pb-3 mb-4 border-b border-gray-100">
      {fp.stats.total > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Total"       count={fp.stats.total}       active={fp.feeStatusFilter === 'ALL'}          colorClass="border-gray-400 bg-gray-100 text-gray-700"         onClick={() => fp.setFeeStatusFilter('ALL')} />
          <Chip label="Paid"        count={fp.stats.paidCount}   active={fp.feeStatusFilter === 'PAID'}         colorClass="border-green-400 bg-green-100 text-green-700"       onClick={() => fp.setFeeStatusFilter('PAID')} />
          <Chip label="Not Paid"    count={fp.stats.notPaid}     active={fp.feeStatusFilter === 'NOT_PAID'}     colorClass="border-red-400 bg-red-100 text-red-700"             onClick={() => fp.setFeeStatusFilter('NOT_PAID')} />
          <Chip label="Fee Dues"    count={fp.stats.duesCount}   active={fp.feeStatusFilter === 'FEE_DUES'}     colorClass="border-amber-400 bg-amber-100 text-amber-700"       onClick={() => fp.setFeeStatusFilter('FEE_DUES')} />
          <Chip label="No Fee Dues" count={fp.stats.noDuesCount} active={fp.feeStatusFilter === 'NO_FEE_DUES'}  colorClass="border-emerald-400 bg-emerald-100 text-emerald-700" onClick={() => fp.setFeeStatusFilter('NO_FEE_DUES')} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={fp.aidedFilter} onChange={(e) => fp.setAidedFilter(e.target.value as 'AIDED' | 'UNAIDED' | '')} className={fs}>
          <option value="">Aided &amp; Unaided</option>
          <option value="AIDED">Aided (CE, ME, EC, CS)</option>
          <option value="UNAIDED">Unaided (EE)</option>
        </select>
        <select value={fp.courseFilter} onChange={(e) => fp.setCourseFilter(e.target.value as Course | '')} className={fs}>
          <option value="">All Courses</option>
          {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fp.yearFilter} onChange={(e) => fp.setYearFilter(e.target.value as Year | '')} className={fs}>
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={fp.admTypeFilter} onChange={(e) => fp.setAdmTypeFilter(e.target.value as AdmType | '')} className={fs}>
          <option value="">All Adm Types</option>
          {ADM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fp.admCatFilter} onChange={(e) => fp.setAdmCatFilter(e.target.value as AdmCat | '')} className={fs}>
          <option value="">All Adm Cats</option>
          {ADM_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fp.feeStatusFilter} onChange={(e) => fp.setFeeStatusFilter(e.target.value as FeeStatus)} className={fs}>
          <option value="ALL">All Fee Status</option>
          <option value="PAID">Paid</option>
          <option value="NOT_PAID">Not Paid</option>
          <option value="FEE_DUES">Fee Dues</option>
          <option value="NO_FEE_DUES">No Fee Dues</option>
        </select>
        <button
          onClick={fp.clearFilters}
          className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
            fp.hasActiveFilters
              ? 'border-orange-400 bg-orange-50 text-orange-700 hover:bg-orange-100'
              : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
          }`}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function FeeReportsPage() {
  const { settings, loading: settingsLoading } = useSettings();
  const academicYear = (settings?.currentAcademicYear ?? null) as AcademicYear | null;

  const [aidedFilter,     setAidedFilter]     = useState<'AIDED' | 'UNAIDED' | ''>('');
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
  // Only CONFIRMED students appear in student-based tabs (Statistics, Fee List, Dues, Course & Year, Consolidated).
  // Cancelled students with paid fees still appear in receipt-based tabs (Daily Collections, Datewise Headwise, Bank Remittance)
  // because those tabs consume raw feeRecords directly, not this list.
  const allStudentRows = useMemo((): StudentFeeRow[] =>
    allStudents.filter((s) => s.admissionStatus?.trim() === 'CONFIRMED').map((s) => {
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
    if (aidedFilter === 'AIDED')   rows = rows.filter((r) => (AIDED_COURSES as Course[]).includes(r.student.course));
    if (aidedFilter === 'UNAIDED') rows = rows.filter((r) => (UNAIDED_COURSES as Course[]).includes(r.student.course));
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
  }, [allStudentRows, aidedFilter, courseFilter, yearFilter, admTypeFilter, admCatFilter, feeStatusFilter]);

  // ── Filtered fee records (Consolidated tab) ───────────────────────────────
  const filteredFeeRecords = useMemo(() => {
    if (!aidedFilter && !courseFilter && !yearFilter && !admTypeFilter && !admCatFilter && feeStatusFilter === 'ALL')
      return feeRecords;
    const ids = new Set(filteredRows.map((r) => r.student.id));
    return feeRecords.filter((r) => ids.has(r.studentId));
  }, [feeRecords, filteredRows, aidedFilter, courseFilter, yearFilter, admTypeFilter, admCatFilter, feeStatusFilter]);

  const hasActiveFilters =
    !!aidedFilter || !!courseFilter || !!yearFilter || !!admTypeFilter || !!admCatFilter || feeStatusFilter !== 'ALL';

  function clearFilters() {
    setAidedFilter(''); setCourseFilter(''); setYearFilter(''); setAdmTypeFilter(''); setAdmCatFilter('');
    setFeeStatusFilter('ALL');
  }

  const loading = settingsLoading || studentsLoading || feeLoading || overridesLoading;

  const tabsScrollRef = useRef<HTMLDivElement>(null);
  function scrollTabs(dir: 'left' | 'right') {
    tabsScrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  }

  const fp: CommonFilterProps = {
    aidedFilter, setAidedFilter,
    courseFilter, setCourseFilter,
    yearFilter, setYearFilter,
    admTypeFilter, setAdmTypeFilter,
    admCatFilter, setAdmCatFilter,
    feeStatusFilter, setFeeStatusFilter,
    stats,
    hasActiveFilters,
    clearFilters,
  };

  return (
    <div style={{ animation: 'page-enter 0.22s ease-out' }}>
      {/* Header — stays at top, not sticky */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">Fee Reports</h1>
          {academicYear && <p className="text-xs text-gray-400 mt-0.5">{academicYear}</p>}
        </div>
      </div>

      {/* Sticky tab bar */}
      <div className="sticky -top-4 -mx-4 z-20 bg-white border-b border-gray-200" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-1 px-2 py-2">
          {/* Left arrow */}
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer text-base leading-none select-none"
            aria-label="Scroll left"
          >‹</button>

          {/* Tabs — scrollable, no scrollbar */}
          <div ref={tabsScrollRef} className="chips-scroll flex items-center gap-1 flex-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right arrow */}
          <button
            type="button"
            onClick={() => scrollTabs('right')}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer text-base leading-none select-none"
            aria-label="Scroll right"
          >›</button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-5">
        {loading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
        ) : !academicYear ? (
          <p className="text-sm text-gray-400 py-8 text-center">No academic year configured.</p>
        ) : (
          <>
            {activeTab === 'statistics'        && <StatisticsTab       rows={filteredRows}             academicYear={academicYear} fp={fp} />}
            {activeTab === 'fee-list'          && <FeeListTab          rows={filteredRows}             academicYear={academicYear} fp={fp} />}
            {activeTab === 'dues'              && <DuesTab             rows={filteredRows}             academicYear={academicYear} fp={fp} />}
            {activeTab === 'course-year'       && <CourseYearTab       rows={filteredRows}             academicYear={academicYear} fp={fp} />}
            {activeTab === 'consolidated'      && <ConsolidatedTab     feeRecords={filteredFeeRecords}  academicYear={academicYear} fp={fp} />}
            {activeTab === 'daily-collections' && <DailyCollectionsTab feeRecords={feeRecords}          academicYear={academicYear} />}
            {activeTab === 'day-summary'       && <DaySummaryTab       feeRecords={feeRecords}          academicYear={academicYear} />}
            {activeTab === 'datewise-headwise' && <DatewiseHeadwiseTab feeRecords={filteredFeeRecords}  academicYear={academicYear} fp={fp} />}
            {activeTab === 'bank-remittance'   && <BankRemittanceTab   feeRecords={feeRecords}          academicYear={academicYear} />}
            {activeTab === 'fee-distribution'  && <FeeDistributionTab  students={allStudents} feeStructures={feeStructures} feeRecords={feeRecords} academicYear={academicYear} />}
          </>
        )}
      </div>
    </div>
  );
}
