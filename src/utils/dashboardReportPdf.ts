import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Student } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const COURSES  = ['CE', 'ME', 'EC', 'CS', 'EE'] as const;
const YEARS    = ['1ST YEAR', '2ND YEAR', '3RD YEAR'] as const;
const YR_LABEL: Record<string, string> = {
  '1ST YEAR': '1st Yr',
  '2ND YEAR': '2nd Yr',
  '3RD YEAR': '3rd Yr',
};

const BLUE_HEAD:  [number, number, number] = [37,  99,  235]; // blue-600
const BLUE_SUB:   [number, number, number] = [59, 130,  246]; // blue-500
const BLUE_GRAND: [number, number, number] = [30,  64,  175]; // blue-800
const WHITE:      [number, number, number] = [255, 255, 255];
const NEAR_BLACK: [number, number, number] = [25,  25,   25];
const GRID_LINE:  [number, number, number] = [210, 215,  220];

const MARGIN = 14;
const FONT   = 8;
const PAD    = { top: 2.2, right: 3.5, bottom: 2.2, left: 3.5 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateStr(): string {
  const d  = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = d.toLocaleString('en-US', { month: 'short' });
  const yr = String(d.getFullYear()).slice(2);
  return `${dd}-${mo}-${yr}`;
}

function buildDoc(academicYear: string, subtitle: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NEAR_BLACK);
  doc.text(`SMP Admn Stats ${academicYear}`, W / 2, 17, { align: 'center' });

  doc.setFontSize(11);
  doc.text(subtitle, W / 2, 25, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${dateStr()}`, W / 2, 32, { align: 'center' });
  doc.setTextColor(...NEAR_BLACK);

  return doc;
}

function addFooters(doc: jsPDF, academicYear: string, reportName: string): void {
  const totalPages = (doc as unknown as { internal: { getNumberOfPages(): number } })
    .internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`SMP Admn Stats ${academicYear} - ${reportName}`, MARGIN, H - 5);
    doc.text(`Page ${i} of ${totalPages}`, W - MARGIN, H - 5, { align: 'right' });
  }
}

const HEAD_STYLES = {
  fillColor: BLUE_HEAD,
  textColor: WHITE,
  fontStyle: 'bold' as const,
  fontSize: FONT,
  cellPadding: PAD,
  lineWidth: 0,
};

const BODY_STYLES = {
  fontSize: FONT,
  cellPadding: PAD,
  fillColor: WHITE,
  textColor: NEAR_BLACK,
  lineColor: GRID_LINE,
  lineWidth: 0.18,
};

type Row = (string | number)[];

// ── Summary Report — Year, Course & Admission Type ───────────────────────────

export function exportSummaryReport(students: Student[], academicYear: string): void {
  const doc  = buildDoc(academicYear, 'Year, Course & Admission Type-wise Student Count');
  const body: Row[] = [];
  const subtotalRows: number[] = [];

  let gRegular = 0, gLtrl = 0, gSnq = 0, gRptr = 0, gTotal = 0;

  for (const yr of YEARS) {
    const yrSt = students.filter((s) => s.year === yr);
    let sRegular = 0, sLtrl = 0, sSnq = 0, sRptr = 0, sTotal = 0;

    for (const course of COURSES) {
      const ss = yrSt.filter((s) => s.course === course);
      let regular = 0, ltrl = 0, snq = 0, rptr = 0;
      for (const s of ss) {
        if (s.admCat === 'SNQ')            snq++;
        else if (s.admType === 'LATERAL')  ltrl++;
        else if (s.admType === 'REPEATER') rptr++;
        else                               regular++;
      }
      const total = ss.length;
      body.push([YR_LABEL[yr], course, regular, ltrl, snq, rptr, total]);
      sRegular += regular; sLtrl += ltrl; sSnq += snq; sRptr += rptr; sTotal += total;
    }

    subtotalRows.push(body.length);
    body.push([`${YR_LABEL[yr]} SUBTOTAL`, 'All Courses', sRegular, sLtrl, sSnq, sRptr, sTotal]);
    gRegular += sRegular; gLtrl += sLtrl; gSnq += sSnq; gRptr += sRptr; gTotal += sTotal;
  }

  const grandIdx = body.length;
  body.push(['GRAND TOTAL', '', gRegular, gLtrl, gSnq, gRptr, gTotal]);

  // Portrait A4: usable = 210 − 2×14 = 182 mm
  autoTable(doc, {
    startY: 37,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Year', 'Course', 'Regular', 'LTRL', 'SNQ', 'RPTR', 'Total']],
    body,
    headStyles: HEAD_STYLES,
    bodyStyles: BODY_STYLES,
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 28 },
      2: { cellWidth: 30, halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 24, halign: 'center' },
      5: { cellWidth: 24, halign: 'center' },
      6: { cellWidth: 26, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const i = data.row.index;
      if (i === grandIdx) {
        data.cell.styles.fillColor = BLUE_GRAND;
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fontStyle = 'bold';
      } else if (subtotalRows.includes(i)) {
        data.cell.styles.fillColor = BLUE_SUB;
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  addFooters(doc, academicYear, 'Summary Report');
  doc.save(`SMP_Summary_Report_${dateStr().replace(/-/g, '_')}.pdf`);
}

// ── Category Report — Year, Course & Category ────────────────────────────────

type CatKey = 'gm' | 'c1' | 'twoA' | 'twoB' | 'threeA' | 'threeB' | 'sc' | 'st';
const CAT_KEYS: CatKey[] = ['gm', 'c1', 'twoA', 'twoB', 'threeA', 'threeB', 'sc', 'st'];

function catKey(s: Student): CatKey {
  switch (s.category) {
    case 'GM':  return 'gm';
    case 'C1':  return 'c1';
    case '2A':  return 'twoA';
    case '2B':  return 'twoB';
    case '3A':  return 'threeA';
    case '3B':  return 'threeB';
    case 'SC':  return 'sc';
    case 'ST':  return 'st';
    default:    return 'gm';
  }
}

function zeroCounts(): Record<CatKey, number> {
  return { gm: 0, c1: 0, twoA: 0, twoB: 0, threeA: 0, threeB: 0, sc: 0, st: 0 };
}

function catRow(label1: string, label2: string, c: Record<CatKey, number>, total: number): Row {
  return [label1, label2, c.gm, c.c1, c.twoA, c.twoB, c.threeA, c.threeB, c.sc, c.st, total];
}

export function exportCategoryReport(students: Student[], academicYear: string): void {
  const doc  = buildDoc(academicYear, 'Year, Course & Cat wise Student Count');
  const body: Row[] = [];
  const subtotalRows: number[] = [];

  const grand = zeroCounts();
  let gTotal  = 0;

  for (const yr of YEARS) {
    const yrSt = students.filter((s) => s.year === yr);
    const sub  = zeroCounts();
    let sTotal = 0;

    for (const course of COURSES) {
      const ss  = yrSt.filter((s) => s.course === course);
      const cnt = zeroCounts();
      for (const s of ss) cnt[catKey(s)]++;
      const total = ss.length;
      body.push(catRow(YR_LABEL[yr], course, cnt, total));
      for (const k of CAT_KEYS) sub[k] += cnt[k];
      sTotal += total;
    }

    subtotalRows.push(body.length);
    body.push(catRow(`${YR_LABEL[yr]} SUBTOTAL`, 'All Courses', sub, sTotal));
    for (const k of CAT_KEYS) grand[k] += sub[k];
    gTotal += sTotal;
  }

  const grandIdx = body.length;
  body.push(catRow('GRAND TOTAL', '', grand, gTotal));

  // Portrait A4: usable = 182 mm
  autoTable(doc, {
    startY: 37,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Year', 'Course', 'GM', 'C1', '2A', '2B', '3A', '3B', 'SC', 'ST', 'Total']],
    body,
    headStyles: HEAD_STYLES,
    bodyStyles: BODY_STYLES,
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0:  { cellWidth: 22 },
      1:  { cellWidth: 22 },
      2:  { cellWidth: 15, halign: 'center' },
      3:  { cellWidth: 15, halign: 'center' },
      4:  { cellWidth: 15, halign: 'center' },
      5:  { cellWidth: 15, halign: 'center' },
      6:  { cellWidth: 15, halign: 'center' },
      7:  { cellWidth: 15, halign: 'center' },
      8:  { cellWidth: 15, halign: 'center' },
      9:  { cellWidth: 15, halign: 'center' },
      10: { cellWidth: 17, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const i = data.row.index;
      if (i === grandIdx) {
        data.cell.styles.fillColor = BLUE_GRAND;
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fontStyle = 'bold';
      } else if (subtotalRows.includes(i)) {
        data.cell.styles.fillColor = BLUE_SUB;
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  addFooters(doc, academicYear, 'Category Report');
  doc.save(`SMP_Category_Report_${dateStr().replace(/-/g, '_')}.pdf`);
}
