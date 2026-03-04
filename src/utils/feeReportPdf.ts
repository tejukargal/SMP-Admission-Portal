import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';
import type { Student } from '../types';

export interface StudentFeeRow {
  student: Student;
  allotted: number | null;
  paid: number;
  balance: number | null;
}

const FONT_SIZE = 8.5;
const CELL_PAD = { top: 2.8, right: 3, bottom: 2.8, left: 3 };
const MARGIN = 10;

type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

function buildDoc(title: string, subtitle: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(title, MARGIN, 13);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, MARGIN, 19.5);
  doc.text(`Generated ${dateStr}`, pageW - MARGIN, 19.5, { align: 'right' });
  doc.setTextColor(0);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 22, pageW - MARGIN, 22);
  return doc;
}

function pageFooter(doc: jsPDF, pageNumber: number): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = (doc as unknown as { internal: { getNumberOfPages(): number } })
    .internal.getNumberOfPages();
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Page ${pageNumber} of ${total}`, pageW - MARGIN, pageH - 4, { align: 'right' });
  doc.setTextColor(0);
}

function fmt(n: number): string {
  return `\u20B9${n.toLocaleString('en-IN')}`;
}

// ── 1. Statistics ──────────────────────────────────────────────────────────────
export function exportStatsPdf(rows: StudentFeeRow[], academicYear: string): void {
  const total       = rows.length;
  const paidCount   = rows.filter((r) => r.paid > 0).length;
  const notPaid     = total - paidCount;
  const duesCount   = rows.filter((r) => r.balance !== null && r.balance > 0).length;
  const noDuesCount = rows.filter((r) => r.balance !== null && r.balance <= 0).length;
  const totAllotted = rows.reduce((s, r) => s + (r.allotted ?? 0), 0);
  const totPaid     = rows.reduce((s, r) => s + r.paid, 0);
  const totBalance  = rows.reduce((s, r) => s + (r.balance ?? 0), 0);

  const doc = buildDoc(
    'SMP Admissions \u2014 Fee Statistics',
    `Academic Year: ${academicYear}  \u00B7  ${total} students`,
  );
  const pageW = doc.internal.pageSize.getWidth();

  autoTable(doc, {
    startY: 25,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Metric', 'Value']],
    body: [
      ['Total Students', String(total)],
      ['Paid', String(paidCount)],
      ['Not Paid', String(notPaid)],
      ['Fee Dues', String(duesCount)],
      ['No Fee Dues', String(noDuesCount)],
      ['Total Allotted', fmt(totAllotted)],
      ['Total Collected', fmt(totPaid)],
      ['Outstanding Balance', fmt(totBalance)],
    ],
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 50, halign: 'right' },
    },
    tableWidth: 110,
    didDrawPage: (data) => pageFooter(doc, data.pageNumber),
  });

  // Course/Year breakdown
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

  const afterSummary = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: afterSummary,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Course', 'Year', 'Students', 'Paid', 'Allotted', 'Collected', 'Balance']],
    body: bRows.map((b) => [
      b.course, b.year, b.total, b.paid,
      fmt(b.allotted), fmt(b.collected), fmt(b.allotted - b.collected),
    ]),
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center' }, 1: { halign: 'left' },
      2: { halign: 'center' }, 3: { halign: 'center' },
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
        doc.text('SMP Admissions \u2014 Fee Statistics', MARGIN, 13);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text(`Academic Year: ${academicYear}`, MARGIN, 19.5);
        doc.setTextColor(0);
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2);
        doc.line(MARGIN, 22, pageW - MARGIN, 22);
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
  );

  autoTable(doc, {
    startY: 25,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Sl', 'Name', 'Reg No', 'Course', 'Year', 'Allotted', 'Paid', 'Balance']],
    body: rows.map((r, i) => [
      i + 1,
      r.student.studentNameSSLC,
      r.student.regNumber || '\u2014',
      r.student.course,
      r.student.year,
      r.allotted !== null ? fmt(r.allotted) : '\u2014',
      fmt(r.paid),
      r.balance !== null ? fmt(r.balance) : '\u2014',
    ]),
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD, overflow: 'ellipsize' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 20 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 22 },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' },
      7: { cellWidth: 25, halign: 'right' },
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text(`Fee List \u2014 ${academicYear} (continued)`, MARGIN, 8);
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
  );

  autoTable(doc, {
    startY: 25,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Sl', 'Name', 'Reg No', 'Course', 'Year', 'Allotted', 'Paid', 'Balance']],
    body: dueRows.map((r, i) => [
      i + 1,
      r.student.studentNameSSLC,
      r.student.regNumber || '\u2014',
      r.student.course,
      r.student.year,
      r.allotted !== null ? fmt(r.allotted) : '\u2014',
      fmt(r.paid),
      r.balance !== null ? fmt(r.balance) : '\u2014',
    ]),
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD, overflow: 'ellipsize' },
    headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [254, 242, 242] },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 20 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 22 },
      5: { cellWidth: 25, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' },
      7: { cellWidth: 25, halign: 'right' },
    },
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
  const tableBody = sortedKeys.map((key) => {
    const g        = groups.get(key)!;
    const allotted = g.reduce((s, r) => s + (r.allotted ?? 0), 0);
    const collected = g.reduce((s, r) => s + r.paid, 0);
    return [
      g[0].student.course, g[0].student.year,
      g.length, g.filter((r) => r.paid > 0).length,
      fmt(allotted), fmt(collected), fmt(allotted - collected),
    ];
  });

  const grandAllotted  = rows.reduce((s, r) => s + (r.allotted ?? 0), 0);
  const grandCollected = rows.reduce((s, r) => s + r.paid, 0);
  tableBody.push([
    'TOTAL', '', rows.length, rows.filter((r) => r.paid > 0).length,
    fmt(grandAllotted), fmt(grandCollected), fmt(grandAllotted - grandCollected),
  ]);

  const doc = buildDoc(
    'SMP Admissions \u2014 Course & Year Wise Report',
    `Academic Year: ${academicYear}`,
  );

  autoTable(doc, {
    startY: 25,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Course', 'Year', 'Students', 'Paid', 'Allotted', 'Collected', 'Balance']],
    body: tableBody,
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center' }, 1: { halign: 'left' },
      2: { halign: 'center' }, 3: { halign: 'center' },
      4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle    = 'bold';
        data.cell.styles.fillColor    = [241, 245, 249];
        data.cell.styles.lineColor    = [148, 163, 184];
        data.cell.styles.lineWidth    = 0.3;
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
  const grandTotal    = smpGrandTotal + svkTotal + additionalTotal;

  const doc = buildDoc(
    'SMP Admissions \u2014 Consolidated Fee Report',
    `Academic Year: ${academicYear}  \u00B7  ${feeRecords.length} payment record${feeRecords.length !== 1 ? 's' : ''}`,
  );

  const n = SMP_FEE_HEADS.length;
  autoTable(doc, {
    startY: 25,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Fee Head', 'Amount']],
    body: [
      ...SMP_FEE_HEADS.map(({ label, key }) => [label, fmt(smpTotals[key])]),
      ['SMP Total',   fmt(smpGrandTotal)],
      ['SVK',         fmt(svkTotal)],
      ['Additional',  fmt(additionalTotal)],
      ['Grand Total', fmt(grandTotal)],
    ],
    styles: { fontSize: FONT_SIZE, cellPadding: CELL_PAD },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 50, halign: 'right' },
    },
    tableWidth: 110,
    didParseCell: (data) => {
      if ([n, n + 1, n + 2, n + 3].includes(data.row.index)) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    didDrawPage: (data) => pageFooter(doc, data.pageNumber),
  });

  doc.save(`consolidated-fee-${academicYear}.pdf`);
}
