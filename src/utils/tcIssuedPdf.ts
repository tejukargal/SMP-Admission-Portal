import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export interface TcRow {
  studentId: string;
  studentName: string;
  course: string;
  year: string;
  category: string;
  enrollmentYear: string;
  regNumber: string;
  tcId: string;
  tcNumber: string;
  dateOfAdmission: string;
  dateOfLeaving: string;
  semester: string;
  lastExam: string;
  result: string;
  isDuplicate: boolean;
  issuedAt: string;
  tcAcademicYear: string;
}

export function exportTcIssuedPdf(rows: TcRow[], filters: {
  tcYearFilter: string;
  courseFilter: string;
  yearFilter: string;
  genderFilter: string;
  categoryFilter: string;
  admTypeFilter: string;
  admCatFilter: string;
  searchTerm: string;
}): void {
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W      = doc.internal.pageSize.getWidth();
  const MARGIN = 12;
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const yearLabel = filters.tcYearFilter === 'ALL' ? 'All Academic Years' : filters.tcYearFilter;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`SMP Admissions — TC Issued List  (${yearLabel})`, W / 2, 13, { align: 'center' });

  const chips: string[] = [];
  if (filters.courseFilter)   chips.push(filters.courseFilter);
  if (filters.yearFilter)     chips.push(filters.yearFilter);
  if (filters.genderFilter)   chips.push(filters.genderFilter);
  if (filters.categoryFilter) chips.push(filters.categoryFilter);
  if (filters.admTypeFilter)  chips.push(filters.admTypeFilter);
  if (filters.admCatFilter)   chips.push(filters.admCatFilter);
  if (filters.searchTerm)     chips.push(`"${filters.searchTerm}"`);
  chips.push(`${rows.length} TC${rows.length !== 1 ? 's' : ''}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), MARGIN, 20);
  doc.text(`Generated ${dateStr}`, W - MARGIN, 20, { align: 'right' });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 23, W - MARGIN, 23);
  doc.setTextColor(0);

  const HEAD: [number, number, number]  = [29, 78, 216];   // blue-700
  const WHITE: [number, number, number] = [255, 255, 255];
  const GRID: [number, number, number]  = [210, 215, 220];

  // Usable width = 210 - 12 - 12 = 186 mm
  autoTable(doc, {
    startY: 26,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Sl', 'Student Name', 'Course', 'Reg No', 'TC Number', 'Date of Leaving', 'Semester', 'Result']],
    body: rows.map((r, i) => [
      i + 1,
      r.isDuplicate ? `${r.studentName} ★` : r.studentName,
      r.course,
      r.regNumber || '—',
      r.tcNumber,
      r.dateOfLeaving || '—',
      r.semester || '—',
      r.result || '—',
    ]),
    styles: { overflow: 'ellipsize' },
    headStyles: {
      fillColor: HEAD, textColor: WHITE, fontStyle: 'bold',
      fontSize: 9.5, cellPadding: { top: 3, right: 3.5, bottom: 3, left: 3.5 },
    },
    bodyStyles: {
      fontSize: 9.5, cellPadding: { top: 3, right: 3.5, bottom: 3, left: 3.5 },
      lineColor: GRID, lineWidth: 0.18, textColor: [20, 20, 20] as [number, number, number],
    },
    alternateRowStyles: { fillColor: [239, 246, 255] as [number, number, number] },
    // Usable width = 186mm. Columns: 13+47+14+22+26+25+22+17 = 186mm.
    columnStyles: {
      0: { cellWidth: 13, halign: 'center' },
      1: { cellWidth: 47 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 22 },
      4: { cellWidth: 26 },
      5: { cellWidth: 25 },
      6: { cellWidth: 22 },
      7: { cellWidth: 17 },
    },
  });

  const totalPages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`TC Issued List — ${yearLabel}`, MARGIN, H - 5);
    doc.text(`Page ${p} of ${totalPages}`, W - MARGIN, H - 5, { align: 'right' });
  }

  const parts = ['tc_issued'];
  if (filters.tcYearFilter !== 'ALL') parts.push(filters.tcYearFilter.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter)           parts.push(filters.courseFilter);
  if (filters.yearFilter)             parts.push(filters.yearFilter.replace(/\s+/g, ''));
  doc.save(parts.join('_') + '.pdf');
}
