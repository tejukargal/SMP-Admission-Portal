import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

const COURSES  = ['CE', 'ME', 'EC', 'CS', 'EE'] as const;
const YEARS    = ['1ST YEAR', '2ND YEAR', '3RD YEAR'] as const;
const METRICS  = ['Paid', 'Unpaid', 'Total'] as const;
const YEAR_LABELS: Record<string, string> = {
  '1ST YEAR': '1st Year',
  '2ND YEAR': '2nd Year',
  '3RD YEAR': '3rd Year',
};

interface CellStat { paid: number; unpaid: number; total: number; }

export interface FeeStatsData {
  matrix:       Record<string, Record<string, CellStat>>;
  yearTotals:   Record<string, CellStat>;
  courseTotals: Record<string, CellStat>;
  grandTotal:   CellStat;
  academicYear: string | null;
}

export function exportFeeStatsPdf(data: FeeStatsData): void {
  const margin = 12;
  const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();

  // Title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SMP Admissions — Exam Fee Statistics', margin, 13);

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  if (data.academicYear) doc.text(`Academic Year: ${data.academicYear}`, margin, 19.5);
  doc.text(`Generated ${dateStr}`, pageW - margin, 19.5, { align: 'right' });
  doc.setTextColor(0);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(margin, 22, pageW - margin, 22);

  // Build body rows — 3 metric rows per year block + 3 grand-total rows
  const head = [['Year', 'Status', ...COURSES, 'Grand Total']];
  const body: (string | number)[][] = [];

  for (const yr of YEARS) {
    const yt = data.yearTotals[yr] ?? { paid: 0, unpaid: 0, total: 0 };
    METRICS.forEach((metric, mi) => {
      const key = metric.toLowerCase() as keyof CellStat;
      body.push([
        mi === 0 ? YEAR_LABELS[yr] : '',
        metric,
        ...COURSES.map(c => data.matrix[yr]?.[c]?.[key] ?? 0),
        yt[key],
      ]);
    });
  }

  // Grand total rows
  METRICS.forEach((metric, mi) => {
    const key = metric.toLowerCase() as keyof CellStat;
    body.push([
      mi === 0 ? 'TOTAL' : '',
      metric,
      ...COURSES.map(c => data.courseTotals[c]?.[key] ?? 0),
      data.grandTotal[key],
    ]);
  });

  const FONT_SIZE  = 8.5;
  const CELL_PAD   = { top: 2.5, right: 3, bottom: 2.5, left: 3 };
  const usableW    = pageW - margin * 2;
  const yearColW   = 18;
  const statusColW = 15;
  const numColW    = Math.floor((usableW - yearColW - statusColW) / (COURSES.length + 1));

  const columnStyles: Record<number, object> = {
    0: { cellWidth: yearColW,   halign: 'left' },
    1: { cellWidth: statusColW, halign: 'left' },
  };
  for (let i = 2; i < 2 + COURSES.length + 1; i++) {
    columnStyles[i] = { cellWidth: numColW, halign: 'center' };
  }

  const GRAND_TOTAL_START = YEARS.length * METRICS.length; // row index 9

  autoTable(doc, {
    startY: 25,
    margin: { left: margin, right: margin },
    head,
    body,
    styles: {
      fontSize: FONT_SIZE,
      cellPadding: CELL_PAD,
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles,
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const raw    = d.row.raw as (string | number)[];
      const metric = raw[1] as string;
      const colIdx = d.column.index;
      const isGrandTotalBlock = d.row.index >= GRAND_TOTAL_START;

      // Year label — bold
      if (colIdx === 0 && raw[0]) d.cell.styles.fontStyle = 'bold';

      // Status column colours
      if (colIdx === 1) {
        if (metric === 'Paid')   d.cell.styles.textColor = [21, 128, 61];
        if (metric === 'Unpaid') d.cell.styles.textColor = [185, 28, 28];
        if (metric === 'Total')  d.cell.styles.fontStyle = 'bold';
      }

      // Number columns
      if (colIdx >= 2) {
        if (metric === 'Paid')        d.cell.styles.textColor = [21, 128, 61];
        else if (metric === 'Unpaid') d.cell.styles.textColor = [185, 28, 28];
        else                          d.cell.styles.fontStyle = 'bold';
      }

      // Grand total block — light background
      if (isGrandTotalBlock) d.cell.styles.fillColor = [241, 245, 249];
    },
    didDrawPage: (d) => {
      const total = (doc as unknown as { internal: { getNumberOfPages(): number } })
        .internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${d.pageNumber} of ${total}`, pageW - margin, pageH - 4, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  const parts = ['exam-fee-stats'];
  if (data.academicYear) parts.push(data.academicYear.replace(/[^0-9-]/g, ''));
  doc.save(parts.join('_') + '.pdf');
}
