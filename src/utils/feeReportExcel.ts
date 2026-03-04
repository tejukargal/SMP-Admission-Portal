import * as XLSX from 'xlsx';
import type { FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';
import type { StudentFeeRow } from './feeReportPdf';

// ── 1. Statistics ──────────────────────────────────────────────────────────────
export function exportStatsExcel(rows: StudentFeeRow[], academicYear: string): void {
  const total       = rows.length;
  const paidCount   = rows.filter((r) => r.paid > 0).length;
  const notPaid     = total - paidCount;
  const duesCount   = rows.filter((r) => r.balance !== null && r.balance > 0).length;
  const noDuesCount = rows.filter((r) => r.balance !== null && r.balance <= 0).length;
  const totAllotted = rows.reduce((s, r) => s + (r.allotted ?? 0), 0);
  const totPaid     = rows.reduce((s, r) => s + r.paid, 0);
  const totBalance  = rows.reduce((s, r) => s + (r.balance ?? 0), 0);

  const breakdown = new Map<string, {
    course: string; year: string; total: number; paid: number; allotted: number; collected: number;
  }>();
  for (const r of rows) {
    const key = `${r.student.course}__${r.student.year}`;
    if (!breakdown.has(key)) {
      breakdown.set(key, {
        course: r.student.course, year: r.student.year,
        total: 0, paid: 0, allotted: 0, collected: 0,
      });
    }
    const e = breakdown.get(key)!;
    e.total++;
    if (r.paid > 0) e.paid++;
    e.allotted  += r.allotted ?? 0;
    e.collected += r.paid;
  }
  const bRows = Array.from(breakdown.values()).sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    return c !== 0 ? c : a.year.localeCompare(b.year);
  });

  const data: (string | number | null)[][] = [
    [`SMP Admissions — Fee Statistics`],
    [`Academic Year: ${academicYear}`],
    [],
    ['Metric', 'Value'],
    ['Total Students', total],
    ['Paid', paidCount],
    ['Not Paid', notPaid],
    ['Fee Dues', duesCount],
    ['No Fee Dues', noDuesCount],
    ['Total Allotted', totAllotted],
    ['Total Collected', totPaid],
    ['Outstanding Balance', totBalance],
    [],
    ['Course & Year Breakdown'],
    ['Course', 'Year', 'Students', 'Paid', 'Allotted', 'Collected', 'Balance'],
    ...bRows.map((b) => [
      b.course, b.year, b.total, b.paid, b.allotted, b.collected, b.allotted - b.collected,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Statistics');
  XLSX.writeFile(wb, `fee-statistics-${academicYear}.xlsx`);
}

// ── 2. Fee List ────────────────────────────────────────────────────────────────
export function exportFeeListExcel(rows: StudentFeeRow[], academicYear: string): void {
  const data: (string | number | null)[][] = [
    [`SMP Admissions — Fee List`],
    [`Academic Year: ${academicYear}`],
    [],
    ['Sl', 'Name', 'Reg No', 'Course', 'Year', 'Allotted', 'Paid', 'Balance'],
    ...rows.map((r, i) => [
      i + 1,
      r.student.studentNameSSLC,
      r.student.regNumber || '',
      r.student.course,
      r.student.year,
      r.allotted ?? null,
      r.paid,
      r.balance ?? null,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee List');
  XLSX.writeFile(wb, `fee-list-${academicYear}.xlsx`);
}

// ── 3. Dues Report ─────────────────────────────────────────────────────────────
export function exportDuesExcel(rows: StudentFeeRow[], academicYear: string): void {
  const dueRows = rows.filter((r) => r.balance !== null && r.balance > 0);
  const data: (string | number | null)[][] = [
    [`SMP Admissions — Dues Report`],
    [`Academic Year: ${academicYear}  |  ${dueRows.length} students with outstanding balance`],
    [],
    ['Sl', 'Name', 'Reg No', 'Course', 'Year', 'Allotted', 'Paid', 'Balance'],
    ...dueRows.map((r, i) => [
      i + 1,
      r.student.studentNameSSLC,
      r.student.regNumber || '',
      r.student.course,
      r.student.year,
      r.allotted ?? null,
      r.paid,
      r.balance ?? null,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dues Report');
  XLSX.writeFile(wb, `dues-report-${academicYear}.xlsx`);
}

// ── 4. Course & Year Wise ──────────────────────────────────────────────────────
export function exportCourseYearExcel(rows: StudentFeeRow[], academicYear: string): void {
  const groups = new Map<string, StudentFeeRow[]>();
  for (const r of rows) {
    const key = `${r.student.course}__${r.student.year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const sortedKeys = Array.from(groups.keys()).sort();
  const tableRows = sortedKeys.map((key) => {
    const g         = groups.get(key)!;
    const allotted  = g.reduce((s, r) => s + (r.allotted ?? 0), 0);
    const collected = g.reduce((s, r) => s + r.paid, 0);
    return [
      g[0].student.course, g[0].student.year,
      g.length, g.filter((r) => r.paid > 0).length,
      allotted, collected, allotted - collected,
    ];
  });

  const grandAllotted  = rows.reduce((s, r) => s + (r.allotted ?? 0), 0);
  const grandCollected = rows.reduce((s, r) => s + r.paid, 0);

  const data: (string | number | null)[][] = [
    [`SMP Admissions — Course & Year Wise Report`],
    [`Academic Year: ${academicYear}`],
    [],
    ['Course', 'Year', 'Students', 'Paid', 'Allotted', 'Collected', 'Balance'],
    ...tableRows,
    ['TOTAL', '', rows.length, rows.filter((r) => r.paid > 0).length,
      grandAllotted, grandCollected, grandAllotted - grandCollected],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Course & Year Wise');
  XLSX.writeFile(wb, `course-year-report-${academicYear}.xlsx`);
}

// ── 5. Consolidated ────────────────────────────────────────────────────────────
export function exportConsolidatedExcel(feeRecords: FeeRecord[], academicYear: string): void {
  const smpTotals = {} as Record<SMPFeeHead, number>;
  for (const { key } of SMP_FEE_HEADS) smpTotals[key] = 0;
  let svkTotal        = 0;
  let additionalTotal = 0;

  for (const r of feeRecords) {
    for (const { key } of SMP_FEE_HEADS) smpTotals[key] += r.smp[key];
    svkTotal        += r.svk;
    additionalTotal += r.additionalPaid.reduce((s, h) => s + h.amount, 0);
  }
  const smpGrandTotal = SMP_FEE_HEADS.reduce((s, { key }) => s + smpTotals[key], 0);
  const grandTotal    = smpGrandTotal + svkTotal + additionalTotal;

  const data: (string | number)[][] = [
    [`SMP Admissions — Consolidated Fee Report`],
    [`Academic Year: ${academicYear}  |  ${feeRecords.length} payment records`],
    [],
    ['Fee Head', 'Amount'],
    ...SMP_FEE_HEADS.map(({ label, key }) => [label, smpTotals[key]]),
    ['SMP Total',   smpGrandTotal],
    ['SVK',         svkTotal],
    ['Additional',  additionalTotal],
    ['Grand Total', grandTotal],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Consolidated');
  XLSX.writeFile(wb, `consolidated-fee-${academicYear}.xlsx`);
}
