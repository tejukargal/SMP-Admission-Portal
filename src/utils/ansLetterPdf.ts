import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { AnsLetterStatus } from '../types';

export interface AnsRow {
  studentId: string;
  studentName: string;
  regNumber: string;
  fatherName: string;
  course: string;
  year: string;
  academicYear: string;
  recordId: string;
  issuedAt: string; // ISO
  issuedBy: string;
  status: AnsLetterStatus;
}

type JsPDFWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

const COURSE_ORDER = ['CE', 'ME', 'EC', 'CS', 'EE'];
const HEAD: [number, number, number] = [30, 64, 175]; // navy — matches other exporters
const WHITE: [number, number, number] = [255, 255, 255];
const GRID: [number, number, number] = [210, 215, 220];

const STATUS_LABEL: Record<AnsLetterStatus, string> = {
  sent: 'Sent',
  visited: 'Parent Visited',
  resolved: 'Resolved',
};

function footer(doc: jsPDF, title: string): void {
  const W = doc.internal.pageSize.getWidth();
  const totalPages = (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(title, 14, H - 5);
    doc.text(`Page ${p} of ${totalPages}`, W - 14, H - 5, { align: 'right' });
  }
}

function courseSort(a: string, b: string): number {
  const ia = COURSE_ORDER.indexOf(a);
  const ib = COURSE_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
}

// ── 1. Flat filtered issued list ────────────────────────────────────────────
export function exportAnsIssuedListPdf(rows: AnsRow[], filters: {
  academicYearFilter: string;
  courseFilter: string;
  yearFilter: string;
  statusFilter: string;
  searchTerm: string;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const MARGIN = 12;
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — ANS Letters Issued List', W / 2, 13, { align: 'center' });

  const chips: string[] = [];
  if (filters.academicYearFilter) chips.push(filters.academicYearFilter);
  if (filters.courseFilter)   chips.push(filters.courseFilter);
  if (filters.yearFilter)     chips.push(filters.yearFilter);
  if (filters.statusFilter)   chips.push(STATUS_LABEL[filters.statusFilter as AnsLetterStatus] ?? filters.statusFilter);
  if (filters.searchTerm)     chips.push(`"${filters.searchTerm}"`);
  chips.push(`${rows.length} letter${rows.length !== 1 ? 's' : ''}`);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(chips.join('  ·  '), MARGIN, 20);
  doc.text(`Generated ${dateStr}`, W - MARGIN, 20, { align: 'right' });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 23, W - MARGIN, 23);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 26,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Sl', 'Student Name', 'Course', 'Reg No', 'Year', 'Status', 'Date Issued']],
    body: rows.map((r, i) => [
      i + 1,
      r.studentName,
      r.course,
      r.regNumber || '—',
      r.year,
      STATUS_LABEL[r.status],
      new Date(r.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
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
    alternateRowStyles: { fillColor: [241, 245, 249] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 46 },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 26 },
      4: { cellWidth: 24 },
      5: { cellWidth: 28 },
      6: { cellWidth: 28 },
    },
  });

  footer(doc, 'ANS Letters — Issued List');

  const parts = ['ans_letters_issued'];
  if (filters.academicYearFilter) parts.push(filters.academicYearFilter.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter)       parts.push(filters.courseFilter);
  doc.save(parts.join('_') + '.pdf');
}

// ── 2. Filing summary — one date, grouped by course, with signatures ───────
// `date` is a 'YYYY-MM-DD' key (as produced by <input type="date">).
export function exportAnsFilingSummaryPdf(rows: AnsRow[], date: string): void {
  const dateRows = rows.filter((r) => r.issuedAt.slice(0, 10) === date);
  const [y, m, d] = date.split('-');
  const dateLabel = `${d}/${m}/${y}`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — ANS Letters Filing Record', W / 2, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Date: ${dateLabel}   |   ${dateRows.length} letter${dateRows.length !== 1 ? 's' : ''} issued`, W / 2, 20, { align: 'center' });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 24, W - MARGIN, 24);
  doc.setTextColor(0);

  const byCourse = new Map<string, AnsRow[]>();
  for (const r of dateRows) {
    if (!byCourse.has(r.course)) byCourse.set(r.course, []);
    byCourse.get(r.course)!.push(r);
  }
  const courses = [...byCourse.keys()].sort(courseSort);

  let cursorY = 30;
  const usableWidth = W - 2 * MARGIN; // 182mm at MARGIN=14 on A4 portrait

  for (const course of courses) {
    const group = [...byCourse.get(course)!].sort((a, b) => a.studentName.localeCompare(b.studentName));

    if (cursorY > H - 45) { doc.addPage(); cursorY = 18; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 64, 175);
    doc.text(`${course} — ${group.length} student${group.length !== 1 ? 's' : ''}`, MARGIN, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Sl', 'Student Name', 'Reg No', 'Year', 'Father Name']],
      body: group.map((r, i) => [i + 1, r.studentName, r.regNumber || '—', r.year, r.fatherName || '—']),
      styles: {
        fontSize: 9, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
        lineColor: GRID, lineWidth: 0.18, textColor: [20, 20, 20] as [number, number, number], overflow: 'ellipsize',
      },
      headStyles: { fillColor: HEAD, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [241, 245, 249] as [number, number, number] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: usableWidth * 0.34 },
        2: { cellWidth: usableWidth * 0.18 },
        3: { cellWidth: usableWidth * 0.15 },
        4: { cellWidth: usableWidth - 10 - usableWidth * 0.34 - usableWidth * 0.18 - usableWidth * 0.15 },
      },
    });

    cursorY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 8;
  }

  if (courses.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text('No ANS letters were generated on this date.', W / 2, cursorY + 10, { align: 'center' });
    cursorY += 20;
  }

  // ── Summary table ──
  if (cursorY > H - 60) { doc.addPage(); cursorY = 18; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Summary', MARGIN, cursorY);
  cursorY += 4;

  const summaryBody: (string | number)[][] = courses.map((c) => [c, byCourse.get(c)!.length]);
  summaryBody.push(['TOTAL', dateRows.length]);

  autoTable(doc, {
    startY: cursorY,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 80,
    head: [['Course', 'Letters Issued']],
    body: summaryBody,
    styles: {
      fontSize: 9.5, cellPadding: { top: 2.5, right: 4, bottom: 2.5, left: 4 },
      lineColor: GRID, lineWidth: 0.18, textColor: [20, 20, 20] as [number, number, number],
    },
    headStyles: { fillColor: HEAD, textColor: WHITE, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 35, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === summaryBody.length - 1) {
        (data.cell.styles as { fontStyle: string }).fontStyle = 'bold';
      }
    },
  });

  cursorY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 26;

  // ── Signature block — HOD + Principal ──
  if (cursorY > H - 24) { doc.addPage(); cursorY = 40; }

  const sigWidth = 62;
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, cursorY, MARGIN + sigWidth, cursorY);
  doc.line(W - MARGIN - sigWidth, cursorY, W - MARGIN, cursorY);
  cursorY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(20, 20, 20);
  doc.text('HOD Signature', MARGIN, cursorY);
  doc.text("Principal's Signature & Seal", W - MARGIN - sigWidth, cursorY);

  footer(doc, `ANS Letters — Filing Record (${dateLabel})`);

  doc.save(`ANS_Filing_Summary_${d}-${m}-${y}.pdf`);
}
