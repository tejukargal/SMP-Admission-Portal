import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Student, Year } from '../types';

const YEAR_ABBR: Record<string, string> = {
  '1ST YEAR': '1st', '2ND YEAR': '2nd', '3RD YEAR': '3rd',
};
const ADM_TYPE_ABBR: Record<string, string> = {
  REGULAR: 'REG', REPEATER: 'RPTR', LATERAL: 'LTRL', EXTERNAL: 'EXTL', SNQ: 'SNQ',
};

export type NotAdmittedStatus = 'ADMITTED' | 'NOT_ADMITTED';

export interface NotAdmittedRow {
  student: Student;
  status: NotAdmittedStatus;
  currentYear: Year | null;
}

export interface NotAdmittedPdfFilters {
  currentAcademicYear: string | null;
  previousAcademicYear: string | null;
  courseFilter: string;
  categoryFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  statusFilter: '' | NotAdmittedStatus;
  searchTerm: string;
}

const FONT_SIZE = 8.5;
const CELL_PAD  = { top: 2.8, right: 3, bottom: 2.8, left: 3 };
const PAD_H     = CELL_PAD.left + CELL_PAD.right; // 6mm horizontal padding per cell

const ADMITTED_FILL:     [number, number, number] = [220, 252, 231]; // emerald-100
const NOT_ADMITTED_FILL: [number, number, number] = [254, 226, 226]; // red-100

// ── Column definitions — mirrors the autofit approach used by studentsPdf.ts ───
interface ColDef {
  header: string;
  halign: 'left' | 'center' | 'right';
  get: (r: NotAdmittedRow, i: number) => string | number;
}

const COLUMNS: ColDef[] = [
  { header: 'Sl',        halign: 'center', get: (_r, i) => i + 1 },
  { header: 'Student Name', halign: 'left', get: (r) => r.student.studentNameSSLC },
  { header: 'Reg No',    halign: 'left',   get: (r) => r.student.regNumber || '—' },
  { header: 'PrevYr',    halign: 'center', get: (r) => YEAR_ABBR[r.student.year] ?? r.student.year },
  { header: 'CurYr',     halign: 'center', get: (r) => (r.currentYear ? (YEAR_ABBR[r.currentYear] ?? r.currentYear) : '—') },
  { header: 'Crs',       halign: 'center', get: (r) => r.student.course },
  { header: 'Cat',       halign: 'center', get: (r) => r.student.category || '—' },
  { header: 'Type',      halign: 'center', get: (r) => (r.student.admType && ADM_TYPE_ABBR[r.student.admType]) || r.student.admType || '—' },
  { header: 'AdmCat',    halign: 'center', get: (r) => r.student.admCat || '—' },
  { header: 'Mobile No', halign: 'left',   get: (r) => r.student.studentMobile || r.student.fatherMobile || '—' },
  { header: 'Status',    halign: 'center', get: (r) => (r.status === 'ADMITTED' ? 'Admitted' : 'Not Admitted') },
];

export function exportNotAdmittedPdf(rows: NotAdmittedRow[], filters: NotAdmittedPdfFilters): void {
  const margin  = 10;
  const usableW = 210 - margin * 2; // 190mm — always portrait

  // ── Measure fixed columns (everything except Student Name) ─────────────────
  // Student Name is excluded — it gets whatever space remains after the fixed
  // columns, guaranteeing the table always fits the portrait page width.
  const NAME_IDX   = COLUMNS.findIndex((c) => c.header === 'Student Name');
  const measureDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  measureDoc.setFontSize(FONT_SIZE);

  let fixedTotal = 0;
  const colWidths: number[] = COLUMNS.map((col, idx) => {
    if (idx === NAME_IDX) return 0; // placeholder — filled below

    measureDoc.setFont('helvetica', 'bold');
    let w = measureDoc.getTextWidth(col.header);
    measureDoc.setFont('helvetica', 'normal');
    for (let i = 0; i < rows.length; i++) {
      const cw = measureDoc.getTextWidth(String(col.get(rows[i], i)));
      if (cw > w) w = cw;
    }
    const colW = w + PAD_H + 2;
    fixedTotal += colW;
    return colW;
  });

  colWidths[NAME_IDX] = Math.max(usableW - fixedTotal, 30);

  const finalWidths = colWidths;
  const tableWidth  = finalWidths.reduce((s, w) => s + w, 0);

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  const title = filters.previousAcademicYear && filters.currentAcademicYear
    ? `SMP Admissions — Not Admitted List  (${filters.previousAcademicYear} → ${filters.currentAcademicYear})`
    : 'SMP Admissions — Not Admitted List';
  doc.text(title, margin, 13);

  const chips: string[] = [];
  if (filters.courseFilter)   chips.push(filters.courseFilter);
  if (filters.categoryFilter) chips.push(filters.categoryFilter);
  if (filters.admTypeFilter)  chips.push(filters.admTypeFilter);
  if (filters.admCatFilter)   chips.push(filters.admCatFilter);
  if (filters.statusFilter)   chips.push(filters.statusFilter === 'ADMITTED' ? 'Admitted' : 'Not Admitted');
  if (filters.searchTerm)     chips.push(`"${filters.searchTerm}"`);
  chips.push(`${rows.length} student${rows.length !== 1 ? 's' : ''}`);

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), margin, 19.5);
  doc.text(`Generated ${dateStr}`, pageW - margin, 19.5, { align: 'right' });
  doc.setTextColor(0);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, 22, pageW - margin, 22);

  const body    = rows.map((r, i) => COLUMNS.map((c) => c.get(r, i)));
  const headers = [COLUMNS.map((c) => c.header)];

  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
  COLUMNS.forEach((col, idx) => {
    columnStyles[idx] = { cellWidth: finalWidths[idx], halign: col.halign };
  });

  autoTable(doc, {
    startY: 25,
    margin: { left: margin, right: margin, top: margin, bottom: 12 },
    head: headers,
    body,
    tableWidth,
    styles: {
      fontSize: FONT_SIZE,
      cellPadding: CELL_PAD,
      valign: 'middle',
      overflow: 'ellipsize',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: [20, 20, 20] as [number, number, number],
    },
    headStyles: {
      fillColor: [185, 28, 28],   // red-700
      textColor: 255,
      fontStyle: 'bold',
      fontSize: FONT_SIZE,
    },
    columnStyles,
    // Tint each row by admitted/not-admitted status instead of plain alternating stripes.
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const row = rows[data.row.index];
      if (!row) return;
      data.cell.styles.fillColor = row.status === 'ADMITTED' ? ADMITTED_FILL : NOT_ADMITTED_FILL;
    },
    didDrawPage: (data) => {
      const total = (doc as unknown as { internal: { getNumberOfPages(): number } })
        .internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Not Admitted List', margin, pageH - 4);
      doc.text(`Page ${data.pageNumber} of ${total}`, pageW - margin, pageH - 4, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  const parts = ['not_admitted'];
  if (filters.previousAcademicYear) parts.push(filters.previousAcademicYear.replace(/[^0-9-]/g, ''));
  if (filters.currentAcademicYear)  parts.push(filters.currentAcademicYear.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter)         parts.push(filters.courseFilter);
  doc.save(parts.join('_') + '.pdf');
}
