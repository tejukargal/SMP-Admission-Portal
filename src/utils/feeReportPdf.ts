import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { FeeRecord, SMPFeeHead } from '../types';
import { SMP_FEE_HEADS } from '../types';
import type { Student } from '../types';

export interface StudentFeeRow {
  student: Student;
  smpAllotted: number | null;
  svkAllotted: number | null;
  allotted: number | null;
  smpPaid: number;
  svkPaid: number;
  paid: number;
  smpBalance: number | null;
  svkBalance: number | null;
  balance: number | null;
}

// ── Layout ────────────────────────────────────────────────────────────────────
// A4 landscape: 297 × 210 mm  →  usable = 297 − 2×10 = 277 mm
const FONT   = 7.5;
const PAD    = { top: 1.8, right: 2.5, bottom: 1.8, left: 2.5 };
const MARGIN = 10;

type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

// Pure-ASCII Indian number formatter (e.g. 6410348 → "64,10,348").
// toLocaleString('en-IN') produces characters outside jsPDF's WinAnsi encoding,
// causing digits to render spaced and garbled. This uses only ASCII commas/digits.
function num(n: number): string {
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return sign + s;
  const last3 = s.slice(-3);
  const rest  = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return sign + grouped + ',' + last3;
}

// ── Shared table styles ───────────────────────────────────────────────────────
// overflow: ellipsize prevents any cell from wrapping to multiple lines
const BASE: object = {
  font: 'helvetica',
  fontStyle: 'normal',
  fontSize: FONT,
  cellPadding: PAD,
  lineColor: [200, 205, 210],
  lineWidth: 0.18,
  textColor: [20, 20, 20],
  overflow: 'ellipsize',
};

function head(fillRgb: [number, number, number]): object {
  return {
    font: 'helvetica',
    fontStyle: 'bold',
    fontSize: FONT,
    cellPadding: PAD,
    fillColor: fillRgb,
    textColor: [255, 255, 255],
    lineColor: fillRgb,
    lineWidth: 0,
    overflow: 'ellipsize',
  };
}

// No alternating row colour — plain white rows
const NO_BAND: object = { fillColor: [255, 255, 255] };

// ── Page helpers ──────────────────────────────────────────────────────────────
function buildDoc(title: string, subtitle: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(title, MARGIN, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(110, 110, 110);
  doc.text(subtitle, MARGIN, 18);
  doc.text(`Generated: ${dateStr}`, W - MARGIN, 18, { align: 'right' });
  doc.setDrawColor(200, 205, 210);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, 20.5, W - MARGIN, 20.5);
  doc.setTextColor(20, 20, 20);
  return doc;
}

function footer(doc: jsPDF, pageNumber: number): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const total = (doc as unknown as { internal: { getNumberOfPages(): number } })
    .internal.getNumberOfPages();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(160, 160, 160);
  doc.text(`Page ${pageNumber} of ${total}`, W - MARGIN, H - 4, { align: 'right' });
  doc.setTextColor(20, 20, 20);
}

// ── Fee-detail table definition (14 cols, 277 mm) ─────────────────────────────
//
//  Sl(6) + Name(46) + Reg(15) + Course(12) + Year(18) = 97 mm
//  + 3 × [ SMP(18) + SVK(18) + Total(21) ]            = 171 mm  → 268 mm total
//  (9 mm breathing room to edge)
//
//  Amounts are plain en-IN numbers; currency shown in header as "(Rs.)"
//
const FEE_HEAD1 = [
  'Sl', 'Name', 'Reg No', 'Course', 'Year',
  'Allotted (Rs.)', '', '',
  'Paid (Rs.)',     '', '',
  'Balance (Rs.)',  '', '',
];
const FEE_HEAD2 = [
  '', '', '', '', '',
  'SMP', 'SVK', 'Total',
  'SMP', 'SVK', 'Total',
  'SMP', 'SVK', 'Total',
];

const FEE_COLS: Record<number, object> = {
  0:  { cellWidth: 8,  halign: 'center' },
  1:  { cellWidth: 42 },
  2:  { cellWidth: 22 },
  3:  { cellWidth: 14, halign: 'center' },
  4:  { cellWidth: 18 },
  5:  { cellWidth: 18, halign: 'right' },
  6:  { cellWidth: 18, halign: 'right' },
  7:  { cellWidth: 21, halign: 'right' },
  8:  { cellWidth: 18, halign: 'right' },
  9:  { cellWidth: 18, halign: 'right' },
  10: { cellWidth: 21, halign: 'right' },
  11: { cellWidth: 18, halign: 'right' },
  12: { cellWidth: 18, halign: 'right' },
  13: { cellWidth: 21, halign: 'right' },
};

function feeRow(r: StudentFeeRow, i: number): (string | number)[] {
  return [
    i + 1,
    r.student.studentNameSSLC,
    r.student.regNumber || '\u2014',
    r.student.course,
    r.student.year,
    r.smpAllotted !== null ? num(r.smpAllotted) : '\u2014',
    r.svkAllotted !== null ? num(r.svkAllotted) : '\u2014',
    r.allotted    !== null ? num(r.allotted)    : '\u2014',
    r.smpPaid > 0          ? num(r.smpPaid)     : '\u2014',
    r.svkPaid > 0          ? num(r.svkPaid)     : '\u2014',
    r.paid    > 0          ? num(r.paid)         : '\u2014',
    r.smpBalance !== null  ? num(r.smpBalance)  : '\u2014',
    r.svkBalance !== null  ? num(r.svkBalance)  : '\u2014',
    r.balance    !== null  ? num(r.balance)     : '\u2014',
  ];
}

// ── Group-summary table definition (13 cols, 277 mm) ─────────────────────────
//
//  Course(16) + Year(20) + Students(15) + Paid(15) = 66 mm
//  + 3 × [ SMP(22) + SVK(22) + Total(26) ]         = 210 mm  → 276 mm total
//
const GRP_HEAD1 = [
  'Course', 'Year', 'Count', 'Paid',
  'Allotted (Rs.)', '', '',
  'Collected (Rs.)', '', '',
  'Balance (Rs.)', '', '',
];
const GRP_HEAD2 = [
  '', '', '', '',
  'SMP', 'SVK', 'Total',
  'SMP', 'SVK', 'Total',
  'SMP', 'SVK', 'Total',
];

const GRP_COLS: Record<number, object> = {
  0:  { cellWidth: 16, halign: 'center' },
  1:  { cellWidth: 20 },
  2:  { cellWidth: 15, halign: 'center' },
  3:  { cellWidth: 15, halign: 'center' },
  4:  { cellWidth: 22, halign: 'right' },
  5:  { cellWidth: 22, halign: 'right' },
  6:  { cellWidth: 26, halign: 'right' },
  7:  { cellWidth: 22, halign: 'right' },
  8:  { cellWidth: 22, halign: 'right' },
  9:  { cellWidth: 26, halign: 'right' },
  10: { cellWidth: 22, halign: 'right' },
  11: { cellWidth: 22, halign: 'right' },
  12: { cellWidth: 26, halign: 'right' },
};

function grpRow(
  c1: string, c2: string | number,
  total: number, paid: number,
  sA: number, vA: number, sC: number, vC: number,
): (string | number)[] {
  return [
    c1, c2, total, paid,
    num(sA), num(vA), num(sA + vA),
    num(sC), num(vC), num(sC + vC),
    num(sA - sC), num(vA - vC), num((sA + vA) - (sC + vC)),
  ];
}

function buildBreakdown(rows: StudentFeeRow[]) {
  const map = new Map<string, {
    course: string; year: string; total: number; paid: number;
    sA: number; vA: number; sC: number; vC: number;
  }>();
  for (const r of rows) {
    const k = `${r.student.course}__${r.student.year}`;
    if (!map.has(k)) map.set(k, {
      course: r.student.course, year: r.student.year,
      total: 0, paid: 0, sA: 0, vA: 0, sC: 0, vC: 0,
    });
    const e = map.get(k)!;
    e.total++;
    if (r.paid > 0) e.paid++;
    e.sA += r.smpAllotted ?? 0;
    e.vA += r.svkAllotted ?? 0;
    e.sC += r.smpPaid;
    e.vC += r.svkPaid;
  }
  return Array.from(map.values()).sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    return c !== 0 ? c : a.year.localeCompare(b.year);
  });
}

// ── 1. Statistics ─────────────────────────────────────────────────────────────
export function exportStatsPdf(rows: StudentFeeRow[], academicYear: string): void {
  const total       = rows.length;
  const paidCount   = rows.filter((r) => r.paid > 0).length;
  const duesCount   = rows.filter((r) => r.balance !== null && r.balance > 0).length;
  const noDuesCount = rows.filter((r) => r.balance !== null && r.balance <= 0).length;
  const tSA = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const tVA = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const tSC = rows.reduce((s, r) => s + r.smpPaid, 0);
  const tVC = rows.reduce((s, r) => s + r.svkPaid, 0);

  const BLUE: [number, number, number] = [30, 64, 175];
  const doc = buildDoc(
    'SMP Admissions \u2014 Fee Statistics',
    `Academic Year: ${academicYear}  |  ${total} students`,
  );

  // Summary table
  autoTable(doc, {
    startY: 23,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 165,
    head: [['Metric', 'SMP (Rs.)', 'SVK (Rs.)', 'Total (Rs.)']],
    body: [
      ['Total',      String(total),          '', ''],
      ['Paid',       String(paidCount),       '', ''],
      ['Not Paid',   String(total-paidCount), '', ''],
      ['Fee Dues',   String(duesCount),       '', ''],
      ['No Dues',    String(noDuesCount),     '', ''],
      ['Allotted',       num(tSA),                num(tVA),             num(tSA + tVA)                ],
      ['Collected',      num(tSC),                num(tVC),             num(tSC + tVC)                ],
      ['Balance',        num(tSA - tSC),          num(tVA - tVC),       num((tSA+tVA) - (tSC+tVC))   ],
    ],
    styles: BASE,
    headStyles: head(BLUE),
    alternateRowStyles: NO_BAND,
    columnStyles: {
      0: { cellWidth: 45, font: 'helvetica', fontStyle: 'normal' },
      1: { cellWidth: 40, halign: 'right' },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 40, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index >= 5) {
        (data.cell.styles as { fontStyle: string }).fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => footer(doc, data.pageNumber),
  });

  const bRows = buildBreakdown(rows);
  const afterSummary = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 8;

  autoTable(doc, {
    startY: afterSummary,
    margin: { left: MARGIN, right: MARGIN },
    head: [GRP_HEAD1, GRP_HEAD2],
    body: [
      ...bRows.map((b) => grpRow(b.course, b.year, b.total, b.paid, b.sA, b.vA, b.sC, b.vC)),
      grpRow('TOTAL', '', total, paidCount, tSA, tVA, tSC, tVC),
    ],
    styles: BASE,
    headStyles: head(BLUE),
    alternateRowStyles: NO_BAND,
    columnStyles: GRP_COLS,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === bRows.length) {
        (data.cell.styles as { fontStyle: string }).fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => footer(doc, data.pageNumber),
  });

  doc.save(`fee-statistics-${academicYear}.pdf`);
}

// ── 2. Fee List ───────────────────────────────────────────────────────────────
export function exportFeeListPdf(rows: StudentFeeRow[], academicYear: string): void {
  const BLUE: [number, number, number] = [30, 64, 175];
  const doc = buildDoc(
    'SMP Admissions \u2014 Fee List',
    `Academic Year: ${academicYear}  |  ${rows.length} students`,
  );

  autoTable(doc, {
    startY: 23,
    margin: { left: MARGIN, right: MARGIN },
    head: [FEE_HEAD1, FEE_HEAD2],
    body: rows.map(feeRow),
    styles: BASE,
    headStyles: head(BLUE),
    alternateRowStyles: NO_BAND,
    columnStyles: FEE_COLS,
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        const d = data.doc as jsPDF;
        d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(110, 110, 110);
        d.text(`Fee List \u2014 ${academicYear} (continued)`, MARGIN, 7);
        d.setTextColor(20, 20, 20);
      }
      footer(doc, data.pageNumber);
    },
  });

  doc.save(`fee-list-${academicYear}.pdf`);
}

// ── 3. Dues Report ────────────────────────────────────────────────────────────
export function exportDuesPdf(rows: StudentFeeRow[], academicYear: string): void {
  const dueRows = rows.filter((r) => r.balance !== null && r.balance > 0);
  const RED: [number, number, number] = [185, 28, 28];
  const doc = buildDoc(
    'SMP Admissions \u2014 Dues Report',
    `Academic Year: ${academicYear}  |  ${dueRows.length} students with outstanding balance`,
  );

  autoTable(doc, {
    startY: 23,
    margin: { left: MARGIN, right: MARGIN },
    head: [FEE_HEAD1, FEE_HEAD2],
    body: dueRows.map(feeRow),
    styles: BASE,
    headStyles: head(RED),
    alternateRowStyles: NO_BAND,
    columnStyles: FEE_COLS,
    didDrawPage: (data) => footer(doc, data.pageNumber),
  });

  doc.save(`dues-report-${academicYear}.pdf`);
}

// ── 4. Course & Year Wise ─────────────────────────────────────────────────────
export function exportCourseYearPdf(rows: StudentFeeRow[], academicYear: string): void {
  const BLUE: [number, number, number] = [30, 64, 175];
  const groups = new Map<string, StudentFeeRow[]>();
  for (const r of rows) {
    const k = `${r.student.course}__${r.student.year}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const body = Array.from(groups.keys()).sort().map((k) => {
    const g = groups.get(k)!;
    return grpRow(
      g[0].student.course, g[0].student.year,
      g.length, g.filter((r) => r.paid > 0).length,
      g.reduce((s, r) => s + (r.smpAllotted ?? 0), 0),
      g.reduce((s, r) => s + (r.svkAllotted ?? 0), 0),
      g.reduce((s, r) => s + r.smpPaid, 0),
      g.reduce((s, r) => s + r.svkPaid, 0),
    );
  });

  const gSA = rows.reduce((s, r) => s + (r.smpAllotted ?? 0), 0);
  const gVA = rows.reduce((s, r) => s + (r.svkAllotted ?? 0), 0);
  const gSC = rows.reduce((s, r) => s + r.smpPaid, 0);
  const gVC = rows.reduce((s, r) => s + r.svkPaid, 0);
  body.push(grpRow('TOTAL', '', rows.length, rows.filter((r) => r.paid > 0).length, gSA, gVA, gSC, gVC));

  const doc = buildDoc(
    'SMP Admissions \u2014 Course & Year Wise Report',
    `Academic Year: ${academicYear}`,
  );

  autoTable(doc, {
    startY: 23,
    margin: { left: MARGIN, right: MARGIN },
    head: [GRP_HEAD1, GRP_HEAD2],
    body,
    styles: BASE,
    headStyles: head(BLUE),
    alternateRowStyles: NO_BAND,
    columnStyles: GRP_COLS,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === body.length - 1) {
        (data.cell.styles as { fontStyle: string }).fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => footer(doc, data.pageNumber),
  });

  doc.save(`course-year-report-${academicYear}.pdf`);
}

// ── 5. Consolidated ───────────────────────────────────────────────────────────
export function exportConsolidatedPdf(feeRecords: FeeRecord[], academicYear: string): void {
  const BLUE: [number, number, number] = [30, 64, 175];
  const smpTot = {} as Record<SMPFeeHead, number>;
  for (const { key } of SMP_FEE_HEADS) smpTot[key] = 0;
  let svk = 0, addl = 0;

  for (const r of feeRecords) {
    for (const { key } of SMP_FEE_HEADS) smpTot[key] += r.smp[key];
    svk  += r.svk;
    addl += r.additionalPaid.reduce((s, h) => s + h.amount, 0);
  }
  const smpTotal   = SMP_FEE_HEADS.reduce((s, { key }) => s + smpTot[key], 0);
  const svkTotal   = svk + addl;
  const grandTotal = smpTotal + svkTotal;

  const n = SMP_FEE_HEADS.length;
  const boldIdx = new Set([n, n + 3, n + 4]);

  const doc = buildDoc(
    'SMP Admissions \u2014 Consolidated Fee Report',
    `Academic Year: ${academicYear}  |  ${feeRecords.length} payment record${feeRecords.length !== 1 ? 's' : ''}`,
  );

  autoTable(doc, {
    startY: 23,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 140,
    head: [['Fee Head', 'Amount (Rs.)']],
    body: [
      ...SMP_FEE_HEADS.map(({ label, key }) => [label, num(smpTot[key])]),
      ['SMP Total',     num(smpTotal)  ],
      ['SVK (Base)',    num(svk)       ],
      ['SVK (Add-ons)', num(addl)      ],
      ['SVK Total',     num(svkTotal)  ],
      ['Grand Total',   num(grandTotal)],
    ],
    styles: BASE,
    headStyles: head(BLUE),
    alternateRowStyles: NO_BAND,
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 50, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && boldIdx.has(data.row.index)) {
        (data.cell.styles as { fontStyle: string }).fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => footer(doc, data.pageNumber),
  });

  doc.save(`consolidated-fee-${academicYear}.pdf`);
}
