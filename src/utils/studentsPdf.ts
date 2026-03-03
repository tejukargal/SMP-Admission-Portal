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

export function exportStudentsPdf(students: Student[], filters: StudentsPdfFilters): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();  // 297mm
  const pageH = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 10;

  // ── Line 1: bold title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('SMP Admissions — Student List', margin, 13);

  // ── Line 2: filter context + count + date (right-aligned date)
  const parts: string[] = [];
  if (filters.academicYear)   parts.push(`AY ${filters.academicYear}`);
  if (filters.courseFilter)   parts.push(filters.courseFilter);
  if (filters.yearFilter)     parts.push(filters.yearFilter);
  if (filters.genderFilter)   parts.push(filters.genderFilter);
  if (filters.admTypeFilter)  parts.push(filters.admTypeFilter);
  if (filters.admCatFilter)   parts.push(filters.admCatFilter);
  if (filters.admStatusFilter) parts.push(filters.admStatusFilter);
  if (filters.searchTerm)     parts.push(`"${filters.searchTerm}"`);
  parts.push(`${students.length} student${students.length !== 1 ? 's' : ''}`);

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // slate-400
  doc.text(parts.join('  ·  '), margin, 19);
  doc.text(`Generated ${dateStr}`, pageW - margin, 19, { align: 'right' });
  doc.setTextColor(0);

  // ── Thin separator line
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.setLineWidth(0.2);
  doc.line(margin, 21.5, pageW - margin, 21.5);

  // ── Table
  const rows = students.map((s, i) => [
    i + 1,
    s.studentNameSSLC,
    s.regNumber || '—',
    s.course,
    s.year,
    s.gender,
    s.admType || '—',
    s.admCat || '—',
    s.studentMobile || '—',
    s.admissionStatus || '—',
  ]);

  autoTable(doc, {
    startY: 24,
    margin: { left: margin, right: margin, top: margin, bottom: 12 },
    head: [['#', 'Name (SSLC)', 'Reg No', 'Course', 'Year', 'Gender', 'Adm Type', 'Adm Cat', 'Mobile', 'Status']],
    body: rows,
    tableWidth: 'auto',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.8, right: 2.5, bottom: 1.8, left: 2.5 },
      valign: 'middle',
      overflow: 'ellipsize',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [30, 64, 175],   // blue-800
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles: {
      0: { cellWidth: 8,  halign: 'center' },  // #
      1: { cellWidth: 'auto' },                 // Name — absorbs leftover width
      2: { cellWidth: 25 },                     // Reg No
      3: { cellWidth: 14, halign: 'center' },   // Course
      4: { cellWidth: 22 },                     // Year
      5: { cellWidth: 15, halign: 'center' },   // Gender
      6: { cellWidth: 22 },                     // Adm Type
      7: { cellWidth: 16, halign: 'center' },   // Adm Cat
      8: { cellWidth: 25 },                     // Mobile
      9: { cellWidth: 24 },                     // Status
    },
    didDrawPage: (data) => {
      const totalPages = (doc as unknown as { internal: { getNumberOfPages(): number } })
        .internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(
        `Page ${data.pageNumber} of ${totalPages}`,
        pageW - margin,
        pageH - 4,
        { align: 'right' },
      );
      doc.setTextColor(0);
    },
  });

  // ── Filename
  const nameParts = ['students'];
  if (filters.academicYear) nameParts.push(filters.academicYear.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter)  nameParts.push(filters.courseFilter);
  if (filters.yearFilter)    nameParts.push(filters.yearFilter.replace(/\s+/g, ''));
  doc.save(nameParts.join('_') + '.pdf');
}
