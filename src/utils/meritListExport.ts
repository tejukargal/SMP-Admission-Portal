import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Student } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts YYYY-MM-DD → DD/MM/YYYY. Returns '—' for empty/invalid values. */
export function fmtDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr; // already in another format, return as-is
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function sslcPct(s: Student): number {
  if (!s.sslcMaxTotal || s.sslcMaxTotal === 0) return 0;
  return (s.sslcObtainedTotal / s.sslcMaxTotal) * 100;
}

export function sortByMerit(students: Student[]): Student[] {
  return [...students].sort((a, b) => sslcPct(b) - sslcPct(a));
}

// ── PDF ───────────────────────────────────────────────────────────────────────

const FONT_SIZE = 8.5;
const CELL_PAD  = { top: 2.8, right: 3, bottom: 2.8, left: 3 };
const PAD_H     = CELL_PAD.left + CELL_PAD.right;

interface ColDef {
  header: string;
  halign: 'left' | 'center' | 'right';
  get: (s: Student, i: number) => string | number;
}

const COLUMNS: ColDef[] = [
  { header: 'Sl',              halign: 'center', get: (_s, i) => i + 1 },
  { header: 'Academic Year',   halign: 'center', get: (s)    => s.academicYear },
  { header: 'Name',            halign: 'left',   get: (s)    => s.studentNameSSLC },
  { header: 'Father',          halign: 'left',   get: (s)    => s.fatherName || '—' },
  { header: 'Year',            halign: 'center', get: (s)    => s.year },
  { header: 'Course',          halign: 'center', get: (s)    => s.course },
  { header: 'Gender',          halign: 'center', get: (s)    => s.gender },
  { header: 'SSLC Total',      halign: 'right',  get: (s)    => `${s.sslcObtainedTotal}/${s.sslcMaxTotal}` },
  { header: 'Percentage',      halign: 'right',  get: (s)    => `${sslcPct(s).toFixed(2)}%` },
  { header: 'Enrolled On',     halign: 'center', get: (s)    => fmtDate(s.enrollmentDate) },
];

// Columns that should auto-size to content (everything except Name & Father)
const FLEX_COLS = new Set(['Name', 'Father']);

export function exportMeritListPdf(students: Student[], academicYear: string | null): void {
  const margin      = 10;
  const LANDSCAPE_W = 297 - margin * 2;  // 277mm

  const sorted = sortByMerit(students);

  const measureDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  measureDoc.setFontSize(FONT_SIZE);

  // Measure fixed-width columns
  let fixedTotal = 0;
  const flexCount = COLUMNS.filter((c) => FLEX_COLS.has(c.header)).length;

  const colWidths: number[] = COLUMNS.map((col) => {
    if (FLEX_COLS.has(col.header)) return 0; // filled below

    measureDoc.setFont('helvetica', 'bold');
    let w = measureDoc.getTextWidth(col.header);
    measureDoc.setFont('helvetica', 'normal');
    for (let i = 0; i < sorted.length; i++) {
      const cw = measureDoc.getTextWidth(String(col.get(sorted[i], i)));
      if (cw > w) w = cw;
    }
    const colW = w + PAD_H + 2;
    fixedTotal += colW;
    return colW;
  });

  // Flex columns share remaining space equally (min 28mm each)
  const flexW = Math.max((LANDSCAPE_W - fixedTotal) / flexCount, 28);
  COLUMNS.forEach((col, idx) => {
    if (FLEX_COLS.has(col.header)) colWidths[idx] = flexW;
  });

  const tableWidth = colWidths.reduce((s, w) => s + w, 0);

  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — Merit List (Pending)', margin, 13);

  // Subtitle
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const chips: string[] = [];
  if (academicYear) chips.push(`AY ${academicYear}`);
  chips.push(`${sorted.length} student${sorted.length !== 1 ? 's' : ''}`);
  chips.push('Sorted by SSLC % (highest first)');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), margin, 19.5);
  doc.text(`Generated ${dateStr}`, pageW - margin, 19.5, { align: 'right' });
  doc.setTextColor(0);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, 22, pageW - margin, 22);

  const rows    = sorted.map((s, i) => COLUMNS.map((c) => c.get(s, i)));
  const headers = [COLUMNS.map((c) => c.header)];

  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
  COLUMNS.forEach((col, idx) => {
    columnStyles[idx] = { cellWidth: colWidths[idx], halign: col.halign };
  });

  autoTable(doc, {
    startY: 25,
    margin: { left: margin, right: margin, top: margin, bottom: 12 },
    head: headers,
    body: rows,
    tableWidth,
    styles: {
      fontSize: FONT_SIZE,
      cellPadding: CELL_PAD,
      valign: 'middle',
      overflow: 'ellipsize',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: FONT_SIZE,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    didDrawPage: (data) => {
      const total = (doc as unknown as { internal: { getNumberOfPages(): number } })
        .internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${total}`,
        pageW - margin,
        pageH - 4,
        { align: 'right' },
      );
      doc.setTextColor(0);
    },
  });

  const ay = academicYear?.replace(/[^0-9-]/g, '') ?? 'merit';
  doc.save(`merit_list_${ay}.pdf`);
}

// ── Excel ─────────────────────────────────────────────────────────────────────

export function exportMeritListExcel(students: Student[], academicYear: string | null): void {
  const sorted = sortByMerit(students);

  const header = [
    'Sl', 'Academic Year', 'Name (SSLC)', 'Father Name',
    'Year', 'Course', 'Gender',
    'SSLC Max', 'SSLC Obtained', 'Percentage', 'Enrolled On',
  ];

  const rows = sorted.map((s, i) => [
    i + 1,
    s.academicYear,
    s.studentNameSSLC,
    s.fatherName || '',
    s.year,
    s.course,
    s.gender,
    s.sslcMaxTotal,
    s.sslcObtainedTotal,
    parseFloat(sslcPct(s).toFixed(2)),
    fmtDate(s.enrollmentDate),
  ]);

  const wsData = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 5 },   // Sl
    { wch: 13 },  // Academic Year
    { wch: 30 },  // Name
    { wch: 25 },  // Father
    { wch: 10 },  // Year
    { wch: 8 },   // Course
    { wch: 8 },   // Gender
    { wch: 10 },  // SSLC Max
    { wch: 13 },  // SSLC Obtained
    { wch: 12 },  // Percentage
    { wch: 14 },  // Enrolled On
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = academicYear ? `Merit ${academicYear}` : 'Merit List';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const ay = academicYear?.replace(/[^0-9-]/g, '') ?? 'merit';
  XLSX.writeFile(wb, `merit_list_${ay}.xlsx`);
}
