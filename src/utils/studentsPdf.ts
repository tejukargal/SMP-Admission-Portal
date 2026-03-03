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

// ── Column definitions ────────────────────────────────────────────────────────
interface ColDef {
  header: string;
  /** Fixed mm width, or 'auto' to absorb remaining page width */
  width: number | 'auto';
  halign: 'left' | 'center' | 'right';
  get: (s: Student, i: number) => string | number;
}

const COLUMNS: ColDef[] = [
  { header: 'Sl',       width: 10,     halign: 'center', get: (_s, i) => i + 1               },
  { header: 'Name',     width: 'auto', halign: 'left',   get: (s)    => s.studentNameSSLC     },
  { header: 'Year',     width: 22,     halign: 'left',   get: (s)    => s.year                },
  { header: 'Course',   width: 16,     halign: 'center', get: (s)    => s.course              },
  { header: 'Reg No',   width: 28,     halign: 'left',   get: (s)    => s.regNumber  || '—'   },
  { header: 'Gender',   width: 16,     halign: 'center', get: (s)    => s.gender              },
  { header: 'Cat',      width: 14,     halign: 'center', get: (s)    => s.category   || '—'   },
  { header: 'Adm Type', width: 22,     halign: 'left',   get: (s)    => s.admType             },
  { header: 'Adm Cat',  width: 20,     halign: 'center', get: (s)    => s.admCat              },
];

// ── Sort ─────────────────────────────────────────────────────────────────────
const YEAR_ORDER: Record<string, number> = { 'NURSERY': 0, '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3 };

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
  const colCount = COLUMNS.length;
  const orientation: 'portrait' | 'landscape' = colCount <= 7 ? 'portrait' : 'landscape';

  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const usableW = pageW - margin * 2;

  // Resolve 'auto' column width — give Name all the remaining space
  const fixedTotal = COLUMNS.reduce<number>((s, c) => s + (c.width === 'auto' ? 0 : c.width), 0);
  const autoW = Math.max(usableW - fixedTotal, 30); // at least 30mm for Name

  // ── Line 1: bold title ────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — Student List', margin, 13);

  // ── Line 2: filter chips + count  /  generated date ──────────────────────
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

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), margin, 19);
  doc.text(`Generated ${dateStr}`, pageW - margin, 19, { align: 'right' });
  doc.setTextColor(0);

  // Separator
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, 21.5, pageW - margin, 21.5);

  // ── Sort & build rows ─────────────────────────────────────────────────────
  const sorted = sortStudents(students);
  const rows = sorted.map((s, i) => COLUMNS.map((c) => c.get(s, i)));
  const headers = [COLUMNS.map((c) => c.header)];

  // ── autoTable column styles ───────────────────────────────────────────────
  const columnStyles: Record<number, { cellWidth: number | 'auto'; halign: 'left' | 'center' | 'right' }> = {};
  COLUMNS.forEach((col, idx) => {
    columnStyles[idx] = {
      cellWidth: col.width === 'auto' ? autoW : col.width,
      halign: col.halign,
    };
  });

  autoTable(doc, {
    startY: 24,
    margin: { left: margin, right: margin, top: margin, bottom: 12 },
    head: headers,
    body: rows,
    tableWidth: usableW,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      valign: 'middle',
      overflow: 'ellipsize',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    didDrawPage: (data) => {
      const total = (doc as unknown as { internal: { getNumberOfPages(): number } })
        .internal.getNumberOfPages();
      doc.setFontSize(7);
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
