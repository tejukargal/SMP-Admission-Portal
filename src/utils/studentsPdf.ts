import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Student } from '../types';

export interface StudentsPdfFilters {
  academicYear: string | null;
  courseFilter: string;
  yearFilter: string;
  genderFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  admStatusFilter: string;
  searchTerm: string;
}

const FONT_SIZE = 8.5;
const CELL_PAD  = { top: 2.8, right: 3, bottom: 2.8, left: 3 };
const PAD_H     = CELL_PAD.left + CELL_PAD.right; // 6mm horizontal padding per cell

// ── Column definitions ────────────────────────────────────────────────────────
interface ColDef {
  header: string;
  halign: 'left' | 'center' | 'right';
  get: (s: Student, i: number) => string | number;
}

const COLUMNS: ColDef[] = [
  { header: 'Sl',       halign: 'center', get: (_s, i) => i + 1              },
  { header: 'Name',     halign: 'left',   get: (s)    => s.studentNameSSLC   },
  { header: 'Year',     halign: 'left',   get: (s)    => s.year              },
  { header: 'Course',   halign: 'center', get: (s)    => s.course            },
  { header: 'Reg No',   halign: 'left',   get: (s)    => s.regNumber || '—'  },
  { header: 'Cat',      halign: 'center', get: (s)    => s.category || '—'   },
  { header: 'Adm Type', halign: 'left',   get: (s)    => s.admType           },
  { header: 'Adm Cat',  halign: 'center', get: (s)    => s.admCat            },
];

// ── Sort ─────────────────────────────────────────────────────────────────────
const YEAR_ORDER: Record<string, number> = {
  '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3,
};

function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const n = a.studentNameSSLC.localeCompare(b.studentNameSSLC);
    if (n !== 0) return n;
    const y = (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9);
    if (y !== 0) return y;
    return a.course.localeCompare(b.course);
  });
}

// ── Main export ───────────────────────────────────────────────────────────────
export function exportStudentsPdf(students: Student[], filters: StudentsPdfFilters): void {
  const margin        = 10;
  const PORTRAIT_W    = 210 - margin * 2;  // 190mm
  const LANDSCAPE_W   = 297 - margin * 2;  // 277mm

  const sorted = sortStudents(students);

  // ── Step 1: measure columns using a throw-away doc ────────────────────────
  // Column widths depend only on font/size, not page size, so we can measure
  // before knowing the final orientation.
  const measureDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  measureDoc.setFontSize(FONT_SIZE);

  const colWidths = COLUMNS.map((col) => {
    measureDoc.setFont('helvetica', 'bold');
    let w = measureDoc.getTextWidth(col.header);

    measureDoc.setFont('helvetica', 'normal');
    for (let i = 0; i < sorted.length; i++) {
      const cw = measureDoc.getTextWidth(String(col.get(sorted[i], i)));
      if (cw > w) w = cw;
    }
    // text width + horizontal padding + 1mm breathing room each side
    return w + PAD_H + 2;
  });

  const naturalTotal = colWidths.reduce((s, w) => s + w, 0);

  // ── Step 2: pick orientation ──────────────────────────────────────────────
  // Prefer portrait; promote to landscape only if content doesn't fit.
  // Hard rule: >9 columns always landscape (current dataset = 9 → portrait by default).
  const needsLandscape = COLUMNS.length > 9 || naturalTotal > PORTRAIT_W;
  const orientation: 'portrait' | 'landscape' = needsLandscape ? 'landscape' : 'portrait';
  const usableW = needsLandscape ? LANDSCAPE_W : PORTRAIT_W;

  // ── Step 3: scale only as last resort (extreme edge case) ─────────────────
  // Even in landscape, extremely long names could overflow — scale uniformly.
  const scale       = naturalTotal > usableW ? usableW / naturalTotal : 1;
  const finalWidths = colWidths.map((w) => Math.floor(w * scale * 10) / 10);
  const tableWidth  = finalWidths.reduce((s, w) => s + w, 0);

  // ── Create the real doc with the determined orientation ───────────────────
  const doc   = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ── Line 1: bold title ────────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — Student List', margin, 13);

  // ── Line 2: filter context  ·  count  |  date ────────────────────────────
  const chips: string[] = [];
  if (filters.academicYear)    chips.push(`AY ${filters.academicYear}`);
  if (filters.courseFilter)    chips.push(filters.courseFilter);
  if (filters.yearFilter)      chips.push(filters.yearFilter);
  if (filters.genderFilter)    chips.push(filters.genderFilter);
  if (filters.admTypeFilter)   chips.push(filters.admTypeFilter);
  if (filters.admCatFilter)    chips.push(filters.admCatFilter);
  if (filters.admStatusFilter) chips.push(filters.admStatusFilter);
  if (filters.searchTerm)      chips.push(`"${filters.searchTerm}"`);
  chips.push(`${students.length} student${students.length !== 1 ? 's' : ''}`);

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), margin, 19.5);
  doc.text(`Generated ${dateStr}`, pageW - margin, 19.5, { align: 'right' });
  doc.setTextColor(0);

  // Thin separator
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, 22, pageW - margin, 22);

  // ── Build table data ──────────────────────────────────────────────────────
  const rows    = sorted.map((s, i) => COLUMNS.map((c) => c.get(s, i)));
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

  // ── Filename ──────────────────────────────────────────────────────────────
  const parts = ['students'];
  if (filters.academicYear) parts.push(filters.academicYear.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter)  parts.push(filters.courseFilter);
  if (filters.yearFilter)    parts.push(filters.yearFilter.replace(/\s+/g, ''));
  doc.save(parts.join('_') + '.pdf');
}
