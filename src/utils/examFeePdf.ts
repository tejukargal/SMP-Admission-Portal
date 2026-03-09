import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Student } from '../types';

export interface ExamFeePdfFilters {
  academicYear: string | null;
  courseFilter: string;
  yearFilter: string;
  genderFilter: string;
  categoryFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  admStatusFilter: string;
  paidFilter: 'all' | 'paid' | 'unpaid';
  searchTerm: string;
}

const FONT_SIZE = 8.5;
const CELL_PAD  = { top: 2.8, right: 3, bottom: 2.8, left: 3 };
const PAD_H     = CELL_PAD.left + CELL_PAD.right;

const YEAR_ORDER: Record<string, number> = {
  '1ST YEAR': 1, '2ND YEAR': 2, '3RD YEAR': 3,
};

interface ColDef {
  header: string;
  halign: 'left' | 'center' | 'right';
  get: (s: Student, i: number, paid: boolean) => string | number;
}

const COLUMNS: ColDef[] = [
  { header: 'Sl',              halign: 'center', get: (_s, i)        => i + 1                               },
  { header: 'Reg No',          halign: 'left',   get: (s)            => s.regNumber || '—'                  },
  { header: 'Name',            halign: 'left',   get: (s)            => s.studentNameSSLC                   },
  { header: 'Course',          halign: 'center', get: (s)            => s.course                            },
  { header: 'Year',            halign: 'left',   get: (s)            => s.year                              },
  { header: 'Adm Type',        halign: 'left',   get: (s)            => s.admType || '—'                    },
  { header: 'Adm Cat',         halign: 'center', get: (s)            => s.admCat || '—'                     },
  { header: 'Cat',             halign: 'center', get: (s)            => s.category || '—'                   },
  { header: 'Exam Fee Status', halign: 'center', get: (_s, _i, paid) => paid ? 'PAID' : 'UNPAID'            },
];

export function exportExamFeePdf(
  students: Student[],
  paidMap: Record<string, boolean>,
  filters: ExamFeePdfFilters,
): void {
  const margin     = 10;
  const PORTRAIT_W = 210 - margin * 2;  // 190mm

  // Students are already sorted by the page, but re-sort for safety
  const sorted = [...students].sort((a, b) => {
    const y = (YEAR_ORDER[a.year] ?? 9) - (YEAR_ORDER[b.year] ?? 9);
    if (y !== 0) return y;
    const c = a.course.localeCompare(b.course);
    if (c !== 0) return c;
    return a.studentNameSSLC.localeCompare(b.studentNameSSLC);
  });

  // Always portrait — measure fixed columns, Name gets the remainder
  const NAME_IDX   = COLUMNS.findIndex((c) => c.header === 'Name');
  const measureDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  measureDoc.setFontSize(FONT_SIZE);

  let fixedTotal = 0;
  const colWidths: number[] = COLUMNS.map((col, idx) => {
    if (idx === NAME_IDX) return 0;

    measureDoc.setFont('helvetica', 'bold');
    let w = measureDoc.getTextWidth(col.header);
    measureDoc.setFont('helvetica', 'normal');
    for (let i = 0; i < sorted.length; i++) {
      const val = String(col.get(sorted[i], i, paidMap[sorted[i].id] ?? false));
      const cw  = measureDoc.getTextWidth(val);
      if (cw > w) w = cw;
    }
    const colW = w + PAD_H + 2;
    fixedTotal += colW;
    return colW;
  });

  colWidths[NAME_IDX] = Math.max(PORTRAIT_W - fixedTotal, 30);

  const tableWidth = colWidths.reduce((s, w) => s + w, 0);

  // Build document
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — Exam Fee List', margin, 13);

  // Subtitle: filter chips + count + date
  const chips: string[] = [];
  if (filters.academicYear)    chips.push(`AY ${filters.academicYear}`);
  if (filters.courseFilter)    chips.push(filters.courseFilter);
  if (filters.yearFilter)      chips.push(filters.yearFilter);
  if (filters.genderFilter)    chips.push(filters.genderFilter);
  if (filters.categoryFilter)  chips.push(filters.categoryFilter);
  if (filters.admTypeFilter)   chips.push(filters.admTypeFilter);
  if (filters.admCatFilter)    chips.push(filters.admCatFilter);
  if (filters.admStatusFilter) chips.push(filters.admStatusFilter);
  if (filters.paidFilter !== 'all') chips.push(filters.paidFilter.toUpperCase());
  if (filters.searchTerm)      chips.push(`"${filters.searchTerm}"`);
  chips.push(`${sorted.length} student${sorted.length !== 1 ? 's' : ''}`);

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), margin, 19.5);
  doc.text(`Generated ${dateStr}`, pageW - margin, 19.5, { align: 'right' });
  doc.setTextColor(0);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, 22, pageW - margin, 22);

  // Table data
  const rows    = sorted.map((s, i) => COLUMNS.map((c) => c.get(s, i, paidMap[s.id] ?? false)));
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
    // Colour the Exam Fee Status cell green (PAID) or red (UNPAID)
    didParseCell: (data) => {
      const STATUS_IDX = COLUMNS.findIndex((c) => c.header === 'Exam Fee Status');
      if (data.section === 'body' && data.column.index === STATUS_IDX) {
        const isPaid = data.cell.raw === 'PAID';
        data.cell.styles.textColor = isPaid ? [21, 128, 61] : [185, 28, 28];
        data.cell.styles.fontStyle = 'bold';
      }
    },
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

  // Filename
  const parts = ['exam-fee'];
  if (filters.academicYear)  parts.push(filters.academicYear.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter)  parts.push(filters.courseFilter);
  if (filters.yearFilter)    parts.push(filters.yearFilter.replace(/\s+/g, ''));
  if (filters.paidFilter !== 'all') parts.push(filters.paidFilter);
  doc.save(parts.join('_') + '.pdf');
}
