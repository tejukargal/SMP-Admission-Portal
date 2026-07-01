import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Student } from '../types';
import { formatColumnValue, type ColumnDef } from './studentColumns';

export interface CustomReportFilters {
  academicYear: string | null;
  courseFilter: string;
  yearFilter: string;
  genderFilter: string;
  categoryFilter: string;
  categoryGroupFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  searchTerm: string;
  sortDescription: string;
}

const FONT_SIZE = 8;
const CELL_PAD  = { top: 2.4, right: 2.5, bottom: 2.4, left: 2.5 };
const PAD_H     = CELL_PAD.left + CELL_PAD.right;

export function exportCustomStudentReportPdf(
  rows: Student[],
  columns: ColumnDef[],
  filters: CustomReportFilters,
): void {
  const margin      = 10;
  const PORTRAIT_W  = 210 - margin * 2;
  const LANDSCAPE_W = 297 - margin * 2;

  const orientation: 'portrait' | 'landscape' = columns.length > 7 ? 'landscape' : 'portrait';
  const usableW = orientation === 'landscape' ? LANDSCAPE_W : PORTRAIT_W;

  // Widest text column (by header length) gets the leftover width; the rest are measured.
  const wideIdx = columns.reduce((best, col, idx, arr) =>
    col.label.length > arr[best].label.length ? idx : best, 0);

  const measureDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  measureDoc.setFontSize(FONT_SIZE);

  let fixedTotal = 0;
  const colWidths: number[] = columns.map((col, idx) => {
    if (idx === wideIdx) return 0;
    measureDoc.setFont('helvetica', 'bold');
    let w = measureDoc.getTextWidth(col.label);
    measureDoc.setFont('helvetica', 'normal');
    for (const r of rows) {
      const cw = measureDoc.getTextWidth(formatColumnValue(col, r));
      if (cw > w) w = cw;
    }
    const colW = w + PAD_H + 2;
    fixedTotal += colW;
    return colW;
  });
  colWidths[wideIdx] = Math.max(usableW - fixedTotal, 25);

  const tableWidth = colWidths.reduce((s, w) => s + w, 0);

  const doc   = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — Custom Student Report', margin, 13);

  const chips: string[] = [];
  if (filters.academicYear) chips.push(`AY ${filters.academicYear}`);
  if (filters.courseFilter) chips.push(filters.courseFilter);
  if (filters.yearFilter)   chips.push(filters.yearFilter);
  if (filters.genderFilter) chips.push(filters.genderFilter);
  if (filters.categoryFilter) chips.push(filters.categoryFilter);
  if (filters.categoryGroupFilter) chips.push(filters.categoryGroupFilter);
  if (filters.admTypeFilter) chips.push(filters.admTypeFilter);
  if (filters.admCatFilter)  chips.push(filters.admCatFilter);
  if (filters.searchTerm)    chips.push(`"${filters.searchTerm}"`);
  if (filters.sortDescription) chips.push(`Sorted by ${filters.sortDescription}`);
  chips.push(`${rows.length} student${rows.length !== 1 ? 's' : ''}`);

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), margin, 19.5);
  doc.text(`Generated ${dateStr}`, pageW - margin, 19.5, { align: 'right' });
  doc.setTextColor(0);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, 22, pageW - margin, 22);

  const headers = [columns.map((c) => c.label)];
  const body = rows.map((r) => columns.map((c) => formatColumnValue(c, r)));

  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
  columns.forEach((col, idx) => {
    columnStyles[idx] = { cellWidth: colWidths[idx], halign: col.align };
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
      fillColor: [109, 40, 217],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: FONT_SIZE,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    didDrawPage: (data) => {
      const total = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${data.pageNumber} of ${total}`, pageW - margin, pageH - 4, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  const parts = ['custom_student_report'];
  if (filters.academicYear) parts.push(filters.academicYear.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter) parts.push(filters.courseFilter);
  if (filters.yearFilter)   parts.push(filters.yearFilter.replace(/\s+/g, ''));
  doc.save(parts.join('_') + '.pdf');
}
