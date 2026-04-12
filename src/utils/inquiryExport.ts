import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Inquiry, InquiryStatus } from '../types';

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const STATUS_LABEL: Record<InquiryStatus, string> = {
  active:    'Active',
  converted: 'Converted',
  cancelled: 'Cancelled',
};

// ── PDF ───────────────────────────────────────────────────────────────────────

export function exportInquiriesPdf(inquiries: Inquiry[], academicYear: string | null, statusLabel: string): void {
  const margin = 10;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const title = `SMP Admissions — Inquiries (${statusLabel})`;
  const subtitle = academicYear ? `Academic Year: ${academicYear}` : '';

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, 13);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (subtitle) doc.text(subtitle, margin, 19);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 297 - margin, 19, { align: 'right' });

  const rows = inquiries.map((inq, i) => [
    i + 1,
    inq.studentName,
    inq.mobile,
    inq.interestedCourse,
    fmtDate(inq.visitDate),
    inq.address || '—',
    inq.notes || '—',
    STATUS_LABEL[inq.status],
  ]);

  autoTable(doc, {
    startY: subtitle ? 23 : 18,
    head: [['#', 'Name', 'Mobile', 'Course', 'Visit Date', 'Address', 'Notes', 'Status']],
    body: rows,
    styles: { fontSize: 8, cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 } },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      2: { halign: 'center', cellWidth: 26 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 22 },
      7: { halign: 'center', cellWidth: 20 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
  });

  const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Page ${p} of ${pageCount}`, 297 - margin, 205, { align: 'right' });
    doc.setTextColor(0);
  }

  const ay = academicYear?.replace(/[^0-9-]/g, '') ?? 'inquiries';
  doc.save(`inquiries_${statusLabel.toLowerCase()}_${ay}.pdf`);
}

// ── Excel ─────────────────────────────────────────────────────────────────────

export function exportInquiriesExcel(inquiries: Inquiry[], academicYear: string | null, statusLabel: string): void {
  const rows = inquiries.map((inq, i) => ({
    '#':           i + 1,
    'Name':        inq.studentName,
    'Mobile':      inq.mobile,
    'Course':      inq.interestedCourse,
    'Visit Date':  fmtDate(inq.visitDate),
    'Address':     inq.address || '',
    'Notes':       inq.notes || '',
    'Status':      STATUS_LABEL[inq.status],
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 5 },   // #
    { wch: 28 },  // Name
    { wch: 14 },  // Mobile
    { wch: 10 },  // Course
    { wch: 14 },  // Visit Date
    { wch: 32 },  // Address
    { wch: 30 },  // Notes
    { wch: 12 },  // Status
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = academicYear ? `Inquiries ${academicYear}` : 'Inquiries';
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  const ay = academicYear?.replace(/[^0-9-]/g, '') ?? 'inquiries';
  XLSX.writeFile(wb, `inquiries_${statusLabel.toLowerCase()}_${ay}.xlsx`);
}
