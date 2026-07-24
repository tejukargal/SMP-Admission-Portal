import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { RefundRecord } from '../services/refundService';

const CATEGORY_LABEL: Record<string, string> = {
  SNQ: 'SNQ',
  SEAT_CANCELLATION: 'Seat Cancellation',
};

const FONT_SIZE = 8.5;
const CELL_PAD  = { top: 2.8, right: 3, bottom: 2.8, left: 3 };
const PAD_H     = CELL_PAD.left + CELL_PAD.right; // 6mm horizontal padding per cell

// ── Column definitions ────────────────────────────────────────────────────────
interface ColDef {
  header: string;
  halign: 'left' | 'center' | 'right';
  get: (r: RefundRecord, i: number) => string | number;
}

const COLUMNS: ColDef[] = [
  { header: 'Sl',           halign: 'center', get: (_r, i) => i + 1                                              },
  { header: 'Student Name', halign: 'left',   get: (r)     => r.studentName                                      },
  { header: 'Course',       halign: 'center', get: (r)     => r.course                                           },
  { header: 'Reg No',       halign: 'left',   get: (r)     => r.regNumber || '—'                                 },
  { header: 'Category',     halign: 'center', get: (r)     => CATEGORY_LABEL[r.refundCategory ?? 'SNQ'] ?? (r.refundCategory ?? 'SNQ') },
  { header: 'Refund Amt',   halign: 'right',  get: (r)     => `Rs.${r.refundAmount.toLocaleString('en-IN')}`     },
  { header: 'Mode',         halign: 'left',   get: (r)     => r.paymentType.replace(/_/g, ' ')                   },
  { header: 'Payment Date', halign: 'center', get: (r)     => r.paymentDate
      ? new Date(r.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—' },
  { header: 'Acad. Year',   halign: 'center', get: (r)     => r.academicYear                                      },
];

export function exportRefundStudentsPdf(rows: RefundRecord[], filters: {
  refundYearFilter: string;
  refundCategoryFilter: string;
  courseFilter: string;
  yearFilter: string;
  searchTerm: string;
}): void {
  const margin      = 10;
  const PORTRAIT_W  = 210 - margin * 2;  // 190mm
  const LANDSCAPE_W = 297 - margin * 2;  // 277mm

  const sorted = [...rows].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  // ── Measure fixed columns (everything except Student Name) ────────────────
  // Student Name is intentionally excluded — it gets whatever space remains
  // after the fixed columns, guaranteeing the table always fits the page.
  const NAME_IDX   = COLUMNS.findIndex((c) => c.header === 'Student Name');
  const MIN_NAME_W = 30;
  const measureDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  measureDoc.setFontSize(FONT_SIZE);

  let fixedTotal = 0;
  const colWidths: number[] = COLUMNS.map((col, idx) => {
    if (idx === NAME_IDX) return 0; // placeholder — filled below

    measureDoc.setFont('helvetica', 'bold');
    let w = measureDoc.getTextWidth(col.header);
    measureDoc.setFont('helvetica', 'normal');
    for (let i = 0; i < sorted.length; i++) {
      const cw = measureDoc.getTextWidth(String(col.get(sorted[i], i)));
      if (cw > w) w = cw;
    }
    const colW = w + PAD_H + 2;
    fixedTotal += colW;
    return colW;
  });

  // ── Orientation: driven by actual measured content, not a fixed column-count
  // rule — long values like "ACCOUNT PAYEE CHEQUE" can blow past portrait width
  // even with only 9 columns, so fall back to landscape whenever the fixed
  // columns plus a readable minimum Name column wouldn't fit on a portrait page.
  const orientation: 'portrait' | 'landscape' =
    fixedTotal + MIN_NAME_W > PORTRAIT_W ? 'landscape' : 'portrait';
  const usableW = orientation === 'landscape' ? LANDSCAPE_W : PORTRAIT_W;

  // Student Name gets all remaining usable width (minimum 30mm)
  colWidths[NAME_IDX] = Math.max(usableW - fixedTotal, MIN_NAME_W);

  const finalWidths = colWidths;
  const tableWidth  = finalWidths.reduce((s, w) => s + w, 0);

  // ── Create the doc ────────────────────────────────────────────────────────
  const doc   = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const yearLabel = filters.refundYearFilter === 'ALL' ? 'All Academic Years' : filters.refundYearFilter;

  // ── Line 1: bold title ────────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`SMP Admissions — Refund Students List  (${yearLabel})`, margin, 13);

  // ── Line 2: filter context  ·  count  |  date ────────────────────────────
  const chips: string[] = [];
  if (filters.courseFilter)         chips.push(filters.courseFilter);
  if (filters.yearFilter)           chips.push(filters.yearFilter);
  if (filters.refundCategoryFilter) chips.push(CATEGORY_LABEL[filters.refundCategoryFilter] ?? filters.refundCategoryFilter);
  if (filters.searchTerm)           chips.push(`"${filters.searchTerm}"`);
  chips.push(`${rows.length} Refund${rows.length !== 1 ? 's' : ''}`);

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

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
  const bodyRows = sorted.map((r, i) => COLUMNS.map((c) => c.get(r, i)));
  const headers  = [COLUMNS.map((c) => c.header)];

  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'center' | 'right' }> = {};
  COLUMNS.forEach((col, idx) => {
    columnStyles[idx] = { cellWidth: finalWidths[idx], halign: col.halign };
  });

  const totalAmount = rows.reduce((s, r) => s + r.refundAmount, 0);

  autoTable(doc, {
    startY: 25,
    margin: { left: margin, right: margin, top: margin, bottom: 12 },
    head: headers,
    body: bodyRows,
    foot: [COLUMNS.map((_c, idx) => (idx === NAME_IDX ? 'Total' : idx === COLUMNS.findIndex((cc) => cc.header === 'Refund Amt') ? `Rs.${totalAmount.toLocaleString('en-IN')}` : ''))],
    tableWidth,
    styles: {
      fontSize: FONT_SIZE,
      cellPadding: CELL_PAD,
      valign: 'middle',
      overflow: 'ellipsize',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: [20, 20, 20] as [number, number, number],
    },
    headStyles: {
      fillColor: [190, 18, 60], // rose-700
      textColor: 255,
      fontStyle: 'bold',
      fontSize: FONT_SIZE,
    },
    footStyles: {
      fillColor: [255, 228, 230], // rose-100
      textColor: [136, 19, 55],
      fontStyle: 'bold',
      fontSize: FONT_SIZE,
    },
    alternateRowStyles: {
      fillColor: [255, 241, 242], // rose-50
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
  const parts = ['refund_students'];
  if (filters.refundYearFilter !== 'ALL') parts.push(filters.refundYearFilter.replace(/[^0-9-]/g, ''));
  if (filters.courseFilter)               parts.push(filters.courseFilter);
  if (filters.yearFilter)                 parts.push(filters.yearFilter.replace(/\s+/g, ''));
  doc.save(parts.join('_') + '.pdf');
}
