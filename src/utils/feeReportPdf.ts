import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';
import type { Student } from '../types';

export interface StudentFeeRow {
  student: Student;
  smpAllotted: number | null;
  svkAllotted: number | null;
  allotted: number | null;      // smpAllotted + svkAllotted
  smpPaid: number;
  svkPaid: number;
  paid: number;                 // smpPaid + svkPaid
  smpBalance: number | null;
  svkBalance: number | null;
  balance: number | null;       // smpBalance + svkBalance
}

const FONT_SIZE = 8;
const CELL_PAD  = { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 };
const MARGIN    = 10;

type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };
type Orient = 'portrait' | 'landscape';
type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';

function buildDoc(title: string, subtitle: string, orientation: Orient = 'portrait'): jsPDF {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(title, MARGIN, 12);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, MARGIN, 18.5);
  doc.text(`Generated ${dateStr}`, pageW - MARGIN, 18.5, { align: 'right' });
  doc.setTextColor(0);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 21, pageW - MARGIN, 21);
  return doc;
}

function pageFooter(doc: jsPDF, pageNumber: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = (doc as unknown as { internal: { getNumberOfPages(): number } })
    .internal.getNumberOfPages();
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Page ${pageNumber} of ${total}`, pageW - MARGIN, pageH - 4, { align: 'right' });
  doc.setTextColor(0);
}

function fmt(n: number): string {
  return `\u20B9${n.toLocaleString('en-IN')}`;
}

// ── Shared: student detail row for Fee List / Dues ─────────────────────────────
function feeDetailRow(r: StudentFeeRow, i: number): (string | number)[] {
  return [
    i + 1,
    r.student.studentNameSSLC,
    r.student.regNumber || '\u2014',
    r.student.course,
    r.student.year,
    r.smpAllotted !== null ? fmt(r.smpAllotted) : '\u2014',
    r.svkAllotted !== null ? fmt(r.svkAllotted) : '\u2014',
    r.allotted    !== null ? fmt(r.allotted)    : '\u2014',
    r.smpPaid > 0 ? fmt(r.smpPaid) : '\u2014',
    r.svkPaid > 0 ? fmt(r.svkPaid) : '\u2014',
    r.paid    > 0 ? fmt(r.paid)    : '\u2014',
    r.smpBalance !== null ? fmt(r.smpBalance) : '\u2014',
    r.svkBalance !== null ? fmt(r.svkBalance) : '\u2014',
    r.balance    !== null ? fmt(r.balance)    : '\u2014',
  ];
}

// 2-row header for landscape student-detail tables (14 cols)
const FEE_HEAD_ROW1 = [
  'Sl', 'Name', 'Reg No', 'Course', 'Year',
  'Allotted', '', '', 'Paid', '', '', 'Balance', '', '',
];
const FEE_HEAD_ROW2 = [
  '', '', '', '', '',
  'SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total',
];

const FEE_COL_STYLES: Record<number, { cellWidth: number; halign?: 'left' | 'center' | 'right'; fontStyle?: FontStyle }> = {
  0:  { cellWidth: 7,  halign: 'center' },
  1:  { cellWidth: 42 },
  2:  { cellWidth: 16 },
  3:  { cellWidth: 13, halign: 'center' },
  4:  { cellWidth: 18 },
  5:  { cellWidth: 19, halign: 'right' },
  6:  { cellWidth: 18, halign: 'right' },
  7:  { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
  8:  { cellWidth: 19, halign: 'right' },
  9:  { cellWidth: 18, halign: 'right' },
  10: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
  11: { cellWidth: 19, halign: 'right' },
  12: { cellWidth: 18, halign: 'right' },
  13: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
};

// 2-row header for landscape group-summary tables (Course & Year Wise / Statistics breakdown)
const GROUP_HEAD_ROW1 = [
  'Course', 'Year', 'Students', 'Paid',
  'Allotted', '', '', 'Collected', '', '', 'Balance', '', '',
];
const GROUP_HEAD_ROW2 = [
  '', '', '', '',
  'SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total', 'SMP', 'SVK', 'Total',
];
const GROUP_COL_STYLES: Record<number, { halign?: 'left' | 'center' | 'right'; fontStyle?: FontStyle }> = {
  0: { halign: 'center' }, 1: { halign: 'left' },
  2: { halign: 'center' }, 3: { halign: 'center' },
  4: { halign: 'right'  }, 5: { halign: 'right'  }, 6: { halign: 'right', fontStyle: 'bold' },
  7: { halign: 'right'  }, 8: { halign: 'right'  }, 9: { halign: 'right', fontStyle: 'bold' },
  10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right', fontStyle: 'bold' },
};

function groupBodyRow(
  label1: string, label2: string | number,
  total: number, paid: number,
  smpAllt: number, svkAllt: number,
  smpColl: number, svkColl: number,
): (string | number)[] {
  return [
    label1, label2, total, paid,
    fmt(smpAllt), fmt(svkAllt), fmt(smpAllt + svkAllt),
    fmt(smpColl), fmt(svkColl), fmt(smpColl + svkColl),
    fmt(smpAllt - smpColl), fmt(svkAllt - svkColl), fmt((smpAllt + svkAllt) - (smpColl + svkColl)),
  ];
}

// ── 1. Statistics ──────────────────────────────────────────────────────────────
export function exportStatsPdf(rows: StudentFeeRow[], academicYear: string): void {
  const total       = rows.length;
  const paidCount   = rows.filter((r) => r.paid > 0).length;
  const notPaid     = total - paidCount;
  const duesCount   = rows.filter((r) => r.balance !== null && r.balance > 0).length;
  const noDuesCount = rows.filter((r) => r.balance !== null && r.balance <= 0).length;
  const totSmpAllt  = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const totSvkAllt  = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const totSmpPaid  = rows.reduce((s, r) => s + r.smpPaid, 0);
  const totSvkPaid  = rows.reduce((s, r) => s + r.svkPaid, 0);

  const doc = buildDoc(
    'SMP Admissions \u2014 Fee Statistics',
    `Academic Year: ${academicYear}  \u00B7  ${total} students`,
  );
  const pageW = doc.internal.pageSize.getWidth();

  // Summary table
  autoTable(doc, {
    startY: 24,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Metric', 'SMP', 'SVK', 'Total']],
    body: [
      ['Total Students',  String(total),      '',                '',                               ],
      ['Paid',            String(paidCount),   '',                ''                                ],
      ['Not Paid',        String(notPaid),     '',                ''                                ],
      ['Fee Dues',        String(duesCount),   '',                ''                                ],
      ['No Fee Dues',     String(noDuesCount), '',                ''                                ],
      ['Allotted',        fmt(totSmpAllt),     fmt(totSvkAllt),   fmt(totSmpAllt + totSvkAllt)      ],
      ['Collected',       fmt(totSmpPaid),     fmt(totSvkPaid),   fmt(totSmpPaid + totSvkPaid)      ],
      ['Balance',         fmt(totSmpAllt - totSmpPaid), fmt(totSvkAllt - totSvkPaid),
                          fmt((totSmpAllt + totSvkAllt) - (totSmpPaid + totSvkPaid))                ],
    ],
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
    },
    tableWidth: 145,
    didParseCell: (data) => {
      if ([5, 6, 7].includes(data.row.index) && data.column.index === 3) {
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    didDrawPage: (data) => pageFooter(doc, data.pageNumber),
  });

  // Course/Year breakdown
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

  const afterSummary = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: afterSummary,
    margin: { left: MARGIN, right: MARGIN },
    head: [GROUP_HEAD_ROW1, GROUP_HEAD_ROW2],
    body: [
      ...bRows.map((b) =>
        groupBodyRow(b.course, b.year, b.total, b.paid, b.smpAllt, b.svkAllt, b.smpColl, b.svkColl),
      ),
      groupBodyRow(
        'TOTAL', '',
        rows.length, paidCount,
        totSmpAllt, totSvkAllt,
        totSmpPaid, totSvkPaid,
      ),
    ],
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: GROUP_COL_STYLES,
    didParseCell: (data) => {
      if (data.row.index === bRows.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
        doc.text('SMP Admissions \u2014 Fee Statistics', MARGIN, 12);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text(`Academic Year: ${academicYear}`, MARGIN, 18.5);
        doc.setTextColor(0);
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2);
        doc.line(MARGIN, 21, pageW - MARGIN, 21);
      }
      pageFooter(doc, data.pageNumber);
    },
  });

  doc.save(`fee-statistics-${academicYear}.pdf`);
}

// ── 2. Fee List ────────────────────────────────────────────────────────────────
export function exportFeeListPdf(rows: StudentFeeRow[], academicYear: string): void {
  const doc = buildDoc(
    'SMP Admissions \u2014 Fee List',
    `Academic Year: ${academicYear}  \u00B7  ${rows.length} students`,
    'landscape',
  );

  autoTable(doc, {
    startY: 24,
    margin: { left: MARGIN, right: MARGIN },
    head: [FEE_HEAD_ROW1, FEE_HEAD_ROW2],
    body: rows.map(feeDetailRow),
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD, overflow: 'ellipsize' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: FEE_COL_STYLES,
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text(`Fee List \u2014 ${academicYear} (continued)`, MARGIN, 7);
        doc.setTextColor(0);
      }
      pageFooter(doc, data.pageNumber);
    },
  });

  doc.save(`fee-list-${academicYear}.pdf`);
}

// ── 3. Dues Report ─────────────────────────────────────────────────────────────
export function exportDuesPdf(rows: StudentFeeRow[], academicYear: string): void {
  const dueRows = rows.filter((r) => r.balance !== null && r.balance > 0);
  const doc = buildDoc(
    'SMP Admissions \u2014 Dues Report',
    `Academic Year: ${academicYear}  \u00B7  ${dueRows.length} students with outstanding balance`,
    'landscape',
  );

  autoTable(doc, {
    startY: 24,
    margin: { left: MARGIN, right: MARGIN },
    head: [FEE_HEAD_ROW1, FEE_HEAD_ROW2],
    body: dueRows.map(feeDetailRow),
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD, overflow: 'ellipsize' },
    headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [254, 242, 242] },
    columnStyles: FEE_COL_STYLES,
    didDrawPage: (data) => pageFooter(doc, data.pageNumber),
  });

  doc.save(`dues-report-${academicYear}.pdf`);
}

// ── 4. Course & Year Wise ──────────────────────────────────────────────────────
export function exportCourseYearPdf(rows: StudentFeeRow[], academicYear: string): void {
  const groups = new Map<string, StudentFeeRow[]>();
  for (const r of rows) {
    const key = `${r.student.course}__${r.student.year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const sortedKeys = Array.from(groups.keys()).sort();
  const bodyRows = sortedKeys.map((key) => {
    const g       = groups.get(key)!;
    const smpAllt = g.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
    const svkAllt = g.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
    const smpColl = g.reduce((s, r) => s + r.smpPaid, 0);
    const svkColl = g.reduce((s, r) => s + r.svkPaid, 0);
    return groupBodyRow(
      g[0].student.course, g[0].student.year,
      g.length, g.filter((r) => r.paid > 0).length,
      smpAllt, svkAllt, smpColl, svkColl,
    );
  });

  const gSmpAllt = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const gSvkAllt = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const gSmpColl = rows.reduce((s, r) => s + r.smpPaid, 0);
  const gSvkColl = rows.reduce((s, r) => s + r.svkPaid, 0);
  bodyRows.push(groupBodyRow(
    'TOTAL', '',
    rows.length, rows.filter((r) => r.paid > 0).length,
    gSmpAllt, gSvkAllt, gSmpColl, gSvkColl,
  ));

  const doc = buildDoc(
    'SMP Admissions \u2014 Course & Year Wise Report',
    `Academic Year: ${academicYear}`,
    'landscape',
  );

  autoTable(doc, {
    startY: 24,
    margin: { left: MARGIN, right: MARGIN },
    head: [GROUP_HEAD_ROW1, GROUP_HEAD_ROW2],
    body: bodyRows,
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: GROUP_COL_STYLES,
    didParseCell: (data) => {
      if (data.row.index === bodyRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    didDrawPage: (data) => pageFooter(doc, data.pageNumber),
  });

  doc.save(`course-year-report-${academicYear}.pdf`);
}

// ── 5. Consolidated ────────────────────────────────────────────────────────────
export function exportConsolidatedPdf(feeRecords: FeeRecord[], academicYear: string): void {
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

  const doc = buildDoc(
    'SMP Admissions \u2014 Consolidated Fee Report',
    `Academic Year: ${academicYear}  \u00B7  ${feeRecords.length} payment record${feeRecords.length !== 1 ? 's' : ''}`,
  );

  const n = SMP_FEE_HEADS.length;
  autoTable(doc, {
    startY: 24,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Fee Head', 'Amount']],
    body: [
      ...SMP_FEE_HEADS.map(({ label, key }) => [label, fmt(smpTotals[key])]),
      ['SMP Total',     fmt(smpGrandTotal)],
      ['SVK (Base)',    fmt(svkTotal)],
      ['SVK (Add-ons)', fmt(additionalTotal)],
      ['SVK Total',     fmt(svkFullTotal)],
      ['Grand Total',   fmt(grandTotal)],
    ],
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 50, halign: 'right' },
    },
    tableWidth: 105,
    didParseCell: (data) => {
      // SMP Total, SVK Total, Grand Total rows
      if ([n, n + 3, n + 4].includes(data.row.index)) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    didDrawPage: (data) => pageFooter(doc, data.pageNumber),
  });

  doc.save(`consolidated-fee-${academicYear}.pdf`);
}
