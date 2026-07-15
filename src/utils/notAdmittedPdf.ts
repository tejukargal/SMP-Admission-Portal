import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Student } from '../types';

const YEAR_ABBR: Record<string, string> = {
  '1ST YEAR': '1st', '2ND YEAR': '2nd', '3RD YEAR': '3rd',
};
const ADM_TYPE_ABBR: Record<string, string> = {
  REGULAR: 'REG', REPEATER: 'RPTR', LATERAL: 'LTRL', EXTERNAL: 'EXTL', SNQ: 'SNQ',
};

export interface NotAdmittedPdfFilters {
  currentAcademicYear: string | null;
  previousAcademicYear: string | null;
  courseFilter: string;
  categoryFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  searchTerm: string;
}

const FONT_SIZE = 8.5;
const CELL_PAD  = { top: 2.8, right: 3, bottom: 2.8, left: 3 };
const PAD_H     = CELL_PAD.left + CELL_PAD.right; // 6mm horizontal padding per cell

// ── Column definitions — mirrors the autofit approach used by studentsPdf.ts ───
interface ColDef {
  header: string;
  halign: 'left' | 'center' | 'right';
  get: (s: Student, i: number) => string | number;
}

const COLUMNS: ColDef[] = [
  { header: 'Sl',        halign: 'center', get: (_s, i) => i + 1 },
  { header: 'Student Name', halign: 'left', get: (s) => s.studentNameSSLC },
  { header: 'Reg No',    halign: 'left',   get: (s) => s.regNumber || '—' },
  { header: 'Yr',        halign: 'center', get: (s) => YEAR_ABBR[s.year] ?? s.year },
  { header: 'Crs',       halign: 'center', get: (s) => s.course },
  { header: 'Cat',       halign: 'center', get: (s) => s.category || '—' },
  { header: 'Type',      halign: 'center', get: (s) => (s.admType && ADM_TYPE_ABBR[s.admType]) || s.admType || '—' },
  { header: 'AdmCat',    halign: 'center', get: (s) => s.admCat || '—' },
  { header: 'Mobile No', halign: 'left',   get: (s) => s.studentMobile || s.fatherMobile || '—' },
];

export function exportNotAdmittedPdf(students: Student[], filters: NotAdmittedPdfFilters): void {
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
    for (let i = 0; i < students.length; i++) {
      const cw = measureDoc.getTextWidth(String(col.get(students[i], i)));
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
  if (filters.searchTerm)     chips.push(`"${filters.searchTerm}"`);
  chips.push(`${students.length} student${students.length !== 1 ? 's' : ''}`);

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

  const rows    = students.map((s, i) => COLUMNS.map((c) => c.get(s, i)));
  const headers = [COLUMNS.map((c) => c.header)];

  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
  COLUMNS.forEach((col, idx) => {
    columnStyles[idx] = { cellWidth: finalWidths[idx], halign: col.halign };
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
      textColor: [20, 20, 20] as [number, number, number],
    },
    headStyles: {
      fillColor: [185, 28, 28],   // red-700
      textColor: 255,
      fontStyle: 'bold',
      fontSize: FONT_SIZE,
    },
    alternateRowStyles: {
      fillColor: [254, 242, 242],
    },
    columnStyles,
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
