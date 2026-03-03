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

// ── Typography constants ──────────────────────────────────────────────────────
const FONT_SIZE  = 8.5;   // body + header row
const PAD_H      = 6;     // left(3) + right(3) per cell in mm
// Empirical: helvetica uppercase avg character width ≈ 0.21mm per point
const CHAR_W     = FONT_SIZE * 0.21;
// Bold header text is ~10% wider
const CHAR_W_BOLD = CHAR_W * 1.1;

/** Estimate minimum cell width for a string at the given char-width constant. */
function colW(text: string, charW = CHAR_W): number {
  return Math.ceil(text.length * charW) + PAD_H;
}

// ── Column definitions ────────────────────────────────────────────────────────
interface ColDef {
  header: string;
  /** Pre-computed fixed width in mm. Undefined only for Name (computed from data). */
  fixedWidth?: number;
  halign: 'left' | 'center' | 'right';
  get: (s: Student, i: number) => string | number;
}

// Fixed widths are the larger of header (bold) or longest possible content value.
const COLUMNS: ColDef[] = [
  {
    header: 'Sl',
    fixedWidth: Math.max(colW('Sl', CHAR_W_BOLD), colW('9999')),
    halign: 'center',
    get: (_s, i) => i + 1,
  },
  {
    header: 'Name',
    // fixedWidth left undefined — computed dynamically from actual data
    halign: 'left',
    get: (s) => s.studentNameSSLC,
  },
  {
    header: 'Year',
    fixedWidth: Math.max(colW('Year', CHAR_W_BOLD), colW('3RD YEAR')),
    halign: 'left',
    get: (s) => s.year,
  },
  {
    header: 'Course',
    fixedWidth: Math.max(colW('Course', CHAR_W_BOLD), colW('CS')),
    halign: 'center',
    get: (s) => s.course,
  },
  {
    header: 'Reg No',
    fixedWidth: Math.max(colW('Reg No', CHAR_W_BOLD), colW('CE/2024-25/999')),
    halign: 'left',
    get: (s) => s.regNumber || '—',
  },
  {
    header: 'Gender',
    fixedWidth: Math.max(colW('Gender', CHAR_W_BOLD), colW('GIRL')),
    halign: 'center',
    get: (s) => s.gender,
  },
  {
    header: 'Cat',
    fixedWidth: Math.max(colW('Cat', CHAR_W_BOLD), colW('OTHERS')),
    halign: 'center',
    get: (s) => s.category || '—',
  },
  {
    header: 'Adm Type',
    fixedWidth: Math.max(colW('Adm Type', CHAR_W_BOLD), colW('REPEATER')),
    halign: 'left',
    get: (s) => s.admType,
  },
  {
    header: 'Adm Cat',
    fixedWidth: Math.max(colW('Adm Cat', CHAR_W_BOLD), colW('OTHERS')),
    halign: 'center',
    get: (s) => s.admCat,
  },
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
  const colCount   = COLUMNS.length;
  const orientation: 'portrait' | 'landscape' = colCount > 9 ? 'landscape' : 'portrait';

  const doc    = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 10;
  const usableW = pageW - margin * 2;

  // Sort first — needed for Name-width calculation
  const sorted = sortStudents(students);

  // ── Compute Name column width from actual data ────────────────────────────
  const fixedTotal = COLUMNS.reduce<number>((s, c) => s + (c.fixedWidth ?? 0), 0);
  const maxNameChars = sorted.reduce((m, s) => Math.max(m, s.studentNameSSLC.length), 0);
  // Width needed for the longest name + a small 3mm breathing room
  const nameNeeded  = Math.ceil(maxNameChars * CHAR_W) + PAD_H + 3;
  // Can't exceed the space left after all fixed columns; at least 38mm
  const nameW = Math.max(Math.min(nameNeeded, usableW - fixedTotal), 38);

  // ── Line 1: bold title ────────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — Student List', margin, 13);

  // ── Line 2: filter chips + count  |  date (right-aligned) ────────────────
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

  // ── Build table rows ──────────────────────────────────────────────────────
  const rows    = sorted.map((s, i) => COLUMNS.map((c) => c.get(s, i)));
  const headers = [COLUMNS.map((c) => c.header)];

  // ── Column styles ─────────────────────────────────────────────────────────
  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
  COLUMNS.forEach((col, idx) => {
    columnStyles[idx] = {
      cellWidth: col.fixedWidth !== undefined ? col.fixedWidth : nameW,
      halign: col.halign,
    };
  });

  autoTable(doc, {
    startY: 25,
    margin: { left: margin, right: margin, top: margin, bottom: 12 },
    head: headers,
    body: rows,
    // Table width = exact sum of columns (no padding to page edge)
    tableWidth: fixedTotal + nameW,
    styles: {
      fontSize: FONT_SIZE,
      cellPadding: { top: 2.8, right: 3, bottom: 2.8, left: 3 },
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
