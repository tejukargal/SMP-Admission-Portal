import * as XLSX from 'xlsx';
import type { FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';
import type { StudentFeeRow, DatewiseHeadwiseEntry, StatsExportInput } from './feeReportPdf';
import {
  aidedSubtotals, collectionPct, computeFeeStats, courseYearBreakdown, emptyFeeStats, missingStructureKeys,
  discontinuedByCourseYear, discontinuedTotals,
  type DiscontinuedEntry, type DiscontinuedTotals, type FeeStats, type PriorDueGroup, type PriorDuesSummary,
} from './feeStatistics';

const FEE_DETAIL_HEADER = [
  'Sl', 'Name', 'Reg No', 'Course', 'Year',
  'SMP Allotted', 'SVK Base Allotted', 'Additional Allotted', 'Total Allotted',
  'SMP Paid', 'SVK Base Paid', 'Additional Paid', 'Total Paid',
  'SMP Balance', 'SVK Base Balance', 'Additional Balance', 'Total Balance',
];

function feeDetailRow(r: StudentFeeRow, i: number): (string | number | null)[] {
  return [
    i + 1,
    r.student.studentNameSSLC,
    r.student.regNumber || '',
    r.student.course,
    r.student.year,
    r.smpAllotted        ?? null,
    r.svkBaseAllotted    ?? null,
    r.additionalAllotted ?? null,
    r.allotted            ?? null,
    r.smpPaid || null,
    r.svkBasePaid || null,
    r.additionalPaid || null,
    r.paid    || null,
    r.smpBalance         ?? null,
    r.svkBaseBalance      ?? null,
    r.additionalBalance   ?? null,
    r.balance    ?? null,
  ];
}

// ── 1. Statistics ──────────────────────────────────────────────────────────────
// Balance = sum of each student's own dues (clamped at 0), matching the Dues report.
const GRP_HEADER = [
  'Course', 'Year', 'Students', 'Paid',
  'SMP Allotted', 'SVK Base Allotted', 'Additional Allotted', 'Total Allotted',
  'SMP Collected', 'SVK Base Collected', 'Additional Collected', 'Total Collected',
  'SMP Balance', 'SVK Base Balance', 'Additional Balance', 'Total Balance', 'Collected %',
];

function grpRow(c1: string, c2: string, t: FeeStats): (string | number | null)[] {
  const pct = collectionPct(t);
  return [
    c1, c2, t.students, t.students - t.notPaid,
    t.smpAllt, t.svkBaseAllt, t.addAllt, t.allotted,
    t.smpColl, t.svkBaseColl, t.addColl, t.collected,
    t.smpBal, t.svkBaseBal, t.addBal, t.balance,
    pct === null ? null : Math.round(pct * 10) / 10,
  ];
}

function breakdownRows(rows: StudentFeeRow[], total: FeeStats): (string | number | null)[][] {
  return [
    GRP_HEADER,
    ...courseYearBreakdown(rows).map((b) => grpRow(b.course, b.year, b.stats)),
    ...aidedSubtotals(rows).map((s) => grpRow(s.label, '', s.stats)),
    grpRow('TOTAL', '', total),
  ];
}

export function exportStatsExcel({ rows, academicYear, segmentLabel, groups }: StatsExportInput): void {
  const t = computeFeeStats(rows);
  const pct = collectionPct(t);
  const data: (string | number | null)[][] = [
    [`SMP Admissions — Fee Statistics — ${segmentLabel}`],
    [`Academic Year: ${academicYear}`],
    [],
    ['Students', 'Fully Paid', 'Part Paid', 'Not Paid', 'Fee Dues', 'No Dues', 'No Fee Structure', 'Collected %'],
    [t.students, t.fullyPaid, t.partPaid, t.notPaid, t.withDues, t.noDues, t.noStructure, pct === null ? null : Math.round(pct * 10) / 10],
    [],
    ['Metric', 'SMP', 'SVK Base', 'Additional', 'Total'],
    ['Allotted',       t.smpAllt, t.svkBaseAllt, t.addAllt, t.allotted],
    ['Collected',      t.smpColl, t.svkBaseColl, t.addColl, t.collected],
    ['Balance (dues)', t.smpBal,  t.svkBaseBal,  t.addBal,  t.balance],
    ...(t.excess > 0 ? [['Excess paid (to refund / adjust)', null, null, null, t.excess]] : []),
  ];
  if (groups?.length) {
    const all = groups.reduce((acc, g) => {
      for (const k of Object.keys(acc) as (keyof FeeStats)[]) acc[k] += g.stats[k];
      return acc;
    }, emptyFeeStats());
    const gRow = (label: string, s: FeeStats) => [label, s.students, s.fullyPaid, s.partPaid, s.notPaid, s.allotted, s.collected, s.balance];
    data.push(
      [],
      ['Student Group', 'Students', 'Fully Paid', 'Part Paid', 'Not Paid', 'Allotted', 'Collected', 'Balance (dues)'],
      ...groups.map((g) => gRow(g.label, g.stats)),
      gRow('TOTAL', all),
    );
  }
  data.push([], ['Course & Year Breakdown'], ...breakdownRows(rows, t));
  if (t.noStructure > 0) data.push([], [`${t.noStructure} student(s) have no fee structure and are not in the Balance: ${missingStructureKeys(rows).join('; ')}`]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 30 }, ...Array.from({ length: 16 }, () => ({ wch: 14 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee Statistics');
  XLSX.writeFile(wb, `fee-statistics-${segmentLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${academicYear}.xlsx`);
}

// ── 1b. Previous-year dues collected this financial year ───────────────────────
export function exportPriorDuesExcel(summary: PriorDuesSummary, academicYear: string): void {
  const t = summary.totals;
  const start = Number(academicYear.slice(0, 4));
  const gHead = (first: string) => [first, 'Students', 'Receipts', 'SMP', 'SVK Base', 'Additional', 'Total', 'Cash', 'UPI'];
  const gRow = (g: PriorDueGroup, label = g.label) => [label, g.students, g.receipts, g.smp, g.svk, g.add, g.total, g.cash, g.upi];

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['SMP Admissions — Previous-Year Dues Collected'],
    [`Financial year 01-04-${start} to 31-03-${start + 1} (Academic Year ${academicYear})`],
    [],
    gHead('Dues of Academic Year'),
    ...summary.byYear.map((g) => gRow(g)),
    gRow(t, 'TOTAL'),
    [],
    gHead('Course / Year (then)'),
    ...summary.byCourseYear.map((g) => gRow(g)),
    gRow(t, 'TOTAL'),
  ]);
  summarySheet['!cols'] = [{ wch: 26 }, ...Array.from({ length: 8 }, () => ({ wch: 12 }))];

  const receiptSheet = XLSX.utils.aoa_to_sheet([
    ['Sl', 'Date', 'Receipt No(s)', 'Student', 'Reg No', 'Academic Year', 'Course', 'Year', 'SMP', 'SVK Base', 'Additional', 'Total', 'Cash', 'UPI'],
    ...summary.receipts.map((x, i) => [
      i + 1, x.record.date.slice(0, 10), x.receiptNos, x.record.studentName, x.record.regNumber, x.record.academicYear,
      x.record.course, x.record.year, x.smp, x.svk, x.add, x.total, x.cash, x.upi,
    ]),
    ['', '', '', 'TOTAL', '', '', '', '', t.smp, t.svk, t.add, t.total, t.cash, t.upi],
  ]);
  receiptSheet['!cols'] = [5, 12, 30, 30, 14, 12, 8, 10, 10, 10, 10, 11, 10, 10].map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(wb, receiptSheet, 'Receipts');
  XLSX.writeFile(wb, `previous-year-dues-collected-${academicYear}.xlsx`);
}

// ── 1c. Discontinued students ────────────────────────────────────────────────────────
export function exportDiscontinuedExcel(entries: DiscontinuedEntry[], academicYear: string): void {
  const t = discontinuedTotals(entries);
  const gRow = (g: DiscontinuedTotals, label = g.label) => [label, g.students, g.paidStudents, g.smpColl, g.svkBaseColl, g.addColl, g.collected, g.refunded, g.retained, g.uncollected];
  const summarySheet = XLSX.utils.aoa_to_sheet([
    ['SMP Admissions — Discontinued Students: Fee Collected & Refunded'],
    [`Academic Year: ${academicYear}`],
    [],
    ['Course / Year', 'Students', 'Had Paid', 'SMP', 'SVK Base', 'Additional', 'Collected', 'Refunded', 'Retained', 'Uncollected (not dues)'],
    ...discontinuedByCourseYear(entries).map((g) => gRow(g)),
    gRow(t, 'TOTAL'),
  ]);
  summarySheet['!cols'] = [{ wch: 18 }, ...Array.from({ length: 9 }, () => ({ wch: 12 }))];

  const studentSheet = XLSX.utils.aoa_to_sheet([
    ['Sl', 'Student', 'Reg No', 'Course', 'Year', 'Adm Type', 'Adm Cat', 'Left On', 'Reason', 'Allotted', 'Collected', 'Refunded', 'Retained', 'Uncollected'],
    ...entries.map(({ row: r, refunded }, i) => [
      i + 1, r.student.studentNameSSLC, r.student.regNumber, r.student.course, r.student.year, r.student.admType, r.student.admCat,
      r.student.discontinuedDate?.slice(0, 10) ?? '', r.student.discontinuedReason ?? '',
      r.allotted, r.paid, refunded, r.paid - refunded, r.balance,
    ]),
    ['', 'TOTAL', '', '', '', '', '', '', '', null, t.collected, t.refunded, t.retained, t.uncollected],
  ]);
  studentSheet['!cols'] = [5, 32, 14, 8, 10, 10, 8, 11, 28, 11, 11, 11, 11, 12].map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(wb, studentSheet, 'Students');
  XLSX.writeFile(wb, `discontinued-students-fee-${academicYear}.xlsx`);
}

// ── 2. Fee List ────────────────────────────────────────────────────────────────
export function exportFeeListExcel(rows: StudentFeeRow[], academicYear: string): void {
  const tSmpA = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const tSvkA = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const tSmpP = rows.reduce((s, r) => s + r.smpPaid, 0);
  const tSvkP = rows.reduce((s, r) => s + r.svkPaid, 0);
  const tVBaseA = rows.reduce((s, r) => s + (r.svkBaseAllotted ?? 0), 0);
  const tAddA   = rows.reduce((s, r) => s + (r.additionalAllotted ?? 0), 0);
  const tVBaseP = rows.reduce((s, r) => s + r.svkBasePaid, 0);
  const tAddP   = rows.reduce((s, r) => s + r.additionalPaid, 0);
  const data: (string | number | null)[][] = [
    [`SMP Admissions — Fee List`],
    [`Academic Year: ${academicYear}`],
    [],
    FEE_DETAIL_HEADER,
    ...rows.map(feeDetailRow),
    [
      'TOTAL', '', '', '', '',
      tSmpA, tVBaseA, tAddA, tSmpA + tSvkA,
      tSmpP, tVBaseP, tAddP, tSmpP + tSvkP,
      tSmpA - tSmpP, tVBaseA - tVBaseP, tAddA - tAddP, (tSmpA + tSvkA) - (tSmpP + tSvkP),
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fee List');
  XLSX.writeFile(wb, `fee-list-${academicYear}.xlsx`);
}

// ── 3. Dues Report ─────────────────────────────────────────────────────────────
export function exportDuesExcel(rows: StudentFeeRow[], academicYear: string): void {
  const dueRows = rows.filter((r) => r.balance !== null && r.balance > 0);
  const tSmpA = dueRows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const tSvkA = dueRows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const tSmpP = dueRows.reduce((s, r) => s + r.smpPaid, 0);
  const tSvkP = dueRows.reduce((s, r) => s + r.svkPaid, 0);
  const tVBaseA = dueRows.reduce((s, r) => s + (r.svkBaseAllotted ?? 0), 0);
  const tAddA   = dueRows.reduce((s, r) => s + (r.additionalAllotted ?? 0), 0);
  const tVBaseP = dueRows.reduce((s, r) => s + r.svkBasePaid, 0);
  const tAddP   = dueRows.reduce((s, r) => s + r.additionalPaid, 0);
  const data: (string | number | null)[][] = [
    [`SMP Admissions — Dues Report`],
    [`Academic Year: ${academicYear}  |  ${dueRows.length} students with outstanding balance`],
    [],
    FEE_DETAIL_HEADER,
    ...dueRows.map(feeDetailRow),
    [
      'TOTAL', '', '', '', '',
      tSmpA, tVBaseA, tAddA, tSmpA + tSvkA,
      tSmpP, tVBaseP, tAddP, tSmpP + tSvkP,
      tSmpA - tSmpP, tVBaseA - tVBaseP, tAddA - tAddP, (tSmpA + tSvkA) - (tSmpP + tSvkP),
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dues Report');
  XLSX.writeFile(wb, `dues-report-${academicYear}.xlsx`);
}

// ── 4. Course & Year Wise ──────────────────────────────────────────────────────
export function exportCourseYearExcel(rows: StudentFeeRow[], academicYear: string): void {
  const data: (string | number | null)[][] = [
    [`SMP Admissions — Course & Year Wise Report`],
    [`Academic Year: ${academicYear}`],
    [],
    ...breakdownRows(rows, computeFeeStats(rows)),
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

// ── 6. Datewise Headwise ────────────────────────────────────────────────────
export function exportDatewiseHeadwiseExcel(entries: DatewiseHeadwiseEntry[], academicYear: string): void {
  const grandHeads = {} as Record<SMPFeeHead, number>;
  for (const { key } of SMP_FEE_HEADS) grandHeads[key] = 0;
  for (const e of entries) {
    for (const { key } of SMP_FEE_HEADS) grandHeads[key] += e.heads[key];
  }
  const grandTotal = SMP_FEE_HEADS.reduce((s, { key }) => s + grandHeads[key], 0);

  const data: (string | number | null)[][] = [
    ['SMP Admissions \u2014 Datewise Consolidated Headwise Fee Statement'],
    [`Academic Year: ${academicYear}`],
    [],
    ['Date', ...SMP_FEE_HEADS.map(({ label }) => label), 'Total'],
    ...entries.map((e) => [
      e.dateLabel,
      ...SMP_FEE_HEADS.map(({ key }) => e.heads[key] || null),
      e.total,
    ]),
    ['TOTAL', ...SMP_FEE_HEADS.map(({ key }) => grandHeads[key] || null), grandTotal],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datewise Headwise');
  XLSX.writeFile(wb, `datewise-headwise-${academicYear}.xlsx`);
}
