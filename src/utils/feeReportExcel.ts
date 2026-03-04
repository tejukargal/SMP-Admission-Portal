import * as XLSX from 'xlsx';
import type { FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';
import type { StudentFeeRow } from './feeReportPdf';

const FEE_DETAIL_HEADER = [
  'Sl', 'Name', 'Reg No', 'Course', 'Year',
  'SMP Allotted', 'SVK Allotted', 'Total Allotted',
  'SMP Paid', 'SVK Paid', 'Total Paid',
  'SMP Balance', 'SVK Balance', 'Total Balance',
];

function feeDetailRow(r: StudentFeeRow, i: number): (string | number | null)[] {
  return [
    i + 1,
    r.student.studentNameSSLC,
    r.student.regNumber || '',
    r.student.course,
    r.student.year,
    r.smpAllotted ?? null,
    r.svkAllotted ?? null,
    r.allotted    ?? null,
    r.smpPaid || null,
    r.svkPaid || null,
    r.paid    || null,
    r.smpBalance ?? null,
    r.svkBalance ?? null,
    r.balance    ?? null,
  ];
}

// ── 1. Statistics ──────────────────────────────────────────────────────────────
export function exportStatsExcel(rows: StudentFeeRow[], academicYear: string): void {
  const total       = rows.length;
  const paidCount   = rows.filter((r) => r.paid > 0).length;
  const notPaid     = total - paidCount;
  const duesCount   = rows.filter((r) => r.balance !== null && r.balance > 0).length;
  const noDuesCount = rows.filter((r) => r.balance !== null && r.balance <= 0).length;
  const totSmpAllt  = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const totSvkAllt  = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const totSmpPaid  = rows.reduce((s, r) => s + r.smpPaid, 0);
  const totSvkPaid  = rows.reduce((s, r) => s + r.svkPaid, 0);

  const breakdown = new Map<string, {
    course: string; year: string; total: number; paid: number;
    smpAllt: number; svkAllt: number; smpColl: number; svkColl: number;
  }>();
  for (const r of rows) {
    const key = `${r.student.course}__${r.student.year}`;
    if (!breakdown.has(key)) {
      breakdown.set(key, {
        course: r.student.course, year: r.student.year,
        total: 0, paid: 0, smpAllt: 0, svkAllt: 0, smpColl: 0, svkColl: 0,
      });
    }
    const e = breakdown.get(key)!;
    e.total++;
    if (r.paid > 0) e.paid++;
    e.smpAllt += r.smpAllotted ?? 0;
    e.svkAllt += r.svkAllotted ?? 0;
    e.smpColl += r.smpPaid;
    e.svkColl += r.svkPaid;
  }
  const bRows = Array.from(breakdown.values()).sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    return c !== 0 ? c : a.year.localeCompare(b.year);
  });

  const data: (string | number | null)[][] = [
    [`SMP Admissions — Fee Statistics`],
    [`Academic Year: ${academicYear}`],
    [],
    ['Metric', 'SMP', 'SVK', 'Total'],
    ['Total Students', total, null, null],
    ['Paid',           paidCount, null, null],
    ['Not Paid',       notPaid, null, null],
    ['Fee Dues',       duesCount, null, null],
    ['No Fee Dues',    noDuesCount, null, null],
    ['Allotted',       totSmpAllt, totSvkAllt, totSmpAllt + totSvkAllt],
    ['Collected',      totSmpPaid, totSvkPaid, totSmpPaid + totSvkPaid],
    ['Balance',        totSmpAllt - totSmpPaid, totSvkAllt - totSvkPaid,
                       (totSmpAllt + totSvkAllt) - (totSmpPaid + totSvkPaid)],
    [],
    ['Course & Year Breakdown'],
    ['Course', 'Year', 'Students', 'Paid',
     'SMP Allotted', 'SVK Allotted', 'Total Allotted',
     'SMP Collected', 'SVK Collected', 'Total Collected',
     'SMP Balance', 'SVK Balance', 'Total Balance'],
    ...bRows.map((b) => [
      b.course, b.year, b.total, b.paid,
      b.smpAllt, b.svkAllt, b.smpAllt + b.svkAllt,
      b.smpColl, b.svkColl, b.smpColl + b.svkColl,
      b.smpAllt - b.smpColl, b.svkAllt - b.svkColl,
      (b.smpAllt + b.svkAllt) - (b.smpColl + b.svkColl),
    ]),
    [
      'TOTAL', '', rows.length, paidCount,
      totSmpAllt, totSvkAllt, totSmpAllt + totSvkAllt,
      totSmpPaid, totSvkPaid, totSmpPaid + totSvkPaid,
      totSmpAllt - totSmpPaid, totSvkAllt - totSvkPaid,
      (totSmpAllt + totSvkAllt) - (totSmpPaid + totSvkPaid),
    ],
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
    FEE_DETAIL_HEADER,
    ...rows.map(feeDetailRow),
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
    FEE_DETAIL_HEADER,
    ...dueRows.map(feeDetailRow),
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
    const g       = groups.get(key)!;
    const smpAllt = g.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
    const svkAllt = g.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
    const smpColl = g.reduce((s, r) => s + r.smpPaid, 0);
    const svkColl = g.reduce((s, r) => s + r.svkPaid, 0);
    return [
      g[0].student.course, g[0].student.year, g.length, g.filter((r) => r.paid > 0).length,
      smpAllt, svkAllt, smpAllt + svkAllt,
      smpColl, svkColl, smpColl + svkColl,
      smpAllt - smpColl, svkAllt - svkColl, (smpAllt + svkAllt) - (smpColl + svkColl),
    ];
  });

  const gSmpAllt = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const gSvkAllt = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const gSmpColl = rows.reduce((s, r) => s + r.smpPaid, 0);
  const gSvkColl = rows.reduce((s, r) => s + r.svkPaid, 0);

  const data: (string | number | null)[][] = [
    [`SMP Admissions — Course & Year Wise Report`],
    [`Academic Year: ${academicYear}`],
    [],
    ['Course', 'Year', 'Students', 'Paid',
     'SMP Allotted', 'SVK Allotted', 'Total Allotted',
     'SMP Collected', 'SVK Collected', 'Total Collected',
     'SMP Balance', 'SVK Balance', 'Total Balance'],
    ...tableRows,
    ['TOTAL', '', rows.length, rows.filter((r) => r.paid > 0).length,
     gSmpAllt, gSvkAllt, gSmpAllt + gSvkAllt,
     gSmpColl, gSvkColl, gSmpColl + gSvkColl,
     gSmpAllt - gSmpColl, gSvkAllt - gSvkColl, (gSmpAllt + gSvkAllt) - (gSmpColl + gSvkColl)],
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
  const svkFullTotal  = svkTotal + additionalTotal;
  const grandTotal    = smpGrandTotal + svkFullTotal;

  const data: (string | number)[][] = [
    [`SMP Admissions — Consolidated Fee Report`],
    [`Academic Year: ${academicYear}  |  ${feeRecords.length} payment records`],
    [],
    ['Fee Head', 'Amount'],
    ...SMP_FEE_HEADS.map(({ label, key }) => [label, smpTotals[key]]),
    ['SMP Total',     smpGrandTotal],
    ['SVK (Base)',    svkTotal],
    ['SVK (Add-ons)', additionalTotal],
    ['SVK Total',     svkFullTotal],
    ['Grand Total',   grandTotal],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Consolidated');
  XLSX.writeFile(wb, `consolidated-fee-${academicYear}.xlsx`);
}
