import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Student } from '../types';

export interface StudentReportFilters {
  academicYear: string | null;
  courseFilter: string;
  yearFilter: string;
  genderFilter: string;
  categoryFilter: string;
  categoryGroupFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  searchTerm: string;
  dateFrom: string;
  dateTo: string;
}

const FONT_SIZE = 8.5;
const CELL_PAD  = { top: 2.5, right: 3, bottom: 2.5, left: 3 };
const PAD_H     = CELL_PAD.left + CELL_PAD.right;

function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const c = a.course.localeCompare(b.course);
    if (c !== 0) return c;
    return (b.sslcObtainedTotal ?? 0) - (a.sslcObtainedTotal ?? 0);
  });
}

export function exportStudentReportPdf(students: Student[], filters: StudentReportFilters): void {
  const margin   = 10;
  const doc      = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW    = doc.internal.pageSize.getWidth();
  const pageH    = doc.internal.pageSize.getHeight();
  const usableW  = pageW - margin * 2;

  const sorted = sortStudents(students);

  // ── Title ───────────────────────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const title = filters.academicYear
    ? `SMP Admissions — Student Report  (${filters.academicYear})`
    : 'SMP Admissions — Student Report';
  doc.text(title, margin, 13);

  // ── Sub-header: filter chips + date ─────────────────────────────────────────
  const chips: string[] = [];
  if (filters.courseFilter)  chips.push(filters.courseFilter);
  if (filters.yearFilter)    chips.push(filters.yearFilter);
  if (filters.genderFilter)  chips.push(filters.genderFilter);
  if (filters.categoryFilter) chips.push(filters.categoryFilter);
  if (filters.categoryGroupFilter) chips.push(filters.categoryGroupFilter);
  if (filters.admTypeFilter) chips.push(filters.admTypeFilter);
  if (filters.admCatFilter)  chips.push(filters.admCatFilter);
  if (filters.dateFrom || filters.dateTo) {
    chips.push(`Fee paid: ${filters.dateFrom || '—'} → ${filters.dateTo || '—'}`);
  }
  if (filters.searchTerm)    chips.push(`"${filters.searchTerm}"`);
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

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, 22, pageW - margin, 22);

  // ── Table data ───────────────────────────────────────────────────────────────
  const headers = [
    'Sl No', 'Name (SSLC)', 'Father Name', 'Gender', 'Category',
    'Course', 'Student Mob', 'Father Mob', 'SSLC Total', 'Income', 'Remarks',
  ];

  const rows = sorted.map((s, i) => [
    i + 1,
    s.studentNameSSLC,
    s.fatherName,
    s.gender === 'BOY' ? 'B' : 'G',
    s.category || '',
    s.course,
    s.studentMobile || '',
    s.fatherMobile || '',
    s.sslcObtainedTotal ?? '',
    s.annualIncome ?? '',
    '',
  ]);

  // ── Measure fixed-width columns ──────────────────────────────────────────────
  const measureDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  measureDoc.setFontSize(FONT_SIZE);

  // Indices that get auto-measured (everything except Name(1) and Father Name(2))
  const FIXED_IDXS = [0, 3, 4, 5, 6, 7, 8, 9, 10];
  const NAME_IDX   = 1;
  const FNAME_IDX  = 2;

  const colWidths: number[] = new Array(11).fill(0);
  let fixedTotal = 0;

  for (const idx of FIXED_IDXS) {
    measureDoc.setFont('helvetica', 'bold');
    let w = measureDoc.getTextWidth(headers[idx]);
    measureDoc.setFont('helvetica', 'normal');
    for (const row of rows) {
      const cw = measureDoc.getTextWidth(String(row[idx]));
      if (cw > w) w = cw;
    }
    const colW = w + PAD_H + 2;
    colWidths[idx] = colW;
    fixedTotal += colW;
  }

  const remaining       = Math.max(usableW - fixedTotal, 75);
  colWidths[NAME_IDX]   = Math.max(remaining * 0.55, 42);
  colWidths[FNAME_IDX]  = Math.max(remaining * 0.45, 33);

  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {
    0:  { cellWidth: colWidths[0],  halign: 'center' },
    1:  { cellWidth: colWidths[1],  halign: 'left'   },
    2:  { cellWidth: colWidths[2],  halign: 'left'   },
    3:  { cellWidth: colWidths[3],  halign: 'center' },
    4:  { cellWidth: colWidths[4],  halign: 'center' },
    5:  { cellWidth: colWidths[5],  halign: 'center' },
    6:  { cellWidth: colWidths[6],  halign: 'left'   },
    7:  { cellWidth: colWidths[7],  halign: 'left'   },
    8:  { cellWidth: colWidths[8],  halign: 'right'  },
    9:  { cellWidth: colWidths[9],  halign: 'right'  },
    10: { cellWidth: colWidths[10], halign: 'left'   },
  };

  const tableWidth = colWidths.reduce((s, w) => s + w, 0);

  autoTable(doc, {
    startY: 25,
    margin:  { left: margin, right: margin, top: margin, bottom: 12 },
    head:    [headers],
    body:    rows,
    tableWidth,
    styles: {
      fontSize:    FONT_SIZE,
      cellPadding: CELL_PAD,
      valign:      'middle',
      overflow:    'ellipsize',
      lineColor:   [203, 213, 225],
      lineWidth:   0.18,
      textColor:   [20, 20, 20] as [number, number, number],
    },
    headStyles: {
      fillColor:  [255, 230, 0],
      textColor:  [0, 0, 0],
      fontStyle:  'bold',
      fontSize:   FONT_SIZE,
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
      doc.text(`Page ${data.pageNumber} of ${total}`, pageW - margin, pageH - 4, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  // ── Filename ─────────────────────────────────────────────────────────────────
  const parts = ['student_report'];
  if (filters.academicYear)  parts.push(filters.academicYear.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter)  parts.push(filters.courseFilter);
  if (filters.yearFilter)    parts.push(filters.yearFilter.replace(/\s+/g, ''));
  doc.save(parts.join('_') + '.pdf');
}

export function exportStudentReportExcel(students: Student[], filters: StudentReportFilters): void {
  // dynamic import to avoid bundling xlsx in this util unless needed
  import('xlsx').then((XLSX) => {
    const sorted = sortStudents(students);
    const headers = [
      'Sl No', 'Name (SSLC)', 'Father Name', 'Gender', 'Category',
      'Course', 'Year', 'Adm Type', 'Adm Cat',
      'Student Mobile', 'Father Mobile',
      'SSLC Max', 'SSLC Total',
      'Maths Max', 'Maths Obtained',
      'Science Max', 'Science Obtained',
      'M+S Max', 'M+S Obtained',
      'Annual Income', 'Reg No', 'Merit No', 'Enrollment Date', 'Remarks',
    ];
    const rows = sorted.map((s, i) => [
      i + 1,
      s.studentNameSSLC,
      s.fatherName,
      s.gender === 'BOY' ? 'B' : 'G',
      s.category || '',
      s.course,
      s.year,
      s.admType || '',
      s.admCat || '',
      s.studentMobile || '',
      s.fatherMobile || '',
      s.sslcMaxTotal ?? '',
      s.sslcObtainedTotal ?? '',
      s.mathsMax ?? '',
      s.mathsObtained ?? '',
      s.scienceMax ?? '',
      s.scienceObtained ?? '',
      s.mathsScienceMaxTotal ?? '',
      s.mathsScienceObtainedTotal ?? '',
      s.annualIncome ?? '',
      s.regNumber || '',
      s.meritNumber || '',
      s.enrollmentDate || '',
      '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Bold yellow header row
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (!ws[addr]) continue;
      ws[addr].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'FFE600' } },
      };
    }

    // Column widths
    ws['!cols'] = [
      { wch: 6 }, { wch: 26 }, { wch: 22 }, { wch: 7 }, { wch: 8 },
      { wch: 7 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
      { wch: 14 }, { wch: 14 },
      { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 12 },
      { wch: 11 }, { wch: 14 },
      { wch: 9 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Report');

    const parts = ['student_report'];
    if (filters.academicYear) parts.push(filters.academicYear.replace(/[^0-9-]/g, ''));
    if (filters.courseFilter)  parts.push(filters.courseFilter);
    if (filters.yearFilter)    parts.push(filters.yearFilter.replace(/\s+/g, ''));
    XLSX.writeFile(wb, parts.join('_') + '.xlsx');
  });
}
