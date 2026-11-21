import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Student } from '../types';
import { formatColumnValue, type ColumnDef } from './studentColumns';

// Settings › Yearwise Students PDF. Unlike the Custom Report PDF (one flexible
// column, ellipsized), every chosen column must be visible: columns get their
// natural width, the widest ones are capped and wrap onto extra lines, and the
// font / page size step down (A4 → A3 landscape) until the table fits.

const PAD = 1.1;           // mm each side
const MARGIN = 8;
const MIN_CAP = 9;         // narrowest a capped (wrapping) column may get, mm
const LAYOUTS: { format: 'a4' | 'a3'; font: number }[] = [
  { format: 'a4', font: 7.5 }, { format: 'a4', font: 6.8 }, { format: 'a4', font: 6.2 }, { format: 'a4', font: 5.6 },
  { format: 'a3', font: 7 }, { format: 'a3', font: 6 }, { format: 'a3', font: 5.2 },
];

interface Fit { format: 'a4' | 'a3'; font: number; widths: number[] }

function longestWord(doc: jsPDF, text: string): number {
  return Math.max(0, ...text.split(/\s+/).map((w) => doc.getTextWidth(w)));
}

function fitColumns(rows: string[][], headers: string[]): Fit {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let last: Fit | null = null;
  for (const { format, font } of LAYOUTS) {
    const usable = (format === 'a4' ? 297 : 420) - MARGIN * 2;
    doc.setFontSize(font);
    // natural = widest single-line content; floor = what must not wrap mid-word
    const natural: number[] = [];
    const floor: number[] = [];
    headers.forEach((h, i) => {
      doc.setFont('helvetica', 'bold');
      let n = doc.getTextWidth(h);
      let f = longestWord(doc, h);
      doc.setFont('helvetica', 'normal');
      for (const r of rows) {
        const v = r[i];
        n = Math.max(n, doc.getTextWidth(v));
        f = Math.max(f, Math.min(longestWord(doc, v), 30));
      }
      natural.push(n + PAD * 2 + 0.6);
      floor.push(Math.min(f + PAD * 2 + 0.6, natural[natural.length - 1]));
    });

    const total = natural.reduce((a, b) => a + b, 0);
    if (total <= usable) {
      // Stretch proportionally so the table spans the page.
      const k = usable / total;
      return { format, font, widths: natural.map((w) => w * Math.min(k, 1.6)) };
    }
    // Find the cap c where Σ max(floor, min(natural, c)) == usable.
    const widthAt = (c: number) => natural.map((n, i) => Math.max(floor[i], Math.min(n, c)));
    const sumAt = (c: number) => widthAt(c).reduce((a, b) => a + b, 0);
    if (sumAt(MIN_CAP) <= usable) {
      let lo = MIN_CAP, hi = Math.max(...natural);
      for (let it = 0; it < 40; it++) {
        const mid = (lo + hi) / 2;
        if (sumAt(mid) > usable) hi = mid; else lo = mid;
      }
      return { format, font, widths: widthAt(lo) };
    }
    last = { format, font, widths: widthAt(MIN_CAP) };
  }
  // Extremely many columns: squeeze proportionally on A3.
  const usable = 420 - MARGIN * 2;
  const sum = last!.widths.reduce((a, b) => a + b, 0);
  return { ...last!, widths: last!.widths.map((w) => (w * usable) / sum) };
}

export interface YearwisePdfInput {
  students: Student[];   // sorted
  columns: ColumnDef[];  // including slNo / academicYear as wanted
  title: string;
  filterLine: string;
  fileName: string;
}

export function exportYearwiseStudentsPdf({ students, columns, title, filterLine, fileName }: YearwisePdfInput): void {
  const headers = columns.map((c) => c.label);
  const body = students.map((s, i) => columns.map((c) => {
    const v = formatColumnValue(c, s, i);
    return v === '—' ? '' : v;
  }));

  const fit = fitColumns(body, headers);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: fit.format });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(title, MARGIN, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const info = `${filterLine}  ·  ${students.length} student${students.length !== 1 ? 's' : ''}`;
  doc.text(doc.splitTextToSize(info, pageW - MARGIN * 2 - 40) as string[], MARGIN, 16);
  doc.text(`Generated ${dateStr}`, pageW - MARGIN, 16, { align: 'right' });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 19.5, pageW - MARGIN, 19.5);

  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
  columns.forEach((c, i) => { columnStyles[i] = { cellWidth: fit.widths[i], halign: c.align }; });

  autoTable(doc, {
    startY: 22,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 10 },
    head: [headers],
    body,
    tableWidth: fit.widths.reduce((a, b) => a + b, 0),
    styles: {
      font: 'helvetica',
      fontSize: fit.font,
      cellPadding: { top: 1.2, bottom: 1.2, left: PAD, right: PAD },
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.12,
      textColor: [20, 20, 20],
    },
    headStyles: { fillColor: [11, 123, 192], textColor: 255, fontStyle: 'bold', fontSize: fit.font, halign: 'center' },
    alternateRowStyles: { fillColor: [247, 250, 252] },
    columnStyles,
    didDrawPage: (data) => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${data.pageNumber}`, pageW - MARGIN, pageH - 4, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}
